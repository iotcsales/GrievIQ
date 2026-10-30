/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/sales.js (grieviq-77): the sales pipeline.
//
// A lead is one office GrievIQ is talking to: from a pilot request (copied
// over once, here) or added by sales staff. Stages NEW → CONTACTED → DEMO →
// QUOTED → WON or LOST (with a reason). There is no field for a political
// party, caste or religion, and notes must not record them.
// Who sees what:
//   - sales manager, super admin, operations admin (manage_sales): every lead;
//     they give leads to sales staff and set each person's states.
//   - sales executive (work_sales only): their own leads, and leads nobody
//     has yet in the states they cover (they can take one).
//   - auditor: every lead, read only, mobile and email partly hidden.
//   - management viewer: totals only.
// Contact details stay while a lead is open and for 2 years after it
// closes; then they and the notes are removed (the totals stay).
// Hourly (worker): pilot requests copied, old contacts removed, and at
// 9 am India time each sales person with follow-ups due gets one email with
// the count only (content-free, like every staff email).

import { GST_STATES } from "./tax-docs.js";
import { allows, SALES_ROLES } from "./get-verified-admin.js";

export const STAGES = ["NEW", "CONTACTED", "DEMO", "QUOTED", "WON", "LOST"];
export const OPEN_STAGES = ["NEW", "CONTACTED", "DEMO", "QUOTED"];
export const LOST_REASONS = ["PRICE", "NO_BUDGET", "NOT_INTERESTED", "OTHER_PRODUCT", "NO_REPLY", "ELECTION", "NOT_ELIGIBLE", "OTHER"];
export const OFFICE_KINDS = ["PRADHAN", "COUNCILLOR", "MAYOR", "MLA", "MP", "DEPARTMENT", "DISTRICT", "STATE", "NATIONAL", "OTHER"];
export const ACTIVITY = ["CALL", "MEETING", "EMAIL", "DEMO", "NOTE"];
export const KEEP_DAYS = 730;          // contacts kept 2 years after a lead closes
export const DIGEST_HOUR_IST = 9;

const OFFICE_EN = { PRADHAN: "Gram Pradhan", COUNCILLOR: "Ward Councillor", MAYOR: "Mayor", MLA: "MLA", MP: "MP", DEPARTMENT: "Government department", DISTRICT: "District administration", STATE: "State Government", NATIONAL: "Government of India", OTHER: "Office" };

