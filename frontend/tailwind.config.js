/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        gov: {
          navy: '#103778',
          'navy-dark': '#0b2554',
          'navy-light': '#1e4b9c',
          saffron: '#f26522',
          'saffron-dark': '#d9531e',
          'saffron-light': '#ff7a3d',
          terracotta: '#c45a1b',
          blue: '#1e3a8a',
          slate: '#0f172a',
          bg: '#f1f5f9',
          card: '#ffffff',
          border: '#e2e8f0',
        },
        dark: {
          900: '#f8fafc',
          800: '#ffffff',
          700: '#f1f5f9',
          600: '#e2e8f0',
          500: '#cbd5e1',
          400: '#94a3b8',
        },
        accent: {
          blue: '#1e40af',
          violet: '#6366f1',
          cyan: '#0284c7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      boxShadow: {
        govt: '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'govt-md': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
        'govt-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
        glass: '0 2px 10px rgba(0,0,0,0.06)',
        glow: '0 0 15px rgba(16, 55, 120, 0.2)',
      },
    },
  },
  plugins: [],
}
