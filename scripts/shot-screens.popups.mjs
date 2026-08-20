/**
 * The screens that have no URL — sheets, dialogs, menus, toasts and the empty
 * / error states you can only reach by doing something.
 *
 * Each entry loads ONE route and then opens every overlay that route owns,
 * shooting each. An overlay that will not open is reported and skipped rather
 * than silently producing a screenshot of the page behind it — a wrong picture
 * is worse than a missing one when the whole point is to redraw these for
 * tablet and desktop.
 */

const MODAL = `[role="dialog"][aria-modal="true"],[role="alertdialog"]`;

/** Toolkit shared by every popup flow. */
function kit(page, t) {
  const modalOpen = () => page.eval(`!!document.querySelector('${MODAL}')`);

  /**
   * The screen this block belongs to. Several controls NAVIGATE rather than
   * open an overlay ("Create", "Blocked users", "Language"), and without this
   * the first such tap stranded the flow on another route — every later step
   * in the block then reported "no control" and photographed nothing. So each
   * step returns home first.
   */
  let home = null;
  const go = async (url, waitMs = 2600) => {
    home = url;
    await t.goto(url, { waitMs });
    await t.hideDevOverlay();
  };
  const ensureHome = async () => {
    if (!home) return;
    const here = await page.eval(`location.pathname`);
    if (here !== new URL(home).pathname) await go(home, 2400);
  };

  const close = async () => {
    for (let i = 0; i < 3; i++) {
      if (!(await modalOpen())) return;
      const closed = await page.clickSelector(`${MODAL} [aria-label="Close"]`);
      if (!closed) {
        await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      }
      await t.sleep(450);
    }
  };

  /**
   * Open an overlay and photograph it. `open` returns truthy if it found a
   * control; the shot is only taken once a modal is actually on screen.
   */
  const popup = async (id, open, { after, wait = 700 } = {}) => {
    await ensureHome();
    await close();
    const before = await page.eval(`(() => ({ p: location.pathname, t: (document.body.innerText||"").length }))()`);
    let hit;
    try { hit = await open(); } catch (e) { hit = null; }
    if (!hit) { console.log(`  ⏭  ${id} — no control`); return false; }
    await t.sleep(wait);
    if (!(await modalOpen())) {
      // Not every control raises a sheet. Some expand inline, some fire a
      // toast, some navigate. That is still a screen state worth having — but
      // only if the tap actually changed something, otherwise this would just
      // duplicate the screenshot we already took of the page underneath.
      const now = await page.eval(`(() => ({ p: location.pathname, t: (document.body.innerText||"").length }))()`);
      if (now.p !== before.p || Math.abs(now.t - before.t) > 12) {
        console.log(`  ↪  ${id} — no sheet; captured the state it produced`);
        await t.hideDevOverlay();
        await t.shoot(`${id}-state`);
        return true;
      }
      console.log(`  ⏭  ${id} — nothing opened`);
      return false;
    }
    // A sheet that fetches its own contents (filters, plans, collections)
    // opens as a skeleton — photographing it then documents a loading state,
    // not the screen. Wait for its shimmer and its pending button to settle.
    await page.waitFor(`(() => {
      const m = document.querySelector('${MODAL}');
      if (!m) return true;
      if (m.querySelector('[class*="animate-pulse"],[class*="shimmer"],.hz-shim')) return false;
      return !/counting|loading|…\\s*$/i.test(m.innerText.trim().slice(-40));
    })()`, { tries: 16, gap: 300 });
    if (after) { await after(); await t.sleep(500); }
    await t.hideDevOverlay();
    await t.shoot(id, { overlay: true });
    await close();
    return true;
  };

  /** Photograph a non-modal state change (a tab, a toast, an inline panel). */
  const state = async (id, act, { wait = 700, stay = false } = {}) => {
    if (!stay) await ensureHome();
    await close();
    let hit;
    try { hit = await act(); } catch { hit = null; }
    if (hit === false || hit === null) { console.log(`  ⏭  ${id} — no control`); return false; }
    await t.sleep(wait);
    await t.hideDevOverlay();
    await t.shoot(id);
    return true;
  };

  const sel = (s) => page.clickSelector(s);
  const txt = (s, n = 0) => page.clickText(s, { nth: n });

  /** Open the "More" / options sheet, then pick an item inside it. */
  const viaMore = async (label, opener = '[aria-label="More"],[aria-label="More options"],[aria-label="Listing options"],[aria-label="Project options"]') => {
    const m = await sel(opener);
    if (!m) return null;
    await t.sleep(700);
    return txt(label);
  };

  return { popup, state, close, sel, txt, viaMore, modalOpen, go };
}