export function indianMobile(v) {
  const d = String(v || "").replace(/[\s\-()]/g, "").replace(/^(\+91|0091|91(?=\d{10}$)|0(?=\d{10}$))/, "");
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
export const maskMobile = (m) => m ? m.slice(0, 2) + "XXXXXX" + m.slice(-2) : "";
export const maskEmail = (e) => { if (!e) return ""; const [u, d] = String(e).split("@"); return (u || "").slice(0, 1) + "***@" + (d || ""); };
export const stateName = (c) => GST_STATES[c] || "";
export const istToday = (ms) => new Date((ms || Date.now()) + 5.5 * 3600000).toISOString().slice(0, 10);
export function addDays(day, n) { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export async function salesReady(env) {
  try { await env.DB.prepare("SELECT id FROM sales_leads LIMIT 1").first(); return true; } catch (e) { return false; }
}
export async function logLead(env, leadId, by, kind, extra) {
  const x = extra || {};
  await env.DB.prepare("INSERT INTO sales_lead_events (id, lead_id, at, by_email, kind, stage_from, stage_to, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), leadId, x.at || new Date().toISOString(), by, kind, x.from || null, x.to || null, x.note || null).run();
}
async function nextLeadRef(env) {
  const r = await env.DB.prepare("SELECT MAX(CAST(substr(ref, 7) AS INTEGER)) AS n FROM sales_leads").first();
  return "GIQ-L-" + String(((r && r.n) || 0) + 1).padStart(6, "0");
}
// Inserts a lead with the next free number (tries again if two are made at once).
export async function insertLead(env, v) {
  const id = crypto.randomUUID(), now = v.at || new Date().toISOString();
  for (let i = 0; i < 4; i++) {
    const ref = await nextLeadRef(env);
    try {
      await env.DB.prepare(
        `INSERT INTO sales_leads (id, ref, source, pilot_request_id, office_kind, office_name, place, state_code, contact_name, designation, mobile, email, stage, owner_email, next_date, next_step, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?)`
      ).bind(id, ref, v.source, v.pilotId || null, v.kind, v.officeName, v.place || null, v.state || null, v.contactName || null, v.designation || null, v.mobile || null, v.email || null,
        v.owner || null, v.nextDate || null, v.nextStep || null, v.by, now, now).run();
      await logLead(env, id, v.by, "CREATED", { to: "NEW", at: now });
      return { id, ref };
    } catch (e) {
      if (/UNIQUE/i.test(String(e && e.message)) && /pilot_request_id/i.test(String(e && e.message))) return null;
      if (!/UNIQUE/i.test(String(e && e.message))) throw e;
    }
  }
  return null;
}

// Pilot requests not yet in the pipeline become NEW leads with nobody yet
// (the sales manager gives them out). The request itself is not changed.
export async function importPilotRequests(env) {
  let n = 0;
  try {
    const { results } = await env.DB.prepare(
      `SELECT p.* FROM pilot_requests p WHERE NOT EXISTS (SELECT 1 FROM sales_leads l WHERE l.pilot_request_id = p.id) ORDER BY p.created_at LIMIT 50`
    ).all();
    for (const p of results || []) {
      const kind = OFFICE_KINDS.includes(p.office_kind) ? p.office_kind : "OTHER";
      const made = await insertLead(env, { source: "PILOT", pilotId: p.id, kind, officeName: (OFFICE_EN[kind] + ", " + String(p.place || "")).slice(0, 160), place: p.place,
        contactName: p.name, mobile: p.mobile, email: p.email, by: "system", at: p.created_at });
      if (made) n++;
    }
  } catch (e) { if (!/no such table/i.test(String(e && e.message))) throw e; }
  return n;
}

// 2 years after a lead closed: contact details and notes removed.
export async function eraseOldContacts(env, nowMs) {
  const cutoff = new Date((nowMs || Date.now()) - KEEP_DAYS * 86400000).toISOString();
  const { results } = await env.DB.prepare("SELECT id FROM sales_leads WHERE closed_at IS NOT NULL AND closed_at < ? AND erased_at IS NULL LIMIT 200").bind(cutoff).all();
  const now = new Date().toISOString();
  for (const r of results || []) {
    await env.DB.prepare("UPDATE sales_leads SET contact_name = NULL, designation = NULL, mobile = NULL, email = NULL, next_step = NULL, erased_at = ? WHERE id = ?").bind(now, r.id).run();
    await env.DB.prepare("UPDATE sales_lead_events SET note = NULL WHERE lead_id = ?").bind(r.id).run();
    await logLead(env, r.id, "system", "ERASED");
  }
  return (results || []).length;
}

// The states a person covers.
export async function statesOf(env, email) {
  const { results } = await env.DB.prepare("SELECT state_code FROM sales_territories WHERE email = ? ORDER BY state_code").bind(String(email).toLowerCase()).all();
  return (results || []).map((r) => r.state_code);
}
// What a signed-in person may do with a lead.
export function leadAccess(auth, lead, myStates) {
  const manage = allows(auth, "manage_sales"), work = allows(auth, "work_sales");
  const mine = !!lead.owner_email && lead.owner_email === auth.email;
  const free = !lead.owner_email && !!lead.state_code && (myStates || []).includes(lead.state_code);
  if (manage) return { see: true, edit: true, take: !lead.owner_email && work, mine };
  if (work) return { see: mine || free, edit: mine, take: free, mine };
  return { see: allows(auth, "view_sales") && auth.role === "auditor", edit: false, take: false, mine: false };
}
// People a lead can be given to: sales staff still working here.
export async function salesPeople(env) {
  const { results } = await env.DB.prepare(
    `SELECT LOWER(email) AS email, name, employee_id, role FROM admin_users WHERE role IN (${SALES_ROLES.map(() => "?").join(",")}) AND COALESCE(status, 'PRESENT') <> 'LEFT' ORDER BY name, email`
  ).bind(...SALES_ROLES).all();
  return (results || []).map((r) => ({ email: r.email, name: r.name || r.email, employeeId: r.employee_id || null, role: r.role }));
}

export function leadOut(l, opts) {
  const o = opts || {};
  const hide = !!o.mask;
  const today = o.today || istToday();
  const open = OPEN_STAGES.includes(l.stage);
  return {
    id: l.id, ref: l.ref, source: l.source, officeKind: l.office_kind, officeName: l.office_name, place: l.place || "",
    state: l.state_code || null, stateName: stateName(l.state_code),
    contactName: l.contact_name || "", designation: l.designation || "",
    mobile: hide ? maskMobile(l.mobile) : (l.mobile || ""), email: hide ? maskEmail(l.email) : (l.email || ""),
    stage: l.stage, lostReason: l.lost_reason || null, owner: l.owner_email || null,
    nextDate: l.next_date || null, nextStep: l.next_step || "", due: open && !!l.next_date && l.next_date <= today, overdue: open && !!l.next_date && l.next_date < today,
    quotationId: l.quotation_id || null, createdAt: l.created_at, createdBy: l.created_by, updatedAt: l.updated_at, closedAt: l.closed_at || null, erased: !!l.erased_at,
    access: o.access || null,
  };
}

// Counts for the Totals tab (and the management view). No names.
export async function salesTotals(env, today) {
  const month = today.slice(0, 7), fyStart = (today.slice(5, 7) >= "04" ? today.slice(0, 4) : String(+today.slice(0, 4) - 1)) + "-04-01";
  const stages = {};
  for (const s of STAGES) stages[s] = 0;
  const { results: st } = await env.DB.prepare("SELECT stage, COUNT(*) AS n FROM sales_leads GROUP BY stage").all();
  for (const r of st || []) stages[r.stage] = r.n;
  const one = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).first()) || {}).n || 0;
  const monthStart = month + "-01T00:00:00";
  const newMonth = await one("SELECT COUNT(*) AS n FROM sales_leads WHERE created_at >= ?", monthStart);
  const wonMonth = await one("SELECT COUNT(*) AS n FROM sales_leads WHERE stage = 'WON' AND closed_at >= ?", monthStart);
  const lostMonth = await one("SELECT COUNT(*) AS n FROM sales_leads WHERE stage = 'LOST' AND closed_at >= ?", monthStart);
  const overdue = await one("SELECT COUNT(*) AS n FROM sales_leads WHERE closed_at IS NULL AND next_date < ?", today);
  const noOwner = await one("SELECT COUNT(*) AS n FROM sales_leads WHERE closed_at IS NULL AND owner_email IS NULL");
  const { results: lr } = await env.DB.prepare("SELECT lost_reason AS r, COUNT(*) AS n FROM sales_leads WHERE stage = 'LOST' AND closed_at >= ? GROUP BY lost_reason").bind(fyStart + "T00:00:00").all();
  const lost = {}; for (const r of lr || []) lost[r.r || "OTHER"] = r.n;
  const { results: kr } = await env.DB.prepare("SELECT office_kind AS k, COUNT(*) AS n FROM sales_leads WHERE closed_at IS NULL GROUP BY office_kind").all();
  const kinds = {}; for (const r of kr || []) kinds[r.k] = r.n;
  return { month, fyStart, stages, newMonth, wonMonth, lostMonth, overdue, noOwner, lostReasons: lost, openByKind: kinds };
}

