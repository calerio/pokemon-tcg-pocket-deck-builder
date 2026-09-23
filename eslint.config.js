import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage", "public/data"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // The core library stays framework-free so it can be reused (CLI, other UIs, a future npm package).
    files: ["src/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["react", "react-dom", "react/*", "react-dom/*"], message: "src/lib must not depend on React." },
          { group: ["**/app/**", "../app/*", "../../app/*"], message: "src/lib must not import UI code." },
        ],
      }],
    },
  },
);
