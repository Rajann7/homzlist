# DOC 8 — HOMZLIST ARCHITECTURE (Part 1)

*How HomzList stays smooth (Instagram-level, 60fps, no blocking) even at extreme concurrency — up to millions of live users. Every layer: hosting, scaling, database, cache, queues, images/CDN, realtime, performance budgets, load testing, cost. Nothing frontend-blocking; nothing that stalls under load.*

---

# SECTION 0 — CORE PRINCIPLE

**Never let one slow thing block everything.** Every heavy operation (image processing, SMS, matching, notifications, emails) goes to a **queue** and returns instantly. Every read that can be cached **is cached**. The database is never the bottleneck (indexes + pooling + cache). Static + images come from the **edge (CDN)**, never the app server. This is how the site "kabhi block nahi hoti" and stays high-FPS.

---

# SECTION 1 — HIGH-LEVEL ARCHITECTURE

```
                        ┌─────────────────────────┐
   Users (mobile/       │   Cloudflare (Edge)      │
   desktop, all         │  - DNS (3 subdomains)    │
   devices/browsers)    │  - CDN (static + images) │
        │               │  - WAF + DDoS + Bot mgmt │
        ▼               │  - SSL (A grade)         │
   ┌─────────┐          │  - Security headers      │
   │ Cloudflare├────────┤  - Rate limiting (edge)  │
   └────┬────┘          └───────────┬──────────────┘
        │                           │
        ▼                           ▼
  ┌──────────────┐          ┌──────────────────┐
  │ R2 (images,  │          │  Load Balancer    │
  │ CDN-served)  │          │  (Cloudflare/     │
  └──────────────┘          │   nginx)          │
                            └───────┬───────────┘
                        ┌───────────┼───────────┐
                        ▼           ▼           ▼
                   ┌────────┐  ┌────────┐  ┌────────┐
                   │ Next.js│  │ Next.js│  │ Next.js│   ← stateless app
                   │ node 1 │  │ node 2 │  │ node N │     instances
                   └───┬────┘  └───┬────┘  └───┬────┘     (auto-scaled)
                       └───────────┼───────────┘
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                     ▼
        ┌──────────┐        ┌──────────┐          ┌──────────────┐
        │ Supabase │        │  Redis   │          │  BullMQ      │
        │ Postgres │◄──────►│ (cache + │◄────────►│  Workers     │
        │ (pooled) │        │  pub/sub)│          │  (queues)    │
        └────┬─────┘        └──────────┘          └──────┬───────┘
             │                                           │
             ▼                                     ┌─────┴──────────────┐
      Supabase Realtime                            ▼      ▼      ▼      ▼
      (chat/notif live)                          image  notif  match  email
                                                 SMS(later)  reconcile  crons
```

**Key idea:** app instances are **stateless** (session in cookie + Redis), so you can add/remove instances freely (auto-scaling). Heavy work → BullMQ workers (separate from web). Reads → Redis cache. Static/images → CDN.

---

# SECTION 2 — HOSTING & AUTO-SCALING

## 2.1 App tier (stateless, horizontally scalable)
- Next.js runs as multiple **stateless instances** behind a **load balancer** (Cloudflare Load Balancer or nginx). No instance holds state → any request can hit any instance.
- **Why stateless matters:** to handle more users you just add instances. Session lives in httpOnly cookie (validated against Redis), not in server memory — so scaling out is trivial.
- **Auto-scaling:** scale on CPU/memory/request-rate. Start small (1–2 instances, ~₹3–5k/month), scale up automatically under load, scale down when quiet (cost-efficient).
  - Launch: 1–2 small instances.
  - Growth: LB + 3–10 instances.
  - Peak/viral: auto-scale to N instances (cloud auto-scaling group / container platform like Railway/Render/Fly.io/AWS ECS — pick one; all support this).
- **Health checks:** LB pings `/api/health` on each instance; unhealthy instances removed automatically.
- **Zero-downtime deploys:** rolling deploy (new instances up → old drained) + rollback script.

## 2.2 Worker tier (separate from web — critical)
- **BullMQ workers run as separate processes/instances** (not inside the web server). This is the single most important scaling decision: image processing, SMS, matching, notifications, emails never touch the request path.
- Workers scale **independently** of web (e.g., a burst of uploads → add image workers, web unaffected).
- Each queue has its own concurrency + priority.

