/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/admin/notice-letter?id=<notice id>   (grieviq-56)
// The authority letter sent with a paid public notice. Super admin,
// operations admin and the auditor. Every opening is logged. Sent as a
// download (never shown inside GrievIQ's pages), with no caching.
import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { logNotice } from "../../_shared/notices.js";

const EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const json = (b, s) => Response.json(b, { status: s || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_notices");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const id = String(new URL(request.url).searchParams.get("id") || "");
  let n = null;
  try { n = await env.DB.prepare("SELECT id, ref, office_name, letter_key, letter_type FROM notices WHERE id = ?").bind(id).first(); } catch (e) { n = null; }
  if (!n || !n.letter_key || !env.PRIVATE_PHOTOS) return json({ error: "NOT_FOUND" }, 404);
  const obj = await env.PRIVATE_PHOTOS.get(n.letter_key);
  if (!obj) return json({ error: "NOT_FOUND" }, 404);
  await logNotice(env, auth.email, "notice_letter_viewed", n, null);
  return new Response(obj.body, { headers: {
    "Content-Type": n.letter_type || "application/octet-stream",
    "Content-Disposition": 'attachment; filename="authority-letter-' + n.ref + "." + (EXT[n.letter_type] || "bin") + '"',
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
