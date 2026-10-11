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
// Every action is written to the admin log; publishing and restoring
// record each changed value (before and after).

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { cleanSettings, liveVersion, draftRow, settingsReady, publicView, diffSettings, istToday } from "../../_shared/site-settings.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

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
    return json({ version: r.version, data: JSON.parse(r.data), createdAt: r.created_at, createdBy: r.created_by, note: r.note, restoredFrom: r.restored_from });
  }

  let history = [];
  if (ready) {
    const { results } = await env.DB.prepare("SELECT version, created_at, created_by, note, restored_from FROM site_settings_versions ORDER BY version DESC LIMIT 100").all();
    history = (results || []).map((r) => ({ version: r.version, createdAt: r.created_at, createdBy: r.created_by, note: r.note || "", restoredFrom: r.restored_from }));
  }
  const draft = canEdit ? await draftRow(env) : null;
  return json({
    canEdit, ready, today: istToday(),
    live: { version: live.version, data: live.data, publishedAt: live.publishedAt, publishedBy: live.publishedBy },
    draft: draft ? { data: draft.data, baseVersion: draft.baseVersion, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy, changes: diffSettings(live.data, draft.data).length } : null,
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
    const changes = diffSettings(live.data, data);
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
    const changes = diffSettings(live.data, data);
    if (!changes.length) return json({ error: "NO_CHANGES" }, 409);
    const note = String(b.note || "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
    const version = live.version + 1;
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO site_settings_versions (version, data, created_at, created_by, note, restored_from) VALUES (?, ?, ?, ?, ?, NULL)").bind(version, JSON.stringify(data), now, auth.email, note),
        env.DB.prepare("DELETE FROM site_settings_draft WHERE id = 'draft'"),
      ]);
    } catch (e) { return json({ error: "CONFLICT" }, 409); }
    await logEvent(env, auth.email, "site_settings_published", "v" + version, { version, note, changes: changes.slice(0, 150), more: Math.max(0, changes.length - 150) });
    return json({ ok: true, version, changes: changes.length });
  }

  if (b.action === "restore") {
    const n = Number(b.version);
    const r = Number.isInteger(n) && n > 0 ? await env.DB.prepare("SELECT version, data FROM site_settings_versions WHERE version = ?").bind(n).first() : null;
    if (!r) return json({ error: "NOT_FOUND" }, 404);
    if (n === live.version) return json({ error: "ALREADY_LIVE" }, 409);
    const data = JSON.parse(r.data);
    const changes = diffSettings(live.data, data);
    const version = live.version + 1;
    const note = String(b.note || "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO site_settings_versions (version, data, created_at, created_by, note, restored_from) VALUES (?, ?, ?, ?, ?, ?)").bind(version, r.data, now, auth.email, note, n),
        env.DB.prepare("DELETE FROM site_settings_draft WHERE id = 'draft'"),
      ]);
    } catch (e) { return json({ error: "CONFLICT" }, 409); }
    await logEvent(env, auth.email, "site_settings_restored", "v" + version, { version, restoredFrom: n, note, changes: changes.slice(0, 150), more: Math.max(0, changes.length - 150) });
    return json({ ok: true, version, restoredFrom: n, changes: changes.length });
  }

  return json({ error: "Unknown action." }, 400);
}