## 2.3 Why this handles millions
- Web instances: stateless → add as many as needed.
- Workers: absorb all heavy work → web stays fast.
- DB: protected by cache + pooling (Section 4).
- Images/static: edge → app never serves them.
- The app server's only job: fast reads (mostly cache) + light writes → returns in ms.

---

# SECTION 3 — QUEUES (BullMQ + Redis) — the backbone of "never blocks"

Every heavy/slow operation is a queued job. The API enqueues and returns instantly; a worker does the work.

## 3.1 Queues
| Queue | Jobs | Concurrency | Priority |
|---|---|---|---|
| **image** | compress→WebP, 4 variants, EXIF strip, watermark | high (scales) | normal |
| **notification** | FCM push, in-app fan-out, batching/dedup | high | high |
| **email** | Resend transactional (invoice, receipts) | medium | normal |
| **sms** | OTP (dev now; MSG91 later), rate-limited | medium | high |
| **matching** | cascade match on approve/edit, builder notify | medium | normal |
| **reconcile** | Razorpay settlement match (hourly) | low | low |
| **cron** | expiry/cleanup/sitemap/backup/digest | low | scheduled |
| **brochure** | ClamAV scan + Ghostscript compress | low | normal |

## 3.2 Reliability features (all mandatory)
- **Rate limiting** per queue (e.g., SMS respects provider limits; image workers capped to avoid R2/CPU overload).
- **Retry with backoff** (e.g., failed image job retries 3× exponentially; webhook retries).
- **Backpressure**: if a queue depth exceeds a threshold, the API returns "processing" states (never blocks the user) and admin gets an alert; workers auto-scale.
- **Idempotency keys**: webhook/payment/proposal jobs are idempotent (duplicate delivery safe).
- **Dead-letter queue**: permanently failed jobs land here → admin cron page → manual retry.
- **Watchdog**: cron watchdog emails admin on any job failure; admin "Run now" button.

## 3.3 Example: "1 crore API calls at once" (your requirement)
- A viral spike sends millions of requests. Flow that keeps the site alive:
  1. Cloudflare edge absorbs + rate-limits abusive traffic (WAF/bot).
  2. LB spreads real traffic across auto-scaled web instances.
  3. Reads served from **Redis cache** (feed, listings, plans) → DB barely touched.
  4. Any write that's heavy (upload, notification) → **queued** → returns instantly.
  5. Workers auto-scale to drain queues; web stays responsive.
- Result: users see instant responses (cached reads + optimistic UI); heavy work catches up in the background. **No blocking, no render stall.**

---

# SECTION 4 — DATABASE (Supabase/Postgres) OPTIMIZATION

The DB must never choke when millions hit it (credits check, feed, search, chat).

## 4.1 Connection pooling (mandatory)
- Use **Supabase's pooler (PgBouncer, transaction mode)**. Serverless/many-instance apps exhaust raw Postgres connections fast; the pooler multiplexes thousands of clients onto a small connection set. **Every app instance connects via the pooler, never directly.**
- Set sane pool sizes; app uses short-lived queries (transaction mode).

## 4.2 Indexing (composite, query-driven)
- Feed/search: composite indexes on `(city_id, area_id, type, status, created_at)`, `(status, boost_start)`, price range.
- `phone` unique index; `thread_id, created_at` for chat; `requirement_id, status` for proposals; `user_id, created_at` for notifications/activity.
- Partial indexes on `status='live'` (most reads are live listings).
- Full-text/GIN index for search (Postgres now; Meilisearch phase 2).
- **Every hot query has an index. No sequential scans on big tables.** Verify with `EXPLAIN`.

## 4.3 Query discipline
- **No N+1**: eager-load related data (joins/`in` queries), never loop queries.
- **Cursor pagination** everywhere (no `OFFSET` on large tables).
- **Atomic counters** for balances/quotas (`SELECT ... FOR UPDATE` / row locks) — proposal-send, quota, slot state — race-safe (Doc 2 races).
- Read replicas (Supabase) for heavy read scaling if needed at growth stage.

## 4.4 RLS + performance
- RLS on every table (security). Keep RLS policies index-friendly (policies reference indexed columns like `user_id`) so they don't slow queries.

