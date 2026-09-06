import os from 'node:os';

function lanIps() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  allowedDevOrigins: lanIps(),
  async rewrites() {
    const proxy = process.env.API_PROXY_URL || 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${proxy}/api/:path*` }];
  },
};

export default nextConfig;