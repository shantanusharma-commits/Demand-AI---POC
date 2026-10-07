import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // No floating Next.js badge in development: the screens should look exactly as they do in production.
  devIndicators: false,
  // The prototype has no home page of its own; it opened on Today.
  async redirects() {
    return [
      { source: '/', destination: '/today', permanent: false },
    ];
  },
};

export default nextConfig;
