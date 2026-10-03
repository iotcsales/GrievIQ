// functions/_shared/audit-office.js
//
// Item 9c: audit observations addressed to a representative's office, and
// the owner's side of an observation (reply, report done, comment), shared
// by the staff panel (/api/admin/observations) and the representatives'
// console (/api/observations), so both follow exactly the same rules.
//
// An observation owned by an office belongs to the OFFICE (owner_office =
// "TIER:id"), not to the person: when the representative changes, the new
// one inherits it. In the office, the representative and the office
// managers may see and answer it (least privilege: field workers and office
// assistants don't see audit findings).

import { parseOfficeKey, ROLE } from "./team.js";
import { isDay, todayIst, logObservation } from "./audit.js";

const TIER_ORDER = { MP: 0, MLA: 1, MAYOR: 2, LOCAL: 3 };
const OFFICE_SQL = {
  MP: "SELECT id, name, mp_name AS person, mp_email AS email, NULL AS unit_type FROM mp_constituencies",
  MLA: "SELECT id, name, mla_name AS person, mla_email AS email, NULL AS unit_type FROM mla_constituencies",
  MAYOR: "SELECT id, name, mayor_name AS person, mayor_email AS email, NULL AS unit_type FROM municipal_bodies WHERE has_mayor = 1",
  LOCAL: "SELECT id, name, rep_name AS person, rep_email AS email, unit_type FROM local_units",
};

export const OFFICE_ROLES = [ROLE.REP, ROLE.OM];   // who in an office sees and answers

function titleOf(tier, unitType) {
  if (tier === "LOCAL") return unitType === "RURAL" ? "Gram Pradhan" : "Corporator";
  return tier === "MAYOR" ? "Mayor" : tier;
}
function shapeOffice(tier, r) {
  return { key: tier + ":" + r.id, tier, id: r.id, title: titleOf(tier, r.unit_type), name: r.name,
    person: r.person ? String(r.person).trim() || null : null, hasEmail: !!String(r.email || "").trim() };
}
export function officeText(o) {
  if (!o) return "";
  return o.title + " – " + o.name + (o.person ? " (" + o.person + ")" : "");
}

// Every office an observation can be addressed to (for the auditor's list).
export async function officeOptions(env) {
  const out = [];
  for (const tier of Object.keys(OFFICE_SQL)) {
    try {
      const { results } = await env.DB.prepare(OFFICE_SQL[tier] + (tier === "MAYOR" ? " ORDER BY name" : " ORDER BY name")).all();
      for (const r of results || []) out.push(shapeOffice(tier, r));
    } catch (e) { /* a table missing in an old database */ }
  }
  return out.sort((a, b) => (TIER_ORDER[a.tier] - TIER_ORDER[b.tier]) || String(a.name).localeCompare(String(b.name)));
}

export async function officeByKey(env, key) {
  const k = parseOfficeKey(key);
  if (!k || !OFFICE_SQL[k.tier]) return null;
  const sql = OFFICE_SQL[k.tier] + (k.tier === "MAYOR" ? " AND id = ?" : " WHERE id = ?");
  const r = await env.DB.prepare(sql).bind(k.id).first();
  return r ? Object.assign(shapeOffice(k.tier, r), { email: String(r.email || "").trim().toLowerCase() || null }) : null;
}

