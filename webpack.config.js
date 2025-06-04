import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default (env, argv) => {
  const isDevelopment = argv.mode === 'development';

  return {
    mode: isDevelopment ? 'development' : 'production',
    entry: './client/public/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bundle.[contenthash].js',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-env',
                '@babel/preset-react',
                '@babel/preset-typescript',
              ],
            },
          },
        },
        {
          test: /\.css$/,
          use: [
            isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
            'css-loader',
          ],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './client/public/index.html', // Create this file
        filename: 'index.html',
      }),
      ...(isDevelopment ? [] : [
        new MiniCssExtractPlugin({
          filename: '[name].[contenthash].css',
        }),
      ]),
    ],
    devServer: {
      port: 8080,
      hot: true,
      open: true,
      historyApiFallback: true,
      client: {
        logging: 'error', // Only show errors
        progress: false,  // Disable progress overlay
      },
      proxy: [
        {
          context: ['/api'],
          target: 'http://localhost:3000', // Backend server port
          changeOrigin: true,
        },
      ],
    },
    devtool: isDevelopment ? 'eval-source-map' : 'source-map',
    performance: {
      hints: false, // Disable performance warnings
    },
    stats: 'errors-warnings', // Only show errors and warnings
    infrastructureLogging: {
      level: 'error', // Reduce infrastructure logging
    },
  };
};