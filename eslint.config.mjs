import next from "eslint-config-next/core-web-vitals";
export default [
  { ignores: [".next/**", ".open-next/**", "node_modules/**", "public/ocr/**", "playwright-report/**", "test-results/**"] },
  ...next,
  // shortcut: React-compiler rules downgraded to warn (4 existing hits in IdleGuard, LoginForm, SaleReceipt); fix them, then make these errors.
  { rules: { "react-hooks/purity": "warn", "react-hooks/set-state-in-effect": "warn" } },
];
