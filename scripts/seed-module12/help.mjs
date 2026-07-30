/**
 * Help centre content — designs/P12 S1.
 *
 * One row per article. `answer` is the paragraph the category accordion shows;
 * `body` is the long-form the article reader renders. The design's per-card
 * counts (6 / 8 / 10 / 6 / 7 / 5 / 4 / 6) are a live count of these rows, so the
 * numbers on screen are true by construction.
 *
 * The Plans & Pricing eight and the six Popular articles are the design's exact
 * titles and copy; the article reader's long-form for "How does the ₹999 plan
 * work?" is verbatim from P12 s-help-art.
 */

export const CATEGORIES = [
  { slug: "getting-started", title: "Getting Started", icon: "rocket", sort_order: 1, search_terms: "getting started basics first signup" },
  { slug: "plans-pricing", title: "Plans & Pricing", icon: "refund", sort_order: 2, search_terms: "plans pricing 999 plan subscription cost" },
  { slug: "posting-listings", title: "Posting Listings", icon: "building", sort_order: 3, search_terms: "posting listings photos post property sell" },
  { slug: "requirements", title: "Requirements", icon: "search", sort_order: 4, search_terms: "requirements slot buyer looking" },
  { slug: "chat-inquiries", title: "Chat & Inquiries", icon: "message", sort_order: 5, search_terms: "chat inquiries numbers messages contact" },
  { slug: "payments-invoices", title: "Payments & Invoices", icon: "card", sort_order: 6, search_terms: "payments invoices refund receipt upi" },
  { slug: "verification", title: "Verification", icon: "verified", sort_order: 7, search_terms: "verification verified badge kyc" },
  { slug: "account-privacy", title: "Account & Privacy", icon: "shield", sort_order: 8, search_terms: "account privacy delete data password" },
];

const A = (slug, question, answer, body, extra = {}) => ({ slug, question, answer, body, ...extra });

