import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * ESLint flat config.
 *
 * Next 16 removed the `next lint` command and `@next/eslint-plugin-next` now
 * defaults to flat config, ahead of ESLint v10 dropping the legacy format. This
 * replaces .eslintrc.json and carries the same rule set it had:
 * `next/core-web-vitals` plus `no-img-element` as a warning, because this app
 * serves R2/CDN images through plain <img> on purpose and does not use
 * next/image anywhere.
 *
 * `next lint` supplied the ignore list implicitly; the CLI does not, so it is
 * spelled out below — otherwise `eslint .` walks the build output and the
 * design prototypes and reports thousands of findings in generated code.
 */
export default defineConfig([
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-*/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "_upgrade/**",
      "_shots/**",
      "public/_dx/**",
      "designs/**",
    ],
  },
  {
    extends: [...nextCoreWebVitals],
    rules: {
      "@next/next/no-img-element": "warn",

      /**
       * The one rule left at warn, and why.
       *
       * eslint-config-next 16 brings the React Compiler rules. Everything else
       * they flagged has been dealt with at the callsite — purity, refs,
       * immutability, static-components, exhaustive-deps and the two new
       * @next/next rules are all at zero. This one is not, and it should not be
       * "fixed" the way the others were.
       *
       * 104 of its 110 findings are one shape, repeated in 88 files:
       *
       *     const load = useCallback(async () => {
       *       const r = await someApi.get();
       *       if (r.ok) setData(r.data);
       *     }, []);
       *     useEffect(() => { void load(); }, [load]);
       *
       * The setState runs AFTER an await, in a later task — not synchronously
       * in the effect body — so it does not cause the cascading render the rule
       * is named for. The rule cannot see across the await and flags every
       * setState reachable from an effect, which is every fetch-on-mount screen
       * in this app.
       *
       * Clearing them honestly would mean replacing effect-based fetching
       * everywhere with a data library or Server Components. That is an
       * architecture change across 88 screens, not a lint fix, and this app's
       * design is locked.
       *
       * The six findings that WERE the real pattern — a synchronous setState in
       * an effect body — are fixed, using React's own "adjusting state when a
       * prop changes" render-phase form: Dialog, FilterBar, Leads (x2),
       * ProjectForm and ProfileSheets. Where a reset is entangled with a
       * debounce, a DOM measurement or a fetch, it belongs in an effect and
       * stays there.
       *
       * Anything NEWLY written should still satisfy this. Promote it to "error"
       * if the fetching layer is ever reworked.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
