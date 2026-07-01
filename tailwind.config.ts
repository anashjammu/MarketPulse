import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0f1115",
          panel: "#171c24",
          panel2: "#1b212b",
          line: "#303744",
          amber: "#d4a864",
          cyan: "#62b8d3",
          green: "#66b38d",
          red: "#d17582",
          text: "#f3f5f8",
          muted: "#a8b0bc"
        }
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 20px 52px rgba(0,0,0,0.24)"
      }
    }
  },
  plugins: []
};

export default config;
