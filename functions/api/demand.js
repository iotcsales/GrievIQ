// POST /api/demand  { city, state }
//
// Anonymous "I want GrievIQ in my city" counter, shown when the problem's
// location is outside the wards GrievIQ covers. The count stores ONLY a city
// name, a state name and a running total -- no personal data, no location,
// no device id.
//
// Fair counting: one press per city, per connection, per day. The page
// already lets each device press once; on top of that the server keeps a
// one-way fingerprint of (today's random secret + the connection's network
// address and browser + the city). The network address itself is never
// stored, and each day's secret and fingerprints are deleted once that day
// is over (at most 24 hours later), after which nobody -- GrievIQ included --
// can link a fingerprint back to anything. A repeat press still gets the same
// "thank you", so the page never reveals what was counted.
//
// Admins read the totals at GET /api/admin/demand.

function clean(v) {
  // Letters (any script), spaces, dots, hyphens, apostrophes; 2-60 chars.
  const s = String(v || "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 60);
  return /^[\p{L}\p{M} .'\-]{2,60}$/u.test(s) ? s : null;
}

function hex(buf) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fingerprint(salt, parts) {
  const data = new TextEncoder().encode([salt].concat(parts).join("\u001f"));
  return hex(await crypto.subtle.digest("SHA-256", data));
}

// Today's secret, created on first use. Two simultaneous first presses may
// both try to create it; INSERT OR IGNORE keeps exactly one.
async function todaysSalt(DB, day) {
  const fresh = hex(crypto.getRandomValues(new Uint8Array(32)));
  await DB.prepare("INSERT OR IGNORE INTO demand_salts (day, salt) VALUES (?, ?)").bind(day, fresh).run();
  const row = await DB.prepare("SELECT salt FROM demand_salts WHERE day = ?").bind(day).first();
  return row ? row.salt : fresh;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const city = clean(body.city);
  const state = clean(body.state) || "";
  if (!city) return Response.json({ error: "A city name is required." }, { status: 400 });

  const DB = env.DB;
  const day = new Date().toISOString().slice(0, 10);   // UTC day

  let counted = true;
  try {
    // Forget earlier days first (secrets and fingerprints alike).
    await DB.prepare("DELETE FROM demand_presses WHERE day < ?").bind(day).run();
    await DB.prepare("DELETE FROM demand_salts WHERE day < ?").bind(day).run();

    const ip = request.headers.get("CF-Connecting-IP") || "";
    const ua = (request.headers.get("User-Agent") || "").slice(0, 300);
    const salt = await todaysSalt(DB, day);
    const fp = await fingerprint(salt, [ip, ua, state.toLowerCase(), city.toLowerCase()]);
    const ins = await DB.prepare("INSERT OR IGNORE INTO demand_presses (fp, day) VALUES (?, ?)").bind(fp, day).run();
    counted = !!(ins && ins.meta && ins.meta.changes);
  } catch (e) {
    // The fairness tables aren't there yet (migration not run): count as
    // before rather than lose the request.
    if (!/no such table/i.test(String(e && e.message))) throw e;
  }

  if (counted) {
    await DB.prepare(
      `INSERT INTO demand_signals (state, city, count, first_at, last_at)
       VALUES (?, ?, 1, datetime('now'), datetime('now'))
       ON CONFLICT(state, city) DO UPDATE SET count = count + 1, last_at = datetime('now')`
    ).bind(state, city).run();
  }

  return Response.json({ ok: true });
}