## 4.5 What's cached vs DB (see Section 5)
- Hot reads (feed pages, listing detail, plans, master-data, area pages) → Redis. DB hit only on cache miss or writes. This is what keeps DB load flat under millions of users.

---

# SECTION 5 — CACHING (Redis) — keeps DB and app fast

## 5.1 What's cached
| Data | TTL / invalidation |
|---|---|
| Feed pages (per city/mode/filter) | short TTL (30–60s) + invalidate on new-approval in that city |
| Listing/project detail | TTL + invalidate on edit/status change |
| Plans/pricing, master-data (locations/amenities/config), branding, feature flags | long TTL + invalidate on admin change (admin↔public sync) |
| Area/landing (SEO) pages | TTL + invalidate on listing add/remove in that area |
| Session/auth lookups | Redis (fast validate) |
| Rate-limit counters | Redis |
| "New listings" counts, seen-state | Redis |

## 5.2 Rules
- **Cache-aside**: read cache → miss → DB → set cache.
- **Invalidate on write**: admin/user changes purge the exact keys (so admin↔public sync is instant and correct — no stale content).
- **Stampede protection**: locks/`stale-while-revalidate` so a cache miss under load doesn't hammer DB with duplicate queries.
- Edge cache (Cloudflare) for public SSR pages (SEO landing/area/blog) with proper cache headers + purge on change.

---

# SECTION 6 — IMAGES & CDN AT SCALE

- **Upload path**: browser → presigned → **R2 directly** (app server never handles image bytes). This is essential at scale.
- **Processing**: BullMQ image workers (Section 3) → WebP + 4 variants + strip + watermark → store in R2.
- **Serving**: **all images via Cloudflare CDN** (edge-cached, global, fast). App never serves images.
- **Performance**: blur-up placeholders, lazy-load (200px pre-viewport), prefetch next 3–4 feed images, `srcset` per variant (thumb/medium/large), `loading="lazy"`, `decoding="async"`.
- **Zoom**: client-side fullscreen viewer (pinch/double-tap), loads `large`/`original` on demand only.
- **Static assets** (JS/CSS/fonts): CDN + immutable cache + code-splitting so first paint is fast.

---

# SECTION 7 — REALTIME AT SCALE (chat/notifications)

- **Supabase Realtime** for chat messages, typing, notifications, number-flow, "new listings" pill, admin queue counts.
- Events carry **IDs only**; client re-fetches gated data via API (so RLS/entitlement applies; numbers never leak in events).
- Subscriptions scoped per-user + per-thread (not global) to keep fan-out efficient.
- Presence (online/last-seen/typing) via Realtime presence, throttled.
- At very high scale: Redis pub/sub backs fan-out; connection limits monitored; fallback to polling for non-critical badges if needed.

---

# SECTION 8 — PERFORMANCE BUDGETS (Instagram-smooth, high-FPS)

Hard targets Claude must meet + test:
- **Feed first render < 2.5s on 4G**; navigation < 1s (cached).
- **60fps** on scroll/swipe/open/close/story-progress on mid-range Android — animations use **transform/opacity only** (GPU-composited); no layout-triggering animation.
- **No layout shift (CLS ~0)** — fixed dimensions (aspect-ratio boxes), skeletons match final layout, images reserve space.
- **No jank**: virtualize long lists (chat 50/page, feed cursor + windowing), debounce search, throttle scroll handlers, `passive` listeners, `content-visibility` where useful.
- **Fast interaction**: optimistic UI (send/like/save), instant sheet open (pre-rendered), `will-change` on animated elements sparingly.
- **Bottom nav fixed**, no reflow on scroll; header scroll-morph uses transform only.
- **No accidental text-select** on chrome (`user-select:none`); readable content selectable.
- **prefers-reduced-motion** honored.
- Bundle: code-split per route/subdomain; ship minimal JS to public pages (SSR); tree-shake; no heavy libs on critical path.

---

# DOC 8 — HOMZLIST ARCHITECTURE (Part 2 — Final)

---

# SECTION 9 — LOAD TESTING (k6 / Artillery)

Browser preview can't test scale — so we simulate concurrency with scripts. Claude sets these up; you run them to see how much the site holds.

