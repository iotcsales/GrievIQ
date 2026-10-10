// /api/admin/dept-agreement-copy?office=<id>   The signed agreement (grieviq-37).
//
// POST multipart { file }   super admin and operations admin: upload the
//      scanned, signed agreement (PDF, JPG, PNG or WEBP, at most 10 MB) for
//      an office whose agreement is recorded. Stored privately (the photo
//      storage, under agreements/); a new upload replaces the one shown, and
//      the earlier file is kept in storage for the record. Logged.
// GET  super admin, operations admin, auditor: download it. Every download
//      is logged. Sent as a download (never shown inside GrievIQ's pages),
//      with no caching.
import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { sniffImage } from "../../_shared/resolution-evidence.js";

export const MAX_COPY_BYTES = 10 * 1024 * 1024;
const EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const json = (b, s) => Response.json(b, { status: s || 200, headers: { "Cache-Control": "no-store" } });

function sniff(buf) {
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d) return "application/pdf";   // %PDF-
  return sniffImage(buf.subarray(0, 16));
}
async function logAdmin(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, JSON.stringify(detail || {})).run();
}
async function loadAgreement(env, officeId) {
  try {
    return await env.DB.prepare("SELECT a.*, d.name_en FROM dept_agreements a JOIN dept_offices d ON d.id = a.office_id WHERE a.office_id = ?").bind(officeId).first();
  } catch (e) { if (/no such (table|column)/i.test(String(e && e.message))) return undefined; throw e; }
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_dept_officers");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.PRIVATE_PHOTOS) return json({ error: "File storage isn't set up.", code: "STORAGE_NOT_SET" }, 503);
  const officeId = String(new URL(request.url).searchParams.get("office") || "");
  const agr = await loadAgreement(env, officeId);
  if (agr === undefined) return json({ error: "Run the database update part26-dept-agreement-copy.sql first.", code: "NOT_SET_UP" }, 503);
  if (!agr) return json({ error: "Record the office's agreement first.", code: "NO_AGREEMENT" }, 409);
  if (!Object.prototype.hasOwnProperty.call(agr, "copy_key")) return json({ error: "Run the database update part26-dept-agreement-copy.sql first.", code: "NOT_SET_UP" }, 503);
  let form; try { form = await request.formData(); } catch (e) { return json({ error: "No file was provided.", code: "NO_FILE" }, 400); }
  const file = form.get("file");
  if (!file || typeof file === "string" || !file.size) return json({ error: "No file was provided.", code: "NO_FILE" }, 400);
  if (file.size > MAX_COPY_BYTES) return json({ error: "The file must be smaller than 10 MB.", code: "TOO_BIG" }, 400);
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type || !EXT[type]) return json({ error: "Upload a PDF, JPG, PNG or WEBP file.", code: "BAD_TYPE" }, 400);
  const key = "agreements/" + officeId + "/" + crypto.randomUUID() + "." + EXT[type];
  await env.PRIVATE_PHOTOS.put(key, buf, { httpMetadata: { contentType: type } });
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE dept_agreements SET copy_key = ?, copy_type = ?, copy_size = ?, copy_uploaded_at = ?, copy_uploaded_by = ?, updated_at = ? WHERE office_id = ?")
    .bind(key, type, buf.length, now, auth.email, now, officeId).run();
  await logAdmin(env, auth.email, agr.copy_key ? "dept_agreement_copy_replaced" : "dept_agreement_copy_uploaded", officeId,
    { office: agr.name_en, type, size: buf.length, previous: agr.copy_key || null });
  return json({ ok: true, copy: { type, size: buf.length, uploadedAt: now, uploadedBy: auth.email } });
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_dept_officers");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const officeId = String(new URL(request.url).searchParams.get("office") || "");
  const agr = await loadAgreement(env, officeId);
  if (!agr || !agr.copy_key || !env.PRIVATE_PHOTOS) return json({ error: "NOT_FOUND" }, 404);
  const obj = await env.PRIVATE_PHOTOS.get(agr.copy_key);
  if (!obj) return json({ error: "NOT_FOUND" }, 404);
  await logAdmin(env, auth.email, "dept_agreement_copy_viewed", officeId, { office: agr.name_en });
  const ext = EXT[agr.copy_type] || "bin";
  const name = "agreement-" + String(agr.name_en || officeId).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) + "." + ext;
  return new Response(obj.body, { headers: {
    "Content-Type": agr.copy_type || "application/octet-stream",
    "Content-Disposition": 'attachment; filename="' + name + '"',
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
