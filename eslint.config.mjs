import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/sw.js",
      "supabase/.temp/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    /**
     * eslint-plugin-react-hooks v7 (shipped with eslint-config-next 16) adds
     * new React-Compiler-era heuristics. They flag pre-existing, runtime-safe
     * patterns in the Phase 1 codebase: sessionStorage rehydration inside a
     * mount effect, ref mirrors kept for idle persistence, and three.js
     * resource lifecycle handling in the auth visual. Rewriting those flows is
     * out of scope for the Next 16 upgrade and risks regressing working
     * journeys, so the heuristics stay visible as warnings. Correctness rules
     * (exhaustive-deps etc.) keep their upstream severity.
     */
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/incompatible-library": "warn",
    },
  },
];

export default eslintConfig;
