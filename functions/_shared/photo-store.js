// functions/_shared/photo-store.js
//
// Private photos and how long they are kept (item 7c, Sept 2026).
//
// Two kinds of photo, both in the private R2 bucket PRIVATE_PHOTOS (no
// public address) and only ever shown through short-lived signed links
// (photo-links.js):
//   - the citizen's own photos (table complaint_photos, variant "c"/"ct")
//   - the representative's "after" photos (table resolution_photos, ""/"t")
// Each has a full-size file and a small preview (thumb_key) made on the
// phone before upload. The citizen's photos are also shrunk on the phone
// (at most 1600 px), which removes their hidden details (date, GPS).
//
// Retention (approved Sept 2026; DPDP Act s.8(7) storage limitation, and the
// one-year minimum in DPDP Rules 2025 r.8(3)):
//   - Open, waiting or reopened cases: everything is kept.
//   - Full-size photos are removed 1 year after the case finally closes.
//     Final closure is closed_at (item 7d); for cases closed before that
//     column existed, resolved_at + CONFIRM_DAYS (never early).
//   - Small previews stay as light evidence until the record's own
//     retention ends: 3 years from filing or 1 year after resolution,
//     whichever is later. Then they are removed too.
//   - A photo with no preview (a few moved from the old public bucket) keeps
//     its full-size file until that same later date, so evidence remains.
//   - A reopened case is not closed, so nothing is removed; the clock starts
//     again from the new closure.
//   - photo_hold = 1 on a case pauses all of this (for the audit module).
//   - Uploads never attached to a complaint or report are removed after
//     ORPHAN_HOURS.
// Rows are kept with full_deleted_at / deleted_at set, so pages can say
// "removed under the retention policy on <date>", and the fingerprints
// (sha256, dhash) still catch reused photos.
//
// No scheduled job: purgeDuePhotos() runs a small batch in the background
// when the admin dashboard opens, and a super admin can run it from the
// Photo storage page. Runs that remove something are logged (admin_events
// "photos_purged").

import { photoLink } from "./photo-links.js";
import { CONFIRM_DAYS } from "./confirmation.js";

export const FULL_MAX_BYTES = 3 * 1024 * 1024;   // a 1600 px photo is usually 150-600 KB
export const THUMB_MAX_BYTES = 300 * 1024;       // a 320 px preview is usually 10-40 KB
export const FULL_KEEP_DAYS = 365;
export const RECORD_KEEP_YEARS = 3;
export const ORPHAN_HOURS = 48;
export const PURGE_BATCH = 50;

// Legacy: before 7c the citizen's photos were public links saved in
// grievances.photo_url (a JSON list). Kept readable until they are moved.
export function legacyUrls(photoUrl) {
  if (!photoUrl) return [];
  let list;
  try { const v = JSON.parse(photoUrl); list = Array.isArray(v) ? v : [photoUrl]; } catch (e) { list = [photoUrl]; }
  return list.filter((u) => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 3);
}

// The R2 key inside a legacy public link, or null.
export function legacyKey(url) {
  const m = /\/(grievance-photos\/[A-Za-z0-9._-]+)$/.exec(String(url || ""));
  return m ? m[1] : null;
}

// What a page needs to show one private photo:
//   { id, url, thumbUrl, removed: null | "FULL" | "ALL", removedAt }
// url opens the best file still kept; thumbUrl is for lists. kind "c"
// (citizen) or "r" (after photo).
export async function photoMedia(env, row, kind) {
  const full = kind === "c" ? "c" : "";
  const thumb = kind === "c" ? "ct" : "t";
  if (row.deleted_at) return { id: row.id, url: null, thumbUrl: null, removed: "ALL", removedAt: row.deleted_at };
  if (row.full_deleted_at) {
    const t = row.thumb_key ? await photoLink(env, row.id, null, thumb) : null;
    return { id: row.id, url: t, thumbUrl: t, removed: "FULL", removedAt: row.full_deleted_at };
  }
  const u = await photoLink(env, row.id, null, full);
  const t = row.thumb_key ? await photoLink(env, row.id, null, thumb) : u;
  return { id: row.id, url: u, thumbUrl: t, removed: null, removedAt: null };
}

// The citizen's photos for a case, in order: private ones first, then any
// old public links not moved yet.
export async function complaintPhotoList(env, g, rows) {
  const out = [];
  const sorted = (rows || []).slice().sort((a, b) => (a.position - b.position) || (a.created_at < b.created_at ? -1 : 1));
  for (const r of sorted) out.push(await photoMedia(env, r, "c"));
  for (const u of legacyUrls(g && g.photo_url)) out.push({ id: null, url: u, thumbUrl: u, removed: null, removedAt: null, legacy: true });
  return out.slice(0, 3);
}

