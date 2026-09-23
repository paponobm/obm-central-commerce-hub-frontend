import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        sidebar: {
          DEFAULT: "var(--sidebar-bg)",
          fg: "var(--sidebar-fg)",
          active: "var(--sidebar-active-bg)",
          "active-fg": "var(--sidebar-active-fg)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          fg: "var(--primary-fg)",
        },
        card: "var(--card-bg)",
        status: {
          pending: "var(--status-pending)",
          processing: "var(--status-processing)",
          delivered: "var(--status-delivered)",
          cancelled: "var(--status-cancelled)",
        },
      },
      borderRadius: {
        card: "var(--card-radius)",
      },
      boxShadow: {
        card: "var(--card-shadow)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
    },
  },
  plugins: [],
};
export default config;
