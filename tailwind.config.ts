import type { Config } from "tailwindcss";

/**
 * Doc1 tokens encoded once. Colours map to CSS variables (set in globals.css for
 * light + dark), so `bg-surface-1` / `text-ink-primary` etc. auto-swap on theme.
 * NO raw hex is used anywhere outside globals.css + lib/tokens.ts.
 * Dark mode is class-based (`.dark` on <html>) plus system preference.
 */

// helper: reference a CSS var by token name
const v = (name: string) => `var(--${name})`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    // Doc1 §1.3 — one font stack, locked.
    fontFamily: {
      sans: [
        "-apple-system",
        "BlinkMacSystemFont",
        '"Segoe UI"',
        "Roboto",
        "Helvetica",
        "Arial",
        "sans-serif",
      ],
    },
    // Doc1 §1.3 — locked type scale (size / role) with line-heights.
    fontSize: {
      "11": ["11px", { lineHeight: "1.2" }], // timestamps, captions, badges
      "13": ["13px", { lineHeight: "1.2" }], // secondary meta, usernames, chips
      "15": ["15px", { lineHeight: "1.45" }], // body, chat, buttons, tabs
      "17": ["17px", { lineHeight: "1.25" }], // card price, sheet titles
      "20": ["20px", { lineHeight: "1.25" }], // page headers
      "24": ["24px", { lineHeight: "1.25" }], // screen titles, plan prices
    },
    borderRadius: {
      none: "0px",
      "4": "4px", // badges, tiny
      "6": "6px", // form controls — inputs, option chips, toggle rows
      "8": "8px", // cards, inputs, buttons (standard)
      "12": "12px", // sheet top corners, large cards
      "16": "16px", // modals/dialogs
      full: "9999px", // chips, pills, avatars, rings, FAB
    },
    extend: {
      // The admin design (P13-14-15) has three device states written into its own
      // code — mobile 390 / tablet 768 / desktop 1440 — and no CSS breakpoints of
      // its own. `md:` (768) already is the tablet band; `desktop:` adds the third.
      // A 1280px laptop therefore gets the design's TABLET layout, as intended.
      screens: { desktop: "1440px" },
      // Default Tailwind spacing (1=4px…8=32px = Doc1's 4/8/12/16/24/32) is kept,
      // so component dimensions (h-11=44px touch target, h-9, h-12, w-5…) work.
      // Only these fixed layout constants are added (Doc1 §3). Usage discipline:
      // still use only 4/8/12/16/24/32 for content spacing (gaps/padding).
      spacing: {
        header: "56px",
        "header-morph": "48px",
        nav: "52px", // P3 canonical bottom nav height
        "sticky-bar": "64px",
      },
      colors: {
        page: v("bg-page"),
        "page-desktop": v("bg-page-desktop"),
        surface: {
          "1": v("surface-1"),
          "2": v("surface-2"),
          "3": v("surface-3"),
        },
        border: v("border"),
        divider: v("divider"),
        ink: {
          primary: v("ink-primary"),
          secondary: v("ink-secondary"),
          tertiary: v("ink-tertiary"),
          disabled: v("ink-disabled"),
          inverse: v("ink-inverse"),
        },
        accent: {
          DEFAULT: v("accent"),
          pressed: v("accent-pressed"),
          soft: v("accent-soft"),
          disabled: v("accent-disabled"),
        },
        // Foreground for content sitting ON a solid accent fill. Not the same as
        // ink-inverse: the dark theme's accent is bright enough that white drops
        // under 3:1, so this token flips while ink-inverse stays white.
        "on-accent": v("on-accent"),
        // Categorical tile tones — no status meaning (see globals.css).
        tone: {
          green: v("tone-green"),
          amber: v("tone-amber"),
          blue: v("tone-blue"),
          violet: v("tone-violet"),
          teal: v("tone-teal"),
          pink: v("tone-pink"),
          indigo: v("tone-indigo"),
          cyan: v("tone-cyan"),
          orange: v("tone-orange"),
        },
        error: { DEFAULT: v("error"), soft: v("error-soft") },
        warning: { DEFAULT: v("warning"), soft: v("warning-soft") },
        info: { DEFAULT: v("info"), soft: v("info-soft") },
      },
      // Doc1 §1.2 — hairline borders use the token border colour by default.
      borderColor: { DEFAULT: v("border") },
      // Doc1 §1.6 — shadows (light mode only; dark uses border outlines).
      boxShadow: {
        "l1": "0 1px 2px rgba(0,0,0,0.06)", // cards at rest
        "l2": "0 4px 12px rgba(0,0,0,0.10)", // sticky bars, raised pills
        "l3": "0 8px 24px rgba(0,0,0,0.16)", // sheets, dialogs, popovers
        none: "none",
      },
      // Doc1 §3 — z-index scale.
      zIndex: {
        content: "0",
        sticky: "10",
        header: "20",
        nav: "20",
        dropdown: "30",
        "sheet-scrim": "40",
        sheet: "41",
        dialog: "50",
        toast: "60",
        viewer: "70",
        coach: "80",
      },
      // Doc1 §4 — global easing (ease-out) + durations.
      transitionTimingFunction: {
        "ease-out-quart": "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        "150": "150ms",
        "200": "200ms",
        "250": "250ms",
        "300": "300ms",
      },
      maxWidth: {
        column: "470px", // Doc1 §3 — Instagram-web centred column
        admin: "1200px", // admin fluid content max
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "toast-in": {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "sheet-in": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "scrim-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-pop": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(0.85)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.2s infinite",
        "toast-in": "toast-in 200ms cubic-bezier(0.2,0,0,1)",
        "sheet-in": "sheet-in 300ms cubic-bezier(0.2,0,0,1)",
        "scrim-in": "scrim-in 250ms ease-out",
        "scale-pop": "scale-pop 150ms cubic-bezier(0.2,0,0,1)",
      },
    },
  },
  plugins: [],
};

export default config;
