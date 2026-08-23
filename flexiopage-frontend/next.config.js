/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    // Backend serves uploaded media from /uploads/*. Allow next/image to
    // fetch + optimize it. In prod, set NEXT_PUBLIC_API_URL to the public
    // API origin and the matching remotePattern below is hit.
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '5051', pathname: '/uploads/**' },
      { protocol: 'http', hostname: 'localhost', port: '5000', pathname: '/uploads/**' },
      { protocol: 'https', hostname: 'api.flexiopage.com', pathname: '/uploads/**' },
      { protocol: 'https', hostname: '**.flexiopage.com', pathname: '/uploads/**' },
      // External CDNs used by demo content / templates
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  async rewrites() {
    return [];
  },
  async redirects() {
    return [
      // Studio IA a été renommé /dashboard/pages/poster → /dashboard/studio.
      // Redirect permanent pour ne casser ni les bookmarks vendeur ni les
      // liens envoyés par mail/Slack. Préserve la query string automatiquement.
      { source: '/dashboard/pages/poster', destination: '/dashboard/studio', permanent: true },
    ];
  },
};

module.exports = nextConfig;
