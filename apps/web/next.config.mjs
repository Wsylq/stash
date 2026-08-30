/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    const proxy = process.env.API_PROXY_URL || 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${proxy}/api/:path*` }];
  },
};

export default nextConfig;