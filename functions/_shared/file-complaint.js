/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/file-complaint.js (grieviq-73)
//
// Filing a complaint, in two steps, shared by the public form
// (api/grievances/submit.js) and a Community helper filing for a citizen
// (api/helper.js; sent only after the citizen confirms):
//   checkComplaint(env, body)   the same checks as always: returns the
//                               cleaned values, or the error to show
//   createComplaint(env, ...)   saves it and tells the ward's office
// Moved here unchanged from submit.js; see that file's header for the rules.

import { notifyNewCase } from "./notify.js";
import { checkAttachedPhotos } from "./citizen-photo-checks.js";
import { pointInGeometry } from "./geo.js";
import { liveJoin } from "./areas.js";
import { isMulti, seatsOfUnit, choosableSeats, seatsReady } from "./seats.js";

// 32 letters/digits (no O/0/I/1 ambiguity). 256 is an exact multiple of 32,
// so "byte % 32" picks every character with equal chance (no bias).
const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTrackingRef() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let ref = "GRV-";
  for (let i = 0; i < 6; i++) {
    ref += REF_CHARS[bytes[i] % REF_CHARS.length];
  }
  return ref;
}

function hasText(v) {
  return v != null && String(v).trim() !== "";
}

// Rough box around India: anything outside is not a real problem spot.
function readPin(latIn, lngIn) {
  if (latIn == null || lngIn == null || latIn === "" || lngIn === "") return null;
  const lat = Number(latIn);
  const lng = Number(lngIn);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 6 || lat > 38 || lng < 68 || lng > 98) return null;
  // 5 decimal places = about 1.1 metres.
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}

// Keep the pin only if it is inside the ward's boundary. A ward with no
// boundary on file can't be checked, so the pin is kept (it is already
// limited to India above). A boundary that can't be read drops the pin.
function pinForWard(pin, boundaryGeojson) {
  if (!pin) return null;
  if (!hasText(boundaryGeojson)) return pin;
  let geometry;
  try {
    geometry = JSON.parse(boundaryGeojson);
  } catch {
    return null;
  }
  // CRS84: x = longitude, y = latitude.
  return pointInGeometry(pin.lng, pin.lat, geometry) ? pin : null;
}

