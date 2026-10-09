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

// ---- audit trail ----
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(process.argv[2] || "test.db");
const acts = db.prepare("SELECT action, COUNT(*) n FROM admin_events GROUP BY action").all().reduce((m, x) => (m[x.action] = x.n, m), {});
ok(acts.dept_office_added >= 5 && acts.dept_office_changed >= 2 && acts.dept_office_retired >= 2 && acts.dept_office_restored >= 1 && acts.dept_offices_imported >= 2 && acts.change_request_submitted >= 3 && acts.change_request_approved >= 2, "every change logged", acts);
let threw = false; try { db.prepare("UPDATE admin_events SET action='x'").run(); } catch (e) { threw = true; }
ok(threw, "audit log can't be edited");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
