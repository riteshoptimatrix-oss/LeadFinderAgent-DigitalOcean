import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export disabled - this app uses dynamic routes and real-time data
  // Remove this line to enable static export if needed (requires all routes to be static)
  // output: "export",
  
  // Images configuration - unoptimized for static export compatibility
  images: {
    unoptimized: true,
  },
  
  // Skip TypeScript errors during build (optional - consider fixing types instead)
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Trailing slash configuration
  trailingSlash: false,
};

export default nextConfig;
