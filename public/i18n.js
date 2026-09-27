// public/i18n.js
//
// GrievIQ citizen pages and the representative console: English / Hindi.
// All citizen-facing (and rep console) text lives here, so a wording fix is made in one place.
// Standards: language labelled in its own script (हिन्दी / English), no flags,
// no automatic switching (English is the default), choice remembered on the
// device, <html lang> set for screen readers (WCAG 3.1.1), and the toggle's
// own label marked with its language (WCAG 3.1.2).
//
// Pages mark text with:
//   data-i18n="key"        -> textContent
//   data-i18n-html="key"   -> innerHTML (only for our own fixed text with links/bold)
//   data-i18n-ph="key"     -> placeholder
//   data-i18n-aria="key"   -> aria-label
//   data-i18n-only="hi"    -> element shown only in that language
//   data-lang-toggle       -> the हिन्दी / English button
// Page scripts use GIQ.t(key, vars) and listen for the "giq:lang" event
// to redraw anything they build themselves.
(function () {
  var STORE = 'griq-lang';
  var D = {
"common.strip": [
"Independent citizen grievance escalation & redressal platform",
"स्वतंत्र नागरिक शिकायत निवारण एवं उच्च स्तर पर अग्रेषण मंच"
],
"common.lang_button": [
"English",
"हिन्दी"
],
"common.back_home": [
"← Back to home",
"← मुख्य पृष्ठ पर वापस जाएँ"
],
"common.about": [
"About us",
"हमारे बारे में"
],
"common.privacy": [
"Privacy policy",
"गोपनीयता नीति"
],
"common.terms": [
"Terms",
"उपयोग की शर्तें"
],
"common.contact": [
"Contact",
"संपर्क करें"
],
"common.footer_note": [
"An independent civic-tech platform helping citizens route grievances to their elected representatives' public contact details.",
"एक स्वतंत्र नागरिक-तकनीक मंच, जो नागरिकों की शिकायतें उनके निर्वाचित जनप्रतिनिधियों के सार्वजनिक संपर्क विवरण तक पहुँचाने में सहायता करता है।"
],
"common.network_error": [
"Could not reach GrievIQ. Check your connection and try again.",
"GrievIQ से संपर्क नहीं हो सका। कृपया अपना इंटरनेट कनेक्शन जाँचें और पुनः प्रयास करें।"
],
"common.generic_error": [
"Something went wrong. Please try again.",
"कुछ गड़बड़ी हुई। कृपया पुनः प्रयास करें।"
],
"level.corporator": [
"Corporator",
"पार्षद"
],
"level.pradhan": [
"Gram Pradhan",
"ग्राम प्रधान"
],
"level.mayor": [
"Mayor",
"महापौर"
],
"level.mla": [
"MLA",
"विधायक"
],
"level.mp": [
"MP",
"सांसद"
],
"cat.water-sanitation": [
"Water Supply / Sanitation",
"जलापूर्ति / स्वच्छता"
],
"cat.electricity": [
"Electricity Supply",
"विद्युत आपूर्ति"
],
"cat.garbage": [
"Sanitation / Garbage Collection",
"सफ़ाई / कूड़ा संग्रहण"
],
"cat.road-infra": [
"Road / Infrastructure Repair",
"सड़क / आधारभूत ढाँचे की मरम्मत"
],
"cat.public-safety": [
"Public Safety / Law & Order",
"सार्वजनिक सुरक्षा / कानून-व्यवस्था"
],
"cat.land-dispute": [
"Land Dispute / Legal Matter",
"भूमि विवाद / विधिक मामला"
],
"cat.doc-correction": [
"Document/Certificate Correction",
"दस्तावेज़ / प्रमाण-पत्र में संशोधन"
],
"cat.other": [
"Other / Uncategorized",
"अन्य"
],
"dept.water": [
"Water Supply",
"जलापूर्ति विभाग"
],
"dept.electricity": [
"Electricity",
"विद्युत विभाग"
],
"dept.sanitation": [
"Sanitation / Garbage",
"सफ़ाई / कूड़ा संग्रहण विभाग"
],
"dept.roads": [
"Roads & Public Works",
"सड़क एवं लोक निर्माण विभाग"
],
"dept.health": [
"Health",
"स्वास्थ्य विभाग"
],
"dept.legal": [
"Legal / Land Records",
"विधिक / भू-अभिलेख विभाग"
],
"dept.other": [
"Other",
"अन्य"
],
"home.page_title": [
"GrievIQ — Report a civic problem and track it",
"GrievIQ — नागरिक समस्या दर्ज करें और उसकी स्थिति देखें"
],
"home.title": [
"Get civic problems in Lucknow fixed",
"लखनऊ की नागरिक समस्याओं का समाधान कराएँ"
],
"home.intro": [
"Report a problem like no water, garbage, broken roads or street lights. GrievIQ sends it to your ward's elected representative. If it isn't dealt with in time, it moves up to the next level automatically, and stays visible to everyone it has reached.",
"पानी न आना, कूड़ा, टूटी सड़कें या स्ट्रीट लाइट जैसी समस्याएँ दर्ज करें। GrievIQ आपकी शिकायत आपके वार्ड के निर्वाचित जनप्रतिनिधि तक पहुँचाता है। यदि निर्धारित समय में कार्यवाही नहीं होती, तो शिकायत स्वतः अगले स्तर पर पहुँच जाती है और जिन-जिन स्तरों तक पहुँची है, उन सभी को दिखाई देती रहती है।"
],
"home.stat_wards": [
"Wards reachable",
"उपलब्ध वार्ड"
],
"home.stat_levels_value": [
"Up to 4",
"अधिकतम 4"
],
"home.stat_levels": [
"Escalation levels",
"शिकायत के स्तर"
],
"home.stat_device": [
"Reports on this device",
"इस डिवाइस पर दर्ज शिकायतें"
],
"home.report_title": [
"Report a problem",
"समस्या दर्ज करें"
],
"home.report_sub": [
"Water, sanitation, roads, electricity",
"पानी, सफ़ाई, सड़क, बिजली"
],
"home.track_title": [
"Track my reports",
"मेरी शिकायतों की स्थिति"
],
"home.track_sub_none": [
"Check progress with the email you gave",
"दिए गए ईमेल से प्रगति देखें"
],
"home.track_sub_some": [
"{n} filed on this device · check progress with your email",
"इस डिवाइस से {n} शिकायत दर्ज · अपने ईमेल से प्रगति देखें"
],
"home.device_note": [
"Tracking numbers are saved only on this device.",
"संदर्भ संख्याएँ केवल इसी डिवाइस पर सुरक्षित रहती हैं।"
],
"home.forget": [
"Forget reports on this device",
"इस डिवाइस से शिकायतें हटाएँ"
],
"home.rep_signin": [
"Representatives: sign in",
"जनप्रतिनिधि: साइन इन करें"
],
"submit.page_title": [
"File a complaint — GrievIQ",
"शिकायत दर्ज करें — GrievIQ"
],
"submit.title": [
"File a complaint",
"शिकायत दर्ज करें"
],
"submit.lede": [
"Tell us what happened. Your complaint goes straight to your local representative, and stays visible to higher representatives if it isn't resolved in time.",
"बताइए क्या समस्या है। आपकी शिकायत सीधे आपके स्थानीय जनप्रतिनिधि तक जाएगी, और निर्धारित समय में निस्तारण न होने पर उच्च स्तर के जनप्रतिनिधियों को भी दिखाई देगी।"
],
"submit.sec_issue": [
"What's the issue?",
"समस्या क्या है?"
],
"submit.type": [
"Type of complaint",
"शिकायत का प्रकार"
],
"submit.describe": [
"Describe the problem",
"समस्या का विवरण"
],
"submit.describe_hint": [
"Be specific — location details, how long it's been going on, anything that helps.",
"स्पष्ट लिखें — स्थान, समस्या कब से है, और अन्य उपयोगी जानकारी।"
],
"submit.describe_ph": [
"For example: There has been no water supply in our lane for the past 5 days...",
"उदाहरण: हमारी गली में पिछले 5 दिनों से पानी की आपूर्ति नहीं हो रही है..."
],
"submit.describe_err": [
"Please write at least 15 characters.",
"कृपया कम से कम 15 अक्षर लिखें।"
],
"submit.sec_where": [
"Where is this happening?",
"समस्या कहाँ है?"
],
"submit.address": [
"Search your address",
"अपना पता खोजें"
],
"submit.address_hint": [
"Start typing your street or landmark and pick a match — we'll try to match it to your ward automatically.",
"अपनी गली या आसपास का कोई प्रमुख स्थान लिखना शुरू करें और सूची से चुनें — हम उसे स्वतः आपके वार्ड से मिलाने का प्रयास करेंगे।"
],
"submit.matched": [
"We matched your address to {ward}.",
"आपका पता इस वार्ड से मिलाया गया: {ward}।"
],
"submit.looks_right": [
"Looks right",
"सही है"
],
"submit.choose_manually": [
"No, let me choose manually",
"नहीं, मैं स्वयं चुनूँगा/चुनूँगी"
],
"submit.or_manual": [
"Or select your area manually:",
"या अपना क्षेत्र स्वयं चुनें:"
],
"submit.area": [
"Your area",
"आपका क्षेत्र"
],
"submit.area_ph": [
"Start typing your area...",
"अपना क्षेत्र लिखना शुरू करें..."
],
"submit.change": [
"Change",
"बदलें"
],
"submit.area_err": [
"Please select your area from the list.",
"कृपया सूची से अपना क्षेत्र चुनें।"
],
"submit.no_area": [
"No matching area found. Try a different spelling, or a nearby landmark.",
"कोई मिलता-जुलता क्षेत्र नहीं मिला। दूसरी वर्तनी या आसपास का कोई प्रमुख स्थान लिखकर देखें।"
],
"submit.no_ward": [
"We couldn't automatically match that address to a known ward yet. Please search for your area manually below.",
"यह पता अभी किसी वार्ड से स्वतः नहीं मिलाया जा सका। कृपया नीचे अपना क्षेत्र स्वयं खोजें।"
],
"submit.addr_fail": [
"Couldn't look up that address. Please search for your area manually below.",
"यह पता खोजा नहीं जा सका। कृपया नीचे अपना क्षेत्र स्वयं खोजें।"
],
"submit.landmark": [
"Landmark or street address",
"प्रमुख स्थान या गली का पता"
],
"submit.landmark_hint": [
"Helps your representative find the exact spot — e.g. \"near Shiv temple, Mohalla Rampur\" or a street name.",
"इससे जनप्रतिनिधि को सही स्थान ढूँढने में सहायता मिलती है — जैसे \"शिव मंदिर के पास, मोहल्ला रामपुर\" या गली का नाम।"
],
"submit.landmark_ph": [
"e.g. Near the water tank on Station Road",
"जैसे: स्टेशन रोड पर पानी की टंकी के पास"
],
"submit.photos": [
"Add photos (optional)",
"फ़ोटो जोड़ें (वैकल्पिक)"
],
"submit.photos_hint": [
"Up to 3 photos. They help your representative understand the issue faster.",
"अधिकतम 3 फ़ोटो। इनसे जनप्रतिनिधि को समस्या जल्दी समझ आती है।"
],
"submit.photos_btn": [
"Take or choose photos",
"फ़ोटो लें या चुनें"
],
"submit.photos_more": [
"Add more ({n}/{max} added)",
"और जोड़ें ({max} में से {n} जोड़ी गईं)"
],
"submit.photo_remove": [
"Remove photo",
"फ़ोटो हटाएँ"
],
"submit.photo_max": [
"You can add up to 3 photos.",
"आप अधिकतम 3 फ़ोटो जोड़ सकते हैं।"
],
"submit.photo_size": [
"Each photo must be smaller than 5MB.",
"प्रत्येक फ़ोटो 5MB से छोटी होनी चाहिए।"
],
"submit.photo_fail": [
"Photo upload failed.",
"फ़ोटो अपलोड नहीं हो सकी।"
],
"submit.sec_contact": [
"Your contact number",
"आपका संपर्क नंबर"
],
"submit.contact_hint": [
"Used only so you can check your complaint's status later. It is not shared publicly.",
"इसका उपयोग केवल आपकी शिकायत की पहचान के लिए होता है। इसे सार्वजनिक नहीं किया जाता।"
],
"submit.mobile": [
"Mobile number",
"मोबाइल नंबर"
],
"submit.mobile_ph": [
"10-digit mobile number",
"10 अंकों का मोबाइल नंबर"
],
"submit.mobile_err": [
"Please enter a valid mobile number.",
"कृपया सही मोबाइल नंबर दर्ज करें।"
],
"submit.email": [
"Email address (optional)",
"ईमेल पता (वैकल्पिक)"
],
"submit.email_hint": [
"If you want to check regular updates on your complaint's status, please provide your email as well.",
"यदि आप अपनी शिकायत की स्थिति ऑनलाइन देखना और सूचनाएँ पाना चाहते हैं, तो अपना ईमेल भी दें।"
],
"submit.email_err": [
"Please enter a valid email address, or leave it blank.",
"कृपया सही ईमेल पता दर्ज करें, या इसे खाली छोड़ दें।"
],
"submit.rep_q": [
"Do you know your local representative? (optional)",
"क्या आप अपने स्थानीय जनप्रतिनिधि को जानते हैं? (वैकल्पिक)"
],
"submit.rep_hint": [
"We don't yet have full contact details for everyone who represents your area. If you know them, tell us. We check this before using it — it won't change where your complaint goes.",
"हमारे पास अभी आपके क्षेत्र के सभी जनप्रतिनिधियों का पूरा संपर्क विवरण नहीं है। यदि आप जानते हैं, तो बताएँ। उपयोग से पहले हम इसकी जाँच करते हैं — इससे आपकी शिकायत कहाँ जाएगी, यह नहीं बदलेगा।"
],
"submit.rep_who": [
"Who are you naming?",
"आप किसका नाम बता रहे हैं?"
],
"submit.rep_name": [
"Their name",
"उनका नाम"
],
"submit.rep_name_err": [
"Please enter their full name, or leave this section empty.",
"कृपया उनका पूरा नाम लिखें, या यह भाग खाली छोड़ दें।"
],
"submit.rep_phone": [
"Their phone number",
"उनका फ़ोन नंबर"
],
"submit.rep_phone_err": [
"Please enter a valid phone number, or leave it blank.",
"कृपया सही फ़ोन नंबर दर्ज करें, या इसे खाली छोड़ दें।"
],
"submit.rep_who_err": [
"Please choose who you are naming.",
"कृपया चुनें कि आप किसका नाम बता रहे हैं।"
],
"submit.category_err": [
"Please choose a category.",
"कृपया शिकायत का प्रकार चुनें।"
],
"submit.load_err": [
"Could not load the form options. Please refresh the page.",
"फ़ॉर्म के विकल्प लोड नहीं हो सके। कृपया पृष्ठ रीफ़्रेश करें।"
],
"submit.button": [
"File complaint",
"शिकायत दर्ज करें"
],
"submit.uploading": [
"Uploading photos...",
"फ़ोटो अपलोड हो रही हैं..."
],
"submit.fail_title": [
"We couldn't file your complaint",
"आपकी शिकायत दर्ज नहीं हो सकी"
],
"submit.done_title": [
"Your complaint has been filed",
"आपकी शिकायत दर्ज हो गई है"
],
"submit.done_keep": [
"Keep this reference number to check on your complaint later.",
"बाद में शिकायत की स्थिति जानने के लिए यह संदर्भ संख्या सुरक्षित रखें।"
],
"submit.done_track": [
"Track it any time from [Track my reports] using the email you gave ({email}).",
"दिए गए ईमेल ({email}) से कभी भी [मेरी शिकायतों की स्थिति] में इसकी प्रगति देखें।"
],
"submit.done_noemail": [
"Online tracking needs an email, and you didn't give one. Keep this number and quote it if you contact us at support@grieviq.in.",
"ऑनलाइन स्थिति देखने के लिए ईमेल आवश्यक है, जो आपने नहीं दिया। यह संख्या सुरक्षित रखें और support@grieviq.in पर संपर्क करते समय इसका उल्लेख करें।"
],
"status.page_title": [
"Track my reports — GrievIQ",
"मेरी शिकायतों की स्थिति — GrievIQ"
],
"status.title": [
"Track my reports",
"मेरी शिकायतों की स्थिति"
],
"status.lede": [
"Enter the email you gave when you reported. We'll send a code so we know it's you, then show all your reports.",
"शिकायत दर्ज करते समय दिया गया ईमेल लिखें। आपकी पहचान की पुष्टि के लिए हम एक कोड भेजेंगे, फिर आपकी सभी शिकायतें दिखाएँगे।"
],
"status.lede_ref": [
"To see report {ref}, enter the email you gave when you reported. We'll send a code so we know it's you.",
"शिकायत {ref} देखने के लिए, शिकायत दर्ज करते समय दिया गया ईमेल लिखें। आपकी पहचान की पुष्टि के लिए हम एक कोड भेजेंगे।"
],
"status.email": [
"Email address",
"ईमेल पता"
],
"status.send": [
"Send code",
"कोड भेजें"
],
"status.sending": [
"Sending…",
"भेजा जा रहा है…"
],
"status.no_email_note": [
"Reported without an email? Online tracking needs the email you gave when reporting. Keep your tracking number, and quote it if you contact us at support@grieviq.in.",
"बिना ईमेल के शिकायत दर्ज की थी? ऑनलाइन स्थिति देखने के लिए शिकायत दर्ज करते समय दिया गया ईमेल आवश्यक है। अपनी संदर्भ संख्या सुरक्षित रखें और support@grieviq.in पर संपर्क करते समय उसका उल्लेख करें।"
],
"status.otp_title": [
"Enter the code we sent",
"भेजा गया कोड दर्ज करें"
],
"status.otp_lede": [
"If {email} has reports with GrievIQ, we've sent a 6-digit code to it. It expires in 10 minutes.",
"यदि {email} से GrievIQ पर शिकायतें दर्ज हैं, तो उस पर 6 अंकों का सत्यापन कोड (ओटीपी) भेजा गया है। यह 10 मिनट में समाप्त हो जाएगा।"
],
"status.verify": [
"Verify code",
"कोड सत्यापित करें"
],
"status.verifying": [
"Verifying…",
"सत्यापन हो रहा है…"
],
"status.change_email": [
"Change email",
"ईमेल बदलें"
],
"status.new_code": [
"Send a new code",
"नया कोड भेजें"
],
"status.code_digits": [
"Enter all 6 digits of the code.",
"कोड के सभी 6 अंक दर्ज करें।"
],
"status.list_title": [
"Your reports",
"आपकी शिकायतें"
],
"status.list_lede": [
"{n} reports filed with {email}, newest first.",
"{email} से दर्ज {n} शिकायतें, नवीनतम पहले।"
],
"status.list_none": [
"We couldn't find any reports filed with {email}.",
"{email} से दर्ज कोई शिकायत नहीं मिली।"
],
"status.other_email": [
"Use a different email",
"दूसरा ईमेल प्रयोग करें"
],
"status.open_fail": [
"Could not open that report. Please try again.",
"यह शिकायत खोली नहीं जा सकी। कृपया पुनः प्रयास करें।"
],
"status.verify_again": [
"Please verify your email again.",
"कृपया अपना ईमेल दोबारा सत्यापित करें।"
],
"status.filed": [
"Filed {when}",
"दर्ज: {when}"
],
"status.today": [
"today",
"आज"
],
"status.yesterday": [
"yesterday",
"कल"
],
"status.on_date": [
"on {date}",
"{date} को"
],
"status.pill_open": [
"Open",
"लंबित"
],
"status.pill_waiting": [
"Awaiting your confirmation",
"आपकी पुष्टि लंबित"
],
"status.pill_resolved": [
"Resolved",
"निस्तारित"
],
"status.pill_closed": [
"Closed",
"बंद"
],
"status.where_title": [
"Where this case stands",
"शिकायत की वर्तमान स्थिति"
],
"status.where_lede": [
"A case stays visible to every level it reaches — moving up never means the level below stops seeing it.",
"शिकायत जिन-जिन स्तरों तक पहुँचती है, उन सभी को दिखाई देती रहती है — ऊपर के स्तर पर जाने से नीचे का स्तर उसे देखना बंद नहीं करता।"
],
"status.tier_late": [
"Past its usual response time",
"निर्धारित समय-सीमा बीत गई"
],
"status.tier_current": [
"Currently handling this case",
"वर्तमान में इस शिकायत पर कार्यवाही कर रहे हैं"
],
"status.tier_handled": [
"Handled this case",
"इस शिकायत पर कार्यवाही की"
],
"status.tier_not_yet": [
"Not yet reached",
"अभी इस स्तर तक नहीं पहुँची"
],
"status.ack_due": [
"Acknowledgement due by {date}",
"शिकायत स्वीकार करने की अंतिम तिथि: {date}"
],
"status.ack_was_due": [
"Acknowledgement was due by {date}",
"शिकायत {date} तक स्वीकार की जानी थी"
],
"status.response_due": [
"Response due by {date}",
"कार्यवाही की अंतिम तिथि: {date}"
],
"status.was_due": [
"Was due by {date}",
"{date} तक कार्यवाही होनी थी"
],
"status.ack_overdue_banner": [
"Not yet acknowledged. This should have happened by now — it may be worth following up directly.",
"शिकायत अभी तक स्वीकार नहीं की गई। यह अब तक हो जाना चाहिए था — आप सीधे संपर्क कर सकते हैं।"
],
"status.legal_banner": [
"This case type doesn't auto-escalate. Land and legal disputes are reviewed directly rather than moving up the chain on a timer.",
"इस प्रकार की शिकायत स्वतः अगले स्तर पर नहीं जाती। भूमि और विधिक विवादों की समीक्षा समय-सीमा के आधार पर आगे बढ़ाने के बजाय सीधे की जाती है।"
],
"status.reminder_banner": [
"Reminder sent. The GrievIQ team reminded your representative about this case on {date}.",
"अनुस्मारक भेजा गया। GrievIQ टीम ने {date} को आपके जनप्रतिनिधि को इस शिकायत के संबंध में अनुस्मारक भेजा।"
],
"status.forwarded": [
"Forwarded to: {dept}",
"अग्रेषित: {dept}"
],
"status.confirm_title": [
"Has this been fixed?",
"क्या समस्या का समाधान हो गया है?"
],
"status.confirm_lede": [
"The representative handling this case marked it resolved. Let us know if that's right.",
"इस शिकायत पर कार्यवाही कर रहे जनप्रतिनिधि ने इसे निस्तारित बताया है। कृपया बताएँ कि क्या यह सही है।"
],
"status.yes_fixed": [
"Yes, this fixed it",
"हाँ, समस्या हल हो गई"
],
"status.no_problem": [
"No, still a problem",
"नहीं, समस्या अभी भी है"
],
"status.reason_hint": [
"Choose the option that best describes what happened.",
"वह विकल्प चुनें जो स्थिति को सबसे सही बताता हो।"
],
"status.r_not_fixed": [
"Not fixed at all",
"बिल्कुल हल नहीं हुई"
],
"status.r_partial": [
"Partially fixed",
"आंशिक रूप से हल हुई"
],
"status.r_came_back": [
"Fixed, but came back",
"हल हुई, पर फिर से हो गई"
],
"status.r_wrong": [
"Wrong issue fixed",
"किसी दूसरी समस्या पर कार्यवाही हुई"
],
"status.r_other": [
"Other",
"अन्य"
],
"status.note_ph": [
"Add a short note (optional, required for \"Other\")",
"संक्षिप्त टिप्पणी लिखें (वैकल्पिक; \"अन्य\" चुनने पर आवश्यक)"
],
"status.note_required": [
"Please add a short note for \"Other\".",
"\"अन्य\" के लिए कृपया संक्षिप्त टिप्पणी लिखें।"
],
"status.submit": [
"Submit",
"जमा करें"
],
"status.confirmed": [
"Thanks for confirming — this case is now marked resolved.",
"पुष्टि के लिए धन्यवाद — यह शिकायत अब निस्तारित मानी गई है।"
],
"status.disputed": [
"Thanks — we've reopened this case and shared your note with the representative.",
"धन्यवाद — यह शिकायत पुनः खोल दी गई है और आपकी टिप्पणी जनप्रतिनिधि को भेज दी गई है।"
],
"status.all_reports": [
"← All my reports",
"← मेरी सभी शिकायतें"
],
"srv.sent": [
"If this email has reports with GrievIQ, we've sent a 6-digit code to it.",
"यदि इस ईमेल से GrievIQ पर शिकायतें दर्ज हैं, तो उस पर 6 अंकों का कोड भेजा गया है।"
],
"srv.invalid_email": [
"Enter a valid email address.",
"कृपया सही ईमेल पता दर्ज करें।"
],
"srv.too_many_requests": [
"Too many codes requested. Please wait 15 minutes and try again.",
"बहुत अधिक बार कोड माँगा गया है। कृपया 15 मिनट बाद पुनः प्रयास करें।"
],
"srv.incorrect": [
"That code isn't right. {n} tries left.",
"यह कोड सही नहीं है। {n} प्रयास शेष हैं।"
],
"srv.incorrect_one": [
"That code isn't right. 1 try left.",
"यह कोड सही नहीं है। 1 प्रयास शेष है।"
],
"srv.too_many_attempts": [
"Too many wrong attempts. Send a new code.",
"बहुत अधिक गलत प्रयास। कृपया नया कोड मँगाएँ।"
],
"srv.expired": [
"That code has expired or is no longer valid. Send a new one.",
"यह कोड समाप्त हो गया है या अब मान्य नहीं है। कृपया नया कोड मँगाएँ।"
],
"srv.verify_again": [
"For your security, please verify your email again.",
"आपकी सुरक्षा के लिए, कृपया अपना ईमेल दोबारा सत्यापित करें।"
],
"email.code_subject": [
"Your GrievIQ code: {code}",
"आपका GrievIQ कोड: {code}"
],
"email.code_body": [
"Use this code to see your GrievIQ reports: {code}. It expires in 10 minutes and can be used once. If you didn't ask for this code, you can ignore this email.",
"GrievIQ पर अपनी शिकायतें देखने के लिए यह कोड प्रयोग करें: {code}। यह 10 मिनट में समाप्त हो जाएगा और केवल एक बार प्रयोग किया जा सकता है। यदि आपने यह कोड नहीं माँगा है, तो इस ईमेल को अनदेखा करें।"
],
"email.resolved_subject": [
"Your GrievIQ case {ref} has been marked resolved",
"आपकी GrievIQ शिकायत {ref} को निस्तारित बताया गया है"
],
"email.resolved_body": [
"The representative handling your case {ref} has marked it as resolved. Please visit our status page and enter your email to confirm whether this actually fixed the problem.",
"आपकी शिकायत {ref} पर कार्यवाही कर रहे जनप्रतिनिधि ने इसे निस्तारित बताया है। कृपया हमारे \"मेरी शिकायतों की स्थिति\" पृष्ठ पर जाकर अपना ईमेल दर्ज करें और बताएँ कि क्या समस्या वास्तव में हल हुई है।"
],
"fb.page_title": [
"Send feedback — GrievIQ",
"सुझाव / फ़ीडबैक भेजें — GrievIQ"
],
"fb.title": [
"Send feedback",
"सुझाव / फ़ीडबैक भेजें"
],
"fb.lede": [
"This is for problems or suggestions about the GrievIQ app itself — not for filing a new civic complaint.",
"यह केवल GrievIQ ऐप से संबंधित समस्याओं या सुझावों के लिए है — नई नागरिक शिकायत दर्ज करने के लिए नहीं।"
],
"fb.about": [
"What's this about?",
"यह किस बारे में है?"
],
"fb.bug": [
"Bug",
"तकनीकी त्रुटि"
],
"fb.confusing": [
"Confusing to use",
"उपयोग करना कठिन"
],
"fb.suggestion": [
"Suggestion",
"सुझाव"
],
"fb.else": [
"Something else",
"अन्य"
],
"fb.more": [
"Tell us more (optional)",
"विस्तार से बताएँ (वैकल्पिक)"
],
"fb.more_ph": [
"What happened, or what would you like to see?",
"क्या हुआ, या आप क्या सुधार देखना चाहते हैं?"
],
"fb.email": [
"Your email (optional)",
"आपका ईमेल (वैकल्पिक)"
],
"fb.email_hint": [
"Only if you'd like us to follow up with you.",
"केवल तभी, जब आप चाहते हैं कि हम आपसे संपर्क करें।"
],
"fb.send": [
"Send feedback",
"भेजें"
],
"fb.sending": [
"Sending…",
"भेजा जा रहा है…"
],
"fb.pick": [
"Please pick what this is about.",
"कृपया चुनें कि यह किस बारे में है।"
],
"fb.fail": [
"Could not send feedback. Please check your connection and try again.",
"फ़ीडबैक नहीं भेजा जा सका। कृपया अपना इंटरनेट कनेक्शन जाँचें और पुनः प्रयास करें।"
],
"fb.done_title": [
"Got it — thank you",
"प्राप्त हुआ — धन्यवाद"
],
"fb.done_text": [
"We read every message personally. If you shared your email and a fix or reply is needed, we may reach out.",
"हम हर संदेश स्वयं पढ़ते हैं। यदि आपने ईमेल दिया है और सुधार या उत्तर की आवश्यकता है, तो हम आपसे संपर्क कर सकते हैं।"
],
"about.title": [
"About us",
"हमारे बारे में"
],
"about.p1": [
"GrievIQ is an independent civic-tech platform that helps citizens track grievances filed with their elected representatives — corporators, mayors, MLAs, and MPs — and see exactly where a case stands as it moves up the chain when it isn't addressed in time.",
"GrievIQ एक स्वतंत्र नागरिक-तकनीक मंच है, जो नागरिकों को अपने निर्वाचित जनप्रतिनिधियों — पार्षद, महापौर, विधायक और सांसद — के पास दर्ज शिकायतों पर नज़र रखने में सहायता करता है, और यह दिखाता है कि समय पर कार्यवाही न होने पर शिकायत किस स्तर तक पहुँची है।"
],
"about.p2": [
"Every grievance is matched to the correct ward, so you're not complaining to a general city queue — you're routed to the specific representative accountable for your area, with a clear, transparent escalation path if they don't respond in time.",
"हर शिकायत सही वार्ड से जोड़ी जाती है, इसलिए आपकी शिकायत शहर की किसी सामान्य कतार में नहीं जाती — वह सीधे आपके क्षेत्र के उत्तरदायी जनप्रतिनिधि तक पहुँचती है, और समय पर उत्तर न मिलने पर स्पष्ट एवं पारदर्शी तरीके से अगले स्तर तक जाती है।"
],
"about.note": [
"GrievIQ is not officially operated by, endorsed by, or affiliated with any government body, including Lucknow Nagar Nigam or the Government of Uttar Pradesh.",
"GrievIQ किसी भी सरकारी निकाय, जिसमें लखनऊ नगर निगम और उत्तर प्रदेश सरकार भी शामिल हैं, द्वारा आधिकारिक रूप से संचालित, समर्थित या उससे संबद्ध नहीं है।"
],
"about.p3": [
"GrievIQ is built and maintained by IOTC (Indus Overseas Tech. Corp.) as an independent tool to make civic accountability more visible. We're currently piloting in Lucknow, Uttar Pradesh, with a goal of expanding coverage and, in time, working directly with local governments to make this a recognized part of how citizens engage with their representatives.",
"GrievIQ का निर्माण और संचालन IOTC (Indus Overseas Tech. Corp.) द्वारा नागरिक जवाबदेही को अधिक स्पष्ट बनाने के एक स्वतंत्र साधन के रूप में किया जाता है। वर्तमान में इसका प्रायोगिक संचालन लखनऊ, उत्तर प्रदेश में हो रहा है। हमारा लक्ष्य इसका विस्तार करना और समय के साथ स्थानीय सरकारों के साथ मिलकर इसे नागरिकों और जनप्रतिनिधियों के बीच संवाद का एक मान्य माध्यम बनाना है।"
],
"about.q": [
"Questions or feedback?",
"प्रश्न या सुझाव?"
],
"terms.title": [
"Terms of use",
"उपयोग की शर्तें"
],
"terms.updated": [
"Last updated: September 2026",
"अंतिम अद्यतन: सितंबर 2026"
],
"terms.prevails": [
"",
"यह हिन्दी अनुवाद सुविधा के लिए है। हिन्दी और अंग्रेज़ी संस्करण में कोई अंतर होने पर अंग्रेज़ी संस्करण मान्य होगा।"
],
"terms.h1": [
"Using GrievIQ",
"GrievIQ का उपयोग"
],
"terms.p1": [
"By using GrievIQ, you agree to submit grievances in good faith and provide accurate contact information so we can verify your identity and route your case correctly.",
"GrievIQ का उपयोग करके आप सहमत होते हैं कि आप सद्भावना से शिकायत दर्ज करेंगे और सही संपर्क जानकारी देंगे, ताकि हम आपकी पहचान की पुष्टि कर सकें और आपकी शिकायत सही स्थान पर भेज सकें।"
],
"terms.h2": [
"No guarantee of resolution",
"निस्तारण की कोई गारंटी नहीं"
],
"terms.p2": [
"GrievIQ is provided as-is. We surface escalation timing transparently — showing when a case has moved past its usual response time at each level — but we cannot guarantee that any representative will act on a grievance within a specific timeframe, and we cannot compel a response.",
"GrievIQ जैसा है, वैसा ही उपलब्ध कराया जाता है। हम पारदर्शी रूप से दिखाते हैं कि किस स्तर पर शिकायत की निर्धारित समय-सीमा बीत चुकी है, परंतु हम यह गारंटी नहीं दे सकते कि कोई जनप्रतिनिधि निश्चित समय में कार्यवाही करेगा, और न ही हम उत्तर देने के लिए बाध्य कर सकते हैं।"
],
"terms.h3": [
"Acceptable use",
"स्वीकार्य उपयोग"
],
"terms.p3": [
"Misuse of the platform — including false reports, harassment, or spam submissions — may result in your access being restricted.",
"मंच का दुरुपयोग — जैसे झूठी शिकायतें, उत्पीड़न या अनावश्यक (स्पैम) शिकायतें — करने पर आपकी पहुँच सीमित की जा सकती है।"
],
"terms.h4": [
"Independence",
"स्वतंत्रता"
],
"terms.p4": [
"GrievIQ is an independent service and is not officially operated by, endorsed by, or affiliated with any government body. Disputes or concerns about GrievIQ itself should be directed to us, not to any government authority.",
"GrievIQ एक स्वतंत्र सेवा है, जो किसी भी सरकारी निकाय द्वारा आधिकारिक रूप से संचालित, समर्थित या उससे संबद्ध नहीं है। GrievIQ से संबंधित किसी विवाद या चिंता के लिए हमसे संपर्क करें, किसी सरकारी प्राधिकरण से नहीं।"
],
"terms.h5": [
"Contact",
"संपर्क"
],
"priv.title": [
"Privacy policy",
"गोपनीयता नीति"
],
"priv.prevails": [
"",
"यह हिन्दी अनुवाद सुविधा के लिए है। हिन्दी और अंग्रेज़ी संस्करण में कोई अंतर होने पर अंग्रेज़ी संस्करण मान्य होगा।"
],
"priv.h_collect": [
"What we collect, and why",
"हम कौन-सी जानकारी लेते हैं, और क्यों"
],
"priv.no_name": [
"We don't ask for your name.",
"हम आपका नाम नहीं माँगते।"
],
"priv.h_use": [
"How we use it",
"हम इसका उपयोग कैसे करते हैं"
],
"priv.use_intro": [
"We use your information only to:",
"हम आपकी जानकारी का उपयोग केवल निम्न कार्यों के लिए करते हैं:"
],
"priv.u1": [
"Send your complaint to the correct elected representative for your ward, and to each higher level if it isn't dealt with in time",
"आपकी शिकायत आपके वार्ड के सही निर्वाचित जनप्रतिनिधि तक, और समय पर कार्यवाही न होने पर प्रत्येक उच्च स्तर तक पहुँचाना"
],
"priv.u2": [
"Email you when your case is marked resolved, so you can confirm it's fixed or tell us it isn't",
"शिकायत निस्तारित बताए जाने पर आपको ईमेल भेजना, ताकि आप पुष्टि कर सकें कि समस्या हल हुई या नहीं"
],
"priv.u3": [
"Confirm it's you when you track your reports",
"शिकायत की स्थिति देखते समय आपकी पहचान की पुष्टि करना"
],
"priv.u4": [
"Let GrievIQ staff oversee how complaints are handled, for example by reviewing overdue or disputed cases",
"GrievIQ कर्मचारियों द्वारा शिकायतों पर हो रही कार्यवाही की निगरानी, जैसे समय-सीमा बीत चुकी या विवादित शिकायतों की समीक्षा"
],
"priv.no_sell": [
"We do not sell or share your personal data with advertisers or unrelated third parties.",
"हम आपका व्यक्तिगत डेटा न बेचते हैं और न ही विज्ञापनदाताओं या असंबंधित तृतीय पक्षों से साझा करते हैं।"
],
"priv.h_who": [
"Who sees your complaint",
"आपकी शिकायत कौन देख सकता है"
],
"priv.h_device": [
"Stored on your device",
"आपके डिवाइस पर सुरक्षित जानकारी"
],
"priv.device": [
"When you file a report, its tracking number is saved in your browser on that device, so the home page can show how many reports you've filed there. Your language choice is saved the same way. This stays on your device and we can't see it. You can remove the tracking numbers at any time with \"Forget reports on this device\" on the home page.",
"शिकायत दर्ज करने पर उसकी संदर्भ संख्या उसी डिवाइस के ब्राउज़र में सुरक्षित हो जाती है, ताकि मुख्य पृष्ठ पर दिख सके कि उस डिवाइस से कितनी शिकायतें दर्ज की गई हैं। आपकी चुनी गई भाषा भी इसी प्रकार सुरक्षित रहती है। यह जानकारी केवल आपके डिवाइस पर रहती है और हम इसे नहीं देख सकते। मुख्य पृष्ठ पर \"इस डिवाइस से शिकायतें हटाएँ\" से आप संदर्भ संख्याएँ कभी भी हटा सकते हैं।"
],
"priv.h_keep": [
"How long we keep it",
"हम जानकारी कब तक रखते हैं"
],
"priv.keep": [
"Complaint records (tracking number, description, status history) are kept for 3 years from filing, or 1 year after resolution, whichever is longer. Your mobile number and email are kept only as long as the complaint they belong to. One-time codes expire after 10 minutes and work only once: a code is wiped as soon as it's used, and all verification records are deleted within a day.",
"शिकायत के अभिलेख (संदर्भ संख्या, विवरण, स्थिति का इतिहास) दर्ज करने की तिथि से 3 वर्ष तक, या निस्तारण के 1 वर्ष बाद तक — जो भी अधिक हो — रखे जाते हैं। आपका मोबाइल नंबर और ईमेल केवल संबंधित शिकायत के रहने तक रखे जाते हैं। एक-बार उपयोग होने वाले कोड 10 मिनट में समाप्त हो जाते हैं और केवल एक बार काम करते हैं: उपयोग होते ही कोड मिटा दिया जाता है, और सत्यापन के सभी रिकॉर्ड एक दिन के भीतर हटा दिए जाते हैं।"
],
"priv.h_rights": [
"Your rights",
"आपके अधिकार"
],
"priv.board": [
"If you're not satisfied with our response, you can complain to the Data Protection Board of India.",
"यदि आप हमारे उत्तर से संतुष्ट नहीं हैं, तो आप भारतीय डेटा संरक्षण बोर्ड (Data Protection Board of India) में शिकायत कर सकते हैं।"
],
"priv.h_operator": [
"Who operates GrievIQ",
"GrievIQ का संचालन कौन करता है"
],
"common.optional": [
"(optional)",
"(वैकल्पिक)"
],
"common.lang_aria_to_hi": [
"Change language to Hindi",
"भाषा बदलकर हिन्दी करें"
],
"common.lang_aria_to_en": [
"Change language to English",
"भाषा बदलकर अंग्रेज़ी करें"
],
"common.network": [
"Network error. Please check your connection and try again.",
"नेटवर्क त्रुटि। कृपया अपना इंटरनेट कनेक्शन जाँचें और पुनः प्रयास करें।"
],
"submit.email_label": [
"Email address",
"ईमेल पता"
],
"submit.matched_pre": [
"We matched your address to",
"आपका पता इस वार्ड से मिलाया गया:"
],
"submit.matched_includes": [
", which includes {list}",
", जिसमें शामिल हैं: {list}"
],
"submit.matched_post": [
".",
"।"
],
"submit.includes": [
"Includes: ",
"शामिल क्षेत्र: "
],
"submit.ward": [
"ward",
"वार्ड"
],
"submit.village": [
"village",
"गाँव"
],
"submit.filing": [
"Filing...",
"दर्ज की जा रही है..."
],
"submit.addr_unavailable": [
"Couldn't check that address right now. Please search for your area manually below.",
"अभी यह पता जाँचा नहीं जा सका। कृपया नीचे अपना क्षेत्र स्वयं खोजें।"
],
"status.list_lede_one": [
"1 report filed with {email}.",
"{email} से दर्ज 1 शिकायत।"
],
"home.stat_wards_dash": [
"–",
"–"
],
"home.glance": [
"GrievIQ at a glance",
"GrievIQ एक नज़र में"
],
"about.page_title": [
"About us — GrievIQ",
"हमारे बारे में — GrievIQ"
],
"terms.page_title": [
"Terms of use — GrievIQ",
"उपयोग की शर्तें — GrievIQ"
],
"priv.page_title": [
"Privacy policy — GrievIQ",
"गोपनीयता नीति — GrievIQ"
]
};
  var H = {
"common.feedback_card": [
"Problem with the app itself? <strong>Send feedback</strong> — separate from reporting a civic issue.",
"ऐप में ही कोई समस्या है? <strong>सुझाव / फ़ीडबैक भेजें</strong> — यह नागरिक शिकायत दर्ज करने से अलग है।"
],
"home.need": [
"<strong>What you'll need:</strong> your phone number. Add your email to get updates and track your report online.",
"<strong>आवश्यक जानकारी:</strong> आपका मोबाइल नंबर। सूचनाएँ पाने और शिकायत की स्थिति ऑनलाइन देखने के लिए अपना ईमेल भी दें।"
],
"home.emergency": [
"<strong>Emergency?</strong> For fire, gas leaks, accidents or anyone in danger, call <strong>112</strong>. Don't wait for GrievIQ.",
"<strong>आपात स्थिति?</strong> आग, गैस रिसाव, दुर्घटना या किसी के जीवन को ख़तरा होने पर तुरंत <strong>112</strong> पर कॉल करें। GrievIQ की प्रतीक्षा न करें।"
],
"about.reach": [
"Reach us at <a href=\"mailto:support@grieviq.in\" style=\"color:var(--teal-dark);\">support@grieviq.in</a>.",
"हमसे <a href=\"mailto:support@grieviq.in\" style=\"color:var(--teal-dark);\">support@grieviq.in</a> पर संपर्क करें।"
],
"terms.note": [
"GrievIQ is an independent platform, not officially operated by any government authority. See our <a href=\"/about\" style=\"color:var(--teal-dark);\">About us</a> page for details.",
"GrievIQ एक स्वतंत्र मंच है, जो किसी सरकारी प्राधिकरण द्वारा आधिकारिक रूप से संचालित नहीं है। विवरण के लिए <a href=\"/about\" style=\"color:var(--teal-dark);\">\"हमारे बारे में\"</a> पृष्ठ देखें।"
],
"terms.p5": [
"For any questions about these terms, contact us at <a href=\"mailto:support@grieviq.in\" style=\"color:var(--teal-dark);\">support@grieviq.in</a>.",
"इन शर्तों से संबंधित किसी भी प्रश्न के लिए <a href=\"mailto:support@grieviq.in\" style=\"color:var(--teal-dark);\">support@grieviq.in</a> पर संपर्क करें।"
],
"priv.rights": [
"Under India's Digital Personal Data Protection Act, 2023, you may ask to see, correct or delete your personal data, subject to our legitimate need to keep complaint records for accountability. You can also withdraw your consent to us using your data at any time; this doesn't affect anything already done before you withdrew it. To do any of these, email us at <a href=\"mailto:support@grieviq.in\" style=\"color:var(--teal-dark);\">support@grieviq.in</a>.",
"डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023 के अंतर्गत आप अपना व्यक्तिगत डेटा देखने, उसमें सुधार करने या उसे हटाने का अनुरोध कर सकते हैं, बशर्ते जवाबदेही हेतु शिकायत अभिलेख रखने की हमारी वैध आवश्यकता बनी रहे। आप अपने डेटा के उपयोग के लिए दी गई सहमति कभी भी वापस ले सकते हैं; इससे सहमति वापस लेने से पहले की गई कार्यवाही प्रभावित नहीं होती। इनमें से किसी के लिए <a href=\"mailto:support@grieviq.in\" style=\"color:var(--teal-dark);\">support@grieviq.in</a> पर ईमेल करें।"
],
"priv.operator": [
"GrievIQ is built and operated by IOTC (Indus Overseas Tech. Corp.). For any privacy-related questions, reach us at <a href=\"mailto:support@grieviq.in\" style=\"color:var(--teal-dark);\">support@grieviq.in</a>.",
"GrievIQ का निर्माण और संचालन IOTC (Indus Overseas Tech. Corp.) द्वारा किया जाता है। गोपनीयता से संबंधित किसी भी प्रश्न के लिए <a href=\"mailto:support@grieviq.in\" style=\"color:var(--teal-dark);\">support@grieviq.in</a> पर संपर्क करें।"
],
"priv.c_mobile": [
"<strong>Your mobile number</strong> (required): kept with your complaint so it can be identified if you contact us about it.",
"<strong>आपका मोबाइल नंबर</strong> (आवश्यक): आपकी शिकायत के साथ रखा जाता है, ताकि आपके संपर्क करने पर शिकायत की पहचान की जा सके।"
],
"priv.c_email": [
"<strong>Your email address</strong> (optional): to send you a one-time code when you track your reports online, and to email you when your case is marked resolved.",
"<strong>आपका ईमेल पता</strong> (वैकल्पिक): ऑनलाइन शिकायत की स्थिति देखते समय एक-बार उपयोग होने वाला कोड भेजने के लिए, और शिकायत निस्तारित बताए जाने पर आपको सूचना भेजने के लिए।"
],
"priv.c_report": [
"<strong>What you report</strong>: the type of problem, your description, your ward, any location details you give, and any photos you attach. We use these to send your complaint to the right elected representative and show them the problem.",
"<strong>शिकायत का विवरण</strong>: समस्या का प्रकार, आपका विवरण, आपका वार्ड, आपके द्वारा दी गई स्थान संबंधी जानकारी और संलग्न फ़ोटो। इनका उपयोग शिकायत को सही निर्वाचित जनप्रतिनिधि तक पहुँचाने और उन्हें समस्या दिखाने के लिए किया जाता है।"
],
"priv.c_rep": [
"<strong>A representative's name or phone number</strong> (optional, only if you tell us): used only to check and update our records of public representatives.",
"<strong>किसी जनप्रतिनिधि का नाम या फ़ोन नंबर</strong> (वैकल्पिक, केवल यदि आप बताएँ): इसका उपयोग केवल जनप्रतिनिधियों के हमारे अभिलेखों की जाँच और अद्यतन के लिए किया जाता है।"
],
"priv.w_reps": [
"<strong>Your representatives</strong>: the ward representative and, if the case moves up, each level it reaches, see your description, location and photos. They do not see your mobile number or email address.",
"<strong>आपके जनप्रतिनिधि</strong>: वार्ड के जनप्रतिनिधि और, शिकायत आगे बढ़ने पर, हर वह स्तर जहाँ तक वह पहुँचती है — आपका विवरण, स्थान और फ़ोटो देख सकते हैं। वे आपका मोबाइल नंबर या ईमेल पता नहीं देख सकते।"
],
"priv.w_staff": [
"<strong>GrievIQ staff</strong>: see your complaint to oversee how it's handled. Your mobile number and email are partly hidden from them, and every time a staff member opens a case, it is recorded.",
"<strong>GrievIQ कर्मचारी</strong>: कार्यवाही की निगरानी के लिए आपकी शिकायत देखते हैं। आपका मोबाइल नंबर और ईमेल उनसे आंशिक रूप से छिपा रहता है, और कोई कर्मचारी जब भी कोई शिकायत खोलता है, उसका रिकॉर्ड रखा जाता है।"
],
"priv.w_photos": [
"<strong>Photos</strong>: photos are stored at unlisted web addresses. Anyone who has a photo's exact link can open it, so please don't include anything in a photo that you wouldn't want seen.",
"<strong>फ़ोटो</strong>: फ़ोटो ऐसे वेब पतों पर रखी जाती हैं जो कहीं सूचीबद्ध नहीं हैं। किसी फ़ोटो का सटीक लिंक जिसके पास हो, वह उसे खोल सकता है, इसलिए फ़ोटो में ऐसा कुछ शामिल न करें जिसे आप दूसरों को दिखाना नहीं चाहते।"
]
};
  // ---- Representative console (rep.html) ----
  // Same official register as the citizen pages (UP Jansunwai terms).
  var R = {
"rep.page_title": ["GrievIQ — Representative console", "GrievIQ — जनप्रतिनिधि कंसोल"],
"rep.strip": ["GrievIQ · For elected representatives and their offices", "GrievIQ · निर्वाचित जनप्रतिनिधियों एवं उनके कार्यालयों हेतु"],
"rep.title": ["GrievIQ Representative console", "GrievIQ जनप्रतिनिधि कंसोल"],
"rep.subtitle": ["Grievance escalation service", "शिकायत निवारण एवं अग्रेषण सेवा"],
"rep.viewing": ["Viewing", "देख रहे हैं"],
"rep.all_areas": ["All my areas", "मेरे सभी क्षेत्र"],
"rep.n_areas": ["{n} areas", "{n} क्षेत्र"],
"rep.ward": ["Ward", "वार्ड"],
"rep.ward_line": ["Ward: {name}", "वार्ड: {name}"],
"rep.all_wards": ["All wards ({n} cases)", "सभी वार्ड ({n} शिकायतें)"],
"rep.all_wards_one": ["All wards (1 case)", "सभी वार्ड (1 शिकायत)"],
"rep.no_areas_match": ["No matching areas", "कोई मेल खाता क्षेत्र नहीं"],
"rep.no_wards_match": ["No matching wards", "कोई मेल खाता वार्ड नहीं"],
"rep.tab_cases": ["Cases", "शिकायतें"],
"rep.tab_report": ["Report", "रिपोर्ट"],
"rep.register": ["Case register", "शिकायत पंजिका"],
"rep.n_cases": ["{n} cases", "{n} शिकायतें"],
"rep.one_case": ["1 case", "1 शिकायत"],
"rep.showing": ["Showing {x} of {y} cases", "{y} में से {x} शिकायतें"],
"rep.n_late": ["{n} past time limit", "{n} समय-सीमा पार"],
"rep.none": ["No cases currently in your jurisdiction.", "आपके क्षेत्र में अभी कोई शिकायत नहीं है।"],
"rep.none_ward": ["No cases in this ward.", "इस वार्ड में कोई शिकायत नहीं है।"],
"rep.state_red": ["Past time limit", "समय-सीमा पार"],
"rep.state_green": ["Within time", "समय-सीमा के भीतर"],
"rep.state_gold": ["Awaiting citizen", "नागरिक की पुष्टि लंबित"],
"rep.state_done": ["Resolved", "निस्तारित"],
"rep.filed_today": ["Filed today", "आज दर्ज"],
"rep.filed_one": ["Filed 1 day ago", "1 दिन पहले दर्ज"],
"rep.filed_n": ["Filed {n} days ago", "{n} दिन पहले दर्ज"],
"rep.ack_by": ["Acknowledge by {date}", "प्राप्ति स्वीकार करने की अंतिम तिथि: {date}"],
"rep.ack_was_due": ["Acknowledgement was due {date}", "प्राप्ति स्वीकार करने की अंतिम तिथि {date} थी"],
"rep.respond_by": ["Respond by {date}", "कार्यवाही की अंतिम तिथि: {date}"],
"rep.tier_local": ["Local", "स्थानीय"],
"rep.levels_aria": ["Escalation levels", "अग्रेषण के स्तर"],
"rep.lv_not_reached": ["not reached", "अभी नहीं पहुँची"],
"rep.lv_reached": ["reached", "पहुँची"],
"rep.lv_late": ["past time limit", "समय-सीमा पार"],
"rep.lv_ok": ["within time", "समय-सीमा के भीतर"],
"rep.lv_mine": ["(your level)", "(आपका स्तर)"],
"rep.badge_resolved": ["resolved", "निस्तारित"],
"rep.badge_closed": ["closed", "बंद"],
"rep.badge_pending": ["awaiting citizen confirmation", "नागरिक की पुष्टि लंबित"],
"rep.badge_now_with": ["now with {level}", "अब {level} के पास"],
"rep.badge_ack": ["acknowledged {date}", "प्राप्ति स्वीकार: {date}"],
"rep.badge_ack_overdue": ["ack overdue", "प्राप्ति स्वीकार में विलंब"],
"rep.photo_alt": ["Photo {n} attached by the citizen", "नागरिक द्वारा संलग्न फ़ोटो {n}"],
"rep.d_not_fixed": ["Citizen says: not fixed at all", "नागरिक के अनुसार: समस्या बिल्कुल ठीक नहीं हुई"],
"rep.d_partial": ["Citizen says: partially fixed", "नागरिक के अनुसार: समस्या आंशिक रूप से ठीक हुई"],
"rep.d_came_back": ["Citizen says: fixed, but came back", "नागरिक के अनुसार: ठीक हुई थी, पर फिर से आ गई"],
"rep.d_wrong": ["Citizen says: wrong issue was fixed", "नागरिक के अनुसार: गलत समस्या ठीक की गई"],
"rep.d_other": ["Citizen disputed resolution", "नागरिक ने निस्तारण पर आपत्ति की"],
"rep.reminder": ["Reminder from GrievIQ admin", "GrievIQ प्रशासन की ओर से अनुस्मारक"],
"rep.reminders_n": ["{n} reminders so far", "अब तक {n} अनुस्मारक"],
"rep.forwarded": ["Forwarded to:", "अग्रेषित:"],
"rep.forward_to": ["Forward to department", "विभाग को अग्रेषित करें"],
"rep.choose_dept": ["Choose a department", "विभाग चुनें"],
"rep.suggested": ["(suggested)", "(सुझावित)"],
"rep.note_opt": ["Note (optional)", "टिप्पणी (वैकल्पिक)"],
"rep.log_followup": ["Log follow-up", "अनुवर्ती कार्यवाही दर्ज करें"],
"rep.logging": ["Logging…", "दर्ज की जा रही है…"],
"rep.need_dept": ["Choose a department before logging the follow-up.", "अनुवर्ती कार्यवाही दर्ज करने से पहले विभाग चुनें।"],
"rep.acknowledge": ["Acknowledge", "प्राप्ति स्वीकार करें"],
"rep.acknowledging": ["Acknowledging…", "स्वीकार की जा रही है…"],
"rep.mark_resolved": ["Mark resolved", "निस्तारित चिह्नित करें"],
"rep.marking": ["Marking resolved…", "निस्तारित चिह्नित की जा रही है…"],
"rep.err_detail": ["{msg}", "कार्य पूरा नहीं हो सका। ({msg})"],
"rep.report_title": ["Performance report", "कार्य-निष्पादन रिपोर्ट"],
"rep.download_pdf": ["Download PDF", "PDF सहेजें"],
"rep.print": ["Print report", "रिपोर्ट प्रिंट करें"],
"rep.download_csv": ["Download CSV", "CSV डाउनलोड करें (अंग्रेज़ी में)"],
"rep.pdf_hint": ["", "प्रिंट विंडो में गंतव्य (Destination) में “Save as PDF” / “PDF के रूप में सहेजें” चुनें।"],
"rep.from": ["From", "से"],
"rep.to": ["To", "तक"],
"rep.apply": ["Apply", "लागू करें"],
"rep.range": ["{from} to {to}", "{from} से {to} तक"],
"rep.all_time": ["All time", "प्रारंभ"],
"rep.present": ["present", "अब"],
"rep.s_total": ["Total cases", "कुल शिकायतें"],
"rep.s_ack": ["Avg. time to acknowledge", "प्राप्ति स्वीकार का औसत समय"],
"rep.s_resolve": ["Avg. time to resolve", "निस्तारण का औसत समय"],
"rep.s_resolved": ["Resolved", "निस्तारित"],
"rep.s_escalation": ["Escalation rate", "उच्च स्तर पर अग्रेषण दर"],
"rep.s_dispute": ["Dispute rate", "आपत्ति दर"],
"rep.s_nofollow": ["No follow-up", "बिना अनुवर्ती कार्यवाही"],
"rep.hrs": ["{n} hrs", "{n} घंटे"],
"rep.days": ["{n} days", "{n} दिन"],
"rep.by_category": ["By category", "श्रेणी के अनुसार"],
"rep.by_status": ["By status", "स्थिति के अनुसार"],
"rep.no_data": ["No data.", "कोई आँकड़े नहीं।"],
"rep.case_detail": ["Case detail", "शिकायत-वार विवरण"],
"rep.th_ref": ["Ref", "संदर्भ संख्या"],
"rep.th_category": ["Category", "श्रेणी"],
"rep.th_unit": ["Unit", "वार्ड / क्षेत्र"],
"rep.th_status": ["Status", "स्थिति"],
"rep.th_filed": ["Filed", "दर्ज"],
"rep.th_resolved": ["Resolved", "निस्तारित"],
"rep.th_followups": ["Follow-ups", "अनुवर्ती कार्यवाही"],
"rep.st_OPEN": ["open", "लंबित"],
"rep.st_PENDING_CONFIRMATION": ["pending confirmation", "पुष्टि लंबित"],
"rep.st_RESOLVED": ["resolved", "निस्तारित"],
"rep.st_CLOSED": ["closed", "बंद"],
"rep.disputed": ["disputed", "आपत्ति"],
"rep.report_none": ["No cases in this scope yet.", "इस दायरे में अभी कोई शिकायत नहीं है।"],
"rep.report_loading": ["Loading report…", "रिपोर्ट लोड हो रही है…"],
"rep.report_error": ["Could not load the report. Please try again.", "रिपोर्ट लोड नहीं हो सकी। कृपया पुनः प्रयास करें।"],
"rep.report_footer": ["Dispute and escalation rates reflect the complete, permanent case history and cannot be filtered out of this report.", "आपत्ति दर और अग्रेषण दर शिकायतों के पूर्ण, स्थायी इतिहास पर आधारित हैं और इन्हें इस रिपोर्ट से हटाया नहीं जा सकता।"],
"rep.not_provisioned_t": ["Not yet provisioned", "खाता अभी पंजीकृत नहीं"],
"rep.not_provisioned": ["This account is not currently registered as a representative in GrievIQ. Contact your administrator to be added to a jurisdiction.", "यह खाता अभी GrievIQ में जनप्रतिनिधि के रूप में पंजीकृत नहीं है। किसी क्षेत्र से जोड़े जाने के लिए अपने प्रशासक से संपर्क करें।"],
"rep.session_t": ["Session issue", "लॉग-इन में समस्या"],
"rep.session": ["Your login could not be verified. Please refresh the page.", "आपके लॉग-इन की पुष्टि नहीं हो सकी। कृपया पृष्ठ को रीफ़्रेश करें।"],
"rep.ac_short": ["Type {n} or more characters for results", "परिणामों के लिए कम से कम {n} अक्षर लिखें"],
"rep.ac_none": ["No search results", "कोई परिणाम नहीं"],
"rep.ac_selected": ["{option} {n} of {total} is highlighted", "{option}, {total} में से {n}, चयनित"],
"rep.ac_results_one": ["1 result is available. {sel}", "1 परिणाम उपलब्ध है। {sel}"],
"rep.ac_results": ["{n} results are available. {sel}", "{n} परिणाम उपलब्ध हैं। {sel}"],
"rep.ac_hint": ["When autocomplete results are available use up and down arrows to review and enter to select. Touch device users, explore by touch or with swipe gestures.", "परिणाम उपलब्ध होने पर ऊपर-नीचे तीर कुंजियों से देखें और चुनने के लिए Enter दबाएँ। टच डिवाइस पर स्पर्श या स्वाइप से देखें।"]
  };
  for (var rk in R) { if (Object.prototype.hasOwnProperty.call(R, rk)) D[rk] = R[rk]; }

  // ---- Admin pages used by data entry operators and approvers ----
  // (Dashboard, Jurisdiction, Change requests). Same official register.
  var A = {
"adm.brand": ["Admin", "प्रशासन"],
"adm.nav_dashboard": ["Dashboard", "डैशबोर्ड"],
"adm.nav_cases": ["Cases", "शिकायतें"],
"adm.nav_import": ["Import", "आयात"],
"adm.nav_boundaries": ["Ward boundaries", "वार्ड सीमाएँ"],
"adm.nav_jurisdiction": ["Jurisdiction", "क्षेत्राधिकार"],
"adm.nav_exceptions": ["Exceptions", "अपवाद"],
"adm.nav_reviews": ["Reviews", "समीक्षा"],
"adm.nav_changes": ["Change requests", "परिवर्तन अनुरोध"],
"adm.nav_issue_types": ["Issue types", "शिकायत के प्रकार"],
"adm.nav_staff": ["Staff", "कर्मचारी"],
"adm.theme_light": ["Light mode", "लाइट मोड"],
"adm.theme_dark": ["Dark mode", "डार्क मोड"],
"adm.role_super_admin": ["Super admin", "सुपर एडमिन"],
"adm.role_operations_admin": ["Operations admin", "संचालन एडमिन"],
"adm.role_data_moderator": ["Data moderator", "डेटा मॉडरेटर"],
"adm.role_auditor": ["Auditor", "लेखा परीक्षक"],
"adm.role_data_entry_operator": ["Data entry operator", "डेटा एंट्री ऑपरेटर"],
"adm.all_wards": ["All wards", "सभी वार्ड"],
"adm.cancel": ["Cancel", "रद्द करें"],
"adm.save": ["Save", "सहेजें"],
"adm.saving": ["Saving...", "सहेजा जा रहा है..."],
"adm.loading": ["Loading…", "लोड हो रहा है…"],
"adm.network": ["Could not reach the server. Check your connection and try again.", "सर्वर से संपर्क नहीं हो सका। अपना इंटरनेट कनेक्शन जाँचें और पुनः प्रयास करें।"],
"adm.no_access": ["Your account does not have access to this page.", "आपके खाते को इस पृष्ठ की अनुमति नहीं है।"],
"adm.blank": ["(blank)", "(खाली)"],
"adm.f_name": ["Name", "नाम"],
"adm.f_phone": ["Phone", "फ़ोन"],
"adm.f_email": ["Email", "ईमेल"],
"adm.urban_ward": ["Urban ward", "शहरी वार्ड"],
"adm.rural_village": ["Rural village", "ग्रामीण गाँव"],
"adm.type_URBAN": ["URBAN", "शहरी"],
"adm.type_RURAL": ["RURAL", "ग्रामीण"],

"adm.d_title": ["Dashboard", "डैशबोर्ड"],
"adm.d_page_title": ["GrievIQ Admin — Dashboard", "GrievIQ प्रशासन — डैशबोर्ड"],
"adm.d_service_tag": ["Citywide ward data · Lucknow pilot", "नगरव्यापी वार्ड आँकड़े · लखनऊ पायलट"],
"adm.d_sub": ["How complete our ward and representative data is, and what needs attention now. Figures are worked out live from the database each time this page loads.", "वार्ड और जनप्रतिनिधियों के आँकड़े कितने पूर्ण हैं, और अभी किस पर ध्यान देना है। यह पृष्ठ खुलने पर हर बार आँकड़े सीधे डेटाबेस से निकाले जाते हैं।"],
"adm.d_rti": ["Download RTI tracker (CSV)", "RTI ट्रैकर डाउनलोड करें (CSV, अंग्रेज़ी में)"],
"adm.d_refresh": ["Refresh", "रीफ़्रेश करें"],
"adm.d_as_of": ["Figures as of {date}", "आँकड़े {date} तक के"],
"adm.d_all_email": ["All {n} wards and villages have a ward representative email on file.", "सभी {n} वार्डों/गाँवों के जनप्रतिनिधि का ईमेल दर्ज है।"],
"adm.d_no_email": ["{n} of {total} wards and villages have no ward representative email on file, so citizens can't file complaints there yet.", "{total} में से {n} वार्डों/गाँवों के जनप्रतिनिधि का ईमेल दर्ज नहीं है, इसलिए वहाँ के नागरिक अभी शिकायत दर्ज नहीं कर सकते।"],
"adm.d_no_note": ["No data-collection note.", "आँकड़ा-संग्रह संबंधी कोई टिप्पणी नहीं।"],
"adm.d_note_updated": ["Note updated on {date}", "टिप्पणी {date} को अद्यतन की गई"],
"adm.d_note_updated_by": ["Note updated by {who} on {date}", "टिप्पणी {who} द्वारा {date} को अद्यतन की गई"],
"adm.d_edit_note": ["Edit note", "टिप्पणी संपादित करें"],
"adm.d_of": ["of {total}", "/ {total}"],
"adm.d_open": ["Open →", "खोलें →"],
"adm.d_c_filing": ["Wards open for filing", "शिकायत हेतु खुले वार्ड"],
"adm.d_c_filing_h": ["Have a ward representative email, so citizens can file there.", "जनप्रतिनिधि का ईमेल दर्ज है, इसलिए नागरिक वहाँ शिकायत दर्ज कर सकते हैं।"],
"adm.d_c_attention": ["Cases needing attention", "ध्यान देने योग्य शिकायतें"],
"adm.d_c_attention_h": ["Not acknowledged in time, escalated, disputed or in legal review.", "समय पर प्राप्ति स्वीकार नहीं हुई, उच्च स्तर पर अग्रेषित, आपत्ति वाली या विधिक समीक्षा में।"],
"adm.d_c_reviews": ["Pending reviews", "लंबित समीक्षाएँ"],
"adm.d_c_reviews_h": ["Representative details suggested by citizens, waiting for a decision.", "नागरिकों द्वारा सुझाए गए जनप्रतिनिधि विवरण, निर्णय की प्रतीक्षा में।"],
"adm.d_c_bounds": ["Boundaries mapped", "मैप की गई सीमाएँ"],
"adm.d_c_bounds_h": ["Wards with a boundary shape, so addresses can be matched to them.", "जिन वार्डों की सीमा दर्ज है, ताकि पते उनसे मिलाए जा सकें।"],
"adm.d_c_own": ["Your requests waiting", "आपके लंबित अनुरोध"],
"adm.d_c_own_h": ["Changes you asked for that an administrator has not decided yet.", "आपके माँगे गए परिवर्तन जिन पर प्रशासक ने अभी निर्णय नहीं लिया है।"],
"adm.d_c_all": ["Change requests waiting", "लंबित परिवर्तन अनुरोध"],
"adm.d_c_all_h": ["Changes asked for by data entry operators, waiting for approval.", "डेटा एंट्री ऑपरेटरों द्वारा माँगे गए परिवर्तन, अनुमोदन की प्रतीक्षा में।"],
"adm.d_complete": ["Complete", "पूर्ण"],
"adm.d_partial": ["Partial", "आंशिक"],
"adm.d_low": ["Low", "कम"],
"adm.d_name_on_file": ["Name on file", "नाम दर्ज"],
"adm.d_phone_on_file": ["Phone on file", "फ़ोन दर्ज"],
"adm.d_email_on_file": ["Email on file", "ईमेल दर्ज"],
"adm.d_mayor": ["Mayor", "महापौर"],
"adm.d_mayor_only": ["Only wards whose municipal body has a Mayor: {n} of {total}.", "केवल वे वार्ड जिनके नगर निकाय में महापौर है: {total} में से {n}।"],
"adm.d_no_mayor": ["No ward currently has a Mayor level in its escalation chain.", "अभी किसी वार्ड की अग्रेषण श्रृंखला में महापौर स्तर नहीं है।"],
"adm.d_coverage": ["Ward coverage", "वार्ड कवरेज"],
"adm.d_coverage_sub": ["Each bar counts wards and villages. MLA and MP details are counted once per ward, so one missing MLA number can affect many wards.", "हर पट्टी वार्डों और गाँवों की गिनती है। विधायक और सांसद का विवरण हर वार्ड के लिए गिना जाता है, इसलिए विधायक का एक छूटा नंबर कई वार्डों को प्रभावित कर सकता है।"],
"adm.d_rep": ["Ward representative", "वार्ड जनप्रतिनिधि"],
"adm.d_mla": ["MLA", "विधायक"],
"adm.d_mp": ["MP", "सांसद"],
"adm.d_all_levels": ["Across all levels", "सभी स्तरों पर"],
"adm.d_boundary_loaded": ["Ward boundary shape loaded", "वार्ड सीमा दर्ज"],
"adm.d_reachable": ["Fully reachable (every level has an email)", "पूर्णतः संपर्क योग्य (हर स्तर का ईमेल दर्ज)"],
"adm.d_no_mayor_level": ["No Mayor level for this ward", "इस वार्ड के लिए महापौर स्तर नहीं"],
"adm.d_all_on_file": ["All on file", "सब दर्ज"],
"adm.d_on_file": ["On file", "दर्ज"],
"adm.d_missing": ["Missing", "दर्ज नहीं"],
"adm.d_missing_list": ["Missing {list}", "दर्ज नहीं: {list}"],
"adm.d_see_cases": ["See these cases", "ये शिकायतें देखें"],
"adm.d_table": ["Ward by ward", "वार्ड-वार"],
"adm.d_table_sub": ["The same figures as the bars above, for each ward and village. Click a ward name to open it on the Jurisdiction page and fix its details, or a case number to see those cases. \"Needs attention\" uses the same rules as the Exceptions page.", "ऊपर की पट्टियों वाले ही आँकड़े, हर वार्ड और गाँव के लिए। विवरण ठीक करने के लिए वार्ड के नाम पर क्लिक करें (क्षेत्राधिकार पृष्ठ खुलेगा), या शिकायतें देखने के लिए संख्या पर। \"ध्यान देने योग्य\" के नियम अपवाद पृष्ठ जैसे ही हैं।"],
"adm.d_search": ["Search", "खोजें"],
"adm.d_search_ph": ["Ward, MLA, MP or rep name", "वार्ड, विधायक, सांसद या जनप्रतिनिधि का नाम"],
"adm.d_missing_at": ["Missing at", "कहाँ दर्ज नहीं"],
"adm.d_any_level": ["Any level", "कोई भी स्तर"],
"adm.d_boundary_shape": ["Boundary shape", "सीमा"],
"adm.d_not_reachable": ["Not fully reachable", "पूर्णतः संपर्क योग्य नहीं"],
"adm.d_type": ["Type", "प्रकार"],
"adm.d_urban_rural": ["Urban and rural", "शहरी और ग्रामीण"],
"adm.d_urban_wards": ["Urban wards", "शहरी वार्ड"],
"adm.d_rural_villages": ["Rural villages", "ग्रामीण गाँव"],
"adm.d_only_gaps": ["Only wards with gaps", "केवल अधूरे विवरण वाले वार्ड"],
"adm.d_showing": ["Showing <b>{n}</b> of {total} wards", "{total} में से <b>{n}</b> वार्ड"],
"adm.d_showing_one": ["Showing <b>{n}</b> of 1 ward", "1 में से <b>{n}</b> वार्ड"],
"adm.d_no_match": ["No wards match these filters.", "इन फ़िल्टरों से कोई वार्ड मेल नहीं खाता।"],
"adm.d_th_ward": ["Ward / village", "वार्ड / गाँव"],
"adm.d_th_rep_name": ["Rep name", "जनप्रतिनिधि का नाम"],
"adm.d_th_rep_phone": ["Rep phone", "जनप्रतिनिधि का फ़ोन"],
"adm.d_th_rep_email": ["Rep email", "जनप्रतिनिधि का ईमेल"],
"adm.d_th_boundary": ["Boundary", "सीमा"],
"adm.d_th_open": ["Open", "लंबित"],
"adm.d_th_attention": ["Needs attention", "ध्यान देने योग्य"],
"adm.d_mla_of": ["MLA: {name}", "विधानसभा: {name}"],
"adm.d_err_load": ["Could not load the dashboard.", "डैशबोर्ड लोड नहीं हो सका।"],
"adm.d_err_not_admin": ["Your account is not an admin.", "आपका खाता प्रशासक नहीं है।"],
"adm.d_err_role": ["Your role doesn't have access to the dashboard.", "आपकी भूमिका को डैशबोर्ड की अनुमति नहीं है।"],
"adm.d_err_reach": ["Could not reach the server. Check your connection and click Refresh.", "सर्वर से संपर्क नहीं हो सका। कनेक्शन जाँचें और रीफ़्रेश करें।"],
"adm.d_note_title": ["Edit data-collection note", "आँकड़ा-संग्रह टिप्पणी संपादित करें"],
"adm.d_note_ctx": ["Shown under the summary on this dashboard, for example the status of an RTI request. Every change is logged.", "इस डैशबोर्ड के सारांश के नीचे दिखती है, जैसे किसी RTI आवेदन की स्थिति। हर परिवर्तन दर्ज किया जाता है।"],
"adm.d_note_label": ["Data-collection note", "आँकड़ा-संग्रह टिप्पणी"],
"adm.d_note_hint": ["Up to 1,000 characters. Leave it blank to remove the note.", "अधिकतम 1,000 अक्षर। टिप्पणी हटाने के लिए खाली छोड़ दें।"],
"adm.d_note_save": ["Save note", "टिप्पणी सहेजें"],
"adm.d_note_saved": ["Note saved.", "टिप्पणी सहेजी गई।"],
"adm.d_note_err": ["Could not save the note.", "टिप्पणी सहेजी नहीं जा सकी।"],
"adm.d_note_err_role": ["Your role can't edit this note.", "आपकी भूमिका यह टिप्पणी संपादित नहीं कर सकती।"],
"adm.d_note_err_reach": ["Could not reach the server. Try again.", "सर्वर से संपर्क नहीं हो सका। पुनः प्रयास करें।"],

"adm.j_page_title": ["Jurisdiction — GrievIQ Admin", "क्षेत्राधिकार — GrievIQ प्रशासन"],
"adm.j_title": ["Jurisdiction hierarchy", "क्षेत्राधिकार संरचना"],
"adm.j_sub": ["MP constituencies, their MLAs, and each MLA's wards. Fix contact details or correct a ward/MLA's assignment.", "लोकसभा क्षेत्र, उनके विधायक, और हर विधायक के वार्ड। संपर्क विवरण ठीक करें या वार्ड/विधायक का क्षेत्र सुधारें।"],
"adm.j_banner": ["<b>You can request changes.</b> Nothing you send changes the live data straight away: each request is checked and approved by an administrator first. You can follow your requests on <a href=\"/admin-change-requests.html\">Change requests</a>.", "<b>आप परिवर्तन का अनुरोध कर सकते हैं।</b> आपके भेजे अनुरोध से सीधे कोई आँकड़ा नहीं बदलता: हर अनुरोध पहले प्रशासक द्वारा जाँचा और अनुमोदित किया जाता है। अपने अनुरोधों की स्थिति <a href=\"/admin-change-requests.html\">परिवर्तन अनुरोध</a> पर देखें।"],
"adm.j_search_ph": ["Search by MP, MLA, ward/village, or representative name...", "सांसद, विधायक, वार्ड/गाँव या जनप्रतिनिधि के नाम से खोजें..."],
"adm.j_unnamed_mp": ["unnamed MP", "सांसद का नाम दर्ज नहीं"],
"adm.j_unnamed_mla": ["unnamed MLA", "विधायक का नाम दर्ज नहीं"],
"adm.j_no_name": ["no name", "नाम नहीं"],
"adm.j_no_phone": ["no phone", "फ़ोन नहीं"],
"adm.j_no_email": ["no email", "ईमेल नहीं"],
"adm.j_n_mlas": ["{n} MLAs", "{n} विधायक"],
"adm.j_one_mla": ["1 MLA", "1 विधायक"],
"adm.j_n_wards": ["{n} wards", "{n} वार्ड"],
"adm.j_one_ward": ["1 ward", "1 वार्ड"],
"adm.j_mayor": ["Mayor:", "महापौर:"],
"adm.j_waiting": ["Change waiting for approval", "परिवर्तन अनुमोदन हेतु लंबित"],
"adm.j_edit": ["Edit", "संपादित करें"],
"adm.j_edit_mayor": ["Edit mayor", "महापौर संपादित करें"],
"adm.j_reassign": ["Reassign", "क्षेत्र बदलें"],
"adm.j_add": ["+ Add ward/village", "+ वार्ड/गाँव जोड़ें"],
"adm.j_req_change": ["Request change", "परिवर्तन का अनुरोध"],
"adm.j_req_change_mayor": ["Request change (mayor)", "परिवर्तन का अनुरोध (महापौर)"],
"adm.j_req_add": ["+ Request new ward/village", "+ नए वार्ड/गाँव का अनुरोध"],
"adm.j_edit_title": ["Edit {what}", "{what} संपादित करें"],
"adm.j_req_title": ["Request a change — {what}", "परिवर्तन का अनुरोध — {what}"],
"adm.j_reason": ["Reason for the change (required)", "परिवर्तन का कारण (आवश्यक)"],
"adm.j_reason_hint": ["For example: \"Phone number changed, as per RTI reply\" or \"Missing email, found on official website\".", "उदाहरण: \"RTI उत्तर के अनुसार फ़ोन नंबर बदला\" या \"ईमेल दर्ज नहीं था, आधिकारिक वेबसाइट पर मिला\"।"],
"adm.j_source": ["Source (optional)", "स्रोत (वैकल्पिक)"],
"adm.j_source_hint": ["An RTI reply number, a notice, or a link to an official page, so the approver can check it.", "RTI उत्तर संख्या, कोई सूचना, या किसी आधिकारिक पृष्ठ का लिंक, ताकि अनुमोदक जाँच सके।"],
"adm.j_add_reason": ["Reason (required)", "कारण (आवश्यक)"],
"adm.j_add_source_hint": ["For example a delimitation notice, an RTI reply number, or a link to an official page.", "उदाहरण: परिसीमन अधिसूचना, RTI उत्तर संख्या, या किसी आधिकारिक पृष्ठ का लिंक।"],
"adm.j_send": ["Send request", "अनुरोध भेजें"],
"adm.j_sending": ["Sending...", "भेजा जा रहा है..."],
"adm.j_sent": ["Request sent for approval. Nothing has changed yet.", "अनुरोध अनुमोदन हेतु भेजा गया। अभी कुछ नहीं बदला है।"],
"adm.j_updated": ["Contact updated.", "संपर्क विवरण अद्यतन किया गया।"],
"adm.j_did_you_mean": ["Did you mean <b>{email}</b>?", "क्या आपका मतलब <b>{email}</b> था?"],
"adm.j_use": ["Use {email}", "{email} रखें"],
"adm.j_keep": ["Keep {email}", "{email} ही रहने दें"],
"adm.j_add_title": ["Add ward or village", "वार्ड या गाँव जोड़ें"],
"adm.j_req_add_title": ["Request a new ward or village", "नए वार्ड या गाँव का अनुरोध"],
"adm.j_send_another": ["Send and request another", "भेजें और एक और अनुरोध करें"],
"adm.j_save_another": ["Save and add another", "सहेजें और एक और जोड़ें"],
"adm.j_req_add_sent": ["Request to add {name} sent for approval. Nothing has changed yet.", "{name} जोड़ने का अनुरोध अनुमोदन हेतु भेजा गया। अभी कुछ नहीं बदला है।"],
"adm.j_err_save": ["Failed to save.", "सहेजा नहीं जा सका।"],
"adm.j_err_load": ["Could not load jurisdiction data.", "क्षेत्राधिकार आँकड़े लोड नहीं हो सके।"],

"adm.c_page_title": ["GrievIQ Admin — Change requests", "GrievIQ प्रशासन — परिवर्तन अनुरोध"],
"adm.c_title": ["Change requests", "परिवर्तन अनुरोध"],
"adm.c_title_own": ["My requests", "मेरे अनुरोध"],
"adm.c_sub": ["Changes requested by data entry operators. Nothing changes until you approve it; each approval applies exactly what is shown.", "डेटा एंट्री ऑपरेटरों द्वारा माँगे गए परिवर्तन। आपके अनुमोदन तक कुछ नहीं बदलता; हर अनुमोदन ठीक वही लागू करता है जो दिखाया गया है।"],
"adm.c_sub_own": ["Changes you have requested. Each one is checked by an administrator before it takes effect.", "आपके माँगे गए परिवर्तन। हर परिवर्तन लागू होने से पहले प्रशासक द्वारा जाँचा जाता है।"],
"adm.c_st_PENDING": ["Waiting for approval", "अनुमोदन हेतु लंबित"],
"adm.c_st_APPROVED": ["Approved", "अनुमोदित"],
"adm.c_st_REJECTED": ["Rejected", "अस्वीकृत"],
"adm.c_st_WITHDRAWN": ["Withdrawn", "वापस लिया गया"],
"adm.c_st_OUT_OF_DATE": ["Out of date", "पुराना (रिकॉर्ड बदल चुका)"],
"adm.c_detail": ["Detail", "विवरण"],
"adm.c_current": ["Current", "वर्तमान"],
"adm.c_before": ["Before", "पहले"],
"adm.c_requested": ["Requested", "अनुरोधित"],
"adm.c_when_requested": ["when requested: {v}", "अनुरोध के समय: {v}"],
"adm.c_add_ward": ["Ward / village", "वार्ड / गाँव"],
"adm.c_add_type": ["Type", "प्रकार"],
"adm.c_add_rep": ["Representative", "जनप्रतिनिधि"],
"adm.c_add_localities": ["Localities", "मोहल्ले"],
"adm.c_requested_by": ["Requested by {who} · {date}", "{who} द्वारा अनुरोध · {date}"],
"adm.c_sent_on": ["Sent {date}", "भेजा गया {date}"],
"adm.c_decided": [" · decided {date}", " · निर्णय {date}"],
"adm.c_decided_by": [" · decided {date} by {who}", " · निर्णय {date}, {who} द्वारा"],
"adm.c_withdrawn": [" · withdrawn {date}", " · वापस लिया गया {date}"],
"adm.c_reason": ["Reason:", "कारण:"],
"adm.c_source": ["Source:", "स्रोत:"],
"adm.c_none_given": ["none given", "नहीं दिया गया"],
"adm.c_why_rejected": ["Why it was rejected:", "अस्वीकृति का कारण:"],
"adm.c_note": ["Note:", "टिप्पणी:"],
"adm.c_ood": ["This record has changed since the request was made, so it can no longer be approved as it is. Reject it with a note, and the operator can send a new request.", "अनुरोध के बाद यह रिकॉर्ड बदल चुका है, इसलिए इसे अब ऐसे ही अनुमोदित नहीं किया जा सकता। टिप्पणी के साथ अस्वीकार करें; ऑपरेटर नया अनुरोध भेज सकता है।"],
"adm.c_approve": ["Approve", "अनुमोदित करें"],
"adm.c_reject": ["Reject", "अस्वीकार करें"],
"adm.c_reject_label": ["Why is it rejected? (the operator will see this)", "अस्वीकृति का कारण? (ऑपरेटर इसे देखेगा)"],
"adm.c_reject_send": ["Reject request", "अनुरोध अस्वीकार करें"],
"adm.c_own_note": ["This is your own request. Another administrator must decide it.", "यह आपका अपना अनुरोध है। इस पर किसी अन्य प्रशासक को निर्णय लेना होगा।"],
"adm.c_withdraw": ["Withdraw request", "अनुरोध वापस लें"],
"adm.c_withdraw_confirm": ["Withdraw this request? It will not be applied.", "यह अनुरोध वापस लें? इसे लागू नहीं किया जाएगा।"],
"adm.c_withdrawn_ok": ["Request withdrawn.", "अनुरोध वापस ले लिया गया।"],
"adm.c_select": ["Select request: {label}", "अनुरोध चुनें: {label}"],
"adm.c_show": ["Show", "दिखाएँ"],
"adm.c_tab_waiting": ["Waiting ({n})", "लंबित ({n})"],
"adm.c_tab_decided": ["Recent decisions", "हाल के निर्णय"],
"adm.c_select_all": ["Select all", "सभी चुनें"],
"adm.c_approve_selected": ["Approve selected", "चुने हुए अनुमोदित करें"],
"adm.c_empty_pending": ["No requests are waiting.", "कोई अनुरोध लंबित नहीं है।"],
"adm.c_empty_decided": ["No decisions yet.", "अभी कोई निर्णय नहीं।"],
"adm.c_empty_own": ["You have not sent any requests yet. Use Request change on the Jurisdiction page.", "आपने अभी कोई अनुरोध नहीं भेजा है। क्षेत्राधिकार पृष्ठ पर \"परिवर्तन का अनुरोध\" का उपयोग करें।"],
"adm.c_approving": ["Approving {n} request(s)...", "{n} अनुरोध अनुमोदित किए जा रहे हैं..."],
"adm.c_r_approved": ["{n} approved and applied", "{n} अनुमोदित और लागू"],
"adm.c_r_ood": ["{n} out of date (not applied)", "{n} पुराने (लागू नहीं)"],
"adm.c_r_invalid": ["{n} failed the checks (not applied)", "{n} जाँच में विफल (लागू नहीं)"],
"adm.c_r_decided": ["{n} already decided", "{n} पर पहले ही निर्णय हो चुका"],
"adm.c_r_own": ["{n} your own (not allowed)", "{n} आपके अपने (अनुमति नहीं)"],
"adm.c_res_rejected": ["Rejected.", "अस्वीकार किया गया।"],
"adm.c_res_decided": ["Already decided by someone else. Refresh to see it.", "किसी अन्य ने पहले ही निर्णय ले लिया है। देखने के लिए रीफ़्रेश करें।"],
"adm.c_res_own": ["You can't decide your own request.", "आप अपने अनुरोध पर निर्णय नहीं ले सकते।"],
"adm.c_need_note": ["Give the reason for rejecting. The operator will see it.", "अस्वीकृति का कारण लिखें। ऑपरेटर इसे देखेगा।"],
"adm.c_tick_first": ["Tick at least one request first.", "पहले कम से कम एक अनुरोध चुनें।"],
"adm.c_confirm_approve": ["Approve and apply {n} request(s)?", "{n} अनुरोध अनुमोदित और लागू करें?"],
"adm.c_err_role": ["Your role can't approve requests.", "आपकी भूमिका अनुरोध अनुमोदित नहीं कर सकती।"],
"adm.c_err_failed": ["Failed.", "असफल।"],
"adm.c_err_load": ["Could not load requests ({err}).", "अनुरोध लोड नहीं हो सके ({err})।"],
"adm.c_err_network": ["Network error. Try again.", "नेटवर्क त्रुटि। पुनः प्रयास करें।"],
"adm.c_err_network_approve": ["Network error. Nothing was lost; try again.", "नेटवर्क त्रुटि। कुछ भी नष्ट नहीं हुआ; पुनः प्रयास करें।"]
  };
  for (var ak in A) { if (Object.prototype.hasOwnProperty.call(A, ak)) D[ak] = A[ak]; }

  var A2 = {
"adm.j_edit_contact": ["Edit contact", "संपर्क संपादित करें"],
"adm.j_new_parent": ["New parent", "नया क्षेत्र"],
"adm.j_reassign_mla_title": ["Reassign MLA constituency", "विधानसभा क्षेत्र का लोकसभा क्षेत्र बदलें"],
"adm.j_reassign_mla_desc": ["Move \"{name}\" under a different MP constituency. This changes which MP's mandate covers this MLA's wards.", "\"{name}\" को किसी अन्य लोकसभा क्षेत्र में ले जाएँ। इससे बदलेगा कि इस विधायक के वार्ड किस सांसद के क्षेत्राधिकार में आते हैं।"],
"adm.j_new_mp": ["New MP constituency", "नया लोकसभा क्षेत्र"],
"adm.j_reassign_ward_title": ["Reassign ward", "वार्ड का विधानसभा क्षेत्र बदलें"],
"adm.j_reassign_ward_desc": ["Move \"{name}\" under a different MLA constituency. This changes which MLA's mandate covers this ward.", "\"{name}\" को किसी अन्य विधानसभा क्षेत्र में ले जाएँ। इससे बदलेगा कि यह वार्ड किस विधायक के क्षेत्राधिकार में आता है।"],
"adm.j_new_mla": ["New MLA constituency", "नया विधानसभा क्षेत्र"],
"adm.j_reassign_confirm": ["This will immediately change which representative's mandate covers this. Continue?", "इससे तुरंत बदल जाएगा कि यह किस जनप्रतिनिधि के क्षेत्राधिकार में है। जारी रखें?"],
"adm.j_reassigning": ["Reassigning...", "क्षेत्र बदला जा रहा है..."],
"adm.j_reassign_err": ["Failed to reassign.", "क्षेत्र नहीं बदला जा सका।"],
"adm.j_reassigned": ["Reassigned successfully.", "क्षेत्र सफलतापूर्वक बदला गया।"],
"adm.j_reassign_net": ["Network error while reassigning.", "क्षेत्र बदलते समय नेटवर्क त्रुटि।"],
"adm.j_type": ["Type", "प्रकार"],
"adm.j_mb": ["Municipal body", "नगर निकाय"],
"adm.j_mb_hint": ["Wards under a body with a Mayor escalate to the Mayor before the MLA.", "महापौर वाले नगर निकाय के वार्ड विधायक से पहले महापौर तक अग्रेषित होते हैं।"],
"adm.j_rep_optional": ["{role} (optional)", "{role} (वैकल्पिक)"],
"adm.j_representative": ["Representative", "जनप्रतिनिधि"],
"adm.j_localities": ["Localities (optional)", "मोहल्ले (वैकल्पिक)"],
"adm.j_localities_ph": ["e.g. Hazratganj; Ashok Marg", "जैसे Hazratganj; Ashok Marg"],
"adm.j_localities_hint": ["Separate neighbourhoods with semicolons. Used to match citizens' addresses to this ward.", "मोहल्लों को अर्धविराम (;) से अलग करें। इससे नागरिकों के पते इस वार्ड से मिलाए जाते हैं।"],
"adm.j_none": ["None", "कोई नहीं"],
"adm.j_has_mayor": [" (has Mayor)", " (महापौर सहित)"],
"adm.j_adding_under": ["Adding under <b>{mla}</b>", "<b>{mla}</b> के अंतर्गत जोड़ रहे हैं"],
"adm.j_added_next": ["Added <b>{name}</b>. Add the next one under <b>{mla}</b>", "<b>{name}</b> जोड़ा गया। <b>{mla}</b> के अंतर्गत अगला जोड़ें"],
"adm.j_sent_next": ["Request sent for <b>{name}</b>. Request the next one under <b>{mla}</b>", "<b>{name}</b> का अनुरोध भेजा गया। <b>{mla}</b> के अंतर्गत अगले का अनुरोध करें"],
"adm.j_added": ["Added {name} under {mla}.", "{mla} के अंतर्गत {name} जोड़ा गया।"],
"adm.j_err_name": ["Enter a name for the ward or village.", "वार्ड या गाँव का नाम लिखें।"],
"adm.j_err_type": ["Choose Urban ward or Rural village.", "शहरी वार्ड या ग्रामीण गाँव चुनें।"],
"adm.j_err_add": ["Could not add this ward or village.", "यह वार्ड या गाँव जोड़ा नहीं जा सका।"],
"adm.srv_phone": ["Enter a valid Indian phone number: a 10-digit mobile starting with 6, 7, 8 or 9 (for example 9876543210), or a landline with its STD code (for example 0522 2234567).", "मान्य भारतीय फ़ोन नंबर लिखें: 6, 7, 8 या 9 से शुरू होने वाला 10 अंकों का मोबाइल (जैसे 9876543210), या STD कोड सहित लैंडलाइन (जैसे 0522 2234567)।"],
"adm.srv_email": ["Enter the email address in the format name@example.com.", "ईमेल पता name@example.com के प्रारूप में लिखें।"],
"adm.srv_domain": ["The email domain \"{d}\" can't receive email. Check the part after @.", "ईमेल डोमेन \"{d}\" पर ईमेल नहीं पहुँच सकता। @ के बाद वाला भाग जाँचें।"],
"adm.srv_name_len": ["Keep the name to 120 characters or fewer.", "नाम 120 अक्षरों से अधिक न हो।"],
"adm.srv_reason": ["Give the reason for this request (at least a few words).", "इस अनुरोध का कारण लिखें (कम से कम कुछ शब्द)।"],
"adm.srv_nothing": ["Nothing has changed. Edit at least one detail before sending the request.", "कुछ नहीं बदला है। अनुरोध भेजने से पहले कम से कम एक विवरण बदलें।"],
"adm.srv_waiting": ["A change to this record is already waiting for approval. Wait for that decision, or withdraw it from My requests.", "इस रिकॉर्ड का एक परिवर्तन पहले से अनुमोदन हेतु लंबित है। उस निर्णय की प्रतीक्षा करें, या उसे \"मेरे अनुरोध\" से वापस लें।"],
"adm.srv_dup_ward": ["A ward or village named \"{name}\" already exists under this MLA. Use Edit on that row instead.", "इस विधायक के अंतर्गत \"{name}\" नाम का वार्ड या गाँव पहले से है। उसी पंक्ति पर संपादन/अनुरोध का उपयोग करें।"],
"adm.c_lbl_mp": ["MP", "सांसद"],
"adm.c_lbl_mla": ["MLA", "विधायक"],
"adm.c_lbl_ward": ["Ward representative", "वार्ड जनप्रतिनिधि"],
"adm.c_lbl_mayor": ["Mayor", "महापौर"],
"adm.c_lbl_new_ward": ["New ward under {mla}", "{mla} के अंतर्गत नया वार्ड"],
"adm.c_lbl_new_village": ["New village under {mla}", "{mla} के अंतर्गत नया गाँव"],
"adm.srv_dup_req": ["A request to add \"{name}\" under this MLA is already waiting for approval.", "इस विधायक के अंतर्गत \"{name}\" जोड़ने का अनुरोध पहले से अनुमोदन हेतु लंबित है।"]
  };
  for (var ak2 in A2) { if (Object.prototype.hasOwnProperty.call(A2, ak2)) D[ak2] = A2[ak2]; }

  // ---- Home: "Where is the problem?" (location-first, Sept 2026) ----
  var L = {
"home.loc_q": ["Where is the problem?", "समस्या कहाँ है?"],
"home.loc_sub": ["Find the ward first. We'll show you who is responsible there.", "पहले वार्ड खोजें। हम बताएँगे कि वहाँ कौन ज़िम्मेदार है।"],
"home.loc_gps": ["Use my current location", "मेरी वर्तमान लोकेशन का उपयोग करें"],
"home.loc_gps_note": ["We use your location only to find the ward. It isn't saved unless you file a complaint.", "आपकी लोकेशन का उपयोग केवल वार्ड खोजने के लिए होता है। शिकायत दर्ज न करने पर यह सहेजी नहीं जाती।"],
"home.loc_search_label": ["Or search an address, landmark or PIN code", "या पता, कोई प्रसिद्ध स्थान या पिन कोड खोजें"],
"home.loc_map_btn": ["Pick the spot on a map", "नक्शे पर स्थान चुनें"],
"home.loc_map_hint": ["Tap the map to place the pin. Tap again to move it.", "पिन लगाने के लिए नक्शे पर टैप करें। बदलने के लिए दोबारा टैप करें।"],
"home.loc_map_use": ["Use this spot", "यह स्थान चुनें"],
"home.loc_map_cancel": ["Cancel", "रद्द करें"],
"home.loc_list": ["Or choose your ward from the list", "या सूची से अपना वार्ड चुनें"],
"home.loc_finding": ["Finding the ward…", "वार्ड खोजा जा रहा है…"],
"home.loc_gps_denied": ["Location permission wasn't given. You can search for the address instead.", "लोकेशन की अनुमति नहीं मिली। इसके बजाय पता खोजें।"],
"home.loc_gps_unavailable": ["Your location couldn't be found. Please search for the address instead.", "आपकी लोकेशन नहीं मिल सकी। कृपया पता खोजें।"],
"home.loc_ward": ["Ward", "वार्ड"],
"home.loc_village": ["Village", "गाँव"],
"home.loc_who": ["Who handles complaints here", "यहाँ शिकायतें कौन देखता है"],
"home.loc_not_on_record": ["not yet on record", "अभी दर्ज नहीं"],
"home.loc_snapshot": ["In the last 30 days: <b>{filed}</b> complaints filed · <b>{resolved}</b> resolved", "पिछले 30 दिनों में: <b>{filed}</b> शिकायतें दर्ज · <b>{resolved}</b> निस्तारित"],
"home.loc_report_here": ["Report a problem here", "यहाँ की समस्या दर्ज करें"],
"home.loc_adjust": ["Adjust pin", "पिन बदलें"],
"home.loc_share": ["Share this ward:", "यह वार्ड साझा करें:"],
"home.loc_whatsapp": ["WhatsApp", "व्हाट्सऐप"],
"home.loc_copy": ["Copy link", "लिंक कॉपी करें"],
"home.loc_copied": ["Link copied", "लिंक कॉपी हो गया"],
"home.loc_share_text": ["Report civic problems in {place} on GrievIQ:", "{place} की नागरिक समस्याएँ GrievIQ पर दर्ज करें:"],
"home.loc_change": ["Change location", "स्थान बदलें"],
"home.loc_saved": ["Your ward", "आपका वार्ड"],
"home.loc_forget": ["Forget", "भूल जाएँ"],
"home.loc_title": ["Get civic problems in {place} fixed", "{place} की नागरिक समस्याओं का समाधान कराएँ"],
"home.loc_not_open": ["We know this ward, but it can't take complaints yet. Its details are still being collected.", "हम इस वार्ड को जानते हैं, पर यहाँ अभी शिकायत दर्ज नहीं हो सकती। इसका विवरण अभी एकत्र किया जा रहा है।"],
"home.loc_outside": ["GrievIQ doesn't cover this location yet.", "GrievIQ अभी इस स्थान पर उपलब्ध नहीं है।"],
"home.loc_outside_where": ["You can still complain here:", "आप यहाँ शिकायत कर सकते हैं:"],
"home.loc_alt_up": ["<b>Uttar Pradesh:</b> <a href=\"https://jansunwai.up.nic.in\" target=\"_blank\" rel=\"noopener noreferrer\">Jansunwai (IGRS)</a>, or call the CM Helpline <b>1076</b>.", "<b>उत्तर प्रदेश:</b> <a href=\"https://jansunwai.up.nic.in\" target=\"_blank\" rel=\"noopener noreferrer\">जनसुनवाई (IGRS)</a>, या मुख्यमंत्री हेल्पलाइन <b>1076</b> पर कॉल करें।"],
"home.loc_alt_india": ["<b>Anywhere in India:</b> <a href=\"https://pgportal.gov.in\" target=\"_blank\" rel=\"noopener noreferrer\">CPGRAMS</a>, the Government of India's public grievance portal.", "<b>पूरे भारत में:</b> <a href=\"https://pgportal.gov.in\" target=\"_blank\" rel=\"noopener noreferrer\">CPGRAMS</a>, भारत सरकार का लोक शिकायत पोर्टल।"],
"home.loc_want": ["I want GrievIQ in {city}", "मुझे {city} में GrievIQ चाहिए"],
"home.loc_want_done": ["Thanks. We've counted your request for {city}.", "धन्यवाद। {city} के लिए आपका अनुरोध गिन लिया गया है।"],
"home.loc_search_fail": ["Address search couldn't load. You can still use your location or choose from the list.", "पता खोज लोड नहीं हो सकी। आप अब भी अपनी लोकेशन या सूची का उपयोग कर सकते हैं।"],
"home.loc_ambiguous": ["More than one ward has this name. Please choose:", "इस नाम के एक से अधिक वार्ड हैं। कृपया चुनें:"],
"home.loc_link_missing": ["That ward link wasn't found. Please find the ward below.", "यह वार्ड लिंक नहीं मिला। कृपया नीचे वार्ड खोजें।"]
  };
  for (var lk in L) { if (Object.prototype.hasOwnProperty.call(L, lk)) D[lk] = L[lk]; }

  var lang = 'en';
  try { if (localStorage.getItem(STORE) === 'hi') lang = 'hi'; } catch (e) {}
  document.documentElement.lang = lang;

  // Devanagari fonts + switcher style.
  var fl = document.createElement('link');
  fl.rel = 'stylesheet';
  fl.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Serif+Devanagari:wght@600;700&display=swap';
  document.head.appendChild(fl);
  var st = document.createElement('style');
  st.textContent =
    "html[lang='hi'] body, html[lang='hi'] button, html[lang='hi'] input, html[lang='hi'] textarea, html[lang='hi'] select { font-family: 'Noto Sans Devanagari', 'Inter', system-ui, sans-serif; }" +
    "html[lang='hi'] h1, html[lang='hi'] h2, html[lang='hi'] .section-title, html[lang='hi'] .stat-value { font-family: 'Noto Serif Devanagari', 'Source Serif 4', serif; }" +
    ".lang-toggle { background: none; border: 1px solid rgba(255,255,255,0.35); color: inherit; border-radius: 6px; font: inherit; font-size: 12px; line-height: 1.4; padding: 2px 10px; cursor: pointer; }" +
    ".lang-toggle:hover, .lang-toggle:focus-visible { border-color: #fff; color: #fff; outline: none; }" +
    "[data-i18n-only][hidden] { display: none !important; }";
  document.head.appendChild(st);

  function pick(entry) { return entry ? (lang === 'hi' ? (entry[1] || entry[0]) : entry[0]) : null; }
  function fill(s, vars) {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
  }
  function t(key, vars) {
    var s = pick(D[key]);
    if (s == null) s = pick(H[key]);
    if (s == null) return key;
    return fill(s, vars);
  }
  function has(key) { return !!(D[key] || H[key]); }

  function updateToggles() {
    var to = lang === 'hi' ? 'en' : 'hi';
    document.querySelectorAll('[data-lang-toggle]').forEach(function (b) {
      b.textContent = to === 'hi' ? 'हिन्दी' : 'English';
      b.setAttribute('lang', to);
      b.setAttribute('aria-label', t(to === 'hi' ? 'common.lang_aria_to_hi' : 'common.lang_aria_to_en'));
    });
  }

  function apply(root) {
    root = root || document;
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    root.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    root.querySelectorAll('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    root.querySelectorAll('[data-i18n-only]').forEach(function (el) { el.hidden = el.getAttribute('data-i18n-only') !== lang; });
    var title = document.querySelector('title[data-i18n]');
    if (title) document.title = t(title.getAttribute('data-i18n'));
    updateToggles();
  }

  function setLang(l) {
    lang = l === 'hi' ? 'hi' : 'en';
    try { localStorage.setItem(STORE, lang); } catch (e) {}
    apply();
    document.dispatchEvent(new CustomEvent('giq:lang', { detail: { lang: lang } }));
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-lang-toggle]');
    if (b) { e.preventDefault(); setLang(lang === 'hi' ? 'en' : 'hi'); }
  });

  // Names that come from the database, translated by their fixed id / English name.
  var LEVELS = { 'Corporator': 'level.corporator', 'Gram Pradhan': 'level.pradhan', 'Mayor': 'level.mayor', 'MLA': 'level.mla', 'MP': 'level.mp' };
  var DEPTS = { 'Water Supply': 'dept.water', 'Electricity': 'dept.electricity', 'Sanitation / Garbage': 'dept.sanitation',
    'Roads & Public Works': 'dept.roads', 'Health': 'dept.health', 'Legal / Land Records': 'dept.legal', 'Other': 'dept.other' };

  window.GIQ = {
    get lang() { return lang; },
    t: t,
    has: has,
    apply: apply,
    setLang: setLang,
    locale: function () { return lang === 'hi' ? 'hi-IN' : 'en-IN'; },
    category: function (id, name) { return has('cat.' + id) ? t('cat.' + id) : (name || ''); },
    level: function (label) { return LEVELS[label] ? t(LEVELS[label]) : (label || ''); },
    dept: function (name) { return DEPTS[name] ? t(DEPTS[name]) : (name || ''); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(); });
  else apply();
})();
