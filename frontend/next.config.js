const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  trailingSlash: false,
  transpilePackages: ['@cornerstonejs/core', '@cornerstonejs/tools', '@cornerstonejs/dicom-image-loader'],
  webpack: (config, { isServer, dev }) => {
    // WebAssembly configuration
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      syncWebAssembly: true,
      layers: true,
      topLevelAwait: true // Enable top-level await for async imports
    };

    // Create a more specific rule for Cornerstone codec WASM files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/wasm/[name].[hash][ext]'
      }
    });

    // Handle URL replacements for DICOM loader with proper asset handling
    config.module.rules.push({
      test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
      type: 'asset',
      parser: {
        dataUrlCondition: {
          maxSize: 8192 // 8kb - inline smaller files
        }
      },
      generator: {
        filename: 'static/assets/[name].[hash][ext]'
      }
    });

    // Set explicit publicPath for asset loading
    if (!isServer) {
      config.output.publicPath = '/_next/';
    }

    // Configure output for WebAssembly
    config.output = {
      ...config.output,
      webassemblyModuleFilename: 'static/wasm/[modulehash].wasm'
    };

    // More comprehensive fallback configuration for browser polyfills
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        os: false,
        stream: 'stream-browserify',
        util: 'util',
        buffer: 'buffer',
        process: 'process/browser',
        zlib: false,
        net: false,
        tls: false,
        http: false,
        https: false,
        child_process: false,
        url: false,
        assert: false,
        worker_threads: false
      };

      // Add polyfills through webpack.ProvidePlugin
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser'
        })
      );

      // Required for the buffer polyfill to work
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/node:/, (resource) => {
          const mod = resource.request.replace(/^node:/, '');
          switch (mod) {
            case 'buffer':
              resource.request = 'buffer';
              break;
            case 'stream':
              resource.request = 'stream-browserify';
              break;
            case 'util':
              resource.request = 'util';
              break;
            default:
              break;
          }
        })
      );
    }

    // Don't attempt to polyfill or bundle certain Node.js modules
    config.externals = [...(config.externals || []), 
      'fs',
      'path',
      'os'
    ];

    // Optimize for WebAssembly
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        chunkIds: 'deterministic'
      };
    }

    // Clear webpack cache to prevent issues
    if (!isServer) {
      config.cache = false;
    }

    // Add support for DICOM image loader
    config.resolve.alias = {
      ...config.resolve.alias
    };

    return config;
  },
  // Experimental features
  experimental: {
    esmExternals: true,
    serverComponentsExternalPackages: ['sharp'],
    optimizePackageImports: ['@cornerstonejs/core', '@cornerstonejs/tools', '@cornerstonejs/dicom-image-loader']
  }
};

module.exports = nextConfig; 