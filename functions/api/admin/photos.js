// functions/api/admin/photos.js
//
// Photo storage (item 7c), super admin only (permission manage_photos).
//
// GET                 -> what is stored, what the retention policy will remove
//                        next, old public photos still to move, recent runs.
// GET ?legacy=<key>   -> one old public photo's file (from the PHOTOS bucket),
//                        so the super admin's browser can shrink it and make a
//                        preview before moving it. Only keys still listed on a
//                        complaint are served.
// POST multipart { action: "migrate", grievanceId, key, photo?, thumb?, dhash? }
//                     -> moves one old public photo into private storage:
//                        saves the shrunk copy and preview made in the browser
//                        (or, if the browser couldn't read it, the original
//                        file as it is, with no preview), removes the link from
//                        the complaint and deletes the public file. Safe to
//                        repeat. Logged ("photo_moved_private").
// POST JSON { action: "purge" }
//                     -> runs the retention clean-up now (up to 500 photos).
//                        Logged ("photos_purged") when something is removed.
//
// After every old photo is moved, the public address of the PHOTOS bucket
// can be turned off in Cloudflare.

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { sniffImage, sha256Hex, validDhash } from "../../_shared/resolution-evidence.js";
import {
  legacyUrls, legacyKey, purgeCounts, purgeDuePhotos, stripJpegMetadata,
  FULL_MAX_BYTES, THUMB_MAX_BYTES, FULL_KEEP_DAYS, RECORD_KEEP_YEARS, ORPHAN_HOURS,
} from "../../_shared/photo-store.js";

const LEGACY_LIST = 30;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
const KEY_RE = /^grievance-photos\/[A-Za-z0-9._-]+$/;

