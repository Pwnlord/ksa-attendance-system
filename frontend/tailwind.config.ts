import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        muted: "#667085",
        border: "#E4E7EC",
        primary: "#0B7FF5",
        pale: "#F2F8FD",
        success: "#17A673",
        warning: "#F79009",
        danger: "#D92D20",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
