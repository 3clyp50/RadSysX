/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  webpack: (config, { isServer, dev }) => {
    // WebAssembly configuration
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      syncWebAssembly: true,
      layers: true,
    };

    // Create a more specific rule for Cornerstone codec WASM files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'javascript/auto',
      use: [
        {
          loader: 'file-loader',
          options: {
            name: 'static/wasm/[name].[hash].[ext]',
            publicPath: '/_next/',
          },
        },
      ],
    });

    // Set explicit publicPath to fix "Automatic publicPath is not supported in this browser" error
    if (!isServer) {
      config.output.publicPath = '/_next/';
    }

    // More comprehensive fallback configuration
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      os: false,
      stream: false,
      util: false,
      buffer: false,
      process: false,
      zlib: false,
      net: false,
      tls: false,
      http: false,
      https: false,
      child_process: false,
      a: false, // This specifically addresses the "Can't resolve 'a'" error
      env: false,
    };

    // Don't attempt to polyfill or bundle certain Node.js modules
    config.externals = [...(config.externals || []), 
      'fs',
      'path',
      'os',
    ];

    // Clear webpack cache to prevent issues
    if (!isServer) {
      config.cache = false;
    }
    
    return config;
  },
  // Increase memory limit for WebAssembly operations
  experimental: {
    esmExternals: 'loose',
  },
};

module.exports = nextConfig; 