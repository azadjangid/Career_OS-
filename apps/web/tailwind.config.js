/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#040A11',
          900: '#080F1A',
          800: '#0D1826',
          700: '#132033',
          600: '#1B2D45',
          500: '#243D5C',
        },
        saffron: {
          300: '#FFB380',
          400: '#FF9A5C',
          500: '#FF7A3D',
          600: '#E8601D',
          700: '#C44A10',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Syne', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
