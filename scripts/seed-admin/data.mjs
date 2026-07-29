/** Static vocabulary for the admin seed — real Rajkot/Gujarat names and copy. */

export const FIRST = [
  "Jignesh", "Nilesh", "Hardik", "Bhavesh", "Ketan", "Paresh", "Mehul", "Kalpesh", "Sanjay",
  "Dhaval", "Ronak", "Chirag", "Tushar", "Vishal", "Jayesh", "Rakesh", "Ashish", "Pankaj",
  "Nikunj", "Sagar", "Rohit", "Vipul", "Manish", "Alpesh", "Darshan", "Harshad", "Bhargav",
  "Rajesh", "Sunil", "Amit", "Kirit", "Divyesh", "Maulik", "Nirav", "Parth", "Kaushik",
  "Priya", "Nisha", "Rekha", "Hetal", "Bhavna", "Krupa", "Foram", "Dimple", "Jinal",
  "Payal", "Sneha", "Vaishali", "Riddhi", "Khushbu", "Toral", "Urvi", "Kinjal", "Roshni",
];

export const LAST = [
  "Kavathiya", "Bhalodiya", "Vaghasiya", "Sakhiya", "Dhaduk", "Kalathiya", "Ghetiya",
  "Ramani", "Savaliya", "Kotadiya", "Vekariya", "Chovatiya", "Detroja", "Gajera",
  "Patel", "Shah", "Mehta", "Trivedi", "Joshi", "Vyas", "Doshi", "Dave", "Pandya",
  "Raiyani", "Bhut", "Zalavadiya", "Kachhadiya", "Hirpara", "Solanki", "Chauhan",
  "Jadeja", "Gohil", "Parmar", "Rathod", "Makwana", "Baraiya", "Sorathiya", "Vadhel",
];

export const BROKER_FIRMS = [
  "RK Properties", "Shree Ganesh Estate", "Skyline Realtors", "Aashirwad Property",
  "Maruti Estate Agency", "Krishna Realty", "Om Sai Properties", "Rajkot Property Point",
  "Sun Estate Consultants", "Dwarkesh Realty", "Gurukrupa Estate", "Radhe Property Zone",
  "Vraj Realtors", "Sanskar Estate", "Shivam Property Solutions", "Anand Estate",
  "Nakshatra Realty", "Ambe Property Hub", "Shubh Estate", "Trimurti Realtors",
];

export const BUILDER_FIRMS = [
  "Shreeji Builders", "Sardar Developers", "Silver Stone Group", "Anmol Infrastructure",
  "Riddhi Siddhi Developers", "Sky High Construction", "Vraj Buildcon", "Aarambh Group",
  "Shivalik Realty", "Nandanvan Developers", "Green Acres Infra", "Shilp Construction",
  "Raj Buildwell", "Mahavir Developers", "Aakruti Infra", "Krish Buildcon",
];

export const PROJECT_NAMES = [
  "Shree Residency", "Green Valley Heights", "Sardar Enclave", "Silver Stone Elegance",
  "Anmol Skyline", "Riddhi Siddhi Township", "Sky High Business Park", "Vraj Aangan",
  "Aarambh Greens", "Shivalik Sapphire", "Nandanvan Elite", "Green Acres Plotting",
  "Shilp Corporate House", "Raj Palladium", "Mahavir Serenity", "Aakruti Bliss",
  "Krish Orchid", "Sardar Trade Centre", "Shreeji Sanskar Villas", "Silver Leaf Farms",
  "Anmol Arcade", "Vraj Vatika", "Aarambh Business Hub", "Shivalik Row House",
  "Nandanvan Farmhouse Scheme", "Green Acres Commercia", "Shilp Mixed Towers",
];

/** Rajkot-first, then the other Gujarat cities the platform lists. */
export const CITY_NAMES = [
  "Rajkot", "Ahmedabad", "Surat", "Vadodara", "Jamnagar",
  "Junagadh", "Bhavnagar", "Gandhinagar", "Morbi", "Gondal",
];

