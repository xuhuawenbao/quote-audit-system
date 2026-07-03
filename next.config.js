/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse']
  },
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig
