// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

/**
 * Expo's defaults, plus the rules from ~/Develop/CLAUDE.md and
 * ~/Develop/FRONTEND_STANDARDS.md that a linter can actually check.
 *
 * These lived only in those documents, which meant they were enforced by whoever
 * remembered to open them — and so they drifted. The baseline's own line is that
 * standards are enforced by tooling, not by convention; this is that.
 *
 * Severities are deliberate. Anything with a clean slate today is an `error`, so it
 * can never be introduced. Anything with a pre-existing backlog is a `warn`, so it
 * is visible on every lint run without blocking work on unrelated files — turn each
 * one up to `error` as its backlog reaches zero.
 */
module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Baseline: "an error, not a warning. Type it properly or use `unknown` with
      // narrowing." Zero occurrences as of this config, so it stays that way.
      "@typescript-eslint/no-explicit-any": "error",

      // Baseline: unused function args are allowed only when prefixed with `_`.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],

      // FRONTEND_STANDARDS: "files ideally under 100 lines, hard ceiling ~250".
      // Comments and blanks are skipped on purpose — this codebase documents its
      // reasoning heavily and that shouldn't read as bloat. 16 files are over today,
      // so this warns rather than blocks.
      "max-lines": [
        "warn",
        { max: 250, skipBlankLines: true, skipComments: true },
      ],

      // Baseline: "Never nest ternaries in JSX. Each distinct UI state gets its own
      // named component." Two pre-existing, hence warn.
      "no-nested-ternary": "warn",
    },
  },
]);
