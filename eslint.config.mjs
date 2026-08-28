import js from "@eslint/js";
import tanstackQuery from "@tanstack/eslint-plugin-query";
import configPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "eslint.config.mjs",
      "packages/db/migrations/**",
      ".claude/worktrees/**",
      // Declaration files carry no logic to lint, and typed linting has no
      // project for them: the shared hook body must stay .mjs because the host
      // hooks run under plain node, so its types live in a hand-written .d.mts.
      "**/*.d.mts"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }]
    }
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly"
      }
    }
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended
  },
  ...tanstackQuery.configs["flat/recommended"],
  configPrettier
);
