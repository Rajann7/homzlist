# DOC 5 — SCREEN SPECS + UX FLOWS (PART B: ADMIN SCREENS A1–A31 + FLOW DIAGRAMS)

> **SUPERSEDED — 11 Aug 2026 · chat removed, connections are leads.**
>
> Every passage below that describes chat threads, the message composer,
> accept/decline before connecting, number requests (Allow/Deny), "waiting for
> reply", or a proposal turning into a conversation is **no longer how HomzList
> works**. Those tables still exist for dispute evidence, but nothing reads or
> writes them.
>
> What replaced it: a sender answers three questions — **what** they want, **how**
> they want to be contacted (call / WhatsApp, own or an OTP-verified alternate
> number), and **when** — ticks the consent line, and that becomes a **lead** on
> the receiving side. The receiver acts with Call or WhatsApp, and the tap is
> recorded. A lead moves New → Contacted → Converted → Archived. Requirements are
> answered with **I Have a Property** or **I Can Arrange It**, both quota'd, both
> landing as the same lead.
>
> Surfaces: `/leads` (Received grouped by your own post, and Sent), the admin
> read-only **Lead panel**, and reports with `subject_type = 'lead'` in the
> existing reports queue. Implementation: migrations 0134-0136, `lib/inquiry/*`,
> `lib/leads/*`, `components/inquiry/*`, `components/leads/*`.


*Admin panel spec. Layout: desktop-first — sidebar 240px (collapsible→64px icons) + content max 1200px; fully mobile-responsive (sidebar→bottom drawer; tables→cards). Same legend as Doc 4. All screens: permission-gated server-side per role matrix (Doc 3 §1.1); every action → audit log; deep-drill principle (Doc 3 §1.3) applies globally — every entity name/ID anywhere is clickable to its detail panel. Side-panel pattern: 480px right slide-in (mobile: full-screen) — stacking allowed (panel over panel, breadcrumb trail on top).*

**Sidebar structure**: Dashboard · Queues▾(Listings/Requirements/Boosts/Verifications/Appeals/Reports) · Users · Listings · Payments · Finance · Plans▾(Plans/Coupons/Grants) · Master Data · CMS · Templates · Support▾(Tickets/Disputes) · Staff · Analytics · Audit Log · System▾(Cron/Flags/Trash/Exports) · [bottom] admin avatar + role chip + logout.
**Global header (all screens)**: global search (phone/name/listing-ID/payment-ID/order-ID → results dropdown grouped by entity) · notification bell (in-panel feed) · staff-online dot strip (super only) · env badge (STAGING red when applicable).

---

**A1. Admin Login** — Center card: HomzList Admin wordmark + "Sign in with Google" btn only. St: unauthorized-email error ("Access not granted — contact super admin"), revoked-mid-session redirect here. F: → A2; failed attempts logged, 5+ → super alert.

**A2. Dashboard** — Row 1: pending tiles (Listings·Requirements·Boosts·Verifications·Reports·Tickets·Appeals — count + oldest-age; tap→queue). Row 2: today stats cards (Signups/Revenue/Listings/Inquiries) each with prior-period % (▲12% green/▼ red). Row 3: anomaly banners (conditional: payment-fail spike/OTP spike/report spike — dismiss + link). Row 4: revenue mini-graph (7d) + SLA overdue list (red, tap→item) + cron/backup status chips. S: bell drawer. F: login → here; all tiles deep-link.

**A3. Listings Queue** — Table/cards: thumb · title · type · city/area · poster (chip: new-account) · risk score badge (color-coded, logic per Doc 3 §1.4) · age/SLA timer · status chip · lock indicator ("Priya is reviewing" + auto-skip). Toolbar: saved filter views dropdown + filter row (status/type/city/risk/date) + bulk-select (max 20 → confirm dialog with count) + sort (risk default/oldest). Sections: Pending / Updated-after-edit flag / Payment-pending (visibility only) / Changes-requested awaiting. F: A2 tile → A4; keyboard ↑↓ navigate.

