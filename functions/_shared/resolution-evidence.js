// functions/_shared/resolution-evidence.js
//
// The representative's resolution report and "after" photos (item 7b):
// file checks for uploads, and the warnings that make a faked fix harder
// to pass off. Warnings never block anything, because a photo's date and
// location can be missing (WhatsApp strips them) or edited. They are
// shown to GrievIQ staff, the representative, and (the serious ones) the
// citizen when asked to confirm.
//
// Two kinds of location are checked:
//   - DEVICE: where the rep's phone was when they added the photo (browser
//     location, asked for with their permission). Phones strip the photo's
//     own location when uploading from a website, so this is the main check.
//   - PHOTO: the photo's own GPS (EXIF), when a phone keeps it.
// Each is compared with the complaint's pin; when there is no pin, with the
// ward's boundary instead.
//
// Warning codes:
//   serious ("warn"):  DATE_BEFORE_FILING, DATE_FUTURE,
//                      DEVICE_FAR_FROM_PIN, DEVICE_OUTSIDE_WARD,
//                      FAR_FROM_PIN, PHOTO_OUTSIDE_WARD,
//                      REUSED_OTHER_CASE, CITIZEN_PHOTO
//   neutral ("info"):  NO_DATE, DEVICE_NOT_SHARED, DEVICE_ROUGH,
//                      NO_LOCATION, NO_PIN

import { toUtcMs } from "./time-limits.js";
import { pointInGeometry } from "./geo.js";

export const FAR_METRES = 250;          // GPS error (~10 m typical, ~100 m worst) + pin error allowance
export const ROUGH_METRES = 1000;       // a device fix this rough (e.g. Wi-Fi/IP only) can't be checked
export const SIMILAR_BITS = 6;          // visual fingerprint: <= 6 of 64 bits different
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 3;
export const NOTE_MIN = 10, NOTE_MAX = 1000, REASON_MIN = 10, REASON_MAX = 300;

// The file's real type from its first bytes (not its name or the type the
// browser claims). Returns "image/jpeg" | "image/png" | "image/webp" | null.
export function sniffImage(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u.length >= 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return "image/jpeg";
  if (u.length >= 8 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47 &&
      u[4] === 0x0d && u[5] === 0x0a && u[6] === 0x1a && u[7] === 0x0a) return "image/png";
  if (u.length >= 12 && u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 &&
      u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) return "image/webp";
  return null;
}

export async function sha256Hex(buf) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function validDhash(h) {
  return typeof h === "string" && /^[0-9a-f]{16}$/.test(h) ? h : null;
}

export function hamming(a, b) {
  if (!validDhash(a) || !validDhash(b)) return 64;
  let n = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) { n += x & 1; x >>= 1; }
  }
  return n;
}

export function metresBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Parses a ward boundary (GeoJSON text) once; null if missing or unreadable.
export function parseWard(geojsonText) {
  if (!geojsonText || !String(geojsonText).trim()) return null;
  try { return JSON.parse(geojsonText); } catch (e) { return null; }
}

