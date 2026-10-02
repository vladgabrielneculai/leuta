import type { Config } from "tailwindcss";

// Paleta e inspirată din bancnotele românești:
// 1 leu verde, 5 lei mov, 10 lei roșu, 50 lei galben, 100 lei albastru.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#EDF1EE",
        sheet: "#F8FAF8",
        ink: { DEFAULT: "#1C2B30", soft: "#4E5E63", faint: "#8A989C" },
        line: "#D5DDD8",
        leu: { DEFAULT: "#3D7A4E", tint: "#DCEBDF" },
        mov: { DEFAULT: "#6A4E99", tint: "#E6DFF1" },
        rosu: { DEFAULT: "#B5456A", tint: "#F4DDE5" },
        galben: { DEFAULT: "#C99A1E", tint: "#F6ECCB" },
        albastru: { DEFAULT: "#2E5C8A", tint: "#DCE6F1" },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', "system-ui", "sans-serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
