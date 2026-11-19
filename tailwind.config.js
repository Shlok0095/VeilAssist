// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        /* InterviewMan UI: Poppins (IM google_fonts) + JetBrains Mono for code. */
        sans: [
          'Poppins',
          '"Segoe UI"',
          'Roboto',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'Poppins',
          '"Segoe UI"',
          'Roboto',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        void: {
          950: '#08080a',
          900: '#0c0c0f',
          850: '#121216',
          800: '#18181d',
          750: '#1e1e24',
          700: '#26262c',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          mid: 'rgb(var(--accent-mid-rgb) / <alpha-value>)',
          light: 'rgb(var(--accent-light-rgb) / <alpha-value>)',
        },
        warm: {
          amber: '#f59e0b',
          rose: '#f43f5e',
          sky: '#0ea5e9',
        },
        phantom: {
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
        mist: {
          400: '#94a3b8',
          500: '#64748b',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'bar-shine': 'barShine 4s ease-in-out infinite',
        'shadow-drift': 'shadowDrift 18s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.7 } },
        barShine: {
          '0%, 100%': { opacity: 0.35 },
          '50%': { opacity: 0.85 },
        },
        shadowDrift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.4' },
          '33%': { transform: 'translate(2%, -1%) scale(1.05)', opacity: '0.55' },
          '66%': { transform: 'translate(-1%, 2%) scale(0.98)', opacity: '0.45' },
        },
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        glow: '0 0 20px -5px rgb(var(--accent-rgb) / 0.2)',
        'glow-amber': '0 0 20px -5px rgba(245, 158, 11, 0.2)',
      },
    },
  },
  plugins: [],
}