export const ARTICLES = {
  // ------------------------------------------------------------- 6 articles
  "getting-started": [
    A(
      "what-is-homzlist",
      "What is HomzList?",
      "HomzList is a photo-first property platform for Rajkot. Owners, brokers and builders post real properties; buyers browse and reach them through chat — without numbers being shared publicly.",
      `HomzList is a listing and discovery platform for property in and around Rajkot. You browse a photo-first feed, save what you like, and message the poster in-app.

## What you can do without paying
- Browse the whole feed, search, and open any listing
- Save listings and create private collections
- Send an inquiry to a poster

## What needs a plan
Posting a property, posting a requirement, and sending proposals need the ₹999 plan. Browsing never does.

> info: HomzList is an intermediary. We don't own, inspect or guarantee any property — do your own due diligence before paying anything.`,
      { search_terms: "what is homzlist about platform intro" },
    ),
    A(
      "create-an-account",
      "How do I create an account?",
      "Enter your mobile number, confirm the OTP, then pick your role and city. That's the whole signup — there's no password to remember.",
      `## Steps
1. Open HomzList and tap **Log in**.
2. Enter your 10-digit mobile number.
3. Enter the 6-digit OTP we send you.
4. Choose your role — Owner, Broker or Builder — and your city.

Your number is your account. There is no password, so keep your SIM active.

> warn: One account per mobile number. Accounts can't be transferred to another number later.`,
      { search_terms: "signup register otp login account create" },
    ),
    A(
      "choose-a-role",
      "Which role should I choose?",
      "Owner if you're listing your own property, Broker if you list on behalf of others, Builder if you're posting projects. The role changes what you can post.",
      `## Owner
You own the property you're listing. You get 1 lifetime listing on the ₹999 plan.

## Broker
You list on behalf of owners. You can hold multiple listings and use the leads pipeline.

## Builder
You post **projects**, not standalone listings, and your requirements are always attached to a project.

> info: Changing role later needs a request from your profile — it isn't a free switch, because your existing content depends on it.`,
      { search_terms: "role owner broker builder which choose" },
    ),
    A(
      "is-browsing-free",
      "Is browsing free?",
      "Yes. Browsing, searching, saving and sending an inquiry are free. You only pay when you want to post a property or a requirement.",
      `Everything on the buyer side is free:

- The feed, search and area pages
- Opening any listing and seeing all its photos
- Saving listings into collections
- Sending an inquiry to a poster

Paying is only for posting: the ₹999 plan covers 1 lifetime listing, 1 requirement for 30 days, and 10 proposals.`,
      { search_terms: "free browsing cost buyer charge" },
    ),
    A(
      "install-the-app",
      "How do I install HomzList on my phone?",
      "HomzList is a PWA — open it in your browser and choose 'Add to Home screen'. It then behaves like an app, including notifications.",
      `## Android (Chrome)
Open homzlist.com → menu (⋮) → **Add to Home screen**.

## iPhone (Safari)
Open homzlist.com → Share → **Add to Home Screen**.

Once installed you get an app icon, full-screen layout and push notifications for inquiries and approvals.`,
      { search_terms: "install app pwa home screen android iphone download" },
    ),
    A(
      "which-cities",
      "Which cities does HomzList cover?",
      "We're live in Rajkot and the areas around it. You can register interest for another city and we'll tell you when it opens.",
      `HomzList launched in **Rajkot** and covers its areas — Mavdi, University Road, Kalawad Road, 150 Feet Ring Road and the rest.

If you search a city we haven't launched yet, you'll see a "coming soon" screen where you can register interest. We use those counts to decide the next city.`,
      { search_terms: "city cities rajkot coverage launch area" },
    ),
  ],

  // ---- 8 articles — the design's exact accordion copy (P12 s-help-cat) -----
  "plans-pricing": [
    A(
      "how-does-the-999-plan-work",
      "How does the ₹999 plan work?",
      "Pay ₹999 once and you get 1 lifetime listing, 1 requirement live for 30 days, and 10 proposals. Your listing never expires — we just check every 2 months that it's still available.",
      `The ₹999 plan is HomzList's single owner plan. You pay once — there's no subscription, no renewal, and no hidden charges.

**What's included:**
- **1 lifetime listing** — post one property that stays live until it's sold or you remove it
- **1 requirement for 30 days** — tell owners what you're looking for
- **10 proposals** — send your listing to matching requirements

> info: Your listing never expires — but we check every 2 months if it's still available.

> warn: Turning off or deleting a requirement still uses its slot.

Once your payment succeeds the plan activates instantly. You can post your listing right away — it goes live after a quick review, usually within a few hours.`,
      { is_popular: true, sort_order: 1, read_minutes: 2, search_terms: "999 plan work pricing" },
    ),
    A(
      "after-i-pay",
      "What happens right after I pay?",
      "Your plan activates instantly. If payment succeeds but the plan doesn't activate within 10 minutes, we activate it or refund you automatically.",
      `The moment Razorpay confirms your payment, the plan is written to your account and the post button unlocks.

## If it doesn't activate
Our reconciliation job checks every payment against its plan. If money was taken and no plan appeared, we either activate it or refund you automatically — you don't need to raise a ticket, though you can if you'd like an update.

> info: You'll always find the payment under Payments, with its GST invoice, even if activation is still catching up.`,
      { search_terms: "after payment activate instant plan unlock" },
    ),
    A(
      "pause-or-transfer",
      "Can I pause or transfer my plan?",
      "No. Plans can't be paused, transferred to another account, or moved to another property once used.",
      `A plan belongs to the account that bought it and to the property it was used on.

- **No pausing.** A lifetime listing has no clock to pause.
- **No transferring** to another mobile number or person.
- **No moving** a used listing slot to a different property. Removing the listing does not return the slot.

> warn: This is why the preview step exists before payment — check the property details there.`,
      { search_terms: "pause transfer move plan another account" },
    ),
    A(
      "how-do-refunds-work",
      "How do refunds work?",
      "There are no refunds after purchase, except technical failures (payment deducted but plan not activated) and boosts rejected by our team — those are refunded in full within 5–7 working days.",
      `HomzList sells prepaid digital services, so the general rule is **no refunds after purchase**.

## The two exceptions
1. **Technical failure** — money was debited and the plan or credit was never activated.
2. **A boost our team rejected** — refunded in full.

## Timeline
Approved refunds are processed to the original payment method within **5–7 working days**; your bank may take a few days more.

Raise it from [Contact support](/support/new) with your Payment ID, or read the full [Refund Policy](/legal/refund).`,
      { is_popular: true, sort_order: 5, search_terms: "refunds work money back" },
    ),
    A(
      "what-is-a-boost",
      "What is a boost?",
      "A boost promotes your listing at the top of its area for a fixed number of days. Boost days aren't refunded if you sell or remove the listing early.",
      `A boost puts your listing above the normal feed order inside a chosen scope for a chosen number of days.

## Scopes
- **Area** — the areas your property sits in
- **City** — everyone browsing your city
- **Category** — everyone browsing your property type

## What a boost is not
It does not promise a number of views, inquiries or a sale. We don't publish reach numbers because we won't guarantee them.

> warn: If you mark the listing sold or remove it mid-boost, the remaining days are not refunded — but you can reclaim unused days to a later boost.`,
      { search_terms: "boost promote top area days" },
    ),
    A(
      "do-listings-expire",
      "Do listings expire?",
      "No. Listings on the ₹999 plan are lifetime. Every 2 months we ask you to confirm the property is still available.",
      `Your listing stays live until you sell it, mark it unavailable, or remove it.

## The 2-month check
Every 2 months we send a "still available?" notification. Confirm it and nothing changes. Ignore it for too long and the listing is hidden until you confirm — this is what keeps the feed free of properties that sold months ago.`,
      { search_terms: "expire listing lifetime still available 2 months" },
    ),
    A(
      "requirement-slot-includes",
      "What does the requirement slot include?",
      "One requirement live for 30 days with up to 10 proposals from owners. Turning off or deleting a requirement still uses its slot.",
      `The requirement slot in the ₹999 plan gives you:

- **1 requirement**, live for **30 days**
- Up to **10 proposals** from posters whose property matches

## Slot accounting
The slot is consumed when the requirement goes live. Pausing, turning it off, or deleting it does not give the slot back — the copy on the form says so before you submit.`,
      { search_terms: "requirement slot include 30 days proposals" },
    ),
    A(
      "get-an-invoice",
      "How do I get an invoice?",
      "Every payment generates a GST invoice automatically. Find it under Payments → Details → Download invoice.",
      `Invoices are generated the moment a payment succeeds — you never have to request one.

## Where to find it
Profile → **Payments** → tap the payment → **Download invoice**.

The invoice carries our GSTIN, the HSN/SAC code for digital services, and the tax split. If a detail on it is wrong, [contact support](/support/new) with the payment ID and we'll issue a corrected invoice.`,
      { search_terms: "invoice gst bill receipt download tax" },
    ),
  ],

  // ------------------------------------------------------------ 10 articles
  "posting-listings": [
    A(
      "why-is-my-listing-under-review",
      "Why is my listing under review?",
      "Every new listing is checked by our team before it goes live — usually within a few hours. We're looking for real photos, a real price, and no contact numbers hidden in the images.",
      `Review is what keeps the feed clean. Every listing — from every account — goes through it.

## What we check
- The photos are of the actual property, not stock or brochure images
- The price and size are plausible and match the description
- No phone numbers, WhatsApp links or emails inside photos or text
- You have the right to list the property

## How long
Usually a few hours, and always within 24. You'll get a notification either way.

## If changes are requested
You'll see exactly what to fix and can resubmit without paying again.

> warn: Three rejections locks the listing and you'll need to contact support to unlock it.`,
      { is_popular: true, sort_order: 2, read_minutes: 3, search_terms: "listing under review approval pending" },
    ),
    A(
      "how-to-post-a-property",
      "How do I post a property?",
      "Tap the + button, choose sell or rent and the property type, fill the form, add photos, preview, and submit. You need an active plan before the form opens.",
      `## The flow
1. **+** → **Sell** or **Rent** → property type
2. The form — location, price, size, and the fields for that type
3. Photos — at least 3, up to 20
4. Preview — exactly what buyers will see
5. Submit for review

Your progress is saved as a draft at every step, so you can leave and come back.`,
      { search_terms: "post property create listing how add" },
    ),
    A(
      "how-many-photos",
      "How many photos should I add?",
      "At least 3 are required and 20 is the maximum. Listings with 8 or more photos get noticeably more inquiries.",
      `## The rules
- Minimum **3**, maximum **20**
- JPG, PNG or WebP, up to 10 MB each
- The first photo is your cover — pick the best exterior or living-room shot

## What works
Wide shots, daylight, every room, and the building entrance. Buyers scroll past listings that show one blurry hall.

> warn: Photos with a phone number written on them are rejected.`,
      { search_terms: "photos how many images upload minimum" },
    ),
    A(
      "edit-a-live-listing",
      "Can I edit a listing after it's live?",
      "Yes. Price, description and photos can be edited any time. Big changes send the listing back for a quick re-review.",
      `Small edits — description wording, adding a photo — apply immediately.

Edits to **price, size, location or property type** put the listing back into review, because those are the fields buyers rely on. It stays live while we re-check it.

Every price change is recorded, and buyers who saved your listing get a price-drop notification when it falls.`,
      { search_terms: "edit change listing price after live update" },
    ),
    A(
      "mark-as-sold",
      "How do I mark a property as sold or rented?",
      "Open the listing from My listings → ⋯ → Mark as sold. It moves to Archived and stops appearing in the feed.",
      `Marking it sold is the honest thing to do and takes two taps: **My listings** → the listing → **⋯** → **Mark as sold** (or rented).

## What happens
- It leaves the feed and search immediately
- It moves to **Archived**, where you can still see its stats
- Open chats stay readable but no new inquiries can start

> warn: Your listing slot is not returned — the ₹999 plan is one listing, not one at a time.`,
      { search_terms: "sold rented mark archive remove finished" },
    ),
    A(
      "rejected-listing",
      "My listing was rejected — what now?",
      "The rejection notification says exactly why. Fix that and resubmit; you don't pay again. After three rejections the listing is locked and support has to unlock it.",
      `## Read the reason
Every rejection carries a specific reason — stock photos, hidden contact number, unrealistic price, or a property you're not authorised to list.

## Fix and resubmit
Edit the listing and submit again. There's no extra charge and no new slot used.

## Three strikes
Three rejections on the same listing locks it. [Contact support](/support/new) and we'll review it manually.`,
      { search_terms: "rejected listing declined fix resubmit locked" },
    ),
    A(
      "listing-not-showing",
      "Why isn't my listing showing in search?",
      "Check that it's Live (not draft, pending or hidden), and that the area and property type you picked match what you're searching for.",
      `Work down this list:

1. **My listings** — is the status **Live**? Draft and Pending never appear.
2. Did you answer the 2-month "still available?" check? Ignoring it hides the listing.
3. Are you searching the same **area** and **type** you posted under?
4. Are your own listings filtered out? You won't see yourself in some views.

If it's Live and still missing after an hour, [contact support](/support/new) with the listing link.`,
      { search_terms: "not showing search missing invisible feed" },
    ),
    A(
      "drafts",
      "Where are my drafts?",
      "Everything you started but didn't submit is under Profile → Drafts. Drafts are kept for 30 days.",
      `Any listing you leave half-finished is saved automatically — you never lose the form.

Find them at **Profile → Drafts**. Open one and it resumes at the step you left. Drafts older than 30 days are cleared, and a draft doesn't hold your listing slot until you submit it.`,
      { search_terms: "draft saved unfinished resume incomplete" },
    ),
    A(
      "price-guidance",
      "How should I price my property?",
      "Compare the per-sq-ft rate of at least three similar listings in the same area, then decide how much negotiation room to leave in.",
      `Buyers on HomzList compare listings side by side, so an inflated price mostly costs you inquiries.

- Search your own area and property type and look at per-sq-ft rates
- Quoted prices in Rajkot usually carry 3–7% negotiation room
- Mark **Negotiable** if you have room — it gets more first messages than a hard number
- Use **Price on request** only for genuinely premium properties; it reduces inquiries

You can change the price any time, and buyers who saved the listing hear about a drop.`,
      { search_terms: "price pricing rate per sqft negotiable how much" },
    ),
    A(
      "ownership-proof",
      "Do I need to upload ownership proof?",
      "Only for the verified badge, and it's optional. The document is stored privately and is never shown on your listing.",
      `Posting a listing does not require a document. Getting the **verified** badge does.

## What we accept
Index-2, a registered sale deed, a property tax receipt, or a builder allotment letter.

## Where it goes
Into private storage. Our reviewers see it; buyers never do, and it's deleted per the retention schedule once your verification is no longer active.

> info: The badge verifies **you**, not the property's title or legality.`,
      { search_terms: "ownership proof document upload index 2 deed" },
    ),
  ],

  // ------------------------------------------------------------- 6 articles
  requirements: [
    A(
      "why-cant-i-see-requirement-details",
      "Why can't I see requirement details?",
      "Full requirement details — budget, exact areas and the buyer's notes — need an active plan. Without one you see the summary only.",
      `Requirements are what buyers are looking for. The summary is open to everyone; the detail behind it is gated.

## Without a plan
You see the type, BHK and a broad area — enough to know whether it's worth unlocking.

## With an active plan
You see the full budget range, all the areas, the urgency and the buyer's notes, and you can send a proposal.

> info: This gate exists so buyers don't get cold-called by everyone who scrolls past.`,
      { is_popular: true, sort_order: 4, read_minutes: 2, search_terms: "requirement details locked see" },
    ),
    A(
      "post-a-requirement",
      "How do I post a requirement?",
      "Requirements → New requirement. Set type, BHK, budget and areas. It goes live for 30 days and can collect up to 10 proposals.",
      `## The form
Type, BHK, budget range, areas, urgency, and a short note about what matters to you.

## What happens next
It goes live after review and stays live for **30 days**. Posters whose property matches can send you a proposal — up to 10.

> warn: The slot is used the moment it goes live. Deleting or pausing the requirement does not give it back.`,
      { search_terms: "post requirement new create looking for" },
    ),
    A(
      "what-is-a-proposal",
      "What is a proposal?",
      "A proposal is a poster sending you a specific property against your requirement. You accept it to open a chat, or mark it not relevant.",
      `When your requirement matches someone's listing, they can send it to you as a **proposal**.

## Your options
- **Accept** — opens a chat with that poster
- **Not relevant** — removes it and tells the sender nothing personal
- Ignore it — it expires on its own

Accepting is the only action that lets the other side message you.`,
      { search_terms: "proposal what is accept decline" },
    ),
    A(
      "requirement-expired",
      "My requirement expired — can I repost it?",
      "Yes, but it uses a slot. Your ₹999 plan includes one; posting another requirement needs a new plan or a top-up.",
      `A requirement runs 30 days and then expires. The proposals you already received stay readable.

Reposting creates a **new** requirement and consumes a slot. If your plan's slot is used, you'll be asked to top up before the form opens.`,
      { search_terms: "expired requirement repost renew again 30 days" },
    ),
    A(
      "builder-requirements",
      "Why does my requirement need a project? (Builders)",
      "Builders post requirements against a live project. It's how buyers know which project the requirement belongs to.",
      `A builder account posts **projects**, and a requirement is always attached to one of them.

## What this means
- You need at least one **live** project before the requirement form opens
- The requirement shows the project it belongs to
- Proposals you send are on behalf of that project

If you have no live project yet, finish and publish the project first.`,
      { search_terms: "builder requirement project needed live" },
    ),
    A(
      "too-many-proposals",
      "I'm getting proposals that don't match. What can I do?",
      "Tighten the budget and areas on your requirement, and mark the bad ones 'Not relevant' — that signal narrows what you're shown.",
      `Two things help:

1. **Edit the requirement.** A wide budget or five areas will match almost everything. Narrow both.
2. **Mark mismatches "Not relevant."** It removes them from your list and feeds back into matching.

If a poster is spamming unrelated properties, report them — repeat offenders lose proposal access.`,
      { search_terms: "irrelevant proposals spam matching wrong" },
    ),
  ],

  // ------------------------------------------------------------- 7 articles
  "chat-inquiries": [
    A(
      "how-do-i-get-my-number-shared",
      "How do I get my number shared?",
      "Your number is never public. It's shared with one person only after you accept their inquiry, or when they allow your request in chat.",
      `HomzList runs a controlled contact system. Nobody sees your number by browsing.

## As a poster
When someone inquires, you get the request first. **Accepting** opens the chat and shares your number with that one person.

## As a buyer
Inside a chat you can **request** the poster's number. They allow or deny it. If they allow, it appears as a card in the chat you can call or copy.

> warn: Once you've shared your number, we can't control how the other person uses it. Report anyone who misuses it.`,
      { is_popular: true, sort_order: 3, read_minutes: 2, search_terms: "number shared phone contact" },
    ),
    A(
      "someone-messaged-me",
      "Someone messaged me — what happens next?",
      "New inquiries land in Requests. Accept to start chatting, or decline. Declining doesn't tell them anything personal.",
      `Every first message from a stranger goes to **Requests**, not straight into your inbox.

- **Accept** — the chat opens and your number is shared with them
- **Decline** — the chat closes; they can't message again until a cooldown passes

Nothing about you is revealed while a request is pending.`,
      { search_terms: "inquiry request accept decline message received" },
    ),
    A(
      "block-a-user",
      "How do I block someone?",
      "Open the chat → ⋯ → Block. They can't message you again, and you can unblock from Settings → Blocked users.",
      `Blocking is immediate and silent — the other person isn't told.

## What blocking does
- Stops all new messages from them
- Hides your listings from them
- Moves the existing chat out of your inbox

Manage the list at **Settings → Blocked users**. If someone is harassing you, block **and** report — reports are what get accounts suspended.`,
      { search_terms: "block unblock harass stop messages" },
    ),
    A(
      "report-a-user",
      "How do I report a user or listing?",
      "Use Report on the listing, profile or message. For a formal complaint, raise it with the Grievance Officer.",
      `Tap **⋯ → Report** anywhere you see it, pick a reason, and add detail.

## What happens
Our team reviews it. Depending on what we find: the content is edited or removed, the account is warned, restricted or suspended.

For a formal legal complaint use the [Grievance Officer](/legal/grievance) — acknowledged within 24 hours with a ticket number, resolved within 15 days.`,
      { search_terms: "report abuse fake spam complaint grievance" },
    ),
    A(
      "archived-chats",
      "Where did my chat go?",
      "Chats you archive move to Messages → Archived. Nothing is deleted, and a new message brings it back to the inbox.",
      `Archiving is a tidy-up, not a delete.

Find them under **Messages → Archived**. If that person messages again, the chat returns to your inbox automatically with the full history intact.`,
      { search_terms: "archived chat missing where gone messages" },
    ),
    A(
      "no-replies",
      "Nobody is replying to my inquiries. Why?",
      "Posters see a request before the chat opens. A short, specific first message about that property gets accepted far more often.",
      `A one-word "price?" is the most-declined message on the platform.

## What gets accepted
- Say which property you mean and what you actually want to know
- Mention when you could visit
- Ask one clear question

Also check the listing's response label — some posters simply reply slowly, and the label tells you before you write.`,
      { search_terms: "no reply ignored inquiry response poster" },
    ),
    A(
      "visits",
      "How do visits work?",
      "Propose a date and time inside the chat. When the other side confirms, it becomes a scheduled visit both of you can see.",
      `Inside an accepted chat, use **Propose a visit**: pick a date and a time slot.

The other person confirms, reschedules or cancels. Confirmed visits appear under **Visits** for both sides, and after the date passes you're asked how it went — that outcome feeds the broker's lead pipeline.

> warn: Visit a property in daylight, and never hand over a token at the visit without documentation.`,
      { search_terms: "visit schedule site tour appointment date" },
    ),
  ],

  // ------------------------------------------------------------- 5 articles
  "payments-invoices": [
    A(
      "payment-methods",
      "What payment methods can I use?",
      "UPI, debit and credit cards, net banking and wallets — everything Razorpay supports. We never see or store your card details.",
      `Payments run through **Razorpay**. On the checkout screen you can pay with:

- UPI (GPay, PhonePe, Paytm, any app)
- Debit and credit cards
- Net banking
- Wallets

Card details are entered on the gateway, not on HomzList. We store the payment ID and status — nothing else.`,
      { search_terms: "payment methods upi card netbanking wallet razorpay" },
    ),
    A(
      "payment-failed",
      "My payment failed but money was deducted",
      "Failed payments are auto-reversed by your bank, usually within 5–7 working days. If the plan didn't activate but the money left, we refund or activate automatically.",
      `## If the payment shows Failed
Your bank reverses it on its own, typically in 5–7 working days. We never received it.

## If money left and no plan appeared
Our reconciliation job catches this. We either activate the plan or refund you — automatically.

Want it looked at sooner? [Contact support](/support/new), choose **Payment or refund**, and include the Payment ID.`,
      { search_terms: "payment failed deducted money debited stuck" },
    ),
    A(
      "find-payment-history",
      "Where is my payment history?",
      "Profile → Payments lists every payment with its status, and each one opens to the GST invoice.",
      `**Profile → Payments** shows every transaction: date, what it bought, amount, and status.

Tap any row for the detail sheet — payment method, order ID, gateway reference — and **Download invoice** for the GST invoice.`,
      { search_terms: "payment history transactions past payments list" },
    ),
    A(
      "gst-invoice-details",
      "Can I get an invoice with my company's GST number?",
      "Yes — add your business name and GSTIN in profile before you pay. Invoices already issued can be corrected by support.",
      `Add the details **before** purchasing: Profile → Edit profile → business name and GSTIN. Every invoice after that carries them.

Already paid? [Contact support](/support/new) with the payment ID and your GSTIN and we'll re-issue the invoice.`,
      { search_terms: "gst number company invoice business gstin b2b" },
    ),
    A(
      "coupons",
      "How do I use a coupon code?",
      "Enter it on the checkout screen before paying. The discount is applied and shown in the total before you confirm.",
      `On checkout, tap **Have a coupon?**, type the code and apply it. If it's valid you'll see the discount and the new total immediately.

Codes can be limited by role, by city, by first purchase, or by a total number of uses — the error tells you which rule stopped it.

> warn: A coupon can't be applied after payment. Check the total before confirming.`,
      { search_terms: "coupon code discount promo offer apply" },
    ),
  ],

  // ------------------------------------------------------------- 4 articles
  verification: [
    A(
      "how-do-i-get-a-verified-badge",
      "How do I get a verified badge?",
      "Profile → Get verified. Phone verification is automatic; ID and RERA need a document, and our team reviews it within 2 working days.",
      `There are three badges, and they're about **you** — not your property.

## Phone
Automatic when you sign up with OTP.

## ID
Upload Aadhaar, PAN, passport or driving licence. Reviewed within 2 working days.

## RERA
For brokers and builders: your RERA registration number plus the certificate. We check it against the Gujarat RERA register.

> warn: A badge never means the property, its title, or its legality has been verified. It says we checked a person's identity.`,
      { is_popular: true, sort_order: 6, read_minutes: 2, search_terms: "verified badge get verification" },
    ),
    A(
      "verification-rejected",
      "My verification was rejected",
      "The notification says why — usually an unreadable photo or a name that doesn't match your profile. Fix that and resubmit; there's no limit.",
      `## Common reasons
- The document photo is blurry, cropped or glare-covered
- The name on the document doesn't match your profile name
- The document has expired
- A RERA number that isn't active on the register

Fix the cause and submit again. There's no fee and no cap on attempts.`,
      { search_terms: "verification rejected failed declined document" },
    ),
    A(
      "what-badge-means",
      "What does the verified badge actually mean?",
      "It means we checked that person's phone, ID or RERA registration. It says nothing about the property, its title or its legality.",
      `This distinction matters legally and practically.

## What it means
A human at HomzList looked at a government ID or a RERA certificate and matched it to the account.

## What it does NOT mean
- The property exists as described
- The title is clear
- The price is fair
- The seller has the right to sell

> warn: Always do your own due diligence — title search, site visit and an advocate — regardless of any badge.`,
      { search_terms: "badge meaning verified property guarantee trust" },
    ),
    A(
      "how-long-verification",
      "How long does verification take?",
      "Phone is instant. ID and RERA are reviewed within 2 working days, and you get a notification either way.",
      `Phone verification completes at signup.

ID and RERA go into a review queue and are usually answered the next working day, always within two. You'll get a push and an in-app notification with the result, and the badge appears on your profile and every listing you post.`,
      { search_terms: "verification time how long days pending review" },
    ),
  ],

  // ------------------------------------------------------------- 6 articles
  "account-privacy": [
    A(
      "who-can-see-my-number",
      "Who can see my phone number?",
      "Nobody by default. It's shared with one specific person only when you accept their inquiry or allow their number request.",
      `Your number is not on your profile, not on your listings, and not in search.

It reaches exactly one other person at the moment you choose:
- You **accept** an inquiry, or
- You **allow** a number request inside a chat, or
- You **send a proposal** to someone's requirement

You can see who has it, and revoke nothing after the fact — so share deliberately. Read the [Privacy Policy](/legal/privacy) for the full picture.`,
      { search_terms: "who sees number phone privacy public visible" },
    ),
    A(
      "download-my-data",
      "How do I download my data?",
      "Settings → Download your data. You get your profile, listings, requirements, the messages you sent, and your payment history. The link works for 48 hours.",
      `Under DPDP you can take a copy of your data whenever you want.

## What's included
- Profile and account details
- Your listings and requirements
- Messages **you** sent
- Payment history and invoices

## What isn't
Messages other people sent you, and other users' contact details — that's their privacy, not yours.

Choose JSON or CSV, request it, and download from the same screen. The link expires after 48 hours; request it again any time.`,
      { search_terms: "download data export json csv dpdp copy" },
    ),
    A(
      "deactivate-vs-delete",
      "What's the difference between deactivating and deleting?",
      "Deactivating hides everything and is undone by logging in. Deleting is permanent after a 30-day grace period, and active plans are lost with no refund.",
      `## Deactivate
- Profile and listings hidden
- Chats paused
- Plans untouched
- Log in again and everything returns

## Delete
- Listings, requirements and chats removed
- **Active plans are lost — no refund**
- Anonymised payment records kept 7 years, as tax law requires
- **30 days** to change your mind by logging in

> warn: Deletion is blocked for 7 days after a payment, so a purchase can't be made and erased in the same breath.`,
      { search_terms: "deactivate delete difference account close remove" },
    ),
    A(
      "cancel-deletion",
      "I scheduled deletion by mistake — can I undo it?",
      "Yes. Log in any time within the 30-day grace period and choose Cancel deletion. Everything comes back.",
      `A scheduled deletion doesn't erase anything until the grace period ends.

Log in and you'll land on the grace screen with the exact purge date and a **Cancel deletion** button. Cancelling restores your profile, listings and chats as they were.

After the purge date the data is gone and we cannot restore it.`,
      { search_terms: "cancel deletion undo restore grace mistake" },
    ),
    A(
      "change-my-number",
      "Can I change my registered mobile number?",
      "Not from the app — the number is your identity. Raise a support ticket under 'Lost access to my number' and we'll verify ownership first.",
      `Because your number **is** your account, changing it is a manual, verified process.

[Contact support](/support/new) and choose **Lost access to my number**. Give us an alternate number or email; we'll ask you to prove ownership of the account — recent payments, listing details, or your ID document.

> warn: We will never move an account to a new number on an email request alone.`,
      { search_terms: "change number mobile lost sim new phone" },
    ),
    A(
      "notification-control",
      "How do I stop getting so many notifications?",
      "Settings → Notifications. Every category has its own switch for push and email, and marketing is off unless you turned it on.",
      `Go to **Settings → Notifications**. Categories are grouped, and each has separate push and email switches:

- Inquiries and chat
- Listing and requirement status
- Payments and plans
- Marketing and digests

Transactional notifications about your own money and listings can be reduced but not fully silenced — you need to know when a payment fails.`,
      { search_terms: "notifications too many stop mute push email" },
    ),
  ],
};
