import parser from "@typescript-eslint/parser";
import pluginTs from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["dist", "node_modules", "test/output/**", "*.config.js", "*.config.cjs", ".tmp-*"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": pluginTs,
    },
    rules: {
      // Use only non-type-aware rules from recommended
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/no-var-requires": "error",
    },
  },
];
