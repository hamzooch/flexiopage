import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    "Politique de confidentialité de FlexioPage : données collectées, usage, intégrations (Facebook Messenger, IA, paiement, livraison), conservation et droits des utilisateurs.",
  alternates: { canonical: '/privacy-policy' },
};

const UPDATED = '20 mai 2026';
const CONTACT_EMAIL = 'support@flexiopage.com';

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← FlexioPage</Link>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Politique de confidentialité</h1>
      <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : {UPDATED}</p>

      <div className="prose prose-sm mt-8 max-w-none space-y-8 text-foreground/90">
        <Section title="1. Qui sommes-nous">
          <p>
            FlexioPage est une plateforme de création de boutiques en ligne et de pages de vente,
            avec paiement à la livraison (COD), destinée aux vendeurs en Afrique. Cette politique
            explique quelles données nous collectons, pourquoi, et comment nous les protégeons.
          </p>
        </Section>

        <Section title="2. Données que nous collectons">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Compte vendeur</strong> : nom, e-mail, mot de passe (chiffré), pays, devise.</li>
            <li><strong>Boutiques & produits</strong> : contenu que tu crées (pages, produits, prix, images).</li>
            <li><strong>Commandes & clients</strong> : nom, téléphone, adresse de livraison, e-mail, détails de commande.</li>
            <li><strong>Données d'usage</strong> : statistiques de visite anonymisées de tes vitrines (pour ton tableau de bord).</li>
            <li>
              <strong>Données Facebook / Messenger</strong> (si tu connectes le module Messenger Bot) :
              identifiant de ta Page, jeton d'accès à la Page (stocké <em>chiffré</em>), et les messages
              échangés entre tes clients et le bot (contenu, identifiant anonyme du client « PSID »,
              nom et photo de profil publics fournis par Meta).
            </li>
          </ul>
        </Section>

        <Section title="3. Comment nous utilisons ces données">
          <ul className="list-disc space-y-1 pl-5">
            <li>Fournir le service : héberger ta boutique, traiter les commandes, afficher tes statistiques.</li>
            <li>
              Faire fonctionner le <strong>Messenger Bot</strong> : répondre automatiquement à tes clients,
              collecter les informations de commande et créer la commande dans ton tableau de bord.
            </li>
            <li>Sécurité, prévention de la fraude et support.</li>
          </ul>
          <p>Nous ne vendons jamais tes données ni celles de tes clients.</p>
        </Section>

        <Section title="4. Prestataires & intégrations">
          <p>Pour fournir certaines fonctionnalités, nous partageons le strict nécessaire avec :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Meta (Facebook/Messenger)</strong> — réception et envoi des messages de ta Page.</li>
            <li><strong>Anthropic (Claude)</strong> — génération des réponses du chatbot. Les messages sont traités pour produire une réponse ; ils ne servent pas à entraîner les modèles.</li>
            <li><strong>Prestataires de paiement</strong> (CinetPay, Flutterwave) — traitement des paiements en ligne.</li>
            <li><strong>Transporteurs / logistique</strong> (ex. MogaDelivery) — livraison des commandes.</li>
            <li><strong>Hébergement & infrastructure</strong> — stockage sécurisé des données.</li>
          </ul>
        </Section>

        <Section title="5. Conservation des données">
          <p>
            Nous conservons les données aussi longtemps que ton compte est actif ou que nécessaire pour
            fournir le service. Les statistiques anonymes de vitrine expirent automatiquement après 180 jours.
            Tu peux demander la suppression de ton compte et des données associées à tout moment.
          </p>
        </Section>

        <Section title="6. Sécurité">
          <p>
            Les mots de passe et les jetons d'accès aux Pages Facebook sont chiffrés. Les échanges avec les
            webhooks sont vérifiés par signature. L'accès aux données est restreint et authentifié.
          </p>
        </Section>

        <Section title="7. Tes droits">
          <p>
            Tu peux accéder à tes données, les corriger, les exporter ou en demander la suppression.
            Pour exercer ces droits — ou pour qu'un client demande la suppression de ses données collectées
            via Messenger — écris-nous à{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline underline-offset-4">{CONTACT_EMAIL}</a>.
          </p>
          <p>
            <strong>Suppression des données Messenger</strong> : à ta demande ou à celle d'un client, nous
            supprimons les conversations et messages associés à un identifiant Page/PSID donné.
          </p>
        </Section>

        <Section title="8. Modifications">
          <p>
            Nous pouvons mettre à jour cette politique. La date de « dernière mise à jour » en haut de page
            reflète la version en vigueur.
          </p>
        </Section>

        <Section title="9. Contact">
          <p>
            Pour toute question relative à la confidentialité :{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline underline-offset-4">{CONTACT_EMAIL}</a>.
          </p>
        </Section>
      </div>

      <div className="mt-12 border-t border-border/60 pt-6 text-sm text-muted-foreground">
        © {new Date().getFullYear()} FlexioPage. Tous droits réservés.
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
      <div className="mt-2 space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}
