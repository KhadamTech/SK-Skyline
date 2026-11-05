/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/SK-Skyline',
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
