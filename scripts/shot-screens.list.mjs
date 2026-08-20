/**
 * The screen list for scripts/shot-screens.mjs — every route the user-facing
 * app has, per role, with the fixture ids substituted in.
 *
 * Kept separate from the harness so the list can grow (new module → new
 * screens) without touching the capture machinery.
 */
import { env } from "./lib/dbx.mjs";

/**
 * The whole of P1 in one pass. AuthFlow is client-state driven — splash,
 * onboarding, login, otp, role, details, coach are all the same URL — so the
 * only way to photograph them is to walk them the way a person does.
 *
 * A never-before-seen number is used for the register half, because role /
 * details / coach only exist for a first-time user. It writes one throwaway
 * profile to the DEV database; nothing else.
 */
const KNOWN_NUMBER = "9999000007"; // Amit Shah, already registered
const DEV_OTP_CODE = env.OTP_DEV_FIXED_CODE ?? "123456"; // lib/env.ts default

function authFlow(P, newNumber) {
  return async (page, t) => {
    const type = async (sel, val) => {
      await page.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) { el.focus(); } return !!el; })()`);
      await page.typeInto(sel, val);
    };
    // AuthFlow branches on two localStorage keys: `hz-onboarded` decides
    // onboarding-vs-login, `hz-saved-accounts` decides the S5 picker. Reset
    // them explicitly so each screen below is reached on purpose rather than
    // by whatever the previous step left behind.
    const reset = async ({ onboarded = true, savedAccounts = [] } = {}) => {
      await t.goto(`${P}/login`, { waitMs: 400 });
      await page.eval(`(() => {
        try {
          localStorage.clear();
          ${JSON.stringify(onboarded)} && localStorage.setItem("hz-onboarded", "1");
          const sa = ${JSON.stringify(savedAccounts)};
          if (sa.length) localStorage.setItem("hz-saved-accounts", JSON.stringify(sa));
        } catch {}
        return true;
      })()`);
    };
    const fresh = () => reset({ onboarded: true });

    // S1 splash — only on screen for ~900ms before it replaces itself
    await reset({ onboarded: false });
    await t.goto(`${P}/login`, { waitMs: 250 });
    await t.hideDevOverlay();
    await t.shoot("40-auth-01-splash");

    // S2 onboarding, all three slides
    await t.sleep(1400);
    await t.hideDevOverlay();
    await t.shoot("40-auth-02-onboarding-1");
    for (const n of [2, 3]) {
      const hit = await page.clickText("Next");
      if (!hit) break;
      await t.sleep(500);
      await t.shoot(`40-auth-02-onboarding-${n}`);
    }

    // S3 login (phone)
    await page.clickText("Skip");
    await t.sleep(400);
    if (!(await page.eval(`!!document.querySelector('input[inputmode="numeric"]')`))) {
      await page.clickText("Get started");
    }
    await t.sleep(300);
    await t.hideDevOverlay();
    await t.shoot("40-auth-03-login-phone");

    // S3b login, number half-typed — Continue is disabled until 10 digits
    await type('input[inputmode="numeric"]', "98250");
    await page.clickText("Continue");
    await t.sleep(500);
    await t.shoot("40-auth-04-login-incomplete");

    // S4 OTP
    await fresh();
    await t.goto(`${P}/login`, { waitMs: 2200 });
    await t.hideDevOverlay();
    await type('input[inputmode="numeric"]', KNOWN_NUMBER);
    await t.sleep(200);
    await page.clickText("Continue");
    await t.sleep(1600);
    await t.hideDevOverlay();
    await t.shoot("40-auth-05-otp");

    // S4b OTP with a wrong code — the error state
    await type('input[inputmode="numeric"]', "000000");
    await t.sleep(300);
    await page.clickText("Verify");
    await t.sleep(1800);
    await t.hideDevOverlay();
    await t.shoot("40-auth-06-otp-wrong-code");

    // S5 register: role picker → details → coach (first-time number only)
    await fresh();
    await t.goto(`${P}/login`, { waitMs: 2200 });
    await t.hideDevOverlay();
    await type('input[inputmode="numeric"]', newNumber);
    await page.clickText("Continue");
    await t.sleep(1600);
    // In dev the provider accepts one fixed code for any number
    // (lib/auth/otp-provider.ts devProvider.codeFor → OTP_DEV_FIXED_CODE).
    const code = process.env.OTP_DEV_FIXED_CODE ?? DEV_OTP_CODE;
    if (code && (await page.eval(`!!document.querySelector('input[inputmode="numeric"]')`))) {
      await type('input[inputmode="numeric"]', code);
      await t.sleep(300);
      await page.clickText("Verify");
      await t.sleep(2200);
      await t.hideDevOverlay();
      await t.shoot("40-auth-07-role-picker");

      // the "About <role>" explainer sheet
      const info = await page.clickSelector('[aria-label^="About "]');
      if (info) { await t.sleep(500); await t.shoot("40-auth-08-role-explainer"); await page.clickText("Close"); await t.sleep(400); }

      await page.clickText("Owner");
      await t.sleep(300);
      await page.clickText("Continue");
      await t.sleep(900);
      await t.hideDevOverlay();
      await t.shoot("40-auth-09-details");

      await page.clickText("Continue");
      await t.sleep(700);
      await t.shoot("40-auth-10-details-errors");
    } else {
      console.log("  ⏭  register half skipped — no dev OTP code on screen");
    }

    // S5 saved-accounts picker — the returning-device screen
    await reset({
      onboarded: true,
      savedAccounts: [{ name: "Amit Shah", phone: KNOWN_NUMBER, phoneMasked: "+91 ••••• •0007" }],
    });
    await t.goto(`${P}/login`, { waitMs: 2200 });
    await t.hideDevOverlay();
    await t.shoot("40-auth-11-saved-accounts");
    await reset({ onboarded: true });
  };
}

/** Routes that exist on the public host and need no session. */
function guestScreens(f, HOST) {
  const P = HOST.public;
  const s = [];
  const add = (id, url, opt = {}) => s.push({ id, url, ...opt });

  // ── feed & shells
  add("01-feed", `${P}/`, { waitMs: 2200 });
  add("02-search", `${P}/search`, { waitMs: 1800 });
  add("03-search-results", `${P}/search/results?q=flat`, { waitMs: 2200 });
  add("04-search-results-empty", `${P}/search/results?q=zzzzqqqnothing`, { waitMs: 2000 });
  add("05-search-coming-soon", `${P}/search/coming-soon`, { waitMs: 1600 });

  // ── detail screens
  if (f.listingPublic) add("10-property-number-public", `${P}/property/${f.listingPublic.id}`, { waitMs: 2200 });
  if (f.listingPrivate) add("11-property-number-private", `${P}/property/${f.listingPrivate.id}`, { waitMs: 2200 });
  if (f.listingSold) add("12-property-sold", `${P}/property/${f.listingSold.id}`, { waitMs: 2200 });
  if (f.project) add("13-project", `${P}/project/${f.project.id}`, { waitMs: 2200 });
  if (f.project) add("14-project-alt-route", `${P}/projects/${f.project.id}`, { waitMs: 2200 });
  if (f.requirement) add("15-requirement", `${P}/requirements/${f.requirement.id}`, { waitMs: 2000 });
  if (f.profileUser) add("16-profile-public", `${P}/profile/${f.profileUser}`, { waitMs: 2200 });
  if (f.storyPoster) add("17-story-viewer", `${P}/story/${f.storyPoster.poster_id}`, { waitMs: 2600 });

  // ── SEO surfaces
  if (f.area) add("20-area", `${P}/area/${f.area.slug}`, { waitMs: 2200 });
  if (f.city) add("21-landing-city", `${P}/${f.city.slug}`, { waitMs: 2200 });
  if (f.city) add("22-landing-matrix", `${P}/flats-for-sale-in-${f.city.slug}`, { waitMs: 2200 });
  if (f.city) add("23-landing-rent", `${P}/2-bhk-flats-for-rent-in-${f.city.slug}`, { waitMs: 2200 });
  if (f.city) add("24-landing-projects", `${P}/new-projects-in-${f.city.slug}`, { waitMs: 2200 });

  // ── content
  add("30-blog-index", `${P}/blog`, { waitMs: 1800 });
  if (f.blog) add("31-blog-post", `${P}/blog/${f.blog.slug}`, { waitMs: 1800 });
  add("32-legal-index", `${P}/legal`, { waitMs: 1600 });
  if (f.legal) add("33-legal-page", `${P}/legal/${f.legal.slug}`, { waitMs: 1600 });

  // ── auth, walked screen by screen (components/auth/AuthFlow.tsx)
  if (f.newNumber) s.push({ id: "40-auth", url: `${P}/login`, flow: authFlow(P, f.newNumber) });

  // ── login walls (guest hitting an authed route)
  add("50-wall-create", `${P}/create`, { waitMs: 1800 });
  add("51-wall-messages", `${P}/messages`, { waitMs: 1800 });
  add("52-wall-notifications", `${P}/notifications`, { waitMs: 1800 });
  add("53-wall-profile", `${P}/profile`, { waitMs: 1800 });
  add("54-wall-leads", `${P}/leads`, { waitMs: 1800 });

  // ── system
  add("60-not-found", `${P}/this-page-does-not-exist-zzz`, { waitMs: 1600 });
  add("61-offline", `${P}/offline`, { waitMs: 1400 });
  add("62-property-bad-id", `${P}/property/00000000-0000-0000-0000-000000000000`, { waitMs: 1800 });

  return s;
}

/** Everything behind a session, on the seller host. */
function sellerScreens(role, f, HOST) {
  const S = HOST.seller;
  const P = HOST.public;
  const s = [];
  const add = (id, url, opt = {}) => s.push({ id, url, ...opt });

  const myListing = f[`${role}Listing`];
  const myProject = f[`${role}Project`];
  const myLead = f[`${role}Lead`];
  const myReq = f[`${role}Requirement`];
  const myTicket = f[`${role}Ticket`];

  // ── home / shells
  add("01-seller-home", `${S}/`, { waitMs: 2200 });
  add("02-dashboard", `${S}/dashboard`, { waitMs: 2000 });
  add("03-feed-signed-in", `${P}/`, { waitMs: 2400 });

  // ── search
  add("05-search", `${S}/search`, { waitMs: 1800 });
  add("06-search-results", `${S}/search/results?q=flat`, { waitMs: 2200 });
  add("07-search-coming-soon", `${S}/search/coming-soon`, { waitMs: 1600 });

  // ── my inventory
  add("10-listings", `${S}/listings`, { waitMs: 2200 });
  if (myListing) add("11-listing-manage", `${S}/listings/${myListing.id}`, { waitMs: 2200 });
  if (myListing) add("12-listing-insights", `${S}/listings/${myListing.id}/insights`, { waitMs: 2200 });
  add("13-listings-trash", `${S}/listings/trash`, { waitMs: 1800 });
  add("14-archived", `${S}/archived`, { waitMs: 1800 });
  if (myProject) add("15-project-manage", `${S}/projects/${myProject.id}`, { waitMs: 2200 });
  if (myProject) add("16-project-insights", `${S}/projects/${myProject.id}/insights`, { waitMs: 2200 });
  add("17-projects-new", `${S}/projects/new`, { waitMs: 2000 });

  // ── creation flow
  add("20-create-planwall", `${S}/create`, { waitMs: 2200 });
  add("21-create-type", `${S}/create/type`, { waitMs: 1800 });
  add("22-create-form", `${S}/create/form`, { waitMs: 2200 });
  add("23-create-photos", `${S}/create/photos`, { waitMs: 2000 });
  add("24-create-preview", `${S}/create/preview`, { waitMs: 2000 });
  add("25-create-success", `${S}/create/success`, { waitMs: 1800 });
  add("26-create-drafts", `${S}/create/drafts`, { waitMs: 1800 });

  // ── money
  add("30-plans", `${S}/plans`, { waitMs: 2000 });
  add("31-plans-my", `${S}/plans/my`, { waitMs: 2000 });
  add("32-checkout", `${S}/checkout`, { waitMs: 2000 });
  add("33-checkout-success", `${S}/checkout/success`, { waitMs: 1800 });
  add("34-payments", `${S}/payments`, { waitMs: 2000 });
  add("35-boost", `${S}/boost`, { waitMs: 2000 });
  add("36-boost-new", `${S}/boost/new`, { waitMs: 2000 });

  // ── demand side
  add("40-leads", `${S}/leads`, { waitMs: 2200 });
  if (myLead) add("41-lead-detail", `${S}/leads/lead/${myLead.id}`, { waitMs: 2200 });
  add("42-visits", `${S}/visits`, { waitMs: 2000 });
  add("43-requirements", `${S}/requirements`, { waitMs: 2000 });
  add("44-requirements-mine", `${S}/requirements/mine`, { waitMs: 2000 });
  add("45-requirements-new", `${S}/requirements/new`, { waitMs: 2000 });
  if (myReq) add("46-requirement-detail", `${S}/requirements/${myReq.id}`, { waitMs: 2000 });
  if (myReq) add("47-requirement-proposals", `${S}/requirements/${myReq.id}/proposals`, { waitMs: 2000 });
  add("48-proposals", `${S}/proposals`, { waitMs: 2000 });

  // ── comms
  add("50-messages", `${S}/messages`, { waitMs: 2200 });
  add("51-notifications", `${S}/notifications`, { waitMs: 2000 });

  // ── profile
  add("60-profile", `${S}/profile`, { waitMs: 2200 });
  add("61-profile-edit", `${S}/profile/edit`, { waitMs: 2000 });
  add("62-profile-verification", `${S}/profile/verification`, { waitMs: 2000 });
  add("63-saved", `${S}/saved`, { waitMs: 2000 });
  add("64-activity", `${S}/activity`, { waitMs: 2000 });
  add("65-activity-saved-searches", `${S}/activity/saved-searches`, { waitMs: 2000 });

  // ── settings
  add("70-settings", `${S}/settings`, { waitMs: 1800 });
  add("71-settings-account", `${S}/settings/account`, { waitMs: 1800 });
  add("72-settings-account-status", `${S}/settings/account-status`, { waitMs: 1800 });
  add("73-settings-notifications", `${S}/settings/notifications`, { waitMs: 1800 });
  add("74-settings-privacy", `${S}/settings/privacy`, { waitMs: 1800 });
  add("75-settings-language", `${S}/settings/language`, { waitMs: 1800 });
  add("76-settings-data", `${S}/settings/data`, { waitMs: 1800 });
  add("77-settings-login-activity", `${S}/settings/login-activity`, { waitMs: 1800 });
  add("78-settings-components", `${S}/settings/components`, { waitMs: 2200 });

  // ── help & content
  add("80-help", `${S}/help`, { waitMs: 1800 });
  if (f.helpCat) add("81-help-category", `${S}/help/${f.helpCat.slug}`, { waitMs: 1800 });
  if (f.helpArticle) add("82-help-article", `${S}/help/article/${f.helpArticle.slug}`, { waitMs: 1800 });
  add("83-help-contact", `${S}/help/contact`, { waitMs: 1800 });
  add("84-help-tickets", `${S}/help/tickets`, { waitMs: 1800 });
  if (myTicket) add("85-help-ticket", `${S}/help/tickets/${myTicket.id}`, { waitMs: 1800 });
  add("86-blog", `${S}/blog`, { waitMs: 1800 });
  if (f.blog) add("87-blog-post", `${S}/blog/${f.blog.slug}`, { waitMs: 1800 });
  add("88-legal", `${S}/legal`, { waitMs: 1600 });
  if (f.legal) add("89-legal-page", `${S}/legal/${f.legal.slug}`, { waitMs: 1600 });

  // ── detail screens seen while signed in (different CTAs than guest)
  if (f.listingPublic) add("90-property-signed-in", `${S}/property/${f.listingPublic.id}`, { waitMs: 2200 });
  if (f.project) add("91-project-signed-in", `${S}/project/${f.project.id}`, { waitMs: 2200 });
  if (f.storyPoster) add("92-story", `${S}/story/${f.storyPoster.poster_id}`, { waitMs: 2600 });

  // ── system
  add("95-maintenance", `${S}/maintenance`, { waitMs: 1600 });
  add("96-not-found", `${S}/nope-zzz`, { waitMs: 1600 });

  return s;
}

export function screensFor(group, f, HOST) {
  return group === "guest" ? guestScreens(f, HOST) : sellerScreens(group, f, HOST);
}
