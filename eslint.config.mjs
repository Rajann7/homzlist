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

      // ---------------------------------------------------------------------
      // Rules that arrived WITH the upgrade, not with the code.
      //
      // On Next 14 `npm run lint` exited 0 with only warnings. eslint-config-next
      // 16 ships eslint-plugin-react-hooks v6 (the React Compiler-aware rules)
      // and two new @next/next rules, and those turn 155 pre-existing lines into
      // errors — 110 of them `set-state-in-effect` alone.
      //
      // Clearing them means rewriting component logic and changing navigation
      // behaviour (<a> does a full load, <Link> does a client transition). That
      // is not upgrade work: the upgrade's job is to leave the app behaving
      // exactly as it did. So they are warnings — visible, not enforced, and
      // not silently deleted — and the list is tracked in
      // docs/PENDING-INTEGRATIONS.md as its own piece of work.
      //
      // Anything NEWLY written should still satisfy these. Promote them back to
      // "error" once the existing findings are cleared.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "@next/next/no-location-assign-relative-destination": "warn",
      "@next/next/no-html-link-for-pages": "warn",
    },
  },
]);
