# Create Listing — Specification (Full Per-Type Fields)

> Marking: **(R)** = required, **(O)** = optional. Each type below = **its listed Shared Blocks (Section 3)** + the **type-specific fields** shown under it. Nothing is shared implicitly — if a block is not listed for a type, it does not apply.

## 1. Scope & Role Behaviour
- **Buyer** & **Broker** → post a **Property** (same options).
- **Developer / Builder** → post a **Project** (different form).
- Buyer/Broker post **only** Property; Developer/Builder post **only** Project.

## 2. Entry & Payment Gating
- All listing types visible before creating (browse-only).
- Click type → **plan wall (payment-first)** (plan pricing on a separate screen).
- After purchase → routed into the create form.
- No free first listing. No refund after payment.
- Each published listing consumes **one purchased slot**; a **draft holds the slot** until published or discarded.
- **Draft save & resume** throughout; autosave to prevent data loss.

---

## 3. Shared Field Blocks

### 3.1 Listing Basics
- Transaction type — Sell / Rent **(R)** *(Property only; Project uses status)*
- Category — Residential / Commercial / Plot-Land **(R)**
- Type **(R)**
- Title — auto-generated from a per-type template (`{BHK} {Type} for {Sell/Rent} in {Area}, {City}`), editable; URL slug derived **(R)**
- Description — rich text, length-limited **(R)**
- Listing language — English / Gujarati / Hindi **(O)**

### 3.2 Location Block
- State **(R)**
- City **(R)**
- Locality / Sub-locality **(R)**
- Area / Landmark **(R)**
- Society / Building / Project name **(O)**
- Pin code **(R)**
- Full address (house/plot/building no. + street) — **stored, Full address consistency — aa screen par full address show view screen par** **(R)**
address che ae view screen proeprty/project ma show thase
### 3.3 Contact Block
- Contact number — logged-in number or custom number (custom = **OTP-verified**) **(R)**
- WhatsApp number — default = contact number, editable **(O)**
- Number visibility — Private / Public *(Buyer only; Broker & Developer/Builder always Public)* **(R)**
- Multiple numbers *(Broker on Property; Developer/Builder on Project)* **(O)**
- Alternate number **(O)**
- Email **(O)**
- Best time to call **(O)**
- Preferred contact method **(O)**
- *Public listing displays:* name + role, image, contact details, WhatsApp auto-filled message.

### 3.4 Media Block
- Photos — min enforced; max **10** (Property) / **15** (Project) **(R)**
- Cover / primary image **(R)**
- Image order **(O)**
- Captions **(O)**
- Floor-plan image(s) **(O)**
- Image category tags — Interior / Exterior / Floor plan / Amenities **(O)**
- Auto-watermark — system applied

### 3.5 Amenities Block (Property)
Structured multi-select: Lift, Power backup, Security / CCTV, Water supply (24hr / Corporation / Borewell), Gym, Swimming pool, Club house, Garden / Park, Kids play area, Visitor parking, Gas pipeline, Rainwater harvesting, Fire safety, Intercom, Community hall. **(O)**

### 3.6 Pricing — Sell Block
- Total price **(R)**
- Price per sq.ft — auto/editable **(O)**
- Price negotiable **(O)**
- Price on request (hides amount) **(O)**
- Booking / token amount **(O)**
- Loan available / bank approved **(O)**
- Monthly maintenance **(O)**
- Other charges (registration / stamp / GST) **(O)**
- Brokerage — Broker: charged Y/N + %/amount; Owner: **No Brokerage** badge **(R)**

### 3.7 Pricing — Rent Block
- Monthly rent **(R)**
- Security deposit **(R)**
- Maintenance — monthly / included **(O)**
- Available from date **(R)**
- Preferred tenant — Family / Bachelor / Company / Any **(O)**
- Lock-in period **(O)**
- Brokerage — as above **(R)**

### 3.8 Area Sub-block (where applicable)
- Carpet area **(R)** · Built-up area **(O)** · Super built-up area **(O)** · Area unit — sq.ft, sq.yd/gaj, sq.m **(R)**

### 3.9 Connectivity / Nearby (optional)
- Nearby landmarks with distance — School, Hospital, Metro / Bus stop, Highway, Market / Mall, Airport, Railway station **(O)** *(text-based only — no map)*

