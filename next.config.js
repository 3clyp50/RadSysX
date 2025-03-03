/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Allow Next.js to handle .wasm files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }
    
    // Explicitly add the fallback for the 'env' module
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      "crypto": false,
      "env": false,
    }
    
    return config
  },
}

module.exports = nextConfig 