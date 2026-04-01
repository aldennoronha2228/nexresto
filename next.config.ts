import type { NextConfig } from 'next';
import WebpackObfuscator from 'webpack-obfuscator';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  trailingSlash: false,
  turbopack: {},
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2678400,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.plugins.push(
        new WebpackObfuscator(
          {
            compact: true,
            controlFlowFlattening: true,
            deadCodeInjection: true,
            stringArray: true,
            stringArrayEncoding: ['base64'],
            renameGlobals: false,
            identifierNamesGenerator: 'hexadecimal',
            splitStrings: true,
            splitStringsChunkLength: 8,
          },
          [
            '**/node_modules/**',
            '**/*.map',
            '**/framework-*.js',
            '**/main-*.js',
            '**/polyfills-*.js',
            '**/webpack-*.js',
          ]
        )
      );
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: '/code.html',
        destination: '/',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/',
          destination: '/code.html',
        },
      ],
      afterFiles: [
        {
          source: '/admin',
          destination: '/super-admin',
        },
        {
          source: '/admin/:path*',
          destination: '/super-admin/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