// Warnings for one stored photo row against its complaint. ward = parsed
// ward boundary (parseWard), or null.
export function photoWarnings(g, p, ward) {
  const out = [];
  const filedMs = toUtcMs(g.created_at);
  const takenMs = p.taken_at ? toUtcMs(p.taken_at) : NaN;
  const uploadedMs = toUtcMs(p.created_at) || Date.now();
  if (isNaN(takenMs)) out.push({ code: "NO_DATE", level: "info" });
  else if (!isNaN(filedMs) && takenMs < filedMs - 3600000) out.push({ code: "DATE_BEFORE_FILING", level: "warn", takenAt: p.taken_at });
  else if (takenMs > uploadedMs + 86400000) out.push({ code: "DATE_FUTURE", level: "warn", takenAt: p.taken_at });

  const hasPin = g.pin_lat != null && g.pin_lng != null;
  const canCompare = hasPin || !!ward;
  // Where the rep's phone was when adding the photo.
  const devOk = p.dev_status === "OK" && p.dev_lat != null && p.dev_lng != null;
  if (!devOk) out.push({ code: "DEVICE_NOT_SHARED", level: "info" });
  else {
    const acc = Math.round(Number(p.dev_accuracy) || 0);
    if (acc > ROUGH_METRES) out.push({ code: "DEVICE_ROUGH", level: "info", accuracy: acc });
    else if (hasPin) {
      const m = Math.round(metresBetween(Number(g.pin_lat), Number(g.pin_lng), Number(p.dev_lat), Number(p.dev_lng)));
      if (m - acc > FAR_METRES) out.push({ code: "DEVICE_FAR_FROM_PIN", level: "warn", metres: m, accuracy: acc });
    } else if (ward && !pointInGeometry(Number(p.dev_lng), Number(p.dev_lat), ward)) {
      out.push({ code: "DEVICE_OUTSIDE_WARD", level: "warn", accuracy: acc });
    }
  }
  // The photo's own location, when the phone kept it.
  const hasGps = p.gps_lat != null && p.gps_lng != null;
  if (!hasGps) { if (!devOk) out.push({ code: "NO_LOCATION", level: "info" }); }
  else if (hasPin) {
    const m = Math.round(metresBetween(Number(g.pin_lat), Number(g.pin_lng), Number(p.gps_lat), Number(p.gps_lng)));
    if (m > FAR_METRES) out.push({ code: "FAR_FROM_PIN", level: "warn", metres: m });
  } else if (ward && !pointInGeometry(Number(p.gps_lng), Number(p.gps_lat), ward)) {
    out.push({ code: "PHOTO_OUTSIDE_WARD", level: "warn" });
  }
  if ((devOk || hasGps) && !canCompare) out.push({ code: "NO_PIN", level: "info" });
  if (p.dup_grievance_id) out.push({ code: "REUSED_OTHER_CASE", level: "warn", kind: p.dup_kind || "exact", otherCaseId: p.dup_grievance_id });
  if (Number(p.matches_citizen) === 1) out.push({ code: "CITIZEN_PHOTO", level: "warn" });
  return out;
}

// Shapes a report + its photos for a page. audience: "staff" | "rep" | "citizen".
// linkFor(photo row) -> Promise<{ url, thumbUrl, removed, removedAt }> (photo-store.js photoMedia). refFor(grievanceId) -> tracking ref (staff only).
export async function shapeResolution(g, report, photos, audience, linkFor, refFor, ward) {
  if (!report) return null;
  const shaped = [];
  for (const p of photos) {
    let warnings = photoWarnings(g, p, ward || null);
    if (audience === "citizen") warnings = warnings.filter((w) => w.level === "warn");
    warnings = warnings.map((w) => {
      const c = Object.assign({}, w);
      if (c.otherCaseId) {
        if (audience === "staff" && refFor) c.otherCaseRef = refFor(c.otherCaseId) || null;
        if (audience === "staff") c.otherCaseIdForLink = c.otherCaseId;
        delete c.otherCaseId;
      }
      return c;
    });
    // linkFor(row) gives { url, thumbUrl, removed, removedAt } (photo-store.js photoMedia).
    const media = linkFor ? await linkFor(p) : null;
    const m = media && typeof media === "object" ? media : { url: media || null, thumbUrl: media || null, removed: null, removedAt: null };
    shaped.push({
      id: p.id,
      url: m.url,
      thumbUrl: m.thumbUrl || m.url,
      removed: m.removed || null,
      removedAt: m.removedAt || null,
      takenAt: p.taken_at || null,
      warnings,
    });
  }
  return {
    note: report.note,
    noPhotoReason: report.no_photo_reason || null,
    createdAt: report.created_at,
    by: audience === "citizen" ? null : report.created_by,
    photos: shaped,
    warningCount: shaped.reduce((n, p) => n + p.warnings.filter((w) => w.level === "warn").length, 0),
  };
}

// Latest report and its photos for one complaint.
export async function loadResolution(env, grievanceId) {
  const report = await env.DB.prepare(
    `SELECT * FROM resolution_reports WHERE grievance_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`
  ).bind(grievanceId).first();
  if (!report) return { report: null, photos: [] };
  const { results } = await env.DB.prepare(
    `SELECT * FROM resolution_photos WHERE report_id = ? ORDER BY created_at ASC, rowid ASC`
  ).bind(report.id).all();
  return { report, photos: results || [] };
}
