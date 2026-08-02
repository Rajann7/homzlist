/**
 * §5 — where a click lands is part of the design, not an implementation choice.
 *
 * This exists because P6 and P7 shipped NINE detail surfaces as centred
 * `Modal`s where the design calls `pushPanel`: ticket, dispute, staffPerf,
 * pageEdit, blogEdit, bannerEdit, broadcastEdit, tplEdit and fieldConfig. Each
 * one looked fine in isolation and in a pixel diff of the LIST behind it —
 * nothing caught it, because nothing was reading the design's own surface
 * choice and comparing it to ours.
 *
 * So this reads the prototype, extracts every `pushPanel('kind')` it makes, and
 * asserts our registry can render every one of them. A design panel we render
 * as anything else is a FAILURE here, not a preference.
 *
 *   node scripts/check-admin-surfaces.mjs
 */
import { readFileSync } from "node:fs";

const TEMPLATE = "designs/_unpacked/P13.template.html";
const REGISTRY = "components/admin/panels/registry.tsx";

const template = readFileSync(TEMPLATE, "utf8");
const registry = readFileSync(REGISTRY, "utf8");

/** every `pushPanel('x'` in the design, with how many times it is called */
const wanted = new Map();
for (const m of template.matchAll(/pushPanel\('([a-zA-Z]+)'/g)) {
  wanted.set(m[1], (wanted.get(m[1]) ?? 0) + 1);
}

/** every key registered as a panel renderer */
const registered = new Set();
// entries look like `  someKind: {` inside the registry objects
for (const m of registry.matchAll(/^\s{2}([a-zA-Z]+):\s*\{$/gm)) registered.add(m[1]);

let failures = 0;
console.log(`\n§5 surface check — ${wanted.size} panel kinds in the design\n`);

for (const [kind, calls] of [...wanted].sort((a, b) => b[1] - a[1])) {
  const ok = registered.has(kind);
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${kind.padEnd(18)} ${String(calls).padStart(2)} call(s) in the design  ${
      ok ? "→ registered as a stacked panel" : "→ NOT REGISTERED (rendered as something else?)"
    }`,
  );
}

/**
 * The other direction: a screen that still renders a `<Modal>` for something
 * the design opens as a panel. Checked by name, because that is the mistake
 * that was actually made — an editor component left behind in its screen.
 */
const SCREENS_THAT_MUST_NOT_MODAL = [
  ["components/admin/ops/TicketsScreen.tsx", ["TicketPanel"]],
  ["components/admin/ops/DisputesScreen.tsx", ["DisputePanel"]],
  ["components/admin/ops/StaffScreen.tsx", ["StaffPerformance"]],
  ["components/admin/content/ContentScreen.tsx", ["PageEditor", "BlogEditor", "BannerEditor", "BroadcastComposer"]],
  ["components/admin/templates/TemplatesScreen.tsx", ["TemplateEditor"]],
  ["components/admin/masterdata/MasterDataScreen.tsx", ["FieldConfigEditor"]],
];

console.log("");
for (const [file, gone] of SCREENS_THAT_MUST_NOT_MODAL) {
  const src = readFileSync(file, "utf8");
  for (const name of gone) {
    const still = src.includes(`function ${name}(`);
    if (still) failures++;
    console.log(
      `  ${still ? "FAIL" : "ok  "} ${name.padEnd(20)} ${
        still ? "still a local component in " + file : "moved out of the screen"
      }`,
    );
  }
}

/**
 * Third check — the stale row behind the panel.
 *
 * Turning a modal into a stacked panel introduces a bug the modal did not
 * have: the list stays mounted underneath. So a panel that WRITES must call
 * `notifyChanged()`, and the screen underneath must reload when `changed`
 * bumps. Both halves, or the row keeps printing the pre-action value while the
 * panel shows the new one — which is what the coupon editor did.
 */
const MUST_REFRESH = [
  ["components/admin/users/UserPanel.tsx", "components/admin/users/UsersScreen.tsx"],
  ["components/admin/listings/ListingPanel.tsx", "components/admin/listings/ListingsMaster.tsx"],
  ["components/admin/panels/PaymentPanel.tsx", "components/admin/finance/PaymentsScreen.tsx"],
  ["components/admin/catalog/PlanEditPanel.tsx", "components/admin/catalog/PlansScreen.tsx"],
  ["components/admin/catalog/CouponEditPanel.tsx", "components/admin/catalog/CouponsScreen.tsx"],
  ["components/admin/catalog/CouponEditPanel.tsx", "components/admin/catalog/GrantsScreen.tsx"],
  ["components/admin/ops/TicketPanel.tsx", "components/admin/ops/TicketsScreen.tsx"],
  ["components/admin/ops/DisputePanel.tsx", "components/admin/ops/DisputesScreen.tsx"],
  ["components/admin/content/ContentPanels.tsx", "components/admin/content/ContentScreen.tsx"],
  ["components/admin/templates/TemplateEditPanel.tsx", "components/admin/templates/TemplatesScreen.tsx"],
  ["components/admin/masterdata/FieldConfigPanel.tsx", "components/admin/masterdata/MasterDataScreen.tsx"],
];

console.log("");
for (const [panelFile, screenFile] of MUST_REFRESH) {
  const notifies = readFileSync(panelFile, "utf8").includes("notifyChanged()");
  const listens = /\bchanged\b/.test(readFileSync(screenFile, "utf8").match(/usePanels\(\)[\s\S]{0,400}/)?.[0] ?? "");
  const ok = notifies && listens;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${panelFile.split("/").pop().padEnd(22)} ${
      ok
        ? "writes → notifyChanged → list reloads"
        : `${notifies ? "" : "panel never calls notifyChanged; "}${listens ? "" : `${screenFile} never reads changed`}`
    }`,
  );
}

console.log(
  `\n${failures ? `${failures} SURFACE MISMATCH(ES)` : "every design panel is a stacked panel, and every write repaints the list under it"}\n`,
);
process.exit(failures ? 1 : 0);