## 9.1 Tool choice
- **k6** (primary) — developer-friendly, JS scripts, great metrics, ramps to high VUs.
- **Artillery** (alternative) — YAML scenarios, good for mixed user journeys.

## 9.2 Scenarios to script (real user journeys, not just one endpoint)
1. **Browse-heavy** (90% of load): guests hitting feed + listing detail + area/SEO pages. Tests cache + CDN + read scaling.
2. **Search**: autocomplete + filtered search + area pages. Tests DB indexes + cache.
3. **Auth burst**: OTP request/verify flood. Tests rate-limits + lockouts (must throttle, not crash).
4. **Write/upload**: create listing + presigned image upload + commit. Tests queue backpressure (web must stay fast).
5. **Chat/realtime**: many concurrent threads sending messages. Tests Realtime + DB writes.
6. **Payment**: checkout + webhook. Tests idempotency + no double-activation under concurrency.
7. **Mixed/viral**: weighted blend (70% browse, 15% search, 10% chat, 5% write) ramping to peak — the realistic "everyone at once."

## 9.3 Ramp profile
- Warm-up → steady → **spike** (sudden jump to simulate viral) → sustained peak → ramp-down.
- Stages (example): 0→1k VUs (2m) → 1k steady (3m) → spike 1k→20k (1m) → 20k steady (5m) → down.
- Run bigger tiers on staging with distributed k6 (cloud) to push toward the extreme concurrency you want.

## 9.4 Pass/fail targets (must hold under peak)
- p95 latency: cached reads < 200ms, DB reads < 500ms, writes < 800ms.
- Error rate < 0.5% (excluding intentional rate-limit 429s).
- **No blocking**: web stays responsive while queues drain; queue depth recovers after spike.
- DB connections stable (pooler holds); CPU/memory within auto-scale bounds; auto-scaling actually triggers.
- Realtime message delivery < 1s under load.

