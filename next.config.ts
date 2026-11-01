import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  async redirects() { return [{ source: '/admin/maintenance/backups', destination: '/admin/maintenance/settings?tab=backups', permanent: false }]; },
  serverExternalPackages: ['sharp', 'cloudinary', 'postgres', '@aws-sdk/client-s3'],
  async headers() { return [{ source: '/(.*)', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
  ] }]; }
};
export default config;