// ─────────────────────────────────────────────────────────────── guest ─────
function guestPopups(f, HOST) {
  const P = HOST.public;
  const out = [];

  out.push({
    id: "70-feed-overlays",
    url: `${P}/`,
    flow: async (page, t) => {
      const k = kit(page, t);
      await k.go(`${P}/`, 2600);

      await k.popup("70-feed-city-sheet", () => k.txt("Select city"));
      await k.popup("71-feed-sort-sheet", () => k.txt("Latest"));
      await k.popup("72-feed-card-more", () => k.sel('[aria-label="More"]'));
      // A feed card has no Share button of its own — Share lives inside the
      // card's Options sheet, so it takes two taps to reach.
      await k.popup("73-feed-card-share", () => k.viaMore("Share"));
      await k.popup("74-feed-card-report", () => k.viaMore("Report"));
      // Anything that needs an account puts a guest in front of the login sheet
      await k.popup("75-feed-login-sheet-save", () => k.sel('[aria-label="Save"]'));
      await k.popup("76-feed-login-sheet-inquiry", () => k.txt("Inquiry"));

      await k.state("77-feed-tab-requirement", () => k.txt("Requirement"), { wait: 1800 });
      await k.state("78-feed-tab-rent", async () => {
        await k.txt("Property"); await t.sleep(1000); return k.txt("Rent");
      }, { wait: 1800 });
    },
  });

  out.push({
    id: "79-search-overlays",
    url: `${P}/search`,
    flow: async (page, t) => {
      const k = kit(page, t);
      await k.go(`${P}/search`, 2400);
      await k.state("79-search-typing", () => page.typeInto('input[inputmode="search"],input[placeholder*="Search"]', "raj") || null, { wait: 1600 });
      await k.state("79b-search-tab-requirement", () => k.txt("Requirement"), { wait: 1600 });

      // Filters live on the RESULTS screen, not the explore screen.
      await k.go(`${P}/search/results?q=flat`, 3000);
      await k.popup("7A-search-filters", () => k.sel('[aria-label="Filters"]'));
      await k.popup("7B-search-sort", () => k.txt("Latest"));
      for (const [n, tab] of [["7C", "Properties"], ["7D", "Projects"], ["7E", "Brokers & Builders"], ["7F", "Areas"]]) {
        await k.state(`${n}-search-tab-${tab.toLowerCase().replace(/[^a-z]+/g, "-")}`, () => k.txt(tab), { wait: 1800 });
      }
    },
  });

  if (f.listingPublic) {
    out.push({
      id: "80-property-overlays",
      url: `${P}/property/${f.listingPublic.id}`,
      flow: async (page, t) => {
        const k = kit(page, t);
        const url = `${P}/property/${f.listingPublic.id}`;
        await k.go(url, 3000);

        await k.popup("80-property-more", () => k.sel('[aria-label="More"]'));
        await k.popup("81-property-report", () => k.viaMore("Report"));
        // Share here is native-share-or-copy (ListingDetail.tsx `share`), so on
        // a device without navigator.share the screen state is a toast.
        await k.state("82-property-share-toast", () => k.sel('[aria-label="Share"]'), { wait: 900 });
        await k.popup("83-property-login-sheet", () => k.sel('[aria-label="Save"]'));

        // A guest tapping Send Inquiry is NAVIGATED to the seller-host login
        // with a `next` back to this listing — a screen, not a sheet.
        await k.go(url, 2400);
        await k.state("84-property-inquiry-login-wall", () => k.txt("Send Inquiry"), { wait: 2600 });
      },
    });
  }

  if (f.project) {
    out.push({
      id: "85-project-overlays",
      url: `${P}/project/${f.project.id}`,
      flow: async (page, t) => {
        const k = kit(page, t);
        const url = `${P}/project/${f.project.id}`;
        await k.go(url, 3000);
        await k.popup("85-project-more", () => k.sel('[aria-label="More"]'));
        await k.popup("86-project-report", () => k.viaMore("Report"));
        await k.state("87-project-share-toast", () => k.sel('[aria-label="Share"]'), { wait: 900 });
        for (const [n, tab] of [["88", "Units"], ["89", "Amenities"], ["8A", "Loans"], ["8B", "Builder"]]) {
          await k.state(`${n}-project-tab-${tab.toLowerCase()}`, () => k.txt(tab), { wait: 1400 });
        }
        await k.go(url, 2400);
        await k.state("8C-project-contact-login-wall", () => k.txt("Contact builder"), { wait: 2600 });
      },
    });
  }

  return out;
}

