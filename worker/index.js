/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
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
//   - follow-up requests between officials: reminders, overdue, results
//   - online bill payments still waiting are checked with Razorpay
//   - Community helpers: fees, reminders, pauses, ID photos deleted on time
// Opening the Worker's own address only shows a short status line; it
// can't be used to trigger anything.

import { runNotifications } from "../functions/_shared/notify.js";
import { settleOverdueConfirmations } from "../functions/_shared/confirmation.js";
import { runRetention, RUN_BATCH } from "../functions/_shared/retention.js";
import { purgeDuePhotos } from "../functions/_shared/photo-store.js";
import { runSubscriptions } from "../functions/_shared/subscription-run.js";
import { runSpeed } from "../functions/_shared/speed.js";
import { sendEmailNow } from "../functions/_shared/dept-auth.js";
import { runGovReports } from "../functions/_shared/gov-report-run.js";
import { runFollowups } from "../functions/_shared/followups.js";
import { runOnlinePayments } from "../functions/_shared/razorpay.js";
import { runHelpers } from "../functions/_shared/helpers.js";

export async function runScheduled(env, nowMs) {
  const origin = env.SITE_ORIGIN || "https://grieviq.in";
  await settleOverdueConfirmations(env);
  const notices = await runNotifications(env, origin, nowMs);
  let retention = null;
  try { retention = await runRetention(env, { limit: RUN_BATCH, actor: "system", kind: "AUTO", request: new Request(origin + "/") }); } catch (e) { retention = { errors: 1 }; }
  // grieviq-38: every hour, photo files of removed complaints, photos never
  // attached to a complaint, and photos past their keeping time are deleted.
  let photos = null;
  if (env.PRIVATE_PHOTOS) {
    try { photos = await purgeDuePhotos(env, 500, "system"); } catch (e) { photos = { errors: 1 }; }
  }
  // grieviq-46: office subscriptions: reminders, bills made for staff to send,
  // grace and view-only notices.
  let subscriptions = null;
  try { subscriptions = await runSubscriptions(env, origin, nowMs); } catch (e) { subscriptions = { errors: 1 }; }
  // grieviq-47: hourly speed figures, tidy-up and the slow alert.
  let speed = null;
  try { speed = await runSpeed(env, nowMs, sendEmailNow); } catch (e) { speed = { errors: 1 }; }
  // grieviq-50: "your report is ready" emails for officials who chose them
  // (on the 1st and on Mondays, from 8 am India time; no figures in them).
  let govReports = null;
  try { govReports = await runGovReports(env, origin, nowMs, sendEmailNow); } catch (e) { govReports = { errors: 1 }; }
  // grieviq-65: follow-up requests between officials: reminders, overdue,
  // the figure measured again on the reply-by date.
  let followups = null;
  try { followups = await runFollowups(env, origin, nowMs); } catch (e) { followups = { errors: 1 }; }
  // grieviq-67: online bill payments still waiting are checked with Razorpay
  // (in case its message didn't arrive). Needs the RZP_KEY_ID and
  // RZP_KEY_SECRET secrets on this Worker too; without them it does nothing.
  let onlinePay = null;
  try { onlinePay = await runOnlinePayments(env, origin, nowMs); } catch (e) { onlinePay = { errors: 1 }; }
  // grieviq-72: Community helpers: fee payments still waiting, month-end
  // reminders, pausing after the grace days, election-code days added, the
  // yearly ID check, and ID photos deleted 30 days after the decision.
  let helpers = null;
  try { helpers = await runHelpers(env, origin, nowMs); } catch (e) { helpers = { errors: 1 }; }
  return { notices, retention, photos, subscriptions, speed, govReports, followups, onlinePay, helpers };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env, event.scheduledTime || Date.now()).then((r) => console.log(JSON.stringify(r))));
  },
  async fetch() {
    return new Response("GrievIQ scheduler is installed. It runs every hour.", { headers: { "Content-Type": "text/plain" } });
  },
};
