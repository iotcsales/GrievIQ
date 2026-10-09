"""Browser tests for the Departments page (Playwright + Chromium)."""
import os, sys, re, json
from playwright.sync_api import sync_playwright

B = "http://localhost:8788"
SHOTS = os.environ.get("GRIEVIQ_TEST_DIR", "/tmp/grieviq-tests") + "/shots"
os.makedirs(SHOTS, exist_ok=True)
passed = failed = 0
def ok(c, name, extra=""):
    global passed, failed
    if c: passed += 1
    else: failed += 1; print("FAIL:", name, str(extra)[:300])

CONTRAST_JS = r"""
() => {
  function rgb(s){const m=s.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
  function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);}
  function bg(el){ let cur=el; const layers=[]; while(cur && cur.nodeType===1){const c=rgb(getComputedStyle(cur).backgroundColor); if(c&&c.a>0){layers.push(c); if(c.a>=1) break;} cur=cur.parentElement;} let base={r:255,g:255,b:255}; if(!layers.length||layers[layers.length-1].a<1){base=rgb(getComputedStyle(document.body).backgroundColor)||base;} for(let i=layers.length-1;i>=0;i--){const c=layers[i]; base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a)};} return base;}
  const bad=[];
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const seen=new Set();
  while(walker.nextNode()){
    const t=walker.currentNode; if(!t.textContent.trim()) continue; const el=t.parentElement; if(!el||seen.has(el)) continue; seen.add(el);
    const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none') continue;
    const r=el.getBoundingClientRect(); if(r.width<2||r.height<2) continue;
    if(el.closest('.sr-only,.visually-hidden,[hidden],.skip-link')) continue;
    let o=1, e=el; while(e){o*=Number(getComputedStyle(e).opacity); e=e.parentElement;}
    const fg=rgb(cs.color); const b=bg(el); const f={r:fg.r*fg.a*o+b.r*(1-fg.a*o),g:fg.g*fg.a*o+b.g*(1-fg.a*o),b:fg.b*fg.a*o+b.b*(1-fg.a*o)};
    const L1=lum(f),L2=lum(b); const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    const size=parseFloat(cs.fontSize); const bold=Number(cs.fontWeight)>=700; const large=size>=24||(bold&&size>=18.66);
    const need=large?3:4.5;
    if(ratio<need) bad.push(el.tagName+'.'+el.className+' "'+t.textContent.trim().slice(0,40)+'" '+ratio.toFixed(2));
  }
  return bad;
}
"""
TARGET_JS = r"""
() => Array.from(document.querySelectorAll('main button, main a, main input, main select, main summary, header button')).filter(e=>{const r=e.getBoundingClientRect(); const cs=getComputedStyle(e); return r.width>0&&r.height>0&&cs.visibility!=='hidden' && !e.closest('dd, .meta, ol, .note, .msg, p, td')}).filter(e=>{const r=e.getBoundingClientRect(); return (r.height<24||r.width<24) && !(e.type==='checkbox'||e.type==='radio') }).map(e=>e.tagName+' '+(e.id||e.textContent.trim().slice(0,30))+' '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))
"""

def page_for(browser, email, width=1280, theme=None, lang=None):
    ctx = browser.new_context(viewport={"width": width, "height": 900})
    ctx.add_cookies([{"name": "test_email", "value": email, "url": B}])
    init = ""
    if theme == "light": init += "try{localStorage.setItem('griq-admin-theme','light')}catch(e){};"
    if lang: init += "try{localStorage.setItem('" + "giq-lang" + "','" + lang + "')}catch(e){};"
    if init: ctx.add_init_script(init)
    p = ctx.new_page()
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    return ctx, p, errs

def save(p, sel):
    with p.expect_response(lambda r: r.request.method == "POST"):
        p.click(sel)
    p.wait_for_timeout(150)

def shot(p, name, full=True):
    p.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=full)

def no_hscroll(p):
    return p.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")

