/**
 * The Help centre: 8 categories, 6 search chips, 52 articles.
 *
 * The article counts are NOT stored — each tile counts its own live rows. They
 * are seeded to 6 / 8 / 10 / 6 / 7 / 5 / 4 / 6 because that is what P12 draws,
 * so the built screen and the design agree without anything being hardcoded.
 *
 * Every article carries three texts, and they do different jobs:
 *   `answer`   — the paragraph the CATEGORY accordion expands to. Short.
 *   `body_md`  — the full article the reader opens. Longer, with headings.
 *   `search`   — the hidden keyword blob help search also matches on, which is
 *                exactly what the design's data-search="…" attributes are.
 *
 * The Plans & Pricing set is transcribed verbatim from the design's accordion,
 * and "How does the ₹999 plan work?" from the design's article screen, so the
 * two screens the prototype actually renders are byte-identical to it.
 */

export const HELP_CATEGORIES = [
  { slug: "getting-started",   title: "Getting Started",       icon: "zap",     sort_order: 1, search_terms: "getting started basics first new signup" },
  { slug: "plans-pricing",     title: "Plans & Pricing",       icon: "rupee",   sort_order: 2, search_terms: "plans pricing 999 plan subscription cost boost" },
  { slug: "posting-listings",  title: "Posting Listings",      icon: "building",    sort_order: 3, search_terms: "posting listings photos post property sell rent" },
  { slug: "requirements",      title: "Requirements",          icon: "search",  sort_order: 4, search_terms: "requirements slot buyer looking proposal" },
  { slug: "chat-inquiries",    title: "Chat & Inquiries",      icon: "message", sort_order: 5, search_terms: "chat inquiries numbers messages contact call" },
  { slug: "payments-invoices", title: "Payments & Invoices",   icon: "card",    sort_order: 6, search_terms: "payments invoices refund receipt upi gst" },
  { slug: "verification",      title: "Verification",          icon: "verified",sort_order: 7, search_terms: "verification verified badge kyc rera id" },
  { slug: "account-privacy",   title: "Account & Privacy",     icon: "shield",  sort_order: 8, search_terms: "account privacy delete data password number deactivate" },
];

export const HELP_CHIPS = [
  { label: "Plans",          query: "plan",         sort_order: 1 },
  { label: "Listings",       query: "listing",      sort_order: 2 },
  { label: "Payments",       query: "payment",      sort_order: 3 },
  { label: "Chat & Numbers", query: "chat",         sort_order: 4 },
  { label: "Verification",   query: "verification", sort_order: 5 },
  { label: "Account",        query: "account",      sort_order: 6 },
];

const a = (category, slug, question, answer, body_md, opts = {}) => ({
  category,
  slug,
  question,
  answer,
  body_md,
  search: opts.search ?? "",
  popular: opts.popular ?? false,
  minutes: opts.minutes ?? 2,
  related: opts.related ?? [],
});

