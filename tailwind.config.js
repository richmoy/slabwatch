/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        navy: '#0a0e1a',
        'navy-light': '#0d1220',
        'navy-card': '#0f1629',
        accent: '#3b82f6',
      },
    },
  },
  plugins: [],
}