// Hourly, from the worker.
export async function runSales(env, origin, nowMs, sendEmail) {
  if (!(await salesReady(env))) return { ready: false };
  const out = { imported: 0, erased: 0, digests: 0 };
  out.imported = await importPilotRequests(env);
  out.erased = await eraseOldContacts(env, nowMs);
  const ms = nowMs || Date.now();
  const istHour = new Date(ms + 5.5 * 3600000).getUTCHours();
  const today = istToday(ms);
  if (istHour >= DIGEST_HOUR_IST && sendEmail) {
    const last = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = 'sales_digest_day'").first().catch(() => null);
    if (!last || last.value !== today) {
      await env.DB.prepare("INSERT INTO admin_settings (key, value, updated_at, updated_by) VALUES ('sales_digest_day', ?, ?, 'system') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
        .bind(today, new Date().toISOString()).run();
      const { results } = await env.DB.prepare(
        `SELECT l.owner_email AS email, COUNT(*) AS n, a.name AS name FROM sales_leads l JOIN admin_users a ON LOWER(a.email) = l.owner_email
         WHERE l.closed_at IS NULL AND l.next_date IS NOT NULL AND l.next_date <= ? AND COALESCE(a.status, 'PRESENT') <> 'LEFT' GROUP BY l.owner_email`
      ).bind(today).all();
      for (const r of results || []) {
        const ok = await sendEmail(env, r.email, `GrievIQ: ${r.n} sales follow-up${r.n === 1 ? "" : "s"} due today · आज ${r.n} फ़ॉलो-अप`,
          `<p>Good morning${r.name ? " " + String(r.name).replace(/[&<>"']/g, "") : ""},</p><p>You have <b>${r.n}</b> sales follow-up${r.n === 1 ? "" : "s"} due today or overdue. Sign in to see them:</p>` +
          `<p><a href="${origin}/admin-sales.html">${origin}/admin-sales.html</a></p><p>For security, the details are shown only after you sign in.</p><hr><p>आज या उससे पहले के <b>${r.n}</b> फ़ॉलो-अप बाकी हैं। देखने के लिए साइन इन करें।</p>`);
        if (ok) out.digests++;
      }
    }
  }
  return out;
}