---

## 4. Conditional / Select-Driven Rules

The form re-renders on every controlling selection:

- **Transaction = Sell** → show **Pricing-Sell** block; **Rent** → show **Pricing-Rent** block.
- **Category** selected → show only that category's **type** list.
- **Type** selected → load that type's full field set (Section 5/6); previously shown other-type fields are removed.
- **Possession status = Under construction** → show **Possession date**; **Ready to move** → hide it.
- **Furnishing = Semi / Fully** → show **Furnishing details** multi-select; **Unfurnished** → hide.
- **Parking = Yes** → show covered/open **count**.
- **Food available = Yes** (PG) → show **Food type** + **Meals**.
- **Loan available = Yes** → show **bank** field.
- **Corner plot = Yes** → show **open sides**.
- **Project status** selected → show that status's fields (Section 6.2).
- **RERA number** entered & validated → **RERA Verified** tag; RERA-exempt → **RERA not applicable**; invalid/expired/empty → no tag.
- **Price on request = On** → hide price amount on the listing.

---

## 5. Property Post — Types & Full Fields (Buyer & Broker)

### 5.1 Residential

**Flat / Apartment** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 3.9(O), Pricing(by transaction)
- Bedrooms / BHK (1RK, 1–5+ BHK) **(R)**
- Bathrooms **(R)**
- Balconies **(O)**
- Additional rooms — Servant / Study / Pooja / Store **(O)**
- Furnishing status **(R)** + Furnishing details **(O)**
- Floor number **(R)** · Total floors **(R)**
- Facing / direction (N/S/E/W/NE/NW/SE/SW) **(O)** · Overlooking **(O)**
- Possession status **(R)** · Possession date (if under construction) **(R)** · Property age (if resale) **(O)**
- Ownership type (Freehold / Leasehold / PoA / Co-op society) **(O)**
- Covered parking count **(O)** · Open parking count **(O)**
- Water availability **(O)** · Flooring type **(O)** · Power backup **(O)**
- RERA number (if in a RERA project) **(O)**

**Builder Floor / Independent Floor** — same as Flat/Apartment, plus:
- Which floor of the independent building **(R)** · Total floors in building **(R)** · Independent/shared entrance **(O)**

**Studio Apartment** — same as Flat/Apartment, except:
- Configuration = Studio / 1RK **(R)** (no multi-BHK) · Carpet area **(R)** · Furnishing **(R)** · Floor / total floors **(R)**

**Bungalow / Villa / Row House / Independent House** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.5(O), 3.8, 3.9(O), Pricing(by transaction)
- Bedrooms / BHK **(R)** · Bathrooms **(R)** · Balconies **(O)**
- Additional rooms **(O)**
- Plot / land area + unit **(R)**
- Built-up / construction area + unit **(R)**
- Number of floors in the house **(R)**
- Furnishing status **(R)** + details **(O)**
- Facing **(O)** · Garden / terrace **(O)**
- Possession status / age **(R)** · Possession date (if under construction) **(R)**
- Ownership type **(O)** · Parking count **(O)**

**Penthouse** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 3.9(O), Pricing(by transaction)
- Bedrooms / BHK **(R)** · Bathrooms **(R)** · Balconies **(O)**
- Private terrace area + unit **(O)**
- Furnishing **(R)** + details **(O)**
- Floor number (top) **(R)** · Total floors **(R)**
- Facing **(O)** · Overlooking **(O)**
- Possession status / date **(R)** · Ownership **(O)** · Parking count **(O)**

**Tenement** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.5(O), 3.8, 3.9(O), Pricing(by transaction)
- Bedrooms / BHK **(R)** · Bathrooms **(R)**
- Plot area + unit **(R)** · Built-up area + unit **(R)**
- Number of floors **(R)** · Furnishing **(R)** + details **(O)**
- Facing **(O)** · Age / possession **(R)** · Ownership **(O)** · Parking **(O)**

