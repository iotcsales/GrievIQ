/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/assisted-run.js   (grieviq-88)
//
// The hourly job's part for GrievIQ-assisted wards: from 9 am India time,
// once a day, GrievIQ staff who work on assisted cases get one email with
// how many complaints wait to be forwarded, how many replies came in and
// how many follow-ups are due. Counts only: no complaint details.

import { assistedReady, loadSteps, caseState, istDay } from "./assisted.js";

const HOUR = 9;

export async function runAssisted(env, origin, nowMs, sendEmail) {
  if (!(await assistedReady(env))) return { ready: false };
  const ms = nowMs || Date.now();
  if (new Date(ms + 5.5 * 3600000).getUTCHours() < HOUR || !sendEmail) return { sent: 0 };
  const today = istDay(ms);
  const last = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = 'assisted_digest_day'").first().catch(() => null);
  if (last && last.value === today) return { sent: 0 };
  await env.DB.prepare("INSERT INTO admin_settings (key, value, updated_at, updated_by) VALUES ('assisted_digest_day', ?, ?, 'system') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(today, new Date(ms).toISOString()).run();
  const { results } = await env.DB.prepare(
    `SELECT g.*, lu.rep_email AS ward_rep_email FROM grievances g JOIN local_units lu ON lu.id = g.local_unit_id
     WHERE g.assisted_pilot IS NOT NULL AND g.assisted_handed_at IS NULL AND g.status IN ('OPEN', 'ACKNOWLEDGED')`
  ).all();
  const cases = results || [];
  if (!cases.length) return { sent: 0 };
  const steps = await loadSteps(env, cases.map((g) => g.id));
  const n = { NEW: 0, REPLY: 0, DUE: 0, JOINED: 0, WAITING: 0 };
  for (const g of cases) { const s = caseState(g, steps.get(g.id) || [], !!(g.ward_rep_email && String(g.ward_rep_email).trim()), ms); if (s in n) n[s]++; }
  if (!n.NEW && !n.REPLY && !n.DUE && !n.JOINED) return { sent: 0 };
  const roles = ["super_admin", "operations_admin", "support_executive"];
  const { results: staff } = await env.DB.prepare(`SELECT LOWER(email) AS email FROM admin_users WHERE role IN (${roles.map(() => "?").join(",")}) AND COALESCE(status, 'PRESENT') <> 'LEFT'`).bind(...roles).all();
  let sent = 0;
  for (const s of staff || []) {
    const ok = await sendEmail(env, s.email, `GrievIQ assisted cases today: ${n.NEW} to forward, ${n.DUE} follow-ups · आज के सहायता-प्राप्त मामले`,
      `<p>Good morning. Assisted cases waiting for you today:</p><ul><li>To forward: <b>${n.NEW}</b></li><li>Replies to read: <b>${n.REPLY}</b></li><li>Follow-ups due: <b>${n.DUE}</b></li>` +
      (n.JOINED ? `<li>Ward offices that have joined (hand their cases over): <b>${n.JOINED}</b> cases</li>` : "") +
      `</ul><p><a href="${origin}/admin-assisted.html">${origin}/admin-assisted.html</a></p><p>For security, the details are shown only after you sign in.</p><hr>` +
      `<p>आगे भेजने के लिए: <b>${n.NEW}</b> · पढ़ने के लिए उत्तर: <b>${n.REPLY}</b> · बाकी फ़ॉलो-अप: <b>${n.DUE}</b></p>`);
    if (ok) sent++;
  }
  return Object.assign({ sent }, n);
}
