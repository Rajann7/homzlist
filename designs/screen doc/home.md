# Homzlist — Home Page Specification v4 (FINAL, A to Z, fully wired)

> Companion to the **Create Listing** spec (source of truth for listing fields/taxonomy). Governs the **home page** — the **public discovery front door** *and* the **role landing / dashboard router** for every logged-in role. Audited against **OLX, Housing.com, 99acres, MagicBricks, NoBroker**. Only real **Live** listings show; boost re-ranks silently; empty cities fill from **other cities/states** (never blank, never "notify").
>
> **What v4 changes (the big one):** every screen the v3 home only *promised* now **exists and is wired from here**. Home is no longer a standalone discovery page — it is the **hub that routes into all 17 other screens**: Search/Explore, Listing/Project View, Create Listing (via plan wall → Payment), **My Listings**, **My Project + Inventory**, **Leads/Inquiry**, **Saved**, **Notifications**, **Boost**, **Payment/Checkout**, **Billing**, **Verification**, **Edit Profile**, **Public Profile**, **Report/Flags/Help**, plus **Legal/Policy** and **System/Error** pages, and the isolated **Admin** back-office. **Nothing on home is a dead click** (build-rules `M3/M4/CORE-DEADPAGE`); every entry point below names its exact destination screen. §19 is the complete wiring map.

---

## 0. v4 audit — what this pass added (over v3)

1. **All dependencies are now built** — v3 §15 listed "Search Results" and "Listing Detail" as *specs to write next*. Both exist (**search-results**, **listing-view**), plus **13 more** screens. This pass **replaces "to write next" with a live wiring map** (§19).
2. **The Role Dashboard Home is now concrete** — v3 described a "dashboard" abstractly. It is now **composed of real screens**: the dashboard is a **KPI + task surface on home that deep-links into My Listings · Leads · My Project+Inventory · Boost · Billing · Verification** (§3, §13, §17).
3. **Every home surface names its destination** — top bar, tabs, filters, cards, CTAs, footer, and bottom nav each route to a **named, existing screen** (§6, §19). No orphan links.
4. **Legal/Policy + System/Error pages wired** — footer links to **Terms · Privacy · Refund · About · Contact**; global states resolve to the **System/Error** pages (404 · 500 · offline · maintenance). Both are the two remaining "Other Screen Pages" and are treated as real destinations, not text.
5. **Retained from v3, unchanged:** role model, never-empty fill ladder, card anti-gap spec, silent boost, no-maps, 3 distinct responsive layouts. v3's substance stands; v4 **connects** it.

---

## 1. Scope & Roles

| Role | Home landing | Browse | Send contact | Receive contact | Post | Boost |
|---|---|---|---|---|---|---|
| **Guest** | Discovery (public) | Yes | Login-gated | — | — | — |
| **Buyer** (individual/owner) | Discovery (personalised) | Yes | **Yes** | **Yes** (own listing) | **Property** | Yes |
| **Broker** (professional) | Dashboard + Discovery | Yes | **Yes** | **Yes** | **Property** | Yes |
| **Developer/Builder** | Dashboard only | Read-only | **No** | **Yes** | **Project** | Yes |

**Role model note:** "Buyer" is an *individual/owner* — they can look for property **and** list their own. "Broker" is the *professional* version (verified badge, multiple numbers, authorization checkbox). "Developer/Builder" is *supply-only* (posts projects, receives contacts, never sends, browses read-only).

---

## 2. Role Completeness Matrix (locked)

| Capability | Guest | Buyer | Broker | Builder | Lives on screen |
|---|---|---|---|---|---|
| Browse discovery / search | ✅ | ✅ | ✅ | ✅ (read-only) | home · **search-results** |
| See a listing's contact | Login | ✅ | ✅ | ✅ | **listing-view** §9 |
| **Send** contact (Call/WhatsApp) | ❌ | ✅ | ✅ | ❌ | **listing-view** §10 |
| Save / shortlist | Login | ✅ | ✅ | ✅ | **saved** |
| **Post** | ❌ | Property | Property | Project | **create-listing** (via plan wall → **payment**) |
| **Receive** contacts on own listing | ❌ | ✅ | ✅ | ✅ | **leads-inquiry** |
| Manage listings + leads (dashboard) | ❌ | Light (in profile) | Full | Full | **my-listings** · **my-project-inventory** · **leads** |
| Boost own listing | ❌ | ✅ | ✅ | ✅ | **boost** (via **payment**) |
| Verification | — | none | optional (badge) | optional (badge) | **verification** (never a gate) |
| Number visibility | — | Private/Public | Always public | Always public | create-listing / edit-profile |

