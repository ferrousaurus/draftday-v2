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

    // ── TypeScript: param-mutability-ban ───────────────────────────────────
    // `ReactNode` (children props) is a mutable union by design; exempt it so
    // components aren't flagged for idiomatic `Readonly<{ children: ReactNode }>`.
    'typescript/prefer-readonly-parameter-types': [
      'warn',
      { allow: [{ from: 'package', name: 'ReactNode', package: 'react' }] },
    ],
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
