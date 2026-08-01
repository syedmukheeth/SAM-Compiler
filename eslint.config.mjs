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
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        caches: "readonly",
        navigator: "readonly",
        console: "readonly",
        confirm: "readonly",
        alert: "readonly",
        URLSearchParams: "readonly",
        URL: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        ResizeObserver: "readonly",
        AbortController: "readonly",
        DOMException: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        WebSocket: "readonly",
        HTMLElement: "readonly",
        Element: "readonly",
        Node: "readonly",
        MutationObserver: "readonly",
        IntersectionObserver: "readonly",
        performance: "readonly",
        prompt: "readonly",
        queueMicrotask: "readonly",
        structuredClone: "readonly",
        // Injected by vite.config define()
        __APP_VERSION__: "readonly"
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
    files: ["apps/api/**/*.js", "apps/worker/**/*.js", "packages/shared/src/**/*.js"],
    ignores: ["**/tests/**/*.js", "**/vitest.config.js"],
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
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        Buffer: "readonly"
      }
    }
  },
  // Vitest suites and configs are ESM even inside the CommonJS workspaces.
  {
    files: ["**/tests/**/*.js", "**/*.test.js", "**/vitest.config.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        __dirname: "readonly"
      }
    }
  }
];