**A4. Review Detail (side-panel or full)** — Left: **exact user-render** (Card|Full toggle — same components as app). Right column: submitted fields list · location breadcrumb · ownership doc viewer (inline, side-by-side w/ fields) · poster mini-panel (new account → profile + first-listing note) · prior-history strip (rejects/edits/reports) · report-context (if flagged) · SOP checklist (collapsible). Footer actions: **[Approve]** (confirm → live+story+notify+SEO ping) · **[Request Changes]** (opens per-field note composer — click any field → attach note; send → stays pending, no reject-count) · **[Reject]** (template dropdown + optional field notes + confirm; 3rd reject → lock notice). Keyboard: A/R/→(next). St: locked-by-other (read-only + skip), edit-updated banner. F: A3 → auto-advance next on action.

**A5. Requirements Queue** — Same pattern as A3/A4; render = RequirementCard + full fields; actions identical. **A6. Boost Queue** — Payment-verified items: listing render + duration + targeting + amount; [Approve][Reject→auto-refund confirm]. **A7. Verification Queue** — User panel + doc viewer (ID/RERA) side-by-side with entered fields; [Approve→badge][Reject+reason][Revoke] (existing badges tab). **A8. Appeals** — Two tabs: Auto-flag appeals (bio/number-detection false-positives — content + flag reason + [Dismiss flag][Uphold]) · Reject-lock reopens (history + [Unlock][Keep locked]). **A9. Reports Queue** — Report cards: reason chip + reporter + entity preview (inline render) + count-if-multiple · actions: [Dismiss][Hide entity][Warn user][Suspend][Ban device/IP] → all trigger reporter-outcome notification; per-message chat reports show thread context (read-only).

**A10. Users List** — Table: avatar+name · phone · role chip · badges · city · plan status · listings/leads counts · joined · status (active/suspended/deleted). Hover/long-press → quick-stat mini-card. Filters (role/status/plan/city/date) + saved views + export CSV (audited). F: row → A11.

**A11. User Detail (side panel, tabbed)** — Header: avatar/name/badges/status + action bar: [Edit][Suspend|Lift][Delete][Role change][Grant trial][Adjust balance][Send message][Impersonate][Ban device] (each → confirm dialog + reason field where applicable; all logged). Tabs: **Overview** (profile fields editable, member-since, response-time, consent versions) · **Plans** (timeline: purchased→consumed-trace→expiry; grant/adjust inline) · **Payments** (rows → A18 detail) · **Listings** (grid → A12 edit) · **Leads** (grouped by property/project/requirement → chat viewer) · **Chats** (list → READ-ONLY thread viewer — composer absent by design) · **Communication log** (admin-sent messages/alerts history) · **Notes** (internal sticky notes CRUD) · **Timeline** (chronological everything). F: anywhere-user-clicked → here; onward drill infinite.

**A12. Listings Master** — All-status table + filters; row → full edit panel (every field A-Z editable — SOP banner: "compliance edits only, logged") · status override dropdown · story-remove btn · boost pause/resume · per-entity timeline tab · trash/restore. F: A11-tab/global-search.

**A13. Plans Manager** — Plan cards (₹999/₹2,999/₹9,999 + custom) → edit panel: price, contents (listings/requirements/proposals counts, validity), role availability matrix (checkboxes), active toggle; "changes apply to new purchases only" note (grandfathering auto). + New plan btn. **A14. Coupons** — Table (code/discount/applies-to/usage n-of-cap/expiry/status) + CRUD panel (per-user limit, min value, plans|boosts|both). **A15. Grants** — Trial/free-grant log table + [New grant] flow (user search → contents → duration → reason → confirm → notify user).

**A16. Finance** — Tabs: **Revenue** (graphs daily/monthly; split plan/boost/top-up; city filter) · **Churn** (expiring-plans list + renewed? status + export) · **Reconciliation** (auto-match table: platform vs Razorpay; mismatch rows flagged → per-row re-check btn) · **Exports** (GST invoice list CSV, custom range).

