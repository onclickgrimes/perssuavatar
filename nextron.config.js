const path = require('path')

const MAIN_BABEL_CONFIG = path.resolve(__dirname, 'main', 'babel.main.config.js')

module.exports = {
  webpack: (config) => {
    const rules = config?.module?.rules || []

    for (const rule of rules) {
      const useEntries = Array.isArray(rule?.use)
        ? rule.use
        : rule?.use
          ? [rule.use]
          : []

      for (const useEntry of useEntries) {
        if (!useEntry || typeof useEntry === 'string') {
          continue
        }

        const loader = useEntry.loader || ''
        if (!loader.includes('babel-loader')) {
          continue
        }

        useEntry.options = {
          ...(useEntry.options || {}),
          extends: MAIN_BABEL_CONFIG,
        }
      }
    }

    return config
  },
}
