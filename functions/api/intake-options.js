// GET /api/intake-options
// Public, unauthenticated endpoint. Returns the data needed to populate
// the citizen intake form's dropdowns: grievance categories and local units.
// No PII is returned here — only what a citizen needs to pick from.

export async function onRequestGet({ env }) {
  try {
    const categoriesResult = await env.DB.prepare(
      `SELECT id, name FROM grievance_categories ORDER BY name ASC`
    ).all();

    const unitsResult = await env.DB.prepare(
      `SELECT id, name, unit_type, localities FROM local_units ORDER BY name ASC`
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
