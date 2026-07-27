import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import js from "@eslint/js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // ── Custom: no-restricted-imports (populated in Prompt 8)
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            // Scaffold to be filled in later
            // "pattern": { message: "reason" }
          ],
        },
      ],
    },
  },
  {
    // ── Custom: ban console.log in src/server/**
    files: ["src/server/**/*.ts", "src/server/**/*.tsx"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
]);

export default eslintConfig;
