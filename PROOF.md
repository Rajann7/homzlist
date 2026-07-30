# PROOF.md — Reticle-style verification protocol for HomzList

> When a prompt says **"read PROOF.md"**, run this protocol before reporting anything
> "done". This is HomzList's own runtime proof layer, built from the tools this
> environment already has (browser-preview MCP + Supabase queries + `db:proof`).
> It does the same job Reticle does — verify the **running program**, not a
> screenshot — but with no new dependency to install.

Philosophy (from Reticle): an agent must **test its own work on every edit** by
reading the running program — network responses, store/DB state, console, and the
DOM — not by trusting a green UI or a 200. One pass checks many things at once and
comes back with **proof**: deterministic (structured events, not a vision model),
cheap (no screenshot model), and **pointed at the exact file:line to fix**.

This protocol exists to kill the **#1 hidden-issue offender**:
**a control that looks alive but persists nothing** — a `useState` with no server
write, a button whose handler never fires, a form that 200s but wrote no row.

---

## When to run
Run the loop for **every interactive control the prompt touched or claimed to
build/fix**: buttons, toggles, form submits, sheet/dialog opens, tab switches,
list actions (save/delete/report/boost), nav items.

If a control was only displayed (read-only, no action), you still verify it
**renders from a real query** (rule 12), but skip the mutation half.

---

## The 5 gates (ALL must pass per control)

For each control, prove the whole chain — a break at any gate = **NOT done**:

1. **CLICK fires** — the handler actually runs.
   - Drive it: `mcp__Claude_Browser__computer` (left_click by `ref` from
     `read_page`, or coordinate) / `form_input` for fields.
   - A control with **no onClick / disabled / dead ref** fails here → report
     `file:line` of the element.

2. **NETWORK is correct** — the request went out and came back right.
   - `mcp__Claude_Browser__read_network_requests` — confirm the expected
     method + path + **2xx** (or the correct 4xx for a negative test).
   - No request when one was expected = **dead button** → fail, give `file:line`
     of the handler.

3. **SERVER STATE changed** — the DB actually holds the new truth. **(the offender-killer)**
   - Supabase is not directly observable from the browser, so prove it one of:
     - **(a)** re-read via the app's own API and confirm the value changed, OR
     - **(b)** run a targeted query — `npm run db:proof` + a `scripts/q.mjs`
       query for the exact row the control should have written/updated.
   - A 200 with **no row / unchanged row** is the classic fake control → fail.
   - This gate is non-negotiable per CLAUDE.md rules 8 & 13 (verify from the DB).

4. **CONSOLE is clean** — no errors/uncaught during the action.
   - `mcp__Claude_Browser__read_console_messages` with `onlyErrors: true`.
   - Any error (even if the UI "worked") = fail, quote the message + `file:line`.

5. **READS BACK after reload** — state is durable, not just in memory.
   - Reload (`navigate` to same URL, or `window.location.reload()` via
     `javascript_tool`) and confirm the change is still there and rendered from
     the server, not client state/localStorage.
   - Gone after reload = `useState` that persisted nothing → fail.

---

## Regression guard — the "fix A, break B, fix B, re-break A" cycle (RUN ALWAYS)

The 5 gates prove the touched control works. They do **not**, by themselves, prove
you didn't break something that was already working. Whack-a-mole regressions are
their own #1 offender. So every change goes through:

**A. BASELINE (before you edit anything)**
- Identify the screen/flow the change lives in. Drive it and record which controls
  currently pass the 5 gates — this is the **passing set** you must not regress.
- If a control is already broken before your change, note it (don't silently
  inherit the blame, don't silently leave it).

**B. BLAST RADIUS (before you edit — list what shares the code)**
Grep for everything that could move when you touch this code, and add all of it to
the re-verify list:
- **Same component / parent** — other buttons in the same file or sheet.
- **Same API route** — every caller of the endpoint you changed.
- **Same table / RLS policy** — every screen that reads or writes that table.
- **Same shared hook / context / store / util** — every consumer of it.
- **Same flow** — the steps immediately before and after this one.

**C. RE-VERIFY THE UNION (after you edit)**
Run the 5 gates on **`touched control` ∪ `baseline passing set` ∪ `blast radius`** —
not just the thing you changed. A fix is **done only when the new control passes
AND every item in the baseline passing set still passes.** If fixing B re-broke A,
you are not done — you are mid-cascade; keep going until one pass is fully green
with zero re-breaks.

**D. FLOW REPLAY (if the control is part of a flow)**
Never verify a single step of a multi-step flow in isolation. Replay the **entire
flow end-to-end** (e.g. create → pay → confirm → appears in list) after the change.
A step that passes alone but dead-ends the flow is still a fail.

Report the baseline set and the re-verified union in the proof (see below), so it's
visible that nothing silently regressed.

## Propagation sweep — apply the change to EVERY surface the concept lives on (RUN ALWAYS)

A prompt names **one** place. That is a pointer to a **class of places**, never the
whole job. A change to a shared thing must land **identically on every surface where
that thing exists** — user-side and admin-side, every role, every subdomain. Doing
it only in the named place and stopping is a silent half-build.

Before a change is done, identify what **kind** of thing changed, find its **whole
class** across the repo, and apply + verify (the 5 gates) uniformly on every member:

- **A data concept** (any field, list, option set, status, price rule…): find every
  table/column that holds it and every screen that reads or writes it. **Prefer one
  source of truth** — a config table the server reads — so changing it once feeds
  every surface. If it's currently hardcoded per component (banned by CLAUDE.md
  rule 7 & 12), the fix is to make it config-driven, not to paste it into each screen.

