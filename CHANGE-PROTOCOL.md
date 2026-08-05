# CHANGE PROTOCOL — how EVERY change request is executed (STRICT, GLOBAL)

> This file applies to **every prompt that changes anything** in HomzList — one line of
> copy, a card, a field, a rule, a query, an admin toggle. No exceptions, no "it's small".
> Read together with CLAUDE.md and RULES.md. If this file and a prompt disagree about
> *process*, this file wins; the prompt only decides *what* changes, never *how carefully*.

**The one rule:** a change is not "edit the file the user pointed at". A change is
**find every place that thing lives → understand how it works today → change all of them →
prove the whole system still works exactly as before, plus the new behaviour.**

If a change lands in one place and the same thing is stale in another place, the change is
**NOT done** — it is a bug I shipped myself.

---

## PHASE 0 — STOP. No edit before the map.

Before touching any file:

- Do **not** open the first matching file and start editing.
- Do **not** assume the user listed all the places. The user names *one* place ("home feed
  card"); my job is to find the other seven.
- If the change is genuinely ambiguous in *scope* (what it should do), ask **once**, up
  front — not halfway through, and never as a reason to deliver a partial change.

---

## PHASE 1 — SURFACE MAP (where does this thing live?)

Find **every** surface the changed thing appears on, is produced by, or is consumed by.
Search by component name, by prop name, by DB column, by API path, by label text — all of
them, not one.

Checklist of surfaces to sweep, every time:

| # | Surface | Where to look |
|---|---------|---------------|
| 1 | Public/user screens (mobile) | `app/(public)`, `app/(seller)`, `components/**` |
| 2 | Tablet + desktop layouts (user-side) | the separate native layouts — same data, different shell |
| 3 | Admin panel — **all 3 device layouts** | `app/(admin)`, `components/admin/**` |
| 4 | Preview / draft / review screens | create-flow preview, moderation preview |
| 5 | Profile / my-listings / saved / archived / trash | `components/profile`, `saved`, `archived`, `listings` |
| 6 | Search + area/SEO pages + blog | `lib/search`, `lib/seo`, area pages, sitemap/OG |
| 7 | Chat / leads / notifications / email / push copy | `lib/chat`, `lib/notifications`, templates |
| 8 | API routes + server helpers | `app/api/**`, `lib/**` (the payload shape) |
| 9 | Database | `supabase/migrations`, RLS policies, RPCs, views, triggers, indexes |
| 10 | Types / config tables / option lists | shared TS types, config tables (never hardcoded lists) |
| 11 | Seeds + check scripts | `scripts/seed-*.mjs`, `scripts/check-*.mjs` (they encode the old truth) |
| 12 | Docs + designs | `docs/Doc2–Doc5`, `build/Doc7–Doc9`, `designs/*.html`, `docs/PENDING-INTEGRATIONS.md` |

**Entity variants count as surfaces.** If a change touches "property", ask whether it also
touches **project**, requirement, builder profile, boost, draft, archived and deleted
copies of the same thing. If the shape is shared, the change is shared.

Deliverable of this phase: a written list — "this change touches these N places" — before
any edit. If the list has 1 item, justify why it is really 1.

---

## PHASE 2 — BEHAVIOUR BASELINE (how does it work TODAY?)

For each surface found, record what currently works — because all of it must still work
after the change:

- Props / data it receives, and who passes them.
- Which server query or endpoint feeds it, and what it strips server-side (private fields).
- Role + entitlement gating (guest / owner / broker / builder / admin / staff; free vs paid).
- Loading, empty, error, offline states.
- Interactions: taps, long-press, sheets, toasts, dialogs, navigation targets.
- Side effects: counters, views/leads, notifications, queue jobs, analytics rows.
- Feature-toggle behaviour (admin OFF → clean auto-hide, no empty gap).

This baseline is the regression list for Phase 6. **A change that "works" but silently
dropped a state, a gate, or a side effect is a broken change.**

---

## PHASE 3 — FLOW TRACE (end to end, both directions)

Trace the full path and write it down:

```
DB table/column → RLS → RPC/query → API route (authz) → server component →
client component → UI state → user action → mutation API → authz + validation →
DB write → re-read (no-store) → every surface that displays it
```

Both directions matter: the read path *and* the write-back path. Confirm where the source
of truth is (server, always) and that nothing business-related is being decided in the
client or persisted in localStorage.

---

## PHASE 4 — IMPACT PLAN

Write the plan before editing:

1. Every file that must change, and why.
2. **Single source of truth**: if the same thing is rendered in 3 places, they must share
   one component/one helper/one server query. Never fix it in place A and copy-paste into
   B and C — that is how the next drift happens. If they are already forked, converge them
   as part of the change (or say plainly why converging is unsafe).
3. Schema change? → migration file **and** run it on DEV, RLS included.
4. Backward compatibility: existing rows, old drafts, old statuses, cached payloads.
5. What could break elsewhere (the regression list from Phase 2).

---

## PHASE 5 — APPLY EVERYWHERE, IN ONE PASS

- Change **all** mapped surfaces in the same pass. Partial rollout across surfaces is not
  allowed.
- Update seeds, check scripts and docs that encoded the old behaviour.
- Keep the design lock: appearance must not change unless the prompt explicitly changed
  the design. Mobile design = 0% drift.
- No `TODO: other screens later`. If something truly cannot be done now, it goes into
  `docs/PENDING-INTEGRATIONS.md` **and** is stated plainly in the report.

---

## PHASE 6 — VERIFY (the gate; a change is not done until all of A–H pass)

### A. Flow check — end to end, live
Run the real flow in the preview/live app on every surface changed. Every entry point,
every role, every variant (property *and* project, free *and* paid, empty *and* full).

### B. Database check — real rows, every time
`npm run db:proof` **plus** a targeted query for exactly what this change wrote or read.
Paste actual rows into the report. A 200 response, a green screen or a passing typecheck
is **not** proof. If a status/state exists in the schema, seed it and look at it.

### C. No-dead check
- No dead button, dead link, dead sheet, dead toast.
- No dead-end state: for every status the schema allows, something ENTERS it and something
  EXITS it.
- Every on-screen promise ("we'll notify you", "expires in 7 days", "auto-refund") has a
  job behind it **and** something that triggers that job.
- No console errors, no unhandled rejections, no failing network calls.
- No orphan code left behind by the change (dead props, unused endpoints, stale queries).

### D. Regression check — the old behaviour still works
Walk the Phase 2 baseline item by item on every surface. Everything that worked before
must still work exactly the same, including states, gating, counters and side effects.
Explicitly confirm the surfaces I changed *and* the neighbours that share the component.

### E. Production-ready check
- `npm run lint` and `npm run typecheck` clean.
- `npm run build` succeeds.
- `npm run check:bundle-secrets` — no secret in the client bundle.
- Server-side validation + authorization on every touched endpoint; unauthenticated sweep
  (401s) and an IDOR probe on anything ID-addressed.
- RLS present on every touched/new table.
- Errors surface to the user as clean friendly copy; technical detail only in logs.
- Caching correct: SSR pages reading Supabase use `force-dynamic` **and**
  `fetchCache = "force-no-store"`; client re-reads after a mutation use `no-store`.
- Performance unchanged or better: no N+1, no new blocking work, 60fps, transform/opacity
  animations only.

### F. Responsive / text check
- **Website (user side): mobile device only.** Verify at mobile widths — no text clipping,
  no unwanted wrap, no cut-off, no truncation, no overflow-hidden eating content, no
  horizontal scroll, no overlap, nothing hidden behind the fixed bottom nav.
- **Admin dashboard: all three device layouts** (mobile, tablet, desktop) — same checks on
  each, plus tables/panels that must scroll inside themselves rather than break the page.
- Long values are the test case: long titles, long names, big numbers, ₹ amounts, long
  location strings, empty strings, missing images.

### G. Design-lock check
Compare against `designs/` — the visual result must be identical except for exactly what
the prompt asked to change. If a needed fix would alter appearance, **stop and ask**.

### H. Hidden-issue hunt
Walk the 6 questions in CLAUDE.md → "HUNT FOR HIDDEN ISSUES" against this change. Report
what I *found*, including out-of-scope gaps (→ `docs/PENDING-INTEGRATIONS.md`).

---

## PHASE 7 — REPORT (fixed format, every change)

```
CHANGE: <what was asked>

SURFACES FOUND (Phase 1): <list — every place this thing lives>
CHANGED: <files, grouped by surface>
NOT CHANGED (and why): <surfaces deliberately untouched>

FLOW: <DB → API → UI, one line each direction>

DB PROOF:
  <db:proof output excerpt>
  <targeted query + the actual rows>

VERIFIED:
  A flow ......... <how tested, which roles/variants>
  B database ..... <rows shown above>
  C no-dead ...... <buttons/states/jobs checked>
  D regression ... <baseline items re-checked, per surface>
  E production ... <lint / typecheck / build / secrets / authz / RLS / cache>
  F responsive ... <mobile for site; mobile+tablet+desktop for admin; clipping/wrap>
  G design ....... <matches designs/, zero drift>
  H hunt ......... <what I found beyond the prompt>

FOUND BUT OUT OF SCOPE: <→ docs/PENDING-INTEGRATIONS.md>
STILL BROKEN / NEEDS YOU: <plainly, or "none">
```

If any of A–H did not actually run, say so plainly. **"Done" is only allowed when all of
A–H ran and passed.**

---

## HARD BANS (any one of these = the change is rejected)

1. Editing only the file the user named, when the same thing exists elsewhere.
2. Fixing surface A and leaving surfaces B/C stale.
3. Copy-pasting the change into a second component instead of sharing one source.
4. Reporting "done" from a green UI, a 200, or a passing typecheck, with no DB rows.
5. Losing existing behaviour (a state, a gate, a counter, a side effect) to make the new
   behaviour work.
6. Hardcoding anything the DB should own — counts, labels, option lists, prices, statuses.
7. Changing the mobile design's appearance while "fixing" something.
8. Leaving a dead button, a dead-end status, or a promise with no job behind it.
9. A `TODO: rest of the screens later` that is not recorded in
   `docs/PENDING-INTEGRATIONS.md` and stated in the report.

---

## QUICK COMMANDS

```bash
npm run db:proof && npm run lint && npm run typecheck && npm run build && npm run check:bundle-secrets
```

Targeted DB query:

```bash
npm run q -- "select ... from ... where ... limit 20"
```

Existing live checks (`scripts/check-*.mjs`) encode the old truth — run the ones that touch
the changed area, and update them when the truth legitimately changes.