export const RAJKOT_AREAS = [
  "150 Feet Ring Road", "Kalawad Road", "University Road", "Mavdi", "Raiya",
  "Nana Mava", "Bhaktinagar", "Gondal Road", "Kuvadva Road", "Kothariya",
  "Vidhyanagar", "Amin Marg", "Yagnik Road", "Jamnagar Road", "Morbi Road",
];

export const AMENITY_POOL = [
  "lift", "parking", "security", "power_backup", "garden", "gym", "clubhouse",
  "swimming_pool", "cctv", "play_area", "water_24x7", "intercom", "fire_safety",
  "rain_water", "visitor_parking", "jogging_track", "indoor_games", "community_hall",
  "solar", "waste_disposal",
];

export const REPORT_REASONS = [
  "Fake or duplicate listing", "Wrong price", "Broker posing as owner",
  "Property already sold", "Obscene or abusive content", "Wrong location",
  "Photos not of this property", "Asking money outside platform",
  "Spam / repeated posting", "Contact number in description",
];

export const REJECT_TEMPLATES = [
  ["dup", "Duplicate listing", "This property is already listed on HomzList. Duplicate posts are removed to keep the feed clean."],
  ["photos", "Photos not genuine", "The photos do not appear to be of this property. Please upload real photos taken by you."],
  ["contact", "Contact number in content", "Phone numbers are not allowed in the title, description or photos. Buyers reach you through chat."],
  ["price", "Unrealistic price", "The price entered does not match the property described. Please correct it and resubmit."],
  ["doc", "Ownership proof invalid", "The uploaded ownership document is unreadable or does not match the property address."],
  ["incomplete", "Incomplete details", "Key details are missing. Fill the required fields and submit again."],
  ["policy", "Against content policy", "The content violates the HomzList content policy."],
  ["location", "Wrong location", "The selected area does not match the address in the description."],
];

export const TICKET_SUBJECTS = [
  ["payment_refund", "Payment deducted but plan not activated", "high"],
  ["payment_refund", "Refund not received after 5 days", "high"],
  ["listing_not_approved", "Listing not approved after 2 days", "normal"],
  ["listing_not_approved", "My listing was rejected without reason", "normal"],
  ["number_recovery", "Lost access to my number", "urgent"],
  ["number_recovery", "Old SIM deactivated, cannot log in", "urgent"],
  ["verification", "How do I get RERA verified?", "low"],
  ["verification", "ID verification stuck in pending", "normal"],
  ["bug", "App crashes on photo upload", "normal"],
  ["bug", "Chat messages not loading", "normal"],
  ["other", "How do boosts work?", "low"],
  ["other", "Want to change my role to broker", "normal"],
  ["grievance", "Grievance: listing removed without notice", "urgent"],
];

export const CANNED = [
  ["Payment pending — UPI", "payment", "Your payment is still with the bank. UPI payments can take up to 30 minutes to confirm. If it does not activate by then, reply here and we will check it manually."],
  ["Refund initiated", "payment", "We have initiated a full refund. It reaches your bank in 5–7 working days, back to the same account you paid from."],
  ["Listing under review", "listing", "Your listing is in the review queue. Reviews are usually completed within 24 hours."],
  ["Photos rejected", "listing", "The photos you uploaded do not appear to be of this property. Please upload photos you have taken yourself."],
  ["Number recovery SOP", "account", "To recover your account we need: a photo of your ID, the old number, and one listing ID you posted. Reply with these and we will verify."],
  ["RERA verification", "verification", "Send your RERA registration number and the certificate PDF. Verification is completed within 2 working days."],
  ["No transaction liability", "dispute", "HomzList is a listing platform and is not a party to any transaction between users. We can share the chat record with the authorities on a valid legal request."],
  ["Boost rejected refund", "boost", "The boost was not approved, so the amount has been refunded in full. It reaches your account in 5–7 working days."],
  ["Duplicate listing", "listing", "This property is already listed from your account. Please edit the existing listing instead of posting again."],
  ["Suspension explained", "account", "The account was suspended after repeated reports were upheld. It is lifted automatically on the date shown in your account status screen."],
  ["Plan grandfathering", "plans", "Plan price changes apply only to new purchases. Your current plan keeps the price and contents you paid for until it expires."],
  ["Chat is private", "privacy", "Admins can read chats only for a reported thread or an active dispute, and can never send a message as you."],
];

export const FAQS = [
  ["Listings", "How long does listing approval take?", "Most listings are reviewed within 24 hours. If we need changes, you will see notes on the exact fields."],
  ["Listings", "Why was my listing rejected?", "The rejection reason is shown on the listing in My Listings. Three rejections lock the listing; you can then file an appeal."],
  ["Listings", "Can I edit a live listing?", "Yes. Minor edits go live immediately; price, area or photo changes go back for a short re-review."],
  ["Listings", "How many photos can I upload?", "Up to 20 photos per listing. The first photo becomes the cover."],
  ["Listings", "What is 'still available?'", "After two months we ask you to confirm the property is still available, so buyers never see stale listings."],
  ["Plans", "What does the ₹999 plan include?", "One listing slot, one requirement and 10 proposals. The slot is yours until the listing is sold or deleted."],
  ["Plans", "What does the ₹2,999 plan include?", "30 days of full requirement access plus 30 proposals."],
  ["Plans", "What does the ₹9,999 builder plan include?", "One project for 180 days with unlimited proposals on your own project."],
  ["Plans", "Do plan price changes affect me?", "No. Price and contents are locked at purchase for the whole validity."],
  ["Plans", "Can I get a refund?", "Plans are refundable only where the service could not be delivered. Raise a support ticket with the payment ID."],
  ["Payments", "My money was deducted but nothing happened.", "UPI can take up to 30 minutes. If the plan is still not active, raise a ticket with the payment ID."],
  ["Payments", "Do I get a GST invoice?", "Yes, an invoice with GST is generated for every successful payment and is available in Payments."],
  ["Payments", "Which payment methods work?", "UPI, debit and credit cards, and net banking through Razorpay."],
  ["Boost", "What does a boost do?", "It places your listing higher in the area, city or search results you choose, for the days you buy."],
  ["Boost", "What if my boost is rejected?", "You are refunded in full automatically and notified."],
  ["Boost", "Can I pause a boost?", "Yes. Unused days come back as boost credit valid for 90 days."],
  ["Chat", "Why can't I see the owner's number?", "Numbers are shared only after the other person allows it, from inside the chat."],
  ["Chat", "Can admins read my chats?", "Only for a reported thread or an open dispute, and admins can never send messages as you."],
  ["Chat", "How do I block someone?", "Open the chat details and use Block. They cannot message you again."],
  ["Requirements", "What is a requirement?", "It is a buyer's need posted publicly so sellers and brokers can send matching properties."],
  ["Requirements", "How long does a requirement stay live?", "30 days, with reminders at 5 days and 1 day before it expires."],
  ["Requirements", "Why is the requirement hidden?", "Full requirement details need an active requirement-access plan."],
  ["Proposals", "What is a proposal?", "A seller's reply to a requirement — either an existing listing or a chat request."],
  ["Proposals", "How many proposals do I get?", "10 with the ₹999 plan, 30 with ₹2,999, and top-ups of 10 for ₹499."],
  ["Account", "How do I verify my ID?", "Profile → Verification → upload Aadhaar or PAN. Approval usually takes a working day."],
  ["Account", "How do brokers get verified?", "Upload your ID; RERA-registered brokers can also add a RERA number for the RERA badge."],
  ["Account", "Can I change my role?", "Yes, from Settings. Role changes are reviewed before your existing listings move."],
  ["Account", "How do I delete my account?", "Settings → Account → Delete. There is a 30-day grace period during which login restores it."],
  ["Account", "What happens if I am suspended?", "Your listings are hidden and chats are frozen until the suspension is lifted."],
  ["Safety", "How do I report a listing?", "Open the listing menu and choose Report. Pick a reason; you are notified of the outcome."],
  ["Safety", "Does HomzList verify every property?", "We verify identity and documents where provided, but we are not a party to any transaction."],
  ["Safety", "Someone asked for an advance payment.", "Never pay outside a registered agreement. Report the user immediately."],
  ["Search", "How does area search work?", "Searching an area also brings nearby areas, using the adjacency map maintained by our team."],
  ["Search", "Can I save a search?", "Yes. Saved searches notify you when a matching property goes live."],
  ["Search", "My area is not listed.", "Use 'Request area' in the location picker. We add it and notify you."],
  ["General", "Which cities is HomzList in?", "Rajkot first, with the rest of Gujarat opening city by city."],
  ["General", "Is HomzList free for buyers?", "Yes. Browsing, saving, inquiring and chatting are free for buyers."],
  ["General", "Do you have an app?", "HomzList is a PWA — add it to your home screen from the browser menu."],
  ["General", "How do I contact support?", "Help → Contact us. Grievances are acknowledged within 24 hours."],
  ["General", "Where do I find legal pages?", "Help → Legal has Terms, Privacy, Refund, Disclaimer and the Grievance policy."],
];

