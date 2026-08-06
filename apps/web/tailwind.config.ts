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
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl2: '1rem',
      },
      colors: {
        surface: {
          DEFAULT: 'var(--surface)',
          raised: '#1e293b',
          sunken: '#020617',
        },
        app: 'var(--bg)',
        raised: 'var(--raised)',
        raised2: 'var(--raised-2)',
        hair: {
          DEFAULT: 'var(--hair)',
          soft: 'var(--hair-soft)',
        },
        fg: {
          DEFAULT: 'var(--tx)',
          muted: 'var(--tx-2)',
          faint: 'var(--tx-3)',
        },
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        crit: 'var(--crit)',
        hairline: '#1e293b',
      },
    },
  },
  plugins: [],
} satisfies Config;
