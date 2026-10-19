/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/seats.js   (grieviq-57, owner approved 19 Oct 2026)
//
// Wards with more than one elected member. Some states elect several members
// per ward (Pune 2026: seats A, B, C, D). Each seat is its own office:
// its own sign-in, team, plan, bills and handover.
//   - Seat A is the ward's own record (local_units); its office id is the
//     ward's id, so everything already in use keeps working.
//   - Seats B-F live in ward_seats; their office id is "<ward id>~<letter>".
//   - A ward with one seat (every ward until an admin says otherwise) works
//     exactly as before: nothing in this file changes it.
//
// Who handles a case in a ward with several members (design approved
// 19 Oct 2026, following UK multi-member ward protocols and ISO 10002's
// accountability and confidentiality principles):
//   - The citizen chooses "any member" (seat_choice 'ANY') or one member.
//   - A case the citizen sent to one member is that member's from the start;
//     the others don't see it.
//   - An "any member" case is open to every member until one of them takes
//     it (taking acknowledges it); the others then see one line, no details.
//   - The owner of an "any member" case may return it to the ward, with a
//     reason. A case sent to one member can't be passed to another.
//   - When the owner's office can't act (seat vacant, plan paused or ended)
//     its open cases go back to the ward at once, and the citizen is told:
//     a citizen's service must not stop because of one member's account
//     (councils' casework cover rules). The citizen agreed to this when
//     filing ("If the member you chose cannot act, any member of this ward
//     may handle it").
//   - Time limits and moving up to the mayor, MLA and MP don't change.
// Storage: part40 (ward_seats, local_units.seat_count, grievances.seat_*,
// view local_offices). History: team_activity (tamper-proof).

export const MAX_SEATS = 6;
export const LETTERS = ["A", "B", "C", "D", "E", "F"];
export const RETURN_REASON_MIN = 10;
export const RETURN_REASON_MAX = 300;
const low = (s) => String(s || "").trim().toLowerCase();

// The ward a LOCAL office belongs to, and its seat letter.
export function unitOf(officeId) { const s = String(officeId == null ? "" : officeId); const i = s.indexOf("~"); return i > 0 ? s.slice(0, i) : s; }
export function letterOf(officeId) { const s = String(officeId == null ? "" : officeId); const i = s.indexOf("~"); return i > 0 ? s.slice(i + 1) : "A"; }
export function seatId(unitId, letter) { return letter === "A" ? String(unitId) : String(unitId) + "~" + letter; }
export function isSeatOffice(officeId) { return String(officeId || "").indexOf("~") > 0; }

let ready = null;
export async function seatsReady(env) {
  if (ready === true) return true;
  try { await env.DB.prepare("SELECT seat_count FROM local_units LIMIT 1").all(); await env.DB.prepare("SELECT id FROM local_offices LIMIT 1").all(); await env.DB.prepare("SELECT seat_owner FROM grievances LIMIT 1").all(); ready = true; }
  catch (e) { ready = false; }
  return ready;
}
// For tests: forget what was found (the test server keeps one process).
export function resetSeatsReady() { ready = null; }

// The table to read LOCAL offices from: the view once part40 is in.
export async function localTable(env) { return (await seatsReady(env)) ? "local_offices" : "local_units"; }

export function seatStatusOf(v) { return v === "ADMINISTRATOR" || v === "VACANT" ? v : "ELECTED"; }
export function seatCount(lu) { const n = Number(lu && lu.seat_count); return Number.isInteger(n) && n > 1 ? Math.min(n, MAX_SEATS) : 1; }
export function isMulti(lu) { return seatCount(lu) > 1; }

