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
"Up to 3 photos. They help your representative understand the issue faster. Only your representatives and GrievIQ staff can see them.",
"अधिकतम 3 फ़ोटो। इनसे जनप्रतिनिधि को समस्या जल्दी समझ आती है। इन्हें केवल आपके जनप्रतिनिधि और GrievIQ कर्मचारी देख सकते हैं।"
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
"Each photo must be smaller than 25 MB.",
"प्रत्येक फ़ोटो 25 MB से छोटी होनी चाहिए।"
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
"status.res_title": [
"What the representative says was done",
"जनप्रतिनिधि के अनुसार की गई कार्यवाही"
],
"status.before": [
"Before (your photos)",
"पहले (आपकी फ़ोटो)"
],
"status.after": [
"After (representative's photos)",
"बाद में (जनप्रतिनिधि की फ़ोटो)"
],
"status.before_alt": [
"Your photo {n}, before",
"आपकी फ़ोटो {n}, पहले"
],
"status.after_alt": [
"Representative's photo {n}, after",
"जनप्रतिनिधि की फ़ोटो {n}, बाद में"
],
"status.no_before": [
"You didn't add photos.",
"आपने फ़ोटो नहीं जोड़ी थी।"
],
"status.no_after": [
"No photo added.",
"कोई फ़ोटो नहीं जोड़ी गई।"
],
"status.no_after_reason": [
"No photo. Reason given: {reason}",
"फ़ोटो नहीं। बताया गया कारण: {reason}"
],
"status.photo_unavailable": [
"Photo unavailable. Refresh the page to try again.",
"फ़ोटो उपलब्ध नहीं। पुनः प्रयास के लिए पृष्ठ रीफ़्रेश करें।"
],
"status.ev_date_before": [
"This photo seems to have been taken before you filed your complaint.",
"यह फ़ोटो आपकी शिकायत दर्ज होने से पहले ली गई लगती है।"
],
"status.ev_date_future": [
"This photo's date looks wrong.",
"इस फ़ोटो की तिथि सही नहीं लगती।"
],
"status.ev_far": [
"This photo seems to have been taken about {dist} in a straight line from the spot you marked.",
"यह फ़ोटो आपके चिह्नित स्थान से सीधी रेखा में लगभग {dist} दूर ली गई लगती है।"
],
"status.ev_reused": [
"This photo has also been used on another complaint.",
"यह फ़ोटो किसी दूसरी शिकायत में भी उपयोग की गई है।"
],
"status.ev_dev_far": [
"The representative added this photo about {dist} in a straight line from the spot you marked.",
"जनप्रतिनिधि ने यह फ़ोटो आपके चिह्नित स्थान से सीधी रेखा में लगभग {dist} दूर से जोड़ी।"
],
"status.ev_dev_outside": [
"The representative added this photo from outside your ward.",
"जनप्रतिनिधि ने यह फ़ोटो आपके वार्ड के बाहर से जोड़ी।"
],
"status.ev_photo_outside": [
"This photo seems to have been taken outside your ward.",
"यह फ़ोटो आपके वार्ड के बाहर ली गई लगती है।"
],
"status.ev_citizen": [
"This is one of your own photos.",
"यह आपकी अपनी फ़ोटो में से एक है।"
],
"status.confirming": [
"Confirming…",
"पुष्टि की जा रही है…"
],
"status.submitting": [
"Submitting…",
"जमा किया जा रहा है…"
],
"status.confirm_by": [
"If we don't hear from you by {date}, this case will be closed as resolved (not confirmed by you).",
"यदि {date} तक आपका उत्तर नहीं मिलता, तो यह शिकायत निस्तारित (आपके द्वारा पुष्टि नहीं) मानकर बंद कर दी जाएगी।"
],
"status.not_waiting": [
"This case is no longer waiting for your reply. It may have been closed because we didn't hear from you in time.",
"यह शिकायत अब आपके उत्तर की प्रतीक्षा में नहीं है। समय पर उत्तर न मिलने के कारण इसे बंद किया जा चुका हो सकता है।"
],
"status.tier_waiting": [
"Marked resolved — waiting for your confirmation",
"निस्तारित बताया गया — आपकी पुष्टि की प्रतीक्षा है"
],
"status.outcome_confirmed": [
"You confirmed this was fixed. Thank you for letting us know.",
"आपने पुष्टि की कि समस्या हल हो गई है। बताने के लिए धन्यवाद।"
],
"status.outcome_not_confirmed": [
"Closed as resolved. We didn't hear back from you within 7 days of the representative marking it resolved, so it was closed without your confirmation.",
"निस्तारित मानकर बंद। जनप्रतिनिधि द्वारा निस्तारित बताए जाने के 7 दिन के भीतर आपका उत्तर नहीं मिला, इसलिए इसे आपकी पुष्टि के बिना बंद किया गया।"
],
"status.outcome_no_email": [
"Closed as resolved. It was closed on the representative's word, as no email was given to ask for confirmation.",
"निस्तारित मानकर बंद। पुष्टि के लिए कोई ईमेल नहीं दिया गया था, इसलिए इसे जनप्रतिनिधि की सूचना के आधार पर बंद किया गया।"
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
"priv.u5": [
"Check with you by phone, if you gave no email, whether your problem was really fixed",
"यदि आपने ईमेल नहीं दिया है, तो फ़ोन पर आपसे जाँचना कि आपकी समस्या वास्तव में हल हुई या नहीं"
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
"Complaint records (tracking number, description, status history) are kept for 3 years from filing, or 1 year after resolution, whichever is longer. Your mobile number and email are kept only as long as the complaint they belong to. When that time ends, your phone number, email, the complaint text, location, photos and any notes are removed; the tracking number, ward, issue type and dates are kept for statistics, without anything that identifies you. If you gave an email, we tell you 7 days before. A case is kept longer only while it is under a legal hold or an audit review. Sign-in records of representatives and staff keep their IP address and browser details for 1 year. One-time codes expire after 10 minutes and work only once: a code is wiped as soon as it's used, and all verification records are deleted within a day.",
"शिकायत के अभिलेख (संदर्भ संख्या, विवरण, स्थिति का इतिहास) दर्ज करने की तिथि से 3 वर्ष तक, या निस्तारण के 1 वर्ष बाद तक — जो भी अधिक हो — रखे जाते हैं। आपका मोबाइल नंबर और ईमेल केवल संबंधित शिकायत के रहने तक रखे जाते हैं। यह अवधि पूरी होने पर आपका फ़ोन नंबर, ईमेल, शिकायत का विवरण, स्थान, फ़ोटो और टिप्पणियाँ हटा दी जाती हैं; संदर्भ संख्या, वार्ड, शिकायत का प्रकार और तिथियाँ आँकड़ों के लिए रखी जाती हैं, बिना ऐसी किसी जानकारी के जिससे आपकी पहचान हो। यदि आपने ईमेल दिया है, तो हम 7 दिन पहले सूचित करते हैं। कोई शिकायत केवल कानूनी रोक या लेखा परीक्षा समीक्षा के दौरान अधिक समय तक रखी जाती है। जनप्रतिनिधियों और कर्मचारियों के साइन-इन रिकॉर्ड में IP पता और ब्राउज़र विवरण 1 वर्ष तक रखे जाते हैं। एक-बार उपयोग होने वाले कोड 10 मिनट में समाप्त हो जाते हैं और केवल एक बार काम करते हैं: उपयोग होते ही कोड मिटा दिया जाता है, और सत्यापन के सभी रिकॉर्ड एक दिन के भीतर हटा दिए जाते हैं।"
],
"priv.h_rights": [
"Your rights",
"आपके अधिकार"
],
"priv.board": [
"If you're not satisfied with our response, you can complain to the Data Protection Board of India.",
"यदि आप हमारे उत्तर से संतुष्ट नहीं हैं, तो आप भारतीय डेटा संरक्षण बोर्ड (Data Protection Board of India) में शिकायत कर सकते हैं।"
],
"priv.h_reps": [
"For representatives",
"जनप्रतिनिधियों के लिए"
],
"priv.reps": [
"When you add a photo of the work done, we ask your phone for your location once, only with your permission, to show the photo was taken at the spot. It is saved with that photo and never tracked in the background. GrievIQ staff see how far it was from the complaint's location; citizens see only a warning if it was far away, never your exact location. You can say no, and still add the photo.",
"कार्य की फ़ोटो जोड़ते समय, फ़ोटो मौके पर ली गई है यह दिखाने के लिए, हम केवल आपकी अनुमति से एक बार आपके फ़ोन से आपकी लोकेशन माँगते हैं। यह उसी फ़ोटो के साथ सहेजी जाती है और कभी पृष्ठभूमि में ट्रैक नहीं की जाती। GrievIQ कर्मचारी देखते हैं कि यह शिकायत के स्थान से कितनी दूर थी; नागरिक केवल दूर होने पर चेतावनी देखते हैं, आपकी सटीक लोकेशन कभी नहीं। आप मना कर सकते हैं और फिर भी फ़ोटो जोड़ सकते हैं।"
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
"<strong>Your mobile number</strong> (required): kept with your complaint so it can be identified if you contact us about it. If you didn't give an email, GrievIQ staff may call you once, after your representative marks the case resolved, to check the problem was really fixed.",
"<strong>आपका मोबाइल नंबर</strong> (आवश्यक): आपकी शिकायत के साथ रखा जाता है, ताकि आपके संपर्क करने पर शिकायत की पहचान की जा सके। यदि आपने ईमेल नहीं दिया है, तो जनप्रतिनिधि द्वारा शिकायत निस्तारित बताए जाने के बाद GrievIQ कर्मचारी यह जाँचने के लिए आपको एक बार फ़ोन कर सकते हैं कि समस्या वास्तव में हल हुई या नहीं।"
],
"priv.c_email": [
"<strong>Your email address</strong> (optional): to send you a one-time code when you track your reports online, and to email you when your case is marked resolved.",
"<strong>आपका ईमेल पता</strong> (वैकल्पिक): ऑनलाइन शिकायत की स्थिति देखते समय एक-बार उपयोग होने वाला कोड भेजने के लिए, और शिकायत निस्तारित बताए जाने पर आपको सूचना भेजने के लिए।"
],
"priv.c_report": [
"<strong>What you report</strong>: the type of problem, your description, your ward, any location details you give, and any photos you attach. We use these to send your complaint to the right elected representative and show them the problem.",
"<strong>शिकायत का विवरण</strong>: समस्या का प्रकार, आपका विवरण, आपका वार्ड, आपके द्वारा दी गई स्थान संबंधी जानकारी और संलग्न फ़ोटो। इनका उपयोग शिकायत को सही निर्वाचित जनप्रतिनिधि तक पहुँचाने और उन्हें समस्या दिखाने के लिए किया जाता है।"
],
"priv.c_location": [
"<strong>Where the problem is</strong> (optional): if you use your current location, search for an address or put a pin on a map, we use it only to find the ward. It isn't saved unless you file a complaint; then the pin is saved with the complaint so your representative can find the exact spot. It is never shown publicly.",
"<strong>समस्या का स्थान</strong> (वैकल्पिक): यदि आप अपनी वर्तमान लोकेशन का उपयोग करते हैं, कोई पता खोजते हैं या नक्शे पर पिन लगाते हैं, तो हम इसका उपयोग केवल वार्ड खोजने के लिए करते हैं। शिकायत दर्ज न करने पर यह सहेजा नहीं जाता; शिकायत दर्ज करने पर पिन शिकायत के साथ सहेजा जाता है, ताकि आपके जनप्रतिनिधि सटीक स्थान तक पहुँच सकें। इसे कभी सार्वजनिक रूप से नहीं दिखाया जाता।"
],
"priv.w_after_photos": [
"<strong>Photos of the work done</strong>: photos your representative adds to show the problem was fixed are stored privately. Only you (after the email code), your representatives and GrievIQ staff can see them, through links that stop working after 15 minutes.",
"<strong>कार्य की फ़ोटो</strong>: समस्या हल होने को दिखाने के लिए आपके जनप्रतिनिधि द्वारा जोड़ी गई फ़ोटो निजी रूप से रखी जाती हैं। इन्हें केवल आप (ईमेल कोड के बाद), आपके जनप्रतिनिधि और GrievIQ कर्मचारी ही ऐसे लिंक से देख सकते हैं जो 15 मिनट बाद काम करना बंद कर देते हैं।"
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
"<strong>GrievIQ staff</strong>: see your complaint to oversee how it's handled. Your mobile number and email are partly hidden from them, and every time a staff member opens a case, it is recorded. Only two senior roles can see your full number, and only when there is a need, such as calling you to check a fix; each time, the reason is recorded.",
"<strong>GrievIQ कर्मचारी</strong>: कार्यवाही की निगरानी के लिए आपकी शिकायत देखते हैं। आपका मोबाइल नंबर और ईमेल उनसे आंशिक रूप से छिपा रहता है, और कोई कर्मचारी जब भी कोई शिकायत खोलता है, उसका रिकॉर्ड रखा जाता है। आपका पूरा नंबर केवल दो वरिष्ठ भूमिकाएँ देख सकती हैं, और केवल आवश्यकता होने पर, जैसे समाधान जाँचने के लिए आपको फ़ोन करना; हर बार कारण दर्ज किया जाता है।"
],
"priv.w_photos": [
"<strong>Your photos</strong>: before a photo is sent, your phone makes it smaller and removes its hidden details, such as the date and the location where it was taken. Your photos are stored privately. Only you (after the email code), your representatives and GrievIQ staff can see them, through links that stop working after 15 minutes.",
"<strong>आपकी फ़ोटो</strong>: फ़ोटो भेजे जाने से पहले आपका फ़ोन उसे छोटा करता है और उसकी छिपी जानकारी, जैसे फ़ोटो लेने की तिथि और स्थान, हटा देता है। आपकी फ़ोटो निजी रूप से रखी जाती हैं। इन्हें केवल आप (ईमेल कोड के बाद), आपके जनप्रतिनिधि और GrievIQ कर्मचारी ही ऐसे लिंक से देख सकते हैं जो 15 मिनट बाद काम करना बंद कर देते हैं।"
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
"rep.closes_by": ["Closes as resolved {date} if the citizen doesn't reply", "नागरिक का उत्तर न मिलने पर {date} को निस्तारित मानकर बंद होगी"],
"rep.kind_confirmed": ["confirmed by citizen", "नागरिक द्वारा पुष्टि"],
"rep.kind_not_confirmed": ["not confirmed by citizen", "नागरिक द्वारा पुष्टि नहीं"],
"rep.kind_no_email": ["citizen had no email", "नागरिक का ईमेल नहीं था"],
"rep.kind_verified": ["checked by GrievIQ", "GrievIQ द्वारा जाँचा गया"],
"rep.kind_not_verified": ["not verified", "सत्यापित नहीं"],
"rep.state_check": ["Awaiting GrievIQ check", "GrievIQ जाँच लंबित"],
"rep.badge_check": ["awaiting GrievIQ check (citizen gave no email)", "GrievIQ जाँच लंबित (नागरिक ने ईमेल नहीं दिया)"],
"rep.closes_by_check": ["Closes as resolved (not verified) {date} if GrievIQ doesn't check it", "GrievIQ द्वारा जाँच न होने पर {date} को निस्तारित (सत्यापित नहीं) मानकर बंद होगी"],
"rep.check_not_fixed_photo": ["GrievIQ checked the photos: not fixed", "GrievIQ ने फ़ोटो जाँचीं: समस्या हल नहीं हुई"],
"rep.check_not_fixed_phone": ["GrievIQ called the citizen: not fixed", "GrievIQ ने नागरिक से बात की: समस्या हल नहीं हुई"],
// ---- Mark resolved form and after-photo warnings (item 7b) ----
"rep.r_note": ["What was done?", "क्या कार्यवाही की गई?"],
"rep.r_note_hint": ["Say what was fixed and when. The citizen will see this.", "बताएँ कि क्या ठीक किया गया और कब। नागरिक इसे देखेंगे।"],
"rep.r_photos": ["\"After\" photos (up to 3)", "कार्य के बाद की फ़ोटो (अधिकतम 3)"],
"rep.r_photos_hint": ["Take them at the spot, with location turned on, so the citizen and GrievIQ can see the fix. JPG, PNG or WEBP, up to 5 MB each.", "मौके पर, लोकेशन चालू रखकर फ़ोटो लें, ताकि नागरिक और GrievIQ समाधान देख सकें। JPG, PNG या WEBP, प्रत्येक अधिकतम 5 MB।"],
"rep.r_photo_alt": ["After-photo {n}", "कार्य के बाद की फ़ोटो {n}"],
"rep.r_remove": ["Remove photo {n}", "फ़ोटो {n} हटाएँ"],
"rep.r_uploading": ["Uploading…", "अपलोड हो रही है…"],
"rep.r_no_photo": ["No photo possible", "फ़ोटो लेना संभव नहीं"],
"rep.r_reason": ["Why is there no photo?", "फ़ोटो क्यों नहीं है?"],
"rep.r_reason_hint": ["For example: water supply restored; nothing to photograph.", "उदाहरण: जल आपूर्ति बहाल हो गई; फ़ोटो लेने योग्य कुछ नहीं।"],
"rep.r_submit": ["Mark resolved", "निस्तारित चिह्नित करें"],
"rep.r_cancel": ["Cancel", "रद्द करें"],
"rep.r_err_note": ["Say what was done, in at least 10 characters.", "कम से कम 10 अक्षरों में बताएँ कि क्या कार्यवाही की गई।"],
"rep.r_err_photo": ["Add at least one photo, or tick \"No photo possible\".", "कम से कम एक फ़ोटो जोड़ें, या \"फ़ोटो लेना संभव नहीं\" चुनें।"],
"rep.r_err_reason": ["Say why there is no photo, in at least 10 characters.", "कम से कम 10 अक्षरों में बताएँ कि फ़ोटो क्यों नहीं है।"],
"rep.r_err_max": ["You can add up to 3 photos.", "अधिकतम 3 फ़ोटो जोड़ी जा सकती हैं।"],
"rep.r_err_size": ["Each photo must be smaller than 5 MB.", "प्रत्येक फ़ोटो 5 MB से छोटी होनी चाहिए।"],
"rep.r_err_type": ["Only JPG, PNG or WEBP photos can be added.", "केवल JPG, PNG या WEBP फ़ोटो जोड़ी जा सकती हैं।"],
"rep.r_err_many": ["Too many photos are waiting for this case. Reload the page and try again.", "इस शिकायत के लिए बहुत सारी फ़ोटो प्रतीक्षा में हैं। पृष्ठ रीफ़्रेश करके पुनः प्रयास करें।"],
"rep.r_err_storage": ["Photo storage isn't set up yet. Tick \"No photo possible\" for now, and tell GrievIQ support.", "फ़ोटो संग्रह अभी तैयार नहीं है। अभी \"फ़ोटो लेना संभव नहीं\" चुनें और GrievIQ सहायता को बताएँ।"],
"rep.r_err_missing": ["One of the photos couldn't be found. Please add it again.", "एक फ़ोटो नहीं मिली। कृपया उसे फिर से जोड़ें।"],
"rep.r_email_failed": ["Case marked resolved, but the email to the citizen couldn't be sent.", "शिकायत निस्तारित चिह्नित हो गई, पर नागरिक को ईमेल नहीं भेजा जा सका।"],
"rep.r_done": ["What was done:", "की गई कार्यवाही:"],
"rep.r_no_photo_given": ["No photo — reason:", "फ़ोटो नहीं — कारण:"],
"rep.r_photo_unavailable": ["Photo unavailable", "फ़ोटो उपलब्ध नहीं"],
"rep.ev_date_before": ["Photo taken before the complaint was filed ({date})", "फ़ोटो शिकायत दर्ज होने से पहले ली गई ({date})"],
"rep.ev_date_future": ["Photo date is in the future ({date})", "फ़ोटो की तिथि भविष्य की है ({date})"],
"rep.ev_far": ["Photo taken about {dist} in a straight line from the complaint's pin", "फ़ोटो शिकायत के पिन से सीधी रेखा में लगभग {dist} दूर ली गई"],
"rep.ev_reused": ["Same photo already used on another case", "यही फ़ोटो किसी दूसरी शिकायत में उपयोग हो चुकी है"],
"rep.ev_similar": ["Very similar to a photo on another case", "किसी दूसरी शिकायत की फ़ोटो से बहुत मिलती-जुलती"],
"rep.ev_citizen": ["This is one of the citizen's own photos", "यह नागरिक की अपनी फ़ोटो में से एक है"],
"rep.ev_no_date": ["No date in photo", "फ़ोटो में तिथि नहीं"],
"rep.ev_no_location": ["No location in photo or from your phone", "न फ़ोटो में लोकेशन है, न आपके फ़ोन से"],
"rep.ev_no_pin": ["No pin or ward boundary to compare with", "तुलना के लिए न पिन है, न वार्ड की सीमा"],
"rep.ev_dev_far": ["You added this photo about {dist} in a straight line from the complaint's pin (phone accuracy ±{acc} m)", "आपने यह फ़ोटो शिकायत के पिन से सीधी रेखा में लगभग {dist} दूर से जोड़ी (फ़ोन की सटीकता ±{acc} मीटर)"],
"rep.ev_dev_outside": ["You added this photo from outside the complaint's ward (phone accuracy ±{acc} m)", "आपने यह फ़ोटो शिकायत के वार्ड के बाहर से जोड़ी (फ़ोन की सटीकता ±{acc} मीटर)"],
"rep.ev_photo_outside": ["Photo's own location is outside the complaint's ward", "फ़ोटो की अपनी लोकेशन शिकायत के वार्ड के बाहर है"],
"rep.ev_dev_not_shared": ["Your location wasn't shared", "आपकी लोकेशन साझा नहीं की गई"],
"rep.ev_dev_rough": ["Your location was too rough to check (±{acc} m)", "आपकी लोकेशन जाँचने के लिए पर्याप्त सटीक नहीं थी (±{acc} मीटर)"],
"rep.r_loc_hint": ["We'll ask for your location once, to show the photo was taken at the spot.", "फ़ोटो मौके पर ली गई है, यह दिखाने के लिए हम एक बार आपकी लोकेशन माँगेंगे।"],
"rep.r_loc_ok": ["Your location: shared (±{m} m).", "आपकी लोकेशन: साझा की गई (±{m} मीटर)।"],
"rep.r_loc_no": ["Your location: not shared. The photo can still be added.", "आपकी लोकेशन: साझा नहीं की गई। फ़ोटो फिर भी जोड़ी जा सकती है।"],
"rep.r_loc_finding": ["Finding your location…", "आपकी लोकेशन खोजी जा रही है…"],
"rep.r_loc_unavailable": ["Your location couldn't be found. The photo can still be added.", "आपकी लोकेशन नहीं मिल सकी। फ़ोटो फिर भी जोड़ी जा सकती है।"],
"rep.r_loc_retry": ["Try again", "फिर से प्रयास करें"],
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
"rep.ac_hint": ["When autocomplete results are available use up and down arrows to review and enter to select. Touch device users, explore by touch or with swipe gestures.", "परिणाम उपलब्ध होने पर ऊपर-नीचे तीर कुंजियों से देखें और चुनने के लिए Enter दबाएँ। टच डिवाइस पर स्पर्श या स्वाइप से देखें।"],
"rep.map_link": ["Open location in Google Maps", "Google Maps पर स्थान देखें"],
"rep.new_tab": ["(opens in a new tab)", "(नए टैब में खुलता है)"]
  };
  for (var rk in R) { if (Object.prototype.hasOwnProperty.call(R, rk)) D[rk] = R[rk]; }

  // ---- Admin pages used by data entry operators and approvers ----
  // (Dashboard, Jurisdiction, Change requests). Same official register.
  var A = {
"adm.brand": ["Admin", "प्रशासन"],
"adm.nav_dashboard": ["Dashboard", "डैशबोर्ड"],
"adm.nav_cases": ["Cases", "शिकायतें"],
"adm.nav_checks": ["Checks", "जाँच"],
"adm.d_c_checks": ["Fixes to check", "जाँच हेतु समाधान"],
"adm.d_c_checks_h": ["Cases marked resolved where the citizen gave no email. Check the photos or call.", "निस्तारित बताई गई शिकायतें जिनमें नागरिक ने ईमेल नहीं दिया। फ़ोटो जाँचें या फ़ोन करें।"],
"adm.d_c_checks_oldest": ["Oldest waiting since {date}.", "सबसे पुरानी {date} से प्रतीक्षा में।"],
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
// ---- Item 9a: Audit (observations and audit log) ----
"adm.nav_audit": ["Audit", "लेखा परीक्षा"],
"adm.au_ot_MP": ["MP", "सांसद"],
"adm.au_ot_MLA": ["MLA", "विधायक"],
"adm.au_ot_Mayor": ["Mayor", "महापौर"],
"adm.au_ot_Corporator": ["Corporator", "पार्षद"],
"adm.au_ot_Gram_Pradhan": ["Gram Pradhan", "ग्राम प्रधान"],
"adm.au_owner_staff": ["A GrievIQ staff member", "GrievIQ स्टाफ़ सदस्य"],
"adm.au_owner_office": ["A representative's office", "किसी जनप्रतिनिधि का कार्यालय"],
"adm.au_fh_owner2": ["Who must reply and act. An auditor can't be the owner.", "किसे उत्तर देना और कार्रवाई करनी है। लेखा परीक्षक ज़िम्मेदार नहीं हो सकता।"],
"adm.au_fl_owner_staff": ["Staff member", "स्टाफ़ सदस्य"],
"adm.au_fl_office_search": ["Find the office", "कार्यालय खोजें"],
"adm.au_office_search_ph": ["Type a ward, constituency or name", "वार्ड, क्षेत्र या नाम लिखें"],
"adm.au_fl_owner_office": ["Office", "कार्यालय"],
"adm.au_fh_owner_office": ["The office owns the observation, not the person: if the representative changes, the new one takes it over. Its representative and office managers reply.", "यह अवलोकन कार्यालय का है, व्यक्ति का नहीं: जनप्रतिनिधि बदलने पर नए जनप्रतिनिधि इसे संभालेंगे। उत्तर उसके जनप्रतिनिधि और कार्यालय प्रबंधक देते हैं।"],
"adm.au_office_chosen": ["Chosen: {name}", "चुना गया: {name}"],
"adm.au_office_not_chosen": ["No office chosen yet. Click an office in the list.", "अभी कोई कार्यालय नहीं चुना गया। सूची में किसी कार्यालय पर क्लिक करें।"],
"adm.au_office_none": ["No office matches. Try another word.", "कोई कार्यालय नहीं मिला। कोई और शब्द आज़माएँ।"],
"adm.au_office_noemail": ["This office has no email on file; they will see it only in the console.", "इस कार्यालय का ईमेल दर्ज नहीं है; वे इसे केवल कंसोल में देखेंगे।"],
"adm.au_office_noemail_short": ["no email on file", "ईमेल दर्ज नहीं"],
"adm.au_e_office": ["Choose an office from the list.", "सूची से कोई कार्यालय चुनें।"],
"adm.au_owner_office_note": ["Representative's office: its representative and office managers reply from the console.", "जनप्रतिनिधि का कार्यालय: उसके जनप्रतिनिधि और कार्यालय प्रबंधक कंसोल से उत्तर देते हैं।"],
"adm.au_issue_hint_office": ["Once issued, the office's representative and office managers are emailed and the finding is locked. Later corrections are added as amendments with a reason.", "जारी होते ही कार्यालय के जनप्रतिनिधि और कार्यालय प्रबंधकों को ईमेल जाता है और निष्कर्ष लॉक हो जाता है। बाद के सुधार कारण सहित संशोधन के रूप में जुड़ते हैं।"],
"adm.au_done_issue_office": ["Issued. The office's representative and office managers have been emailed.", "जारी किया गया। कार्यालय के जनप्रतिनिधि और कार्यालय प्रबंधकों को ईमेल भेजा गया।"],
"adm.au_done_issue_noemail": ["Issued. No email could be sent; the owner will see it when they sign in.", "जारी किया गया। ईमेल नहीं भेजा जा सका; साइन इन करने पर वे इसे देखेंगे।"],
"adm.role_REPRESENTATIVE": ["Representative", "जनप्रतिनिधि"],
"adm.role_OFFICE_MANAGER": ["Office manager", "कार्यालय प्रबंधक"],
"adm.d_c_obs_overdue": ["Audit observations overdue", "समय-सीमा पार लेखा परीक्षा अवलोकन"],
"adm.d_c_obs_overdue_h": ["Issued findings past their due date with no reply or action yet.", "जारी निष्कर्ष जिनकी नियत तिथि बीत गई और अभी उत्तर या कार्रवाई नहीं हुई।"],
"adm.d_c_obs_waiting": ["Waiting for auditor verification", "लेखा परीक्षक के सत्यापन की प्रतीक्षा"],
"adm.d_c_obs_waiting_h": ["The owner reports the action is done; the auditor checks it and closes the finding.", "ज़िम्मेदार व्यक्ति के अनुसार कार्रवाई पूरी है; लेखा परीक्षक जाँच कर निष्कर्ष बंद करते हैं।"],
"adm.d_c_obs_mine": ["Audit observations for you", "आपके लिए लेखा परीक्षा अवलोकन"],
"adm.d_c_obs_mine_h": ["Waiting for your reply or action. Overdue: {n}.", "आपके उत्तर या कार्रवाई की प्रतीक्षा में। समय-सीमा पार: {n}।"],
"adm.nav_denied_title": ["This page isn't part of your role", "यह पृष्ठ आपकी भूमिका का हिस्सा नहीं है"],
"adm.nav_denied": ["Your role ({role}) can't use this page. It is for: {roles}.", "आपकी भूमिका ({role}) इस पृष्ठ का उपयोग नहीं कर सकती। यह इनके लिए है: {roles}।"],
"adm.nav_denied_help": ["If you need it for your work, ask a super admin.", "यदि आपके काम के लिए इसकी आवश्यकता है, तो सुपर एडमिन से कहें।"],
"adm.nav_denied_go": ["Go to {page}", "{page} पर जाएँ"],
"adm.nav_left_title": ["Your access has ended", "आपकी पहुँच समाप्त हो गई है"],
"adm.nav_left": ["This account is marked as having left GrievIQ, so it can no longer use the admin panel.", "यह खाता GrievIQ छोड़कर गया दर्ज है, इसलिए यह अब प्रशासन पैनल का उपयोग नहीं कर सकता।"],
"adm.nav_paused_title": ["Your access is paused while you are on leave", "अवकाश के दौरान आपकी पहुँच रोकी गई है"],
"adm.nav_paused": ["Welcome back on {date}. Your access starts again automatically after that date.", "{date} को वापसी पर स्वागत है। उस तिथि के बाद आपकी पहुँच अपने आप फिर शुरू हो जाएगी।"],
"adm.nav_covering": ["You are covering for {name} ({role}) until {date}. What you do for them is recorded in your name, on their behalf.", "आप {date} तक {name} ({role}) का कार्यभार संभाल रहे हैं। उनके लिए आपका हर कार्य आपके नाम से, उनकी ओर से दर्ज होता है।"],
"adm.au_page_title": ["Audit — GrievIQ Admin", "लेखा परीक्षा — GrievIQ एडमिन"],
"adm.au_service_tag": ["Audit", "लेखा परीक्षा"],
"adm.au_title": ["Audit", "लेखा परीक्षा"],
"adm.au_sub": ["Audit findings (observations) and the records GrievIQ keeps. Records here can't be changed or deleted.", "लेखा परीक्षा के निष्कर्ष (अवलोकन) और GrievIQ द्वारा रखे गए रिकॉर्ड। यहाँ के रिकॉर्ड बदले या हटाए नहीं जा सकते।"],
"adm.au_tab_obs": ["Observations", "अवलोकन"],
"adm.au_tab_log": ["Audit log", "ऑडिट लॉग"],
"adm.au_err_admin": ["You aren't a GrievIQ staff member.", "आप GrievIQ स्टाफ़ के सदस्य नहीं हैं।"],
"adm.au_err_role": ["Your role can't see this. The audit log is for the auditor and the super admin.", "आपकी भूमिका यह नहीं देख सकती। ऑडिट लॉग लेखा परीक्षक और सुपर एडमिन के लिए है।"],
"adm.au_r_CRITICAL": ["Critical", "अति गंभीर"],
"adm.au_r_HIGH": ["High", "उच्च"],
"adm.au_r_MEDIUM": ["Medium", "मध्यम"],
"adm.au_r_LOW": ["Low", "निम्न"],
"adm.au_s_DRAFT": ["Draft", "मसौदा"],
"adm.au_s_ISSUED": ["Issued — waiting for reply", "जारी — उत्तर की प्रतीक्षा"],
"adm.au_s_RESPONDED": ["Action in progress", "कार्रवाई जारी"],
"adm.au_s_DONE_REPORTED": ["Waiting for auditor to verify", "लेखा परीक्षक के सत्यापन की प्रतीक्षा"],
"adm.au_s_CLOSED": ["Closed — verified", "बंद — सत्यापित"],
"adm.au_s_RISK_ACCEPTED": ["Risk accepted", "जोखिम स्वीकार"],
"adm.au_s_WITHDRAWN": ["Withdrawn draft", "वापस लिया गया मसौदा"],
"adm.au_overdue": ["Overdue", "समय से पीछे"],
"adm.au_about_cases": ["About cases: {list}", "शिकायतों के बारे में: {list}"],
"adm.au_about_office": ["About office: {name}", "कार्यालय के बारे में: {name}"],
"adm.au_about_process": ["About process: {name}", "प्रक्रिया के बारे में: {name}"],
"adm.au_c_open": ["Open observations", "खुले अवलोकन"],
"adm.au_c_overdue": ["Overdue", "समय से पीछे"],
"adm.au_c_waiting": ["Waiting for verification", "सत्यापन की प्रतीक्षा"],
"adm.au_c_rating": ["Open — {r}", "खुले — {r}"],
"adm.au_c_drafts": ["Drafts", "मसौदे"],
"adm.au_f_status": ["Status", "स्थिति"],
"adm.au_f_open": ["All open", "सभी खुले"],
"adm.au_f_rating": ["Rating", "श्रेणी"],
"adm.au_f_owner": ["Owner", "ज़िम्मेदार व्यक्ति"],
"adm.au_f_search": ["Search", "खोजें"],
"adm.au_f_search_ph": ["Ref, title or case number", "संदर्भ, शीर्षक या शिकायत संख्या"],
"adm.au_f_overdue": ["Overdue only", "केवल समय से पीछे"],
"adm.au_all": ["All", "सभी"],
"adm.au_apply": ["Show", "दिखाएँ"],
"adm.au_n_obs": ["{n} observations", "{n} अवलोकन"],
"adm.au_csv": ["Download CSV", "CSV डाउनलोड करें"],
"adm.au_new": ["New observation", "नया अवलोकन"],
"adm.au_none": ["No observations match.", "कोई अवलोकन मेल नहीं खाता।"],
"adm.au_none_mine": ["No audit observations have been issued to you.", "आपको कोई अवलोकन जारी नहीं किया गया है।"],
"adm.au_col_ref": ["Ref", "संदर्भ"],
"adm.au_col_title": ["Observation", "अवलोकन"],
"adm.au_col_rating": ["Rating", "श्रेणी"],
"adm.au_col_status": ["Status", "स्थिति"],
"adm.au_col_owner": ["Owner", "ज़िम्मेदार व्यक्ति"],
"adm.au_col_due": ["Due date", "नियत तारीख"],
"adm.au_back": ["All observations", "सभी अवलोकन"],
"adm.au_new_t": ["New observation", "नया अवलोकन"],
"adm.au_edit_t": ["Edit draft", "मसौदा बदलें"],
"adm.au_form_sub": ["Saved as a draft that only auditors can see. Nothing is sent to the owner until you issue it.", "मसौदे के रूप में सहेजा जाता है जिसे केवल लेखा परीक्षक देख सकते हैं। जारी करने तक ज़िम्मेदार व्यक्ति को कुछ नहीं भेजा जाता।"],
"adm.au_from_source": ["Raised from: {label}", "यहाँ से उठाया गया: {label}"],
"adm.au_fl_title": ["Title", "शीर्षक"],
"adm.au_fl_about": ["What is it about?", "यह किस बारे में है?"],
"adm.au_st_CASE": ["One or more cases", "एक या अधिक शिकायतें"],
"adm.au_st_OFFICE": ["A ward or office", "कोई वार्ड या कार्यालय"],
"adm.au_st_PROCESS": ["A process", "कोई प्रक्रिया"],
"adm.au_fl_cases": ["Case numbers", "शिकायत संख्याएँ"],
"adm.au_fh_cases": ["Separate several with commas, e.g. GRV-ABC123, GRV-DEF456.", "कई हों तो कॉमा से अलग करें, जैसे GRV-ABC123, GRV-DEF456।"],
"adm.au_fl_office": ["Ward or office", "वार्ड या कार्यालय"],
"adm.au_fl_process": ["Process", "प्रक्रिया"],
"adm.au_fl_criteria": ["Criteria — what should happen", "मानदंड — क्या होना चाहिए"],
"adm.au_fh_criteria": ["The rule, standard or target, e.g. \"Every complaint is acknowledged within 48 hours.\"", "नियम, मानक या लक्ष्य, जैसे \"हर शिकायत की पावती 48 घंटे में दी जाए।\""],
"adm.au_fl_condition": ["Condition — what was found", "स्थिति — क्या पाया गया"],
"adm.au_fh_condition": ["The facts, with numbers and case numbers where possible.", "तथ्य, जहाँ संभव हो संख्या और शिकायत संख्या सहित।"],
"adm.au_fl_cause": ["Cause — why it happened", "कारण — ऐसा क्यों हुआ"],
"adm.au_fh_cause": ["The underlying reason, not just the symptom.", "मूल कारण, केवल लक्षण नहीं।"],
"adm.au_fl_effect": ["Effect — what it leads to", "प्रभाव — इससे क्या होता है"],
"adm.au_fh_effect": ["The risk or harm to citizens, representatives or GrievIQ.", "नागरिकों, जनप्रतिनिधियों या GrievIQ को जोखिम या हानि।"],
"adm.au_fl_recommendation": ["Recommendation", "सिफ़ारिश"],
"adm.au_fh_recommendation": ["What should be done to fix the cause.", "कारण दूर करने के लिए क्या किया जाए।"],
"adm.au_fl_rating": ["Rating", "श्रेणी"],
"adm.au_rating_hint_CRITICAL": ["serious harm is likely now — due in {n} days", "गंभीर हानि की संभावना अभी — {n} दिन में"],
"adm.au_rating_hint_HIGH": ["significant weakness — due in {n} days", "महत्वपूर्ण कमी — {n} दिन में"],
"adm.au_rating_hint_MEDIUM": ["needs fixing, limited harm — due in {n} days", "सुधार आवश्यक, सीमित हानि — {n} दिन में"],
"adm.au_rating_hint_LOW": ["minor improvement — due in {n} days", "छोटा सुधार — {n} दिन में"],
"adm.au_fl_owner": ["Owner", "ज़िम्मेदार व्यक्ति"],
"adm.au_fh_owner": ["The staff member who must reply and act. An auditor can't be the owner.", "वह स्टाफ़ सदस्य जिसे उत्तर देना और कार्रवाई करनी है। लेखा परीक्षक ज़िम्मेदार व्यक्ति नहीं हो सकता।"],
"adm.au_choose": ["Choose…", "चुनें…"],
"adm.au_fl_due": ["Due date (optional)", "नियत तारीख (वैकल्पिक)"],
"adm.au_fh_due": ["If left empty: {date}, the default for this rating, counted from the day it is issued.", "खाली छोड़ने पर: {date}, इस श्रेणी की सामान्य तारीख, जारी करने के दिन से।"],
"adm.au_fh_due_none": ["Choose a rating to see the default due date.", "सामान्य नियत तारीख देखने के लिए श्रेणी चुनें।"],
"adm.au_fl_due_reason": ["Reason for a different due date", "अलग नियत तारीख का कारण"],
"adm.au_save_draft": ["Save draft", "मसौदा सहेजें"],
"adm.au_cancel": ["Cancel", "रद्द करें"],
"adm.au_saved": ["Draft saved.", "मसौदा सहेजा गया।"],
"adm.au_e_title": ["Write a title of at least 5 characters.", "कम से कम 5 अक्षरों का शीर्षक लिखें।"],
"adm.au_e_about": ["Choose what the observation is about.", "चुनें कि अवलोकन किस बारे में है।"],
"adm.au_e_rating": ["Choose a rating.", "श्रेणी चुनें।"],
"adm.au_e_required": ["This is needed.", "यह आवश्यक है।"],
"adm.au_e_length": ["Too short or too long.", "बहुत छोटा या बहुत लंबा।"],
"adm.au_e_date": ["Enter a valid date.", "मान्य तारीख दर्ज करें।"],
"adm.au_e_past": ["The date can't be in the past.", "तारीख पिछली नहीं हो सकती।"],
"adm.au_e_before": ["The end date must be on or after the start date.", "अंतिम तारीख शुरू की तारीख के बाद या उसी दिन होनी चाहिए।"],
"adm.au_e_owner_auditor": ["An auditor can't own an observation. Choose another staff member.", "लेखा परीक्षक अवलोकन का ज़िम्मेदार नहीं हो सकता। कोई अन्य स्टाफ़ सदस्य चुनें।"],
"adm.au_e_owner_staff": ["That person isn't on the GrievIQ staff list.", "यह व्यक्ति GrievIQ स्टाफ़ सूची में नहीं है।"],
"adm.au_e_same": ["This is the same as the current value.", "यह वर्तमान मान जैसा ही है।"],
"adm.au_e_issue": ["Complete these before issuing: {list}.", "जारी करने से पहले ये पूरा करें: {list}।"],
"adm.au_amended": ["amended", "संशोधित"],
"adm.au_raised_by": ["Raised by", "उठाया गया"],
"adm.au_issued": ["Issued", "जारी"],
"adm.au_source": ["Raised from", "यहाँ से उठाया गया"],
"adm.au_owner_reply": ["Owner's reply", "ज़िम्मेदार व्यक्ति का उत्तर"],
"adm.au_agrees": ["Agrees", "सहमत"],
"adm.au_disagrees": ["Disagrees", "असहमत"],
"adm.au_plan": ["Action plan:", "कार्य योजना:"],
"adm.au_target": ["Target date:", "लक्ष्य तारीख:"],
"adm.au_evidence": ["What was done (owner's report)", "क्या किया गया (ज़िम्मेदार व्यक्ति की रिपोर्ट)"],
"adm.au_risk_t": ["Risk accepted by the super admin", "सुपर एडमिन द्वारा जोखिम स्वीकार"],
"adm.au_review_by": ["To be looked at again by:", "फिर से देखने की तारीख:"],
"adm.au_edit_btn": ["Edit draft", "मसौदा बदलें"],
"adm.au_issue_btn": ["Issue to owner", "ज़िम्मेदार व्यक्ति को जारी करें"],
"adm.au_issue_hint": ["Once issued, the owner is emailed and the finding is locked. Later corrections are added as amendments with a reason.", "जारी होते ही ज़िम्मेदार व्यक्ति को ईमेल जाता है और निष्कर्ष लॉक हो जाता है। बाद के सुधार कारण सहित संशोधन के रूप में जुड़ते हैं।"],
"adm.au_respond_t": ["Your reply", "आपका उत्तर"],
"adm.au_respond_sub": ["Say whether you agree. If you agree, give your action plan and a target date. Your reply is recorded permanently.", "बताएँ कि आप सहमत हैं या नहीं। सहमत हों तो कार्य योजना और लक्ष्य तारीख दें। आपका उत्तर स्थायी रूप से दर्ज होता है।"],
"adm.au_agree_q": ["Do you agree with this finding?", "क्या आप इस निष्कर्ष से सहमत हैं?"],
"adm.au_reply": ["Your reply", "आपका उत्तर"],
"adm.au_plan_label": ["Action plan (if you agree)", "कार्य योजना (सहमत होने पर)"],
"adm.au_target_label": ["Target date (if you agree)", "लक्ष्य तारीख (सहमत होने पर)"],
"adm.au_respond_btn": ["Send reply", "उत्तर भेजें"],
"adm.au_done_t": ["Report the action as done", "कार्रवाई पूरी होने की सूचना दें"],
"adm.au_evidence_label": ["What was done, and where the auditor can check it", "क्या किया गया, और लेखा परीक्षक इसे कहाँ जाँच सकते हैं"],
"adm.au_done_btn": ["Send for verification", "सत्यापन के लिए भेजें"],
"adm.au_close_t": ["Verify and close", "सत्यापित करें और बंद करें"],
"adm.au_close_sub": ["Close only after checking that the action was really carried out (IIA Standard 15.2).", "केवल यह जाँचने के बाद बंद करें कि कार्रवाई वास्तव में हुई है (IIA मानक 15.2)।"],
"adm.au_close_note": ["How you verified it", "आपने कैसे सत्यापित किया"],
"adm.au_close_btn": ["Close as verified", "सत्यापित रूप में बंद करें"],
"adm.au_sendback_t": ["Send back", "वापस भेजें"],
"adm.au_sendback_note": ["What is still missing", "क्या अभी बाकी है"],
"adm.au_sendback_btn": ["Send back to owner", "ज़िम्मेदार व्यक्ति को वापस भेजें"],
"adm.au_amend_t": ["Add an amendment", "संशोधन जोड़ें"],
"adm.au_amend_sub": ["The original stays on record; the amendment, its date and your reason are shown with it.", "मूल रिकॉर्ड में रहता है; संशोधन, उसकी तारीख और आपका कारण उसके साथ दिखते हैं।"],
"adm.au_amend_field": ["What to correct", "क्या सुधारना है"],
"adm.au_amend_value": ["New value", "नया मान"],
"adm.au_amend_reason": ["Reason", "कारण"],
"adm.au_amend_btn": ["Add amendment", "संशोधन जोड़ें"],
"adm.au_risk_form_t": ["Formally accept the risk", "जोखिम औपचारिक रूप से स्वीकार करें"],
"adm.au_risk_sub": ["A management decision: the observation is closed without the recommended action. Give the reason and when it will be looked at again.", "प्रबंधन का निर्णय: सिफ़ारिश की गई कार्रवाई के बिना अवलोकन बंद होता है। कारण और फिर से देखने की तारीख दें।"],
"adm.au_risk_reason": ["Reason (at least 20 characters)", "कारण (कम से कम 20 अक्षर)"],
"adm.au_review_date": ["Look at it again by", "फिर से देखने की तारीख"],
"adm.au_risk_btn": ["Accept the risk", "जोखिम स्वीकार करें"],
"adm.au_withdraw_t": ["Withdraw this draft", "यह मसौदा वापस लें"],
"adm.au_withdraw_reason": ["Reason", "कारण"],
"adm.au_withdraw_btn": ["Withdraw draft", "मसौदा वापस लें"],
"adm.au_comment_t": ["Add to the discussion", "चर्चा में जोड़ें"],
"adm.au_comment_label": ["Comment (can't be edited later)", "टिप्पणी (बाद में बदली नहीं जा सकती)"],
"adm.au_comment_btn": ["Add comment", "टिप्पणी जोड़ें"],
"adm.au_amendments": ["Amendments", "संशोधन"],
"adm.au_reason_line": ["Reason: {reason}", "कारण: {reason}"],
"adm.au_history": ["History and discussion", "इतिहास और चर्चा"],
"adm.au_history_sub": ["Every step, kept permanently. Nothing here can be edited or deleted.", "हर चरण, स्थायी रूप से दर्ज। यहाँ कुछ भी बदला या हटाया नहीं जा सकता।"],
"adm.au_ev_created": ["Draft created", "मसौदा बनाया"],
"adm.au_ev_edited": ["Draft edited", "मसौदा बदला"],
"adm.au_ev_issued": ["Issued to the owner", "ज़िम्मेदार व्यक्ति को जारी"],
"adm.au_ev_amended": ["Amended", "संशोधित"],
"adm.au_ev_responded": ["Owner replied", "ज़िम्मेदार व्यक्ति ने उत्तर दिया"],
"adm.au_ev_comment": ["Comment", "टिप्पणी"],
"adm.au_ev_done": ["Reported as done", "पूरा होने की सूचना"],
"adm.au_ev_closed": ["Verified and closed", "सत्यापित और बंद"],
"adm.au_ev_sent_back": ["Sent back by the auditor", "लेखा परीक्षक ने वापस भेजा"],
"adm.au_ev_risk": ["Risk accepted by the super admin", "सुपर एडमिन ने जोखिम स्वीकार किया"],
"adm.au_ev_withdrawn": ["Draft withdrawn", "मसौदा वापस लिया"],
"adm.au_ev_other": ["{kind}", "{kind}"],
"adm.au_done_issue": ["Issued. The owner has been emailed.", "जारी किया गया। ज़िम्मेदार व्यक्ति को ईमेल भेजा गया।"],
"adm.au_done_respond": ["Your reply has been recorded.", "आपका उत्तर दर्ज कर लिया गया।"],
"adm.au_done_report_done": ["Sent to the auditor for verification.", "सत्यापन के लिए लेखा परीक्षक को भेजा गया।"],
"adm.au_done_close": ["Closed as verified.", "सत्यापित रूप में बंद किया गया।"],
"adm.au_done_send_back": ["Sent back to the owner.", "ज़िम्मेदार व्यक्ति को वापस भेजा गया।"],
"adm.au_done_amend": ["Amendment added.", "संशोधन जोड़ा गया।"],
"adm.au_done_accept_risk": ["Risk accepted and recorded.", "जोखिम स्वीकार और दर्ज किया गया।"],
"adm.au_done_withdraw": ["Draft withdrawn.", "मसौदा वापस लिया गया।"],
"adm.au_done_comment": ["Comment added.", "टिप्पणी जोड़ी गई।"],
"adm.al_sub": ["Everything GrievIQ records about staff actions, case history, representatives' sign-ins and their teams. Read-only: these records can't be changed or deleted.", "स्टाफ़ के कार्यों, शिकायतों के इतिहास, जनप्रतिनिधियों के साइन इन और उनकी टीमों के बारे में GrievIQ के सभी रिकॉर्ड। केवल पढ़ने के लिए: ये रिकॉर्ड बदले या हटाए नहीं जा सकते।"],
"adm.al_f_source": ["Record", "रिकॉर्ड"],
"adm.al_src_staff": ["Staff actions", "स्टाफ़ के कार्य"],
"adm.al_src_signin": ["Representative sign-ins", "जनप्रतिनिधि साइन इन"],
"adm.al_src_team": ["Representatives' teams", "जनप्रतिनिधियों की टीमें"],
"adm.al_f_from": ["From", "से"],
"adm.al_f_to": ["To", "तक"],
"adm.al_f_who": ["Person (email)", "व्यक्ति (ईमेल)"],
"adm.al_f_action": ["Action", "कार्य"],
"adm.al_f_case": ["Case number", "शिकायत संख्या"],
"adm.al_n": ["{n} records", "{n} रिकॉर्ड"],
"adm.al_none": ["No records match.", "कोई रिकॉर्ड मेल नहीं खाता।"],
"adm.al_c_when": ["When", "कब"],
"adm.al_c_log": ["Record", "रिकॉर्ड"],
"adm.al_c_who": ["Person", "व्यक्ति"],
"adm.al_c_action": ["Action", "कार्य"],
"adm.al_c_case": ["Case", "शिकायत"],
"adm.al_c_details": ["Details", "विवरण"],
"adm.al_raise": ["Raise observation", "अवलोकन उठाएँ"],
"adm.al_prev": ["Newer", "नए"],
"adm.al_next": ["Older", "पुराने"],
"adm.al_page": ["Page {p} of {n}", "पृष्ठ {p} / {n}"],
"adm.al_a_case_viewed": ["Case viewed", "शिकायत देखी"],
"adm.al_a_citizen_phone_revealed": ["Citizen's phone number unmasked", "नागरिक का फ़ोन नंबर खोलकर देखा"],
"adm.al_a_case_reopened_for_citizen": ["Case reopened for a citizen", "नागरिक के लिए शिकायत फिर से खोली"],
"adm.al_a_resolution_checked": ["Fix checked by staff", "स्टाफ़ ने समाधान जाँचा"],
"adm.al_a_signed_in": ["Signed in", "साइन इन किया"],
"adm.al_a_signed_out": ["Signed out", "साइन आउट किया"],
"adm.al_a_sign_in_refused": ["Sign-in refused", "साइन इन अस्वीकार"],
"adm.al_a_audit_log_exported": ["Audit log downloaded", "ऑडिट लॉग डाउनलोड किया"],
"adm.al_a_observations_exported": ["Observations downloaded", "अवलोकन डाउनलोड किए"],
"adm.al_a_staff_added": ["Staff member added", "स्टाफ़ सदस्य जोड़ा"],
"adm.al_a_staff_removed": ["Staff member removed", "स्टाफ़ सदस्य हटाया"],
"adm.al_a_staff_role_changed": ["Staff role changed", "स्टाफ़ की भूमिका बदली"],
"adm.al_a_jurisdiction_contact_updated": ["Representative contact changed", "जनप्रतिनिधि का संपर्क बदला"],
"adm.al_a_acknowledged": ["Acknowledged a case", "शिकायत की पावती दी"],
"adm.al_a_assigned": ["Assigned a case", "शिकायत सौंपी"],
"adm.al_a_marked_resolved": ["Marked a case resolved", "शिकायत निस्तारित बताई"],
"adm.al_a_member_added": ["Added a team member", "टीम सदस्य जोड़ा"],
"adm.al_a_member_removed": ["Removed a team member", "टीम सदस्य हटाया"],
"adm.al_a_overview_exported": ["Overview downloaded", "सारांश डाउनलोड किया"],
"adm.al_help": ["Start with a quick view below, or open Cases to pick a case — every case page has \"Raise an audit observation\". Click a case number to open it, or \"All records for this case\" to see its full history.", "नीचे किसी त्वरित दृश्य से शुरू करें, या शिकायत चुनने के लिए शिकायतें खोलें — हर शिकायत पृष्ठ पर \"अवलोकन उठाएँ\" है। शिकायत खोलने के लिए उसकी संख्या पर क्लिक करें, या पूरा इतिहास देखने के लिए \"इस शिकायत के सभी रिकॉर्ड\"।"],
"adm.al_help_cases": ["Open Cases", "शिकायतें खोलें"],
"adm.al_quick": ["Quick views:", "त्वरित दृश्य:"],
"adm.al_v_phone": ["Phone numbers unmasked", "फ़ोन नंबर खोलकर देखे गए"],
"adm.al_v_refused": ["Refused sign-ins", "अस्वीकृत साइन इन"],
"adm.al_v_reopen": ["Cases reopened by staff", "स्टाफ़ द्वारा फिर से खोली गई शिकायतें"],
"adm.al_v_photos": ["Photo clean-ups", "फ़ोटो हटाना"],
"adm.al_v_exports": ["Downloads", "डाउनलोड"],
"adm.al_v_leave": ["Leave and cover", "अवकाश और कार्यभार"],
"adm.al_a_staff_details_changed": ["Staff details changed", "स्टाफ़ विवरण बदला"],
"adm.al_s_staff_details_changed": ["{who} changed a staff member's details.", "{who} ने स्टाफ़ सदस्य का विवरण बदला।"],
"adm.al_a_staff_left": ["Staff member left", "स्टाफ़ सदस्य ने छोड़ा"],
"adm.al_s_staff_left": ["{who} marked a staff member as having left.", "{who} ने स्टाफ़ सदस्य को छोड़कर गया दर्ज किया।"],
"adm.al_a_staff_deleted": ["Staff entry deleted (added by mistake)", "स्टाफ़ प्रविष्टि हटाई गई (गलती से जोड़ी गई)"],
"adm.al_s_staff_deleted": ["{who} deleted a staff entry that was added by mistake.", "{who} ने गलती से जोड़ी गई स्टाफ़ प्रविष्टि हटाई।"],
"adm.al_a_staff_reactivated": ["Staff member brought back", "स्टाफ़ सदस्य वापस लिया गया"],
"adm.al_s_staff_reactivated": ["{who} brought back a staff member who had left.", "{who} ने छोड़कर गए स्टाफ़ सदस्य को वापस लिया।"],
"adm.al_a_staff_list_reviewed": ["Staff list reviewed", "स्टाफ़ सूची की समीक्षा"],
"adm.al_s_staff_list_reviewed": ["{who} confirmed the staff list is correct.", "{who} ने पुष्टि की कि स्टाफ़ सूची सही है।"],
"adm.al_a_staff_on_leave": ["Staff member on leave", "स्टाफ़ सदस्य अवकाश पर"],
"adm.al_s_staff_on_leave": ["{who} marked a staff member as on leave.", "{who} ने स्टाफ़ सदस्य को अवकाश पर दर्ज किया।"],
"adm.al_a_staff_back_from_leave": ["Back from leave", "अवकाश से वापस"],
"adm.al_s_staff_back_from_leave": ["{who} marked a staff member as back from leave.", "{who} ने स्टाफ़ सदस्य को अवकाश से वापस दर्ज किया।"],
"adm.al_a_staff_cover_ended": ["Leave cover ended early", "कार्यभार जल्दी समाप्त"],
"adm.al_s_staff_cover_ended": ["{who} ended a leave cover early.", "{who} ने कार्यभार समय से पहले समाप्त किया।"],
"adm.al_v_staff": ["Staff and team changes", "स्टाफ़ और टीम में बदलाव"],
"adm.al_v_clear": ["Show everything", "सब दिखाएँ"],
"adm.al_timeline": ["All records for this case", "इस शिकायत के सभी रिकॉर्ड"],
"adm.al_timeline_on": ["Showing every record for {case}, oldest first.", "{case} के सभी रिकॉर्ड, सबसे पुराने पहले।"],
"adm.al_timeline_off": ["Back to the full log", "पूरे लॉग पर वापस"],
"adm.al_f_case_ph": ["Full or part, e.g. 58P3", "पूरा या आंशिक, जैसे 58P3"],
"adm.al_open_case": ["Open case {case} in a new tab", "शिकायत {case} नए टैब में खोलें"],
"adm.al_c_what": ["What happened", "क्या हुआ"],
"adm.al_n_tl": ["{n} records for this case", "इस शिकायत के {n} रिकॉर्ड"],
"adm.al_prev_tl": ["Earlier", "पहले के"],
"adm.al_next_tl": ["Later", "बाद के"],
"adm.al_src_case": ["Case history", "शिकायत का इतिहास"],
"adm.al_someone": ["Someone", "कोई"],
"adm.al_a_case": ["a case", "एक शिकायत"],
"adm.al_s_generic": ["{who}: {action}.", "{who}: {action}।"],
"adm.al_s_generic_case": ["{who}: {action} — {case}.", "{who}: {action} — {case}।"],
"adm.al_s_case_viewed": ["{who} opened case {case}.", "{who} ने शिकायत {case} खोली।"],
"adm.al_s_citizen_phone_revealed": ["{who} unmasked the citizen's phone number for {case}, giving the reason below. (The number itself is never stored in this log.)", "{who} ने नीचे दिए कारण के साथ {case} के नागरिक का छिपा फ़ोन नंबर खोलकर देखा। (नंबर इस लॉग में कभी नहीं रखा जाता।)"],
"adm.al_s_reveal_phone": ["{who} unmasked the citizen's phone number for {case}, giving the reason below. (The number itself is never stored in this log.)", "{who} ने नीचे दिए कारण के साथ {case} के नागरिक का छिपा फ़ोन नंबर खोलकर देखा। (नंबर इस लॉग में कभी नहीं रखा जाता।)"],
"adm.al_s_case_reopened_for_citizen": ["{who} reopened {case} for the citizen.", "{who} ने नागरिक के लिए {case} फिर से खोली।"],
"adm.al_s_resolution_checked": ["{who} checked the fix on {case}.", "{who} ने {case} का समाधान जाँचा।"],
"adm.al_s_signed_in": ["{who} signed in to the rep console.", "{who} ने जनप्रतिनिधि कंसोल में साइन इन किया।"],
"adm.al_s_signed_out": ["{who} signed out of the rep console.", "{who} ने जनप्रतिनिधि कंसोल से साइन आउट किया।"],
"adm.al_s_sign_in_refused": ["{who} tried to sign in to the rep console and was refused.", "{who} ने जनप्रतिनिधि कंसोल में साइन इन करने का प्रयास किया, जो अस्वीकार हुआ।"],
"adm.al_s_audit_log_exported": ["{who} downloaded the audit log.", "{who} ने ऑडिट लॉग डाउनलोड किया।"],
"adm.al_s_observations_exported": ["{who} downloaded the observations register.", "{who} ने अवलोकन रजिस्टर डाउनलोड किया।"],
"adm.al_s_overview_exported": ["{who} downloaded an office overview.", "{who} ने कार्यालय का सारांश डाउनलोड किया।"],
"adm.al_s_staff_added": ["{who} added a staff member.", "{who} ने स्टाफ़ सदस्य जोड़ा।"],
"adm.al_s_staff_removed": ["{who} removed a staff member.", "{who} ने स्टाफ़ सदस्य हटाया।"],
"adm.al_s_staff_role_changed": ["{who} changed a staff member's role.", "{who} ने स्टाफ़ सदस्य की भूमिका बदली।"],
"adm.al_s_member_added": ["{who} added someone to their team.", "{who} ने अपनी टीम में किसी को जोड़ा।"],
"adm.al_s_member_removed": ["{who} removed someone from their team.", "{who} ने अपनी टीम से किसी को हटाया।"],
"adm.al_s_member_confirmed": ["{who} confirmed a team member.", "{who} ने टीम सदस्य की पुष्टि की।"],
"adm.al_s_role_changed": ["{who} changed a team member's role.", "{who} ने टीम सदस्य की भूमिका बदली।"],
"adm.al_s_profile_changed": ["{who} changed a team member's job profile.", "{who} ने टीम सदस्य का कार्य विवरण बदला।"],
"adm.al_s_team_reviewed": ["{who} confirmed their team is still correct.", "{who} ने पुष्टि की कि उनकी टीम अब भी सही है।"],
"adm.al_s_acknowledged": ["{who} acknowledged {case}.", "{who} ने {case} की पावती दी।"],
"adm.al_s_forwarded": ["{who} forwarded {case} to a department.", "{who} ने {case} विभाग को भेजी।"],
"adm.al_s_follow_up": ["{who} forwarded {case} to a department.", "{who} ने {case} विभाग को भेजी।"],
"adm.al_s_assigned": ["{who} assigned {case} to a field worker.", "{who} ने {case} फ़ील्ड कर्मी को सौंपी।"],
"adm.al_s_unassigned": ["{who} took {case} back from a field worker.", "{who} ने {case} फ़ील्ड कर्मी से वापस ली।"],
"adm.al_s_fix_report_submitted": ["{who} sent a fix report for {case} for approval.", "{who} ने {case} की समाधान रिपोर्ट स्वीकृति के लिए भेजी।"],
"adm.al_s_fix_report_approved": ["{who} approved the fix report for {case}.", "{who} ने {case} की समाधान रिपोर्ट स्वीकृत की।"],
"adm.al_s_fix_report_sent_back": ["{who} sent back the fix report for {case}.", "{who} ने {case} की समाधान रिपोर्ट लौटाई।"],
"adm.al_s_marked_resolved": ["{who} marked {case} as fixed.", "{who} ने {case} को ठीक बताया।"],
"adm.al_s_citizen_confirmed": ["The citizen confirmed {case} is fixed.", "नागरिक ने पुष्टि की कि {case} ठीक हो गई।"],
"adm.al_s_citizen_disputed": ["The citizen said {case} is not fixed.", "नागरिक ने कहा कि {case} ठीक नहीं हुई।"],
"adm.al_s_admin_nudge": ["{who} sent a reminder about {case}.", "{who} ने {case} के बारे में याद दिलाया।"],
"adm.al_s_exception_nudged": ["{who} sent a reminder about {case}.", "{who} ने {case} के बारे में याद दिलाया।"],
"adm.al_s_purge": ["{who} ran the photo clean-up.", "{who} ने फ़ोटो हटाने की प्रक्रिया चलाई।"],
"adm.al_s_photo_moved_private": ["{who} moved old photos to private storage.", "{who} ने पुरानी फ़ोटो निजी भंडारण में भेजीं।"],
"adm.al_s_jurisdiction_contact_updated": ["{who} changed a representative's contact details.", "{who} ने जनप्रतिनिधि का संपर्क विवरण बदला।"],
"adm.al_s_jurisdiction_reassigned": ["{who} moved a ward or MLA to a different constituency.", "{who} ने किसी वार्ड या विधायक को दूसरे क्षेत्र में ले जाया।"],
"adm.al_s_change_request_submitted": ["{who} asked for a data change.", "{who} ने डेटा बदलाव का अनुरोध किया।"],
"adm.al_s_change_request_approved": ["{who} approved a data change.", "{who} ने डेटा बदलाव स्वीकृत किया।"],
"adm.al_s_change_request_rejected": ["{who} rejected a data change.", "{who} ने डेटा बदलाव अस्वीकार किया।"],
"adm.al_k_reason": ["Reason", "कारण"],
"adm.al_k_note": ["Note", "टिप्पणी"],
"adm.al_k_change": ["Change", "बदलाव"],
"adm.al_k_rows": ["Rows downloaded", "डाउनलोड की गई पंक्तियाँ"],
"adm.al_k_email": ["Email", "ईमेल"],
"adm.al_k_name": ["Name", "नाम"],
"adm.al_k_fromTier": ["From level", "स्तर से"],
"adm.al_k_toTier": ["To level", "स्तर तक"],
"adm.al_k_staffReason": ["Staff reason", "स्टाफ़ का कारण"],
"adm.al_k_source": ["Where", "कहाँ"],
"adm.al_k_emailed": ["Invitation emailed", "आमंत्रण ईमेल किया"],
"adm.al_k_department": ["Department", "विभाग"],
"adm.al_k_view": ["Quick view", "त्वरित दृश्य"],
"adm.al_tier_LOCAL": ["Ward", "वार्ड"],
"adm.al_tier_MAYOR": ["Mayor", "महापौर"],
"adm.al_tier_MLA": ["MLA", "विधायक"],
"adm.al_tier_MP": ["MP", "सांसद"],
"adm.al_code_NOT_REGISTERED": ["this email isn't a registered representative or team member", "यह ईमेल पंजीकृत जनप्रतिनिधि या टीम सदस्य का नहीं है"],
"adm.al_code_NOT_PROVISIONED": ["this email isn't a registered representative or team member", "यह ईमेल पंजीकृत जनप्रतिनिधि या टीम सदस्य का नहीं है"],
"adm.al_code_STATE_MISMATCH": ["the sign-in link didn't match this browser (possible forgery, or an old tab)", "साइन इन लिंक इस ब्राउज़र से मेल नहीं खाया (संभावित जालसाज़ी, या पुराना टैब)"],
"adm.al_code_STATE_EXPIRED": ["the sign-in took longer than 10 minutes", "साइन इन में 10 मिनट से अधिक लगे"],
"adm.al_code_EMAIL_NOT_VERIFIED": ["Google hasn't verified this email address", "Google ने यह ईमेल पता सत्यापित नहीं किया है"],
"adm.al_code_BAD_NONCE": ["Google's reply failed a security check", "Google का उत्तर सुरक्षा जाँच में विफल रहा"],
"adm.al_code_BAD_SIGNATURE": ["Google's reply failed a security check", "Google का उत्तर सुरक्षा जाँच में विफल रहा"],
"adm.al_code_TOKEN_EXCHANGE_FAILED": ["Google didn't complete the sign-in", "Google ने साइन इन पूरा नहीं किया"],
"adm.al_code_EXPIRED": ["Google's reply had expired", "Google का उत्तर समाप्त हो चुका था"],
"adm.al_yes": ["Yes", "हाँ"],
"adm.al_no": ["No", "नहीं"],
"adm.al_role_representative": ["representative", "जनप्रतिनिधि"],
"adm.al_role_office_manager": ["office manager", "कार्यालय प्रबंधक"],
"adm.al_role_field_worker": ["field worker", "फ़ील्ड कर्मी"],
"adm.al_role_office_assistant": ["office assistant", "कार्यालय सहायक"],
// ---- Item 9b: engagements and audit reports ----
"adm.au_tab_reports": ["Engagements & reports", "कार्य और रिपोर्ट"],
"adm.au_engagement": ["Engagement", "लेखा परीक्षा कार्य"],
"adm.au_open_engagement": ["Open the engagement", "कार्य खोलें"],
"adm.au_ev_eng_linked": ["Added to an engagement", "किसी कार्य में जोड़ा गया"],
"adm.au_ev_eng_unlinked": ["Removed from an engagement", "कार्य से हटाया गया"],
"adm.rp_reports": ["Audit reports", "लेखा परीक्षा रिपोर्ट"],
"adm.rp_reports_sub": ["Issued reports are frozen and carry a digital fingerprint, so any later change would show. A correction is issued as a new version; both stay on record.", "जारी रिपोर्ट स्थिर होती हैं और उन पर डिजिटल फ़िंगरप्रिंट होता है, जिससे बाद का कोई भी बदलाव दिख जाए। सुधार नए संस्करण के रूप में जारी होता है; दोनों रिकॉर्ड में रहते हैं।"],
"adm.rp_new": ["New report", "नई रिपोर्ट"],
"adm.rp_none": ["No reports have been issued yet.", "अभी कोई रिपोर्ट जारी नहीं हुई है।"],
"adm.rp_c_ref": ["Ref", "संदर्भ"],
"adm.rp_c_title": ["Report", "रिपोर्ट"],
"adm.rp_c_kind": ["Type", "प्रकार"],
"adm.rp_c_issued": ["Issued", "जारी"],
"adm.rp_c_state": ["Where it stands", "वर्तमान स्थिति"],
"adm.rp_superseded": ["Replaced by a newer version", "नए संस्करण से प्रतिस्थापित"],
"adm.rp_back": ["Engagements & reports", "कार्य और रिपोर्ट"],
"adm.rp_k_PERIOD": ["Period audit report", "अवधि लेखा परीक्षा रिपोर्ट"],
"adm.rp_k_FOLLOW_UP": ["Follow-up report", "अनुवर्ती रिपोर्ट"],
"adm.rp_k_REGISTER": ["Observation register (snapshot)", "अवलोकन रजिस्टर (स्नैपशॉट)"],
"adm.rp_k_ANALYTICS": ["Analytics report", "विश्लेषण रिपोर्ट"],
"adm.rp_kh_PERIOD": ["one engagement: objectives, scope, conclusion and every finding in full, with the owner's reply", "एक कार्य: उद्देश्य, दायरा, निष्कर्ष और हर निष्कर्ष पूरा, ज़िम्मेदार व्यक्ति के उत्तर सहित"],
"adm.rp_kh_FOLLOW_UP": ["where every issued finding stands: verified closed, in progress, overdue or risk accepted", "हर जारी निष्कर्ष की स्थिति: सत्यापित बंद, जारी, समय से पीछे या जोखिम स्वीकार"],
"adm.rp_kh_REGISTER": ["a frozen copy of the whole observation register as of today", "आज की स्थिति में पूरे अवलोकन रजिस्टर की स्थिर प्रति"],
"adm.rp_kh_ANALYTICS": ["complaint handling for a period, by ward and by level, with fix evidence and staff activity", "किसी अवधि में शिकायत निपटान, वार्ड और स्तर के अनुसार, समाधान साक्ष्य और स्टाफ़ गतिविधि सहित"],
"adm.rp_new_sub": ["Choose the report, see a preview built from today's data, then issue it. Nothing is saved until you issue.", "रिपोर्ट चुनें, आज के डेटा से बना पूर्वावलोकन देखें, फिर जारी करें। जारी करने तक कुछ भी सहेजा नहीं जाता।"],
"adm.rp_fl_kind": ["Type of report", "रिपोर्ट का प्रकार"],
"adm.rp_fl_eng": ["Engagement", "लेखा परीक्षा कार्य"],
"adm.rp_fl_eng_opt": ["Engagement (optional)", "लेखा परीक्षा कार्य (वैकल्पिक)"],
"adm.rp_all_obs": ["All observations", "सभी अवलोकन"],
"adm.rp_fl_conclusion": ["Overall conclusion", "समग्र निष्कर्ष"],
"adm.rp_c_SATISFACTORY": ["Satisfactory", "संतोषजनक"],
"adm.rp_c_NEEDS_IMPROVEMENT": ["Needs improvement", "सुधार की आवश्यकता"],
"adm.rp_c_UNSATISFACTORY": ["Unsatisfactory", "असंतोषजनक"],
"adm.rp_ch_SATISFACTORY": ["controls work as intended; only minor findings", "नियंत्रण अपेक्षित रूप से काम करते हैं; केवल छोटे निष्कर्ष"],
"adm.rp_ch_NEEDS_IMPROVEMENT": ["some important weaknesses need fixing", "कुछ महत्वपूर्ण कमियाँ दूर करनी हैं"],
"adm.rp_ch_UNSATISFACTORY": ["serious weaknesses; complaints are at risk of not being handled properly", "गंभीर कमियाँ; शिकायतों के ठीक से न निपटने का जोखिम"],
"adm.rp_fl_summary": ["Summary of the conclusion", "निष्कर्ष का सारांश"],
"adm.rp_fh_summary": ["In a few sentences: what was found overall and what matters most. At least 20 characters.", "कुछ वाक्यों में: कुल मिलाकर क्या पाया गया और सबसे महत्वपूर्ण क्या है। कम से कम 20 अक्षर।"],
"adm.rp_preview_btn": ["Preview report", "रिपोर्ट का पूर्वावलोकन"],
"adm.rp_preview_note": ["Preview — this report has not been issued yet. Check it, then issue it below.", "पूर्वावलोकन — यह रिपोर्ट अभी जारी नहीं हुई है। इसे जाँचें, फिर नीचे जारी करें।"],
"adm.rp_issue_btn": ["Issue report", "रिपोर्ट जारी करें"],
"adm.rp_issue_hint": ["Once issued it is frozen and can't be changed; a correction becomes a new version. The super admin is emailed.", "जारी होते ही यह स्थिर हो जाती है और बदली नहीं जा सकती; सुधार नया संस्करण बनता है। सुपर एडमिन को ईमेल जाता है।"],
"adm.rp_issued_ok": ["Issued {ref}, version {v}.", "{ref}, संस्करण {v} जारी किया गया।"],
"adm.rp_e_required": ["Choose one.", "एक चुनें।"],
"adm.rp_e_incomplete": ["This engagement needs its objectives and scope filled in first.", "इस कार्य में पहले उद्देश्य और दायरा भरें।"],
"adm.rp_e_summary": ["Write a summary of 20 to 4,000 characters.", "20 से 4,000 अक्षरों का सारांश लिखें।"],
"adm.rp_e_future": ["The start date can't be in the future.", "शुरू की तारीख भविष्य में नहीं हो सकती।"],
"adm.rp_e_long": ["Choose a period of up to 3 years.", "अधिकतम 3 वर्ष की अवधि चुनें।"],
"adm.rp_e_kind": ["Choose the type of report.", "रिपोर्ट का प्रकार चुनें।"],
"adm.rp_e_reason": ["Say what is being corrected and why (at least 10 characters).", "बताएँ क्या सुधारा जा रहा है और क्यों (कम से कम 10 अक्षर)।"],
"adm.rp_audit_report": ["Audit", "लेखा परीक्षा"],
"adm.rp_version": ["version {v}", "संस्करण {v}"],
"adm.rp_issued_by": ["issued by {who} on {when}", "{who} द्वारा {when} को जारी"],
"adm.rp_correction_line": ["Corrected version. Reason: {reason}", "सुधारा गया संस्करण। कारण: {reason}"],
"adm.rp_s_engagement": ["The engagement", "लेखा परीक्षा कार्य"],
"adm.rp_s_conclusion": ["Overall conclusion", "समग्र निष्कर्ष"],
"adm.rp_s_ratings": ["Findings by rating ({n} in total)", "श्रेणी के अनुसार निष्कर्ष (कुल {n})"],
"adm.rp_s_findings": ["Findings", "निष्कर्ष"],
"adm.rp_mgmt_reply": ["Management's reply", "प्रबंधन का उत्तर"],
"adm.rp_no_reply": ["No reply yet.", "अभी कोई उत्तर नहीं।"],
"adm.rp_as_of": ["As of {date}", "{date} की स्थिति"],
"adm.rp_state_VERIFIED_CLOSED": ["Verified closed", "सत्यापित बंद"],
"adm.rp_state_IN_PROGRESS": ["In progress", "जारी"],
"adm.rp_state_OVERDUE": ["Overdue", "समय से पीछे"],
"adm.rp_state_WAITING_VERIFICATION": ["Waiting for verification", "सत्यापन की प्रतीक्षा"],
"adm.rp_state_RISK_ACCEPTED": ["Risk accepted", "जोखिम स्वीकार"],
"adm.rp_a_filed": ["Complaints filed", "दर्ज शिकायतें"],
"adm.rp_a_resolved": ["Resolved", "निस्तारित"],
"adm.rp_a_within": ["Resolved within the time limit", "समय-सीमा में निस्तारित"],
"adm.rp_a_avg": ["Average days to resolve", "निस्तारण में औसत दिन"],
"adm.rp_a_escalated": ["Escalated beyond ward", "वार्ड से ऊपर गई"],
"adm.rp_a_disputed": ["Disputed by citizen", "नागरिक ने असहमति जताई"],
"adm.rp_a_reopened": ["Reopened", "फिर से खोली गई"],
"adm.rp_a_warnings": ["Fixes with photo warnings", "फ़ोटो चेतावनी वाले समाधान"],
"adm.rp_a_resolved_here": ["Resolved at this level", "इस स्तर पर निस्तारित"],
"adm.rp_a_open_now": ["Open at this level now", "अभी इस स्तर पर खुली"],
"adm.rp_s_by_ward": ["By ward", "वार्ड के अनुसार"],
"adm.rp_s_by_level": ["By level", "स्तर के अनुसार"],
"adm.rp_ward": ["Ward", "वार्ड"],
"adm.rp_level": ["Level", "स्तर"],
"adm.rp_s_evidence": ["Evidence of fixes", "समाधान के साक्ष्य"],
"adm.rp_no_warnings": ["No photo warnings on fixes in this period.", "इस अवधि के समाधानों पर कोई फ़ोटो चेतावनी नहीं।"],
"adm.rp_w_DATE_BEFORE_FILING": ["Photo taken before the complaint was filed", "शिकायत दर्ज होने से पहले ली गई फ़ोटो"],
"adm.rp_w_DATE_FUTURE": ["Photo date in the future", "फ़ोटो की तारीख भविष्य की"],
"adm.rp_w_FAR_FROM_PIN": ["Photo taken far from the complaint spot", "शिकायत स्थान से दूर ली गई फ़ोटो"],
"adm.rp_w_DEVICE_FAR_FROM_PIN": ["Phone was far from the complaint spot", "फ़ोन शिकायत स्थान से दूर था"],
"adm.rp_w_DEVICE_OUTSIDE_WARD": ["Phone was outside the ward", "फ़ोन वार्ड के बाहर था"],
"adm.rp_w_PHOTO_OUTSIDE_WARD": ["Photo taken outside the ward", "वार्ड के बाहर ली गई फ़ोटो"],
"adm.rp_w_REUSED_OTHER_CASE": ["Same photo used on another case", "दूसरी शिकायत में वही फ़ोटो"],
"adm.rp_w_CITIZEN_PHOTO": ["The citizen's own photo sent back as the fix", "नागरिक की अपनी फ़ोटो समाधान के रूप में लौटाई गई"],
"adm.rp_checks_line": ["GrievIQ staff checks: {v} verified fixed, {n} not fixed, {c} couldn't tell, {a} no answer.", "GrievIQ स्टाफ़ जाँच: {v} ठीक पाई गईं, {n} ठीक नहीं, {c} पता नहीं चला, {a} उत्तर नहीं।"],
"adm.rp_not_verified_line": ["Closed as \"not verified\" (no email and nobody checked): {n}.", "\"सत्यापित नहीं\" के रूप में बंद (ईमेल नहीं और किसी ने जाँच नहीं की): {n}।"],
"adm.rp_s_staff": ["Staff activity", "स्टाफ़ गतिविधि"],
"adm.rp_case_views": ["Case views", "शिकायत देखीं"],
"adm.rp_unmasked": ["Phone numbers unmasked", "फ़ोन नंबर खोलकर देखे"],
"adm.rp_no_staff": ["No staff case views or unmaskings in this period.", "इस अवधि में स्टाफ़ द्वारा कोई शिकायत देखना या नंबर खोलना नहीं।"],
"adm.rp_refused_line": ["Refused sign-ins to the rep console: {n}.", "जनप्रतिनिधि कंसोल में अस्वीकृत साइन इन: {n}।"],
"adm.rp_how": ["How is this calculated?", "यह कैसे गिना जाता है?"],
"adm.rp_a_how": ["Filed: complaints filed in the period. Resolved: marked fixed in the period. Within the time limit: fixed at the first level, within that issue type's time limit, without moving up. Average days: from filing to marked fixed. Escalated: filed in the period and moved above the ward level. Disputed: citizens who said a fix didn't work, in the period. Reopened: complaints filed in the period that were reopened (the card counts all reopenings made in the period). Fixes with photo warnings: fixes in the period whose \"after\" photos raised at least one warning. By level: where fixed complaints were fixed, and where open complaints sit today. Staff activity: case views and phone-number unmaskings recorded in the period.", "दर्ज: अवधि में दर्ज शिकायतें। निस्तारित: अवधि में ठीक बताई गईं। समय-सीमा में: पहले स्तर पर, उस समस्या की समय-सीमा में, ऊपर गए बिना ठीक। औसत दिन: दर्ज होने से ठीक बताए जाने तक। वार्ड से ऊपर: अवधि में दर्ज और वार्ड स्तर से ऊपर गईं। असहमति: अवधि में नागरिकों ने कहा कि समाधान काम नहीं आया। फिर से खोली गई: अवधि में दर्ज जो फिर से खोली गईं (कार्ड अवधि में हुए सभी पुनः खोलने गिनता है)। फ़ोटो चेतावनी: अवधि के समाधान जिनकी \"बाद की\" फ़ोटो पर कम से कम एक चेतावनी आई। स्तर के अनुसार: ठीक हुई शिकायतें कहाँ ठीक हुईं, और खुली शिकायतें आज कहाँ हैं। स्टाफ़ गतिविधि: अवधि में दर्ज शिकायत देखना और फ़ोन नंबर खोलना।"],
"adm.rp_fp_ok": ["✓ Fingerprint matches: this report is exactly as it was issued.", "✓ फ़िंगरप्रिंट मेल खाता है: यह रिपोर्ट बिल्कुल वैसी ही है जैसी जारी हुई थी।"],
"adm.rp_fp_bad": ["✗ Fingerprint doesn't match: this report has been changed since it was issued. Tell the super admin.", "✗ फ़िंगरप्रिंट मेल नहीं खाता: जारी होने के बाद यह रिपोर्ट बदली गई है। सुपर एडमिन को बताएँ।"],
"adm.rp_fp_label": ["Digital fingerprint (SHA-256):", "डिजिटल फ़िंगरप्रिंट (SHA-256):"],
"adm.rp_fp_help": ["Checked every time the report is opened. Anyone holding a printed copy can compare this code with the one shown here.", "हर बार रिपोर्ट खुलने पर जाँचा जाता है। छपी प्रति रखने वाला कोई भी इस कोड की तुलना यहाँ दिखाए कोड से कर सकता है।"],
"adm.rp_print": ["Print or save as PDF", "प्रिंट करें या PDF सहेजें"],
"adm.rp_versions": ["Versions:", "संस्करण:"],
"adm.rp_superseded_note": ["This version has been replaced by a corrected one. It stays on record, unchanged.", "यह संस्करण सुधारे गए संस्करण से बदल दिया गया है। यह बिना बदले रिकॉर्ड में रहता है।"],
"adm.rp_see_latest": ["See the latest version", "नवीनतम संस्करण देखें"],
"adm.rp_correct_t": ["Issue a corrected version", "सुधारा गया संस्करण जारी करें"],
"adm.rp_correct_sub": ["The new version is built from today's data and replaces this one as the current report. This version stays on record, unchanged.", "नया संस्करण आज के डेटा से बनता है और वर्तमान रिपोर्ट के रूप में इसकी जगह लेता है। यह संस्करण बिना बदले रिकॉर्ड में रहता है।"],
"adm.rp_correct_reason": ["What is being corrected, and why", "क्या सुधारा जा रहा है, और क्यों"],
"adm.rp_correct_btn": ["Issue corrected version", "सुधारा गया संस्करण जारी करें"],
"adm.en_title": ["Audit engagements", "लेखा परीक्षा कार्य"],
"adm.en_sub": ["An engagement is an audit of a period, such as \"Q3 2026 complaint handling\", with its objectives, scope and criteria. Its findings are gathered in its period report.", "लेखा परीक्षा कार्य किसी अवधि की लेखा परीक्षा है, जैसे \"Q3 2026 शिकायत निपटान\", उसके उद्देश्य, दायरे और मानदंड सहित। इसके निष्कर्ष इसकी अवधि रिपोर्ट में एकत्र होते हैं।"],
"adm.en_new": ["New engagement", "नया कार्य"],
"adm.en_none": ["No engagements yet.", "अभी कोई कार्य नहीं।"],
"adm.en_c_title": ["Engagement", "कार्य"],
"adm.en_c_period": ["Period", "अवधि"],
"adm.en_c_obs": ["Observations", "अवलोकन"],
"adm.en_c_status": ["Status", "स्थिति"],
"adm.en_open": ["In progress", "जारी"],
"adm.en_reported": ["Reported", "रिपोर्ट जारी"],
"adm.en_new_t": ["New engagement", "नया कार्य"],
"adm.en_edit_t": ["Edit engagement", "कार्य बदलें"],
"adm.en_fl_title": ["Title", "शीर्षक"],
"adm.en_fh_title": ["For example: \"Q3 2026 complaint handling\".", "उदाहरण: \"Q3 2026 शिकायत निपटान\"।"],
"adm.en_fl_from": ["Period from", "अवधि से"],
"adm.en_fl_to": ["Period to", "अवधि तक"],
"adm.en_fl_objectives": ["Objectives", "उद्देश्य"],
"adm.en_fh_objectives": ["What this audit sets out to check.", "यह लेखा परीक्षा क्या जाँचना चाहती है।"],
"adm.en_fl_scope": ["Scope", "दायरा"],
"adm.en_fh_scope": ["Which wards, levels, processes and period are covered, and what isn't.", "कौन से वार्ड, स्तर, प्रक्रियाएँ और अवधि शामिल हैं, और क्या नहीं।"],
"adm.en_fl_criteria": ["Criteria", "मानदंड"],
"adm.en_fh_criteria": ["The rules or targets the work is measured against, e.g. GrievIQ's time limits.", "वे नियम या लक्ष्य जिनके विरुद्ध काम मापा जाता है, जैसे GrievIQ की समय-सीमाएँ।"],
"adm.en_save": ["Save engagement", "कार्य सहेजें"],
"adm.en_saved": ["Engagement saved.", "कार्य सहेजा गया।"],
"adm.en_not_set": ["Not filled in yet.", "अभी भरा नहीं गया।"],
"adm.en_period_line": ["Period: {from} to {to}", "अवधि: {from} से {to}"],
"adm.en_edit_btn": ["Edit engagement", "कार्य बदलें"],
"adm.en_prepare": ["Prepare the period report", "अवधि रिपोर्ट तैयार करें"],
"adm.en_followup": ["Follow-up report", "अनुवर्ती रिपोर्ट"],
"adm.en_locked": ["The period report has been issued, so this engagement is locked. To change the report, open it and issue a corrected version.", "अवधि रिपोर्ट जारी हो चुकी है, इसलिए यह कार्य लॉक है। रिपोर्ट बदलने के लिए उसे खोलकर सुधारा गया संस्करण जारी करें।"],
"adm.en_obs_t": ["Observations in this engagement ({n})", "इस कार्य के अवलोकन ({n})"],
"adm.en_obs_none": ["No observations in this engagement yet.", "इस कार्य में अभी कोई अवलोकन नहीं।"],
"adm.en_unlink": ["Remove from engagement", "कार्य से हटाएँ"],
"adm.en_add_label": ["Add an observation:", "अवलोकन जोड़ें:"],
"adm.en_add_btn": ["Add", "जोड़ें"],
"adm.en_add_err": ["Choose an observation to add.", "जोड़ने के लिए अवलोकन चुनें।"],
"adm.en_linked": ["Observation added to the engagement.", "अवलोकन कार्य में जोड़ा गया।"],
"adm.en_unlinked": ["Observation removed from the engagement.", "अवलोकन कार्य से हटाया गया।"],
"adm.al_a_audit_report_issued": ["Audit report issued", "लेखा परीक्षा रिपोर्ट जारी"],
"adm.al_s_audit_report_issued": ["{who} issued an audit report.", "{who} ने लेखा परीक्षा रिपोर्ट जारी की।"],
"adm.al_s_audit_report_corrected": ["{who} issued a corrected version of an audit report.", "{who} ने लेखा परीक्षा रिपोर्ट का सुधारा गया संस्करण जारी किया।"],
"adm.al_s_audit_engagement_created": ["{who} started an audit engagement.", "{who} ने लेखा परीक्षा कार्य शुरू किया।"],
"adm.al_s_audit_engagement_updated": ["{who} updated an audit engagement.", "{who} ने लेखा परीक्षा कार्य बदला।"],
"adm.al_k_fingerprint": ["Fingerprint", "फ़िंगरप्रिंट"],
"adm.al_k_version": ["Version", "संस्करण"],
"adm.al_k_kind": ["Type", "प्रकार"],
"adm.al_k_ref": ["Ref", "संदर्भ"],
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
"adm.err_detail": ["{msg}", "कार्य पूरा नहीं हो सका। ({msg})"],
"adm.nav_retention": ["Data retention", "डेटा संग्रहण"],
"adm.rt_page_title": ["GrievIQ Admin — Data retention", "GrievIQ प्रशासन — डेटा संग्रहण"],
"adm.rt_title": ["Data retention", "डेटा संग्रहण"],
"adm.rt_sub": ["Complaints are kept for 3 years from filing or 1 year after they close, whichever is later. Then the citizen's details are removed and the case is kept without them, so figures and reports stay correct.", "शिकायतें दर्ज होने से 3 वर्ष या बंद होने के 1 वर्ष बाद तक, जो भी बाद में हो, रखी जाती हैं। इसके बाद नागरिक का विवरण हटा दिया जाता है और शिकायत उसके बिना रखी जाती है, ताकि आँकड़े और रिपोर्ट सही रहें।"],
"adm.rt_not_set_up": ["Data retention isn't set up yet. Run the 9d database step first.", "डेटा संग्रहण अभी सेट नहीं है। पहले 9d डेटाबेस चरण चलाएँ।"],
"adm.rt_c_due": ["Details to remove now", "अभी हटाए जाने वाले विवरण"],
"adm.rt_c_notice": ["Notices to send", "भेजी जाने वाली सूचनाएँ"],
"adm.rt_c_waiting": ["Told, waiting 7 days", "सूचित, 7 दिन की प्रतीक्षा"],
"adm.rt_c_next30": ["Due in the next 30 days", "अगले 30 दिनों में देय"],
"adm.rt_c_held": ["On hold", "रोक पर"],
"adm.rt_c_done": ["Cases anonymised so far", "अब तक गुमनाम की गई शिकायतें"],
"adm.rt_run_t": ["Run now", "अभी चलाएँ"],
"adm.rt_run_sub": ["Runs also happen automatically in small batches when the Dashboard opens. A run sends the notices that are due, removes the details of the cases listed below, clears the IP address and browser from sign-in records older than a year ({signins} now) and deletes expired one-time codes ({codes} now).", "डैशबोर्ड खुलने पर यह अपने आप छोटे-छोटे हिस्सों में भी चलता है। हर बार देय सूचनाएँ भेजी जाती हैं, नीचे दी गई शिकायतों का विवरण हटाया जाता है, एक वर्ष से पुराने साइन-इन रिकॉर्ड से IP पता और ब्राउज़र हटाया जाता है (अभी {signins}) और समाप्त एक-बार के कोड मिटाए जाते हैं (अभी {codes})।"],
"adm.rt_run_btn": ["Run now", "अभी चलाएँ"],
"adm.rt_running": ["Running…", "चल रहा है…"],
"adm.rt_run_confirm": ["Remove the details of every case listed under \"Details to remove now\" and send the notices that are due? This can't be undone.", "\"अभी हटाए जाने वाले विवरण\" में दी गई हर शिकायत का विवरण हटाएँ और देय सूचनाएँ भेजें? इसे वापस नहीं किया जा सकता।"],
"adm.rt_run_done": ["Done. Details removed from {cases} case(s); {notices} notice(s) sent; {signins} sign-in record(s) cleared; {codes} code(s) deleted.", "पूरा हुआ। {cases} शिकायत(तों) का विवरण हटाया गया; {notices} सूचना(एँ) भेजी गईं; {signins} साइन-इन रिकॉर्ड साफ़ किए गए; {codes} कोड मिटाए गए।"],
"adm.rt_run_skipped": ["{n} case(s) were left for the next run because their photos couldn't be removed yet.", "{n} शिकायत(तें) अगली बार के लिए छोड़ी गईं क्योंकि उनकी फ़ोटो अभी हटाई नहीं जा सकीं।"],
"adm.rt_due_t": ["Details to remove now", "अभी हटाए जाने वाले विवरण"],
"adm.rt_due_sub": ["These cases' retention has ended and the citizen was told (or gave no email). The next run removes their phone number, email, complaint text, location, photos and every note, and keeps the tracking number, ward, issue type, dates and who acted.", "इन शिकायतों की संग्रहण अवधि पूरी हो गई है और नागरिक को सूचित किया जा चुका है (या कोई ईमेल नहीं दिया गया)। अगली बार इनका फ़ोन नंबर, ईमेल, शिकायत का विवरण, स्थान, फ़ोटो और हर टिप्पणी हटाई जाएगी; ट्रैकिंग नंबर, वार्ड, शिकायत का प्रकार, तिथियाँ और किसने कार्रवाई की, यह रखा जाएगा।"],
"adm.rt_notice_t": ["Notices to send", "भेजी जाने वाली सूचनाएँ"],
"adm.rt_notice_sub": ["Citizens who gave an email are told {n} days before their details are removed.", "जिन नागरिकों ने ईमेल दिया है, उन्हें विवरण हटाए जाने से {n} दिन पहले सूचित किया जाता है।"],
"adm.rt_waiting_t": ["Told, waiting", "सूचित, प्रतीक्षा में"],
"adm.rt_waiting_sub": ["The citizen has been told; the details are removed {n} days after the notice, not before the retention date.", "नागरिक को सूचित किया जा चुका है; विवरण सूचना के {n} दिन बाद हटाया जाएगा, संग्रहण तिथि से पहले नहीं।"],
"adm.rt_next30_t": ["Due in the next 30 days", "अगले 30 दिनों में देय"],
"adm.rt_held_t": ["On hold", "रोक पर"],
"adm.rt_held_sub": ["Nothing is removed from these cases, photos included: a hold placed by the super admin, or an open audit observation about the case.", "इन शिकायतों से कुछ नहीं हटाया जाता, फ़ोटो भी नहीं: सुपर एडमिन द्वारा लगाई गई रोक, या शिकायत पर खुला लेखा परीक्षा अवलोकन।"],
"adm.rt_hold_form_t": ["Place or release a hold", "रोक लगाएँ या हटाएँ"],
"adm.rt_f_ref": ["Tracking number", "ट्रैकिंग नंबर"],
"adm.rt_f_ref_ph": ["e.g. GRV-58P3PP", "जैसे GRV-58P3PP"],
"adm.rt_f_reason": ["Reason", "कारण"],
"adm.rt_f_reason_hint": ["For example a legal dispute, or a request from the police. Recorded permanently.", "जैसे कोई कानूनी विवाद, या पुलिस का अनुरोध। स्थायी रूप से दर्ज होता है।"],
"adm.rt_hold_btn": ["Place hold", "रोक लगाएँ"],
"adm.rt_release_btn": ["Release hold", "रोक हटाएँ"],
"adm.rt_held_ok": ["{ref} is now on hold.", "{ref} अब रोक पर है।"],
"adm.rt_released_ok": ["The hold on {ref} has been released.", "{ref} पर से रोक हटा दी गई है।"],
"adm.rt_e_ref": ["Enter the tracking number.", "ट्रैकिंग नंबर दर्ज करें।"],
"adm.rt_e_reason": ["Give the reason (at least 10 characters).", "कारण बताएँ (कम से कम 10 अक्षर)।"],
"adm.rt_e_not_found": ["No case has that tracking number.", "इस ट्रैकिंग नंबर की कोई शिकायत नहीं है।"],
"adm.rt_e_removed": ["This case's details have already been removed.", "इस शिकायत का विवरण पहले ही हटाया जा चुका है।"],
"adm.rt_e_already": ["This case is already on hold.", "यह शिकायत पहले से रोक पर है।"],
"adm.rt_e_not_held": ["This case isn't on hold.", "यह शिकायत रोक पर नहीं है।"],
"adm.rt_register_t": ["Retention register", "संग्रहण रजिस्टर"],
"adm.rt_register_sub": ["Every run that removed or sent anything. These records can't be changed or deleted.", "हर वह बार जब कुछ हटाया या भेजा गया। ये रिकॉर्ड बदले या मिटाए नहीं जा सकते।"],
"adm.rt_none_runs": ["Nothing has been removed yet.", "अभी तक कुछ नहीं हटाया गया है।"],
"adm.rt_none_due": ["Nothing to remove right now.", "अभी हटाने के लिए कुछ नहीं है।"],
"adm.rt_none_notice": ["No notices to send.", "भेजने के लिए कोई सूचना नहीं।"],
"adm.rt_none_waiting": ["No one is waiting after a notice.", "सूचना के बाद कोई प्रतीक्षा में नहीं।"],
"adm.rt_none_next30": ["Nothing is due in the next 30 days.", "अगले 30 दिनों में कुछ देय नहीं।"],
"adm.rt_none_held": ["No case is on hold.", "कोई शिकायत रोक पर नहीं है।"],
"adm.rt_col_case": ["Case", "शिकायत"],
"adm.rt_col_ward": ["Ward", "वार्ड"],
"adm.rt_col_closed": ["Closed", "बंद हुई"],
"adm.rt_col_due": ["Retention ends", "संग्रहण समाप्त"],
"adm.rt_col_notice": ["Notice", "सूचना"],
"adm.rt_col_remove": ["Removed from", "हटाने की तिथि"],
"adm.rt_col_why": ["Why", "कारण"],
"adm.rt_col_when": ["When", "कब"],
"adm.rt_col_by": ["By", "किसने"],
"adm.rt_col_removed": ["Details removed", "हटाए गए विवरण"],
"adm.rt_col_notices": ["Notices sent", "भेजी गई सूचनाएँ"],
"adm.rt_col_other": ["Other", "अन्य"],
"adm.rt_notice_sent": ["Sent {date}", "{date} को भेजी गई"],
"adm.rt_notice_pending": ["To be sent", "भेजी जानी है"],
"adm.rt_notice_none": ["No email given", "ईमेल नहीं दिया गया"],
"adm.rt_why_manual": ["Hold: {reason} ({by}, {date})", "रोक: {reason} ({by}, {date})"],
"adm.rt_why_obs": ["Open audit observation {refs}", "खुला लेखा परीक्षा अवलोकन {refs}"],
"adm.rt_by_system": ["Automatic", "स्वचालित"],
"adm.rt_kind_auto": ["Automatic run", "स्वचालित"],
"adm.rt_kind_manual": ["Run now", "हाथ से चलाया गया"],
"adm.rt_n_cases": ["{n} case(s)", "{n} शिकायत(तें)"],
"adm.rt_n_fields": ["{n} fields removed", "{n} विवरण हटाए गए"],
"adm.rt_other_line": ["Sign-in details cleared: {signins} · Codes deleted: {codes}", "साइन-इन विवरण साफ़: {signins} · कोड मिटाए: {codes}"],
"adm.rt_photos_line": ["Photos follow their own schedule (full-size photos go 1 year after closing).", "फ़ोटो का अपना कार्यक्रम है (पूरे आकार की फ़ोटो बंद होने के 1 वर्ष बाद हटती हैं)।"],
"adm.rt_photos_link": ["Photo storage", "फ़ोटो संग्रहण"],
"adm.cs_retention_removed": ["The citizen's details were removed on {date} under the retention policy. The tracking number, ward, issue type, dates and who acted are kept.", "नागरिक का विवरण संग्रहण नीति के अनुसार {date} को हटाया गया। ट्रैकिंग नंबर, वार्ड, शिकायत का प्रकार, तिथियाँ और किसने कार्रवाई की, यह रखा गया है।"],
"adm.cs_retention_hold": ["This case is on hold: nothing will be removed from it until the hold is released (Data retention page).", "यह शिकायत रोक पर है: रोक हटने तक इससे कुछ नहीं हटाया जाएगा (डेटा संग्रहण पृष्ठ)।"],
"adm.cs_removed_short": ["Removed under the retention policy", "संग्रहण नीति के अनुसार हटाया गया"],
"rep.retention_removed": ["Details removed under the retention policy on {date}.", "विवरण संग्रहण नीति के अनुसार {date} को हटाया गया।"],
"adm.cs_page_title": ["Cases — GrievIQ Admin", "शिकायतें — GrievIQ एडमिन"],
"adm.cs_page_title_case": ["{ref} — Cases — GrievIQ Admin", "{ref} — शिकायतें — GrievIQ एडमिन"],
"adm.cs_sub": ["Every complaint across all wards, read-only. Open a case to see its full history. Citizens' phone numbers and email addresses are partly hidden by default, and each case you open is recorded in the access log. Super admins and Operations admins can show a full number, with a reason, which is also recorded.", "सभी वार्डों की हर शिकायत, केवल देखने के लिए। पूरा इतिहास देखने के लिए शिकायत खोलें। नागरिकों के फ़ोन नंबर और ईमेल पते सामान्यतः आंशिक रूप से छिपे रहते हैं, और आपके द्वारा खोली गई हर शिकायत एक्सेस लॉग में दर्ज होती है। सुपर एडमिन और संचालन एडमिन कारण बताकर पूरा नंबर देख सकते हैं; यह भी दर्ज होता है।"],
"adm.cs_f_ref": ["Tracking number", "ट्रैकिंग नंबर"],
"adm.cs_f_ref_ph": ["e.g. GRV-58P3PP", "जैसे GRV-58P3PP"],
"adm.cs_f_status": ["Status", "स्थिति"],
"adm.cs_o_open": ["Open", "लंबित"],
"adm.cs_o_waiting": ["Awaiting citizen", "नागरिक की पुष्टि लंबित"],
"adm.cs_o_unresolved": ["Open or awaiting citizen", "लंबित या नागरिक की पुष्टि लंबित"],
"adm.cs_o_done": ["Resolved or closed", "निस्तारित या बंद"],
"adm.cs_o_all": ["All cases", "सभी शिकायतें"],
"adm.cs_f_ward": ["Ward / village", "वार्ड / गाँव"],
"adm.cs_f_attn": ["Only cases needing attention", "केवल ध्यान देने योग्य शिकायतें"],
"adm.cs_st_OPEN": ["Open", "लंबित"],
"adm.cs_st_PENDING_CONFIRMATION": ["Awaiting citizen", "नागरिक की पुष्टि लंबित"],
"adm.cs_st_RESOLVED": ["Resolved", "निस्तारित"],
"adm.cs_st_CLOSED": ["Closed", "बंद"],
"adm.cs_st_check": ["Awaiting GrievIQ check", "GrievIQ जाँच लंबित"],
"adm.cs_kind_CONFIRMED": ["confirmed by citizen", "नागरिक द्वारा पुष्टि"],
"adm.cs_kind_NOT_CONFIRMED": ["not confirmed by citizen", "नागरिक द्वारा पुष्टि नहीं"],
"adm.cs_kind_NO_EMAIL": ["citizen had no email", "नागरिक का ईमेल नहीं था"],
"adm.cs_kind_VERIFIED_BY_GRIEVIQ": ["checked by GrievIQ", "GrievIQ द्वारा जाँचा गया"],
"adm.cs_kind_NOT_VERIFIED": ["not verified (no email, not checked in time)", "सत्यापित नहीं (ईमेल नहीं, समय पर जाँच नहीं हुई)"],
"adm.cs_chk_VERIFIED": ["fixed", "समस्या हल हुई"],
"adm.cs_chk_NOT_FIXED": ["not fixed", "समस्या हल नहीं हुई"],
"adm.cs_chk_CANT_TELL": ["can't tell from photos", "फ़ोटो से पता नहीं चलता"],
"adm.cs_chk_NO_ANSWER": ["no answer", "उत्तर नहीं मिला"],
"adm.cs_flag_ACK_OVERDUE": ["Not acknowledged in time", "समय पर प्राप्ति स्वीकार नहीं हुई"],
"adm.cs_flag_ESCALATED": ["Escalated", "उच्च स्तर पर अग्रेषित"],
"adm.cs_flag_DISPUTED": ["Citizen disputed", "नागरिक ने आपत्ति की"],
"adm.cs_flag_LEGAL_REVIEW": ["Legal review", "विधिक समीक्षा"],
"adm.cs_flag_REOPENED": ["Reopened after closing", "बंद होने के बाद दोबारा खोली गई"],
"adm.cs_flag_REOPENED_TOP": ["Reopened at the top level", "सबसे ऊँचे स्तर पर दोबारा खोली गई"],
"adm.cs_rr_NOT_FIXED": ["Not fixed at all", "बिल्कुल ठीक नहीं हुई"],
"adm.cs_rr_PARTIALLY_FIXED": ["Partially fixed", "आंशिक रूप से ठीक हुई"],
"adm.cs_rr_CAME_BACK": ["Fixed, but came back", "ठीक हुई, पर समस्या फिर लौट आई"],
"adm.cs_rr_WRONG_ISSUE": ["Wrong issue fixed", "गलत समस्या ठीक की गई"],
"adm.cs_rr_OTHER": ["Other", "अन्य"],
"adm.cs_ev_ACKNOWLEDGED": ["Acknowledged by representative", "जनप्रतिनिधि ने प्राप्ति स्वीकार की"],
"adm.cs_ev_FOLLOW_UP": ["Follow-up logged", "अनुवर्ती कार्यवाही दर्ज की गई"],
"adm.cs_ev_MARKED_RESOLVED": ["Marked resolved by representative", "जनप्रतिनिधि ने निस्तारित चिह्नित की"],
"adm.cs_ev_CITIZEN_CONFIRMED": ["Citizen confirmed it is resolved", "नागरिक ने निस्तारण की पुष्टि की"],
"adm.cs_ev_CITIZEN_DISPUTED": ["Citizen disputed the resolution", "नागरिक ने निस्तारण पर आपत्ति की"],
"adm.cs_ev_CITIZEN_REOPENED": ["Reopened by the citizen", "नागरिक द्वारा दोबारा खोली गई"],
"adm.cs_ev_STAFF_REOPENED": ["Reopened by GrievIQ staff for the citizen", "GrievIQ कर्मचारियों द्वारा नागरिक के लिए दोबारा खोली गई"],
"adm.cs_ev_ADMIN_NUDGE": ["Reminder sent by GrievIQ admin", "GrievIQ एडमिन द्वारा अनुस्मारक भेजा गया"],
"adm.cs_under_day": ["Under a day", "एक दिन से कम"],
"adm.cs_day_one": ["{n} day", "{n} दिन"],
"adm.cs_days": ["{n} days", "{n} दिन"],
"adm.cs_err_role": ["Your role doesn't have access to case details.", "आपकी भूमिका को शिकायत के विवरण देखने की अनुमति नहीं है।"],
"adm.cs_showing": ["Showing <b>{n}</b> of {total} cases", "कुल {total} में से <b>{n}</b> शिकायतें दिखाई जा रही हैं"],
"adm.cs_empty": ["No cases match these filters.", "इन फ़िल्टरों से मेल खाती कोई शिकायत नहीं है।"],
"adm.cs_th_case": ["Case", "शिकायत"],
"adm.cs_th_filed": ["Filed", "दर्ज"],
"adm.cs_th_open_for": ["Open for", "कितने समय से लंबित"],
"adm.cs_th_level": ["Current level", "वर्तमान स्तर"],
"adm.cs_th_issues": ["Issues", "समस्याएँ"],
"adm.cs_closes_no_reply": ["Closes {date} if no reply", "उत्तर न मिलने पर {date} को बंद होगी"],
"adm.cs_reopened": ["Reopened", "दोबारा खोली गई"],
"adm.cs_none": ["None", "कोई नहीं"],
"adm.cs_ward_selected": ["Selected ward (no cases)", "चुना गया वार्ड (कोई शिकायत नहीं)"],
"adm.cs_updated": ["Updated {time}", "{time} बजे अद्यतन"],
"adm.cs_err_load_list": ["Could not load cases.", "शिकायतें लोड नहीं हो सकीं।"],
"adm.cs_after_photo": ["After-photo {n}", "कार्य के बाद की फ़ोटो {n}"],
"adm.cs_warnings_n": ["{n} warning(s)", "{n} चेतावनी"],
"adm.cs_no_photo_reason": ["No photo — reason:", "फ़ोटो नहीं — कारण:"],
"adm.cs_what_done": ["What was done:", "की गई कार्यवाही:"],
"adm.cs_rn_REPRESENTATIVE": ["representative", "जनप्रतिनिधि"],
"adm.cs_rn_OFFICE_MANAGER": ["office manager", "कार्यालय प्रबंधक"],
"adm.cs_rn_FIELD_WORKER": ["field worker", "फ़ील्ड कर्मचारी"],
"adm.cs_rn_OFFICE_ASSISTANT": ["office assistant", "कार्यालय सहायक"],
"adm.cs_written_by": ["Written by {who} ({role})", "{who} ({role}) द्वारा लिखी गई"],
"adm.cs_approved_by": ["approved by {who}", "{who} द्वारा स्वीकृत"],
"adm.cs_t_filed": ["Complaint filed", "शिकायत दर्ज हुई"],
"adm.cs_reason_line": ["Reason: {r}", "कारण: {r}"],
"adm.cs_t_fix_submitted": ["Fix report submitted by field worker", "फ़ील्ड कर्मचारी ने समाधान रिपोर्ट भेजी"],
"adm.cs_t_fix_sent_back": ["Fix report sent back", "समाधान रिपोर्ट वापस भेजी गई"],
"adm.cs_t_assigned": ["Assigned to {name}", "{name} को सौंपी गई"],
"adm.cs_t_unassigned_area": ["Assignment cleared (ward no longer covered by that field worker)", "सौंपा गया कार्य हटाया गया (वह फ़ील्ड कर्मचारी अब इस वार्ड का काम नहीं देखता)"],
"adm.cs_t_unassigned": ["Assignment cleared", "सौंपा गया कार्य हटाया गया"],
"adm.cs_on_behalf": ["for {who}", "{who} की ओर से"],
"adm.cs_citizen": ["Citizen", "नागरिक"],
"adm.cs_sent_to": ["sent to {tier}", "{tier} को भेजी गई"],
"adm.cs_t_check": ["GrievIQ check ({method}): {outcome}", "GrievIQ जाँच ({method}): {outcome}"],
"adm.cs_m_phone": ["phone call", "फ़ोन कॉल"],
"adm.cs_m_photos": ["photos", "फ़ोटो"],
"adm.cs_t_closed_no_reply": ["Closed as resolved: no reply from the citizen in {n} days", "निस्तारित मानकर बंद: {n} दिन में नागरिक का उत्तर नहीं मिला"],
"adm.cs_t_closed_unverified": ["Closed as not verified: GrievIQ didn't check it within {n} days", "सत्यापित नहीं के रूप में बंद: GrievIQ ने {n} दिन में जाँच नहीं की"],
"adm.cs_w_date_before": ["Photo taken before the complaint was filed ({date})", "फ़ोटो शिकायत दर्ज होने से पहले ली गई ({date})"],
"adm.cs_w_date_future": ["Photo date is in the future ({date})", "फ़ोटो की तिथि भविष्य की है ({date})"],
"adm.cs_w_far": ["Photo taken about {dist} in a straight line from the complaint's pin", "फ़ोटो शिकायत के पिन से सीधी रेखा में लगभग {dist} दूर ली गई"],
"adm.cs_w_similar": ["Very similar to a photo on another case", "किसी दूसरी शिकायत की फ़ोटो से बहुत मिलती-जुलती"],
"adm.cs_w_reused": ["Same photo already used on another case", "यही फ़ोटो किसी दूसरी शिकायत में उपयोग हो चुकी है"],
"adm.cs_w_citizen": ["This is one of the citizen's own photos", "यह नागरिक की अपनी फ़ोटो में से एक है"],
"adm.cs_w_no_date": ["No date in photo", "फ़ोटो में तिथि नहीं"],
"adm.cs_w_no_location": ["No location in photo or from the representative's phone", "न फ़ोटो में लोकेशन है, न जनप्रतिनिधि के फ़ोन से"],
"adm.cs_w_no_pin": ["No pin or ward boundary to compare the location with", "लोकेशन की तुलना के लिए न पिन है, न वार्ड की सीमा"],
"adm.cs_w_dev_far": ["Representative added this photo about {dist} in a straight line from the complaint's pin (phone accuracy ±{acc} m)", "जनप्रतिनिधि ने यह फ़ोटो शिकायत के पिन से सीधी रेखा में लगभग {dist} दूर से जोड़ी (फ़ोन की सटीकता ±{acc} मीटर)"],
"adm.cs_w_dev_outside": ["Representative added this photo from outside the complaint's ward (phone accuracy ±{acc} m)", "जनप्रतिनिधि ने यह फ़ोटो शिकायत के वार्ड के बाहर से जोड़ी (फ़ोन की सटीकता ±{acc} मीटर)"],
"adm.cs_w_photo_outside": ["Photo's own location is outside the complaint's ward", "फ़ोटो की अपनी लोकेशन शिकायत के वार्ड के बाहर है"],
"adm.cs_w_dev_not_shared": ["Representative's location not shared", "जनप्रतिनिधि की लोकेशन साझा नहीं की गई"],
"adm.cs_w_dev_rough": ["Representative's location too rough to check (±{acc} m)", "जनप्रतिनिधि की लोकेशन जाँचने के लिए पर्याप्त सटीक नहीं थी (±{acc} मीटर)"],
"adm.cs_removed_all": ["Photo removed under the retention policy on {date}.", "फ़ोटो {date} को संग्रहण नीति के अनुसार हटाई गई।"],
"adm.cs_removed_full": ["Full-size photo removed under the retention policy on {date}; preview kept.", "पूरे आकार की फ़ोटो {date} को संग्रहण नीति के अनुसार हटाई गई; छोटी झलक रखी गई है।"],
"adm.cs_photo_unavailable": ["Photo unavailable (photo links are not set up).", "फ़ोटो उपलब्ध नहीं (फ़ोटो लिंक की व्यवस्था नहीं है)।"],
"adm.cs_open_after": ["Open after-photo {n}", "कार्य के बाद की फ़ोटो {n} खोलें"],
"adm.cs_open_after_full": ["Open after-photo {n} full size", "कार्य के बाद की फ़ोटो {n} पूरे आकार में खोलें"],
"adm.cs_after_photo_rep": ["After-photo {n} added by the representative", "जनप्रतिनिधि द्वारा जोड़ी गई कार्य के बाद की फ़ोटो {n}"],
"adm.cs_open_it": ["open it", "खोलें"],
"adm.cs_no_photo_given": ["No photo — reason given", "फ़ोटो नहीं — बताया गया कारण"],
"adm.cs_res_title": ["What the representative says was done", "जनप्रतिनिधि के अनुसार की गई कार्यवाही"],
"adm.cs_warning_one": ["{n} warning", "{n} चेतावनी"],
"adm.cs_warning_many": ["{n} warnings", "{n} चेतावनियाँ"],
"adm.cs_open_photo": ["Open photo {n} full size", "फ़ोटो {n} पूरे आकार में खोलें"],
"adm.cs_photo_citizen": ["Photo {n} attached by the citizen", "नागरिक द्वारा लगाई गई फ़ोटो {n}"],
"adm.cs_no_photo": ["No photo attached.", "कोई फ़ोटो नहीं लगाई गई।"],
"adm.cs_current_level": ["(current level)", "(वर्तमान स्तर)"],
"adm.cs_no_name": ["no name on file", "नाम दर्ज नहीं"],
"adm.cs_reached": ["(reached)", "(पहुँची)"],
"adm.cs_esc_unavailable": ["Escalation details unavailable.", "अग्रेषण का विवरण उपलब्ध नहीं है।"],
"adm.cs_phone": ["Phone: {v}", "फ़ोन: {v}"],
"adm.cs_email": ["Email: {v}", "ईमेल: {v}"],
"adm.cs_none_on_file": ["None on file.", "कुछ दर्ज नहीं है।"],
"adm.cs_back": ["← All cases", "← सभी शिकायतें"],
"adm.cs_waiting_confirm": ["Waiting for the citizen to confirm. Escalation is paused. Closes as resolved on <b>{date}</b> if the citizen doesn't reply.", "नागरिक की पुष्टि की प्रतीक्षा है। अग्रेषण रुका हुआ है। नागरिक का उत्तर न मिलने पर <b>{date}</b> को निस्तारित मानकर बंद होगी।"],
"adm.cs_waiting_check": ["The citizen gave no email, so GrievIQ staff check the fix. Escalation is paused. Closes as <b>not verified</b> on <b>{date}</b> if nobody checks it.", "नागरिक ने ईमेल नहीं दिया, इसलिए GrievIQ कर्मचारी समाधान की जाँच करते हैं। अग्रेषण रुका हुआ है। किसी के जाँच न करने पर <b>{date}</b> को <b>सत्यापित नहीं</b> के रूप में बंद होगी।"],
"adm.cs_go_checks": ["Go to Checks", "जाँच पर जाएँ"],
"adm.cs_filed": ["Filed {date}", "{date} को दर्ज"],
"adm.cs_took": ["Took {d}", "लगा समय: {d}"],
"adm.cs_open_for": ["Open for {d}", "लंबित अवधि: {d}"],
"adm.cs_raise_obs": ["Raise an audit observation about this case", "इस शिकायत पर लेखा परीक्षा टिप्पणी दर्ज करें"],
"adm.cs_k_reported": ["What the citizen reported", "नागरिक ने क्या बताया"],
"adm.cs_k_location": ["Location", "स्थान"],
"adm.cs_not_given": ["Not given.", "नहीं बताया गया।"],
"adm.cs_k_photos": ["Photos", "फ़ोटो"],
"adm.cs_k_escalation": ["Escalation", "अग्रेषण"],
"adm.cs_k_contact": ["Citizen contact", "नागरिक का संपर्क"],
"adm.cs_mask_note": ["Partly hidden by default. Super admins and Operations admins can show the full number, with a reason, to call the citizen about a fix; each time is recorded.", "सामान्यतः आंशिक रूप से छिपा रहता है। सुपर एडमिन और संचालन एडमिन समाधान के बारे में नागरिक को फ़ोन करने के लिए कारण बताकर पूरा नंबर देख सकते हैं; हर बार यह दर्ज होता है।"],
"adm.cs_history": ["History", "इतिहास"],
"adm.cs_access_note": ["You opened this case on {date}. This was recorded in the admin access log.", "आपने यह शिकायत {date} को खोली। यह एडमिन एक्सेस लॉग में दर्ज किया गया।"],
"adm.cs_ro_on": ["Reopened on <b>{date}</b>", "<b>{date}</b> को दोबारा खोली गई"],
"adm.cs_ro_by_staff": ["by GrievIQ staff ({email}) for the citizen", "GrievIQ कर्मचारी ({email}) द्वारा नागरिक के लिए"],
"adm.cs_ro_by_citizen": ["by the citizen", "नागरिक द्वारा"],
"adm.cs_ro_moved": ["moved from {from} to <b>{to}</b>", "{from} से <b>{to}</b> को भेजी गई"],
"adm.cs_ro_top": ["(already the top level)", "(पहले से सबसे ऊँचा स्तर)"],
"adm.cs_k_why": ["Why", "कारण"],
"adm.cs_k_how_asked": ["How the citizen asked", "नागरिक ने कैसे अनुरोध किया"],
"adm.cs_can_reopen": ["The citizen can reopen this case once, until <b>{date}</b>. It would go one level up with a fresh time limit.", "नागरिक इस शिकायत को <b>{date}</b> तक एक बार दोबारा खोल सकते हैं। यह नई समय-सीमा के साथ एक स्तर ऊपर जाएगी।"],
"adm.cs_too_late": ["The 30 days to reopen this case have passed.", "इस शिकायत को दोबारा खोलने के 30 दिन बीत चुके हैं।"],
"adm.cs_reopening": ["Reopening", "दोबारा खोलना"],
"adm.cs_sr_done": ["Case reopened and sent to {tier}.", "शिकायत दोबारा खोलकर {tier} को भेज दी गई।"],
"adm.cs_sr_done_top": ["Case reopened and sent to {tier} (it was already at the top level, so it stays there and shows in Exceptions).", "शिकायत दोबारा खोलकर {tier} को भेज दी गई (यह पहले से सबसे ऊँचे स्तर पर थी, इसलिए वहीं रहेगी और अपवाद में दिखेगी)।"],
"adm.cs_reloading": ["Reloading…", "फिर से लोड हो रहा है…"],
"adm.cs_sr_note": ["The citizen gave no email, so they can't reopen it from the status page. If they ask (for example by phone), you can reopen it for them.", "नागरिक ने ईमेल नहीं दिया, इसलिए वे स्थिति पृष्ठ से इसे दोबारा नहीं खोल सकते। यदि वे अनुरोध करें (जैसे फ़ोन पर), तो आप उनके लिए इसे दोबारा खोल सकते हैं।"],
"adm.cs_sr_open": ["Reopen for the citizen", "नागरिक के लिए दोबारा खोलें"],
"adm.cs_sr_l_reason": ["What the citizen says", "नागरिक क्या कहते हैं"],
"adm.cs_sr_l_note": ["What is still wrong, in the citizen's words (10 to 500 characters)", "अभी भी क्या गलत है, नागरिक के शब्दों में (10 से 500 अक्षर)"],
"adm.cs_sr_l_staff": ["How the citizen asked (for the record, e.g. phoned support on 2 Oct)", "नागरिक ने कैसे अनुरोध किया (अभिलेख के लिए, जैसे 2 अक्टूबर को सहायता पर फ़ोन किया)"],
"adm.cs_choose": ["Choose…", "चुनें…"],
"adm.cs_sr_go": ["Reopen case", "शिकायत दोबारा खोलें"],
"adm.cs_sr_hint": ["It goes one level up with a fresh time limit. Your name, the time and these details are recorded.", "यह नई समय-सीमा के साथ एक स्तर ऊपर जाएगी। आपका नाम, समय और ये विवरण दर्ज किए जाते हैं।"],
"adm.cs_e_reason": ["Choose what the citizen says.", "चुनें कि नागरिक क्या कहते हैं।"],
"adm.cs_e_note": ["Write 10 to 500 characters.", "10 से 500 अक्षर लिखें।"],
"adm.cs_e_staff": ["Write at least 10 characters.", "कम से कम 10 अक्षर लिखें।"],
"adm.cs_e_role_reopen": ["Your role can't reopen cases.", "आपकी भूमिका शिकायतें दोबारा नहीं खोल सकती।"],
"adm.cs_e_reopen": ["Could not reopen the case.", "शिकायत दोबारा नहीं खोली जा सकी।"],
"adm.cs_e_network": ["Could not reach the server.", "सर्वर से संपर्क नहीं हो सका।"],
"adm.cs_rv_shown": ["Shown for this case only. Recorded in the admin log with your reason.", "केवल इस शिकायत के लिए दिखाया गया। आपके कारण के साथ एडमिन लॉग में दर्ज।"],
"adm.cs_rv_open": ["Show full number", "पूरा नंबर दिखाएँ"],
"adm.cs_rv_label": ["Why do you need the full number?", "आपको पूरा नंबर क्यों चाहिए?"],
"adm.cs_rv_go": ["Show number", "नंबर दिखाएँ"],
"adm.cs_rv_hint": ["Your name, the time and your reason are recorded in the admin log.", "आपका नाम, समय और आपका कारण एडमिन लॉग में दर्ज किए जाते हैं।"],
"adm.cs_rv_e_short": ["Give a reason of at least 10 characters.", "कम से कम 10 अक्षरों में कारण लिखें।"],
"adm.cs_rv_e_role": ["Your role can't see full numbers.", "आपकी भूमिका पूरे नंबर नहीं देख सकती।"],
"adm.cs_rv_e_fail": ["Could not show the number.", "नंबर नहीं दिखाया जा सका।"],
"adm.cs_err_reach_reload": ["Could not reach the server. Check your connection and reload the page.", "सर्वर से संपर्क नहीं हो सका। कनेक्शन जाँचें और पृष्ठ फिर से लोड करें।"],
"adm.cs_err_load_case": ["Could not load this case.", "यह शिकायत लोड नहीं हो सकी।"],
"adm.cs_loading_case": ["Loading case…", "शिकायत लोड हो रही है…"],
"adm.ck_page_title": ["Checks — GrievIQ Admin", "जाँच — GrievIQ एडमिन"],
"adm.ck_sub": ["Fixes to check. These cases were marked resolved by a representative, but the citizen gave no email, so they can't confirm it themselves. Look at the before and after photos, or call the citizen, and record what you found. Escalation is paused while a case waits here. If nobody checks within 7 days, it closes as <b>not verified</b>.", "जाँच हेतु समाधान। इन शिकायतों को जनप्रतिनिधि ने निस्तारित बताया है, लेकिन नागरिक ने ईमेल नहीं दिया, इसलिए वे स्वयं इसकी पुष्टि नहीं कर सकते। पहले और बाद की फ़ोटो देखें, या नागरिक को फ़ोन करें, और जो पाया उसे दर्ज करें। जब तक शिकायत यहाँ प्रतीक्षा में है, उसे उच्च स्तर पर भेजना रुका रहता है। यदि 7 दिन में कोई जाँच नहीं करता, तो यह <b>सत्यापित नहीं</b> के रूप में बंद हो जाती है।"],
"adm.ck_latest": ["Latest decisions", "हाल के निर्णय"],
"adm.ck_o_VERIFIED": ["Fixed", "ठीक हुआ"],
"adm.ck_o_NOT_FIXED": ["Not fixed", "ठीक नहीं हुआ"],
"adm.ck_o_CANT_TELL": ["Can't tell from photos", "फ़ोटो से पता नहीं चलता"],
"adm.ck_o_NO_ANSWER": ["No answer", "कोई उत्तर नहीं"],
"adm.ck_ev_dev_far": ["Representative added this photo about {dist} in a straight line from the complaint's pin (phone accuracy ±{acc} m)", "जनप्रतिनिधि ने यह फ़ोटो शिकायत के पिन से सीधी रेखा में लगभग {dist} दूर से जोड़ी (फ़ोन की सटीकता ±{acc} मीटर)"],
"adm.ck_ev_dev_outside": ["Representative added this photo from outside the complaint's ward (phone accuracy ±{acc} m)", "जनप्रतिनिधि ने यह फ़ोटो शिकायत के वार्ड के बाहर से जोड़ी (फ़ोन की सटीकता ±{acc} मीटर)"],
"adm.ck_ev_no_location": ["No location in photo or from the representative's phone", "न फ़ोटो में लोकेशन है, न जनप्रतिनिधि के फ़ोन से"],
"adm.ck_ev_no_pin": ["No pin or ward boundary to compare the location with", "लोकेशन की तुलना के लिए न पिन है, न वार्ड की सीमा"],
"adm.ck_ev_dev_not_shared": ["Representative's location not shared", "जनप्रतिनिधि की लोकेशन साझा नहीं की गई"],
"adm.ck_ev_dev_rough": ["Representative's location too rough to check (±{acc} m)", "जनप्रतिनिधि की लोकेशन जाँचने के लिए पर्याप्त सटीक नहीं (±{acc} मीटर)"],
"adm.ck_none": ["None.", "कोई नहीं।"],
"adm.ck_ph_removed": ["Photo removed under the retention policy on {date}.", "फ़ोटो {date} को संग्रहण नीति के अनुसार हटाई गई।"],
"adm.ck_ph_full_removed": ["Full-size photo removed under the retention policy on {date}; preview kept.", "पूरे आकार की फ़ोटो {date} को संग्रहण नीति के अनुसार हटाई गई; छोटी झलक रखी गई है।"],
"adm.ck_ph_unavailable": ["Photo unavailable.", "फ़ोटो उपलब्ध नहीं।"],
"adm.ck_ph_open": ["Open {who} photo {n}", "{who} फ़ोटो {n} खोलें"],
"adm.ck_ph_open_full": ["Open {who} photo {n} full size", "{who} फ़ोटो {n} पूरे आकार में खोलें"],
"adm.ck_ph_alt": ["{who} photo {n}", "{who} फ़ोटो {n}"],
"adm.ck_who_citizen": ["Citizen's", "नागरिक की"],
"adm.ck_who_rep": ["Representative's", "जनप्रतिनिधि की"],
"adm.ck_conflict": ["You can't check this case: you are one of its representatives, or you marked it resolved.", "आप इस शिकायत की जाँच नहीं कर सकते: आप इसके जनप्रतिनिधियों में से एक हैं, या आपने इसे निस्तारित बताया था।"],
"adm.ck_view_only": ["Your role can view checks but not record them.", "आपकी भूमिका जाँच देख सकती है, पर दर्ज नहीं कर सकती।"],
"adm.ck_how": ["How did you check?", "आपने कैसे जाँच की?"],
"adm.ck_m_photo": ["Looked at the photos", "फ़ोटो देखीं"],
"adm.ck_m_phone": ["Called the citizen", "नागरिक को फ़ोन किया"],
"adm.ck_note_hint": ["(required for \"Not fixed\": the representative will see it)", "(\"ठीक नहीं हुआ\" के लिए आवश्यक: जनप्रतिनिधि इसे देखेंगे)"],
"adm.ck_mobile": ["Citizen's mobile:", "नागरिक का मोबाइल:"],
"adm.ck_not_on_file": ["not on file", "दर्ज नहीं"],
"adm.ck_reveal_only": ["Only Super admins and Operations admins can see the full number to call.", "कॉल करने के लिए पूरा नंबर केवल सुपर एडमिन और संचालन एडमिन देख सकते हैं।"],
"adm.ck_shown_note": ["Shown for this case only. This was recorded in the admin log with your reason. After the call, choose \"Called the citizen\" above and record what they said.", "केवल इस शिकायत के लिए दिखाया गया। यह आपके कारण सहित एडमिन लॉग में दर्ज किया गया है। कॉल के बाद ऊपर \"नागरिक को फ़ोन किया\" चुनें और नागरिक ने जो कहा उसे दर्ज करें।"],
"adm.ck_show_call": ["Show number to call", "कॉल के लिए नंबर दिखाएँ"],
"adm.ck_why": ["Why do you need the number?", "आपको नंबर की आवश्यकता क्यों है?"],
"adm.ck_reason_ph": ["e.g. Photos don't show whether water supply is back; calling to check", "जैसे फ़ोटो से पता नहीं चलता कि जलापूर्ति बहाल हुई या नहीं; जाँच के लिए फ़ोन कर रहे हैं"],
"adm.ck_show": ["Show number", "नंबर दिखाएँ"],
"adm.ck_logged": ["Your name, the time and your reason are recorded in the admin log.", "आपका नाम, समय और आपका कारण एडमिन लॉग में दर्ज किए जाते हैं।"],
"adm.ck_filed": ["filed {date}", "दर्ज {date}"],
"adm.ck_marked": ["marked resolved {date}", "निस्तारित बताई गई {date}"],
"adm.ck_closes": ["Closes as not verified {date}", "{date} को सत्यापित नहीं के रूप में बंद होगी"],
"adm.ck_k_reported": ["What the citizen reported", "नागरिक ने क्या बताया"],
"adm.ck_k_location": ["Location", "स्थान"],
"adm.ck_maps": ["Open the complaint's pin in Google Maps", "शिकायत का पिन Google Maps में खोलें"],
"adm.ck_k_before": ["Before (citizen's photos)", "पहले (नागरिक की फ़ोटो)"],
"adm.ck_k_done": ["What the representative says was done", "जनप्रतिनिधि के अनुसार क्या किया गया"],
"adm.ck_warn_1": ["{n} warning", "{n} चेतावनी"],
"adm.ck_warn_n": ["{n} warnings", "{n} चेतावनियाँ"],
"adm.ck_no_report": ["No report (marked resolved before reports existed).", "कोई रिपोर्ट नहीं (रिपोर्ट की व्यवस्था शुरू होने से पहले निस्तारित बताई गई)।"],
"adm.ck_k_nophoto": ["No photo — reason given", "फ़ोटो नहीं — बताया गया कारण"],
"adm.ck_k_after": ["After (representative's photos)", "बाद में (जनप्रतिनिधि की फ़ोटो)"],
"adm.ck_k_history": ["Earlier checks on this case", "इस शिकायत की पिछली जाँचें"],
"adm.ck_by_phone_l": ["phone call", "फ़ोन कॉल"],
"adm.ck_by_photos_l": ["photos", "फ़ोटो"],
"adm.ck_by_phone": ["Phone call", "फ़ोन कॉल"],
"adm.ck_by_photos": ["Photos", "फ़ोटो"],
"adm.ck_count_1": ["{n} fix waiting, oldest first", "{n} समाधान प्रतीक्षा में, सबसे पुराना पहले"],
"adm.ck_count_n": ["{n} fixes waiting, oldest first", "{n} समाधान प्रतीक्षा में, सबसे पुराने पहले"],
"adm.ck_nothing": ["Nothing waiting to be checked.", "जाँच के लिए कुछ भी प्रतीक्षा में नहीं है।"],
"adm.ck_empty": ["No fixes are waiting for a check.", "कोई भी समाधान जाँच की प्रतीक्षा में नहीं है।"],
"adm.ck_col_found": ["Found", "परिणाम"],
"adm.ck_col_how": ["How", "कैसे"],
"adm.ck_e_method": ["Choose how you checked.", "चुनें कि आपने कैसे जाँच की।"],
"adm.ck_e_note": ["Tell the representative what is still wrong (at least 10 characters).", "जनप्रतिनिधि को बताएँ कि अभी भी क्या ठीक नहीं है (कम से कम 10 अक्षर)।"],
"adm.ck_e_save": ["Could not save. Please try again.", "सहेजा नहीं जा सका। कृपया पुनः प्रयास करें।"],
"adm.ck_done_verify": ["{ref}: recorded as fixed. The case is closed as “Resolved — checked by GrievIQ”.", "{ref}: ठीक हुआ के रूप में दर्ज। शिकायत “निस्तारित — GrievIQ द्वारा जाँची गई” के रूप में बंद कर दी गई है।"],
"adm.ck_done_not_fixed": ["{ref}: recorded as not fixed. The case is reopened and the representative can see your note.", "{ref}: ठीक नहीं हुआ के रूप में दर्ज। शिकायत फिर से खोली गई है और जनप्रतिनिधि आपकी टिप्पणी देख सकते हैं।"],
"adm.ck_done_cant_tell": ["{ref}: recorded. It stays here; try a phone call.", "{ref}: दर्ज किया गया। यह यहीं रहेगी; फ़ोन करके देखें।"],
"adm.ck_done_no_answer": ["{ref}: recorded as no answer. It stays here; try again later.", "{ref}: कोई उत्तर नहीं के रूप में दर्ज। यह यहीं रहेगी; बाद में पुनः प्रयास करें।"],
"adm.ck_e_reason": ["Give a reason of at least 10 characters.", "कम से कम 10 अक्षरों का कारण दें।"],
"adm.ck_e_show": ["Could not show the number.", "नंबर नहीं दिखाया जा सका।"],
"adm.ck_e_reach": ["Could not reach the server.", "सर्वर से संपर्क नहीं हो सका।"],
"adm.ck_e_role": ["Your role doesn't have access to Checks.", "आपकी भूमिका को जाँच पृष्ठ की अनुमति नहीं है।"],
"adm.ck_e_not_admin": ["Your account is not an admin.", "आपका खाता एडमिन नहीं है।"],
"adm.ck_e_load": ["Could not load checks.", "जाँच लोड नहीं हो सकीं।"],
"adm.ck_e_net_refresh": ["Could not reach the server. Check your connection and click Refresh.", "सर्वर से संपर्क नहीं हो सका। अपना इंटरनेट कनेक्शन जाँचें और \"रीफ़्रेश करें\" पर क्लिक करें।"],
"adm.it_page_title": ["GrievIQ Admin — Issue types", "GrievIQ एडमिन — शिकायत के प्रकार"],
"adm.it_view_only": ["View only", "केवल देखने हेतु"],
"adm.it_sub": ["Each type of problem citizens can report, its time limits, and the department suggested to representatives.", "नागरिक जिन प्रकार की समस्याओं की शिकायत कर सकते हैं, उनमें से हर एक, उसकी समय-सीमाएँ, और जनप्रतिनिधियों को सुझाया गया विभाग।"],
"adm.it_note": ["The <b>suggested department</b> is listed first, marked \"(suggested)\", when a representative logs a follow-up on a case of this type. Nothing is pre-selected: the representative always chooses the department. Every change here is recorded in the audit log. Time limits are shown for reference and cannot be changed on this page.", "जब जनप्रतिनिधि इस प्रकार की किसी शिकायत पर आगे की कार्रवाई दर्ज करते हैं, तो <b>सुझाया गया विभाग</b> सूची में सबसे ऊपर \"(सुझावित)\" चिह्न के साथ दिखता है। कुछ भी पहले से चुना नहीं होता: विभाग हमेशा जनप्रतिनिधि ही चुनते हैं। यहाँ किया गया हर बदलाव ऑडिट लॉग में दर्ज होता है। समय-सीमाएँ केवल संदर्भ के लिए दिखाई गई हैं और इस पृष्ठ पर बदली नहीं जा सकतीं।"],
"adm.it_col_type": ["Issue type", "शिकायत का प्रकार"],
"adm.it_col_ack": ["Acknowledge within", "पावती की समय-सीमा"],
"adm.it_col_resp": ["Respond within (per level)", "कार्रवाई की समय-सीमा (प्रति स्तर)"],
"adm.it_col_dept": ["Suggested department", "सुझाया गया विभाग"],
"adm.it_loading": ["Loading...", "लोड हो रहा है..."],
"adm.it_hours": ["{h} hours ({d})", "{h} घंटे ({d})"],
"adm.it_day": ["{n} day", "{n} दिन"],
"adm.it_days": ["{n} days", "{n} दिन"],
"adm.it_no_limit": ["No limit — goes to legal review", "कोई सीमा नहीं — विधिक समीक्षा में जाती है"],
"adm.it_no_sugg": ["No suggestion", "कोई सुझाव नहीं"],
"adm.it_dept_for": ["Suggested department for {name}", "{name} के लिए सुझाया गया विभाग"],
"adm.it_none": ["No issue types found.", "शिकायत का कोई प्रकार नहीं मिला।"],
"adm.it_e_load": ["Could not load issue types ({err}).", "शिकायत के प्रकार लोड नहीं हो सके ({err})।"],
"adm.it_e_net_load": ["Network error loading issue types.", "शिकायत के प्रकार लोड करते समय नेटवर्क त्रुटि।"],
"adm.it_no_change": ["No change to save.", "सहेजने के लिए कोई बदलाव नहीं है।"],
"adm.it_e_role": ["Your role can view this page but not change it.", "आपकी भूमिका यह पृष्ठ देख सकती है, पर इसमें बदलाव नहीं कर सकती।"],
"adm.it_e_save": ["Failed to save.", "सहेजा नहीं जा सका।"],
"adm.it_saved": ["Saved: changed from {from} to {to}.", "सहेजा गया: {from} से बदलकर {to} किया गया।"],
"adm.it_e_net_save": ["Network error while saving.", "सहेजते समय नेटवर्क त्रुटि।"],
"adm.ex_page_title": ["Exceptions — GrievIQ Admin", "अपवाद — GrievIQ एडमिन"],
"adm.ex_sub": ["Open cases across all wards that need attention: not acknowledged in time, escalated, disputed by the citizen, or awaiting legal review. Oldest first. You can nudge the responsible representatives, but not change the case yourself.", "सभी वार्डों की वे खुली शिकायतें जिन पर ध्यान देना ज़रूरी है: समय पर पावती नहीं दी गई, ऊपर के स्तर पर भेजी गई, नागरिक ने आपत्ति की, या विधिक समीक्षा की प्रतीक्षा में। सबसे पुरानी पहले। आप ज़िम्मेदार जनप्रतिनिधियों को याद दिला सकते हैं, पर शिकायत में स्वयं बदलाव नहीं कर सकते।"],
"adm.ex_sub_ro": ["Open cases across all wards that need attention: not acknowledged in time, escalated, disputed by the citizen, or awaiting legal review. Oldest first. This is a read-only view: nudging representatives is done by super admins and operations admins.", "सभी वार्डों की वे खुली शिकायतें जिन पर ध्यान देना ज़रूरी है: समय पर पावती नहीं दी गई, ऊपर के स्तर पर भेजी गई, नागरिक ने आपत्ति की, या विधिक समीक्षा की प्रतीक्षा में। सबसे पुरानी पहले। यह केवल देखने के लिए है: जनप्रतिनिधियों को याद दिलाने का काम सुपर एडमिन और संचालन एडमिन करते हैं।"],
"adm.ex_f_issue": ["Issue", "समस्या"],
"adm.ex_all_issues": ["All issues", "सभी समस्याएँ"],
"adm.ex_i_ACK_OVERDUE": ["Not acknowledged in time", "समय पर पावती नहीं"],
"adm.ex_i_ESCALATED": ["Escalated", "ऊपर के स्तर पर भेजी गई"],
"adm.ex_i_DISPUTED": ["Citizen disputed", "नागरिक ने आपत्ति की"],
"adm.ex_i_LEGAL_REVIEW": ["Legal review", "विधिक समीक्षा"],
"adm.ex_i_REOPENED": ["Reopened after closing", "बंद होने के बाद फिर से खोली गई"],
"adm.ex_i_REOPENED_TOP": ["Reopened at the top level", "शीर्ष स्तर पर फिर से खोली गई"],
"adm.ex_d_NOT_FIXED": ["Not fixed", "ठीक नहीं हुई"],
"adm.ex_d_PARTIALLY_FIXED": ["Partially fixed", "आंशिक रूप से ठीक हुई"],
"adm.ex_d_CAME_BACK": ["Problem came back", "समस्या फिर से आ गई"],
"adm.ex_d_WRONG_ISSUE": ["Wrong issue fixed", "गलत समस्या ठीक की गई"],
"adm.ex_d_OTHER": ["Other", "अन्य"],
"adm.ex_f_level": ["Current level", "वर्तमान स्तर"],
"adm.ex_all_levels": ["All levels", "सभी स्तर"],
"adm.ex_days_under1": ["Under 1 day", "1 दिन से कम"],
"adm.ex_day_one": ["{n} day", "{n} दिन"],
"adm.ex_days": ["{n} days", "{n} दिन"],
"adm.ex_unnamed": ["Unnamed {label}", "अनाम {label}"],
"adm.ex_no_email": ["· no email", "· ईमेल नहीं"],
"adm.ex_nudge_many": ["{date} ({n} total)", "{date} (कुल {n})"],
"adm.ex_never": ["Never", "कभी नहीं"],
"adm.ex_level_of": ["Level {i} of {n}", "{n} में से स्तर {i}"],
"adm.ex_nudge_btn": ["Nudge", "याद दिलाएँ"],
"adm.ex_showing_one": ["Showing <b>{shown}</b> of <b>{total}</b> case", "<b>{total}</b> में से <b>{shown}</b> शिकायत दिखाई जा रही है"],
"adm.ex_showing": ["Showing <b>{shown}</b> of <b>{total}</b> cases", "<b>{total}</b> में से <b>{shown}</b> शिकायतें दिखाई जा रही हैं"],
"adm.ex_empty": ["No cases need attention right now.", "अभी किसी शिकायत पर ध्यान देने की ज़रूरत नहीं है।"],
"adm.ex_empty_filter": ["No cases match these filters.", "इन फ़िल्टरों से कोई शिकायत मेल नहीं खाती।"],
"adm.ex_th_open": ["Open for", "कितने समय से खुली"],
"adm.ex_th_issues": ["Issues", "समस्याएँ"],
"adm.ex_th_resp": ["Responsible", "ज़िम्मेदार"],
"adm.ex_th_nudge": ["Last nudge", "पिछला अनुस्मारक"],
"adm.ex_err_load": ["Could not load cases.", "शिकायतें लोड नहीं हो सकीं।"],
"adm.ex_err_role": ["Your role doesn't have access to the exceptions queue.", "आपकी भूमिका को अपवाद सूची की अनुमति नहीं है।"],
"adm.ex_err_conn": ["Could not load cases. Check your connection and press Refresh.", "शिकायतें लोड नहीं हो सकीं। अपना इंटरनेट कनेक्शन जाँचें और रीफ़्रेश दबाएँ।"],
"adm.ex_updated": ["Updated {time}", "{time} बजे अपडेट किया गया"],
"adm.ex_nudge_title": ["Nudge representatives", "जनप्रतिनिधियों को याद दिलाएँ"],
"adm.ex_nudge_title_ref": ["Nudge representatives — {ref}", "जनप्रतिनिधियों को याद दिलाएँ — {ref}"],
"adm.ex_note_label": ["Note to the representatives (optional)", "जनप्रतिनिधियों के लिए टिप्पणी (वैकल्पिक)"],
"adm.ex_note_ph": ["e.g. The citizen has been waiting 5 days. Please acknowledge today.", "जैसे: नागरिक 5 दिन से प्रतीक्षा कर रहे हैं। कृपया आज ही पावती दें।"],
"adm.ex_note_hint": ["Representatives see this note. The citizen only sees that a reminder was sent, not the note.", "यह टिप्पणी जनप्रतिनिधि देखते हैं। नागरिक केवल यह देखते हैं कि अनुस्मारक भेजा गया, टिप्पणी नहीं।"],
"adm.ex_send": ["Send nudge", "अनुस्मारक भेजें"],
"adm.ex_sending": ["Sending…", "भेजा जा रहा है…"],
"adm.ex_who_intro": ["This reminder goes to everyone currently responsible:", "यह अनुस्मारक उन सभी को जाएगा जो अभी ज़िम्मेदार हैं:"],
"adm.ex_via_both": ["email + console", "ईमेल + कंसोल"],
"adm.ex_via_console": ["console only (no email on file)", "केवल कंसोल (ईमेल दर्ज नहीं)"],
"adm.ex_err_send": ["Could not send the nudge.", "अनुस्मारक नहीं भेजा जा सका।"],
"adm.ex_err_net": ["Network error. Please try again.", "नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।"],
"adm.ex_r_head": ["Nudge sent for {ref}.", "{ref} के लिए अनुस्मारक भेजा गया।"],
"adm.ex_r_sent": ["✓ Emailed {who}", "✓ {who} को ईमेल भेजा गया"],
"adm.ex_r_no_email": ["• No email on file for {who} — they will see it in their console", "• {who} का ईमेल दर्ज नहीं है — वे इसे अपने कंसोल में देखेंगे"],
"adm.ex_r_failed": ["✗ Email to {who} failed — they will still see it in their console", "✗ {who} को ईमेल नहीं जा सका — फिर भी वे इसे अपने कंसोल में देखेंगे"],
"adm.rv_page_title": ["Reviews — GrievIQ Admin", "समीक्षा — GrievIQ एडमिन"],
"adm.rv_sub": ["Representative details suggested by citizens when they filed a complaint in an area where we're missing a name or phone. Nothing here is used until you approve it. Suggestions made by several citizens independently are listed first.", "जनप्रतिनिधियों के विवरण जो नागरिकों ने ऐसे क्षेत्र में शिकायत दर्ज करते समय सुझाए जहाँ हमारे पास नाम या फ़ोन नहीं है। आपके अनुमोदन तक इनमें से कुछ भी उपयोग नहीं होता। जिन सुझावों को कई नागरिकों ने अलग-अलग दिया है, वे पहले दिखाए जाते हैं।"],
"adm.rv_sub_ro": ["Representative details suggested by citizens when they filed a complaint in an area where we're missing a name or phone. This is a read-only view: approving or rejecting is done by super admins, operations admins and data moderators.", "जनप्रतिनिधियों के विवरण जो नागरिकों ने ऐसे क्षेत्र में शिकायत दर्ज करते समय सुझाए जहाँ हमारे पास नाम या फ़ोन नहीं है। यह केवल देखने के लिए है: अनुमोदन या अस्वीकार का काम सुपर एडमिन, संचालन एडमिन और डेटा मॉडरेटर करते हैं।"],
"adm.rv_no_name": ["no name", "नाम नहीं"],
"adm.rv_no_phone": ["no phone", "फ़ोन नहीं"],
"adm.rv_no_phone_given": ["no phone given", "फ़ोन नहीं दिया गया"],
"adm.rv_scope_one": ["Approving updates the {role} for all {n} ward in {place}.", "अनुमोदन करने पर {place} के सभी {n} वार्ड के लिए {role} बदल जाएगा।"],
"adm.rv_scope": ["Approving updates the {role} for all {n} wards in {place}.", "अनुमोदन करने पर {place} के सभी {n} वार्डों के लिए {role} बदल जाएगा।"],
"adm.rv_reported_from": ["reported from {ward}", "{ward} से सूचित"],
"adm.rv_a_ward": ["a ward", "एक वार्ड"],
"adm.rv_by_many": ["Suggested by {n} citizens", "{n} नागरिकों का सुझाव"],
"adm.rv_by_one": ["Suggested by 1 citizen", "1 नागरिक का सुझाव"],
"adm.rv_role_for": ["{role} for {where}", "{where} के लिए {role}"],
"adm.rv_on_file": ["On file now", "अभी दर्ज"],
"adm.rv_suggest": ["Citizens suggest", "नागरिकों का सुझाव"],
"adm.rv_from_one": ["From complaint {refs}", "शिकायत {refs} से"],
"adm.rv_from_many": ["From complaints {refs}", "शिकायतों {refs} से"],
"adm.rv_approve_btn": ["Approve…", "अनुमोदित करें…"],
"adm.rv_count": ["<b>{n}</b> to review", "समीक्षा हेतु <b>{n}</b>"],
"adm.rv_count_total": ["<b>{n}</b> to review ({total} suggestions)", "समीक्षा हेतु <b>{n}</b> ({total} सुझाव)"],
"adm.rv_empty": ["No suggestions waiting for review.", "समीक्षा के लिए कोई सुझाव प्रतीक्षा में नहीं है।"],
"adm.rv_err_load": ["Could not load suggestions.", "सुझाव लोड नहीं हो सके।"],
"adm.rv_err_role": ["Your role doesn't have access to the review queue.", "आपकी भूमिका को समीक्षा सूची की अनुमति नहीं है।"],
"adm.rv_err_conn": ["Could not load suggestions. Check your connection and press Refresh.", "सुझाव लोड नहीं हो सके। अपना इंटरनेट कनेक्शन जाँचें और रीफ़्रेश दबाएँ।"],
"adm.rv_approve_role": ["Approve {role}", "{role} अनुमोदित करें"],
"adm.rv_ctx_cur": ["{role} for {place}. Currently on file: {name}.", "{place} के लिए {role}। अभी दर्ज: {name}।"],
"adm.rv_ctx_none": ["{role} for {place}. No name on file yet.", "{place} के लिए {role}। अभी कोई नाम दर्ज नहीं है।"],
"adm.rv_ph_diff": ["Citizens gave different numbers: {list}. Keep the one you've verified.", "नागरिकों ने अलग-अलग नंबर दिए: {list}। वही रखें जिसकी आपने पुष्टि की है।"],
"adm.rv_ph_keep_cur": ["Leave blank to keep the phone already on file ({phone}).", "पहले से दर्ज फ़ोन ({phone}) रखने के लिए खाली छोड़ें।"],
"adm.rv_ph_keep": ["Leave blank to keep the phone already on file.", "पहले से दर्ज फ़ोन रखने के लिए खाली छोड़ें।"],
"adm.rv_name_label": ["Name to save", "सहेजा जाने वाला नाम"],
"adm.rv_name_hint": ["Correct the spelling if needed before saving.", "सहेजने से पहले ज़रूरत हो तो वर्तनी ठीक करें।"],
"adm.rv_phone_label": ["Phone to save (optional)", "सहेजा जाने वाला फ़ोन (वैकल्पिक)"],
"adm.rv_save": ["Approve and save", "अनुमोदित करें और सहेजें"],
"adm.rv_err_name": ["Enter the representative's name.", "जनप्रतिनिधि का नाम दर्ज करें।"],
"adm.rv_err_approve": ["Could not approve.", "अनुमोदन नहीं हो सका।"],
"adm.rv_err_net": ["Network error. Please try again.", "नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।"],
"adm.rv_approved": ["Approved. {role} for {place} is now saved as <b>{name}</b>.", "अनुमोदित। {place} के लिए {role} अब <b>{name}</b> के रूप में सहेजा गया है।"],
"adm.rv_confirm_reject": ["Reject \"{name}\" as {role} for {place}? Nothing will be changed.", "{place} के लिए {role} के रूप में \"{name}\" को अस्वीकार करें? कुछ भी नहीं बदला जाएगा।"],
"adm.rv_err_reject": ["Could not reject.", "अस्वीकार नहीं हो सका।"],
"adm.rv_rejected": ["Rejected {name} for {place}. Nothing was changed.", "{place} के लिए {name} अस्वीकार किया गया। कुछ भी नहीं बदला गया।"],
"adm.im_page_title": ["Import jurisdiction data — GrievIQ Admin", "क्षेत्राधिकार डेटा का आयात — GrievIQ एडमिन"],
"adm.im_title": ["Import jurisdiction data", "क्षेत्राधिकार डेटा का आयात"],
"adm.im_sub": ["Bulk-load MP/MLA/municipal body/ward structure from a CSV. Requires you to be logged in as an authorized admin.", "CSV से सांसद/विधायक/नगर निकाय/वार्ड की संरचना एक साथ लोड करें। इसके लिए अधिकृत एडमिन के रूप में लॉग इन होना आवश्यक है।"],
"adm.im_format_h": ["CSV format", "CSV का प्रारूप"],
"adm.im_format_p": ["One row per ward or village. Required columns: <code>mp_constituency_name</code>, <code>mla_constituency_name</code>, <code>local_unit_name</code>, <code>unit_type</code> (RURAL or URBAN). Everything else is optional but recommended.", "हर वार्ड या गाँव के लिए एक पंक्ति। आवश्यक कॉलम: <code>mp_constituency_name</code>, <code>mla_constituency_name</code>, <code>local_unit_name</code>, <code>unit_type</code> (RURAL या URBAN)। बाकी सभी कॉलम वैकल्पिक हैं, पर उन्हें भरने की सलाह दी जाती है।"],
"adm.im_rule_once": ["MP, MLA, and municipal body rows that repeat across many wards are only created once — matched by name.", "कई वार्डों में दोहराए गए सांसद, विधायक और नगर निकाय केवल एक बार बनाए जाते हैं — नाम से मिलान करके।"],
"adm.im_rule_reupload": ["Re-uploading the same CSV updates existing rows instead of duplicating them.", "वही CSV दोबारा अपलोड करने पर मौजूदा पंक्तियाँ अद्यतन होती हैं, उनकी दोहरी प्रविष्टि नहीं बनती।"],
"adm.im_rule_localities": ["<code>localities</code> should be a semicolon-separated list, e.g. <code>Hazratganj; Ashok Marg</code>.", "<code>localities</code> अर्धविराम (;) से अलग की गई सूची होनी चाहिए, जैसे <code>Hazratganj; Ashok Marg</code>।"],
"adm.im_upload_h": ["Upload CSV", "CSV अपलोड करें"],
"adm.im_choose": ["Click to choose a CSV file", "CSV फ़ाइल चुनने के लिए क्लिक करें"],
"adm.im_run": ["Run import", "आयात शुरू करें"],
"adm.im_importing": ["Importing...", "आयात हो रहा है..."],
"adm.im_failed": ["Import failed:", "आयात विफल रहा:"],
"adm.im_unknown": ["Unknown error.", "अज्ञात त्रुटि।"],
"adm.im_network": ["<b>Network error.</b> Please try again.", "<b>नेटवर्क त्रुटि।</b> कृपया पुनः प्रयास करें।"],
"adm.im_complete": ["Import complete", "आयात पूरा हुआ"],
"adm.im_rows": ["Rows processed", "संसाधित पंक्तियाँ"],
"adm.im_mp_created": ["MP constituencies created", "बनाए गए सांसद निर्वाचन क्षेत्र"],
"adm.im_mla_created": ["MLA constituencies created", "बनाए गए विधायक निर्वाचन क्षेत्र"],
"adm.im_mb_created": ["Municipal bodies created", "बनाए गए नगर निकाय"],
"adm.im_units_created": ["Wards/villages created", "बनाए गए वार्ड/गाँव"],
"adm.im_units_updated": ["Wards/villages updated", "अद्यतन किए गए वार्ड/गाँव"],
"adm.im_row_issues": ["{n} row(s) had issues:", "{n} पंक्ति/पंक्तियों में समस्या थी:"],
"adm.iw_page_title": ["Import ward boundaries — GrievIQ Admin", "वार्ड सीमाओं का आयात — GrievIQ एडमिन"],
"adm.iw_title": ["Import ward boundaries", "वार्ड सीमाओं का आयात"],
"adm.iw_sub": ["Attach real ward polygon shapes to existing wards, matched by name. Requires you to be logged in as an authorized admin.", "मौजूदा वार्डों से उनकी वास्तविक सीमा (पॉलीगॉन) जोड़ें, नाम से मिलान करके। इसके लिए अधिकृत एडमिन के रूप में लॉग इन होना आवश्यक है।"],
"adm.iw_format_h": ["GeoJSON format", "GeoJSON का प्रारूप"],
"adm.iw_format_p": ["Upload a ward-boundary GeoJSON file (e.g. from bharatlas.com). Each feature's <code>Ward Name</code> property is matched, case-insensitively, against an existing <code>local_units</code> row.", "वार्ड सीमाओं की GeoJSON फ़ाइल अपलोड करें (जैसे bharatlas.com से)। हर feature की <code>Ward Name</code> property का मिलान, छोटे-बड़े अक्षरों का भेद किए बिना, मौजूदा <code>local_units</code> पंक्ति से किया जाता है।"],
"adm.iw_rule_existing": ["This only updates wards that already exist — it never creates new ones. Add the ward first via the jurisdiction CSV importer.", "यह केवल पहले से मौजूद वार्डों को अद्यतन करता है — नए वार्ड कभी नहीं बनाता। पहले क्षेत्राधिकार CSV आयात से वार्ड जोड़ें।"],
"adm.iw_rule_unmatched": ["A ward name in the file with no matching local unit is reported as \"unmatched,\" not an error.", "फ़ाइल में ऐसा वार्ड नाम जिसका कोई मेल खाता वार्ड/गाँव नहीं है, \"बिना मिलान\" के रूप में बताया जाता है, त्रुटि के रूप में नहीं।"],
"adm.iw_rule_reupload": ["Re-uploading the same file safely overwrites the polygon on each matched ward.", "वही फ़ाइल दोबारा अपलोड करने पर हर मिलान वाले वार्ड की सीमा सुरक्षित रूप से बदल दी जाती है।"],
"adm.iw_upload_h": ["Upload GeoJSON", "GeoJSON अपलोड करें"],
"adm.iw_choose": ["Click to choose a .geojson file", ".geojson फ़ाइल चुनने के लिए क्लिक करें"],
"adm.iw_run": ["Run import", "आयात शुरू करें"],
"adm.iw_importing": ["Importing...", "आयात हो रहा है..."],
"adm.iw_failed": ["Import failed:", "आयात विफल रहा:"],
"adm.iw_unknown": ["Unknown error.", "अज्ञात त्रुटि।"],
"adm.iw_network": ["<b>Network error.</b> Please try again.", "<b>नेटवर्क त्रुटि।</b> कृपया पुनः प्रयास करें।"],
"adm.iw_complete": ["Import complete", "आयात पूरा हुआ"],
"adm.iw_features": ["Features in file", "फ़ाइल में features"],
"adm.iw_matched": ["Wards matched &amp; updated", "मिलान और अद्यतन किए गए वार्ड"],
"adm.iw_unmatched": ["Wards unmatched", "बिना मिलान वाले वार्ड"],
"adm.iw_sample": ["Sample unmatched names:", "बिना मिलान वाले कुछ नाम:"],
"adm.iw_issues": ["{n} issue(s):", "{n} समस्या/समस्याएँ:"],
"adm.st_page_title": ["GrievIQ Admin — Staff", "GrievIQ एडमिन — कर्मचारी"],
"adm.st_title": ["Staff & roles", "कर्मचारी और भूमिकाएँ"],
"adm.st_sub": ["Manage who has admin access to GrievIQ, and what they're allowed to do.", "तय करें कि GrievIQ में किसे एडमिन पहुँच है और वे क्या-क्या कर सकते हैं।"],
"adm.st_sub_readonly": ["Who has admin access to GrievIQ and their role. This is a read-only view: only a super admin can add, change or remove staff.", "GrievIQ में किसे एडमिन पहुँच है और उनकी भूमिका क्या है। यह केवल देखने का दृश्य है: कर्मचारियों को केवल सुपर एडमिन जोड़, बदल या हटा सकते हैं।"],
"adm.st_add_h": ["Add staff member", "कर्मचारी जोड़ें"],
"adm.st_email_label": ["Email address", "ईमेल पता"],
"adm.st_email_ph": ["name@example.com", "name@example.com"],
"adm.st_role_label": ["Role", "भूमिका"],
"adm.st_role_super_admin": ["Super Admin", "सुपर एडमिन"],
"adm.st_role_operations_admin": ["Operations Admin", "संचालन एडमिन"],
"adm.st_role_data_moderator": ["Data Moderator", "डेटा मॉडरेटर"],
"adm.st_role_auditor": ["Auditor", "लेखा परीक्षक"],
"adm.st_role_data_entry_operator": ["Data Entry Operator", "डेटा एंट्री ऑपरेटर"],
"adm.st_opt_auditor": ["Auditor (raises audit observations; can't change data)", "लेखा परीक्षक (लेखा परीक्षा अवलोकन दर्ज करते हैं; डेटा नहीं बदल सकते)"],
"adm.st_opt_data_entry_operator": ["Data Entry Operator (requests need approval)", "डेटा एंट्री ऑपरेटर (अनुरोधों को स्वीकृति चाहिए)"],
"adm.st_add_btn": ["Add staff", "कर्मचारी जोड़ें"],
"adm.st_current_h": ["Current staff", "वर्तमान कर्मचारी"],
"adm.st_th_email": ["Email", "ईमेल"],
"adm.st_th_role": ["Role", "भूमिका"],
"adm.st_th_added": ["Added", "जोड़े गए"],
"adm.st_th_actions": ["Actions", "कार्रवाई"],
"adm.st_loading": ["Loading...", "लोड हो रहा है..."],
"adm.st_none": ["No staff yet.", "अभी कोई कर्मचारी नहीं।"],
"adm.st_err_load": ["Could not load the staff list. Press refresh to try again.", "कर्मचारियों की सूची लोड नहीं हो सकी। पुनः प्रयास करने के लिए पेज रीफ़्रेश करें।"],
"adm.st_err_not_admin": ["Your account is not a GrievIQ staff account.", "आपका खाता GrievIQ कर्मचारी खाता नहीं है।"],
"adm.st_err_role": ["Your role can't see the staff list. It is for super admins and auditors.", "आपकी भूमिका कर्मचारियों की सूची नहीं देख सकती। यह सुपर एडमिन और लेखा परीक्षकों के लिए है।"],
"adm.st_err_network_load": ["Network error loading staff.", "कर्मचारियों की सूची लोड करते समय नेटवर्क त्रुटि।"],
"adm.st_new_role_for": ["New role for {email}", "{email} की नई भूमिका"],
"adm.st_remove": ["Remove", "हटाएँ"],
"adm.st_saving": ["Saving...", "सहेजा जा रहा है..."],
"adm.st_err_update": ["Failed to update role.", "भूमिका अद्यतन नहीं हो सकी।"],
"adm.st_updated": ["Updated {email} to {role}.", "{email} की भूमिका बदलकर {role} कर दी गई।"],
"adm.st_err_network_update": ["Network error while updating role.", "भूमिका अद्यतन करते समय नेटवर्क त्रुटि।"],
"adm.st_confirm_remove": ["Remove {email} from staff? They will lose admin access immediately.", "{email} को कर्मचारियों से हटाएँ? उनकी एडमिन पहुँच तुरंत समाप्त हो जाएगी।"],
"adm.st_removing": ["Removing...", "हटाया जा रहा है..."],
"adm.st_err_remove": ["Failed to remove staff member.", "कर्मचारी को हटाया नहीं जा सका।"],
"adm.st_removed": ["Removed {email}.", "{email} को हटा दिया गया।"],
"adm.st_err_network_remove": ["Network error while removing staff member.", "कर्मचारी को हटाते समय नेटवर्क त्रुटि।"],
"adm.st_err_email": ["Enter an email address.", "ईमेल पता लिखें।"],
"adm.st_adding": ["Adding...", "जोड़ा जा रहा है..."],
"adm.st_err_add": ["Failed to add staff member.", "कर्मचारी को जोड़ा नहीं जा सका।"],
"adm.st_added": ["Added {email} as {role}.", "{email} को {role} के रूप में जोड़ा गया।"],
"adm.st_err_network_add": ["Network error while adding staff member.", "कर्मचारी को जोड़ते समय नेटवर्क त्रुटि।"],
"adm.sf_not_ready": ["Staff details aren't set up yet: run the item 10 database step. You can still change roles.", "कर्मचारी विवरण अभी सेट नहीं है: आइटम 10 का डेटाबेस चरण चलाएँ। भूमिकाएँ अब भी बदली जा सकती हैं।"],
"adm.sf_review_t": ["Check the staff list", "कर्मचारी सूची जाँचें"],
"adm.sf_review_last": ["Last confirmed on {date} by {by}.", "अंतिम पुष्टि {date} को {by} द्वारा।"],
"adm.sf_review_never": ["The list has not been confirmed yet.", "सूची की अभी तक पुष्टि नहीं हुई है।"],
"adm.sf_review_ask": ["Every {n} days, confirm that each person still needs access and has the right role.", "हर {n} दिन में पुष्टि करें कि हर व्यक्ति को अब भी पहुँच की आवश्यकता है और उसकी भूमिका सही है।"],
"adm.sf_review_btn": ["The list is correct", "सूची सही है"],
"adm.sf_reviewed": ["Thank you. The staff list is confirmed for the next 90 days.", "धन्यवाद। अगले 90 दिनों के लिए कर्मचारी सूची की पुष्टि हो गई।"],
"adm.sf_covers_t": ["Leave cover now", "अभी का अतिरिक्त कार्यभार"],
"adm.sf_cover_line": ["{cover} is covering for {away} until {date}", "{cover}, {away} का कार्यभार {date} तक संभाल रहे हैं"],
"adm.sf_end_cover": ["End early", "जल्दी समाप्त करें"],
"adm.sf_end_cover_btn": ["End the cover", "कार्यभार समाप्त करें"],
"adm.sf_f_end_reason": ["Why it ends early", "जल्दी समाप्त करने का कारण"],
"adm.sf_cover_ended_ok": ["The leave cover has ended.", "अतिरिक्त कार्यभार समाप्त हो गया।"],
"adm.sf_cover_history_t": ["Recent leave covers", "हाल के अतिरिक्त कार्यभार"],
"adm.sf_cover_hist": ["{cover} covered for {away}, {from} – {to}", "{cover} ने {away} का कार्यभार संभाला, {from} – {to}"],
"adm.sf_cover_ended": ["ended on {date}: {reason}", "{date} को समाप्त: {reason}"],
"adm.sf_cover_finished": ["finished", "पूरा हुआ"],
"adm.sf_cover_upcoming": ["starts later", "बाद में शुरू होगा"],
"adm.sf_f_name": ["Full name", "पूरा नाम"],
"adm.sf_f_id": ["Employee ID", "कर्मचारी आईडी"],
"adm.sf_h_id": ["Unique, and never given to anyone else. Letters, numbers, - and /. GIQ-21 and GIQ-021 count as the same ID.", "अद्वितीय, और किसी और को कभी नहीं दी जाती। अक्षर, अंक, - और /। GIQ-21 और GIQ-021 एक ही आईडी मानी जाती हैं।"],
"adm.sf_f_phone": ["Mobile number", "मोबाइल नंबर"],
"adm.sf_h_phone": ["10-digit mobile number, for urgent work contact.", "10 अंकों का मोबाइल नंबर, आवश्यक कार्य-संपर्क के लिए।"],
"adm.sf_h_phone_masked": ["Enter the full number again to change it.", "बदलने के लिए पूरा नंबर फिर से लिखें।"],
"adm.sf_f_designation": ["Designation (optional)", "पदनाम (वैकल्पिक)"],
"adm.sf_h_email": ["Use the person's own @grieviq.in address. One address per person.", "व्यक्ति का अपना @grieviq.in पता दें। हर व्यक्ति का अलग पता।"],
"adm.sf_privacy_note": ["Name, employee ID and mobile number are kept so every action in the audit log can be traced to one person and they can be reached urgently. The full mobile number is shown only to the super admin and the person.", "नाम, कर्मचारी आईडी और मोबाइल नंबर इसलिए रखे जाते हैं ताकि लेखा परीक्षा लॉग की हर कार्रवाई एक व्यक्ति तक पहुँचे और आवश्यकता पर उनसे संपर्क हो सके। पूरा मोबाइल नंबर केवल सुपर एडमिन और उसी व्यक्ति को दिखता है।"],
"adm.sf_name_missing": ["Name not added", "नाम नहीं जोड़ा गया"],
"adm.sf_you": ["you", "आप"],
"adm.sf_mobile": ["Mobile {phone}", "मोबाइल {phone}"],
"adm.sf_mobile_missing": ["Mobile not added", "मोबाइल नहीं जोड़ा गया"],
"adm.sf_added_on": ["added {date}", "{date} को जोड़ा"],
"adm.sf_st_present": ["Present", "उपस्थित"],
"adm.sf_st_leave": ["On leave", "अवकाश पर"],
"adm.sf_st_leave_until": ["On leave until {date}", "{date} तक अवकाश पर"],
"adm.sf_st_paused": ["access paused", "पहुँच रोकी गई"],
"adm.sf_st_covering": ["Covering for {name}", "{name} का कार्यभार"],
"adm.sf_st_left": ["Left", "छोड़ चुके"],
"adm.sf_edit": ["Edit details", "विवरण बदलें"],
"adm.sf_add_details": ["Add details", "विवरण जोड़ें"],
"adm.sf_mark_leave": ["Mark on leave", "अवकाश पर दर्ज करें"],
"adm.sf_mark_present": ["Back from leave", "अवकाश से वापस"],
"adm.sf_mark_left": ["Mark as left", "छोड़कर गया दर्ज करें"],
"adm.sf_f_until": ["Back on (last day of leave)", "वापसी (अवकाश का अंतिम दिन)"],
"adm.sf_h_until": ["They are shown as present again after this date, automatically.", "इस तिथि के बाद वे अपने आप उपस्थित दिखेंगे।"],
"adm.sf_f_cover": ["Who covers their duties (optional)", "उनका कार्यभार कौन संभालेगा (वैकल्पिक)"],
"adm.sf_h_cover": ["The colleague keeps their own sign-in and also gets these duties until the return date (at most {n} days).", "सहकर्मी अपने ही साइन-इन से काम करते हैं और वापसी की तिथि तक (अधिकतम {n} दिन) ये कर्तव्य भी संभालते हैं।"],
"adm.sf_h_cover_auditor": ["Auditor duties can only be covered by another auditor.", "लेखा परीक्षक का कार्यभार केवल दूसरा लेखा परीक्षक संभाल सकता है।"],
"adm.sf_no_cover": ["No one", "कोई नहीं"],
"adm.sf_f_cover_reason": ["Reason for the cover", "कार्यभार का कारण"],
"adm.sf_ph_cover_reason": ["e.g. Earned leave", "जैसे अर्जित अवकाश"],
"adm.sf_super_no_cover": ["Super admin duties can't be covered. The other super admin account looks after them.", "सुपर एडमिन का कार्यभार किसी और को नहीं दिया जा सकता। दूसरा सुपर एडमिन खाता इसे संभालता है।"],
"adm.sf_f_pause": ["Pause their access while they are away (recommended for long leave)", "अवकाश के दौरान उनकी पहुँच रोकें (लंबे अवकाश के लिए अनुशंसित)"],
"adm.sf_leave_btn": ["Mark on leave", "अवकाश पर दर्ज करें"],
"adm.sf_leave_ok": ["{name} is marked as on leave.", "{name} अवकाश पर दर्ज किए गए।"],
"adm.sf_present_ok": ["{name} is marked as back from leave.", "{name} अवकाश से वापस दर्ज किए गए।"],
"adm.sf_left_note": ["They will no longer be able to sign in. Their record stays, so the audit log still shows who they were; their email and employee ID are never given to anyone else.", "वे अब साइन इन नहीं कर पाएँगे। उनका रिकॉर्ड रहेगा, ताकि लेखा परीक्षा लॉग में दिखता रहे कि वे कौन थे; उनका ईमेल और कर्मचारी आईडी किसी और को कभी नहीं दिए जाएँगे।"],
"adm.sf_f_lastday": ["Last working day", "अंतिम कार्य दिवस"],
"adm.sf_f_left_reason": ["Reason", "कारण"],
"adm.sf_ph_left_reason": ["e.g. Resigned, contract ended", "जैसे त्यागपत्र, अनुबंध समाप्त"],
"adm.sf_delete": ["Delete (added by mistake)", "हटाएँ (गलती से जोड़ा गया)"],
"adm.sf_delete_note": ["{name} has no activity on record, so this entry can be deleted completely, for example a test entry or a wrong email. Their email and employee ID become free again. The audit log keeps one line saying who deleted it, when and why.", "{name} की कोई गतिविधि दर्ज नहीं है, इसलिए यह प्रविष्टि पूरी तरह हटाई जा सकती है, जैसे परीक्षण प्रविष्टि या गलत ईमेल। उनका ईमेल और कर्मचारी आईडी फिर से उपलब्ध हो जाएँगे। लेखा परीक्षा लॉग में एक पंक्ति रहेगी कि किसने, कब और क्यों हटाया।"],
"adm.sf_f_delete_reason": ["Why is this entry being deleted?", "यह प्रविष्टि क्यों हटाई जा रही है?"],
"adm.sf_ph_delete_reason": ["e.g. Test entry, added by mistake", "जैसे परीक्षण प्रविष्टि, गलती से जोड़ी गई"],
"adm.sf_delete_btn": ["Delete permanently", "स्थायी रूप से हटाएँ"],
"adm.sf_delete_confirm": ["Delete {name} permanently? This can't be undone.", "{name} को स्थायी रूप से हटाएँ? इसे वापस नहीं किया जा सकता।"],
"adm.sf_delete_ok": ["{name} was deleted. The audit log records the deletion.", "{name} को हटा दिया गया। लेखा परीक्षा लॉग में यह दर्ज है।"],
"adm.sf_e_has_activity": ["This person has activity on record, so the entry can't be deleted. Mark them as having left instead.", "इस व्यक्ति की गतिविधि दर्ज है, इसलिए प्रविष्टि हटाई नहीं जा सकती। इसके बजाय उन्हें छोड़कर गया दर्ज करें।"],
"adm.sf_left_can_delete": ["Added by mistake? This person has no activity on record, so you can use Delete instead.", "गलती से जोड़ा गया? इस व्यक्ति की कोई गतिविधि दर्ज नहीं है, इसलिए आप इसके बजाय हटाएँ का उपयोग कर सकते हैं।"],
"adm.sf_left_kept": ["This person has activity on record, so their entry is kept for the audit trail and can't be deleted.", "इस व्यक्ति की गतिविधि दर्ज है, इसलिए लेखा परीक्षा के लिए उनकी प्रविष्टि रखी जाती है और हटाई नहीं जा सकती।"],
"adm.sf_left_btn": ["Mark as left", "छोड़कर गया दर्ज करें"],
"adm.sf_left_confirm": ["Mark {name} as having left? Their access stops at once.", "{name} को छोड़कर गया दर्ज करें? उनकी पहुँच तुरंत बंद हो जाएगी।"],
"adm.sf_left_ok": ["{name} is marked as having left. Their access has stopped.", "{name} को छोड़कर गया दर्ज किया गया। उनकी पहुँच बंद हो गई।"],
"adm.sf_former_t": ["Former staff ({n})", "पूर्व कर्मचारी ({n})"],
"adm.sf_former_note": ["People who have left. They can't sign in; their records stay for the audit log.", "जो छोड़कर जा चुके हैं। वे साइन इन नहीं कर सकते; उनके रिकॉर्ड लेखा परीक्षा लॉग के लिए रखे जाते हैं।"],
"adm.sf_left_on": ["left {date}: {reason}", "{date} को छोड़ा: {reason}"],
"adm.sf_bring_back": ["Bring back", "वापस लें"],
"adm.sf_back_note": ["Only for the same person returning. A new person always gets a new email and employee ID.", "केवल उसी व्यक्ति की वापसी के लिए। नए व्यक्ति को हमेशा नया ईमेल और कर्मचारी आईडी मिलती है।"],
"adm.sf_f_back_reason": ["Why they are coming back", "वापसी का कारण"],
"adm.sf_back_ok": ["{name} is back on the staff list.", "{name} फिर से कर्मचारी सूची में हैं।"],
"adm.sf_saved_details": ["Details saved for {name}.", "{name} का विवरण सहेजा गया।"],
"adm.sf_unchanged": ["Nothing was changed.", "कुछ नहीं बदला गया।"],
"adm.sf_e_name": ["Enter the full name (2 to 80 characters).", "पूरा नाम लिखें (2 से 80 अक्षर)।"],
"adm.sf_e_id": ["Enter the employee ID.", "कर्मचारी आईडी लिखें।"],
"adm.sf_e_id_format": ["Use letters, numbers, - or / only (up to 20).", "केवल अक्षर, अंक, - या / का उपयोग करें (अधिकतम 20)।"],
"adm.sf_e_id_taken": ["That employee ID is already used by {name}.", "यह कर्मचारी आईडी पहले से {name} की है।"],
"adm.sf_e_phone": ["Enter the mobile number.", "मोबाइल नंबर लिखें।"],
"adm.sf_e_phone_format": ["Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.", "6, 7, 8 या 9 से शुरू होने वाला 10 अंकों का भारतीय मोबाइल नंबर लिखें।"],
"adm.sf_e_designation": ["Keep the designation under 60 characters.", "पदनाम 60 अक्षरों से कम रखें।"],
"adm.sf_e_email_taken": ["That email is already a staff member.", "यह ईमेल पहले से कर्मचारी है।"],
"adm.sf_e_email_former": ["This email belonged to someone who has left. Use a new email for a new person.", "यह ईमेल छोड़कर जा चुके व्यक्ति का था। नए व्यक्ति के लिए नया ईमेल दें।"],
"adm.sf_e_role": ["Choose a role.", "भूमिका चुनें।"],
"adm.sf_e_self_left": ["You can't mark yourself as having left.", "आप स्वयं को छोड़कर गया दर्ज नहीं कर सकते।"],
"adm.sf_e_last_super": ["Keep at least one super admin who can sign in.", "कम से कम एक ऐसा सुपर एडमिन रखें जो साइन इन कर सके।"],
"adm.sf_e_already_left": ["This person has already left.", "यह व्यक्ति पहले ही छोड़ चुका है।"],
"adm.sf_e_date": ["Choose a date.", "तिथि चुनें।"],
"adm.sf_e_past": ["The date can't be in the past.", "तिथि बीती हुई नहीं हो सकती।"],
"adm.sf_e_leave_long": ["Leave can be entered for up to a year at a time.", "अवकाश एक बार में अधिकतम एक वर्ष के लिए दर्ज हो सकता है।"],
"adm.sf_e_cover_long": ["A cover can last at most 90 days. Choose an earlier date, and add a new cover later if needed.", "कार्यभार अधिकतम 90 दिन का हो सकता है। पहले की तिथि चुनें, और आवश्यकता हो तो बाद में नया कार्यभार दें।"],
"adm.sf_e_pause_self": ["You can't pause your own access.", "आप अपनी ही पहुँच नहीं रोक सकते।"],
"adm.sf_e_cover_staff": ["Choose a current staff member.", "किसी वर्तमान कर्मचारी को चुनें।"],
"adm.sf_e_cover_same": ["Someone else has to cover.", "कार्यभार कोई और संभालेगा।"],
"adm.sf_e_cover_super": ["Super admin duties can't be covered.", "सुपर एडमिन का कार्यभार किसी और को नहीं दिया जा सकता।"],
"adm.sf_e_cover_auditor": ["Auditor duties can only pass between auditors, to keep the audit independent.", "लेखा परीक्षा की स्वतंत्रता के लिए लेखा परीक्षक का कार्यभार केवल लेखा परीक्षकों के बीच दिया जा सकता है।"],
"adm.sf_e_cover_all": ["A super admin already has every permission; choose someone else.", "सुपर एडमिन के पास पहले से हर अनुमति है; किसी और को चुनें।"],
"adm.sf_e_cover_leave": ["That person is on leave themselves.", "वह व्यक्ति स्वयं अवकाश पर है।"],
"adm.sf_e_cover_busy": ["That person is already covering for someone. One cover at a time.", "वह व्यक्ति पहले से किसी का कार्यभार संभाल रहा है। एक समय में एक ही कार्यभार।"],
"adm.sf_e_cover_away": ["The person going on leave is covering for someone else. End that cover first.", "अवकाश पर जा रहा व्यक्ति किसी और का कार्यभार संभाल रहा है। पहले वह कार्यभार समाप्त करें।"],
"adm.sf_e_reason": ["Give the reason.", "कारण बताएँ।"],
"adm.sf_e_lastday_far": ["The last working day can be at most 30 days ahead.", "अंतिम कार्य दिवस अधिकतम 30 दिन आगे का हो सकता है।"],
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
"adm.j_sub_view": ["MP constituencies, their MLAs, and each MLA's wards, with their contact details. This is a read-only view: changes are made by super admins and operations admins, or requested by data entry operators.", "लोकसभा क्षेत्र, उनके विधायक, और हर विधायक के वार्ड, संपर्क विवरण सहित। यह केवल देखने के लिए है: परिवर्तन सुपर एडमिन और संचालन एडमिन करते हैं, या डेटा एंट्री ऑपरेटर उनका अनुरोध करते हैं।"],
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
"adm.c_sub_view": ["Every change requested by data entry operators and what happened to it. You can read them; approving is for super admins and operations admins.", "डेटा एंट्री ऑपरेटरों द्वारा माँगा गया हर परिवर्तन और उसका परिणाम। आप इन्हें पढ़ सकते हैं; अनुमोदन सुपर एडमिन और संचालन एडमिन करते हैं।"],
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
"home.loc_title_outside": ["GrievIQ isn't in {place} yet", "GrievIQ अभी {place} में उपलब्ध नहीं है"],
"home.loc_want_why": ["Would you like GrievIQ here? Tap below. It helps us decide which city to add next.", "क्या आप यहाँ GrievIQ चाहते हैं? नीचे टैप करें। इससे हमें तय करने में मदद मिलती है कि अगला शहर कौन-सा हो।"],
"home.loc_search_fail": ["Address search couldn't load. You can still use your location or choose from the list.", "पता खोज लोड नहीं हो सकी। आप अब भी अपनी लोकेशन या सूची का उपयोग कर सकते हैं।"],
"home.loc_ambiguous": ["More than one ward has this name. Please choose:", "इस नाम के एक से अधिक वार्ड हैं। कृपया चुनें:"],
"home.loc_link_missing": ["That ward link wasn't found. Please find the ward below.", "यह वार्ड लिंक नहीं मिला। कृपया नीचे वार्ड खोजें।"],
"home.loc_page_title": ["Report civic problems in {place} · GrievIQ", "{place} की नागरिक समस्याएँ दर्ज करें · GrievIQ"],
// ---- Complaint form: pin and ward hand-over from Home (Part 3, Sept 2026) ----
"submit.pin_note": ["Exact spot added from the map. Your representatives will see it; it is never shown publicly.", "नक्शे से सटीक स्थान जोड़ा गया। आपके जनप्रतिनिधि इसे देख सकेंगे; इसे कभी सार्वजनिक रूप से नहीं दिखाया जाता।"],
"submit.pin_remove": ["Remove this spot", "यह स्थान हटाएँ"],
"submit.pin_removed": ["Spot removed. Your complaint will be filed for the area without a pin.", "स्थान हटा दिया गया। आपकी शिकायत बिना पिन के क्षेत्र के लिए दर्ज होगी।"],
"submit.not_open": ["That address is in {name}, which can't take complaints yet. Its details are still being collected. You can choose another area below.", "यह पता {name} में है, जहाँ अभी शिकायत दर्ज नहीं हो सकती। इसका विवरण अभी एकत्र किया जा रहा है। आप नीचे कोई अन्य क्षेत्र चुन सकते हैं।"],
"submit.srv_not_open": ["This area can't take complaints yet. Please choose another area.", "इस क्षेत्र में अभी शिकायत दर्ज नहीं हो सकती। कृपया कोई अन्य क्षेत्र चुनें।"],
// ---- Item 8b: the representative's team ----
"rep.loading": ["Loading…", "लोड हो रहा है…"],
"rep.tab_team": ["Team", "टीम"],
"rep.tab_audit": ["Audit", "लेखा परीक्षा"],
"rep.au_tab_count": ["{n} waiting for your office", "{n} आपके कार्यालय की प्रतीक्षा में"],
"rep.au_title": ["Audit observations", "लेखा परीक्षा अवलोकन"],
"rep.au_count": ["{n} in total · {a} waiting for your office", "कुल {n} · {a} आपके कार्यालय की प्रतीक्षा में"],
"rep.au_intro": ["Findings from GrievIQ's independent auditor about your office. Reply whether you agree and what you will do, then report when it's done. The auditor checks the work and closes each finding. The representative and office managers can reply.", "आपके कार्यालय के बारे में GrievIQ के स्वतंत्र लेखा परीक्षक के निष्कर्ष। बताएँ कि आप सहमत हैं या नहीं और क्या करेंगे, फिर काम पूरा होने पर सूचित करें। लेखा परीक्षक काम की जाँच कर हर निष्कर्ष बंद करते हैं। जनप्रतिनिधि और कार्यालय प्रबंधक उत्तर दे सकते हैं।"],
"rep.au_none_here": ["No audit observations for this office.", "इस कार्यालय के लिए कोई लेखा परीक्षा अवलोकन नहीं।"],
"rep.au_due": ["Due by {date}", "नियत तिथि: {date}"],
"rep.au_overdue": ["Overdue", "समय-सीमा पार"],
"rep.au_r_CRITICAL": ["Critical", "अति गंभीर"],
"rep.au_r_HIGH": ["High", "उच्च"],
"rep.au_r_MEDIUM": ["Medium", "मध्यम"],
"rep.au_r_LOW": ["Low", "निम्न"],
"rep.au_st_reply": ["Waiting for your reply", "आपके उत्तर की प्रतीक्षा"],
"rep.au_st_sentback": ["Sent back by the auditor", "लेखा परीक्षक ने वापस भेजा"],
"rep.au_st_done": ["Waiting for you to report it's done", "काम पूरा होने की सूचना की प्रतीक्षा"],
"rep.au_st_disagreed": ["You disagreed – the auditor will follow up", "आप असहमत हैं – लेखा परीक्षक आगे देखेंगे"],
"rep.au_st_checking": ["With the auditor for checking", "लेखा परीक्षक जाँच कर रहे हैं"],
"rep.au_st_closed": ["Closed", "बंद"],
"rep.au_st_risk": ["Risk accepted", "जोखिम स्वीकार किया गया"],
"rep.au_st_other": ["In progress", "प्रगति पर"],
"rep.au_t_corporator": ["Corporator", "पार्षद"],
"rep.au_t_pradhan": ["Gram Pradhan", "ग्राम प्रधान"],
"rep.au_about_cases": ["About cases: {list}", "शिकायतों के बारे में: {list}"],
"rep.au_about_office": ["About: {name}", "विषय: {name}"],
"rep.au_about_process": ["About the process: {name}", "प्रक्रिया के बारे में: {name}"],
"rep.au_back": ["All audit observations", "सभी लेखा परीक्षा अवलोकन"],
"rep.au_not_found": ["This observation isn't available to your account. It may belong to another office.", "यह अवलोकन आपके खाते के लिए उपलब्ध नहीं है। यह किसी और कार्यालय का हो सकता है।"],
"rep.au_error": ["Couldn't load this observation. Check your connection and try again.", "यह अवलोकन लोड नहीं हो सका। कनेक्शन जाँचकर फिर कोशिश करें।"],
"rep.au_amended": ["Corrected", "संशोधित"],
"rep.au_k_office": ["Office", "कार्यालय"],
"rep.au_k_due": ["Due by", "नियत तिथि"],
"rep.au_k_issued": ["Issued", "जारी"],
"rep.au_k_about": ["About", "विषय"],
"rep.au_cases": ["Cases it's about", "संबंधित शिकायतें"],
"rep.au_show_case": ["Show in Cases", "शिकायतों में देखें"],
"rep.au_case_elsewhere": ["not in your current case list", "आपकी वर्तमान शिकायत सूची में नहीं"],
"rep.au_h_criteria": ["What should happen", "क्या होना चाहिए"],
"rep.au_h_condition": ["What was found", "क्या पाया गया"],
"rep.au_h_cause": ["Why it happened", "ऐसा क्यों हुआ"],
"rep.au_h_effect": ["Effect", "प्रभाव"],
"rep.au_h_recommendation": ["What the auditor recommends", "लेखा परीक्षक की सिफ़ारिश"],
"rep.au_h_reply": ["Your office's reply", "आपके कार्यालय का उत्तर"],
"rep.au_h_evidence": ["What was done (reported by your office)", "क्या किया गया (आपके कार्यालय द्वारा सूचित)"],
"rep.au_h_risk": ["Risk accepted by the super admin", "सुपर एडमिन द्वारा जोखिम स्वीकार"],
"rep.au_agree": ["We agree", "हम सहमत हैं"],
"rep.au_disagree": ["We disagree", "हम असहमत हैं"],
"rep.au_plan": ["Action plan:", "कार्य योजना:"],
"rep.au_target": ["Target date:", "लक्ष्य तिथि:"],
"rep.au_respond_t": ["Reply to the auditor", "लेखा परीक्षक को उत्तर दें"],
"rep.au_respond_again_t": ["Change your reply", "अपना उत्तर बदलें"],
"rep.au_respond_sub": ["Your reply is recorded with your name and role, on behalf of the office, and can't be edited later.", "आपका उत्तर आपके नाम और भूमिका के साथ, कार्यालय की ओर से दर्ज होता है और बाद में बदला नहीं जा सकता।"],
"rep.au_agree_q": ["Do you agree with this finding?", "क्या आप इस निष्कर्ष से सहमत हैं?"],
"rep.au_f_text": ["Your explanation", "आपका स्पष्टीकरण"],
"rep.au_f_text_hint": ["If you disagree, say why, with the facts the auditor should check.", "असहमत हों तो कारण और वे तथ्य बताएँ जिनकी लेखा परीक्षक जाँच करें।"],
"rep.au_f_plan": ["What your office will do", "आपका कार्यालय क्या करेगा"],
"rep.au_f_plan_hint": ["The steps, and who in the office will do them.", "कदम, और कार्यालय में उन्हें कौन करेगा।"],
"rep.au_f_target": ["Target date", "लक्ष्य तिथि"],
"rep.au_f_target_hint": ["When it will be done. The auditor's due date is {date}.", "कब तक पूरा होगा। लेखा परीक्षक की नियत तिथि {date} है।"],
"rep.au_respond_btn": ["Send reply", "उत्तर भेजें"],
"rep.au_done_t": ["Report that the action is done", "कार्रवाई पूरी होने की सूचना दें"],
"rep.au_done_again_t": ["Report again that the action is done", "कार्रवाई पूरी होने की फिर से सूचना दें"],
"rep.au_done_sub": ["The auditor will check the work before closing the finding.", "निष्कर्ष बंद करने से पहले लेखा परीक्षक काम की जाँच करेंगे।"],
"rep.au_f_evidence": ["What was done, and the evidence", "क्या किया गया, और प्रमाण"],
"rep.au_f_evidence_hint": ["For example the dates, the case numbers handled, or where the auditor can see the result.", "जैसे तिथियाँ, निपटाई गई शिकायतों के नंबर, या लेखा परीक्षक परिणाम कहाँ देख सकते हैं।"],
"rep.au_done_btn": ["Report done", "पूरा होने की सूचना दें"],
"rep.au_comment_t": ["Add a comment", "टिप्पणी जोड़ें"],
"rep.au_f_comment": ["Comment for the auditor", "लेखा परीक्षक के लिए टिप्पणी"],
"rep.au_comment_btn": ["Add comment", "टिप्पणी जोड़ें"],
"rep.au_wait_auditor": ["Your office has reported the action done. The auditor will check it and close the finding, or send it back.", "आपके कार्यालय ने कार्रवाई पूरी होने की सूचना दी है। लेखा परीक्षक जाँच कर निष्कर्ष बंद करेंगे या वापस भेजेंगे।"],
"rep.au_closed_line": ["The auditor has checked the action and closed this finding. Nothing more is needed.", "लेखा परीक्षक ने कार्रवाई की जाँच कर यह निष्कर्ष बंद कर दिया है। और कुछ आवश्यक नहीं।"],
"rep.au_risk_line": ["The super admin has formally accepted this risk. Nothing more is needed from your office.", "सुपर एडमिन ने यह जोखिम औपचारिक रूप से स्वीकार कर लिया है। आपके कार्यालय से और कुछ आवश्यक नहीं।"],
"rep.au_disagreed_line": ["Your office disagreed. The auditor will follow up; you can still change your reply.", "आपका कार्यालय असहमत है। लेखा परीक्षक आगे देखेंगे; आप अब भी अपना उत्तर बदल सकते हैं।"],
"rep.au_amendments": ["Corrections by the auditor", "लेखा परीक्षक द्वारा सुधार"],
"rep.au_fieldname_title": ["Title", "शीर्षक"],
"rep.au_fieldname_criteria": ["What should happen", "क्या होना चाहिए"],
"rep.au_fieldname_condition": ["What was found", "क्या पाया गया"],
"rep.au_fieldname_cause": ["Why it happened", "ऐसा क्यों हुआ"],
"rep.au_fieldname_effect": ["Effect", "प्रभाव"],
"rep.au_fieldname_recommendation": ["Recommendation", "सिफ़ारिश"],
"rep.au_fieldname_rating": ["Rating", "गंभीरता"],
"rep.au_fieldname_due_date": ["Due date", "नियत तिथि"],
"rep.au_reason": ["Reason: {reason}", "कारण: {reason}"],
"rep.au_history": ["History", "इतिहास"],
"rep.au_history_sub": ["Every step is kept permanently and can't be edited.", "हर कदम स्थायी रूप से रखा जाता है और बदला नहीं जा सकता।"],
"rep.au_ev_ISSUED": ["Issued by the auditor", "लेखा परीक्षक ने जारी किया"],
"rep.au_ev_AMENDED": ["Corrected by the auditor", "लेखा परीक्षक ने सुधार किया"],
"rep.au_ev_RESPONDED": ["Replied", "उत्तर दिया"],
"rep.au_ev_COMMENT": ["Comment", "टिप्पणी"],
"rep.au_ev_DONE_REPORTED": ["Reported the action done", "कार्रवाई पूरी होने की सूचना दी"],
"rep.au_ev_CLOSED": ["Checked and closed by the auditor", "लेखा परीक्षक ने जाँच कर बंद किया"],
"rep.au_ev_SENT_BACK": ["Sent back by the auditor", "लेखा परीक्षक ने वापस भेजा"],
"rep.au_ev_RISK_ACCEPTED": ["Risk accepted by the super admin", "सुपर एडमिन ने जोखिम स्वीकार किया"],
"rep.au_role_auditor": ["Auditor", "लेखा परीक्षक"],
"rep.au_role_super_admin": ["Super admin", "सुपर एडमिन"],
"rep.au_role_operations_admin": ["Operations admin", "संचालन एडमिन"],
"rep.au_role_data_moderator": ["Data moderator", "डेटा मॉडरेटर"],
"rep.au_role_data_entry_operator": ["Data entry operator", "डेटा एंट्री ऑपरेटर"],
"rep.au_e_required": ["Please fill this in.", "कृपया यह भरें।"],
"rep.au_e_length": ["Please write a little more (at least 10 characters).", "कृपया थोड़ा और लिखें (कम से कम 10 अक्षर)।"],
"rep.au_e_date": ["Choose a date.", "तिथि चुनें।"],
"rep.au_e_past": ["The date can't be in the past.", "तिथि बीती हुई नहीं हो सकती।"],
"rep.au_e_agree": ["Choose whether you agree or disagree.", "चुनें कि आप सहमत हैं या असहमत।"],
"rep.au_e_text": ["Write your explanation (at least 10 characters).", "अपना स्पष्टीकरण लिखें (कम से कम 10 अक्षर)।"],
"rep.au_e_plan": ["Say what your office will do (at least 10 characters).", "बताएँ कि आपका कार्यालय क्या करेगा (कम से कम 10 अक्षर)।"],
"rep.au_e_target": ["Choose a target date.", "लक्ष्य तिथि चुनें।"],
"rep.au_e_evidence": ["Describe what was done and the evidence (at least 10 characters).", "क्या किया गया और प्रमाण बताएँ (कम से कम 10 अक्षर)।"],
"rep.au_e_comment": ["Write a comment.", "टिप्पणी लिखें।"],
"rep.au_e_network": ["Couldn't send. Check your connection and try again.", "भेजा नहीं जा सका। कनेक्शन जाँचकर फिर कोशिश करें।"],
"rep.au_e_stale": ["This observation has changed since you opened it. Go back to the list and open it again.", "खोलने के बाद यह अवलोकन बदल गया है। सूची पर लौटकर इसे फिर से खोलें।"],
"rep.au_ok_respond": ["Your reply has been sent to the auditor.", "आपका उत्तर लेखा परीक्षक को भेज दिया गया है।"],
"rep.au_ok_report_done": ["Reported as done. The auditor will check it.", "पूरा होने की सूचना दी गई। लेखा परीक्षक जाँच करेंगे।"],
"rep.au_ok_comment": ["Your comment has been added.", "आपकी टिप्पणी जोड़ दी गई है।"],
"rep.act_obs_replied": ["replied to audit observation {ref}", "लेखा परीक्षा अवलोकन {ref} का उत्तर दिया"],
"rep.act_obs_done": ["reported audit observation {ref} done", "लेखा परीक्षा अवलोकन {ref} पूरा होने की सूचना दी"],
"rep.act_obs_comment": ["commented on audit observation {ref}", "लेखा परीक्षा अवलोकन {ref} पर टिप्पणी की"],
"rep.role_rep": ["Representative", "जनप्रतिनिधि"],
"rep.role_om": ["Office manager", "कार्यालय प्रबंधक"],
"rep.role_fw": ["Field worker", "फ़ील्ड कर्मी"],
"rep.role_om_hint": ["sees all of this office's cases; can acknowledge, forward, assign, approve fix reports and mark cases resolved", "इस कार्यालय की सभी शिकायतें देखते हैं; पावती, अग्रेषण, काम सौंपना, समाधान रिपोर्ट स्वीकृत करना और निस्तारित करना कर सकते हैं"],
"rep.role_fw_hint": ["sees only cases assigned to them; adds after-photos at the site and submits a fix report for approval", "केवल उन्हें सौंपी गई शिकायतें देखते हैं; मौके पर कार्य के बाद की फ़ोटो जोड़ते हैं और स्वीकृति के लिए समाधान रिपोर्ट भेजते हैं"],
"rep.fw_submit_btn": ["Submit fix report", "समाधान रिपोर्ट भेजें"],
"rep.fw_submit": ["Send for approval", "स्वीकृति के लिए भेजें"],
"rep.fw_waiting": ["Your fix report is waiting for approval by the representative or office manager.", "आपकी समाधान रिपोर्ट जनप्रतिनिधि या कार्यालय प्रबंधक की स्वीकृति की प्रतीक्षा में है।"],
"rep.fw_submitted": ["Fix report sent for approval.", "समाधान रिपोर्ट स्वीकृति के लिए भेज दी गई।"],
"rep.assigned_you": ["Assigned to you by {by} on {date}", "{by} द्वारा {date} को आपको सौंपी गई"],
"rep.assigned_to": ["Assigned to {name} on {date}", "{date} को {name} को सौंपी गई"],
"rep.assign_label": ["Assign to field worker", "फ़ील्ड कर्मी को सौंपें"],
"rep.assign_nobody": ["Not assigned", "किसी को नहीं सौंपी गई"],
"rep.assign_btn": ["Save assignment", "सौंपना सहेजें"],
"rep.assign_saved": ["Assignment saved.", "सौंपना सहेज लिया गया।"],
"rep.assign_none": ["To hand this case to someone in your office, add them in the Team tab.", "यह शिकायत अपने कार्यालय में किसी को सौंपने के लिए, उन्हें टीम टैब में जोड़ें।"],
"rep.sent_back_t": ["Fix report sent back by {by}", "{by} ने समाधान रिपोर्ट लौटाई"],
"rep.review_t": ["Fix report waiting for your approval", "आपकी स्वीकृति की प्रतीक्षा में समाधान रिपोर्ट"],
"rep.review_by": ["by {name}, {date}", "{name} द्वारा, {date}"],
"rep.review_own": ["You submitted this report, so someone else in the office must approve it.", "यह रिपोर्ट आपने भेजी है, इसलिए कार्यालय में किसी और को इसे स्वीकृत करना होगा।"],
"rep.approve_btn": ["Approve and mark resolved", "स्वीकृत करें और निस्तारित करें"],
"rep.approved_done": ["Fix report approved. The case is marked resolved.", "समाधान रिपोर्ट स्वीकृत। शिकायत निस्तारित बताई गई।"],
"rep.sb_open": ["Send back", "लौटाएँ"],
"rep.sb_label": ["What still needs to be done?", "अभी क्या करना बाकी है?"],
"rep.sb_hint": ["10 to 500 characters. The field worker sees this.", "10 से 500 अक्षर। फ़ील्ड कर्मी इसे देखेंगे।"],
"rep.sb_send": ["Send back", "लौटाएँ"],
"rep.sb_err": ["Say what still needs to be done, in 10 to 500 characters.", "बताएँ कि अभी क्या करना बाकी है, 10 से 500 अक्षरों में।"],
"rep.sent_back_done": ["Fix report sent back.", "समाधान रिपोर्ट लौटा दी गई।"],
"rep.team_office": ["Office", "कार्यालय"],
"rep.team_none": ["You don't manage a team.", "आप किसी टीम का प्रबंधन नहीं करते।"],
"rep.team_error": ["The team couldn't be loaded. Please refresh the page.", "टीम लोड नहीं हो सकी। कृपया पृष्ठ रीफ़्रेश करें।"],
"rep.team_title": ["Team — {office}", "टीम — {office}"],
"rep.team_count": ["{n} of {max} people", "{max} में से {n} लोग"],
"rep.team_intro": ["People in your office who help resolve complaints. Each signs in with Google using the email you add here. You stay responsible for every case: escalation and deadlines don't change, and citizens see your name. Everything your team does is recorded below.", "आपके कार्यालय के वे लोग जो शिकायतें हल करने में मदद करते हैं। हर व्यक्ति यहाँ जोड़े गए ईमेल वाले Google खाते से साइन इन करता है। हर शिकायत की ज़िम्मेदारी आपकी रहती है: एस्केलेशन और समय-सीमाएँ नहीं बदलतीं, और नागरिक आपका नाम देखते हैं। आपकी टीम का हर काम नीचे दर्ज होता है।"],
"rep.team_add_t": ["Add a person", "व्यक्ति जोड़ें"],
"rep.team_name": ["Name", "नाम"],
"rep.team_email": ["Email address", "ईमेल पता"],
"rep.team_email_hint": ["The email of their Google account. We'll email them how to sign in.", "उनके Google खाते का ईमेल। हम उन्हें साइन इन करने का तरीका ईमेल करेंगे।"],
"rep.team_role": ["Role", "भूमिका"],
"rep.team_add_btn": ["Add to team", "टीम में जोड़ें"],
"rep.team_err_name": ["Enter their name.", "उनका नाम दर्ज करें।"],
"rep.team_err_email": ["Enter a valid email address.", "मान्य ईमेल पता दर्ज करें।"],
"rep.team_err_dup": ["This person is already on the team.", "यह व्यक्ति पहले से टीम में है।"],
"rep.team_err_self": ["You don't need to add yourself.", "आपको स्वयं को जोड़ने की आवश्यकता नहीं है।"],
"rep.team_err_role": ["Choose a role.", "भूमिका चुनें।"],
"rep.team_err_limit": ["A team can have up to {max} people.", "एक टीम में अधिकतम {max} लोग हो सकते हैं।"],
"rep.team_added_ok": ["{name} was added. We've emailed {email} how to sign in.", "{name} को जोड़ दिया गया। हमने {email} पर साइन इन करने का तरीका भेज दिया है।"],
"rep.team_added_noemail": ["{name} was added, but the email couldn't be sent. Ask them to sign in at grieviq.in/rep with the Google account for {email}.", "{name} को जोड़ दिया गया, पर ईमेल नहीं भेजा जा सका। उनसे कहें कि {email} वाले Google खाते से grieviq.in/rep पर साइन इन करें।"],
"rep.team_empty": ["No one has been added yet.", "अभी तक किसी को नहीं जोड़ा गया है।"],
"rep.team_confirm": ["Confirm", "पुष्टि करें"],
"rep.team_paused": ["Paused — added by a previous representative", "रुका हुआ — पिछले जनप्रतिनिधि द्वारा जोड़ा गया"],
"rep.team_make_om": ["Make office manager", "कार्यालय प्रबंधक बनाएँ"],
"rep.team_make_fw": ["Make field worker", "फ़ील्ड कर्मी बनाएँ"],
"rep.team_remove": ["Remove", "हटाएँ"],
"rep.team_remove_yes": ["Yes, remove {name}", "हाँ, {name} को हटाएँ"],
"rep.team_added": ["added {date}", "{date} को जोड़ा गया"],
"rep.team_activity": ["Team activity", "टीम की गतिविधि"],
"rep.team_activity_none": ["Nothing yet.", "अभी कुछ नहीं।"],
"rep.act_ack": ["acknowledged {ref}", "{ref} की पावती दी"],
"rep.act_forward": ["forwarded {ref} to {dept}", "{ref} को {dept} को अग्रेषित किया"],
"rep.act_assign": ["assigned {ref} to {name}", "{ref} को {name} को सौंपा"],
"rep.act_unassign": ["cleared the assignment of {ref}", "{ref} का सौंपना हटाया"],
"rep.act_submit": ["submitted a fix report for {ref}", "{ref} के लिए समाधान रिपोर्ट भेजी"],
"rep.act_approve": ["approved the fix report for {ref}", "{ref} की समाधान रिपोर्ट स्वीकृत की"],
"rep.act_sendback": ["sent back the fix report for {ref}", "{ref} की समाधान रिपोर्ट लौटाई"],
"rep.act_resolved": ["marked {ref} resolved", "{ref} को निस्तारित बताया"],
"rep.act_added": ["added {name} as {role}", "{name} को {role} के रूप में जोड़ा"],
"rep.act_removed": ["removed {name}", "{name} को हटाया"],
"rep.act_confirmed": ["confirmed {name}", "{name} की पुष्टि की"],
"rep.act_role": ["made {name} {role}", "{name} को {role} बनाया"],
"rep.act_other": ["{action}", "{action}"],
// ---- Item 8c-1: job profiles, office assistant, team review ----
"rep.role_oa": ["Office assistant (view only)", "कार्यालय सहायक (केवल देखें)"],
"rep.role_oa_short": ["Office assistant", "कार्यालय सहायक"],
"rep.role_oa_hint": ["sees this office's cases to answer citizens' questions; can't change anything, and sees photo previews only", "नागरिकों के प्रश्नों का उत्तर देने के लिए इस कार्यालय की शिकायतें देखते हैं; कुछ भी बदल नहीं सकते, और केवल फ़ोटो का छोटा रूप देखते हैं"],
"rep.des_label": ["Designation (optional)", "पदनाम (वैकल्पिक)"],
"rep.des_none": ["Not set", "तय नहीं"],
"rep.des_PERSONAL_ASSISTANT": ["Personal assistant", "निजी सहायक"],
"rep.des_WARD_SUPERVISOR": ["Ward supervisor", "वार्ड पर्यवेक्षक"],
"rep.des_SANITATION_SUPERVISOR": ["Sanitation supervisor", "सफ़ाई पर्यवेक्षक"],
"rep.des_FIELD_STAFF": ["Field staff", "फ़ील्ड स्टाफ़"],
"rep.des_OTHER": ["Other", "अन्य"],
"rep.des_other_label": ["Designation", "पदनाम"],
"rep.des_other_err": ["Type the designation, in 2 to 60 characters.", "पदनाम 2 से 60 अक्षरों में लिखें।"],
"rep.des_err": ["Choose a designation from the list.", "सूची से पदनाम चुनें।"],
"rep.job_edit": ["Edit job profile", "कार्य विवरण बदलें"],
"rep.job_edit_t": ["Job profile — {name}", "कार्य विवरण — {name}"],
"rep.job_duties": ["Duties (optional)", "ज़िम्मेदारियाँ (वैकल्पिक)"],
"rep.job_duties_hint": ["What this person does, in a line or two. They see this at the top of their console. Up to {max} characters.", "यह व्यक्ति क्या करता है, एक-दो पंक्तियों में। वे इसे अपने कंसोल में सबसे ऊपर देखेंगे। अधिकतम {max} अक्षर।"],
"rep.job_duties_err": ["Keep the duties to {max} characters.", "ज़िम्मेदारियाँ {max} अक्षरों तक रखें।"],
"rep.job_chars": ["{n} of {max} characters", "{max} में से {n} अक्षर"],
"rep.job_wards": ["Wards covered", "कवर किए गए वार्ड"],
"rep.job_wards_hint": ["They see, and can be given, cases from these wards only.", "वे केवल इन वार्डों की शिकायतें देखते हैं और केवल यही उन्हें सौंपी जा सकती हैं।"],
"rep.job_wards_all": ["All of this office's wards", "इस कार्यालय के सभी वार्ड"],
"rep.job_wards_some": ["Only the wards I choose", "केवल मेरे चुने हुए वार्ड"],
"rep.job_wards_filter": ["Find a ward", "वार्ड खोजें"],
"rep.job_wards_err": ["Choose at least one ward.", "कम से कम एक वार्ड चुनें।"],
"rep.job_wards_bad": ["One of the chosen wards isn't in this office. Refresh the page.", "चुने गए वार्डों में से एक इस कार्यालय में नहीं है। पृष्ठ रीफ़्रेश करें।"],
"rep.job_wards_n": ["{n} of {total} chosen", "{total} में से {n} चुने गए"],
"rep.job_types": ["Issue types they usually handle (optional)", "वे आम तौर पर किन समस्याओं पर काम करते हैं (वैकल्पिक)"],
"rep.job_types_hint": ["Used only to suggest who to assign. It never stops you assigning anyone.", "केवल यह सुझाने के लिए कि किसे सौंपें। इससे किसी को सौंपने पर कोई रोक नहीं लगती।"],
"rep.job_types_err": ["One of the issue types isn't known. Refresh the page.", "समस्या का एक प्रकार पहचाना नहीं गया। पृष्ठ रीफ़्रेश करें।"],
"rep.job_avail": ["Availability", "उपलब्धता"],
"rep.job_available": ["Available", "उपलब्ध"],
"rep.job_on_leave": ["On leave — don't give them new cases", "अवकाश पर — उन्हें नई शिकायतें न सौंपें"],
"rep.job_save": ["Save job profile", "कार्य विवरण सहेजें"],
"rep.job_saved": ["Job profile saved for {name}.", "{name} का कार्य विवरण सहेज लिया गया।"],
"rep.job_saved_ended": ["Job profile saved for {name}. {n} of their cases were outside their wards and are now not assigned.", "{name} का कार्य विवरण सहेज लिया गया। उनकी {n} शिकायतें उनके वार्डों से बाहर थीं, वे अब किसी को सौंपी नहीं हैं।"],
"rep.job_narrow_warn": ["{n} case(s) now assigned to them are outside the chosen wards. Saving will take those cases back so you can assign them again.", "अभी उन्हें सौंपी गई {n} शिकायत(ें) चुने गए वार्डों से बाहर हैं। सहेजने पर ये शिकायतें वापस ले ली जाएँगी ताकि आप इन्हें फिर से सौंप सकें।"],
"rep.job_all_wards": ["All wards", "सभी वार्ड"],
"rep.job_wards_line": ["Wards: {list}", "वार्ड: {list}"],
"rep.job_types_line": ["Usually handles: {list}", "आम तौर पर: {list}"],
"rep.job_duties_line": ["Duties: {text}", "ज़िम्मेदारियाँ: {text}"],
"rep.job_open": ["{n} open cases", "{n} खुली शिकायतें"],
"rep.job_open_one": ["1 open case", "1 खुली शिकायत"],
"rep.job_on_leave_badge": ["On leave", "अवकाश पर"],
"rep.tm_phone": ["Mobile number", "मोबाइल नंबर"],
"rep.tm_phone_hint": ["10-digit mobile number, for calling them about the work.", "10 अंकों का मोबाइल नंबर, काम के बारे में संपर्क के लिए।"],
"rep.tm_id": ["Employee ID (optional)", "कर्मचारी आईडी (वैकल्पिक)"],
"rep.tm_id_hint": ["Your office's own staff number, if it has one. 07 and 7 count as the same number.", "आपके कार्यालय का अपना कर्मचारी नंबर, यदि हो। 07 और 7 एक ही नंबर माने जाते हैं।"],
"rep.tm_id_line": ["ID {id}", "आईडी {id}"],
"rep.tm_phone_line": ["Mobile {phone}", "मोबाइल {phone}"],
"rep.tm_phone_missing": ["Mobile not added", "मोबाइल नहीं जोड़ा गया"],
"rep.tm_present": ["Present", "उपस्थित"],
"rep.tm_on_leave": ["On leave", "अवकाश पर"],
"rep.tm_leave_until": ["On leave until {date}", "{date} तक अवकाश पर"],
"rep.tm_leave_until_label": ["Back on (last day of leave)", "वापसी (अवकाश का अंतिम दिन)"],
"rep.tm_leave_until_hint": ["They are shown as present again after this date, automatically.", "इस तिथि के बाद वे अपने आप उपस्थित दिखेंगे।"],
"rep.tm_e_phone": ["Enter the mobile number.", "मोबाइल नंबर लिखें।"],
"rep.tm_e_phone_format": ["Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.", "6, 7, 8 या 9 से शुरू होने वाला 10 अंकों का भारतीय मोबाइल नंबर लिखें।"],
"rep.tm_e_id_format": ["Use letters, numbers, - or / only (up to 20).", "केवल अक्षर, अंक, - या / का उपयोग करें (अधिकतम 20)।"],
"rep.tm_e_id_taken": ["That employee ID is already used by {name} in this office.", "यह कर्मचारी आईडी इस कार्यालय में पहले से {name} की है।"],
"rep.tm_e_leave_date": ["Choose the date they are back.", "वापसी की तिथि चुनें।"],
"rep.tm_e_leave_past": ["The date can't be in the past.", "तिथि बीती हुई नहीं हो सकती।"],
"rep.tm_e_leave_long": ["Leave can be entered for up to a year at a time.", "अवकाश एक बार में अधिकतम एक वर्ष के लिए दर्ज हो सकता है।"],
"rep.job_not_set": ["Job profile not filled in yet.", "कार्य विवरण अभी भरा नहीं गया है।"],
"rep.team_change_role": ["Change role", "भूमिका बदलें"],
"rep.team_role_for": ["Role for {name}", "{name} की भूमिका"],
"rep.team_role_save": ["Save role", "भूमिका सहेजें"],
"rep.team_role_oa_warn": ["An office assistant can't hold cases. Any cases assigned to them will go back to the office.", "कार्यालय सहायक को शिकायतें नहीं सौंपी जा सकतीं। उन्हें सौंपी गई शिकायतें कार्यालय को वापस चली जाएँगी।"],
"rep.review_due_t": ["Time to check your team", "अपनी टीम जाँचने का समय"],
"rep.review_due": ["It has been more than {days} days since this team was last checked. Make sure each person still works in your office and still needs their role, remove anyone who has left, then confirm.", "इस टीम को पिछली बार जाँचे {days} दिन से अधिक हो गए हैं। सुनिश्चित करें कि हर व्यक्ति अब भी आपके कार्यालय में काम करता है और उसे अपनी भूमिका की अब भी ज़रूरत है, जो चले गए हैं उन्हें हटाएँ, फिर पुष्टि करें।"],
"rep.review_btn": ["Confirm team is still correct", "पुष्टि करें कि टीम अब भी सही है"],
"rep.review_last": ["Team last checked on {date} by {by}. Next check due by {due}.", "टीम पिछली बार {date} को {by} द्वारा जाँची गई। अगली जाँच {due} तक।"],
"rep.review_never": ["Next team check due by {due}.", "अगली टीम जाँच {due} तक।"],
"rep.review_done": ["Thank you. The team check has been recorded.", "धन्यवाद। टीम की जाँच दर्ज कर ली गई है।"],
"rep.act_profile": ["changed the job profile of {name}", "{name} का कार्य विवरण बदला"],
"rep.act_reviewed": ["confirmed the team is still correct", "पुष्टि की कि टीम अब भी सही है"],
"rep.act_unassign_area": ["took back {ref} (outside the field worker's wards)", "{ref} वापस लिया (फ़ील्ड कर्मी के वार्डों से बाहर)"],
"rep.assign_opt_open": ["{n} open", "{n} खुली"],
"rep.assign_opt_overdue": ["{n} overdue", "{n} समय से पीछे"],
"rep.assign_opt_match": ["handles this issue", "यह समस्या देखते हैं"],
"rep.assign_opt_leave": ["on leave", "अवकाश पर"],
"rep.assign_heavy": ["{name} already has {n} open cases. You can still assign this one.", "{name} के पास पहले से {n} खुली शिकायतें हैं। आप यह भी सौंप सकते हैं।"],
"rep.assign_hint": ["Listed first: people who usually handle this issue, then those with the fewest open cases.", "पहले: जो आम तौर पर यह समस्या देखते हैं, फिर जिनके पास सबसे कम खुली शिकायतें हैं।"],
"rep.assign_no_cover": ["No field worker covers {ward}. Set their wards in the Team tab.", "कोई फ़ील्ड कर्मी {ward} को कवर नहीं करता। टीम टैब में उनके वार्ड तय करें।"],
"rep.assign_err_area": ["This field worker doesn't cover this ward. Change their wards in the Team tab first.", "यह फ़ील्ड कर्मी इस वार्ड को कवर नहीं करता। पहले टीम टैब में उनके वार्ड बदलें।"],
"rep.assign_err_leave": ["This field worker is on leave. Choose someone else.", "यह फ़ील्ड कर्मी अवकाश पर है। किसी और को चुनें।"],
"rep.review_t_viewonly": ["Fix report waiting for approval", "समाधान रिपोर्ट स्वीकृति की प्रतीक्षा में"],
"rep.review_viewonly": ["Waiting for the representative or office manager to approve it.", "जनप्रतिनिधि या कार्यालय प्रबंधक की स्वीकृति की प्रतीक्षा है।"],
"rep.myjob_t": ["Your job — {office}", "आपका काम — {office}"],
"rep.myjob_viewonly": ["View only: you can see this office's cases but can't change them. Photos show as previews.", "केवल देखें: आप इस कार्यालय की शिकायतें देख सकते हैं पर बदल नहीं सकते। फ़ोटो छोटे रूप में दिखती हैं।"],
"rep.myjob_leave": ["You're marked on leave, so no new cases will be given to you.", "आप अवकाश पर दर्ज हैं, इसलिए आपको नई शिकायतें नहीं सौंपी जाएँगी।"],
"rep.photo_preview_only": ["Preview only", "केवल छोटा रूप"],
"rep.office_of": ["{label} office", "{label} कार्यालय"],
// ---- Item 8c-2: Overview tab ----
"rep.act_exported": ["downloaded the overview ({from} to {to})", "सारांश डाउनलोड किया ({from} से {to})"],
"rep.ov_back": ["Back to Overview", "सारांश पर वापस जाएँ"],
"rep.ov_none_at_level": ["None of {ward}'s complaints has reached your level ({level}) yet, so there is nothing for you to act on here.", "{ward} की कोई भी शिकायत अभी आपके स्तर ({level}) तक नहीं पहुँची है, इसलिए यहाँ आपके लिए कोई कार्रवाई नहीं है।"],
"rep.ov_none_counts": ["The Overview counts every complaint in the ward ({received} received in the period, {pending} pending now). They are being handled at a lower level and will appear here if they escalate to you.", "सारांश में वार्ड की हर शिकायत गिनी जाती है (अवधि में {received} प्राप्त, अभी {pending} लंबित)। इन पर निचले स्तर पर काम हो रहा है और आप तक एस्केलेट होने पर ये यहाँ दिखेंगी।"],
"rep.auth_label": ["Who you are acting as", "आप किस रूप में कार्य कर रहे हैं"],
"rep.auth_acting": ["Signed in as", "इस रूप में साइन इन"],
"rep.auth_roles": ["You hold {n} roles", "आपके पास {n} भूमिकाएँ हैं"],
"rep.auth_for": ["for {level}, {name}", "{level}, {name} के लिए"],
"rep.ov_type_line": ["Showing only: {type}", "केवल दिखा रहे हैं: {type}"],
"rep.ov_type_clear": ["Show all issue types", "सभी प्रकार दिखाएँ"],
"rep.tab_overview": ["Overview", "सारांश"],
"rep.ov_title": ["Overview — {office}", "सारांश — {office}"],
"rep.ov_office": ["Office", "कार्यालय"],
"rep.ov_period": ["Period", "अवधि"],
"rep.ov_p_this_month": ["This month", "यह महीना"],
"rep.ov_p_last_month": ["Last month", "पिछला महीना"],
"rep.ov_p_last_3": ["Last 3 months", "पिछले 3 महीने"],
"rep.ov_p_fy": ["This financial year (April to March)", "यह वित्तीय वर्ष (अप्रैल से मार्च)"],
"rep.ov_p_custom": ["Choose dates", "तारीखें चुनें"],
"rep.ov_from": ["From", "से"],
"rep.ov_to": ["To", "तक"],
"rep.ov_show": ["Show", "दिखाएँ"],
"rep.ov_err_date": ["Enter a date.", "तारीख दर्ज करें।"],
"rep.ov_err_before": ["The end date must be on or after the start date.", "अंतिम तारीख शुरू की तारीख के बाद या उसी दिन होनी चाहिए।"],
"rep.ov_err_future": ["The start date can't be in the future.", "शुरू की तारीख भविष्य में नहीं हो सकती।"],
"rep.ov_err_long": ["Choose a period of up to 3 years.", "अधिकतम 3 वर्ष की अवधि चुनें।"],
"rep.ov_err_load": ["The overview couldn't be loaded. Please refresh the page.", "सारांश लोड नहीं हो सका। कृपया पृष्ठ रीफ़्रेश करें।"],
"rep.ov_period_line": ["Received, resolved and rates: {from} to {to}. Pending and overdue: as of now.", "प्राप्त, निस्तारित और दरें: {from} से {to} तक। लंबित और समय से पीछे: अभी की स्थिति।"],
"rep.ov_counts_only": ["This shows every complaint in your area, including those still with a lower level, as numbers only.", "इसमें आपके क्षेत्र की हर शिकायत गिनी जाती है, जिनमें वे भी हैं जो अभी निचले स्तर पर हैं — केवल संख्या के रूप में।"],
"rep.ov_k_received": ["Received", "प्राप्त"],
"rep.ov_k_resolved": ["Resolved", "निस्तारित"],
"rep.ov_k_pending": ["Pending now", "अभी लंबित"],
"rep.ov_k_overdue": ["Overdue now", "अभी समय से पीछे"],
"rep.ov_k_median": ["Median days to resolve", "निस्तारण में दिनों का माध्य (मीडियन)"],
"rep.ov_col_ward": ["Ward", "वार्ड"],
"rep.ov_col_mla": ["MLA constituency", "विधानसभा क्षेत्र"],
"rep.ov_col_type": ["Issue type", "समस्या का प्रकार"],
"rep.ov_col_received": ["Received", "प्राप्त"],
"rep.ov_col_resolved": ["Resolved", "निस्तारित"],
"rep.ov_col_pending": ["Pending now", "अभी लंबित"],
"rep.ov_col_age": ["Pending by days waiting", "प्रतीक्षा के दिनों के अनुसार लंबित"],
"rep.ov_col_age_n": ["{a}–{b} days", "{a}–{b} दिन"],
"rep.ov_col_age_over": ["Over {a} days", "{a} दिन से अधिक"],
"rep.ov_col_overdue": ["Overdue now", "अभी समय से पीछे"],
"rep.ov_col_median": ["Median days to resolve", "निस्तारण के दिन (मीडियन)"],
"rep.ov_col_ack": ["Acknowledged on time", "समय पर पावती"],
"rep.ov_col_esc": ["Escalated beyond ward", "वार्ड से ऊपर गई"],
"rep.ov_col_conf": ["Confirmed fixed by citizen", "नागरिक ने ठीक होने की पुष्टि की"],
"rep.ov_col_reopen": ["Reopened", "फिर से खोली गई"],
"rep.ov_total": ["Total", "कुल"],
"rep.ov_n_of": ["{n} of {d}", "{d} में से {n}"],
"rep.ov_sort_by": ["Sort by {col}", "{col} के अनुसार क्रम"],
"rep.ov_view_cases": ["View cases", "शिकायतें देखें"],
"rep.ov_view_cases_for": ["View cases in {ward}", "{ward} की शिकायतें देखें"],
"rep.ov_show_wards": ["Show wards", "वार्ड दिखाएँ"],
"rep.ov_show_wards_for": ["Show wards in {name}", "{name} के वार्ड दिखाएँ"],
"rep.ov_all_mla": ["All constituencies", "सभी विधानसभा क्षेत्र"],
"rep.ov_wards_n": ["{n} wards", "{n} वार्ड"],
"rep.ov_no_rows": ["No complaints in this area yet.", "इस क्षेत्र में अभी कोई शिकायत नहीं है।"],
"rep.ov_scroll": ["Overview table (scrolls sideways)", "सारांश तालिका (बगल में स्क्रॉल होती है)"],
"rep.ov_csv": ["Download CSV", "CSV डाउनलोड करें"],
"rep.ov_csv_hint": ["Opens in Excel. Each download is recorded in the team activity log.", "Excel में खुलता है। हर डाउनलोड टीम गतिविधि लॉग में दर्ज होता है।"],
"rep.ov_trend_t": ["Last 12 months: received and resolved", "पिछले 12 महीने: प्राप्त और निस्तारित"],
"rep.ov_trend_table": ["Show as a table", "तालिका के रूप में दिखाएँ"],
"rep.ov_month": ["Month", "महीना"],
"rep.ov_work_t": ["Team workload", "टीम पर काम का भार"],
"rep.ov_work_name": ["Field worker", "फ़ील्ड कर्मी"],
"rep.ov_work_open": ["Open now", "अभी खुली"],
"rep.ov_work_overdue": ["Overdue now", "अभी समय से पीछे"],
"rep.ov_work_fixed": ["Fixed in period", "अवधि में ठीक की गईं"],
"rep.ov_work_median": ["Median days from assignment to fix", "सौंपने से ठीक होने तक दिन (मीडियन)"],
"rep.ov_work_none": ["No field workers in this office's team yet.", "इस कार्यालय की टीम में अभी कोई फ़ील्ड कर्मी नहीं है।"],
"rep.ov_on_leave": ["on leave", "अवकाश पर"],
"rep.ov_how_t": ["How is this calculated?", "यह कैसे गिना जाता है?"],
"rep.ov_how_received": ["Received: complaints filed in the period.", "प्राप्त: अवधि में दर्ज शिकायतें।"],
"rep.ov_how_resolved": ["Resolved: complaints marked fixed in the period, whether or not the citizen has confirmed yet.", "निस्तारित: अवधि में ठीक बताई गई शिकायतें, चाहे नागरिक ने अभी पुष्टि की हो या नहीं।"],
"rep.ov_how_pending": ["Pending now: complaints not yet marked fixed, as of now, split by how many days they have waited since filing.", "अभी लंबित: वे शिकायतें जो अभी तक ठीक नहीं बताई गईं, दर्ज होने के बाद प्रतीक्षा के दिनों के अनुसार।"],
"rep.ov_how_overdue": ["Overdue now: pending complaints that have missed a time limit — not acknowledged in time, or not fixed in time at a level (which is why they moved up).", "अभी समय से पीछे: वे लंबित शिकायतें जिनकी कोई समय-सीमा निकल गई — समय पर पावती नहीं, या किसी स्तर पर समय पर ठीक नहीं हुई (इसीलिए ऊपर गई)।"],
"rep.ov_how_median": ["Median days to resolve: from filing to marked fixed, for complaints resolved in the period. Half took less time, half took more. The median isn't pulled up by one very old case, as an average would be.", "निस्तारण के दिन (मीडियन): अवधि में निस्तारित शिकायतों के लिए, दर्ज होने से ठीक बताए जाने तक। आधी में इससे कम समय लगा, आधी में अधिक। औसत के विपरीत, एक बहुत पुरानी शिकायत से यह नहीं बढ़ता।"],
"rep.ov_how_ack": ["Acknowledged on time: of complaints received in the period whose acknowledgement was due by now, the share acknowledged within the time limit.", "समय पर पावती: अवधि में प्राप्त जिन शिकायतों की पावती अब तक देय थी, उनमें से समय-सीमा में पावती पाने वालों का हिस्सा।"],
"rep.ov_how_esc": ["Escalated beyond ward: of complaints received in the period, the share that moved above the ward level.", "वार्ड से ऊपर गई: अवधि में प्राप्त शिकायतों में से वार्ड स्तर से ऊपर जाने वालों का हिस्सा।"],
"rep.ov_how_conf": ["Confirmed fixed by citizen: of complaints resolved in the period and now closed, where the citizen could be asked (gave an email), the share the citizen confirmed.", "नागरिक ने पुष्टि की: अवधि में निस्तारित और अब बंद शिकायतों में से, जहाँ नागरिक से पूछा जा सकता था (ईमेल दिया था), पुष्टि वाले हिस्सा।"],
"rep.ov_how_reopen": ["Reopened: of complaints received in the period, the share the citizen reopened.", "फिर से खोली गई: अवधि में प्राप्त शिकायतों में से नागरिक द्वारा फिर से खोली गई शिकायतों का हिस्सा।"],
"rep.ov_how_view": ["View cases opens the Cases tab for that ward. It lists the complaints that have reached your level; the others are counted here only.", "शिकायतें देखें उस वार्ड के लिए शिकायतें टैब खोलता है। उसमें वे शिकायतें होती हैं जो आपके स्तर तक पहुँची हैं; बाकी यहाँ केवल गिनी जाती हैं।"],
"rep.ov_how_live": ["Everything is worked out when you open this page, using the same rules as the rest of GrievIQ.", "यह पृष्ठ खोलते समय सब कुछ GrievIQ के बाकी नियमों के अनुसार ही गिना जाता है।"],
"priv.team": ["If a representative adds you to their team, we keep your name and email address to let you sign in, the job details the office records for you (designation, duties, the wards and issue types you cover, and whether you are on leave), and a record of what you do on cases. Team members see the same complaint details as the representative, never a citizen's full phone number; office assistants see photo previews only.", "यदि कोई जनप्रतिनिधि आपको अपनी टीम में जोड़ता है, तो हम साइन इन के लिए आपका नाम और ईमेल पता, कार्यालय द्वारा आपके लिए दर्ज कार्य विवरण (पदनाम, ज़िम्मेदारियाँ, आपके वार्ड और समस्याओं के प्रकार, और क्या आप अवकाश पर हैं), तथा शिकायतों पर आपके कार्यों का रिकॉर्ड रखते हैं। टीम के सदस्य वही शिकायत विवरण देखते हैं जो जनप्रतिनिधि देखते हैं, नागरिक का पूरा फ़ोन नंबर कभी नहीं; कार्यालय सहायक केवल फ़ोटो का छोटा रूप देखते हैं।"],
"priv.audit": ["What GrievIQ staff, representatives and their teams do (signing in, and actions on complaints) is kept as an audit record. These records can't be changed or deleted, and are read only by GrievIQ's auditor and super admin to check that complaints are handled properly.", "GrievIQ स्टाफ़, जनप्रतिनिधि और उनकी टीमें जो करती हैं (साइन इन, और शिकायतों पर कार्य) उसे ऑडिट रिकॉर्ड के रूप में रखा जाता है। ये रिकॉर्ड बदले या हटाए नहीं जा सकते, और इन्हें केवल GrievIQ के लेखा परीक्षक और सुपर एडमिन यह जाँचने के लिए पढ़ते हैं कि शिकायतों पर ठीक से काम हो रहा है।"],
// ---- Item 8a: Sign in with Google ----
"rep.signout": ["Sign out", "साइन आउट"],
"rep.si_title": ["Representative console", "जनप्रतिनिधि कंसोल"],
"rep.si_lede": ["Sign in with the Google account that uses the email address GrievIQ has on record for you.", "उस Google खाते से साइन इन करें जो GrievIQ में आपके नाम से दर्ज ईमेल पते का है।"],
"rep.si_button": ["Sign in with Google", "Google से साइन इन करें"],
"rep.si_note": ["For your security you are signed out after 1 hour without activity, and after 24 hours in any case. We receive only your name and email address from Google.", "आपकी सुरक्षा के लिए, 1 घंटे तक कोई गतिविधि न होने पर और हर हाल में 24 घंटे बाद आप साइन आउट हो जाते हैं। Google से हमें केवल आपका नाम और ईमेल पता मिलता है।"],
"rep.si_not_registered": ["This Google account isn't registered with GrievIQ. Sign in with the Google account for the email address GrievIQ has for you, or ask GrievIQ support to update it.", "यह Google खाता GrievIQ में पंजीकृत नहीं है। GrievIQ में दर्ज अपने ईमेल पते वाले Google खाते से साइन इन करें, या GrievIQ सहायता से इसे अपडेट करवाएँ।"],
"rep.si_failed": ["Sign-in didn't work. Please try again.", "साइन इन नहीं हो सका। कृपया फिर से प्रयास करें।"],
"rep.si_expired": ["The sign-in took too long. Please try again.", "साइन इन में बहुत समय लग गया। कृपया फिर से प्रयास करें।"],
"rep.si_cancelled": ["Sign-in was cancelled.", "साइन इन रद्द कर दिया गया।"],
"rep.si_not_set_up": ["Sign in with Google isn't set up yet. Please tell GrievIQ support.", "Google से साइन इन अभी सेट नहीं है। कृपया GrievIQ सहायता को बताएँ।"],
"rep.si_timeout": ["You were signed out after a period without activity. Please sign in again.", "कुछ समय तक कोई गतिविधि न होने पर आप साइन आउट हो गए। कृपया फिर से साइन इन करें।"],
"rep.si_signed_out": ["You have signed out.", "आप साइन आउट हो गए हैं।"],
"priv.reps_signin": ["Representatives sign in with Google. We receive only your name and email address, use them only to check that you are a registered representative, and record when you sign in and out. You are signed out after 1 hour without activity and after 24 hours in any case.", "जनप्रतिनिधि Google से साइन इन करते हैं। हमें केवल आपका नाम और ईमेल पता मिलता है, जिसका उपयोग केवल यह जाँचने के लिए होता है कि आप पंजीकृत जनप्रतिनिधि हैं, और हम साइन इन व साइन आउट का समय दर्ज करते हैं। 1 घंटे तक कोई गतिविधि न होने पर और हर हाल में 24 घंटे बाद आप साइन आउट हो जाते हैं।"],
// ---- Item 7d: reopening a resolved case ----
"status.reopen_title": ["Still not fixed?", "अब भी ठीक नहीं हुआ?"],
"status.reopen_lede": ["You can reopen this case once, until {date}. It will go to the next level up, with a fresh time limit.", "आप इस शिकायत को एक बार, {date} तक, दोबारा खोल सकते हैं। यह अगले ऊँचे स्तर पर, नई समय-सीमा के साथ जाएगी।"],
"status.reopen_btn": ["Reopen this case", "यह शिकायत दोबारा खोलें"],
"status.reopen_why": ["Why are you reopening it?", "आप इसे दोबारा क्यों खोल रहे हैं?"],
"status.reopen_note": ["What is still wrong?", "अब भी क्या गलत है?"],
"status.reopen_note_hint": ["10 to 500 characters. This goes to the representative at the next level.", "10 से 500 अक्षर। यह अगले स्तर के जनप्रतिनिधि को भेजा जाएगा।"],
"status.reopen_submit": ["Reopen case", "शिकायत दोबारा खोलें"],
"status.reopen_cancel": ["Cancel", "रद्द करें"],
"status.reopen_err_reason": ["Choose why you are reopening it.", "चुनें कि आप इसे दोबारा क्यों खोल रहे हैं।"],
"status.reopen_err_note": ["Say what is still wrong, in 10 to 500 characters.", "बताएँ कि अब भी क्या गलत है, 10 से 500 अक्षरों में।"],
"status.reopen_done": ["Your case has been reopened and sent to the {level}. They have a fresh time limit to deal with it.", "आपकी शिकायत दोबारा खोल दी गई है और {level} को भेज दी गई है। उनके पास इसके लिए नई समय-सीमा है।"],
"status.reopen_done_top": ["Your case has been reopened. It was already with the {level}, the highest level, so it stays there with a fresh time limit, and GrievIQ staff will also watch it.", "आपकी शिकायत दोबारा खोल दी गई है। यह पहले से {level} के पास थी, जो सबसे ऊँचा स्तर है, इसलिए यह नई समय-सीमा के साथ वहीं रहेगी, और GrievIQ कर्मचारी भी इस पर नज़र रखेंगे।"],
"status.reopen_too_late": ["The 30 days to reopen this case have passed. If the problem is back, please file a new complaint.", "इस शिकायत को दोबारा खोलने के 30 दिन बीत चुके हैं। यदि समस्या फिर से है, तो कृपया नई शिकायत दर्ज करें।"],
"status.reopen_used": ["A case can be reopened only once. If it still isn't right, email support@grieviq.in.", "कोई शिकायत केवल एक बार दोबारा खोली जा सकती है। यदि यह अब भी ठीक नहीं है, तो support@grieviq.in पर ईमेल करें।"],
"status.reopened_title": ["Reopened", "दोबारा खोली गई"],
"status.reopened_by_you": ["You reopened this case on {date}. It was sent to the {level}.", "आपने यह शिकायत {date} को दोबारा खोली। इसे {level} को भेजा गया।"],
"status.reopened_by_staff": ["This case was reopened for you by GrievIQ staff on {date}. It was sent to the {level}.", "यह शिकायत {date} को GrievIQ कर्मचारियों ने आपके लिए दोबारा खोली। इसे {level} को भेजा गया।"],
"rep.reopened_citizen": ["Reopened by the citizen", "नागरिक द्वारा दोबारा खोली गई"],
"rep.reopened_staff": ["Reopened by GrievIQ for the citizen", "GrievIQ द्वारा नागरिक के लिए दोबारा खोली गई"],
"rep.reopened_to": ["sent to {level}", "{level} को भेजी गई"],
"rep.reopened_prev": ["Previous report:", "पिछली रिपोर्ट:"],
"rep.badge_reopened": ["Reopened", "दोबारा खोली गई"],
"rep.ack_waiting_higher": ["Reopened: waiting for {level} to acknowledge", "दोबारा खोली गई: {level} की पावती की प्रतीक्षा"],
"rep.ack_higher": ["This case was reopened and is now with a higher level, which needs to acknowledge it.", "यह शिकायत दोबारा खोली गई है और अब ऊँचे स्तर के पास है, जिसे इसकी पावती देनी है।"],
// ---- Item 7c: private photos and photo retention ----
"submit.photo_n": ["Photo {n}", "फ़ोटो {n}"],
"submit.photo_preparing": ["Getting your photo ready…", "आपकी फ़ोटो तैयार की जा रही है…"],
"submit.photo_unreadable": ["This photo can't be read on this device. Choose a JPG or PNG photo, or take a new one with the camera.", "यह फ़ोटो इस डिवाइस पर पढ़ी नहीं जा सकी। कोई JPG या PNG फ़ोटो चुनें, या कैमरे से नई फ़ोटो लें।"],
"submit.photo_wait": ["Please wait until your photos are ready, then send the complaint.", "कृपया फ़ोटो तैयार होने तक प्रतीक्षा करें, फिर शिकायत भेजें।"],
"rep.photo_removed": ["Photo removed under the retention policy on {date}", "फ़ोटो {date} को संग्रहण नीति के अनुसार हटाई गई"],
"rep.photo_full_removed": ["Full-size photo removed under the retention policy on {date}; preview kept", "पूरे आकार की फ़ोटो {date} को संग्रहण नीति के अनुसार हटाई गई; छोटी झलक रखी गई है"],
"status.photo_removed": ["This photo was removed on {date} under our photo retention policy.", "यह फ़ोटो हमारी फ़ोटो संग्रहण नीति के अनुसार {date} को हटाई गई।"],
"status.photo_full_removed": ["Full-size photo removed on {date} under our photo retention policy; a small preview is kept.", "पूरे आकार की फ़ोटो हमारी फ़ोटो संग्रहण नीति के अनुसार {date} को हटाई गई; एक छोटी झलक रखी गई है।"],
"status.new_tab": ["(opens in a new tab)", "(नए टैब में खुलता है)"],
"priv.keep_photos": ["Photos are kept while a complaint is open. One year after a complaint is finally closed, full-size photos are deleted and small previews are kept as a record; the previews are deleted when the complaint record's own time (above) ends. If a complaint is reopened, the time starts again from when it closes. Photos that were added but never sent with a complaint are deleted after 2 days.", "शिकायत खुली रहने तक फ़ोटो रखी जाती हैं। शिकायत अंतिम रूप से बंद होने के एक वर्ष बाद पूरे आकार की फ़ोटो हटा दी जाती हैं और छोटी झलक अभिलेख के रूप में रखी जाती हैं; शिकायत के अभिलेख की अपनी अवधि (ऊपर) समाप्त होने पर झलक भी हटा दी जाती हैं। शिकायत दोबारा खुलने पर अवधि उसके फिर बंद होने से गिनी जाती है। जो फ़ोटो जोड़ी गईं पर शिकायत के साथ भेजी नहीं गईं, वे 2 दिन बाद हटा दी जाती हैं।"],
"adm.d_c_photos": ["Photos kept", "रखी गई फ़ोटो"],
"adm.d_c_photos_h": ["Private photos (citizens' and after-work). Removed on schedule under the retention policy.", "निजी फ़ोटो (नागरिकों की और कार्य के बाद की)। संग्रहण नीति के अनुसार तय समय पर हटाई जाती हैं।"],
"adm.d_c_photos_legacy": ["Cases with public photos", "सार्वजनिक फ़ोटो वाली शिकायतें"],
"adm.d_c_photos_legacy_h": ["Old photos still at a public address. Move them to private storage.", "पुरानी फ़ोटो जो अभी सार्वजनिक पते पर हैं। इन्हें निजी संग्रहण में ले जाएँ।"],
"adm.ph_page_title": ["Photo storage — GrievIQ Admin", "फ़ोटो संग्रहण — GrievIQ एडमिन"],
"adm.ph_service_tag": ["Photo storage · super admin", "फ़ोटो संग्रहण · सुपर एडमिन"],
"adm.ph_title": ["Photo storage", "फ़ोटो संग्रहण"],
"adm.ph_sub": ["Where complaint photos are kept, and when they are removed. Every photo is private and opens only through a link that stops working after 15 minutes.", "शिकायतों की फ़ोटो कहाँ रखी जाती हैं और कब हटाई जाती हैं। हर फ़ोटो निजी है और केवल ऐसे लिंक से खुलती है जो 15 मिनट बाद काम करना बंद कर देता है।"],
"adm.ph_updated": ["Updated {time}", "अद्यतन {time}"],
"adm.ph_no_storage": ["Private photo storage (PRIVATE_PHOTOS) isn't connected, so photos can't be added or moved.", "निजी फ़ोटो संग्रहण (PRIVATE_PHOTOS) जुड़ा नहीं है, इसलिए फ़ोटो जोड़ी या स्थानांतरित नहीं की जा सकतीं।"],
"adm.ph_c_citizen": ["Citizens' photos", "नागरिकों की फ़ोटो"],
"adm.ph_c_citizen_h": ["{preview} kept as preview only · {removed} removed", "{preview} केवल झलक के रूप में · {removed} हटाई गईं"],
"adm.ph_c_after": ["After-work photos", "कार्य के बाद की फ़ोटो"],
"adm.ph_c_after_h": ["{preview} kept as preview only · {removed} removed", "{preview} केवल झलक के रूप में · {removed} हटाई गईं"],
"adm.ph_c_space": ["Space used", "प्रयुक्त स्थान"],
"adm.ph_c_space_h": ["Photos and previews still kept.", "अभी रखी गई फ़ोटो और झलक।"],
"adm.ph_c_legacy": ["Old public photos", "पुरानी सार्वजनिक फ़ोटो"],
"adm.ph_c_legacy_h": ["On {cases} complaints. Move them below.", "{cases} शिकायतों में। नीचे से स्थानांतरित करें।"],
"adm.ph_c_legacy_done": ["None left. All photos are private.", "कोई शेष नहीं। सभी फ़ोटो निजी हैं।"],
"adm.ph_move_t": ["Move old photos to private storage", "पुरानी फ़ोटो निजी संग्रहण में ले जाएँ"],
"adm.ph_move_p": ["{n} photos from before September 2026 are still at a public address. Moving them makes each one smaller with a small preview (as new photos are), stores them privately, and deletes the public copy. Keep this page open until it finishes. It is safe to run again.", "सितंबर 2026 से पहले की {n} फ़ोटो अभी सार्वजनिक पते पर हैं। स्थानांतरण से हर फ़ोटो छोटी की जाती है और उसकी छोटी झलक बनती है (नई फ़ोटो की तरह), उन्हें निजी रूप से रखा जाता है, और सार्वजनिक प्रति हटा दी जाती है। पूरा होने तक यह पेज खुला रखें। इसे दोबारा चलाना सुरक्षित है।"],
"adm.ph_move_btn": ["Move photos to private storage", "फ़ोटो निजी संग्रहण में ले जाएँ"],
"adm.ph_moving": ["Moving photo {n} of {total}…", "{total} में से फ़ोटो {n} स्थानांतरित हो रही है…"],
"adm.ph_move_ok": ["Done. {moved} photos moved to private storage.", "पूरा हुआ। {moved} फ़ोटो निजी संग्रहण में ले जाई गईं।"],
"adm.ph_move_some": ["{moved} photos moved; {failed} couldn't be moved. Try again.", "{moved} फ़ोटो स्थानांतरित हुईं; {failed} नहीं हो सकीं। फिर से प्रयास करें।"],
"adm.ph_move_done": ["Every old photo has been moved. You can now turn off the public address of the old photo bucket:", "सभी पुरानी फ़ोटो स्थानांतरित हो चुकी हैं। अब आप पुराने फ़ोटो बकेट का सार्वजनिक पता बंद कर सकते हैं:"],
"adm.ph_off_1": ["In Cloudflare, open R2, then the grieviq-photos bucket, then Settings.", "Cloudflare में R2 खोलें, फिर grieviq-photos बकेट, फिर Settings।"],
"adm.ph_off_2": ["Under Public Development URL (r2.dev), choose Disable.", "Public Development URL (r2.dev) में Disable चुनें।"],
"adm.ph_off_3": ["Confirm. New photos don't use that bucket.", "पुष्टि करें। नई फ़ोटो उस बकेट का उपयोग नहीं करतीं।"],
"adm.ph_policy_t": ["Retention policy", "संग्रहण नीति"],
"adm.ph_policy_1": ["While a case is open, waiting or reopened, every photo is kept.", "शिकायत खुली, प्रतीक्षारत या दोबारा खुली रहने तक हर फ़ोटो रखी जाती है।"],
"adm.ph_policy_2": ["One year after a case is finally closed, full-size photos are deleted; small previews are kept as evidence.", "शिकायत अंतिम रूप से बंद होने के एक वर्ष बाद पूरे आकार की फ़ोटो हटाई जाती हैं; छोटी झलक साक्ष्य के रूप में रखी जाती है।"],
"adm.ph_policy_3": ["Previews are deleted when the record's retention ends: 3 years from filing or 1 year after resolution, whichever is later.", "अभिलेख की संग्रहण अवधि समाप्त होने पर झलक हटाई जाती हैं: दर्ज करने से 3 वर्ष या निस्तारण के 1 वर्ष बाद, जो भी बाद में हो।"],
"adm.ph_policy_4": ["A reopened case starts the clock again. A case on audit hold keeps all its photos.", "दोबारा खुली शिकायत में अवधि फिर से शुरू होती है। ऑडिट होल्ड वाली शिकायत की सभी फ़ोटो रखी जाती हैं।"],
"adm.ph_policy_5": ["Photos added but never sent with a complaint or a resolution are deleted after {h} hours.", "जो फ़ोटो जोड़ी गईं पर शिकायत या समाधान के साथ भेजी नहीं गईं, वे {h} घंटे बाद हटाई जाती हैं।"],
"adm.ph_due_full": ["Full-size photos due for deletion", "हटाने योग्य पूरे आकार की फ़ोटो"],
"adm.ph_due_all": ["Photos due for full deletion (record ended)", "पूरी तरह हटाने योग्य फ़ोटो (अभिलेख अवधि समाप्त)"],
"adm.ph_due_unused": ["Unused uploads due for deletion", "हटाने योग्य अप्रयुक्त अपलोड"],
"adm.ph_auto": ["Clean-up runs by itself in small batches whenever the admin dashboard opens. Every run that deletes something is recorded below.", "एडमिन डैशबोर्ड खुलने पर सफ़ाई अपने-आप छोटे-छोटे हिस्सों में चलती है। कुछ भी हटाने वाला हर रन नीचे दर्ज होता है।"],
"adm.ph_purge_btn": ["Run clean-up now", "अभी सफ़ाई चलाएँ"],
"adm.ph_purge_ok": ["Clean-up done: {full} full-size photos, {all} photos fully and {unused} unused uploads deleted.", "सफ़ाई पूरी: {full} पूरे आकार की फ़ोटो, {all} फ़ोटो पूरी तरह और {unused} अप्रयुक्त अपलोड हटाए गए।"],
"adm.ph_runs_t": ["Recent activity", "हाल की गतिविधि"],
"adm.ph_runs_none": ["Nothing yet.", "अभी कुछ नहीं।"],
"adm.ph_when": ["When", "कब"],
"adm.ph_who": ["By", "किसके द्वारा"],
"adm.ph_what": ["What", "क्या"],
"adm.ph_system": ["Automatic", "स्वचालित"],
"adm.ph_run_purged": ["Clean-up: {full} full-size, {all} fully, {unused} unused deleted", "सफ़ाई: {full} पूरे आकार की, {all} पूरी तरह, {unused} अप्रयुक्त हटाई गईं"],
"adm.ph_run_moved": ["Old photo moved to private storage ({mode})", "पुरानी फ़ोटो निजी संग्रहण में ले जाई गई ({mode})"],
"adm.ph_mode_resized": ["resized, with preview", "छोटी की गई, झलक सहित"],
"adm.ph_mode_copied": ["copied as it was, no preview", "जैसी थी वैसी, बिना झलक"],
"adm.ph_mode_missing": ["file was already gone; link removed", "फ़ाइल पहले से नहीं थी; लिंक हटाया गया"],
"adm.ph_mode_already": ["already moved", "पहले ही स्थानांतरित"],
"adm.ph_err_role": ["Only the super admin can open Photo storage.", "फ़ोटो संग्रहण केवल सुपर एडमिन खोल सकते हैं।"],
"adm.ph_err_admin": ["Your account is not an admin.", "आपका खाता एडमिन नहीं है।"],
// ---- Privacy: location and remembered ward ----
"priv.device_ward": ["If you look up a ward, its name is remembered on this device so the home page can show it next time. You can remove it with \"Forget\".", "यदि आप कोई वार्ड खोजते हैं, तो उसका नाम इस डिवाइस पर याद रखा जाता है, ताकि अगली बार मुख्य पृष्ठ पर दिख सके। आप इसे \"भूल जाएँ\" से हटा सकते हैं।"]
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

  // "420 m" / "384 km" (Hindi: "420 मीटर" / "384 किमी"), for distances in warnings.
  function distance(metres) {
    var m = Math.round(Number(metres) || 0);
    if (m < 1000) return m + (lang === 'hi' ? ' मीटर' : ' m');
    var km = m < 10000 ? Math.round(m / 100) / 10 : Math.round(m / 1000);
    return km.toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN') + (lang === 'hi' ? ' किमी' : ' km');
  }

  window.GIQ = {
    distance: distance,
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
