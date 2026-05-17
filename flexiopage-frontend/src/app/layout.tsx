import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { PlatformChatBot } from '@/components/chatbot/PlatformChatBot';

const inter = Inter({ subsets: ['latin'] });

/**
 * Root metadata for the marketing surface. Per-route pages can override
 * via their own `metadata` export — Next.js merges shallowly, so the
 * defaults below (title template, og defaults, verification, theme color)
 * apply everywhere except where explicitly replaced.
 *
 * To finish the SEO loop after deployment:
 *   1. Replace the empty `verification.google` string with the token
 *      you get from https://search.google.com/search-console
 *   2. Submit https://flexiopage.com/sitemap.xml from Search Console →
 *      Sitemaps. Google typically indexes within 24-72 h.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://flexiopage.com'),
  title: {
    default: 'FlexioPage — Crée ta boutique en un clic. Paiement à la livraison inclus.',
    template: '%s · FlexioPage',
  },
  description:
    "FlexioPage : la plateforme tout-en-un pour créer ta boutique en ligne en 60 secondes. Génère tes landing pages par IA, accepte le paiement à la livraison (COD), dispatche automatiquement via MogaDelivery. Sénégal, Maroc, Tunisie, Algérie, Côte d'Ivoire — 16 pays.",
  applicationName: 'FlexioPage',
  authors: [{ name: 'FlexioPage' }],
  creator: 'FlexioPage',
  publisher: 'FlexioPage',
  category: 'business',
  keywords: [
    'boutique en ligne',
    'créer une boutique',
    'paiement à la livraison',
    'cash on delivery',
    'COD Maroc',
    'COD Sénégal',
    'COD Tunisie',
    'COD Algérie',
    'landing page IA',
    'générateur landing page',
    'e-commerce Afrique',
    'MogaDelivery',
    'SaaS e-commerce',
    'dropshipping',
    'متجر إلكتروني',
    'الدفع عند الاستلام',
  ],
  alternates: {
    canonical: '/',
    languages: {
      fr: '/',
      ar: '/',
      'x-default': '/',
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  // Replace with the real token from Google Search Console once verified.
  // The tag is harmless when empty; Google ignores blank verification strings.
  verification: {
    google: '',
  },
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
    title: 'FlexioPage — Crée ta boutique en un clic',
    description:
      "Crée ta boutique, génère tes landing pages par IA, accepte le paiement à la livraison. Tu paies seulement quand tu vends — pas d'abonnement.",
    url: 'https://flexiopage.com',
    locale: 'fr_FR',
    alternateLocale: ['ar_MA', 'ar_TN', 'ar_DZ', 'fr_SN', 'fr_CI'],
    images: [
      // /opengraph-image generates a proper 1200×630 social card at build time.
      // Falling back to the brand icon if the dynamic image fails to render.
      { url: '/opengraph-image', width: 1200, height: 630, alt: 'FlexioPage — Crée ta boutique en un clic' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FlexioPage — Crée ta boutique en un clic',
    description:
      'Crée ta boutique, génère tes landing pages par IA, accepte le paiement à la livraison.',
    images: ['/opengraph-image'],
  },
  manifest: '/manifest.webmanifest',
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#f97316',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={inter.className} suppressHydrationWarning>
        {children}
        {/* Platform-wide chatbot — auto-hides on storefront routes where each
            store renders its own scoped widget. */}
        <PlatformChatBot />
      </body>
    </html>
  );
}
