/**
 * The blog.
 *
 * Rajan's brief for this one was specific: the blog is the largest content
 * asset on the site, it must read like a person wrote it, and it must not read
 * like the SEO filler every property portal in India publishes. So these are
 * written the way a working Rajkot agent talks — concrete streets, real
 * numbers, the awkward parts left in — rather than the "In today's fast-paced
 * real estate market…" register that both readers and Google now discount.
 *
 * Practical rules followed in every post below:
 *   · a specific, checkable claim in the first two sentences, no throat-clearing
 *   · real place names (Mavdi, Kalawad Road, 150 Feet Ring Road, Nana Mava)
 *     and real instruments (7/12, NA order, BU permission, Gujarat RERA)
 *   · uneven section lengths and uneven sentence lengths — the single most
 *     obvious tell of generated prose is that every paragraph is the same size
 *   · at least one thing that argues against the reader's instinct, because
 *     advice with no cost in it is advertising
 *   · no invented statistics presented as research; ranges are given as ranges
 *     and flagged as what an agent sees, not as a survey
 *
 * SEO: every post carries its own `seo_title` (≤60 chars) and
 * `seo_description` (≤160), a slug that reads as the query, an excerpt used for
 * the OG description, and internal links to the area pages and to other posts —
 * which is what actually moves a small site, rather than keyword density.
 *
 * Markdown vocabulary the reader renders:
 *   `## Heading`, `- item`, `1. item`, `**bold**`,
 *   `> quote: …`  → the accent-bar pull quote
 *   `> info: …`   → the accent callout      `> warn: …` → the warning callout
 *   `[text](/path)` → internal link
 */

const AUTHOR = "HomzList Team";

export const BLOG_CATEGORIES = [
  { slug: "buying", label: "Buying", sort_order: 1 },
  { slug: "renting", label: "Renting", sort_order: 2 },
  { slug: "legal", label: "Legal", sort_order: 3 },
  { slug: "rajkot-market", label: "Rajkot market", sort_order: 4 },
  { slug: "homzlist-tips", label: "HomzList tips", sort_order: 5 },
];

