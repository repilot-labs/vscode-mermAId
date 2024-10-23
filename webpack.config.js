//@ts-check

'use strict';

const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const codiconPath = path.posix.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css').replace(/\\/g, "/");
const codicontffPath = path.posix.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf').replace(/\\/g, "/");
const mermaidPath = path.posix.join(__dirname, 'node_modules', 'mermaid', 'dist', 'mermaid.esm.min.mjs').replace(/\\/g, "/");
const mermaidChunkPath = path.posix.join(__dirname, 'node_modules', 'mermaid', 'dist', 'chunks', 'mermaid.esm.min', '*.mjs').replace(/\\/g, "/");

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
  mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/

  plugins: [
    new CopyPlugin({
      patterns: [
        { from: mermaidPath, to: path.join("media", "mermaid") + '/[name][ext]' },
        { from: mermaidChunkPath, to: path.join("media", "mermaid", "chunks", "mermaid.esm.min") + '/[name][ext]' },
        { from: codiconPath, to: path.join("media", "codicons") + '/[name][ext]' },
        { from: codicontffPath, to: path.join("media", "codicons") + '/[name][ext]' },
      ],
    }),
  ],
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    // modules added here also need to be added in the .vscodeignore file
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js', '.tsx']
  },
  module: {
    rules: [
      {
        test: /\.([cm]?ts|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};
module.exports = [extensionConfig];