export const UI_STRING_SEED = [
  ["common.save", "common", "Save", "સાચવો", "सेव करें"],
  ["common.cancel", "common", "Cancel", "રદ કરો", "रद्द करें"],
  ["common.delete", "common", "Delete", "કાઢી નાખો", "हटाएं"],
  ["common.edit", "common", "Edit", "ફેરફાર", "संपादित करें"],
  ["common.share", "common", "Share", "શેર કરો", "शेयर करें"],
  ["common.retry", "common", "Try again", "ફરી પ્રયાસ કરો", "पुनः प्रयास करें"],
  ["common.loading", "common", "Loading…", "લોડ થાય છે…", "लोड हो रहा है…"],
  ["common.offline", "common", "You are offline", "તમે ઓફલાઇન છો", "आप ऑफ़लाइन हैं"],
  ["feed.title", "feed", "Home", "હોમ", "होम"],
  ["feed.empty", "feed", "No listings here yet", "અહીં હજી કોઈ પ્રોપર્ટી નથી", "यहाँ अभी कोई लिस्टिंग नहीं है"],
  ["feed.new_listings", "feed", "New listings", "નવી પ્રોપર્ટી", "नई लिस्टिंग"],
  ["search.placeholder", "search", "Search area, project or landmark", "વિસ્તાર, પ્રોજેક્ટ કે લેન્ડમાર્ક શોધો", "क्षेत्र, प्रोजेक्ट या लैंडमार्क खोजें"],
  ["search.no_results", "search", "Nothing matched your filters", "તમારા ફિલ્ટરથી કંઈ મળ્યું નથી", "आपके फ़िल्टर से कुछ नहीं मिला"],
  ["listing.price_on_request", "listing", "Price on request", "ભાવ પૂછો", "कीमत पूछें"],
  ["listing.negotiable", "listing", "Negotiable", "વાટાઘાટ શક્ય", "मोल-भाव संभव"],
  ["listing.sold", "listing", "Sold", "વેચાઈ ગયું", "बिक गया"],
  ["listing.rented", "listing", "Rented", "ભાડે અપાઈ ગયું", "किराए पर दे दिया"],
  ["chat.request_number", "chat", "Request number", "નંબર માંગો", "नंबर मांगें"],
  ["chat.number_shared", "chat", "Number shared", "નંબર શેર થયો", "नंबर साझा किया"],
  ["chat.blocked", "chat", "You blocked this user", null, "आपने इस उपयोगकर्ता को ब्लॉक किया"],
  ["plan.wall_title", "plans", "Choose a plan to post", "પોસ્ટ કરવા પ્લાન પસંદ કરો", null],
  ["plan.expired", "plans", "Your plan has expired", "તમારો પ્લાન પૂરો થયો", "आपकी योजना समाप्त हो गई"],
  ["boost.active", "boost", "Boost active", "બૂસ્ટ ચાલુ", "बूस्ट सक्रिय"],
  ["boost.expired", "boost", "Boost expired", "બૂસ્ટ પૂરું થયું", null],
  ["profile.verified", "profile", "Verified", "ચકાસાયેલ", "सत्यापित"],
  ["profile.response_time", "profile", "Usually replies in {time}", "સામાન્ય રીતે {time} માં જવાબ", null],
  ["error.generic", "errors", "Something went wrong", "કંઈક ખોટું થયું", "कुछ गलत हो गया"],
  ["error.rate_limited", "errors", "Too many attempts. Try later.", "ઘણા પ્રયાસ. પછી પ્રયાસ કરો.", null],
  ["error.suspended", "errors", "Your account is suspended", "તમારું ખાતું સસ્પેન્ડ છે", null],
  ["notif.listing_approved", "notifications", "Your listing is live", "તમારી પ્રોપર્ટી લાઇવ થઈ", "आपकी लिस्टिंग लाइव है"],
  ["notif.inquiry_received", "notifications", "New inquiry received", "નવી પૂછપરછ આવી", null],
];