// ────────────────────────────────────────────────────────────── seller ─────
function sellerPopups(role, f, HOST) {
  const S = HOST.seller;
  const P = HOST.public;
  const out = [];
  const myListing = f[`${role}Listing`];
  const myProject = f[`${role}Project`];

  out.push({
    id: "A0-feed-overlays",
    url: `${P}/`,
    flow: async (page, t) => {
      const k = kit(page, t);
      await k.go(`${P}/`, 2600);
      await k.popup("A0-feed-city-sheet", () => k.txt("city"));
      await k.popup("A1-feed-sort-sheet", () => k.txt("Latest"));
      await k.popup("A2-feed-card-more", () => k.sel('[aria-label="More"]'));
      await k.popup("A3-feed-card-share", () => k.viaMore("Share"));
      await k.popup("A4-feed-card-report", () => k.viaMore("Report"));
      // Signed in, "Inquiry" opens the real inquiry sheet instead of a login wall
      await k.popup("A4b-feed-inquiry-sheet", () => k.txt("Inquiry"));
    },
  });

  out.push({
    id: "A5-listings-overlays",
    url: `${S}/listings`,
    flow: async (page, t) => {
      const k = kit(page, t);
      await k.go(`${S}/listings`, 2600);
      await k.popup("A5-listing-options", () => k.sel('[aria-label="Listing options"]'));
      // The options sheet holds View listing / Edit / Delete — "Delete" raises
      // the confirm dialog on top of it.
      await k.popup("A6-listing-delete-confirm", () => k.viaMore("Delete", '[aria-label="Listing options"]'), { wait: 1200 });

      // My Listings is one screen per lifecycle status — each tab is a
      // different empty/populated layout that has to be redrawn for desktop.
      for (const [n, tab] of [
        ["A8", "Draft"], ["A9", "Live"], ["AA", "Pending"], ["AB", "Changes requested"],
        ["AC", "Rejected"], ["AD", "Hidden"], ["AE", "Sold"], ["AF", "Rented"], ["AG", "Archived"],
      ]) {
        await k.state(`${n}-listings-${tab.toLowerCase().replace(/[^a-z]+/g, "-")}`, () => k.txt(tab), { wait: 1600 });
      }
    },
  });

  if (myListing) {
    out.push({
      id: "B0-my-listing-overlays",
      url: `${S}/listings/${myListing.id}`,
      flow: async (page, t) => {
        const k = kit(page, t);
        await k.go(`${S}/listings/${myListing.id}`, 2600);
        await k.popup("B0-my-listing-more", () => k.sel('[aria-label="Listing options"],[aria-label="More options"],[aria-label="More"]'));
        await k.popup("B1-my-listing-share", () => k.sel('[aria-label="Share"]'));
        await k.popup("B2-my-listing-boost", () => k.txt("Boost"));
      },
    });
  }

  out.push({
    id: "B5-profile-overlays",
    url: `${S}/profile`,
    flow: async (page, t) => {
      const k = kit(page, t);
      await k.go(`${S}/profile`, 2600);
      await k.popup("B5-profile-menu", () => k.sel('[aria-label="Menu"]'));
      await k.popup("B6-profile-create", () => k.sel('[aria-label="Create"]'));
      await k.popup("B7-profile-share", () => k.txt("Share profile"));
      await k.popup("B7b-profile-new-collection", () => k.txt("New"));
      // The profile's own tabs — Sell / Rent / Requirements each draw a
      // different grid, so each needs its own desktop treatment.
      for (const [n, tab] of [["B8", "Sell"], ["B9", "Rent"], ["BA", "Requirements"]]) {
        await k.state(`${n}-profile-tab-${tab.toLowerCase()}`, () => k.txt(tab), { wait: 1600 });
      }
    },
  });

  out.push({
    id: "C0-saved-overlays",
    url: `${S}/saved`,
    flow: async (page, t) => {
      const k = kit(page, t);
      await k.go(`${S}/saved`, 2400);
      await k.popup("C0-new-collection", () => k.sel('[aria-label="New collection"]'));
      await k.state("C1-saved-collection-tab", () => k.txt("All"), { wait: 1400 });
    },
  });

  out.push({
    id: "C2-create-overlays",
    url: `${S}/create`,
    flow: async (page, t) => {
      const k = kit(page, t);
      await k.go(`${S}/create`, 2600);
      await k.popup("C2-slots-info", () => k.sel('[aria-label="About listing slots"],[aria-label="Quota info"]'));

      await k.go(`${S}/create/drafts`, 2200);
      await k.popup("C3-draft-options", () => k.sel('[aria-label="Draft options"],[aria-label="More"]'));

      await k.go(`${S}/create/photos`, 2400);
      await k.popup("C4-photo-add", () => k.txt("Add photos"));
      await k.state("C5-photos-coach", () => k.txt("Got it"), { wait: 900 });
    },
  });

  out.push({
    id: "C6-settings-overlays",
    url: `${S}/settings`,
    flow: async (page, t) => {
      const k = kit(page, t);
      // The danger zone and the appearance picker all live on /settings itself.
      await k.go(`${S}/settings`, 2400);
      await k.popup("C6-appearance-sheet", () => k.txt("Appearance"));
      await k.popup("C7-logout-confirm", () => k.txt("Log out"));
      // These three are LINKS, not dialogs — Deactivate and Delete both land on
      // /settings/account, and "Blocked users" points at /settings/blocked,
      // which has no page (see the report: it 404s).
      await k.state("C8-deactivate-destination", () => k.txt("Deactivate account"), { wait: 2200 });
      await k.state("C9-blocked-users-destination", () => k.txt("Blocked users"), { wait: 2200 });

      await k.go(`${S}/settings/account`, 2400);
      await k.popup("CB-delete-account-confirm", () => k.txt("Delete account"), { wait: 1600 });
    },
  });

  out.push({
    id: "D0-notifications-overlays",
    url: `${S}/notifications`,
    flow: async (page, t) => {
      const k = kit(page, t);
      await k.go(`${S}/notifications`, 2400);
      await k.popup("D0-notifications-more", () => k.sel('[aria-label="More"]'));
      for (const [n, tab] of [["D1", "Unread"], ["D2a", "Inquiries"], ["D2b", "Listings"], ["D2c", "Requirements"], ["D2d", "Payments"]]) {
        await k.state(`${n}-notifications-${tab.toLowerCase()}`, () => k.txt(tab), { wait: 1400 });
      }
    },
  });

  out.push({
    id: "D3-plans-overlays",
    url: `${S}/plans`,
    flow: async (page, t) => {
      const k = kit(page, t);
      await k.go(`${S}/plans`, 2400);
      await k.popup("D3-plan-details", () => k.txt("View details"));
      await k.popup("D3b-plan-more", () => k.sel('[aria-label="More options"]'));
      await k.popup("D4-plan-coupon", () => k.txt("Have a coupon code?"));
      await k.state("D5-plans-compare", () => k.txt("Compare all plans"), { wait: 1600 });
    },
  });

  out.push({
    id: "D6-leads-overlays",
    url: `${S}/leads`,
    flow: async (page, t) => {
      const k = kit(page, t);
      await k.go(`${S}/leads`, 2600);
      await k.popup("D6-leads-sort-filter", () => k.sel('[aria-label="Sort and filter"]'));
      await k.state("D7-leads-search", () => k.sel('[aria-label="Search your leads"]'), { wait: 1200 });
      await k.state("D8-leads-tab-sent", () => k.txt("Sent"), { wait: 1600 });
      await k.state("D9-leads-tab-received", () => k.txt("Received"), { wait: 1600 });
    },
  });

  if (myProject) {
    out.push({
      id: "E0-project-overlays",
      url: `${S}/projects/${myProject.id}`,
      flow: async (page, t) => {
        const k = kit(page, t);
        await k.go(`${S}/projects/${myProject.id}`, 2600);
        await k.popup("E0-project-options", () => k.sel('[aria-label="Project options"],[aria-label="More options"],[aria-label="More"]'));
        await k.popup("E1-project-unit-edit", () => k.sel('[aria-label="Edit unit"]'));
        await k.popup("E2-project-unit-delete", () => k.sel('[aria-label="Delete unit"]'));
      },
    });
  }

  return out;
}

export function popupsFor(group, f, HOST) {
  return group === "guest" ? guestPopups(f, HOST) : sellerPopups(group, f, HOST);
}
