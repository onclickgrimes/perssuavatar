const colors = require('tailwindcss/colors')

module.exports = {
  content: [
    './renderer/pages/**/*.{js,ts,jsx,tsx}',
    './renderer/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    colors: {
      // use colors only specified
      white: colors.white,
      black: colors.black,
      gray: colors.gray,
      blue: colors.blue,
      red: colors.red,
      orange: colors.orange,
      amber: colors.amber,
      purple: colors.purple,
      green: colors.green,
    },
    extend: {},
  },
  plugins: [],
}
