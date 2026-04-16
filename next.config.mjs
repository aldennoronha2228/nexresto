/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'nexresto.in',
      },
    ],
  },
};

export default nextConfig;