**Consequences enforced everywhere:** builder never sees a "Send contact" button; guest's contact/save/post taps open the **login gate** (§9) then return to the action; a buyer who has posted also gets a lead inbox (**leads**). **Verification is optional trust only** — never blocks buying/listing/paying (payment spec, verification spec).

---

## 3. Two Home Types (both now fully built out)

- **A. Discovery Home** — public SEO/marketing front door. Default for **guest + buyer**; reachable by all. Body = one mixed live feed (§5–6). Search/filter deep-links into **search-results**; a card opens **listing-view**.
- **B. Role Dashboard Home** — the logged-in workspace. Default for **broker + builder**; **buyer gets a *light* version** in profile once they post. **The dashboard is not a new screen — it is a KPI + task surface that routes into the real management screens:**
  - **KPI strip** (live counts, leads, boosts, plan/slots) → each tile deep-links.
  - **Leads received** summary → **leads-inquiry**.
  - **My listings** summary → **my-listings** (broker/buyer) / **my-project-inventory** (builder, per project).
  - **Add property/project** → plan wall → **payment** → **create-listing**.
  - **Boost centre** → **boost**. **Plan/slots** → **billing**. **Verification** banner → **verification**.
  - **Notifications** → **notification** centre. **Saved** → **saved**.

Routing: not-logged-in / buyer → **Discovery**; broker + builder → **Dashboard** (Discovery one tap away; builder browses read-only, no contact button). See §13 for per-role composition and §19 for every link.

---

## 4. City & Content Model

- **City selector** persistent in the top bar; all discovery content scoped to it.
- Resolution: last-used → coarse IP city (no paid geo API) → manual. Never block on location.
- **No maps anywhere.** Geography is text: State → City → Locality → Area/Landmark → Pincode; nearby landmarks = text-with-distance.
- **Locality picking = text typeahead** over a seeded locality list per city (no map picker). Taxonomy values come from **create-listing** and are admin-editable master data.

---

## 5. Core Content Principle + Never-Empty

- Home body = **ONE mixed feed** of all property + project types together. No section per type; type/category/budget/BHK are **filters**, not sections.
- Fill ladder: **exact city → nearby cities (labelled) → other cities/across India (labelled) → marketing band expands**.
- **No "notify me", no "be first", no blank state — ever.** Other-city content is always labelled; nearby-first ordering keeps it relevant.
- Boost is a **silent re-rank** of real Live listings; **no "Promoted" badge** on the home feed. (On **search-results** the boosted tag is shown per that spec; home keeps it silent.)
- Dashboards never borrow other users' content — empty dashboard = a **task prompt** that routes to the fix (§9, my-listings §22).

---

## 6. Discovery Home — Sections (lean, A to Z) + where each routes

Each: **shows · source · ranking · empty/fallback · destination.**

- **A. Top App Bar** — mobile: logo · city · **bell (→ notification)** · **saved (→ saved)**. Desktop: logo · inline search (→ **search-results**) · city · nav · profile menu · **Post** CTA (→ plan wall → **payment** → **create-listing**).
- **B. Search + Tabs** — Buy / Rent / Projects; sub: Commercial · Plots · PG. Submitting or picking a tab/chip **opens search-results** with those filters applied (SEO URL).
- **C. Filters** — chips + drawer (mobile/tablet) / left sidebar (desktop): Budget · BHK · Category · Type · Ready · Status · **RERA** · Verified · Posted-by. Applying → **search-results**. *All "explore by" browsing lives here.*
- **D. Boosted Rail (O)** — short rail of boosted Live listings, **unlabelled** on home; empty → collapse. Card → **listing-view**.
- **E. Mixed Feed (R, body)** — all types + projects, city-scoped, infinite scroll; rank: boosted-silent → freshness → relevance → completeness; empty → fill ladder (never blank). Card → **listing-view**; heart → **saved** (login-gated); share → WhatsApp/copy; report → **report-flags-help**.
- **F. Marketing / Low-Inventory Band (R)** — expands when thin (§10); "List your property" CTA → plan wall → **payment**.
- **G. Why Homzlist** — private numbers · WhatsApp leads · RERA/verified · Made in India.
- **H. How It Works** — Search → Contact on WhatsApp → Visit & close (role-tuned).
- **I. Articles / Guides (O, SEO)** — CMS content (admin-managed).
- **J. Post / Boost CTA banners** — role-aware → plan wall (payment-first) → **payment** → **create-listing** / **boost**.
- **K. PWA install (O)**.
- **L. Footer** — cities & categories (→ **search-results**), company, **legal: Terms · Privacy · Refund · About · Contact** (→ Legal/Policy pages), **Made in India**.
- **M. Bottom Nav (mobile only)** — Home · Explore (→ **search-results**) · Post(+) (→ plan wall) · Saved (→ **saved**) · Profile (→ profile menu / **edit-profile**).
- **Global states** — skeletons (loading, auto-synced to the real card, build-rules `L10/B3/CORE-SKELETON`); in-voice error + retry → resolves to **System/Error** page on hard failure; offline last-cached city (PWA).

**Removed (still removed in v4):** all "Explore by" tiles, Trending Localities, per-type strips, New-Launch/Ready rails (projects live in the feed with a status badge), notify/be-first prompts.

---

## 7. Card Specification (gap-killer) — the ONE shared card

> This is the **single card definition** reused on home, **search-results**, **saved**, and **public-profile** portfolios (build-rules `M1/V9/CORE-SAMEUI` — defined once, propagates everywhere). Change it here, it changes everywhere.

### 7.1 Anti-gap rules (every card)
1. **Fixed skeleton + fixed height** — fixed image ratio + line-clamped text; all cards in a row match height.
2. **Only main/required fields** on the card; extras on **listing-view**.
3. **Collapsing dot-meta line** — optional specs joined by "·", render only if present: `3 BHK · 1,540 sqft · Flat`; missing values drop out (never blank/"N/A").
4. **Truncate, never wrap** — titles/names/locality → 1 line + ellipsis (CSS line-clamp).
5. **Headline = locality + city** (always short); long auto-title only on **listing-view**.
6. **Missing image → branded placeholder**, never broken.
7. **Tag row collapses** when no tags.
8. **Boosted → subtle lift only, no badge** on home.

### 7.2 Property card shortlist
- Always: cover · **Sale/Rent tag** · **price** · **locality+city**.
- One primary spec by category: Residential `{BHK}·{carpet}·{type}` · Plot `{plot area}·Plot` · Commercial `{built-up}·{type}` · PG `{occupancy}·{gender}·PG`.
- Optional tags: **Verified** (verification tier badge) · **RERA**. Optional footer: posted time.
- Price: `₹78 L` / `₹1.35 Cr` / `₹22,000/mo`; on-request → "Price on request".

### 7.3 Project card shortlist
- Always: cover · **project name** (1-line) · **builder** (→ **public-profile**) · **status badge** · **price range** · **locality+city**. Optional: RERA Verified. (Status badge replaces the Sale/Rent tag.)

### 7.4 Contact affordance
- Public → Call + WhatsApp (auto-message) on **listing-view**. Buyer-private → masked, reveal on login. Guest → login. **Builder → no contact button.**

---

## 8. Responsive — 3 Distinct Layouts Across EVERY Surface

Not scaled copies. Each breakpoint restructures nav, filters, feed, cards, and the dashboard (build-rules `A10/V3/V4` + premium responsive rules — recomposed, never shrunk).

### 8.1 Master matrix

| Surface | Mobile (<640) | Tablet (640–1024) | Desktop (>1024) |
|---|---|---|---|
| **Nav** | Bottom tab bar + mini top (logo/city/bell) | Top bar (logo+search+city+profile) | Top bar + big inline search + **Post** CTA |
| **Search** | Full-width row under top bar | Inline in nav | Large inline in nav |
| **Filters** | Chips + **full-screen drawer** | Chips + **right slide-over** | **Persistent left sidebar** |
| **Feed columns** | **1** (wide card) | **2** | **3–4** |
| **Card style** | Image-top wide card | Compact grid card | Compact grid + **hover lift/quick actions** |
| **Boosted rail** | Horizontal scroll | Horizontal scroll | Inline top row of grid |
| **Marketing band** | Stacked full-width | 2-up blocks | Wide multi-column |
| **Dashboard** | Stacked cards + bottom tabs | 2-col panels + top tabs | **Left side-nav + multi-panel** (KPIs top, leads + listings side-by-side) |
| **Footer** | Accordion sections | 2-column | Multi-column |

### 8.2 Why each is different
- **Mobile** optimises thumb reach: bottom tabs, one wide card, filters as a full sheet.
- **Tablet** switches to a top bar + 2-col grid + slide-over filters — a browsing layout, not a phone stretched.
- **Desktop** is a workspace: left filter sidebar always visible, 3–4 col grid, hover interactions, and the dashboard becomes multi-panel with a left side-nav that pivots between **my-listings / leads / boost / billing / verification**. Different IA, not a bigger phone.

---

## 9. Home Interaction Details (each ties to a destination screen)

- **Sort:** Newest · Price low→high · Price high→low · Relevance. (Boosted always respected within sort.) Full sort/filter power on **search-results**.
- **Saved / Shortlist:** heart on cards → **saved**; guest saves held in session and **merged to the account on register/login** (saved §4); saved view accessible from nav/profile.
- **Recently viewed:** buyer sees a "Recently viewed" strip (session/account) — lightweight personalisation; cards → **listing-view**.
- **Notifications (bell → notification):** listing approved/rejected, **lead received**, saved-listing price drop / went live, plan expiring, boost ending, verification result. Role-filtered; every notification is clickable and deep-links to its target screen (notification §9).
- **Share:** every listing has Share → WhatsApp + copy link (uses the SEO slug from **listing-view**).
- **Report / flag:** every listing/profile has a report action → **report-flags-help** form → admin queue.
- **Boosted slots:** fixed count in the rail + fixed feed positions (e.g. 1, 6, 11); **fair rotation**; city-scoped; sourced from **boost**.
- **Auth gate:** contact / save / post / reveal-number for guests opens a **login/register sheet** (phone-first), then returns to the same action. Guest saves merge on auth.
- **Dashboard empty states:** builder 0 projects → "Add your first project"; broker/buyer 0 listings → "Post your first property"; 0 leads → "No leads yet — boost to get seen." Each CTA routes (create/plan-wall/boost). Never other-user content.
- **UI language:** listing language field is EN/GU/HI; **UI localisation is a pending decision** (recommend EN first, GU/HI later) — noted, not assumed.

---

## 10. Marketing / Low-Inventory Experience

When a city or the platform is thin on Live listings, the home **sells the platform** (no "notify"):
1. Value headline — "{City}'s simplest way to buy, rent & list property."
2. Post CTA — "List your property — reach buyers across India." → plan wall → **payment** → **create-listing**.
3. Trust stats — cities/listings/verified builders (honest/seeded, never fake).
4. How it works + Why Homzlist.
5. Featured cities — jump to cities with inventory (→ **search-results**).
6. Testimonials (as they accrue).

Feed full → band is one slim strip; feed thin → band expands while other-city listings fill the rest. Always full, always selling.

---

## 11. Boost Placement (silent) — home side of the boost spec

All roles boost own Property/Project (paid, via **boost** → **payment**) → top boosted rail (unlabelled on home) + priority feed slots + top of filtered results. **No badge on home.** Fair rotation. Re-ranks real Live listings only. Ranking config is admin-set; the **boost** screen owns buy/activate/manage — home only renders the placement.

---