export const FEATURE_FLAGS = [
  ["stories", "Stories", "24h story row on the feed", true, "all"],
  ["boost", "Boost", "Paid placement for listings", true, "all"],
  ["requirements", "Requirements", "Buyer requirement board", true, "all"],
  ["proposals", "Proposals", "Seller replies to requirements", true, "all"],
  ["pwa_prompt", "PWA install prompt", "Add-to-home-screen nudge", true, "percentage"],
  ["saved_searches", "Saved searches", "Alerts on matching listings", true, "all"],
  ["visits", "Visit scheduler", "In-chat visit proposals", true, "all"],
  ["projects", "Builder projects", "Project posting for builders", true, "role"],
  ["chat_photos", "Chat photos", "Photo messages in chat", true, "all"],
  ["number_masking", "Number masking", "Hide numbers until allowed", true, "all"],
  ["weekly_digest", "Weekly digest", "Monday 9AM digest email", true, "all"],
  ["blog", "Blog", "Public blog + SEO pages", true, "all"],
  ["featured_collections", "Featured collections", "Curated strips on feed", true, "city"],
  ["price_drop_alerts", "Price drop alerts", "Notify savers on price drop", true, "all"],
  ["referrals", "Referrals", "Invite-a-friend credit", false, "staff"],
  ["auction", "Auction listings", "Bid-based listings", false, "staff"],
  ["home_loans", "Home loan leads", "Partner loan enquiry form", false, "staff"],
  ["multi_language", "Gujarati UI", "Full Gujarati interface", false, "percentage"],
];

export const RATE_LIMITS = [
  ["otp_send", "OTP send", "phone", 3600, 5, 3600],
  ["otp_verify", "OTP verify", "phone", 600, 10, 1800],
  ["login", "Login attempts", "ip", 900, 20, 900],
  ["listing_create", "Listing create", "user", 86400, 10, 0],
  ["requirement_create", "Requirement create", "user", 86400, 5, 0],
  ["proposal_send", "Proposal send", "user", 3600, 20, 0],
  ["inquiry_send", "Inquiry send", "user", 3600, 15, 0],
  ["chat_message", "Chat message", "user", 60, 30, 300],
  ["photo_upload", "Photo upload", "user", 3600, 100, 0],
  ["search", "Search query", "ip", 60, 60, 120],
  ["report_submit", "Report submit", "user", 86400, 10, 0],
  ["support_ticket", "Support ticket", "user", 86400, 5, 0],
  ["checkout", "Checkout create", "user", 3600, 10, 600],
  ["admin_export", "Admin export", "user", 86400, 20, 0],
];

export const VELOCITY_RULES = [
  ["listings_per_hour", "Listings posted per hour", 5, 1, "flag"],
  ["signups_per_ip", "Signups from one IP", 3, 24, "block"],
  ["reports_by_user", "Reports filed by one user", 10, 24, "throttle"],
  ["inquiries_per_hour", "Inquiries sent per hour", 20, 1, "throttle"],
  ["number_requests", "Number requests per day", 15, 24, "flag"],
  ["failed_payments", "Failed payments per user", 5, 1, "flag"],
  ["chat_new_threads", "New chat threads per hour", 15, 1, "throttle"],
  ["price_edits", "Price edits per listing", 5, 24, "flag"],
];