// Every seat of one ward: [{ id, letter, name, phone, email, status }] in
// seat order. Seat A comes from the ward's own row.
export async function seatsOfUnit(env, unitOrId) {
  let lu = unitOrId;
  if (!lu || typeof lu !== "object") lu = await env.DB.prepare("SELECT * FROM local_units WHERE id = ?").bind(String(unitOrId || "")).first();
  if (!lu) return [];
  const a = { id: String(lu.id), letter: "A", name: lu.rep_name || null, phone: lu.rep_phone || null, email: low(lu.rep_email) || null, status: seatStatusOf(lu.seat_status) };
  if (!isMulti(lu) || !(await seatsReady(env))) return [a];
  const { results } = await env.DB.prepare("SELECT * FROM ward_seats WHERE local_unit_id = ? ORDER BY seat_label").bind(String(lu.id)).all();
  const n = seatCount(lu);
  const out = [a];
  for (const s of results || []) {
    if (LETTERS.indexOf(s.seat_label) >= n) continue;
    out.push({ id: s.id, letter: s.seat_label, name: s.rep_name || null, phone: s.rep_phone || null, email: low(s.rep_email) || null, status: seatStatusOf(s.seat_status) });
  }
  return out;
}

// Seats of many wards at once: Map unitId -> seats (only multi-member wards).
export async function seatsOfUnits(env, units) {
  const out = new Map();
  const multi = (units || []).filter(isMulti);
  if (!multi.length || !(await seatsReady(env))) return out;
  const { results } = await env.DB.prepare("SELECT * FROM ward_seats WHERE local_unit_id IN (SELECT value FROM json_each(?)) ORDER BY seat_label")
    .bind(JSON.stringify(multi.map((u) => String(u.id)))).all();
  for (const lu of multi) {
    const n = seatCount(lu);
    const list = [{ id: String(lu.id), letter: "A", name: lu.rep_name || null, phone: lu.rep_phone || null, email: low(lu.rep_email) || null, status: seatStatusOf(lu.seat_status) }];
    for (const s of results || []) if (s.local_unit_id === String(lu.id) && LETTERS.indexOf(s.seat_label) < n) list.push({ id: s.id, letter: s.seat_label, name: s.rep_name || null, phone: s.rep_phone || null, email: low(s.rep_email) || null, status: seatStatusOf(s.seat_status) });
    out.set(String(lu.id), list);
  }
  return out;
}

// A seat that can take complaints: someone holds it (not vacant) and it has
// an email to sign in with. Whether its plan lets it act is checked apart.
export function seatOpen(s) { return !!(s && s.email && s.status !== "VACANT"); }

// The ward level as one step of the escalation chain: vacant only when every
// seat is vacant; "has someone" when any seat can take complaints.
export function wardLevelStatus(seats) {
  if (!seats.length) return "ELECTED";
  if (seats.every((s) => s.status === "VACANT")) return "VACANT";
  return "ELECTED";
}

// Plan status of each seat office: Map seatId -> canAct (true/false).
export async function seatsCanAct(env, seats) {
  const { statusForMandates, officeKey, canAct } = await import("./subscriptions.js");
  const st = await statusForMandates(env, seats.map((s) => ({ tier: "LOCAL", id: s.id })));
  return new Map(seats.map((s) => [s.id, canAct(st.get(officeKey("REP", "LOCAL", s.id)))]));
}

// Seats a citizen may choose: open, and their plan lets them act.
export async function choosableSeats(env, unitOrId) {
  const seats = await seatsOfUnit(env, unitOrId);
  if (seats.length < 2) return [];
  const act = await seatsCanAct(env, seats);
  return seats.filter((s) => seatOpen(s) && act.get(s.id));
}

// The LOCAL offices a case belongs to right now, for alerts:
// [{ id, letter, email }]. One-member wards: the ward itself.
export async function caseLocalOffices(env, g, lu) {
  const unit = lu || await env.DB.prepare("SELECT * FROM local_units WHERE id = ?").bind(g.local_unit_id).first();
  if (!unit) return [];
  if (!isMulti(unit) || !(await seatsReady(env))) return [{ id: String(unit.id), letter: "A", email: low(unit.rep_email) || null, status: seatStatusOf(unit.seat_status) }];
  const seats = await seatsOfUnit(env, unit);
  if (g.seat_owner) return seats.filter((s) => s.id === g.seat_owner);
  const act = await seatsCanAct(env, seats);
  return seats.filter((s) => seatOpen(s) && act.get(s.id));
}