// Labels for the owners of a list of shaped observations (adds ownerLabel
// and ownerOfficeInfo). Staff owners keep their email.
export async function addOwnerLabels(env, list) {
  const keys = Array.from(new Set(list.filter((o) => o.ownerType === "OFFICE" && o.ownerOffice).map((o) => o.ownerOffice)));
  const map = new Map();
  for (const k of keys) map.set(k, await officeByKey(env, k));
  const staff = new Map();
  const emails = Array.from(new Set(list.filter((o) => o.ownerType !== "OFFICE" && o.ownerEmail).map((o) => String(o.ownerEmail).toLowerCase())));
  if (emails.length) {
    try {
      const { results } = await env.DB.prepare("SELECT email, name, employee_id FROM admin_users WHERE LOWER(email) IN (SELECT value FROM json_each(?))").bind(JSON.stringify(emails)).all();
      for (const r of results || []) staff.set(String(r.email).toLowerCase(), r);
    } catch (e) {
      try {
        const { results } = await env.DB.prepare("SELECT email, name FROM admin_users WHERE LOWER(email) IN (SELECT value FROM json_each(?))").bind(JSON.stringify(emails)).all();
        for (const r of results || []) staff.set(String(r.email).toLowerCase(), r);
      } catch (e2) { /* names are optional */ }
    }
    // Item 10b: an owner who has since changed email shows under their name
    // and current email.
    const missing = emails.filter((e) => !staff.has(e));
    if (missing.length) {
      try {
        const { results } = await env.DB.prepare("SELECT h.old_email, a.email, a.name, a.employee_id FROM staff_email_history h JOIN admin_users a ON a.id = h.admin_id WHERE h.old_email IN (SELECT value FROM json_each(?))").bind(JSON.stringify(missing)).all();
        for (const r of results || []) staff.set(String(r.old_email).toLowerCase(), { email: r.email, name: r.name, employee_id: r.employee_id, moved: true });
      } catch (e) { /* item 10b table not there yet */ }
    }
  }
  for (const o of list) {
    if (o.ownerType === "OFFICE") {
      const info = map.get(o.ownerOffice) || null;
      o.ownerOfficeInfo = info ? { key: info.key, tier: info.tier, title: info.title, name: info.name, person: info.person, hasEmail: info.hasEmail } : null;
      o.ownerLabel = info ? officeText(info) : (o.ownerOffice || "");
    } else {
      const n = staff.get(String(o.ownerEmail || "").toLowerCase());
      // Item 10: "Rahul Verma (GIQ-014) — rahul@grieviq.in" when the name is known.
      const shown = n && n.moved ? n.email : o.ownerEmail;
      o.ownerLabel = n && n.name ? n.name + (n.employee_id ? " (" + n.employee_id + ")" : "") + " — " + shown : (n && n.moved ? shown : (o.ownerEmail || ""));
    }
  }
  return list;
}

// Who receives the office's emails: its current representative and its
// active office managers (confirmed by that representative, as in 8b).
export async function officeRecipients(env, key) {
  const office = await officeByKey(env, key);
  if (!office) return [];
  const out = new Set();
  if (office.email) out.add(office.email);
  try {
    const { results } = await env.DB.prepare(
      "SELECT member_email, confirmed_by_rep_email FROM office_team WHERE office_tier = ? AND office_id = ? AND status = 'ACTIVE' AND role = ?"
    ).bind(office.tier, office.id, ROLE.OM).all();
    for (const r of results || []) {
      if (office.email && String(r.confirmed_by_rep_email || "").toLowerCase() === office.email) out.add(String(r.member_email).toLowerCase());
    }
  } catch (e) { /* team table missing */ }
  return Array.from(out);
}

// The offices where this signed-in person may see and answer observations.
export function answerableOffices(auth) {
  return (auth.mandates || []).filter((m) => OFFICE_ROLES.includes(m.role || ROLE.REP)).map((m) => ({ key: m.tier + ":" + m.id, mandate: m }));
}

// Item 10c: emails greet the person by name (and staff ID) so a fake email
// is easier to spot (UK Government Service Manual), and end with a line on
// what GrievIQ never asks for.
export const SAFETY_LINE = "GrievIQ will never ask for your sign-in code by email or phone.";
export async function recipientName(env, email) {
  const e = String(email || "").toLowerCase();
  const tries = [
    ["SELECT name, employee_id FROM admin_users WHERE LOWER(email) = ? AND COALESCE(status, 'PRESENT') <> 'LEFT'", (r) => r.name ? { name: r.name, id: r.employee_id || null } : null],
    ["SELECT member_name AS name FROM office_team WHERE LOWER(member_email) = ? AND status = 'ACTIVE' LIMIT 1", (r) => r.name ? { name: r.name, id: null } : null],
    ["SELECT mla_name AS name FROM mla_constituencies WHERE LOWER(mla_email) = ? LIMIT 1", (r) => r.name ? { name: r.name, id: null } : null],
    ["SELECT mp_name AS name FROM mp_constituencies WHERE LOWER(mp_email) = ? LIMIT 1", (r) => r.name ? { name: r.name, id: null } : null],
    ["SELECT rep_name AS name FROM local_units WHERE LOWER(rep_email) = ? LIMIT 1", (r) => r.name ? { name: r.name, id: null } : null],
  ];
  for (const [sql, pick] of tries) {
    try { const r = await env.DB.prepare(sql).bind(e).first(); const v = r && pick(r); if (v) return v; } catch (err) { /* table or column missing */ }
  }
  return null;
}
export function greetingHtml(who) {
  return "<p>Dear " + escHtml(who ? who.name + (who.id ? " (" + who.id + ")" : "") : "colleague") + ",</p>";
}
export function closingHtml(url) {
  return `<p>Sign in to GrievIQ to read it: <a href="${url}">${url}</a></p>` +
    "<p>For security, the details are shown only after you sign in. " + SAFETY_LINE + "</p>";
}

function escHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// Emails about an observation. `link` is the page to open ("staff" = the
// audit page, "office" = the rep console).
export async function notifyAudit(env, request, toList, subject, lines, obsId, link) {
  const to = Array.from(new Set((toList || []).filter(Boolean).map((x) => String(x).toLowerCase())));
  if (!env.RESEND_API_KEY || !to.length) return false;
  const origin = new URL(request.url).origin;
  const url = link === "office" ? origin + "/rep.html#audit=" + encodeURIComponent(obsId) : origin + "/admin-audit.html#obs=" + encodeURIComponent(obsId);
  let any = false;
  for (const addr of to) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.OTP_FROM_EMAIL || "onboarding@resend.dev", to: [addr], subject: "GrievIQ audit: " + subject,
          // Content-free on purpose: only the reference and what happened.
          // Titles, ratings and notes are shown after signing in, never by email.
          html: greetingHtml(await recipientName(env, addr)) + lines.map((l) => "<p>" + escHtml(l) + "</p>").join("") + closingHtml(url),
        }),
      });
      if (res.ok) any = true;
    } catch (e) { /* email never blocks the action */ }
  }
  return any;
}

// The owner's actions, for staff owners and office owners alike.
//   ctx: { env, request, o, body, actor, actorRole, who, json, log }
//   who: how the auditor's email names the person ("a@b.in", or
//        "a@b.in (Office manager, MLA – Lucknow Central)")
// Returns a Response, or null for an action that isn't an owner action.
export async function ownerAction(action, ctx) {
  const { env, request, o, body, json, log, who } = ctx;
  const now = new Date().toISOString();
  const today = todayIst();
  const note = (k, lo, hi) => { const t = String(body[k] || "").trim(); return t.length >= lo && t.length <= hi ? t : null; };
  const stale = () => json({ error: "This observation has changed. Refresh the page.", code: "STALE" }, 409);
  const setStatus = async (sql, ...binds) => {
    const r = await env.DB.prepare(sql).bind(...binds).run();
    return !(r && r.meta && r.meta.changes === 0);
  };
  const auditorEmail = o.issued_by || o.created_by;

  if (action === "respond") {
    const text = note("text", 10, 4000);
    const plan = note("actionPlan", 0, 4000) || "";
    const target = String(body.targetDate || "");
    const agree = body.agree === true ? 1 : body.agree === false ? 0 : null;
    const fields = {};
    if (agree == null) fields.agree = "REQUIRED";
    if (!text) fields.text = "LENGTH";
    if (agree === 1) {
      if (plan.length < 10) fields.actionPlan = "LENGTH";
      if (!isDay(target)) fields.targetDate = "DATE"; else if (target < today) fields.targetDate = "PAST";
    }
    if (Object.keys(fields).length) return json({ error: "Please correct the highlighted fields.", fields }, 400);
    if (!(await setStatus(
      "UPDATE observations SET status = 'RESPONDED', response_agree = ?, response_text = ?, action_plan = ?, target_date = ?, updated_at = ? WHERE id = ? AND status IN ('ISSUED', 'RESPONDED')",
      agree, text, agree === 1 ? plan : null, agree === 1 ? target : null, now, o.id))) return stale();
    await log("RESPONDED", text, { agree: agree === 1, actionPlan: agree === 1 ? plan : null, targetDate: agree === 1 ? target : null });
    await notifyAudit(env, request, [auditorEmail], `${o.ref} — reply received`, [`${who} has replied to audit observation ${o.ref}.`], o.id, "staff");
    return json({ ok: true });
  }

  if (action === "report_done") {
    const evidence = note("evidence", 10, 4000);
    if (!evidence) return json({ error: "Describe what was done and where the evidence can be seen.", fields: { evidence: "LENGTH" } }, 400);
    if (o.response_agree !== 1) return json({ error: "Agree and give an action plan first.", code: "NO_PLAN" }, 409);
    if (!(await setStatus("UPDATE observations SET status = 'DONE_REPORTED', done_evidence = ?, updated_at = ? WHERE id = ? AND status = 'RESPONDED'", evidence, now, o.id))) return stale();
    await log("DONE_REPORTED", evidence, null);
    await notifyAudit(env, request, [auditorEmail], `${o.ref} — ready for verification`, [`${who} reports that the action for audit observation ${o.ref} is done. Please verify it.`], o.id, "staff");
    return json({ ok: true });
  }

  if (action === "comment") {
    const text = note("text", 2, 2000);
    if (!text) return json({ error: "Write a comment (up to 2,000 characters).", fields: { text: "LENGTH" } }, 400);
    await log("COMMENT", text, null);
    return json({ ok: true });
  }
  return null;
}

export { logObservation };