export async function loadComplaintPhotos(env, grievanceId) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM complaint_photos WHERE grievance_id = ? ORDER BY position ASC, created_at ASC"
  ).bind(grievanceId).all();
  return results || [];
}

// Removes the hidden details (EXIF/XMP: date, GPS, camera) from a JPEG by
// dropping its APP1-APP15 and comment segments, in case a photo reaches us
// without being redrawn on the phone. The picture itself is untouched.
// Returns the input unchanged if it isn't a JPEG we can read.
export function stripJpegMetadata(input) {
  const u = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (u.length < 4 || u[0] !== 0xff || u[1] !== 0xd8) return u;
  const parts = [u.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= u.length) {
    if (u[i] !== 0xff) return u;
    const marker = u[i + 1];
    if (marker === 0xda) { parts.push(u.subarray(i)); break; }        // start of image data: copy the rest
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { parts.push(u.subarray(i, i + 2)); i += 2; continue; }
    const len = (u[i + 2] << 8) | u[i + 3];
    if (len < 2 || i + 2 + len > u.length) return u;
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) parts.push(u.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// SQL pieces. Dates may be ISO ("...T...Z") or "YYYY-MM-DD HH:MM:SS"; both
// are compared in the second shape.
const norm = (col) => `REPLACE(REPLACE(${col}, 'T', ' '), 'Z', '')`;
const CLOSED = `g.status IN ('RESOLVED', 'CLOSED') AND COALESCE(g.photo_hold, 0) = 0`;
// When the case finally closed: closed_at (item 7d); for cases closed
// before it existed, resolved_at + CONFIRM_DAYS (never early).
const CLOSED_AT = `(CASE WHEN g.closed_at IS NOT NULL THEN ${norm("g.closed_at")} ELSE datetime(${norm("COALESCE(g.resolved_at, g.updated_at, g.created_at)")}, '+${CONFIRM_DAYS} days') END)`;
const FULL_DUE = `${CLOSED} AND ${CLOSED_AT} < datetime('now', '-${FULL_KEEP_DAYS} days')`;
const RECORD_OVER = `${norm("g.created_at")} < datetime('now', '-${RECORD_KEEP_YEARS} years')`;
const ALL_DUE = `${FULL_DUE} AND ${RECORD_OVER}`;
const ONLY_FULL_DUE = `${FULL_DUE} AND NOT (${RECORD_OVER})`;

// How many photos each step would remove now (for the Photo storage page).
export async function purgeCounts(env) {
  const q = (sql) => env.DB.prepare(sql);
  const res = await env.DB.batch([
    q(`SELECT COUNT(*) AS n FROM complaint_photos WHERE grievance_id IS NULL AND ${norm("created_at")} < datetime('now', '-${ORPHAN_HOURS} hours')`),
    q(`SELECT COUNT(*) AS n FROM resolution_photos WHERE report_id IS NULL AND ${norm("created_at")} < datetime('now', '-${ORPHAN_HOURS} hours')`),
    q(`SELECT COUNT(*) AS n FROM complaint_photos p JOIN grievances g ON g.id = p.grievance_id WHERE p.deleted_at IS NULL AND ${ALL_DUE}`),
    q(`SELECT COUNT(*) AS n FROM resolution_photos p JOIN grievances g ON g.id = p.grievance_id WHERE p.report_id IS NOT NULL AND p.deleted_at IS NULL AND ${ALL_DUE}`),
    q(`SELECT COUNT(*) AS n FROM complaint_photos p JOIN grievances g ON g.id = p.grievance_id WHERE p.deleted_at IS NULL AND p.full_deleted_at IS NULL AND p.thumb_key IS NOT NULL AND ${ONLY_FULL_DUE}`),
    q(`SELECT COUNT(*) AS n FROM resolution_photos p JOIN grievances g ON g.id = p.grievance_id WHERE p.report_id IS NOT NULL AND p.deleted_at IS NULL AND p.full_deleted_at IS NULL AND p.thumb_key IS NOT NULL AND ${ONLY_FULL_DUE}`),
  ]);
  const n = (i) => (res[i].results && res[i].results[0] ? res[i].results[0].n : 0);
  return { unused: n(0) + n(1), all: n(2) + n(3), full: n(4) + n(5) };
}

// Removes up to `limit` photos that are due. Never throws (a failure here
// must not break a page); returns the counts removed.
export async function purgeDuePhotos(env, limit, actor) {
  const done = { unused: 0, full: 0, all: 0 };
  if (!env.PRIVATE_PHOTOS) return done;
  let room = Math.max(1, Math.min(Number(limit) || PURGE_BATCH, 1000));
  try {
    const now = new Date().toISOString();
    const pick = async (sql) => {
      if (room <= 0) return [];
      const { results } = await env.DB.prepare(sql + ` LIMIT ${room}`).all();
      room -= (results || []).length;
      return results || [];
    };

    // 1. Uploads never attached to a complaint or report.
    const unusedC = await pick(`SELECT id, r2_key, thumb_key FROM complaint_photos WHERE grievance_id IS NULL AND ${norm("created_at")} < datetime('now', '-${ORPHAN_HOURS} hours')`);
    const unusedR = await pick(`SELECT id, r2_key, thumb_key FROM resolution_photos WHERE report_id IS NULL AND ${norm("created_at")} < datetime('now', '-${ORPHAN_HOURS} hours')`);
    // 2. Record retention over: remove the preview and anything left.
    const allC = await pick(`SELECT p.id, p.r2_key, p.thumb_key, p.full_deleted_at FROM complaint_photos p JOIN grievances g ON g.id = p.grievance_id WHERE p.deleted_at IS NULL AND ${ALL_DUE}`);
    const allR = await pick(`SELECT p.id, p.r2_key, p.thumb_key, p.full_deleted_at FROM resolution_photos p JOIN grievances g ON g.id = p.grievance_id WHERE p.report_id IS NOT NULL AND p.deleted_at IS NULL AND ${ALL_DUE}`);
    // 3. One year after closure: remove the full-size file, keep the preview.
    const fullC = await pick(`SELECT p.id, p.r2_key FROM complaint_photos p JOIN grievances g ON g.id = p.grievance_id WHERE p.deleted_at IS NULL AND p.full_deleted_at IS NULL AND p.thumb_key IS NOT NULL AND ${ONLY_FULL_DUE}`);
    const fullR = await pick(`SELECT p.id, p.r2_key FROM resolution_photos p JOIN grievances g ON g.id = p.grievance_id WHERE p.report_id IS NOT NULL AND p.deleted_at IS NULL AND p.full_deleted_at IS NULL AND p.thumb_key IS NOT NULL AND ${ONLY_FULL_DUE}`);

    const keys = [];
    for (const r of unusedC.concat(unusedR)) { keys.push(r.r2_key); if (r.thumb_key) keys.push(r.thumb_key); }
    for (const r of allC.concat(allR)) { if (!r.full_deleted_at) keys.push(r.r2_key); if (r.thumb_key) keys.push(r.thumb_key); }
    for (const r of fullC.concat(fullR)) keys.push(r.r2_key);
    if (!keys.length) return done;

    // Files first; the rows are marked only once the files are gone.
    for (let i = 0; i < keys.length; i += 1000) await env.PRIVATE_PHOTOS.delete(keys.slice(i, i + 1000));

    const stmts = [];
    for (const r of unusedC) stmts.push(env.DB.prepare("DELETE FROM complaint_photos WHERE id = ? AND grievance_id IS NULL").bind(r.id));
    for (const r of unusedR) stmts.push(env.DB.prepare("DELETE FROM resolution_photos WHERE id = ? AND report_id IS NULL").bind(r.id));
    for (const r of allC) stmts.push(env.DB.prepare("UPDATE complaint_photos SET deleted_at = ?, full_deleted_at = COALESCE(full_deleted_at, ?) WHERE id = ?").bind(now, now, r.id));
    for (const r of allR) stmts.push(env.DB.prepare("UPDATE resolution_photos SET deleted_at = ?, full_deleted_at = COALESCE(full_deleted_at, ?) WHERE id = ?").bind(now, now, r.id));
    for (const r of fullC) stmts.push(env.DB.prepare("UPDATE complaint_photos SET full_deleted_at = ? WHERE id = ?").bind(now, r.id));
    for (const r of fullR) stmts.push(env.DB.prepare("UPDATE resolution_photos SET full_deleted_at = ? WHERE id = ?").bind(now, r.id));
    await env.DB.batch(stmts);

    done.unused = unusedC.length + unusedR.length;
    done.all = allC.length + allR.length;
    done.full = fullC.length + fullR.length;
    await env.DB.prepare(
      "INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), actor || "system", "photos_purged", "photo_retention", JSON.stringify(done)).run();
  } catch (e) {
    // Ignore: whatever is still due is removed on the next run.
  }
  return done;
}
