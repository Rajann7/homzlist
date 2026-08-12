/**
 * Leads / inquiry UI sweep — in a REAL, hydrated browser.
 *
 *   node scripts/check-leads-ui.mjs [http://seller.lvh.me:3000]
 *
 * Why this exists: the in-app browser pane runs its tab hidden, Chrome freezes
 * a tab it never composites, and React's hydration is scheduled work — so in
 * the pane nothing is ever interactive and "does the button work?" cannot be
 * answered there. This drives headless Chrome over CDP (scripts/lib/cdp.mjs),
 * where the page really hydrates, and then does what a person would do: tap
 * things and read what happens.
 *
 * It covers the half `check-leads-live.mjs` cannot: hydration, taps, the sheet
 * opening and stepping, the search field filtering, and screenshots.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, newPage } from "./lib/cdp.mjs";

const BASE = (process.argv[2] ?? "http://seller.lvh.me:3000").replace(/\/$/, "");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, "docs", "_shots", "leads");

const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const results = [];
const check = (n, p, d = "") => { results.push({ n, p: !!p, d }); console.log(`${p ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); };

// A seller who actually has leads, so the screens have something to draw.
const SELLER_PHONE = process.env.LEADS_UI_PHONE ?? "9826008333";

const browser = await launch({ headless: true });
console.log(`chrome: ${browser.version.Browser}`);
const page = await newPage(browser, "about:blank");
await page.setViewport(390, 844);

try {
  // ---- 0. sign in, the way the app does -----------------------------------
  await page.goto(`${BASE}/login`);
  const login = await page.eval(`(async () => {
    const post = async (u, b) => (await fetch(u, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b), credentials: "same-origin",
    })).json();
    const r1 = await post("/api/v1/auth/otp/request", { phone: ${JSON.stringify(SELLER_PHONE)} });
    if (!r1.ok) return { ok: false, at: "request", err: r1.error };
    const r2 = await post("/api/v1/auth/otp/verify", { otpSession: r1.data.otpSession, code: r1.data.devCode ?? "123456" });
    return r2.ok ? { ok: true, name: r2.data.user?.name } : { ok: false, at: "verify", err: r2.error };
  })()`);
  if (!login?.ok) throw new Error(`sign-in failed at ${login?.at}: ${JSON.stringify(login?.err)}`);
  console.log(`signed in as ${login.name}\n`);

  // ---- 1. the Leads screen HYDRATES ---------------------------------------
  const state = await page.goto(`${BASE}/leads`, { waitMs: 1500 });
  check("Leads page hydrates (React fibers attached to the DOM)", state?.hydrated === true, `ready=${state?.ready} fiberKeys=${state?.keys}`);

  await page.waitFor(`/\\d+ total/.test(document.querySelector("header")?.innerText ?? "") || (document.querySelector("main")?.innerText ?? "").includes("No leads yet")`);
  const drawn = await page.eval(`(() => {
    const t = document.querySelector("main")?.innerText ?? "";
    return {
      tabs: /Received/.test(t) && /Sent/.test(t),
      groups: ["Properties", "Projects", "Requirements"].filter(g => t.toLowerCase().includes(g.toLowerCase())),
      counts: (t.match(/\\d+ new · \\d+ total|\\d+ total/g) || []).slice(0, 3),
      header: document.querySelector("header")?.innerText?.replace(/\\n/g, " ") ?? "",
    };
  })()`);
  check("client data landed: tabs + at least one group render",
    drawn.tabs && drawn.groups.length > 0, `${drawn.groups.join("/")} · ${drawn.counts.join(", ")}`);
  check("header shows the live total", /\d+ total/.test(drawn.header), drawn.header);
  await page.screenshot(path.join(SHOTS, "01-received.png"));

  // ---- 2. the header search stays on this screen --------------------------
  const beforeUrl = await page.eval(`location.pathname`);
  await page.eval(`(() => {
    const b = [...document.querySelectorAll("button")].find(x => x.getAttribute("aria-label") === "Search your leads");
    if (b) b.click();
    return !!b;
  })()`);
  await page.eval(`new Promise(r => setTimeout(r, 400))`);
  const searchState = await page.eval(`(() => ({
    path: location.pathname,
    hasField: !!document.querySelector('input[placeholder^="Search your"]'),
  }))()`);
  check("tapping Search opens an in-screen field, does not navigate",
    searchState.hasField && searchState.path === beforeUrl, `${searchState.path} field=${searchState.hasField}`);

  const filtered = await page.eval(`(async () => {
    const input = document.querySelector('input[placeholder^="Search your"]');
    if (!input) return null;
    const before = document.querySelectorAll('main a[href*="/leads/"]').length;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "zzzznomatch");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const after = document.querySelectorAll('main a[href*="/leads/"]').length;
    const empty = (document.querySelector("main")?.innerText ?? "").includes("Nothing matches");
    return { before, after, empty };
  })()`);
  check("typing in it really filters the list",
    filtered && filtered.after < filtered.before && filtered.empty,
    filtered ? `${filtered.before} → ${filtered.after}, empty-state=${filtered.empty}` : "no field");
  await page.screenshot(path.join(SHOTS, "02-search.png"));

  // ---- 3. drill into a subject --------------------------------------------
  await page.goto(`${BASE}/leads`, { waitMs: 1200 });
  await page.waitFor(`!!document.querySelector("main a[href*='/leads/']")`);
  const opened = await page.clickSelector('main a[href*="/leads/listing/"], main a[href*="/leads/project/"], main a[href*="/leads/requirement/"]');
  await page.waitFor(`location.pathname.split("/").length > 2`);
  await page.eval(`new Promise(r => setTimeout(r, 1200))`);
  await page.waitFor(`!!document.querySelector("main a[href*='/leads/lead/']") || (document.querySelector("main")?.innerText ?? "").includes("No leads on this")`);
  const subject = await page.eval(`(() => {
    const t = document.querySelector("main")?.innerText ?? "";
    const head = document.querySelector("header")?.innerText?.replace(/\\n/g, " ") ?? "";
    return {
      path: location.pathname,
      head,
      chips: [...document.querySelectorAll("main button")].map(b => b.innerText.trim()).filter(Boolean).slice(0, 8),
      // The list is a list of PEOPLE now: no dial BUTTONS per card, one menu.
      // (The words still appear inside a summary line — "Availability ·
      // WhatsApp · Tomorrow" — so this counts controls, not text.)
      dialButtons: [...document.querySelectorAll("main button")]
        .filter(b => /^(call|whatsapp)$/i.test(b.innerText.trim())).length,
      menus: document.querySelectorAll('main button[aria-label="Lead options"]').length,
      cardLinks: document.querySelectorAll('main a[href*="/leads/lead/"]').length,
      hasWants: /Wants|Contact by|Best time/.test(t),
    };
  })()`);
  check("tapping a post opens its leads", Boolean(opened) && subject.path.includes("/leads/"), `${opened} → ${subject.path}`);
  check("filter chips render, scoped to this post", subject.chips.some((c) => /^All \d+/.test(c)), subject.chips.join(" | "));
  check("the list shows leads only — no dial buttons on the cards",
    subject.dialButtons === 0 && subject.cardLinks > 0,
    `dialButtons=${subject.dialButtons} cards=${subject.cardLinks}`);
  check("every card has its options menu", subject.menus === subject.cardLinks && subject.menus > 0,
    `${subject.menus} menus for ${subject.cardLinks} cards`);
  await page.screenshot(path.join(SHOTS, "03-subject-leads.png"));

  // ---- 4. lead detail ------------------------------------------------------
  const toDetail = await page.clickSelector('main a[href*="/leads/lead/"]');
  await page.waitFor(`location.pathname.includes("/leads/lead/")`);
  await page.eval(`new Promise(r => setTimeout(r, 1200))`);
  await page.waitFor(`(document.querySelector("main")?.innerText ?? "").match(/inquiry for/i) || (document.querySelector("main")?.innerText ?? "").includes("isn't available")`);
  const detail = await page.eval(`(() => {
    const t = document.querySelector("main")?.innerText ?? "";
    return {
      path: location.pathname,
      hasInquiryFor: /inquiry for/i.test(t),
      hasStatus: /^\s*status\s*$/im.test(t),
      hasNumber: /\\+91\\d{10}/.test(t),
      statusChips: ["New", "Contacted", "Converted", "Archived"].filter(s => t.includes(s)),
    };
  })()`);
  if (toDetail) {
    const chosen = await page.eval(`(() => {
      const t = document.querySelector("main")?.innerText ?? "";
      const i = t.toLowerCase().indexOf("contact by");
      const pref = i < 0 ? null : (t.slice(i, i + 40).match(/call|whatsapp/i) || [])[0] ?? null;
      const primary = [...document.querySelectorAll("main button")].map(b => b.innerText.trim()).find(x => /^(Call|WhatsApp)$/i.test(x)) ?? null;
      return { pref, primary };
    })()`);
    check("lead detail leads with the channel the sender chose",
      chosen.pref && chosen.primary && chosen.pref.toLowerCase() === chosen.primary.toLowerCase(),
      `chose=${chosen.pref} button=${chosen.primary}`);
    check("lead detail opens with the designed sections",
      detail.hasInquiryFor && detail.hasStatus, `INQUIRY FOR=${detail.hasInquiryFor} STATUS=${detail.hasStatus}`);
    check("the number is shown in full, unmasked", detail.hasNumber, detail.hasNumber ? "+91……… present" : "no number rendered");
    check("all four status chips render", detail.statusChips.length === 4, detail.statusChips.join(", "));
    await page.screenshot(path.join(SHOTS, "04-lead-detail.png"));

    // Tapping a status chip must persist — the only workflow this screen has.
    const moved = await page.eval(`(async () => {
      const chip = [...document.querySelectorAll("button")].find(b => b.innerText.trim() === "Contacted");
      if (!chip) return null;
      chip.click();
      await new Promise(r => setTimeout(r, 1200));
      const id = location.pathname.split("/").pop();
      const res = await (await fetch("/api/v1/leads/" + id, { credentials: "same-origin", cache: "no-store" })).json();
      return res?.data?.lead?.status ?? null;
    })()`);
    check("tapping a status chip writes it to the server", moved === "contacted", String(moved));
  } else {
    check("lead detail opens", false, "no lead link on the subject screen");
  }

  // ---- 5. the inquiry sheet, on a real listing -----------------------------
  const target = await page.eval(`(async () => {
    const r = await (await fetch("/api/v1/feed?tab=all", { credentials: "same-origin", cache: "no-store" })).json();
    const card = (r?.data?.items ?? r?.data?.cards ?? []).find(c => c.kind === "property" && !c.isOwn);
    return card?.id ?? null;
  })()`);
  if (target) {
    await page.goto(`${BASE}/listings/${target}`, { waitMs: 1800 });
    await page.waitFor(`[...document.querySelectorAll("button")].some(b => b.innerText.includes("Send Inquiry"))`);
    const cta = await page.clickText("Send Inquiry");
    await page.waitFor(`/step 1 of 3|inquiry already sent|how would you like to connect/i.test(document.body.innerText)`);
    const sheet = await page.eval(`(() => {
      const t = document.body.innerText;
      return {
        opened: /step 1 of 3/i.test(t) || /inquiry already sent/i.test(t),
        already: /inquiry already sent/i.test(t),
        chips: [...document.querySelectorAll("button")].map(b => b.innerText.trim()).filter(Boolean).slice(0, 12),
        banned: /No message is required|chat/i.test(t),
      };
    })()`);
    check("Send Inquiry opens the sheet", sheet.opened, cta ? `tapped "${cta}"` : "button not found");
    check("no message/chat wording on the sheet", !sheet.banned);
    await page.screenshot(path.join(SHOTS, "05-inquiry-sheet.png"));

    if (sheet.opened && !sheet.already) {
      const stepped = await page.eval(`(async () => {
        const click = (txt) => {
          const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === txt);
          if (b) b.click();
          return !!b;
        };
        click("Price");
        await new Promise(r => setTimeout(r, 250));
        const c1 = click("Continue");
        await new Promise(r => setTimeout(r, 500));
        const onStep2 = /step 2 of 3/i.test(document.body.innerText);
        const c2 = click("Continue");
        await new Promise(r => setTimeout(r, 500));
        const onStep3 = /step 3 of 3/i.test(document.body.innerText);
        const consentText = /i agree to share my contact details/i.test(document.body.innerText);
        const sheet = [...document.querySelectorAll("[role=dialog]")].pop();
        const sendBtn = sheet ? [...sheet.querySelectorAll("button")].find(b => /send inquiry/i.test(b.innerText)) : null;
        return { c1, onStep2, c2, onStep3, consentText, sendDisabled: sendBtn ? sendBtn.disabled : null };
      })()`);
      check("the three steps advance on tap", stepped.onStep2 && stepped.onStep3,
        `step2=${stepped.onStep2} step3=${stepped.onStep3}`);
      check("consent line renders and Send is blocked until it is ticked",
        stepped.consentText && stepped.sendDisabled === true,
        `consent=${stepped.consentText} sendDisabled=${stepped.sendDisabled}`);
      await page.screenshot(path.join(SHOTS, "06-step3-consent.png"));

      // …and ticking it enables Send. Consent is the wall, and it must be real.
      const ticked = await page.eval(`(async () => {
        const box = [...document.querySelectorAll("button")].find(b => /i agree to share my contact details/i.test(b.innerText));
        if (!box) return null;
        box.click();
        await new Promise(r => setTimeout(r, 400));
        const sheet = [...document.querySelectorAll("[role=dialog]")].pop();
        const sendBtn = sheet ? [...sheet.querySelectorAll("button")].find(b => /send inquiry/i.test(b.innerText)) : null;
        return sendBtn ? sendBtn.disabled : null;
      })()`);
      check("ticking consent enables Send", ticked === false, `disabled=${ticked}`);

      // The custom-number popup — the thing that was completely dead.
      const popup = await page.eval(`(async () => {
        const back = [...document.querySelectorAll("button")].find(b => b.innerText.trim() === "Back");
        if (back) { back.click(); await new Promise(r => setTimeout(r, 400)); }
        const link = [...document.querySelectorAll("button")].find(b => b.innerText.trim() === "Use a different number");
        if (!link) return { found: false };
        link.click();
        await new Promise(r => setTimeout(r, 600));
        return { found: true, opened: /use a different number/i.test(document.body.innerText) && !!document.querySelector('input[placeholder*="10-digit"]') };
      })()`);
      check("the custom-number popup opens", popup.found && popup.opened, JSON.stringify(popup));
      await page.screenshot(path.join(SHOTS, "07-number-popup.png"));
    }
  } else {
    check("inquiry sheet walk (skipped — no other seller's property in the feed)", true, "");
  }

  // ---- 6. nothing screamed in the console ---------------------------------
  const errs = page.consoleErrors().filter((t) => !/hmr|websocket|favicon|Failed to load resource/i.test(t));
  check("no console errors on the leads flow", errs.length === 0, errs.slice(0, 2).join(" | "));

  console.log(`\nscreenshots → ${SHOTS}`);
} finally {
  try { page.close(); } catch { /* closing */ }
  await browser.close();
}

const failed = results.filter((r) => !r.p);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("FAILED:"); failed.forEach((f) => console.log(` ❌ ${f.n} — ${f.d}`)); }
process.exit(failed.length ? 1 : 0);
