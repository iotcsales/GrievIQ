// functions/_shared/daily-limit.js
//
// Daily limits against floods of complaints (grieviq-36, approved 10 Oct
// 2026; OWASP Automated Threats: OAT-019 account/resource abuse, layered
// limits set high enough that a genuine citizen never meets them).
//
// Each limit counts a one-way fingerprint made with the day's random secret
// (daily-salt.js), never the phone number or network address itself. The
// counts live in the same day-counter table as the feedback form
// (feedback_rate: fp, day, n) and are deleted the next day, when the day's
// secret is deleted too, so nothing can be linked back afterwards.
//
// limits: [{ name, parts: [...], max }]. Checks every limit first and
// counts only when none is reached, so a refused attempt uses up nothing.
// Returns { ok: true } or { ok: false, hit: name, max }.
import { fingerprint, todaysSalt, istDay } from "./daily-salt.js";

export const COMPLAINTS_PER_PHONE = 5;
export const COMPLAINTS_PER_DEVICE = 15;
export const PHOTOS_PER_DEVICE = 40;

export function deviceParts(request) {
  return [request.headers.get("CF-Connecting-IP") || "", (request.headers.get("User-Agent") || "").slice(0, 300)];
}

export async function checkDailyLimits(env, limits) {
  const DB = env.DB;
  const day = istDay();
  try {
    await DB.prepare("DELETE FROM feedback_rate WHERE day < ?").bind(day).run();
    const salt = await todaysSalt(DB, day);
    const fps = [];
    for (const l of limits) fps.push(await fingerprint(salt, [l.name].concat(l.parts)));
    for (let i = 0; i < limits.length; i++) {
      const r = await DB.prepare("SELECT n FROM feedback_rate WHERE fp = ? AND day = ?").bind(fps[i], day).first();
      if (r && r.n >= limits[i].max) return { ok: false, hit: limits[i].name, max: limits[i].max };
    }
    for (const fp of fps) {
      await DB.prepare("INSERT INTO feedback_rate (fp, day, n) VALUES (?, ?, 1) ON CONFLICT(fp) DO UPDATE SET n = n + 1, day = excluded.day").bind(fp, day).run();
    }
    return { ok: true };
  } catch (e) {
    // The counting tables are missing (very old database): don't block citizens.
    if (/no such table/i.test(String(e && e.message))) return { ok: true };
    throw e;
  }
}
