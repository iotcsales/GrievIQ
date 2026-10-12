/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/me.js
//
// Returns the verified identity and jurisdiction mandate(s) for the
// currently logged-in representative. This is GrievIQ's equivalent of
// GovernIQ's me.js — but instead of returning a single role from a users
// table, it returns whichever real jurisdiction(s) this email represents,
// since a GrievIQ rep's authority comes from the seeded jurisdiction data
// itself, not from an office admin assigning a role.

import { getVerifiedRep } from "../_shared/get-verified-rep.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  const result = await getVerifiedRep(request, env);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  // Item 8c-1: a team member's own job profile, with ward and issue-type
  // names, shown at the top of their console.
  const wardIds = new Set(), typeIds = new Set();
  for (const m of result.mandates) {
    if (!m.job) continue;
    (m.job.wards || []).forEach((w) => wardIds.add(String(w)));
    (m.job.issueTypes || []).forEach((t) => typeIds.add(String(t)));
  }
  const names = new Map();
  if (wardIds.size || typeIds.size) {
    const [w, t] = await env.DB.batch([
      env.DB.prepare("SELECT id, name FROM local_units WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(Array.from(wardIds))),
      env.DB.prepare("SELECT id, name FROM grievance_categories WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(Array.from(typeIds))),
    ]);
    (w.results || []).forEach((r) => names.set("w:" + r.id, r.name));
    (t.results || []).forEach((r) => names.set("t:" + r.id, r.name));
  }
  const withNames = (job) => job ? Object.assign({}, job, {
    wards: job.wards ? job.wards.map((id) => ({ id, name: names.get("w:" + id) || id })) : null,
    issueTypes: job.issueTypes.map((id) => ({ id, name: names.get("t:" + id) || id })),
  }) : null;

  return Response.json({
    email: result.email,
    // Item 8b: each office with this person's role there.
    mandates: result.mandates.map(({ tier, id, name, label, role, job, sub }) => ({ tier, id, name, label, role: role || "REPRESENTATIVE", job: withNames(job),
      // grieviq-46: the office's plan. Dates only for the representative and office manager.
      sub: sub ? (["OFFICE_MANAGER", "REPRESENTATIVE", undefined, null].includes(role) ? { status: sub.status, until: sub.until || null, graceUntil: sub.graceUntil || null, byAdmin: !!sub.byAdmin } : { status: sub.status === "PAUSED" ? "PAUSED" : "OK" }) : null })),
    // Item 8a: "google" (our own sign-in, can sign out) or "access".
    via: result.via || "access",
  }, { headers: { "Cache-Control": "no-store" } });
}
