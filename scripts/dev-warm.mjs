#!/usr/bin/env node
/**
 * dev-warm.mjs — starts `next dev` and pre-compiles the hot routes as soon as
 * the server is Ready.
 *
 * Why this exists: with Turbopack, `next dev` opens the port (~16s) long before
 * the first route is renderable — the very first `GET /` triggers a ~30s compile.
 * The preview tool reports "started" when the port listens, so an immediate
 * navigate lands mid-compile and looks broken; you retry 5-6 times, which just
 * waits out the compile. This wrapper fires that first compile itself the moment
 * the server is Ready, so by the time anyone navigates, `/` is already warm.
 *
 * It's a transparent pass-through: same stdout/stderr, same exit code, same
 * signals as `next dev`. Warm-up failures are ignored (best-effort only).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nextBin = join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
const port = process.env.PORT || '3000';

// Routes to pre-compile. Home page is the big one (blocks the feed); the feed
// APIs the home page fans out to are next. Keep this list to the cold-start
// critical path only — warming everything just delays the useful compiles.
const WARM_PATHS = [
  '/',
  '/api/v1/feed/sections',
  '/api/v1/feed/badges',
  '/api/v1/feed/banner',
];

let warmed = false;
function warm() {
  if (warmed) return;
  warmed = true;
  const base = `http://localhost:${port}`;
  for (const path of WARM_PATHS) {
    // Fire-and-forget; Turbopack compiles the route on first hit. Errors
    // (401 for guest, aborts) are expected and ignored — we only want the
    // compile side effect.
    fetch(base + path, { headers: { 'x-warmup': '1' } }).catch(() => {});
  }
  console.log(`\x1b[2m[dev-warm] pre-compiling ${WARM_PATHS.length} routes…\x1b[0m`);
}

const child = spawn(process.execPath, [nextBin, 'dev'], {
  stdio: ['inherit', 'pipe', 'inherit'],
  env: process.env,
});

// Mirror stdout to our own stdout, and trip the warmer when we see "Ready".
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  if (!warmed && /Ready in/i.test(chunk.toString())) {
    // Small delay so the HTTP listener is fully accepting before we knock.
    setTimeout(warm, 400);
  }
});

// Forward termination signals so preview_stop / Ctrl-C kill next dev cleanly.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