**A17–A18. Payments List + Detail** — List: filters (status/method/date) + search payment/order ID. Detail panel: full Razorpay payload · linked user/plan · consumed-state · actions: [Refund] (amount+reason → API → notify + atomic revoke confirm) · [Re-check status] · chargeback flag banner (auto-suspended note). Abandoned tab: initiated-not-completed rows + [Send retry link].

**A19. Master Data** — Tree editor: State→District→Taluka→City/Village→Area/Landmark (add/edit/rename/delete + drag-merge) · per-landmark panel: pincode, bilingual name fields, **adjacency mapper** (multi-select nearby landmarks), highlights textarea · Amenities list CRUD · Blocklist words (multi-script, add/remove) · Number-regex editor (test box) · Property-type field-config JSON editor (with validation + preview) · Area-requests queue ([Add→notify requester][Dismiss]).

**A20. CMS** — Pages list (About/T&C[version history + re-acceptance trigger]/Privacy/Refund/Disclaimer) + rich editor · Blogs CRUD + publish · FAQs CRUD (categories) · Banners (image + schedule + city target + active) · Broadcasts (composer: title/body/channels + audience: city/role/plan-status segments + preview count + send confirm).

**A21. Templates & Strings** — Tabs: Email/SMS/WhatsApp/Push template editors (variables palette + [Test send to me]) · Language strings table (key/EN/GU/HI, search, inline edit, missing-translation filter).

**A22. Settings & Flags** — Feature switches list (stories/boost/requirements/PWA prompt/…) each with scope note · Branding (logo/name/color/favicon/OG upload + preview) · Retention configs · Velocity rules table · Rate-limit table · Maintenance toggle (+message field; bypass note) · Boost rates + per-city caps · Launch-city config (default all-ON) · [Purge CDN][Regenerate sitemaps] buttons (confirm + last-run stamp).

**A23. Tickets** — Queue tabs (Open/Assigned-to-me/Replied/Closed) + SLA timers · ticket view: user panel link + thread + internal comments (staff-only, yellow) + canned responses dropdown + assign dropdown + category chip (refund-request → linked payment; number-recovery → verify SOP checklist) + [Reply][Close]. **A24. Disputes** — Structured list + detail: parties (→A11 each) + linked listing/chat (read-only) + resolution note + outcome select (standard-stance template prefilled) + status.

**A25. Staff Management** — Staff table (email/role/added-by/last-login/online dot) + [Add: email field (Google-linked validation) + role select → instant active] + [Remove → confirm → sessions killed] + role edit + performance tab (approvals/tickets per day per staff) + permission matrix view (read-only reference).

**A26. Audit Log** — Global table: timestamp · admin · action type · entity link · old→new diff (expandable) · IP. Filters (admin/action/entity/date). Export (audited itself). Evidence SOP entry point (super-only: case ref + preservation lock + export).

**A27. Cron & System** — Jobs table (name/last-run/status/next/duration + [Run now] confirm) · health checks strip (DB/Redis/storage/queues) · queue depths · error rate (Sentry link) · backup status (last success + restore-drill date).

**A28. Analytics** — Funnel viz (signup→plan→listing→lead, date range) · events explorer (the 10 wired events, filters) · story aggregates (impressions/taps by city) · city breakdowns table · metric-definition pins (view/lead definitions visible).

**A29. Trash Browser** — All soft-deleted entities (type filter) + restore + purge-schedule note. **A30. Exports Center** — Export history (who/what/when/rows) + re-download (audited). **A31. Impersonation View** — Full user-app shell in frame + persistent top banner ("Viewing as Rahul — read-only · [Exit]"); ALL send/submit/pay actions disabled at API level; session logged start/end.

---

# SCREEN FLOW DIAGRAMS (authoritative maps)

