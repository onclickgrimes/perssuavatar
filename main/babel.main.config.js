module.exports = (api) => {
  api.cache(() => process.env.NODE_ENV === 'production')

  return {
    presets: [
      [
        require('@babel/preset-env'),
        {
          targets: {
            node: true,
          },
        },
      ],
      require('@babel/preset-typescript'),
    ],
    plugins: [
      require('@babel/plugin-transform-class-properties'),
      [
        require('@babel/plugin-transform-object-rest-spread'),
        {
          useBuiltIns: true,
        },
      ],
      [
        require('@babel/plugin-transform-runtime'),
        {
          // Keep helper deduplication but avoid core-js runtime injection
          // that leaks into page.evaluate callback serialization.
          corejs: false,
          helpers: true,
          regenerator: true,
          useESModules: false,
        },
      ],
    ],
  }
}
