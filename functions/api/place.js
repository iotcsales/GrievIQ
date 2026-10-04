// GET /api/place?ward=<id>   or   GET /api/place?slug=<ward-link-part>&area=<area-link-part>
//
// Public, no sign-in. What the citizen Home page shows once the place of
// the problem is known: ward, who handles complaints here (names only),
// whether complaints can be filed yet, and a 30-day count snapshot.
// See functions/_shared/place.js for exactly what is (and isn't) returned.

import { placeInfo, findWardBySlug } from "../_shared/place.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  let id = (url.searchParams.get("ward") || "").trim();
  const slug = (url.searchParams.get("slug") || "").trim();
  const area = (url.searchParams.get("area") || "").trim().toLowerCase().slice(0, 40);

  if (!id && slug) {
    const found = await findWardBySlug(env, slug, area);
    if (!found) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    if (found.ambiguous) return Response.json({ error: "AMBIGUOUS", candidates: found.ambiguous }, { status: 409 });
    id = found.id;
  }
  if (!id || id.length > 200) return Response.json({ error: "ward or slug is required" }, { status: 400 });

  const info = await placeInfo(env, id);
  if (!info) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  return Response.json({ place: info }, { headers: { "Cache-Control": "no-store" } });
}
