import type { NextConfig } from "next";

/**
 * NETLIFY FULL RUNTIME CONFIGURATION
 * Use this configuration for Netlify deployment with full Next.js features
 * 
 * TO USE THIS CONFIG:
 * 1. Make sure this file is named next.config.ts
 * 2. Deploy to Netlify
 * 3. Netlify will use @netlify/plugin-nextjs
 * 
 * ENABLED FEATURES:
 * - ✅ React Server Components (RSC)
 * - ✅ Server-side Rendering (SSR)
 * - ✅ API Routes
 * - ✅ Dynamic Routes
 * - ✅ Middleware
 * - ✅ Incremental Static Regeneration (ISR)
 * - ✅ Full Next.js capabilities
 */

const nextConfig: NextConfig = {
  // NO output setting = full Next.js runtime on Netlify
  
  // Images unoptimized (or enable Netlify Image CDN by setting to false)
  images: {
    unoptimized: true,
  },
  
  // Skip TypeScript errors during build
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Trailing slash configuration
  trailingSlash: false,
};

export default nextConfig;
