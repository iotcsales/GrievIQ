// POST /api/grievances/submit
// Public, unauthenticated endpoint. Citizens submit a new grievance here.
// No login required. Basic spam protection via honeypot + minimum fill-time.
//
// Sept 2026 (location-first Home, Part 3):
//  - Complaints are refused for a ward that can't take them yet (no ward
//    representative email on file) -- the same rule as the Home page
//    (_shared/place.js openForFiling) and /api/resolve-ward open_for_filing.
//  - An optional pin (pin_lat, pin_lng) is saved with the complaint, rounded
//    to 5 decimal places (about 1 metre). It is kept only if it lies inside
//    the chosen ward's boundary (when that boundary is on file); otherwise it
//    is dropped, so a wrong spot is never saved. Shown to representatives
//    only, never publicly.
//  - Tracking numbers come from the cryptographic random generator.
//
// Item 7c: photos are uploaded privately first (upload-photo.js) and sent
// here as photo_ids (at most 3). They are attached to the new complaint
// only if they are not already attached to another. photo_url is no longer
// written (it held public links before 7c).

import { notifyNewCase } from "../../_shared/notify.js";
import { makeFilingPass } from "../../_shared/citizen-push.js";
import { checkAttachedPhotos } from "../../_shared/citizen-photo-checks.js";
import { pointInGeometry } from "../../_shared/geo.js";