export const BLOG_POSTS = [
  /* ══════════════════════════════════════════════════ 1 · FEATURED ═══ */
  {
    slug: "buying-a-flat-in-rajkot-2025",
    title: "Buying a flat in Rajkot: a 2025 checklist",
    badge: "Guide",
    category: "buying",
    is_featured: true,
    read_minutes: 8,
    published_at: "2026-01-12T09:30:00+05:30",
    tags: ["rajkot", "buying", "checklist", "first-time-buyer", "stamp-duty"],
    seo_title: "Buying a flat in Rajkot: the 2025 checklist",
    seo_description:
      "What a first flat in Rajkot actually costs, which papers to ask for, how much room is in the quoted price, and the mistakes that cost buyers the most money.",
    excerpt:
      "Budget, area, paperwork, negotiation and the token. The order matters, and most buyers get it backwards.",
    body_md: `Rajkot's market moved fast in 2024 — new schemes on Kalawad Road, steady demand in Mavdi, and prices up roughly 8–12% in the popular western belt. If you're buying your first flat in 2025, this checklist keeps you out of trouble.

I'll say the useful thing first, because it is the one people ignore: almost nobody loses money in Rajkot by buying the wrong flat. They lose it by buying the wrong **lane**, or by paying a token before reading a document. Everything below is arranged in the order that actually protects you.

## 1. Fix your real budget first
Your budget isn't the flat price. Add stamp duty (4.9% for most buyers in Gujarat), registration, society deposit, and interiors. On a **₹45 Lakh** flat, expect ₹3–4 Lakh on top.

Write it out on paper once:

- **Stamp duty and registration** — budget around 5.4% all-in. On ₹45 Lakh that is roughly ₹2.4 Lakh. Registration in a woman's name attracts a rebate on the registration component; ask your advocate to confirm the current position before you plan around it.
- **Society corpus and transfer charges** — anywhere from ₹25,000 to well over ₹1 Lakh in newer schemes.
- **Loan processing and legal-technical fees** — ₹15,000–₹30,000 with most banks.
- **Interiors** — the number everyone underestimates. A bare 2 BHK made properly liveable, with a modular kitchen and wardrobes, does not finish under ₹4–5 Lakh at current rates. A "semi-furnished" flat may save you two of those lakhs, or none, depending on what's actually fitted.

If the total makes the flat unaffordable, you have learned that in week one instead of at the registrar's office.

## 2. Shortlist the area, not just the flat
- **Mavdi** — newer stock, good value, fast-growing
- **University Road** — established, walkable, pricier
- **Kalawad Road** — premium schemes, wide roads
- **150 Feet Ring Road** — best connectivity, commercial buzz

Those four lines are the summary every agent gives. Here is what's underneath them.

Mavdi has been the value story for about six years, and the pace of construction shows. You get more carpet per rupee than anywhere comparable, and the newer societies are genuinely well built. The trade-off is infrastructure catching up in patches — two societies on the same road can have very different water and drainage experiences. Ask the neighbours, not the sales office.

University Road is the opposite bargain. You pay a premium for a locality that already works: schools, hospitals, shops within walking distance, and a resale market that never goes quiet. Stock is older, floor plans are less efficient, and parking is the recurring fight.

Kalawad Road is where the premium schemes are, and where the price gap between a good scheme and an ordinary one is widest. The wide road is genuinely an amenity. So is the fact that resale buyers know the address.

150 Feet Ring Road buys you connectivity and commercial buzz. If you work across the city, that is worth real money. If you have small children, walk the immediate lane in the evening before deciding — the traffic that makes it convenient also makes it loud.

> quote: Most buyers regret the area before they regret the flat. Spend your Sundays walking the lane, not the sample flat.

One more thing about area, which nobody in a sales office will tell you: go at three different times. Ten in the morning, seven in the evening, and once on a weekday when school lets out. Water pressure, parking overflow and street noise are all invisible at 11 a.m. on a Sunday, which is exactly when site visits are scheduled.

## 3. Check the paperwork
Ask for the title deed, NA order, approved plan and BU permission. For under-construction schemes, verify the **RERA registration number** on the Gujarat RERA portal.

In practice, the folder you want before any money changes hands is:

1. **Title deed** and the chain of previous sale deeds — ideally 30 years, minimum 13.
2. **7/12 extract** and the **NA (non-agricultural) order** for the land the scheme sits on.
3. The **approved layout and building plan** stamped by the municipal corporation.
4. **BU (Building Use) permission**. A flat without BU permission is occupiable in practice and awkward in law, and it will follow you to resale.
5. **Property tax receipts** and the latest **society NOC** with no outstanding dues.
6. For an under-construction flat, the **RERA registration** — and check it yourself on the Gujarat RERA portal rather than accepting a number printed on a brochure. [We wrote a separate piece on how to read a RERA page.](/blog/rera-explained-for-first-time-buyers)
7. If there is a loan on the property, the **bank's NOC and the original documents' whereabouts** in writing.

> info: On HomzList, listings with a verified badge have had the seller's identity checked by our team. It is not a check of the property's title — nobody's badge is. The folder above is still yours to read.

Give the whole set to an advocate. In Rajkot a title search and opinion runs a few thousand rupees. On a ₹45 Lakh purchase, declining to spend that is not thrift.

## 4. Negotiate like a local
Quoted prices in Rajkot usually carry 3–7% room. Compare per-sq-ft rates across at least three similar listings in the same lane before you make an offer.

Some specifics that work here:

- **Negotiate on the per-square-foot rate, not the total.** It forces the conversation onto something comparable, and it exposes the flat that is quietly charging you for a large balcony.
- **Ask what is included.** Covered parking, a modular kitchen, and the society's one-time corpus are the three items most often quoted as "included" and then invoiced separately.
- **Cash-plus-cheque proposals are a red flag, not a discount.** They cap your loan, distort the registered value, and leave you exposed. Walk.
- **Ready-to-move commands a premium, and it is usually worth it** for a first purchase. Possession dates in this market slip; a slipped date while you're paying rent and EMI together is the fastest way to feel poor in a new flat.

The single strongest position in a negotiation is being able to leave. Line up two other flats you would genuinely accept before you open the conversation on the one you want.

## 5. The token — the one paragraph to reread
Finally — never pay a token in cash without a written receipt that names the flat, the price and the refund condition. It's the single cheapest insurance you can buy.

The receipt should carry: the full description of the flat including its number and the scheme, the total agreed consideration, the token amount, the date by which the sale deed will be executed, and — the clause people forget — **what happens to the token if the title does not come clean**. Without that last line, a token is a donation with a story attached.

> warn: HomzList is not a party to any deal made through the platform. We cannot recover money paid to another user, and no chat message is a substitute for a signed receipt. Take a token only after your advocate has seen the documents.

## A short version, if you only remember five things
1. Add 12–15% to the flat price and see whether you still like it.
2. Walk the lane three times before you like the flat.
3. Never pay before the advocate reads the file.
4. Negotiate on ₹/sq ft, and be willing to walk.
5. Get a token receipt that names the refund condition.

Ready to look? Start with [what's listed in Mavdi](/area/mavdi-rajkot), or post a requirement and let owners come to you.`,
  },

  /* ═══════════════════════════════════════════════════ 2 · DOCUMENTS ═══ */
  {
    slug: "check-property-documents-before-token",
    title: "How to check property documents before you pay a token",
    badge: "Guide",
    category: "buying",
    read_minutes: 6,
    published_at: "2026-01-08T10:00:00+05:30",
    tags: ["documents", "title", "7-12", "bu-permission", "due-diligence"],
    seo_title: "Property documents to check before paying a token",
    seo_description:
      "The seven documents to read before any money changes hands in Gujarat — title chain, 7/12, NA order, approved plan, BU permission, tax receipts and society NOC.",
    excerpt:
      "Seven documents, in the order to ask for them, and what each one is actually telling you.",
    body_md: `A token is the moment your leverage ends. Before it, you can walk away for free; after it, every conversation is about getting your money back. So the document check belongs entirely before that moment, and it takes about a week.

Here is the folder, in the order I ask for it, with what each paper is really for.

## 1. The title deed, and the chain behind it
The current sale deed tells you who owns it today. The **chain** — the deeds going back, ideally 30 years and at minimum 13 — tells you whether they were entitled to. Gaps in the chain are the single most common defect an advocate finds, and they are usually fixable, but only if you find them before you pay.

Ask for photocopies. A seller who will not share copies before a token is telling you something.

## 2. The 7/12 extract and the NA order
For anything built on land that was once agricultural — which is most of Rajkot's western growth — you want the **7/12 extract** showing the current holder and any encumbrance entries, and the **NA (non-agricultural) order** that permitted construction.

A scheme built without a proper NA order is not a paperwork detail. It is the reason some buildings cannot be regularised.

## 3. The approved plan
The layout and building plan approved by the municipal corporation, stamped. Then do the boring thing: count the floors on the plan and count the floors on the building. If there is an extra one, you have found an unapproved construction, and every future sale of your flat inherits that problem.

## 4. BU permission
Building Use permission is the corporation certifying the building may be occupied. People move into flats without it all the time — and then discover at resale that the buyer's bank will not lend against it.

> warn: "BU is applied for, it will come" is the most expensive sentence in this market. It sometimes does come. Price the flat as if it might not.

## 5. Property tax receipts
The latest receipt, plus the previous two or three. You are checking two things: that there are no arrears you will inherit, and that the name on the receipts matches the name on the deed. A mismatch is usually an old inheritance that never made it into the records.

## 6. Society NOC and dues
A no-objection certificate from the society with a statement of dues. Maintenance arrears attach to the flat, not to the person who ran them up.

Also ask for the last two years of society meeting minutes if they will share them. That is where you learn about the lift replacement everyone is about to be charged for.

## 7. Encumbrance and loan status
Ask directly: is there a loan on this property? If yes, you need the lender's NOC, the foreclosure figure, and a written arrangement about where the original documents are and when they will be released. This is routine and banks do it every day — but the sequence has to be agreed in writing before the token, not improvised at the registrar's office.

> quote: Every defect on this list is fixable. Almost none of them are fixable after you've paid.

## What it costs to do this properly
A title search and written opinion from an advocate in Rajkot runs a few thousand rupees and takes about a week. A technical valuation, if your bank does not include one, is similar.

On a ₹45 Lakh purchase, that is roughly one-tenth of one percent of the transaction. I have never met a buyer who regretted spending it. I have met several who regretted not.

## Two habits that save the most trouble
- **Ask for everything in one message, early.** A seller who supplies the folder in two days is a different kind of counterparty from one who supplies it in three weeks, one paper at a time. That difference is information.
- **Send the whole file to the advocate at once.** Piecemeal review costs more and catches less, because chain defects only show up when the deeds are read in sequence.

Next: [how RERA registration works for under-construction schemes](/blog/rera-explained-for-first-time-buyers), and [the full buying checklist](/blog/buying-a-flat-in-rajkot-2025).`,
  },

  /* ══════════════════════════════════════════════════ 3 · AREA COMPARE ═══ */
  {
    slug: "mavdi-vs-university-road",
    title: "Mavdi vs University Road: which area fits you?",
    badge: "Area guide",
    category: "rajkot-market",
    read_minutes: 7,
    published_at: "2026-01-05T09:00:00+05:30",
    tags: ["mavdi", "university-road", "rajkot", "area-guide", "compare"],
    seo_title: "Mavdi vs University Road, Rajkot — which suits you?",
    seo_description:
      "Price, stock age, commute, schools, parking and resale compared for two of Rajkot's most-searched localities — and who each one actually suits.",
    excerpt:
      "One is newer and cheaper per square foot. The other already works. The right answer depends on three questions about your life, not about the flats.",
    body_md: `These two come up in the same shortlist constantly, which is odd, because they are not really competitors. They are two different bets. One is a bet on the next five years; the other is a purchase of the last twenty.

## The short version
**Mavdi** gives you newer construction and more carpet area per rupee, in a locality still filling in. **University Road** gives you an established, walkable neighbourhood with older stock and a resale market that never sleeps, at a premium.

If you want the decision in one line: buy Mavdi if you are optimising for the flat, buy University Road if you are optimising for the neighbourhood.

## Price and what you get for it
Per square foot, Mavdi typically sits meaningfully below University Road for comparable quality — the gap agents quote is usually in the 15–25% range, though it swings by scheme and by how new the building is. What that buys you in practice is one of two things: the same budget stretching from a 2 BHK to a 3 BHK, or the same BHK with a genuinely usable second bathroom and a balcony you can sit on.

University Road's premium is not for the building. It is for the address, and for the fact that everything you need is already there.

## Age and layout of the stock
Mavdi's inventory skews new. That means efficient floor plans, current fittings, proper parking designed in rather than retrofitted, and lifts that are not yet due for replacement.

University Road's stock skews older. Older buildings in Rajkot are often solidly built, but the plans waste space — long corridors, small kitchens, one bathroom for three bedrooms — and the societies are frequently mid-way through the expensive decade where the lift, the pump and the paint all come due at once. Ask about the sinking fund.

## Commute
This is the one that most often flips a decision.

University Road is central enough that most of the city is a fifteen-to-twenty-minute ride. Mavdi is well connected outward and to the Ring Road, but a daily commute into the older parts of town is longer, and it is longer in a way that grows as the corridor fills up.

Do the actual commute, at your actual time, before you decide. Not the sales office's estimate.

## Schools, hospitals and daily life
University Road wins this outright, and it is not close. Schools, clinics, chemists, a bank branch and a decent grocery are all within walking distance of most societies. If you have young children or elderly parents at home, that convenience is worth more than the per-square-foot difference — genuinely, not as a figure of speech.

Mavdi has been catching up quickly, and the newer pockets are well served. But "well served" and "walkable" are different standards, and the second one is what changes a Tuesday evening.

## Parking
Mavdi: designed in, usually adequate, often covered.

University Road: the recurring society argument. Many buildings from the older wave allotted one space per flat at a time when one car per flat was the assumption. Confirm — in writing, on the allotment — exactly how many spaces come with the flat, and whether they are covered.

## Water and infrastructure
Ask the neighbours, not the seller, and ask about summer specifically. Both localities have societies that are fine and societies that run tankers in May. This varies building by building far more than it varies area by area, so it is not a reason to choose between them — it is a reason to ask on every site visit.

> quote: Two societies on the same Mavdi road can have completely different summers. The sales office knows this. The neighbour will tell you.

## Resale
University Road's resale market is deep and steady. There is always a buyer, and the price discovery is quick, because there are comparable transactions every month.

Mavdi's resale has been strong through the growth phase, and the newer stock helps. But it is a thinner market for anything unusual, and appreciation there is a bet on the corridor continuing to develop. That bet has paid well for several years. It is still a bet.

## Three questions that decide it
1. **Do you walk to things, or drive to them?** If you walk, University Road. If you drive anyway, the premium buys you less.
2. **Is this a ten-year home or a five-year holding?** Ten years and children in the picture: the established neighbourhood. Five years and a growth bet: the newer corridor.
3. **Which constraint is tighter — budget or time?** Mavdi solves budget. University Road solves time.

## What people actually do
Families with school-age children skew to University Road and accept the older flat. First-time buyers and younger couples skew to Mavdi and take the better flat. Investors are split, and the ones I would listen to buy in whichever of the two has just had a quiet six months.

Browse what's live right now in [Mavdi](/area/mavdi-rajkot) and on [University Road](/area/university-road-rajkot), or post a requirement and let owners in both areas come to you.`,
  },

  /* ═════════════════════════════════════════════════════════ 4 · RERA ═══ */
  {
    slug: "rera-explained-for-first-time-buyers",
    title: "RERA explained for first-time buyers",
    badge: "Legal",
    category: "legal",
    read_minutes: 7,
    published_at: "2026-01-02T09:00:00+05:30",
    tags: ["rera", "gujarat-rera", "under-construction", "legal", "carpet-area"],
    seo_title: "RERA explained for first-time buyers in Gujarat",
    seo_description:
      "What Gujarat RERA registration actually guarantees, how to read a project's RERA page, the 10% rule, and what to do when possession is delayed.",
    excerpt:
      "What the registration number does and does not promise, how to read the portal yourself, and the three clauses worth arguing about.",
    body_md: `RERA is the law that made under-construction property legible. It did not make it safe. Knowing the difference is most of what a first-time buyer needs.

## What RERA is
The Real Estate (Regulation and Development) Act, 2016, requires that projects over a threshold size register with the state regulator before they can be advertised or sold. In Gujarat that regulator is **Gujarat RERA**, and every registered project has a public page with a registration number.

The registration forces three things into the open: the promoter's identity, the approved plans and the declared completion date, and quarterly progress updates.

## What the number actually guarantees
It guarantees that the project is **registered** and that certain documents were filed. That is genuinely valuable — it is the difference between a scheme you can research and one you cannot.

It does not guarantee that the building will be finished on time, that the promoter is solvent, or that the quality will match the sample flat. Registration is disclosure, not insurance.

> warn: A RERA number on a brochure is not a RERA registration. Type the number into the Gujarat RERA portal yourself and read the page it opens. It takes two minutes and it is the highest-value two minutes in the whole process.

## How to read the project's RERA page
When you open it, look at four things in this order:

1. **The declared completion date.** Compare it to what the sales team told you. If the portal says December 2027 and the office says "possession next Diwali", you have learned something important about that office.
2. **The quarterly progress updates.** Promoters must file them. A project with stale or missing filings is a project whose promoter is not managing paperwork, which correlates with not managing timelines.
3. **The approved plans and the number of units.** Check the tower and unit count against what is being sold. Additional unapproved floors show up here.
4. **The promoter's other projects.** The same promoter's older registrations are on the portal too, with their declared and actual dates. That history is the best available predictor, and it is free.

## Carpet area is now a defined term
Before RERA, "area" meant whatever the brochure wanted it to mean. Now **carpet area** has a statutory definition — the net usable floor area within the walls, excluding the external walls, shaft, balcony and terrace — and prices must be quoted against it.

This matters more than any other RERA provision for the ordinary buyer, because it makes two flats comparable. [We wrote a whole piece on the area definitions and how they are still misused.](/blog/what-carpet-area-actually-means)

## The 10% rule
A promoter cannot take more than **10% of the cost** as an advance or application fee without a registered agreement for sale. This is the rule most often quietly broken, usually framed as "booking amount to hold the unit".

If you are asked for more than 10% before registration of the agreement, that request is the flag. Not the amount — the request.

## Three clauses in the agreement worth arguing about
1. **The delay compensation clause.** It should be symmetrical: if you pay interest for delayed instalments, the promoter should pay interest for delayed possession, at a comparable rate. Asymmetric clauses are standard in draft agreements and are frequently softened when challenged.
2. **The definition of "possession".** Offered possession, with a completion certificate, is not the same as fit-out possession. Pin down which triggers your payment.
3. **Changes to the layout and common areas.** There should be a limit on what can change without your consent, particularly to the common amenities that were part of the sale pitch.

> quote: Nobody negotiates a builder agreement expecting to win every clause. You are trying to win two, and to know exactly what you conceded on the rest.

## What to do when possession is delayed
Delays happen, including in well-run projects. The sequence that works:

1. **Write, do not call.** Email the promoter, reference the RERA registration number and the declared date, and ask for a revised date in writing.
2. **Keep the paper.** Every receipt, every allotment letter, every email.
3. **Check the portal.** A revised completion date filed with the regulator is a materially different thing from a verbal assurance.
4. **Escalate to Gujarat RERA** if the promoter will not commit in writing. The complaint mechanism exists precisely for this, and the threshold to use it is lower than people assume.

## Where RERA does not reach
Small projects below the registration threshold, and resale of a ready flat between two individuals. Neither is covered. For those, your protection is the document check and your advocate — [the folder to ask for is here](/blog/check-property-documents-before-token).

> info: HomzList shows the RERA registration number on project listings where the builder has provided it, and a RERA-verified badge where we have checked the registration against the register. Verify it yourself anyway. Anyone who objects to you checking has told you something.`,
  },

  /* ══════════════════════════════════════════════════ 5 · CARPET AREA ═══ */
  {
    slug: "what-carpet-area-actually-means",
    title: "What 'carpet area' actually means",
    badge: "Explainer",
    category: "buying",
    read_minutes: 5,
    published_at: "2025-12-28T09:00:00+05:30",
    tags: ["carpet-area", "built-up", "super-built-up", "loading", "explainer"],
    seo_title: "Carpet vs built-up vs super built-up area, explained",
    seo_description:
      "The three area definitions, what 'loading' means, why the same flat is quoted as 1,050 and 1,450 sq ft, and the one question that settles it.",
    excerpt:
      "Three numbers describe the same flat and only one of them is floor you can stand on. Here is how to make sellers quote the same one.",
    body_md: `A flat is advertised at 1,450 sq ft. You visit, and it feels like a small 2 BHK. Both things are true, and the gap between them is called loading.

## The three numbers
**Carpet area** is the usable floor inside your flat, measured wall to wall — the area you could actually lay carpet on. It excludes the external walls, the shaft, the balcony and the terrace. Since RERA, this is a defined term, and it is the one that must be quoted for registered projects.

**Built-up area** is carpet area plus the walls themselves and the balcony. Typically 10–15% more than carpet.

**Super built-up area** is built-up plus your share of the common spaces — the lobby, staircase, lift well, corridors, sometimes the club house and the society office. This is the number that is largest, and historically the number on the brochure.

## Loading
The difference between carpet and super built-up, expressed as a percentage, is **loading**. In Rajkot, loading of 25–30% is common; some schemes go higher.

So: a flat sold as 1,450 sq ft super built-up at 30% loading is about **1,050 sq ft of actual floor**. That is not a scam by itself — every scheme has common areas and someone pays for them. It becomes a problem in exactly one situation: when you compare two flats quoted on different bases.

> quote: You are not choosing between 1,450 and 1,350 square feet. You are choosing between two numbers that were calculated differently, and you don't know how.

## The one question
Ask, in writing: **"What is the carpet area as defined under RERA?"**

Then divide the total price by that number and compare that per-square-foot rate across every flat on your shortlist. This one habit does more for negotiation than any amount of haggling, because it exposes the flat that is charging you a premium for a large lobby.

## Why the same flat gets quoted three ways
Not always dishonesty. Older projects predate the RERA definitions and their paperwork genuinely uses built-up. Resale sellers repeat whatever number was on the document they were given. Brokers quote the number the seller gave them.

The consistent thing to do is not to argue about which number is right, but to convert everything to carpet before you compare.

## What to check on site
- **Carry a tape.** Measure one bedroom and the living room. You are not auditing the whole flat; you are checking whether the plan is roughly honest.
- **Ask which balconies are included** in the quoted figure, and whether any are enclosed.
- **Check the plan against the flat.** A wall that exists in the flat but not on the plan is a modification, and modifications have paperwork implications.

> info: On HomzList, listing area is entered by the person posting. Where they have given both, the detail page shows carpet and built-up separately, and the ₹/sq ft on the card is computed from what they entered. If only one number is given, ask before you compare.

## Two rules of thumb
1. In this market, **carpet is roughly 70–75% of super built-up**. If someone's numbers imply 90%, ask how they measured.
2. **Never compare a per-square-foot rate across two flats without knowing both bases.** It is the single most common way buyers talk themselves into overpaying by a few lakh.

Related: [the full buying checklist](/blog/buying-a-flat-in-rajkot-2025) and [what RERA does and does not guarantee](/blog/rera-explained-for-first-time-buyers).`,
  },

  /* ═══════════════════════════════════════════════════════ 6 · PHOTOS ═══ */
  {
    slug: "10-photos-that-sell-your-listing-faster",
    title: "10 photos that make your listing sell faster",
    badge: "Tips",
    category: "homzlist-tips",
    read_minutes: 5,
    published_at: "2025-12-22T09:00:00+05:30",
    tags: ["photos", "selling", "listing-tips", "owners"],
    seo_title: "10 property photos that get more inquiries",
    seo_description:
      "The shot list that works for Rajkot flats: which rooms, in what order, at what time of day — and the four photos that quietly cost you inquiries.",
    excerpt:
      "The shot list, the time of day, and the four photos that lose you inquiries. Ten minutes of work for a measurably different listing.",
    body_md: `Two flats on the same floor of the same building, same price. One gets inquiries in a day, the other sits for a month. Nine times out of ten the difference is the photographs, and it is the cheapest thing on the entire list to fix.

## Shoot between 9 and 11 in the morning
Open every curtain, switch on every light, and shoot with the window behind you rather than in front. Rajkot morning light is generous, and it is free.

Evening photos under tube lights come out yellow, and yellow reads as old. If mornings are impossible, use a lamp in the corner of frame to warm the shot and shoot before dusk.

## The ten shots, in order
1. **Living room, wide, from a corner.** This is your thumbnail. Shoot from the corner diagonally opposite the largest window, standing, not crouching.
2. **Living room, second angle** — from the opposite side, showing the entrance.
3. **Kitchen, wide.** Clear the counter completely first. One plant is allowed. Nothing else.
4. **Master bedroom, wide,** from the doorway corner.
5. **Master bathroom.** Yes, really. Leaving bathrooms out reads as hiding something, and buyers assume worse than the truth.
6. **Second bedroom.**
7. **Second bathroom.**
8. **Balcony, and the view from it.** If the view is nothing special, shoot the balcony as usable space instead — a chair changes it from a ledge into a room.
9. **Building exterior**, taken from across the road so the whole facade fits.
10. **Parking**, especially if it is covered and allotted. This is a live question for every buyer in this city and almost nobody photographs it.

## The four photos that cost you inquiries
- **The society name board.** It tells a buyer nothing they cannot read in the address.
- **A closed door.** Every closed door in a photo set is read as a room you did not want to show.
- **Portrait crops of a corner.** Property reads landscape. A tall crop of one wall makes the room feel like a cupboard.
- **A dark room "for the ambience".** Ambience is for restaurants. Buyers are trying to see the floor.

> quote: Every photograph you leave out gets filled in by the buyer's imagination, and imagination is pessimistic.

## Ten minutes of preparation beats a better camera
Before you shoot: clear the counters, remove the drying rack, take the slippers out of the frame, straighten the bedcovers, open the windows, and switch on the lights. A tidy flat photographed on a three-year-old phone beats a cluttered one shot on anything.

If a room genuinely looks small, shoot it from the doorway with the door open — the doorframe gives depth.

## Order and count
The first photo is the one the feed shows, so it earns the tap. Everything after it earns the inquiry.

Post at least eight; the sweet spot is ten to fourteen. Listings with fewer than five photos get noticeably fewer inquiries — the pattern is consistent enough that we mention it on the form.

> warn: Do not write your phone number on a photo. Numbers in images are detected automatically and the listing is sent back for changes before a human sees it. The [Community Guidelines](/legal/community) explain why the contact system works the way it does.

## One thing after you post
Look at your own listing on your phone, in the feed, next to other listings. That side-by-side is the only test that matters, and it takes ten seconds. If yours is the one you would scroll past, change the first photo.

Related: [what to write in the description](/blog/writing-a-listing-that-gets-replies).`,
  },

  /* ══════════════════════════════════════════════════════ 7 · RENTING ═══ */
  {
    slug: "renting-in-rajkot-what-to-check",
    title: "Renting in Rajkot: what to check before you sign",
    badge: "Guide",
    category: "renting",
    read_minutes: 6,
    published_at: "2025-12-15T09:00:00+05:30",
    tags: ["renting", "tenant", "deposit", "rent-agreement", "rajkot"],
    seo_title: "Renting in Rajkot: what to check before signing",
    seo_description:
      "Deposit norms, the eleven-month agreement, what to photograph on handover, society rules that catch tenants out, and the clauses worth negotiating.",
    excerpt:
      "Deposits, the eleven-month agreement, the handover photos most tenants skip, and the society rules nobody mentions until you've moved in.",
    body_md: `Renting is a smaller transaction than buying, which is exactly why people skip the checks — and then argue about a deposit eleven months later.

## The deposit
Rajkot deposits typically run two to four months' rent for residential flats, higher for furnished ones and for commercial space. It is negotiable, and it moves most when you can offer something the owner wants: a longer commitment, or a clean advance.

Two things to settle in writing before you pay it:

- **What can be deducted.** "Damages" is not a definition. Normal wear and tear should be excluded explicitly.
- **When it is returned.** A date, not "after settlement". Fifteen to thirty days from vacating is normal.

## The eleven-month agreement
Most residential rent agreements here run eleven months, which keeps them outside the compulsory-registration threshold. That is standard practice and not a warning sign by itself.

But an unregistered agreement is weaker evidence if there is ever a dispute. If the deposit is large or the tenancy is long-term, registering it is worth the stamp duty. At minimum, insist on a properly stamped agreement, signed by both parties, with an ID copy of each.

## Photograph everything on handover
This is the single highest-return ten minutes of a tenancy. On the day you take possession, before you move anything in:

1. Photograph every room, wide, plus close-ups of any existing damage — chipped tiles, stained counters, a cracked window pane.
2. Photograph the meter readings, electricity and water.
3. Photograph the inside of cupboards, the geyser, the fan regulators, and the kitchen fittings.
4. Send the whole set to the owner on the same day, in a message that says these are the handover photos.

That last step is what turns photographs into evidence. Do the same on the day you leave.

> quote: A deposit dispute is almost always an argument about what the flat looked like on day one. The tenant with photographs wins it in about four minutes.

## The society rules nobody mentions
Ask the owner, and then ask the secretary, about:

- **Restrictions on tenants** — some societies have rules about non-vegetarian cooking, pets, or bachelors, and you would rather learn them before you sign.
- **Parking allotment.** Which space, is it covered, and is it actually assigned to this flat.
- **Water timings and summer supply.**
- **Maintenance** — how much, who pays it (tenant or owner), and whether there is a one-time charge for a tenant NOC.
- **Move-in restrictions**, including which days and hours the lift may be used for shifting.

## What to check in the flat itself
- **Water pressure**, on the top floor especially. Run the shower.
- **Every tap and flush**, one by one.
- **The geyser**, actually switched on.
- **Phone signal**, in the bedroom, not by the window.
- **The electrical load** — if you plan to run two ACs, confirm the sanctioned load supports it.
- **Fans and lights** in each room, individually.

Fifteen minutes. It is not rude; every reasonable owner expects it.

## Clauses worth negotiating
1. **The lock-in period.** A six-month lock-in on an eleven-month agreement is common and often reducible, particularly if your job could move you.
2. **The annual increment.** If the agreement is renewed, the increase should be a stated percentage, not "as mutually decided", which is not a term.
3. **Who fixes what.** Structural and major fittings — the geyser, the pump, plumbing inside the walls — should be the owner's. Consumables and minor repairs are usually the tenant's. Write down which is which.
4. **Notice period**, both ways, and symmetrical.

## Rent receipts
Ask for a receipt every month, or pay by bank transfer with a clear reference. If you claim HRA, you will need this trail, and reconstructing eleven months of cash payments in March is nobody's idea of a good week.

> info: On HomzList, rental listings show the deposit and the monthly rent separately, and the owner's number is shared only after they accept your inquiry — so you can ask these questions in chat before anyone has your phone number.

See what's available for rent in [Rajkot](/area/rajkot) right now, or post a requirement with your budget and move-in date and let owners come to you.`,
  },

  /* ══════════════════════════════════════════════════ 8 · DESCRIPTION ═══ */
  {
    slug: "writing-a-listing-that-gets-replies",
    title: "Writing a listing description that actually gets replies",
    badge: "Tips",
    category: "homzlist-tips",
    read_minutes: 5,
    published_at: "2025-12-08T09:00:00+05:30",
    tags: ["listing", "description", "selling", "owners", "copywriting"],
    seo_title: "How to write a property listing that gets replies",
    seo_description:
      "What to put in the first line, the five facts every buyer looks for, the phrases that kill inquiries, and why hiding a flaw costs you more than naming it.",
    excerpt:
      "The first line does most of the work. Here's what belongs in it, and the five words that quietly cost you inquiries.",
    body_md: `Photographs earn the tap. The description earns the message. Most descriptions do neither, because they are written as an advertisement instead of as an answer.

## Start with the first line
The first line is often all that shows before "more". Put the three things a buyer filters on into it: **what it is, where it is, and when it is available.**

> quote: "3 BHK on the 4th floor at Shivalik Residency, Kalawad Road — vacant, ready to move" tells a buyer more than four sentences about a peaceful ambience.

Compare: *"A beautiful and spacious dream home in a prime location with all modern amenities."* That sentence appears on approximately every listing in India and distinguishes yours from none of them.

## The five facts buyers look for
Get all five into the first short paragraph, and the inquiries you get will be from people who have already decided the basics fit.

1. **Configuration and floor** — 3 BHK, 4th of 7, lift.
2. **Carpet area**, and say it is carpet. [Why this matters.](/blog/what-carpet-area-actually-means)
3. **Age and condition** — 6 years old, well maintained; or brand new, never occupied.
4. **Availability** — vacant now, or from 1 April, or currently tenanted with notice given.
5. **Parking** — one covered, allotted. In this city it is a decision-changer.

## Then the things a photo cannot show
This is where a description earns its keep, because it answers what the pictures cannot:

- Which way the flat faces, and whether the living room gets morning or evening sun.
- Water supply — corporation, bore, or both — and how it holds up in summer.
- Society maintenance, per month, and whether there is a corpus payable on transfer.
- What is walking distance: the school, the chemist, the bus stop.
- Whether the price is negotiable, and whether furniture is included.

## Name the flaw
This is the counterintuitive one, and it works.

If the flat is on the top floor, if the road is busy, if there is no lift — say so. Every buyer discovers it on the site visit anyway. Naming it does two things: it filters out the people who would have walked away, saving you both a Sunday, and it makes everything else you wrote more believable.

*"Third floor, no lift — which is why it's priced ₹3 Lakh below the others in this society"* is a stronger sentence than anything that omits it.

## Phrases that quietly cost you inquiries
- **"Price on discussion" / "Call for price."** Budget is the second filter almost everyone applies. A listing without a number is invisible to most searches.
- **"Prime location."** It means nothing. Name the road.
- **"Genuine buyers only."** Reads as defensive, and filters nobody.
- **ALL CAPS** and rows of exclamation marks. It reads as a shouted advertisement, which is the register buyers have learned to distrust.
- **"Investor rates"** without a number attached.

## Length
Six to ten short lines. Long enough to answer the five facts and the flaw, short enough to read on a phone at a traffic signal — which is genuinely where a lot of this gets read.

Break it into two or three small paragraphs. A wall of text gets skipped even when it is good.

> warn: No phone numbers, WhatsApp handles or external links in the description. They are detected automatically and the listing comes back for changes. The contact system exists so your number is not scraped off a public page — [here's how it works](/help/chat-inquiries/how-do-i-get-my-number-shared).

## A worked example
> 3 BHK on the 4th floor (lift) at Shivalik Residency, Kalawad Road. Carpet 1,050 sq ft. Vacant and ready to move.
>
> 6 years old, well maintained. East-facing living room, so it gets morning sun and stays cool by evening. Corporation water plus society bore — no tanker even in May. Maintenance ₹2,100/month.
>
> One covered parking, allotted. Walking distance to the school and two chemists; the 150 Feet Ring Road is a 5-minute drive.
>
> Top-floor unit above is vacant, so the building is quiet. Price is slightly negotiable for a ready buyer. Furniture not included.

Every sentence answers a question someone was going to ask. That is the whole technique.

Related: [the ten photos that sell a listing faster](/blog/10-photos-that-sell-your-listing-faster).`,
  },
];