**FLOW 1 — AUTH**
```
Splash ─session?─→ Feed(9)
   └─no─→ SavedAccounts(5)?─→ OTP(4) ─existing─→ Feed
              └─none─→ Login(3) ─→ OTP(4) ─new─→ Role(6) → Details(7) → Feed+coach
Guest: Login(3) ─browse─→ Feed(guest) ─any action─→ LoginSheet → OTP → resume action
```

**FLOW 2 — BROWSE→INQUIRY→CHAT**
```
Feed(9) ─┬→ StoryViewer(11) ─View Property─→ Detail(16)
         ├→ Detail(16) ─Inquiry sheet─→ [request sent] → Poster:Requests(35) ─Accept─→ Thread(36)
         │            └─Request Number─→ Poster inline Allow(confirm) → NumberCard in 36
         └→ Profile(45) → Detail(16)
Thread(36) ⇄ ChatDetails(37) · VisitCard → MyVisits(38) · stage → Leads(39)
```

**FLOW 3 — CREATE LISTING**
```
[+](23) ─slot?─→ PropType(24) → Form(25) ⇄ Drafts(32) → Photos(26) → Preview(27) ─paid?─→ Success(29) → Manager(49)
   └─no slot─→ PlanWall(22) → Checkout(28) ─┬→ success → 24
                                            ├→ pendingUPI → poll → 24/29
                                            └→ failed → retry
Edit(33) → [minor→live | major→re-review] · Admin: A3→A4 → Approve→live+story / Changes→user sees field-notes in 49→33 / Reject→49
```

**FLOW 4 — REQUIREMENT & PROPOSAL**
```
Requirements(40) ─unpaid─→ Locked(19) → Paywall → Checkout(28) → unlocked
Unlocked(19) → ProposalSheet [a: listing-picker | b: chat-req] ─send(quota; 0→TopUp(60) inline)─→
Poster: ProposalsReceived(42) ─Accept─→ Thread(36) · Sender status → 43
Own: MyRequirements(41) ⇄ toggle(quota popup) · Fulfilled · Edit→re-review · reverse-match strip → 16
```

**FLOW 5 — BOOST**
```
Own Detail(16)/Stats(48)/Manager(49) → BoostPurchase(58) → Checkout(28) → A6 queue ─Approve─→ Active(59) → expiry notif → 1-tap renew
                                                                        └─Reject─→ auto-refund + notify
```

**FLOW 6 — NOTIFICATION LANDING (authoritative)**
```
inquiry→36 · chat-accepted→36 · number-request→36(inline) · number-allowed→36 · proposal-received→42 · proposal-status→43 · approval/rejection/changes→49 · price-drop→16 · saved-status→16/50 · saved-search-match→13 · builder-match→19/40 · still-available→49(inline Y/N) · requirement-expiry→41 · plan-expiry/grace→56 · trial→56 · boost→59 · payment→57/28 · refund→57 · report-outcome→AccountStatus · suspension-lifted→9 · area-added→25 · new-device→65 · digest→13/48 · update-toast→reload
```

**FLOW 7 — ADMIN REVIEW LIFECYCLE**
```
A2 tiles → Queue(A3/A5/A6/A7/A9) → Detail(A4) ─[A]pprove─→ next(auto-advance)
                                          ├─Changes─→ pending(user notified, field-notes) → user edits → back in queue(updated flag)
                                          └─[R]eject ×3 → lock → Appeals(A8) → unlock?
Deep-drill: any entity → A11/A12 → onward (breadcrumb stack) · Impersonate → A31(read-only)
```

**FLOW 8 — ACCOUNT LIFECYCLE**
```
Active ─self─→ Deactivate(71) ⇄ login-revives
       ─self─→ Delete(71) → 7d-payment-hold? → 30d grace → anonymized(payments 7yr)
       ─admin─→ Suspend → login-blocked screen · listings hidden · chats frozen ─Lift─→ notify → Active
Recycled-SIM: 12mo inactive + new reg → old auto-archived → support recovery
```

---

