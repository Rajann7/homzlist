/**
 * Blog content — designs/P12 S4 (list + post).
 *
 * The featured hero, the five rows and the category chips are the design's
 * exact titles, read-times and copy; the long-form body of "Buying a flat in
 * Rajkot: a 2025 checklist" is verbatim from P12 s-post. A Renting post is
 * included so every chip in the filter row has something behind it.
 *
 * cover_url is deliberately null: no stock photography ships with the seed, so
 * the reader falls back to the design's own gradient placeholder rather than
 * pretending to have a photo.
 */

export const BLOG_CATEGORIES = [
  { slug: "buying", title: "Buying", sort_order: 1 },
  { slug: "renting", title: "Renting", sort_order: 2 },
  { slug: "legal", title: "Legal", sort_order: 3 },
  { slug: "rajkot-market", title: "Rajkot market", sort_order: 4 },
  { slug: "homzlist-tips", title: "HomzList tips", sort_order: 5 },
];

export const BLOG_POSTS = [
  {
    slug: "buying-a-flat-in-rajkot-2025",
    title: "Buying a flat in Rajkot: a 2025 checklist",
    category: "buying",
    badge: "Guide",
    // "mavdi" is what resolves the post to a launched area, which is how the
    // "Looking in Mavdi?" block at the foot of P12 S4 finds its listings.
    tags: ["mavdi", "rajkot", "buying", "checklist"],
    read_minutes: 8,
    published_at: "2026-01-12T09:00:00+05:30",
    is_featured: true,
    excerpt:
      "Rajkot's market moved fast last year. If you're buying your first flat, this checklist keeps you out of trouble — budget, area, paperwork and negotiation.",
    seo_title: "Buying a flat in Rajkot: the 2025 checklist for first-time buyers",
    seo_description:
      "Budget beyond the sticker price, shortlist the area before the flat, check title / NA / BU / RERA, and negotiate on per-sq-ft. A practical Rajkot buying checklist.",
    body_md: `Rajkot's market moved fast in 2024 — new schemes on Kalawad Road, steady demand in Mavdi, and prices up roughly 8–12% in the popular western belt. If you're buying your first flat in 2025, this checklist keeps you out of trouble.

## 1. Fix your real budget first
Your budget isn't the flat price. Add stamp duty (4.9% for most buyers in Gujarat), registration, society deposit, and interiors. On a **₹45 Lakh** flat, expect ₹3–4 Lakh on top.

## 2. Shortlist the area, not just the flat
- **Mavdi** — newer stock, good value, fast-growing
- **University Road** — established, walkable, pricier
- **Kalawad Road** — premium schemes, wide roads
- **150 Feet Ring Road** — best connectivity, commercial buzz

> quote: Most buyers regret the area before they regret the flat. Spend your Sundays walking the lane, not the sample flat.

## 3. Check the paperwork
Ask for the title deed, NA order, approved plan and BU permission. For under-construction schemes, verify the **RERA registration number** on the Gujarat RERA portal.

> info: On HomzList, listings with a verified badge have had their ownership documents checked by our team.

## 4. Negotiate like a local
Quoted prices in Rajkot usually carry 3–7% room. Compare per-sq-ft rates across at least three similar listings in the same lane before you make an offer.

> figure: New residential schemes coming up along Kalawad Road, Rajkot

Finally — never pay a token in cash without a written receipt that names the flat, the price and the refund condition. It's the single cheapest insurance you can buy.`,
  },

  {
    slug: "check-property-documents-before-token",
    title: "How to check property documents before you pay a token",
    category: "buying",
    badge: "Guide",
    tags: ["kalawad-road", "documents", "due-diligence", "token"],
    read_minutes: 5,
    published_at: "2026-01-08T09:00:00+05:30",
    excerpt:
      "The six documents that decide whether a property is safe to buy — and the two questions to ask about each one before any money moves.",
    seo_title: "Property documents to check before paying a token — Rajkot buyer's guide",
    seo_description:
      "Title deed, 7/12, NA order, approved plan, BU permission and encumbrance certificate: what each one proves and how to verify it before paying a token.",
    body_md: `A token is the moment your money stops being yours. Everything on this page belongs *before* that moment.

## The six documents
1. **Title deed** — proves who owns it today, and how they got it.
2. **7/12 / property card** — the revenue record. Names here must match the deed.
3. **NA order** — non-agricultural permission. Without it, residential use isn't legal.
4. **Approved plan** — what the corporation sanctioned. Compare it to what's built.
5. **BU permission** — building-use permission. A flat without BU is a running risk.
6. **Encumbrance certificate** — 13 to 30 years of charges and mortgages on the property.

## Two questions per document
For each one ask: **is it in the seller's name**, and **is it current**? An NA order for a different survey number, or a BU for a smaller building, is not a document — it's a warning.

> warn: A photocopy is not verification. Ask for originals at the time of the token, and have an advocate do a title search.

## Under construction
Add the **RERA registration number** and check it on the Gujarat RERA portal yourself. Look at the promoter's other projects and their completion dates while you're there.

## The token receipt
Whatever you pay, get a receipt that names the property, the amount, the total agreed price, and what happens to the token if the deal falls through. Cash without paper is the single most common way buyers lose money here.`,
  },

  {
    slug: "mavdi-vs-university-road",
    title: "Mavdi vs University Road: which area fits you?",
    category: "rajkot-market",
    badge: "Area guide",
    tags: ["mavdi", "university-road", "areas"],
    read_minutes: 6,
    published_at: "2026-01-05T09:00:00+05:30",
    excerpt:
      "Two of Rajkot's most-searched areas, compared on price, stock, commute and who actually ends up happy in each.",
    seo_title: "Mavdi vs University Road, Rajkot — price, stock and commute compared",
    seo_description:
      "A practical comparison of Mavdi and University Road for buyers and tenants in Rajkot: per-sq-ft ranges, the kind of stock available, and who each suits.",
    body_md: `These two come up in almost every search on HomzList. They are not competing for the same buyer.

## Price and stock
**Mavdi** is where most of the new construction went. Expect newer buildings, more 2 and 3 BHK stock, and a lower per-sq-ft rate than the established west.

**University Road** is built out. Stock is older but larger, the trees are grown, and you pay a premium for being able to walk to everything.

## Commute
University Road wins on daily life — schools, hospitals and colleges are inside a short radius. Mavdi trades that for the ring road, which is faster if you're driving across the city or out of it.

## Who ends up happy
- Buying your first flat and stretching the budget → **Mavdi**
- Family with school-age children, want to walk → **University Road**
- Investing and expecting appreciation → **Mavdi**, on the newer lanes
- Want a large old-construction flat → **University Road**

> info: Filter the HomzList feed by area and sort by per-sq-ft before you decide. Three comparable listings in the same lane tell you more than any average.

## The honest answer
Walk both on a weekday evening. The traffic, the parking and the noise at 7pm are the things nobody puts in a listing.`,
  },

  {
    slug: "rera-explained-for-first-time-buyers",
    title: "RERA explained for first-time buyers",
    category: "legal",
    badge: "Legal",
    tags: ["rera", "legal", "under-construction"],
    read_minutes: 7,
    published_at: "2026-01-02T09:00:00+05:30",
    excerpt:
      "What RERA registration actually guarantees, what it doesn't, and how to check a Rajkot project's number in two minutes.",
    seo_title: "RERA explained for first-time buyers in Gujarat",
    seo_description:
      "What a RERA registration number means for an under-construction project, what protection it gives, and how to verify a project on the Gujarat RERA portal.",
    body_md: `RERA is the Real Estate (Regulation and Development) Act, 2016. For a buyer it mostly means one thing: an under-construction project has to be registered, and its promises are on a public record.

## What registration gives you
- The promoter's declared **completion date**, on record
- **Carpet area** defined by law, not by the brochure
- Buyer money held in a **separate account**, largely for that project
- A forum to complain to that isn't a civil court

## What it does not give you
Registration is not an endorsement of quality, price, or the promoter's finances. A registered project can still be delayed.

> warn: "RERA approved" is not a thing. Projects are **registered**, and the number is what you verify — not a phrase in an advertisement.

## How to check in two minutes
1. Get the registration number from the listing or the promoter.
2. Open the Gujarat RERA portal and search that number.
3. Read the declared completion date, the approved plan, and the promoter's other projects.

If the number doesn't resolve, or the project details don't match what you were told, stop there.

## Ready-to-move is different
A completed flat with BU permission doesn't need RERA registration. There you're checking title, NA and BU instead — see our [documents checklist](/blog/check-property-documents-before-token).

> info: On HomzList, a RERA badge on a broker or builder means we checked **their** registration. It says nothing about a specific property.`,
  },

  {
    slug: "what-carpet-area-actually-means",
    title: "What 'carpet area' actually means",
    category: "buying",
    badge: "Explainer",
    tags: ["carpet-area", "built-up", "measurement"],
    read_minutes: 4,
    published_at: "2025-12-28T09:00:00+05:30",
    excerpt:
      "Carpet, built-up and super built-up describe the same flat with three different numbers. Here's how to convert between them.",
    seo_title: "Carpet area vs built-up vs super built-up — explained simply",
    seo_description:
      "The difference between carpet area, built-up area and super built-up area, the usual loading percentage, and which number to compare when shopping.",
    body_md: `Three numbers, one flat. Knowing which is quoted is the difference between comparing properties and guessing.

## Carpet area
The floor you can actually put a carpet on — inside the walls. Under RERA this is the number that must be declared for a registered project.

## Built-up area
Carpet area plus the walls and the balcony. Typically **10–15% more** than carpet.

## Super built-up area
Built-up plus your share of the lobby, staircase, lift and other common space. This is the "loading", usually **20–35%** on top of carpet — and it's the number most brochures quote, because it's the biggest one.

## Doing the maths
A flat advertised at **1,200 sq ft super built-up** with 30% loading is about **920 sq ft carpet**. The same flat advertised honestly at 920 sq ft looks smaller and costs the same.

> info: Compare per-sq-ft rates only when both listings quote the same kind of area. Otherwise you're comparing a price to a marketing number.

## What to ask
"Is that carpet or super built-up?" — then ask for the other one too. A seller who can't answer either hasn't read their own paperwork.`,
  },

  {
    slug: "10-photos-that-sell-your-listing-faster",
    title: "10 photos that make your listing sell faster",
    category: "homzlist-tips",
    badge: "Tips",
    tags: ["photos", "listing", "tips"],
    read_minutes: 5,
    published_at: "2025-12-22T09:00:00+05:30",
    excerpt:
      "Listings with eight or more real photos get noticeably more inquiries. Here's the shot list, in order, and what to avoid.",
    seo_title: "10 photos that make your property listing sell faster",
    seo_description:
      "The shot list that gets more inquiries on a property listing: cover shot, every room, kitchen, bathroom, balcony view, building entrance and parking.",
    body_md: `On HomzList the photo is the listing. Buyers scroll a feed; a single blurry hall shot is a scroll-past.

## The shot list, in order
1. **Cover** — the best exterior or the living room, in daylight
2. **Living room**, wide, from the doorway
3. **Kitchen**, showing the platform and the window
4. **Master bedroom**
5. **Second bedroom**
6. **Bathroom**, clean and dry
7. **Balcony**, and the view from it
8. **Building entrance**
9. **Parking**
10. **The lane outside**, so buyers can place it

## What actually helps
- Shoot in the morning; turn on every light anyway
- Stand in a corner and shoot across the room — it reads bigger
- Clear the counters and the floor first. Five minutes of tidying beats any filter
- Hold the phone level. Tilted rooms look smaller

## What to avoid
- Stock or brochure images of a "similar" flat — these get the listing rejected
- Screenshots of other listings
- A phone number written on the photo — also a rejection

> warn: Photos with contact numbers in them are removed during review. Share your number through chat instead — that's what the accept flow is for.

## The minimum
Three photos is the floor, not the target. Eight or more is where inquiries change.`,
  },

  {
    slug: "renting-in-rajkot-what-to-check",
    title: "Renting in Rajkot: what to check before you sign",
    category: "renting",
    badge: "Guide",
    tags: ["university-road", "renting", "tenant", "agreement"],
    read_minutes: 5,
    published_at: "2025-12-15T09:00:00+05:30",
    excerpt:
      "Deposit norms, what the maintenance actually covers, and the five clauses in a Rajkot rent agreement that decide how the year goes.",
    seo_title: "Renting in Rajkot — deposit, maintenance and agreement checklist",
    seo_description:
      "What to check before signing a rent agreement in Rajkot: deposit norms, what maintenance covers, notice period, lock-in, and registration.",
    body_md: `Most rental disputes are decided by things agreed in the first ten minutes and never written down.

## Deposit
Rajkot typically runs **2–6 months** of rent as deposit, depending on the area and whether it's furnished. Get the refund conditions in writing — what counts as damage, and how many days after vacating.

## Maintenance
Ask what the monthly maintenance actually covers: lift, water, security, common electricity. Then ask who pays for repairs inside the flat. These are two different questions and landlords answer them differently.

## The five clauses that matter
1. **Notice period** — one month is normal; two is common and negotiable
2. **Lock-in** — if there's a lock-in, leaving early costs you
3. **Annual increase** — usually 5–10%; get the number, not "as decided later"
4. **Repairs** — who pays for what, with a rupee threshold
5. **Deposit refund** — how many days, and what can be deducted

> warn: An 11-month agreement avoids registration, which is normal — but it also means you have no registered document if things go wrong. Keep the signed copy and the payment trail.

## Before you move in
Photograph every room, the meter reading and any existing damage, and send them to the landlord on the day you get the keys. That set of photos is what settles the deposit conversation a year later.

> info: Pay rent and deposit by bank transfer. A UPI trail is evidence; cash isn't.`,
  },
];
