import type { Config } from "tailwindcss";

// Paleta e inspirată din bancnotele românești:
// 1 leu verde, 5 lei mov, 10 lei roșu, 50 lei galben, 100 lei albastru.
// Culorile vin din variabile CSS (globals.css), deci aceleași clase arată bine și ziua, și noaptea.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: token("paper"),
        canvas: token("paper"),
        sheet: token("sheet"),
        field: token("field"),
        "on-accent": token("on-accent"),
        ink: { DEFAULT: token("ink"), soft: token("ink-soft"), faint: token("ink-faint") },
        line: { DEFAULT: token("line"), strong: token("line-strong") },
        leu: { DEFAULT: token("leu"), tint: token("leu-tint"), soft: token("leu-soft") },
        mov: { DEFAULT: token("mov"), tint: token("mov-tint") },
        rosu: { DEFAULT: token("rosu"), tint: token("rosu-tint") },
        galben: { DEFAULT: token("galben"), tint: token("galben-tint") },
        albastru: { DEFAULT: token("albastru"), tint: token("albastru-tint"), deep: token("albastru-deep") },
        // nume vechi folosite în câteva locuri
        verde: token("leu"),
        violet: token("mov"),
        "rosu-soft": token("rosu"),
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
