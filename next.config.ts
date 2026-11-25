import type { NextConfig } from 'next';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'export',
  trailingSlash: false,
  basePath: basePath || undefined,
  images: { unoptimized: true },
};

export default nextConfig;
