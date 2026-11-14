/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/alerts.js   (grieviq-89, owner approved 14 Nov 2026)
//
// Alerts that can't be missed (storage: dev-tests/part58-alerts.sql).
//
// Staff ("Needs you now"): an urgent item alerts the GrievIQ staff whose job
// it is, on their phones (web push to "staff:<email>") and in a red bar on
// every admin page, until one of them taps "I'll take it":
//   - first alert when it arrives (or when working hours start),
//   - again after 15 minutes,
//   - after 1 hour the super admin too (phone alert and email),
//   - once taken: one reminder to the owner if it isn't done after 4
//     working hours.
// Staff with no phone alerts switched on get the first alert by email.
// Every alert and email is content-free (what kind of item, never whose).
// Danger items ignore working hours; the rest wait for them (super admin
// sets them; default every day 9 am to 7 pm India time). An item is done
// when its work is done (pilot request contacted, complaint forwarded, the
// danger case acknowledged or closed), found by the 5-minute job.
//
// Industry practice followed (incident-management escalation policies):
// severity levels, one acknowledging owner, timed escalation to a backup,
// quiet hours for lower severity, a log of time to acknowledge.
//
// Offices (quiet hours): alerts that aren't about danger wait out each
// office's quiet hours (default 22:00 to 07:00), then go out (notify.js).

import { sendPush, pushConfigured } from "./webpush.js";
import { sendEmailNow } from "./dept-auth.js";

const MIN = 60000, H = 3600000;
export const REALERT_MIN = 15;
export const ESCALATE_MIN = 60;
export const OWNER_REMIND_HOURS = 4;
export const DEFAULT_HOURS = { days: [0, 1, 2, 3, 4, 5, 6], from: "09:00", to: "19:00" };
export const DEFAULT_QUIET = { from: "22:00", to: "07:00" };
const OPS = ["operations_admin", "support_executive"];

// Who each kind goes to first; the super admin is always the backup.
export const STAFF_KINDS = {
  PILOT_REQUEST:   { roles: ["sales_manager", "sales_executive"], fallback: ["operations_admin"], always: false, page: "/admin-pilot-requests.html" },
  ASSISTED_NEW:    { roles: OPS, fallback: [], always: false, page: "/admin-assisted.html" },
  ASSISTED_DANGER: { roles: OPS, fallback: [], always: true,  page: "/admin-assisted.html" },
  STAFF_DANGER:    { roles: ["operations_admin"], fallback: [], always: true,  page: "/admin-exceptions.html" },
};
export const KIND_ORDER = ["ASSISTED_DANGER", "STAFF_DANGER", "PILOT_REQUEST", "ASSISTED_NEW"];

// Can someone with these roles see and take this kind?
export function rolesSee(roles, kind) {
  const k = STAFF_KINDS[kind];
  if (!k) return false;
  return [].concat(roles || []).some((r) => r === "super_admin" || k.roles.includes(r) || k.fallback.includes(r));
}

