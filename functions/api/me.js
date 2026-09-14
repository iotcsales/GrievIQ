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

  return Response.json({
    email: result.email,
    mandates: result.mandates,
  });
}
