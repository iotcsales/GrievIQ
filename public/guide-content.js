// public/guide-content.js (grieviq-40)
//
// The step-by-step guides (SOPs) shown inside GrievIQ, in English and Hindi.
// ONE source for every app: the citizen /guide page, the representative
// console, the department dashboard and the admin console all read it, and
// guide.js draws it. Each entry is [English, Hindi]. **words** = bold.
// `roles` on an SOP = who sees it (none = everyone using that app).
(function () {
  var REP_ALL = ["REPRESENTATIVE", "OFFICE_MANAGER", "FIELD_WORKER", "OFFICE_ASSISTANT"];
  window.GIQ_GUIDES = {
    // ---------------------------------------------------------------- citizens
    citizen: {
      title: ["How to use GrievIQ", "GrievIQ का उपयोग कैसे करें"],
      intro: ["GrievIQ sends your civic problem to the representative responsible for your ward or village, with a time limit at every level. It is free for every citizen, always.",
        "GrievIQ आपकी नागरिक समस्या आपके वार्ड या गाँव के जिम्मेदार जनप्रतिनिधि तक भेजता है, हर स्तर पर समय-सीमा के साथ। यह हर नागरिक के लिए सदैव निःशुल्क है।"],
      journey: "citizen",
      rules: [
        ["Never share a code GrievIQ emails you. GrievIQ never asks for it by phone or message.", "GrievIQ का ईमेल किया कोड कभी साझा न करें। GrievIQ कभी फ़ोन या संदेश से कोड नहीं माँगता।"],
        ["Describe the problem truthfully; one complaint per problem.", "समस्या सच्चाई से लिखें; एक समस्या, एक शिकायत।"],
        ["Emergency (fire, accident, crime)? Call **112**. GrievIQ is not an emergency service.", "आपात स्थिति (आग, दुर्घटना, अपराध)? **112** पर कॉल करें। GrievIQ आपात सेवा नहीं है।"],
      ],
      sops: [
        { id: "file", title: ["File a complaint", "शिकायत दर्ज करें"],
          what: ["Sending a civic problem (water, garbage, roads, street lights and more) to your ward's or village's elected representative.", "नागरिक समस्या (पानी, कूड़ा, सड़क, स्ट्रीट लाइट आदि) अपने वार्ड या गाँव के जनप्रतिनिधि तक भेजना।"],
          steps: [
            ["Open **grieviq.in** and tap **Use my current location**, or search an address, landmark or PIN code.", "**grieviq.in** खोलें और **मेरी मौजूदा लोकेशन उपयोग करें** दबाएँ, या पता, लैंडमार्क या पिन कोड खोजें।"],
            ["Check the ward and representative shown, then tap **Report a problem**.", "दिखाए गए वार्ड और जनप्रतिनिधि को जाँचें, फिर **समस्या दर्ज करें** दबाएँ।"],
            ["Choose the **type of complaint** and describe it (at least 15 letters): what is wrong and since when. You can tap **Speak instead of typing**.", "**शिकायत का प्रकार** चुनें और विवरण लिखें (कम से कम 15 अक्षर): क्या गड़बड़ है और कब से। चाहें तो **टाइप के बजाय बोलें** दबाएँ।"],
            ["Add a landmark, and up to **3 photos** (optional). If your phone asks for location, allowing it shows the photo was taken at the spot; saying no is fine.", "लैंडमार्क लिखें और अधिकतम **3 फ़ोटो** जोड़ें (वैकल्पिक)। फ़ोन लोकेशन माँगे तो अनुमति देने से दिखता है कि फ़ोटो मौके पर ली गई; मना करना भी ठीक है।"],
            ["Enter your **mobile number** and, if you want online updates, your **email**.", "अपना **मोबाइल नंबर** लिखें, और ऑनलाइन सूचना चाहिए तो **ईमेल** भी।"],
            ["Read **how your details are used**, tick the box (you must be 18 or older), and send.", "**आपकी जानकारी का उपयोग** पढ़ें, बॉक्स पर टिक करें (18 वर्ष या अधिक होना आवश्यक) और भेजें।"],
            ["Write down the **reference number** (for example GRV-…). The screen shows by when it must be acknowledged and acted on.", "**संदर्भ संख्या** (जैसे GRV-…) लिख लें। स्क्रीन पर दिखता है कि कब तक पावती और कार्रवाई होनी चाहिए।"],
          ],
          check: [
            ["The ward or village is right.", "वार्ड या गाँव सही है।"],
            ["The reference number is saved.", "संदर्भ संख्या सहेजी गई।"],
            ["Similar complaints shown nearby? File yours anyway if it is a different spot.", "आसपास मिलती-जुलती शिकायतें दिखें, तब भी अलग स्थान हो तो अपनी दर्ज करें।"],
          ] },
        { id: "track", title: ["Track your complaint", "शिकायत की स्थिति देखें"],
          what: ["Seeing who has your complaint, its time limits and what has been done.", "शिकायत किसके पास है, समय-सीमाएँ और क्या काम हुआ, यह देखना।"],
          steps: [
            ["Open **grieviq.in/status** (Track my reports) and enter the email you gave.", "**grieviq.in/status** खोलें और शिकायत में दिया ईमेल लिखें।"],
            ["Tap **Send code**, type the code from your email and tap **Verify code**.", "**कोड भेजें** दबाएँ, ईमेल में आया कोड लिखें और **कोड सत्यापित करें** दबाएँ।"],
            ["Open your report: who has it, its time limits, and what the representative and department did, with photos.", "अपनी शिकायत खोलें: किसके पास है, समय-सीमाएँ, और जनप्रतिनिधि व विभाग ने क्या किया, फ़ोटो सहित।"],
          ],
          note: [["No email given? Keep your reference number and quote it to your representative's office or to support@grieviq.in. If a level misses its time limit, the complaint moves up automatically.", "ईमेल नहीं दिया? संदर्भ संख्या रखें और जनप्रतिनिधि कार्यालय या support@grieviq.in को बताएँ। कोई स्तर समय-सीमा चूके तो शिकायत स्वतः ऊपर जाती है।"]] },
        { id: "confirm", title: ["Confirm the fix, or reopen", "समाधान की पुष्टि करें या शिकायत फिर खोलें"],
          what: ["Telling GrievIQ whether the work was really done.", "GrievIQ को बताना कि काम सच में हुआ या नहीं।"],
          steps: [
            ["When the office marks it fixed, you get an email. Open your report and find **Has this been fixed?**", "कार्यालय द्वारा ठीक चिह्नित करने पर ईमेल आएगा। शिकायत खोलें और **क्या यह ठीक हो गया?** देखें।"],
            ["Look at the photos. Tap **Yes, this fixed it**, or **No, still a problem** and choose why.", "फ़ोटो देखें। **हाँ, ठीक हो गया** दबाएँ, या **नहीं, समस्या अभी है** दबाकर कारण चुनें।"],
            ["If the problem comes back after it is closed, tap **Reopen this case** (once, before the date shown). It goes to the next level up.", "बंद होने के बाद समस्या लौटे तो **यह शिकायत फिर खोलें** दबाएँ (एक बार, दिखाई गई तिथि से पहले)। यह अगले स्तर पर जाती है।"],
          ],
          note: [["No email given? GrievIQ staff may call you to check the fix.", "ईमेल नहीं दिया? GrievIQ स्टाफ़ समाधान जाँचने के लिए फ़ोन कर सकता है।"]] },
        { id: "rate", title: ["Rate the service", "सेवा को रेटिंग दें"],
          what: ["Telling the office how well your complaint was handled.", "कार्यालय को बताना कि शिकायत कितनी अच्छी तरह संभाली गई।"],
          steps: [
            ["After the case closes, answer **How did we do?**: one question about the office, one optional question about the department, and an optional comment.", "शिकायत बंद होने पर **हमने कैसा काम किया?** का उत्तर दें: एक प्रश्न कार्यालय पर, एक वैकल्पिक विभाग पर, और वैकल्पिक टिप्पणी।"],
            ["You can change it for 7 days. Ratings are never shown publicly; don't write phone numbers in the comment.", "7 दिन तक बदल सकते हैं। रेटिंग कभी सार्वजनिक नहीं होती; टिप्पणी में फ़ोन नंबर न लिखें।"],
          ] },
      ],
      problems: [
        [["The code didn't arrive", "कोड नहीं आया"], ["Check spam, wait a minute, tap **Send a new code**.", "स्पैम देखें, एक मिनट रुकें, **नया कोड भेजें** दबाएँ।"]],
        [["\"Daily limit\" message", "\"दैनिक सीमा\" संदेश"], ["Up to 5 complaints a day per mobile number. Try again tomorrow; if urgent, call your representative's office.", "एक मोबाइल नंबर से दिन में 5 शिकायतें। कल प्रयास करें; ज़रूरी हो तो जनप्रतिनिधि कार्यालय को फ़ोन करें।"]],
        [["Photo location not shared", "फ़ोटो की लोकेशन नहीं"], ["Allow location for the browser in phone settings, or carry on; the complaint is still filed.", "फ़ोन सेटिंग में ब्राउज़र को लोकेशन दें, या आगे बढ़ें; शिकायत दर्ज हो जाएगी।"]],
        [["My area can't take complaints yet", "मेरा क्षेत्र अभी उपलब्ध नहीं"], ["Tap \"I want GrievIQ in my city\" on the home page.", "मुख्य पृष्ठ पर \"मेरे शहर में GrievIQ चाहिए\" दबाएँ।"]],
      ],
      contacts: ["Help: **support@grieviq.in** · Your personal data: the Grievance Officer, **grievance@grieviq.in** · Emergencies: **112**", "सहायता: **support@grieviq.in** · व्यक्तिगत डेटा: शिकायत अधिकारी, **grievance@grieviq.in** · आपात स्थिति: **112**"],
    },
    // ---------------------------------------------------------- representatives
    rep: {
      title: ["Guide for representatives and their teams", "जनप्रतिनिधियों और टीम के लिए मार्गदर्शिका"],
      intro: ["Your office must acknowledge every complaint and act within the published time limit, or it moves up to the next level automatically.", "आपके कार्यालय को हर शिकायत की पावती देनी है और प्रकाशित समय-सीमा में कार्रवाई करनी है, वरना शिकायत स्वतः अगले स्तर पर चली जाती है।"],
      journey: "rep",
      rules: [
        ["Citizens' data is only for resolving complaints: never for campaigning, party work or messages.", "नागरिकों का डेटा केवल शिकायत समाधान के लिए: चुनाव प्रचार, दल के काम या संदेशों के लिए कभी नहीं।"],
        ["Mark work resolved only when it is done on the ground.", "काम धरातल पर पूरा होने पर ही निस्तारित चिह्नित करें।"],
        ["Each person uses their own Google account; never share a login.", "हर व्यक्ति अपना Google खाता उपयोग करे; लॉगिन कभी साझा न करें।"],
      ],
      sops: [
        { id: "signin", roles: REP_ALL, title: ["Sign in and turn on alerts", "साइन इन करें और सूचनाएँ चालू करें"],
          who: ["Everyone in the office, once per phone.", "कार्यालय के सभी, हर फ़ोन पर एक बार।"],
          steps: [
            ["Open **grieviq.in/rep** and sign in with the Google account GrievIQ has on record for you.", "**grieviq.in/rep** खोलें और GrievIQ में दर्ज अपने Google खाते से साइन इन करें।"],
            ["Tap the **bell** at the top and allow notifications, so new complaints reach your phone at once. Private or Incognito windows block them.", "ऊपर **घंटी** दबाएँ और सूचनाओं की अनुमति दें, ताकि नई शिकायतें तुरंत फ़ोन पर आएँ। Private/Incognito विंडो इन्हें रोकती है।"],
          ] },
        { id: "daily", roles: ["REPRESENTATIVE", "OFFICE_MANAGER"], title: ["Handle a new complaint (every day)", "नई शिकायत संभालें (रोज़)"],
          who: ["Representative or office manager.", "जनप्रतिनिधि या कार्यालय प्रबंधक।"],
          steps: [
            ["Open the **Cases** tab. Cases past their time limit are marked in red; handle those first.", "**शिकायतें** टैब खोलें। समय-सीमा पार वाली शिकायतें लाल में हैं; पहले उन्हें देखें।"],
            ["Read the complaint, place and photos, then tap **Acknowledge** before the date shown.", "शिकायत, स्थान और फ़ोटो देखें, फिर दिखाई गई तिथि से पहले **पावती दें** दबाएँ।"],
            ["Under **Assign to field worker**, pick a person and tap **Save assignment**. People who usually handle this issue are listed first.", "**फ़ील्ड कर्मी को सौंपें** में व्यक्ति चुनें और **आवंटन सहेजें** दबाएँ। जो आमतौर पर यह काम करते हैं, वे पहले दिखते हैं।"],
            ["If a department must do the work, forward it (next guide).", "यदि काम किसी विभाग का है, तो उसे अग्रेषित करें (अगली मार्गदर्शिका)।"],
          ],
          check: [["No new case is left unacknowledged.", "कोई नई शिकायत बिना पावती के नहीं।"], ["Every open case has a field worker or a department.", "हर खुली शिकायत किसी फ़ील्ड कर्मी या विभाग को सौंपी गई।"]] },
        { id: "forward", roles: ["REPRESENTATIVE", "OFFICE_MANAGER"], title: ["Forward to a department", "विभाग को अग्रेषित करें"],
          who: ["Representative or office manager.", "जनप्रतिनिधि या कार्यालय प्रबंधक।"],
          steps: [
            ["See **Who handles this**: the suggested department and its official contacts in your ward.", "**कौन संभालता है** देखें: सुझाया गया विभाग और आपके वार्ड में उसके आधिकारिक संपर्क।"],
            ["Contact the office by phone, WhatsApp, email, in person or letter. If the office uses GrievIQ, choose **GrievIQ department dashboard**: its officers get the case and an alert at once.", "कार्यालय से फ़ोन, व्हाट्सऐप, ईमेल, स्वयं या पत्र से संपर्क करें। कार्यालय GrievIQ उपयोग करता है तो **GrievIQ विभाग डैशबोर्ड** चुनें: अधिकारियों को तुरंत शिकायत और सूचना मिलती है।"],
            ["Fill **Forward to department**, **Office** and **How did you contact them?**, add a note if useful, and tap **Forward**. The department's target time (usually 7 days) starts now.", "**विभाग को भेजें**, **कार्यालय** और **संपर्क कैसे किया** भरें, ज़रूरत हो तो टिप्पणी लिखें और **भेजें** दबाएँ। विभाग का लक्ष्य समय (आमतौर पर 7 दिन) अभी शुरू होता है।"],
            ["Watch the department's replies on the case. If the reply is \"not ours\", choose another office and tap **Forward again**.", "शिकायत पर विभाग के उत्तर देखें। \"हमारा नहीं\" हो तो दूसरा कार्यालय चुनकर **फिर से भेजें** दबाएँ।"],
          ],
          note: [["No contact on file for that department? Tap **Tell GrievIQ** so staff can add it.", "उस विभाग का संपर्क नहीं है? **GrievIQ को बताएँ** दबाएँ।"]] },
        { id: "fieldcheck", roles: ["REPRESENTATIVE", "OFFICE_MANAGER", "FIELD_WORKER"], title: ["Field check and fix report", "मौके पर जाँच और समाधान रिपोर्ट"],
          who: ["Field worker (or the office manager when there is none).", "फ़ील्ड कर्मी (न हो तो कार्यालय प्रबंधक)।"],
          steps: [
            ["Go to the spot and open the case on your phone.", "मौके पर जाएँ और फ़ोन पर शिकायत खोलें।"],
            ["Take after-photos **at the site** and allow location, so GrievIQ can show where they were taken.", "**मौके पर** काम के बाद की फ़ोटो लें और लोकेशन की अनुमति दें।"],
            ["When a department says the work is done, tap **Record field check** and choose **Fixed**, **Partly fixed** or **Not fixed**.", "विभाग काम पूरा बताए तो **मौके पर जाँच दर्ज करें** दबाकर **ठीक हो गया**, **आंशिक** या **ठीक नहीं** चुनें।"],
            ["Send the **fix report**. The office manager or representative approves it.", "**समाधान रिपोर्ट** भेजें। कार्यालय प्रबंधक या जनप्रतिनिधि स्वीकृत करते हैं।"],
          ],
          check: [["Photos show the same spot as the complaint, after the work.", "फ़ोटो उसी स्थान की हैं और काम के बाद की हैं।"]] },
        { id: "resolve", roles: ["REPRESENTATIVE", "OFFICE_MANAGER"], title: ["Resolve a case", "शिकायत निस्तारित करें"],
          who: ["Representative or office manager.", "जनप्रतिनिधि या कार्यालय प्रबंधक।"],
          steps: [
            ["Check the photos and the field check, then tap **Approve and mark resolved** (or **Mark resolved**).", "फ़ोटो और मौके की जाँच देखें, फिर **स्वीकार करें और निस्तारित करें** (या **निस्तारित करें**) दबाएँ।"],
            ["The citizen is asked to confirm. If they say it isn't fixed, the case comes back to you, or goes up a level.", "नागरिक से पुष्टि माँगी जाती है। वे कहें कि ठीक नहीं हुआ, तो शिकायत वापस आती है या ऊपर जाती है।"],
          ],
          note: [["**Never** mark a case resolved before the work is done on the ground.", "धरातल पर काम हुए बिना शिकायत **कभी** निस्तारित न करें।"]] },
        { id: "team", roles: ["REPRESENTATIVE"], title: ["Manage the team", "टीम प्रबंधन"],
          who: ["Representative.", "जनप्रतिनिधि।"],
          steps: [
            ["Open **Team** and fill **Add a person**: name, the email of their Google account, mobile number, role, and (for field workers) their wards. Tap **Add to team**.", "**टीम** खोलें और **व्यक्ति जोड़ें** भरें: नाम, Google खाते का ईमेल, मोबाइल, भूमिका, और (फ़ील्ड कर्मी के लिए) वार्ड। **टीम में जोड़ें** दबाएँ।"],
            ["Mark people **On leave** with their return date, so cases are not assigned to them.", "छुट्टी पर गए व्यक्ति को वापसी की तिथि के साथ **छुट्टी पर** चिह्नित करें।"],
            ["When someone leaves your office, tap **Remove** the same day.", "कोई कार्यालय छोड़े तो उसी दिन **हटाएँ** दबाएँ।"],
          ] },
        { id: "reports", roles: ["REPRESENTATIVE", "OFFICE_MANAGER", "OFFICE_ASSISTANT"], title: ["Reports and audit", "रिपोर्ट और ऑडिट"],
          who: ["Anyone in the office who can see them.", "कार्यालय में जिन्हें ये दिखते हैं।"],
          steps: [
            ["**Overview**: figures for your office and the departments you work with.", "**सारांश**: आपके कार्यालय और संबंधित विभागों के आँकड़े।"],
            ["**Report**: the performance report; download it as a PDF to share.", "**रिपोर्ट**: प्रदर्शन रिपोर्ट; PDF डाउनलोड कर साझा करें।"],
            ["**Audit**: reply to any observation GrievIQ's auditor raises about your office.", "**ऑडिट**: GrievIQ ऑडिटर की टिप्पणियों का उत्तर दें।"],
          ] },
        { id: "billing", roles: ["REPRESENTATIVE", "OFFICE_MANAGER"], title: ["Pay a bill", "बिल का भुगतान"],
          who: ["Representative or office manager.", "जनप्रतिनिधि या कार्यालय प्रबंधक।"],
          steps: [
            ["Open **Billing**. Each bill shows the plan, the period, GST and the **total to pay**.", "**बिलिंग** खोलें। हर बिल में योजना, अवधि, GST और **कुल देय राशि** दिखती है।"],
            ["Check that the name shown is GrievIQ's company name. **Pay only to the details shown there**: GrievIQ never asks you to pay elsewhere by phone, WhatsApp or email.", "जाँचें कि दिखाया गया नाम GrievIQ की कंपनी का नाम है। **भुगतान केवल वहीं दिखाए विवरण पर करें**: GrievIQ कभी फ़ोन, व्हाट्सऐप या ईमेल से कहीं और भुगतान करने को नहीं कहता।"],
            ["Pay by **UPI** (scan the QR code: the amount and bill number are filled in) or by **bank transfer** (write the bill number, such as GIQ-PAY-000001, in the remarks).", "**UPI** से (QR कोड स्कैन करें: राशि और बिल संख्या अपने-आप भरती है) या **बैंक ट्रांसफ़र** से भुगतान करें (रिमार्क में बिल संख्या, जैसे GIQ-PAY-000001, लिखें)।"],
            ["Under **I have paid**, enter the transaction reference (UTR), the amount and the date, and send.", "**मैंने भुगतान कर दिया है** में लेन-देन संदर्भ (UTR), राशि और तारीख़ लिखें और भेजें।"],
            ["GrievIQ checks it with the bank statement and marks the bill **Paid**; you get an email. If it can't be matched, you're told why and can record it again.", "GrievIQ बैंक विवरण से जाँचकर बिल को **भुगतान हो चुका** करता है; आपको ईमेल मिलता है। मिलान न हो तो कारण बताया जाता है और आप फिर दर्ज कर सकते हैं।"],
          ] },
      ],
      problems: [
        [["Google sign-in refused", "Google साइन-इन अस्वीकार"], ["Use the exact Google account GrievIQ has on record; if it changed, ask GrievIQ staff to update it.", "GrievIQ में दर्ज वही Google खाता उपयोग करें; बदला हो तो स्टाफ़ से अद्यतन कराएँ।"]],
        [["No alerts on the phone", "फ़ोन पर सूचना नहीं"], ["Don't use Private/Incognito; tap the bell and allow notifications; on iPhone, add GrievIQ to the Home Screen first.", "Private/Incognito न उपयोग करें; घंटी दबाकर अनुमति दें; iPhone पर पहले होम स्क्रीन पर जोड़ें।"]],
        [["Can't assign a field worker", "फ़ील्ड कर्मी नहीं सौंप पा रहे"], ["Set their wards in **Team**, or check they are not on leave.", "**टीम** में उनके वार्ड जोड़ें, या जाँचें कि वे छुट्टी पर न हों।"]],
      ],
      contacts: ["Help: **support@grieviq.in** · Security concern or misuse: **security@grieviq.in** (within 24 hours)", "सहायता: **support@grieviq.in** · सुरक्षा या दुरुपयोग: **security@grieviq.in** (24 घंटे के भीतर)"],
    },
    // ------------------------------------------------------------- departments
    dept: {
      title: ["Guide for department officers", "विभागीय अधिकारियों के लिए मार्गदर्शिका"],
      intro: ["You see only the complaints a representative's office has forwarded to your office, with place and photos; never the citizen's name, phone or email.", "आपको केवल वही शिकायतें दिखती हैं जो जनप्रतिनिधि कार्यालय ने आपके कार्यालय को भेजी हैं, स्थान और फ़ोटो सहित; नागरिक का नाम, फ़ोन या ईमेल कभी नहीं।"],
      journey: "dept",
      rules: [
        ["Never share your sign-in code; GrievIQ never asks for it.", "अपना साइन-इन कोड कभी साझा न करें; GrievIQ कभी नहीं माँगता।"],
        ["Don't copy, forward or publish complaint details or photos outside your office's work.", "कार्यालय के काम के बाहर शिकायत का विवरण या फ़ोटो कॉपी, आगे या प्रकाशित न करें।"],
        ["Say \"work done\" only when it is truly done, with photos taken at the site.", "\"काम पूरा\" तभी कहें जब सच में पूरा हो, मौके की फ़ोटो के साथ।"],
        ["Never try to find or contact the citizen yourself.", "स्वयं नागरिक को खोजने या संपर्क करने का प्रयास न करें।"],
      ],
      sops: [
        { id: "signin", title: ["Sign in", "साइन इन करें"],
          who: ["Each officer.", "हर अधिकारी।"],
          steps: [
            ["Open **grieviq.in/dept** and type your official email.", "**grieviq.in/dept** खोलें और अपना आधिकारिक ईमेल लिखें।"],
            ["Type the **6-digit code** from your email. It works once; never share it.", "ईमेल में आया **6 अंकों का कोड** लिखें। यह एक बार चलता है; कभी साझा न करें।"],
            ["Tap the **bell** and allow notifications, so a forwarded case reaches you at once.", "**घंटी** दबाकर सूचनाओं की अनुमति दें, ताकि भेजी गई शिकायत तुरंत मिले।"],
          ],
          note: [["You are signed out after 60 minutes without activity. Always sign out on shared computers.", "60 मिनट निष्क्रियता पर आप साइन आउट हो जाते हैं। साझा कंप्यूटर पर हमेशा साइन आउट करें।"]] },
        { id: "reply", title: ["Reply on a forwarded case", "भेजी गई शिकायत पर उत्तर दें"],
          who: ["The officer responsible for the work.", "काम का जिम्मेदार अधिकारी।"],
          steps: [
            ["Open the case from the list or the alert: read the problem, see the map and photos.", "सूची या सूचना से शिकायत खोलें: समस्या पढ़ें, नक्शा और फ़ोटो देखें।"],
            ["Reply as soon as you can, choosing one: **Scheduled** (give the date), **Work started**, **Work done**, **Not this office's work**, or **Can't be done** (give the reason).", "जल्दी से उत्तर दें, एक चुनें: **निर्धारित** (तिथि दें), **काम शुरू**, **काम पूरा**, **इस कार्यालय का काम नहीं**, या **संभव नहीं** (कारण दें)।"],
            ["For **Work done**, add photos taken **at the site, of that work**. Allow location once when asked.", "**काम पूरा** के लिए **मौके पर, उसी काम की** फ़ोटो जोड़ें। पूछे जाने पर लोकेशन की अनुमति दें।"],
            ["Need to reach the citizen? Contact the representative's office that forwarded the case.", "नागरिक से बात ज़रूरी हो तो शिकायत भेजने वाले जनप्रतिनिधि कार्यालय से संपर्क करें।"],
          ],
          check: [
            ["Replied within the target time (usually 7 days).", "लक्ष्य समय (आमतौर पर 7 दिन) में उत्तर दिया।"],
            ["\"Work done\" only with real site photos.", "\"काम पूरा\" केवल मौके की सच्ची फ़ोटो के साथ।"],
            ["Not your work? Said \"Not this office's work\" at once.", "आपका काम नहीं? तुरंत \"इस कार्यालय का काम नहीं\" चुना।"],
          ] },
        { id: "officers", title: ["Officers joining or leaving", "अधिकारियों का जुड़ना या जाना"],
          who: ["Head of the office.", "कार्यालय प्रमुख।"],
          steps: [
            ["Officers who may sign in are named in your office's signed agreement (Annexure A), each with an official email.", "साइन इन करने वाले अधिकारी कार्यालय के हस्ताक्षरित समझौते (अनुलग्नक A) में आधिकारिक ईमेल सहित नामित होते हैं।"],
            ["When an officer leaves or is transferred, tell **support@grieviq.in within 3 working days**. GrievIQ removes access within 1 working day.", "अधिकारी के जाने या स्थानांतरण पर **3 कार्य दिवस में support@grieviq.in** को बताएँ। GrievIQ 1 कार्य दिवस में पहुँच हटाता है।"],
          ] },
        { id: "performance", title: ["Your office's performance", "आपके कार्यालय का प्रदर्शन"],
          who: ["Every officer.", "हर अधिकारी।"],
          steps: [
            ["The dashboard shows cases received, first-reply time, work done within the target time, fixed at the first check, and citizens' ratings.", "डैशबोर्ड पर प्राप्त शिकायतें, पहले उत्तर का समय, लक्ष्य समय में काम, पहली जाँच में ठीक, और नागरिकों की रेटिंग दिखती है।"],
            ["During the pilot, offices are not ranked against each other.", "पायलट में कार्यालयों की रैंकिंग नहीं होती।"],
          ] },
        { id: "billing", title: ["Pay a bill", "बिल का भुगतान"],
          who: ["The officer who handles the office's payments.", "कार्यालय के भुगतान देखने वाले अधिकारी।"],
          steps: [
            ["On the dashboard, tap **Open billing**. Each bill shows the plan, the period, GST and the **total to pay**.", "डैशबोर्ड पर **बिलिंग खोलें** दबाएँ। हर बिल में योजना, अवधि, GST और **कुल देय राशि** दिखती है।"],
            ["Check that the name shown is GrievIQ's company name. **Pay only to the details shown there**: GrievIQ never asks you to pay elsewhere by phone, WhatsApp or email.", "जाँचें कि दिखाया गया नाम GrievIQ की कंपनी का नाम है। **भुगतान केवल वहीं दिखाए विवरण पर करें**: GrievIQ कभी फ़ोन, व्हाट्सऐप या ईमेल से कहीं और भुगतान करने को नहीं कहता।"],
            ["Pay by **UPI** (scan the QR code: the amount and bill number are filled in) or by **bank transfer** (write the bill number, such as GIQ-PAY-000001, in the remarks).", "**UPI** से (QR कोड स्कैन करें: राशि और बिल संख्या अपने-आप भरती है) या **बैंक ट्रांसफ़र** से भुगतान करें (रिमार्क में बिल संख्या, जैसे GIQ-PAY-000001, लिखें)।"],
            ["Under **I have paid**, enter the transaction reference (UTR), the amount and the date, and send.", "**मैंने भुगतान कर दिया है** में लेन-देन संदर्भ (UTR), राशि और तारीख़ लिखें और भेजें।"],
            ["GrievIQ checks it with the bank statement and marks the bill **Paid**; you get an email. If it can't be matched, you're told why and can record it again.", "GrievIQ बैंक विवरण से जाँचकर बिल को **भुगतान हो चुका** करता है; आपको ईमेल मिलता है। मिलान न हो तो कारण बताया जाता है और आप फिर दर्ज कर सकते हैं।"],
          ] },
      ],
      problems: [
        [["The code didn't arrive", "कोड नहीं आया"], ["Check spam; wait a minute and ask again. After 3 codes in 15 minutes, wait 15 minutes.", "स्पैम देखें; एक मिनट बाद फिर माँगें। 15 मिनट में 3 कोड के बाद 15 मिनट रुकें।"]],
        [["My email isn't accepted", "मेरा ईमेल स्वीकार नहीं"], ["Only officers named by your office can sign in. Ask your head of office to email support@grieviq.in.", "केवल कार्यालय द्वारा नामित अधिकारी साइन इन कर सकते हैं। कार्यालय प्रमुख support@grieviq.in को लिखें।"]],
        [["The case isn't ours", "शिकायत हमारी नहीं"], ["Reply **Not this office's work**; the representative's office forwards it elsewhere.", "**इस कार्यालय का काम नहीं** उत्तर दें; जनप्रतिनिधि कार्यालय इसे कहीं और भेजेगा।"]],
      ],
      contacts: ["Officer changes and help: **support@grieviq.in** · Security: **security@grieviq.in** (within 24 hours)", "अधिकारी बदलाव और सहायता: **support@grieviq.in** · सुरक्षा: **security@grieviq.in** (24 घंटे के भीतर)"],
    },
    // ------------------------------------------------------------------- admin
    admin: {
      title: ["Guide for GrievIQ staff", "GrievIQ स्टाफ़ के लिए मार्गदर्शिका"],
      intro: ["You see only the pages your role allows, and every change is logged in a record nobody can alter.", "आपको केवल अपनी भूमिका के पृष्ठ दिखते हैं, और हर बदलाव ऐसे रिकॉर्ड में दर्ज होता है जिसे कोई नहीं बदल सकता।"],
      rules: [
        ["Never send citizens' details by email or messaging apps; staff emails carry no complaint content.", "नागरिकों का विवरण कभी ईमेल या मैसेजिंग ऐप से न भेजें; स्टाफ़ ईमेल में शिकायत का विवरण नहीं होता।"],
        ["Use only official public contacts; an officer's personal mobile only with their recorded consent.", "केवल आधिकारिक सार्वजनिक संपर्क; अधिकारी का निजी मोबाइल केवल दर्ज सहमति से।"],
        ["Nobody approves their own change request.", "कोई अपना बदलाव अनुरोध स्वयं स्वीकार नहीं करता।"],
        ["GrievIQ is neutral: treat every party's representatives the same.", "GrievIQ निष्पक्ष है: हर दल के जनप्रतिनिधियों से समान व्यवहार।"],
      ],
      sops: [
        { id: "day", roles: ["super_admin", "operations_admin", "data_moderator"], title: ["Start of day", "दिन की शुरुआत"],
          who: ["Operations admin and data moderator, every working day.", "संचालन एडमिन और डेटा मॉडरेटर, हर कार्य दिवस।"],
          steps: [
            ["Open the **Dashboard**. Note cases past their time limits, open exceptions and new feedback.", "**डैशबोर्ड** खोलें। समय-सीमा पार शिकायतें, खुले अपवाद और नई प्रतिक्रिया देखें।"],
            ["Work through **Daily work** in this order: Exceptions → Checks → Reviews → Feedback → Ratings → Messages.", "**रोज़ का काम** इस क्रम में: अपवाद → जाँच → समीक्षा → प्रतिक्रिया → रेटिंग → संदेश।"],
          ] },
        { id: "checks", roles: ["super_admin", "operations_admin", "data_moderator"], title: ["Check a fix for a citizen with no email", "बिना ईमेल वाले नागरिक का समाधान जाँचें"],
          who: ["Data moderator, operations admin or super admin.", "डेटा मॉडरेटर, संचालन या सुपर एडमिन।"],
          steps: [
            ["Open **Checks** and compare the before and after photos.", "**जाँच** खोलें और पहले-बाद की फ़ोटो मिलाएँ।"],
            ["If the photos don't settle it, a super or operations admin reveals the citizen's number, giving a reason (it is logged), and calls.", "फ़ोटो से स्पष्ट न हो तो सुपर या संचालन एडमिन कारण लिखकर नंबर देखते हैं (दर्ज होता है) और फ़ोन करते हैं।"],
            ["Record the result: confirmed fixed, or not fixed.", "परिणाम दर्ज करें: ठीक हो गया, या ठीक नहीं।"],
          ] },
        { id: "data", roles: ["super_admin", "operations_admin", "data_entry_operator"], title: ["Change areas, wards, representatives or departments", "क्षेत्र, वार्ड, जनप्रतिनिधि या विभाग में बदलाव"],
          who: ["Data entry operator requests; operations or super admin approves.", "डेटा एंट्री ऑपरेटर अनुरोध करता है; संचालन या सुपर एडमिन स्वीकृत करता है।"],
          steps: [
            ["**Data entry operator:** in **Jurisdiction** or **Departments**, make the change and submit it as a request, with the official source.", "**डेटा एंट्री ऑपरेटर:** **क्षेत्राधिकार** या **विभाग** में बदलाव करें और आधिकारिक स्रोत के साथ अनुरोध भेजें।"],
            ["**Operations or super admin:** open **Change requests**, check the source, then approve or reject with a reason.", "**संचालन या सुपर एडमिन:** **बदलाव अनुरोध** खोलें, स्रोत जाँचें, फिर कारण सहित स्वीकार या अस्वीकार करें।"],
            ["A new city or district: add it in **Areas**, import wards, check them, then switch the area on for citizens.", "नया नगर या जिला: **क्षेत्र** में जोड़ें, वार्ड आयात करें, जाँचें, फिर नागरिकों के लिए चालू करें।"],
          ] },
        { id: "dept", roles: ["super_admin", "operations_admin"], title: ["Bring a department office on board", "विभागीय कार्यालय को जोड़ें"],
          who: ["Operations or super admin.", "संचालन या सुपर एडमिन।"],
          steps: [
            ["In **Departments**, open the office and tap **Download agreement to sign**. Print two copies.", "**विभाग** में कार्यालय खोलें और **हस्ताक्षर के लिए समझौता डाउनलोड करें** दबाएँ। दो प्रतियाँ प्रिंट करें।"],
            ["After both sides sign, record the agreement and **upload the signed copy**.", "दोनों पक्षों के हस्ताक्षर के बाद समझौता दर्ज करें और **हस्ताक्षरित प्रति अपलोड करें**।"],
            ["Add each officer from Annexure A (name, designation, official email). Remove a leaver within 1 working day.", "अनुलग्नक A से हर अधिकारी जोड़ें (नाम, पद, आधिकारिक ईमेल)। जाने वाले को 1 कार्य दिवस में हटाएँ।"],
          ] },
        { id: "staff", roles: ["super_admin"], title: ["Staff accounts", "स्टाफ़ खाते"],
          who: ["Super admin.", "सुपर एडमिन।"],
          steps: [
            ["New joiner: add them in **Staff** with the right role, and add their email to the staff sign-in list.", "नया सदस्य: **स्टाफ़** में सही भूमिका के साथ जोड़ें और ईमेल स्टाफ़ साइन-इन सूची में जोड़ें।"],
            ["Leaver: **Mark as left** the same day, and remove them from the sign-in list.", "जाने वाला सदस्य: उसी दिन **छोड़ दिया चिह्नित करें** और साइन-इन सूची से हटाएँ।"],
          ] },
        { id: "prices", roles: ["super_admin", "operations_admin"], title: ["Prices and pilot requests", "शुल्क और पायलट अनुरोध"],
          who: ["Super admin for prices; operations admin for pilot requests.", "शुल्क के लिए सुपर एडमिन; पायलट अनुरोध के लिए संचालन एडमिन।"],
          steps: [
            ["In **Prices & site details**, make changes, tap **Save draft**, check **Preview the public page**, then **Publish** with a note. **History** brings back any earlier version.", "**शुल्क और साइट विवरण** में बदलाव करें, **ड्राफ़्ट सहेजें**, **पूर्वावलोकन** देखें, फिर टिप्पणी के साथ **प्रकाशित करें**। **इतिहास** से पुराना संस्करण वापस आता है।"],
            ["Switch on a claim (GeM, India data storage, security audit) only when it is true and you hold the proof.", "कोई दावा तभी चालू करें जब सच हो और प्रमाण आपके पास हो।"],
            ["In **Pilot requests**, call each office within the promised time and set **Contacted** or **Closed** with a note.", "**पायलट अनुरोध** में वादे के समय में फ़ोन करें और टिप्पणी के साथ **संपर्क किया** या **बंद** करें।"],
          ] },
        { id: "bills", roles: ["super_admin", "operations_admin", "auditor"], title: ["Bills and payments", "बिल और भुगतान"],
          who: ["Super or operations admin; the auditor can look.", "सुपर या संचालन एडमिन; ऑडिटर देख सकता है।"],
          steps: [
            ["**Payment details** (super admin, in Prices & site details): add the company's UPI ID and bank account. New or changed details go live **24 hours** after publishing; every super admin is emailed and can cancel. Hiding details works at once.", "**भुगतान विवरण** (सुपर एडमिन, शुल्क और साइट विवरण में): कंपनी की UPI आईडी और बैंक खाता जोड़ें। नया या बदला विवरण प्रकाशन के **24 घंटे** बाद लागू होता है; हर सुपर एडमिन को ईमेल जाता है और वह रद्द कर सकता है। छिपाना तुरंत लागू होता है।"],
            ["In **Bills**, find the office, choose the plan, one month or one year and the start date, then **Make the bill**. The amount comes from the published prices; the office is emailed.", "**बिल** में कार्यालय खोजें, योजना, एक माह या एक वर्ष और आरंभ तिथि चुनें, फिर **बिल बनाएँ**। राशि प्रकाशित शुल्क से आती है; कार्यालय को ईमेल जाता है।"],
            ["When an office records a payment, **find it in the bank statement** (reference, amount, date) before you confirm it. If it doesn't match, **turn it back** with a reason.", "जब कार्यालय भुगतान दर्ज करे, तो पुष्टि से पहले **उसे बैंक विवरण में खोजें** (संदर्भ, राशि, तारीख़)। मेल न खाए तो कारण सहित **लौटाएँ**।"],
          ] },
        { id: "audit", roles: ["super_admin", "auditor"], title: ["Audit and data retention", "ऑडिट और डेटा संग्रहण"],
          who: ["Auditor and super admin.", "ऑडिटर और सुपर एडमिन।"],
          steps: [
            ["**Auditor:** raise observations in **Audit**; the owner replies; the auditor verifies and closes. Only the super admin can accept a risk.", "**ऑडिटर:** **ऑडिट** में टिप्पणी दर्ज करें; जिम्मेदार उत्तर देता है; ऑडिटर जाँचकर बंद करता है। जोखिम केवल सुपर एडमिन स्वीकार करता है।"],
            ["**Super admin:** review **Data retention** each month; place a hold only when a case is under legal or audit review.", "**सुपर एडमिन:** हर माह **डेटा संग्रहण** देखें; कानूनी या ऑडिट समीक्षा में ही रोक लगाएँ।"],
          ] },
      ],
      problems: [
        [["\"Your account does not have access to this page\"", "\"इस पृष्ठ की अनुमति नहीं\""], ["Your role doesn't include it; ask the super admin if your duties need it.", "आपकी भूमिका में शामिल नहीं; ज़रूरत हो तो सुपर एडमिन से पूछें।"]],
        [["Signed out while working", "काम के दौरान साइन आउट"], ["Idle sessions end for safety; sign in again.", "सुरक्षा हेतु निष्क्रिय सत्र समाप्त होते हैं; फिर साइन इन करें।"]],
      ],
      contacts: ["Support: **support@grieviq.in** · Personal data requests: **grievance@grieviq.in** · Security: **security@grieviq.in**", "सहायता: **support@grieviq.in** · व्यक्तिगत डेटा अनुरोध: **grievance@grieviq.in** · सुरक्षा: **security@grieviq.in**"],
    },
  };
})();
