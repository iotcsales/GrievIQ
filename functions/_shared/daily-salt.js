// functions/_shared/daily-salt.js
//
// One random secret per day, for counting people once a day without
// knowing who they are (the method privacy-first analytics such as
// Plausible and Fathom use). A fingerprint is a one-way hash of the day's
// secret plus a few request details; the network address itself is never
// stored. Each day's secret is deleted once the day is over, after which
// nobody -- GrievIQ included -- can link a fingerprint to anything.
// Used by the "I want GrievIQ in my city" count and the visitor count.

// Today's date in India (YYYY-MM-DD). Everything that uses the daily
// secret must use this same day, so one never deletes the other's secret.
export function istDay(ms) {
  return new Date((ms == null ? Date.now() : ms) + 5.5 * 3600000).toISOString().slice(0, 10);
}

export function hex(buf) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fingerprint(salt, parts) {
  const data = new TextEncoder().encode([salt].concat(parts).join("\u001f"));
  return hex(await crypto.subtle.digest("SHA-256", data));
}

// Today's secret, created on first use. Two simultaneous first requests
// may both try to create it; INSERT OR IGNORE keeps exactly one. Earlier
// days' secrets are deleted here too.
export async function todaysSalt(DB, day) {
  await DB.prepare("DELETE FROM demand_salts WHERE day < ?").bind(day).run();
  const fresh = hex(crypto.getRandomValues(new Uint8Array(32)));
  await DB.prepare("INSERT OR IGNORE INTO demand_salts (day, salt) VALUES (?, ?)").bind(day, fresh).run();
  const row = await DB.prepare("SELECT salt FROM demand_salts WHERE day = ?").bind(day).first();
  return row ? row.salt : fresh;
}
