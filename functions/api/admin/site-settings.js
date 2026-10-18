/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/site-settings.js
//
// Admin "Prices & site details" (grieviq-39).
//
// GET  (view_site_settings, every admin role): what is live, the version
//      history and, for the super admin, the unpublished draft.
//        ?version=N      one earlier published version (to look at it)
//        ?preview=draft  the draft worked out the way the public page
//                        shows it (super admin; used by the preview)
// POST (manage_site_settings, super admin only), { action, ... }:
//   save_draft { data }   checked; saved as the draft (nothing public changes)
//   discard_draft
//   publish { note? }     the draft becomes the new live version
//   restore { version }   an earlier version becomes the new live version
//   cancel_payment_change the payment details waiting for their 24 hours
//                         are dropped (grieviq-41)
// Payment details (grieviq-41): new or changed details go live 24 hours
// after publishing (settlePayments); every super admin is emailed about any
// change. Other admin roles see bank account numbers partly hidden.
// Every action is written to the admin log; publishing and restoring
// record each changed value (before and after).

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { withDefaults, cleanSettings, liveVersion, draftRow, settingsReady, publicView, diffSettings, istToday,
  paymentState, forCompare, editablePayments, settlePayments, maskPayments, payLine, PAY_DELAY_HOURS } from "../../_shared/site-settings.js";
import { sendEmailNow } from "../../_shared/dept-auth.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

// Payment details changes in the log: account numbers partly hidden.
function logChanges(a, b) { return diffSettings(maskPayments(forCompare(a)), maskPayments(forCompare(b))); }

function istTime(iso) {
  try { return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return iso; }
}
const escH = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Every super admin hears about every change to payment details.
async function payAlert(env, request, actor, kind, payments) {
  let to = [];
  try {
    const { results } = await env.DB.prepare("SELECT email FROM admin_users WHERE role = 'super_admin' AND left_at IS NULL").all();
    to = (results || []).map((r) => r.email);
  } catch (e) { return 0; }
  const link = new URL(request.url).origin + "/admin-site-settings.html#payments";
  const list = (kind === "LATER" ? payments.pending.methods : payments.methods).filter((m) => m.shown);
  const lines = list.length ? "<ul>" + list.map((m) => "<li>" + escH(payLine(m)) + "</li>").join("") + "</ul>" : "<p>(none shown)</p>";
  const when = kind === "LATER" ? istTime(payments.pending.activeFrom) : "";
  const en = kind === "LATER"
    ? `<p>${escH(actor)} changed the payment details offices are asked to pay to. The new details go live on <b>${escH(when)}</b> (IST), ${PAY_DELAY_HOURS} hours from now. Until then offices see the current details.</p><p>New details:</p>${lines}<p><b>If you did not expect this, cancel it now:</b> <a href="${escH(link)}">Prices &amp; site details → Payment details</a>.</p>`
    : kind === "CANCELLED"
    ? `<p>${escH(actor)} cancelled the payment details change that was waiting. Offices keep seeing the current details:</p>${lines}`
    : `<p>${escH(actor)} took down payment details. Offices now see only:</p>${lines}<p><a href="${escH(link)}">Prices &amp; site details → Payment details</a></p>`;
  const hi = kind === "LATER"
    ? `<p>${escH(actor)} ने कार्यालयों के भुगतान का विवरण बदला है। नया विवरण <b>${escH(when)}</b> (IST) को, अभी से ${PAY_DELAY_HOURS} घंटे बाद, लागू होगा। तब तक कार्यालयों को मौजूदा विवरण दिखेगा।</p><p><b>यदि आपको इसकी अपेक्षा नहीं थी, तो इसे अभी रद्द करें:</b> <a href="${escH(link)}">शुल्क और साइट विवरण → भुगतान विवरण</a>।</p>`
    : kind === "CANCELLED"
    ? `<p>${escH(actor)} ने प्रतीक्षा में रखा भुगतान विवरण का बदलाव रद्द किया। कार्यालयों को मौजूदा विवरण ही दिखेगा।</p>`
    : `<p>${escH(actor)} ने भुगतान विवरण हटाया/छिपाया। कार्यालयों को अब केवल ऊपर दिया विवरण दिखेगा।</p>`;
  const subject = kind === "LATER" ? "GrievIQ: payment details changed, live in 24 hours · भुगतान विवरण बदला" : kind === "CANCELLED" ? "GrievIQ: payment details change cancelled · भुगतान विवरण का बदलाव रद्द" : "GrievIQ: payment details taken down · भुगतान विवरण हटाया गया";
  let n = 0;
  for (const e of to) { if (await sendEmailNow(env, e, subject, en + "<hr>" + hi + '<p style="color:#555;font-size:13px">GrievIQ never puts passwords or sign-in codes in emails.</p>')) n++; }
  return n;
}

