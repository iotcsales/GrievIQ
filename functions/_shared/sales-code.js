/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/sales-code.js (grieviq-75)
//
// The sales code of conduct. GrievIQ sells to elected representatives of
// every party and to government offices, so sales staff (sales executive,
// sales manager) accept it once, and again when the version changes, before
// they can work on pilot requests or quotations. Stored on admin_users
// (code_version, code_accepted_at; part49) and recorded in admin_events.
// The text itself is in i18n.js (adm.sc_*), shown by admin-nav.js.

import { SALES_ROLES } from "./get-verified-admin.js";

export const SALES_CODE_VERSION = "2026-10-30";

export function isSales(auth) { return !!auth && SALES_ROLES.includes(auth.role); }

export async function needsSalesCode(env, auth) {
  if (!isSales(auth)) return false;
  try {
    const r = await env.DB.prepare("SELECT code_version FROM admin_users WHERE LOWER(email) = ?").bind(auth.email).first();
    return !r || r.code_version !== SALES_CODE_VERSION;
  } catch (e) { return false; }   // part49 not run yet
}

export async function acceptSalesCode(env, auth) {
  if (!isSales(auth)) return { status: 400, body: { error: "NOT_SALES" } };
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE admin_users SET code_version = ?, code_accepted_at = ? WHERE LOWER(email) = ?").bind(SALES_CODE_VERSION, now, auth.email).run();
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), auth.email, "sales_code_accepted", auth.email, JSON.stringify({ version: SALES_CODE_VERSION })).run();
  return { status: 200, body: { ok: true, version: SALES_CODE_VERSION } };
}
