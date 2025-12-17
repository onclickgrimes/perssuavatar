/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false,
  output: 'export',
  distDir: process.env.NODE_ENV === 'production' ? '../app' : '.next',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  webpack: (config, { defaultLoaders }) => {
    config.module.rules.push({
      test: /\.(ts|tsx)$/,
      include: [
        require('path').resolve(__dirname, '../remotion'),
      ],
      use: [
        defaultLoaders.babel,
      ],
    });
    return config
  },
}
