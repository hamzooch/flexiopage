import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://flexiopage.com'),
  title: {
    default: 'FlexioPage — Create Your Online Store',
    template: '%s · FlexioPage',
  },
  description:
    'Vends des produits physiques ou digitaux avec ta boutique en ligne et tes landing pages — paiement à la livraison, logistique, et tout le reste inclus.',
  applicationName: 'FlexioPage',
  authors: [{ name: 'FlexioPage' }],
  keywords: [
    'e-commerce',
    'boutique en ligne',
    'landing page',
    'paiement à la livraison',
    'COD',
    'dropshipping',
    'SaaS',
  ],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/brand/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/brand/icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },
  openGraph: {
    type: 'website',
    siteName: 'FlexioPage',
    title: 'FlexioPage — Create Your Online Store',
    description:
      'Vends des produits physiques ou digitaux avec ta boutique en ligne et tes landing pages.',
    url: 'https://flexiopage.com',
    locale: 'fr_FR',
    images: [{ url: '/brand/icon.png', width: 512, height: 512, alt: 'FlexioPage' }],
  },
  twitter: {
    card: 'summary',
    title: 'FlexioPage — Create Your Online Store',
    description:
      'Vends des produits physiques ou digitaux avec ta boutique en ligne et tes landing pages.',
    images: ['/brand/icon.png'],
  },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={inter.className} suppressHydrationWarning>{children}</body>
    </html>
  );
}