with sync_playwright() as pw:
    br = pw.chromium.launch()
    # language storage key used by i18n.js
    ctx, p, errs = page_for(br, "super@test.in")
    p.goto(B + "/admin-departments.html?area=lucknow"); p.wait_for_selector(".office")
    store = p.evaluate("() => Object.keys(localStorage)")
    ctx.close()
    LANGKEY = None
    src = open(os.path.join(sys.argv[1], "public/i18n.js"), encoding="utf-8").read()
    m = re.search(r"STORE\s*=\s*['\"]([^'\"]+)['\"]", src); LANGKEY = m.group(1) if m else "giq-lang"

    def P(email, width=1280, theme=None, lang=None):
        ctx = br.new_context(viewport={"width": width, "height": 900})
        ctx.add_cookies([{"name": "test_email", "value": email, "url": B}])
        init = ""
        if theme == "light": init += "try{localStorage.setItem('griq-admin-theme','light')}catch(e){};"
        if lang: init += "try{localStorage.setItem('%s','%s')}catch(e){};" % (LANGKEY, lang)
        if init: ctx.add_init_script(init)
        p = ctx.new_page(); errs = []
        p.on("pageerror", lambda e: errs.append(str(e)))
        p.on("console", lambda m: errs.append(m.text) if m.type == "error" and "favicon" not in m.text and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text and "status of 400" not in m.text and "status of 409" not in m.text else None)
        p.on("dialog", lambda d: d.accept())
        return ctx, p, errs

    # ---------- super admin: whole flow ----------
    ctx, p, errs = P("super@test.in")
    p.goto(B + "/admin-departments.html?area=lucknow"); p.wait_for_selector(".office")
    ok("Departments" in p.title(), "page title")
    p.click('button[data-key="adm.nav_g_data"]')
    ok(p.is_visible('#adm-drop-data a[href="/admin-departments.html"]'), "menu: Departments under Areas & data")
    links = p.eval_on_selector_all("#adm-drop-data a", "els => els.map(e => e.textContent.trim())")
    ok(links[:2] == ["Areas", "Departments"], "Departments right after Areas", links)
    p.keyboard.press("Escape")
    shot(p, "01-list-dark")
    ok(p.locator(".card .num").first.inner_text() in ("6", "7"), "offices card")
    # filters
    p.select_option("#f-dept", "Electricity")
    ok(p.locator(".office").count() == 1 and "MVVNL" in p.locator(".office h3").first.inner_text(), "filter by type")
    p.select_option("#f-dept", "")
    p.check("#f-stale"); ok(p.locator(".office").count() == 1, "needs-checking filter"); p.uncheck("#f-stale")
    p.fill("#f-q", "cmo"); ok(p.locator(".office").count() == 1, "search"); ok(p.evaluate("document.activeElement.id") == "f-q", "focus stays in search"); p.fill("#f-q", "")
    p.check("#f-retired"); ok(p.locator(".office.retired").count() >= 1 and p.locator(".office:not(.retired)").count() == 0, "retired list"); p.uncheck("#f-retired")
    # coverage
    p.click('a[href="#coverage"]')
    ok(p.locator(".cov td.gap").count() > 0, "coverage shows gaps")
    p.check("#cov-gaps")
    shot(p, "02-coverage", full=True)
    p.uncheck("#cov-gaps")

    # add office: empty submit -> error summary
    p.click("#add-office"); p.wait_for_selector("#office-form")
    ok(p.evaluate("document.activeElement.id") == "form-h", "focus moves to form heading")
    p.fill("#o-source", ""); p.click("#o-save")
    p.wait_for_selector("#o-summary")
    ok(p.evaluate("document.activeElement.id") == "o-summary", "focus on error summary")
    items = p.locator("#o-summary li").all_inner_texts()
    ok(len(items) >= 4, "summary lists problems", items)
    shot(p, "03-form-errors")
    p.click("#o-summary li >> nth=0 >> a")
    ok(p.evaluate("document.activeElement.id") == "o-name-en", "summary link goes to field")
    ok(p.get_attribute("#o-name-en", "aria-invalid") == "true" and "o-name-en-err" in p.get_attribute("#o-name-en", "aria-describedby"), "field marked invalid + described")
    # fill properly, some wards
    p.fill("#o-name-en", "Jal Kal Zone 3 Office"); p.fill("#o-name-hi", "जलकल ज़ोन 3 कार्यालय")
    p.check('[data-dept="Water Supply"]')
    p.check('input[name="o-wards"][value="LIST"]')
    p.fill("#o-ward-q", "nagar")
    ok(p.locator("[data-ward]").count() == 2, "ward search filters list")
    p.click("#o-ward-all")
    ok("2 of 5" in p.inner_text("#o-ward-count"), "select shown", p.inner_text("#o-ward-count"))
    p.fill("#o-ward-q", "")
    p.fill("#o-phone", "0522 2612345"); p.fill("#o-whatsapp", "12345")
    p.fill("#o-source", "RTI reply from Jal Kal, 3 Oct 2026")
    save(p, "#o-save")
    ok("10-digit" in p.inner_text("#o-summary"), "server error for WhatsApp shown", p.inner_text("#o-summary"))
    ok(p.input_value("#o-name-hi") == "जलकल ज़ोन 3 कार्यालय", "typed values kept after error")
    p.fill("#o-whatsapp", "")
    p.click("details.officer summary"); p.fill("#o-off-phone", "9876543210"); p.click("#o-save"); p.wait_for_timeout(150)
    ok(p.locator("#o-summary li").count() == 3, "officer number needs name, date, how")
    p.fill("#o-off-phone", "")
    save(p, "#o-save")
    ok("was added" in p.inner_text("#top-msg") and p.evaluate("document.activeElement.id") == "top-msg", "added message + focus")
    ok(p.locator('.office h3:has-text("Jal Kal Zone 3 Office")').count() == 1, "new office listed")
    card = p.locator('.office:has(h3:has-text("Jal Kal Zone 3 Office"))')
    ok("Gomti Nagar" in card.inner_text() and "Tilak Nagar" in card.inner_text(), "coverage text on card")
    # edit
    card.locator("[data-edit]").click(); p.wait_for_selector("#office-form")
    ok(p.input_value("#o-name-en") == "Jal Kal Zone 3 Office" and p.is_checked('[data-dept="Water Supply"]') and p.is_checked('input[name="o-wards"][value="LIST"]'), "edit form prefilled")
    save(p, "#o-save")
    ok("Nothing has changed" in p.inner_text("#top-msg"), "unchanged edit explained")
    p.fill("#o-hours", "Mon–Sat, 10 am – 5 pm"); save(p, "#o-save")
    ok("saved" in p.inner_text("#top-msg"), "edit saved")
    # cancel returns focus
    card = p.locator('.office:has(h3:has-text("Jal Kal Zone 3 Office"))')
    card.locator("[data-edit]").click(); p.click("#o-cancel")
    ok("Jal Kal Zone 3" in (p.evaluate("document.activeElement.textContent") or ""), "cancel returns focus to Edit")
    # retire
    card = p.locator('.office:has(h3:has-text("Jal Kal Zone 3 Office"))')
    card.locator("[data-retire]").click()
    ok(p.evaluate("document.activeElement.id") == "r-reason", "focus in retire reason")
    p.fill("#r-reason", "short"); p.click("#r-go")
    ok(p.is_visible("#r-reason-err"), "short reason error")
    p.fill("#r-reason", "Office moved into the main Jal Kal building"); save(p, "#r-go")
    ok("retired" in p.inner_text("#top-msg"), "retired")
    p.check("#f-retired")
    rc = p.locator('.office:has(h3:has-text("Jal Kal Zone 3 Office"))')
    ok("main Jal Kal building" in rc.inner_text(), "reason shown on retired card")
    save(p, '.office:has(h3:has-text("Jal Kal Zone 3 Office")) [data-restore]')
    ok("back in use" in p.inner_text("#top-msg") and not p.is_checked("#f-retired"), "brought back")

    # upload
    p.click("#open-upload"); p.wait_for_selector("#upload-panel")
    ok(p.is_disabled("#up-check"), "check disabled until a file is chosen")
    csvp = os.path.join(SHOTS, "test-upload.csv")
    open(csvp, "w", encoding="utf-8").write("office_name_en,office_name_hi,handles,wards,helpline,office_phone,office_email,whatsapp,website,address,hours,source,last_checked,notes\n"
        "Health Helpline 104,,Health,ALL,104,,,,,,,https://up.gov.in,2026-10-01,\n"
        "Broken,,Water,Atlantis,,,,,,,,,,\n")
    p.set_input_files("#up-file", csvp); p.click("#up-check"); p.wait_for_selector("#up-sum")
    ok("1 of 2 rows need fixing" in p.inner_text("#up-sum"), "file report", p.inner_text("#up-sum"))
    ok("Atlantis" in p.inner_text(".report") and p.locator("#up-save").count() == 0, "bad row explained, no save button")
    shot(p, "04-upload-report")
    open(csvp, "w", encoding="utf-8").write("office_name_en,office_name_hi,handles,wards,helpline,office_phone,office_email,whatsapp,website,address,hours,source,last_checked,notes\n"
        "Health Helpline 104,,Health,ALL,104,,,,,,,https://up.gov.in,2026-10-01,\n")
    p.set_input_files("#up-file", csvp); p.click("#up-check"); p.wait_for_selector("#up-save")
    save(p, "#up-save")
    ok("1 offices were added" in p.inner_text("#top-msg") or "were added" in p.inner_text("#top-msg"), "file saved", p.inner_text("#top-msg"))
    # template link
    with p.expect_download() as d:
        p.click("#open-upload"); p.click("text=Download template (CSV)")
    ok(d.value.suggested_filename == "grieviq-departments-template.csv", "template downloads")
    p.click("#up-close")
    # area switch
    p.select_option("#f-area", "kanpur"); p.wait_for_function("document.querySelector('#f-area').value==='kanpur' && document.querySelectorAll('.office').length===1")
    ok("area=kanpur" in p.url, "area in address")
    ok(not errs, "no script errors (super)", errs)
    ctx.close()


    # ---------- grieviq-25: area-specific examples, department types ----------
    ctx, p, errs = P("super@test.in")
    p.goto(B + "/admin-departments.html?area=kanpur"); p.wait_for_selector("#f-area")
    ok(p.locator("#f-area option:checked").inner_text() == "Kanpur", "area name shown with a capital letter")
    p.click("#add-office"); p.wait_for_selector("#office-form")
    ok('"Jal Kal Vibhag, Kanpur"' in p.inner_text("#o-name-en-hint"), "English example names Kanpur", p.inner_text("#o-name-en-hint"))
    ok("कानपुर" in p.inner_text("#o-name-hi-hint"), "Hindi example names कानपुर")
    ok("0512" in p.inner_text("#o-phone-hint"), "phone example uses Kanpur's STD code")
    ok("Whole of Kanpur" in p.inner_text("#office-form"), "Whole of Kanpur")
    ok("add it here" in p.inner_text("#o-dept-fs"), "note under Other")
    # "+ Add a new type" inside the form: typed values kept, new type ticked
    p.fill("#o-name-en", "KESCO Street Light Cell"); p.check('[data-dept="Electricity"]')
    p.click("#nt-open"); ok(p.evaluate("document.activeElement.id") == "nt-h", "new-type box opens, focus moves")
    p.click("#nt-save"); p.wait_for_timeout(150)
    ok(p.is_visible("#nt-en-err") and p.is_visible("#nt-hi-err"), "new-type names required")
    p.fill("#nt-en", "Public Toilets"); p.fill("#nt-hi", "सार्वजनिक शौचालय विभाग"); p.fill("#nt-desc", "Dirty or broken public toilets")
    shot(p, "12-inline-type")
    save(p, "#nt-save"); p.wait_for_timeout(400)
    ok(p.is_checked('[data-dept="Public Toilets"]') and p.is_checked('[data-dept="Electricity"]'), "new type ticked, earlier tick kept")
    ok(p.input_value("#o-name-en") == "KESCO Street Light Cell", "typed office name kept")
    ok(p.evaluate("document.activeElement.dataset.dept") == "Public Toilets", "focus on the new tick")
    p.fill("#o-helpline", "1912"); p.fill("#o-source", "https://kesco.co.in")
    save(p, "#o-save")
    ok("was added" in p.inner_text("#top-msg") and p.locator('.office:has-text("KESCO Street Light Cell") .tag:has-text("Public Toilets")').count() == 1, "office saved with the new type")
    p.click("#add-office"); p.wait_for_selector("#office-form")
    p.click("#o-cancel")
    p.goto(B + "/admin-departments.html?area=lucknow"); p.wait_for_selector(".office")
    p.click('a[href="#types"]')
    ok(p.locator("table.types tbody tr").count() >= 8, "types table")
    other_row = p.locator('table.types tr:has(th:has-text("Other"))').first
    ok(other_row.locator("[data-tretire]").count() == 0, "Other has no Retire button")
    p.click("#t-add"); p.wait_for_selector("#type-form")
    ok(p.evaluate("document.activeElement.id") == "type-form-h", "focus on type form heading")
    p.click("#t-save"); p.wait_for_selector("#t-summary")
    ok(p.locator("#t-summary li").count() == 2 and p.evaluate("document.activeElement.id") == "t-summary", "type form errors summarised")
    p.fill("#t-name-en", "Pollution / Noise"); p.fill("#t-name-hi", "Pollution")
    save(p, "#t-save")
    ok("Hindi (Devanagari)" in p.inner_text("#t-summary"), "server says Hindi name must be Hindi")
    p.fill("#t-name-hi", "प्रदूषण / शोर विभाग"); p.fill("#t-desc", "Air, water and noise pollution")
    shot(p, "10-type-form")
    save(p, "#t-save")
    ok("was added" in p.inner_text("#top-msg"), "type added message")
    row = p.locator('table.types tr:has(th:has-text("Pollution / Noise"))')
    ok(row.count() == 1 and "Not used yet" in row.inner_text(), "new type listed, unused")
    ok(p.locator('.cov th:has-text("Pollution / Noise")').count() == 1, "new coverage column")
    # it can be ticked on an office
    p.click("#add-office"); p.wait_for_selector("#office-form")
    ok(p.locator('[data-dept="Pollution / Noise"]').count() == 1, "new type tickable on offices")
    p.click("#o-cancel")
    # in use -> retire blocked with names
    row = p.locator('table.types tr:has(th:has-text("Water Supply"))')
    row.locator("[data-tretire]").click(); p.wait_for_selector("#tr-msg")
    ok("Jal Kal" in p.inner_text("#tr-msg") and "Issue type" in p.inner_text("#tr-msg"), "in-use type: users named", p.inner_text("#tr-msg"))
    p.click("#tr-cancel")
    # rename then retire the unused new type
    row = p.locator('table.types tr:has(th:has-text("Pollution / Noise"))')
    row.locator("[data-tedit]").click(); p.wait_for_selector("#type-form")
    ok(p.input_value("#t-name-hi") == "प्रदूषण / शोर विभाग", "edit form prefilled")
    p.fill("#t-name-en", "Pollution and Noise"); save(p, "#t-save")
    ok("were saved" in p.inner_text("#top-msg"), "type renamed")
    row = p.locator('table.types tr:has(th:has-text("Pollution and Noise"))')
    row.locator("[data-tretire]").click()
    p.fill("#tr-reason", "short"); p.click("#tr-go"); ok(p.is_visible("#tr-reason-err"), "short reason refused")
    p.fill("#tr-reason", "Handled by the Pollution Control Board, not here"); save(p, "#tr-go")
    ok("was retired" in p.inner_text("#top-msg"), "type retired")
    row = p.locator('table.types tr:has(th:has-text("Pollution and Noise"))')
    ok("Retired" in row.inner_text() and p.locator('.cov th:has-text("Pollution")').count() == 0, "retired: marked, no coverage column")
    save(p, 'table.types tr:has(th:has-text("Pollution and Noise")) [data-trestore]')
    ok("back in use" in p.inner_text("#top-msg"), "type brought back")
    # Hindi view of the types table
    p.click("[data-lang-toggle]"); p.wait_for_timeout(300)
    ok(p.locator('table.types th:has-text("प्रदूषण / शोर विभाग")').count() == 1, "Hindi type name shown in Hindi")
    shot(p, "11-types-hi", full=True)
    p.click("[data-lang-toggle]")
    ok(not errs, "no script errors (types)", errs)
    ctx.close()

    # Issue types page lists the new type, in Hindi too
    ctx, p, errs = P("super@test.in", lang="hi")
    p.goto(B + "/admin-issue-types.html"); p.wait_for_selector(".dept-select")
    opts = p.eval_on_selector_all(".dept-select >> nth=0 >> option", "els => els.map(e => e.textContent)")
    ok("प्रदूषण / शोर विभाग" in opts, "Issue types: new type in Hindi", opts)
    ok(not errs, "no script errors (issue types)", errs)
    ctx.close()

    # Rep console and Track page show the new type (functions checked in the page itself)
    for lang in ("en", "hi"):
        ctx, p, errs = P("nobody@test.in", lang=lang)
        p.route("**/api/**", lambda route: route.fulfill(status=401, body='{"error":"SIGNED_OUT"}', headers={"content-type": "application/json"}))
        p.goto(B + "/rep.html"); p.wait_for_timeout(800)
        html = p.evaluate("""() => { takeDepartments({ departments: ['Water Supply','Pollution / Noise','Other'], deptNames: { 'Pollution / Noise': { en: 'Pollution and Noise', hi: 'प्रदूषण / शोर विभाग' } } });
          return renderFollowupControl({ id: 'c1', status: 'OPEN', suggestedDepartment: 'Pollution / Noise', currentDepartment: 'Pollution / Noise', followupHistory: [] }); }""")
        want = "प्रदूषण / शोर विभाग" if lang == "hi" else "Pollution and Noise"
        first_opt = re.findall(r'<option value="([^"]*)">([^<]*)</option>', html[html.index('class="followup-dept"'):])
        ok(first_opt[1][0] == "Pollution / Noise" and want in first_opt[1][1], "rep: suggested new type listed first, named " + lang, first_opt[:3])
        ok(len(first_opt) == 4, "rep: only the current list offered " + lang)
        ctx.close()
        ctx, p, errs = P("nobody@test.in", lang=lang)
        p.goto(B + "/status.html"); p.wait_for_timeout(500)
        name = p.evaluate("() => { GIQ.addDepts({ 'Pollution / Noise': { en: 'Pollution and Noise', hi: 'प्रदूषण / शोर विभाग' } }); return GIQ.dept('Pollution / Noise') + '|' + GIQ.dept('Water Supply'); }")
        ok(name == (want + "|" + ("जलापूर्ति विभाग" if lang == "hi" else "Water Supply")), "Track: department names " + lang, name)
        ctx.close()


    # ---------- Departments stage 2: "Who handles this" card in the rep console ----------
    DIR = {"units": {"u1": "lucknow", "u2": "lucknow"}, "areas": {"lucknow": {"name": "Lucknow", "state": "Uttar Pradesh"}},
           "offices": [
             {"id": "o1", "areaId": "lucknow", "nameEn": "Lucknow Nagar Nigam Control Room", "nameHi": "लखनऊ नगर निगम कंट्रोल रूम", "departments": ["Water Supply", "Sanitation / Garbage"], "wards": None,
              "helpline": "1533", "officePhone": None, "officeEmail": "nnlko@nic.in", "whatsapp": "9219902911", "website": "https://lmc.up.nic.in/helpline.aspx", "address": None, "hours": "24 hours", "officerName": None, "officerPhone": None, "lastChecked": "2026-10-07"},
             {"id": "o2", "areaId": "lucknow", "nameEn": "Jal Kal Zone 3", "nameHi": None, "departments": ["Water Supply"], "wards": ["u1"],
              "helpline": None, "officePhone": "0522 2612345", "officeEmail": None, "whatsapp": None, "website": None, "address": "Aishbagh", "hours": None, "officerName": "R. K. Singh", "officerPhone": "9876543210", "lastChecked": "2026-10-03"}]}
    CASE = {"id": "c1", "status": "OPEN", "suggestedDepartment": "Water Supply", "localUnit": {"id": "u1"}, "followupHistory": [], "myRole": "FIELD_WORKER"}
    told = []
    for theme in ("light", "dark"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                ctx = br.new_context(viewport={"width": width, "height": 900})
                ctx.add_init_script("try{localStorage.setItem('griq-theme','%s');localStorage.setItem('%s','%s')}catch(e){}" % (theme, LANGKEY, lang))
                p = ctx.new_page(); errs = []
                p.on("pageerror", lambda e: errs.append(str(e)))
                def route(rt):
                    if "/api/dept-gap" in rt.request.url:
                        told.append(rt.request.post_data); rt.fulfill(status=200, body='{"ok":true}', headers={"content-type": "application/json"})
                    else:
                        rt.fulfill(status=401, body='{"error":"SIGNED_OUT"}', headers={"content-type": "application/json"})
                p.route("**/api/**", route)
                p.goto(B + "/rep.html"); p.wait_for_timeout(600)
                p.evaluate("""([dir, c]) => { takeDepartments({ departments: ['Water Supply','Electricity','Sanitation / Garbage','Health','Other'], deptDirectory: dir });
                  currentCases = [c]; const m = document.querySelector('main') || document.body;
                  const box = document.createElement('div'); box.id = 'dc-test'; box.className = 'case-card'; box.style.maxWidth = '640px'; box.style.padding = '12px';
                  box.innerHTML = renderFollowupControl(c); m.prepend(box); window.scrollTo(0, 0); }""", [DIR, CASE])
                tag = "%s-%s-%d" % (theme, lang, width)
                card = p.locator("#dc-c1")
                ok(card.count() == 1, "card shown to a field worker " + tag)
                names = p.locator("#dc-c1 .dc-name").all_inner_texts()
                ok(names[0] == "Jal Kal Zone 3" and len(names) == 2, "ward office first, then whole-area office " + tag, names)
                if lang == "hi":
                    ok("लखनऊ नगर निगम कंट्रोल रूम" in names[1] and "यह कौन देखता है" in card.inner_text(), "card in Hindi " + tag)
                else:
                    hrefs = p.eval_on_selector_all("#dc-c1 .dc-link", "els => els.map(e => e.getAttribute('href'))")
                    ok("tel:05222612345" in hrefs and "tel:9876543210" in hrefs and "tel:1533" in hrefs and "mailto:nnlko@nic.in" in hrefs and "https://wa.me/919219902911" in hrefs, "tap-to-call, email, WhatsApp links " + tag, hrefs)
                    ok("Call helpline 1533" in card.inner_text() and "Jansunwai" not in card.inner_text(), "link text says what it does; no Jansunwai line " + tag)
                ok(no_hscroll(p), "card: no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS.replace("document.body", "document.getElementById('dc-test')", 1))
                ok(not bad, "card contrast AA " + tag, bad[:5])
                small = p.evaluate("() => Array.from(document.querySelectorAll('#dc-c1 a.dc-link, #dc-c1 select, #dc-c1 button')).filter(e => { const r = e.getBoundingClientRect(); return r.height < 24; }).length")
                ok(small == 0, "card targets >= 24px " + tag)
                shot(p, "13-card-" + tag, full=False)
                # Not the right department? -> Health: no contact -> Tell GrievIQ
                p.select_option("#dc-sel-c1", "Health")
                ok(p.evaluate("document.activeElement.id") == "dc-sel-c1", "focus stays on the department list " + tag)
                ok(p.locator("#dc-c1 .dc-tell").count() == 1, "no contact: Tell GrievIQ button " + tag)
                p.click("#dc-c1 .dc-tell"); p.wait_for_selector("#dc-c1 .dc-told")
                ok(p.evaluate("document.activeElement.className") == "dc-told", "thank-you message focused " + tag)
                ok(not errs, "no script errors (card) " + tag, errs)
                ctx.close()
    ok(len(told) == 8 and '"department":"Health"' in told[0] and '"grievanceId":"c1"' in told[0], "Tell GrievIQ sends case and department", told[:1])

    # ---------- themes, languages, widths: contrast + reflow ----------
    for theme in (None, "light"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                ctx, p, errs = P("super@test.in", width=width, theme=theme, lang=lang)
                p.goto(B + "/admin-departments.html?area=lucknow"); p.wait_for_selector(".office")
                tag = "%s-%s-%d" % (theme or "dark", lang, width)
                ok(no_hscroll(p), "no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS)
                ok(not bad, "contrast AA " + tag, bad[:6])
                small = p.evaluate(TARGET_JS)
                ok(not small, "targets >= 24px " + tag, small[:6])
                if lang == "hi":
                    body = p.inner_text("main")
                    ok("विभाग" in body and "Departments" not in p.inner_text("h1"), "Hindi page " + tag)
                    leftover = re.findall(r"adm\.dp_\w+", body)
                    ok(not leftover, "no raw keys " + tag, leftover)
                if width == 375:
                    shot(p, "05-" + tag)
                else:
                    shot(p, "06-" + tag, full=False)
                # form too
                p.click("#add-office"); p.click("#o-save"); p.wait_for_selector("#o-summary")
                ok(no_hscroll(p), "form no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS); ok(not bad, "form contrast " + tag, bad[:6])
                if width == 375 or lang == "hi": shot(p, "07-form-" + tag)
                ok(not errs, "no script errors " + tag, errs)
                ctx.close()

    # ---------- data entry operator ----------
    ctx, p, errs = P("deo@test.in")
    p.goto(B + "/admin-departments.html?area=lucknow"); p.wait_for_selector(".office")
    ok("sent as requests" in p.inner_text(".note"), "operator told changes are requests")
    p.click("#add-office")
    ok(p.inner_text("#o-save") == "Send for approval" and p.is_visible("#o-reason"), "operator: Send for approval + reason")
    p.fill("#o-name-en", "KGMU Hospital Helpdesk"); p.check('[data-dept="Health"]'); p.fill("#o-helpline", "0522 2257540"); p.fill("#o-source", "https://www.kgmu.org")
    p.click("#o-save"); p.wait_for_timeout(150)
    ok("reason" in p.inner_text("#o-summary").lower(), "reason required")
    p.fill("#o-reason", "Found on the KGMU website"); save(p, "#o-save")
    ok("sent for approval" in p.inner_text("#top-msg"), "request sent")
    ok("KGMU Hospital Helpdesk" in p.inner_text("main") and p.locator('.office h3:has-text("KGMU")').count() == 0, "waiting note, not yet listed")
    p.click("#add-office"); p.wait_for_selector("#office-form")
    ok(p.inner_text("#nt-open") == "+ Ask for a new type", "operator: Ask for a new type")
    p.click("#nt-open"); p.fill("#nt-en", "Parks"); p.fill("#nt-hi", "उद्यान विभाग")
    p.click("#nt-save"); p.wait_for_timeout(150); ok(p.is_visible("#nt-reason-err"), "operator: reason needed")
    p.fill("#nt-reason", "Many stray cattle complaints"); save(p, "#nt-save")
    ok("sent for approval" in p.inner_text("#nt-msg"), "operator: request sent from the form")
    p.click("#o-cancel")
    c = p.locator('.office:has(h3:has-text("CMO Lucknow"))'); c.locator("[data-retire]").click()
    p.fill("#r-reason", "Number no longer answered, checked twice"); save(p, "#r-go")
    c = p.locator('.office:has(h3:has-text("CMO Lucknow"))')
    ok("Retirement waiting for approval" in c.inner_text() and c.locator("[data-edit]").count() == 0, "pill + no actions while waiting")
    shot(p, "08-operator")
    ok(not errs, "no script errors (operator)", errs)
    ctx.close()

    # ---------- approver sees requests in Change requests (EN + HI) ----------
    for lang in ("hi", "en"):
        ctx, p, errs = P("ops@test.in", lang=lang)
        p.goto(B + "/admin-change-requests.html"); p.wait_for_selector(".req")
        txt = p.inner_text("main")
        ok(("New department office: KGMU Hospital Helpdesk" if lang == "en" else "नया विभाग कार्यालय: KGMU Hospital Helpdesk") in txt, "change request label " + lang, txt[:300])
        ok(("Retire department office: CMO Lucknow" if lang == "en" else "विभाग कार्यालय सेवानिवृत्त करें: CMO Lucknow") in txt, "retire label " + lang)
        shot(p, "09-change-requests-" + lang)
        if lang == "en":
            p.check('.req:has-text("KGMU") .pick'); p.check('.req:has-text("CMO Lucknow") .pick')
            save(p, "button:has-text('Approve selected')")
            p.wait_for_timeout(800)
        ok(not errs, "no script errors (change requests %s)" % lang, errs)
        ctx.close()
    ctx, p, errs = P("ops@test.in")
    p.goto(B + "/admin-departments.html?area=lucknow"); p.wait_for_selector(".office")
    ok(p.locator('.office h3:has-text("KGMU Hospital Helpdesk")').count() == 1, "approved office now listed")
    ok(p.locator('.office h3:has-text("CMO Lucknow")').count() == 0, "approved retirement applied")
    ctx.close()

    # ---------- auditor, moderator ----------
    ctx, p, errs = P("audit@test.in")
    p.goto(B + "/admin-departments.html?area=lucknow"); p.wait_for_selector(".office")
    ok(p.locator("#add-office, [data-edit], [data-retire], #open-upload").count() == 0, "auditor: no change buttons")
    ok("view this page but not change it" in p.inner_text(".note"), "auditor told read-only")
    ctx.close()
    ctx, p, errs = P("mod@test.in")
    p.goto(B + "/admin-departments.html"); p.wait_for_selector("#adm-denied")
    ok("isn't part of your role" in p.inner_text("#adm-denied"), "moderator: denied page")
    ok(p.locator('a[href="/admin-departments.html"]:visible').count() == 0, "moderator: no menu link")
    ctx.close()

    # ---------- other admin page still gets the link ----------
    ctx, p, errs = P("super@test.in")
    p.goto(B + "/admin-areas.html"); p.wait_for_selector("#adm-menu")
    p.click('button[data-key="adm.nav_g_data"]')
    ok(p.is_visible('#adm-drop-data a[href="/admin-departments.html"]'), "link on other admin pages")
    ok(not errs, "no script errors (areas)", errs)
    ctx.close()
    br.close()

print("\n%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