## 12. Search & Filter (maps to taxonomy) — home entry into search-results

Tabs Buy/Rent/Projects (+Commercial/Plots/PG). Filters: Category · Type · Budget · BHK · Carpet-area · Locality/Area (typeahead) · Furnishing · Possession/Ready · Status · **RERA** · Verified · Posted-by. Placement per §8. **Values from Create Listing enums.** Any search/filter/tab action **navigates to search-results** (which owns autocomplete, saved-searches, SEO URLs, and no-result recovery); results reuse the §7 card + fill ladder.

---

## 13. Role-Specific Homes (wired to real screens)

- **Guest:** full Discovery; gated actions → login sheet → return; strong Register CTA. Legal pages in footer; Help/Contact reachable (**report-flags-help**).
- **Buyer:** Discovery + recent searches / **saved** / recommended / recently-viewed; can contact (**listing-view**); **post property → plan wall → payment → create-listing**; a **light my-listings + leads** area in profile once they post; can **boost**; **billing** for orders; **edit-profile** for account.
- **Broker:** **Dashboard default** — KPI strip · leads received (**leads**) · my listings (**my-listings**) · add property → plan wall → **payment** → **create-listing** · **boost** centre · plan/slots (**billing**) · optional **verification** badge · **notification** · **saved** — **plus** full Discovery + contact.
- **Developer/Builder (dashboard only):** **verification** banner (optional badge, not a gate) · KPIs · **leads inbox = main screen** (**leads**; Call+WhatsApp, mark status, receive-only) · my projects (**my-project-inventory** per project: stage/leads/inventory, availability toggles, edit) · add project → plan wall → **payment** → **create-listing** · plan/slots (**billing**) · **boost** centre · market insights · browse public (read-only, no contact).

---

## 14. Data, Ranking & Freshness

- Only **Live** listings public; Draft/Pending/Rejected/Under-Re-review/Paused/Expired/Withdrawn hidden. Sold/Rented excluded from active feeds (own page marked Sold/Rented on **listing-view**).
- Feed rank: boosted → freshness → relevance (city+type/locality) → completeness (photos, price, RERA).
- Personalisation lightweight/session-based; no external data broker; near-zero-cost internal ranking.

---

## 15. Connected Screens — ALL BUILT (replaces v3 "specs to write next")

> v3 §15 flagged Search Results + Listing Detail as pending. **Both exist. So do 13 more.** Home links *into* every one; none is a dead click. This is the inventory; §19 is the click-by-click map.

| # | Screen (file) | Reached from home via | Owns |
|---|---|---|---|
| 1 | **search-results** | search bar · tabs · filters · footer cities/categories · Explore nav | search · autocomplete · dynamic filters · sort · saved-searches · SEO URLs · no-result recovery |
| 2 | **listing-view** | any card tap · boosted rail · recently-viewed | full detail · gallery · contact · **inquiry** · share · report · similar |
| 3 | **create-listing** | Post CTA / banners (after plan wall + payment) | field-by-field property/project form · drafts · media · inventory fields |
| 4 | **payment** | plan wall (Post · Boost · Relist/Renew) | unified checkout · plans/trials · admin benefits · GST invoice · issue handling |
| 5 | **billing** | profile menu · plan/slot KPI tiles | lifetime plans & slots · payment history · invoices · reversals |
| 6 | **boost** | dashboard boost centre · listing management | buy/activate/manage day-wise boost · reuse rule |
| 7 | **my-listings** | dashboard · profile · "my listings" tiles | poster's management hub (all statuses · lifecycle · needs-attention) |
| 8 | **my-project-inventory** | dashboard · a project in my-listings | one project deep-manage · tower/wing/floor/unit inventory · availability |
| 9 | **leads-inquiry** | bell deep-link · dashboard leads tile · card lead counts | leads received + inquiries sent · pipeline · call/WhatsApp |
| 10 | **saved** | top-bar heart · bottom nav Saved · profile | saved/shortlisted properties+projects · price/went-live tracking |
| 11 | **notification** | top-bar bell (+ bottom nav) | in-app centre + engine · all events · deep-links |
| 12 | **verification** | dashboard banner · edit-profile | tiered trust badge apply/manage (optional, never a gate) |
| 13 | **edit-profile** | profile menu | own profile + account settings + notification prefs + delete account |
| 14 | **public-profile** | poster/builder name tap · card | public view of a user (portfolio · badge · ratings) |
| 15 | **report-flags-help** | report action · footer help · profile | report/flag form + My Reports + Help Center + tickets |
| 16 | **Legal/Policy pages** | footer (Terms · Privacy · Refund · About · Contact) | static legal/marketing content (admin CMS) |
| 17 | **System/Error pages** | global states (404 · 500 · offline · maintenance) | friendly fallbacks + reference ID (errors report admin-side) |
| — | **admin** (account.homzlist.com) | *not from home* — isolated subdomain | the other side of every hand-off (approval, moderation, payments, config) |

