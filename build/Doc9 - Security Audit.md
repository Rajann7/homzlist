# DOC 9 — HOMZLIST SECURITY AUDIT (Part 1)

*Complete security specification + audit checklist. Every category, every HomzList-specific attack surface, with severity, proof-of-concept, reproduction, impact, and fix. Applied to the whole codebase (public + seller + admin subdomains). No CAPTCHA — protection via lockout, rate-limit, honeypot, RLS, server-side authz. Claude runs this per-module (spot-check) and as a full pass (Module 15).*

---

# SECTION 0 — SECURITY PHILOSOPHY

- **Think like an attacker.** Every screen, endpoint, role, workflow, edge case is probed as if a hacker is trying to break it.
- **Two walls always:** (1) API authorization (server checks role+ownership), (2) Supabase RLS (row-level, database enforced). Both required — never rely on one.
- **Never trust the client.** No business decision, flag, price, or access in frontend/localStorage.
- **Vibe-coding reality:** AI code often *works* but isn't *safe* (≈45% has an OWASP flaw). So every module gets a runtime security check, not just "it renders."
- **Report format for every finding:** `Severity (Critical/High/Medium/Low) · Affected component · Proof of concept · Reproduction steps · Impact · Fix.`

---

# SECTION 1 — AUTHENTICATION & AUTHORIZATION (RBAC)

**Threats & fixes:**
- **Broken auth / session:** Phone+OTP only. 3 verify attempts, 10 fails/day → 24h lock, 30s×3 resend, SMS rate-limits, honeypot. Access token 15-min, refresh 30-day httpOnly + rotating + subdomain-scoped. Invalidate on suspend/role-change. No password → no password-based attacks.
- **RBAC:** roles = Guest/Owner/Broker/Builder + Admin/Staff/Super. Every endpoint checks role server-side; admin permission-matrix (Staff/Admin/Super) enforced server-side (not UI-hidden). RLS mirrors roles.
- **Number-enumeration:** OTP request returns generic response — never reveals if a number is registered. `PoC:` attacker submits numbers to map users. `Fix:` uniform response + rate-limit.
- **Admin auth:** `account.homzlist.com` Google-only, whitelist checked server-side; remove email → instant session revoke; min 2 super admins; unknown-email attempts logged + alerted.
- **Session-fixation / hijack:** rotate tokens on login + refresh; bind session to device where feasible; logout-all; login-activity screen.
`Audit:` curl every protected route unauthenticated → must 401/403; attempt admin API with seller session → 403; already-logged-in → `/login` redirects home (no re-login bypass).

# SECTION 2 — SESSION & COOKIE SECURITY

- Cookies: `httpOnly`, `Secure`, `SameSite=Lax` (strict where possible), subdomain-scoped (public/seller/admin isolated — admin cookie never valid elsewhere).
- **No token in localStorage/sessionStorage** (XSS→takeover). `Audit:` inspect storage — must be empty of tokens/business data.
- 30-day refresh (cost decision) with rotation; access 15-min; server-side session store in Redis for instant revoke.
- CSRF protection on all state-changing requests (Section 8).

# SECTION 3 — API SECURITY (+ OWASP API Top 10)

