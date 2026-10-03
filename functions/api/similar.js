// GET /api/similar?unit=<ward id>&category=<category id>
//
// "Already reported?" on the complaint form: how many complaints of the
// same kind are already open in the same ward, and how old the oldest is.
// Public and anonymous: it returns only a count and a number of days --
// never a description, a place, a reference number or anything about who
// filed them (Home already shows each ward's 30-day totals publicly).

const ID = /^[A-Za-z0-9_\-]{1,64}$/;
const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
});

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const unit = url.searchParams.get("unit") || "";
  const category = url.searchParams.get("category") || "";
  if (!ID.test(unit) || !ID.test(category)) return json({ error: "Bad request." }, 400);
  let row;
  try {
    row = await env.DB.prepare(
      `SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM grievances
        WHERE local_unit_id = ? AND category_id = ?
          AND status NOT IN ('RESOLVED', 'CLOSED', 'PENDING_CONFIRMATION')`
    ).bind(unit, category).first();
  } catch (e) {
    return json({ open: 0, oldestDays: null });
  }
  const n = Number(row && row.n) || 0;
  let oldestDays = null;
  if (n && row.oldest) {
    const s = String(row.oldest);
    const ms = new Date(s.indexOf("T") !== -1 ? s : s.replace(" ", "T") + "Z").getTime();
    if (!isNaN(ms)) oldestDays = Math.max(0, Math.floor((Date.now() - ms) / 86400000));
  }
  return json({ open: n, oldestDays });
}
