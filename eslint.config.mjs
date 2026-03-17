import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**", "**/build/**"] },
  js.configs.recommended,
  {
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks, "react-refresh": reactRefresh },
    settings: { react: { version: "detect" } },
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      },
      globals: {
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly"
      }
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  },
  // Node/CommonJS config files
  {
    files: ["**/*.cjs", "**/postcss.config.*", "**/tailwind.config.*"],
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        process: "readonly"
      }
    }
  },
  // apps/api and apps/worker are CommonJS Node
  {
    files: ["apps/api/src/**/*.js", "apps/worker/src/**/*.js", "packages/shared/src/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly"
      }
    }
  },
  // `server/` is plain CommonJS JS (no TypeScript)
  {
    files: ["server/src/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly"
      }
    },
    rules: {
      // no TypeScript rules here
    }
  }
];