function toMs(v) {
  const s = String(v || "");
  if (!s) return NaN;
  return s.indexOf("T") !== -1 ? new Date(s).getTime() : new Date(s.replace(" ", "T") + "Z").getTime();
}
const iso = (ms) => new Date(ms).toISOString();
// India time parts of a moment.
function ist(ms) { const d = new Date(ms + 5.5 * H); return { day: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes(), date: d.toISOString().slice(0, 10) }; }
function hm(s) { const m = /^(\d{2}):(\d{2})$/.exec(String(s || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
export function validHm(s) { const v = hm(s); return v != null && v < 1440; }
// The UTC ms of an India-time date + minutes.
function istAt(date, minutes) { return Date.parse(date + "T00:00:00+05:30") + minutes * MIN; }

// ---- Working hours (staff) ----------------------------------------------------
export async function readHours(env) {
  try {
    const r = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = 'staff_alert_hours'").first();
    const v = r ? JSON.parse(r.value) : null;
    if (v && Array.isArray(v.days) && validHm(v.from) && validHm(v.to) && hm(v.from) < hm(v.to)) return { days: v.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6), from: v.from, to: v.to };
  } catch (e) { /* default */ }
  return DEFAULT_HOURS;
}
export function inHours(hours, ms) {
  const t = ist(ms);
  return hours.days.includes(t.day) && t.min >= hm(hours.from) && t.min < hm(hours.to);
}
// The next moment working hours are on (ms itself when they are).
export function nextWorkStart(hours, ms) {
  if (!hours.days.length) return ms;
  if (inHours(hours, ms)) return ms;
  for (let i = 0; i < 8; i++) {
    const t = ist(ms + i * 24 * H);
    if (!hours.days.includes(t.day)) continue;
    const start = istAt(t.date, hm(hours.from));
    if (start > ms) return start;
  }
  return ms;
}
// Working time (ms) between two moments.
export function workMsBetween(hours, a, b) {
  let total = 0;
  for (let i = -1; i < 40 && a + i * 24 * H < b + 24 * H; i++) {
    const t = ist(a + i * 24 * H);
    if (!hours.days.includes(t.day)) continue;
    const s = Math.max(a, istAt(t.date, hm(hours.from))), e = Math.min(b, istAt(t.date, hm(hours.to)));
    if (e > s) total += e - s;
  }
  return total;
}

// ---- Office quiet hours ---------------------------------------------------------
// { from, to } in India time, or null for none.
export async function officeQuiet(env, tier, id, cache) {
  const key = tier + ":" + id;
  if (cache && cache.has(key)) return cache.get(key);
  let q = DEFAULT_QUIET;
  try {
    const r = await env.DB.prepare("SELECT quiet_from, quiet_to FROM office_quiet_hours WHERE office_tier = ? AND office_id = ?").bind(String(tier), String(id)).first();
    if (r) q = r.quiet_from && r.quiet_to ? { from: r.quiet_from, to: r.quiet_to } : null;
  } catch (e) { /* before part58: the default */ }
  if (cache) cache.set(key, q);
  return q;
}
// When quiet hours end (ms) if ms falls inside them, else null.
export function quietUntil(q, ms) {
  if (!q) return null;
  const f = hm(q.from), t = hm(q.to);
  if (f == null || t == null || f === t) return null;
  const now = ist(ms);
  const inside = f < t ? now.min >= f && now.min < t : now.min >= f || now.min < t;
  if (!inside) return null;
  let end = istAt(now.date, t);
  if (end <= ms) end += 24 * H;
  return end;
}

// ---- Who gets them ----------------------------------------------------------------
// Staff who can act today (not left, not on leave, access not paused), by role.
export async function staffWithRoles(env, roles) {
  if (!roles.length) return [];
  const today = ist(Date.now()).date;
  let rows = [];
  try {
    rows = (await env.DB.prepare(
      `SELECT LOWER(email) AS email, role, status, leave_until, auto_paused FROM admin_users WHERE role IN (SELECT value FROM json_each(?))`
    ).bind(JSON.stringify(roles)).all()).results || [];
  } catch (e) {
    try { rows = (await env.DB.prepare("SELECT LOWER(email) AS email, role FROM admin_users WHERE role IN (SELECT value FROM json_each(?))").bind(JSON.stringify(roles)).all()).results || []; }
    catch (e2) { rows = []; }
  }
  const out = new Set();
  const away = [];
  for (const r of rows) {
    if (r.status === "LEFT" || r.auto_paused) continue;
    if (r.status === "ON_LEAVE" && (!r.leave_until || r.leave_until >= today)) { away.push(r.email); continue; }
    out.add(r.email);
  }
  // Someone covering for a person on leave gets that person's alerts.
  if (away.length) {
    try {
      const { results } = await env.DB.prepare(
        "SELECT LOWER(cover_email) AS email FROM staff_covers WHERE LOWER(away_email) IN (SELECT value FROM json_each(?)) AND ended_at IS NULL AND from_date <= ? AND to_date >= ?"
      ).bind(JSON.stringify(away), today, today).all();
      for (const c of results || []) out.add(c.email);
    } catch (e) { /* no covers table */ }
  }
  return Array.from(out);
}

async function prefsOff(env, emails, kind) {
  if (!emails.length || STAFF_KINDS[kind].always) return new Set();
  try {
    const { results } = await env.DB.prepare("SELECT email FROM staff_alert_prefs WHERE kind = ? AND email IN (SELECT value FROM json_each(?))").bind(kind, JSON.stringify(emails)).all();
    return new Set((results || []).map((r) => r.email));
  } catch (e) { return new Set(); }
}

// The first-level people for an alert (falls back to the super admin when
// nobody holds those roles).
export async function firstLevel(env, a) {
  const k = STAFF_KINDS[a.kind];
  let people = await staffWithRoles(env, k.roles);
  // A pilot request: sales executives covering its state (all of them when it has none).
  if (a.kind === "PILOT_REQUEST" && people.length) {
    try {
      const lead = await env.DB.prepare("SELECT state_code FROM sales_leads WHERE pilot_request_id = ?").bind(a.item_id).first();
      if (lead && lead.state_code) {
        const { results } = await env.DB.prepare("SELECT LOWER(email) AS email, state_code FROM sales_territories WHERE email IN (SELECT value FROM json_each(?))").bind(JSON.stringify(people)).all();
        const terr = new Map();
        for (const t of results || []) { if (!terr.has(t.email)) terr.set(t.email, []); terr.get(t.email).push(t.state_code); }
        const managers = new Set(await staffWithRoles(env, ["sales_manager"]));
        const kept = people.filter((p) => managers.has(p) || !terr.has(p) || terr.get(p).includes(lead.state_code));
        if (kept.length) people = kept;
      }
    } catch (e) { /* everyone */ }
  }
  if (!people.length && k.fallback.length) people = await staffWithRoles(env, k.fallback);
  if (!people.length) people = await staffWithRoles(env, ["super_admin"]);
  const off = await prefsOff(env, people, a.kind);
  return people.filter((p) => !off.has(p));
}

// ---- Sending ---------------------------------------------------------------------
const TEXT = {
  PILOT_REQUEST: ["A new pilot request is waiting. Tap to open and take it.", "पायलट का नया अनुरोध प्रतीक्षा में है। खोलें और लें।"],
  ASSISTED_NEW: ["A new complaint in an assisted ward is waiting to be forwarded.", "सहायता वाले वार्ड की नई शिकायत आगे भेजने की प्रतीक्षा में है।"],
  ASSISTED_DANGER: ["A danger-to-life complaint in an assisted ward is waiting to be forwarded.", "सहायता वाले वार्ड की जान के ख़तरे वाली शिकायत आगे भेजने की प्रतीक्षा में है।"],
  STAFF_DANGER: ["A danger-to-life complaint has reached GrievIQ staff. Tap to open and take it.", "जान के ख़तरे वाली एक शिकायत GrievIQ स्टाफ़ तक पहुँची है। खोलें और लें।"],
};
export function alertText(kind, stage, lang) {
  const hi = lang === "hi";
  const t = TEXT[kind] || TEXT.PILOT_REQUEST;
  const title = stage === "OWNER" ? (hi ? "GrievIQ · आपने जो लिया वह बाकी है" : "GrievIQ · Something you took is still open")
    : stage === "ESCALATE" ? (hi ? "GrievIQ · एक घंटे से किसी ने नहीं लिया" : "GrievIQ · Nobody has taken this for an hour")
    : (hi ? "GrievIQ · अभी आपकी ज़रूरत है" : "GrievIQ · Needs you now");
  return { title, body: hi ? t[1] : t[0] };
}

// Push to these staff; returns the set of people at least one device took.
async function pushStaff(env, people, a, stage) {
  const done = new Set();
  if (!people.length || !pushConfigured(env)) return done;
  let subs = [];
  try {
    subs = (await env.DB.prepare("SELECT * FROM push_subscriptions WHERE email IN (SELECT value FROM json_each(?))").bind(JSON.stringify(people.map((p) => "staff:" + p))).all()).results || [];
  } catch (e) { return done; }
  const now = iso(Date.now());
  for (const s of subs) {
    const t = alertText(a.kind, stage, s.lang);
    const r = await sendPush(env, s, { title: t.title, body: t.body, url: STAFF_KINDS[a.kind].page + "#alert=" + encodeURIComponent(a.id), tag: "alert:" + a.id + ":" + stage, id: a.id }, { urgency: "high" });
    try {
      if (r.ok) { done.add(String(s.email).slice(6)); await env.DB.prepare("UPDATE push_subscriptions SET last_ok_at = ?, fail_count = 0, last_error = NULL WHERE id = ?").bind(now, s.id).run(); }
      else if (r.gone) await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(s.id).run();
      else await env.DB.prepare("UPDATE push_subscriptions SET fail_count = fail_count + 1, last_error = ? WHERE id = ?").bind(String(r.status || r.error || "error"), s.id).run();
    } catch (e) { /* ignore */ }
  }
  return done;
}

function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
async function emailStaff(env, origin, to, a, stage) {
  const t = alertText(a.kind, stage, "en"), th = alertText(a.kind, stage, "hi");
  const url = origin + STAFF_KINDS[a.kind].page;
  return sendEmailNow(env, to, t.title,
    `<p>${esc(t.body)}</p><p><a href="${esc(url)}">${esc(url)}</a></p><p>Open GrievIQ and tap “I'll take it” so the others know it's yours. For security, the details are shown only after you sign in.</p>` +
    `<p>Phone alerts are faster: in the admin menu open My alerts and switch them on.</p><hr><p>${esc(th.body)}</p><p>GrievIQ खोलें और “मैं लूँगा/लूँगी” दबाएँ ताकि दूसरों को पता चले।</p>`);
}

// First alert: phones, and email to those with no phone alerts on.
async function firstAlert(env, origin, a) {
  const people = await firstLevel(env, a);
  const pushed = await pushStaff(env, people, a, "FIRST");
  for (const p of people) if (!pushed.has(p)) { try { await emailStaff(env, origin, p, a, "FIRST"); } catch (e) { /* ignore */ } }
  return people.length;
}

// ---- Creating and the 5-minute job ---------------------------------------------
export async function alertsReady(env) {
  try { await env.DB.prepare("SELECT id FROM staff_alerts LIMIT 1").first(); return true; }
  catch (e) { if (/no such table/i.test(String(e && e.message))) return false; throw e; }
}

// An item needs staff. Alerts at once when its hours allow. Never throws.
export async function createStaffAlert(env, origin, kind, itemId, nowMs) {
  try {
    if (!STAFF_KINDS[kind] || !itemId) return null;
    const now = nowMs || Date.now();
    const hours = await readHours(env);
    const release = STAFF_KINDS[kind].always ? now : nextWorkStart(hours, now);
    const id = crypto.randomUUID();
    const res = await env.DB.prepare("INSERT OR IGNORE INTO staff_alerts (id, kind, item_id, always, created_at, release_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, kind, String(itemId), STAFF_KINDS[kind].always ? 1 : 0, iso(now), iso(release)).run();
    if (!(res && res.meta && res.meta.changes > 0)) {
      // A danger complaint that reached staff again (say, past the last level after being acknowledged): alert afresh.
      if (kind !== "STAFF_DANGER") return null;
      const old = await env.DB.prepare("SELECT id, done_at FROM staff_alerts WHERE kind = ? AND item_id = ?").bind(kind, String(itemId)).first();
      if (!old || !old.done_at || toMs(old.done_at) > now - 60 * MIN) return null;
      await env.DB.prepare("UPDATE staff_alerts SET created_at = ?, release_at = ?, alerted_at = NULL, realerted_at = NULL, escalated_at = NULL, taken_by = NULL, taken_at = NULL, owner_reminded_at = NULL, done_at = NULL, done_reason = NULL WHERE id = ?")
        .bind(iso(now), iso(now), old.id).run();
      await firstAlert(env, origin, { id: old.id, kind, item_id: String(itemId) });
      await env.DB.prepare("UPDATE staff_alerts SET alerted_at = ? WHERE id = ?").bind(iso(now), old.id).run();
      return old.id;
    }
    if (release <= now) {
      const a = { id, kind, item_id: String(itemId) };
      await firstAlert(env, origin, a);
      await env.DB.prepare("UPDATE staff_alerts SET alerted_at = ? WHERE id = ?").bind(iso(now), id).run();
    }
    return id;
  } catch (e) { return null; }
}

// Is the work behind an alert done? -> a reason, or null.
export async function workDone(env, a) {
  try {
    if (a.kind === "PILOT_REQUEST") {
      const r = await env.DB.prepare("SELECT status FROM pilot_requests WHERE id = ?").bind(a.item_id).first();
      if (!r) return "GONE";
      if (r.status !== "NEW") return r.status;
      // Or contacted from the Sales page.
      try {
        const l = await env.DB.prepare("SELECT stage FROM sales_leads WHERE pilot_request_id = ?").bind(a.item_id).first();
        if (l && l.stage !== "NEW") return "CONTACTED";
      } catch (e) { /* no sales tables */ }
      return null;
    }
    const g = await env.DB.prepare("SELECT id, status, assisted_pilot, assisted_handed_at, priority, priority_off_at FROM grievances WHERE id = ?").bind(a.item_id).first();
    if (!g) return "GONE";
    if (g.status !== "OPEN" && g.status !== "ACKNOWLEDGED") return "CLOSED";
    if (a.kind === "ASSISTED_NEW" || a.kind === "ASSISTED_DANGER") {
      if (g.assisted_handed_at) return "HANDED";
      const f = await env.DB.prepare("SELECT id FROM assisted_steps WHERE grievance_id = ? AND kind = 'FORWARD' LIMIT 1").bind(g.id).first();
      return f ? "FORWARDED" : null;
    }
    if (a.kind === "STAFF_DANGER") return g.priority && !g.priority_off_at ? null : "PRIORITY_OFF";
  } catch (e) { return null; }
  return null;
}

export async function markDone(env, kind, itemId, reason) {
  try {
    await env.DB.prepare("UPDATE staff_alerts SET done_at = ?, done_reason = ? WHERE kind = ? AND item_id = ? AND done_at IS NULL")
      .bind(iso(Date.now()), reason || "DONE", kind, String(itemId)).run();
  } catch (e) { /* before part58 */ }
}

// Every 5 minutes (worker). staffDanger: ids of danger complaints that have
// reached GrievIQ staff now (from notify.js, which knows the levels).
export async function runStaffAlerts(env, origin, nowMs, staffDanger) {
  const out = { created: 0, first: 0, again: 0, escalated: 0, ownerReminders: 0, done: 0 };
  if (!(await alertsReady(env))) return out;
  const now = nowMs || Date.now();
  const hours = await readHours(env);
  // Pilot requests that somehow have no alert yet (last 2 days).
  try {
    const { results } = await env.DB.prepare(
      "SELECT p.id FROM pilot_requests p WHERE p.status = 'NEW' AND p.created_at >= ? AND NOT EXISTS (SELECT 1 FROM staff_alerts a WHERE a.kind = 'PILOT_REQUEST' AND a.item_id = p.id)"
    ).bind(iso(now - 2 * 24 * H)).all();
    for (const p of results || []) if (await createStaffAlert(env, origin, "PILOT_REQUEST", p.id, now)) out.created++;
  } catch (e) { /* no pilot table */ }
  // Danger complaints at GrievIQ staff.
  if (Array.isArray(staffDanger)) {
    for (const id of staffDanger) if (await createStaffAlert(env, origin, "STAFF_DANGER", id, now)) out.created++;
    const { results } = await env.DB.prepare("SELECT item_id FROM staff_alerts WHERE kind = 'STAFF_DANGER' AND done_at IS NULL").all();
    const still = new Set(staffDanger.map(String));
    for (const r of results || []) if (!still.has(r.item_id)) { await markDone(env, "STAFF_DANGER", r.item_id, "NO_LONGER"); out.done++; }
  }
  const { results: open } = await env.DB.prepare("SELECT * FROM staff_alerts WHERE done_at IS NULL ORDER BY created_at").all();
  for (const a of open || []) {
    const reason = await workDone(env, a);
    if (reason) { await markDone(env, a.kind, a.item_id, reason); out.done++; continue; }
    const live = a.always || inHours(hours, now);
    if (!live) continue;
    if (!a.alerted_at) {
      if (toMs(a.release_at) <= now) {
        await firstAlert(env, origin, a);
        await env.DB.prepare("UPDATE staff_alerts SET alerted_at = ? WHERE id = ?").bind(iso(now), a.id).run();
        out.first++;
      }
      continue;
    }
    if (a.taken_by) {
      if (!a.owner_reminded_at && workMsBetween(a.always ? DEFAULT_HOURS_ALL : hours, toMs(a.taken_at), now) >= OWNER_REMIND_HOURS * H) {
        const pushed = await pushStaff(env, [a.taken_by], a, "OWNER");
        if (!pushed.size) { try { await emailStaff(env, origin, a.taken_by, a, "OWNER"); } catch (e) { /* ignore */ } }
        await env.DB.prepare("UPDATE staff_alerts SET owner_reminded_at = ? WHERE id = ?").bind(iso(now), a.id).run();
        out.ownerReminders++;
      }
      continue;
    }
    const since = now - toMs(a.alerted_at);
    if (!a.escalated_at && since >= ESCALATE_MIN * MIN) {
      const supers = await staffWithRoles(env, ["super_admin"]);
      const pushed = await pushStaff(env, supers, a, "ESCALATE");
      for (const s of supers) { try { await emailStaff(env, origin, s, a, "ESCALATE"); } catch (e) { /* ignore */ } }
      if (!pushed.size && !supers.length) { /* nobody: still marked so it doesn't repeat */ }
      await env.DB.prepare("UPDATE staff_alerts SET escalated_at = ?, realerted_at = COALESCE(realerted_at, ?) WHERE id = ?").bind(iso(now), iso(now), a.id).run();
      out.escalated++;
    } else if (!a.realerted_at && since >= REALERT_MIN * MIN) {
      await pushStaff(env, await firstLevel(env, a), a, "AGAIN");
      await env.DB.prepare("UPDATE staff_alerts SET realerted_at = ? WHERE id = ?").bind(iso(now), a.id).run();
      out.again++;
    }
  }
  return out;
}
// Danger items count every hour of the day for the owner reminder.
const DEFAULT_HOURS_ALL = { days: [0, 1, 2, 3, 4, 5, 6], from: "00:00", to: "23:59" };

// ---- For the admin pages -------------------------------------------------------
// Names for "Taken by".
export async function staffNames(env, emails) {
  const out = {};
  if (!emails.length) return out;
  try {
    const { results } = await env.DB.prepare("SELECT LOWER(email) AS email, name FROM admin_users WHERE LOWER(email) IN (SELECT value FROM json_each(?))").bind(JSON.stringify(emails)).all();
    for (const r of results || []) out[r.email] = r.name || r.email;
  } catch (e) { /* ignore */ }
  return out;
}

// A short, safe label for the bar: the place (pilot request) or ward (complaint).
export async function alertWhere(env, a) {
  try {
    if (a.kind === "PILOT_REQUEST") {
      const r = await env.DB.prepare("SELECT place FROM pilot_requests WHERE id = ?").bind(a.item_id).first();
      return r ? String(r.place || "").slice(0, 60) : "";
    }
    const r = await env.DB.prepare("SELECT lu.name AS ward, g.tracking_ref FROM grievances g JOIN local_units lu ON lu.id = g.local_unit_id WHERE g.id = ?").bind(a.item_id).first();
    return r ? r.ward + " · " + r.tracking_ref : "";
  } catch (e) { return ""; }
}

// ---- Office quiet hours: reading and changing (rep console, department dashboard) ----
export async function quietSetting(env, tier, id) {
  try {
    const r = await env.DB.prepare("SELECT quiet_from, quiet_to, updated_at FROM office_quiet_hours WHERE office_tier = ? AND office_id = ?").bind(String(tier), String(id)).first();
    if (!r) return { from: DEFAULT_QUIET.from, to: DEFAULT_QUIET.to, off: false, isDefault: true };
    return { from: r.quiet_from || DEFAULT_QUIET.from, to: r.quiet_to || DEFAULT_QUIET.to, off: !r.quiet_from, isDefault: false, updatedAt: r.updated_at };
  } catch (e) { return { from: DEFAULT_QUIET.from, to: DEFAULT_QUIET.to, off: false, isDefault: true, notReady: true }; }
}
// body: { from, to } or { off: true }. Returns { ok } or { fields }.
export async function saveQuiet(env, tier, id, body, by) {
  const off = body && body.off === true;
  const fields = {};
  if (!off) {
    if (!validHm(body && body.from)) fields.from = "TIME";
    if (!validHm(body && body.to)) fields.to = "TIME";
    if (!fields.from && !fields.to && body.from === body.to) fields.to = "SAME";
  }
  if (Object.keys(fields).length) return { fields };
  await env.DB.prepare(
    `INSERT INTO office_quiet_hours (office_tier, office_id, quiet_from, quiet_to, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(office_tier, office_id) DO UPDATE SET quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).bind(String(tier), String(id), off ? null : body.from, off ? null : body.to, String(by), iso(Date.now())).run();
  // Held notices: switched off, or the new hours already ended: they go out on the next 5-minute run.
  const q = off ? null : { from: body.from, to: body.to };
  const until = quietUntil(q, Date.now());
  await env.DB.prepare("UPDATE notifications SET held_until = ? WHERE office_tier = ? AND office_id = ? AND held_until IS NOT NULL")
    .bind(iso(until || Date.now()), String(tier), String(id)).run();
  return { ok: true };
}
