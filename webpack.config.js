const webpack = require('webpack');
const path = require('path');
module.exports = {
  plugins: [new webpack.optimize.UglifyJsPlugin()],
  resolve: {
    // Add '.ts' and '.tsx' as resolvable extensions.
    extensions: ['.ts', '.tsx', '.js'],
    modules: ['node_modules'],
  },

  entry: {
    app: './index.ts',
  },
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
      // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
      {
        enforce: 'pre',
        test: /\.js$/,
        loader: 'source-map-loader',
        exclude: [/node_modules/],
      },
      {
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: [/node_modules/],
        query: {
          presets: ['es2017'],
        },
      },
    ],
  },
  node: {
    fs: 'empty',
  },
  output: {
    filename: './index.js',
    libraryTarget: 'umd',
    library: 'unit-vis',
    path: path.resolve(__dirname, './'),
  },
  mode: 'production',
  devtool: 'source-map',
};
