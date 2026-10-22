import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The container image runs the minimal server Next.js traces into .next/standalone.
  output: 'standalone',
  // No floating Next.js badge in development: the screens should look exactly as they do in production.
  devIndicators: false,
};

export default nextConfig;