**Farmhouse** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.9(O), Pricing(by transaction)
- Bedrooms **(O)** · Bathrooms **(O)**
- Plot / land area + unit **(R)** · Built-up / construction area + unit **(R)**
- Furnishing **(O)** + details **(O)**
- Facing **(O)** · Swimming pool / garden **(O)**
- Water source **(O)** · Electricity connection **(O)**
- Age / possession **(O)** · Ownership **(O)**

**PG / Hostel Room** *(Rent only)* — Blocks: 3.1, 3.2, 3.3, 3.4
- Room type / occupancy — Single / Double / Triple / Shared / Dormitory **(R)**
- Gender preference **(R)** · Suitable for — Student / Working professional / Any **(O)**
- Food available Y/N **(O)** → Food type (Veg / Non-veg / Both) + Meals (breakfast/lunch/dinner) **(O)**
- Bathroom — Attached / Shared **(O)**
- Room amenities — bed, wardrobe, AC, geyser **(O)**
- Common amenities — Wi-Fi, laundry, housekeeping, TV, fridge, RO, power backup, parking, lift, security **(O)**
- Rules — gate closing time, visitor policy, smoking/drinking allowed, guardian required **(O)**
- Notice period **(O)** · Available from **(R)**
- Per-bed rent **(R)** · Security deposit **(R)** · Other charges (electricity / maintenance) **(O)** · Brokerage **(R)**

### 5.2 Commercial

**Office** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.5(O), 3.8, 3.9(O), Pricing(by transaction)
- Floor number **(R)** · Total floors **(R)**
- Fit-out — Bare shell / Warm shell / Furnished **(R)** + details (workstations, cabins, AC) **(O)**
- Number of cabins **(O)** · Seats / workstations **(O)** · Conference room **(O)** · Pantry **(O)**
- Washrooms — Private / Shared + count **(O)** · Lift **(O)**
- Power backup **(O)** · Power load (KVA) **(O)** · Parking count **(O)**
- Facing **(O)** · Suitable for / previously used **(O)**
- Occupancy certificate / Fire NOC **(O)** · Age / possession **(O)** · Ownership **(O)**

**Shop** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.8, 3.9(O), Pricing(by transaction)
- Floor (Ground / other) **(R)** · Frontage / entrance width **(O)**
- Furnishing **(O)** · Washroom **(O)** · Power load **(O)** · Parking **(O)**
- Corner shop **(O)** · Main-road facing **(O)** · Facing **(O)**
- Suitable for **(O)** · Age / possession **(O)** · Ownership **(O)**

**Showroom** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.8, 3.9(O), Pricing(by transaction)
- Floor **(R)** · Frontage width **(O)** · Ceiling height **(O)**
- Furnishing **(O)** · Washrooms **(O)** · Power load **(O)** · Parking **(O)**
- Main-road facing **(O)** · Facing **(O)** · Suitable for **(O)** · Age / possession **(O)** · Ownership **(O)**

**Godown / Warehouse** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.9(O), Pricing(by transaction)
- Built-up area + unit **(R)** · Carpet area **(O)**
- Ceiling / roof height **(O)** · Shutter height / entry width **(O)** · Floor / ground level **(O)**
- Loading-unloading dock **(O)** · Truck access **(O)**
- Power load (KVA) **(O)** · Washroom **(O)** · Parking **(O)**
- Suitable for (storage type) **(O)** · Age / possession **(O)** · Ownership **(O)**

**Industrial Shed / Factory** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.9(O), Pricing(by transaction)
- Built-up area + unit **(R)** · Plot area + unit **(O)**
- Ceiling height **(O)** · Power load (KVA) **(R)** · Water connection **(O)**
- Effluent / drainage / pollution NOC **(O)** · Crane facility **(O)** · Loading dock **(O)**
- Zone (industrial) **(O)** · Age / possession **(O)** · Ownership **(O)**

**Co-working Space** *(Rent only)* — Blocks: 3.1, 3.2, 3.3, 3.4, 3.9(O)
- Seat type — Hot desk / Dedicated desk / Private cabin **(R)** · Number of seats **(R)**
- Furnishing (furnished) **(O)** · Amenities — Wi-Fi, meeting room, pantry, printer, reception, AC **(O)**
- Washrooms **(O)** · Parking **(O)** · Available from **(R)**
- Per-seat rent **(R)** · Deposit **(O)** · Lock-in **(O)** · Brokerage **(R)**

### 5.3 Plot / Land *(Sell only)*

**Residential Plot** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.9(O), Pricing-Sell
- Plot area + unit (sq.ft / sq.yd / sq.m / Bigha / Vigha / Guntha / Acre / Hectare) **(R)**
- Plot dimensions (L × W) **(O)** · Plot facing **(O)**
- Road width (facing road) **(O)** · Corner plot **(O)** → open sides **(O)** · Boundary wall **(O)**
- Gated society **(O)**
- Zone / land use (Residential) **(O)** · FSI **(O)** · Construction permitted / floors allowed **(O)**
- Ownership / khata type **(O)** · Title clear / litigation-free **(O)** · Approvals (NA / plan sanction) **(O)**

**Commercial Plot** — same as Residential Plot, plus:
- Zone / land use (Commercial) **(O)** · Suitable for **(O)**

**Industrial Plot / Land** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.9(O), Pricing-Sell
- Plot area + unit **(R)** · Zone (Industrial / GIDC) **(O)**
- Power availability **(O)** · Water connection **(O)** · Road / approach **(O)**
- NA / approvals **(O)** · Ownership / khata **(O)** · Title clear **(O)**

**Agriculture Land** — Blocks: 3.1, 3.2, 3.3, 3.4, 3.9(O), Pricing-Sell
- Land area + unit (Bigha / Vigha / Guntha / Acre / Hectare) **(R)**
- Road access / approach **(O)** · Water source (well / borewell / canal) **(O)** · Electricity connection **(O)**
- Soil type **(O)** · Currently cultivated / crop **(O)** · Boundary **(O)**
- Ownership / 7-12 / khata **(O)** · Title clear **(O)** · Price per unit (bigha / guntha) **(O)**

**Farm Land** — same as Agriculture Land, plus:
- Construction / farmhouse present **(O)** · Fencing **(O)** · Plantation / trees **(O)** · Water body **(O)**

---

## 6. Project Post — Full Fields (Developer / Builder)

### 6.1 Project Common Fields — Blocks: 3.2, 3.3 (always public, multi-number), 3.4 (max 15), 3.9(O)
- Project name **(R)** · Builder / developer name (auto from profile) **(R)**
- Category — Residential / Commercial **(R)** · Sub-type **(R)** · Status **(R)**
- Number of phases **(O)** · Total project / land area (acres) **(O)** · Open / green area % **(O)**
- Total towers / blocks / wings **(O)** · Total units **(O)** · Total floors per tower **(O)**
- **Configurations table** — per config: type, carpet area, built-up, size, price range, floor-plan image, availability **(R)**
- Price range (min–max) **(R)** · Price per sq.ft **(O)**
- Other charges / price includes (GST / registration / maintenance / parking) **(O)** · Payment plan (down-payment / construction-linked) **(O)**
- Bank approvals (approved-loan banks) **(O)**
- Approvals & clearances — 7/12, NA order, title, commencement certificate, OC **(O)**
- Amenities (project) **(O)** · Specifications (flooring / fittings / kitchen / doors) **(O)**
- Floor plans + Master / layout plan (images) **(O)**
- Possession / completion date **(R, by status)** · Launch date **(conditional)**
- Brochure (PDF) **(O)** · Price-list (PDF) **(O)**
- Description **(R)** · Media (max 15) **(R)** · Contact (always public, multi-number) **(R)**

### 6.2 Status-Based Fields
- **Upcoming:** expected launch date, planned configs, expected price range, expected possession
- **Pre-Launch:** launch date, pre-launch price, configs, booking-open date, expected possession
- **New Launch:** launch date, current price, available configs, possession date
- **Under Construction:** % completed, construction stage, work remaining, units sold / available, expected completion / possession date, current price
- **Ready to Move:** possession available now, ready units, OC received (Y/N), current price

### 6.3 Sub-type-Specific Fields

**Apartment / Flat project**
- **Wing / tower-wise structure:** per wing → total flats, floors, flats per floor, unit inventory (Available / Booked / Sold) — Tower → Wing → Floor → Unit **(R)**
- Configs: 1/2/3/4 BHK with carpet/built-up, size, price, floor plan **(R)**
- Ground-floor commercial (with full commercial sub-fields) **(O)**

