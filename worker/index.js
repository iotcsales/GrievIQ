// GrievIQ scheduler (Cloudflare Worker with a Cron Trigger).
//
// Cloudflare Pages can't run anything on a timer, so this small Worker does
// it, using the same database and the same code as the website
// (functions/_shared). It runs every hour, on the hour in India:
//   - tells offices about cases that have just moved up to them (and the
//     citizen, if they gave an email); catches up any new-complaint notice
//     that failed at filing time
//   - at 9:00 am, sends each office its daily summary
//   - retries backup emails that didn't go through
//   - closes cases whose 7-day confirmation time has run out
//   - runs the data-retention batch (notices, anonymising, old codes)
// Opening the Worker's own address only shows a short status line; it
// can't be used to trigger anything.

import { runNotifications } from "../functions/_shared/notify.js";
import { settleOverdueConfirmations } from "../functions/_shared/confirmation.js";
import { runRetention, RUN_BATCH } from "../functions/_shared/retention.js";

export async function runScheduled(env, nowMs) {
  const origin = env.SITE_ORIGIN || "https://grieviq.in";
  await settleOverdueConfirmations(env);
  const notices = await runNotifications(env, origin, nowMs);
  let retention = null;
  try { retention = await runRetention(env, { limit: RUN_BATCH, actor: "system", kind: "AUTO", request: new Request(origin + "/") }); } catch (e) { retention = { errors: 1 }; }
  return { notices, retention };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env, event.scheduledTime || Date.now()).then((r) => console.log(JSON.stringify(r))));
  },
  async fetch() {
    return new Response("GrievIQ scheduler is installed. It runs every hour.", { headers: { "Content-Type": "text/plain" } });
  },
};
