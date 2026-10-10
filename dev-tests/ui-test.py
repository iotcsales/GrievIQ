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
  function bg(el){ let cur=el; const layers=[]; while(cur && cur.nodeType===1){const c=rgb(getComputedStyle(cur).backgroundColor); if(c&&c.a>0){layers.push(c); if(c.a>=1) break;} cur=cur.parentElement;} let base={r:255,g:255,b:255}; if(!layers.length||layers[layers.length-1].a<1){base=rgb(getComputedStyle(document.querySelector('body')).backgroundColor)||base;} for(let i=layers.length-1;i>=0;i--){const c=layers[i]; base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a)};} return base;}
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

def fill_otp(p):
    # The code boxes move focus as you type; fill until all six hold a digit
    # (a fast fill can land while focus is moving).
    for _ in range(5):
        for i, d in enumerate("123456"):
            box = p.locator(".otp-digit").nth(i)
            if box.input_value() != d: box.fill(d)
        if all(p.locator(".otp-digit").nth(i).input_value() == d for i, d in enumerate("123456")): return
        p.wait_for_timeout(50)

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
        seg = html[html.index('class="followup-dept"'):]
        first_opt = re.findall(r'<option value="([^"]*)">([^<]*)</option>', seg[:seg.index('</select>')])
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


    # ---------- Departments stage 3: department progress, reply, forward, field check (rep console) ----------
    import json as _json
    def steps_case(kind_list, phase, role="REPRESENTATIVE", extra=None):
        st = [{"id": "s%d" % i, "kind": k, "department": "Water Supply", "officeName": "Jal Kal Zone 3", "channel": "PHONE" if k == "FORWARDED" else None,
               "expectedDate": "2026-10-12" if k == "SCHEDULED" else None, "suggestedDepartment": None, "note": None, "actor": "r1@x.in", "actorRole": "REPRESENTATIVE",
               "at": "2026-10-0%dT06:30:00Z" % (i + 1), "photos": [{"url": "/logo-mark.svg", "thumbUrl": "/logo-mark.svg"}] if k.startswith("CHECK_N") else None} for i, k in enumerate(kind_list)]
        c = {"id": "c9", "status": "ACKNOWLEDGED", "suggestedDepartment": "Water Supply", "localUnit": {"id": "u1", "name": "Aishbagh"}, "followupHistory": [], "myRole": role,
             "deptSteps": st, "deptState": dict({"phase": phase, "department": "Water Supply", "officeName": "Jal Kal Zone 3", "days": 7, "dayOf": 3, "overdue": False}, **(extra or {}))}
        return c
    posts = []
    def rep_page(lang="en", theme="light", width=1280):
        ctx = br.new_context(viewport={"width": width, "height": 900})
        ctx.add_init_script("try{localStorage.setItem('griq-theme','%s');localStorage.setItem('%s','%s')}catch(e){}" % (theme, LANGKEY, lang))
        p = ctx.new_page(); errs = []
        p.on("pageerror", lambda e: errs.append(str(e)))
        p.on("dialog", lambda d: d.accept())
        def route(rt):
            u = rt.request.url
            if "/dept-step" in u or "/add-followup" in u:
                posts.append((u.split("/api/")[1], _json.loads(rt.request.post_data or "{}")))
                rt.fulfill(status=200, body='{"ok":true}', headers={"content-type": "application/json"})
            else:
                rt.fulfill(status=401, body='{"error":"SIGNED_OUT"}', headers={"content-type": "application/json"})
        p.route("**/api/**", route)
        p.goto(B + "/rep.html"); p.wait_for_timeout(500)
        # Show the content area and stop the real reload after saving.
        p.evaluate("""() => { window.init = async () => {}; activeTab = 'cases';
          if (!document.getElementById('content')) { const d = document.createElement('div'); d.id = 'content'; document.body.prepend(d); }
          const m = document.getElementById('content'); m.hidden = false; m.style.display = 'block';
          let p = m.parentElement; while (p && p !== document.body) { p.hidden = false; p.style.display = ''; p = p.parentElement; } }""")
        return ctx, p, errs
    def show(p, case):
        p.evaluate("""([dir, c]) => { takeDepartments({ departments: ['Water Supply','Electricity','Health','Other'], deptDirectory: dir }); currentCases = [c];
          const box = document.getElementById('content'); box.innerHTML = '<div id="ds-test" style="max-width:640px;padding:12px">' + renderFollowupControl(c) + renderResolveControl(c) + '<p id="resolve-status" role="status"></p></div>';
          renderContent = () => { const cc = currentCases[0]; document.getElementById('ds-test').innerHTML = renderFollowupControl(cc) + renderResolveControl(cc) + '<p id="resolve-status" role="status"></p>'; attachFollowupHandlers(); attachResolveHandlers(); };
          attachFollowupHandlers(); attachResolveHandlers(); window.scrollTo(0, 0); }""", [DIR, case])
    # With the department, day 3 of 7; reply form
    ctx, p, errs = rep_page()
    show(p, steps_case(["FORWARDED", "SCHEDULED"], "WITH_DEPT", extra={"expectedDate": "2026-10-12"}))
    ok("With Jal Kal Zone 3: day 3 of 7." in p.inner_text("#ds-c9 .ds-status"), "status: day 3 of 7", p.inner_text("#ds-c9"))
    ok("Forwarded to Jal Kal Zone 3 (Phone call)" in p.inner_text("#ds-c9") and "scheduled the work for 12 Oct 2026" in p.inner_text("#ds-c9"), "steps listed")
    p.click(".ds-open"); ok(p.evaluate("document.activeElement.name") == "ds-kind-c9", "reply form opens, focus on the first choice")
    p.click(".ds-save"); ok("Choose what the department said." in p.inner_text("#ds-form-c9"), "reply: choose one")
    p.check('input.ds-kind[value="SCHEDULED"]'); ok(p.is_visible("#ds-date-c9"), "date field for scheduled")
    p.check('input.ds-kind[value="CANT_DO"]'); p.click(".ds-save")
    ok("reason the department gave" in p.inner_text("#ds-form-c9") and p.get_attribute("#ds-note-c9", "aria-invalid") == "true", "can't do needs the reason")
    p.fill("#ds-note-c9", "No budget for new pipeline this year"); p.click(".ds-save"); p.wait_for_timeout(300)
    ok(posts and posts[-1][0] == "grievances/c9/dept-step" and posts[-1][1]["kind"] == "CANT_DO" and "budget" in posts[-1][1]["note"], "reply sent", posts[-1:])
    shot(p, "14-ds-with-dept", full=False)
    # Forward form: office list follows the department, "not in the list" asks for a name, how contacted required
    p.select_option("#followup-dept-c9", "Water Supply")
    opts = p.eval_on_selector_all("#followup-office-c9 option", "els => els.map(e => e.textContent)")
    ok("Jal Kal Zone 3" in opts and "Office not in the list" in opts, "office list for the department", opts)
    p.select_option("#followup-office-c9", "__other"); ok(p.is_visible("#followup-oname-c9"), "office name box for an office not listed")
    p.click(".followup-btn"); p.wait_for_timeout(100)
    ok("Choose how you contacted the office." in p.inner_text("#fwd-form-c9") and "office's name" in p.inner_text("#fwd-form-c9"), "forward: how + name required")
    p.fill("#followup-oname-c9", "Jal Kal sub-division 2"); p.check('input.followup-ch[value="WHATSAPP"]'); p.click(".followup-btn"); p.wait_for_timeout(300)
    ok(posts[-1][0] == "grievances/c9/add-followup" and posts[-1][1]["channel"] == "WHATSAPP" and posts[-1][1]["officeName"] == "Jal Kal sub-division 2", "forward sent with office and channel", posts[-1:])
    ok(not errs, "no script errors (department progress)", errs)
    ctx.close()
    # Overdue and not-ours wording
    ctx, p, errs = rep_page()
    show(p, steps_case(["FORWARDED"], "WITH_DEPT", extra={"overdue": True, "overdueDays": 2}))
    ok("past its target by 2 day(s)" in p.inner_text("#ds-c9 .ds-status.late"), "overdue shown")
    show(p, steps_case(["FORWARDED", "NOT_OURS"], "NEEDS_FORWARD", extra={"suggestedDepartment": "Electricity"}))
    ok("They suggested Electricity" in p.inner_text("#ds-c9") and p.locator(".ds-open").count() == 0, "not ours: forward again, no reply button")
    ctx.close()
    # Field check (all themes/languages/widths): outcome, photos required, send back
    for theme in ("light", "dark"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                tag = "%s-%s-%d" % (theme, lang, width)
                ctx, p, errs = rep_page(lang, theme, width)
                show(p, steps_case(["FORWARDED", "DONE_CLAIMED"], "NEEDS_CHECK", role="FIELD_WORKER"))
                btn = p.locator(".mark-resolved-btn")
                ok(btn.inner_text() == ("Record field check" if lang == "en" else "मौके पर जाँच दर्ज करें"), "field check button " + tag)
                btn.click(); p.wait_for_timeout(100)
                ok(p.locator(".r-outcome").count() == 3 and p.locator(".r-nophoto").count() == 0, "outcome choices, no 'no photo' option " + tag)
                p.fill("#rnote-c9", "Pipe still leaking at the market gate"); p.click(".r-submit"); p.wait_for_timeout(100)
                ok(p.locator("#routcome-err-c9").inner_text() != "", "choose what you found " + tag)
                p.check('input.r-outcome[value="NOT_FIXED"]'); p.wait_for_timeout(100)
                ok(p.inner_text(".r-submit") == ("Send back to the department" if lang == "en" else "विभाग को वापस भेजें"), "button says send back " + tag)
                p.click(".r-submit"); p.wait_for_timeout(100)
                ok(p.get_attribute("#rphoto-c9", "aria-invalid") == "true", "photo required " + tag)
                p.evaluate("() => { drafts['c9'].photos = [{ id: 'ph9', url: '/logo-mark.svg', thumbUrl: '/logo-mark.svg', warnings: [] }]; renderContent(); }")
                p.click(".r-submit"); p.wait_for_timeout(300)
                ok(posts[-1][0] == "grievances/c9/dept-step" and posts[-1][1]["kind"] == "CHECK_NOT_FIXED" and posts[-1][1]["photoIds"] == ["ph9"], "failed check sent " + tag, posts[-1:])
                show(p, steps_case(["FORWARDED", "DONE_CLAIMED", "CHECK_NOT_FIXED"], "WITH_DEPT", extra={"sentBack": True}))
                ok(no_hscroll(p), "no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS.replace("document.body", "document.getElementById('ds-test')", 1))
                ok(not bad, "contrast AA " + tag, bad[:5])
                shot(p, "15-ds-" + tag, full=False)
                ok(not errs, "no script errors (field check) " + tag, errs)
                ctx.close()

    # Track page: the department's steps for the citizen
    for lang in ("en", "hi"):
        ctx = br.new_context(viewport={"width": 390, "height": 900})
        ctx.add_init_script("try{localStorage.setItem('%s','%s')}catch(e){}" % (LANGKEY, lang))
        p = ctx.new_page(); errs = []
        p.on("pageerror", lambda e: errs.append(str(e)))
        case = {"trackingRef": "GRV-TEST02", "description": "Leaking pipe", "localUnitName": "Aishbagh", "createdAt": "2026-10-08T10:00:00Z", "status": "ACKNOWLEDGED",
                "tiers": [{"label": "Corporator", "visible": True, "current": True, "slaBreached": False}], "currentTierIndex": 0, "reopenStatus": {"can": False},
                "currentDepartment": "Water Supply", "followupHistory": [], "deptNames": {},
                "deptSteps": [{"kind": "FORWARDED", "department": "Water Supply", "officeName": "Jal Kal Zone 3", "at": "2026-10-08T11:00:00Z"},
                              {"kind": "DONE_CLAIMED", "department": "Water Supply", "officeName": "Jal Kal Zone 3", "at": "2026-10-09T11:00:00Z"},
                              {"kind": "CHECK_NOT_FIXED", "department": "Water Supply", "officeName": "Jal Kal Zone 3", "at": "2026-10-09T15:00:00Z"}]}
        def make_troute(case):
          def troute(rt):
            u = rt.request.url
            if u.endswith("/api/otp/request"): rt.fulfill(status=200, body='{"ok":true}', headers={"content-type": "application/json"})
            elif u.endswith("/api/otp/verify"): rt.fulfill(status=200, body=_json.dumps({"reports": [{"trackingRef": "GRV-TEST02", "status": "ACKNOWLEDGED"}], "case": case}), headers={"content-type": "application/json"})
            else: rt.fulfill(status=404, body='{}', headers={"content-type": "application/json"})
          return troute
        p.route("**/api/**", make_troute(case))
        p.goto(B + "/status.html?ref=GRV-TEST02"); p.wait_for_timeout(400)
        p.fill("#email", "c@x.in"); p.click("#entry-submit"); p.wait_for_selector(".otp-digit")
        fill_otp(p)
        p.click("#otp-submit"); p.wait_for_selector(".ds-list")
        txt = p.inner_text("#status-followup")
        if lang == "en":
            ok("forwarded it to Jal Kal Zone 3" in txt and "reported the work done" in txt and "not fixed yet. Sent back to Jal Kal Zone 3" in txt, "Track: steps in plain words", txt)
        else:
            ok("Jal Kal Zone 3 को भेजा" in txt and "वापस भेजा गया" in txt, "Track: steps in Hindi", txt)
        ok("r1@x.in" not in txt, "Track: no staff names")
        ok(no_hscroll(p), "Track: no sideways scroll " + lang)
        bad = p.evaluate(CONTRAST_JS.replace("document.body", "document.getElementById('status-followup')", 1))
        ok(not bad, "Track contrast " + lang, bad[:4])
        p.locator("#status-followup").screenshot(path=os.path.join(SHOTS, "16-track-" + lang + ".png"))
        ok(not errs, "no script errors (Track) " + lang, errs)
        ctx.close()

    # ---------- Citizen ratings (grieviq-30) ----------
    import json as _json2
    # Track page: the rating card (mocked server), every theme/language, phone and laptop
    def rated_case(rating=None, status=None):
        return {"trackingRef": "GRV-TEST02", "description": "Leaking pipe", "localUnitName": "Aishbagh", "createdAt": "2026-10-08T10:00:00Z", "status": "RESOLVED",
                "resolutionKind": "CONFIRMED", "tiers": [{"label": "Corporator", "visible": True, "current": True, "slaBreached": False}], "currentTierIndex": 0,
                "reopenStatus": {"can": True, "code": "OK", "until": "2026-11-08T10:00:00Z"}, "followupHistory": [], "deptNames": {"Electricity": {"en": "Electricity", "hi": "विद्युत विभाग"}}, "deptSteps": [],
                "rating": rating, "ratingStatus": status or {"can": True, "code": "OK", "until": "2026-11-08T10:00:00Z", "mode": "NEW"},
                "ratingDept": {"key": "Electricity", "officeName": "MVVNL sub-station Hazratganj"}}
    for theme in ("light", "dark"):
        for lang in ("en", "hi"):
            for width in (375, 1280):
                if width == 1280 and (theme, lang) != ("light", "en"): continue
                tag = "%s-%s-%d" % (theme, lang, width)
                ctx = br.new_context(viewport={"width": width, "height": 900}, color_scheme=theme)
                ctx.add_init_script("try{localStorage.setItem('%s','%s')}catch(e){}" % (LANGKEY, lang))
                p = ctx.new_page(); errs = []; sent = []
                p.on("pageerror", lambda e: errs.append(str(e)))
                case = rated_case()
                def make_r(case, sent):
                    def r(rt):
                        u = rt.request.url
                        if u.endswith("/api/otp/request"): rt.fulfill(status=200, body='{"ok":true}', headers={"content-type": "application/json"})
                        elif u.endswith("/api/otp/verify"): rt.fulfill(status=200, body=_json2.dumps({"reports": [{"trackingRef": "GRV-TEST02", "status": "RESOLVED"}], "case": case}), headers={"content-type": "application/json"})
                        elif u.endswith("/api/grievances/rate"):
                            b = _json2.loads(rt.request.post_data or "{}"); sent.append(b)
                            rt.fulfill(status=200, body=_json2.dumps({"ok": True, "rating": {"office": b["office"], "dept": b.get("dept"), "department": "Electricity", "comment": b.get("comment") or "", "submittedAt": "2026-10-09T10:00:00Z", "updatedAt": "2026-10-09T10:00:00Z"},
                                "ratingStatus": {"can": True, "code": "OK", "until": "2026-10-16T10:00:00Z", "mode": "EDIT"}}), headers={"content-type": "application/json"})
                        else: rt.fulfill(status=404, body='{}', headers={"content-type": "application/json"})
                    return r
                p.route("**/api/**", make_r(case, sent))
                p.goto(B + "/status.html?ref=GRV-TEST02"); p.wait_for_timeout(300)
                p.fill("#email", "c@x.in"); p.click("#entry-submit"); p.wait_for_selector(".otp-digit")
                fill_otp(p)
                p.click("#otp-submit"); p.wait_for_selector("#rate-card:not([hidden])")
                card = p.locator("#rate-card")
                ok(p.locator("input[name=rate-office]").count() == 5 and p.locator("input[name=rate-dept]").count() == 5, "five answers for each question " + tag)
                txt = card.inner_text()
                if lang == "en":
                    ok("How did we do?" in txt and "Neither satisfied nor dissatisfied" in txt and "MVVNL sub-station Hazratganj" in txt and "never shown publicly" in txt, "card wording " + tag, txt[:300])
                else:
                    ok("आपका अनुभव कैसा रहा?" in txt and "न संतुष्ट, न असंतुष्ट" in txt and "सार्वजनिक" in txt, "card in Hindi " + tag, txt[:300])
                    ok(not re.findall(r"status\.rate_\w+", txt), "no raw keys " + tag)
                ok(no_hscroll(p), "rating card: no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS.replace("document.body", "document.getElementById('rate-card')", 1))
                ok(not bad, "rating card contrast AA " + tag, bad[:5])
                small = p.evaluate("() => Array.from(document.querySelectorAll('#rate-card .rate-opt, #rate-card button')).filter(e => e.getBoundingClientRect().height < 44).length")
                ok(small == 0, "answers and buttons at least 44px tall " + tag)
                card.screenshot(path=os.path.join(SHOTS, "20-rate-form-" + tag + ".png"))
                # nothing chosen
                p.click("#rate-send"); p.wait_for_timeout(100)
                ok(p.get_attribute("#rate-q-office", "aria-invalid") == "true" and p.inner_text("#rate-office-err") != "" and p.evaluate("document.activeElement.name") == "rate-office", "first question required, focus moves to it " + tag)
                ok(not sent, "nothing sent with an error " + tag)
                p.check("input[name=rate-office][value=DISSATISFIED]")
                ok(p.inner_text("#rate-office-err") == "", "error clears on choosing " + tag)
                p.check("input[name=rate-dept][value=SATISFIED]")
                p.fill("#rate-comment", "Took two visits")
                if width == 375 and theme == "light":
                    # a language switch keeps what was chosen
                    p.evaluate("() => GIQ.setLang(GIQ.lang === 'hi' ? 'en' : 'hi')"); p.wait_for_timeout(150)
                    ok(p.is_checked("input[name=rate-office][value=DISSATISFIED]") and p.input_value("#rate-comment") == "Took two visits", "language switch keeps the answers " + tag)
                    p.evaluate("() => GIQ.setLang(GIQ.lang === 'hi' ? 'en' : 'hi')"); p.wait_for_timeout(150)
                p.click("#rate-send"); p.wait_for_selector("#rate-msg")
                ok(sent and sent[-1]["office"] == "DISSATISFIED" and sent[-1]["dept"] == "SATISFIED" and sent[-1]["comment"] == "Took two visits" and sent[-1]["trackingRef"] == "GRV-TEST02", "rating sent " + tag, sent[-1:])
                ok(p.evaluate("document.activeElement.id") == "rate-msg", "thank-you focused " + tag)
                t2 = card.inner_text()
                ok(("Dissatisfied" in t2 and "16 October 2026" in t2) if lang == "en" else ("असंतुष्ट" in t2), "summary with change-until date " + tag, t2[:300])
                bad = p.evaluate(CONTRAST_JS.replace("document.body", "document.getElementById('rate-card')", 1))
                ok(not bad, "thank-you contrast AA " + tag, bad[:5])
                card.screenshot(path=os.path.join(SHOTS, "21-rate-thanks-" + tag + ".png"))
                p.click("#rate-change"); p.wait_for_timeout(100)
                ok(p.is_checked("input[name=rate-office][value=DISSATISFIED]") and p.input_value("#rate-comment") == "Took two visits", "change: form filled in " + tag)
                p.click("#rate-skip"); p.wait_for_timeout(100)
                ok(p.locator("#rate-change").count() == 1, "cancel goes back to the summary " + tag)
                ok(not errs, "no script errors (rating card) " + tag, errs)
                ctx.close()
    # Not now hides it; locked rating shows without a change button; an open case shows nothing
    for case, check in ((rated_case(), "skip"), (rated_case({"office": "SATISFIED", "dept": None, "department": None, "comment": "", "submittedAt": "2026-09-01T10:00:00Z", "updatedAt": "2026-09-01T10:00:00Z"}, {"can": False, "code": "LOCKED", "until": None, "mode": None}), "locked"),
                        (dict(rated_case(), status="ACKNOWLEDGED", resolutionKind=None), "open")):
        ctx = br.new_context(viewport={"width": 390, "height": 900})
        p = ctx.new_page(); errs = []; sent = []
        p.on("pageerror", lambda e: errs.append(str(e)))
        p.route("**/api/**", make_r(case, sent))
        p.goto(B + "/status.html?ref=GRV-TEST02"); p.wait_for_timeout(300)
        p.fill("#email", "c@x.in"); p.click("#entry-submit"); p.wait_for_selector(".otp-digit")
        fill_otp(p)
        p.click("#otp-submit"); p.wait_for_selector("#status-ref"); p.wait_for_timeout(300)
        if check == "skip":
            p.click("#rate-skip"); p.wait_for_timeout(100)
            ok(p.is_hidden("#rate-card"), "Not now hides the card")
        elif check == "locked":
            ok(p.is_visible("#rate-card") and p.locator("#rate-change").count() == 0 and "time to change this rating has ended" in p.inner_text("#rate-card"), "locked rating: shown, no change button", p.inner_text("#rate-card"))
        else:
            ok(p.is_hidden("#rate-card"), "open case: no rating card")
        ok(not errs, "no script errors (" + check + ")", errs)
        ctx.close()

    # Rep console: the citizen's rating on a case, and the overview tile
    for theme in ("light", "dark"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                tag = "%s-%s-%d" % (theme, lang, width)
                ctx, p, errs = rep_page(lang, theme, width)
                p.evaluate("""() => { GIQ.addDepts({ Electricity: { en: 'Electricity', hi: 'विद्युत विभाग' } });
                  const c = { id: 'c1', rating: { office: 'SATISFIED', dept: 'VERY_DISSATISFIED', department: 'Electricity', comment: 'Road <b>left</b> dug up', submittedAt: '2026-10-09T05:00:00Z', updatedAt: '2026-10-10T05:00:00Z', changed: true } };
                  const few = { count: 3, needed: 5, average: null, word: null, byAnswer: { VERY_SATISFIED: 1, SATISFIED: 1, NEITHER: 0, DISSATISFIED: 1, VERY_DISSATISFIED: 0 } };
                  const many = { count: 23, needed: 5, average: 4.2, word: 'SATISFIED', byAnswer: { VERY_SATISFIED: 9, SATISFIED: 10, NEITHER: 2, DISSATISFIED: 1, VERY_DISSATISFIED: 1 } };
                  document.getElementById('content').innerHTML = '<div id="rt-test" style="max-width:720px;padding:12px">' + renderCitizenRating(c) + '<div id="rt-few">' + renderOvRatings(few) + '</div><div id="rt-many">' + renderOvRatings(many) + '</div></div>'; }""")
                txt = p.inner_text("#rt-test")
                if lang == "en":
                    ok("Citizen's rating" in txt and "Your office: Satisfied" in txt and "Electricity: Very dissatisfied" in txt and "changed by the citizen" in txt and "Only the representative and office managers" in txt, "rep: rating note " + tag, txt[:400])
                    ok("Not enough ratings yet" in p.inner_text("#rt-few") and "3 of 5" in p.inner_text("#rt-few"), "rep: no average below 5 " + tag)
                    ok("Satisfied" in p.inner_text("#rt-many .ov-rate") and "4.2 out of 5" in p.inner_text("#rt-many") and "23 ratings" in p.inner_text("#rt-many"), "rep: average shown in words and number " + tag)
                else:
                    ok("नागरिक की रेटिंग" in txt and "बहुत असंतुष्ट" in txt and "विद्युत विभाग" in txt, "rep: rating note in Hindi " + tag, txt[:300])
                    ok(not re.findall(r"rep\.(rate|ov_rate)\w*", txt), "no raw keys " + tag)
                ok(p.locator("#rt-test b").count() == 0, "comment is escaped " + tag)
                ok(no_hscroll(p), "rep rating: no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS.replace("document.body", "document.getElementById('rt-test')", 1))
                ok(not bad, "rep rating contrast AA " + tag, bad[:5])
                shot(p, "22-rep-rating-" + tag, full=False)
                ok(not errs, "no script errors (rep rating) " + tag, errs)
                ctx.close()

    # Admin: Ratings page, dashboard card, case panel (real server)
    import sqlite3 as _sq
    _db = _sq.connect(os.environ.get("GRIEVIQ_TEST_DIR", "/tmp/grieviq-tests") + "/test.db", timeout=10)
    _now = __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
    for i, (o, d, cm) in enumerate(((1, 2, "Nobody came for two weeks and the road is still dug up"), (2, None, None))):
        gid = "glow%d" % i
        _db.execute("INSERT INTO grievances (id, tracking_ref, citizen_phone, local_unit_id, category_id, status, description, current_tier, created_at, resolved_at, closed_at) VALUES (?, ?, '9', 'lu-hazratganj', 'water-sanitation', 'RESOLVED', 'x', 'LOCAL', ?, ?, ?)", (gid, "GRV-LOW%d" % i, _now, _now, _now))
        _db.execute("INSERT INTO case_ratings (id, grievance_id, office_score, dept_score, department, office_tier, office_id, comment, low, submitted_at, updated_at, round_closed_at) VALUES (?, ?, ?, ?, ?, 'LOCAL', 'lu-hazratganj', ?, 1, ?, ?, ?)",
                    ("crl%d" % i, gid, o, d, "Electricity" if d else None, cm, _now, _now, _now))
    _db.commit(); _db.close()
    for theme in (None, "light"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                tag = "%s-%s-%d" % (theme or "dark", lang, width)
                ctx, p, errs = P("super@test.in", width=width, theme=theme, lang=lang)
                p.goto(B + "/admin-ratings.html"); p.wait_for_selector("article.fb")
                ok(p.locator("article.fb").count() == 2, "two low ratings waiting " + tag)
                body = p.inner_text("main")
                if lang == "en":
                    ok("Waiting for follow-up (2)" in body and "Very dissatisfied" in body and "Hazratganj-Ramtirth" in body and "Not enough ratings yet" in body, "ratings page wording " + tag, body[:500])
                else:
                    ok("नागरिकों की रेटिंग" in body and "बहुत असंतुष्ट" in body, "ratings page in Hindi " + tag)
                    ok(not re.findall(r"adm\.cr_\w+", body), "no raw keys " + tag)
                ok(no_hscroll(p), "ratings page: no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS); ok(not bad, "ratings page contrast AA " + tag, bad[:6])
                small = p.evaluate(TARGET_JS); ok(not small, "ratings page targets >= 24px " + tag, small[:6])
                shot(p, "23-admin-ratings-" + tag, full=(width == 375))
                ok(not errs, "no script errors (ratings page) " + tag, errs)
                ctx.close()
    ctx, p, errs = P("super@test.in")
    p.goto(B + "/admin-ratings.html"); p.wait_for_selector("form.rt-follow")
    first = p.locator("form.rt-follow").first
    first.locator("button").click(); p.wait_for_timeout(150)
    ta = p.locator("form.rt-follow textarea").first
    ok(ta.get_attribute("aria-invalid") == "true" and p.evaluate("document.activeElement.tagName") == "TEXTAREA", "follow-up needs a note; focus on it")
    ta.fill("Called the office manager; repair booked for Monday")
    with p.expect_response(lambda r: r.request.method == "POST"): p.locator("form.rt-follow button").first.click()
    p.wait_for_selector("#top-msg")
    ok("Marked followed up." in p.inner_text("#top-msg") and p.locator("article.fb").count() == 1, "followed up: leaves the waiting list")
    p.click("[data-tab=DONE]"); p.wait_for_selector(".rt-done")
    ok("Called the office manager" in p.inner_text(".rt-done") and "super@test.in" in p.inner_text(".rt-done"), "followed-up tab shows what was done and who")
    p.goto(B + "/admin-dashboard.html"); p.wait_for_timeout(800)
    ok("Low ratings to follow up" in p.inner_text("main"), "dashboard card for low ratings")
    p.goto(B + "/admin-cases.html?case=glow0"); p.wait_for_selector("text=Nobody came for two weeks")
    mt = p.inner_text("main")
    ok("Citizen's rating" in mt and "Very dissatisfied" in mt and ("Low rating: waiting for follow-up." in mt or "By super@test.in" in mt), "admin case page: ratings panel", mt[-600:])
    shot(p, "24-admin-case-rating", full=True)
    ok(not errs, "no script errors (admin follow-up)", errs)
    ctx.close()
    ctx, p, errs = P("audit@test.in")
    p.goto(B + "/admin-ratings.html"); p.wait_for_selector("article.fb, .empty")
    ok(p.locator("form.rt-follow").count() == 0, "auditor: no follow-up form")
    ctx.close()
    ctx, p, errs = P("deo@test.in")
    p.goto(B + "/admin-dashboard.html"); p.wait_for_timeout(800)
    ok(p.locator('a[href*="admin-ratings"]:visible').count() == 0, "data entry operator: no Ratings link")
    ctx.close()

    # ---------- Charts (grieviq-31) ----------
    TREND = [{"month": "2025-%02d" % m if m <= 12 else "2026-%02d" % (m - 12), "received": r, "resolved": v} for m, r, v in
             zip(range(11, 23), [3, 5, 8, 6, 12, 9, 14, 11, 7, 10, 16, 4], [1, 4, 6, 7, 9, 10, 11, 12, 8, 9, 13, 2])]
    for theme in ("light", "dark"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                tag = "%s-%s-%d" % (theme, lang, width)
                ctx, p, errs = rep_page(lang, theme, width)
                p.evaluate("""(trend) => {
                  const d = { groupBy: 'ward', trend, total: { pending: 31, ages: [9, 12, 7, 3] },
                    rows: [{ id: 'w1', name: 'Aishbagh', overdue: 4 }, { id: 'w2', name: 'Hazratganj-Ramtirth', overdue: 9 }, { id: 'w3', name: 'Gomti Nagar', overdue: 0 }]
                      .concat(Array.from({ length: 11 }, (x, i) => ({ id: 'x' + i, name: 'Ward ' + (i + 10), overdue: 1 }))) };
                  document.getElementById('content').innerHTML = '<div id="ch-test" style="max-width:820px;padding:12px">' + renderOvTrend(trend) + renderOvCharts(d) + '</div>';
                  GIQC.attach(document.getElementById('content'), chartText()); }""", TREND)
                txt = p.inner_text("#ch-test")
                if lang == "en":
                    ok("How long pending cases have waited" in txt and "31 cases are pending now; 3 of them for over 90 days." in txt and re.search(r"Over 90 days:\s*3", txt), "rep: age bar with counts " + tag, txt[:900])
                    ok("Most overdue: Hazratganj-Ramtirth (9)." in txt and "Showing the 10 highest of 13" in txt, "rep: overdue bars sorted, top 10 " + tag, txt[-600:])
                else:
                    ok("लंबित मामले कितने समय से रुके हैं" in txt and "90 दिन से अधिक" in txt, "rep: charts in Hindi " + tag, txt[:300])
                    ok(not re.findall(r"chart\.\w+", txt), "no raw keys " + tag)
                names = p.eval_on_selector_all("#ch-test .gc-bar .gc-name", "els => els.map(e => e.textContent)")
                ok(names[:2] == ["Hazratganj-Ramtirth", "Aishbagh"] and len(names) == 10, "bars largest first, 10 shown " + tag, names)
                ok(no_hscroll(p), "charts: no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS.replace("document.body", "document.getElementById('ch-test')", 1))
                ok(not bad, "charts text contrast AA " + tag, bad[:5])
                # marks: lines and bars 3:1 against the card
                marks = p.evaluate("""() => { function rgb(s){const m=s.match(/\\d+(\\.\\d+)?/g).map(Number);return m;} function L(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]);}
                  const card = rgb(getComputedStyle(document.querySelector('.gc-box')).backgroundColor);
                  const cols = [getComputedStyle(document.querySelector('.gc-path.s1')).stroke, getComputedStyle(document.querySelector('.gc-path.s2')).stroke, getComputedStyle(document.querySelector('.gc-fill')).backgroundColor];
                  return cols.map(c => { const a=L(rgb(c)), b=L(card); return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05); }); }""")
                ok(all(m >= 3 for m in marks), "lines and bars 3:1 against the chart " + tag, marks)
                # keyboard: focus the line chart and move with arrows
                p.focus("#ov-trend"); p.wait_for_timeout(50)
                tip1 = p.inner_text("#ov-trend .gc-tip")
                p.keyboard.press("ArrowLeft"); p.wait_for_timeout(50)
                tip2 = p.inner_text("#ov-trend .gc-tip"); live = p.inner_text("#ov-trend .gc-sr")
                ok(p.is_visible("#ov-trend .gc-tip") and tip1 != tip2 and "16" in tip2 and "16" in live, "line chart readable with arrow keys " + tag, [tip1, tip2, live])
                p.keyboard.press("Home"); p.wait_for_timeout(50)
                ok(("2025" in p.inner_text("#ov-trend .gc-tip")), "Home goes to the first month " + tag)
                p.click("#ch-test details.gc-more >> nth=1"); p.wait_for_timeout(50)
                ok(p.locator("#ch-test details.gc-more[open] table").count() >= 1, "Show as table opens the numbers " + tag)
                small = p.evaluate("() => Array.from(document.querySelectorAll('#ch-test summary')).filter(e => e.getBoundingClientRect().height < 24).length")
                ok(small == 0, "table toggles at least 24px " + tag)
                shot(p, "25-rep-charts-" + tag, full=True)
                ok(not errs, "no script errors (rep charts) " + tag, errs)
                ctx.close()
    for theme in (None, "light"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                tag = "%s-%s-%d" % (theme or "dark", lang, width)
                ctx, p, errs = P("super@test.in", width=width, theme=theme, lang=lang)
                p.goto(B + "/admin-dashboard.html"); p.wait_for_selector("#stats-area .st-tiles")
                body = p.inner_text("#stats-area")
                if lang == "en":
                    ok("How complaints are moving" in body and "Received this month" in body and "Last 12 months" in body and "How long pending cases have waited" in body, "admin charts section " + tag, body[:300])
                else:
                    ok("शिकायतों की प्रगति" in body and "इस महीने प्राप्त" in body, "admin charts in Hindi " + tag, body[:300])
                    ok(not re.findall(r"(adm\.cm_|chart\.)\w+", body), "no raw keys " + tag)
                ok(no_hscroll(p), "admin charts: no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS.replace("document.body", "document.getElementById('stats-area')", 1))
                ok(not bad, "admin charts contrast AA " + tag, bad[:5])
                small = p.evaluate("() => Array.from(document.querySelectorAll('#stats-area summary, #stats-area select')).filter(e => e.getBoundingClientRect().height < 24).length")
                ok(small == 0, "admin chart controls >= 24px " + tag)
                p.locator("#stats-area").screenshot(path=os.path.join(SHOTS, "26-admin-charts-" + tag + ".png"))
                ok(not errs, "no script errors (admin charts) " + tag, errs)
                ctx.close()
    ctx, p, errs = P("super@test.in")
    p.goto(B + "/admin-dashboard.html"); p.wait_for_selector("#st-area")
    with p.expect_response(lambda r: "case-stats?area=kanpur" in r.url): p.select_option("#st-area", "kanpur")
    p.wait_for_timeout(200)
    ok(p.input_value("#st-area") == "kanpur" and p.evaluate("document.activeElement.id") == "st-area", "area filter reloads and keeps focus")
    p.focus("#st-trend"); p.keyboard.press("ArrowLeft"); p.wait_for_timeout(50)
    ok(p.is_visible("#st-trend .gc-tip"), "admin line chart works with the keyboard")
    ok(not errs, "no script errors (admin area filter)", errs)
    ctx.close()

    # ---------- Department dashboard (grieviq-32) ----------
    import hashlib as _hl
    WORK = os.environ.get("GRIEVIQ_TEST_DIR", "/tmp/grieviq-tests")
    def last_code(email):
        for line in reversed(open(WORK + "/mail.log", encoding="utf-8").read().strip().split("\n")):
            if not line: continue
            m = _json.loads(line)
            if m.get("to") and m["to"][0] == email:
                return re.search(r"(\d{6})", m["subject"]).group(1)
        return None
    # 1. Real sign-in with the emailed code (the phone shares its location: 50 km away)
    ctx = br.new_context(viewport={"width": 390, "height": 900}, permissions=["geolocation"], geolocation={"latitude": 26.4499, "longitude": 80.3318, "accuracy": 14})
    p = ctx.new_page(); errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(B + "/dept"); p.wait_for_selector("#email")
    p.click("#send"); p.wait_for_timeout(100)
    ok(p.get_attribute("#email", "aria-invalid") == "true" and p.inner_text("#email-err") != "", "dept sign-in: email checked")
    p.fill("#email", "ae.zone3@nic.in"); p.click("#send"); p.wait_for_selector("#code")
    ok(p.evaluate("document.activeElement.id") == "code", "code box focused")
    p.fill("#code", "000000"); p.click("#verify"); p.wait_for_timeout(300)
    ok("isn't right" in p.inner_text("#code-err") or "expired" in p.inner_text("#code-err"), "wrong code message", p.inner_text("#code-err"))
    p.fill("#code", last_code("ae.zone3@nic.in")); p.click("#verify"); p.wait_for_selector(".tiles")
    ok("Ravi Kumar" in p.inner_text("#who") and "Jal Kal Vibhag Lucknow" in p.inner_text("#who"), "signed in: name and office shown")
    ok(p.locator('[data-open="g21"]').count() == 1, "new case listed")
    ok("Your office's performance" in p.inner_text("main") and "First reply" in p.inner_text("main"), "officer: own office's performance shown")
    p.click('[data-open="g21"]'); p.wait_for_selector("#case-h")
    body = p.inner_text("main")
    ok("Second leak" in body and "9876500000" not in body and "citizen" in body.lower(), "case: complaint shown, no phone", body[:300])
    p.click("#r-send"); p.wait_for_timeout(100)
    ok(p.inner_text("#kind-err") != "", "reply: choose the position")
    p.check('input[name=kind][value=SCHEDULED]'); p.wait_for_selector("#r-date")
    p.click("#r-send"); p.wait_for_timeout(100)
    ok(p.get_attribute("#r-date", "aria-invalid") == "true", "reply: date needed")
    import datetime as _dt
    p.fill("#r-date", (_dt.date.today() + _dt.timedelta(days=3)).isoformat()); p.fill("#r-note", "Team visiting Thursday")
    with p.expect_response(lambda r: "/api/dept/reply" in r.url): p.click("#r-send")
    p.wait_for_selector("#msg")
    ok("work is scheduled" in p.inner_text("#msg") and "scheduled the work" in p.inner_text("main"), "reply sent and shown in the history", p.inner_text("#msg"))
    # work done with a photo
    p.check('input[name=kind][value=DONE_CLAIMED]'); p.wait_for_selector("#r-photo")
    png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) + bytes(range(40))
    with p.expect_response(lambda r: "/api/dept/photo" in r.url): p.set_input_files("#r-photo", files=[{"name": "work.png", "mimeType": "image/png", "buffer": png}])
    p.wait_for_selector("[data-rm-photo]")
    ok(p.locator("[data-rm-photo]").count() == 1, "work photo added")
    chk = p.inner_text(".photo-item .ev-list")
    ok("You added this photo about" in chk and "km" in chk and "No date in photo" in chk, "officer sees the checks under the photo (grieviq-34)", chk)
    ok("Your location: shared" in p.inner_text("#r-loc"), "officer's location line", p.inner_text("#r-loc"))
    with p.expect_response(lambda r: "/api/dept/reply" in r.url): p.click("#r-send")
    p.wait_for_selector("#msg:has-text('check it on site')")
    ok("check it on site" in p.inner_text("#msg"), "work done sent", p.inner_text("#msg"))
    p.click("#back"); p.wait_for_selector(".tiles")
    ok("Waiting for check" in p.inner_text('li:has([data-open="g21"])'), "list shows waiting for the check")
    p.click("#sign-out"); p.wait_for_selector("#email")
    ok("signed out" in p.inner_text("#msg"), "signed out")
    ok(not errs, "no script errors (dept sign-in flow)", errs)
    ctx.close()
    # 2. Every theme, language and width (session made directly, to stay under the code limit)
    def dept_signin(ctx):
        # A code made directly in the database (the 3-codes-per-15-minutes limit
        # applies to asking for codes, not to signing in), then the real sign-in.
        code = "135790"
        d = _sq.connect(WORK + "/test.db", timeout=10)
        d.execute("INSERT INTO dept_codes (id, email, code_hash, expires_at, created_at) VALUES (?, 'ae.zone3@nic.in', ?, ?, ?)",
                  ("ui-" + str(_dt.datetime.utcnow().timestamp()), _hl.sha256(("ae.zone3@nic.in:" + code).encode()).hexdigest(),
                   (_dt.datetime.utcnow() + _dt.timedelta(minutes=10)).isoformat() + "Z", (_dt.datetime.utcnow() + _dt.timedelta(seconds=5)).isoformat() + "Z"))
        d.commit(); d.close()
        r = ctx.request.post(B + "/api/dept/verify", data={"email": "ae.zone3@nic.in", "code": code})
        return r.status
    for theme in ("light", "dark"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                tag = "%s-%s-%d" % (theme, lang, width)
                ctx = br.new_context(viewport={"width": width, "height": 900}, color_scheme=theme)
                ok(dept_signin(ctx) == 200, "signed in " + tag)
                ctx.add_init_script("try{localStorage.setItem('%s','%s')}catch(e){}" % (LANGKEY, lang))
                p = ctx.new_page(); errs = []
                p.on("pageerror", lambda e: errs.append(str(e)))
                p.goto(B + "/dept"); p.wait_for_selector(".tiles")
                txt = p.inner_text("main")
                if lang == "hi":
                    ok("आपके कार्यालय को भेजी गई शिकायतें" in txt and not re.findall(r"dd\.\w+", txt), "dept list in Hindi " + tag, txt[:200])
                ok(no_hscroll(p), "dept list: no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS); ok(not bad, "dept list contrast AA " + tag, bad[:5])
                small = p.evaluate(TARGET_JS); ok(not small, "dept list targets >= 24px " + tag, small[:5])
                shot(p, "27-dept-list-" + tag, full=(width == 375))
                p.click('[data-open="g20"]'); p.wait_for_selector("#case-h")
                ok(no_hscroll(p), "dept case: no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS); ok(not bad, "dept case contrast AA " + tag, bad[:5])
                p.goto(B + "/dept#case=g21"); p.wait_for_selector("#case-h")
                if p.locator("input[name=kind]").count():
                    p.check('input[name=kind][value=CANT_DO]'); p.wait_for_selector("#r-note")
                    p.click("#r-send"); p.wait_for_timeout(100)
                    bad = p.evaluate(CONTRAST_JS); ok(not bad, "dept reply form contrast AA " + tag, bad[:5])
                    small = p.evaluate(TARGET_JS); ok(not small, "dept reply targets >= 24px " + tag, small[:5])
                shot(p, "28-dept-case-" + tag, full=True)
                ok(not errs, "no script errors (dept) " + tag, errs)
                ctx.close()
    # 3. Admin: officers panel
    for theme in (None, "light"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                tag = "%s-%s-%d" % (theme or "dark", lang, width)
                ctx, p, errs = P("super@test.in", width=width, theme=theme, lang=lang)
                p.goto(B + "/admin-departments.html?area=lucknow"); p.wait_for_selector(".office")
                btn = p.locator("article:has-text('Jal Kal Vibhag Lucknow') [data-officers]")
                btn.click(); p.wait_for_selector(".op h5")
                ok(btn.get_attribute("aria-expanded") == "true", "officers panel opens " + tag)
                ptxt = p.inner_text(".op")
                if lang == "en":
                    ok("Signed on" in ptxt and "Ravi Kumar" in ptxt and "Asha Verma" in ptxt and "Removed" in ptxt, "panel: agreement and officers " + tag, ptxt[:400])
                else:
                    ok("GrievIQ के साथ समझौता" in ptxt and not re.findall(r"adm\.do_\w+", ptxt), "panel in Hindi " + tag)
                ok(no_hscroll(p), "officers panel: no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS.replace("createTreeWalker(document.body", "createTreeWalker(document.querySelector('.op')", 1)); ok(not bad, "officers panel contrast AA " + tag, bad[:5])
                p.locator(".op").screenshot(path=os.path.join(SHOTS, "29-admin-officers-" + tag + ".png"))
                ok(not errs, "no script errors (officers panel) " + tag, errs)
                ctx.close()
    ctx, p, errs = P("super@test.in")
    p.goto(B + "/admin-departments.html?area=lucknow"); p.wait_for_selector(".office")
    p.locator("article:has-text('Lucknow Nagar Nigam Control Room') [data-officers]").first.click(); p.wait_for_selector("#op-agr-form")
    p.click("#op-agr-save"); p.wait_for_timeout(300)
    ok(p.get_attribute("#op-signed-on", "aria-invalid") == "true" and p.evaluate("document.activeElement.id") == "op-signed-on", "agreement form: errors next to fields, focus on the first")
    p.fill("#op-signed-on", "2026-10-05"); p.fill("#op-signed-by", "S. Mishra, Additional Municipal Commissioner"); p.fill("#op-doc", "LMC/IT/2026/88")
    with p.expect_response(lambda r: "dept-officers" in r.url and r.request.method == "POST"): p.click("#op-agr-save")
    p.wait_for_selector("#op-add-form")
    p.fill("#op-name", "Neha Gupta"); p.fill("#op-desig", "Zonal Officer, Zone 1"); p.fill("#op-email", "zo1.lmc@nic.in")
    with p.expect_response(lambda r: "dept-officers" in r.url and r.request.method == "POST"): p.click("#op-add-go")
    p.wait_for_selector("#op-msg")
    ok("Neha Gupta added" in p.inner_text("#op-msg") and "zo1.lmc@nic.in" in p.inner_text(".op"), "officer added from the page")
    p.locator("[data-op-remove]").first.click(); p.wait_for_selector("#op-rm-reason")
    p.click("#op-rm-go"); p.wait_for_timeout(100)
    ok(p.get_attribute("#op-rm-reason", "aria-invalid") == "true", "removal needs a reason")
    p.fill("#op-rm-reason", "Left the zonal office")
    with p.expect_response(lambda r: "dept-officers" in r.url and r.request.method == "POST"): p.click("#op-rm-go")
    p.wait_for_selector("#op-msg")
    ok("removed and signed out" in p.inner_text("#op-msg"), "officer removed from the page")
    ok(not errs, "no script errors (officers add/remove)", errs)
    ctx.close()
    ctx, p, errs = P("audit@test.in")
    p.goto(B + "/admin-departments.html?area=lucknow"); p.wait_for_selector(".office")
    p.locator("article:has-text('Jal Kal Vibhag Lucknow') [data-officers]").click(); p.wait_for_selector(".op h5")
    ok(p.locator("#op-add-form, [data-op-remove], #op-agr-open").count() == 0, "auditor: officers panel read only")
    ctx.close()
    ctx, p, errs = P("deo@test.in")
    p.goto(B + "/admin-departments.html?area=lucknow"); p.wait_for_selector(".office")
    ok(p.locator("[data-officers]").count() == 0, "data entry operator: no officers button")
    ctx.close()
    # 4. Rep console: who replied from the department
    ctx, p, errs = rep_page("en", "light", 1280)
    show(p, steps_case(["FORWARDED", "SCHEDULED"], "WITH_DEPT", extra={"expectedDate": "2026-10-12"}))
    p.evaluate("""() => { const c = currentCases[0]; c.deptSteps[1].byDept = true; c.deptSteps[1].byDeptName = 'Ravi Kumar'; renderContent(); }""")
    ok("Replied by the department (Ravi Kumar)" in p.inner_text("#ds-c9"), "rep console: department reply labelled with the officer")
    ctx.close()

    # ---------- Department performance (grieviq-33) ----------
    for theme in (None, "light"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                tag = "%s-%s-%d" % (theme or "dark", lang, width)
                ctx, p, errs = P("super@test.in", width=width, theme=theme, lang=lang)
                p.goto(B + "/admin-dept-performance.html"); p.wait_for_selector("table.pf")
                txt = p.inner_text("main")
                if lang == "en":
                    ok("Department performance" in txt and "Jal Kal Vibhag Lucknow" in txt and "Too few cases" in txt and "no single score or ranking" in txt, "performance page " + tag, txt[:400])
                else:
                    ok("विभागों का प्रदर्शन" in txt and not re.findall(r"(adm\.pf_|perf\.)\w+", txt), "performance page in Hindi " + tag, txt[:300])
                ok(no_hscroll(p), "performance page: no sideways page scroll " + tag)
                bad = p.evaluate(CONTRAST_JS); ok(not bad, "performance page contrast AA " + tag, bad[:5])
                small = p.evaluate(TARGET_JS); ok(not small, "performance page targets >= 24px " + tag, small[:5])
                shot(p, "30-dept-perf-" + tag, full=(width == 375))
                ok(not errs, "no script errors (performance) " + tag, errs)
                ctx.close()
    ctx, p, errs = P("super@test.in")
    p.goto(B + "/admin-dept-performance.html"); p.wait_for_selector("table.pf")
    with p.expect_response(lambda r: "detail=" in r.url): p.locator("[data-detail]").first.click()
    p.wait_for_selector("#pf-d-h")
    ok(p.evaluate("document.activeElement.id") == "pf-d-h" and p.locator("#pf-trend").count() == 1, "details: heading focused, 12-month chart shown")
    p.click("#pf-close"); p.wait_for_timeout(100)
    ok(p.locator("#pf-d-h").count() == 0 and p.evaluate("document.activeElement.dataset.detail") is not None, "details closed, focus back on the button")
    with p.expect_response(lambda r: "by=type" in r.url): p.click('[data-by="type"]')
    p.wait_for_timeout(300)
    ok(p.get_attribute('[data-by="type"]', "aria-pressed") == "true" and "department type" in p.inner_text("table.pf thead").lower(), "switch to department types")
    p.select_option("#pf-period", "custom"); p.wait_for_selector("#pf-from")
    p.fill("#pf-from", "2026-10-01"); p.fill("#pf-to", "2026-09-01")
    with p.expect_response(lambda r: "dept-performance" in r.url): p.click("#pf-apply")
    p.wait_for_timeout(200)
    ok("check the dates" in p.inner_text("main"), "wrong dates: message shown")
    href = p.get_attribute("#pf-csv", "href")
    ok("format=csv" in href, "CSV link")
    ok(not errs, "no script errors (performance actions)", errs)
    ctx.close()
    ctx, p, errs = P("deo@test.in")
    p.goto(B + "/admin-dashboard.html"); p.wait_for_timeout(800)
    ok(p.locator('a[href*="admin-dept-performance"]:visible').count() == 0, "data entry operator: no performance link")
    ctx.close()
    # Rep overview: departments on your cases
    for theme in ("light", "dark"):
        for lang in ("en", "hi"):
            tag = "%s-%s" % (theme, lang)
            ctx, p, errs = rep_page(lang, theme, 375)
            p.evaluate("""() => { const dp = { min: 5, rows: [
                { key: 'id:o1', name: 'Jal Kal Zone 3', department: 'Water Supply', m: { forwarded: 12, withNow: 3, overdueNow: 2, firstReply: { n: 10, median: 1.5 }, onTime: { n: 6, d: 9, pct: 66.7 }, toFixed: { n: 7, median: 6 }, fixedFirst: { n: 5, d: 7, pct: 71.4 }, reopened: { n: 0, d: 4, pct: null }, rating: { count: 6, average: 3.8, word: 'SATISFIED' }, ownReplies: { n: 8, d: 12, pct: 66.7 }, notOurs: 1, cantDo: 0 } },
                { key: 'name:x', name: 'MVVNL sub-station', department: 'Electricity', m: { forwarded: 2, withNow: 1, overdueNow: 0, firstReply: { n: 2, median: null }, onTime: { n: 1, d: 2, pct: null }, toFixed: { n: 0, median: null }, fixedFirst: { n: 0, d: 0, pct: null }, reopened: { n: 0, d: 0, pct: null }, rating: { count: 0 }, ownReplies: { n: 0, d: 2, pct: null }, notOurs: 0, cantDo: 0 } } ] };
              document.getElementById('content').innerHTML = '<div id="dp-test" style="padding:12px">' + renderOvDepts(dp) + '</div>'; }""")
            t2 = p.inner_text("#dp-test")
            if lang == "en":
                ok("Departments on your cases" in t2 and "66.7%" in t2 and "6 of 9" in t2 and "Too few cases (2)" in t2 and "1.5 days" in t2, "rep: department table " + tag, t2[:400])
            else:
                ok("आपके मामलों पर विभाग" in t2 and not re.findall(r"(perf|rep\.ov_dp)\.?\w*_\w+", t2), "rep: department table in Hindi " + tag, t2[:300])
            bad = p.evaluate(CONTRAST_JS.replace("createTreeWalker(document.body", "createTreeWalker(document.getElementById('dp-test')", 1)); ok(not bad, "rep department table contrast AA " + tag, bad[:5])
            ok(no_hscroll(p), "rep department table: no page scroll " + tag)
            shot(p, "31-rep-depts-" + tag, full=False)
            ok(not errs, "no script errors (rep departments) " + tag, errs)
            ctx.close()

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
    # ---------- Forward through the dashboard; checks on department photos (grieviq-34) ----------
    DIR34 = _json.loads(_json.dumps(DIR)); DIR34["offices"][1]["hasDashboard"] = True; DIR34["offices"][0]["hasDashboard"] = False
    def show34(p, case):
        p.evaluate("""([dir, c]) => { takeDepartments({ departments: ['Water Supply','Electricity','Health','Other'], deptDirectory: dir }); currentCases = [c];
          const box = document.getElementById('content'); box.innerHTML = '<div id="ds-test" style="max-width:640px;padding:12px">' + renderFollowupControl(c) + '<p id="resolve-status" role="status"></p></div>';
          renderContent = () => { const cc = currentCases[0]; document.getElementById('ds-test').innerHTML = renderFollowupControl(cc) + '<p id="resolve-status" role="status"></p>'; attachFollowupHandlers(); };
          attachFollowupHandlers(); window.scrollTo(0, 0); }""", [DIR34, case])
    for theme in ("light", "dark"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                tag = "%s-%s-%d" % (theme, lang, width)
                ctx, p, errs = rep_page(lang, theme, width)
                fresh = steps_case([], "NONE"); fresh["deptSteps"] = []; fresh["deptState"] = None
                show34(p, fresh)
                ok(p.inner_text(".followup-btn") == ("Forward" if lang == "en" else "अग्रेषित करें"), "button says Forward " + tag, p.inner_text(".followup-btn"))
                p.select_option("#followup-dept-c9", "Water Supply"); p.wait_for_timeout(50)
                p.select_option("#followup-office-c9", "o1"); p.wait_for_timeout(50)
                ok(p.locator('input.followup-ch[value="DASHBOARD"]').count() == 0, "no dashboard choice for an office without officers " + tag)
                p.select_option("#followup-office-c9", "o2"); p.wait_for_timeout(50)
                dash = p.locator('input.followup-ch[value="DASHBOARD"]')
                ok(dash.count() == 1 and dash.is_checked(), "dashboard choice first and chosen " + tag)
                hint = p.inner_text("#fwd-dash-hint-c9")
                ok(("Jal Kal Zone 3's officers see it" in hint) if lang == "en" else ("तुरंत ईमेल" in hint), "dashboard hint " + tag, hint)
                ok(no_hscroll(p), "forward form: no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS.replace("document.body", "document.getElementById('ds-test')", 1)); ok(not bad, "forward form contrast AA " + tag, bad[:5])
                small = p.evaluate(TARGET_JS); ok(not small, "forward form targets >= 24px " + tag, small[:5])
                shot(p, "34-forward-" + tag, full=False)
                p.click(".followup-btn"); p.wait_for_timeout(300)
                ok(posts[-1][0] == "grievances/c9/add-followup" and posts[-1][1]["channel"] == "DASHBOARD" and posts[-1][1]["officeId"] == "o2", "sent through the dashboard " + tag, posts[-1:])
                # forwarded before: "Forward again"; the department's photo with its checks
                case = steps_case(["FORWARDED", "DONE_CLAIMED"], "NEEDS_CHECK")
                case["deptSteps"][1].update({"byDept": True, "byDeptName": "Ravi Kumar", "photos": [{"url": "/logo-mark.svg", "thumbUrl": "/logo-mark.svg",
                    "warnings": [{"code": "DEVICE_FAR_FROM_PIN", "level": "warn", "metres": 357000, "accuracy": 14}, {"code": "NO_DATE", "level": "info"}]}]})
                show34(p, case)
                ok(p.inner_text(".followup-btn") == ("Forward again" if lang == "en" else "फिर से अग्रेषित करें"), "button says Forward again " + tag)
                ev = p.inner_text("#ds-c9 .ev-list")
                ok(("The department added this photo about 357" in ev) if lang == "en" else ("विभाग ने यह फ़ोटो" in ev), "rep sees checks on the department's photo " + tag, ev)
                ok(not re.findall(r"rep\.evd?_\w+", p.inner_text("#ds-test")), "no raw keys " + tag)
                bad = p.evaluate(CONTRAST_JS.replace("document.body", "document.getElementById('ds-test')", 1)); ok(not bad, "department photo checks contrast AA " + tag, bad[:5])
                shot(p, "35-dept-photo-checks-" + tag, full=False)
                ok(not errs, "no script errors (grieviq-34 rep) " + tag, errs)
                ctx.close()
    # Officer: the checks on the reply form, every theme and language
    for theme in ("light", "dark"):
        for lang in ("en", "hi"):
            tag = "%s-%s" % (theme, lang)
            ctx = br.new_context(viewport={"width": 375, "height": 900}, color_scheme=theme, permissions=["geolocation"], geolocation={"latitude": 26.85, "longitude": 80.94, "accuracy": 10})
            ok(dept_signin(ctx) == 200, "signed in " + tag)
            ctx.add_init_script("try{localStorage.setItem('%s','%s')}catch(e){}" % (LANGKEY, lang))
            p = ctx.new_page(); errs = []
            p.on("pageerror", lambda e: errs.append(str(e)))
            p.goto(B + "/dept#case=g21"); p.wait_for_selector("#case-h")
            hist = p.locator(".steps .ev-list")
            ok(hist.count() >= 1 and (("The department added this photo" in hist.first.inner_text() or "No location in the photo" in hist.first.inner_text()) if lang == "en" else "फ़ोटो" in hist.first.inner_text()), "history shows the checks " + tag, hist.first.inner_text() if hist.count() else "")
            bad = p.evaluate(CONTRAST_JS); ok(not bad, "officer case with checks contrast AA " + tag, bad[:5])
            shot(p, "36-dept-checks-" + tag, full=True)
            ok(not errs, "no script errors (grieviq-34 officer) " + tag, errs)
            ctx.close()

    # ---------- The bell for department officers (grieviq-35) ----------
    FAKE_PUSH = """(() => {
      let sub = null;
      const b64u = (a) => btoa(String.fromCharCode.apply(null, new Uint8Array(a))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      let perm = 'default';
      if (window.Notification) {
        Object.defineProperty(Notification, 'permission', { configurable: true, get: () => perm });
        Notification.requestPermission = async () => { perm = 'granted'; return perm; };
      }
      if (window.PushManager) {
        PushManager.prototype.getSubscription = async function () { return sub; };
        PushManager.prototype.subscribe = async function () {
          const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
          const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
          const keys = { p256dh: b64u(raw), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
          sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/ui-test-device', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/ui-test-device', keys }), unsubscribe: async () => { sub = null; return true; } };
          return sub;
        };
      }
    })();"""
    for theme in ("light", "dark"):
        for lang in ("en", "hi"):
            for width in (1280, 375):
                tag = "%s-%s-%d" % (theme, lang, width)
                ctx = br.new_context(viewport={"width": width, "height": 900}, color_scheme=theme, permissions=["notifications"])
                ok(dept_signin(ctx) == 200, "signed in " + tag)
                ctx.add_init_script("try{localStorage.setItem('%s','%s')}catch(e){}" % (LANGKEY, lang))
                ctx.add_init_script(FAKE_PUSH)
                p = ctx.new_page(); errs = []
                p.on("pageerror", lambda e: errs.append(str(e)))
                p.goto(B + "/dept"); p.wait_for_selector(".tiles"); p.wait_for_selector("#rn-bell")
                p.wait_for_timeout(400)
                badge = p.locator(".rn-badge")
                ok(badge.count() == 1 and int(badge.inner_text()) >= 1, "bell shows unread alerts " + tag)
                ok(p.get_attribute("#rn-bell", "aria-expanded") == "false", "bell is a closed disclosure " + tag)
                p.click("#rn-bell"); p.wait_for_selector("#rn-panel .rn-item")
                ok(p.evaluate("document.activeElement.id") == "rn-h", "focus moves to the list heading " + tag)
                p.wait_for_selector("#rn-on"); p.wait_for_timeout(300)
                txt = p.inner_text("#rn-panel")
                if lang == "en":
                    ok("Sent back after the check on site: GRV-DEPT23" in txt and "Past the target time: GRV-DEPT24" in txt and "Turn on alerts on this device" in txt, "officer's alerts listed " + tag, txt[:400])
                else:
                    ok("मौके की जाँच के बाद वापस भेजी गई: GRV-DEPT23" in txt and "इस डिवाइस पर सूचनाएँ चालू करें" in txt and not re.findall(r"(rn|dd)\.\w+_\w+", txt), "officer's alerts in Hindi " + tag, txt[:400])
                ok("Sewer" not in txt and "9876522222" not in txt, "no complaint text in the bell " + tag)
                ok(no_hscroll(p), "bell: no sideways scroll " + tag)
                bad = p.evaluate(CONTRAST_JS.replace("document.body", "document.getElementById('rn-panel')", 1)); ok(not bad, "bell contrast AA " + tag, bad[:5])
                small = p.evaluate(TARGET_JS); ok(not small, "bell targets >= 24px " + tag, small[:5])
                shot(p, "37-dept-bell-" + tag, full=False)
                if theme == "light" and width == 1280:
                    # turn on alerts, send a test, then open an alert
                    with p.expect_response(lambda r: "/api/dept/notifications" in r.url and r.request.method == "POST"): p.click("#rn-on")
                    p.wait_for_selector("#rn-test")
                    ok(("Turn off on this device" if lang == "en" else "इस डिवाइस पर बंद करें") in p.inner_text("#rn-panel"), "alerts on for this device " + tag)
                    before = len(open(WORK + "/push.log").read().strip().split("\n"))
                    p.click("#rn-test"); p.wait_for_function("document.getElementById('rn-pstat') && document.getElementById('rn-pstat').textContent.length > 12")
                    after = open(WORK + "/push.log").read().strip().split("\n")
                    ok(len(after) > before and "ui-test-device" in after[-1], "test alert went to the device " + tag)
                    reg = p.evaluate("navigator.serviceWorker.getRegistration('/dept').then(r => r ? r.scope : null)")
                    ok(reg and reg.endswith("/dept"), "alerts belong to the department dashboard " + tag, reg)
                    n0 = int(p.inner_text(".rn-badge"))
                    item = p.locator("#rn-panel .rn-item.unread [data-n]").filter(has_text="GRV-DEPT23").first
                    item.click()
                    p.wait_for_selector("#case-h"); p.wait_for_timeout(400)
                    ok("GRV-DEPT23" in p.inner_text("#case-h"), "alert opens the case " + tag)
                    nb = p.locator(".rn-badge")
                    ok((nb.count() == 0 and n0 == 1) or (nb.count() == 1 and int(nb.inner_text()) == n0 - 1), "opened alert marked read " + tag)
                    p.click("#rn-bell"); p.wait_for_selector("#rn-off"); p.click("#rn-off"); p.wait_for_selector("#rn-on")
                    ok(True, "alerts turned off " + tag)
                ok(not errs, "no script errors (dept bell) " + tag, errs)
                ctx.close()
    # A link from an alert (#case=..&n=..) opens the case and marks the alert read
    ctx = br.new_context(viewport={"width": 390, "height": 900})
    ok(dept_signin(ctx) == 200, "signed in for the alert link")
    d = _sq.connect(WORK + "/test.db", timeout=10)
    nid = d.execute("SELECT id FROM notifications WHERE kind = 'DEPT_O_LATE' AND grievance_id = 'g24' AND read_at IS NULL").fetchone()
    d.close()
    p = ctx.new_page(); errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    if nid:
        p.goto(B + "/dept#case=g24&n=" + nid[0]); p.wait_for_selector("#case-h"); p.wait_for_timeout(800)
        d = _sq.connect(WORK + "/test.db", timeout=10)
        ok(d.execute("SELECT read_at FROM notifications WHERE id = ?", (nid[0],)).fetchone()[0] is not None and "GRV-DEPT24" in p.inner_text("#case-h"), "alert link opens the case and marks it read")
        d.close()
    else:
        ok(False, "an unread overdue alert to open")
    ok(not errs, "no script errors (alert link)", errs)
    ctx.close()

    br.close()

print("\n%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
