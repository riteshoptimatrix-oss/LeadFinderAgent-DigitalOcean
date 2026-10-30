
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
