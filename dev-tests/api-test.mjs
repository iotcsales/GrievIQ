/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// API tests for Departments stage 1.  node api-test.mjs  (server on 8788, fresh DB)
// Run through dev-tests/setup.sh (it starts the server with a fresh database).
const B = "http://localhost:8788";
let pass = 0, fail = 0;
function ok(cond, name, extra) { if (cond) pass++; else { fail++; console.log("FAIL:", name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); } }
async function call(who, method, path, body) {
  const r = await fetch(B + path, { method, headers: { "test-email": who, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch (e) { j = { raw: text }; }
  return { status: r.status, body: j };
}
const get = (who, area) => call(who, "GET", "/api/admin/departments" + (area ? "?area=" + area : ""));
const post = (who, b) => call(who, "POST", "/api/admin/departments", b);
const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const good = (o) => Object.assign({ nameEn: "Lucknow Nagar Nigam Control Room", nameHi: "लखनऊ नगर निगम कंट्रोल रूम", departments: ["Sanitation / Garbage", "Roads & Public Works"],
  wards: "ALL", helpline: "1533", officeEmail: "nnlko@nic.in", whatsapp: "9219902911", website: "https://lmc.up.nic.in/helpline.aspx",
  source: "https://lmc.up.nic.in/helpline.aspx", lastChecked: today }, o || {});
const S = "super@test.in", O = "ops@test.in", D = "deo@test.in", A = "audit@test.in", M = "mod@test.in";

// ---- access ----
ok((await get("nobody@test.in")).status === 403, "non-admin refused");
ok((await get(M)).status === 403, "data moderator has no access");
ok((await get("")).status === 401, "no sign-in refused");
const audit = await get(A);
ok(audit.status === 200 && !audit.body.canManage && !audit.body.canRequest, "auditor reads only", audit.body);
ok((await post(A, { action: "save", areaId: "lucknow", office: good() })).status === 403, "auditor can't save");
ok((await get(S, "nowhere")).status === 404, "unknown area 404");
const tpl = await fetch(B + "/api/admin/departments?template=1", { headers: { "test-email": S } });
const tplText = await tpl.text();
ok(tpl.headers.get("content-disposition").includes("grieviq-departments-template.csv") && tplText.includes("office_name_en,office_name_hi,handles,wards"), "template download");

// ---- validation ----
let r = await post(S, { action: "save", areaId: "lucknow", office: {} });
ok(r.status === 400 && ["nameEn", "departments", "wards", "contact", "source", "lastChecked"].every((k) => r.body.fields[k]), "empty form: each field named", r.body);
r = await post(S, { action: "save", areaId: "lucknow", office: good({ helpline: "12", officePhone: "12345", officeEmail: "bad@", whatsapp: "0522223456", website: "lmc.up.nic.in", lastChecked: "2099-01-01", departments: ["Water"] }) });
ok(r.body.fields && r.body.fields.helpline === "FORMAT" && r.body.fields.officePhone === "FORMAT" && r.body.fields.officeEmail === "FORMAT" && r.body.fields.whatsapp === "FORMAT" && r.body.fields.website === "FORMAT" && r.body.fields.lastChecked === "FUTURE" && r.body.fields.departments === "FORMAT", "format checks", r.body);
r = await post(S, { action: "save", areaId: "lucknow", office: good({ wards: ["lu-knp1"] }) });
ok(r.body.fields && r.body.fields.wards === "UNKNOWN", "ward from another area refused", r.body);
r = await post(S, { action: "save", areaId: "lucknow", office: good({ wards: [] }) });
ok(r.body.fields && r.body.fields.wards === "REQUIRED", "empty ward list refused", r.body);
r = await post(S, { action: "save", areaId: "lucknow", office: good({ officerPhone: "9876543210" }) });
ok(r.body.fields && r.body.fields.officerName && r.body.fields.officerConsentDate && r.body.fields.officerConsentHow, "personal mobile needs recorded agreement", r.body);
r = await post(S, { action: "save", areaId: "lucknow", office: good({ officeEmail: "x@nomail.invalid" }) });
ok(r.body.fields && r.body.fields.officeEmail === "NO_MAIL", "email domain that can't receive", r.body);
r = await post(S, { action: "save", areaId: "lucknow", office: good({ helpline: "1800 410 1912", officePhone: "0522 2234567", whatsapp: "+91 92199 02911" }) });
ok(r.status === 200 && r.body.created, "toll-free + landline + +91 WhatsApp accepted", r.body);
const ctrl = r.body.officeId;

// ---- duplicates, wards, matching order ----
r = await post(S, { action: "save", areaId: "lucknow", office: good({ nameEn: "lucknow nagar nigam control room" }) });
ok(r.body.fields && r.body.fields.nameEn === "TAKEN", "same name (any case) refused", r.body);
r = await post(O, { action: "save", areaId: "lucknow", office: good({ nameEn: "Nagar Nigam Zone 1", nameHi: "", helpline: "", officeEmail: "", whatsapp: "", website: "", officePhone: "0522 2614366", wards: ["lu-hazratganj", "lu-tilak"], departments: ["Sanitation / Garbage"] }) });
ok(r.status === 200, "ops admin adds a zone office", r.body);
const zone = r.body.officeId;
r = await post(S, { action: "save", areaId: "lucknow", office: good({ nameEn: "MVVNL 1912 Helpline", nameHi: "", departments: ["Electricity"], helpline: "1912", whatsapp: "8010924203", officeEmail: "", website: "https://1912.uppcl.org/", source: "https://mvvnl.in/en", lastChecked: "2025-01-01" }) });
ok(r.status === 200, "MVVNL added (old check date)", r.body);
const mvvnl = r.body.officeId;
let g = await get(S, "lucknow");
const cell = g.body.coverage.cells["lu-hazratganj"]["Sanitation / Garbage"];
ok(cell[0] === zone && cell[1] === ctrl, "ward-specific office listed before whole-area one", cell);
ok(g.body.coverage.cells["lu-gomti"]["Sanitation / Garbage"].join() === ctrl, "other wards get the whole-area office");
ok(g.body.coverage.cells["lu-gomti"]["Water Supply"].length === 0, "water is a gap");
ok(g.body.coverage.gaps === 5 * 3, "gap count = 5 wards x (water, health, legal)", g.body.coverage.gaps);
ok(g.body.offices.find((o) => o.id === mvvnl).needsCheck === true && g.body.offices.find((o) => o.id === ctrl).needsCheck === false, "check-again after a year");
ok((await get(S, "kanpur")).body.offices.length === 0, "offices are per area");

// ---- edit: unchanged, stale, ok ----
let cur = g.body.offices.find((o) => o.id === zone);
const asInput = (o, extra) => Object.assign({ nameEn: o.nameEn, nameHi: o.nameHi, departments: o.departments, wards: o.wards || "ALL", helpline: o.helpline, officePhone: o.officePhone,
  officeEmail: o.officeEmail, whatsapp: o.whatsapp, website: o.website, address: o.address, hours: o.hours, officerName: o.officerName, officerPhone: o.officerPhone,
  officerConsentDate: o.officerConsentDate, officerConsentHow: o.officerConsentHow, source: o.source, lastChecked: o.lastChecked, notes: o.notes }, extra || {});
r = await post(S, { action: "save", officeId: zone, expectedUpdatedAt: cur.updatedAt, office: asInput(cur) });
ok(r.status === 400 && r.body.code === "UNCHANGED", "unchanged edit refused", r.body);
r = await post(S, { action: "save", officeId: zone, expectedUpdatedAt: "2000-01-01", office: asInput(cur, { hours: "10 am - 5 pm" }) });
ok(r.status === 409 && r.body.code === "STALE", "edit on an older version refused", r.body);
r = await post(S, { action: "save", officeId: zone, expectedUpdatedAt: cur.updatedAt, office: asInput(cur, { hours: "Mon-Sat, 10 am - 5 pm", officerName: "R. K. Singh", officerPhone: "9876543210", officerConsentDate: today, officerConsentHow: "Agreed by phone to GrievIQ staff" }) });
ok(r.status === 200, "edit with officer + agreement saved", r.body);
g = await get(S, "lucknow"); cur = g.body.offices.find((o) => o.id === zone);
ok(cur.hours === "Mon-Sat, 10 am - 5 pm" && cur.officerPhone === "9876543210" && cur.officerConsentHow, "edit stored");

// ---- retire / restore ----
r = await post(S, { action: "retire", officeId: zone, expectedUpdatedAt: cur.updatedAt, reason: "short" });
ok(r.status === 400 && r.body.fields.retireReason === "SHORT", "retire needs a reason", r.body);
r = await post(S, { action: "retire", officeId: zone, expectedUpdatedAt: cur.updatedAt, reason: "Zone offices merged into the control room" });
ok(r.status === 200, "retired");
g = await get(S, "lucknow");
ok(g.body.coverage.cells["lu-hazratganj"]["Sanitation / Garbage"].join() === ctrl, "retired office no longer matched");
cur = g.body.offices.find((o) => o.id === zone);
ok(cur.retired && cur.retireReason.includes("merged"), "retired office kept with its reason");
r = await post(S, { action: "save", officeId: zone, expectedUpdatedAt: cur.updatedAt, office: asInput(cur, { hours: "x" }) });
ok(r.status === 409 && r.body.code === "RETIRED", "can't edit a retired office");
r = await post(S, { action: "save", areaId: "lucknow", office: good({ nameEn: "Nagar Nigam Zone 1", helpline: "1533", wards: "ALL" }) });
ok(r.status === 200, "retired office's name can be reused");
const zoneNew = r.body.officeId;
r = await post(S, { action: "restore", officeId: zone, expectedUpdatedAt: cur.updatedAt });
ok(r.status === 409 && r.body.code === "TAKEN", "can't bring back while the name is used", r.body);
g = await get(S, "lucknow");
let zn = g.body.offices.find((o) => o.id === zoneNew);
await post(S, { action: "retire", officeId: zoneNew, expectedUpdatedAt: zn.updatedAt, reason: "Created by mistake in the test" });
r = await post(S, { action: "restore", officeId: zone, expectedUpdatedAt: cur.updatedAt });
ok(r.status === 200, "brought back", r.body);

// ---- data entry operator: requests, maker-checker ----
r = await post(D, { action: "save", areaId: "lucknow", office: good({ nameEn: "Jal Kal Vibhag Lucknow", departments: ["Water Supply"], helpline: "", whatsapp: "", website: "", officeEmail: "", officePhone: "0522 2612345" }) });
ok(r.status === 400 && r.body.fields.reason === "REQUIRED", "operator must give a reason", r.body);
r = await post(D, { action: "save", areaId: "lucknow", reason: "Number from the RTI reply", office: good({ nameEn: "Jal Kal Vibhag Lucknow", departments: ["Water Supply"], helpline: "", whatsapp: "", website: "", officeEmail: "", officePhone: "0522 2612345", source: "RTI reply from Nagar Nigam, 2 Oct 2026" }) });
ok(r.status === 200 && r.body.requested, "operator's new office becomes a request", r.body);
const req1 = r.body.requestId;
g = await get(D, "lucknow");
ok(!g.body.offices.some((o) => o.nameEn === "Jal Kal Vibhag Lucknow") && g.body.canRequest && !g.body.canManage, "nothing changes before approval");
ok(g.body.pending.some((p) => p.id === req1 && p.op === "create"), "page shows the waiting request");
cur = g.body.offices.find((o) => o.id === mvvnl);
r = await post(D, { action: "save", officeId: mvvnl, expectedUpdatedAt: cur.updatedAt, reason: "Checked on website today", office: asInput(cur, { lastChecked: today }) });
ok(r.status === 200 && r.body.requested, "operator's change becomes a request");
const req2 = r.body.requestId;
r = await post(D, { action: "retire", officeId: mvvnl, expectedUpdatedAt: cur.updatedAt, reason: "Testing a second request on the same office" });
ok(r.status === 409 && r.body.code === "WAITING", "one waiting request per office");
// approvals
let ap = await call(D, "POST", "/api/admin/change-requests", { action: "approve", ids: [req1] });
ok(ap.status === 403, "operator can't approve");
let list = await call(S, "GET", "/api/admin/change-requests");
ok(list.body.requests.some((x) => x.id === req1 && x.kind === "dept_office"), "request listed for approvers");
// make the change request out of date: super edits MVVNL first
g = await get(S, "lucknow"); cur = g.body.offices.find((o) => o.id === mvvnl);
await post(S, { action: "save", officeId: mvvnl, expectedUpdatedAt: cur.updatedAt, office: asInput(cur, { hours: "24 hours" }) });
ap = await call(O, "POST", "/api/admin/change-requests", { action: "approve", ids: [req1, req2] });
const res1 = ap.body.results.find((x) => x.id === req1), res2 = ap.body.results.find((x) => x.id === req2);
ok(res1.result === "approved", "new office approved", ap.body);
ok(res2.result === "out_of_date", "change made against an older version is out of date", ap.body);
g = await get(S, "lucknow");
const jal = g.body.offices.find((o) => o.nameEn === "Jal Kal Vibhag Lucknow");
ok(jal && jal.createdBy === O, "approved office exists, created by the approver");
ok(g.body.coverage.cells["lu-gomti"]["Water Supply"].join() === jal.id, "water gap filled");
const dec = await call(S, "GET", "/api/admin/change-requests?view=decided");
ok(dec.body.requests.find((x) => x.id === req2).status === "OUT_OF_DATE", "out-of-date status stored");

// ---- CSV import ----
const header = "area,office_name_en,office_name_hi,handles,wards,helpline,office_phone,office_email,whatsapp,website,address,hours,source,last_checked,notes\n";
let csv = header +
  'Lucknow,CMO Lucknow,मुख्य चिकित्सा अधिकारी लखनऊ,Health,ALL,,0522 2622080,cmolko@nic.in,,,,,"https://lucknow.nic.in/",07-10-2026,\n' +
  'Lucknow,Tehsil Sadar,,विधिक / भू-अभिलेख विभाग,Aishbagh|Gomti Nagar,,0522 2623456,,,,,,RTI reply 2 Oct 2026,2026-10-02,\n' +
  'Lucknow,Bad Row,,Plumbing,Nowhere Ward,,,,,,,,,2099-01-01,\n' +
  'Kanpur,CMO Lucknow,,Health,ALL,108,,,,,,,https://x.gov.in,2026-10-01,\n';
r = await post(S, { action: "import_check", areaId: "lucknow", csv });
ok(r.status === 200 && r.body.total === 4 && r.body.bad === 2, "file check: 2 good, 2 bad", r.body);
const row3 = r.body.rows.find((x) => x.line === 4);
ok(row3.fields.departments === "FORMAT" && row3.fields.wards === "UNKNOWN" && row3.fields.contact && row3.fields.source && row3.fields.lastChecked === "FUTURE" && row3.unknownWards[0] === "Nowhere Ward", "bad row explained per column", row3);
const row4 = r.body.rows.find((x) => x.line === 5);
ok(row4.fields.area === "OTHER_AREA" && row4.fields.nameEn === "DUPLICATE", "other area + duplicate in file", row4);
ok(r.body.rows.find((x) => x.line === 3).ok, "Hindi department name and ward names understood");
r = await post(S, { action: "import", areaId: "lucknow", csv });
ok(r.status === 400, "import with bad rows saves nothing");
ok((await get(S, "lucknow")).body.offices.every((o) => o.nameEn !== "CMO Lucknow"), "nothing saved");
csv = header + csv.split("\n").slice(1, 3).join("\n") + "\n";
r = await post(D, { action: "import", areaId: "lucknow", csv, reason: "From district website and RTI" });
ok(r.status === 200 && r.body.requested, "operator's file becomes one request", r.body);
const req3 = r.body.requestId;
ap = await call(S, "POST", "/api/admin/change-requests", { action: "approve", ids: [req3] });
ok(ap.body.results[0].result === "approved", "file approved", ap.body);
g = await get(S, "lucknow");
const cmo = g.body.offices.find((o) => o.nameEn === "CMO Lucknow");
ok(cmo && cmo.lastChecked === "2026-10-07" && cmo.nameHi === "मुख्य चिकित्सा अधिकारी लखनऊ", "Indian date order and Hindi name read correctly", cmo);
const tehsil = g.body.offices.find((o) => o.nameEn === "Tehsil Sadar");
ok(tehsil && tehsil.departments[0] === "Legal / Land Records" && tehsil.wards.length === 2, "tehsil saved with two wards", tehsil);
r = await post(S, { action: "import", areaId: "kanpur", csv: header + 'Kanpur,KESCO,,Electricity,ALL,1912,,,,https://kesco.co.in,,,https://kesco.co.in,2026-10-01,\n' });
ok(r.status === 200 && r.body.saved === 1, "super admin imports directly", r.body);
r = await post(S, { action: "import_check", areaId: "lucknow", csv: "name,phone\nx,1\n" });
ok(r.status === 400 && r.body.code === "COLUMNS" && r.body.missing.includes("handles"), "missing columns named", r.body);
r = await post(S, { action: "import_check", areaId: "lucknow", csv: header + "a\n".repeat(301) });
ok(r.body.code === "TOO_MANY", "row limit", r.body);


// ---- department types (grieviq-25) ----
g = await get(S, "lucknow");
ok(g.body.typesReady && g.body.types.length === 7 && g.body.types[6].key === "Other", "seven types, Other last", g.body.types && g.body.types.map((t) => t.key));
ok(g.body.types.find((t) => t.key === "Water Supply").used.issueTypes === 1, "usage counted");
r = await post(S, { action: "type_add", type: {} });
ok(r.status === 400 && r.body.fields.typeNameEn === "REQUIRED" && r.body.fields.typeNameHi === "REQUIRED", "type names required", r.body);
r = await post(S, { action: "type_add", type: { nameEn: "water supply", nameHi: "जलापूर्ति विभाग" } });
ok(r.body.fields && r.body.fields.typeNameEn === "TAKEN" && r.body.fields.typeNameHi === "TAKEN", "duplicate names refused", r.body);
r = await post(S, { action: "type_add", type: { nameEn: "Street Lights", nameHi: "Street Lights" } });
ok(r.body.fields && r.body.fields.typeNameHi === "NOT_HINDI", "Hindi name must be Hindi", r.body);
r = await post(S, { action: "type_add", type: { nameEn: "Street Lights", nameHi: "स्ट्रीट लाइट विभाग", description: "Broken or missing street lights" } });
ok(r.status === 200 && r.body.key === "Street Lights", "type added", r.body);
g = await get(S, "lucknow");
ok(g.body.departments.includes("Street Lights") && g.body.departments[g.body.departments.length - 1] === "Other", "new type in the list, before Other", g.body.departments);
ok(g.body.coverage.departments.includes("Street Lights") && g.body.coverage.cells["lu-gomti"]["Street Lights"].length === 0, "new type is a coverage column");
ok(g.body.names["Street Lights"].hi === "स्ट्रीट लाइट विभाग", "names sent to pages");
r = await post(S, { action: "save", areaId: "lucknow", office: good({ nameEn: "LMC Street Light Cell", nameHi: "", departments: ["Street Lights"], helpline: "1533", whatsapp: "", website: "", officeEmail: "" }) });
ok(r.status === 200, "office can use the new type", r.body);
const slOffice = r.body.officeId;
let it = await call(S, "GET", "/api/admin/issue-types");
ok(it.body.departments.includes("Street Lights") && it.body.deptNames["Street Lights"].hi, "Issue types page gets the new type");
let pt = await call(S, "PATCH", "/api/admin/issue-types", { id: "other", suggestedDepartment: "Street Lights" });
ok(pt.status === 200, "issue type can suggest the new type", pt.body);
// rename keeps the key
let st = (await get(S, "lucknow")).body.types.find((t) => t.key === "Street Lights");
r = await post(S, { action: "type_rename", key: "Street Lights", expectedUpdatedAt: st.updatedAt, type: { nameEn: "Street Lighting", nameHi: "मार्ग प्रकाश विभाग", description: st.description } });
ok(r.status === 200, "type renamed", r.body);
g = await get(S, "lucknow");
st = g.body.types.find((t) => t.key === "Street Lights");
ok(st.nameEn === "Street Lighting" && g.body.offices.find((o) => o.id === slOffice).departments[0] === "Street Lights", "key unchanged, office still linked");
r = await post(S, { action: "type_rename", key: "Street Lights", expectedUpdatedAt: "old", type: { nameEn: "Street Lamps", nameHi: "मार्ग प्रकाश विभाग" } });
ok(r.status === 409 && r.body.code === "TYPE_STALE", "rename on older version refused", r.body);
r = await post(S, { action: "type_add", type: { nameEn: "street lights", nameHi: "नई लाइट" } });
ok(r.body.fields && r.body.fields.typeNameEn === "TAKEN", "old key can't be reused as a name", r.body);
// retire: blocked while used
r = await post(S, { action: "type_retire", key: "Street Lights", expectedUpdatedAt: st.updatedAt, reason: "No longer a separate department" });
ok(r.status === 409 && r.body.code === "TYPE_IN_USE" && r.body.usage.offices.length === 1 && r.body.usage.issueTypes.length === 1, "retire blocked while in use, users named", r.body);
let us = await call(S, "GET", "/api/admin/departments?typeUsage=" + encodeURIComponent("Street Lights"));
ok(us.body.usage.offices[0].name === "LMC Street Light Cell", "usage lookup (read only)");
r = await post(S, { action: "type_retire", key: "Other", expectedUpdatedAt: "x", reason: "Trying to retire Other" });
ok(r.status === 409 && r.body.code === "TYPE_OTHER", "Other can't be retired");
await call(S, "PATCH", "/api/admin/issue-types", { id: "other", suggestedDepartment: null });
let slo = (await get(S, "lucknow")).body.offices.find((o) => o.id === slOffice);
await post(S, { action: "retire", officeId: slOffice, expectedUpdatedAt: slo.updatedAt, reason: "Test office no longer needed" });
r = await post(S, { action: "type_retire", key: "Street Lights", expectedUpdatedAt: st.updatedAt, reason: "short" });
ok(r.status === 400 && r.body.fields.typeRetireReason === "SHORT", "retire needs a reason");
r = await post(S, { action: "type_retire", key: "Street Lights", expectedUpdatedAt: st.updatedAt, reason: "Merged into Nagar Nigam control room" });
ok(r.status === 200, "type retired once unused", r.body);
g = await get(S, "lucknow");
ok(!g.body.departments.includes("Street Lights") && g.body.types.find((t) => t.key === "Street Lights").retired && g.body.names["Street Lights"], "retired: not choosable, name still known");
r = await post(S, { action: "save", areaId: "lucknow", office: good({ nameEn: "Another Light Office", departments: ["Street Lights"] }) });
ok(r.body.fields && r.body.fields.departments === "FORMAT", "retired type can't be chosen");
pt = await call(S, "PATCH", "/api/admin/issue-types", { id: "other", suggestedDepartment: "Street Lights" });
ok(pt.status === 400, "issue type can't suggest a retired type");
st = g.body.types.find((t) => t.key === "Street Lights");
r = await post(S, { action: "type_restore", key: "Street Lights", expectedUpdatedAt: st.updatedAt });
ok(r.status === 200 && (await get(S, "lucknow")).body.departments.includes("Street Lights"), "type brought back");
// CSV can use the new type by its Hindi name
r = await post(S, { action: "import_check", areaId: "lucknow", csv: header + 'Lucknow,Light Cell 2,,मार्ग प्रकाश विभाग,ALL,1533,,,,,,,https://lmc.up.nic.in,2026-10-01,\n' });
ok(r.body.ok && r.body.rows[0].departments[0] === "Street Lights", "file can name the new type in Hindi", r.body);
// operator requests
r = await post(D, { action: "type_add", type: { nameEn: "Animal Control", nameHi: "पशु नियंत्रण विभाग" } });
ok(r.status === 400 && r.body.fields.typeReason === "REQUIRED", "operator gives a reason for a type");
r = await post(D, { action: "type_add", type: { nameEn: "Animal Control", nameHi: "पशु नियंत्रण विभाग", description: "Stray animals" }, reason: "Many complaints about stray cattle" });
ok(r.status === 200 && r.body.requested, "operator's new type becomes a request");
const reqT = r.body.requestId;
r = await post(D, { action: "type_add", type: { nameEn: "animal control", nameHi: "पशु विभाग" }, reason: "Same again by mistake" });
ok(r.body.fields && r.body.fields.typeNameEn === "WAITING", "same new type can't be requested twice");
ok(!(await get(S, "lucknow")).body.departments.includes("Animal Control"), "not added before approval");
ok((await get(S, "lucknow")).body.pending.some((p) => p.op === "type_add" && p.name === "Animal Control"), "waiting type shown");
ap = await call(D, "POST", "/api/admin/change-requests", { action: "approve", ids: [reqT] });
ok(ap.status === 403, "operator can't approve own type");
ap = await call(O, "POST", "/api/admin/change-requests", { action: "approve", ids: [reqT] });
ok(ap.body.results[0].result === "approved" && (await get(S, "lucknow")).body.departments.includes("Animal Control"), "approved type added", ap.body);
st = (await get(S, "lucknow")).body.types.find((t) => t.key === "Health");
r = await post(D, { action: "type_rename", key: "Health", expectedUpdatedAt: st.updatedAt, type: { nameEn: "Health & Hospitals", nameHi: "स्वास्थ्य एवं अस्पताल विभाग" }, reason: "Clearer name" });
const reqR = r.body.requestId;
await post(S, { action: "type_rename", key: "Health", expectedUpdatedAt: st.updatedAt, type: { nameEn: "Public Health", nameHi: "जन स्वास्थ्य विभाग" } });
ap = await call(O, "POST", "/api/admin/change-requests", { action: "approve", ids: [reqR] });
ok(ap.body.results[0].result === "out_of_date", "rename made against older version is out of date", ap.body);
let crl = await call(S, "GET", "/api/admin/change-requests?view=decided");
ok(crl.body.deptNames && crl.body.deptNames["Animal Control"].hi === "पशु नियंत्रण विभाग", "Change requests page gets type names");
ok((await get(A, "lucknow")).status === 200 && (await post(A, { action: "type_add", type: { nameEn: "X Type", nameHi: "एक्स" } })).status === 403, "auditor can't change types");


// ---- Departments stage 2: "Tell GrievIQ" and the directory sent to the rep console ----
r = await call("r1@x.in", "POST", "/api/dept-gap", { grievanceId: "g1", department: "Health" });
ok(r.status === 200 && r.body.ok && !r.body.already, "rep tells GrievIQ about a missing contact", r.body);
r = await call("r1@x.in", "POST", "/api/dept-gap", { grievanceId: "g1", department: "Health" });
ok(r.status === 200 && r.body.already, "same report within 7 days is not repeated", r.body);
r = await call("r2@x.in", "POST", "/api/dept-gap", { grievanceId: "g1", department: "Health" });
ok(r.status === 403, "rep of another ward can't report on this case", r.body);
r = await call("r1@x.in", "POST", "/api/dept-gap", { grievanceId: "g1", department: "Plumbing" });
ok(r.status === 400, "unknown department refused");
r = await call("", "POST", "/api/dept-gap", { grievanceId: "g1", department: "Health" });
ok(r.status === 401, "signed-out refused");
g = await get(S, "lucknow");
ok(g.body.gapReports.some((x) => x.unitId === "lu-hazratganj" && x.department === "Health" && x.by === "r1@x.in"), "admin sees the report", g.body.gapReports);
{
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const stmt = (sql, b) => ({ bind: (...x) => stmt(sql, x), all: async () => ({ results: sdb.prepare(sql).all(...(b || [])).map((r) => ({ ...r })) }),
    first: async () => { const r = sdb.prepare(sql).get(...(b || [])); return r ? { ...r } : null; } });
  const env = { DB: { prepare: (sql) => stmt(sql, []) } };
  const build = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/build-8788/api/grievances.js";
  const { directoryFor } = await import(build);
  const dir = await directoryFor(env, ["lu-hazratganj", "lu-knp1"]);
  ok(dir.units["lu-hazratganj"] === "lucknow" && dir.units["lu-knp1"] === "kanpur", "directory: ward -> area");
  ok(dir.areas.lucknow.state === "Uttar Pradesh", "directory: area state (for Jansunwai line)");
  ok(dir.offices.length > 0 && dir.offices.every((o) => !("source" in o) && !("officerConsentHow" in o)), "directory: offices in use, contacts only");
  ok(!dir.offices.some((o) => o.nameEn === "LMC Street Light Cell"), "directory: retired offices left out");
  ok(dir.offices.every((o) => o.officerPhone || !o.officerName), "directory: officer named only with an agreed number");
  const none = await directoryFor(env, []);
  ok(none.offices.length === 0, "directory: no cases, nothing sent");
}


// ---- Departments stage 3: the department step ----
{
  const R = "r1@x.in", OM = "om@x.in", FW = "fw@x.in";
  const fwd = (who, b) => call(who, "POST", "/api/grievances/g2/add-followup", b);
  const step = (who, b) => call(who, "POST", "/api/grievances/g2/dept-step", b);
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const steps = () => sdb.prepare("SELECT * FROM case_dept_steps WHERE grievance_id = 'g2' ORDER BY created_at, rowid").all();
  let r;
  r = await step(R, { kind: "SCHEDULED", expectedDate: "2030-01-01" });
  ok(r.status === 409 && r.body.code === "NOT_FORWARDED", "reply before forwarding refused", r.body);
  r = await fwd(R, { department: "Water Supply" });
  ok(r.status === 400 && r.body.fields.channel, "forwarding needs how the office was contacted", r.body);
  const kesco = (await get(S, "kanpur")).body.offices[0];
  r = await fwd(R, { department: "Water Supply", channel: "PHONE", officeId: kesco.id });
  ok(r.status === 400 && r.body.fields.office === "NOT_FOUND", "office from another area refused", r.body);
  const jal = (await get(S, "lucknow")).body.offices.find((o) => o.nameEn === "Jal Kal Vibhag Lucknow");
  r = await fwd(FW, { department: "Water Supply", channel: "PHONE", officeId: jal.id });
  ok(r.status === 403, "field worker can't forward", r.body);
  r = await fwd(OM, { department: "Water Supply", channel: "PHONE", officeId: jal.id, note: "Spoke to the duty clerk" });
  ok(r.status === 200, "office manager forwards to a directory office", r.body);
  let st = steps();
  ok(st.length === 1 && st[0].kind === "FORWARDED" && st[0].office_name === "Jal Kal Vibhag Lucknow" && st[0].channel === "PHONE" && st[0].by_office_tier === "LOCAL", "FORWARDED step recorded with office and channel", st[0]);
  ok(sdb.prepare("SELECT COUNT(*) n FROM grievance_events WHERE grievance_id='g2' AND event_type='FOLLOW_UP'").get().n === 1, "old follow-up record still written");
  r = await step(FW, { kind: "IN_PROGRESS" });
  ok(r.status === 403 && r.body.code === "ROLE", "field worker can't record the department's reply", r.body);
  r = await step(R, { kind: "SCHEDULED" });
  ok(r.status === 400 && r.body.fields.expectedDate === "REQUIRED", "date needed", r.body);
  r = await step(R, { kind: "SCHEDULED", expectedDate: "2020-01-01" });
  ok(r.body.fields && r.body.fields.expectedDate === "PAST", "past date refused");
  r = await step(R, { kind: "SCHEDULED", expectedDate: "2099-01-01" });
  ok(r.body.fields && r.body.fields.expectedDate === "TOO_FAR", "far date refused");
  const soon = new Date(Date.now() + 5.5 * 3600000 + 3 * 86400000).toISOString().slice(0, 10);
  r = await step(R, { kind: "SCHEDULED", expectedDate: soon, note: "Plumber booked" });
  ok(r.status === 200, "scheduled with a date", r.body);
  r = await step(R, { kind: "CHECK_NOT_FIXED", note: "Still leaking badly", photoIds: ["ph1"] });
  ok(r.status === 409 && r.body.code === "NO_CLAIM", "field check only after the department says done", r.body);
  r = await step(R, { kind: "CANT_DO", note: "short" });
  ok(r.status === 400 && r.body.fields.note === "REASON", "can't-do needs a reason", r.body);
  r = await step(OM, { kind: "DONE_CLAIMED" });
  ok(r.status === 200, "department says done", r.body);
  r = await step(R, { kind: "IN_PROGRESS" });
  ok(r.status === 200, "a later reply is still accepted", r.body);
  r = await step(R, { kind: "DONE_CLAIMED", note: "They called back" });
  r = await step(FW, { kind: "CHECK_NOT_FIXED", note: "Still leaking near the gate" });
  ok(r.status === 400 && r.body.fields.photos === "PHOTO_REQUIRED", "field check needs photos", r.body);
  r = await step(FW, { kind: "CHECK_NOT_FIXED", note: "short", photoIds: ["ph1"] });
  ok(r.status === 400 && r.body.fields.note === "CHECK_NOTE", "field check needs a note");
  r = await step(FW, { kind: "CHECK_NOT_FIXED", note: "Still leaking near the gate", photoIds: ["nope"] });
  ok(r.status === 400 && r.body.fields.photos === "PHOTO_MISSING", "unknown photo refused");
  r = await step(FW, { kind: "CHECK_NOT_FIXED", note: "Still leaking near the gate", photoIds: ["ph1"] });
  ok(r.status === 200, "assigned field worker records a failed check", r.body);
  st = steps();
  const failed = st[st.length - 1];
  const held = sdb.prepare("SELECT * FROM resolution_reports WHERE id = ?").get(failed.photo_report_id);
  ok(held && held.review_status === "FIELD_CHECK" && sdb.prepare("SELECT report_id FROM resolution_photos WHERE id='ph1'").get().report_id === held.id, "photos kept as field-check evidence, not as a resolution");
  // state after the failed check
  const build = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/build-8788/_shared/dept-steps.js";
  const ds = await import(build);
  let state = ds.deptState(st, { "Water Supply": 7 });
  ok(state.phase === "WITH_DEPT" && state.sentBack && state.officeName === "Jal Kal Vibhag Lucknow" && state.days === 7 && !state.overdue, "back with the department, clock restarted", state);
  // overdue maths
  const t0 = Date.parse("2026-10-01T06:30:00Z");
  const mk = (kind, at, extra) => Object.assign({ kind, created_at: new Date(at).toISOString(), department: "Water Supply", office_name: "X" }, extra || {});
  state = ds.deptState([mk("FORWARDED", t0)], { "Water Supply": 7 }, t0 + 8 * 86400000);
  ok(state.overdue && state.overdueDays === 1, "8 days after forwarding: 1 day overdue", state);
  state = ds.deptState([mk("FORWARDED", t0), mk("SCHEDULED", t0 + 86400000, { expected_date: "2026-10-12" })], { "Water Supply": 7 }, t0 + 9 * 86400000);
  ok(!state.overdue && state.expectedDate === "2026-10-12", "a later date given by the department moves the target", state);
  state = ds.deptState([mk("FORWARDED", t0), mk("NOT_OURS", t0 + 86400000, { suggested_department: "Electricity" })], {}, t0);
  ok(state.phase === "NEEDS_FORWARD" && state.suggestedDepartment === "Electricity", "not ours: needs forwarding");
  // not ours, then replies refused until forwarded again
  r = await step(R, { kind: "NOT_OURS", suggestedDepartment: "Electricity" });
  ok(r.status === 200, "not ours recorded", r.body);
  r = await step(R, { kind: "IN_PROGRESS" });
  ok(r.status === 409 && r.body.code === "REFORWARD", "after 'not ours', forward again first", r.body);
  r = await fwd(R, { department: "Electricity", channel: "WHATSAPP", officeName: "MVVNL sub-station Hazratganj" });
  ok(r.status === 200 && steps().pop().office_name === "MVVNL sub-station Hazratganj", "forwarded to an office not in the directory", r.body);
  r = await step(R, { kind: "DONE_CLAIMED" });
  // resolving with a department involved needs photos
  r = await call(R, "POST", "/api/grievances/g2/mark-resolved", { note: "Repaired by the department", noPhotoReason: "No camera available today" });
  ok(r.status === 400 && r.body.fields.photos === "PHOTO_REQUIRED", "no 'no photo' option once a department is involved", r.body);
  // targets per type
  const wsT = (await get(S, "lucknow")).body.types.find((t) => t.key === "Water Supply");
  r = await post(S, { action: "type_rename", key: "Water Supply", expectedUpdatedAt: wsT.updatedAt, type: { nameEn: wsT.nameEn, nameHi: wsT.nameHi, description: wsT.description, targetDays: 30 } });
  ok(r.status === 400 && r.body.fields.typeTargetDays === "RANGE", "target over 21 days refused", r.body);
  r = await post(S, { action: "type_rename", key: "Water Supply", expectedUpdatedAt: wsT.updatedAt, type: { nameEn: wsT.nameEn, nameHi: wsT.nameHi, description: wsT.description, targetDays: 3 } });
  ok(r.status === 200 && (await get(S, "lucknow")).body.types.find((t) => t.key === "Water Supply").targetDays === 3, "target days saved", r.body);
  const tg = await ds.targetDaysByType({ DB: { prepare: (sql) => ({ all: async () => ({ results: sdb.prepare(sql).all() }), bind: () => ({}) }) } });
  ok(tg["Water Supply"] === 3 && tg["Health"] === 7, "targets: set value and default 7", tg);
  // overdue reminder to the office that forwarded
  sdb.prepare("INSERT INTO grievances (id, tracking_ref, citizen_phone, local_unit_id, category_id, status, description, current_tier, created_at) VALUES ('g3','GRV-TEST03','9000000003','lu-hazratganj','water-sanitation','OPEN','x','LOCAL','2026-09-01T00:00:00Z')").run();
  sdb.prepare("INSERT INTO case_dept_steps (id, grievance_id, kind, department, office_name, channel, actor, actor_role, by_office_tier, by_office_id, created_at) VALUES ('s-old','g3','FORWARDED','Water Supply','Jal Kal','PHONE','r1@x.in','REPRESENTATIVE','LOCAL','lu-hazratganj','2026-09-01T00:00:00Z')").run();
  const stmt = (sql, b) => ({ bind: (...x) => stmt(sql, x), all: async () => ({ results: sdb.prepare(sql).all(...(b || [])).map((r) => ({ ...r })) }),
    first: async () => { const r = sdb.prepare(sql).get(...(b || [])); return r ? { ...r } : null; }, run: async () => { const r = sdb.prepare(sql).run(...(b || [])); return { meta: { changes: Number(r.changes) } }; } });
  const env2 = { DB: { prepare: (sql) => stmt(sql, []) } };
  const nt = await import((process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/build-8788/_shared/notify.js");
  const g3 = sdb.prepare("SELECT * FROM grievances WHERE id='g3'").get();
  const list = [{ g: g3, category: { id: "water-sanitation", name: "Water Supply / Sanitation" }, chain: { localUnit: { id: "lu-hazratganj", name: "Hazratganj-Ramtirth" }, tiers: [{ tier: "LOCAL", email: "r1@x.in", label: "Corporator" }] } }];
  let n1 = await nt.deptOverdueNotices(env2, "https://x", list, Date.now());
  let n2 = await nt.deptOverdueNotices(env2, "https://x", list, Date.now());
  const ns = sdb.prepare("SELECT recipient, kind FROM notifications WHERE grievance_id='g3'").all();
  ok(n1 === 2 && n2 === 0 && ns.length === 2 && ns.every((x) => x.kind === "DEPT_OVERDUE") && ns.some((x) => x.recipient === "om@x.in"), "overdue reminder to the rep and office manager, once", { n1, n2, ns });
  const txt = nt.noticeText({ kind: "DEPT_OVERDUE", tracking_ref: "GRV-TEST03", ward_name: "W", data: JSON.stringify({ dept: "Water Supply", office: "Jal Kal", days: 3 }) }, "hi");
  ok(/Jal Kal/.test(txt.title) && /3/.test(txt.body), "reminder text (Hindi)", txt);
  // field check passed: resolving with photos records CHECK_FIXED
  r = await call(R, "POST", "/api/grievances/g2/mark-resolved", { note: "Department fixed the line; checked on site", photoIds: ["ph2"] });
  ok(r.status === 200 && r.body.status === "PENDING_CONFIRMATION", "resolved after the field check", r.body);
  const lastS = steps().pop();
  ok(lastS.kind === "CHECK_FIXED" && lastS.photo_report_id && sdb.prepare("SELECT review_status FROM resolution_reports WHERE id=?").get(lastS.photo_report_id).review_status === null, "CHECK_FIXED step linked to the resolution report", lastS);
  r = await step(R, { kind: "IN_PROGRESS" });
  ok(r.status === 409 && r.body.code === "CLOSED", "no department steps once resolved", r.body);
}

// ---- citizen ratings (grieviq-30) ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const R = "r1@x.in", OM = "om@x.in", FW = "fw@x.in", CIT = "cit@x.in";
  const now = () => new Date().toISOString();
  const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
  sdb.prepare("UPDATE grievances SET citizen_email = ? WHERE id = 'g2'").run(CIT);
  const otp = (email) => sdb.prepare("INSERT INTO grievance_otp (id, phone, otp_code, purpose, verified, expires_at, email, channel, verified_at) VALUES (?, '', '', 'STATUS_CHECK', 1, ?, ?, 'EMAIL', ?)")
    .run("otp-" + Math.random(), now(), email, now());
  const rate = (b) => call("", "POST", "/api/grievances/rate", Object.assign({ email: CIT, trackingRef: "GRV-TEST02" }, b));
  const row = () => sdb.prepare("SELECT * FROM case_ratings WHERE grievance_id = 'g2'").get();
  let r = await rate({ office: "SATISFIED" });
  ok(r.status === 401, "rating needs the email code", r.body);
  otp(CIT);
  r = await rate({ office: "SATISFIED" });
  ok(r.status === 409 && r.body.code === "NOT_CLOSED", "no rating while waiting for the citizen to confirm", r.body);
  r = await call("", "POST", "/api/grievances/confirm-resolution", { email: CIT, trackingRef: "GRV-TEST02" });
  ok(r.status === 200, "citizen confirms the fix", r.body);
  let v = await call("", "POST", "/api/otp/verify", { email: CIT, trackingRef: "GRV-TEST02", open: true });
  ok(v.status === 200 && v.body.case.rating === null && v.body.case.ratingStatus.can && v.body.case.ratingStatus.mode === "NEW" && v.body.case.ratingDept && v.body.case.ratingDept.key === "Electricity" && v.body.case.ratingDept.officeName === "MVVNL sub-station Hazratganj", "Track page offers a rating, asking about the last department", v.body.case && { s: v.body.case.ratingStatus, d: v.body.case.ratingDept });
  r = await call("", "POST", "/api/grievances/rate", { email: "other@x.in", trackingRef: "GRV-TEST02", office: "SATISFIED" });
  ok(r.status === 401, "another email can't rate it", r.body);
  r = await rate({});
  ok(r.status === 400 && r.body.fields.office === "REQUIRED", "the office answer is required", r.body);
  r = await rate({ office: "GREAT", dept: "BAD" });
  ok(r.status === 400 && r.body.fields.office && r.body.fields.dept === "FORMAT", "only the five answers are accepted", r.body);
  r = await rate({ office: "SATISFIED", comment: "x".repeat(501) });
  ok(r.status === 400 && r.body.fields.comment === "LENGTH", "comment up to 500 characters", r.body);
  r = await rate({ office: "DISSATISFIED", dept: "VERY_DISSATISFIED", comment: "Took three weeks <b>and</b> two visits" });
  ok(r.status === 200 && r.body.rating.office === "DISSATISFIED" && r.body.ratingStatus.mode === "EDIT", "rating saved; can be changed", r.body);
  let x = row();
  ok(x.office_score === 2 && x.dept_score === 1 && x.low === 1 && x.department === "Electricity" && x.office_tier === "LOCAL" && x.office_id === "lu-hazratganj" && x.edit_count === 0, "stored: scores, low flag, department, resolving office", x);
  // who sees it
  const repList = await call(R, "GET", "/api/grievances");
  const g2r = repList.body.grievances.find((c) => c.id === "g2");
  ok(g2r && g2r.rating && g2r.rating.office === "DISSATISFIED" && g2r.rating.comment.includes("<b>") && g2r.rating.followedUpAt === undefined, "representative sees the rating (no follow-up details)", g2r && g2r.rating);
  const fwList = await call(FW, "GET", "/api/grievances");
  const g2f = fwList.body.grievances.find((c) => c.id === "g2");
  ok(!g2f || g2f.rating === null, "field worker doesn't see the rating", g2f && g2f.rating);
  // edits within 7 days
  r = await rate({ office: "SATISFIED", dept: "SATISFIED", comment: "" });
  x = row();
  ok(r.status === 200 && x.low === 0 && x.edit_count === 1 && x.comment === null, "changed to satisfied: no longer low", x);
  r = await rate({ office: "DISSATISFIED", dept: "DISSATISFIED", comment: "Changed my mind, the road was left dug up" });
  ok(r.status === 200 && row().low === 1, "changed back to low", row());
  // admin list
  let a = await call(S, "GET", "/api/admin/ratings");
  ok(a.status === 200 && a.body.counts.OPEN === 1 && a.body.items.length === 1 && a.body.items[0].trackingRef === "GRV-TEST02" && a.body.items[0].officeName === "Hazratganj-Ramtirth" && a.body.canFollowUp, "low rating on the admin list with the resolving office", a.body);
  ok(!JSON.stringify(a.body).includes(CIT), "no citizen email on the ratings list");
  const au = await call(A, "GET", "/api/admin/ratings");
  ok(au.status === 200 && !au.body.canFollowUp, "auditor reads");
  ok((await call(A, "POST", "/api/admin/ratings", { id: x.id, note: "Looked into it with the office" })).status === 403, "auditor can't follow up");
  ok((await call(D, "GET", "/api/admin/ratings")).status === 403 && (await call(M, "GET", "/api/admin/ratings")).status === 403, "data entry operator and moderator have no access");
  const dash = await call(S, "GET", "/api/admin/dashboard");
  ok(dash.body.lowRatingsOpen === 1, "dashboard counts low ratings waiting", dash.body.lowRatingsOpen);
  r = await call(S, "POST", "/api/admin/ratings", { id: x.id, note: "short" });
  ok(r.status === 400 && r.body.fields.note === "SHORT", "follow-up needs a note", r.body);
  r = await call(S, "POST", "/api/admin/ratings", { id: x.id, note: "Spoke to the office manager", updatedAt: "2000-01-01" });
  ok(r.status === 409 && r.body.code === "CHANGED", "follow-up refused if the citizen changed it meanwhile", r.body);
  x = row();
  r = await call(O, "POST", "/api/admin/ratings", { id: x.id, note: "Spoke to the office manager; road repair booked", updatedAt: x.updated_at });
  ok(r.status === 200, "operations admin marks it followed up", r.body);
  r = await call(S, "POST", "/api/admin/ratings", { id: x.id, note: "Second follow-up attempt here" });
  ok(r.status === 409 && r.body.code === "ALREADY", "only once", r.body);
  a = await call(S, "GET", "/api/admin/ratings");
  ok(a.body.counts.OPEN === 0 && a.body.counts.DONE === 1, "moves to Followed up", a.body.counts);
  const ac = await call(S, "GET", "/api/admin/cases?id=g2");
  ok(ac.body.case && ac.body.case.rating && ac.body.case.rating.low && ac.body.case.rating.followedUpBy === O, "admin case page shows the rating and follow-up", ac.body.case && ac.body.case.rating);
  r = await rate({ office: "VERY_DISSATISFIED", dept: "DISSATISFIED", comment: "Still dug up" });
  ok(r.status === 200 && row().followed_up_at === null, "a changed low rating goes back on the list", row());
  // locked after 7 days; a new round after reopening
  sdb.prepare("UPDATE case_ratings SET submitted_at = ? WHERE grievance_id = 'g2'").run(ago(8));
  r = await rate({ office: "SATISFIED" });
  ok(r.status === 409 && r.body.code === "LOCKED", "can't change after 7 days", r.body);
  v = await call("", "POST", "/api/otp/verify", { email: CIT, trackingRef: "GRV-TEST02", open: true });
  ok(v.body.case.rating && v.body.case.ratingStatus.can === false && v.body.case.ratingStatus.code === "LOCKED", "Track page shows the rating, no change button", v.body.case.ratingStatus);
  sdb.prepare("UPDATE case_ratings SET round_closed_at = ? WHERE grievance_id = 'g2'").run(ago(20));
  r = await rate({ office: "SATISFIED" });
  ok(r.status === 200 && row().edit_count === 0 && row().low === 0, "closed again after reopening: rated afresh", row());
  // too late: closed over 30 days ago
  sdb.prepare("INSERT INTO grievances (id, tracking_ref, citizen_phone, citizen_email, local_unit_id, category_id, status, description, current_tier, created_at, resolved_at, closed_at) VALUES ('g9','GRV-TEST09','9000000009',?,'lu-hazratganj','water-sanitation','RESOLVED','Old','LOCAL',?,?,?)").run(CIT, ago(60), ago(40), ago(33));
  r = await call("", "POST", "/api/grievances/rate", { email: CIT, trackingRef: "GRV-TEST09", office: "SATISFIED" });
  ok(r.status === 409 && r.body.code === "TOO_LATE", "no rating more than 30 days after closing", r.body);
  // office average from 5 ratings
  let ov = await call(R, "GET", "/api/overview?office=LOCAL:lu-hazratganj");
  ok(ov.status === 200 && ov.body.ratings && ov.body.ratings.count === 1 && ov.body.ratings.average === null, "overview: no average below 5 ratings", ov.body.ratings);
  [5, 4, 4, 5].forEach((sc, i) => {
    const id = "gr" + i;
    sdb.prepare("INSERT INTO grievances (id, tracking_ref, citizen_phone, local_unit_id, category_id, status, description, current_tier, created_at, resolved_at, closed_at) VALUES (?, ?, '9', 'lu-hazratganj', 'water-sanitation', 'RESOLVED', 'x', 'LOCAL', ?, ?, ?)").run(id, "GRV-R" + i, ago(9), ago(5), ago(4));
    sdb.prepare("INSERT INTO case_ratings (id, grievance_id, office_score, office_tier, office_id, low, submitted_at, updated_at, round_closed_at) VALUES (?, ?, ?, 'LOCAL', 'lu-hazratganj', 0, ?, ?, ?)").run("cr" + i, id, sc, now(), now(), ago(4));
  });
  ov = await call(R, "GET", "/api/overview?office=LOCAL:lu-hazratganj");
  ok(ov.body.ratings.count === 5 && ov.body.ratings.average === 4.4 && ov.body.ratings.word === "SATISFIED" && ov.body.ratings.byAnswer.VERY_SATISFIED === 2, "overview: average from 5 ratings", ov.body.ratings);
  const ovOm = await call(OM, "GET", "/api/overview?office=LOCAL:lu-hazratganj");
  ok(ovOm.body.ratings && ovOm.body.ratings.count === 5, "office manager sees the ratings too");
  // anonymising removes the comment
  sdb.prepare("UPDATE case_ratings SET comment = 'Personal remark', follow_up_note = 'Note' WHERE grievance_id = 'g2'").run();
  const rt = await import((process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/build-8788/_shared/retention.js");
  const st2 = (sql, b) => ({ sql, bind: (...y) => st2(sql, y), all: async () => ({ results: sdb.prepare(sql).all(...(b || [])).map((q) => ({ ...q })) }),
    first: async () => { const q = sdb.prepare(sql).get(...(b || [])); return q ? { ...q } : null; }, run: async () => { sdb.prepare(sql).run(...(b || [])); return { meta: {} }; } });
  const envA = { DB: { prepare: (sql) => st2(sql, []), batch: async (list) => Promise.all(list.map((q) => q.all())) } };
  const an = await rt.anonymiseStatements(envA, { id: "g2" }, "run-test", now());
  for (const q of an.stmts) if (/case_ratings|case_dept_steps/.test(q.sql)) await q.run();   // the two new tables (others need a retention run)
  const after = row();
  ok(after.comment === null && after.follow_up_note === null && sdb.prepare("SELECT COUNT(*) n FROM case_dept_steps WHERE grievance_id='g2' AND note IS NOT NULL").get().n === 0, "anonymising removes rating comments and department-step notes", after);
}

// ---- charts: admin case stats (grieviq-31) ----
{
  let r = await call(S, "GET", "/api/admin/case-stats");
  ok(r.status === 200 && Array.isArray(r.body.trend) && r.body.trend.length === 12 && r.body.ages.length === 4 && r.body.tiles && "lowRatings" in r.body.tiles, "case stats: shape", r.body);
  ok(r.body.areas.some((a) => a.id === "lucknow") && r.body.area === "ALL", "case stats: area list", r.body.areas);
  const tot = r.body.tiles.pending;
  ok(r.body.ages.reduce((a, b) => a + b, 0) === tot, "ages add up to pending", { ages: r.body.ages, tot });
  ok(!JSON.stringify(r.body).match(/@|9000000|Leaking/), "no emails, phones or complaint text");
  ok(r.body.receivedByType.every((x, i, a) => !i || a[i - 1].value >= x.value), "issue types sorted largest first");
  const k = await call(S, "GET", "/api/admin/case-stats?area=kanpur");
  ok(k.status === 200 && k.body.tiles.received + k.body.tiles.pending <= r.body.tiles.received + r.body.tiles.pending, "one area at a time", k.body.tiles);
  ok((await call(S, "GET", "/api/admin/case-stats?area=nowhere")).status === 404, "unknown area refused");
  ok((await call(A, "GET", "/api/admin/case-stats")).status === 200 && (await call(D, "GET", "/api/admin/case-stats")).status === 200, "auditor and data entry operator read the counts");
  ok((await call("nobody@test.in", "GET", "/api/admin/case-stats")).status === 403, "non-staff refused");
}

// ---- department dashboard (grieviq-32) ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const fs = await import("node:fs");
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const R = "r1@x.in", OFF = "je.zone3@nic.in";
  const now = new Date().toISOString();
  sdb.prepare("INSERT INTO grievances (id, tracking_ref, citizen_phone, citizen_email, local_unit_id, category_id, status, description, location_detail, pin_lat, pin_lng, current_tier, created_at) VALUES ('g20','GRV-DEPT20','9876500000','citizen20@x.in','lu-hazratganj','water-sanitation','OPEN','No water since Monday in Lane 4','Near the temple',26.85,80.94,'LOCAL',?)").run(now);
  const jal = (await get(S, "lucknow")).body.offices.find((o) => o.nameEn === "Jal Kal Vibhag Lucknow");
  let r = await call(R, "POST", "/api/grievances/g20/add-followup", { department: "Water Supply", channel: "PHONE", officeId: jal.id, note: "Please send the tanker today" });
  ok(r.status === 200, "case forwarded to the Jal Kal office", r.body);
  const dp = (b) => call(S, "POST", "/api/admin/dept-officers", b);
  // admin: agreement first, then officers
  r = await dp({ action: "officer_add", officeId: jal.id, name: "Asha Verma", designation: "Junior Engineer, Zone 3", email: OFF });
  ok(r.status === 409 && r.body.code === "NO_AGREEMENT", "no officers before the agreement", r.body);
  r = await dp({ action: "agreement_save", officeId: jal.id, signedOn: "2099-01-01", signedBy: "X", documentRef: "" });
  ok(r.status === 400 && r.body.fields.signedOn === "FUTURE" && r.body.fields.signedBy && r.body.fields.documentRef, "agreement fields checked", r.body);
  r = await dp({ action: "agreement_save", officeId: jal.id, signedOn: "2026-10-01", signedBy: "R. K. Singh, Executive Engineer", documentRef: "JK/GRV/2026/14, signed copy in office file" });
  ok(r.status === 200, "agreement recorded", r.body);
  ok((await call(A, "POST", "/api/admin/dept-officers", { action: "officer_add", officeId: jal.id, name: "X Y", designation: "AE", email: "x@nic.in" })).status === 403, "auditor can't add officers");
  ok((await call(D, "GET", "/api/admin/dept-officers?office=" + jal.id)).status === 403, "data entry operator can't see officers");
  ok((await call(A, "GET", "/api/admin/dept-officers?office=" + jal.id)).body.canManage === false, "auditor reads");
  r = await dp({ action: "officer_add", officeId: jal.id, name: "A", designation: "", email: "bad@" });
  ok(r.status === 400 && r.body.fields.name && r.body.fields.designation && r.body.fields.email === "FORMAT", "officer fields checked", r.body);
  r = await dp({ action: "officer_add", officeId: jal.id, name: "Asha Verma", designation: "Junior Engineer, Zone 3", email: "JE.Zone3@nic.in" });
  ok(r.status === 200, "officer added", r.body);
  const officerId = r.body.id;
  {
    // grieviq-38: a welcome email, with no case content
    const fsx = await import("node:fs");
    const wm = fsx.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to && m.to[0] === OFF && /Welcome/.test(m.subject)).slice(-1)[0];
    ok(r.body.welcomed === true && wm && /GrievIQ/.test(wm.html) && /स्वागत/.test(wm.subject) && /प्रिय/.test(wm.html) && /\/dept/.test(wm.html) && !/GRV-|Lane 4|9876500000/.test(wm.html), "officer gets a welcome email (English and Hindi, sign-in link, no case details)", wm && wm.subject);
    ok(wm && /Constituency Service &amp; Grievance Redressal Platform/.test(wm.html) && /How to use \(guide\)/.test(wm.html), "officer welcome: positioning line and where the guide is");
  }
  r = await dp({ action: "officer_add", officeId: jal.id, name: "Asha Verma", designation: "JE", email: OFF });
  ok(r.status === 400 && r.body.fields.email === "ALREADY_HERE", "same officer twice refused", r.body);
  // sign in with an emailed code
  const mails = () => fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const before = mails().length;
  r = await call("", "POST", "/api/dept/code", { email: "stranger@nic.in" });
  ok(r.status === 200 && r.body.sent && mails().length === before, "unknown email: same reply, no email sent", r.body);
  r = await call("", "POST", "/api/dept/code", { email: OFF });
  const m1 = mails().slice(-1)[0];
  const code = /(\d{6})/.exec(m1.subject)[1];
  ok(r.status === 200 && m1.to[0] === OFF && !/GRV-|Lane 4/.test(m1.html), "code emailed to the officer, nothing about cases", m1.subject);
  ok(sdb.prepare("SELECT code_hash FROM dept_codes WHERE email = ? ORDER BY created_at DESC").get(OFF).code_hash !== code, "only a hash of the code is stored");
  r = await call("", "POST", "/api/dept/verify", { email: OFF, code: code === "111111" ? "222222" : "111111" });
  ok(r.status === 401 && r.body.error === "INCORRECT" && r.body.triesLeft === 4, "wrong code: tries left", r.body);
  const vr = await fetch(B + "/api/dept/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: OFF, code }) });
  const setc = vr.headers.get("set-cookie") || "";
  ok(vr.status === 200 && /__Host-giq_dept=/.test(setc) && /HttpOnly/.test(setc) && /SameSite=Strict/.test(setc) && /Secure/.test(setc), "signed in: secure session cookie", setc);
  const CK = setc.split(";")[0];
  const dcall = async (method, path, body, ck) => { const x = await fetch(B + path, { method, headers: { cookie: ck === undefined ? CK : ck, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const t = await x.text(); let j; try { j = JSON.parse(t); } catch (e) { j = { raw: t }; } return { status: x.status, body: j }; };
  r = await call("", "POST", "/api/dept/verify", { email: OFF, code });
  ok(r.status === 401, "a code works once", r.body);
  ok((await dcall("GET", "/api/dept/cases", null, "")).status === 401, "no session: refused");
  // grieviq-37: rules for officers first
  r = await dcall("GET", "/api/dept/cases");
  ok(r.status === 403 && r.body.error === "RULES", "no cases until the rules are accepted", r.body);
  ok((await dcall("POST", "/api/dept/reply", { id: "g20", kind: "IN_PROGRESS" })).status === 403, "no replies until the rules are accepted");
  r = await dcall("GET", "/api/dept/rules");
  ok(r.status === 200 && r.body.version === "1" && r.body.pending === true && r.body.accepted === null, "rules: current version, not yet accepted", r.body);
  r = await dcall("POST", "/api/dept/rules", { version: "1" });
  ok(r.status === 400 && r.body.fields.agree, "rules: the box must be ticked", r.body);
  r = await dcall("POST", "/api/dept/rules", { version: "0", agree: true });
  ok(r.status === 409 && r.body.code === "VERSION", "rules: an old version can't be accepted", r.body);
  r = await dcall("POST", "/api/dept/rules", { version: "1", agree: true });
  ok(r.status === 200 && sdb.prepare("SELECT rules_version FROM dept_officers WHERE email = ?").get(OFF).rules_version === "1" &&
    sdb.prepare("SELECT COUNT(*) n FROM dept_access_log WHERE action = 'RULES_ACCEPTED'").get().n === 1, "rules accepted, recorded on the officer and in the log", r.body);
  ok((await dcall("GET", "/api/dept/rules")).body.accepted.version === "1", "rules: accepted version and date returned");
  // the list
  r = await dcall("GET", "/api/dept/cases");
  const row = r.body.cases && r.body.cases.find((c) => c.id === "g20");
  ok(r.status === 200 && r.body.me.name === "Asha Verma" && r.body.office.id === jal.id && row && row.bucket === "NEW" && r.body.tiles.newCases >= 1, "office's cases with tiles", r.body.tiles);
  ok(!JSON.stringify(r.body).match(/9876500000|citizen20@x\.in/), "no citizen phone or email in the list");
  ok(!r.body.cases.some((c) => c.id === "g1"), "other cases not listed");
  r = await dcall("GET", "/api/dept/case?id=g20");
  ok(r.status === 200 && r.body.case.description.includes("Lane 4") && r.body.case.pin && r.body.case.steps[0].note === "Please send the tanker today" && r.body.case.steps[0].by === "OFFICE" && r.body.case.canReply, "case detail: complaint, place, what the office asked", r.body.case);
  ok(!JSON.stringify(r.body).match(/9876500000|citizen20@x\.in|r1@x\.in/), "no citizen contact or staff email in the case");
  ok(sdb.prepare("SELECT COUNT(*) n FROM dept_access_log WHERE action = 'CASE_VIEWED' AND grievance_id = 'g20'").get().n === 1, "case opened is recorded");
  ok((await dcall("GET", "/api/dept/case?id=g1")).status === 404, "a case not sent to the office can't be opened");
  // replies
  r = await dcall("POST", "/api/dept/reply", { id: "g20", kind: "SCHEDULED" });
  ok(r.status === 400 && r.body.fields.expectedDate === "REQUIRED", "date needed", r.body);
  r = await dcall("POST", "/api/dept/reply", { id: "g20", kind: "CANT_DO", note: "no" });
  ok(r.status === 400 && r.body.fields.note === "REASON", "reason needed", r.body);
  const soon = new Date(Date.now() + 5.5 * 3600000 + 2 * 86400000).toISOString().slice(0, 10);
  r = await dcall("POST", "/api/dept/reply", { id: "g20", kind: "SCHEDULED", expectedDate: soon, note: "Tanker booked" });
  ok(r.status === 200, "officer schedules the work", r.body);
  let last = sdb.prepare("SELECT * FROM case_dept_steps WHERE grievance_id = 'g20' ORDER BY created_at DESC, rowid DESC").get();
  ok(last.kind === "SCHEDULED" && last.actor_role === "DEPARTMENT" && last.actor === OFF && last.by_office_id === jal.id && last.office_name === "Jal Kal Vibhag Lucknow", "step recorded as the department's", last);
  let nt = [];
  for (let i = 0; i < 40 && nt.length < 2; i++) { await new Promise((z) => setTimeout(z, 100)); nt = sdb.prepare("SELECT recipient, data FROM notifications WHERE grievance_id = 'g20' AND kind = 'DEPT_REPLY'").all(); }
  ok(nt.some((x) => x.recipient === R) && nt.some((x) => x.recipient === "om@x.in"), "representative's office told at once", nt);
  // a work photo, then "work done"
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
  const fd = new FormData(); fd.append("photo", new Blob([png], { type: "image/png" }), "w.png");
  const up = await fetch(B + "/api/dept/photo?id=g20", { method: "POST", headers: { cookie: CK }, body: fd });
  const upj = await up.json();
  ok(up.status === 200 && upj.id, "work photo uploaded", upj);
  r = await dcall("POST", "/api/dept/reply", { id: "g20", kind: "DONE_CLAIMED", photoIds: ["nope"] });
  ok(r.status === 400 && r.body.fields.photos === "PHOTO_MISSING", "unknown photo refused", r.body);
  r = await dcall("POST", "/api/dept/reply", { id: "g20", kind: "DONE_CLAIMED", note: "Pipe joint replaced", photoIds: [upj.id] });
  ok(r.status === 200, "officer reports the work done with a photo", r.body);
  last = sdb.prepare("SELECT * FROM case_dept_steps WHERE grievance_id = 'g20' ORDER BY created_at DESC, rowid DESC").get();
  const held = sdb.prepare("SELECT * FROM resolution_reports WHERE id = ?").get(last.photo_report_id);
  ok(held && held.review_status === "FIELD_CHECK" && held.submitted_role === "DEPARTMENT" && sdb.prepare("SELECT report_id FROM resolution_photos WHERE id = ?").get(upj.id).report_id === held.id, "photo kept beside the step, never as a resolution");
  ok(sdb.prepare("SELECT status FROM grievances WHERE id = 'g20'").get().status === "OPEN", "the department can't close the case");
  const rep = await call(R, "GET", "/api/grievances");
  const rc = rep.body.grievances.find((c) => c.id === "g20");
  const rs = rc.deptSteps[rc.deptSteps.length - 1];
  ok(rc.deptState.phase === "NEEDS_CHECK" && rs.byDept && rs.byDeptName === "Asha Verma" && rs.photos && rs.photos.length === 1, "rep console: needs the field check, shows who replied and the photo", rs);
  r = await dcall("GET", "/api/dept/cases");
  ok(r.body.cases.find((c) => c.id === "g20").bucket === "WAITING_CHECK", "officer sees: waiting for the check");
  r = await dcall("GET", "/api/dept/performance");
  ok(r.status === 200 && r.body.m.forwarded >= 1 && r.body.m.ownReplies.d >= 2 && r.body.trend.length === 12, "officer: own office's performance", r.body.m);
  // not ours: no more replies
  r = await dcall("POST", "/api/dept/reply", { id: "g20", kind: "NOT_OURS", suggestedDepartment: "Electricity" });
  ok(r.status === 200, "not ours", r.body);
  r = await dcall("POST", "/api/dept/reply", { id: "g20", kind: "IN_PROGRESS" });
  ok(r.status === 409 && r.body.code === "REFORWARD", "no replies after 'not ours'", r.body);
  // daily email: counts only
  const st2 = (sql, b) => ({ bind: (...y) => st2(sql, y), all: async () => ({ results: sdb.prepare(sql).all(...(b || [])).map((q) => ({ ...q })) }),
    first: async () => { const q = sdb.prepare(sql).get(...(b || [])); return q ? { ...q } : null; }, run: async () => { const q = sdb.prepare(sql).run(...(b || [])); return { meta: { changes: Number(q.changes) } }; } });
  const envD = { DB: { prepare: (sql) => st2(sql, []), batch: async (l) => Promise.all(l.map((q) => q.all())) } };
  sdb.prepare("INSERT INTO grievances (id, tracking_ref, citizen_phone, local_unit_id, category_id, status, description, pin_lat, pin_lng, current_tier, created_at) VALUES ('g21','GRV-DEPT21','9','lu-hazratganj','water-sanitation','OPEN','Second leak',26.85,80.94,'LOCAL',?)").run(now);
  await call(R, "POST", "/api/grievances/g21/add-followup", { department: "Water Supply", channel: "EMAIL", officeId: jal.id });
  const nf = await import((process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/build-8788/_shared/notify.js");
  const n1 = await nf.deptOfficerDigests(envD, "https://grieviq.in", Date.now());
  const n2 = await nf.deptOfficerDigests(envD, "https://grieviq.in", Date.now());
  const dig = sdb.prepare("SELECT * FROM email_outbox WHERE kind = 'DEPT_DIGEST'").all();
  ok(n1 === 1 && n2 === 0 && dig.length === 1 && dig[0].to_email === OFF && /1 new/.test(dig[0].html) && !/GRV-|leak/i.test(dig[0].html), "daily email: counts only, once a day", dig.map((x) => x.html.slice(0, 160)));
  // removal ends the session at once
  r = await call(S, "POST", "/api/admin/dept-officers", { action: "officer_remove", officerId, reason: "short" });
  ok(r.status === 400, "removal needs a reason", r.body);
  r = await call(O, "POST", "/api/admin/dept-officers", { action: "officer_remove", officerId, reason: "Transferred to another zone" });
  ok(r.status === 400 && r.body.fields.succ === "REQUIRED" && r.body.last === true && r.body.waiting >= 1, "grieviq-54: the office's only officer: successor or a recorded choice needed", r.body);
  r = await call(O, "POST", "/api/admin/dept-officers", { action: "officer_remove", officerId, reason: "Transferred to another zone", leaveEmpty: true });
  ok(r.status === 200 && r.body.leftEmpty && (await dcall("GET", "/api/dept/cases")).status === 401, "removed officer is signed out at once", r.body);
  // agreement ended: nobody from the office can sign in
  r = await dp({ action: "officer_add", officeId: jal.id, name: "Ravi Kumar", designation: "Assistant Engineer", email: "ae.zone3@nic.in" });
  ok(r.status === 200, "second officer added");
  r = await dp({ action: "agreement_end", officeId: jal.id, reason: "Department withdrew from the pilot" });
  ok(r.status === 200, "agreement ended", r.body);
  await call("", "POST", "/api/dept/code", { email: "ae.zone3@nic.in" });
  const m2 = mails().slice(-1)[0];
  ok(!(m2.to && m2.to[0] === "ae.zone3@nic.in" && /code/i.test(m2.subject)), "no code emailed once the agreement ended");
  const g = await call(S, "GET", "/api/admin/dept-officers?office=" + jal.id);
  ok(g.body.agreement.endedAt && g.body.officers.length === 2 && g.body.activity.some((x) => x.action === "REPLIED" && x.trackingRef === "GRV-DEPT20" && x.kind === "DONE_CLAIMED"), "admin sees the agreement, officers and activity", g.body.activity.slice(0, 3));
  const ev = sdb.prepare("SELECT action FROM admin_events WHERE action LIKE 'dept_officer%' OR action LIKE 'dept_agreement%'").all().map((x) => x.action);
  ok(["dept_agreement_recorded", "dept_officer_added", "dept_officer_removed", "dept_agreement_ended"].every((a) => ev.includes(a)), "every change logged", ev);
  // restore for the browser tests: agreement back, second officer active
  await dp({ action: "agreement_save", officeId: jal.id, signedOn: "2026-10-01", signedBy: "R. K. Singh, Executive Engineer", documentRef: "JK/GRV/2026/14" });
}

// ---- department performance (grieviq-33) ----
{
  const dp = await import((process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/build-8788/_shared/dept-performance.js");
  const now = Date.now(), D = 86400000, t0 = now - 20 * D;
  const S_ = (kind, ms, x) => Object.assign({ kind, created_at: new Date(ms).toISOString(), department: "Water Supply", office_id: "o1", office_name: "Office One", by_office_tier: "LOCAL", by_office_id: "lu-hazratganj", actor_role: "REPRESENTATIVE" }, x || {});
  const G = (id, status) => ({ id, tracking_ref: "R-" + id, status: status || "OPEN", local_unit_id: "lu-hazratganj", reopen_count: 0 });
  const cases = [
    { g: G("c1", "RESOLVED"), steps: [S_("FORWARDED", t0), S_("SCHEDULED", t0 + D, { expected_date: new Date(t0 + 4 * D).toISOString().slice(0, 10) }), S_("DONE_CLAIMED", t0 + 5 * D), S_("CHECK_FIXED", t0 + 6 * D)] },
    { g: G("c2", "RESOLVED"), steps: [S_("FORWARDED", t0), S_("DONE_CLAIMED", t0 + 10 * D), S_("CHECK_NOT_FIXED", t0 + 11 * D), S_("DONE_CLAIMED", t0 + 13 * D), S_("CHECK_FIXED", t0 + 14 * D)] },
    { g: G("c3"), steps: [S_("FORWARDED", t0), S_("IN_PROGRESS", t0 + 2 * D)] },
    { g: G("c4"), steps: [S_("FORWARDED", t0), S_("NOT_OURS", t0 + D), S_("FORWARDED", t0 + 2 * D, { office_id: "o2", office_name: "Office Two" })] },
    { g: G("c5"), steps: [S_("FORWARDED", now - 2 * D)] },
    { g: G("c6", "RESOLVED"), steps: [S_("FORWARDED", t0), S_("DONE_CLAIMED", t0 + 3 * D, { actor_role: "DEPARTMENT" }), S_("CHECK_FIXED", t0 + 4 * D)] },
  ];
  const as = dp.assignmentsOf(cases, { "Water Supply": 7 }, new Map([["c6", { dept_score: 2, department: "Water Supply" }]]), now);
  const o1 = as.filter((a) => a.officeId === "o1"), o2 = as.filter((a) => a.officeId === "o2");
  ok(o1.length === 6 && o2.length === 1 && o2[0].withNow, "each forwarding is its own assignment; 'not ours' starts fresh at the next office");
  const m = dp.measures(o1, now - 30 * D, now);
  ok(m.forwarded === 6 && m.withNow === 2 && m.overdueNow === 1, "volume: forwarded, with the office now, overdue now", m);
  ok(m.onTime.d === 4 && m.onTime.n === 2 && m.onTime.pct === null, "on time: decided cases only, 'not ours' left out; no share below 5", m.onTime);
  ok(m.firstReply.n === 5 && m.firstReply.median === 2, "first reply: median days", m.firstReply);
  ok(m.fixedFirst.d === 3 && m.fixedFirst.n === 2 && m.toFixed.n === 3, "field check first time and time to fixed", { ff: m.fixedFirst, tf: m.toFixed });
  ok(m.ownReplies.d === 7 && m.ownReplies.n === 1 && m.ownReplies.pct === 14.3, "replies made by the department itself", m.ownReplies);
  ok(m.notOurs === 1 && m.rating.count === 1 && m.rating.average === null, "not ours counted; rating needs 5", m);
  const big = dp.measures(o1.concat(o1, o1), now - 30 * D, now);
  ok(big.onTime.pct === 50 && big.firstReply.median === 2, "shares and medians from 5 cases", big.onTime);
  const tr = dp.monthlyDept(o1, new Date(now + 5.5 * 3600000).toISOString().slice(0, 10));
  ok(tr.length === 12 && tr.reduce((s, x) => s + x.received, 0) === 6 && tr.reduce((s, x) => s + x.resolved, 0) === 3, "12 months: forwarded and fixed", tr.slice(-2));
  // endpoints
  let r = await call(S, "GET", "/api/admin/dept-performance?area=lucknow");
  ok(r.status === 200 && r.body.rows.some((x) => x.name === "Jal Kal Vibhag Lucknow" && x.inDirectory) && r.body.total && r.body.min === 5, "admin: rows by office", r.body.rows && r.body.rows.map((x) => x.name));
  ok(!JSON.stringify(r.body).match(/9876500000|citizen20@x\.in|Lane 4/), "no citizen data or complaint text");
  const jalRow = r.body.rows.find((x) => x.name === "Jal Kal Vibhag Lucknow");
  r = await call(S, "GET", "/api/admin/dept-performance?area=lucknow&detail=" + encodeURIComponent(jalRow.key));
  ok(r.body.detail && r.body.detail.trend.length === 12 && Array.isArray(r.body.detail.overdue), "admin: office detail with 12 months", r.body.detail && r.body.detail.overdue);
  r = await call(S, "GET", "/api/admin/dept-performance?area=lucknow&by=type");
  ok(r.body.by === "type" && r.body.rows.some((x) => x.department === "Water Supply"), "admin: by department type", r.body.rows.map((x) => x.department));
  r = await call(S, "GET", "/api/admin/dept-performance?from=2026-13-01");
  ok(r.status === 400 && r.body.fields.from, "dates checked", r.body);
  const csvR = await fetch(B + "/api/admin/dept-performance?area=lucknow&format=csv", { headers: { "test-email": S } });
  const csvT = await csvR.text();
  ok(csvR.headers.get("content-type").includes("text/csv") && csvT.includes("Work done on time %") && csvT.includes("Jal Kal Vibhag Lucknow"), "CSV download");
  ok((await call(A, "GET", "/api/admin/dept-performance")).status === 200 && (await call(D, "GET", "/api/admin/dept-performance")).status === 403 && (await call(M, "GET", "/api/admin/dept-performance")).status === 403, "auditor reads; operators and moderators don't");
  const ov = await call("r1@x.in", "GET", "/api/overview?office=LOCAL:lu-hazratganj");
  ok(ov.body.departments && ov.body.departments.rows.some((x) => x.name === "Jal Kal Vibhag Lucknow"), "rep overview: departments on the office's cases", ov.body.departments);
  const ovFw = await call("fw@x.in", "GET", "/api/overview?office=LOCAL:lu-hazratganj");
  ok(ovFw.status === 403 || !ovFw.body.departments, "field worker: no department figures");
}

// ---- forwarding through the dashboard; checks on department photos (grieviq-34) ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const fs = await import("node:fs");
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const mails = () => fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const R = "r1@x.in", OFF2 = "ae.zone3@nic.in";
  const now = new Date().toISOString();
  sdb.prepare("INSERT INTO grievances (id, tracking_ref, citizen_phone, local_unit_id, category_id, status, description, pin_lat, pin_lng, current_tier, created_at) VALUES ('g22','GRV-DEPT22','9876511111','lu-hazratganj','water-sanitation','OPEN','Broken main on Station Road',26.85,80.94,'LOCAL',?)").run(now);
  const jal = (await get(S, "lucknow")).body.offices.find((o) => o.nameEn === "Jal Kal Vibhag Lucknow");
  let list = await call(R, "GET", "/api/grievances");
  const dir = list.body.deptDirectory.offices;
  ok(dir.find((o) => o.id === jal.id).hasDashboard === true && dir.filter((o) => o.id !== jal.id).every((o) => o.hasDashboard === false), "directory says which offices use the dashboard", dir.map((o) => [o.nameEn, o.hasDashboard]));
  let r = await call(R, "POST", "/api/grievances/g22/add-followup", { department: "Water Supply", channel: "DASHBOARD", officeName: "Some other office" });
  ok(r.status === 400 && r.body.fields.channel === "NO_DASHBOARD", "dashboard only for an office on the dashboard", r.body);
  const before = sdb.prepare("SELECT COUNT(*) n FROM email_outbox WHERE kind = 'DEPT_NEW'").get().n;
  r = await call(R, "POST", "/api/grievances/g22/add-followup", { department: "Water Supply", channel: "DASHBOARD", officeId: jal.id, note: "Main burst near the station" });
  ok(r.status === 200 && r.body.officersEmailed === true, "forwarded through the dashboard", r.body);
  let ob = [];
  for (let i = 0; i < 40 && ob.length < 1; i++) { await new Promise((z) => setTimeout(z, 100)); ob = sdb.prepare("SELECT * FROM email_outbox WHERE kind = 'DEPT_NEW'").all().slice(before); }
  ok(ob.length === 1 && ob[0].to_email === OFF2 && !/GRV-|Station|burst|9876511111/i.test(ob[0].html) && /\/dept/.test(ob[0].html), "the office's officer emailed at once, link only", ob.map((x) => x.to_email));
  let sent = false;
  for (let i = 0; i < 150 && !sent; i++) { await new Promise((z) => setTimeout(z, 100)); sent = mails().some((m) => m.to && m.to[0] === OFF2 && /new complaint/i.test(m.subject)); }
  ok(sent, "the email went out without waiting for the hourly job");
  ok(sdb.prepare("SELECT channel FROM case_dept_steps WHERE grievance_id = 'g22' AND kind = 'FORWARDED'").get().channel === "DASHBOARD", "channel recorded");
  // officer signs in, adds a photo from far away
  await call("", "POST", "/api/dept/code", { email: OFF2 });
  const code = /(\d{6})/.exec(mails().filter((m) => m.to && m.to[0] === OFF2).slice(-1)[0].subject)[1];
  const vr = await fetch(B + "/api/dept/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: OFF2, code }) });
  const CK = (vr.headers.get("set-cookie") || "").split(";")[0];
  ok(vr.status === 200 && CK, "second officer signed in");
  await fetch(B + "/api/dept/rules", { method: "POST", headers: { cookie: CK, "content-type": "application/json" }, body: JSON.stringify({ version: "1", agree: true }) });
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 3, 4, 5, 6, 7, 8]);
  const fd = new FormData(); fd.append("photo", new Blob([png], { type: "image/png" }), "w.png");
  fd.append("dev_status", "OK"); fd.append("dev_lat", "26.4499"); fd.append("dev_lng", "80.3318"); fd.append("dev_acc", "12");
  const up = await fetch(B + "/api/dept/photo?id=g22", { method: "POST", headers: { cookie: CK }, body: fd });
  const upj = await up.json();
  const far = (upj.warnings || []).find((w) => w.code === "DEVICE_FAR_FROM_PIN");
  ok(up.status === 200 && far && far.metres > 50000 && far.accuracy === 12 && upj.warnings.some((w) => w.code === "NO_DATE"), "officer sees the checks at once: far from the spot, no date", upj.warnings);
  const p2 = sdb.prepare("SELECT dev_status, dev_lat, dev_lng FROM resolution_photos WHERE id = ?").get(upj.id);
  ok(p2.dev_status === "OK" && Math.abs(p2.dev_lat - 26.4499) < 1e-4, "officer's location kept with the photo", p2);
  const fd2 = new FormData(); fd2.append("photo", new Blob([png.map((b, i) => (i === 15 ? 77 : b))], { type: "image/png" }), "x.png"); fd2.append("dev_status", "DENIED");
  const up2 = await (await fetch(B + "/api/dept/photo?id=g22", { method: "POST", headers: { cookie: CK }, body: fd2 })).json();
  ok(up2.warnings && up2.warnings.some((w) => w.code === "DEVICE_NOT_SHARED"), "location refused: said so, photo still added", up2);
  r = await (async () => { const x = await fetch(B + "/api/dept/reply", { method: "POST", headers: { cookie: CK, "content-type": "application/json" }, body: JSON.stringify({ id: "g22", kind: "DONE_CLAIMED", photoIds: [upj.id] }) }); return { status: x.status, body: await x.json() }; })();
  ok(r.status === 200, "work done with the photo", r.body);
  const dc = await (await fetch(B + "/api/dept/case?id=g22", { headers: { cookie: CK } })).json();
  const dstep = dc.case.steps.find((x) => x.kind === "DONE_CLAIMED");
  ok(dstep.photos[0].warnings.some((w) => w.code === "DEVICE_FAR_FROM_PIN"), "officer's history keeps the checks", dstep.photos[0]);
  list = await call(R, "GET", "/api/grievances");
  const rc = list.body.grievances.find((c) => c.id === "g22");
  const rs = rc.deptSteps.find((x) => x.kind === "DONE_CLAIMED");
  ok(rs.photos[0].warnings && rs.photos[0].warnings.some((w) => w.code === "DEVICE_FAR_FROM_PIN") && !JSON.stringify(rs.photos[0].warnings).includes("otherCaseId"), "representative sees the same checks on the department's photo", rs.photos[0].warnings);
  const fwdStep = rc.deptSteps.find((x) => x.kind === "FORWARDED");
  ok(fwdStep.channel === "DASHBOARD" && !fwdStep.photos, "forwarding step shows the channel", fwdStep);
}

// ---- alerts and the bell for department officers (grieviq-35) ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const fs = await import("node:fs");
  const WORK = process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests";
  const pushes = () => fs.readFileSync(WORK + "/push.log", "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const R = "r1@x.in", OFF2 = "ae.zone3@nic.in";
  const now = new Date().toISOString();
  const jal = (await get(S, "lucknow")).body.offices.find((o) => o.nameEn === "Jal Kal Vibhag Lucknow");
  const ravi = sdb.prepare("SELECT id FROM dept_officers WHERE email = ? AND status = 'ACTIVE'").get(OFF2).id;
  const ME = "dept:" + ravi;
  // sign in with a code made directly (the 3-codes-per-15-minutes limit is for asking)
  const code = "246801";
  sdb.prepare("INSERT INTO dept_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run("api35", OFF2, createHash("sha256").update(OFF2 + ":" + code).digest("hex"), new Date(Date.now() + 600000).toISOString(), new Date(Date.now() + 5000).toISOString());
  const vr = await fetch(B + "/api/dept/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: OFF2, code }) });
  const CK = (vr.headers.get("set-cookie") || "").split(";")[0];
  ok(vr.status === 200, "officer signed in for the bell tests");
  sdb.prepare("DELETE FROM dept_codes WHERE id = 'api35'").run();   // keep the browser tests under the code limit
  const dn = async (method, body, ck) => { const x = await fetch(B + "/api/dept/notifications", { method, headers: { cookie: ck === undefined ? CK : ck, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };
  // the forwarding in the grieviq-34 tests left an alert in the bell
  let r = await dn("GET");
  const n22 = r.body.items && r.body.items.find((x) => x.kind === "DEPT_O_NEW" && x.ref === "GRV-DEPT22");
  ok(r.status === 200 && n22 && !n22.read && r.body.unread >= 1 && r.body.push.configured && r.body.push.key, "officer's bell: new complaint for the office", r.body.items && r.body.items.map((x) => x.kind + ":" + x.ref));
  ok(!JSON.stringify(r.body).match(/Station Road|9876511111/), "bell has no complaint text or phone");
  ok((await dn("GET", null, "")).status === 401, "bell needs the officer's sign-in");
  const repBell = await call(R, "GET", "/api/notifications");
  ok(!repBell.body.items.some((x) => /^DEPT_O_/.test(x.kind)), "officer alerts never in a representative's bell");
  ok(sdb.prepare("SELECT COUNT(*) n FROM notifications WHERE recipient = ?").get(OFF2).n === 0, "filed under the officer, not the email");
  r = await dn("POST", { action: "read", ids: [n22.id] });
  ok(r.status === 200 && !(await dn("GET")).body.items.find((x) => x.id === n22.id).read === false, "marked read");
  // phone alerts on
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const p256dh = Buffer.from(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey))).toString("base64url");
  const authKey = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  const EP = "https://fcm.googleapis.com/fcm/send/ravi-phone-1";
  r = await dn("POST", { action: "subscribe", subscription: { endpoint: "https://evil.example/x", keys: { p256dh, auth: authKey } } });
  ok(r.status === 400 && r.body.code === "BAD_ENDPOINT", "only real push services", r.body);
  r = await dn("POST", { action: "subscribe", subscription: { endpoint: EP, keys: { p256dh, auth: authKey } }, lang: "hi", device: "Android · Chrome" });
  ok(r.status === 200 && sdb.prepare("SELECT email FROM push_subscriptions WHERE endpoint = ?").get(EP).email === ME, "alerts turned on for the officer's phone", r.body);
  const p0 = pushes().length;
  r = await dn("POST", { action: "test" });
  ok(r.status === 200 && r.body.ok && pushes().length === p0 + 1 && pushes().slice(-1)[0].endpoint === EP && pushes().slice(-1)[0].auth.startsWith("vapid"), "test alert sent, signed", r.body);
  // a new case forwarded: alert at once, no email to this officer
  sdb.prepare("INSERT INTO grievances (id, tracking_ref, citizen_phone, local_unit_id, category_id, status, description, pin_lat, pin_lng, current_tier, created_at) VALUES ('g23','GRV-DEPT23','9876522222','lu-hazratganj','water-sanitation','OPEN','Sewer overflow near the school',26.85,80.94,'LOCAL',?)").run(now);
  const mailsBefore = sdb.prepare("SELECT COUNT(*) n FROM email_outbox WHERE kind = 'DEPT_NEW' AND to_email = ?").get(OFF2).n;
  const p1 = pushes().length;
  r = await call(R, "POST", "/api/grievances/g23/add-followup", { department: "Water Supply", channel: "DASHBOARD", officeId: jal.id });
  ok(r.status === 200, "forwarded", r.body);
  let nrow = null;
  for (let i = 0; i < 60 && !(nrow && nrow.pushed_at); i++) { await new Promise((z) => setTimeout(z, 100)); nrow = sdb.prepare("SELECT * FROM notifications WHERE recipient = ? AND grievance_id = 'g23' AND kind = 'DEPT_O_NEW'").get(ME); }
  ok(nrow && nrow.pushed_at && pushes().length > p1 && pushes().slice(p1).some((x) => x.endpoint === EP), "officer's phone alerted at once", nrow);
  await new Promise((z) => setTimeout(z, 300));
  ok(sdb.prepare("SELECT COUNT(*) n FROM email_outbox WHERE kind = 'DEPT_NEW' AND to_email = ?").get(OFF2).n === mailsBefore, "no email when the phone took the alert");
  const nf = await import(WORK + "/build-8788/_shared/notify.js");
  const t = nf.noticeText(nrow, "en"), th = nf.noticeText(nrow, "hi");
  ok(t.title === "New complaint for your office: GRV-DEPT23" && !/Sewer|9876522222/.test(t.title + t.body) && /आपके कार्यालय/.test(th.title), "alert wording: reference, ward, type only", [t, th]);
  ok(nf.noticeUrl(nrow) === "/dept#case=g23&n=" + nrow.id, "alert opens the case on the department dashboard");
  // sent back after the field check
  const dcall = async (path, body) => { const x = await fetch(B + path, { method: "POST", headers: { cookie: CK, "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  r = await dcall("/api/dept/reply", { id: "g23", kind: "DONE_CLAIMED", note: "Line cleared" });
  ok(r.status === 200, "officer: work done", r.body);
  sdb.prepare("INSERT INTO resolution_photos (id, grievance_id, report_id, r2_key, content_type, sha256, uploaded_by, created_at) VALUES ('ph23','g23',NULL,'x/ph23.jpg','image/jpeg','ab23',?,?)").run(R, now);
  r = await call(R, "POST", "/api/grievances/g23/dept-step", { kind: "CHECK_PARTLY", note: "Overflow reduced but still there", photoIds: ["ph23"] });
  ok(r.status === 200, "representative: partly fixed, sent back", r.body);
  let back = null;
  for (let i = 0; i < 60 && !back; i++) { await new Promise((z) => setTimeout(z, 100)); back = sdb.prepare("SELECT * FROM notifications WHERE recipient = ? AND grievance_id = 'g23' AND kind = 'DEPT_O_BACK'").get(ME); }
  ok(back && JSON.parse(back.data).partly === true && /partly fixed/.test(nf.noticeText(back, "en").body), "officer alerted: sent back, partly fixed", back);
  // past the target time: once
  sdb.prepare("INSERT INTO grievances (id, tracking_ref, citizen_phone, local_unit_id, category_id, status, description, current_tier, created_at) VALUES ('g24','GRV-DEPT24','9','lu-hazratganj','water-sanitation','OPEN','Old leak',?,?)").run("LOCAL", now);
  await call(R, "POST", "/api/grievances/g24/add-followup", { department: "Water Supply", channel: "PHONE", officeId: jal.id });
  sdb.prepare("UPDATE case_dept_steps SET created_at = ? WHERE grievance_id = 'g24'").run(new Date(Date.now() - 30 * 86400000).toISOString());
  const st2 = (sql, b) => ({ bind: (...y) => st2(sql, y), all: async () => ({ results: sdb.prepare(sql).all(...(b || [])).map((q) => ({ ...q })) }),
    first: async () => { const q = sdb.prepare(sql).get(...(b || [])); return q ? { ...q } : null; }, run: async () => { const q = sdb.prepare(sql).run(...(b || [])); return { meta: { changes: Number(q.changes) } }; } });
  const envD = { DB: { prepare: (sql) => st2(sql, []), batch: async (l) => Promise.all(l.map((q) => q.all())) } };
  const jur = await import(WORK + "/build-8788/_shared/jurisdiction.js");
  const g24 = sdb.prepare("SELECT * FROM grievances WHERE id = 'g24'").get();
  const item = { g: { ...g24 }, category: { id: "water-sanitation", name: "Water Supply / Sanitation" }, chain: await jur.resolveChain(envD, "lu-hazratganj") };
  await nf.deptOverdueNotices(envD, "https://grieviq.in", [item], Date.now());
  await nf.deptOverdueNotices(envD, "https://grieviq.in", [item], Date.now());
  const late = sdb.prepare("SELECT * FROM notifications WHERE recipient = ? AND grievance_id = 'g24' AND kind = 'DEPT_O_LATE'").all(ME);
  ok(late.length === 1 && /Past the target time: GRV-DEPT24/.test(nf.noticeText(late[0], "en").title), "officer alerted once when past the target", late.length);
  ok(sdb.prepare("SELECT COUNT(*) n FROM notifications WHERE grievance_id = 'g24' AND kind = 'DEPT_OVERDUE'").get().n >= 1, "representative's office still told too");
  // the 6-hour reminder email never goes to an officer's notices
  await nf.reminderEmails(envD, "https://grieviq.in", Date.now() + 7 * 3600000);
  ok(sdb.prepare("SELECT COUNT(*) n FROM email_outbox WHERE to_email LIKE 'dept:%'").get().n === 0, "no reminder email addressed to an officer's notices");
  // removing an officer stops their alerts at once
  r = await call(S, "POST", "/api/admin/dept-officers", { action: "officer_add", officeId: jal.id, name: "Sunil Rao", designation: "Junior Engineer", email: "je.zone4@nic.in" });
  const sunil = r.body.id;
  sdb.prepare("INSERT INTO push_subscriptions (id, email, endpoint, p256dh, auth, created_at) VALUES ('ps-sunil', ?, 'https://fcm.googleapis.com/fcm/send/sunil', ?, ?, ?)").run("dept:" + sunil, p256dh, authKey, now);
  r = await call(S, "POST", "/api/admin/dept-officers", { action: "officer_remove", officerId: sunil, reason: "Moved to another zone office" });
  ok(r.status === 200 && !sdb.prepare("SELECT id FROM push_subscriptions WHERE id = 'ps-sunil'").get() && sdb.prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?").get(EP), "removed officer's devices dropped; others kept");
  r = await dn("POST", { action: "unsubscribe", endpoint: EP });
  ok(r.status === 200 && !sdb.prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?").get(EP), "officer turns alerts off");
}

// ---- the agreement inside GrievIQ (grieviq-37) ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const jal = (await get(S, "lucknow")).body.offices.find((o) => o.nameEn === "Jal Kal Vibhag Lucknow");
  const other = (await get(S, "lucknow")).body.offices.find((o) => o.nameEn !== "Jal Kal Vibhag Lucknow" && !sdb.prepare("SELECT 1 FROM dept_agreements WHERE office_id = ?").get(o.id));
  const upload = async (who, office, bytes, type) => {
    const fd = new FormData(); fd.append("file", new Blob([bytes], { type: type || "application/pdf" }), "signed.pdf");
    const x = await fetch(B + "/api/admin/dept-agreement-copy?office=" + encodeURIComponent(office), { method: "POST", headers: { "test-email": who }, body: fd });
    return { status: x.status, body: await x.json() };
  };
  const pdf = new TextEncoder().encode("%PDF-1.4\n% signed agreement test\n%%EOF\n");
  let r = await call(S, "GET", "/api/admin/dept-officers?office=" + jal.id);
  ok(r.body.rulesVersion === "1" && r.body.office.areaName === "Lucknow" && r.body.agreement && r.body.agreement.copy === null, "admin: rules version, office place, no signed copy yet", r.body.office);
  const ravi = r.body.officers.find((x) => x.email === "ae.zone3@nic.in");
  ok(ravi && ravi.rulesVersion === "1" && ravi.rulesAcceptedAt, "admin sees the officer accepted the rules", ravi);
  if (other) { r = await upload(S, other.id, pdf); ok(r.status === 409 && r.body.code === "NO_AGREEMENT", "no signed copy before the agreement is recorded", r.body); }
  r = await upload(S, jal.id, new TextEncoder().encode("hello, not a pdf"), "application/pdf");
  ok(r.status === 400 && r.body.code === "BAD_TYPE", "only PDF or images", r.body);
  r = await upload(D, jal.id, pdf);
  ok(r.status === 403, "data entry operator can't upload");
  r = await upload(A, jal.id, pdf);
  ok(r.status === 403, "auditor can't upload");
  r = await upload(O, jal.id, pdf);
  ok(r.status === 200 && r.body.copy.type === "application/pdf" && r.body.copy.size === pdf.length, "operations admin uploads the signed PDF", r.body);
  const row = sdb.prepare("SELECT copy_key, copy_uploaded_by FROM dept_agreements WHERE office_id = ?").get(jal.id);
  ok(/^agreements\//.test(row.copy_key) && row.copy_uploaded_by === O, "stored privately under agreements/");
  r = await call(A, "GET", "/api/admin/dept-officers?office=" + jal.id);
  ok(r.body.agreement.copy && !JSON.stringify(r.body).includes("agreements/"), "copy details shown, storage key never sent", r.body.agreement.copy);
  const dl = await fetch(B + "/api/admin/dept-agreement-copy?office=" + jal.id, { headers: { "test-email": A } });
  const dlb = new Uint8Array(await dl.arrayBuffer());
  ok(dl.status === 200 && dl.headers.get("content-type") === "application/pdf" && /attachment; filename="agreement-Jal-Kal-Vibhag-Lucknow\.pdf"/.test(dl.headers.get("content-disposition") || "") && dl.headers.get("cache-control") === "no-store" && dlb.length === pdf.length, "auditor downloads it", dl.headers.get("content-disposition"));
  ok((await fetch(B + "/api/admin/dept-agreement-copy?office=" + jal.id, { headers: { "test-email": D } })).status === 403, "data entry operator can't download");
  r = await upload(S, jal.id, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), "image/jpeg");
  ok(r.status === 200 && r.body.copy.type === "image/jpeg", "a photo of the signed page replaces it");
  const ev = sdb.prepare("SELECT action FROM admin_events WHERE action LIKE 'dept_agreement_copy%'").all().map((x) => x.action);
  ok(ev.includes("dept_agreement_copy_uploaded") && ev.includes("dept_agreement_copy_replaced") && ev.includes("dept_agreement_copy_viewed"), "upload, replacement and download are logged", ev);
}

// ---- daily limits on filing complaints (grieviq-36) ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const file = async (phone, dev, extra) => {
    const x = await fetch(B + "/api/grievances/submit", { method: "POST", headers: { "content-type": "application/json", "user-agent": "ua-" + dev, "cf-connecting-ip": "10.9.0.1" },
      body: JSON.stringify(Object.assign({ category_id: "water-sanitation", local_unit_id: "lu-hazratganj", description: "Water pipe leaking near the park gate", citizen_phone: phone, consent: true, form_loaded_at: Date.now() - 60000, lang: "en" }, extra || {})) });
    return { status: x.status, retry: x.headers.get("retry-after"), body: await x.json() };
  };
  let r, okN = 0;
  for (let i = 0; i < 5; i++) { r = await file("+91 98111 00001", "A"); if (r.status === 200 && r.body.tracking_ref) okN++; }
  ok(okN === 5, "5 complaints a day from one phone number are filed", r.body);
  const before = sdb.prepare("SELECT COUNT(*) n FROM grievances WHERE citizen_phone LIKE '%9811100001'").get().n;
  r = await file("9811100001", "A");
  ok(r.status === 429 && r.body.code === "DAILY_LIMIT" && r.body.which === "PHONE" && r.body.max === 5 && r.retry && /limit is 5 a day/.test(r.body.error), "6th from the same number refused, same number in another format too", r.body);
  ok(sdb.prepare("SELECT COUNT(*) n FROM grievances WHERE citizen_phone LIKE '%9811100001'").get().n === before, "refused complaint not filed");
  r = await file("9811100001", "B");
  ok(r.status === 429 && r.body.which === "PHONE", "another device can't get round the phone limit");
  r = await file("9811100002", "A");
  ok(r.status === 200, "another number from the same device still files", r.body);
  // device: 15 a day
  let last = null;
  for (let i = 0; i < 15; i++) last = await file("97222000" + String(10 + i), "C");
  ok(last.status === 200, "15 complaints from one device are filed", last.body);
  r = await file("9733300099", "C");
  ok(r.status === 429 && r.body.which === "DEVICE" && /from this device/.test(r.body.error), "16th from the same device refused", r.body);
  // bots still get the silent treatment, not the limit
  r = await file("9811100001", "A", { website: "spam" });
  ok(r.status === 200 && r.body.success, "honeypot answer unchanged");
  // nothing readable is stored
  const rows = sdb.prepare("SELECT fp FROM feedback_rate").all().map((x) => x.fp).join(" ");
  ok(!/9811100001|98111|10\.9\.0\.1|ua-A/.test(rows) && /^[0-9a-f]{64}( [0-9a-f]{64})*$/.test(rows), "only one-way codes are stored");
  // photos: 40 a day per device
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7, 7]);
  const up = async () => { const fd = new FormData(); fd.append("photo", new Blob([png], { type: "image/png" }), "p.png"); const x = await fetch(B + "/api/grievances/upload-photo", { method: "POST", headers: { "user-agent": "ua-P", "cf-connecting-ip": "10.9.0.2" }, body: fd }); return { status: x.status, body: await x.json() }; };
  let u, upOk = 0;
  for (let i = 0; i < 40; i++) { u = await up(); if (u.status === 200) upOk++; }
  ok(upOk === 40, "40 photos a day from one device", u.body);
  u = await up();
  ok(u.status === 429 && u.body.code === "DAILY_LIMIT", "41st photo refused", u.body);
}

// ---- grieviq-38: page not found, scheduler photo clean-up ----
{
  const page = async (p) => { const x = await fetch(B + p); return { status: x.status, text: await x.text(), cache: x.headers.get("cache-control") }; };
  let r = await page("/no-such-page");
  ok(r.status === 404 && /nf\.title/.test(r.text) && /noindex/.test(r.text), "unknown address answers 404 with the Page not found page", r.status);
  r = await page("/admin/old/thing/here");
  ok(r.status === 404, "deep unknown address is 404 too", r.status);
  for (const p of ["/", "/submit", "/status", "/help", "/privacy", "/rep", "/dept", "/lucknow/lu-hazratganj", "/lucknow/lu-hazratganj/"]) {
    r = await page(p);
    ok(r.status === 200, "still opens: " + p, r.status);
  }
  r = await page("/no-such-page.js");
  ok(r.status === 404, "missing file is 404", r.status);
  const fs = await import("node:fs");
  const w = fs.readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
  ok(/import \{ purgeDuePhotos \}/.test(w) && /purgeDuePhotos\(env, 500, "system"\)/.test(w), "hourly job removes due photos");
  const t = fs.readFileSync(new URL("../worker/wrangler.toml", import.meta.url), "utf8");
  ok(/^\[\[r2_buckets\]\]\s*\nbinding = "PRIVATE_PHOTOS"\s*\nbucket_name = "grieviq-private"/m.test(t), "hourly job can reach the private photo store");
  const mw = await import(new URL("../functions/_middleware.js", import.meta.url).href);
  ok(mw.mayBeUnknown("/x") && !mw.mayBeUnknown("/") && !mw.mayBeUnknown("/api/x") && !mw.mayBeUnknown("/kanpur/ward-12"), "only page addresses are checked");
}

// ---- grieviq-39: Prices & site details, For offices page, pilot requests ----
{
  const fs = await import("node:fs");
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const { DEFAULTS } = await import(new URL("../functions/_shared/site-settings.js", import.meta.url).href);
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const mails = () => fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const ist = (days) => new Date(Date.now() + 5.5 * 3600000 + (days || 0) * 86400000).toISOString().slice(0, 10);
  const info = async () => { const x = await fetch(B + "/api/site-info"); return { status: x.status, cache: x.headers.get("cache-control"), body: await x.json() }; };
  const ss = (who, b) => call(who, "POST", "/api/admin/site-settings", b);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const plan = (i, id) => i.body.plans.find((p) => p.id === id);

  let I = await info();
  ok(I.status === 200 && I.body.version === 0 && /max-age=300/.test(I.cache), "public details before anything is published", I.body.version);
  let pr = plan(I, "pradhan");
  ok(pr && pr.monthly === 999 && pr.monthlyGst === 1179 && pr.yearly === 9990 && pr.yearlyGst === 11788 && pr.seats === 3, "Gram Pradhan ₹999 a month, ₹1,179 with GST, yearly 10 months", pr);
  ok(plan(I, "councillor").monthly === 1999 && plan(I, "councillor").monthlyGst === 2359 && plan(I, "mla").monthly === 7999 && plan(I, "mp_mayor").yearly === 119990 && plan(I, "mp_mayor").yearlyGst === 141588, "published prices and GST worked out");
  ok(plan(I, "dept_office").billing === "YEARLY" && plan(I, "dept_office").yearly === 42000 && plan(I, "dept_office").yearlyGst === 49560 && plan(I, "dept_city").billing === "QUOTE", "department plans");
  const c0 = I.body.company;
  ok(c0.goName === "Amit Singh" && c0.address === "Plot no. SC 01/B8, Sector-150, Noida, Uttar Pradesh, 201310" && c0.supportEmail === "support@grieviq.in" && c0.callbackEn === "within 2 working days", "Grievance Officer, address, contact email, callback time", c0);
  ok(!I.body.claims.gem && !I.body.claims.india && !I.body.claims.audited, "GeM, India-hosting and audit claims switched off");
  ok(!("sac" in I.body.gst) && !("draft" in I.body), "public view has no internal fields");

  // who can see and change
  let r = await call(A, "GET", "/api/admin/site-settings");
  ok(r.status === 200 && r.body.canEdit === false && r.body.draft === null && r.body.live.data.plans.length === 6, "auditor reads, can't edit", r.body.canEdit);
  ok((await call(D, "GET", "/api/admin/site-settings")).status === 200 && (await call(M, "GET", "/api/admin/site-settings")).status === 200, "every admin role can read");
  ok((await ss(O, { action: "save_draft", data: DEFAULTS })).status === 403 && (await ss(A, { action: "publish" })).status === 403, "only the super admin changes prices");
  ok((await call(A, "GET", "/api/admin/site-settings?preview=draft")).status === 403, "only the super admin previews the draft");
  ok((await call("", "GET", "/api/admin/site-settings")).status === 401, "signed-out can't read the admin view");

  // checks
  const bad = clone(DEFAULTS);
  bad.plans[0].monthly = -5; bad.plans[1].nameHi = ""; bad.plans[2].id = "pradhan";
  bad.offers = [{ id: "o1", nameEn: "Test", nameHi: "परीक्षण", type: "PERCENT", value: 95, plans: ["pradhan"], start: ist(0), end: "" }];
  bad.company.goEmail = "not-an-email"; bad.gst.rate = 40; bad.gst.gstin = "123"; bad.yearly.months = 13;
  bad.claims.audited = true;
  bad.policies.refundEn = "Refund within 7 days.";
  r = await ss(S, { action: "save_draft", data: bad });
  const f = r.body.fields || {};
  ok(r.status === 400 && f["plans.0.monthly"] === "RANGE" && f["plans.1.nameHi"] === "REQUIRED" && f["plans.2.id"] === "DUPLICATE" && f["offers.0.value"] === "RANGE" && f["offers.0.end"] === "REQUIRED" &&
     f["company.goEmail"] === "FORMAT" && f["gst.rate"] === "RANGE" && f["gst.gstin"] === "FORMAT" && f["yearly.months"] === "RANGE" && f["claims.auditedOn"] === "DATE" && f["claims.auditedBy"] === "REQUIRED" && f["policies.refundHi"] === "BOTH",
     "every field checked, nothing saved", f);
  ok((await call(S, "GET", "/api/admin/site-settings")).body.draft === null, "a refused draft isn't kept");
  const end1 = clone(DEFAULTS); end1.offers = [{ id: "o1", nameEn: "A", nameHi: "अ", type: "PERCENT", value: 10, plans: ["pradhan"], start: ist(5), end: ist(1) }];
  r = await ss(S, { action: "save_draft", data: end1 });
  ok(r.status === 400 && r.body.fields["offers.0.end"] === "BEFORE_START", "offer can't end before it starts", r.body);
  ok((await ss(S, { action: "publish" })).body.error === "NO_DRAFT", "nothing to publish without a draft");

  // a draft changes nothing public
  const d1 = clone(DEFAULTS);
  d1.plans[0].monthly = "1,099";
  d1.offers = [{ id: "diwali", nameEn: "Diwali offer", nameHi: "दीवाली ऑफ़र", type: "PERCENT", value: 20, plans: ["pradhan"], start: ist(0), end: ist(10), withYearly: false }];
  d1.plans.push({ id: "nagar_panchayat", nameEn: "Nagar Panchayat Chairman office", nameHi: "नगर पंचायत अध्यक्ष कार्यालय", forEn: "", forHi: "", billing: "MONTHLY", monthly: 2999, seats: 5, extraSeat: 499, descEn: "", descHi: "", shown: true, retired: false, pilot: true });
  d1.plans.push({ id: "hidden_one", nameEn: "Hidden plan", nameHi: "छिपी योजना", billing: "MONTHLY", monthly: 5, shown: false });
  r = await ss(S, { action: "save_draft", data: d1 });
  ok(r.status === 200 && r.body.changes >= 3 && r.body.data.plans[0].monthly === 1099, "draft saved; ₹ and commas accepted", r.body.changes);
  I = await info();
  ok(plan(I, "pradhan").monthly === 999 && I.body.offers.length === 0 && !plan(I, "nagar_panchayat"), "draft is not public");
  r = await call(S, "GET", "/api/admin/site-settings?preview=draft");
  ok(r.status === 200 && r.body.preview && r.body.plans.find((p) => p.id === "pradhan").monthly === 1099 && r.body.plans.find((p) => p.id === "pradhan").monthlyOffer.price === 879, "super admin previews the draft with the offer", r.body.plans && r.body.plans[0]);
  r = await call(S, "GET", "/api/admin/site-settings");
  ok(r.body.draft && r.body.draft.changes >= 3 && r.body.draft.updatedBy === S, "draft shown to the super admin");

  // publish
  r = await ss(S, { action: "publish", note: "Pradhan price and Diwali offer" });
  ok(r.status === 200 && r.body.version === 1, "published as version 1", r.body);
  I = await info();
  pr = plan(I, "pradhan");
  ok(I.body.version === 1 && pr.monthly === 1099 && pr.monthlyOffer && pr.monthlyOffer.price === 879 && pr.monthlyOffer.priceGst === 1037 && pr.yearlyOffer === null && pr.yearly === 10990, "new price live; offer on monthly only", pr);
  ok(I.body.offers.length === 1 && I.body.offers[0].end === ist(10) && plan(I, "nagar_panchayat") && !plan(I, "hidden_one"), "offer listed with its end date; new plan shown, hidden plan not");
  ok((await call(S, "GET", "/api/admin/site-settings")).body.draft === null, "draft cleared after publishing");
  const pub = sdb.prepare("SELECT detail FROM admin_events WHERE action = 'site_settings_published' ORDER BY rowid DESC").get();
  const det = JSON.parse(pub.detail);
  ok(det.version === 1 && det.note === "Pradhan price and Diwali offer" && det.changes.some((c) => c.path === "plans.[pradhan].monthly" && c.before === 999 && c.after === 1099), "every change logged with before and after", det.changes.slice(0, 3));
  let threw = 0;
  try { sdb.prepare("UPDATE site_settings_versions SET data = '{}'").run(); } catch (e) { threw++; }
  try { sdb.prepare("DELETE FROM site_settings_versions").run(); } catch (e) { threw++; }
  ok(threw === 2, "published versions can't be changed or deleted");
  ok(sdb.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger'").get().n >= 30, "trigger count includes the two new ones");

  // same as live: nothing to publish
  r = await ss(S, { action: "save_draft", data: (await call(S, "GET", "/api/admin/site-settings")).body.live.data });
  ok(r.status === 200 && r.body.changes === 0, "saving what is live: 0 changes");
  ok((await ss(S, { action: "publish" })).body.error === "NO_CHANGES", "nothing to publish when nothing changed");
  ok((await ss(S, { action: "discard_draft" })).status === 200 && (await call(S, "GET", "/api/admin/site-settings")).body.draft === null, "draft discarded");

  // offers never stack; ended offers switch off; scheduled prices
  const d2 = clone((await call(S, "GET", "/api/admin/site-settings")).body.live.data);
  d2.offers = [
    { id: "ten", nameEn: "Ten off", nameHi: "दस छूट", type: "PERCENT", value: 10, plans: ["councillor"], start: ist(-2), end: ist(5), withYearly: true },
    { id: "flat", nameEn: "Flat 300", nameHi: "300 छूट", type: "AMOUNT", value: 300, plans: ["councillor"], start: ist(-2), end: ist(5), withYearly: false },
    { id: "over", nameEn: "Ended", nameHi: "समाप्त", type: "PERCENT", value: 50, plans: ["mla"], start: ist(-10), end: ist(-1), withYearly: true },
    { id: "later", nameEn: "Later", nameHi: "बाद में", type: "PERCENT", value: 50, plans: ["mla"], start: ist(3), end: ist(9), withYearly: true },
  ];
  const mp = d2.plans.find((p) => p.id === "mp_mayor"); mp.next = { from: ist(0), monthly: 12999 };
  const mla = d2.plans.find((p) => p.id === "mla"); mla.next = { from: ist(30), monthly: 8999 };
  d2.plans.find((p) => p.id === "nagar_panchayat").retired = true;
  d2.claims.gem = true;
  ok((await ss(S, { action: "save_draft", data: d2 })).status === 200 && (await ss(S, { action: "publish" })).body.version === 2, "version 2 published");
  I = await info();
  const co = plan(I, "councillor");
  ok(co.monthlyOffer.id === "flat" && co.monthlyOffer.price === 1699 && co.yearlyOffer.id === "ten" && co.yearlyOffer.price === 17991, "the bigger saving applies; offers never add up", [co.monthlyOffer, co.yearlyOffer]);
  ok(plan(I, "mla").monthlyOffer === null && plan(I, "mla").monthly === 7999 && plan(I, "mla").upcoming && plan(I, "mla").upcoming.monthly === 8999 && plan(I, "mla").upcoming.from === ist(30), "ended and future offers don't apply; upcoming price shown");
  ok(plan(I, "mp_mayor").monthly === 12999 && plan(I, "mp_mayor").monthlyGst === 15339 && plan(I, "mp_mayor").upcoming === null, "scheduled price starts on its day");
  ok(!plan(I, "nagar_panchayat") && I.body.offers.map((o) => o.id).sort().join() === "flat,ten" && I.body.claims.gem === true, "retired plan gone; only running offers listed; GeM claim on");

  // history and bringing back a version
  r = await call(A, "GET", "/api/admin/site-settings");
  ok(r.body.history.length === 2 && r.body.history[0].version === 2 && r.body.history[1].note === "Pradhan price and Diwali offer", "history of versions", r.body.history);
  r = await call(A, "GET", "/api/admin/site-settings?version=1");
  ok(r.status === 200 && r.body.data.plans[0].monthly === 1099, "auditor opens an earlier version");
  ok((await ss(S, { action: "restore", version: 2 })).body.error === "ALREADY_LIVE", "can't bring back the live version");
  r = await ss(S, { action: "restore", version: 1, note: "back to v1" });
  ok(r.status === 200 && r.body.version === 3 && r.body.restoredFrom === 1, "version 1 brought back as version 3", r.body);
  I = await info();
  ok(I.body.version === 3 && plan(I, "mp_mayor").monthly === 11999 && I.body.claims.gem === false && plan(I, "nagar_panchayat"), "public page shows version 1 again");
  ok(sdb.prepare("SELECT COUNT(*) n FROM admin_events WHERE action = 'site_settings_restored'").get().n === 1, "bringing back is logged");

  // Pilot requests
  const pilot = (b, ip) => fetch(B + "/api/pilot-request", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip || "10.39.0.1", "user-agent": "pilot-test" }, body: JSON.stringify(b) }).then(async (x) => ({ status: x.status, body: await x.json() }));
  r = await pilot({ name: "A", office: "KING", place: "x", mobile: "12345", email: "bad@", consent: false });
  ok(r.status === 400 && r.body.fields.name && r.body.fields.office && r.body.fields.place && r.body.fields.mobile === "FORMAT" && r.body.fields.email === "FORMAT" && r.body.fields.consent, "pilot form fields checked", r.body.fields);
  const before = sdb.prepare("SELECT COUNT(*) n FROM pilot_requests").get().n;
  r = await pilot({ name: "Bot", office: "MLA", place: "Somewhere", mobile: "9876543210", consent: true, website: "spam" });
  ok(r.status === 200 && sdb.prepare("SELECT COUNT(*) n FROM pilot_requests").get().n === before, "bots get a thank-you, nothing saved");
  const m0 = mails().length;
  r = await pilot({ name: "Ram Kumar", office: "PRADHAN", place: "Gram Panchayat Bakshi Ka Talab, Lucknow", mobile: "+91 98765 43210", email: "Ram@Example.in", consent: true, lang: "hi" });
  ok(r.status === 200 && r.body.sent && r.body.callbackEn === "within 2 working days", "pilot request sent", r.body);
  const row = sdb.prepare("SELECT * FROM pilot_requests ORDER BY created_at DESC").get();
  ok(row.mobile === "9876543210" && row.email === "ram@example.in" && row.office_kind === "PRADHAN" && row.lang === "hi" && /मैं सहमत हूँ/.test(row.consent_text) && row.status === "NEW", "saved with the consent wording shown", row);
  const pm = mails().slice(m0).find((m) => /pilot request/i.test(m.subject));
  ok(pm && pm.to[0] === "support@grieviq.in" && !/Ram Kumar|98765|Bakshi|example\.in/i.test(pm.html) && /admin-pilot-requests/.test(pm.html), "contact email told, with no personal details", pm && pm.subject);
  r = await pilot({ name: "Ram Kumar", office: "PRADHAN", place: "Bakshi Ka Talab", mobile: "09876543210", consent: true }, "10.39.0.2");
  ok(r.status === 200, "second request from the same number", r.body);
  r = await pilot({ name: "Ram Kumar", office: "PRADHAN", place: "Bakshi Ka Talab", mobile: "9876543210", consent: true }, "10.39.0.3");
  ok(r.status === 429 && r.body.which === "MOBILE", "third from the same number today refused", r.body);
  sdb.prepare("INSERT INTO pilot_requests (id, created_at, name, office_kind, place, mobile, lang, consent_at, consent_text) VALUES ('old1', ?, 'Old', 'MP', 'Old place', '9000000000', 'en', ?, 'x')").run(new Date(Date.now() - 400 * 86400000).toISOString(), new Date(Date.now() - 400 * 86400000).toISOString());
  r = await call(O, "GET", "/api/admin/pilot-requests");
  ok(r.status === 200 && r.body.canManage && r.body.requests.length === 2 && r.body.requests[0].mobile === "9876543210" && !r.body.requests.find((x) => x.id === "old1"), "operations admin sees full details; year-old requests deleted", r.body.requests.length);
  r = await call(A, "GET", "/api/admin/pilot-requests");
  ok(r.status === 200 && !r.body.canManage && r.body.requests[0].mobile === "98XXXXXX10" && r.body.requests.every((x) => !x.email || /\*\*\*@/.test(x.email)), "auditor sees mobile and email partly hidden", r.body.requests[0]);
  ok((await call(D, "GET", "/api/admin/pilot-requests")).status === 403, "data entry operator can't see pilot requests");
  ok((await call(A, "POST", "/api/admin/pilot-requests", { id: row.id, status: "CONTACTED" })).status === 403, "auditor can't change a request");
  r = await call(O, "POST", "/api/admin/pilot-requests", { id: row.id, status: "CONTACTED", note: "Called, demo on Monday" });
  ok(r.status === 200 && sdb.prepare("SELECT status, note, status_by FROM pilot_requests WHERE id = ?").get(row.id).status_by === O, "request marked contacted", r.body);
  ok(sdb.prepare("SELECT COUNT(*) n FROM admin_events WHERE action = 'pilot_request_updated'").get().n === 1, "change logged");

  // pages
  for (const pth of ["/for-offices", "/admin-site-settings.html", "/admin-pilot-requests.html"]) ok((await fetch(B + pth)).status === 200, "page opens: " + pth);

  // leave the published details as they started, for the browser tests
  ok((await ss(S, { action: "save_draft", data: DEFAULTS })).status === 200 && (await ss(S, { action: "publish", note: "back to the starting details" })).status === 200, "starting details published again");
}

// ---- grieviq-41: payment details (24-hour rule) and bills ----
{
  const fs = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const mails = () => fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const ss = (who, b) => call(who, "POST", "/api/admin/site-settings", b);
  const liveData = async () => (await call(S, "GET", "/api/admin/site-settings")).body.live.data;
  const UPI = { id: "pm1", kind: "UPI", upiId: "iotc@hdfcbank", payeeName: "INDUS OVERSEAS TRADING CORPORATION", shown: true };
  const BANK = { id: "pm2", kind: "BANK", accountName: "IOTC (Indus Overseas Trading Corporation)", bankName: "HDFC Bank", branch: "Sector 18, Noida", accountNumber: "50200012345678", ifsc: "HDFC0001234", accountType: "CURRENT", shown: true };
  const withPay = async (methods) => { const d = await liveData(); d.payments = { methods }; return d; };
  const pubPay = async (methods, note) => { const a = await ss(S, { action: "save_draft", data: await withPay(methods) }); const b = await ss(S, { action: "publish", note: note || "pay test" }); return { a, b }; };
  const officeView = async () => (await call("r1@x.in", "GET", "/api/billing")).body.pay.methods;
  // A waiting change made live now, as if 24 hours had passed (versions can't be edited: a new one is added).
  const mature = () => {
    const r = sdb.prepare("SELECT version, data FROM site_settings_versions ORDER BY version DESC LIMIT 1").get();
    const d = JSON.parse(r.data); d.payments.pending.activeFrom = new Date(Date.now() - 1000).toISOString();
    sdb.prepare("INSERT INTO site_settings_versions (version, data, created_at, created_by, note) VALUES (?, ?, ?, 'test', 'time passes')").run(r.version + 1, JSON.stringify(d), new Date().toISOString());
  };

  // checks on the details
  let r = await ss(S, { action: "save_draft", data: await withPay([{ kind: "UPI", upiId: "not a upi", payeeName: "आईओटीसी" }, { kind: "BANK", accountName: "", bankName: "HDFC", accountNumber: "12AB", ifsc: "HDFC123" }]) });
  const pf = r.body.fields || {};
  ok(r.status === 400 && pf["payments.methods.0.upiId"] === "FORMAT" && pf["payments.methods.0.payeeName"] === "PLAIN" && pf["payments.methods.1.accountName"] === "REQUIRED" && pf["payments.methods.1.accountNumber"] === "FORMAT" && pf["payments.methods.1.ifsc"] === "FORMAT", "payment details checked (UPI ID, plain name, account number, IFSC)", pf);
  // new details wait 24 hours; every super admin is told
  let before = mails().length;
  r = await pubPay([UPI, BANK], "company accounts");
  const due = Date.parse(r.b.body.payActiveFrom || 0) - Date.now();
  ok(r.b.status === 200 && r.b.body.payments === "LATER" && due > 23.9 * 3600000 && due <= 24 * 3600000, "new payment details go live in 24 hours", r.b.body);
  let m = mails().slice(before);
  ok(m.some((x) => x.to[0] === "super@test.in" && /payment details changed/.test(x.subject) && /XXXXXXXXXX5678/.test(x.html) && !/50200012345678/.test(x.html)), "every super admin emailed (account number partly hidden)", m.map((x) => x.to[0] + ":" + x.subject));
  ok((await officeView()).length === 0, "offices don't see waiting details");
  let g = await call(S, "GET", "/api/admin/site-settings");
  ok(g.body.payState.pending && g.body.payState.pending.count === 2 && g.body.live.data.payments.methods.length === 2 && g.body.live.data.payments.methods[1].accountNumber === "50200012345678", "super admin sees the waiting change in full", g.body.payState);
  const ga = await call(A, "GET", "/api/admin/site-settings");
  ok(ga.body.live.data.payments.methods[1].accountNumber === "XXXXXXXXXX5678", "auditor sees the account number partly hidden");
  const pub = await (await fetch(B + "/api/site-info")).text();
  ok(!/hdfcbank|5020001234|HDFC0001234/i.test(pub), "payment details never on the public site information");
  ok((await ss(O, { action: "cancel_payment_change" })).status === 403, "operations admin can't cancel (super admin only)");
  // cancel
  before = mails().length;
  r = await ss(S, { action: "cancel_payment_change" });
  ok(r.status === 200 && !(await call(S, "GET", "/api/admin/site-settings")).body.payState.pending, "waiting change cancelled", r.body);
  ok(mails().slice(before).some((x) => /cancelled/.test(x.subject)), "super admins told about the cancel");
  ok((await ss(S, { action: "cancel_payment_change" })).body.error === "NO_PENDING", "nothing left to cancel");
  // again, and the 24 hours pass
  r = await pubPay([UPI, BANK]);
  ok(r.b.body.payments === "LATER", "published again: waiting");
  r = await pubPay([UPI, BANK]);
  ok(r.b.status === 409 && r.b.body.error === "NO_CHANGES", "publishing the same again changes nothing (clock not restarted)", r.b.body);
  mature();
  ok((await officeView()).length === 2, "after 24 hours offices see UPI and bank");
  // hiding is safe: at once
  before = mails().length;
  r = await pubPay([UPI, Object.assign({}, BANK, { shown: false })], "bank hidden");
  ok(r.b.body.payments === "NOW" && (await officeView()).length === 1 && (await officeView())[0].kind === "UPI", "hiding a method works at once", r.b.body);
  ok(mails().slice(before).some((x) => /taken down/.test(x.subject)), "super admins told about the take-down");
  // showing it again, or changing the UPI ID, waits
  r = await pubPay([Object.assign({}, UPI, { upiId: "someone@okaxis" }), Object.assign({}, BANK, { shown: false })], "UPI changed");
  ok(r.b.body.payments === "LATER" && (await officeView())[0].upiId === "iotc@hdfcbank", "a changed UPI ID waits; offices keep the old one", r.b.body);
  // bringing back an old version follows the same rule
  const hist = (await call(S, "GET", "/api/admin/site-settings")).body.history;
  const hidden = hist.find((h) => h.note === "bank hidden");
  r = await ss(S, { action: "restore", version: hidden.version });
  ok(r.status === 200 && r.body.payments === "CANCELLED" && (await officeView())[0].upiId === "iotc@hdfcbank", "bringing back the earlier version drops the waiting change", r.body);
  r = await pubPay([UPI, BANK], "bank shown again");
  ok(r.b.body.payments === "LATER", "showing the bank again waits 24 hours");
  mature();
  ok((await officeView()).length === 2, "both shown after 24 hours");
  const evs = sdb.prepare("SELECT detail FROM admin_events WHERE action = 'site_settings_published' ORDER BY rowid DESC LIMIT 6").all().map((x) => x.detail).join(" ");
  ok(/XXXXXXXXXX5678/.test(evs) && !/50200012345678/.test(evs), "log shows account numbers partly hidden");

  // ---- bills ----
  const bl = (who, b) => call(who, "POST", "/api/admin/bills", b);
  ok((await call(D, "GET", "/api/admin/bills")).status === 403 && (await call(M, "GET", "/api/admin/bills")).status === 403, "data entry operator and moderator can't see bills");
  g = await call(A, "GET", "/api/admin/bills");
  ok(g.status === 200 && g.body.ready && !g.body.canManage && g.body.plans.some((p) => p.id === "councillor") && !g.body.plans.some((p) => p.id === "dept_city"), "auditor reads bills; quote-only plans can't be billed", g.body.plans);
  ok((await bl(A, { action: "create" })).status === 403, "auditor can't make bills");
  r = await bl(S, { action: "create" });
  ok(r.status === 400 && ["office", "plan", "period", "from"].every((k) => r.body.fields[k]), "empty bill: each field named", r.body);
  r = await bl(S, { action: "create", officeType: "REP", officeTier: "LOCAL", officeId: "lu-aishbagh", planId: "councillor", period: "MONTH", from: today });
  ok(r.body.fields && r.body.fields.office === "NO_REP", "office with no representative email refused", r.body);
  const found = await call(S, "GET", "/api/admin/bills?offices=REP&q=Hazrat");
  ok(found.body.offices.length === 1 && found.body.offices[0].canSee && found.body.offices[0].suggest === "councillor", "office search suggests the plan", found.body);
  ok((await call(S, "GET", "/api/admin/bills?quote=1&plan=councillor&period=YEAR")).body.quote.total === 23588, "yearly quote: 10 months + GST");
  before = mails().length;
  r = await bl(O, { action: "create", officeType: "REP", officeTier: "LOCAL", officeId: "lu-hazratganj", planId: "councillor", period: "MONTH", from: "2026-10-01", amount: 1, note: "October" });
  ok(r.status === 200 && r.body.total === 2359 && /^GIQ-PAY-\d{6}$/.test(r.body.ref) && r.body.emailed === 2, "operations admin makes a bill; price from the published plan (amount can't be sent)", r.body);
  const bill1 = r.body.id, ref1 = r.body.ref;
  m = mails().slice(before);
  ok(m.some((x) => x.to[0] === "r1@x.in" && x.subject.includes(ref1) && /Pay only to the GrievIQ payment details/.test(x.html)) && m.some((x) => x.to[0] === "om@x.in") && !m.some((x) => x.to[0] === "fw@x.in"), "representative and office manager emailed, field worker not", m.map((x) => x.to[0]));
  r = await bl(S, { action: "create", officeType: "REP", officeTier: "LOCAL", officeId: "lu-hazratganj", planId: "councillor", period: "MONTH", from: "2026-10-01" });
  ok(r.body.fields && r.body.fields.from === "TWICE" && r.body.ref === ref1, "same office, same start: refused", r.body);
  r = await bl(S, { action: "create", officeType: "REP", officeTier: "LOCAL", officeId: "lu-hazratganj", planId: "councillor", period: "YEAR", from: "2026-11-01", dueDays: 61 });
  ok(r.body.fields && r.body.fields.dueDays === "RANGE", "days to pay 1–60");
  r = await bl(S, { action: "create", officeType: "REP", officeTier: "LOCAL", officeId: "lu-hazratganj", planId: "councillor", period: "YEAR", from: "2026-11-01" });
  ok(r.status === 200 && r.body.total === 23588, "yearly bill", r.body);
  const bill2 = r.body.id;
  const jalId = sdb.prepare("SELECT office_id FROM dept_officers WHERE email = 'ae.zone3@nic.in' AND status = 'ACTIVE'").get().office_id;
  r = await bl(S, { action: "create", officeType: "DEPT", officeId: jalId, planId: "dept_office", period: "MONTH", from: today });
  ok(r.body.fields && r.body.fields.period === "NO_PRICE", "a yearly-only plan can't be billed by the month");
  r = await bl(S, { action: "create", officeType: "DEPT", officeId: jalId, planId: "dept_office", period: "YEAR", from: today });
  ok(r.status === 200 && r.body.total === 49560 && r.body.emailed >= 1, "department office billed for a year", r.body);
  const bill3 = r.body.id;

  // offices see their own bills: representative and office manager only
  ok((await call("fw@x.in", "GET", "/api/billing")).status === 403, "field worker: no billing");
  const ob = await call("om@x.in", "GET", "/api/billing");
  ok(ob.status === 200 && ob.body.bills.length === 2 && ob.body.pay.methods.length === 2 && ob.body.pay.company.legalName, "office manager sees the office's bills and payment details", ob.body);
  const r2 = await call("r2@x.in", "GET", "/api/billing");
  ok(r2.status === 200 && r2.body.bills.length === 0, "another office's representative sees none of them");
  const rep = (who, b) => call(who, "POST", "/api/billing", b);
  ok((await rep("r2@x.in", { billId: bill1, method: "UPI", utr: "612345678901", amount: 2359, paidOn: today })).status === 404, "can't record a payment on another office's bill");
  r = await rep("r1@x.in", { billId: bill1, method: "UPI", utr: "12-34", amount: 0, paidOn: "2099-01-01" });
  ok(r.status === 400 && r.body.fields.utr === "FORMAT" && r.body.fields.amount === "RANGE" && r.body.fields.paidOn === "FUTURE", "payment details checked", r.body);
  r = await rep("r1@x.in", { billId: bill1, method: "UPI", utr: "6123 4567 8901", amount: 2359, paidOn: today });
  ok(r.status === 200 && !r.body.mismatch, "representative records a UPI payment", r.body);
  ok((await rep("om@x.in", { billId: bill1, method: "UPI", utr: "612345678902", amount: 2359, paidOn: today })).body.error === "ALREADY_REPORTED", "one payment waiting at a time");
  ok(mails().some((x) => x.to[0] === "support@grieviq.in" && x.subject.includes(ref1) && /ending 8901/.test(x.html)), "GrievIQ support told a payment is waiting");
  // turned back, recorded again, confirmed
  let pay1 = (await call(S, "GET", "/api/admin/bills")).body.bills.find((b) => b.id === bill1).payments[0];
  ok(pay1.utr === "612345678901" && pay1.status === "REPORTED", "staff see the payment (UTR without spaces)", pay1);
  ok((await bl(A, { action: "confirm", paymentId: pay1.id })).status === 403, "auditor can't confirm");
  ok((await bl(S, { action: "return", paymentId: pay1.id, reason: "no" })).status === 400, "turning back needs a reason");
  before = mails().length;
  r = await bl(S, { action: "return", paymentId: pay1.id, reason: "Not in the statement for that date" });
  ok(r.status === 200 && r.body.status === "DUE", "payment turned back; bill due again");
  ok(mails().slice(before).some((x) => x.to[0] === "r1@x.in" && /Not in the statement/.test(x.html)), "office told why");
  r = await rep("om@x.in", { billId: bill1, method: "UPI", utr: "612345678901", amount: 2000, paidOn: today });
  ok(r.status === 200 && r.body.mismatch, "recorded again (same reference allowed after turning back); different amount flagged", r.body);
  pay1 = (await call(S, "GET", "/api/admin/bills?status=REPORTED")).body.bills.find((b) => b.id === bill1).payments.find((p) => p.status === "REPORTED");
  before = mails().length;
  r = await bl(O, { action: "confirm", paymentId: pay1.id });
  ok(r.status === 200 && r.body.status === "PAID", "operations admin confirms; bill paid");
  ok(mails().slice(before).some((x) => x.to[0] === "r1@x.in" && /payment received/.test(x.subject)), "office emailed: payment received");
  ok((await bl(S, { action: "confirm", paymentId: pay1.id })).body.error === "ALREADY_CHECKED", "can't confirm twice");
  ok((await rep("r1@x.in", { billId: bill1, method: "BANK", utr: "HDFCN52026101112345", amount: 2359, paidOn: today })).body.error === "ALREADY_PAID", "paid bill takes no more payments");
  ok((await rep("r1@x.in", { billId: bill2, method: "UPI", utr: "612345678901", amount: 23588, paidOn: today })).body.fields.utr === "DUPLICATE", "a reference already used can't be recorded again");
  // cancel
  ok((await bl(S, { action: "cancel", id: bill2, reason: "x" })).status === 400, "cancelling needs a reason");
  ok((await bl(S, { action: "cancel", id: bill2, reason: "Made by mistake" })).status === 200 && (await bl(S, { action: "cancel", id: bill1, reason: "Paid bill" })).body.error === "NOT_OPEN", "open bill cancelled; a paid one can't be");
  // department office
  const code = "975310";
  sdb.prepare("INSERT INTO dept_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run("api41", "ae.zone3@nic.in", createHash("sha256").update("ae.zone3@nic.in:" + code).digest("hex"), new Date(Date.now() + 600000).toISOString(), new Date(Date.now() + 5000).toISOString());
  const vr = await fetch(B + "/api/dept/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ae.zone3@nic.in", code }) });
  const CK = (vr.headers.get("set-cookie") || "").split(";")[0];
  sdb.prepare("DELETE FROM dept_codes WHERE id = 'api41'").run();
  const db2 = async (method, body) => { const x = await fetch(B + "/api/dept/billing", { method, headers: { cookie: CK, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };
  g = await db2("GET");
  ok(g.status === 200 && g.body.bills.length === 1 && g.body.bills[0].total === 49560 && g.body.pay.methods.length === 2, "department officer sees the office's bill", g.body);
  ok((await db2("POST", { billId: bill1, method: "UPI", utr: "612345670000", amount: 1, paidOn: today })).status === 404, "officer can't touch a representative's bill");
  r = await db2("POST", { billId: bill3, method: "BANK", utr: "SBIN026285123456", amount: 49560, paidOn: today });
  ok(r.status === 200, "officer records a bank transfer", r.body);
  ok((await fetch(B + "/api/dept/billing")).status === 401, "department billing needs the officer's sign-in");
  // the record
  const ev = sdb.prepare("SELECT action, COUNT(*) n FROM bill_events GROUP BY action").all().reduce((o, x) => (o[x.action] = x.n, o), {});
  ok(ev.ISSUED === 3 && ev.PAYMENT_REPORTED === 3 && ev.PAYMENT_RETURNED === 1 && ev.PAYMENT_CONFIRMED === 1 && ev.CANCELLED === 1, "every step in the bill record", ev);
  let threw2 = false; try { sdb.prepare("DELETE FROM bill_events").run(); } catch (e) { threw2 = true; }
  ok(threw2, "bill record can't be deleted");
  ok((await fetch(B + "/admin-bills.html")).status === 200, "page opens: /admin-bills.html");
}

// ---- grieviq-44: ownership mark on every response ----
// (the test server doesn't run the site-wide middleware, so it is checked directly)
{
  const mw = await import(new URL("../functions/_middleware.js", import.meta.url).href);
  const h = mw.withSecurityHeaders(new Response("x", { headers: { "content-type": "text/html" } }), "/").headers;
  ok(h.get("x-giq-build") === "40903C1E13F1965C" && h.get("content-security-policy"), "build tag added with the security headers");
}

// ---- grieviq-45: copies of GrievIQ report where they run ----
{
  const beacon = async (q, hdr) => (await fetch(B + "/api/b?" + q, { headers: hdr || {} })).status;
  ok(await beacon("h=copy.example.com&p=submit&k=c", { "CF-IPCountry": "NP" }) === 204, "a copy's address is accepted (204)");
  ok(await beacon("h=copy.example.com&p=rep&k=s") === 204, "the same copy seen from its server");
  ok(await beacon("h=grieviq.in&k=c") === 204 && await beacon("h=www.grieviq.in&k=c") === 204 && await beacon("h=x.grieviq.pages.dev&k=c") === 204, "own addresses answered but ignored");
  ok(await beacon("h=bad%20host%3Cscript%3E&k=c") === 204, "nonsense ignored");
  const c = await call(S, "GET", "/api/admin/copies");
  const row = c.body.copies && c.body.copies.find((x) => x.host === "copy.example.com");
  ok(c.status === 200 && c.body.copies.length === 1 && row && row.hits === 2 && row.country === "NP" && row.lastPath === "rep" && row.seenBy.join() === "browser,server", "admin sees the copy: address, times, country, browser and server", c.body);
  ok((await call(A, "GET", "/api/admin/copies")).status === 200 && (await call(O, "GET", "/api/admin/copies")).status === 403, "auditor sees it; operations admin doesn't");
  ok(!JSON.stringify(c.body).match(/\d+\.\d+\.\d+\.\d+/), "no IP addresses kept");
}

// ---- grieviq-46: office subscriptions ----
{
  const fs = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const mails = () => fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const add = (n) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const sb = (who, b) => call(who, "POST", "/api/admin/subscriptions", b);
  const list = async () => (await call(S, "GET", "/api/admin/subscriptions")).body;
  const find = async (k) => (await list()).offices.find((o) => o.key === k);
  const why = "Agreed with the office on the phone";

  let g = await call(S, "GET", "/api/admin/subscriptions");
  ok(g.status === 200 && g.body.ready && g.body.canManage && g.body.settings.graceDays === 7 && g.body.settings.reminderDays === 7 && g.body.settings.defaultPilotEnd === "2026-12-31", "super admin sees subscriptions with the settings", g.body.settings);
  const hz = g.body.offices.find((o) => o.key === "REP|LOCAL|lu-hazratganj");
  ok(hz && hz.paidThrough === "2026-10-31" && hz.planId === "councillor" && hz.hasRecord, "a confirmed payment set the office's paid-up date and plan", hz);
  ok(g.body.offices.some((o) => o.type === "DEPT") && g.body.offices.filter((o) => !o.hasRecord).every((o) => o.pilotEnd === "2026-12-31"), "offices without a record are pilots until 31 Dec 2026");
  const sum = await call(S, "GET", "/api/admin/subscriptions?summary=1");
  ok(sum.body.counts && !sum.body.offices && typeof sum.body.counts.ATTENTION === "number", "summary gives counts only", sum.body);
  const ga = await call(A, "GET", "/api/admin/subscriptions"), go = await call(O, "GET", "/api/admin/subscriptions");
  ok(ga.status === 200 && !ga.body.canManage && go.status === 200 && !go.body.canManage, "auditor and operations admin can look, not change");
  ok((await call(D, "GET", "/api/admin/subscriptions")).status === 403 && (await call(M, "GET", "/api/admin/subscriptions")).status === 403, "data entry operator and moderator can't see subscriptions");
  ok((await sb(O, { action: "pause", type: "REP", tier: "LOCAL", id: "lu-hazratganj", reason: why })).status === 403 && (await sb(A, { action: "pause", type: "REP", tier: "LOCAL", id: "lu-hazratganj", reason: why })).status === 403, "only the super admin makes changes");

  // the second office (r2) for date tests
  const me2 = (await call("r2@x.in", "GET", "/api/me")).body.mandates[0];
  const o2 = { type: "REP", tier: me2.tier, id: me2.id }, k2 = "REP|" + me2.tier + "|" + me2.id;
  ok(me2.sub && me2.sub.status === "PILOT" && me2.sub.until === "2026-12-31", "representative sees the office's plan (pilot until 31 Dec 2026)", me2.sub);
  // checks
  let r = await sb(S, Object.assign({ action: "set_pilot", end: add(30), reason: "no" }, o2));
  ok(r.status === 400 && r.body.fields.reason === "REQUIRED", "every change needs a reason", r.body);
  r = await sb(S, Object.assign({ action: "set_pilot", start: add(5), end: add(1), reason: why }, o2));
  ok(r.body.fields && r.body.fields.end === "BEFORE_START", "pilot end before its start refused", r.body);
  r = await sb(S, Object.assign({ action: "set_pilot", start: "2026-02-30", end: "", reason: why }, o2));
  ok(r.body.fields && r.body.fields.start === "DATE" && r.body.fields.end === "REQUIRED", "pilot dates checked", r.body);
  ok((await sb(S, Object.assign({ action: "extend", days: 0, reason: why }, o2))).body.fields.days === "RANGE" && (await sb(S, Object.assign({ action: "extend", days: 400, reason: why }, o2))).body.fields.days === "RANGE", "extend 1–366 days");
  ok((await sb(S, Object.assign({ action: "set_plan", planId: "dept_city", reason: why }, o2))).body.fields.planId === "REQUIRED", "quote-only plan can't be set for automatic bills");
  ok((await sb(S, Object.assign({ action: "complimentary", until: add(30), reason: why }, o2))).body.error === "DEPT_ONLY", "complimentary is for department offices only");
  ok((await sb(S, { action: "pause", type: "REP", tier: "LOCAL", id: "nowhere", reason: why })).status === 404, "unknown office: not found");
  // the super admin sets pilot dates
  r = await sb(S, Object.assign({ action: "set_pilot", start: add(-20), end: add(10), reason: why }, o2));
  let x = await find(k2);
  ok(r.status === 200 && r.body.status === "PILOT" && x.pilotStart === add(-20) && x.pilotEnd === add(10) && x.pilotEnding, "super admin changes pilot start and end dates (ending within 14 days flagged)", x);
  // pilot over: grace, then view only
  r = await sb(S, Object.assign({ action: "set_pilot", start: add(-60), end: add(-3), reason: why }, o2));
  ok(r.body.status === "GRACE" && (await find(k2)).graceUntil === add(4), "unpaid after the pilot: 7 days' grace", r.body);
  let me = (await call("r2@x.in", "GET", "/api/me")).body.mandates[0].sub;
  ok(me.status === "GRACE" && me.graceUntil === add(4), "representative sees the grace date", me);
  ok((await call("r2@x.in", "POST", "/api/dept-gap", { grievanceId: "nope", department: "Health" })).body.error !== "OFFICE_PAUSED", "grace: everything still works");
  r = await sb(S, Object.assign({ action: "set_pilot", start: add(-60), end: add(-8), reason: why }, o2));
  ok(r.body.status === "PAUSED", "after the grace days: paused", r.body);
  r = await call("r2@x.in", "POST", "/api/dept-gap", { grievanceId: "nope", department: "Health" });
  ok(r.status === 403 && r.body.error === "OFFICE_PAUSED", "paused office can't act", r.body);
  ok((await call("r2@x.in", "GET", "/api/grievances")).status === 200 && (await call("r2@x.in", "GET", "/api/billing")).status === 200, "paused office still sees complaints and its bills");

  // pausing by hand (r1's office): the whole team, view only; billing still works
  r = await sb(S, { action: "pause", type: "REP", tier: "LOCAL", id: "lu-hazratganj", reason: "Asked by the office" });
  ok(r.status === 200 && r.body.status === "PAUSED", "super admin pauses an office", r.body);
  const m1 = (await call("r1@x.in", "GET", "/api/me")).body.mandates.find((m) => m.id === "lu-hazratganj").sub;
  const mf = (await call("fw@x.in", "GET", "/api/me")).body.mandates.find((m) => m.id === "lu-hazratganj").sub;
  ok(m1.status === "PAUSED" && m1.byAdmin && mf.status === "PAUSED" && !("until" in mf) && !("byAdmin" in mf), "representative sees the pause; field worker only that it is paused", { m1, mf });
  const cs = (await call("r1@x.in", "GET", "/api/grievances")).body.grievances.filter((c) => c.wardId === undefined || true);
  ok(cs.length && cs.every((c) => c.viewOnly && c.officePaused && !c.canApprove), "complaints are view only while paused", cs[0] && { viewOnly: cs[0].viewOnly, officePaused: cs[0].officePaused });
  ok((await call("r1@x.in", "POST", "/api/dept-gap", { grievanceId: "g1", department: "Health" })).body.error === "OFFICE_PAUSED", "representative can't act while paused");
  ok((await call("r1@x.in", "POST", "/api/billing", { billId: "nope", method: "UPI", utr: "612345670001", amount: 1, paidOn: today })).body.error !== "OFFICE_PAUSED", "paused office can still record a payment");
  r = await sb(S, { action: "resume", type: "REP", tier: "LOCAL", id: "lu-hazratganj", reason: "Office asked to continue" });
  ok(r.body.status === "ACTIVE" || r.body.status === "DUE_SOON", "resumed: back to its paid-up status", r.body);
  ok((await call("r1@x.in", "POST", "/api/dept-gap", { grievanceId: "nope", department: "Health" })).body.error !== "OFFICE_PAUSED", "after resume the office can act again");
  // ended: no access, reopened
  await sb(S, { action: "end", type: "REP", tier: "LOCAL", id: "lu-hazratganj", reason: "Contract ended" });
  ok((await call("om@x.in", "GET", "/api/billing")).body.error === "OFFICE_ENDED" || (await call("om@x.in", "GET", "/api/me")).status !== 200, "ended office: no access");
  await sb(S, { action: "reopen", type: "REP", tier: "LOCAL", id: "lu-hazratganj", reason: "Contract renewed" });
  ok((await call("om@x.in", "GET", "/api/billing")).status === 200, "reopened office has access again");

  // department office: complimentary and paused
  const jalId = sdb.prepare("SELECT office_id FROM dept_officers WHERE email = 'ae.zone3@nic.in' AND status = 'ACTIVE'").get().office_id;
  const od = { type: "DEPT", tier: "", id: jalId };
  ok((await sb(S, Object.assign({ action: "complimentary", until: add(-1), reason: why }, od))).body.fields.until === "PAST", "complimentary date can't be past");
  r = await sb(S, Object.assign({ action: "complimentary", until: add(90), reason: "State pilot programme" }, od));
  ok(r.body.status === "COMPLIMENTARY", "department office made complimentary with a reason", r.body);
  await sb(S, Object.assign({ action: "complimentary", until: "", reason: "Programme over" }, od));
  await sb(S, Object.assign({ action: "pause", reason: "Testing the pause" }, od));
  const code = "864201";
  sdb.prepare("INSERT INTO dept_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run("api46", "ae.zone3@nic.in", createHash("sha256").update("ae.zone3@nic.in:" + code).digest("hex"), new Date(Date.now() + 600000).toISOString(), new Date(Date.now() + 5000).toISOString());
  const vr = await fetch(B + "/api/dept/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ae.zone3@nic.in", code }) });
  const CK = (vr.headers.get("set-cookie") || "").split(";")[0];
  sdb.prepare("DELETE FROM dept_codes WHERE id = 'api46'").run();
  const dq = async (method, p, body) => { const y = await fetch(B + p, { method, headers: { cookie: CK, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: y.status, body: await y.json() }; };
  let dc = await dq("GET", "/api/dept/cases");
  ok(dc.status === 200 && dc.body.sub && dc.body.sub.status === "PAUSED", "department dashboard shows the pause", dc.body.sub);
  r = await dq("POST", "/api/dept/reply", { grievanceId: "nope", kind: "IN_PROGRESS", note: "x" });
  ok(r.status === 403 && r.body.error === "OFFICE_PAUSED", "paused department office can't reply", r.body);
  ok((await dq("GET", "/api/dept/billing")).status === 200, "paused department office still sees its bills");
  await sb(S, Object.assign({ action: "resume", reason: "Testing over" }, od));
  ok((await dq("POST", "/api/dept/reply", { grievanceId: "nope", kind: "IN_PROGRESS", note: "x" })).body.error !== "OFFICE_PAUSED", "resumed department office can reply");

  // the hourly job: bill made automatically, waiting until staff send it
  r = await sb(S, Object.assign({ action: "extend", days: 3, reason: "Paid by cheque, cleared" }, o2));
  ok(r.body.status === "DUE_SOON" && (await find(k2)).paidThrough === add(2), "extend: paid up from today", r.body);
  ok((await sb(S, Object.assign({ action: "set_plan", planId: "councillor", reason: why }, o2))).status === 200, "plan for automatic bills set");
  let before = mails().length;
  let run = await (await fetch(B + "/__test/run-subscriptions", { method: "POST" })).json();
  ok(run.bills >= 1 && run.notices >= 1, "hourly job made a bill and sent notices", run);
  const m2 = mails().slice(before);
  ok(m2.some((y) => y.to[0] === "r2@x.in" && /ends on/.test(y.subject) && !/[6-9]\d{9}/.test(y.html)), "office reminded by email (no complaint details)", m2.map((y) => y.to[0] + ":" + y.subject));
  let wb = (await call(S, "GET", "/api/admin/bills?status=WAITING")).body;
  const auto = wb.bills.find((b) => b.officeId === me2.id);
  ok(auto && auto.waiting && auto.auto && auto.from === add(3) && wb.counts.WAITING >= 1, "the bill waits in Bills, starting the day after the paid-up date", auto);
  ok((await call("r2@x.in", "GET", "/api/billing")).body.bills.every((b) => b.id !== auto.id), "office can't see a bill that isn't sent");
  run = await (await fetch(B + "/__test/run-subscriptions", { method: "POST" })).json();
  ok(run.bills === 0 && sdb.prepare("SELECT COUNT(*) n FROM bills WHERE office_id = ? AND auto = 1").get(me2.id).n === 1, "running again makes no second bill or notice", run);
  ok((await call(O, "POST", "/api/admin/bills", { action: "send", id: auto.id })).status === 200, "staff send the bill");
  const ob = (await call("r2@x.in", "GET", "/api/billing")).body.bills.find((b) => b.id === auto.id);
  ok(ob && ob.total === 2359, "office now sees the bill", ob);
  // paying moves the paid-up date
  r = await call("r2@x.in", "POST", "/api/billing", { billId: auto.id, method: "UPI", utr: "612345679999", amount: 2359, paidOn: today });
  const pay = (await call(S, "GET", "/api/admin/bills")).body.bills.find((b) => b.id === auto.id).payments[0];
  ok((await call(S, "POST", "/api/admin/bills", { action: "confirm", paymentId: pay.id })).status === 200, "payment confirmed");
  x = await find(k2);
  ok(x.paidThrough === auto.to && x.status === "ACTIVE", "paid-up date moved to the end of the bill's period", x);
  // history and records
  const h = (await call(A, "GET", "/api/admin/subscriptions?key=" + encodeURIComponent(k2))).body.history;
  ok(h.some((e) => e.action === "SET_PILOT" && e.detail.reason === why) && h.some((e) => e.action === "PAID_THROUGH") && h.some((e) => e.action === "NOTICE_DUE"), "history: changes with reasons, payment and notices", h.map((e) => e.action));
  const acts = sdb.prepare("SELECT action, COUNT(*) n FROM admin_events WHERE action LIKE 'subscription_%' OR action = 'bill_sent' GROUP BY action").all().reduce((o, y) => (o[y.action] = y.n, o), {});
  ok(acts.subscription_set_pilot >= 2 && acts.subscription_pause >= 2 && acts.subscription_resume >= 2 && acts.subscription_end === 1 && acts.bill_sent === 1, "every change in the admin log", acts);
  let threw = false; try { sdb.prepare("DELETE FROM subscription_events").run(); } catch (e) { threw = true; }
  let threw2 = false; try { sdb.prepare("UPDATE subscription_events SET actor = 'x'").run(); } catch (e) { threw2 = true; }
  ok(threw && threw2, "subscription history can't be changed or deleted");
  ok(sdb.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger'").get().n === 38, "38 triggers (part30, part32, part41)");
  ok((await fetch(B + "/admin-subscriptions.html")).status === 200, "page opens: /admin-subscriptions.html");
}

// ---- grieviq-47: speed at scale (closed cases paged; speed monitor) ----
{
  const fs = await import("node:fs");
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const mails = () => fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
  // 120 closed cases in r1's ward, closed over the last 120 days; one stopped at MLA level
  const ins = sdb.prepare("INSERT INTO grievances (id, tracking_ref, citizen_phone, local_unit_id, category_id, status, description, current_tier, created_at, resolved_at, closed_at) VALUES (?, ?, '9000000099', 'lu-hazratganj', 'water-sanitation', 'CLOSED', 'Old closed case', ?, ?, ?, ?)");
  for (let i = 0; i < 120; i++) ins.run("gc" + i, "GRV-OLD" + String(i).padStart(3, "0"), i === 7 ? "MLA" : "LOCAL", iso((i + 2) * 86400000), iso((i + 1) * 86400000), iso((i + 1) * 86400000));
  const beforeClosed = sdb.prepare("SELECT COUNT(*) n FROM grievances WHERE local_unit_id = 'lu-hazratganj' AND status IN ('RESOLVED','CLOSED') AND id NOT LIKE 'gc%'").get().n;
  let g = await call("r1@x.in", "GET", "/api/grievances");
  const openN = g.body.grievances.filter((c) => c.status !== "RESOLVED" && c.status !== "CLOSED").length;
  const closedN = g.body.grievances.filter((c) => c.status === "RESOLVED" || c.status === "CLOSED").length;
  ok(g.status === 200 && g.body.closed.total >= 120 + beforeClosed && closedN === 50 && g.body.closed.shown === 50 && openN > 0, "closed cases come 50 at a time; open ones in full", { closed: g.body.closed, openN, closedN });
  ok(g.body.grievances.filter((c) => c.id.startsWith("gc")).every((c) => !["gc119", "gc100"].includes(c.id)) && g.body.grievances.some((c) => c.id === "gc0"), "newest closed first");
  g = await call("r1@x.in", "GET", "/api/grievances?closed=100");
  ok(g.body.grievances.filter((c) => c.status === "CLOSED" || c.status === "RESOLVED").length === 100, "Show more: 100 closed cases");
  g = await call("r1@x.in", "GET", "/api/grievances?ref=grv-old119");
  ok(g.body.found === "gc119" && g.body.grievances.some((c) => c.id === "gc119"), "case number search finds an old closed case", g.body.found);
  g = await call("r1@x.in", "GET", "/api/grievances?id=gc118");
  ok(g.body.found === "gc118", "a notification link to an old case finds it");
  g = await call("r1@x.in", "GET", "/api/grievances?ref=GRV-NOPE99");
  ok(g.body.found === null, "unknown number: not found");
  g = await call("r2@x.in", "GET", "/api/grievances?ref=GRV-OLD119");
  ok(g.status === 200 && !g.body.found && !g.body.grievances.some((c) => c.id === "gc119"), "another office can't find it by number");
  const mla = await call("mla@x.in", "GET", "/api/grievances?closed=500");
  ok(mla.body.grievances.some((c) => c.id === "gc7") && !mla.body.grievances.some((c) => c.id === "gc8"), "MLA sees only closed cases that reached MLA level", mla.body.closed);
  const fw = await call("fw@x.in", "GET", "/api/grievances");
  ok(fw.status === 200 && !fw.body.grievances.some((c) => c.id.startsWith("gc")) && fw.body.closed.total === fw.body.closed.shown, "field worker: only their own cases, none of the others' closed ones", fw.body.closed);
  // department: closed cases of the last 30 days, 50 at a time
  const jal = sdb.prepare("SELECT office_id FROM dept_officers WHERE email = 'ae.zone3@nic.in' AND status = 'ACTIVE'").get().office_id;
  const fwd = sdb.prepare("INSERT INTO case_dept_steps (id, grievance_id, kind, department, office_id, office_name, channel, actor, actor_role, created_at) VALUES (?, ?, 'FORWARDED', 'Water Supply / Sanitation', ?, 'Jal Kal', 'DASHBOARD', 'r1@x.in', 'OFFICE', ?)");
  for (let i = 0; i < 25; i++) fwd.run("sd" + i, "gc" + i, jal, iso((i + 2) * 86400000));
  const { createHash } = await import("node:crypto");
  const code = "975311";
  sdb.prepare("INSERT INTO dept_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run("api47", "ae.zone3@nic.in", createHash("sha256").update("ae.zone3@nic.in:" + code).digest("hex"), new Date(Date.now() + 600000).toISOString(), new Date(Date.now() + 5000).toISOString());
  const vr = await fetch(B + "/api/dept/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ae.zone3@nic.in", code }) });
  const CK = (vr.headers.get("set-cookie") || "").split(";")[0];
  sdb.prepare("DELETE FROM dept_codes WHERE id = 'api47'").run();
  const dq = async (p) => { const y = await fetch(B + p, { headers: { cookie: CK } }); return { status: y.status, body: await y.json() }; };
  let d1 = await dq("/api/dept/cases?closed=10");
  const recent = d1.body.closed;
  ok(d1.status === 200 && recent.total >= 25 && recent.total < 120 && recent.shown === 10 && d1.body.cases.filter((c) => c.status === "CLOSED").length === 10, "department: closed cases of the last 30 days, a page at a time", recent);
  ok(d1.body.tiles.closed >= recent.total, "department tile counts every closed case", d1.body.tiles);
  d1 = await dq("/api/dept/cases");
  ok(d1.body.closed.shown === Math.min(50, d1.body.closed.total), "department: 50 by default");

  // speed monitor
  const sp = (await import(new URL("../functions/_shared/speed.js", import.meta.url).href));
  ok(sp.areaOf("/api/grievances/submit") === "CITIZEN" && sp.areaOf("/api/otp/request") === "CITIZEN" && sp.areaOf("/api/grievances") === "REP" && sp.areaOf("/api/grievances/g1/acknowledge") === "REP" &&
     sp.areaOf("/api/dept/cases") === "DEPT" && sp.areaOf("/api/admin/bills") === "ADMIN" && sp.areaOf("/rep") === null && sp.areaOf("/api/b") === null, "each request counts for the right part of GrievIQ");
  let s = await call(S, "GET", "/api/admin/speed");
  ok(s.status === 200 && s.body.ready && s.body.status === "NO_DATA" && s.body.db.size > 0 && s.body.db.limit === 10 * 1024 ** 3, "Speed page: no data yet; database size shown", { st: s.body.status, db: s.body.db });
  ok((await call(O, "GET", "/api/admin/speed")).status === 200 && (await call(A, "GET", "/api/admin/speed")).status === 403 && (await call(D, "GET", "/api/admin/speed")).status === 403, "super and operations admins see Speed; others don't");
  const hourAgo = (h, min) => { const t = Math.floor(Date.now() / 3600000) * 3600000 - h * 3600000 + min * 60000; return new Date(t).toISOString(); };
  const samples = [];
  for (let i = 0; i < 20; i++) { samples.push({ area: "REP", ms: 200 + i * 40, at: hourAgo(2, 5 + i) }, { area: "REP", ms: 200 + i * 40, at: hourAgo(1, 5 + i) }, { area: "CITIZEN", ms: 80 + i, at: hourAgo(1, 10 + i) }); }
  await fetch(B + "/__test/speed-sample", { method: "POST", body: JSON.stringify({ samples }) });
  const before = mails().length;
  let run = await (await fetch(B + "/__test/run-speed", { method: "POST", body: "{}" })).json();
  ok(run.status === "SLOW" && run.alerted === true, "slow for 2 hours: status Slow, alert sent", run);
  const m = mails().slice(before);
  ok(m.some((x) => x.to[0] === "super@test.in" && /running slow/.test(x.subject) && /representative console: 0\.9 s/.test(x.subject)) && !m.some((x) => x.to[0] === "ops@test.in"), "super admins emailed with numbers only", m.map((x) => x.to[0] + ": " + x.subject));
  run = await (await fetch(B + "/__test/run-speed", { method: "POST", body: "{}" })).json();
  ok(run.alerted === false && mails().length === before + m.length, "only one alert a day");
  s = await call(S, "GET", "/api/admin/speed");
  const rep = s.body.areas.REP;
  ok(s.body.status === "SLOW" && s.body.slowAreas.join() === "REP" && rep.lastHour.p95 === 920 && rep.lastHour.n === 20 && s.body.areas.CITIZEN.lastHour.p95 < 500 && s.body.lastAlert, "Speed page: Slow, which part, its figures", { st: s.body.status, rep: rep.lastHour });
  ok(rep.days.length === 7 && rep.days[6].p95 === 920, "7 days, today's slowest hour", rep.days.slice(-2));
  ok((await call(S, "GET", "/api/admin/speed?summary=1")).body.status === "SLOW", "dashboard tile summary");
  sdb.prepare("INSERT INTO speed_samples (at, area, ms) VALUES (?, 'REP', 100)").run(new Date(Date.now() - 3 * 86400000).toISOString());
  await fetch(B + "/__test/run-speed", { method: "POST", body: "{}" });
  ok(sdb.prepare("SELECT COUNT(*) n FROM speed_samples WHERE at < ?").get(new Date(Date.now() - 2 * 86400000).toISOString()).n === 0, "raw samples deleted after 2 days");
  ok(sdb.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger'").get().n === 38, "trigger count 38 after part31, part32 and part41");
  ok((await fetch(B + "/admin-speed.html")).status === 200, "page opens: /admin-speed.html");
  // tidy: the closed cases above stay (later checks don't count them)
}

// ---- grieviq-48: government groundwork (states, districts, themes, government users, sharing) ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  let r = await call(S, "GET", "/api/admin/areas");
  const up = r.body.geo && r.body.geo.states.find((x) => x.id === "uttar-pradesh");
  ok(r.status === 200 && r.body.geo.states.length === 36 && up && up.lgd === "9" && up.nameHi === "उत्तर प्रदेश" && r.body.geo.states.find((x) => x.id === "ladakh").lgd === "37", "36 states and union territories with their LGD codes", up);
  const allD = (await call(S, "GET", "/api/admin/areas")).body.geo.districts;
  const lkoD = allD.find((d) => d.id === "uttar-pradesh--lucknow");
  ok(allD.length === 763 && allD.filter((d) => d.stateId === "uttar-pradesh").length === 75 && lkoD && lkoD.lgd === "162" && lkoD.nameHi === "लखनऊ" && allD.find((d) => d.id === "uttar-pradesh--kanpur-nagar").lgd === "157", "763 districts filled in with LGD codes (Uttar Pradesh in Hindi too)", lkoD);
  r = await call(S, "POST", "/api/admin/areas", { action: "add_district", stateId: "uttar-pradesh", nameEn: "New Test District", nameHi: "नया ज़िला", lgd: "990001" });
  ok(r.status === 200 && r.body.district.id === "uttar-pradesh--new-test-district", "super admin adds a new district with its LGD code", r.body);
  r = await call(O, "POST", "/api/admin/areas", { action: "add_district", stateId: "uttar-pradesh", nameEn: "Second Test District", lgd: "990002" });
  ok(r.status === 200, "operations admin adds a district too");
  r = await call(S, "POST", "/api/admin/areas", { action: "add_district", stateId: "uttar-pradesh", nameEn: "LUCKNOW", lgd: "162" });
  ok(r.status === 400 && r.body.fields.nameEn === "TAKEN" && r.body.fields.lgd === "LGD_TAKEN", "same name or same LGD code refused", r.body);
  r = await call(S, "POST", "/api/admin/areas", { action: "add_district", stateId: "nowhere", nameEn: "<b>x</b>", lgd: "12a" });
  ok(r.status === 400 && r.body.fields.stateId === "REQUIRED" && r.body.fields.nameEn === "FORMAT" && r.body.fields.lgd === "LGD", "bad state, name and code refused", r.body);
  ok((await call(D, "POST", "/api/admin/areas", { action: "add_district", stateId: "uttar-pradesh", nameEn: "Agra" })).status === 403 && (await call(A, "POST", "/api/admin/areas", { action: "add_district", stateId: "uttar-pradesh", nameEn: "Agra" })).status === 403, "data entry and auditor can't add districts");
  r = await call(S, "POST", "/api/admin/areas", { action: "edit_district", id: "uttar-pradesh--second-test-district", nameEn: "Second Test District", nameHi: "दूसरा ज़िला", lgd: "990002" });
  ok(r.status === 200 && sdb.prepare("SELECT name_hi FROM districts WHERE id = 'uttar-pradesh--second-test-district'").get().name_hi === "दूसरा ज़िला", "district corrected");
  r = await call(S, "POST", "/api/admin/areas", { action: "place_area", id: "lucknow", districtId: "bihar--patna" });
  ok(r.status === 400 && r.body.fields.districtId === "WRONG_STATE", "an area can't go in another state's district");
  r = await call(S, "POST", "/api/admin/areas", { action: "place_area", id: "lucknow", districtId: "uttar-pradesh--lucknow", lgd: "800123" });
  ok(r.status === 200, "area placed in its district with its local body LGD code");
  r = await call(S, "POST", "/api/admin/areas", { action: "place_area", id: "kanpur", lgd: "800123" });
  ok(r.status === 400 && r.body.fields.lgd === "LGD_TAKEN", "a local body LGD code is used once");
  r = await call(D, "GET", "/api/admin/areas");
  const lko = r.body.areas.find((a) => a.id === "lucknow");
  ok(lko.districtId === "uttar-pradesh--lucknow" && lko.lgd === "800123" && r.body.geo.districts.find((d) => d.id === "uttar-pradesh--lucknow").areas === 1, "Areas list shows each area's district", lko);
  // themes
  r = await call(D, "GET", "/api/admin/issue-types");
  ok(r.status === 403 || (r.body.themes && r.body.themes.length === 19), "19 ISO 37120 themes");
  r = await call(S, "GET", "/api/admin/issue-types");
  ok(r.body.themes.length === 19 && r.body.issueTypes.find((t) => t.id === "water-sanitation").theme === "WATER", "issue types show their theme", r.body.issueTypes);
  r = await call(O, "PATCH", "/api/admin/issue-types", { id: "other", theme: "governance" });
  ok(r.status === 200 && r.body.theme === "GOVERNANCE", "theme set", r.body);
  ok((await call(S, "PATCH", "/api/admin/issue-types", { id: "other", theme: "PARTY" })).status === 400 && (await call(A, "PATCH", "/api/admin/issue-types", { id: "other", theme: "WATER" })).status === 403, "unknown theme refused; auditor can't change");
  r = await call(S, "PATCH", "/api/admin/issue-types", { id: "other", theme: "" });
  ok(r.body.theme === null && sdb.prepare("SELECT theme FROM grievance_categories WHERE id = 'other'").get().theme === null, "theme removed");
  ok(sdb.prepare("SELECT suggested_department FROM grievance_categories WHERE id = 'water-sanitation'").get().suggested_department !== undefined, "suggested department untouched");
  // government users
  const good = { action: "add", name: "Priya Verma", designation: "Principal Secretary, Public Grievances", email: "PS.PG@up.gov.in", level: "STATE", stateId: "uttar-pradesh", letterRef: "PG/2026/114", letterDate: "2026-10-10" };
  ok((await call(O, "POST", "/api/admin/gov", good)).status === 403 && (await call(A, "POST", "/api/admin/gov", good)).status === 403, "only the super admin gives government access");
  r = await call(S, "POST", "/api/admin/gov", good);
  ok(r.status === 200 && /^\d{4}-\d\d-\d\d$/.test(r.body.reviewBy), "official added on the state's letter, review date set", r.body);
  const pv = r.body.id;
  ok(sdb.prepare("SELECT email FROM gov_users WHERE id = ?").get(pv).email === "ps.pg@up.gov.in", "email kept in lower case");
  r = await call(S, "POST", "/api/admin/gov", good);
  ok(r.status === 400 && r.body.fields.email === "TAKEN", "same email can't be added twice");
  r = await call(S, "POST", "/api/admin/gov", { action: "add", name: "D", designation: "", email: "dm@gmail.com", level: "DISTRICT", stateId: "uttar-pradesh", districtId: "bihar--patna", letterRef: "", letterDate: "2099-01-01" });
  const f = r.body.fields || {};
  ok(r.status === 400 && f.email === "OFFICIAL" && f.name === "FORMAT" && f.designation === "REQUIRED" && f.districtId === "WRONG_STATE" && f.letterRef === "REQUIRED" && f.letterDate === "FUTURE", "official email, letter and matching district required", f);
  for (const e of ["dm@lucknow.nic.in", "x@gov.in"]) ok((await call(S, "POST", "/api/admin/gov", Object.assign({}, good, { email: e, level: "DISTRICT", districtId: "uttar-pradesh--lucknow", name: "District Officer" }))).status === 200, "official email accepted: " + e);
  ok((await call(S, "POST", "/api/admin/gov", Object.assign({}, good, { email: "a@fakegov.in" }))).body.fields.email === "OFFICIAL", "look-alike domain refused");
  r = await call(A, "GET", "/api/admin/gov");
  ok(r.status === 200 && !r.body.canManage && r.body.users.length === 3 && r.body.users.find((u) => u.id === pv).level === "STATE", "auditor sees who has access", r.body.users.length);
  ok((await call(D, "GET", "/api/admin/gov")).status === 403 && (await call(M, "GET", "/api/admin/gov")).status === 403, "other roles can't see government access");
  ok((await call(S, "POST", "/api/admin/gov", { action: "renew", id: pv, reason: "" })).body.fields.reason === "REQUIRED", "a reason is needed");
  sdb.prepare("UPDATE gov_users SET review_by = '2026-01-01' WHERE id = ?").run(pv);
  ok((await call(S, "GET", "/api/admin/gov")).body.users.find((u) => u.id === pv).reviewDue === true, "yearly review shows as due");
  r = await call(S, "POST", "/api/admin/gov", { action: "renew", id: pv, reason: "State confirmed by letter" });
  ok(r.status === 200 && r.body.reviewBy > "2027-01-01", "review done: one more year", r.body);
  sdb.prepare("INSERT INTO gov_sessions (id_hash, user_id, created_at, last_seen_at, expires_at) VALUES ('h48', ?, '2026-10-01', '2026-10-01', '2099-01-01')").run(pv);
  r = await call(S, "POST", "/api/admin/gov", { action: "remove", id: pv, reason: "Officer transferred" });
  ok(r.status === 400 && r.body.fields.leaveEmpty === "REQUIRED", "grieviq-54: the state's only official: asked to confirm", r.body);
  ok((await call(S, "GET", "/api/admin/gov")).body.users.find((u) => u.id === pv).alone === true, "grieviq-54: shown as the only one for the state");
  r = await call(S, "POST", "/api/admin/gov", { action: "remove", id: pv, reason: "Officer transferred", leaveEmpty: true });
  ok(r.status === 200 && r.body.leftEmpty && sdb.prepare("SELECT status FROM gov_users WHERE id = ?").get(pv).status === "REMOVED" && sdb.prepare("SELECT end_reason FROM gov_sessions WHERE id_hash = 'h48'").get().end_reason === "REMOVED", "removed: signed out at once, record kept");
  ok((await call(S, "POST", "/api/admin/gov", { action: "remove", id: pv, reason: "again" })).status === 409, "can't remove twice");
  ok((await call(S, "POST", "/api/admin/gov", good)).status === 200, "the same email can be given access again later");
  // view log can't be changed
  sdb.prepare("INSERT INTO gov_view_log (id, at, email, action, scope) VALUES ('v48', ?, 'x@gov.in', 'VIEWED', 'uttar-pradesh')").run(new Date().toISOString());
  let t1 = false, t2 = false;
  try { sdb.prepare("UPDATE gov_view_log SET action = 'X'").run(); } catch (e) { t1 = true; }
  try { sdb.prepare("DELETE FROM gov_view_log").run(); } catch (e) { t2 = true; }
  ok(t1 && t2, "view log can't be changed or deleted");
  ok((await call(A, "GET", "/api/admin/gov")).body.log.some((l) => l.action === "VIEWED"), "auditor reads the view log");
  // representative's choice to share
  r = await call("r1@x.in", "GET", "/api/team?office=LOCAL:lu-hazratganj");
  ok(r.body.govShare && r.body.govShare.on === false, "an office's figures are not shared unless it chooses");
  ok((await call("om@x.in", "POST", "/api/team", { action: "gov_share", office: "LOCAL:lu-hazratganj", share: true })).status === 403, "office manager can't choose to share");
  ok((await call("r1@x.in", "POST", "/api/team", { action: "gov_share", office: "LOCAL:lu-hazratganj", share: "yes" })).status === 400, "share must be yes or no");
  r = await call("r1@x.in", "POST", "/api/team", { action: "gov_share", office: "LOCAL:lu-hazratganj", share: true });
  ok(r.status === 200 && r.body.on === true, "representative chooses to share");
  r = await call("om@x.in", "GET", "/api/team?office=LOCAL:lu-hazratganj");
  ok(r.body.govShare.on && r.body.govShare.by === "r1@x.in" && r.body.activity.some((a) => a.action === "GOV_SHARE_ON"), "office manager sees it; team activity records it");
  r = await call(A, "GET", "/api/admin/gov");
  ok(r.body.sharing.length === 1 && r.body.sharing[0].id === "lu-hazratganj", "admin sees which offices share", r.body.sharing);
  await call("r1@x.in", "POST", "/api/team", { action: "gov_share", office: "LOCAL:lu-hazratganj", share: false });
  ok((await call(S, "GET", "/api/admin/gov")).body.sharing.length === 0, "stopped sharing: off the list");
  const ev = sdb.prepare("SELECT action FROM admin_events WHERE action IN ('district_added','district_changed','area_placed','issue_type_theme_changed','gov_user_added','gov_user_renewed','gov_user_removed')").all().map((x) => x.action);
  ok(["district_added", "district_changed", "area_placed", "issue_type_theme_changed", "gov_user_added", "gov_user_renewed", "gov_user_removed"].every((a) => ev.includes(a)), "every change is in the admin log");
  ok((await fetch(B + "/admin-gov.html")).status === 200, "page opens: /admin-gov.html");
}

// ---- grieviq-49: government dashboard (sign-in, figures, demo, other email) ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  // other email: refused without the exception, allowed with it, 90-day review
  const base = { action: "add", name: "Ravi Singh", designation: "District Magistrate", email: "ravi.dm@gmail.com", level: "DISTRICT", stateId: "uttar-pradesh", districtId: "uttar-pradesh--lucknow", letterRef: "PG/2026/130", letterDate: "2026-10-12" };
  let r = await call(S, "POST", "/api/admin/gov", base);
  ok(r.status === 400 && r.body.fields.email === "OFFICIAL", "another email refused unless allowed as an exception");
  r = await call(S, "POST", "/api/admin/gov", Object.assign({}, base, { otherEmail: true, otherReason: "short" }));
  ok(r.status === 400 && r.body.fields.letterNamesEmail === "REQUIRED" && r.body.fields.otherReason === "REQUIRED", "exception needs the letter to name the email and a reason", r.body);
  r = await call(S, "POST", "/api/admin/gov", Object.assign({}, base, { otherEmail: true, letterNamesEmail: true, otherReason: "No NIC email yet; the letter names this one" }));
  const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
  const today49 = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  ok(r.status === 200 && r.body.emailKind === "OTHER" && days(r.body.reviewBy, today49) === 90, "other email allowed as an exception, reviewed in 90 days", r.body);
  const other = r.body.id;
  ok(sdb.prepare("SELECT other_reason FROM gov_users WHERE id = ?").get(other).other_reason.startsWith("No NIC"), "the reason is kept");
  const gl = (await call(A, "GET", "/api/admin/gov")).body.users.find((u) => u.id === other);
  ok(gl.emailKind === "OTHER" && gl.otherReason, "the auditor sees the exception and why");
  ok(sdb.prepare("SELECT COUNT(*) n FROM admin_events WHERE action = 'gov_user_added_other_email'").get().n === 1, "the exception is in the admin log");
  r = await call(S, "POST", "/api/admin/gov", { action: "renew", id: other, reason: "State confirmed again" });
  ok(days(r.body.reviewBy, today49) === 90, "renewing an exception gives 90 more days");
  // sign in
  const signIn = async (email) => {
    await fetch(B + "/api/gov/code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    sdb.prepare("UPDATE gov_codes SET code_hash = ? WHERE email = ? AND used_at IS NULL").run(createHash("sha256").update("gov:" + email + ":424242").digest("hex"), email);
    const v = await fetch(B + "/api/gov/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: "424242" }) });
    return { status: v.status, cookie: (v.headers.get("set-cookie") || "").split(";")[0], raw: v.headers.get("set-cookie") || "" };
  };
  const gq = async (ck, p) => { const x = await fetch(B + p, { headers: ck ? { cookie: ck } : {} }); return { status: x.status, body: await x.json() }; };
  r = await fetch(B + "/api/gov/code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nobody@up.gov.in" }) });
  ok(r.status === 200 && (await r.json()).sent === true, "same answer for an email without access");
  ok(sdb.prepare("SELECT code_hash FROM gov_codes WHERE email = 'nobody@up.gov.in'").get().code_hash.length === 64, "only a hash of the code is kept");
  let bad = await fetch(B + "/api/gov/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nobody@up.gov.in", code: "000000" }) });
  ok(bad.status === 401, "wrong code refused");
  // the state official from grieviq-48 (ps.pg@up.gov.in, active again)
  const st = await signIn("ps.pg@up.gov.in");
  ok(st.status === 200 && /HttpOnly/.test(st.raw) && /SameSite=Strict/.test(st.raw) && /__Host-giq_gov/.test(st.raw), "state official signed in; cookie HttpOnly, SameSite=Strict", st.raw);
  let me = await gq(st.cookie, "/api/gov/me");
  ok(me.status === 200 && me.body.user.level === "STATE" && me.body.state.id === "uttar-pradesh" && me.body.home.state.id === "uttar-pradesh" && !me.body.home.district, "state official starts at their state");
  let s1 = await gq(st.cookie, "/api/gov/stats");
  ok(s1.status === 200 && s1.body.rows.some((x) => x.id === "uttar-pradesh--lucknow") && s1.body.months.length === 12, "state figures with the district rows", s1.body.rows.map((x) => x.id));
  const smallOk = (v) => v === "<10" || v === 0 || (typeof v === "number" && v >= 10);
  const t1 = s1.body.tiles;
  ok(["received", "resolved", "pending", "over30"].every((k) => smallOk(t1[k])) && t1.ages.every(smallOk), "small-number rule: counts 1-9 never sent", t1);
  ok(s1.body.rows.every((x) => ["received", "resolved", "pending", "over30"].every((k) => smallOk(x[k]))) && s1.body.trend.every((m) => smallOk(m.received) && smallOk(m.resolved)), "small-number rule in every row and month");
  const text = JSON.stringify(s1.body);
  ok(!/citizen_phone|9000000|description|citizen_email|tracking_ref|GRV-/.test(text), "no citizen details or case numbers in the figures");
  ok(!/r1@x\.in|Corporator|rep_email/.test(text.replace(/"shared":\[[^\]]*\]/, "")), "representatives' offices not named (unless they share)");
  const lk = await gq(st.cookie, "/api/gov/stats?district=uttar-pradesh--lucknow");
  ok(lk.status === 200 && lk.body.rows.some((x) => x.id === "lucknow"), "district view: its cities and blocks");
  ok((await gq(st.cookie, "/api/gov/stats?district=bihar--patna")).status === 404, "a district of another state can't be opened");
  ok((await gq(st.cookie, "/api/gov/stats?month=2020-01")).status === 400, "only the last 12 months");
  ok((await gq(st.cookie, "/api/gov/stats?state=bihar")).status === 403 && (await gq(st.cookie, "/api/gov/report?r=summary&state=bihar")).status === 403, "a state official can't open another state");
  // sharing office appears by name only when it chose to share
  await call("r1@x.in", "POST", "/api/team", { action: "gov_share", office: "LOCAL:lu-hazratganj", share: true });
  s1 = await gq(st.cookie, "/api/gov/stats");
  ok(s1.body.shared.length === 1 && /Hazratganj/.test(s1.body.shared[0].name), "an office that shares is listed, marked as shared");
  await call("r1@x.in", "POST", "/api/team", { action: "gov_share", office: "LOCAL:lu-hazratganj", share: false });
  ok((await gq(st.cookie, "/api/gov/stats")).body.shared.length === 0, "stops sharing: gone from the dashboard");
  // department detail
  const withDept = (await gq(st.cookie, "/api/gov/stats")).body.depts;
  if (withDept.length) {
    const dd = await gq(st.cookie, "/api/gov/stats?dept=" + encodeURIComponent(withDept[0].key));
    ok(dd.status === 200 && dd.body.dept && dd.body.dept.trend.length === 12, "a department office in detail");
  } else ok(true, "no department forwarded here (nothing to open)");
  ok((await gq(st.cookie, "/api/gov/stats?dept=nope")).status === 404, "unknown department refused");
  // district official with the other email: only their district
  const dm = await signIn("ravi.dm@gmail.com");
  ok(dm.status === 200, "district official (other email) signs in");
  me = await gq(dm.cookie, "/api/gov/me");
  ok(me.body.user.level === "DISTRICT" && me.body.home.district.id === "uttar-pradesh--lucknow", "district official starts at their district");
  ok((await gq(dm.cookie, "/api/gov/stats")).body.rows.some((x) => x.id === "lucknow"), "district official lands on their district");
  ok((await gq(dm.cookie, "/api/gov/stats?district=uttar-pradesh--agra")).status === 403, "another district refused for a district official");
  const log = sdb.prepare("SELECT action FROM gov_view_log WHERE email IN ('ps.pg@up.gov.in', 'ravi.dm@gmail.com')").all().map((x) => x.action);
  ok(log.includes("SIGNED_IN") && log.includes("VIEWED") && log.includes("REFUSED"), "sign-ins, views and refusals logged", log);
  // overdue review: 30 days' grace, then no access
  sdb.prepare("UPDATE gov_users SET review_by = ? WHERE id = ?").run(new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10), other);
  ok((await gq(dm.cookie, "/api/gov/me")).status === 401, "review more than 30 days overdue: signed out");
  sdb.prepare("UPDATE gov_users SET review_by = ? WHERE id = ?").run(new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10), other);
  ok((await signIn("ravi.dm@gmail.com")).status === 200, "within the 30 days' grace: still works");
  // removed: signed out
  const dm2 = await signIn("ravi.dm@gmail.com");
  await call(S, "POST", "/api/admin/gov", { action: "remove", id: other, reason: "Officer transferred", leaveEmpty: true });
  ok((await gq(dm2.cookie, "/api/gov/stats")).status === 401, "removed official is signed out at once");
  // sign out
  const so = await fetch(B + "/api/gov/signout", { method: "POST", headers: { cookie: st.cookie } });
  ok(so.status === 200 && (await gq(st.cookie, "/api/gov/me")).status === 401, "signed out");
  ok((await gq(null, "/api/gov/stats")).status === 401, "figures need sign-in");
  // demo state
  // grieviq-51: national official (a Union ministry)
  let na = await call(S, "POST", "/api/admin/gov", { action: "add", name: "Anil Mehta", designation: "Joint Secretary, DARPG", email: "js.pg@darpg.gov.in", level: "NATIONAL", letterRef: "DARPG/2026/7", letterDate: "2026-10-12" });
  ok(na.status === 200, "national official added without a state", na.body);
  ok(sdb.prepare("SELECT state_id FROM gov_users WHERE id = ?").get(na.body.id).state_id === null, "national account has no state");
  const nc = await signIn("js.pg@darpg.gov.in");
  me = await gq(nc.cookie, "/api/gov/me");
  ok(me.body.user.level === "NATIONAL" && me.body.home.state === null, "national official starts at the country");
  let ns = await gq(nc.cookie, "/api/gov/stats");
  ok(ns.status === 200 && ns.body.place.national && ns.body.rows.some((x) => x.id === "uttar-pradesh") && !ns.body.rows.some((x) => x.id === "bihar"), "country view: one row per state where GrievIQ is in use", ns.body.rows.map((x) => x.id));
  ok(ns.body.rows.every((x) => ["received", "resolved", "pending", "over30"].every((k) => x[k] === "<10" || x[k] === 0 || x[k] >= 10)), "small-number rule at country level");
  ns = await gq(nc.cookie, "/api/gov/stats?state=uttar-pradesh");
  ok(ns.status === 200 && ns.body.place.state.id === "uttar-pradesh" && ns.body.rows.some((x) => x.id === "uttar-pradesh--lucknow"), "national official opens a state");
  ok((await gq(nc.cookie, "/api/gov/stats?state=uttar-pradesh&district=uttar-pradesh--lucknow")).body.rows.some((x) => x.id === "lucknow"), "and a district");
  ok((await gq(nc.cookie, "/api/gov/stats?district=uttar-pradesh--lucknow")).status === 404, "a district needs its state");
  const nr = await gq(nc.cookie, "/api/gov/report?r=districts");
  ok(nr.status === 200 && nr.body.tables[0].title === "gv.rp_states" && nr.body.place.national, "national report: state by state");
  ok((await gq(nc.cookie, "/api/gov/report?r=reps")).body.tables[0].rows.some((x) => x.name.en === "Uttar Pradesh"), "representatives' report by state, no office named");
  const dmo = await gq(null, "/api/gov/stats?demo=1");
  ok(dmo.status === 200 && dmo.body.demo === true && dmo.body.place.national && dmo.body.rows.length === 6 && dmo.body.rows.every((x) => /^Demo State [A-F]$/.test(x.nameEn)) && dmo.body.depts.length === 6, "demo country: 6 sample states, 6 departments, marked demo");
  ok(dmo.body.rows.reduce((a, x) => a + x.received, 0) === dmo.body.tiles.received, "demo: state rows add up to the country total");
  const dst = await gq(null, "/api/gov/stats?demo=1&state=demo-c");
  ok(dst.body.rows.length === 7 && dst.body.rows.every((x) => /^Demo District C\d$/.test(x.nameEn)) && dst.body.rows.reduce((a, x) => a + x.received, 0) === dst.body.tiles.received && dst.body.place.state.id === "demo-c", "demo state: its districts add up to it");
  ok((await gq(null, "/api/gov/stats?demo=1&state=demo-c&district=demo-c-3")).body.rows.length === 3, "demo district view");
  ok((await gq(null, "/api/gov/stats?demo=1&state=uttar-pradesh")).status === 404 && (await gq(null, "/api/gov/stats?demo=1&state=demo-a&district=demo-b-1")).status === 404, "real places never in the demo; a district must be in its state");
  ok((await gq(null, "/api/gov/stats?demo=1&dept=demo-dept-0")).body.dept.trend.length === 12, "demo department view");
  ok(!/"lgd":"\w/.test(JSON.stringify(dmo.body)), "demo places carry no codes that could pass for LGD codes");
  ok((await fetch(B + "/gov")).status === 200, "page opens: /gov");
}

// ---- grieviq-50: MIS reports and report emails ----
{
  const fs = await import("node:fs");
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const mails = () => fs.existsSync(MAIL) ? fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const signIn = async (email) => {
    await fetch(B + "/api/gov/code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    sdb.prepare("UPDATE gov_codes SET code_hash = ? WHERE email = ? AND used_at IS NULL").run(createHash("sha256").update("gov:" + email + ":373737").digest("hex"), email);
    const v = await fetch(B + "/api/gov/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: "373737" }) });
    return (v.headers.get("set-cookie") || "").split(";")[0];
  };
  const gq = async (ck, p, m, b) => { const x = await fetch(B + p, { method: m || "GET", headers: Object.assign({ "content-type": "application/json" }, ck ? { cookie: ck } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: x.status, body: await x.json() }; };
  const R6 = ["summary", "districts", "departments", "pending30", "themes", "reps"];
  // demo
  for (const r of R6) {
    const x = await gq(null, "/api/gov/report?demo=1&r=" + r);
    ok(x.status === 200 && x.body.demo === true && x.body.tables[0].rows.length > 0 && x.body.tables[0].columns.length > 2, "demo report: " + r);
  }
  const dt = (await gq(null, "/api/gov/report?demo=1&r=themes")).body.tables[0];
  ok(dt.columns.filter((c) => c.month).length === 12, "issue types report: 12 months");
  ok((await gq(null, "/api/gov/report?demo=1&r=nope")).status === 400 && (await gq(null, "/api/gov/report?r=summary")).status === 401, "unknown report refused; real reports need sign-in");
  // real, as the state official
  const ck = await signIn("ps.pg@up.gov.in");
  for (const r of R6) {
    const x = await gq(ck, "/api/gov/report?r=" + r);
    ok(x.status === 200 && !x.body.demo && x.body.place.state.id === "uttar-pradesh" && Array.isArray(x.body.tables[0].rows), "report for the state: " + r);
    const txt = JSON.stringify(x.body);
    ok(!/9000000|GRV-|description|citizen|r1@x\.in|@x\.in/.test(txt), "no personal or case details: " + r);
    ok(x.body.tables[0].rows.every((row) => ["received", "resolved", "pending", "over30", "total", "b1", "b2", "b3"].every((k) => row[k] === undefined || row[k] === "<10" || row[k] === 0 || row[k] >= 10)), "small-number rule in report: " + r);
  }
  const sum = (await gq(ck, "/api/gov/report?r=summary")).body.tables[0];
  ok(sum.columns.map((c) => c.key).join() === "name,now,last,year" && sum.rows.length === 14, "summary: this month, last month, same month last year");
  const pend = (await gq(ck, "/api/gov/report?r=pending30")).body.tables[0];
  ok(pend.rows[pend.rows.length - 1].name.k === "gv.rp_not_forwarded", "pending report ends with the cases still with representatives' offices (no office named)");
  const reps = (await gq(ck, "/api/gov/report?r=reps")).body.tables[0];
  ok(reps.rows.some((r) => r.name.en === "Lucknow" && r.offices === 2), "representatives' report: totals by district, offices counted not named", reps.rows);
  ok((await gq(ck, "/api/gov/report?r=summary&district=bihar--patna")).status === 404, "report for another state's district refused");
  ok(sdb.prepare("SELECT COUNT(*) n FROM gov_view_log WHERE action = 'REPORT' AND email = 'ps.pg@up.gov.in'").get().n >= 6, "every report opened is logged");
  // report emails: off unless chosen
  let pr = await gq(ck, "/api/gov/prefs");
  ok(pr.status === 200 && pr.body.ready && !pr.body.monthly && !pr.body.weekly, "report emails off unless chosen");
  let before = mails().length;
  let run = await (await fetch(B + "/__test/run-gov-reports", { method: "POST", body: JSON.stringify({ now: "2026-11-01T04:00:00Z" }) })).json();
  ok(run.sent === 0 && mails().length === before, "nobody chose: no email");
  pr = await gq(ck, "/api/gov/prefs", "POST", { monthly: true });
  ok(pr.body.monthly === true && pr.body.weekly === false, "monthly email chosen");
  run = await (await fetch(B + "/__test/run-gov-reports", { method: "POST", body: JSON.stringify({ now: "2026-11-01T01:00:00Z" }) })).json();
  ok(run.due === 0, "before 8 am India time: nothing yet");
  run = await (await fetch(B + "/__test/run-gov-reports", { method: "POST", body: JSON.stringify({ now: "2026-11-01T04:00:00Z" }) })).json();
  const m1 = mails().slice(before);
  ok(run.sent === 1 && m1.length === 1 && m1[0].to[0] === "ps.pg@up.gov.in" && /October 2026/.test(m1[0].subject), "on the 1st: one email that last month's report is ready", m1.map((m) => m.subject));
  ok(!/\d{2,}\s*(complaints|pending)|received|GRV-/.test(m1[0].html.replace(/October 2026|2026/g, "")) && /never contain figures/.test(m1[0].html) && /रिपोर्ट/.test(m1[0].html), "the email has no figures or case details, in English and Hindi");
  run = await (await fetch(B + "/__test/run-gov-reports", { method: "POST", body: JSON.stringify({ now: "2026-11-01T09:00:00Z" }) })).json();
  ok(run.sent === 0, "sent once only");
  await gq(ck, "/api/gov/prefs", "POST", { weekly: true });
  before = mails().length;
  run = await (await fetch(B + "/__test/run-gov-reports", { method: "POST", body: JSON.stringify({ now: "2026-11-02T04:00:00Z" }) })).json();
  ok(run.sent === 1 && /pending over 30 days/.test(mails().slice(before)[0].subject), "on Monday: the weekly email");
  run = await (await fetch(B + "/__test/run-gov-reports", { method: "POST", body: JSON.stringify({ now: "2026-11-03T04:00:00Z" }) })).json();
  ok(run.due === 0, "other days: nothing");
  ok(sdb.prepare("SELECT COUNT(*) n FROM gov_view_log WHERE action = 'EMAIL_CHOICE'").get().n >= 2, "email choices logged");
  // removed officials get no email
  const uid = sdb.prepare("SELECT id FROM gov_users WHERE email = 'ps.pg@up.gov.in' AND status = 'ACTIVE'").get().id;
  sdb.prepare("UPDATE gov_users SET review_by = '2025-01-01' WHERE id = ?").run(uid);
  before = mails().length;
  run = await (await fetch(B + "/__test/run-gov-reports", { method: "POST", body: JSON.stringify({ now: "2026-11-09T04:00:00Z" }) })).json();
  ok(run.sent === 0 && mails().length === before, "no email to an account whose review is overdue");
  sdb.prepare("UPDATE gov_users SET review_by = '2027-10-01' WHERE id = ?").run(uid);
  ok((await fetch(B + "/gov-report")).status === 200, "page opens: /gov-report");
}

// ---- grieviq-53: change of representative ----
{
  const fs = await import("node:fs");
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const mails = () => fs.existsSync(MAIL) ? fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const H = (who, b) => call(who, b ? "POST" : "GET", "/api/admin/handovers", b);
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  const base = (o) => Object.assign({ action: "propose", seatType: "ward", seatId: "lu-tilak", kind: "NEW_REP", newName: "Rina New", newEmail: "r3@x.in", reason: "ELECTION", evidence: "SEC/UP/2027/123", effectiveDate: today }, o || {});
  // access
  ok((await H(M)).status === 403, "handovers: data moderator has no access");
  const au = await H(A);
  ok(au.status === 200 && au.body.ready && !au.body.canRequest && !au.body.canApply, "handovers: auditor reads only", au.body);
  ok((await H(A, base())).status === 403, "handovers: auditor can't propose");
  const dv = await H(D);
  ok(dv.body.canRequest && !dv.body.canApply, "handovers: operator may ask, not apply");
  const sv = await H(S);
  ok(sv.body.canApply && sv.body.seats.ward.some((w) => w.id === "lu-tilak" && w.email === "r2@x.in" && w.status === "ELECTED") && sv.body.seats.mla.some((m) => m.id === "mla-c") && sv.body.seats.mp.length === 1, "handovers: every seat with its holder", sv.body.seats && sv.body.seats.ward);
  // checks
  let r = await H(D, { action: "propose" });
  ok(r.status === 400 && ["seat", "kind", "reason", "evidence", "effectiveDate"].every((k) => r.body.fields[k]), "handovers: empty request names each field", r.body);
  r = await H(D, base({ effectiveDate: "2099-01-01" }));
  ok(r.body.fields && r.body.fields.effectiveDate === "FUTURE", "handovers: no future date");
  r = await H(D, base({ newEmail: "r2@x.in" }));
  ok(r.body.fields && r.body.fields.newEmail === "SAME", "handovers: the same email is a correction, not a handover");
  r = await H(D, base({ newEmail: "bad@" }));
  ok(r.body.fields && r.body.fields.newEmail === "FORMAT", "handovers: email format");
  r = await H(D, base({ reason: "OTHER" }));
  ok(r.body.fields && r.body.fields.reasonNote === "REQUIRED", "handovers: 'Other' needs a note");
  r = await H(D, base({ newName: "" }));
  ok(r.body.fields && r.body.fields.newName === "REQUIRED", "handovers: name needed");
  // the office before: a team member, an assignment, sharing on, a session and phone alerts for r2
  sdb.prepare("INSERT INTO office_team (id, office_tier, office_id, member_email, member_name, role, status, confirmed_by_rep_email, added_by, added_at) VALUES ('t-ho','LOCAL','lu-tilak','fw2@x.in','Fatima Worker','FIELD_WORKER','ACTIVE','r2@x.in','r2@x.in','2026-10-01T00:00:00Z')").run();
  sdb.prepare("INSERT INTO grievances (id, tracking_ref, citizen_phone, local_unit_id, category_id, status, description, current_tier, created_at) VALUES ('g-ho','GRV-HO0001','9000000099','lu-tilak','other','OPEN','Street light out','LOCAL',?)").run(new Date(Date.now() - 3600000).toISOString());
  sdb.prepare("INSERT INTO case_assignments (id, grievance_id, office_tier, office_id, assignee_email, assigned_by, assigned_at) VALUES ('as-ho','g-ho','LOCAL','lu-tilak','fw2@x.in','r2@x.in',?)").run(new Date().toISOString());
  sdb.prepare("INSERT OR REPLACE INTO office_gov_share (office_tier, office_id, office_name, share, changed_at, changed_by) VALUES ('LOCAL','lu-tilak','Tilak Nagar',1,?, 'r2@x.in')").run(new Date().toISOString());
  sdb.prepare("INSERT INTO rep_sessions (id_hash, email, created_at, last_seen_at, expires_at) VALUES ('sess-ho-r2','r2@x.in',?,?,?)").run(new Date().toISOString(), new Date().toISOString(), new Date(Date.now() + 3600000).toISOString());
  sdb.prepare("INSERT INTO push_subscriptions (id, email, endpoint, p256dh, auth, created_at) VALUES ('ps-ho','r2@x.in','https://push.example/ho','k','a',?)").run(new Date().toISOString());
  // an operator asks; nobody approves their own; a second request for the same seat waits
  r = await H(D, base());
  ok(r.status === 200 && r.body.status === "PENDING", "handovers: operator's request waits for approval", r.body);
  const id1 = r.body.id;
  ok(sdb.prepare("SELECT rep_email FROM local_units WHERE id = 'lu-tilak'").get().rep_email === "r2@x.in", "handovers: nothing changes until approved");
  r = await H(D, base({ newEmail: "r4@x.in" }));
  ok(r.status === 409 && r.body.fields.seat === "PENDING", "handovers: one waiting request per seat");
  ok((await H(D, { action: "approve", id: id1 })).status === 403, "handovers: operator can't approve");
  let before = mails().length;
  r = await H(S, { action: "approve", id: id1 });
  ok(r.status === 200 && r.body.status === "APPLIED" && r.body.summary.assignmentsReturned === 1 && r.body.summary.shareSwitchedOff && r.body.summary.outgoingSignedOut, "handovers: approved and applied, with what was done", r.body);
  const lu = sdb.prepare("SELECT rep_name, rep_email, seat_status FROM local_units WHERE id = 'lu-tilak'").get();
  ok(lu.rep_email === "r3@x.in" && lu.rep_name === "Rina New" && lu.seat_status === null, "handovers: the seat shows the new representative", lu);
  ok(sdb.prepare("SELECT ended_at, end_reason FROM rep_sessions WHERE id_hash = 'sess-ho-r2'").get().end_reason === "HANDOVER", "handovers: the outgoing person's sessions end");
  ok(sdb.prepare("SELECT COUNT(*) n FROM push_subscriptions WHERE email = 'r2@x.in'").get().n === 0, "handovers: and their phone alerts");
  ok(sdb.prepare("SELECT end_reason FROM case_assignments WHERE id = 'as-ho'").get().end_reason === "HANDOVER", "handovers: the old team's cases return to the office");
  ok(sdb.prepare("SELECT share FROM office_gov_share WHERE office_id = 'lu-tilak'").get().share === 0, "handovers: sharing with the state switched off");
  const hm = mails().slice(before);
  const out = hm.find((m) => m.to[0] === "r2@x.in"), inn = hm.find((m) => m.to[0] === "r3@x.in");
  ok(out && /access to the office has ended/.test(out.subject) && inn && /welcome/.test(inn.subject), "handovers: emails to both people", hm.map((m) => m.to[0] + ": " + m.subject));
  ok(hm.every((m) => !/GRV-|Street light|9000000099/.test(m.html)) && /पहुँच/.test(out.html) && /स्वागत|कार्यालय/.test(inn.html), "handovers: emails carry no case details, in English and Hindi");
  ok((await call("r2@x.in", "GET", "/api/me")).status === 403, "handovers: the outgoing person can no longer open the office");
  // the new representative's summary
  let me = await call("r3@x.in", "GET", "/api/me");
  const ho = me.body.handovers && me.body.handovers[0];
  ok(me.status === 200 && ho && ho.id === id1 && ho.office === "Tilak Nagar-Kundari Rakabganj" && ho.teamPaused === 1 && !ho.planAccepted && me.body.mandates.some((m) => m.id === "lu-tilak" && m.seat === "ELECTED"), "handovers: the new representative sees the summary", me.body);
  ok((await call("r1@x.in", "POST", "/api/handover", { id: id1, action: "seen" })).status === 404, "handovers: nobody else can answer it");
  r = await call("r3@x.in", "POST", "/api/handover", { id: id1, action: "accept_plan" });
  ok(r.status === 200 && r.body.planAccepted, "handovers: the new representative continues the plan");
  r = await call("r3@x.in", "POST", "/api/handover", { id: id1, action: "seen" });
  me = await call("r3@x.in", "GET", "/api/me");
  ok(r.status === 200 && me.body.handovers.length === 0, "handovers: once read, not shown again");
  const tm = await call("r3@x.in", "GET", "/api/team?office=LOCAL:lu-tilak");
  ok(tm.status === 200 && (tm.body.members || []).some((m) => m.email === "fw2@x.in" && m.paused), "handovers: the old team is paused until confirmed", tm.body);
  // a vacant seat: complaints go straight to the next level, not late
  r = await H(S, base({ kind: "VACANT", reason: "RESIGNATION", newName: "", newEmail: "" }));
  ok(r.status === 200 && r.body.status === "PENDING", "handovers: an admin's own request also waits if not applied now");
  const id2 = r.body.id;
  ok((await H(S, { action: "approve", id: id2 })).body.error === "OWN_REQUEST", "handovers: never approve your own");
  r = await H(O, { action: "approve", id: id2 });
  ok(r.status === 200 && r.body.status === "APPLIED", "handovers: a second admin approves");
  const v = sdb.prepare("SELECT rep_name, rep_email, seat_status FROM local_units WHERE id = 'lu-tilak'").get();
  ok(v.seat_status === "VACANT" && v.rep_email === null && v.rep_name === null, "handovers: the seat is vacant", v);
  ok((await call("r3@x.in", "GET", "/api/me")).status === 403, "handovers: the previous holder loses access");
  const io = await (await fetch(B + "/api/intake-options")).json();
  ok(io.localUnits.some((u) => u.id === "lu-tilak"), "handovers: citizens can still file in a vacant ward");
  const ml = await call("mla@x.in", "GET", "/api/grievances");
  const gc = (ml.body.grievances || []).find((c) => c.id === "g-ho");
  ok(gc && gc.currentTopTier === "MLA" && !gc.isLate, "handovers: the next level has the case at once, not late", gc);
  ok((await H(S, base({ kind: "VACANT", reason: "RESIGNATION" }))).body.fields.kind === "ALREADY_VACANT", "handovers: already vacant");
  // out of date: the seat changed after the request
  r = await H(D, base({ kind: "ADMINISTRATOR", reason: "ADMINISTRATOR", newName: "BDO Kakori (Administrator)", newEmail: "bdo@x.in" }));
  const id3 = r.body.id;
  sdb.prepare("UPDATE local_units SET seat_status = NULL, rep_email = 'someone@x.in' WHERE id = 'lu-tilak'").run();
  r = await H(S, { action: "approve", id: id3 });
  ok(r.status === 409 && r.body.error === "OUT_OF_DATE" && sdb.prepare("SELECT status FROM seat_handovers WHERE id = ?").get(id3).status === "OUT_OF_DATE", "handovers: a request made against old details is not applied");
  sdb.prepare("UPDATE local_units SET seat_status = 'VACANT', rep_email = NULL WHERE id = 'lu-tilak'").run();
  // reject (with a reason) and withdraw
  r = await H(D, base({ kind: "ADMINISTRATOR", reason: "ADMINISTRATOR", newName: "BDO Kakori (Administrator)", newEmail: "bdo@x.in" }));
  const id4 = r.body.id;
  ok((await H(S, { action: "reject", id: id4 })).status === 400, "handovers: rejecting needs a reason");
  ok((await H(S, { action: "reject", id: id4, note: "Order not yet issued" })).body.status === "REJECTED", "handovers: rejected with a reason");
  r = await H(D, base({ kind: "ADMINISTRATOR", reason: "ADMINISTRATOR", newName: "BDO Kakori (Administrator)", newEmail: "bdo@x.in" }));
  ok((await H(S, { action: "withdraw", id: r.body.id })).status === 403 && (await H(D, { action: "withdraw", id: r.body.id })).body.status === "WITHDRAWN", "handovers: only the person who asked can withdraw");
  // an administrator, applied directly
  r = await H(S, base({ kind: "ADMINISTRATOR", reason: "ADMINISTRATOR", newName: "BDO Kakori (Administrator)", newEmail: "bdo@x.in", applyNow: true }));
  ok(r.body.status === "APPLIED" && sdb.prepare("SELECT seat_status FROM local_units WHERE id = 'lu-tilak'").get().seat_status === "ADMINISTRATOR", "handovers: an administrator takes charge");
  me = await call("bdo@x.in", "GET", "/api/me");
  ok(me.status === 200 && me.body.mandates.some((m) => m.id === "lu-tilak" && m.seat === "ADMINISTRATOR") && me.body.handovers[0].kind === "ADMINISTRATOR", "handovers: the administrator sees the office, labelled");
  const recent = (await H(A)).body.recent;
  ok(recent.length >= 5 && recent.some((x) => x.status === "REJECTED" && x.decisionNote === "Order not yet issued"), "handovers: the auditor sees every decision");
  const ev = sdb.prepare("SELECT action, COUNT(*) n FROM admin_events WHERE action LIKE 'seat_handover_%' GROUP BY action").all().reduce((m, x) => (m[x.action] = x.n, m), {});
  ok(ev.seat_handover_requested >= 6 && ev.seat_handover_applied >= 3 && ev.seat_handover_rejected === 1 && ev.seat_handover_withdrawn === 1 && ev.seat_handover_out_of_date === 1 && ev.seat_handover_plan_accepted === 1 && ev.seat_handover_summary_read === 1, "handovers: every step logged", ev);
  // back as it was for the browser tests
  r = await H(S, base({ newName: "R Two", newEmail: "r2@x.in", applyNow: true }));
  ok(r.body.status === "APPLIED", "handovers: seat returned to its first representative");
  sdb.prepare("UPDATE local_units SET rep_name = NULL WHERE id = 'lu-tilak'").run();
  sdb.prepare("UPDATE seat_handovers SET welcome_seen_at = ? WHERE new_email = 'r2@x.in'").run(new Date().toISOString());
  sdb.prepare("DELETE FROM case_assignments WHERE id = 'as-ho'").run();
  sdb.prepare("DELETE FROM notify_state WHERE grievance_id = 'g-ho'").run();
  sdb.prepare("DELETE FROM grievances WHERE id = 'g-ho'").run();
  sdb.prepare("DELETE FROM office_team WHERE id = 't-ho'").run();
  sdb.prepare("DELETE FROM office_gov_share WHERE office_id = 'lu-tilak'").run();
}

// ---- grieviq-54: transfers of department officers and government officials ----
{
  const fs = await import("node:fs");
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const mails = () => fs.existsSync(MAIL) ? fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const now = new Date().toISOString(), today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  const mk = (id, name) => sdb.prepare("INSERT INTO dept_offices (id, area_id, name_en, departments, source, last_checked, created_at, created_by, updated_at, updated_by) VALUES (?, 'lucknow', ?, '[\"Water Supply\"]', 'test', ?, ?, 't', ?, 't')").run(id, name, today, now, now);
  mk("tr-a", "Transfer Test Office A"); mk("tr-b", "Transfer Test Office B"); mk("tr-c", "Transfer Test Office C");
  for (const o of ["tr-a", "tr-b"]) sdb.prepare("INSERT INTO dept_agreements (office_id, signed_on, signed_by, document_ref, recorded_by, recorded_at, updated_at) VALUES (?, '2026-10-01', 'R. K. Singh, EE', 'TR/1', 't', ?, ?)").run(o, now, now);
  const DP = (b, who) => call(who || S, "POST", "/api/admin/dept-officers", b);
  const o1 = (await DP({ action: "officer_add", officeId: "tr-a", name: "Meera Shukla", designation: "Assistant Engineer", email: "ae1.tr@nic.in" })).body.id;
  const o2 = (await DP({ action: "officer_add", officeId: "tr-a", name: "Arun Pal", designation: "Junior Engineer", email: "ae2.tr@nic.in" })).body.id;
  // one open complaint waiting with office A
  sdb.prepare("INSERT INTO grievances (id, tracking_ref, citizen_phone, local_unit_id, category_id, status, description, current_tier, created_at) VALUES ('g-tr','GRV-TR0001','9000000098','lu-hazratganj','water-sanitation','OPEN','Leak','LOCAL',?)").run(now);
  sdb.prepare("INSERT INTO case_dept_steps (id, grievance_id, kind, department, office_id, office_name, actor, created_at) VALUES ('st-tr','g-tr','FORWARDED','Water Supply','tr-a','Transfer Test Office A','r1@x.in',?)").run(now);
  let g = await call(S, "GET", "/api/admin/dept-officers?office=tr-a");
  ok(g.body.transfersReady && g.body.waiting === 1 && g.body.targets.some((t) => t.id === "tr-b") && !g.body.targets.some((t) => t.id === "tr-a" || t.id === "tr-c"), "transfers: only offices with an agreement are offered; open cases counted", g.body.targets);
  ok((await call(A, "GET", "/api/admin/dept-officers?office=tr-a")).body.targets.length === 0, "transfers: the auditor gets no transfer list");
  ok((await DP({ action: "officer_leave", officerId: o1, kind: "LEFT", reason: "Retired on 31 October" }, A)).status === 403, "transfers: the auditor can't change officers");
  // checks
  let r = await DP({ action: "officer_leave", officerId: o1 });
  ok(r.status === 400 && r.body.fields.kind === "REQUIRED", "transfers: say what is happening");
  r = await DP({ action: "officer_leave", officerId: o1, kind: "TRANSFER" });
  ok(r.body.fields.toOfficeId === "REQUIRED" && r.body.fields.orderRef === "LENGTH", "transfers: new office and order number needed", r.body.fields);
  ok((await DP({ action: "officer_leave", officerId: o1, kind: "TRANSFER", toOfficeId: "tr-c", orderRef: "TR/77" })).body.fields.toOfficeId === "NO_AGREEMENT", "transfers: not to an office without an agreement");
  ok((await DP({ action: "officer_leave", officerId: o1, kind: "TRANSFER", toOfficeId: "tr-a", orderRef: "TR/77" })).body.fields.toOfficeId === "SAME", "transfers: not to the same office");
  ok((await DP({ action: "officer_leave", officerId: o1, kind: "TRANSFER", toOfficeId: "tr-b", orderRef: "TR/77", email: "ae2.tr@nic.in" })).body.fields.email === "OTHER_OFFICE", "transfers: not to someone else's email");
  ok((await DP({ action: "officer_leave", officerId: o1, kind: "LEFT", reason: "short" })).body.fields.reason === "SHORT", "leaving: a reason is needed");
  // transfer, with a new email and designation at the new office
  sdb.prepare("INSERT INTO dept_sessions (id_hash, officer_id, created_at, last_seen_at, expires_at) VALUES ('ds-tr', ?, ?, ?, '2099-01-01')").run(o1, now, now);
  sdb.prepare("INSERT INTO push_subscriptions (id, email, endpoint, p256dh, auth, created_at) VALUES ('ps-tr', ?, 'https://push.example/tr', 'k', 'a', ?)").run("dept:" + o1, now);
  sdb.prepare("UPDATE dept_officers SET rules_version = 'v1', rules_accepted_at = ? WHERE id = ?").run(now, o1);
  let before = mails().length;
  r = await DP({ action: "officer_leave", officerId: o1, kind: "TRANSFER", toOfficeId: "tr-b", designation: "Executive Engineer", email: "ee.b@nic.in", orderRef: "UPJN/TR/2026/77" });
  ok(r.status === 200 && r.body.id && !r.body.successorId, "transfers: officer transferred", r.body);
  const oldRow = sdb.prepare("SELECT * FROM dept_officers WHERE id = ?").get(o1), newRow = sdb.prepare("SELECT * FROM dept_officers WHERE id = ?").get(r.body.id);
  ok(oldRow.status === "REMOVED" && oldRow.moved_to === newRow.id && oldRow.order_ref === "UPJN/TR/2026/77" && newRow.office_id === "tr-b" && newRow.moved_from === o1 && newRow.email === "ee.b@nic.in" && newRow.designation === "Executive Engineer" && newRow.rules_version === "v1", "transfers: record moves with them, linked both ways, rules kept", { oldRow, newRow });
  ok(sdb.prepare("SELECT end_reason FROM dept_sessions WHERE id_hash = 'ds-tr'").get().end_reason === "TRANSFERRED" && !sdb.prepare("SELECT id FROM push_subscriptions WHERE id = 'ps-tr'").get(), "transfers: signed out, phone alerts stopped");
  const tm = mails().slice(before);
  ok(tm.length === 1 && tm[0].to[0] === "ee.b@nic.in" && /moved/.test(tm[0].subject) && /Transfer Test Office B/.test(tm[0].html) && /स्थानांतरित/.test(tm[0].html) && !/GRV-|Leak/.test(tm[0].html), "transfers: a short email in English and Hindi, no case details", tm.map((m) => m.subject));
  g = await call(S, "GET", "/api/admin/dept-officers?office=tr-a");
  ok(g.body.officers.find((x) => x.id === o1).movedTo.office === "Transfer Test Office B" && g.body.officers.find((x) => x.id === o1).orderRef === "UPJN/TR/2026/77", "transfers: the old office shows where they went");
  ok((await call(S, "GET", "/api/admin/dept-officers?office=tr-b")).body.officers.find((x) => x.id === r.body.id).movedFrom.office === "Transfer Test Office A", "transfers: the new office shows where they came from");
  ok((await DP({ action: "officer_leave", officerId: o1, kind: "LEFT", reason: "Retired on 31 October" })).status === 409, "transfers: a closed record can't leave again");
  // the guard: Arun is now the only officer of office A
  r = await DP({ action: "officer_leave", officerId: o2, kind: "LEFT", reason: "Retired on 31 October" });
  ok(r.status === 400 && r.body.fields.succ === "REQUIRED" && r.body.waiting === 1, "guard: the only officer needs a successor or a recorded choice", r.body);
  ok((await DP({ action: "officer_leave", officerId: o2, kind: "LEFT", reason: "Retired on 31 October", successor: { name: "K", designation: "", email: "ae2.tr@nic.in" } })).body.fields.sEmail === "SAME", "guard: the successor needs their own email");
  r = await DP({ action: "officer_leave", officerId: o2, kind: "LEFT", reason: "Retired on 31 October", successor: { name: "K", designation: "", email: "ee.b@nic.in" } });
  ok(r.body.fields.sEmail === "OTHER_OFFICE" && r.body.fields.sName === "LENGTH" && r.body.fields.sDesignation === "LENGTH", "guard: successor's details checked", r.body.fields);
  before = mails().length;
  r = await DP({ action: "officer_leave", officerId: o2, kind: "LEFT", reason: "Retired on 31 October", successor: { name: "Kiran Rao", designation: "Junior Engineer", email: "je.a.tr@nic.in" } });
  ok(r.status === 200 && r.body.successorId && mails().slice(before).some((m) => m.to[0] === "je.a.tr@nic.in" && /Welcome/.test(m.subject)), "guard: successor added in the same step and welcomed", r.body);
  g = await call(S, "GET", "/api/admin/dept-officers?office=tr-a");
  ok(g.body.officers.filter((x) => x.status === "ACTIVE").map((x) => x.name).join() === "Kiran Rao", "guard: the office still has someone to reply");
  r = await DP({ action: "officer_leave", officerId: r.body.successorId, kind: "LEFT", reason: "Posted outside Lucknow", leaveEmpty: true });
  ok(r.status === 200 && r.body.leftEmpty, "guard: left with nobody only when chosen");
  const empty = sdb.prepare("SELECT detail FROM admin_events WHERE action = 'dept_office_left_empty' AND target = 'tr-a'").get();
  ok(empty && JSON.parse(empty.detail).waiting === 1, "guard: the choice is recorded with the open cases");
  const dl = await call(S, "GET", "/api/admin/departments?area=lucknow");
  ok(dl.body.offices.find((o) => o.id === "tr-a").noOfficer === true && !dl.body.offices.find((o) => o.id === "tr-b").noOfficer && !dl.body.offices.find((o) => o.id === "tr-c").noOfficer, "departments list: an office with an agreement and nobody to reply is marked");
  ok(sdb.prepare("SELECT COUNT(*) n FROM admin_events WHERE action = 'dept_officer_transferred' AND target = ?").get(o1).n === 1, "transfers: logged");
  // the old removal call still works for an office with others left
  sdb.prepare("DELETE FROM case_dept_steps WHERE id = 'st-tr'").run(); sdb.prepare("DELETE FROM grievances WHERE id = 'g-tr'").run();
  sdb.prepare("DELETE FROM dept_sessions WHERE officer_id IN (SELECT id FROM dept_officers WHERE office_id IN ('tr-a','tr-b','tr-c'))").run();
  sdb.prepare("DELETE FROM dept_officers WHERE office_id IN ('tr-a','tr-b','tr-c')").run();
  sdb.prepare("DELETE FROM dept_agreements WHERE office_id IN ('tr-a','tr-b','tr-c')").run();
  sdb.prepare("DELETE FROM dept_offices WHERE id IN ('tr-a','tr-b','tr-c')").run();

  // government officials
  const G = (b) => call(S, "POST", "/api/admin/gov", b);
  const L = { letterRef: "BR/GA/2026/9", letterDate: today };
  const sb = (await G(Object.assign({ action: "add", name: "Sunita Prasad", designation: "Principal Secretary", email: "ps.tr@bihar.gov.in", level: "STATE", stateId: "bihar" }, L))).body.id;
  const dpz = (await G(Object.assign({ action: "add", name: "Vikram Singh", designation: "District Magistrate", email: "dm.tr@nic.in", level: "DISTRICT", stateId: "bihar", districtId: "bihar--patna" }, L))).body.id;
  let gv = await call(S, "GET", "/api/admin/gov");
  ok(gv.body.transfersReady && gv.body.users.find((u) => u.id === sb).alone === true && gv.body.users.find((u) => u.id === dpz).alone === false, "officials: the state's only official is marked; a district covered by the state is not");
  sdb.prepare("INSERT INTO gov_sessions (id_hash, user_id, created_at, last_seen_at, expires_at) VALUES ('gs-tr', ?, ?, ?, '2099-01-01')").run(dpz, now, now);
  sdb.prepare("INSERT INTO gov_report_prefs (user_id, monthly, weekly, updated_at) VALUES (?, 1, 0, ?)").run(dpz, now);
  r = await G({ action: "transfer", id: dpz });
  ok(r.status === 400 && ["level", "letterRef", "letterDate", "reason"].every((k) => r.body.fields[k]), "officials: transfer needs the new place, letter and reason", r.body.fields);
  ok((await G(Object.assign({ action: "transfer", id: dpz, level: "DISTRICT", stateId: "bihar", districtId: "bihar--patna", reason: "No change" }, L))).body.fields.level === "SAME", "officials: nothing changing is refused");
  ok((await G(Object.assign({ action: "transfer", id: dpz, level: "DISTRICT", stateId: "bihar", districtId: "bihar--gaya", email: "vikram@gmail.com", reason: "Transferred" }, L))).body.fields.email === "OFFICIAL", "officials: a new email must be official");
  ok((await G(Object.assign({ action: "transfer", id: dpz, level: "DISTRICT", stateId: "bihar", districtId: "bihar--gaya", email: "ps.tr@bihar.gov.in", reason: "Transferred" }, L))).body.fields.email === "TAKEN", "officials: not someone else's email");
  ok((await G(Object.assign({ action: "transfer", id: dpz, level: "DISTRICT", stateId: "uttar-pradesh", districtId: "bihar--gaya", reason: "Transferred" }, L))).body.fields.districtId === "WRONG_STATE", "officials: district must be in the state");
  before = mails().length;
  r = await G(Object.assign({ action: "transfer", id: dpz, level: "DISTRICT", stateId: "bihar", districtId: "bihar--gaya", designation: "District Magistrate, Gaya", reason: "Transferred as DM Gaya" }, L));
  ok(r.status === 200 && r.body.id, "officials: moved to another district", r.body);
  const go = sdb.prepare("SELECT * FROM gov_users WHERE id = ?").get(dpz), gn = sdb.prepare("SELECT * FROM gov_users WHERE id = ?").get(r.body.id);
  ok(go.status === "REMOVED" && go.moved_to === gn.id && gn.moved_from === dpz && gn.district_id === "bihar--gaya" && gn.letter_ref === "BR/GA/2026/9" && gn.email === "dm.tr@nic.in" && /^Transferred: /.test(go.remove_reason), "officials: old access closed, new one opened, linked", { go, gn });
  ok(sdb.prepare("SELECT end_reason FROM gov_sessions WHERE id_hash = 'gs-tr'").get().end_reason === "TRANSFERRED" && sdb.prepare("SELECT monthly FROM gov_report_prefs WHERE user_id = ?").get(gn.id).monthly === 1, "officials: signed out; report-email choice goes with them");
  const gm = mails().slice(before);
  ok(gm.length === 1 && gm[0].to[0] === "dm.tr@nic.in" && /Gaya/.test(gm[0].html) && /\/state/.test(gm[0].html) && /डैशबोर्ड/.test(gm[0].html), "officials: a short email in English and Hindi with where to sign in", gm.map((m) => m.subject));
  // the state's only official: moving away needs the recorded choice
  r = await G(Object.assign({ action: "transfer", id: sb, level: "NATIONAL", designation: "Joint Secretary, DARPG", email: "js.tr@darpg.gov.in", reason: "Deputed to the Union government" }, L));
  ok(r.status === 400 && r.body.fields.leaveEmpty === "REQUIRED", "guard: the state's only official can't move away without confirming");
  r = await G(Object.assign({ action: "transfer", id: sb, level: "NATIONAL", designation: "Joint Secretary, DARPG", email: "js.tr@darpg.gov.in", reason: "Deputed to the Union government", leaveEmpty: true }, L));
  ok(r.status === 200 && sdb.prepare("SELECT level, email FROM gov_users WHERE id = ?").get(r.body.id).level === "NATIONAL", "guard: moved after confirming; new email recorded");
  const tev = sdb.prepare("SELECT detail FROM admin_events WHERE action = 'gov_user_transferred' ORDER BY created_at").all().map((x) => JSON.parse(x.detail));
  ok(tev.length === 2 && tev[1].leftEmpty === true && tev[1].emailChanged === true && tev[0].to.district === "bihar--gaya", "officials: every transfer logged", tev);
  // tidy up so the browser tests see the same people as before
  for (const id of [gn.id, r.body.id]) await G({ action: "remove", id, reason: "test tidy-up", leaveEmpty: true });
}

// ---- grieviq-55: paid public notices ----
{
  const fs = await import("node:fs");
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const mails = () => fs.existsSync(MAIL) ? fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  const plusDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const SS = (who, b) => call(who, "POST", "/api/admin/site-settings", b);
  const OF = (who, b) => call(who, b ? "POST" : "GET", "/api/notices/office", b);
  const AD = (who, b) => call(who || S, b ? "POST" : "GET", "/api/admin/notices", b);
  const pub = async (w) => (await fetch(B + "/api/notices?ward=" + w)).json();
  // grieviq-56: notices about schemes, health camps and service interruptions carry the authority letter
  const PDF = { bytes: new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"), type: "application/pdf", name: "order.pdf" };
  const LET = { letterNo: "JK/SD/2026/45", letterDate: today, letterBy: "R. K. Singh, Executive Engineer" };
  const OFM = async (who, fields, file, path) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v == null ? "" : String(v));
    if (file) fd.append("letter", new Blob([file.bytes], { type: file.type }), file.name);
    const x = await fetch(B + (path || "/api/notices/office"), { method: "POST", headers: { "test-email": who }, body: fd });
    return { status: x.status, body: await x.json().catch(() => ({})) };
  };
  const base = (o) => Object.assign({ action: "request", officeTier: "LOCAL", officeId: "lu-tilak", category: "CAMP", titleEn: "Ration card help desk", bodyEn: "Bring your Aadhaar card and an old ration card if you have one. Phone 0522 1234567.", place: "Ward office, Tilak Nagar", planId: "week", startOn: today }, o || {});
  // the plans and prices are the admin's to change (Prices & site details)
  let live = (await call(S, "GET", "/api/admin/site-settings")).body.live;
  ok(live.data.notices && live.data.notices.plans.length === 3 && live.data.notices.maxShown === 3, "notices: default plans in Prices & site details", live.data.notices);
  const orig = JSON.parse(JSON.stringify(live.data));
  let g = await OF("r2@x.in");
  const week = g.body.offices[0].plans.find((p) => p.id === "week");
  ok(g.status === 200 && g.body.offices.length === 1 && g.body.offices[0].reach === "LOCAL" && week.amount === 299 && week.total === 353, "notices: a ward office sees the ward price with GST", g.body.offices);
  ok((await OF("mla@x.in")).body.offices[0].plans.find((p) => p.id === "week").total === 1179, "notices: an MLA's office pays the wider-reach price");
  ok((await OF("fw@x.in")).status === 403, "notices: field workers can't ask");
  ok((await OF("om@x.in")).body.offices.some((o) => o.id === "lu-hazratganj"), "notices: the office manager can");
  // requests: the template's checks
  let r = await OF("r2@x.in", { action: "request", officeTier: "LOCAL", officeId: "lu-tilak" });
  ok(r.status === 400 && r.body.fields.category === "REQUIRED" && r.body.fields.titleEn === "ONE_LANGUAGE" && r.body.fields.planId === "REQUIRED" && r.body.fields.startOn === "REQUIRED", "notices: empty request lists what's needed", r.body.fields);
  for (const [k, v, code] of [["bodyEn", "Details at www.ward7.in please", "LINK"], ["bodyEn", "Write to help@ward.org for details", "EMAIL"], ["bodyEn", "Follow us on @wardseven for updates", "HANDLE"], ["titleEn", "Camp today 🎉 all welcome", "EMOJI"], ["titleEn", "FREE CAMP FOR EVERYONE TODAY", "CAPS"], ["startOn", plusDays(today, -1), "PAST"], ["startOn", plusDays(today, 61), "TOO_FAR"], ["eventDate", plusDays(today, -2), "PAST"]])
    ok((await OF("r2@x.in", base({ [k]: v }))).body.fields[k] === code, "notices: " + code + " refused in " + k);
  ok((await OF("r2@x.in", base({ titleHi: "राशन कार्ड" }))).body.fields.bodyHi === "REQUIRED", "notices: a language started must be complete");
  ok((await OF("r2@x.in", base({ officeId: "lu-hazratganj" }))).body.fields.office === "REQUIRED", "notices: only your own office");
  let before = mails().length;
  r = await OF("r2@x.in", base({ bodyEn: "Bring your Aadhaar card. This is not about any vote or party." }));
  const n1 = r.body;
  ok(r.status === 200 && /^GIQ-NTC-\d{6}$/.test(n1.ref) && n1.total === 353, "notices: sent for approval with the price quoted", r.body);
  ok(mails().slice(before).some((m) => m.to[0] === "support@grieviq.in" && m.subject.includes(n1.ref)), "notices: GrievIQ told a request is waiting");
  r = await OFM("r2@x.in", Object.assign(base({ titleEn: "", bodyEn: "", titleHi: "जलापूर्ति शिविर", bodyHi: "रविवार को सामुदायिक भवन में जल कनेक्शन संबंधी सहायता मिलेगी।", category: "SERVICE", planId: "fortnight", startOn: plusDays(today, 3) }), LET), PDF);
  const n2 = r.body;
  ok(r.status === 200 && n2.total === 589, "notices: Hindi only is fine");
  r = await OF("r2@x.in", base());
  ok(r.status === 409 && r.body.error === "LIMIT" && r.body.limit === 2, "notices: at most two open notices per office");
  const mlaN = (await OFM("mla@x.in", Object.assign(base({ officeTier: "MLA", officeId: "mla-c", category: "HEALTH", titleEn: "Eye camp at the community centre", bodyEn: "Free eye check-up by the district hospital team." }), LET), PDF)).body;
  ok(mlaN.total === 1179, "notices: an MLA's notice at the wider price");
  // the admin changes a price: requests keep the price they were quoted
  const d2 = JSON.parse(JSON.stringify(orig));
  d2.notices.plans[0].days = 0; d2.notices.plans[0].priceWide = "abc"; d2.notices.maxShown = 9;
  r = await SS(S, { action: "save_draft", data: d2 });
  ok(r.status === 400 && r.body.fields["notices.plans.0.days"] === "RANGE" && r.body.fields["notices.plans.0.priceWide"] === "RANGE" && r.body.fields["notices.maxShown"] === "RANGE", "notices: plan checks", r.body.fields);
  const d3 = JSON.parse(JSON.stringify(orig)); d3.notices.plans.forEach((p) => p.shown = false);
  ok((await SS(S, { action: "save_draft", data: d3 })).body.fields["notices.plans"] === "NONE_SHOWN", "notices: at least one plan offered while switched on");
  ok((await SS(O, { action: "save_draft", data: orig })).status === 403, "notices: only the super admin changes prices");
  const d4 = JSON.parse(JSON.stringify(orig)); d4.notices.plans[0].priceLocal = 349;
  r = await SS(S, { action: "save_draft", data: d4 }); ok(r.status === 200, "notices: new price saved", r.body);
  r = await SS(S, { action: "publish", note: "Notice price" }); ok(r.status === 200, "notices: new price published", r.body);
  ok((await OF("r2@x.in")).body.offices[0].plans.find((p) => p.id === "week").total === 412, "notices: offices see the new price");
  // admin: who can see and decide
  ok((await AD(D)).status === 403 && (await AD(M)).status === 403, "notices: other admin roles can't see");
  let A1 = await AD(A);
  ok(A1.status === 200 && !A1.body.canManage && A1.body.counts.PENDING === 3, "notices: auditor reads only", A1.body.counts);
  ok((await AD(A, { action: "approve", id: n1.id, checks: {} })).status === 403, "notices: auditor can't decide");
  const pend = A1.body.notices.find((n) => n.id === n1.id);
  ok(pend.flags.includes("vote") && pend.flags.includes("party") && pend.officeLabel[0] === "Ward Councillor's office", "notices: words to check highlighted for the admin", pend.flags);
  r = await AD(S, { action: "approve", id: n1.id, checks: { PUBLIC_INFO: true, NO_PARTY: true } });
  ok(r.status === 400 && r.body.fields.checks === "ALL", "notices: every check needed to approve");
  const ALL = { PUBLIC_INFO: true, NO_PARTY: true, NO_PRAISE: true, NO_CITIZEN: true, TRUTHFUL: true };
  before = mails().length;
  r = await AD(S, { action: "approve", id: n1.id, checks: ALL });
  ok(r.status === 200 && /^GIQ-PAY-/.test(r.body.bill), "notices: approved, bill made", r.body);
  const bill1 = sdb.prepare("SELECT * FROM bills WHERE notice_id = ?").get(n1.id);
  ok(bill1.kind === "NOTICE" && bill1.total === 353 && bill1.status === "DUE" && bill1.office_tier === "LOCAL" && bill1.office_id === "lu-tilak", "notices: the bill keeps the quoted price", bill1);
  ok(mails().slice(before).some((m) => m.to[0] === "r2@x.in" && /bill/i.test(m.subject)), "notices: the office gets the bill email");
  ok((await AD(S, { action: "approve", id: n1.id, checks: ALL })).status === 409, "notices: not approved twice");
  ok((await AD(S, { action: "reject", id: n2.id, reason: "no" })).status === 400, "notices: turning back needs a reason");
  before = mails().length;
  ok((await AD(S, { action: "reject", id: n2.id, reason: "Say which ward's water connections this is for." })).body.status === "REJECTED", "notices: turned back");
  ok(mails().slice(before).some((m) => m.to[0] === "r2@x.in" && /not approved/.test(m.subject) && m.html.includes("which ward")), "notices: the office is told why");
  g = await OF("r2@x.in");
  const on1 = g.body.notices.find((n) => n.id === n1.id);
  ok(on1.state === "APPROVED" && on1.bill.status === "DUE" && !("flags" in on1) && g.body.notices.find((n) => n.id === n2.id).decisionNote.includes("which ward"), "notices: the office sees approved with the bill, and why one was turned back");
  ok((await pub("lu-tilak")).notices.length === 0, "notices: nothing shown before payment");
  // the office pays, GrievIQ confirms: it starts today for its full days
  const bl = await call("r2@x.in", "GET", "/api/billing");
  ok(bl.body.bills.some((b) => b.id === bill1.id && b.kind === "NOTICE"), "notices: the bill is in the office's Billing");
  r = await call("r2@x.in", "POST", "/api/billing", { billId: bill1.id, method: "UPI", utr: "NTC1234567890", amount: 353, paidOn: today });
  ok(r.status === 200, "notices: office records the payment", r.body);
  const pay1 = sdb.prepare("SELECT id FROM bill_payments WHERE bill_id = ?").get(bill1.id).id;
  const subBefore = JSON.stringify(sdb.prepare("SELECT * FROM office_subscriptions WHERE office_id = 'lu-tilak'").all());
  r = await call(S, "POST", "/api/admin/bills", { action: "confirm", paymentId: pay1 });
  ok(r.status === 200 && sdb.prepare("SELECT status, starts_on FROM notices WHERE id = ?").get(n1.id).status === "PAID", "notices: paid when the payment is confirmed");
  ok(JSON.stringify(sdb.prepare("SELECT * FROM office_subscriptions WHERE office_id = 'lu-tilak'").all().map((x) => Object.assign(x, { updated_at: null, updated_by: null }))) === JSON.stringify(JSON.parse(subBefore).map((x) => Object.assign(x, { updated_at: null, updated_by: null }))), "notices: a notice's bill doesn't change the office's plan");
  let P = await pub("lu-tilak");
  const shown = P.notices[0];
  ok(P.notices.length === 1 && shown.ref === n1.ref && shown.officeLabel[0] === "Ward Councillor's office" && shown.office === "Tilak Nagar-Kundari Rakabganj" && shown.until === plusDays(today, 6) && P.maxShown === 3, "notices: shown on the ward page with who paid, for 7 days", P);
  ok(!("total" in shown) && !("amount" in shown) && !JSON.stringify(P).includes("r2@x.in"), "notices: no price or person on the public page");
  ok((await pub("lu-hazratganj")).notices.length === 0, "notices: a ward's notice isn't shown in other wards");
  // the MLA's notice shows in every ward of the constituency
  await AD(S, { action: "approve", id: mlaN.id, checks: Object.assign({ LETTER: true }, ALL), verifiedHow: "Called the CMO office on its official number" });
  const bill2 = sdb.prepare("SELECT * FROM bills WHERE notice_id = ?").get(mlaN.id);
  await call("mla@x.in", "POST", "/api/billing", { billId: bill2.id, method: "UPI", utr: "NTC1234567891", amount: bill2.total, paidOn: today });
  await call(S, "POST", "/api/admin/bills", { action: "confirm", paymentId: sdb.prepare("SELECT id FROM bill_payments WHERE bill_id = ?").get(bill2.id).id });
  ok((await pub("lu-tilak")).notices.length === 2 && (await pub("lu-hazratganj")).notices.length === 1, "notices: an MLA's notice shows in all the MLA's wards");
  // a department's service notice and camp (as if paid)
  const now = new Date().toISOString();
  sdb.prepare("INSERT INTO dept_offices (id, area_id, name_en, departments, source, last_checked, created_at, created_by, updated_at, updated_by) VALUES ('nt-dept', 'lucknow', 'Jal Sansthan Zone 2', '[\"Water Supply\"]', 'test', ?, ?, 't', ?, 't')").run(today, now, now);
  const ins = sdb.prepare("INSERT INTO notices (id, ref, office_type, office_tier, office_id, office_name, office_label, area_id, state, category, title_en, body_en, plan_id, plan_name, days, reach, amount, gst_rate, gst, total, settings_version, start_on, starts_on, status, requested_by, requested_at) VALUES (?, ?, 'DEPT', NULL, 'nt-dept', 'Jal Sansthan Zone 2', 'DEPT', 'lucknow', 'Uttar Pradesh', ?, ?, 'Water off from 10 am to 4 pm for pipeline work.', 'week', 'One week', 7, 'LOCAL', 299, 18, 54, 353, 1, ?, ?, 'PAID', 'ae@nic.in', ?)");
  ins.run("nt-d1", "GIQ-NTC-900001", "SERVICE", "Water supply off on Sunday", today, today, now);
  ins.run("nt-d2", "GIQ-NTC-900002", "CAMP", "New connection camp", today, today, now);
  P = await pub("lu-tilak");
  ok(P.notices.length === 4 && P.notices.some((n) => n.ref === "GIQ-NTC-900001" && n.officeLabel[0] === "Department office"), "notices: a department's notices show in the wards it covers");
  const order1 = P.notices.map((n) => n.ref).join();
  ok((await pub("lu-tilak")).notices.map((n) => n.ref).join() === order1, "notices: the same order all day (no paid ranking)");
  // election code
  ok((await AD(S, { action: "pause_add", label: "x", state: "Nowhere", from: "bad", to: today })).body.fields.label === "REQUIRED", "pause: checks");
  r = await AD(S, { action: "pause_add", label: "x", state: "Nowhere", from: "bad", to: today });
  ok(r.body.fields.state === "REQUIRED" && r.body.fields.from === "DATE", "pause: state and date checked", r.body.fields);
  ok((await AD(S, { action: "pause_add", label: "UP local body elections", state: "Uttar Pradesh", areaId: "nowhere", from: today, to: today })).body.fields.areaId === "WRONG_STATE", "pause: the city must be in the state");
  r = await AD(S, { action: "pause_add", label: "UP local body elections", state: "Uttar Pradesh", from: today, to: plusDays(today, 2) });
  const pz = r.body.id;
  ok(r.status === 200 && pz, "pause: election code recorded");
  P = await pub("lu-tilak");
  ok(P.notices.length === 1 && P.notices[0].ref === "GIQ-NTC-900001", "pause: only the department's service notice shows during the election code", P.notices.map((n) => n.ref));
  g = await OF("r2@x.in");
  const pn = g.body.notices.find((n) => n.id === n1.id);
  ok(pn.state === "PAUSED" && pn.to === plusDays(today, 9) && pn.pausedDays === 3 && g.body.offices[0].pausedNow && g.body.offices[0].pauses.length === 1, "pause: the office sees it paused, with the days added back", pn);
  ok((await OF("om@x.in", base({ officeId: "lu-hazratganj" }))).body.fields.startOn === "PAUSED", "pause: no new notice can start during it");
  ok((await AD(S, { action: "pause_remove", id: pz, reason: "" })).status === 400, "pause: removing needs a reason");
  ok((await AD(S, { action: "pause_remove", id: pz, reason: "Entered for the wrong state" })).status === 200 && (await pub("lu-tilak")).notices.length === 4, "pause: removed; notices back");
  // take down
  ok((await AD(S, { action: "takedown", id: n1.id, reason: "short" })).status === 400, "takedown: needs a reason");
  before = mails().length;
  r = await AD(S, { action: "takedown", id: n1.id, reason: "Complaint upheld: the notice thanks a person by name." });
  ok(r.status === 200 && !(await pub("lu-tilak")).notices.some((n) => n.ref === n1.ref) && mails().slice(before).some((m) => m.to[0] === "r2@x.in" && /taken down/.test(m.subject)), "takedown: stops at once, office told");
  // withdraw and cancel
  r = await OF("r2@x.in", base({ titleEn: "Pension help desk", startOn: plusDays(today, 1) }));
  const n4 = r.body;
  await AD(S, { action: "approve", id: n4.id, checks: ALL });
  const bill4 = sdb.prepare("SELECT * FROM bills WHERE notice_id = ?").get(n4.id);
  r = await OF("r2@x.in", { action: "withdraw", id: n4.id });
  ok(r.status === 200 && sdb.prepare("SELECT status FROM bills WHERE id = ?").get(bill4.id).status === "CANCELLED", "withdraw: the office takes it back; its bill is cancelled");
  ok((await OF("r2@x.in", { action: "withdraw", id: n1.id })).status === 409, "withdraw: not after payment");
  ok((await OF("om@x.in", { action: "withdraw", id: n4.id })).status === 404, "withdraw: only the office's own");
  r = await OF("r2@x.in", base({ titleEn: "Pension help desk", startOn: plusDays(today, 1) }));
  const n5 = r.body;
  await AD(S, { action: "approve", id: n5.id, checks: ALL });
  const bill5 = sdb.prepare("SELECT * FROM bills WHERE notice_id = ?").get(n5.id);
  await call(S, "POST", "/api/admin/bills", { action: "cancel", id: bill5.id, reason: "Duplicate request" });
  ok(sdb.prepare("SELECT status FROM notices WHERE id = ?").get(n5.id).status === "CANCELLED", "cancel: a cancelled bill cancels the notice");
  // switched off: no new requests
  const d5 = JSON.parse(JSON.stringify(orig)); d5.notices.enabled = false;
  await SS(S, { action: "save_draft", data: d5 }); await SS(S, { action: "publish", note: "Notices off" });
  ok((await OF("r2@x.in", base())).body.error === "OFF" && (await pub("lu-tilak")).notices.length === 3, "switched off: no new requests; paid ones keep running");
  const ev = sdb.prepare("SELECT action FROM admin_events WHERE action LIKE 'notice_%'").all().map((x) => x.action);
  ok(["notice_requested", "notice_approved", "notice_paid", "notice_rejected", "notice_taken_down", "notice_withdrawn", "notice_cancelled", "notice_pause_added", "notice_pause_removed"].every((a) => ev.includes(a)), "notices: every step logged", Array.from(new Set(ev)));
  // back as it was for the browser tests
  await SS(S, { action: "save_draft", data: orig }); await SS(S, { action: "publish", note: "Notices back to defaults" });
  const nb = sdb.prepare("SELECT id FROM bills WHERE kind = 'NOTICE'").all().map((x) => x.id);
  for (const id of nb) { sdb.prepare("DELETE FROM bill_payments WHERE bill_id = ?").run(id); sdb.prepare("DELETE FROM bills WHERE id = ?").run(id); }
  sdb.prepare("DELETE FROM notices").run(); sdb.prepare("DELETE FROM notice_pauses").run(); sdb.prepare("DELETE FROM dept_offices WHERE id = 'nt-dept'").run();
}

// ---- grieviq-56: authority letters for notices ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  const plusDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const PDF = { bytes: new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"), type: "application/pdf", name: "order.pdf" };
  const TXT = { bytes: new TextEncoder().encode("just some text pretending"), type: "application/pdf", name: "fake.pdf" };
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0e, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x47, 0x50, 0x53, 0x21, 0x21, 0x21, 0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0xff, 0xd9]);
  const OFM = async (who, fields, file, path) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v == null ? "" : String(v));
    if (file) fd.append("letter", new Blob([file.bytes], { type: file.type }), file.name);
    const x = await fetch(B + (path || "/api/notices/office"), { method: "POST", headers: { "test-email": who }, body: fd });
    return { status: x.status, body: await x.json().catch(() => ({})) };
  };
  const AD = (who, b) => call(who || S, b ? "POST" : "GET", "/api/admin/notices", b);
  const base = (o) => Object.assign({ action: "request", officeTier: "LOCAL", officeId: "lu-tilak", category: "SERVICE", titleEn: "Water supply off on Sunday", bodyEn: "Water supply will be off from 10 am to 4 pm for pipeline repair.", planId: "week", startOn: today }, o || {});
  const LET = { letterNo: "JK/SD/2026/45", letterDate: today, letterBy: "R. K. Singh, Executive Engineer, Jal Kal" };
  let g = await call("r2@x.in", "GET", "/api/notices/office");
  ok(g.body.letters === true && g.body.letterCategories.join() === "SCHEME,HEALTH,SERVICE", "letters: offices are told which notices need one");
  let r = await OFM("r2@x.in", base());
  ok(r.status === 400 && r.body.letterNeeded && ["letter", "letterNo", "letterDate", "letterBy"].every((k) => r.body.fields[k] === "REQUIRED"), "letters: a service interruption needs the authority letter", r.body);
  ok((await call("r2@x.in", "POST", "/api/notices/office", base())).body.fields.letter === "REQUIRED", "letters: also when sent without a file at all");
  ok((await OFM("r2@x.in", Object.assign(base(), LET), TXT)).body.fields.letter === "BAD_TYPE", "letters: only real PDF, JPG or PNG files");
  ok((await OFM("r2@x.in", Object.assign(base(), LET, { letterDate: plusDays(today, 1) }), PDF)).body.fields.letterDate === "FUTURE", "letters: no future date");
  ok((await OFM("r2@x.in", Object.assign(base(), LET, { letterDate: plusDays(today, -800) }), PDF)).body.fields.letterDate === "OLD", "letters: not older than two years");
  ok((await OFM("r2@x.in", Object.assign(base(), LET, { letterBy: "Sir" }), PDF)).body.fields.letterBy === "REQUIRED", "letters: who issued it");
  ok((await OFM("r2@x.in", base({ category: "CAMP", titleEn: "Ration card help desk", bodyEn: "Help with ration cards at the ward office." }))).status === 200, "letters: optional for a help desk");
  r = await OFM("r2@x.in", Object.assign(base(), LET), PDF);
  const n1 = r.body;
  ok(r.status === 200, "letters: request with its letter", r.body);
  const row = sdb.prepare("SELECT * FROM notices WHERE id = ?").get(n1.id);
  ok(row.letter_key && row.letter_key.startsWith("notice-letters/" + n1.id + "/") && row.letter_type === "application/pdf" && row.letter_no === "JK/SD/2026/45" && row.letter_by.includes("Executive Engineer"), "letters: stored privately with its details", row);
  ok((await OFM("r2@x.in", Object.assign(base(), LET), PDF)).body.error === "LIMIT", "letters: office limit still applies");
  // the admin opens it (logged); other roles can't
  let dl = await fetch(B + "/api/admin/notice-letter?id=" + n1.id, { headers: { "test-email": A } });
  const body = new Uint8Array(await dl.arrayBuffer());
  ok(dl.status === 200 && /attachment/.test(dl.headers.get("content-disposition")) && dl.headers.get("cache-control") === "no-store" && String.fromCharCode(...body.slice(0, 5)) === "%PDF-", "letters: auditor downloads the letter (never shown in the page)");
  ok((await fetch(B + "/api/admin/notice-letter?id=" + n1.id, { headers: { "test-email": D } })).status === 403 && (await fetch(B + "/api/admin/notice-letter?id=" + n1.id)).status === 401, "letters: nobody else can open it");
  ok(sdb.prepare("SELECT COUNT(*) n FROM admin_events WHERE action = 'notice_letter_viewed'").get().n === 1, "letters: every opening logged");
  // the office sends a new letter while it waits (a JPEG: camera and location details removed)
  r = await OFM("r2@x.in", { action: "letter", id: n1.id, letterNo: "JK/SD/2026/46", letterDate: today, letterBy: "R. K. Singh, Executive Engineer, Jal Kal" }, { bytes: jpg, type: "image/jpeg", name: "order.jpg" });
  const row2 = sdb.prepare("SELECT * FROM notices WHERE id = ?").get(n1.id);
  ok(r.status === 200 && row2.letter_no === "JK/SD/2026/46" && row2.letter_type === "image/jpeg" && row2.letter_key !== row.letter_key, "letters: a new letter replaces the one to check", r.body);
  dl = new Uint8Array(await (await fetch(B + "/api/admin/notice-letter?id=" + n1.id, { headers: { "test-email": S } })).arrayBuffer());
  ok(!String.fromCharCode(...dl).includes("Exif") && !String.fromCharCode(...dl).includes("GPS"), "letters: photo metadata removed");
  ok((await OFM("om@x.in", { action: "letter", id: n1.id, letterNo: "X/1", letterDate: today, letterBy: "Someone Else" }, PDF)).status === 404, "letters: only the office's own notice");
  // approval needs the letter check and how it was verified
  const BASE5 = { PUBLIC_INFO: true, NO_PARTY: true, NO_PRAISE: true, NO_CITIZEN: true, TRUTHFUL: true };
  let A1 = await AD(A);
  const pn = A1.body.notices.find((n) => n.id === n1.id);
  ok(A1.body.letters && pn.letterNeeded && pn.letter.no === "JK/SD/2026/46" && pn.letter.by.includes("Jal Kal"), "letters: the admin sees the letter's details", pn.letter);
  r = await AD(S, { action: "approve", id: n1.id, checks: BASE5 });
  ok(r.status === 400 && r.body.fields.checks === "ALL" && r.body.missing.join() === "LETTER" && r.body.fields.verifiedHow === "REQUIRED", "letters: the letter check and how it was verified are needed", r.body);
  r = await AD(S, { action: "approve", id: n1.id, checks: Object.assign({ LETTER: true }, BASE5), verifiedHow: "Called the EE office on its official number from the directory" });
  ok(r.status === 200 && sdb.prepare("SELECT letter_verified_how FROM notices WHERE id = ?").get(n1.id).letter_verified_how.includes("official number"), "letters: approved, with how it was verified recorded");
  ok((await OFM("r2@x.in", { action: "letter", id: n1.id, letterNo: "X/2", letterDate: today, letterBy: "R. K. Singh, EE" }, PDF)).status === 409, "letters: can't be changed after approval");
  // a notice that needs a letter but has none can't be approved
  const now = new Date().toISOString();
  sdb.prepare("INSERT INTO notices (id, ref, office_type, office_tier, office_id, office_name, office_label, area_id, state, category, title_en, body_en, plan_id, plan_name, days, reach, amount, gst_rate, gst, total, settings_version, start_on, status, requested_by, requested_at) VALUES ('nl-1', 'GIQ-NTC-910001', 'REP', 'LOCAL', 'lu-hazratganj', 'Hazratganj-Ramtirth', 'LOCAL_URBAN', 'lucknow', 'Uttar Pradesh', 'SCHEME', 'Ayushman enrolment', 'Bring your ration card.', 'week', 'One week', 7, 'LOCAL', 299, 18, 54, 353, 1, ?, 'PENDING', 'om@x.in', ?)").run(today, now);
  ok((await AD(S, { action: "approve", id: "nl-1", checks: Object.assign({ LETTER: true }, BASE5), verifiedHow: "Called the office to check" })).body.error === "NO_LETTER", "letters: none, so it can only be turned back");
  // pay it: citizens see the letter's number and date, never the letter
  const bill = sdb.prepare("SELECT * FROM bills WHERE notice_id = ?").get(n1.id);
  await call("r2@x.in", "POST", "/api/billing", { billId: bill.id, method: "UPI", utr: "LTR1234567890", amount: bill.total, paidOn: today });
  await call(S, "POST", "/api/admin/bills", { action: "confirm", paymentId: sdb.prepare("SELECT id FROM bill_payments WHERE bill_id = ?").get(bill.id).id });
  const P = await (await fetch(B + "/api/notices?ward=lu-tilak")).json();
  const shown = P.notices.find((n) => n.ref === n1.ref);
  ok(shown && shown.authority.no === "JK/SD/2026/46" && shown.authority.date === today && !JSON.stringify(P).includes("Singh") && !JSON.stringify(P).includes("notice-letters"), "letters: citizens see only the letter's number and date", shown);
  const ev = sdb.prepare("SELECT action FROM admin_events WHERE action LIKE 'notice_letter_%'").all().map((x) => x.action);
  ok(ev.includes("notice_letter_replaced") && ev.includes("notice_letter_viewed"), "letters: logged", ev);
  // tidy up
  const nb = sdb.prepare("SELECT id FROM bills WHERE kind = 'NOTICE'").all().map((x) => x.id);
  for (const id of nb) { sdb.prepare("DELETE FROM bill_payments WHERE bill_id = ?").run(id); sdb.prepare("DELETE FROM bills WHERE id = ?").run(id); }
  sdb.prepare("DELETE FROM notices").run();
}

// ---- grieviq-57: wards with more than one elected member ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const J = (who, b) => call(who, "PATCH", "/api/admin/jurisdiction", b);
  const W = "lu-maulvi";
  let r = await J(A, { action: "set_seats", id: W, count: 4 });
  ok(r.status === 403, "seats: the auditor can't change them", r.status);
  r = await J(S, { action: "set_seats", id: W, count: 7 });
  ok(r.status === 400 && r.body.fields.count === "RANGE", "seats: 1 to 6 only");
  sdb.prepare("INSERT INTO local_units (id, name, unit_type, mla_constituency_id, area_id) VALUES ('lu-vill57', 'Village 57', 'RURAL', 'mla-c', 'lucknow')").run();
  r = await J(S, { action: "set_seats", id: "lu-vill57", count: 2 });
  ok(r.status === 400 && r.body.fields.count === "RURAL", "seats: a village has one Gram Pradhan");
  sdb.prepare("DELETE FROM local_units WHERE id = 'lu-vill57'").run();
  r = await J(S, { action: "set_seats", id: W, count: 4 });
  ok(r.status === 200 && r.body.count === 4, "seats: a ward with 4 members", r.body);
  let g = (await call(S, "GET", "/api/admin/jurisdiction")).body;
  ok(g.wardSeats.filter((x) => x.local_unit_id === W).map((x) => x.seat_label).join() === "B,C,D" && g.localUnits.find((u) => u.id === W).seat_count === 4, "seats: B, C and D made, empty");
  for (const [id, name, email] of [[W, "Asha Member", "ma@x.in"], [W + "~B", "Bina Member", "mb@x.in"], [W + "~C", "Chand Member", "mc@x.in"]]) {
    r = await J(S, { action: "update_contact", type: "ward", id, name, phone: "9876500057", email });
    ok(r.status === 200, "seats: member's contact saved " + id, r.body);
  }
  ok(sdb.prepare("SELECT rep_email FROM ward_seats WHERE id = ?").get(W + "~B").rep_email === "mb@x.in", "seats: seat B's member stored apart from the ward");
  ok(sdb.prepare("SELECT COUNT(*) n FROM admin_events WHERE action = 'ward_seats_changed' AND target = ?").get(W).n === 1, "seats: change logged");
  // what citizens see
  const io = await (await fetch(B + "/api/intake-options")).json();
  const u = io.localUnits.find((x) => x.id === W);
  ok(u && u.members.map((m) => m.letter).join() === "A,B,C" && !JSON.stringify(u.members).includes("@") && u.rep_missing === 0, "citizens: members to choose from, names only (empty seat D left out)", u);
  const pl = await (await fetch(B + "/api/place?ward=" + W)).json();
  ok(pl.place.members.length === 4 && pl.place.members[3].name === null && pl.place.openForFiling, "ward page: every seat listed", pl.place.members);
  // each member signs in to their own office
  r = await call("mb@x.in", "GET", "/api/me");
  const mB = r.body.mandates[0];
  ok(r.status === 200 && mB.id === W + "~B" && mB.multi && mB.seatLabel === "B" && mB.unit === W && /Seat B/.test(mB.name), "sign-in: seat B is its own office", r.body);
  // filing
  let n57 = 0;
  const file = async (extra) => {
    n57++;
    const x = await fetch(B + "/api/grievances/submit", { method: "POST", headers: { "content-type": "application/json", "user-agent": "ua-57-" + n57, "cf-connecting-ip": "10.57.0." + n57 },
      body: JSON.stringify(Object.assign({ category_id: "water-sanitation", local_unit_id: W, description: "Water pipe leaking near the market " + n57, citizen_phone: "98157000" + String(n57).padStart(2, "0"), citizen_email: "c57" + n57 + "@example.com", consent: true, form_loaded_at: Date.now() - 60000, lang: "en" }, extra || {})) });
    return { status: x.status, body: await x.json() };
  };
  const fAny = await file({ seat_choice: "ANY" });
  const fB = await file({ seat_choice: W + "~B" });
  const fD = await file({ seat_choice: W + "~D" });
  const row = (ref) => sdb.prepare("SELECT * FROM grievances WHERE tracking_ref = ?").get(ref);
  ok(row(fAny.body.tracking_ref).seat_choice === "ANY" && row(fAny.body.tracking_ref).seat_owner === null, "filing: any member = open to all");
  ok(row(fB.body.tracking_ref).seat_owner === W + "~B" && row(fB.body.tracking_ref).seat_choice === W + "~B", "filing: the chosen member has it from the start");
  ok(fD.body.seat_fallback === true && row(fD.body.tracking_ref).seat_owner === null, "filing: a member who can't take complaints: open to all, and the citizen is told", fD.body);
  const gA = row(fAny.body.tracking_ref), gB = row(fB.body.tracking_ref);
  await new Promise((res) => setTimeout(res, 300));
  const nt = (kind, gid) => sdb.prepare("SELECT recipient, office_id, data FROM notifications WHERE kind = ? AND grievance_id = ? ORDER BY recipient").all(kind, gid);
  ok(nt("NEW_CASE", gA.id).map((x) => x.recipient).join() === "ma@x.in,mb@x.in,mc@x.in" && JSON.parse(nt("NEW_CASE", gA.id)[0].data).pool === true, "alerts: every member told about an any-member case", nt("NEW_CASE", gA.id));
  ok(nt("NEW_CASE", gB.id).map((x) => x.recipient).join() === "mb@x.in", "alerts: only the chosen member", nt("NEW_CASE", gB.id));
  // who sees what
  const list = async (who) => (await call(who, "GET", "/api/grievances")).body;
  const refs = (L) => (L.grievances || []).filter((c) => c.localUnit.id === W).map((c) => c.trackingRef).sort().join();
  let LA = await list("ma@x.in"), LB = await list("mb@x.in");
  ok(!refs(LA).includes(fB.body.tracking_ref) && refs(LA).includes(fAny.body.tracking_ref), "visibility: another member's chosen case is hidden", refs(LA));
  ok(refs(LB).includes(fB.body.tracking_ref) && LB.grievances.find((c) => c.trackingRef === fB.body.tracking_ref).seat.chosen, "visibility: the chosen member sees it as theirs");
  ok(LA.grievances.find((c) => c.trackingRef === fAny.body.tracking_ref).seat.pool && LA.grievances.find((c) => c.trackingRef === fAny.body.tracking_ref).seat.canTake, "visibility: open cases can be taken");
  // acting needs taking first
  ok((await call("ma@x.in", "POST", "/api/grievances/" + gA.id + "/acknowledge")).status === 403, "an open-to-all case is taken, not acknowledged");
  ok((await call("mb@x.in", "POST", "/api/grievances/" + gA.id + "/mark-resolved", { note: "Fixed it" })).status === 403, "nobody acts on it before taking it");
  // take: first come, first served
  r = await call("mc@x.in", "POST", "/api/grievances/" + gA.id + "/seat", { action: "take" });
  ok(r.status === 200 && r.body.owner === W + "~C" && r.body.acknowledgedAt, "take: member C takes it (and it is acknowledged)", r.body);
  r = await call("mb@x.in", "POST", "/api/grievances/" + gA.id + "/seat", { action: "take" });
  ok(r.status === 409 && r.body.code === "TAKEN", "take: too late for member B", r.body);
  ok((await call("om@x.in", "POST", "/api/grievances/" + gA.id + "/seat", { action: "take" })).status === 403, "take: an office from another ward can't");
  ok((await call("mb@x.in", "POST", "/api/grievances/" + gA.id + "/acknowledge")).status === 403, "acknowledge: another member's case says nothing about it");
  LB = await list("mb@x.in");
  ok(!refs(LB).includes(fAny.body.tracking_ref) && LB.wardTaken.length === 1 && LB.wardTaken[0].takenBy === "C" && LB.wardTaken[0].status === "ACKNOWLEDGED" && !JSON.stringify(LB.wardTaken).includes("leaking"), "visibility: one line for a case another member took, no details", LB.wardTaken);
  ok(sdb.prepare("SELECT COUNT(*) n FROM team_activity WHERE action = 'CASE_TAKEN' AND grievance_id = ? AND office_id = ?").get(gA.id, W + "~C").n === 1, "take: written to the tamper-proof team log");
  await new Promise((res) => setTimeout(res, 200));
  ok(sdb.prepare("SELECT COUNT(*) n FROM notifications WHERE grievance_id = ? AND kind = 'NEW_CASE' AND read_at IS NULL AND recipient <> 'mc@x.in'").get(gA.id).n === 0, "take: the other members' alerts are cleared");
  // return to the ward
  r = await call("mc@x.in", "POST", "/api/grievances/" + gA.id + "/seat", { action: "return", reason: "short" });
  ok(r.status === 400 && r.body.fields.reason === "REQUIRED", "return: needs a reason");
  r = await call("mb@x.in", "POST", "/api/grievances/" + gB.id + "/seat", { action: "return", reason: "Not in our part of the ward" });
  ok(r.status === 409 && r.body.code === "CHOSEN", "return: not a case the citizen sent to this member", r.body);
  r = await call("mc@x.in", "POST", "/api/grievances/" + gA.id + "/seat", { action: "return", reason: "Not in our part of the ward, please take it" });
  ok(r.status === 200 && row(fAny.body.tracking_ref).seat_owner === null, "return: back to the ward", r.body);
  await new Promise((res) => setTimeout(res, 300));
  ok(nt("WARD_OPEN", gA.id).map((x) => x.recipient).sort().join() === "ma@x.in,mb@x.in", "return: the other members are told", nt("WARD_OPEN", gA.id));
  ok(sdb.prepare("SELECT detail FROM team_activity WHERE action = 'CASE_RETURNED' AND grievance_id = ?").get(gA.id).detail.includes("please take"), "return: reason kept in the team log");
  // the office's plan is paused: its cases go back to the ward at once
  r = await call(S, "POST", "/api/admin/subscriptions", { type: "REP", tier: "LOCAL", id: W + "~B", action: "pause", reason: "Testing a paused member" });
  ok(r.status === 200 && r.body.returnedToWard === 1 && row(fB.body.tracking_ref).seat_owner === null && row(fB.body.tracking_ref).seat_choice === "ANY", "paused: the chosen member's case goes back to the ward", r.body);
  ok(!(await (await fetch(B + "/api/intake-options")).json()).localUnits.find((x) => x.id === W).members.some((m) => m.letter === "B"), "paused: not offered to citizens");
  await call(S, "POST", "/api/admin/subscriptions", { type: "REP", tier: "LOCAL", id: W + "~B", action: "resume", reason: "Testing over now" });
  // the hourly check: a seat that became vacant some other way
  await call("ma@x.in", "POST", "/api/grievances/" + gB.id + "/seat", { action: "take" });
  sdb.prepare("UPDATE local_units SET seat_status = 'VACANT' WHERE id = ?").run(W);
  r = await (await fetch(B + "/__test/return-stuck", { method: "POST" })).json();
  ok(r.returned.length === 1 && r.returned[0].from === W && r.returned[0].why === "VACANT", "hourly: a vacant seat's cases go back", r);
  sdb.prepare("UPDATE local_units SET seat_status = NULL WHERE id = ?").run(W);
  // change of representative: seat C becomes vacant
  await call("mc@x.in", "POST", "/api/grievances/" + gA.id + "/seat", { action: "take" });
  r = await call(S, "POST", "/api/admin/handovers", { action: "propose", seatType: "ward", seatId: W + "~C", kind: "VACANT", reason: "RESIGNATION", evidence: "Resignation letter seen", effectiveDate: today, applyNow: true });
  ok(r.status === 200 && r.body.summary.casesReturnedToWard === 1 && row(fAny.body.tracking_ref).seat_owner === null, "handover: a seat made vacant gives its cases back", r.body);
  ok((await call(S, "GET", "/api/admin/handovers")).body.seats.ward.some((w) => w.id === W + "~C" && w.seat === "C" && w.status === "VACANT"), "handover: each seat listed apart");
  // fewer seats: only when unused
  r = await J(S, { action: "set_seats", id: W, count: 2 });
  ok(r.status === 409 && r.body.code === "SEAT_IN_USE" && r.body.seat === "C", "seats: a seat in use can't be removed", r.body);
  // a ward that had one member: its earlier complaints stay with seat A
  r = await J(S, { action: "set_seats", id: "lu-hazratganj", count: 3 });
  const LR = await list("r1@x.in");
  ok(r.status === 200 && LR.grievances.filter((c) => c.localUnit.id === "lu-hazratganj").every((c) => c.seat && c.seat.mine && c.seat.chosen), "seats: earlier complaints stay with seat A", r.body);
  r = await J(S, { action: "set_seats", id: "lu-hazratganj", count: 1 });
  ok(r.status === 200 && (await list("r1@x.in")).grievances.filter((c) => c.localUnit.id === "lu-hazratganj").every((c) => !c.seat), "seats: back to one member, as before");
  // the levels above see who handles each case
  sdb.prepare("UPDATE grievances SET created_at = '2026-01-01T00:00:00Z' WHERE id = ?").run(gB.id);
  const LM = await list("mla@x.in");
  const hb = LM.grievances.find((c) => c.id === gB.id);
  ok(hb && hb.handledBy && hb.handledBy.none, "MLA: sees whether a member has taken it", hb && hb.handledBy);
  // bills and plans: each seat is an office
  ok((await call(S, "GET", "/api/admin/bills?offices=REP&q=Seat")).body.offices.some((o) => o.id === W + "~B" && o.tier === "LOCAL"), "bills: seat offices can be billed");
  ok((await call("mb@x.in", "GET", "/api/billing")).status === 200, "billing: the member's office opens its bills");
  // import: a seat column
  const csv = "mp_constituency_name,mla_constituency_name,local_unit_name,unit_type,rep_name,rep_email,seat\nLucknow,Lucknow Central,Gomti Nagar,URBAN,Gita Seat A,ga@x.in,\nLucknow,Lucknow Central,Gomti Nagar,URBAN,Gopal Seat B,gb@x.in,B\nLucknow,Lucknow Central,Aishbagh,URBAN,Wrong,w@x.in,G\n";
  r = await call(S, "POST", "/api/admin/import-jurisdiction", { csv, areaId: "lucknow", dryRun: true });
  ok(r.status === 200 && r.body.summary.seatRows === 1 && r.body.summary.errors.some((e) => /seat must be/.test(e)), "import: preview counts seat rows and flags a bad letter", r.body.summary);
  r = await call(S, "POST", "/api/admin/import-jurisdiction", { csv, areaId: "lucknow" });
  ok(r.status === 200 && r.body.summary.seatsUpdated === 1 && sdb.prepare("SELECT rep_email FROM ward_seats WHERE id = 'lu-gomti~B'").get().rep_email === "gb@x.in" && sdb.prepare("SELECT seat_count, rep_email FROM local_units WHERE id = 'lu-gomti'").get().seat_count === 2, "import: seat B filled, the ward now has 2 members", r.body.summary);
  ok(sdb.prepare("SELECT rep_email FROM local_units WHERE id = 'lu-gomti'").get().rep_email === "ga@x.in", "import: seat A stays the ward's own representative");
  // grieviq-58: reports, ratings, auditor and messages per seat
  const ov = (await call("mb@x.in", "GET", "/api/overview?office=" + encodeURIComponent("LOCAL:" + W + "~B") + "&from=2026-01-01&to=" + today)).body;
  const ownN = sdb.prepare("SELECT COUNT(*) n FROM grievances WHERE seat_owner = ?").get(W + "~B").n;
  const wardN = sdb.prepare("SELECT COUNT(*) n FROM grievances WHERE local_unit_id = ?").get(W).n;
  ok(ov.total && ov.total.received === ownN && ov.ward && ov.ward.received === wardN && ov.ward.notTaken >= 1, "overview: a member's own cases, and the whole ward apart", { total: ov.total && ov.total.received, ownN, ward: ov.ward, wardN });
  ok((await call("r1@x.in", "GET", "/api/overview?office=LOCAL:lu-hazratganj")).body.ward === null, "overview: one-member wards unchanged");
  const rp = (await call("mb@x.in", "GET", "/api/grievances/report?mandate=" + encodeURIComponent(W + "~B"))).body;
  ok(rp.stats && rp.stats.totalCases === ownN, "report: only the member's own cases", rp.stats && rp.stats.totalCases);
  const { resolvingOffice } = await import(new URL("../functions/_shared/ratings.js", import.meta.url).href);
  const chainM = { localUnit: { id: W }, mla: { id: "mla-c" }, mp: { id: "mp-lko" }, tiers: [{ tier: "LOCAL", multi: true }] };
  ok(resolvingOffice({ current_tier: "LOCAL", seat_owner: W + "~B" }, chainM).id === W + "~B" && resolvingOffice({ current_tier: "LOCAL" }, { localUnit: { id: "lu-tilak" }, mla: { id: "mla-c" }, mp: { id: "mp-lko" }, tiers: [{ tier: "LOCAL" }] }).id === "lu-tilak", "ratings: the member's office that had the case is rated");
  const obs = (await call(A, "GET", "/api/admin/observations")).body;
  ok(obs.offices && obs.offices.some((o) => o.key === "LOCAL:" + W + "~B" && /Seat B/.test(o.name)), "auditor: each seat can be addressed", obs.offices && obs.offices.filter((o) => o.tier === "LOCAL").map((o) => o.key));
  const msgPrev = (await call(S, "POST", "/api/admin/messages", { action: "preview", tiers: ["LOCAL"] })).body;
  const localOffices = sdb.prepare("SELECT COUNT(*) n FROM local_offices o JOIN areas a ON a.id = o.area_id AND a.live = 1 WHERE COALESCE(TRIM(o.rep_email), '') <> '' AND COALESCE(o.seat_status, '') <> 'VACANT'").get().n;
  ok(msgPrev.offices === localOffices, "messages: every member's office receives staff messages", { got: msgPrev, want: localOffices });

  // tidy: Gomti Nagar back as it was (other tests use it)
  sdb.prepare("DELETE FROM ward_seats WHERE local_unit_id = 'lu-gomti'").run();
  sdb.prepare("UPDATE local_units SET seat_count = NULL, rep_email = NULL, rep_name = NULL WHERE id = 'lu-gomti'").run();
}

// ---- grieviq-60: a representative holding 6 ward offices opens the console ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const d6 = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const ids = [1, 2, 3, 4, 5, 6].map((i) => "lu-six-" + i);
  for (const id of ids) d6.prepare("INSERT INTO local_units (id,name,unit_type,mla_constituency_id,rep_email,area_id) VALUES (?,?,?,?,?,?)").run(id, "Six Ward " + id.slice(-1), "URBAN", "mla-c", "six@x.in", "lucknow");
  const me6 = await call("six@x.in", "GET", "/api/me");
  ok(me6.status === 200 && me6.body.mandates && me6.body.mandates.length === 6, "6-ward representative signs in", me6.body);
  const g6 = await call("six@x.in", "GET", "/api/grievances");
  ok(g6.status === 200 && Array.isArray(g6.body.grievances) && g6.body.closed && g6.body.closed.total === 0, "6-ward representative's cases load (no compound SELECT limit)", g6.body);
  const g6b = await call("six@x.in", "GET", "/api/grievances?closed=100&ref=GRV-NONE");
  ok(g6b.status === 200 && g6b.body.found === null, "6-ward: more closed cases and a search by number", g6b.body);
  for (const path of ["/api/overview", "/api/grievances/report", "/api/team", "/api/notifications", "/api/notices", "/api/handover", "/api/billing", "/api/observations", "/api/messages"]) {
    const x = await call("six@x.in", "GET", path);
    ok(x.status < 500, "6-ward representative: " + path + " answers without a server error", { status: x.status, body: x.body });
  }
  for (const id of ids) d6.prepare("DELETE FROM local_units WHERE id = ?").run(id);
}

// ---- grieviq-65: follow-up requests between officials ----
{
  const fs = await import("node:fs");
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const fdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const mails = () => fs.existsSync(MAIL) ? fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  const addU = (id, email, level, st, dist) => fdb.prepare("INSERT INTO gov_users (id, email, name, designation, level, state_id, district_id, letter_ref, letter_date, review_by, status, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'L/1/2026', ?, ?, 'ACTIVE', 'super@test.in', ?)")
    .run(id, email, "Official " + id, "Officer", level, st, dist, today, "2099-01-01", new Date().toISOString());
  const LKO = fdb.prepare("SELECT district_id FROM areas WHERE id = 'lucknow'").get().district_id;
  addU("fu-dm", "dm.fu@up.gov.in", "DISTRICT", "uttar-pradesh", LKO);
  addU("fu-dm2", "dm2.fu@up.gov.in", "DISTRICT", "uttar-pradesh", "uttar-pradesh--kanpur-nagar");
  addU("fu-nat", "js.fu@gov.in", "NATIONAL", null, null);
  addU("fu-bh", "ps.fu@bihar.gov.in", "STATE", "bihar", null);
  const signIn = async (email) => {
    await fetch(B + "/api/gov/code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    fdb.prepare("UPDATE gov_codes SET code_hash = ? WHERE email = ? AND used_at IS NULL").run(createHash("sha256").update("gov:" + email + ":515151").digest("hex"), email);
    const v = await fetch(B + "/api/gov/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: "515151" }) });
    return (v.headers.get("set-cookie") || "").split(";")[0];
  };
  const gq = async (ck, p, b) => { const x = await fetch(B + p, { method: b ? "POST" : "GET", headers: Object.assign({ "content-type": "application/json" }, ck ? { cookie: ck } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: x.status, body: await x.json() }; };
  const ST = await signIn("ps.pg@up.gov.in"), DM = await signIn("dm.fu@up.gov.in"), DM2 = await signIn("dm2.fu@up.gov.in"), NAT = await signIn("js.fu@gov.in"), BH = await signIn("ps.fu@bihar.gov.in");
  let r = await gq(ST, "/api/gov/followups");
  ok(r.status === 200 && r.body.ready === true && r.body.on === false && r.body.items.length === 0, "follow-ups: off until switched on for the state", r.body);
  r = await gq(ST, "/api/gov/followups", { action: "create", toKind: "DISTRICT", toId: LKO, figure: "OVER30", note: "Please review the cases pending over 30 days.", days: 15 });
  ok(r.status === 403 && r.body.error === "NOT_ON", "can't send while switched off", r.body);
  // the switch: super admin only, on the state's letter
  r = await call(O, "POST", "/api/admin/gov", { action: "followups", stateId: "uttar-pradesh", on: true, letterRef: "UP/PG/12/2026" });
  ok(r.status === 403, "operations admin can't switch follow-ups on", r.status);
  r = await call(S, "POST", "/api/admin/gov", { action: "followups", stateId: "uttar-pradesh", on: true });
  ok(r.status === 400 && r.body.fields.letterRef === "REQUIRED", "the state's letter is required", r.body);
  r = await call(S, "POST", "/api/admin/gov", { action: "followups", stateId: "uttar-pradesh", on: true, letterRef: "UP/PG/12/2026" });
  ok(r.status === 200 && r.body.on === true, "super admin switches follow-ups on for Uttar Pradesh");
  ok(fdb.prepare("SELECT COUNT(*) n FROM admin_events WHERE action = 'gov_followups_on'").get().n === 1, "switching on is in the admin log");
  const ga = await call(A, "GET", "/api/admin/gov");
  ok(ga.body.followups.ready && ga.body.followups.settings.some((x) => x.stateId === "uttar-pradesh" && x.on && x.letterRef === "UP/PG/12/2026"), "the auditor sees the switch and its letter");
  // what each official may send
  r = await gq(ST, "/api/gov/followups");
  const jal = fdb.prepare("SELECT o.office_id, a.district_id FROM dept_officers o JOIN dept_offices d ON d.id = o.office_id JOIN areas a ON a.id = d.area_id WHERE o.email = 'ae.zone3@nic.in' AND o.status = 'ACTIVE'").get();
  ok(r.body.on && r.body.options.down.some((x) => x.kind === "DISTRICT" && x.id === LKO) && r.body.options.down.some((x) => x.kind === "DEPT" && x.id === jal.office_id) && r.body.options.up === null, "state: may send to Lucknow district and the office on the dashboard; no national above yet", r.body.options);
  ok(!r.body.options.down.some((x) => x.id === "uttar-pradesh--agra"), "only districts with an official on GrievIQ are offered");
  const dmo = (await gq(DM, "/api/gov/followups")).body.options;
  ok(dmo.up && dmo.up.kind === "STATE" && dmo.down.every((x) => x.kind === "DEPT"), "district: up to the state, down to department offices only", dmo);
  ok((await gq(NAT, "/api/gov/followups")).body.on === false, "national requests need their own switch (a ministry's letter)");
  // the form's preview
  r = await gq(ST, "/api/gov/followups?preview=1&toKind=DISTRICT&toId=" + LKO + "&figure=OVER30");
  const smallOk = (v) => v === "<10" || v === 0 || (typeof v === "number" && v >= 10);
  ok(r.status === 200 && r.body.snapshot.figure === "OVER30" && smallOk(r.body.snapshot.value) && r.body.snapshot.ages.length === 4, "preview: the figure as it stands, small-number rule applied", r.body);
  ok((await gq(ST, "/api/gov/followups?preview=1&toKind=DISTRICT&toId=" + LKO + "&figure=LATE_NOW")).status === 400, "a department figure can't be used for a district");
  // what a note may hold
  const base = { action: "create", toKind: "DISTRICT", toId: LKO, figure: "OVER30", days: 15 };
  for (const [note, why] of [["Call me on 9876543210 about these cases please.", "NO_CONTACTS"], ["Write to dm.someone@gmail.com about these old cases.", "NO_CONTACTS"],
    ["Please look at GRV-ABC123 first, it is very old now.", "NO_CASES"], ["See https://example.com/list for the list of old cases.", "NO_LINKS"], ["Too short", "TOO_SHORT"]]) {
    r = await gq(ST, "/api/gov/followups", Object.assign({}, base, { note }));
    ok(r.status === 400 && r.body.fields.note === why, "note refused: " + why, r.body);
  }
  ok((await gq(ST, "/api/gov/followups", Object.assign({}, base, { note: "Please review the cases pending over 30 days.", days: 10 }))).body.fields.days === "CHOOSE", "reply-by: 7, 15 or 30 days");
  const m0 = mails().length;
  r = await gq(ST, "/api/gov/followups", Object.assign({}, base, { note: "Please review the cases pending over 30 days and report the action taken.", letterRef: "UP/PG/88/2026", letterDate: today }));
  ok(r.status === 200 && /^GIQ-FU-\d{6}$/.test(r.body.ref), "state sends a follow-up request to Lucknow district", r.body);
  const fu1 = r.body.id, ref1 = r.body.ref;
  const newMails = mails().slice(m0);
  ok(newMails.some((m) => m.to && m.to[0] === "dm.fu@up.gov.in" && m.subject.includes(ref1)), "the district official is emailed", newMails.map((m) => m.to));
  ok(newMails.every((m) => !/report the action taken|pending over 30/.test(m.html)), "the email carries no words of the request");
  ok(!newMails.some((m) => m.to && m.to[0] === "dm2.fu@up.gov.in"), "officials of other districts are not told");
  // reading and replying
  r = await gq(DM, "/api/gov/followups");
  ok(r.body.items.length === 1 && r.body.items[0].side === "RECIPIENT" && r.body.counts.waitingOnUs === 1, "the district sees it, waiting on them", r.body.counts);
  ok((await gq(DM2, "/api/gov/followups")).body.items.length === 0 && (await gq(BH, "/api/gov/followups?id=" + fu1)).status === 404, "another district or state can't see it");
  r = await gq(DM, "/api/gov/followups?id=" + fu1);
  ok(r.status === 200 && r.body.item.events.some((e) => e.kind === "SEEN") && r.body.item.letterRef === "UP/PG/88/2026" && r.body.item.snapshot.figure === "OVER30", "opening it records that it was seen", r.body.item.events);
  ok((await gq(ST, "/api/gov/followups", { action: "reply", id: fu1, text: "We have reviewed all cases and acted on them." })).status === 403, "the sender can't reply to their own request");
  ok((await gq(DM, "/api/gov/followups", { action: "close", id: fu1, as: "DONE", reason: "Closing it myself" })).status === 403, "the recipient can't close it");
  r = await gq(DM, "/api/gov/followups", { action: "acknowledge", id: fu1 });
  ok(r.status === 200 && (await gq(ST, "/api/gov/followups?id=" + fu1)).body.item.status === "ACKNOWLEDGED", "acknowledged; the state sees it");
  ok((await gq(DM, "/api/gov/followups", { action: "reply", id: fu1, text: "Call 9876543210 for the list of cases." })).body.fields.text === "NO_CONTACTS", "a reply can't hold a phone number either");
  const m1 = mails().length;
  r = await gq(DM, "/api/gov/followups", { action: "reply", id: fu1, text: "Weekly review meeting held with all offices; 30 old cases assigned to named officers.", letterRef: "DM/LKO/12/2026" });
  ok(r.status === 200 && (await gq(ST, "/api/gov/followups?id=" + fu1)).body.item.status === "REPLIED", "the district replies with the action taken");
  ok(mails().slice(m1).some((m) => m.to && m.to[0] === "ps.pg@up.gov.in" && m.subject.includes(ref1)), "the state official is told there is a reply");
  // a department office
  r = await gq(DM, "/api/gov/followups", { action: "create", toKind: "DEPT", toId: jal.office_id, figure: "LATE_NOW", note: "Please clear the cases past the target time this week.", days: 7 });
  ok(jal.district_id === LKO ? r.status === 200 : r.status === 403, "district sends to a department office in its district", r.body);
  const fu2 = r.body.id;
  if (fu2) {
    ok(fdb.prepare("SELECT COUNT(*) n FROM notifications WHERE kind = 'DEPT_O_FU' AND recipient LIKE 'dept:%'").get().n >= 1, "the office's officers get an alert");
    const code = "468024";
    fdb.prepare("INSERT INTO dept_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run("fu65", "ae.zone3@nic.in", createHash("sha256").update("ae.zone3@nic.in:" + code).digest("hex"), new Date(Date.now() + 600000).toISOString(), new Date(Date.now() + 5000).toISOString());
    const vr = await fetch(B + "/api/dept/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ae.zone3@nic.in", code }) });
    const OCK = (vr.headers.get("set-cookie") || "").split(";")[0];
    fdb.prepare("DELETE FROM dept_codes WHERE id = 'fu65'").run();
    r = await gq(OCK, "/api/dept/followups");
    ok(r.status === 200 && r.body.items.some((x) => x.id === fu2) && !r.body.items.some((x) => x.id === fu1), "the officer sees only their office's requests", r.body.items.map((x) => x.ref));
    r = await gq(OCK, "/api/dept/followups", { action: "reply", id: fu2, text: "Twelve late cases cleared; two need a road cutting permit." });
    ok(r.status === 200 && (await gq(DM, "/api/gov/followups?id=" + fu2)).body.item.events.some((e) => e.kind === "REPLIED" && e.byKind === "DEPT"), "the officer replies; the district sees it");
    ok((await gq(OCK, "/api/dept/followups", { action: "reply", id: fu1, text: "Trying to reply to another request here." })).status === 404, "an officer can't answer a request for another place");
  }
  // up: the district raises an issue to the state about a department office
  r = await gq(DM, "/api/gov/followups", { action: "create", toKind: "STATE", subject: "DEPT", subjectOfficeId: jal.office_id, figure: "LATE_NOW", note: "This office has not replied on many cases for 30 days; please take it up.", days: 15 });
  ok(r.status === 200, "district raises an issue to the state", r.body);
  const fu3 = r.body.id;
  ok((await gq(ST, "/api/gov/followups?id=" + fu3)).body.item.direction === "UP", "the state sees it as raised from below");
  ok((await gq(DM, "/api/gov/followups", { action: "create", toKind: "DISTRICT", toId: "uttar-pradesh--kanpur-nagar", figure: "OVER30", note: "Sending sideways to another district is not allowed.", days: 7 })).status === 403, "a district can't send to another district");
  ok((await gq(BH, "/api/gov/followups", { action: "create", toKind: "DISTRICT", toId: LKO, figure: "OVER30", note: "Another state trying to send a request here.", days: 7 })).status === 403, "another state can't send");
  // the record can't be changed
  let threw = false; try { fdb.prepare("UPDATE followup_events SET text = 'x'").run(); } catch (e) { threw = true; }
  ok(threw, "follow-up steps can't be changed");
  threw = false; try { fdb.prepare("DELETE FROM followup_events").run(); } catch (e) { threw = true; }
  ok(threw, "follow-up steps can't be deleted before 3 years");
  // the hourly job: reminder, overdue, the figure measured again
  const fu4 = (await gq(ST, "/api/gov/followups", Object.assign({}, base, { note: "Second request: please share the plan for the oldest cases.", days: 7 }))).body.id;
  const by4 = fdb.prepare("SELECT reply_by FROM followups WHERE id = ?").get(fu4).reply_by;
  const at = (day) => new Date(Date.parse(day + "T03:30:00Z")).toISOString();
  r = await (await fetch(B + "/__test/run-followups", { method: "POST", body: JSON.stringify({ now: at(new Date(Date.parse(by4 + "T00:00:00Z") - 86400000).toISOString().slice(0, 10)) }) })).json();
  ok(r.reminded >= 1 && fdb.prepare("SELECT reminded FROM followups WHERE id = ?").get(fu4).reminded === 1, "a reminder the day before the reply-by date", r);
  r = await (await fetch(B + "/__test/run-followups", { method: "POST", body: JSON.stringify({ now: at(new Date(Date.parse(by4 + "T00:00:00Z") + 86400000).toISOString().slice(0, 10)) }) })).json();
  const row4 = fdb.prepare("SELECT status, was_overdue, result FROM followups WHERE id = ?").get(fu4);
  ok(row4.status === "OVERDUE" && row4.was_overdue === 1 && r.overdue >= 1, "past the reply-by date with no reply: overdue", row4);
  ok(row4.result && JSON.parse(row4.result).figure === "OVER30" && r.measured >= 1, "the figure is measured again", row4.result);
  r = await (await fetch(B + "/__test/run-followups", { method: "POST", body: JSON.stringify({ now: at(new Date(Date.parse(by4 + "T00:00:00Z") + 86400000).toISOString().slice(0, 10)) }) })).json();
  ok(r.reminded === 0 && r.overdue === 0 && r.measured === 0, "each step happens once", r);
  r = await gq(DM, "/api/gov/followups", { action: "reply", id: fu4, text: "Late reply: plan prepared, oldest cases assigned this week." });
  ok(r.status === 200 && fdb.prepare("SELECT status, was_overdue FROM followups WHERE id = ?").get(fu4).was_overdue === 1, "a late reply is still taken; overdue stays on record");
  // closing
  r = await gq(ST, "/api/gov/followups", { action: "close", id: fu1, as: "DONE", reason: "Action confirmed in the review" });
  ok(r.status === 200 && (await gq(DM, "/api/gov/followups?id=" + fu1)).body.item.status === "CLOSED", "the state closes it as done");
  r = await gq(ST, "/api/gov/followups", { action: "close", id: fu4, as: "NOT_RESOLVED", reason: "Figure did not fall enough", again: true, note: "Third request: share the officer-wise list of action taken.", days: 15 });
  ok(r.status === 200 && r.body.again && r.body.again.ref && fdb.prepare("SELECT follows FROM followups WHERE id = ?").get(r.body.again.id).follows === fu4, "not resolved: a new request carrying the history", r.body);
  ok((await gq(ST, "/api/gov/followups", { action: "close", id: fu1, as: "DONE", reason: "Closing twice should fail" })).status === 409, "a closed request can't be closed again");
  // national
  await call(S, "POST", "/api/admin/gov", { action: "followups", stateId: "*", on: true, letterRef: "MoPG/7/2026" });
  ok((await gq(ST, "/api/gov/followups")).body.options.up.kind === "NATIONAL" && (await gq(NAT, "/api/gov/followups")).body.options.down.some((x) => x.id === "uttar-pradesh") , "with the ministry's letter: national down to the state, the state up to national");
  r = await call(S, "POST", "/api/admin/gov", { action: "followups", stateId: "uttar-pradesh", on: false });
  ok(r.status === 400 && r.body.fields.reason === "REQUIRED", "switching off needs a reason");
  // GrievIQ staff read, never write
  r = await call(A, "GET", "/api/admin/followups");
  ok(r.status === 200 && r.body.items.length >= 4 && (await call(A, "GET", "/api/admin/followups?id=" + fu1)).body.item.events.length >= 5, "the auditor reads every request and its steps");
  ok(r.body.items.every((x) => x.note === null && x.closedReason === null) && (await call(A, "GET", "/api/admin/followups?id=" + fu1)).body.item.events.every((e) => e.text === null), "GrievIQ staff never see the words of a request or reply");
  ok(r.body.items.every((x) => x.from.nameEn && x.to.nameEn), "both ends are named");
  // grieviq-66: the seventh MIS report
  r = await gq(ST, "/api/gov/report?r=followups&state=uttar-pradesh");
  const fuT = r.body.tables && r.body.tables[0];
  ok(r.status === 200 && fuT.id === "followups" && fuT.rows.length >= 3 && fuT.rows.every((x) => /^GIQ-FU-\d{6}$/.test(x.ref) && x.figure.k && x.status.k && x.inTime.k), "the follow-ups report lists the state's requests", r.body);
  ok(!JSON.stringify(r.body).includes("Please review"), "the report never carries the words of a request");
  r = await gq(DM2, "/api/gov/report?r=followups&state=uttar-pradesh&district=uttar-pradesh--kanpur-nagar");
  ok(r.status === 200 && r.body.tables[0].rows.every((x) => x.from.en === "Kanpur Nagar" || x.to.en === "Kanpur Nagar"), "a district's report has only its own requests", r.body.tables && r.body.tables[0].rows);
  r = await gq(null, "/api/gov/report?r=followups&demo=1&state=" + encodeURIComponent((await gq(null, "/api/gov/me?demo=1&mode=state")).body.state.id));
  ok(r.status === 200 && r.body.demo && r.body.tables[0].rows.length === 2, "the demo report shows the two invented requests", r.body);
  ok((await call(S, "POST", "/api/admin/followups", {})).status === 405, "no way for staff to write in a request");
  ok((await call(M, "GET", "/api/admin/followups")).status === 403, "data moderator can't read them");
  const logged = fdb.prepare("SELECT action FROM gov_view_log WHERE action LIKE 'FU_%'").all().map((x) => x.action);
  ok(["FU_CREATED", "FU_VIEWED", "FU_ACKNOWLEDGE", "FU_REPLY", "FU_CLOSE"].every((a) => logged.includes(a)), "every step is in the officials' log", Array.from(new Set(logged)));
}

// ---- grieviq-67: Pay online (Razorpay) ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const fs = await import("node:fs");
  const MAIL = (process.env.GRIEVIQ_TEST_DIR || "/tmp/grieviq-tests") + "/mail.log";
  const mails = () => fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const T = async (p, b) => (await fetch(B + "/__test/" + p, { method: "POST", body: JSON.stringify(b || {}) })).json();
  const R = "r1@x.in";
  let n = 0;
  const newBill = async () => {
    n++;
    const r = await call(S, "POST", "/api/admin/bills", { action: "create", officeType: "REP", officeTier: "LOCAL", officeId: "lu-hazratganj", planId: "councillor", period: "MONTH", from: "2027-02-" + String(n).padStart(2, "0") });
    if (r.status !== 200) console.log("bill not made", r.body);
    return r.body;
  };
  const rep = (b, who) => call(who || R, "POST", "/api/billing", b);
  const billRow = (id) => sdb.prepare("SELECT * FROM bills WHERE id = ?").get(id);
  const onRow = (orderId) => sdb.prepare("SELECT * FROM bill_online_payments WHERE order_id = ?").get(orderId);
  const ev = (id) => sdb.prepare("SELECT action FROM bill_events WHERE bill_id = ? ORDER BY at").all(id).map((x) => x.action);
  // These payments move offices' paid-up dates; put them back at the end so the browser tests that follow see what they expect.
  const subsBefore = sdb.prepare("SELECT office_type, office_tier, office_id, paid_through FROM office_subscriptions").all();

  // offered to the office, not by itself
  let g = await call(R, "GET", "/api/billing");
  ok(g.status === 200 && g.body.pay.online.on === true && g.body.pay.online.test === false, "offices are told online payment is on (live)", g.body.pay && g.body.pay.online);
  const b1 = await newBill();
  r = await rep({ action: "online", billId: b1.id });
  ok(r.status === 400 && r.body.fields.ownFunds === "REQUIRED", "own-funds declaration needed (no party or campaign payments)", r.body);
  ok((await rep({ action: "online", billId: b1.id, ownFunds: true }, "r2@x.in")).status === 404, "another office can't pay this bill online");
  r = await rep({ action: "online", billId: b1.id, ownFunds: true, amount: 1 });
  ok(r.status === 200 && r.body.keyId === "rzp_live_GIQDEV0001" && r.body.amount === b1.total * 100 && r.body.currency === "INR" && /^order_/.test(r.body.orderId) && r.body.ref === b1.ref, "an order for exactly the bill total, in paise (the browser's amount is ignored)", r.body);
  ok(!JSON.stringify(r.body).includes("dev_only_rzp_secret"), "the key secret never leaves the server");
  const o1 = r.body.orderId;
  const st = await (await fetch(B + "/__test/rzp-state")).json();
  ok(st.orders.find((o) => o.id === o1).receipt === b1.ref, "the bill reference is the order's receipt");
  r = await rep({ action: "online", billId: b1.id, ownFunds: true });
  ok(r.body.orderId === o1, "trying again uses the same order (Razorpay then refuses a second payment of it)");
  ok(ev(b1.id).filter((x) => x === "ONLINE_STARTED").length === 1, "started once in the bill's history");
  // the payment window says paid: signature, then Razorpay's own record
  let p = await T("rzp-pay", { orderId: o1, status: "captured", method: "upi" });
  r = await rep({ action: "online-done", billId: b1.id, orderId: o1, paymentId: p.paymentId, signature: "0".repeat(64) });
  ok(r.status === 400 && r.body.error === "BAD_PAYMENT" && billRow(b1.id).status === "DUE", "a wrong signature is refused; the bill stays to pay", r.body);
  let before = mails().length;
  r = await rep({ action: "online-done", billId: b1.id, orderId: o1, paymentId: p.paymentId, signature: p.signature });
  ok(r.status === 200 && r.body.result === "PAID", "paid and checked", r.body);
  let row = billRow(b1.id);
  ok(row.status === "PAID" && row.paid_checked_by === "razorpay" && row.paid_at, "the bill is paid", row);
  ok(ev(b1.id).includes("PAID_ONLINE"), "in the bill's history (can't be changed)");
  ok(onRow(o1).status === "PAID" && onRow(o1).payment_id === p.paymentId && onRow(o1).method === "upi" && onRow(o1).settled_via === "CHECKOUT", "the online payment is recorded", onRow(o1));
  ok(mails().slice(before).some((x) => x.to[0] === "r1@x.in" && /payment received/.test(x.subject)), "office emailed: payment received");
  const sub = sdb.prepare("SELECT paid_through FROM office_subscriptions WHERE office_type = 'REP' AND office_tier = 'LOCAL' AND office_id = 'lu-hazratganj'").get();
  ok(!sub || sub.paid_through >= row.period_to, "the office is paid up to the end of the bill's period", sub);
  before = mails().length;
  r = await rep({ action: "online-done", billId: b1.id, orderId: o1, paymentId: p.paymentId, signature: p.signature });
  ok(r.status === 200 && r.body.result === "PAID" && mails().length === before, "told twice: done once, no second email");
  ok((await rep({ action: "online", billId: b1.id, ownFunds: true })).body.error === "ALREADY_PAID", "a paid bill can't be paid online again");
  g = await call(R, "GET", "/api/billing");
  let gb = g.body.bills.find((b) => b.id === b1.id);
  ok(gb.online.length === 1 && gb.online[0].status === "PAID" && gb.online[0].method === "upi" && gb.online[0].paymentId === p.paymentId && gb.online[0].orderId === undefined && gb.online[0].startedBy === undefined, "the office sees how it was paid (no staff details)", gb.online);

  // the webhook: signature checked, Razorpay asked again, each message once
  const b2 = await newBill();
  const o2 = (await rep({ action: "online", billId: b2.id, ownFunds: true })).body.orderId;
  p = await T("rzp-pay", { orderId: o2, status: "authorized", method: "card" });
  const hook = async (bodyObj, id, sig) => {
    const raw = JSON.stringify(bodyObj);
    const s = sig || (await T("rzp-sign", { body: raw })).signature;
    const x = await fetch(B + "/api/webhooks/razorpay", { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": s, "x-razorpay-event-id": id }, body: raw });
    return { status: x.status, body: await x.json() };
  };
  const msg = { entity: "event", event: "payment.authorized", payload: { payment: { entity: { id: p.paymentId, order_id: o2, amount: b2.total * 100, currency: "INR", status: "authorized" } } } };
  r = await hook(msg, "evt_DEV0000001", "f".repeat(64));
  ok(r.status === 401 && billRow(b2.id).status === "DUE", "a message with a wrong signature is refused");
  r = await hook(Object.assign({}, msg, { payload: { payment: { entity: Object.assign({}, msg.payload.payment.entity, { amount: 1 }) } } }), "evt_DEV0000002");
  ok(r.status === 200, "a signed message is taken", r.body);
  row = billRow(b2.id);
  ok(row.status === "PAID" && onRow(o2).settled_via === "WEBHOOK" && onRow(o2).method === "card", "the message's own amount isn't trusted: Razorpay is asked, the payment captured, the bill paid", onRow(o2));
  ok((await (await fetch(B + "/__test/rzp-state")).json()).payments.find((x) => x.id === p.paymentId).status === "captured", "an authorised payment is captured");
  r = await hook(msg, "evt_DEV0000002");
  ok(r.status === 200 && r.body.duplicate === true, "the same message twice: handled once");
  ok(sdb.prepare("SELECT result FROM payment_webhook_events WHERE id = 'evt_DEV0000002'").get().result === "PAID", "messages are remembered (ids only)");
  r = await hook({ event: "payment.captured", payload: { payment: { entity: { id: "pay_DEVunknown01", order_id: "order_DEVunknown01" } } } }, "evt_DEV0000003");
  ok(r.status === 200 && sdb.prepare("SELECT result FROM payment_webhook_events WHERE id = 'evt_DEV0000003'").get().result === "UNKNOWN_ORDER", "a message about someone else's order changes nothing");
  await T("rzp-mode", { mode: "LIVE", webhook: false });
  ok((await hook(msg, "evt_DEV0000004", "a".repeat(64))).status === 503, "no webhook secret: messages refused");
  await T("rzp-mode", { mode: "LIVE", webhook: true });

  // the hourly check, when neither the window nor the message arrived
  const b3 = await newBill();
  const o3 = (await rep({ action: "online", billId: b3.id, ownFunds: true })).body.orderId;
  await T("rzp-pay", { orderId: o3, status: "captured", method: "netbanking" });
  r = await T("run-online-payments");
  ok(r.checked === 0 && billRow(b3.id).status === "DUE", "an order younger than 10 minutes is left to the window and the message", r);
  sdb.prepare("UPDATE bill_online_payments SET started_at = ? WHERE order_id = ?").run(new Date(Date.now() - 20 * 60000).toISOString(), o3);
  r = await T("run-online-payments");
  ok(r.paid === 1 && billRow(b3.id).status === "PAID" && onRow(o3).settled_via === "HOURLY", "the hourly check finds the payment and pays the bill", r);

  // a failed payment; staff ask Razorpay; Razorpay unreachable
  const b4 = await newBill();
  const o4 = (await rep({ action: "online", billId: b4.id, ownFunds: true })).body.orderId;
  await T("rzp-pay", { orderId: o4, status: "failed" });
  ok((await call(A, "POST", "/api/admin/bills", { action: "online-check", id: b4.id })).status === 403, "the auditor can't run checks");
  r = await call(O, "POST", "/api/admin/bills", { action: "online-check", id: b4.id });
  ok(r.status === 200 && r.body.states[0] === "FAILED" && r.body.status === "DUE" && /declined/.test(onRow(o4).last_fail), "staff check: failed payment noted, bill still to pay", r.body);
  await T("rzp-down", { down: true });
  r = await call(O, "POST", "/api/admin/bills", { action: "online-check", id: b4.id });
  ok(r.status === 200 && r.body.states[0] === "WAITING" && onRow(o4).status === "CREATED", "Razorpay unreachable: nothing changes, tried again later", r.body);
  const b5 = await newBill();
  r = await rep({ action: "online", billId: b5.id, ownFunds: true });
  ok(r.status === 502 && r.body.error === "GATEWAY", "Razorpay unreachable: the office is told to try again or pay by UPI/bank", r.body);
  await T("rzp-down", { down: false });

  // a different amount: not paid, refunded by staff
  p = await T("rzp-pay", { orderId: o4, status: "captured", amount: 100 });
  before = mails().length;
  r = await rep({ action: "online-done", billId: b4.id, orderId: o4, paymentId: p.paymentId, signature: p.signature });
  ok(r.body.result === "EXTRA" && billRow(b4.id).status === "DUE" && onRow(o4).status === "EXTRA" && onRow(o4).last_fail === "AMOUNT:100", "a payment of a different amount doesn't pay the bill; it's set aside to refund", r.body);
  ok(mails().slice(before).some((x) => x.to[0] === "support@grieviq.in" && /refund/.test(x.subject)), "staff asked to refund it");
  g = await call(A, "GET", "/api/admin/bills");
  ok(g.body.online.on && g.body.online.mode === "LIVE" && g.body.online.webhook && g.body.online.lastWebhook && g.body.online.refund.some((x) => x.paymentId === p.paymentId && x.billRef === b4.ref && x.amount === 1 && x.why === "AMOUNT"), "Bills page: online payments on, last message, the payment to refund", g.body.online);
  const extra = onRow(o4).id;
  ok((await call(A, "POST", "/api/admin/bills", { action: "online-refunded", onlineId: extra, note: "Refunded rfnd_X" })).status === 403, "the auditor can't mark a refund");
  r = await call(S, "POST", "/api/admin/bills", { action: "online-refunded", onlineId: extra, note: "x" });
  ok(r.status === 400 && r.body.fields.reason === "REQUIRED", "marking a refund needs a note");
  r = await call(S, "POST", "/api/admin/bills", { action: "online-refunded", onlineId: extra, note: "Refunded in Razorpay, rfnd_DEV01" });
  ok(r.status === 200 && onRow(o4).status === "REFUNDED" && onRow(o4).staff_by === S && ev(b4.id).includes("ONLINE_REFUNDED"), "marked refunded, on record");
  ok((await call(S, "POST", "/api/admin/bills", { action: "online-refunded", onlineId: extra, note: "Refunded again?" })).body.error === "ALREADY_CHECKED", "can't be marked twice");
  gb = (await call(R, "GET", "/api/billing")).body.bills.find((b) => b.id === b4.id);
  ok(gb.online.some((x) => x.status === "REFUNDED") && gb.status === "DUE", "the office sees the refund; the bill is still to pay");

  // the bill cancelled while the office was paying: money set aside to refund
  const o5 = (await rep({ action: "online", billId: b5.id, ownFunds: true })).body.orderId;
  await call(S, "POST", "/api/admin/bills", { action: "cancel", id: b5.id, reason: "Office closed before paying" });
  ok((await rep({ action: "online", billId: b5.id, ownFunds: true })).body.error === "CANCELLED", "a cancelled bill can't be paid online");
  p = await T("rzp-pay", { orderId: o5, status: "captured" });
  r = await rep({ action: "online-done", billId: b5.id, orderId: o5, paymentId: p.paymentId, signature: p.signature });
  ok(r.body.result === "EXTRA" && billRow(b5.id).status === "CANCELLED" && onRow(o5).last_fail === "CLOSED", "paid after the bill was cancelled: to refund, the bill stays cancelled", r.body);

  // "I have paid" recorded, then paid online too
  const b6 = await newBill();
  const o6 = (await rep({ action: "online", billId: b6.id, ownFunds: true })).body.orderId;
  ok((await rep({ billId: b6.id, method: "UPI", utr: "OLP123456789", amount: b6.total, paidOn: today })).status === 200, "office also records a UPI payment");
  ok((await rep({ action: "online", billId: b6.id, ownFunds: true })).body.error === "ALREADY_REPORTED", "while a payment is being checked, online isn't offered");
  p = await T("rzp-pay", { orderId: o6, status: "captured" });
  before = mails().length;
  r = await rep({ action: "online-done", billId: b6.id, orderId: o6, paymentId: p.paymentId, signature: p.signature });
  const bp = sdb.prepare("SELECT status, reason FROM bill_payments WHERE bill_id = ?").get(b6.id);
  ok(r.body.result === "PAID" && billRow(b6.id).status === "PAID" && bp.status === "RETURNED" && /Paid online instead/.test(bp.reason), "paid online anyway: bill paid, the UPI record closed with a note", bp);
  ok(mails().slice(before).some((x) => x.to[0] === "support@grieviq.in" && /paid online after a UPI\/bank payment/.test(x.subject)), "staff told to look for a second payment");

  // TEST keys: everything works, no bill is paid
  await T("rzp-mode", { mode: "TEST" });
  g = await call(R, "GET", "/api/billing");
  ok(g.body.pay.online.on && g.body.pay.online.test === true, "offices are told it's test mode");
  const b7 = await newBill();
  r = await rep({ action: "online", billId: b7.id, ownFunds: true });
  ok(r.body.keyId === "rzp_test_GIQDEV0001" && r.body.test === true, "test keys used", r.body);
  const o7 = r.body.orderId;
  p = await T("rzp-pay", { orderId: o7, status: "captured" });
  r = await rep({ action: "online-done", billId: b7.id, orderId: o7, paymentId: p.paymentId, signature: p.signature });
  ok(r.body.result === "TEST_PAID" && billRow(b7.id).status === "DUE" && onRow(o7).mode === "TEST", "a test payment never pays a bill", r.body);
  // a test order still open when the keys become live is closed
  const o7b = (await rep({ action: "online", billId: b7.id, ownFunds: true })).body.orderId;
  ok(o7b !== o7, "a new test order after the test payment");
  await T("rzp-mode", { mode: "LIVE" });
  sdb.prepare("UPDATE bill_online_payments SET started_at = ? WHERE order_id = ?").run(new Date(Date.now() - 20 * 60000).toISOString(), o7b);
  r = await T("run-online-payments");
  ok(onRow(o7b).status === "EXPIRED", "a test order is closed once the keys are live", onRow(o7b));
  r = await rep({ action: "online", billId: b7.id, ownFunds: true });
  ok(r.status === 200 && r.body.keyId.startsWith("rzp_live_") && r.body.orderId !== o7b, "live keys: a new live order");
  // 3 days without payment: closed
  sdb.prepare("UPDATE bill_online_payments SET started_at = ? WHERE order_id = ?").run(new Date(Date.now() - 4 * 86400000).toISOString(), r.body.orderId);
  await T("run-online-payments");
  ok(onRow(r.body.orderId).status === "EXPIRED", "an order unpaid for 3 days is closed");
  // a limit per bill per day
  for (let i = 0; i < 10; i++) sdb.prepare("INSERT INTO bill_online_payments (id, bill_id, mode, order_id, amount_paise, status, started_by, started_at) VALUES (?, ?, 'LIVE', ?, ?, 'EXPIRED', ?, ?)").run("lim" + i, b7.id, "order_DEVLIMIT" + i, 100, R, new Date().toISOString());
  ok((await rep({ action: "online", billId: b7.id, ownFunds: true })).status === 429, "at most 10 tries per bill per day");

  // keys removed: off, and UPI/bank still work
  await T("rzp-mode", { mode: "OFF" });
  g = await call(R, "GET", "/api/billing");
  ok(g.body.pay.online.on === false && g.body.pay.methods.length >= 1, "no keys: online payment off; UPI and bank still shown");
  ok((await rep({ action: "online", billId: b7.id, ownFunds: true })).body.error === "ONLINE_OFF", "no keys: can't start");
  ok((await call(A, "GET", "/api/admin/bills")).body.online.on === false, "Bills page shows it's off");
  await T("rzp-mode", { mode: "LIVE" });

  // department office
  const code = "975367";
  sdb.prepare("INSERT INTO dept_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run("api67", "ae.zone3@nic.in", createHash("sha256").update("ae.zone3@nic.in:" + code).digest("hex"), new Date(Date.now() + 600000).toISOString(), new Date(Date.now() + 5000).toISOString());
  const vr = await fetch(B + "/api/dept/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ae.zone3@nic.in", code }) });
  const CK = (vr.headers.get("set-cookie") || "").split(";")[0];
  sdb.prepare("DELETE FROM dept_codes WHERE id = 'api67'").run();
  const jalId = sdb.prepare("SELECT office_id FROM dept_officers WHERE email = 'ae.zone3@nic.in' AND status = 'ACTIVE'").get().office_id;
  r = await call(S, "POST", "/api/admin/bills", { action: "create", officeType: "DEPT", officeId: jalId, planId: "dept_office", period: "YEAR", from: "2027-03-01" });
  const b8 = r.body;
  const dpost = async (body) => { const x = await fetch(B + "/api/dept/billing", { method: body ? "POST" : "GET", headers: { cookie: CK, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };
  g = await dpost();
  ok(g.status === 200 && g.body.pay.online.on === true, "department dashboard: online payment offered", g.body.pay);
  ok((await dpost({ action: "online", billId: b1.id, ownFunds: true })).status === 404, "an officer can't pay a representative's bill");
  r = await dpost({ action: "online", billId: b8.id, ownFunds: true });
  ok(r.status === 200 && r.body.amount === b8.total * 100, "department office: an order for its bill", r.body);
  p = await T("rzp-pay", { orderId: r.body.orderId, status: "captured", method: "netbanking" });
  r = await dpost({ action: "online-done", billId: b8.id, orderId: r.body.orderId, paymentId: p.paymentId, signature: p.signature });
  ok(r.body.result === "PAID" && billRow(b8.id).status === "PAID", "department bill paid online", r.body);
  // admin log
  const acts = sdb.prepare("SELECT action, actor_email FROM admin_events WHERE action LIKE 'bill_online%' OR action = 'bill_paid_online'").all();
  ok(acts.some((x) => x.action === "bill_paid_online" && x.actor_email === "razorpay") && acts.some((x) => x.action === "bill_online_refunded") && acts.some((x) => x.action === "bill_online_checked"), "every online step is in the admin log", acts);
  // tidy up for the browser tests: no bills left to pay, paid-up dates as they were
  for (const b of [b4, b7]) await call(S, "POST", "/api/admin/bills", { action: "cancel", id: b.id, reason: "Online payment tests finished" });
  const had = new Set(subsBefore.map((x) => x.office_type + "|" + x.office_tier + "|" + x.office_id));
  for (const x of sdb.prepare("SELECT office_type, office_tier, office_id FROM office_subscriptions").all()) if (!had.has(x.office_type + "|" + x.office_tier + "|" + x.office_id)) sdb.prepare("DELETE FROM office_subscriptions WHERE office_type = ? AND office_tier = ? AND office_id = ?").run(x.office_type, x.office_tier, x.office_id);
  for (const x of subsBefore) sdb.prepare("UPDATE office_subscriptions SET paid_through = ? WHERE office_type = ? AND office_tier = ? AND office_id = ?").run(x.paid_through, x.office_type, x.office_tier, x.office_id);
  // headers on the billing pages
  const rp = await import(new URL("../functions/_middleware.js", import.meta.url).href);
  {
    ok(rp.cspFor("/rep").includes("https://checkout.razorpay.com") && rp.cspFor("/dept.html").includes("frame-src https://api.razorpay.com") && !rp.cspFor("/").includes("razorpay") && !rp.cspFor("/admin-bills.html").includes("razorpay"), "Razorpay allowed on the two Billing pages only");
    const h = rp.withSecurityHeaders(new Response("x"), "/rep").headers;
    ok(h.get("Cross-Origin-Opener-Policy") === "same-origin-allow-popups" && rp.withSecurityHeaders(new Response("x"), "/").headers.get("Cross-Origin-Opener-Policy") === "same-origin", "bank-check windows can report back on Billing pages only");
  }
}

// ---- grieviq-68: review access for the payment provider's reviewers ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const sdb = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
  const RV = "grieviq.review@gmail.com", RV2 = "grieviq.review2@gmail.com";
  const rv = (who, b) => call(who, b ? "POST" : "GET", "/api/admin/review-office", b);
  r = await rv(A);
  ok(r.status === 200 && r.body.ready && r.body.on === false && r.body.canManage === false, "auditor sees review access is off", r.body);
  ok((await rv(O, { action: "on", email: RV })).status === 403, "only the super admin can switch it on");
  ok((await rv(M)).status === 403, "data moderator can't see it");
  r = await rv(S, { action: "on" });
  ok(r.status === 400 && r.body.fields.email === "REQUIRED", "the Google account is needed");
  r = await rv(S, { action: "on", email: "not-an-email" });
  ok(r.status === 400 && r.body.fields.email === "FORMAT", "a real email address", r.body);
  for (const used of ["r1@x.in", "ae.zone3@nic.in", S, "om@x.in"]) {
    r = await rv(S, { action: "on", email: used });
    ok(r.status === 400 && r.body.fields.email === "IN_USE", "a real office, team, officer or staff account can't be the reviewers' (" + used + ")", r.body);
  }
  ok((await call(RV, "GET", "/api/billing")).status !== 200, "before: the reviewers' account can't sign in");
  r = await rv(S, { action: "on", email: "Grieviq.Review@Gmail.com" });
  ok(r.status === 200 && r.body.email === RV && r.body.bill && /^GIQ-PAY-/.test(r.body.bill.ref), "switched on, with a sample bill", r.body);
  const sample = r.body.bill;
  const area = sdb.prepare("SELECT live, review FROM areas WHERE id = 'grieviq-review'").get();
  ok(area.live === 0 && area.review === 1, "the demo area is marked review and isn't live", area);
  r = await call(S, "POST", "/api/admin/areas", { action: "set_live", id: "grieviq-review", live: true });
  ok(r.status === 400 && r.body.code === "REVIEW_AREA" && sdb.prepare("SELECT live FROM areas WHERE id = 'grieviq-review'").get().live === 0, "the demo area can never be switched on for citizens", r.body);
  const io = await call("", "GET", "/api/intake-options");
  ok(!JSON.stringify(io.body).includes("grieviq-review"), "citizens never see the demo area");
  // the reviewer
  let g = await call(RV, "GET", "/api/billing");
  ok(g.status === 200 && g.body.bills.length === 1 && g.body.bills[0].ref === sample.ref && g.body.bills[0].status === "DUE" && g.body.pay.online.on, "the reviewer signs in and sees the sample bill with Pay online", g.body);
  g = await call(RV, "GET", "/api/grievances");
  ok(g.status === 200 && JSON.stringify(g.body).indexOf("GRV-") < 0, "the reviewer's console has no complaints", g.status);
  r = await call(RV, "POST", "/api/billing", { action: "online", billId: sample.id, ownFunds: true });
  ok(r.status === 200 && r.body.amount === sample.total * 100, "the reviewer can open the payment window for the sample bill", r.body);
  ok((await call(RV, "GET", "/api/admin/bills")).status === 403, "the reviewer has no staff access");
  // switching on again doesn't make a second bill
  r = await rv(S, { action: "on", email: RV });
  ok(r.status === 200 && r.body.bill.ref === sample.ref && sdb.prepare("SELECT COUNT(*) n FROM bills WHERE office_id = 'grieviq-review-office' AND status = 'DUE'").get().n === 1, "switching on again keeps the one sample bill", r.body);
  // a different account
  r = await rv(S, { action: "on", email: RV2 });
  ok(r.status === 200 && (await call(RV, "GET", "/api/billing")).status !== 200 && (await call(RV2, "GET", "/api/billing")).status === 200, "a new account replaces the old one at once");
  r = await rv(A);
  ok(r.body.on && r.body.email === RV2 && r.body.bills.some((b) => b.ref === sample.ref), "the Bills page shows who has access and the sample bill", r.body);
  // off
  r = await rv(S, { action: "off" });
  ok(r.status === 200 && r.body.cancelled === 1 && (await call(RV2, "GET", "/api/billing")).status !== 200, "switched off: no sign-in, sample bill cancelled", r.body);
  ok(sdb.prepare("SELECT status FROM bills WHERE id = ?").get(sample.id).status === "CANCELLED", "the sample bill is cancelled");
  ok((await rv(S, { action: "off" })).body.error === "ALREADY_OFF", "already off");
  const acts = sdb.prepare("SELECT action FROM admin_events WHERE action LIKE 'review_office_%'").all().map((x) => x.action);
  ok(acts.filter((a) => a === "review_office_on").length >= 3 && acts.includes("review_office_off"), "every switch is in the admin log", acts);
  // government views leave the demo area out
  const gs = await import(new URL("../functions/_shared/gov-stats.js", import.meta.url).href);
  ok(typeof gs.govStats === "function", "government statistics load with the review rule");
}

// ---- audit trail ----
const { DatabaseSync } = await import("node:sqlite");
const db = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
const acts = db.prepare("SELECT action, COUNT(*) n FROM admin_events GROUP BY action").all().reduce((m, x) => (m[x.action] = x.n, m), {});
ok(acts.dept_office_added >= 5 && acts.dept_office_changed >= 2 && acts.dept_office_retired >= 2 && acts.dept_office_restored >= 1 && acts.dept_offices_imported >= 2 && acts.change_request_submitted >= 3 && acts.change_request_approved >= 3 && acts.dept_type_added >= 2 && acts.dept_type_renamed >= 2 && acts.dept_type_retired >= 1 && acts.dept_type_restored >= 1, "every change logged", acts);
let threw = false; try { db.prepare("UPDATE admin_events SET action='x'").run(); } catch (e) { threw = true; }
ok(threw, "audit log can't be edited");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
