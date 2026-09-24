// GET /api/intake-options
// Public, unauthenticated endpoint. Returns the data needed to populate
// the citizen intake form's dropdowns: grievance categories and local units.
// No PII is returned here — only what a citizen needs to pick from.
//
// Each local unit also carries three yes/no flags (rep_missing,
// mla_missing, mp_missing): 1 when that level's representative has no
// name or no phone on file. The intake form uses these to decide whether
// to show the optional "Do you know your representative?" question --
// only asked when the answer would actually fill a gap. The flags reveal
// nothing about who the representatives are.
//
// Only wards with a representative email on file are offered, so every
// complaint filed can reach someone.

export async function onRequestGet({ env }) {
  try {
    const categoriesResult = await env.DB.prepare(
      `SELECT id, name FROM grievance_categories ORDER BY name ASC`
    ).all();

    const unitsResult = await env.DB.prepare(
      `SELECT lu.id, lu.name, lu.unit_type, lu.localities,
              CASE WHEN COALESCE(TRIM(lu.rep_name), '') = '' OR COALESCE(TRIM(lu.rep_phone), '') = '' THEN 1 ELSE 0 END AS rep_missing,
              CASE WHEN mla.id IS NULL OR COALESCE(TRIM(mla.mla_name), '') = '' OR COALESCE(TRIM(mla.mla_phone), '') = '' THEN 1 ELSE 0 END AS mla_missing,
              CASE WHEN mp.id IS NULL OR COALESCE(TRIM(mp.mp_name), '') = '' OR COALESCE(TRIM(mp.mp_phone), '') = '' THEN 1 ELSE 0 END AS mp_missing
       FROM local_units lu
       LEFT JOIN mla_constituencies mla ON mla.id = lu.mla_constituency_id
       LEFT JOIN mp_constituencies mp ON mp.id = mla.mp_constituency_id
       WHERE lu.rep_email IS NOT NULL
       ORDER BY lu.name ASC`
    ).all();

    return new Response(
      JSON.stringify({
        categories: categoriesResult.results || [],
        localUnits: unitsResult.results || [],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to load intake options." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
