import { defineConfig } from 'oxlint';

export default defineConfig({
  jsPlugins: [
    {
      name: 'react-you-might-not-need-an-effect',
      specifier: 'eslint-plugin-react-you-might-not-need-an-effect',
    },
  ],
  // Setting `plugins` overwrites the base set, so the full list is required.
  // The `react` plugin is off by default and must be enabled explicitly.
  plugins: ['react', 'typescript', 'unicorn', 'oxc'],
  categories: {
    correctness: 'error',
    suspicious: 'warn',
    perf: 'error',
    pedantic: 'warn',
    style: 'warn',
  },
  rules: {
    // ── General ────────────────────────────────────────────────────────────
    'eslint/no-unused-vars': 'error',

    // ── React: component-function-over-class, component-no-react-fc ────────
    // Ban class components and the `FC` type alias.
    'react/prefer-function-component': 'error',
    'eslint/no-restricted-imports': ['error', { paths: [{ name: 'react', importNames: ['FC'] }] }],

    // React 19 automatic JSX runtime (`jsx: 'react-jsx'`), no React import needed.
    'react/react-in-jsx-scope': 'off',

    // The skill mixes arrows (pure) and `function` declarations (side effects);
    // `func-style` can only enforce one, so it is disabled.
    'eslint/func-style': 'off',

    // ── React: hook-custom-conventions, effect-external-systems-only ───────
    // Upgrade the Rules of Hooks and dependency correctness to errors.
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'error',

    // ── React: composition-fragments ───────────────────────────────────────
    'react/jsx-key': 'error',
    'react/no-array-index-key': 'error',

    // ── React: module-one-export-per-file (components) ─────────────────────
    'react/no-multi-comp': 'warn',
    // TanStack Table cell/header renderers are render props by design (they
    // receive { getValue, row } from the library); `allowAsProps` is the
    // rule's sanctioned escape hatch for exactly this pattern. Components
    // defined and used as JSX inside render still flag.
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],

    // ── React: effect-* rules (useEffect only for external systems) ────────
    'react-you-might-not-need-an-effect/no-derived-state': 'error',
    'react-you-might-not-need-an-effect/no-chain-state-updates': 'error',
    'react-you-might-not-need-an-effect/no-event-handler': 'error',
    'react-you-might-not-need-an-effect/no-adjust-state-on-prop-change': 'error',
    'react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change': 'error',
    'react-you-might-not-need-an-effect/no-pass-live-state-to-parent': 'error',
    'react-you-might-not-need-an-effect/no-pass-data-to-parent': 'error',
    'react-you-might-not-need-an-effect/no-initialize-state': 'error',
    'react-you-might-not-need-an-effect/no-external-store-subscription': 'error',

    // ── TypeScript: type-type-over-interface ───────────────────────────────
    'typescript/consistent-type-definitions': ['error', 'type'],

    // ── TypeScript: type-assertion-ban, type-non-null-assertion-ban ────────
    'typescript/consistent-type-assertions': [
      'error',
      {
        assertionStyle: 'never',
        objectLiteralTypeAssertions: 'never',
      },
    ],
    'typescript/no-non-null-assertion': 'error',
    'typescript/no-explicit-any': 'error',
    'typescript/prefer-as-const': 'error',

    // ── TypeScript: safe-const-let-var, safe-never-mutate-arguments ────────
    'eslint/prefer-const': 'error',
    'eslint/no-var': 'error',
    'eslint/no-param-reassign': ['error', { props: false }],

    // ── TypeScript: nullability-nullish-coalescing, optional-chaining ──────
    // Type-aware rules; require `options.typeAware` (set below).
    'typescript/prefer-nullish-coalescing': 'warn',
    'typescript/prefer-optional-chain': 'warn',
    'typescript/no-unnecessary-condition': 'warn',

    // ── TypeScript: control-nested-ternary-ban, control-early-return ───────
    'eslint/no-nested-ternary': 'error',
    'eslint/no-else-return': 'warn',

    // ── TypeScript: control-switch-braces ──────────────────────────────────
    'eslint/curly': ['warn', 'all'],

    // ── TypeScript: style-* conventions ────────────────────────────────────
    'eslint/arrow-body-style': ['warn', 'as-needed'], // style-implicit-return
    'eslint/prefer-destructuring': 'warn', // style-destructuring-multi
    'eslint/object-shorthand': 'warn', // style-object-shorthand

    // ── Recalibrated noise rules (2026-08-13) ──────────────────────────────
    // Each relaxation is deliberate; the strict versions churn the diff
    // without catching real defects. Meaningful type/correctness rules above
    // (no-explicit-any, no-non-null-assertion, no-nested-ternary, prefer-const,
    // no-param-reassign, rules-of-hooks, exhaustive-deps, ...) stay active.

    // Short math identifiers (`p`, `v`, `t`, `s`) are idiomatic in the
    // analysis/scoring code; renaming them hurts readability.
    'eslint/id-length': 'off',
    // Scoring rates, workbook column indices, and test fixtures are domain
    // constants; enumerating them as named constants is churn without value.
    'eslint/no-magic-numbers': 'off',
    // Fights oxfmt, which emits one `const` per line.
    'eslint/one-var': 'off',
    // No formatter support for key ordering; pure diff churn.
    'eslint/sort-keys': 'off',
    // Ternary is idiomatic here; `no-nested-ternary` (error) still guards the
    // genuinely confusing cases.
    'eslint/no-ternary': 'off',
    // Idiomatic early-continue in loops over player data.
    'eslint/no-continue': 'off',
    // The domain model uses `null` (storage round-trips, JSON payloads);
    // migrating to `undefined` is out of scope.
    'unicorn/no-null': 'off',
    // `Array#toSorted` needs the ES2023 lib; tsconfig targets ES2022.
    'unicorn/no-array-sort': 'off',
    // Callback-heavy functional style flags on every filter/map/find; the
    // actual mutation safety is enforced by no-param-reassign.
    'typescript/prefer-readonly-parameter-types': 'off',
    // Mechanical noise on every void-returning arrow handler.
    'typescript/no-confusing-void-expression': 'off',
    // Comment-case and inline-comment pedantry (previously only relaxed for
    // this config file itself); treated as noise everywhere.
    'eslint/capitalized-comments': 'off',
    'eslint/no-inline-comments': 'off',

    // ── Recalibrated complexity limits (2026-08-13) ────────────────────────
    // Analysis/board code is data-shape-heavy; the default limits flag
    // legitimate functions. Limits stay active, just realistic.
    'eslint/max-lines-per-function': ['warn', 150],
    'eslint/max-statements': ['warn', 30],
    'eslint/max-lines': ['warn', 500],
    'eslint/max-params': ['warn', 6],
    'eslint/max-depth': ['warn', 6],
    'react/jsx-max-depth': ['warn', { max: 4 }],

    // Import declarations are ordered by module specifier (and preserved by oxfmt).
    // `sort-imports` declaration sorting uses local binding names instead.
    'eslint/sort-imports': ['warn', { ignoreDeclarationSort: true }],
  },
  // The config file itself keeps grouped rule ordering and annotated comments;
  // those formatting pedantries are intentionally relaxed here.
  overrides: [
    {
      files: ['oxlint.config.ts'],
      rules: {
        'eslint/sort-keys': 'off',
        'eslint/capitalized-comments': 'off',
        'eslint/no-inline-comments': 'off',
      },
    },
    {
      // Component files are PascalCase (matching their export name) per the
      // react-best-practices skill's file-naming rule.
      files: ['src/components/**'],
      rules: {
        'unicorn/filename-case': ['warn', { case: 'pascalCase' }],
      },
    },
  ],
  options: {
    typeAware: true,
  },
});