export const RETENTION = [
  ["notifications", "Notifications", 90, false, "Purged nightly"],
  ["otp_logs", "OTP logs", 30, false, "Purged nightly"],
  ["archived_chats", "Archived chats", 365, false, "12 months after last message"],
  ["trash", "Trash items", 30, false, "Hard-deleted after purge date"],
  ["audit_log", "Audit log", 180, true, "Legal minimum — cannot be lowered"],
  ["payments", "Payments & invoices", 2555, true, "7 years — statutory"],
  ["analytics_events", "Analytics events", 400, false, ""],
  ["exports", "Export files", 2, false, "48 hours"],
  ["login_attempts", "Admin login attempts", 365, false, ""],
];

export const CRON_JOBS = [
  ["listing_expiry", "Listing expiry check", "Daily 02:00 IST", "Two-month still-available prompt"],
  ["project_expiry", "Project expiry check", "Daily 02:10 IST", "One-year project validity"],
  ["auto_hide", "Auto-hide after no response", "Daily 03:00 IST", "15 days without a reply"],
  ["auto_delete_hidden", "Auto-delete hidden listings", "Daily 03:20 IST", "One month hidden"],
  ["requirement_expiry", "Requirement expiry + reminders", "Daily 02:20 IST", "30 days, reminders at 5d/1d"],
  ["plan_expiry", "Plan expiry + reminders", "Hourly", "Purchase timestamp + period, IST"],
  ["story_cleanup", "Story cleanup", "Hourly", "24h media expiry"],
  ["orphan_media", "Orphan media cleanup", "Daily 04:00 IST", "Uploads with no parent after 7 days"],
  ["notification_purge", "Notification purge", "Daily 04:20 IST", "90-day retention"],
  ["otp_purge", "OTP log purge", "Daily 04:30 IST", "30-day retention"],
  ["chat_archive", "Chat archive + purge", "Daily 04:40 IST", "30-day archive, 12-month purge"],
  ["reconcile", "Razorpay reconciliation", "Hourly", "Platform vs gateway match"],
  ["sitemap", "Sitemap regeneration", "Daily 05:00 IST", "Also on every approval"],
  ["weekly_digest", "Weekly digest", "Mon 09:00 IST", "Saved searches + activity"],
  ["backup", "Database backup", "Daily 01:00 IST", "Daily + monthly retention"],
  ["matching", "Requirement matching", "On approve/edit", "Reverse-match strip"],
  ["image_processing", "Image processing", "On upload", "Variants + compression"],
  ["trash_purge", "Trash purge", "Daily 05:20 IST", "30-day purge"],
];

export const BLOCKLIST = [
  ["chutiya", "latin", "block"], ["madarchod", "latin", "block"], ["bhenchod", "latin", "block"],
  ["randi", "latin", "block"], ["gandu", "latin", "block"], ["harami", "latin", "flag"],
  ["kutta", "latin", "flag"], ["saala", "latin", "flag"], ["bewakoof", "latin", "flag"],
  ["ચુતિયા", "gujarati", "block"], ["ગાંડુ", "gujarati", "block"], ["રંડી", "gujarati", "block"],
  ["હરામી", "gujarati", "flag"], ["બેવકૂફ", "gujarati", "flag"], ["કૂતરો", "gujarati", "flag"],
  ["मादरचोद", "devanagari", "block"], ["भेनचोद", "devanagari", "block"], ["रंडी", "devanagari", "block"],
  ["हरामी", "devanagari", "flag"], ["कुत्ता", "devanagari", "flag"],
  ["ch#tiya", "mixed", "block"], ["m@darchod", "mixed", "block"], ["b3nchod", "mixed", "block"],
  ["fraud", "latin", "flag"], ["scam", "latin", "flag"], ["black money", "latin", "flag"],
  ["cash only", "latin", "flag"], ["no registry", "latin", "flag"], ["benami", "latin", "flag"],
  ["hawala", "latin", "flag"], ["only muslim", "latin", "block"], ["only hindu", "latin", "block"],
  ["no muslims", "latin", "block"], ["no bachelors allowed", "latin", "flag"],
  ["caste", "latin", "flag"], ["ફ્રોડ", "gujarati", "flag"], ["કાળું નાણું", "gujarati", "flag"],
  ["whatsapp me", "latin", "flag"], ["call me on", "latin", "flag"], ["dm for price", "latin", "flag"],
];

