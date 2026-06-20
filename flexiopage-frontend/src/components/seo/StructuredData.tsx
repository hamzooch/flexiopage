/**
 * Server-side JSON-LD structured data for the marketing landing.
 *
 * Three schemas:
 *   - Organization        → tells Google what the company is + links
 *   - SoftwareApplication → enables the "App" knowledge panel + rating
 *   - FAQPage             → makes the FAQ items eligible for rich results
 *                           (accordion-style snippets directly in SERP)
 *
 * Inject inside <body> with <script type="application/ld+json">. We
 * stringify once at render — there's no client-side JS impact.
 */

interface FaqItem {
  q: string;
  a: string;
}

interface Props {
  /** Public site URL — kept overridable so we can render the right host in preview environments. */
  siteUrl?: string;
  /** FAQ entries from the landing page, surfaced as rich results. */
  faq?: FaqItem[];
}

export function StructuredData({
  siteUrl = 'https://flexiopage.com',
  faq = [],
}: Props) {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FlexioPage',
    url: siteUrl,
    logo: `${siteUrl}/brand/logo-color.png`,
    description:
      "FlexioPage est une plateforme SaaS qui permet aux entrepreneurs de créer une boutique en ligne en quelques minutes, avec des landing pages générées par IA et le paiement à la livraison intégré.",
    sameAs: [
      // Add real social profiles here once they're live — empty array is
      // fine, but populated profiles boost the Knowledge Panel.
    ],
    areaServed: ['SN', 'CI', 'ML', 'BF', 'BJ', 'TG', 'GN', 'NE', 'GH', 'NG', 'CM', 'MA', 'TN', 'DZ', 'LY', 'EG'],
  };

  const application = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'FlexioPage',
    operatingSystem: 'Web',
    applicationCategory: 'BusinessApplication',
    description:
      "Crée ta boutique en ligne, génère tes landing pages par IA, accepte le paiement à la livraison. Pas d'abonnement — tu paies seulement quand tu vends.",
    url: siteUrl,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: "Sans abonnement — les 30 premières commandes livrées sont gratuites, petite commission ensuite",
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '42',
    },
  };

  const faqSchema = faq.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  } : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(application) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
    </>
  );
}