- **A shared component** (any card, chip, sheet, control…): find **every render
  site** and land the change on all of them — ideally by editing the one shared
  component, not forking it per screen.

- **A behavior** (search, filter, sort, pagination, empty/error/loading states…):
  find every screen that has that behavior and apply the **same working** to all.

- **A cross-role / cross-subdomain flow**: the change spans the **whole wireframe**.
  If one side changes something another side acts on, that other side must reflect
  and be able to act on it too. Trace the data in **both** directions across roles
  and subdomains, not just the one you were pointed at.

**Method (this is the rule, the bullets above are only the shapes it takes):** for
any change, `grep` the changed thing across the whole repo, treat **every hit as a
surface that must match**, then apply + run the 5 gates on each. Missing a surface =
inconsistent = not done. If a surface is genuinely out of scope, say so plainly and
record it in `docs/PENDING-INTEGRATIONS.md` — never silently leave it half-applied.

## Negative & edge checks (the hidden-issue hunt, in-loop)
When the control implies a promise or a state machine, add the matching probe:

- **"we'll notify / expires in 7d / auto-refunds"** → find the job AND its
  trigger; if the cron/worker isn't wired, it's a promise with no job → record in
  `docs/PENDING-INTEGRATIONS.md`.
- **A status the schema allows** → prove code that ENTERS and EXITS it; a state
  with 0 rows has never run — seed it and look.
- **Step-2-of-2 failure** (our DB mutate → third party, or vice versa) → prove a
  compensating path exists. Money must never move without the thing it bought.
- **UI copy vs reality** → the screen's words must match what the server did
  (no "no refund" text on a state that IS refunded).
- **Authz** → unauthenticated hit = 401/403; IDOR probe on another user's id =
  denied; private fields stripped server-side (not CSS-hidden).

---

## Output format (paste this in the report — this is the "proof")

Per control, one block. Empty/failing gates are the finding.

```
CONTROL: <name>  (<component file:line>)
1 CLICK    ✅ handler fired            (or ❌ dead — no onClick @ file:line)
2 NETWORK  ✅ POST /api/v1/... → 200   (or ❌ no request / 500)
3 DB       ✅ row: <table> id=… col=…  (or ❌ 200 but 0 rows written)
4 CONSOLE  ✅ clean                    (or ❌ "<error>" @ file:line)
5 RELOAD   ✅ persists                 (or ❌ gone after reload — state only)
NOTES:  <promise/state-machine/authz findings, or "—">
```

A module report must contain one block per touched control **plus** the real DB
row(s) from gate 3. No block = not verified = not done.

**Regression line (always, at the top of the report):**
```
BASELINE passing set: [<control>, <control>, …]
RE-VERIFIED union:    all ✅  (or ❌ <control> regressed by the change to <file>)
FLOW replay:          create→pay→confirm→list ✅   (or step where it dead-ended)
PROPAGATION:          changed=<thing> → surfaces found by grep: [<all hits>]
                      applied on all ✅  (or ❌ missing on <surface>)
```
If any baseline control regressed, the change is NOT done — say so plainly and keep
fixing until one pass is fully green with zero re-breaks.

---

## Fast path
- Start the dev server once: `mcp__Claude_Browser__preview_start` `{name}` from
  `.claude/launch.json` (never Bash for servers). Reuse the tab across controls.
- Batch gates 2+4 from a single interaction, then gate 3 query, then one reload
  for gate 5. Don't re-drive the whole app per control.
- Deterministic only — read structured events (network/console/DOM refs + DB
  rows). Never accept a screenshot as proof of state.

## What this does NOT cover (say so, don't fake it)
- Cross-device / multi-browser / real production env — out of scope here.
- Third-party internals (Razorpay/FCM/Resend) — you can only observe our request
  to them + their response; if a webhook closes the loop, prove the webhook path
  separately or log it in PENDING-INTEGRATIONS.
