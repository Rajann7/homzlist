# Skill: qa-checklist

Load after **every** module. The concrete PART B self-test (Doc6 §8). No module is
"done" until this passes. Keep the report short (Doc6 §8.2).

## Per-module checklist (Doc6 §8.1)
- [ ] Every breakpoint (mobile/tablet/desktop) matches the intended design. Mobile = given design exactly; tablet/desktop = native layout (user-side); admin = its own 3-device design.
- [ ] No text clip / layout-breaking wrap / overflow-hidden cut-off.
- [ ] No element hidden, missing, or overlapping.
- [ ] Every button/link/tab/sheet/toggle works — no dead UI, no placeholder left.
- [ ] Full flow runs — no stop, no dead-end.
- [ ] Loading / empty / error / offline states present; loading holds on slow network (button stays in loading, never dead).
- [ ] No horizontal scroll / unintended overflow anywhere.
- [ ] No console errors.
- [ ] Popups/sheets/dialogs open + close fully (X, backdrop, swipe-down, back); content not clipped; stacked sheets close top-first.
- [ ] Bottom nav fixed, present where it belongs, nothing overflowing beneath, content not hidden behind it.
- [ ] No accidental text-selection on chrome; readable content still selectable.
- [ ] 60fps on scroll/swipe/open/close; no jank, no layout shift.

## Runtime security spot-check (Doc6 §8.3 — every module)
- [ ] `curl` each new protected route unauthenticated → 401/403 (not data).
- [ ] Swap an ID in URL/request (IDOR) → blocked.
- [ ] Grep built client bundle for `sk-|service_role|eyJ|apikey|Bearer|_SECRET` → empty.
- [ ] No session token/business data in localStorage → refresh token httpOnly cookie only.
- [ ] Inject `<script>` / SQL-ish strings in inputs → sanitized, no execution.

## Report format
what was checked · what was fixed · what still has an issue · confirmation it matches the design.