export const NUMBER_PATTERNS = [
  ["Plain 10-digit", "\\b[6-9]\\d{9}\\b", "9825012345"],
  ["With +91", "\\+91[\\s-]?[6-9]\\d{9}", "+91 98250 12345"],
  ["Spaced groups", "\\b[6-9]\\d{4}[\\s-]\\d{5}\\b", "98250 12345"],
  ["Dotted", "\\b[6-9](\\d[.\\s]){9}", "9.8.2.5.0.1.2.3.4.5"],
  ["Word digits", "(?i)(zero|one|two|three|four|five|six|seven|eight|nine)([\\s-]?(zero|one|two|three|four|five|six|seven|eight|nine)){9}", "nine eight two five zero one two three four five"],
  ["Gujarati digits", "[૦-૯]{10}", "૯૮૨૫૦૧૨૩૪૫"],
  ["Devanagari digits", "[०-९]{10}", "९८२५०१२३४५"],
  ["Leetspeak", "\\b[6-9](\\d|[oOlIzZ]){9}\\b", "98z50lz345"],
  ["WhatsApp link", "(?i)(wa\\.me|api\\.whatsapp\\.com)/\\+?\\d{10,}", "wa.me/919825012345"],
  ["Email fallback", "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}", "seller@example.com"],
];

export const METRIC_DEFS = [
  ["view", "Listing view", "One unique viewer per listing per day. Repeat opens by the same device on the same day count once."],
  ["lead", "Lead", "A buyer who started a chat, sent an inquiry, was allowed a number, or scheduled a visit on your listing."],
  ["inquiry", "Inquiry", "A buyer's request to chat about a listing, before the poster accepts."],
  ["signup", "Signup", "A phone number that completed OTP and chose a role."],
  ["revenue", "Revenue", "Sum of captured payments, net of refunds, excluding GST."],
  ["active_listing", "Active listing", "A listing in the live state and not hidden, sold or expired."],
  ["story_impression", "Story impression", "One story frame shown for at least one second. Never shown to users."],
  ["conversion", "Plan conversion", "Signups that bought any plan within 30 days of joining."],
];

export const ANALYTICS_EVENTS = [
  "signup_completed", "plan_purchased", "listing_created", "listing_approved",
  "inquiry_sent", "chat_started", "number_allowed", "visit_scheduled",
  "boost_purchased", "requirement_posted",
];

