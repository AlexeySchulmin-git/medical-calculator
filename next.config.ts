import type { NextConfig } from "next";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

const nextConfig: NextConfig = {
  // Proper configuration for server external packages
  serverExternalPackages: [],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
      {
        source: '/admin',
        destination: '/admin.html',
      },
      {
        source: '/superadmin',
        destination: '/superadmin.html',
      },
    ];
  },
};

export default nextConfig;
