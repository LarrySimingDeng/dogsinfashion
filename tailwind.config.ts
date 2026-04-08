import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#E8975E', light: '#FDE9A6' },
        secondary: { DEFAULT: '#5BA4D9', light: '#D6ECFA' },
        background: '#FFFAF3',
        surface: '#FFFFFF',
        'warm-dark': '#2D2A26',
        'warm-gray': '#7A7570',
        sage: { DEFAULT: '#B0CDA7', light: '#D5E5D0' },
        blush: '#F7E1E5',
        peach: '#FDDCBD',
        butter: '#FDE9A6',
        sky: { DEFAULT: '#D6ECFA', deep: '#A8D4F0' },
        cream: '#FFF8E7',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body: ['Nunito', 'sans-serif'],
        accent: ['Caveat', 'cursive'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '28px',
      },
      boxShadow: {
        soft: '0 4px 24px rgba(0,0,0,0.06)',
        elevated: '0 12px 48px rgba(0,0,0,0.08)',
        glow: '0 6px 28px rgba(91,164,217,0.35)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        'float-delayed': 'float 4s ease-in-out 1.5s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
