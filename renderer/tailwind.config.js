export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Noto Sans SC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      colors: {
        surface: {
          50: "#f8f9fa", 100: "#f1f3f5", 200: "#e9ecef", 300: "#dee2e6",
          400: "#ced4da", 500: "#adb5bd", 600: "#868e96", 700: "#48484a",
          750: "#3a3a3c", 800: "#2c2c2e", 850: "#242426", 900: "#1c1c1e", 950: "#141415",
        },
        accent: {
          50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74",
          400: "#fb923c", 500: "#FF5A1F", 600: "#e04d14",
          700: "#c2410c", 800: "#9a3412", 900: "#7c2d12",
        },
      },
      borderRadius: { DEFAULT: "8px", sm: "6px", md: "8px", lg: "10px", xl: "14px" },
    },
  },
  plugins: [],
};
