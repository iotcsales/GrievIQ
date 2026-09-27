// POST /api/demand  { city, state }
//
// Anonymous "I want GrievIQ in my city" counter, shown when the problem's
// location is outside the wards GrievIQ covers. Stores ONLY a city name,
// a state name and a running count -- no personal data, no location, no
// device id. The page lets each device press it once.
//
// GET /api/demand is not offered publicly; admins can read the table.

function clean(v) {
  // Letters (any script), spaces, dots, hyphens, apostrophes; 2-60 chars.
  const s = String(v || "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 60);
  return /^[\p{L}\p{M} .'\-]{2,60}$/u.test(s) ? s : null;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const city = clean(body.city);
  const state = clean(body.state) || "";
  if (!city) return Response.json({ error: "A city name is required." }, { status: 400 });

  await env.DB.prepare(
    `INSERT INTO demand_signals (state, city, count, first_at, last_at)
     VALUES (?, ?, 1, datetime('now'), datetime('now'))
     ON CONFLICT(state, city) DO UPDATE SET count = count + 1, last_at = datetime('now')`
  ).bind(state, city).run();

  return Response.json({ ok: true });
}