---

## 16. Competitive Audit (borrowed)

| Site | Borrowed | Applied |
|---|---|---|
| OLX | One mixed "fresh recommendations" feed, boosted mixed in | Feed (§6E); silent boost (§11) |
| Housing.com | Card hierarchy (price→spec→locality), strong project cards | Card (§7) |
| 99acres | Rich filters, RERA/verified trust | Filters (§12) → search-results; trust tags |
| MagicBricks | Budget/possession framing, seller CTAs | Filters + Post CTAs → create-listing |
| NoBroker | Clean owner listings, direct contact | Owner listings + Why (§6G) |

---

## 17. Key Decisions & Pro / Cons

- **Home is the router, not just discovery:** ✅ one hub reaches all 17 screens, nothing orphaned · ⚠️ more link surface — mitigated by the §19 map + dead-link CI.
- **Dashboard = KPI/task surface over real screens (not a monolith):** ✅ reuses my-listings/leads/boost/billing, no duplicate management UI · ⚠️ more navigation hops — mitigated by deep-linking each tile straight to the action.
- **Buyer can post (individual/owner):** ✅ more supply, matches Create Listing spec · ⚠️ buyer/broker overlap — resolved via broker = verified/professional extras.
- **No "Explore by" tiles:** ✅ lean, no empty sections · ⚠️ one less one-tap browse — mitigated by chips/sidebar → search-results.
- **Empty → other-city (no notify):** ✅ always full, doubles as discovery · ⚠️ off-city results — mitigated by labels + nearby-first.
- **Boost silent on home, labelled on search:** ✅ clean home, honest results page · ⚠️ two behaviours — accepted, each is intentional per its spec.
- **3 distinct layouts:** ✅ each device gets the right IA · ⚠️ more build — accepted; the shared §7 card reduces cost.

---

## 18. Quality Floor (build checklist)

- 3 distinct layouts at 360 / 768 / 1280px (not scaled).
- Every card equal-height; long names truncate; missing fields drop out; missing image → placeholder. Card is the **single shared definition** (build-rules `M1`).
- Feed never blank (other-city + marketing fill).
- Boost silent on home (no badge). No maps. Only Live public. Role contact rules enforced (builder no send).
- Guest gates work and return to the action. Saved merges on register.
- **Every entry point resolves to a real, existing screen** (§19) — dead-link/dead-action CI passes (build-rules `M3/M4`).
- Skeletons auto-synced to the real card; errors show a friendly fallback + ref ID and report admin-side.
- Visible focus; reduced-motion; PWA installable; offline = last-cached city.

---

## 19. Navigation & Wiring Map (every home click → its screen)

> The definitive "nothing dead" table. Left = a surface on home; right = exactly where it goes. If a destination is not yet deployed in a phase, it uses a **designed stub** (build-rules stub registry `M3`), never a dead click.

### 19.1 Top app bar / nav
- **Logo** → home. **City selector** → re-scopes the feed (no navigation).
- **Inline / opened search · Explore** → **search-results** (with query/filters + SEO URL).
- **Bell** → **notification** centre. **Heart / Saved** → **saved**.
- **Profile menu** → Edit Profile (**edit-profile**) · My Listings (**my-listings**) / My Projects (**my-project-inventory**) · Leads (**leads**) · Billing (**billing**) · Verification (**verification**) · Help (**report-flags-help**) · Logout.
- **Post CTA** → plan wall → **payment** → **create-listing**.