- **API1 Broken Object-Level Auth (IDOR)** — *the #1 HomzList risk.* Every object access (listing, chat, lead, proposal, payment, requirement, profile) checks ownership server-side + RLS. `PoC:` `GET /api/v1/listings/mine` then `GET /chat/threads/{someoneElsesId}`; change `/property/123`→`/124` for a draft/private one. `Fix:` ownership middleware + RLS; return 404 (not 403) for hidden/draft to avoid existence leak.
- **API2 Broken Auth** — Section 1.
- **API3 Broken Object-Property-Level Auth / mass-assignment** — whitelist writable fields per endpoint (user can't set `role`, `is_verified`, `plan`, `balance`, `status` via PATCH). `PoC:` PATCH profile with `{"role":"admin"}`. `Fix:` explicit field whitelists; ignore/deny unknown fields.
- **API4 Resource consumption** — rate-limits + pagination caps + queue backpressure (Doc 8). `PoC:` request `limit=1000000`. `Fix:` cap limit, cursor pagination, per-endpoint rate-limit.
- **API5 Broken Function-Level Auth** — admin/staff endpoints role-checked server-side; Staff can't hit Super endpoints. `PoC:` Staff calls `DELETE /admin/users/:id`. `Fix:` permission matrix per route.
- **API6 Sensitive business flows** — payment-first, quota, proposal-send, boost — atomic + idempotent + server-verified (Section 12/Business-logic).
- **API7 SSRF** — Section 6.
- **API8 Misconfig** — headers/CORS (Section 18), debug off, error hygiene (Section 24).
- **API9 Inventory** — `/v1` versioning; no stray debug/test endpoints in prod.
- **API10 Unsafe third-party consumption** — Razorpay/FCM/R2/Resend calls validated + timeouts + signature checks.

# SECTION 4 — DATABASE SECURITY (Supabase RLS — MANDATORY)

**This is HomzList's biggest breach risk** (the vibe-coding sources: Lovable/Base44/Moltbook leaked 1.5M+ records purely from missing/misconfigured RLS).
- **RLS ON for every table** (Doc 7 §18). No table ships without a policy. `Audit:` list all tables → any with RLS off = **Critical**.
- Policies reference indexed owner columns (`user_id`); public tables expose only published/public rows/columns.
- **`service_role` key server-only** — never in client bundle/env-public. `PoC:` grep bundle for `service_role`. `Fix:` server-only; rotate if leaked.
- Anon key is public but **safe only because RLS protects data** — verify RLS actually blocks cross-user reads. `PoC:` with anon key, query another user's rows directly → must return nothing.
- Least-privilege DB roles; no raw SQL string-building (parameterized/ORM only — Section 5).
- Backups encrypted; PITR; migrations staged (Claude never writes prod DB).

# SECTION 5 — INPUT VALIDATION, SANITIZATION & INJECTION

- **Every input validated server-side:** type, length (max caps), format, enum, unicode (all-Indian-script allowed but bounded). Empty / very-long / weird chars / special symbols handled gracefully (PART E).
- **SQL/NoSQL injection:** parameterized queries / Supabase client / ORM only — never string-concatenated SQL. `PoC:` search `q=' OR 1=1--`; filter with SQL payloads. `Fix:` parameterization; input never reaches query as raw string.
- **Command injection:** no user input in shell/exec (image/PDF tools called with fixed args + validated paths). `PoC:` filename `; rm -rf`. `Fix:` no shell interpolation; library APIs; regenerated filenames.
- **XXE:** no XML parsing of user input; if any, disable external entities. (HomzList uses JSON — low surface; still enforced.)

# SECTION 6 — SSRF & PATH TRAVERSAL

- **SSRF:** link-previews / any server-side fetch of a user URL — block internal IPs/metadata endpoints, allowlist schemes, timeout, no redirects to internal. `PoC:` submit a chat link to `http://169.254.169.254/…` (cloud metadata). `Fix:` deny private/link-local ranges, allowlist, DNS-rebind protection.
- **Path traversal:** file access never uses user-supplied paths; R2 keys are server-generated random IDs; filenames regenerated. `PoC:` upload `../../etc/passwd`. `Fix:` no user paths, whitelist, canonicalize.

# SECTION 7 — XSS (Stored / Reflected / DOM)

- **Stored:** listing descriptions, bios, chat messages, requirement notes, area highlights, blog/CMS — sanitize on output/render (React escapes by default; never `dangerouslySetInnerHTML` with user content; sanitize CMS HTML). `PoC:` listing description `<script>steal()</script>` → must render as text. 
- **Reflected:** search query, filters echoed → escaped. `PoC:` `?q=<img onerror=…>`.
- **DOM:** no unsafe `innerHTML`, no eval, no user data into `href=javascript:`. 
- **CSP** (Section 18) as defense-in-depth. `Fix:` output encoding + sanitization + CSP; strict on chat + CMS.

# SECTION 8 — CSRF

- All state-changing requests protected: SameSite cookies + CSRF token (double-submit or origin check) on POST/PATCH/DELETE. `PoC:` malicious site auto-submits a form to `/billing/checkout`. `Fix:` verify Origin/Referer + CSRF token; SameSite=Lax/Strict.
- Razorpay webhook is HMAC-verified (not CSRF-relevant but signature-gated).

---

# DOC 9 — HOMZLIST SECURITY AUDIT (Part 2)

---

# SECTION 9 — FILE-UPLOAD SECURITY

- **Type validation** server-side (magic-bytes, not just extension): images only where images expected; PDF only for brochures. `PoC:` rename `shell.php` → `.jpg`. `Fix:` verify real MIME/magic bytes; reject mismatch.
- **Size caps** enforced server-side (25MB image, 10MB PDF). `Fix:` reject oversized before processing.
- **Presigned uploads** are scoped (specific bucket/key prefix, content-type, expiry) so a presign can't be reused to write elsewhere. `PoC:` reuse presigned URL for arbitrary path. `Fix:` short expiry, content-type lock, server-generated key.
- **Processing isolation:** image/PDF processed in workers with fixed-arg library calls (no shell), filenames regenerated (random IDs), EXIF/GPS stripped. `PoC:` malicious EXIF / polyglot file. `Fix:` re-encode (WebP) which drops embedded payloads; strip metadata.
- **PDF brochures:** ClamAV virus scan → Ghostscript re-compress (neutralizes embedded JS) → private R2 + signed URL. `PoC:` PDF with embedded script. `Fix:` scan + re-render + private serve.
- **Orphan cleanup:** unattached uploads deleted in 7 days (no storage-abuse dumping).
- **Served safely:** images via CDN with correct content-type (never `text/html`), no execution; downloads `Content-Disposition: attachment` where relevant.

# SECTION 10 — IDOR / BROKEN ACCESS CONTROL (deep — property, lead, messaging)

*The single highest-priority area for HomzList. Every object is owned by someone; every access is checked.*
- **Listings/projects:** state-access matrix server-enforced — draft/pending/rejected/changes-requested → owner+admin only (else 404); hidden/archived → owner+admin; deleted → 404; live → public. `PoC:` guess `/listings/{draftId}`; enumerate sequential IDs. `Fix:` ownership+state check in API + RLS; **use non-sequential IDs** (UUID/nanoid) to kill enumeration; 404 for non-authorized.
- **Chat/messages:** only thread participants (+admin read-only) can read; only participants can send. `PoC:` `GET /chat/threads/{otherThreadId}`; POST a message into someone else's thread. `Fix:` participant check + RLS; admin cannot POST (enforced at API, even in impersonation).
- **Leads/pipeline:** only the listing-owner (broker/builder) sees their leads. `PoC:` fetch `/leads` hoping to see others'. `Fix:` scope by owner + RLS.
- **Proposals:** sender + poster + admin only. `PoC:` read a proposal you're not party to. `Fix:` party check.
- **Numbers:** absent from any payload until Allow; poster-sees-sender computed server-side. `PoC:` inspect network response of a chat before allow → number must NOT be present. `Fix:` server strips; never send then hide with CSS.
- **Requirements (locked data):** unpaid → only preview fields returned; budget/poster/contact **stripped server-side**. `PoC:` open DevTools on a locked requirement → full data must NOT be in the response. `Fix:` server returns preview-only shape for unentitled users.
- **Profiles:** Views/Leads/verification-docs → owner+admin only. `PoC:` fetch another user's stats. `Fix:` strip private columns.
- **Admin object access:** every `/admin/*` object access permission-checked + audit-logged.
`Audit routine:` for each object type, log in as user A, capture an ID, then as user B try to read/modify it → must fail. Repeat across all object types.

# SECTION 11 — BUSINESS-LOGIC ABUSE (HomzList-specific)

- **Payment-first bypass:** try to reach listing form / submit listing without an active plan/slot. `PoC:` POST `/listings` directly with no reserved slot. `Fix:` server requires a reserved/consumed slot; no form access without entitlement (server-checked, not just UI gate).
- **Quota abuse (requirements/proposals):** toggle requirement on-after-renewal to consume; off/delete still counts; proposal send decrements atomically. `PoC:` rapid double-send to spend one credit twice; toggle spam. `Fix:` atomic counters + row locks + idempotency; server enforces the exact quota rules (Doc 2).
- **Number-rule abuse:** re-request spam after deny. `PoC:` flood request-number. `Fix:` rate-limit re-requests (no cooldown by rule, but throttle abuse); log; no auto-reveal ever.
- **Matching/feed manipulation:** try to force own listing higher, self-inquiry, self-proposal. `PoC:` self-actions to inflate. `Fix:` block self-inquiry/self-proposal; ranking server-side; own listings excluded from own feed.
- **Boost abuse:** boost a hidden/ineligible listing; double-boost. `PoC:` boost a non-live listing. `Fix:` eligibility checks server-side + admin approval; city-cap enforced.
- **Coupon abuse:** reuse beyond per-user limit; stack. `PoC:` replay coupon. `Fix:` server validates per-user/global/expiry/min-value atomically.
- **Refund abuse:** trigger refund while keeping benefit. `Fix:` refunds admin-only, full-only, atomic revoke (unpublish listing / remove plan).
- **Review-cycle abuse:** resubmit rejected 3× to spam. `Fix:` 3-reject lock → support only.

# SECTION 12 — PAYMENT SECURITY

- **Server-side amount:** price/GST/coupon computed server-side at order creation; client-sent amounts ignored. `PoC:` tamper amount in checkout request. `Fix:` recompute server-side; compare with order.
- **Webhook HMAC + idempotency:** Razorpay webhook signature-verified; duplicate deliveries idempotent; activation only after server confirms `captured` amount/currency/status. `PoC:` forge a "paid" callback from client. `Fix:` never trust client success; verify with Razorpay + webhook signature.
- **Race conditions:** concurrent webhook + verify → single activation (idempotency key + slot state machine). 
- **Refund integrity:** atomic (money-refund + benefit-revoke together); reconciliation cron catches mismatches (settlements vs records).
- **Keys:** `RAZORPAY_KEY_SECRET`, `WEBHOOK_SECRET` server-only. `PoC:` grep bundle. `Fix:` env server-only.
- **PCI:** card data never touches our servers (Razorpay hosted) — no PAN storage.

# SECTION 13 — RATE-LIMITING & BRUTE-FORCE (no CAPTCHA)

- OTP: 3/hr/number, 10/day/IP, 10 fails/day→24h lock. Login/verify tight. Inquiries 100/day. Search 60/min. Feed 120/min. API global 600/min/IP. 404-spike (enumeration) → temp block. Velocity rules (listings/hr, proposals/hr, account-creations/device/day) → flag/slow.
- Redis counters (per number/IP/account). Edge rate-limit (Cloudflare) for gross abuse. Honeypot fields on forms.
- `Audit:` 15 rapid fake logins → must throttle/lock, not crash. `Fix:` lockout + backoff + honeypot (explicitly no CAPTCHA per requirement).

# SECTION 14 — CORS & HTTP SECURITY HEADERS

- **CORS:** never `Access-Control-Allow-Origin: *` with credentials. Allowlist own subdomains only. `PoC:` cross-origin credentialed request from evil.com. `Fix:` strict allowlist.
- **Headers (edge + app):** `Content-Security-Policy` (restrict scripts/img/connect to self + known CDNs), `Strict-Transport-Security` (HSTS preload), `X-Frame-Options: DENY` (clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. `Audit:` securityheaders.com ≥ A/B.

# SECTION 15 — JWT / OAUTH TOKEN SECURITY

- Access JWT: short (15-min), signed (strong secret, server-only), verified every request; no sensitive data in payload beyond IDs/role. Refresh: opaque/rotating, httpOnly, Redis-tracked (instant revoke).
- **Google OAuth (admin):** via Supabase; validate `iss`/`aud`/email against whitelist server-side; state param (CSRF for OAuth); no open-redirect on callback. `PoC:` OAuth callback open-redirect / token leak. `Fix:` fixed redirect allowlist, state validation.
- No `alg:none`, no client-side JWT trust for authz decisions.

# SECTION 16 — SECRETS & ENVIRONMENT VARIABLES

- All secrets in env (server-only unless `NEXT_PUBLIC_`). Nothing in git (`.env` gitignored; if ever committed → rotate, since git history keeps it). 
- **Client-bundle grep** after every module: `sk-|service_role|eyJ (as secret)|apikey|_SECRET|Bearer <token>` → any hit = **Critical**, fix before proceeding.
- Separate secrets per environment (local/staging/prod). Least-privilege keys. Rotate on suspicion.

# SECTION 17 — SENSITIVE-DATA EXPOSURE

- Phone numbers: the whole number-rule ensures numbers aren't exposed pre-consent; poster-sees-sender only. Numbers never in feed/detail/requirement payloads before allow.
- Verification docs, brochures: private R2 + signed short-lived URLs (owner+admin).
- Locked requirement data: server-stripped.
- API responses return only needed fields (no over-fetching that leaks emails/internal flags). `PoC:` inspect any list response for hidden PII. `Fix:` explicit DTO/select — never `select *` to client.
- Logs never contain full numbers/tokens (mask).

---

# DOC 9 — HOMZLIST SECURITY AUDIT (Part 3 — Final)

---

# SECTION 18 — ENCRYPTION (at rest & in transit)

- **In transit:** HTTPS everywhere (TLS, A-grade via Cloudflare); HSTS preload; no HTTP anywhere; internal service calls TLS. `Audit:` ssllabs → A. `PoC:` any HTTP endpoint → fix.
- **At rest:** Supabase (Postgres) encrypted at rest; R2 encrypted at rest; backups encrypted; Redis (if persisted) on secured network.
- **Field-level:** phone numbers stored normally (needed for lookup) but never over-exposed (Section 17); consider hashing where a value is only ever compared. Verification docs private + signed. No card data stored (Razorpay).
- Secrets encrypted in the secrets store; TLS certs auto-managed (Cloudflare).

# SECTION 19 — LOGGING & AUDIT TRAILS

- **Admin audit log:** every admin action recorded (who, what, old→new diff, IP/device, timestamp, session) — append-only, Super-only read, 180-day legal minimum, export itself audited. Sensitive actions (refund/delete/impersonate/ban/flag/evidence) highlighted.
- **App logs:** structured (user, endpoint, status, duration), 90-day; slow-query log; security events (failed logins, lockouts, rate-limit hits, RLS denials).
- **Masking:** never log full phone/token/secret/OTP. 
- **Tamper-resistance:** audit log write-only from app; DB-level restriction; backups.
- **No sensitive data in logs** that could itself become a leak.

# SECTION 20 — ERROR HANDLING & INFORMATION DISCLOSURE

- Users get clean friendly messages / graceful fallback (PART D); **never** stack traces, SQL errors, framework versions, or internal paths. `PoC:` trigger a 500, inspect response → must be generic. `Fix:` global error handler → `{code, message_key}`; detail to Sentry/logs only.
- Production `debug=false`; no source maps exposed publicly; no verbose 404/500 pages leaking stack.
- Consistent error shapes so errors don't leak existence (e.g., 404 for both "not found" and "not authorized" on private objects).

# SECTION 21 — ADMIN-PANEL SECURITY (highest sensitivity)

- Isolated subdomain `account.homzlist.com`; separate cookie scope; Google-only whitelist; not linked/exposed publicly ("obscurity" is NOT the control — real auth is). `PoC:` open admin URL as seller/guest → must be blocked server-side. 
- Every admin endpoint: permission-matrix (Staff/Admin/Super) server-checked + audited. Staff limited to queues/tickets; Admin mid; Super full. `PoC:` Staff hits a Super-only route → 403.
- **Admin chat = READ-ONLY**, enforced at API (no send even during impersonation). **Impersonation** disables all sends/payments/edits, is time-limited + fully logged.
- Sensitive actions require type-to-confirm + reason (refund/delete/merge/ban/evidence).
- Min 2 super admins; removing a staff email → instant revoke.
- Admin session shorter idle-timeout; re-auth for the most sensitive actions if feasible.

# SECTION 22 — THIRD-PARTY INTEGRATIONS

- Razorpay (webhook HMAC, server keys), FCM (server key server-only), R2 (scoped keys, presign limits), Resend (API key server-only, SPF/DKIM/DMARC on domain), Supabase (service-role server-only), MSG91 (later; DLT). 
- Each call: timeout, error handling, signature/validation where available, least-privilege keys, no secret in client. Provider outage → graceful degradation (queue retry / fallback provider).
- Webhooks: verify signature + idempotency + source IP allowlist where possible.

# SECTION 23 — DEPENDENCY & PACKAGE VULNERABILITIES (+ slopsquatting)

- **Slopsquatting guard (AI-specific):** AI often suggests non-existent/typosquatted packages (~19.7%). Every AI-suggested dependency is **verified real + reputable** (npm downloads, repo, maintainer, last publish) before install. `PoC:` AI adds `react-supabase-auth-helper` (fake). `Fix:` verify existence/legitimacy first; prefer well-known packages.
- `npm audit` / Snyk on every install; lockfile committed; pin versions; no abandoned packages on critical path.
- Minimal dependencies (fewer = smaller attack surface). Review transitive deps for known CVEs. Auto-update security patches.

# SECTION 24 — SERVER & INFRASTRUCTURE SECURITY

- Least-privilege everywhere (DB roles, storage keys, cloud IAM). Firewalls: only 80/443 public; DB/Redis not internet-exposed (private network). SSH keys only, no password; fail2ban.
- OS/runtime patched; containers from trusted base images, non-root; secrets via env/secret-manager not baked into images.
- Separate staging/prod; no prod data in staging; migrations staged + reversible; Claude never writes prod DB directly.
- Backups (30 daily/12 monthly) encrypted + restore-drilled.

# SECTION 25 — CDN / WAF / DDoS PROTECTION

- Cloudflare: WAF (OWASP ruleset), DDoS mitigation, bot management, edge rate-limiting, challenge suspicious traffic (without user-facing CAPTCHA on normal flows). 
- Cache static + images at edge; origin shielded (app not directly reachable except via CF where possible). 
- Absorb volumetric attacks at edge; app-layer rate-limits (Section 13) for the rest.

# SECTION 26 — MOBILE & RESPONSIVE SECURITY

- PWA served over HTTPS; service worker scoped; no secrets cached in SW; sensitive responses not cached. 
- Same server-side authz regardless of device (mobile/desktop/tablet layouts share one secure backend). No client-only gating on any layout.
- Push (FCM) tokens validated + user-scoped; notification payloads carry IDs only (no PII), client re-fetches gated data.
- Deep links auth-checked server-side (no bypass via mobile deep-link).

# SECTION 27 — PRIVACY & COMPLIANCE (DPDP / GDPR-style)

- Consent versioned (18+, T&C, Privacy, marketing separate) — logged; re-acceptance on material change.
- Data-rights: user can download own data (others' privacy never leaked), deactivate/delete (30-day grace, 7-yr payment records anonymized for legal). 
- Data minimization (collect only what's needed); marketing opt-out honored; quiet hours.
- Grievance Officer published (IT Rules). Retention schedule enforced (Doc 7 §17), legal minimums locked. Section 79 intermediary posture (Doc 10).
- Third-party data processors listed in Privacy Policy.

# SECTION 28 — BYPASS-SEALING CATALOG (your explicit priority)

Every known bypass vector, sealed server-side:
- **Auth bypass:** logged-in user → `/login` → redirect home (no re-login). Guest → gated route → server redirect to login (no client-only guard, no data flash). 
- **Paywall bypass:** locked requirement data / paid features → server-stripped; no client flag grants access; form access requires server-verified slot.
- **Number bypass:** numbers never in payload before Allow; can't be revealed via DevTools/network.
- **Listing-state bypass:** URL guessing a draft/pending/hidden/deleted → 404 (state matrix + non-sequential IDs).
- **Role bypass:** seller can't reach admin (subdomain + cookie scope + server role check); Staff can't do Admin/Super actions.
- **IDOR bypass:** all objects ownership-checked + RLS.
- **Deep-link/notification bypass:** landing routes auth-checked server-side.
- **Impersonation bypass:** sends/payments/edits disabled at API.
- **Rate-limit bypass:** counters per number+IP+account+device; edge + app layers.
- **Enumeration bypass:** generic OTP responses; non-sequential IDs; 404-spike blocking.
`Audit:` attempt each of the above manually → all must fail.

# SECTION 29 — VIBE-CODING CHECKLIST + 30-MIN LIVE AUDIT

**Per-module (runtime, from the 5 sources):**
1. Secrets grep in client bundle → empty. 2. Every route auth-tested (curl 401/403). 3. IDOR test (swap IDs). 4. Injection test (`<script>`, SQL) in inputs. 5. localStorage has no tokens/business data. 6. Static analysis (ESLint/Semgrep) clean. 7. AI-suggested packages verified real. 8. Unhappy paths tested. 9. "No silent errors" — failures logged + surfaced cleanly.

**30-minute live audit (pre-launch, on the real site):**
1. securityheaders.com → ≥ A/B (fix CSP/X-Frame first). 2. ssllabs → A. 3. DevTools→Sources search `sk-/eyJ/service_role/apikey/Bearer/_SECRET` → none. 4. DevTools→Application→Storage → no JWT/business data. 5. Network tab → no unauthenticated endpoint returns user data / table names. 6. Spam 15 fake logins → lockout kicks in. 7. OTP/number-enumeration → generic responses. 8. Swap IDs on listing/chat/lead/payment → blocked. 9. Locked requirement in DevTools → full data absent. 10. Admin URL as guest/seller → blocked.

# SECTION 30 — OWASP TOP 10 (2021) MAP

- **A01 Broken Access Control** → Sections 3,10,21,28 (IDOR, RBAC, RLS, bypass) — primary focus.
- **A02 Cryptographic Failures** → Section 18 (TLS, at-rest, no card data).
- **A03 Injection** → Sections 5,7 (SQL/command/XSS).
- **A04 Insecure Design** → Sections 11,12 (business-logic, payment-first, atomic quotas).
- **A05 Security Misconfiguration** → Sections 14,20,24 (headers, errors, infra).
- **A06 Vulnerable Components** → Section 23 (deps, slopsquatting).
- **A07 Auth Failures** → Sections 1,2,13,15 (OTP, session, rate-limit, JWT/OAuth).
- **A08 Software/Data Integrity** → Sections 12,22,23 (webhook signatures, deps).
- **A09 Logging/Monitoring Failures** → Sections 19,13 (audit, alerts).
- **A10 SSRF** → Section 6.

# SECTION 31 — PRE-LAUNCH SECURITY SIGN-OFF

Launch only when ALL true:
- ✅ RLS ON + verified on **every** table (cross-user read test passes).
- ✅ No secret in client bundle (grep clean).
- ✅ No token/business data in localStorage.
- ✅ Every protected route 401/403 unauthenticated; every admin route role-gated.
- ✅ IDOR tests pass for listing/chat/lead/proposal/payment/requirement/profile.
- ✅ Locked-requirement + number data server-stripped (DevTools-proof).
- ✅ Listing-state matrix enforced; non-sequential IDs.
- ✅ Payment: server-side amounts, webhook HMAC, idempotency, atomic refund.
- ✅ Injection (SQL/XSS/command/SSRF/path) tests pass.
- ✅ Headers ≥ A/B; SSL A; CORS allowlisted; CSP set.
- ✅ Rate-limits/lockouts work (no CAPTCHA); honeypots in place.
- ✅ Admin isolated + audited; chat read-only; impersonation sends disabled.
- ✅ Deps audited + slopsquatting-checked.
- ✅ Errors clean to user, detail to logs; debug off.
- ✅ Backups encrypted + restore-drilled; migrations staged.
- ✅ DPDP: consent versioned, data-rights, grievance officer, retention locks.
- ✅ Every bypass in Section 28 attempted → all fail.

---