async function logEvent(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_site_settings");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  const canEdit = allows(auth, "manage_site_settings");
  const ready = await settingsReady(env);
  const live = await liveVersion(env);

  if (url.searchParams.get("preview") === "draft") {
    if (!canEdit) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const d = await draftRow(env);
    const s = d ? d.data : live.data;
    const pv = publicView(s, { version: live.version, publishedAt: d ? d.updatedAt : live.publishedAt }, url.searchParams.get("on") && /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("on")) ? url.searchParams.get("on") : istToday());
    pv.preview = true;
    return json(pv);
  }
  const v = url.searchParams.get("version");
  if (v != null) {
    if (!ready) return json({ error: "NOT_READY" }, 409);
    const r = await env.DB.prepare("SELECT version, data, created_at, created_by, note, restored_from FROM site_settings_versions WHERE version = ?").bind(Number(v) || 0).first();
    if (!r) return json({ error: "NOT_FOUND" }, 404);
    const vd = forCompare(withDefaults(JSON.parse(r.data)));
    return json({ version: r.version, data: canEdit ? vd : maskPayments(vd), createdAt: r.created_at, createdBy: r.created_by, note: r.note, restoredFrom: r.restored_from });
  }

  let history = [];
  if (ready) {
    const { results } = await env.DB.prepare("SELECT version, created_at, created_by, note, restored_from FROM site_settings_versions ORDER BY version DESC LIMIT 100").all();
    history = (results || []).map((r) => ({ version: r.version, createdAt: r.created_at, createdBy: r.created_by, note: r.note || "", restoredFrom: r.restored_from }));
  }
  const draft = canEdit ? await draftRow(env) : null;
  const ps = paymentState(live.data);
  const liveData = forCompare(live.data);
  return json({
    canEdit, ready, today: istToday(),
    live: { version: live.version, data: canEdit ? liveData : maskPayments(liveData), publishedAt: live.publishedAt, publishedBy: live.publishedBy },
    payState: {
      current: canEdit ? ps.current : maskPayments({ payments: { methods: ps.current } }).payments.methods,
      pending: ps.pending ? { activeFrom: ps.pending.activeFrom, by: ps.pending.by, at: ps.pending.at, count: (ps.pending.methods || []).filter((m) => m.shown).length } : null,
      delayHours: PAY_DELAY_HOURS,
    },
    draft: draft ? { data: draft.data, baseVersion: draft.baseVersion, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy, changes: diffSettings(liveData, forCompare(draft.data)).length } : null,
    history,
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_site_settings");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  if (!(await settingsReady(env))) return json({ error: "NOT_READY" }, 409);
  const now = new Date().toISOString();
  const live = await liveVersion(env);

  if (b.action === "save_draft") {
    const { data, fields } = cleanSettings(b.data);
    if (Object.keys(fields).length) return json({ error: "CHECK_FIELDS", fields }, 400);
    const changes = diffSettings(forCompare(live.data), forCompare(data));
    const before = await draftRow(env);
    await env.DB.prepare(
      "INSERT INTO site_settings_draft (id, data, base_version, updated_at, updated_by) VALUES ('draft', ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET data = excluded.data, base_version = excluded.base_version, updated_at = excluded.updated_at, updated_by = excluded.updated_by"
    ).bind(JSON.stringify(data), before ? before.baseVersion : live.version, now, auth.email).run();
    await logEvent(env, auth.email, "site_settings_draft_saved", "draft", { changesFromLive: changes.length });
    return json({ ok: true, changes: changes.length, data, updatedAt: now });
  }

  if (b.action === "discard_draft") {
    const d = await draftRow(env);
    if (!d) return json({ ok: true, unchanged: true });
    await env.DB.prepare("DELETE FROM site_settings_draft WHERE id = 'draft'").run();
    await logEvent(env, auth.email, "site_settings_draft_discarded", "draft", null);
    return json({ ok: true });
  }

  if (b.action === "publish") {
    const d = await draftRow(env);
    if (!d) return json({ error: "NO_DRAFT" }, 409);
    const { data, fields } = cleanSettings(d.data);
    if (Object.keys(fields).length) return json({ error: "CHECK_FIELDS", fields }, 400);
    const settled = settlePayments(live.data, data.payments.methods, Date.parse(now), auth.email);
    data.payments = settled.payments;
    const changes = logChanges(live.data, data);
    if (!changes.length && settled.kind !== "CANCELLED") return json({ error: "NO_CHANGES" }, 409);
    const note = String(b.note || "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
    const version = live.version + 1;
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO site_settings_versions (version, data, created_at, created_by, note, restored_from) VALUES (?, ?, ?, ?, ?, NULL)").bind(version, JSON.stringify(data), now, auth.email, note),
        env.DB.prepare("DELETE FROM site_settings_draft WHERE id = 'draft'"),
      ]);
    } catch (e) { return json({ error: "CONFLICT" }, 409); }
    await logEvent(env, auth.email, "site_settings_published", "v" + version, { version, note, payments: settled.kind, changes: changes.slice(0, 150), more: Math.max(0, changes.length - 150) });
    const alerted = ["LATER", "NOW", "CANCELLED"].includes(settled.kind) ? await payAlert(env, request, auth.email, settled.kind, settled.payments) : 0;
    return json({ ok: true, version, changes: changes.length, payments: settled.kind, payActiveFrom: settled.kind === "LATER" ? settled.payments.pending.activeFrom : null, alerted });
  }

  if (b.action === "restore") {
    const n = Number(b.version);
    const r = Number.isInteger(n) && n > 0 ? await env.DB.prepare("SELECT version, data FROM site_settings_versions WHERE version = ?").bind(n).first() : null;
    if (!r) return json({ error: "NOT_FOUND" }, 404);
    if (n === live.version) return json({ error: "ALREADY_LIVE" }, 409);
    const data = withDefaults(JSON.parse(r.data));
    // Bringing back old payment details follows the same 24-hour rule.
    const settled = settlePayments(live.data, editablePayments(data), Date.parse(now), auth.email);
    data.payments = settled.payments;
    const changes = logChanges(live.data, data);
    const version = live.version + 1;
    const note = String(b.note || "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO site_settings_versions (version, data, created_at, created_by, note, restored_from) VALUES (?, ?, ?, ?, ?, ?)").bind(version, JSON.stringify(data), now, auth.email, note, n),
        env.DB.prepare("DELETE FROM site_settings_draft WHERE id = 'draft'"),
      ]);
    } catch (e) { return json({ error: "CONFLICT" }, 409); }
    await logEvent(env, auth.email, "site_settings_restored", "v" + version, { version, restoredFrom: n, note, payments: settled.kind, changes: changes.slice(0, 150), more: Math.max(0, changes.length - 150) });
    if (["LATER", "NOW", "CANCELLED"].includes(settled.kind)) await payAlert(env, request, auth.email, settled.kind, settled.payments);
    return json({ ok: true, version, restoredFrom: n, changes: changes.length, payments: settled.kind, payActiveFrom: settled.kind === "LATER" ? settled.payments.pending.activeFrom : null });
  }

  if (b.action === "cancel_payment_change") {
    const ps = paymentState(live.data, Date.parse(now));
    if (!ps.pending) return json({ error: "NO_PENDING" }, 409);
    const data = JSON.parse(JSON.stringify(live.data));
    data.payments = { methods: ps.current, pending: null };
    const version = live.version + 1;
    const note = String(b.note || "").replace(/\s+/g, " ").trim().slice(0, 200) || "Payment details change cancelled";
    const d = await draftRow(env);
    const stmts = [env.DB.prepare("INSERT INTO site_settings_versions (version, data, created_at, created_by, note, restored_from) VALUES (?, ?, ?, ?, ?, NULL)").bind(version, JSON.stringify(data), now, auth.email, note)];
    if (d && d.data) {   // the draft stops asking for the cancelled details too
      const dd = d.data; dd.payments = { methods: ps.current };
      stmts.push(env.DB.prepare("UPDATE site_settings_draft SET data = ? WHERE id = 'draft'").bind(JSON.stringify(dd)));
    }
    try { await env.DB.batch(stmts); } catch (e) { return json({ error: "CONFLICT" }, 409); }
    await logEvent(env, auth.email, "site_settings_payment_change_cancelled", "v" + version, { version, cancelled: maskPayments({ payments: { methods: ps.pending.methods } }).payments.methods.map(payLine) });
    await payAlert(env, request, auth.email, "CANCELLED", data.payments);
    return json({ ok: true, version });
  }

  return json({ error: "Unknown action." }, 400);
}