function isPlausiblePhone(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

// The version of the privacy notice shown on the complaint form. Change it
// whenever that notice's wording changes, so each consent record says which
// text the citizen agreed to.
export const NOTICE_VERSION = "2026-10-09.2";

// "What happens next, and by when" for the confirmation page, from the
// category's own time limits (the same ones the status page uses).
export function nextSteps(category) {
  const now = Date.now(), H = 3600000;
  const ack = Number(category && category.ack_sla_hours) || 0;
  const act = Number(category && category.resolution_sla_hours) || 0;
  return {
    ackBy: ack ? new Date(now + ack * H).toISOString() : null,
    actBy: act ? new Date(now + act * H).toISOString() : null,
  };
}


const bad = (status, body) => ({ ok: false, status, body });

// The checks on what was sent. Returns { ok: true, v } or { ok: false, status, body }
// (the same messages and codes the form has always had).
export async function checkComplaint(env, input) {
  const {
    category_id, local_unit_id, description, citizen_phone, location_detail, citizen_email, photo_ids,
    rep_suggestion, pin_lat, pin_lng, lang, consent, seat_choice,
  } = input || {};
  const errors = [];
  if (!category_id) errors.push("Category is required.");
  if (!local_unit_id) errors.push("Location is required.");
  if (!description || String(description).trim().length < 15) {
    errors.push("Description must be at least 15 characters.");
  }
  if (!isPlausiblePhone(citizen_phone)) {
    errors.push("A valid phone number is required.");
  }
  if (consent !== true) {
    errors.push("Please confirm you are 18 or older and agree to how your details are used.");
  }
  const trimmedEmail = String(citizen_email || "").trim();
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.push("Please enter a valid email address, or leave it blank.");
  }

  // Optional citizen-reported representative. Never applied directly --
  // saved as a PENDING row in rep_suggestions for an admin to review.
  let suggestion = null;
  if (rep_suggestion && typeof rep_suggestion === "object") {
    const sTier = String(rep_suggestion.tier || "").toUpperCase();
    const sName = String(rep_suggestion.name || "").trim().slice(0, 120);
    const sPhone = String(rep_suggestion.phone || "").trim().slice(0, 40);
    if (sName) {
      if (!["LOCAL", "MLA", "MP"].includes(sTier)) {
        errors.push("Please choose which representative you are naming.");
      } else if (sName.length < 2) {
        errors.push("Please enter the representative's full name.");
      } else if (sPhone && !isPlausiblePhone(sPhone)) {
        errors.push("Please enter a valid phone number for the representative, or leave it blank.");
      } else {
        suggestion = { tier: sTier, name: sName, phone: sPhone ? sPhone.replace(/[^\d+]/g, "") : null };
      }
    }
  }
  if (errors.length > 0) return bad(400, { error: errors.join(" ") });

  // Confirm category and local unit actually exist (FK safety)
  const category = await env.DB.prepare(
    `SELECT id, name, ack_sla_hours, resolution_sla_hours FROM grievance_categories WHERE id = ?`
  ).bind(category_id).first();
  // Only wards and villages in an area that is live (switched on).
  const localUnit = await env.DB.prepare(
    `SELECT lu.* FROM local_units lu ${await liveJoin(env)} WHERE lu.id = ?`
  ).bind(local_unit_id).first();
  if (!category) return bad(400, { error: "Unknown category." });
  if (!localUnit) return bad(400, { error: "Unknown location." });
  // A ward can be known before it can take complaints: that needs a ward
  // representative email on file (same rule as the Home page). Without
  // it, the complaint would reach no one.
  // grieviq-57: a ward with several members is open when any seat can take
  // complaints (or every seat is vacant: they go to the next level).
  const multi = isMulti(localUnit) && await seatsReady(env);
  const wardSeats = multi ? await seatsOfUnit(env, localUnit) : null;
  const wardOpen = multi
    ? wardSeats.some((x) => x.email && x.status !== "VACANT") || wardSeats.every((x) => x.status === "VACANT")
    : hasText(localUnit.rep_email) || localUnit.seat_status === "VACANT";   // grieviq-53: vacant seats go to the next level
  if (!wardOpen) return bad(400, { error: "This area can't take complaints yet. Please choose another area.", code: "not_open" });

  const pin = pinForWard(readPin(pin_lat, pin_lng), localUnit.ward_boundary_geojson);
  // Private photo ids from upload-photo.js (UUIDs only, at most 3).
  const photoIds = Array.isArray(photo_ids)
    ? Array.from(new Set(photo_ids.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))).slice(0, 3)
    : [];
  return { ok: true, v: {
    category, localUnit, multi,
    category_id, local_unit_id, description: String(description).trim(),
    phone: String(citizen_phone).replace(/\D/g, ""), email: trimmedEmail || null,
    location_detail: String(location_detail || "").trim() || null,
    lang: lang === "hi" ? "hi" : "en", pin, photoIds, suggestion,
    seat_choice: multi ? String(seat_choice || "ANY") : null,
  } };
}

// What is kept while a Community helper's filing waits for the citizen
// (no database rows, no lookups): enough to file it later.
export function heldPayload(v) {
  return { category_id: v.category_id, local_unit_id: v.local_unit_id, description: v.description, citizen_phone: v.phone, citizen_email: v.email || "",
    location_detail: v.location_detail || "", photo_ids: v.photoIds, rep_suggestion: v.suggestion, pin_lat: v.pin ? v.pin.lat : null, pin_lng: v.pin ? v.pin.lng : null,
    lang: v.lang, consent: true, seat_choice: v.seat_choice || undefined };
}

