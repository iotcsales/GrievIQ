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
  ok(r.status === 200 && (await dcall("GET", "/api/dept/cases")).status === 401, "removed officer is signed out at once", r.body);
  // agreement ended: nobody from the office can sign in
  r = await dp({ action: "officer_add", officeId: jal.id, name: "Ravi Kumar", designation: "Assistant Engineer", email: "ae.zone3@nic.in" });
  ok(r.status === 200, "second officer added");
  r = await dp({ action: "agreement_end", officeId: jal.id, reason: "Department withdrew from the pilot" });
  ok(r.status === 200, "agreement ended", r.body);
  await call("", "POST", "/api/dept/code", { email: "ae.zone3@nic.in" });
  const m2 = mails().slice(-1)[0];
  ok(!m2.to || m2.to[0] !== "ae.zone3@nic.in", "no code emailed once the agreement ended");
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

// ---- audit trail ----
const { DatabaseSync } = await import("node:sqlite");
const db = ((d) => (d.exec("PRAGMA busy_timeout = 5000"), d))(new DatabaseSync(process.argv[2] || "test.db"));
const acts = db.prepare("SELECT action, COUNT(*) n FROM admin_events GROUP BY action").all().reduce((m, x) => (m[x.action] = x.n, m), {});
ok(acts.dept_office_added >= 5 && acts.dept_office_changed >= 2 && acts.dept_office_retired >= 2 && acts.dept_office_restored >= 1 && acts.dept_offices_imported >= 2 && acts.change_request_submitted >= 3 && acts.change_request_approved >= 3 && acts.dept_type_added >= 2 && acts.dept_type_renamed >= 2 && acts.dept_type_retired >= 1 && acts.dept_type_restored >= 1, "every change logged", acts);
let threw = false; try { db.prepare("UPDATE admin_events SET action='x'").run(); } catch (e) { threw = true; }
ok(threw, "audit log can't be edited");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