## 9.5 Example k6 skeleton (Claude writes full versions)
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  scenarios: {
    browse: { executor:'ramping-vus', startVUs:0,
      stages:[{duration:'2m',target:1000},{duration:'3m',target:1000},
              {duration:'1m',target:20000},{duration:'5m',target:20000},
              {duration:'2m',target:0}] }
  },
  thresholds: { http_req_duration:['p95<500'], http_req_failed:['rate<0.005'] }
};
export default function () {
  const feed = http.get('https://homzlist.com/api/v1/feed?mode=property');
  check(feed, { 'feed 200': r => r.status === 200 });
  const area = http.get('https://homzlist.com/flats-for-sale-in-mavdi-rajkot');
  check(area, { 'area 200': r => r.status === 200 });
  sleep(1);
}
```
Claude produces full scripts for all 7 scenarios + a runbook (how to run, read results, find bottlenecks, fix).

## 9.6 After load test → fix loop
Report: throughput, p50/p95/p99, error rate, queue depths, DB metrics, where it bent. Fix the bottleneck (add index / raise cache TTL / more workers / tune pool) → re-run.

---

# SECTION 10 — SCALING STAGES (exact configs)

| Stage | Users | Web | Workers | DB | Cache | Notes |
|---|---|---|---|---|---|---|
| **Launch** | up to ~10k/day | 1–2 small instances | 1 worker (all queues) | Supabase free/small + pooler | Redis small | ~₹3–5k/mo |
| **Growth** | ~100k/day | LB + 3–10 instances (auto) | 2–4 workers (split image/notif) | Supabase paid + read replica | Redis dedicated | metrics-driven |
| **High** | millions/day | auto-scale N + LB | image/notif/matching split, many | Postgres scaled + replicas + heavy cache | Redis cluster | CDN does most reads |
| **Viral/peak** | extreme spike | auto-scale to ceiling | workers auto-scale, backpressure on | pooler + replicas + aggressive cache + edge cache | Redis cluster + pub/sub | edge absorbs, queues buffer |

**Principle:** you don't rebuild to scale — you **add instances/workers + turn up cache**. The architecture is the same from day 1; only counts change.

---

# SECTION 11 — RELIABILITY, DR & LIMITS

## 11.1 Backups & disaster recovery
- Automated backups: **30 daily + 12 monthly**, encrypted at rest.
- **Restore drill before launch** (prove backups actually restore) + periodic drills.
- Point-in-time recovery (Supabase) enabled at growth stage.
- Migrations staged + reversible; rollback script for deploys.

## 11.2 Failover & health
- LB health checks remove unhealthy instances automatically.
- Multiple availability zones at growth stage.
- Graceful degradation: if a non-critical service is down (e.g., email), the app still works (queue retries; user sees clean state, not an error).
- **Provider fallbacks**: SMS provider fallback (MSG91 down → alternate at launch time); payment gateway fallback flag (Cashfree) ready.

## 11.3 Rate-limit tiers (edge + app) — abuse & resource-exhaustion protection
- Edge (Cloudflare): global abuse/bot/DDoS + WAF.
- App per-endpoint (Redis counters): login/OTP tight, search medium, feed loose, inquiries 100/day, 404-spike enumeration block, velocity rules (listings/hour, proposals/hour, account-creations/device). All admin-configurable. **No CAPTCHA** (lockout + rate-limit + honeypot instead).

## 11.4 Cost & abuse alerts
- Budget alerts: SMS spend, WhatsApp, storage, CDN, DB — admin sees when nearing limits (catches OTP abuse / storage runaway early).

---

# SECTION 12 — COST BREAKDOWN (per stage, transparent)

| Item | Launch | Growth | High-scale |
|---|---|---|---|
| App hosting (VPS/containers) | ₹500–1,500/mo | ₹5k–20k | scales with instances |
| Supabase | Free→₹2k | ₹2k–8k | usage-based |
| Redis | Free→₹500 | ₹1k–3k | cluster cost |
| Cloudflare R2 + CDN | ~free (10GB) | low (cheap egress) | low (R2 has no egress fees) |
| SMS (OTP) | dev = ₹0 | per-OTP (~₹0.20) | per-OTP |
| Email (Resend) | free (3k/mo) | ₹0–2k | usage |
| Razorpay | 2% per txn | 2% | 2% |
| **Total infra (excl. txn fees)** | **~₹1k–3k/mo** | **~₹10k–40k/mo** | usage-driven |

**Cost stays low at launch** (mostly free tiers + dev-OTP) and grows only with real usage. R2's no-egress-fee model keeps image costs low even at scale.

---

# SECTION 13 — OBSERVABILITY

- **Sentry**: errors (server detail only; users never see stack traces).
- **Structured logs**: user, endpoint, duration, status (90-day). Slow-query log.
- **Metrics dashboard**: request rate, p50/p95/p99, error rate, queue depths, DB connections, cache hit-rate, worker throughput, Realtime connections.
- **Uptime monitoring** + alerts (health endpoint).
- **Cron status page** (admin): last/next run, failures, run-now.
- **Cost alerts** (Section 11.4).
- All this feeds the admin System-status + Analytics screens (already designed).

---

# SECTION 14 — THE "MILLIONS AT ONCE" WALKTHROUGH (end-to-end)

A viral moment: a huge number of users hit HomzList simultaneously. Trace one browse + one action:

**Browse (a guest opens feed):**
1. Cloudflare edge: WAF/bot filters junk; serves cached static shell instantly.
2. LB → an auto-scaled web instance (stateless).
3. Feed API → **Redis cache hit** → returns in ~ms. DB not touched.
4. Images → **CDN edge** (never app). Blur-up + lazy-load → smooth 60fps scroll.
→ User sees an instant, smooth feed. Multiply by millions: cache + CDN + more instances absorb it; DB load stays flat.

**Action (a user uploads a listing with 10 photos):**
1. Form submit → API validates + reserves slot → returns instantly ("under review").
2. Photos → presigned → uploaded **direct to R2** (app never handles bytes).
3. Image processing → **BullMQ** (WebP/variants/strip/watermark) in background workers.
4. Approval later → matching + notifications → **queued** → workers fan out.
→ The user's request returned in ms; all heavy work happened off the request path. Web stayed fast for everyone else.

**Why nothing blocks:** reads = cache/edge; writes = light + queued; heavy = workers (auto-scaled); DB = pooled + indexed + cache-shielded; app = stateless + auto-scaled. Backpressure + retries + rate-limits keep it stable under any spike. This is the same design at 10 users or 10 crore — only the instance/worker/cache counts change.

---