// What a member's office sees about a case in its ward:
//   "mine"   it owns the case
//   "pool"   open to every member, not taken yet
//   "other"  another member took an "any member" case (one line only)
//   "hidden" the citizen sent it to another member
export function seatView(g, officeId) {
  if (!g.seat_owner) return "pool";
  if (g.seat_owner === officeId) return "mine";
  return g.seat_choice === "ANY" ? "other" : "hidden";
}

// Short history line in team_activity (tamper-proof).
export async function logSeat(env, officeId, actor, role, action, grievanceId, detail) {
  try {
    await env.DB.prepare(
      `INSERT INTO team_activity (id, office_tier, office_id, actor_email, actor_role, on_behalf_of, action, grievance_id, detail, created_at)
       VALUES (?, 'LOCAL', ?, ?, ?, NULL, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), String(officeId), actor, role || null, action, grievanceId || null, detail == null ? null : JSON.stringify(detail), new Date().toISOString()).run();
  } catch (e) { /* the log must never block the work */ }
}

// Gives every open case owned by an office that can't act back to its ward.
// offices: [{ id, why }] (why: VACANT | PAUSED | ENDED). Returns the cases
// returned: [{ g, from, why }]. Safe to run again: only open, owned cases.
export async function returnCasesOf(env, offices, actor) {
  const out = [];
  if (!offices.length || !(await seatsReady(env))) return out;
  const now = new Date().toISOString();
  for (const o of offices) {
    const { results } = await env.DB.prepare(
      "SELECT * FROM grievances WHERE seat_owner = ? AND status IN ('OPEN', 'ACKNOWLEDGED')"
    ).bind(String(o.id)).all();
    for (const g of results || []) {
      const r = await env.DB.prepare("UPDATE grievances SET seat_owner = NULL, seat_owner_at = NULL, seat_choice = 'ANY', updated_at = ? WHERE id = ? AND seat_owner = ?")
        .bind(now, g.id, String(o.id)).run();
      if (!r.meta || !r.meta.changes) continue;
      try { await env.DB.prepare("UPDATE case_assignments SET ended_at = ?, ended_by = ?, end_reason = 'RETURNED_TO_WARD' WHERE grievance_id = ? AND office_tier = 'LOCAL' AND office_id = ? AND ended_at IS NULL").bind(now, actor, g.id, String(o.id)).run(); } catch (e) { /* no assignments table */ }
      await logSeat(env, o.id, actor, null, "CASE_RETURNED_AUTO", g.id, { why: o.why, choice: g.seat_choice || null });
      out.push({ g: Object.assign({}, g, { seat_owner: null, seat_choice: "ANY" }), from: o.id, why: o.why });
    }
  }
  return out;
}

// The hourly check: seats whose office can't act give their open cases back.
// Returns the cases returned (the caller tells people).
export async function returnStuckCases(env, actor) {
  if (!(await seatsReady(env))) return [];
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT g.seat_owner AS id, o.rep_email, o.seat_status FROM grievances g JOIN local_offices o ON o.id = g.seat_owner
      WHERE g.seat_owner IS NOT NULL AND g.status IN ('OPEN', 'ACKNOWLEDGED')`
  ).all();
  const rows = results || [];
  if (!rows.length) return [];
  const { statusForMandates, officeKey, canAct } = await import("./subscriptions.js");
  const st = await statusForMandates(env, rows.map((r) => ({ tier: "LOCAL", id: r.id })));
  const stuck = [];
  for (const r of rows) {
    const s = st.get(officeKey("REP", "LOCAL", r.id));
    if (seatStatusOf(r.seat_status) === "VACANT" || !r.rep_email) stuck.push({ id: r.id, why: "VACANT" });
    else if (!canAct(s)) stuck.push({ id: r.id, why: s && s.status === "ENDED" ? "ENDED" : "PAUSED" });
  }
  return returnCasesOf(env, stuck, actor);
}
