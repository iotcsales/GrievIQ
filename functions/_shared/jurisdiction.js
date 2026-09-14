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

  // Build the ordered tier list. LOCAL is always first. MAYOR is included
  // only when this local unit's municipal body exists AND has_mayor is set
  // — this is the one place rural vs. urban (and "urban with vs. without
  // an empowered Mayor") actually shows up, and it falls out naturally
  // from the data rather than being branched in code.
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