// 32 letters/digits (no O/0/I/1 ambiguity). 256 is an exact multiple of 32,
// so "byte % 32" picks every character with equal chance (no bias).
const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateTrackingRef() {
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
import { liveJoin } from "../../_shared/areas.js";

export const NOTICE_VERSION = "2026-10-09.2";

// "What happens next, and by when" for the confirmation page, from the
// category's own time limits (the same ones the status page uses).
function nextSteps(category) {
  const now = Date.now(), H = 3600000;
  const ack = Number(category && category.ack_sla_hours) || 0;
  const act = Number(category && category.resolution_sla_hours) || 0;
  return {
    ackBy: ack ? new Date(now + ack * H).toISOString() : null,
    actBy: act ? new Date(now + act * H).toISOString() : null,
  };
}

export async function onRequestPost({ request, env, waitUntil }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const {
    category_id,
    local_unit_id,
    description,
    citizen_phone,
    location_detail, // optional free-text landmark/address detail
    citizen_email, // optional — needed for status-update emails and confirm/dispute
    photo_ids, // optional array — ids from prior calls to /api/grievances/upload-photo
    rep_suggestion, // optional { tier, name, phone } — citizen's unverified guess at a missing rep
    pin_lat, pin_lng, // optional: where the problem is, from a map pin, current location or address search
    lang, // "hi" or "en": the language the citizen used, for emails about this complaint
    consent, // true: 18 or older, and agrees to the notice on the form (DPDP Act s.5-6)
    // Spam-protection fields, not stored:
    website,      // honeypot — real users never see/fill this
    form_loaded_at, // ms timestamp from when the form rendered
  } = body;

  // --- Silent bot handling: pretend success, insert nothing ---
  const tookTooLittleTime =
    typeof form_loaded_at === "number" &&
    Date.now() - form_loaded_at < 3000; // under 3 seconds is not human

  if (website || tookTooLittleTime) {
    return new Response(
      JSON.stringify({ success: true, tracking_ref: generateTrackingRef(), next: nextSteps({ ack_sla_hours: 48, resolution_sla_hours: 72 }) }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Real validation ---
  const errors = [];
  if (!category_id) errors.push("Category is required.");
  if (!local_unit_id) errors.push("Location is required.");
  if (!description || description.trim().length < 15) {
    errors.push("Description must be at least 15 characters.");
  }
  if (!isPlausiblePhone(citizen_phone)) {
    errors.push("A valid phone number is required.");
  }
  if (consent !== true) {
    errors.push("Please confirm you are 18 or older and agree to how your details are used.");
  }
  const trimmedEmail = (citizen_email || "").trim();
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

  if (errors.length > 0) {
    return new Response(JSON.stringify({ error: errors.join(" ") }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Confirm category and local unit actually exist (FK safety)
    const category = await env.DB.prepare(
      `SELECT id, ack_sla_hours, resolution_sla_hours FROM grievance_categories WHERE id = ?`
    )
      .bind(category_id)
      .first();

    // Only wards and villages in an area that is live (switched on).
    const localUnit = await env.DB.prepare(
      `SELECT lu.id, lu.rep_email, lu.ward_boundary_geojson FROM local_units lu ${await liveJoin(env)} WHERE lu.id = ?`
    )
      .bind(local_unit_id)
      .first();

    if (!category) {
      return new Response(JSON.stringify({ error: "Unknown category." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!localUnit) {
      return new Response(JSON.stringify({ error: "Unknown location." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // A ward can be known before it can take complaints: that needs a ward
    // representative email on file (same rule as the Home page). Without
    // it, the complaint would reach no one.
    if (!hasText(localUnit.rep_email)) {
      return new Response(
        JSON.stringify({ error: "This area can't take complaints yet. Please choose another area.", code: "not_open" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const pin = pinForWard(readPin(pin_lat, pin_lng), localUnit.ward_boundary_geojson);

    // Generate a unique tracking ref (retry on the rare collision)
    let trackingRef;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateTrackingRef();
      const existing = await env.DB.prepare(
        `SELECT id FROM grievances WHERE tracking_ref = ?`
      )
        .bind(candidate)
        .first();
      if (!existing) {
        trackingRef = candidate;
        break;
      }
    }
    if (!trackingRef) {
      return new Response(
        JSON.stringify({ error: "Could not generate a tracking reference. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const id = crypto.randomUUID();
    const normalizedPhone = citizen_phone.replace(/\D/g, "");

    // Private photo ids from upload-photo.js (UUIDs only, at most 3).
    const photoIds = Array.isArray(photo_ids)
      ? Array.from(new Set(photo_ids.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))).slice(0, 3)
      : [];

    const values = [
      id,
      trackingRef,
      normalizedPhone,
      description.trim(),
      category_id,
      local_unit_id,
      (location_detail || "").trim() || null,
      trimmedEmail || null,
      lang === "hi" ? "hi" : "en",
      pin ? pin.lat : null,
      pin ? pin.lng : null,
    ];
    try {
      // The consent record: when, and which notice version they agreed to.
      await env.DB.prepare(
        `INSERT INTO grievances
          (id, tracking_ref, citizen_phone, description, category_id, local_unit_id, status, current_tier, photo_url, location_detail, citizen_email, lang, pin_lat, pin_lng, consent_at, consent_notice)
         VALUES (?, ?, ?, ?, ?, ?, 'OPEN', 'LOCAL', NULL, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(...values, new Date().toISOString(), NOTICE_VERSION).run();
    } catch (e) {
      // Consent columns not added yet (part11-consent.sql): never lose a complaint.
      if (!/no such column|no column named/i.test(String(e && e.message))) throw e;
      await env.DB.prepare(
        `INSERT INTO grievances
          (id, tracking_ref, citizen_phone, description, category_id, local_unit_id, status, current_tier, photo_url, location_detail, citizen_email, lang, pin_lat, pin_lng)
         VALUES (?, ?, ?, ?, ?, ?, 'OPEN', 'LOCAL', NULL, ?, ?, ?, ?, ?)`
      ).bind(...values).run();
    }

    // Attach the photos (only ones not attached to anything yet). A failure
    // here must not lose the complaint; unattached photos are cleaned up.
    if (photoIds.length) {
      try {
        await env.DB.batch(photoIds.map((pid, i) => env.DB.prepare(
          "UPDATE complaint_photos SET grievance_id = ?, position = ? WHERE id = ? AND grievance_id IS NULL"
        ).bind(id, i, pid)));
      } catch (photoErr) {
        // Ignore -- the grievance is already saved.
      }
      // Oct 2026: photo checks against the final spot (flag, never block);
      // the phone's position is deleted once the distance is worked out.
      await checkAttachedPhotos(env, { id, local_unit_id, pin_lat: pin ? pin.lat : null, pin_lng: pin ? pin.lng : null });
    }

    // Saving the suggestion must never block the complaint itself.
    if (suggestion) {
      try {
        await env.DB.prepare(
          `INSERT INTO rep_suggestions (id, grievance_id, local_unit_id, tier, suggested_name, suggested_phone)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(crypto.randomUUID(), id, local_unit_id, suggestion.tier, suggestion.name, suggestion.phone)
          .run();
      } catch (suggestionErr) {
        // Ignore -- the grievance is already saved.
      }
    }

    // Notifications (Oct 2026): the ward's office hears about it at once
    // (bell, phone, or backup email) and the citizen gets their reference
    // by email. After the reply where the platform allows; never blocks.
    const told = notifyNewCase(env, env.SITE_ORIGIN || new URL(request.url).origin, {
      id, tracking_ref: trackingRef, category_id, local_unit_id, created_at: new Date().toISOString(),
      citizen_email: trimmedEmail || null, lang: lang === "hi" ? "hi" : "en", status: "OPEN",
    });
    if (typeof waitUntil === "function") waitUntil(told); else await told;
    // "Get updates on this phone" (Oct 2026): a one-time pass, valid 24
    // hours, so only the person who just filed can turn updates on here.
    const updatesPass = await makeFilingPass(env, id);

    return new Response(
      JSON.stringify({ success: true, tracking_ref: trackingRef, next: nextSteps(category), updates_pass: updatesPass || undefined }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Submission failed. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
