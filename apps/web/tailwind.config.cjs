/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070A14",
          900: "#0B1020",
          850: "#0D1430"
        },
        sam: {
          bg: "var(--sam-bg)",
          surface: "var(--sam-surface)",
          "surface-low": "var(--sam-surface-low)",
          "surface-high": "var(--sam-surface-high)",
          "surface-top": "var(--sam-surface-top)",
          bright: "var(--sam-bright)",
          accent: "var(--sam-accent)",
          "accent-dim": "var(--sam-accent-dim)",
          "accent-muted": "var(--sam-accent-muted)",
          text: "var(--sam-text)",
          "text-muted": "var(--sam-text-muted)",
          "text-dim": "var(--sam-text-dim)",
          "text-muted-alt": "var(--sam-text-muted-alt)",
          "glass-border": "var(--sam-glass-border)",
        }
      },
      boxShadow: {
        glass: "0 10px 30px rgba(0,0,0,0.45)"
      }
    }
  },
  plugins: []
};

