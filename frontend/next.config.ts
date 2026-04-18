import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@sui-portfolio/shared'],
  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:4000/api';

    return [
      {
        source: '/api/backend/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
