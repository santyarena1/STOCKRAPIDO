import type { Config } from 'tailwindcss';

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1rem',
      },
      colors: {
        surface: {
          DEFAULT: '#0f172a',
          raised: '#1e293b',
          sunken: '#020617',
        },
        hairline: '#1e293b',
      },
    },
  },
  plugins: [],
} satisfies Config;
