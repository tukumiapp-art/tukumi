/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#008080',       // Teal
        'primary-dark': '#006666',
        'primary-light': '#00A0A0',
        accent: '#FF6B6B',        // Coral
        gold: '#FFD166',          // Aristocratic Gold
        dark: '#1A2634',          // Deep Blue-Grey
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Tahoma', 'Geneva', 'Verdana', 'sans-serif'],
      }
    },
  },
  plugins: [],
}