### 19.2 Search / tabs / filters
- **Buy / Rent / Projects tabs**, **Commercial/Plots/PG sub-tabs**, **filter chips/drawer/sidebar**, **sort** → all open/refine **search-results**.

### 19.3 Feed & cards
- **Card tap** (property/project) → **listing-view** (visitor view; owner sees owner view + Edit).
- **Heart on card** → **saved** (guest → login sheet → return).
- **Share on card** → WhatsApp/copy (slug). **Report on card** → **report-flags-help** (pre-scoped to that listing).
- **Poster/builder name** → **public-profile**.
- **Boosted rail card** → **listing-view**. **Recently-viewed strip** → **listing-view**.
- **Contact (Call/WhatsApp)** → happens on **listing-view** §10 (Buyer/Broker only; guest login-gated; builder no send).

### 19.4 CTAs & banners
- **Post / "List your property" / marketing band CTA** → plan wall → **payment** → **create-listing**.
- **Boost banner** → **boost** → **payment**.
- **"Get verified" banner** (broker/builder) → **verification**.
- **Relist/Renew nudges** (dashboard) → **payment** (Relist context) → re-approval.

### 19.5 Role dashboard tiles (broker/builder; buyer light)
- **Leads received / new** → **leads-inquiry**.
- **My listings / by-status counts** → **my-listings**.
- **A project → Manage** → **my-project-inventory** (builder).
- **Active boosts / boost centre** → **boost**. **Plan / slots / expiring** → **billing** (buy/renew → **payment**).
- **Verification status** → **verification**. **Add property/project** → plan wall → **payment** → **create-listing**.

### 19.6 Footer
- **Cities · Categories · Types** → **search-results** (SEO URLs).
- **Terms · Privacy · Refund · About · Contact** → **Legal/Policy pages**.
- **Help / Support** → **report-flags-help**.

### 19.7 Global states
- **Loading** → skeletons (auto-synced). **Empty feed** → fill ladder / marketing band (never a dead state).
- **Hard error** → **System/Error page** (friendly + ref ID; full report admin-side).
- **Offline (PWA)** → last-cached city, marked "offline — last updated …".
- **Session expired mid-action** → login sheet → return to the same target.

---

## 20. Cross-screen Consistency

- **Card** → the single shared definition here (§7) is reused on **search-results** · **saved** · **public-profile** portfolios (build-rules `M1/CORE-SAMEUI`).
- **Save / heart & auth gate** → **saved** (merge on register) + login sheet; heart state syncs across home, search, and listing-view.
- **Search / filter / sort** → **search-results** owns the full engine; home only launches it with taxonomy values from **create-listing**.
- **Contact / inquiry** → **listing-view** §10 + **leads-inquiry** (Buyer/Broker send, Builder can't).
- **Post → plan wall → payment → create-listing** → payment-first; a draft holds the slot (payment §2, create-listing §2).
- **Boost** → silent on home (§11), labelled on **search-results**; buy/manage on **boost**; pays via **payment**.
- **Dashboard** → composed of **my-listings** · **my-project-inventory** · **leads** · **boost** · **billing** · **verification** (§13).
- **Bell + unread badge** → **notification** engine; every event clickable to its screen.
- **Verification badge** → shown on cards/poster block per **verification**; optional, never a gate (payment).
- **Legal alerts / footer legal** → **Legal/Policy pages**; **errors** → **System/Error pages** (admin-side reporting).

---

## 21. Referenced Screens (defined elsewhere)

**search-results** · **listing-view** · **create-listing** · **payment** · **billing** · **boost** · **my-listings** · **my-project-inventory** · **leads-inquiry** · **saved** · **notification** · **verification** · **edit-profile** · **public-profile** · **report-flags-help** · **Legal/Policy pages** (Terms · Privacy · Refund · About · Contact) · **System/Error pages** (404 · 500 · offline · maintenance) · **admin** (account.homzlist.com — the other side of every hand-off).
