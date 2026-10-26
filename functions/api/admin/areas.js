/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/admin/areas   -- cities and districts GrievIQ covers
//
// GET                      every area with its counts (view_areas)
// GET ?id=<area>           one area: its counts, the MP and MLA
//                          constituencies and municipal bodies to choose
//                          from in "Add a ward or village", and the
//                          readiness checks for switching it on
// POST { action: "create", name, state, kind }            (manage_areas)
// POST { action: "set_live", id, live: true|false, reason }  (manage_areas)
// POST { action: "add_district", stateId, nameEn, nameHi, lgd } (manage_areas)
// POST { action: "edit_district", id, nameEn, nameHi, lgd }      (manage_areas)
// POST { action: "place_area", id, districtId, lgd }             (manage_areas)
//      grieviq-48: states and districts with their LGD codes, and the
//      district each area is in (for the government dashboard). The 36
//      states and union territories come with their LGD codes (part32).
// POST { action: "add_unit", areaId, ... }                 (manage_areas)
//      one ward or village typed in by hand. Its MP constituency, MLA
//      constituency and municipal body are each either chosen from the list
//      or typed in new, in the same form; everything is checked first and
//      then saved together, so a mistake never leaves half a record.
//
// Every change is recorded in admin_events. Errors name the field they
// belong to (fields: { name: "REQUIRED" ... }) so the page shows them next
// to it.

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { validateContact, emailDomainCanReceive } from "../../_shared/contact-validation.js";
import { listAreas, getArea, areaSlug, STATES, RESERVED_SLUGS, areasReady } from "../../_shared/areas.js";
import { REVIEW } from "../../_shared/review-office.js";
import { insertUnitSql, insertUnitBinds } from "../../_shared/jurisdiction-writes.js";
import { govReady, listStates, listDistricts, LGD_RE, slug as govSlug } from "../../_shared/gov.js";

