# HomzList — App

Instagram-style real estate listing PWA. One Next.js codebase, three subdomains.
See `CLAUDE.md` (project brain) and `build/Doc6` (build guide) for the full plan.

## Stack
Next.js 14 (App Router) · TypeScript · Tailwind (Doc1 tokens) · Supabase (`@supabase/ssr`, RLS) ·
Cloudflare R2 · Redis + BullMQ · Razorpay · FCM · Resend. OTP is in **dev mode** (fixed code, no SMS).

## Getting started
```bash
npm install
cp .env.local.example .env.local   # fill values as each module needs them
npm run dev                         # web (http://localhost:3000)
npm run worker                      # BullMQ workers (separate process — Doc8 §2.2)
```
Requires a local Redis for queues/cache (`REDIS_URL`). Supabase/R2/Razorpay are wired per module.

## Subdomains (middleware routing — `middleware.ts`, Doc6 §4)
| Host | Group | Internal rewrite | Access |
|---|---|---|---|
| `homzlist.com` | `app/(public)` | — | Guest-readable, SSR/SEO |
| `seller.homzlist.com` | `app/(seller)/seller` | `/*` → `/seller/*` | Seller session (else → /login) |
| `account.homzlist.com` | `app/(admin)/account` | `/*` → `/account/*` | Admin Google whitelist |

Locally, test other hosts with a Host header, e.g.
`curl -H "Host: seller.localhost" http://localhost:3000/`.

## Layout
```
app/            route groups (public)/(seller)/(admin) + api + manifest/offline/icon
components/     shared design-system library (ui/, nav/, theme/, pwa/) — import from "@/components"
lib/            env, tokens, utils, supabase/, redis, queues/, image-pipeline, api (envelope+errors)
skills/         per-module knowledge (design-system, security-rules, api-contract, qa-checklist, design-to-code)
public/         sw.js + icons
scripts/        gen-icons.mjs (rasterize brand SVGs → PNG)
```

## Scripts
`dev` · `build` · `start` · `lint` · `typecheck` · `worker`

## Design + security rules (non-negotiable)
- Never hardcode hex — use Doc1 token classes (`bg-surface-1`, `text-ink-primary`, …). Dark mode = token swap.
- BottomNav = P3 canonical, fixed. `.chrome` = `user-select:none` on UI chrome.
- Two walls: API authz + Supabase RLS on every table. `service_role` key server-only.
- Every screen ships loading/empty/error/offline states. Run `skills/qa-checklist` after each module.

## Foundation gallery
`/foundation` renders every core component + state (light/dark) for visual QA. Not a product screen.
