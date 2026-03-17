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
      yellow: colors.yellow,
    },
    extend: {
      colors: {
        // Paleta baseada no Filmora Dark Mode
        filmora: {
          bg: '#14151a',         // Fundo principal escuro
          panel: '#1e1f26',      // Fundo dos painéis/janelas
          border: '#383a45',     // Bordas sutis de divisão
          borderLight: '#4d505f',// Bordas em hover
          text: '#e1e1e3',       // Texto principal claro
          textMuted: '#9ca3af',  // Texto secundário/desativado
          accent: '#00e5ff',     // Azul/Ciano destaque do Filmora
          accentHover: '#00c3d9',
        }
      },
      fontFamily: {
        // Filmora usa fontes limpas de sistema
        sans: ['"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'filmora': '6px', // Arredondamento padrão dos painéis do Filmora
      }
    },
  },
  plugins: [],
}
