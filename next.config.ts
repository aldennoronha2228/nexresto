import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/admin',
        destination: '/super-admin',
      },
      {
        source: '/admin/:path*',
        destination: '/super-admin/:path*',
      },
    ];
  },
};

export default nextConfig;
