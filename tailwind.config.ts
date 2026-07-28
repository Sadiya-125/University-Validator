import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["system-ui", "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "Menlo", "monospace"],
      },
      colors: {
        // Interactive colors (primary use for UI controls only)
        primary: "var(--color-primary)",
        accent: "var(--color-accent)",

        // Verdict colors (semantic meaning)
        success: "var(--color-success)",    // Genuine
        warning: "var(--color-warning)",    // Unknown/Likely Genuine
        danger: "var(--color-danger)",      // Fake
        info: "var(--color-accent)",        // Likely Genuine

        // Base neutral grays
        bg: "var(--color-bg)",
        "bg-secondary": "var(--color-bg-secondary)",
        "bg-tertiary": "var(--color-bg-tertiary)",
        text: "var(--color-text)",
        "text-secondary": "var(--color-text-secondary)",
        "text-tertiary": "var(--color-text-tertiary)",
        border: "var(--color-border)",
        "border-subtle": "var(--color-border-subtle)",
      },
      spacing: {
        // 4px grid
        0.5: "2px",
        1: "4px",
        1.5: "6px",
        2: "8px",
        2.5: "10px",
        3: "12px",
        3.5: "14px",
        4: "16px",
        5: "20px",
        6: "24px",
        7: "28px",
        8: "32px",
        9: "36px",
        10: "40px",
        12: "48px",
        14: "56px",
        16: "64px",
        20: "80px",
        24: "96px",
        28: "112px",
        32: "128px",
        36: "144px",
        40: "160px",
        44: "176px",
        48: "192px",
        52: "208px",
        56: "224px",
        60: "240px",
        64: "256px",
        72: "288px",
        80: "320px",
        96: "384px",
      },
      borderRadius: {
        xs: "2px",
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      fontSize: {
        xs: ["12px", { lineHeight: "16px", letterSpacing: "0.4px" }],
        sm: ["13px", { lineHeight: "18px", letterSpacing: "0.3px" }],
        base: ["14px", { lineHeight: "20px", letterSpacing: "0.2px" }],
        lg: ["16px", { lineHeight: "24px", letterSpacing: "0px" }],
        xl: ["18px", { lineHeight: "28px", letterSpacing: "0px" }],
        "2xl": ["20px", { lineHeight: "28px" }],
        "3xl": ["24px", { lineHeight: "32px" }],
        "4xl": ["32px", { lineHeight: "40px" }],
        "5xl": ["40px", { lineHeight: "48px" }],
        "6xl": ["48px", { lineHeight: "56px" }],
      },
      transitionDuration: {
        // Restrained motion defaults
        fast: "100ms",
        base: "200ms",
        slow: "300ms",
      },
      zIndex: {
        dropdown: "100",
        sticky: "200",
        fixed: "300",
        modal: "400",
        popover: "500",
        tooltip: "600",
      },
    },
  },
  plugins: [],
};

export default config;
