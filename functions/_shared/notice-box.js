// functions/_shared/notice-box.js
//
// One person's notification bell: list, read/seen, phone alerts on/off, test.
// Shared by the rep console (/api/notifications, who = the rep's email) and,
// from grieviq-35, the department dashboard (/api/dept/notifications,
// who = "dept:" + officer id, so an officer's notices never mix with a
// representative's even when the same email is used for both).
//
// Device addresses must belong to a known browser push service (Google,
// Apple, Mozilla, Microsoft), so GrievIQ never posts to arbitrary sites.

import { sendPush, pushConfigured } from "./webpush.js";

const MAX_DEVICES = 10;
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
const b64u = /^[A-Za-z0-9_-]+$/;

export function json(body, status) {
  return Response.json(body, { status: status || 200, headers: { "Cache-Control": "no-store" } });
}
export function allowedEndpoint(endpoint) {
  try {
    const u = new URL(String(endpoint || ""));
    return u.protocol === "https:" && String(endpoint).length <= 1000 && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch (e) { return false; }
}

export async function noticeBoxGet(env, who) {
  try {
    const [items, unread, devices] = await env.DB.batch([
      env.DB.prepare(
        `SELECT *
         FROM notifications WHERE recipient = ? ORDER BY created_at DESC LIMIT 60`
      ).bind(who),
      env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient = ? AND read_at IS NULL").bind(who),
      env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE email = ?").bind(who),
    ]);
    return json({
      unread: (unread.results[0] || {}).n || 0,
      items: (items.results || []).map((r) => ({
        id: r.id, kind: r.kind, office: r.office_tier ? r.office_tier + ":" + r.office_id : null, caseId: r.grievance_id, ref: r.tracking_ref,
        ward: r.ward_name, catId: r.category_id, catName: r.category_name, dueAt: r.due_at,
        data: (() => { try { return r.data ? JSON.parse(r.data) : {}; } catch (e) { return {}; } })(),
        at: r.created_at, read: !!r.read_at, seen: !!r.seen_at,
      })),
      push: { configured: pushConfigured(env), key: env.VAPID_PUBLIC_KEY || null, devices: (devices.results[0] || {}).n || 0 },
    });
  } catch (e) {
    return json({ unread: 0, items: [], push: { configured: false, key: null, devices: 0 }, notReady: true });
  }
}

// body: { action, ... } (see api/notifications.js). testUrl: where the test alert opens.
export async function noticeBoxPost(env, who, body, testUrl) {
  const now = new Date().toISOString();

  if (body.action === "read") {
    if (body.all === true) {
      await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE recipient = ? AND read_at IS NULL").bind(now, who).run();
    } else {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => x.length <= 64).slice(0, 100);
      if (!ids.length) return json({ error: "Nothing to mark." }, 400);
      await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE recipient = ? AND read_at IS NULL AND id IN (SELECT value FROM json_each(?))")
        .bind(now, who, JSON.stringify(ids)).run();
    }
    return json({ ok: true });
  }

  if (body.action === "seen") {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => x.length <= 64).slice(0, 100);
    if (ids.length) {
      try {
        await env.DB.prepare("UPDATE notifications SET seen_at = ? WHERE recipient = ? AND seen_at IS NULL AND id IN (SELECT value FROM json_each(?))")
          .bind(now, who, JSON.stringify(ids)).run();
      } catch (e) { /* seen_at not added yet (part17) */ }
    }
    return json({ ok: true });
  }

  if (body.action === "subscribe") {
    if (!pushConfigured(env)) return json({ error: "Phone notifications aren't set up on GrievIQ yet.", code: "NOT_CONFIGURED" }, 503);
    const s = body.subscription || {};
    const keys = s.keys || {};
    if (!allowedEndpoint(s.endpoint)) return json({ error: "This browser's notification service isn't supported.", code: "BAD_ENDPOINT" }, 400);
    if (!b64u.test(String(keys.p256dh || "")) || !b64u.test(String(keys.auth || "")) || String(keys.p256dh).length > 100 || String(keys.auth).length > 50) {
      return json({ error: "The browser sent incomplete notification keys.", code: "BAD_KEYS" }, 400);
    }
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE email = ? AND endpoint <> ?").bind(who, s.endpoint).first();
    if (n && n.n >= MAX_DEVICES) return json({ error: "Notifications are on for " + MAX_DEVICES + " devices already. Turn them off on one first.", code: "TOO_MANY" }, 409);
    const lang = body.lang === "hi" ? "hi" : "en";
    const device = String(body.device || "").replace(/[^\w .,()/-]/g, "").slice(0, 60) || null;
    // One device belongs to one person: a shared computer switches to whoever turned it on last.
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (id, email, endpoint, p256dh, auth, lang, device, created_at, fail_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(endpoint) DO UPDATE SET email = excluded.email, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, device = excluded.device, fail_count = 0, last_error = NULL`
    ).bind(crypto.randomUUID(), who, s.endpoint, keys.p256dh, keys.auth, lang, device, now).run();
    return json({ ok: true });
  }

  if (body.action === "unsubscribe") {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE email = ? AND endpoint = ?").bind(who, String(body.endpoint || "")).run();
    return json({ ok: true });
  }

  if (body.action === "lang") {
    const lang = body.lang === "hi" ? "hi" : "en";
    await env.DB.prepare("UPDATE push_subscriptions SET lang = ? WHERE email = ? AND endpoint = ?").bind(lang, who, String(body.endpoint || "")).run();
    return json({ ok: true });
  }

  if (body.action === "test") {
    const { results } = await env.DB.prepare("SELECT * FROM push_subscriptions WHERE email = ?").bind(who).all();
    let ok = 0;
    for (const s of results || []) {
      const hi = s.lang === "hi";
      const r = await sendPush(env, s, { title: hi ? "GrievIQ सूचनाएँ चालू हैं" : "GrievIQ notifications are on",
        body: hi ? "नई शिकायतें और अनुस्मारक यहाँ दिखेंगे।" : "New complaints and reminders will appear here.", url: testUrl || "/rep", tag: "test" });
      if (r.ok) { ok++; await env.DB.prepare("UPDATE push_subscriptions SET last_ok_at = ?, fail_count = 0 WHERE id = ?").bind(now, s.id).run(); }
      else if (r.gone) await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(s.id).run();
    }
    return json({ ok: ok > 0, sent: ok });
  }

  return json({ error: "Unknown action." }, 400);
}
