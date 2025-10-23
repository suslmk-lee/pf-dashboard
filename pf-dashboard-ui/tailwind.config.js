/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'flow': {
          '0%, 100%': { strokeDashoffset: '0' },
          '50%': { strokeDashoffset: '20' }
        },
        'pulse-red': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' }
        }
      },
      animation: {
        'flow': 'flow 2s linear infinite',
        'pulse-red': 'pulse-red 1.5s ease-in-out infinite'
      }
    },
  },
  plugins: [],
}