const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const NAME_RE = /^[\p{L}\p{M}0-9 .,'()&\/\-]{2,80}$/u;

function slugify(text) {
  return String(text || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function text(v, max) {
  if (v == null) return null;
  const s = String(v).normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max || 200);
  return s === "" ? null : s;
}
async function logEvent(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
}
function canManage(auth) {
  return (auth.roles || [auth.role]).some((r) => (PERMISSIONS.manage_areas || []).includes(r));
}

// What must be true before an area can be switched on, and what is advised.
function readiness(a) {
  return {
    hasUnits: a.units > 0,
    allHaveEmail: a.units > 0 && a.withEmail === a.units,
    someHaveEmail: a.withEmail > 0,
    boundaries: a.urban === 0 ? null : a.withBoundary,
    canGoLive: a.withEmail > 0,
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_areas");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const areas = await listAreas(env);
  if (areas === null) return json({ ready: false, error: "Areas aren't set up yet. Run the database update part14-areas.sql.", code: "NOT_SET_UP" }, 503);
  const id = new URL(request.url).searchParams.get("id");
  const base = { ready: true, canManage: canManage(auth), states: STATES };
  // grieviq-48: the government's list of states and districts.
  if (await govReady(env)) {
    const [states, districts, placed] = await Promise.all([listStates(env), listDistricts(env),
      env.DB.prepare("SELECT id, district_id, lgd_code FROM areas").all()]);
    const by = new Map((placed.results || []).map((r) => [r.id, r]));
    for (const a of areas) { const r = by.get(a.id) || {}; a.districtId = r.district_id || null; a.lgd = r.lgd_code || null; }
    base.geo = { states: states.filter((s) => !s.demo), districts };
  }
  if (!id) return json(Object.assign(base, { areas: areas.map((a) => Object.assign(a, { readiness: readiness(a) })) }));

  const area = areas.find((a) => a.id === id);
  if (!area) return json({ error: "Area not found.", code: "NOT_FOUND" }, 404);
  const [mps, mlas, mbs, units] = await Promise.all([
    env.DB.prepare("SELECT id, name, mp_name FROM mp_constituencies WHERE id <> ? ORDER BY name").bind(REVIEW.mpId).all(),
    env.DB.prepare("SELECT id, name, mla_name, mp_constituency_id FROM mla_constituencies WHERE id <> ? ORDER BY name").bind(REVIEW.mlaId).all(),
    env.DB.prepare("SELECT id, name, has_mayor, area_id FROM municipal_bodies ORDER BY name").all(),
    env.DB.prepare(
      `SELECT lu.id, lu.name, lu.unit_type, lu.block, lu.rep_name, (COALESCE(TRIM(lu.rep_email), '') <> '') AS has_email,
              (lu.ward_boundary_geojson IS NOT NULL) AS has_boundary, mla.name AS mla_name
         FROM local_units lu LEFT JOIN mla_constituencies mla ON mla.id = lu.mla_constituency_id
        WHERE lu.area_id = ? ORDER BY lu.unit_type DESC, lu.name LIMIT 2000`
    ).bind(area.id).all(),
  ]);
  return json(Object.assign(base, {
    area: Object.assign(area, { readiness: readiness(area) }),
    mps: mps.results || [], mlas: mlas.results || [],
    municipalBodies: (mbs.results || []).map((m) => ({ id: m.id, name: m.name, hasMayor: !!m.has_mayor, inThisArea: m.area_id === area.id })),
    units: (units.results || []).map((u) => ({ id: u.id, name: u.name, type: u.unit_type, block: u.block, repName: u.rep_name, hasEmail: !!u.has_email, hasBoundary: !!u.has_boundary, mla: u.mla_name })),
  }));
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_areas");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await areasReady(env))) return json({ error: "Areas aren't set up yet. Run the database update part14-areas.sql.", code: "NOT_SET_UP" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const action = String(body.action || "");
  if (action === "create") return createArea(env, auth, body);
  if (action === "set_live") return setLive(env, auth, body);
  if (action === "add_unit") return addUnit(env, auth, body);
  if (action === "add_district" || action === "edit_district" || action === "place_area") {
    if (!(await govReady(env))) return json({ error: "Run the database update part32-gov.sql first.", code: "GOV_NOT_SET_UP" }, 503);
    if (action === "place_area") return placeArea(env, auth, body);
    return saveDistrict(env, auth, body, action === "edit_district");
  }
  return json({ error: "Unknown action." }, 400);
}

async function createArea(env, auth, body) {
  const fields = {};
  const name = text(body.name, 80);
  const state = text(body.state, 80);
  const kind = String(body.kind || "").toUpperCase();
  if (!name) fields.name = "REQUIRED";
  else if (!NAME_RE.test(name)) fields.name = "FORMAT";
  if (!state) fields.state = "REQUIRED";
  else if (!STATES.includes(state)) fields.state = "FORMAT";
  if (kind !== "CITY" && kind !== "DISTRICT") fields.kind = "REQUIRED";
  const slug = areaSlug(name);
  if (name && !fields.name && !slug) fields.name = "ENGLISH";
  else if (slug && RESERVED_SLUGS.has(slug)) fields.name = "RESERVED";
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
  const clash = await env.DB.prepare("SELECT id, name, state FROM areas WHERE slug = ? OR id = ?").bind(slug, slug).first();
  if (clash) return json({ error: "An area with this name already exists.", fields: { name: "TAKEN" }, existing: clash }, 409);
  await env.DB.prepare("INSERT INTO areas (id, name, state, kind, slug, live, created_by) VALUES (?, ?, ?, ?, ?, 0, ?)")
    .bind(slug, name, state, kind, slug, auth.email).run();
  await logEvent(env, auth.email, "area_created", slug, { name, state, kind });
  return json({ ok: true, area: { id: slug, name, state, kind, slug, live: false } });
}

// grieviq-48: add or correct a district (English and Hindi names, LGD code).
async function saveDistrict(env, auth, b, isEdit) {
  const fields = {};
  let row = null, stateId;
  if (isEdit) {
    row = await env.DB.prepare("SELECT * FROM districts WHERE id = ?").bind(String(b.id || "")).first();
    if (!row) return json({ error: "District not found.", code: "NOT_FOUND" }, 404);
    stateId = row.state_id;
  } else {
    stateId = String(b.stateId || "");
    const st = await env.DB.prepare("SELECT id FROM states WHERE id = ? AND demo = 0").bind(stateId).first();
    if (!st) fields.stateId = "REQUIRED";
  }
  const nameEn = text(b.nameEn, 81), nameHi = text(b.nameHi, 81), lgd = text(b.lgd, 7);
  if (!nameEn) fields.nameEn = "REQUIRED"; else if (!NAME_RE.test(nameEn) || !govSlug(nameEn)) fields.nameEn = "FORMAT";
  if (nameHi && (nameHi.length > 80 || /[<>]/.test(nameHi))) fields.nameHi = "FORMAT";
  if (lgd && !LGD_RE.test(lgd)) fields.lgd = "LGD";
  if (!fields.nameEn && !fields.stateId) {
    const clash = await env.DB.prepare("SELECT id FROM districts WHERE state_id = ? AND LOWER(name_en) = LOWER(?) AND id <> ?").bind(stateId, nameEn, row ? row.id : "").first();
    if (clash) fields.nameEn = "TAKEN";
  }
  if (lgd && !fields.lgd) {
    const clash = await env.DB.prepare("SELECT name_en FROM districts WHERE lgd_code = ? AND id <> ?").bind(lgd, row ? row.id : "").first();
    if (clash) fields.lgd = "LGD_TAKEN";
  }
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
  const now = new Date().toISOString();
  if (isEdit) {
    await env.DB.prepare("UPDATE districts SET name_en = ?, name_hi = ?, lgd_code = ?, updated_at = ?, updated_by = ? WHERE id = ?")
      .bind(nameEn, nameHi, lgd, now, auth.email, row.id).run();
    await logEvent(env, auth.email, "district_changed", row.id, { before: { nameEn: row.name_en, nameHi: row.name_hi, lgd: row.lgd_code }, after: { nameEn, nameHi, lgd } });
    return json({ ok: true, district: { id: row.id, stateId, nameEn, nameHi, lgd } });
  }
  const id = await freeId(env, "districts", stateId + "--" + govSlug(nameEn));
  await env.DB.prepare("INSERT INTO districts (id, state_id, name_en, name_hi, lgd_code, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, stateId, nameEn, nameHi, lgd, now, auth.email).run();
  await logEvent(env, auth.email, "district_added", id, { state: stateId, nameEn, nameHi, lgd });
  return json({ ok: true, district: { id, stateId, nameEn, nameHi, lgd } });
}

// grieviq-48: the district a city or district area is in, and its LGD code.
async function placeArea(env, auth, b) {
  const area = await getArea(env, b.id);
  if (!area) return json({ error: "Area not found.", code: "NOT_FOUND" }, 404);
  const fields = {};
  const districtId = b.districtId ? String(b.districtId) : null;
  const lgd = text(b.lgd, 7);
  let d = null;
  if (districtId) {
    d = await env.DB.prepare("SELECT d.id, d.name_en, s.name_en AS state FROM districts d JOIN states s ON s.id = d.state_id WHERE d.id = ?").bind(districtId).first();
    if (!d) fields.districtId = "NOT_FOUND";
    else if (d.state !== area.state) fields.districtId = "WRONG_STATE";
  }
  if (lgd && !LGD_RE.test(lgd)) fields.lgd = "LGD";
  if (lgd && !fields.lgd) {
    const clash = await env.DB.prepare("SELECT name FROM areas WHERE lgd_code = ? AND id <> ?").bind(lgd, area.id).first();
    if (clash) fields.lgd = "LGD_TAKEN";
  }
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
  const before = await env.DB.prepare("SELECT district_id, lgd_code FROM areas WHERE id = ?").bind(area.id).first();
  if (before && (before.district_id || null) === districtId && (before.lgd_code || null) === lgd) return json({ ok: true, unchanged: true });
  await env.DB.prepare("UPDATE areas SET district_id = ?, lgd_code = ? WHERE id = ?").bind(districtId, lgd, area.id).run();
  await logEvent(env, auth.email, "area_placed", area.id, { name: area.name, before: { district: before ? before.district_id : null, lgd: before ? before.lgd_code : null }, after: { district: districtId, lgd } });
  return json({ ok: true, districtId, lgd });
}

async function setLive(env, auth, body) {
  const area = await getArea(env, body.id);
  if (!area) return json({ error: "Area not found." }, 404);
  const live = body.live === true;
  // grieviq-68: the review office's demo area can never be shown to citizens.
  if (live && area.id === REVIEW.areaId) return json({ error: "This is the demo area for the payment provider's review. It can't be switched on for citizens.", code: "REVIEW_AREA" }, 400);
  const reason = text(body.reason, 300);
  if (!live && (!reason || reason.length < 10)) return json({ error: "Please give a reason (at least 10 characters).", fields: { reason: "LENGTH" } }, 400);
  if (live) {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM local_units WHERE area_id = ? AND COALESCE(TRIM(rep_email), '') <> ''").bind(area.id).first();
    if (!r || !r.n) return json({ error: "Add at least one ward or village with a representative's email first.", code: "NOT_READY" }, 400);
  }
  if (area.live === live) return json({ ok: true, unchanged: true, live });
  await env.DB.prepare("UPDATE areas SET live = ?, live_changed_at = datetime('now'), live_changed_by = ? WHERE id = ?")
    .bind(live ? 1 : 0, auth.email, area.id).run();
  await logEvent(env, auth.email, live ? "area_live" : "area_offline", area.id, { name: area.name, reason: reason || null });
  return json({ ok: true, live });
}

// An id not yet used in the table: base, else base-2, base-3 ...
async function freeId(env, table, base) {
  let id = base;
  for (let n = 2; await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first(); n++) id = base + "-" + n;
  return id;
}

// One contact (name / phone / email) for a new record.
function contact(input, prefix, fields) {
  const v = validateContact({ name: input && input.name, phone: input && input.phone, email: input && input.email });
  if (!v.ok) { fields[prefix + v.field.charAt(0).toUpperCase() + v.field.slice(1)] = "FORMAT"; return null; }
  return { name: v.values.name ?? null, phone: v.values.phone ?? null, email: v.values.email ?? null };
}

async function addUnit(env, auth, b) {
  const fields = {};
  const area = await getArea(env, b.areaId);
  if (!area) return json({ error: "Area not found." }, 404);

  const unitType = String(b.unitType || "").toUpperCase();
  const name = text(b.name, 120);
  const block = unitType === "RURAL" ? text(b.block, 80) : null;
  const localities = text(b.localities, 1000);
  if (unitType !== "URBAN" && unitType !== "RURAL") fields.unitType = "REQUIRED";
  if (!name) fields.name = "REQUIRED";
  else if (!NAME_RE.test(name)) fields.name = "FORMAT";

  // Representative of the ward or village.
  const rep = contact(b.rep || {}, "rep", fields);
  if (rep && !rep.email) fields.repEmail = "REQUIRED";

  // MP constituency: chosen, or new.
  let mp = null;
  const mpIn = b.mp || {};
  if (mpIn.id) {
    mp = await env.DB.prepare("SELECT id, name FROM mp_constituencies WHERE id = ?").bind(String(mpIn.id)).first();
    if (!mp) fields.mp = "NOT_FOUND";
  } else if (mpIn.new) {
    const n = text(mpIn.new.constituency, 80);
    if (!n) fields.mpConstituency = "REQUIRED";
    else if (!NAME_RE.test(n)) fields.mpConstituency = "FORMAT";
    else if (await env.DB.prepare("SELECT id FROM mp_constituencies WHERE LOWER(name) = LOWER(?)").bind(n).first()) fields.mpConstituency = "EXISTS";
    const c = contact(mpIn.new, "mp", fields);
    if (n && c) mp = { id: "mp_constituencie-" + slugify(n), name: n, isNew: true, contact: c };
  } else fields.mp = "REQUIRED";

  // MLA constituency: chosen (it must belong to the MP constituency), or new.
  let mla = null;
  const mlaIn = b.mla || {};
  if (mlaIn.id) {
    mla = await env.DB.prepare("SELECT id, name, mp_constituency_id FROM mla_constituencies WHERE id = ?").bind(String(mlaIn.id)).first();
    if (!mla) fields.mla = "NOT_FOUND";
    else if (mp && !mp.isNew && mla.mp_constituency_id !== mp.id) fields.mla = "WRONG_MP";
    else if (mp && mp.isNew) fields.mla = "WRONG_MP";
  } else if (mlaIn.new) {
    const n = text(mlaIn.new.constituency, 80);
    if (!n) fields.mlaConstituency = "REQUIRED";
    else if (!NAME_RE.test(n)) fields.mlaConstituency = "FORMAT";
    else if (await env.DB.prepare("SELECT id FROM mla_constituencies WHERE LOWER(name) = LOWER(?)").bind(n).first()) fields.mlaConstituency = "EXISTS";
    const c = contact(mlaIn.new, "mla", fields);
    if (n && c) mla = { id: "mla_constituencie-" + slugify(n), name: n, isNew: true, contact: c };
  } else fields.mla = "REQUIRED";

  // Municipal body (wards only, optional): chosen, or new.
  let mb = null;
  const mbIn = unitType === "URBAN" ? (b.municipalBody || {}) : {};
  if (mbIn.id) {
    mb = await env.DB.prepare("SELECT id, name FROM municipal_bodies WHERE id = ?").bind(String(mbIn.id)).first();
    if (!mb) fields.municipalBody = "NOT_FOUND";
  } else if (mbIn.new) {
    const n = text(mbIn.new.name, 80);
    if (!n) fields.mbName = "REQUIRED";
    else if (!NAME_RE.test(n)) fields.mbName = "FORMAT";
    else if (await env.DB.prepare("SELECT id FROM municipal_bodies WHERE LOWER(name) = LOWER(?)").bind(n).first()) fields.mbName = "EXISTS";
    const hasMayor = mbIn.new.hasMayor === true;
    const c = hasMayor ? contact({ name: mbIn.new.mayor, phone: mbIn.new.phone, email: mbIn.new.email }, "mayor", fields) : { name: null, phone: null, email: null };
    if (n && c) mb = { id: "municipal_bodie-" + slugify(n), name: n, isNew: true, hasMayor, contact: c };
  }

  // Duplicate: same name under the same MLA constituency.
  if (name && mla && !mla.isNew && !fields.name) {
    const dup = await env.DB.prepare("SELECT id FROM local_units WHERE LOWER(name) = LOWER(?) AND mla_constituency_id = ?").bind(name, mla.id).first();
    if (dup) fields.name = "TAKEN";
  }
  // Can each new email actually receive mail? (A failed lookup never blocks.)
  for (const [k, email] of [["repEmail", rep && rep.email], ["mpEmail", mp && mp.isNew && mp.contact.email], ["mlaEmail", mla && mla.isNew && mla.contact.email], ["mayorEmail", mb && mb.isNew && mb.contact.email]]) {
    if (email && !fields[k]) { const d = await emailDomainCanReceive(email); if (!d.ok) fields[k] = "DOMAIN"; }
  }
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);

  // Everything checked: save it all together.
  if (mp.isNew) mp.id = await freeId(env, "mp_constituencies", mp.id);
  if (mla.isNew) mla.id = await freeId(env, "mla_constituencies", mla.id);
  if (mb && mb.isNew) mb.id = await freeId(env, "municipal_bodies", mb.id);
  const st = [];
  if (mp.isNew) st.push(env.DB.prepare("INSERT INTO mp_constituencies (id, name, mp_name, mp_phone, mp_email) VALUES (?, ?, ?, ?, ?)").bind(mp.id, mp.name, mp.contact.name, mp.contact.phone, mp.contact.email));
  if (mla.isNew) st.push(env.DB.prepare("INSERT INTO mla_constituencies (id, name, mp_constituency_id, mla_name, mla_phone, mla_email) VALUES (?, ?, ?, ?, ?, ?)").bind(mla.id, mla.name, mp.id, mla.contact.name, mla.contact.phone, mla.contact.email));
  if (mb && mb.isNew) st.push(env.DB.prepare("INSERT INTO municipal_bodies (id, name, mla_constituency_id, has_mayor, mayor_name, mayor_phone, mayor_email, area_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(mb.id, mb.name, mla.id, mb.hasMayor ? 1 : 0, mb.contact.name, mb.contact.phone, mb.contact.email, area.id));
  const id = await freeId(env, "local_units", "lu-" + (slugify(name) || crypto.randomUUID().slice(0, 8)) + "-" + (slugify(mla.name) || "mla"));
  const unit = { name, unitType, mlaId: mla.id, municipalBodyId: mb ? mb.id : null, repName: rep.name, repPhone: rep.phone, repEmail: rep.email, localities, areaId: area.id, block };
  st.push(env.DB.prepare(insertUnitSql(unit)).bind(...insertUnitBinds(id, unit)));
  await env.DB.batch(st);

  await logEvent(env, auth.email, "area_unit_added", id, {
    area: area.id, name, unitType, block,
    created: { mp: mp.isNew ? mp.name : null, mla: mla.isNew ? mla.name : null, municipalBody: mb && mb.isNew ? mb.name : null },
    mp: mp.name, mla: mla.name, municipalBody: mb ? mb.name : null,
  });
  return json({ ok: true, unit: { id, name, unitType }, mpId: mp.id, mlaId: mla.id, municipalBodyId: mb ? mb.id : null,
    created: { mp: !!mp.isNew, mla: !!mla.isNew, municipalBody: !!(mb && mb.isNew) } });
}