**Villa / Independent House / Bungalow project**
- Number of villas / units **(R)** · Plot size range + built-up range **(R)** · Configs (BHK) + floor plan **(R)** · Unit inventory **(O)**

**Residential Plot / Land (Plotting) project**
- Total plots **(R)** · Plot sizes available (range) + unit **(R)** · Price per unit (sq.yd / guntha) **(R)** · Plot dimensions **(O)**
- Zone / NA / approvals **(O)** · Amenities (gated, internal roads, water, electricity) **(O)** · Inventory (Available / Booked / Sold) **(O)**

**Penthouse project** — top-floor units + private terrace area + configs + inventory

**Farmhouse project** — plot sizes, built-up range, amenities, number of units

**Commercial project (Office / Shop / Showroom / Complex)** — Rent / Buy option in the type field
- Unit types (Shop / Office / Showroom) **(R)** · Floor-wise units **(R)** · Unit sizes (carpet / built-up) range **(R)** · Price range / per sq.ft **(R)** · Floor plans **(O)** · Inventory **(O)**

**Commercial Land project** — plot sizes, zone, approvals, price per unit, inventory

### 6.4 RERA (Project)
- **RERA number(s)** — multiple supported (one per phase) **(R if applicable / O)**
- RERA-exempt (< 500 sq.m or < 8 units) → **RERA not applicable** flag.
- On entry, validated against the **state RERA portal** (validity / expiry); on success, project name / promoter / valid-till **auto-populated**.
- **RERA Verified** tag only when validation passes and registration is valid; invalid / expired / empty → no tag.
- **RERA status link** opens the correct state portal (Gujarat → GujRERA) with details.

---

## 7. Listing Lifecycle & States

| State | Behaviour |
|---|---|
| **Draft** | Editable, deletable, resume, autosave. Holds the purchased slot. |
| **Pending Approval** | Completed listing enters the admin staff queue. |
| **Live** | Approved and published. |
| **Rejected** | Returned with a reason; edit & resubmit within the paid window. |
| **Under Re-review** | Resubmitted or edited-live listing back in the queue. |
| **Paused** | Live listing paused without edit — see resume rule. |
| **Edited (Live)** | Sends for re-approval; admin sees a diff. Published version stays live until approved. |
| **Withdrawn** | Owner takes a live listing down (soft delete); re-listable within the remaining plan window. |
| **Expired** | Plan duration ended; renewal required to relist. |
| **Sold-out / Rented-out** | Marked closed; stays visible marked **Sold / Rented**, excluded from active search. |

**Pause / resume rule:** paused without edit and resumed within **30 days** → goes live directly (no re-approval); paused **> 30 days** → re-approval on resume.

**Approval flow:** Completed listing → admin staff queue → Approve (Live) / Reject (with reason). Edits to a live listing re-enter the queue as **Under Re-review**.

---

## 8. Submission
- **Preview** the full listing before final submit.
- **Declaration & Terms acceptance** required at submit.
- **Broker authorization** checkbox — confirms authorized to list the property.

---

## 9. Validation Rules
- All **(R)** fields enforced before submit; **(O)** may be blank.
- Phone: **+91**, 10-digit only; custom contact number must be **OTP-verified**.
- Images: enforced min/max (10 / 15 by role), allowed formats, max file size.
- Description: min / max length enforced.
- Price & area: numeric, sane ranges.
- Area stored in a **canonical unit**; displayed in the user's chosen unit. Price displayed in Lakh / Crore.

---

## 10. Listing Metadata, Edit Rules & Notifications

**System metadata (every listing)**
- Listing reference ID (e.g. `PROP-XXXXX` / `PROJ-XXXXX`) — auto-generated.
- Posted-on / last-updated timestamps — shown on the listing.
- Expiry date — derived from the plan, shown to the poster.

**Edit rules**
- Core fields (Transaction type, Category, Type) are **locked after payment / first publish**; only detail fields are editable.
- Any edit to a live listing → **re-approval** (Under Re-review); the published version stays live until approved.

**Notifications (poster)**
- State changes notify the poster: submitted, approved, rejected (with reason), expiring soon, expired, renewal.
