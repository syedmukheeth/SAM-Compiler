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
        }
      },
      boxShadow: {
        glass: "0 10px 30px rgba(0,0,0,0.45)"
      }
    }
  },
  plugins: []
};

