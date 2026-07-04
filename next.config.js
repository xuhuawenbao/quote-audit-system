/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse'],
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig
