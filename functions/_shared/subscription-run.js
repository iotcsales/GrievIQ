/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/subscription-run.js   (grieviq-46)
//
// The hourly job's part for office subscriptions:
//   - Due soon (reminder days before the paid-up date ends): the next bill is
//     made at the published price and waits in Bills for staff to send it;
//     the office is reminded by email.
//   - Pilot ending (14 days before): GrievIQ support is told, so someone can
//     call the office; the first bill is made the same way if a plan is set.
//   - Grace (unpaid after the end date): the office is told.
//   - Paused (unpaid after the grace days): the office and support are told.
// Each notice is sent once per period (office_subscriptions.last_notice).
// Emails carry the office name, dates and amounts only.

import { liveVersion, istToday } from "./site-settings.js";
import { TIER_TABLE, quote, nextRef, periodEnd, billPeople, logBill, hasDraftColumns } from "./billing.js";
import { sendEmailNow } from "./dept-auth.js";
import { subsReady, subSettings, statusOf, officeKey, ensureRow, logSub, addDays } from "./subscriptions.js";

export async function allOffices(env) {
  const list = [];
  for (const tier of ["LOCAL", "MAYOR", "MLA", "MP"]) {
    const t = TIER_TABLE[tier];
    const extra = tier === "LOCAL" ? ", unit_type" : "";
    const { results } = await env.DB.prepare(`SELECT id, name${extra} FROM ${t.table} WHERE ${t.email} IS NOT NULL AND ${t.email} != '' ORDER BY name`).all();
    for (const r of results || []) list.push({ type: "REP", tier, id: r.id, name: r.name, label: tier === "LOCAL" ? (r.unit_type === "URBAN" ? "Corporator" : "Gram Pradhan") : tier === "MAYOR" ? "Mayor" : tier });
  }
  try {
    const { results } = await env.DB.prepare(
      "SELECT d.id, d.name_en FROM dept_offices d JOIN dept_agreements a ON a.office_id = d.id AND a.ended_at IS NULL WHERE d.retired_at IS NULL ORDER BY d.name_en"
    ).all();
    for (const r of results || []) list.push({ type: "DEPT", tier: "", id: r.id, name: r.name_en, label: "Department office" });
  } catch (e) { /* before the department steps */ }
  return list;
}

const escH = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function dmy(s) { try { return new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); } catch (e) { return s; } }

// The next bill for an office, made by the job and waiting to be sent.
async function draftBill(env, o, row, live, from) {
  if (!row.plan_id || !(await hasDraftColumns(env))) return null;
  const plan = live.data.plans.find((p) => p.id === row.plan_id);
  if (!plan) return null;
  const exists = await env.DB.prepare("SELECT ref FROM bills WHERE office_type = ? AND office_id = ? AND period_from = ? AND status != 'CANCELLED'").bind(o.type, o.id, from).first();
  if (exists) return null;
  const last = await env.DB.prepare("SELECT period FROM bills WHERE office_type = ? AND office_id = ? AND status = 'PAID' ORDER BY period_to DESC LIMIT 1").bind(o.type, o.id).first();
  const period = plan.billing === "YEARLY" || (last && last.period === "YEAR") ? "YEAR" : "MONTH";
  const q = quote(live.data, plan, period, istToday());
  if (!q) return null;
  const id = crypto.randomUUID();
  for (let i = 0; i < 3; i++) {
    const ref = await nextRef(env);
    try {
      await env.DB.prepare(
        `INSERT INTO bills (id, ref, office_type, office_tier, office_id, office_name, plan_id, plan_name, period, period_from, period_to, amount, gst_rate, gst, total, offer_id, settings_version, due_on, status, issued_by, issued_at, note, auto, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DUE', 'system', ?, NULL, 1, NULL)`
      ).bind(id, ref, o.type, o.type === "DEPT" ? null : o.tier, o.id, o.name, plan.id, plan.nameEn, period, from, periodEnd(from, period), q.amount, q.gstRate, q.gst, q.total, q.offerId, live.version, from, new Date().toISOString()).run();
      await logBill(env, id, "system", "MADE_AUTOMATICALLY", { ref, from, total: q.total });
      return ref;
    } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
  }
  return null;
}

