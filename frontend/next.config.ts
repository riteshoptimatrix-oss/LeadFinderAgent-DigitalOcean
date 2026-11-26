
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow development access from local network IP
  allowedDevOrigins: ["192.168.1.14"],

  // Images configuration
  images: {
    unoptimized: true,
  },

  // Skip TypeScript errors during build
  typescript: {
    ignoreBuildErrors: true,
  },

  // Trailing slash configuration
  trailingSlash: false,

  async rewrites() {
    return [
      {
        source: '/open/:tracking_id',
        destination: 'http://127.0.0.1:8000/api/v1/tracking/open/:tracking_id',
      },
      {
        source: '/pixel/:tracking_id',
        destination: 'http://127.0.0.1:8000/api/v1/tracking/open/:tracking_id',
      },
      {
        source: '/track',
        destination: 'http://127.0.0.1:8000/api/v1/tracking/track',
      },
      {
        source: '/track.php',
        destination: 'http://127.0.0.1:8000/api/v1/tracking/track.php',
      },
      {
        source: '/uploads/:path*',
        destination: 'http://127.0.0.1:8000/api/v1/uploads/:path*',
      },
    ];
  },

  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.output = {
        ...config.output,
        chunkLoadTimeout: 60000, // 60s timeout to prevent ChunkLoadError in dev mode
      };
    }
    return config;
  },
};

export default nextConfig;
