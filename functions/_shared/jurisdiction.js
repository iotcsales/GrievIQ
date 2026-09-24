// functions/_shared/jurisdiction.js
//
// Resolves the full escalation chain for a grievance's local unit.
// A local unit (ward or village) always sits under exactly one MLA
// constituency, which sits under exactly one MP constituency. Urban wards
// additionally sit under a municipal body, which may or may not have an
// empowered Mayor — this is what makes the chain 3 tiers (no Mayor / rural)
// or 4 tiers (Mayor present) without any hardcoded rural/urban branching
// anywhere else in the app. Adding a new city with a different structure
// later just means inserting a new municipal_bodies row — no code changes.

export async function resolveChain(env, localUnitId) {
  const localUnit = await env.DB.prepare(
    "SELECT * FROM local_units WHERE id = ?"
  ).bind(localUnitId).first();
  if (!localUnit) return null;

  const mla = await env.DB.prepare(
    "SELECT * FROM mla_constituencies WHERE id = ?"
  ).bind(localUnit.mla_constituency_id).first();
  if (!mla) return null;

  const mp = await env.DB.prepare(
    "SELECT * FROM mp_constituencies WHERE id = ?"
  ).bind(mla.mp_constituency_id).first();
  if (!mp) return null;

  let municipalBody = null;
  if (localUnit.municipal_body_id) {
    municipalBody = await env.DB.prepare(
      "SELECT * FROM municipal_bodies WHERE id = ?"
    ).bind(localUnit.municipal_body_id).first();
  }

  const tiers = [
    {
      tier: "LOCAL",
      label: localUnit.unit_type === "URBAN" ? "Corporator" : "Gram Pradhan",
      name: localUnit.rep_name,
      phone: localUnit.rep_phone,
      email: localUnit.rep_email,
    },
  ];

  if (municipalBody && municipalBody.has_mayor) {
    tiers.push({
      tier: "MAYOR",
      label: "Mayor",
      name: municipalBody.mayor_name,
      phone: municipalBody.mayor_phone,
      email: municipalBody.mayor_email,
    });
  }

  tiers.push({
    tier: "MLA",
    label: "MLA",
    name: mla.mla_name,
    phone: mla.mla_phone,
    email: mla.mla_email,
  });

  tiers.push({
    tier: "MP",
    label: "MP",
    name: mp.mp_name,
    phone: mp.mp_phone,
    email: mp.mp_email,
  });

  return { localUnit, municipalBody, mla, mp, tiers };
}

// Given a representative's mandate (their tier + which jurisdiction row
// they hold it in), returns every local_unit id that falls under that
// jurisdiction — i.e. every ward/village whose grievances this rep has
// any claim to see. A LOCAL mandate covers exactly one local unit; every
// tier above that covers however many local units sit beneath it.
export async function getLocalUnitIdsForMandate(env, mandate) {
  if (mandate.tier === "LOCAL") {
    return [mandate.id];
  }

  if (mandate.tier === "MAYOR") {
    const { results } = await env.DB.prepare(
      "SELECT id FROM local_units WHERE municipal_body_id = ?"
    ).bind(mandate.id).all();
    return results.map((r) => r.id);
  }

  if (mandate.tier === "MLA") {
    const { results } = await env.DB.prepare(
      "SELECT id FROM local_units WHERE mla_constituency_id = ?"
    ).bind(mandate.id).all();
    return results.map((r) => r.id);
  }

  if (mandate.tier === "MP") {
    const { results } = await env.DB.prepare(
      `SELECT lu.id FROM local_units lu
       JOIN mla_constituencies mla ON lu.mla_constituency_id = mla.id
       WHERE mla.mp_constituency_id = ?`
    ).bind(mandate.id).all();
    return results.map((r) => r.id);
  }

  return [];
}

// Returns a SQL fragment that limits a query on grievances (aliased "g")
// to one mandate's jurisdiction -- the same wards getLocalUnitIdsForMandate
// returns, but expressed as a JOIN on the jurisdiction tables instead of a
// long "IN (?,?,...)" list. D1 caps bound parameters per query at about
// 100, so an MP (or a large MLA) mandate covering 100+ wards would break an
// IN list; this always uses exactly one parameter.
//
// Usage: `SELECT g.* FROM grievances g ${s.join} WHERE ${s.where}` .bind(...s.binds)
export function mandateScope(mandate) {
  if (mandate.tier === "LOCAL") {
    return { join: "", where: "g.local_unit_id = ?", binds: [mandate.id] };
  }
  if (mandate.tier === "MAYOR") {
    return {
      join: "JOIN local_units lu_scope ON lu_scope.id = g.local_unit_id",
      where: "lu_scope.municipal_body_id = ?",
      binds: [mandate.id],
    };
  }
  if (mandate.tier === "MLA") {
    return {
      join: "JOIN local_units lu_scope ON lu_scope.id = g.local_unit_id",
      where: "lu_scope.mla_constituency_id = ?",
      binds: [mandate.id],
    };
  }
  if (mandate.tier === "MP") {
    return {
      join: "JOIN local_units lu_scope ON lu_scope.id = g.local_unit_id " +
            "JOIN mla_constituencies mla_scope ON mla_scope.id = lu_scope.mla_constituency_id",
      where: "mla_scope.mp_constituency_id = ?",
      binds: [mandate.id],
    };
  }
  return { join: "", where: "0", binds: [] };
}
