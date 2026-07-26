const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  // Prisma's generated runtime references a source map it does not ship, which
  // source-map-loader reports on every build. It is noise, not a problem —
  // suppress it rather than disabling source maps for our own code.
  ignoreWarnings: [
    {
      module: /generated[\\/]prisma[\\/]runtime/,
      message: /Failed to parse source map/,
    },
  ],
  output: {
    path: join(__dirname, '../../dist/apps/api'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
    }),
  ],
};
