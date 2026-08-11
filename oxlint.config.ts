import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: [
    {
      name: "react-you-might-not-need-an-effect",
      specifier: "eslint-plugin-react-you-might-not-need-an-effect",
    },
  ],
  categories: {
    correctness: "error",
    perf: "error",
    pedantic: "warn",
    style: "warn",
  },
  rules: {
    "eslint/no-unused-vars": "error",
    "react-you-might-not-need-an-effect/no-derived-state": "error",
    "react-you-might-not-need-an-effect/no-chain-state-updates": "error",
    "react-you-might-not-need-an-effect/no-event-handler": "error",
    "react-you-might-not-need-an-effect/no-adjust-state-on-prop-change": "error",
    "react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change": "error",
    "react-you-might-not-need-an-effect/no-pass-live-state-to-parent": "error",
    "react-you-might-not-need-an-effect/no-pass-data-to-parent": "error",
    "react-you-might-not-need-an-effect/no-initialize-state": "error",
    "react-you-might-not-need-an-effect/no-external-store-subscription": "error",
  },
  options: {
    typeAware: true,
  },
});
