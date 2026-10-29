import type { NextConfig } from "next";

/**
 * STATIC EXPORT CONFIGURATION
 * Use this configuration to generate the /out folder for static hosting
 * 
 * TO USE THIS CONFIG:
 * 1. Rename next.config.ts to next.config.netlify.ts
 * 2. Rename this file to next.config.ts
 * 3. Run: npm run build
 * 4. The /out folder will be generated
 * 
 * IMPORTANT LIMITATIONS:
 * - No React Server Components (RSC)
 * - No Server-side Rendering (SSR)
 * - No API Routes
 * - No Dynamic Routes
 * - No Middleware
 * - Client-side only
 */

const nextConfig: NextConfig = {
  // Static export - generates the /out folder
  output: "export",
  
  // Disable trailing slashes for better static compatibility
  trailingSlash: false,
  
  // Images must be unoptimized for static export
  images: {
    unoptimized: true,
  },
  
  // Skip TypeScript errors during build
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Optional: Configure base path if serving from a subdirectory
  // basePath: "/app",
  
  // Optional: Configure asset prefix for CDN
  // assetPrefix: "https://cdn.example.com",
};

export default nextConfig;