// Saves a checked complaint and tells the ward's office (and the citizen,
// if they gave an email). opts: { notice, consentAt, helperId, waitUntil, origin }.
// Returns { id, trackingRef, seatFallback }, or { error } when no tracking
// number could be made.
export async function createComplaint(env, v, opts) {
  opts = opts || {};
  // Generate a unique tracking ref (retry on the rare collision)
  let trackingRef;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateTrackingRef();
    const existing = await env.DB.prepare(`SELECT id FROM grievances WHERE tracking_ref = ?`).bind(candidate).first();
    if (!existing) { trackingRef = candidate; break; }
  }
  if (!trackingRef) return { error: "NO_REF" };

  const id = crypto.randomUUID();
  const values = [id, trackingRef, v.phone, v.description, v.category_id, v.local_unit_id, v.location_detail, v.email, v.lang,
    v.pin ? v.pin.lat : null, v.pin ? v.pin.lng : null];
  try {
    // The consent record: when, and which notice version they agreed to.
    await env.DB.prepare(
      `INSERT INTO grievances
        (id, tracking_ref, citizen_phone, description, category_id, local_unit_id, status, current_tier, photo_url, location_detail, citizen_email, lang, pin_lat, pin_lng, consent_at, consent_notice)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', 'LOCAL', NULL, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(...values, opts.consentAt || new Date().toISOString(), opts.notice || NOTICE_VERSION).run();
  } catch (e) {
    // Consent columns not added yet (part11-consent.sql): never lose a complaint.
    if (!/no such column|no column named/i.test(String(e && e.message))) throw e;
    await env.DB.prepare(
      `INSERT INTO grievances
        (id, tracking_ref, citizen_phone, description, category_id, local_unit_id, status, current_tier, photo_url, location_detail, citizen_email, lang, pin_lat, pin_lng)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', 'LOCAL', NULL, ?, ?, ?, ?, ?)`
    ).bind(...values).run();
  }
  // grieviq-73: filed with help from a Community helper (the office sees only that).
  if (opts.helperId) await env.DB.prepare("UPDATE grievances SET helper_id = ? WHERE id = ?").bind(opts.helperId, id).run();

  // grieviq-57: who handles it in a ward with several members: the member
  // the citizen chose (if that member can take complaints now), or any member.
  let seatOwner = null, seatFallback = false;
  if (v.multi) {
    const want = String(v.seat_choice || "ANY");
    if (want !== "ANY") {
      const ok = (await choosableSeats(env, v.localUnit)).find((x) => x.id === want);
      if (ok) seatOwner = ok.id; else seatFallback = true;
    }
    const at = new Date().toISOString();
    await env.DB.prepare("UPDATE grievances SET seat_choice = ?, seat_owner = ?, seat_owner_at = ? WHERE id = ?")
      .bind(seatOwner || "ANY", seatOwner, seatOwner ? at : null, id).run();
  }

  // Attach the photos (only ones not attached to anything yet, or held for
  // this helper filing). A failure here must not lose the complaint;
  // unattached photos are cleaned up.
  if (v.photoIds.length) {
    try {
      await env.DB.batch(v.photoIds.map((pid, i) => env.DB.prepare(
        "UPDATE complaint_photos SET grievance_id = ?, position = ? WHERE id = ? AND (grievance_id IS NULL OR grievance_id = ?)"
      ).bind(id, i, pid, opts.heldKey || "-")));
    } catch (photoErr) {
      // Ignore -- the grievance is already saved.
    }
    // Oct 2026: photo checks against the final spot (flag, never block);
    // the phone's position is deleted once the distance is worked out.
    await checkAttachedPhotos(env, { id, local_unit_id: v.local_unit_id, pin_lat: v.pin ? v.pin.lat : null, pin_lng: v.pin ? v.pin.lng : null });
  }

  // Saving the suggestion must never block the complaint itself.
  if (v.suggestion) {
    try {
      await env.DB.prepare(
        `INSERT INTO rep_suggestions (id, grievance_id, local_unit_id, tier, suggested_name, suggested_phone)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), id, v.local_unit_id, v.suggestion.tier, v.suggestion.name, v.suggestion.phone).run();
    } catch (suggestionErr) {
      // Ignore -- the grievance is already saved.
    }
  }

  // Notifications (Oct 2026): the ward's office hears about it at once
  // (bell, phone, or backup email) and the citizen gets their reference
  // by email. After the reply where the platform allows; never blocks.
  const told = notifyNewCase(env, opts.origin, {
    id, tracking_ref: trackingRef, category_id: v.category_id, local_unit_id: v.local_unit_id, created_at: new Date().toISOString(),
    citizen_email: v.email || null, lang: v.lang, status: "OPEN",
    seat_choice: v.multi ? (seatOwner || "ANY") : null, seat_owner: seatOwner,
  });
  if (typeof opts.waitUntil === "function") opts.waitUntil(told); else await told;
  return { id, trackingRef, seatFallback };
}