async function logEvent(env, actorEmail, action, target, detail) {
  await env.DB.prepare(
    "INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), actorEmail, action, target, detail == null ? null : JSON.stringify(detail)).run();
}

function one(res) { return res.results && res.results[0] ? res.results[0] : {}; }

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_photos");
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const legacy = url.searchParams.get("legacy");
  if (legacy != null) {
    if (!KEY_RE.test(legacy)) return new Response("Not found", { status: 404 });
    const row = await env.DB.prepare("SELECT id FROM grievances WHERE photo_url LIKE ? LIMIT 1").bind("%" + legacy + "%").first();
    if (!row || !env.PHOTOS) return new Response("Not found", { status: 404 });
    const obj = await env.PHOTOS.get(legacy);
    if (!obj) return new Response("Not found", { status: 404 });
    return new Response(obj.body, {
      headers: {
        "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  }

  const q = (sql) => env.DB.prepare(sql);
  const [cRes, rRes, legacyRes, runsRes] = await env.DB.batch([
    q(`SELECT
         SUM(CASE WHEN deleted_at IS NULL AND full_deleted_at IS NULL THEN 1 ELSE 0 END) AS full_kept,
         SUM(CASE WHEN deleted_at IS NULL AND full_deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS preview_only,
         SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS removed,
         SUM(CASE WHEN deleted_at IS NULL THEN COALESCE(CASE WHEN full_deleted_at IS NULL THEN byte_size ELSE 0 END, 0) + COALESCE(thumb_size, 0) ELSE 0 END) AS bytes
       FROM complaint_photos WHERE grievance_id IS NOT NULL`),
    q(`SELECT
         SUM(CASE WHEN deleted_at IS NULL AND full_deleted_at IS NULL THEN 1 ELSE 0 END) AS full_kept,
         SUM(CASE WHEN deleted_at IS NULL AND full_deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS preview_only,
         SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS removed,
         SUM(CASE WHEN deleted_at IS NULL THEN COALESCE(CASE WHEN full_deleted_at IS NULL THEN byte_size ELSE 0 END, 0) + COALESCE(thumb_size, 0) ELSE 0 END) AS bytes
       FROM resolution_photos WHERE report_id IS NOT NULL`),
    q(`SELECT id, tracking_ref, photo_url FROM grievances WHERE photo_url LIKE '%grievance-photos/%' ORDER BY created_at ASC LIMIT 500`),
    q(`SELECT actor_email, action, detail, created_at FROM admin_events
       WHERE action IN ('photos_purged', 'photo_moved_private') ORDER BY created_at DESC LIMIT 15`),
  ]);

  const legacyItems = [];
  let legacyPhotos = 0;
  for (const g of legacyRes.results || []) {
    legacyUrls(g.photo_url).forEach((u, i) => {
      const key = legacyKey(u);
      if (!key) return;
      legacyPhotos++;
      if (legacyItems.length < LEGACY_LIST) legacyItems.push({ grievanceId: g.id, trackingRef: g.tracking_ref, index: i, key });
    });
  }

  const c = one(cRes), r = one(rRes);
  return Response.json({
    role: auth.role,
    storageReady: !!env.PRIVATE_PHOTOS,
    legacyBucketReady: !!env.PHOTOS,
    complaint: { fullKept: c.full_kept || 0, previewOnly: c.preview_only || 0, removed: c.removed || 0, bytes: c.bytes || 0 },
    after: { fullKept: r.full_kept || 0, previewOnly: r.preview_only || 0, removed: r.removed || 0, bytes: r.bytes || 0 },
    due: await purgeCounts(env),
    policy: { fullKeepDays: FULL_KEEP_DAYS, recordKeepYears: RECORD_KEEP_YEARS, unusedHours: ORPHAN_HOURS },
    legacy: { cases: (legacyRes.results || []).length, photos: legacyPhotos, items: legacyItems },
    runs: (runsRes.results || []).map((e) => {
      let detail = null;
      try { detail = e.detail ? JSON.parse(e.detail) : null; } catch (x) { detail = null; }
      return { by: e.actor_email, action: e.action, detail, at: e.created_at };
    }),
    generatedAt: new Date().toISOString(),
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_photos");
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!env.PRIVATE_PHOTOS) return Response.json({ error: "Private photo storage isn't set up.", code: "STORAGE_NOT_SET" }, { status: 503 });

  const isForm = (request.headers.get("Content-Type") || "").toLowerCase().includes("multipart/form-data");
  if (!isForm) {
    let body;
    try { body = await request.json(); } catch (e) { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    if (body.action !== "purge") return Response.json({ error: "Unknown action." }, { status: 400 });
    const done = await purgeDuePhotos(env, 500, auth.email);
    return Response.json({ ok: true, done, due: await purgeCounts(env) });
  }

  let form;
  try { form = await request.formData(); } catch (e) { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  if (String(form.get("action") || "") !== "migrate") return Response.json({ error: "Unknown action." }, { status: 400 });
  const grievanceId = String(form.get("grievanceId") || "");
  const key = String(form.get("key") || "");
  if (!KEY_RE.test(key)) return Response.json({ error: "Unknown photo." }, { status: 400 });

  const g = await env.DB.prepare("SELECT id, tracking_ref, photo_url FROM grievances WHERE id = ?").bind(grievanceId).first();
  if (!g) return Response.json({ error: "Case not found." }, { status: 404 });
  const urls = legacyUrls(g.photo_url);
  const index = urls.findIndex((u) => legacyKey(u) === key);
  if (index === -1) return Response.json({ ok: true, already: true }); // moved before

  const legacyUrl = urls[index];
  const existing = await env.DB.prepare("SELECT id FROM complaint_photos WHERE grievance_id = ? AND legacy_url = ?").bind(g.id, legacyUrl).first();

  let mode = "resized";
  if (!existing) {
    let buf = null, type = null, thumb = null;
    const file = form.get("photo");
    if (file && typeof file !== "string" && file.size > 0 && file.size <= FULL_MAX_BYTES) {
      const b = new Uint8Array(await file.arrayBuffer());
      type = sniffImage(b.subarray(0, 16));
      if (type) buf = type === "image/jpeg" ? stripJpegMetadata(b) : b;
      const tf = form.get("thumb");
      if (buf && tf && typeof tf !== "string" && tf.size > 0 && tf.size <= THUMB_MAX_BYTES) {
        const t = new Uint8Array(await tf.arrayBuffer());
        if (sniffImage(t.subarray(0, 16)) === "image/jpeg") thumb = t;
      }
    }
    if (!buf) {
      // The browser couldn't read it (for example an iPhone HEIC photo on a
      // computer): copy the original file as it is, with no preview.
      mode = "copied";
      if (!env.PHOTOS) return Response.json({ error: "The old photo storage isn't connected." }, { status: 503 });
      const obj = await env.PHOTOS.get(key);
      if (!obj) {
        // The file is already gone: just drop the dead link.
        mode = "missing";
      } else {
        const b = new Uint8Array(await obj.arrayBuffer());
        type = sniffImage(b.subarray(0, 16)) || ((obj.httpMetadata && obj.httpMetadata.contentType) || "").toLowerCase();
        if (!EXT[type]) type = "image/jpeg";
        buf = type === "image/jpeg" ? stripJpegMetadata(b) : b;
      }
    }

    if (buf) {
      const id = crypto.randomUUID();
      const newKey = "complaint-photos/" + id + "." + EXT[type];
      const thumbKey = thumb ? "complaint-photos/" + id + "-thumb.jpg" : null;
      await env.PRIVATE_PHOTOS.put(newKey, buf, { httpMetadata: { contentType: type } });
      if (thumb) await env.PRIVATE_PHOTOS.put(thumbKey, thumb, { httpMetadata: { contentType: "image/jpeg" } });
      await env.DB.prepare(
        `INSERT INTO complaint_photos
           (id, grievance_id, position, r2_key, thumb_key, content_type, byte_size, thumb_size, sha256, dhash, source, legacy_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MIGRATED', ?, ?)`
      ).bind(id, g.id, index, newKey, thumbKey, type, buf.byteLength, thumb ? thumb.byteLength : null,
        await sha256Hex(buf), validDhash(String(form.get("dhash") || "").toLowerCase()), legacyUrl, new Date().toISOString()).run();
    }
  }

  // Drop the link from the complaint, then delete the public file.
  const left = urls.filter((u) => u !== legacyUrl);
  await env.DB.prepare("UPDATE grievances SET photo_url = ? WHERE id = ?").bind(left.length ? JSON.stringify(left) : null, g.id).run();
  if (env.PHOTOS) { try { await env.PHOTOS.delete(key); } catch (e) { /* removed later by hand if needed */ } }
  await logEvent(env, auth.email, "photo_moved_private", g.id, { trackingRef: g.tracking_ref, mode: existing ? "already" : mode });
  return Response.json({ ok: true, mode: existing ? "already" : mode });
}