export const TEMPLATES = [
  ["otp_login", "sms", "Login OTP", null, "{{otp}} is your HomzList login code. Valid 10 minutes. Do not share.", ["otp"], "DLT-1101234567890"],
  ["listing_approved", "sms", "Listing approved", null, "Your HomzList listing {{title}} is now live. View: {{link}}", ["title", "link"], "DLT-1101234567891"],
  ["listing_rejected", "sms", "Listing rejected", null, "Your listing {{title}} was not approved. Reason: {{reason}}", ["title", "reason"], "DLT-1101234567892"],
  ["plan_expiring", "sms", "Plan expiring", null, "Your HomzList {{plan}} expires on {{date}}. Renew: {{link}}", ["plan", "date", "link"], "DLT-1101234567893"],
  ["payment_success", "sms", "Payment received", null, "Payment of Rs {{amount}} received. Invoice {{invoice}}.", ["amount", "invoice"], "DLT-1101234567894"],
  ["welcome", "email", "Welcome to HomzList", "Welcome to HomzList, {{name}}", "Hi {{name}},\n\nYour HomzList account is ready. Post your first property in under two minutes.\n\n— Team HomzList", ["name"], null],
  ["listing_approved_email", "email", "Listing approved", "{{title}} is live on HomzList", "Hi {{name}},\n\n{{title}} is now live and visible to buyers in {{area}}.\n\nView it: {{link}}", ["name", "title", "area", "link"], null],
  ["listing_changes", "email", "Changes requested", "Changes needed on {{title}}", "Hi {{name}},\n\nWe need a few changes before {{title}} can go live:\n\n{{notes}}\n\nEdit it here: {{link}}", ["name", "title", "notes", "link"], null],
  ["invoice", "email", "Invoice", "Your HomzList invoice {{invoice}}", "Hi {{name}},\n\nAttached is invoice {{invoice}} for {{amount}} paid on {{date}}.", ["name", "invoice", "amount", "date"], null],
  ["refund", "email", "Refund processed", "Refund of {{amount}} processed", "Hi {{name}},\n\nWe have refunded {{amount}} for {{item}}. It reaches your bank in 5–7 working days.", ["name", "amount", "item"], null],
  ["plan_expired_email", "email", "Plan expired", "Your {{plan}} has expired", "Hi {{name}},\n\nYour {{plan}} expired on {{date}}. Your live listings stay up; new posts need an active plan.", ["name", "plan", "date"], null],
  ["weekly_digest", "email", "Weekly digest", "Your week on HomzList", "Hi {{name}},\n\n{{views}} views, {{leads}} leads and {{matches}} new matches this week.", ["name", "views", "leads", "matches"], null],
  ["grievance_ack", "email", "Grievance acknowledged", "We received your grievance {{ticket}}", "Hi {{name}},\n\nWe have received your grievance and registered it as {{ticket}}. Our Grievance Officer will respond within 15 days.", ["name", "ticket"], null],
  ["suspension", "email", "Account suspended", "Your HomzList account is suspended", "Hi {{name}},\n\nYour account was suspended on {{date}}. Reason: {{reason}}. It lifts on {{until}}.", ["name", "date", "reason", "until"], null],
  ["verification_approved", "whatsapp", "Verification approved", null, "Your HomzList {{level}} verification is approved. The badge is now on your profile.", ["level"], "homzlist_verification_approved"],
  ["inquiry_received", "whatsapp", "New inquiry", null, "{{buyer}} is interested in {{title}}. Open HomzList to reply.", ["buyer", "title"], "homzlist_inquiry_received"],
  ["visit_reminder", "whatsapp", "Visit reminder", null, "Reminder: property visit for {{title}} at {{time}} today.", ["title", "time"], "homzlist_visit_reminder"],
  ["boost_expiring", "whatsapp", "Boost expiring", null, "Your boost on {{title}} ends in {{days}} days. Renew in one tap.", ["title", "days"], "homzlist_boost_expiring"],
  ["proposal_received", "whatsapp", "New proposal", null, "You received a proposal for your requirement in {{area}}.", ["area"], "homzlist_proposal_received"],
  ["new_message", "push", "New message", "{{name}}", "{{preview}}", ["name", "preview"], null],
  ["inquiry_push", "push", "New inquiry", "New inquiry", "{{buyer}} is interested in {{title}}", ["buyer", "title"], null],
  ["number_requested", "push", "Number requested", "Number requested", "{{buyer}} asked for your number", ["buyer"], null],
  ["number_allowed", "push", "Number shared", "Number shared", "{{name}} shared their number with you", ["name"], null],
  ["listing_live", "push", "Listing live", "Your listing is live", "{{title}} is now visible to buyers", ["title"], null],
  ["price_drop", "push", "Price drop", "Price dropped", "{{title}} is now {{price}}", ["title", "price"], null],
  ["saved_match", "push", "Saved search match", "New match", "{{count}} new properties match {{search}}", ["count", "search"], null],
  ["boost_approved", "push", "Boost live", "Boost is live", "{{title}} is boosted for {{days}} days", ["title", "days"], null],
  ["requirement_expiring", "push", "Requirement expiring", "Requirement expiring", "Your requirement in {{area}} expires in {{days}} days", ["area", "days"], null],
];

export const BRANDING = [
  ["app_name", "HomzList"],
  ["tagline", "Property, the Instagram way"],
  ["primary_color", "#0F9D58"],
  ["primary_color_dark", "#1DB868"],
  ["logo_url", "/icons/logo.svg"],
  ["favicon_url", "/icons/favicon.ico"],
  ["og_image_url", "/og/default.png"],
  ["support_email", "help@homzlist.com"],
  ["grievance_officer", "Priya Shah"],
  ["grievance_email", "grievance@homzlist.com"],
];
