/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        court: {
          bg: '#0d1b2a',
          surface: '#0f2744',
          deep: '#0a1f3a',
          line: '#4a7fc1',
        },
        brand: {
          primary: '#ef6461',
          secondary: '#48cae4',
        },
      },
    },
  },
  plugins: [],
}