async function tellOffice(env, origin, o, kind, st) {
  const to = await billPeople(env, { office_type: o.type, office_tier: o.tier, office_id: o.id });
  const where = o.type === "DEPT" ? origin + "/dept" : origin + "/rep";
  const until = st.until ? dmy(st.until) : "";
  const grace = st.graceUntil ? dmy(st.graceUntil) : "";
  const T = {
    DUE: [`GrievIQ: your plan for ${o.name} ends on ${until} · योजना समाप्ति`,
      `<p>Your GrievIQ plan for <b>${escH(o.name)}</b> is paid up to <b>${until}</b>. The next bill will appear in <a href="${escH(where)}">Billing</a> shortly.</p>`,
      `<p><b>${escH(o.name)}</b> की GrievIQ योजना <b>${until}</b> तक है। अगला बिल शीघ्र ही बिलिंग में दिखेगा।</p>`],
    GRACE: [`GrievIQ: please pay for ${o.name} by ${grace} · कृपया भुगतान करें`,
      `<p>Your GrievIQ plan for <b>${escH(o.name)}</b> ended on <b>${until}</b>. Everything keeps working until <b>${grace}</b>; after that your console becomes view only until the bill is paid. Pay in <a href="${escH(where)}">Billing</a>.</p>`,
      `<p><b>${escH(o.name)}</b> की योजना <b>${until}</b> को समाप्त हुई। <b>${grace}</b> तक सब कुछ चलता रहेगा; उसके बाद भुगतान होने तक कंसोल केवल देखने के लिए रहेगा। बिलिंग में भुगतान करें।</p>`],
    PAUSED: [`GrievIQ: ${o.name} is now view only · केवल देखने के लिए`,
      `<p>The GrievIQ plan for <b>${escH(o.name)}</b> is unpaid, so your console is now <b>view only</b>. Citizens' complaints still reach you and move up to the next level on time. Pay in <a href="${escH(where)}">Billing</a> and everything works again at once.</p>`,
      `<p><b>${escH(o.name)}</b> की योजना का भुगतान नहीं हुआ, इसलिए कंसोल अब <b>केवल देखने के लिए</b> है। नागरिकों की शिकायतें आपको मिलती रहेंगी और समय पर अगले स्तर पर जाएँगी। बिलिंग में भुगतान करते ही सब फिर से चालू हो जाएगा।</p>`],
  }[kind];
  const safety = "<p>Pay only to the GrievIQ payment details shown when you sign in. GrievIQ never asks you to pay elsewhere by phone, WhatsApp or email.</p>";
  let n = 0;
  for (const e of to) if (await sendEmailNow(env, e, T[0], T[1] + safety + "<hr>" + T[2])) n++;
  return n;
}

export async function runSubscriptions(env, origin, nowMs) {
  if (!(await subsReady(env))) return { skipped: true };
  const live = await liveVersion(env);
  const cfg = subSettings(live.data);
  const today = istToday(nowMs);
  const support = live.data.company.supportEmail;
  const offices = await allOffices(env);
  const { results: rows } = await env.DB.prepare("SELECT * FROM office_subscriptions").all();
  const byKey = new Map((rows || []).map((r) => [officeKey(r.office_type, r.office_tier, r.office_id), r]));
  const out = { offices: offices.length, notices: 0, bills: 0 };
  for (const o of offices) {
    const k = officeKey(o.type, o.tier, o.id);
    let row = byKey.get(k) || null;
    const st = statusOf(row, cfg, today);
    let kind = null;
    if (st.status === "DUE_SOON") kind = "DUE";
    else if (st.status === "PILOT" && st.pilotEnding) kind = "PILOT";
    else if (st.status === "GRACE") kind = "GRACE";
    else if (st.status === "PAUSED" && !st.byAdmin && st.until) kind = "PAUSED";
    if (!kind) continue;
    const notice = kind + ":" + (st.until || "");
    if (row && row.last_notice === notice) continue;
    row = row || await ensureRow(env, o.type, o.tier, o.id, o.name, "system", cfg);
    if (row.last_notice === notice) continue;
    try {
      if (kind === "DUE" || kind === "PILOT") {
        const ref = await draftBill(env, o, row, live, addDays(st.until, 1));
        if (ref) out.bills++;
      }
      if (kind === "PILOT") {
        await sendEmailNow(env, support, `GrievIQ: pilot for ${o.name} ends on ${dmy(st.until)}`,
          `<p>The free pilot for <b>${escH(o.name)}</b> ends on <b>${dmy(st.until)}</b>. Please call the office about a paid plan${row.plan_id ? "; the first bill is waiting in Bills" : ", and set its plan in Subscriptions"}.</p>`);
      } else {
        await tellOffice(env, origin, o, kind, st);
        if (kind === "PAUSED") await sendEmailNow(env, support, `GrievIQ: ${o.name} is now view only (unpaid)`, `<p><b>${escH(o.name)}</b> is unpaid after the grace period and is now view only.</p>`);
      }
      await env.DB.prepare("UPDATE office_subscriptions SET last_notice = ? WHERE office_type = ? AND office_tier = ? AND office_id = ?").bind(notice, o.type, o.tier || "", o.id).run();
      await logSub(env, k, "system", "NOTICE_" + kind, { until: st.until || null });
      out.notices++;
    } catch (e) { out.errors = (out.errors || 0) + 1; }
  }
  return out;
}