export const HELP_ARTICLES = [
  /* ═══════════════════════════════════ Getting Started — 6 articles ═══ */
  a("getting-started", "what-is-homzlist",
    "What is HomzList?",
    "HomzList is a Rajkot property platform where owners, brokers and builders post their own listings. You browse without logging in, and your phone number stays private until you choose to share it.",
    `HomzList is a listing and discovery platform for property in and around Rajkot. Owners, brokers and builders post their own properties; buyers and tenants browse them the way they browse anything else on a phone — photos first, price visible, no login wall in front of the feed.

## What we are not
We are not a broker. We do not own property, we do not take a cut of your sale, and we are not part of your negotiation. That also means we cannot vouch for a property — read the Disclaimer before you pay anyone a token.

## What you can do without an account
Browse the feed, search by area and budget, open any listing, and read the blog and legal pages. You need an account to save a property, send an inquiry, chat, or post anything.`,
    { search: "what is homzlist about platform rajkot", minutes: 2, related: ["create-an-account", "browse-without-account"] }),

  a("getting-started", "create-an-account",
    "How do I create an account?",
    "Enter your mobile number, type the 6-digit code we send, then pick your role — Owner, Broker or Builder — and add your name and city. It takes about a minute and there is no password to remember.",
    `## 1. Your number
Signup is by mobile number and OTP. There is no password — the number is the account, which is also why you should keep it active.

## 2. The code
We send a 6-digit code. It is valid for 5 minutes, and you can ask for a new one after 30 seconds. Three wrong codes and the number pauses for a short while.

## 3. Your role
Pick the one that is actually true: **Owner** if you are selling or renting your own property, **Broker** if you deal on behalf of others, **Builder** if you are launching projects. The role decides what your account can do, and changing it later needs a support ticket.

## 4. Name and city
Both are required before you can inquire or chat with anyone. It is the minimum the person on the other side needs to decide whether to reply.`,
    { search: "signup register otp create account role", minutes: 2, related: ["what-is-homzlist", "change-my-role"] }),

  a("getting-started", "browse-without-account",
    "Can I browse without an account?",
    "Yes. The feed, search, listing pages, area pages and the blog are all open to guests. You only need to log in to save, inquire, chat or post.",
    `Everything a person needs in order to decide whether HomzList is worth signing up for is open: the feed, search and filters, every listing page, the area pages, the blog, and all the legal pages.

You are asked to log in at exactly four points — saving a property, sending an inquiry, opening a chat, and posting anything of your own. At each one, we bring you back to what you were doing once you are in.`,
    { search: "guest browse without login signup wall", minutes: 1, related: ["what-is-homzlist"] }),

  a("getting-started", "install-the-app",
    "How do I install HomzList on my phone?",
    "HomzList is a web app you can add to your home screen. On Android, tap the install prompt or Chrome's menu → Add to Home screen. On iPhone, use Safari's Share button → Add to Home Screen.",
    `HomzList is a progressive web app. There is no download from a store, and it takes a few megabytes rather than a few hundred.

## Android
A small "Install HomzList" card appears at the bottom of the feed on your second or third visit. If you dismissed it, open Chrome's ⋮ menu and choose **Add to Home screen**.

## iPhone and iPad
Open homzlist.com in **Safari**, tap the Share button, and choose **Add to Home Screen**. Other browsers on iOS cannot install web apps.

## What you get
It opens full-screen without the browser bar, keeps you signed in, and shows recently viewed listings even when you are offline.`,
    { search: "install app pwa home screen android ios offline", minutes: 2, related: ["browse-without-account"] }),

  a("getting-started", "find-property-fast",
    "What's the fastest way to find a property?",
    "Search by area first, then narrow by budget and BHK. Save the search and we will tell you when something new matches it, instead of you checking every day.",
    `## Start with the area, not the price
Rajkot's price bands move street by street. Searching "2 BHK under ₹50 Lakh" across the whole city returns a list you cannot act on; searching Mavdi first and then setting the budget returns a list you can visit on a Sunday.

## Then narrow
Budget, BHK, and Ready / Under-construction cover most of what actually changes a decision. Everything else — floor, facing, furnishing — is faster to judge from the photos.

## Save the search
A saved search watches for new matches and notifies you. It is the single biggest time-saver on the platform, and it costs nothing.

## Post a requirement instead
If nothing matches, post a requirement. Owners with matching property send proposals to you, which reverses the work.`,
    { search: "search find property fast filters saved search area budget", minutes: 3, related: ["what-is-a-requirement", "saved-searches-alerts"] }),

  a("getting-started", "saved-searches-alerts",
    "How do saved searches and alerts work?",
    "Run a search, tap Save, and give it a name. When a new listing matches those filters we send you a notification. Manage or delete them from Your activity → Saved searches.",
    `A saved search stores the filters, not the results. When a listing is approved and it matches those filters, you get a notification with the listing in it.

## Turning alerts off
Each saved search has its own alert switch. Turning it off keeps the search but stops the notifications; deleting it removes both.

## Why you may get nothing for days
Alerts fire on newly **approved** listings only. A listing posted at midnight and approved at 11 the next morning notifies you at 11 — not at midnight, and not twice.`,
    { search: "saved search alert notification new listing match", minutes: 2, related: ["find-property-fast"] }),

  /* ═════════════════════════════════════ Plans & Pricing — 8 articles ═══ */
  a("plans-pricing", "how-does-the-999-plan-work",
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
    { search: "999 plan work pricing owner plan lifetime", popular: true, minutes: 2, related: ["how-do-refunds-work", "listings-expire"] }),

  a("plans-pricing", "after-i-pay",
    "What happens right after I pay?",
    "Your plan activates instantly. If payment succeeds but the plan doesn't activate within 10 minutes, we activate it or refund you automatically.",
    `## The normal path
Razorpay confirms the payment, our webhook activates your plan, and the Post button unlocks. In practice this is a few seconds.

## When it is slower
Occasionally a gateway callback is delayed. Your payment shows as successful and the plan still says inactive.

You do not have to do anything. A reconciliation job checks every pending payment; if the money reached us the plan is activated, and if it cannot be activated the payment is refunded in full — automatically. Ten minutes is the outer limit before that job has acted.

You can still raise a ticket with the payment ID if you would like a human to confirm it.`,
    { search: "after payment plan activate instantly pending stuck", minutes: 2, related: ["how-do-refunds-work", "payment-deducted-no-plan"] }),

  a("plans-pricing", "pause-or-transfer-plan",
    "Can I pause or transfer my plan?",
    "No. Plans can't be paused, transferred to another account, or moved to another property once used.",
    `A plan belongs to the account that bought it, and a used listing slot belongs to the property it was used on.

## Why not
The plan is priced as a one-time payment for a lifetime listing. Allowing it to move between accounts would turn it into a tradable credit, which is a different product with a different price.

## What you can do instead
- If the property did not sell, the listing stays live — you do not need a new plan.
- If you sold it and want to list a different property, that is a new listing slot.
- If you bought a plan on the wrong account by mistake, raise a ticket within 7 days with the payment ID. Cases like this are reviewed individually.`,
    { search: "pause transfer plan move another account property", minutes: 2, related: ["how-does-the-999-plan-work"] }),

  a("plans-pricing", "how-do-refunds-work",
    "How do refunds work?",
    "There are no refunds after purchase, except technical failures (payment deducted but plan not activated) and boosts rejected by our team — those are refunded in full within 5–7 working days.",
    `HomzList sells prepaid digital services, so the general rule is that fees are **non-refundable** once the service is delivered.

## The two exceptions
1. **Technical failure on our side** — money debited, plan not activated, and it could not be activated. Also a duplicate charge for the same purchase.
2. **A boost rejected by our team** — refunded in full.

## What is not a refund case
- Changing your mind.
- Not receiving inquiries. We do not guarantee leads.
- A listing removed for breaking the Community Guidelines.
- Unused boost days after you sell or remove the listing early.

## Timeline
Approved refunds go back to the original payment method and take **5–7 working days** on our side, then whatever your bank adds.

The full text is in the Refund Policy.`,
    { search: "refunds work money back cancel refund policy", popular: true, minutes: 3, related: ["payment-deducted-no-plan", "what-is-a-boost"] }),

  a("plans-pricing", "what-is-a-boost",
    "What is a boost?",
    "A boost promotes your listing at the top of its area for a fixed number of days. Boost days aren't refunded if you sell or remove the listing early.",
    `A boost lifts one listing to the top of a chosen scope for a set number of days.

## The three scopes
- **Area** — the top of one area's results, e.g. Mavdi.
- **City** — the top across Rajkot.
- **Category** — the top within a property type.

## What a boost does not do
It does not guarantee inquiries, and we deliberately do not print a "reach" number, because any figure we invented would be unverifiable. What you get is placement, for a stated number of days.

## Unused days
If you mark the listing sold or remove it while a boost is running, the remaining days are **reclaimable** — they return to your boost balance and can be spent on another listing. They are not refunded as money.`,
    { search: "boost promote top area days reach", minutes: 3, related: ["how-do-refunds-work", "boost-rejected"] }),

  a("plans-pricing", "listings-expire",
    "Do listings expire?",
    "No. Listings on the ₹999 plan are lifetime. Every 2 months we ask you to confirm the property is still available.",
    `Your listing has no end date. What it has is a **freshness check**.

Every two months we send you one notification asking a single question: is this still available? One tap answers it.

## If you don't answer
After a reminder and a grace period, the listing is paused rather than deleted — it disappears from the feed but stays in My listings, and one tap brings it back. Nothing is lost, and your plan slot is not consumed again.

## Why we do it
The most common complaint about every property site in India is that half the listings are already sold. This is the cheapest fix we could find that does not cost you anything.`,
    { search: "listing expire lifetime still available check freshness", minutes: 2, related: ["how-does-the-999-plan-work"] }),

  a("plans-pricing", "requirement-slot-includes",
    "What does the requirement slot include?",
    "One requirement live for 30 days with up to 10 proposals from owners. Turning off or deleting a requirement still uses its slot.",
    `The plan includes one requirement slot. Using it publishes a requirement — what you are looking for, where, and at what budget — for **30 days**.

Owners and brokers with matching property can send you proposals, up to **10**.

> warn: The slot is consumed when the requirement is created, not when it expires. Turning it off or deleting it early does not give the slot back.

## After 30 days
The requirement expires and stops receiving proposals. Proposals already received stay readable.`,
    { search: "requirement slot 30 days proposals included quota", minutes: 2, related: ["what-is-a-requirement", "how-does-the-999-plan-work"] }),

  a("plans-pricing", "get-an-invoice",
    "How do I get an invoice?",
    "Every payment generates a GST invoice automatically. Find it under Payments → Details → Download invoice.",
    `An invoice is generated for every successful payment, at the moment the payment is captured. You do not have to request it.

## Where to find it
**Settings → Payment history**, open the payment, then **Download invoice**.

## What it contains
Your name as on the account, the amount, the GST breakdown, our GSTIN, and the payment reference. If you need a business name and GSTIN on the invoice, add them in your profile **before** you pay — an invoice cannot be re-issued with different details afterwards without a support ticket.`,
    { search: "invoice gst receipt download bill tax", minutes: 2, related: ["payment-methods"] }),

  /* ═══════════════════════════════════ Posting Listings — 10 articles ═══ */
  a("posting-listings", "why-is-my-listing-under-review",
    "Why is my listing under review?",
    "Every new listing is checked before it goes live — usually within a few hours. We look for real photos, a contact number that isn't hidden in the text, and details that match the property type.",
    `Every listing is reviewed before it appears in the feed. Most clear in a few hours; the queue is slowest on Sunday evenings.

## What the review checks
1. The photos are of the actual property, not brochure or stock images.
2. There is no phone number, WhatsApp handle or link inside the title, description or photos.
3. Price and area are plausible for the type and locality.
4. The property type matches what has been filled in.

## The three outcomes
- **Approved** — it goes live and you are notified.
- **Changes requested** — you get the specific reason and can edit and resubmit. This does not use another slot.
- **Rejected** — with a reason. Three rejections locks the listing and you will need to contact support.

> info: Editing an approved listing's price or photos sends it back through a shorter review. The listing stays live meanwhile.`,
    { search: "listing under review approval pending moderation rejected", popular: true, minutes: 3, related: ["listing-rejected-reasons", "photo-rules"] }),

  a("posting-listings", "photo-rules",
    "What are the photo rules?",
    "Real photos of the actual property, taken by you, minimum 5. No stock images, no brochures, no screenshots, and no phone numbers written on the image.",
    `## The rules
- Photos must be **of the property being listed**, taken by you or on your behalf.
- **No** stock photography, builder brochures, screenshots of other listings, or watermarked images from another site.
- **No contact details on the image** — a number written across a photo is the most common rejection reason.
- Minimum 5 photos, maximum 20. Under 5 gets far fewer inquiries.

## What we do to them
Photos are resized, compressed and given a small HomzList watermark with the listing reference. The original is never shown at full size, which makes them harder to lift for a fake listing elsewhere.

## Order matters
The first photo is the one the feed shows. Make it the best-lit wide shot of the main room, not the society gate.`,
    { search: "photos rules stock images watermark upload count", minutes: 3, related: ["photos-that-sell", "why-is-my-listing-under-review"] }),

  a("posting-listings", "photos-that-sell",
    "Which photos actually get inquiries?",
    "Wide, daylight shots of the main rooms, in the order someone would walk through the flat. Kitchen and bathroom included — leaving them out reads as hiding something.",
    `## The order that works
1. Main living room, wide, shot from a corner.
2. Kitchen.
3. Each bedroom.
4. Bathrooms.
5. Balcony and the view from it.
6. Building exterior and parking.

## Light
Shoot between 9 and 11 in the morning with curtains open and every light on. Evening photos with tube lights read yellow and make a good flat look old.

## What loses inquiries
- Portrait crops of a corner of a room.
- A dark photo of a closed door.
- No kitchen or bathroom photos. Buyers assume the worst.
- A photo of the society board instead of the flat.`,
    { search: "photos sell faster inquiries tips shots order", minutes: 3, related: ["photo-rules"] }),

  a("posting-listings", "listing-rejected-reasons",
    "My listing was rejected — why?",
    "The rejection notice always names the reason. The three most common are a contact number in the text or photos, images that aren't of the property, and a price that doesn't match the area given.",
    `The notification and the listing itself both carry the specific reason. There is no generic rejection.

## The common ones
1. **Contact details in the content.** A number in the description, a WhatsApp link, or a number written on a photo.
2. **Photos not of the property.** Brochure renders for a ready flat, or images found elsewhere online.
3. **Details that contradict each other.** A "2 BHK" with 350 sq ft, or a Kalawad Road address on a photo of a different locality.
4. **Not authorised to list.** Posting someone else's property without permission.

## Fixing it
Edit the listing and resubmit. This does not consume another listing slot.

> warn: Three rejections on the same listing locks it. After that only support can reopen it, and we will ask what changed.`,
    { search: "listing rejected reason fix resubmit locked", minutes: 3, related: ["why-is-my-listing-under-review", "photo-rules"] }),

  a("posting-listings", "edit-a-live-listing",
    "Can I edit a listing after it's live?",
    "Yes. Price, description, photos and availability can all be edited. Price and photo changes go through a short re-review; the listing stays live while that happens.",
    `Open **My listings**, choose the listing, and edit.

## What re-reviews
Changing the price, the photos, or the property type sends the listing through a shorter review. It stays live and visible throughout — the change appears once approved.

## What applies immediately
Description wording, amenities, availability date, and your contact preference.

## What cannot change
The property type category and the city. Those decide which slot the listing consumed, so changing them would be a different listing.`,
    { search: "edit listing after live change price photos update", minutes: 2, related: ["mark-as-sold"] }),

  a("posting-listings", "mark-as-sold",
    "How do I mark a property as sold or rented?",
    "My listings → the listing → Mark as sold. It moves to Archived, stops receiving inquiries, and keeps its history. Your plan slot stays used.",
    `Marking it sold is the honest end state, and it takes one tap.

## What happens
- The listing leaves the feed and search.
- Existing chats stay readable; new inquiries are blocked.
- It moves to **Archived**, where you can still see its views and leads.
- A running boost's remaining days return to your boost balance.

## What does not happen
Your ₹999 listing slot is **not** returned. It was consumed when the listing was published.

## If the deal falls through
Archived listings can be republished from the same screen, and go through a quick re-review.`,
    { search: "mark sold rented archive listing done deal", minutes: 2, related: ["edit-a-live-listing", "delete-a-listing"] }),

  a("posting-listings", "delete-a-listing",
    "What happens when I delete a listing?",
    "It goes to Recently deleted for 30 days, where you can restore it. After 30 days it and its photos are permanently removed. The plan slot is not returned either way.",
    `Deleting is a soft delete first.

## The 30 days
The listing sits in **Recently deleted** with a countdown. Restoring it puts it back as a draft, which you can resubmit.

## After 30 days
The row and every photo object are purged. Chats that referenced it keep the messages but lose the preview card.

> warn: Deleting does not return your listing slot. If you might relist the same property later, mark it sold instead.`,
    { search: "delete listing remove trash restore 30 days", minutes: 2, related: ["mark-as-sold"] }),

  a("posting-listings", "how-many-listings",
    "How many listings can I post?",
    "One per ₹999 plan for owners. Brokers and builders have their own quotas — a builder posts projects rather than single listings.",
    `## Owners
One lifetime listing per plan. A second property needs a second plan.

## Brokers
Brokers buy a broker plan with a larger listing quota, because dealing on behalf of several owners is the job. The quota is shown on the Plans screen and on your My plan card.

## Builders
Builders post **projects**, not individual flats. A project carries its unit types, price range, possession date and RERA number, and it behaves differently in the feed.`,
    { search: "how many listings quota limit owner broker builder", minutes: 2, related: ["how-does-the-999-plan-work"] }),

  a("posting-listings", "price-on-request",
    "Can I hide the price?",
    "You can set Price on request instead of a number. It is allowed, but expect noticeably fewer inquiries — most people filter by budget before they ever see your listing.",
    `**Price on request** is available on every listing form.

## The trade-off
Budget is the second filter almost everyone applies, right after area. A listing without a price is excluded from every budget-filtered search, which is most searches. In practice these listings get a fraction of the inquiries.

## When it makes sense
Commercial property and land, where the price genuinely depends on terms. For a residential flat, a number — even a slightly optimistic one — works better than no number.`,
    { search: "price on request hide price negotiable budget", minutes: 2, related: ["photos-that-sell"] }),

  a("posting-listings", "drafts-saved",
    "Are half-finished listings saved?",
    "Yes. Anything you start is saved as a draft automatically and waits in Create → Drafts. Drafts do not consume a listing slot until you publish.",
    `The listing form saves as you go. If you close the app on step 3 of 5, the draft is on the server, not just on that phone — open it on another device and it is there.

## Where they live
**Create → Drafts**. Each draft shows how complete it is and where you left off.

## When the slot is used
Only when a listing is submitted for review. Deleting a draft costs nothing.`,
    { search: "draft saved incomplete listing resume slot", minutes: 1, related: ["how-many-listings"] }),

  /* ═══════════════════════════════════════ Requirements — 6 articles ═══ */
  a("requirements", "what-is-a-requirement",
    "What is a requirement?",
    "A requirement is a public post saying what you're looking for — area, budget, BHK, timeline. Owners and brokers with matching property send you proposals, so you stop hunting.",
    `A requirement inverts the search. Instead of you finding property, property finds you.

## What it contains
Area or areas, budget range, BHK, ready or under-construction, and roughly when you need it. Optionally, a line about your situation — "family of 4, need it before the school year" — which materially improves the proposals you get.

## What happens next
Owners and brokers with matching listings send **proposals**: their listing, plus a short note. You accept, decline, or ignore each one. Accepting opens a chat.

## How long it runs
30 days, then it expires. It uses your plan's requirement slot.`,
    { search: "requirement what is post looking for buyer proposals", minutes: 3, related: ["requirement-slot-includes", "why-cant-i-see-requirement-details"] }),

  a("requirements", "why-cant-i-see-requirement-details",
    "Why can't I see requirement details?",
    "Full requirement details — the exact area, the budget and the contact — are visible to users with an active plan. Without one you see a blurred preview and a link to the plans.",
    `Requirement details are behind a plan for one reason: unlocked contact details in a public list are the thing that turns a property platform into a call-centre lead list.

## What a guest or free user sees
The headline, how recently it was posted, and a blurred preview of the specifics.

## What a plan unlocks
The full text, the area and budget, and the ability to send a proposal.

## What is never shown
The requirement poster's phone number is not part of the unlock. It is shared only if they accept your proposal — the same rule that protects your number protects theirs.`,
    { search: "requirement details locked see blurred unlock plan", popular: true, minutes: 3, related: ["what-is-a-requirement", "send-a-proposal"] }),

  a("requirements", "send-a-proposal",
    "How do I send a proposal?",
    "Open a requirement that matches your listing, tap Send proposal, choose which listing to send, and add a short note. Each proposal uses one of the 10 in your plan.",
    `## What makes a proposal work
The note. A proposal that just attaches a listing gets ignored; one that says "this is 200 metres from the school you mentioned, and the owner will hold it till April" gets a reply.

## The rules
- One proposal per listing per requirement. You cannot send the same listing twice.
- Your listing must be **live** — a paused, sold or under-review listing cannot be proposed.
- A builder must have a live project before sending proposals.

## What it costs
One of the 10 proposals in your plan. A declined proposal is not refunded, so read the requirement before you send.`,
    { search: "send proposal requirement listing note quota", minutes: 3, related: ["why-cant-i-see-requirement-details", "proposal-declined"] }),

  a("requirements", "proposal-declined",
    "My proposal was declined — what now?",
    "A decline is final for that requirement and the proposal is not returned to your quota. You can propose a different listing to the same requirement if you have one that fits better.",
    `A decline means the requirement poster looked and said no. There is no appeal, and the proposal counts against your 10.

## What you can do
- Propose a **different** listing, if you have one that genuinely fits better.
- Nothing else. Repeatedly proposing to a person who declined you is the behaviour the limit exists to prevent.

## Reading the signal
Two or three declines from similar requirements usually means the listing's price or photos are the problem, not the note.`,
    { search: "proposal declined rejected quota back reuse", minutes: 2, related: ["send-a-proposal"] }),

  a("requirements", "turn-off-requirement",
    "Can I turn off my requirement early?",
    "Yes — switch it off any time from My requirements. It stops receiving proposals immediately. The slot stays used, so switching it back on does not cost anything extra.",
    `Turning a requirement off hides it and stops proposals. Turning it back on republishes it for whatever remains of the 30 days.

> warn: The slot was consumed when the requirement was created. Turning it off does not return it, and neither does deleting it.

## Why the slot doesn't come back
Otherwise a single slot could be cycled through unlimited requirements, which is a different product from the one the plan prices.`,
    { search: "turn off requirement pause delete slot back", minutes: 2, related: ["requirement-slot-includes"] }),

  a("requirements", "urgent-requirement",
    "What does marking a requirement urgent do?",
    "It adds an Urgent chip with your deadline and lifts the requirement in the list owners see. It does not cost anything, and it should only be used when the deadline is real.",
    `An urgent requirement carries a visible deadline — "needs by March" — and sorts higher for the people who can act on it.

## Use it honestly
Owners learn quickly which chips mean something. A requirement that has been "urgent" for six weeks is read as noise, and the extra placement stops helping.

## What it does not do
It does not unlock anything, it does not cost a proposal, and it does not notify anyone separately.`,
    { search: "urgent requirement deadline flame priority", minutes: 2, related: ["what-is-a-requirement"] }),

  /* ═══════════════════════════════════ Chat & Inquiries — 7 articles ═══ */
  a("chat-inquiries", "how-do-i-get-my-number-shared",
    "How do I get my number shared?",
    "Your number is shared with one specific person only when you accept their inquiry — or when you send a proposal to their requirement. It is never shown publicly, and never given out in bulk.",
    `HomzList runs a controlled contact system. Your number is not on your listing, your profile, or anywhere a crawler can reach.

## The two moments it is shared
1. **You accept an inquiry.** Someone inquires on your listing; you see who they are and what they said; if you accept, your number becomes visible to that one person, and theirs to you.
2. **You send a proposal.** Sending a proposal to a requirement shares your number with that requirement's poster, because you initiated contact.

## What it looks like
Before sharing, the other side sees +91 98242 •••82. After, they see the full number and a Call button, with a line recording when and why it was shared.

## Taking it back
You cannot un-share a number that has been shared — once someone has it, they have it. You can block the person, which stops all further contact on HomzList.`,
    { search: "number shared phone contact call accept inquiry privacy", popular: true, minutes: 3, related: ["who-can-see-my-number", "decline-an-inquiry"] }),

  a("chat-inquiries", "who-can-see-my-number",
    "Who can see my phone number?",
    "Only people you have shared it with, one at a time. It is never public, never in search results, and never included in a data export another user can request.",
    `## Never public
Your number does not appear on your listing, your profile, in search, in the sitemap, or in any page a search engine can index. The server strips it from the payload before it is sent — it is not hidden with CSS.

## Shared one person at a time
See "How do I get my number shared?" for the two moments that happen.

## Staff
Support staff can see your number when they open a ticket you raised, and every such view is written to an audit log.

## Turning off findability
Settings → Privacy has **Allow others to find me by phone number**. Turning it off means someone who already has your number cannot use it to locate your HomzList profile.`,
    { search: "who sees phone number privacy public hidden find", minutes: 3, related: ["how-do-i-get-my-number-shared"] }),

  a("chat-inquiries", "decline-an-inquiry",
    "What happens if I decline an inquiry?",
    "The person is told the owner did not take it further. No numbers are exchanged, and they cannot inquire on that listing again until a cooldown passes.",
    `Declining is a normal, expected action — most listings get more inquiries than the owner wants to talk to.

## What the other person sees
A neutral message. They are not told why, and they are not shown whether you read it.

## The cooldown
They cannot re-inquire on the same listing for a set period. This is what stops a declined inquiry from becoming five inquiries.

## Nothing is shared
No number, no email, no name beyond what their profile already shows publicly.`,
    { search: "decline inquiry reject cooldown re-inquire", minutes: 2, related: ["how-do-i-get-my-number-shared", "block-someone"] }),

  a("chat-inquiries", "block-someone",
    "How do I block someone?",
    "Open the chat → the ⋯ menu → Block. They can no longer message you, inquire on your listings, or see your listings' contact options. Manage the list in Settings → Blocked users.",
    `Blocking is immediate and silent — the other person is not notified.

## What it stops
- New messages, in that chat and any future one.
- Inquiries on any of your listings.
- Proposals to your requirements.

## What it does not undo
A number already shared stays shared. If someone is misusing a number you gave them, block them **and** report them — report is what reaches our team.

## Unblocking
Settings → Blocked users → Unblock. The old chat becomes writable again.`,
    { search: "block user report unblock harassment stop messages", minutes: 2, related: ["report-a-user"] }),

  a("chat-inquiries", "report-a-user",
    "How do I report a user or a listing?",
    "Use Report on the listing, profile or message. For anything serious — fraud, impersonation, or unlawful content — raise a grievance instead, which carries a 24-hour acknowledgement and a 15-day resolution.",
    `## Report
Every listing, profile and message has a Report option. Choose the reason, add detail, and it goes to our moderation queue. You are told the outcome where it is appropriate to tell you.

## Grievance
For content that is unlawful, or a complaint that needs a formal record, use **Help → Contact support → Report a user or listing**, or write to the Grievance Officer directly. That route is governed by the IT Rules 2021: acknowledgement within 24 hours with a ticket number, resolution within 15 days.

## What helps
A link or ID, dates, and screenshots. "Someone is spamming me" without a link cannot be actioned.`,
    { search: "report user listing fraud grievance abuse complaint", minutes: 3, related: ["block-someone", "grievance-timeline"] }),

  a("chat-inquiries", "archive-a-chat",
    "What does archiving a chat do?",
    "It moves the chat out of your inbox without deleting anything. A new message brings it back automatically. Find archived chats in Messages → Archived.",
    `Archiving is for chats that are finished but that you may want to read again — a completed deal, or a buyer who said "next year".

## Behaviour
- The chat leaves the main inbox.
- Every message is kept.
- If the other person writes again, the chat returns to the inbox, unread.

## Deleting instead
There is no hard delete of a chat, because the other side's copy is theirs. Blocking is the way to end contact.`,
    { search: "archive chat inbox hide delete messages", minutes: 1, related: ["block-someone"] }),

  a("chat-inquiries", "no-reply-from-owner",
    "The owner isn't replying — what can I do?",
    "Give it 24–48 hours; most owners check in the evening. After that, look at the listing's response label, send an inquiry on a similar property, or post a requirement so owners come to you.",
    `## Read the response label
Listings carry a response indicator drawn from that poster's actual reply behaviour. A slow label is a fact, not a guess.

## Don't re-inquire repeatedly
Repeat inquiries on the same listing are rate-limited, and they do not help. One clear message with your budget and timeline outperforms four "interested?" messages.

## Better uses of the same time
- Save the listing so you are notified if the price changes.
- Inquire on two or three comparable properties in the same lane.
- Post a requirement and let owners come to you.`,
    { search: "no reply owner not responding slow response", minutes: 2, related: ["what-is-a-requirement"] }),

  /* ═══════════════════════════════ Payments & Invoices — 5 articles ═══ */
  a("payments-invoices", "payment-deducted-no-plan",
    "Money was deducted but my plan isn't active",
    "Wait 10 minutes. A reconciliation job either activates the plan or refunds you automatically, without you raising anything. If it is still wrong after that, open a ticket with the payment ID.",
    `## What is happening
The payment reached the gateway but the confirmation to us was delayed or lost. Your money is not gone, and the outcome is not left to chance.

## What we do, automatically
A job walks every payment that is captured but has no active plan. It either activates the plan, or — if it cannot — refunds the full amount to the original method. No ticket required.

## If it is still wrong
Open **Contact support → Payment or refund** and paste the payment ID from your bank or UPI app. That ID is what lets us find the transaction in seconds instead of hours.`,
    { search: "payment deducted plan not active stuck money debited", minutes: 2, related: ["how-do-refunds-work", "after-i-pay"] }),

  a("payments-invoices", "payment-methods",
    "Which payment methods work?",
    "UPI, debit and credit cards, net banking and wallets, through Razorpay. We never see or store your card details.",
    `Payments run through **Razorpay**. Everything Razorpay supports works here: UPI, cards, net banking, and the common wallets.

## What we store
The amount, the status, the method type ("UPI", "Card · HDFC"), and Razorpay's payment ID. Card numbers, CVVs and UPI PINs never touch our servers.

## Failed payments
A failed payment is shown in Payment history with its reason. Nothing is charged, and nothing is activated. Retrying creates a new payment.`,
    { search: "payment methods upi card netbanking wallet razorpay", minutes: 2, related: ["get-an-invoice"] }),

  a("payments-invoices", "gst-on-invoice",
    "Is GST included in the price?",
    "Yes — ₹999 is the total you pay. The invoice shows the taxable value and the GST split separately.",
    `The price you see is the price you pay. There is no tax added at checkout.

## On the invoice
The invoice breaks the amount into taxable value and GST, with our GSTIN printed on it, because that is what your accountant needs.

## Business details
If you need your firm's name and GSTIN on the invoice, add them to your profile **before** paying. Changing the details on an already-issued invoice needs a ticket and is not always possible.`,
    { search: "gst tax included price invoice gstin business", minutes: 2, related: ["get-an-invoice"] }),

  a("payments-invoices", "boost-rejected",
    "My boost was rejected — do I get the money back?",
    "Yes. A boost rejected by our team is refunded in full, to the original payment method, within 5–7 working days. You do not need to ask.",
    `Boosts are reviewed before they run. If the listing behind a boost breaks the guidelines, the boost is rejected.

## Refund
A rejection by our team is a full refund, processed automatically. You will see it in Payment history as Refunded.

## The exception
If the listing was removed because **you** broke the guidelines, the boost is not refunded — that is a violation, not a service failure. The Refund Policy states this explicitly.`,
    { search: "boost rejected refund money back review", minutes: 2, related: ["how-do-refunds-work", "what-is-a-boost"] }),

  a("payments-invoices", "payment-history",
    "Where do I see my payment history?",
    "Settings → Payment history. Every payment, refund and invoice is there, with its status and the plan or boost it bought.",
    `**Settings → Plans & billing → Payment history** lists everything, newest first.

Each row opens to show the amount, method, date, gateway payment ID, what it purchased, and a Download invoice button. Refunds appear as their own rows linked to the original payment.

This screen is the fastest way to find the payment ID a support ticket asks for.`,
    { search: "payment history receipts list past payments", minutes: 1, related: ["get-an-invoice", "payment-deducted-no-plan"] }),

  /* ══════════════════════════════════════ Verification — 4 articles ═══ */
  a("verification", "how-do-i-get-a-verified-badge",
    "How do I get a verified badge?",
    "Submit an ID from Profile → Verification. Our team checks that the document matches your account. Brokers and builders can also verify a RERA registration, which shows a stronger badge.",
    `## The levels
1. **Phone** — automatic at signup.
2. **ID verified** — you submit a government ID; our team checks it matches the name on the account.
3. **RERA verified** — for brokers and builders, a RERA registration number we check against the state register.

## How to apply
**Profile → Verification**, choose the level, upload the document. Review usually takes 1–2 working days.

> warn: A verified badge is about the PERSON, not the property. It never means we have checked a title, an approval, or a RERA status of any individual flat.

## Your document
ID documents go to a private bucket, are never public, are visible only to reviewing staff with the view logged, and are deleted on schedule once the verification lapses.`,
    { search: "verified badge get verification kyc id rera trust", popular: true, minutes: 3, related: ["verification-rejected", "what-badge-means"] }),

  a("verification", "what-badge-means",
    "What does a verified badge actually mean?",
    "That we checked the identity of the person, not the property. It is not a guarantee of ownership, title, approvals or price.",
    `A badge answers one question: is this person who they say they are?

## It does mean
- The phone number is real and controlled by them.
- For ID-verified: a government ID matched the account name.
- For RERA-verified: a registration number checked against the state register.

## It does not mean
- That they own the property they listed.
- That the title is clear, the plan approved, or the BU permission granted.
- That the price, area or photos are accurate.

Do your own due diligence regardless of the badge. The Disclaimer says the same thing in legal language.`,
    { search: "badge meaning verified guarantee ownership title trust", minutes: 2, related: ["how-do-i-get-a-verified-badge"] }),

  a("verification", "verification-rejected",
    "My verification was rejected",
    "The notice names the reason — usually an unreadable photo, a name that doesn't match the account, or an expired document. Fix that and resubmit; there is no limit on attempts.",
    `## The common reasons
- The photo is blurred, cropped, or has glare over the details.
- The name on the ID does not match the name on the account. Change the account name first.
- The document has expired.
- The document type is not one we accept.

## Resubmitting
Profile → Verification → submit again. There is no cost and no attempt limit.

## Cancelling a pending request
You can withdraw a pending verification and submit a different document instead.`,
    { search: "verification rejected failed resubmit document id", minutes: 2, related: ["how-do-i-get-a-verified-badge"] }),

  a("verification", "rera-verification",
    "How does RERA verification work for brokers and builders?",
    "Enter your RERA registration number and the state. We check it against the register, and once it matches your profile shows a RERA-verified badge with the number visible.",
    `## What we check
That the registration number exists, is current, and is registered to you or your firm.

## What is displayed
The badge, plus the registration number itself on your profile and on project pages — because a buyer is entitled to look it up independently, and a number they can verify is worth more than a badge they have to trust.

## Expiry
A registration that lapses removes the badge. We notify you before that happens.`,
    { search: "rera verification broker builder registration number state", minutes: 2, related: ["how-do-i-get-a-verified-badge"] }),

  /* ═══════════════════════════════════ Account & Privacy — 6 articles ═══ */
  a("account-privacy", "deactivate-vs-delete",
    "What's the difference between deactivating and deleting?",
    "Deactivating hides your profile and listings and pauses chats — logging in brings everything back. Deleting removes your content permanently after a 30-day grace period, and active plans are lost with no refund.",
    `## Deactivate
- Your profile and listings are hidden from everyone.
- Chats are paused.
- Your plans stay exactly as they are.
- Logging in reactivates everything, whenever you like.

## Delete
- Listings, requirements and chats are removed.
- **Active plans are lost — no refund.**
- Payment records are kept for 7 years as tax law requires, in anonymised form.
- You have **30 days** to change your mind. Logging in during those 30 days cancels the deletion.

> warn: Deletion is unavailable for 7 days after a payment. That window exists so a refund or a chargeback has an account to attach to.

If you are unsure, deactivate. It is completely reversible.`,
    { search: "deactivate delete difference account close hide temporary", minutes: 3, related: ["cancel-deletion", "download-my-data"] }),

  a("account-privacy", "cancel-deletion",
    "I scheduled deletion by mistake — can I undo it?",
    "Yes. Log in any time during the 30-day grace period and choose Cancel deletion. Everything comes back exactly as it was.",
    `Scheduled deletion is not immediate, and it is fully reversible for 30 days.

## How to cancel
Log in with your number as usual. Instead of the feed you will see the deletion notice with the date, and a **Cancel deletion** button. One tap restores the account.

## After the 30 days
The account and its content are purged and cannot be restored. Anonymised payment records remain for the legally required period, but they are no longer linked to a usable account.`,
    { search: "cancel deletion undo grace period restore account", minutes: 2, related: ["deactivate-vs-delete"] }),

  a("account-privacy", "download-my-data",
    "How do I download my data?",
    "Settings → Download your data. Choose JSON or CSV and request it; we prepare a file and notify you when it's ready. The download link stays valid for 48 hours.",
    `Under the DPDP Act you can get a copy of your data, and this is the tool for it.

## What is included
- Profile and account details
- Your listings and requirements
- Messages **you** sent
- Payment history and invoices

## What is not
- Messages other people sent to you
- Other users' names, numbers or contact details

That exclusion is deliberate: your export must not become a way to extract someone else's personal data.

## Timing
Preparation usually takes a few minutes. You are notified when it is ready, and the link expires after **48 hours** — after which you can simply request a new one.`,
    { search: "download data export dpdp json csv copy my data", minutes: 3, related: ["deactivate-vs-delete", "what-data-you-keep"] }),

  a("account-privacy", "change-my-number",
    "Can I change my registered mobile number?",
    "Yes, through support. Because the number is your login, we verify ownership of both the old and the new number, or ask for other proof if you have lost access to the old one.",
    `Your number is your account, so changing it is deliberately not a self-serve toggle.

## If you still have the old number
Contact support with both numbers. We verify each by OTP and move the account.

## If you have lost access to the old number
Use **Contact support → Lost access to my number**. You will be asked for an alternate number or email, and our team will contact you there to verify ownership another way — recent payment details are usually the fastest proof.

Everything — listings, chats, plans — moves with the account.`,
    { search: "change number mobile phone lost access sim recovery", minutes: 3, related: ["deactivate-vs-delete"] }),

  a("account-privacy", "notification-control",
    "How do I stop getting so many notifications?",
    "Settings → Notifications. Every category has its own switch, and marketing is separate from transactional messages so you can turn off promotions without missing an inquiry.",
    `## Categories
Inquiries and chats, listing status, payments, requirements and proposals, and marketing each have their own switch.

## Marketing is separate
Turning off marketing never turns off a message about your own listing, payment or chat — those are transactional and are how the platform works.

## Channels
Push, email and SMS are controlled separately where a category supports more than one.

## The quiet route
If it is still too much, turn off everything except Inquiries. That keeps the one notification that costs money to miss.`,
    { search: "notifications too many turn off push email marketing", minutes: 2, related: ["download-my-data"] }),

  a("account-privacy", "what-data-you-keep",
    "What data do you keep, and for how long?",
    "Account data while your account is active, payment records for 7 years as tax law requires, notifications about 90 days, OTP logs about 30 days, and deleted content for 30 days before it is purged.",
    `## The schedule
- **Account and profile** — while the account is active, plus a short period afterwards for fraud and legal purposes.
- **Payment records** — up to **7 years**, as tax and accounting law requires. Anonymised after account deletion where possible.
- **Notifications** — about 90 days.
- **OTP logs** — about 30 days.
- **Verification documents** — while the verification is active, then deleted on schedule.
- **Soft-deleted listings and drafts** — 30 days, then purged along with their photos.

## Why payment records outlive the account
Because we are legally required to keep them. They are stripped of what is not needed and are no longer attached to a usable account.

The full text is in the Privacy Policy.`,
    { search: "data retention how long keep delete privacy 7 years", minutes: 3, related: ["download-my-data", "deactivate-vs-delete"] }),
];

export const GRIEVANCE_ARTICLE_SLUG = "report-a-user";
