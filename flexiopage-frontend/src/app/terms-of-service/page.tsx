import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Conditions d’utilisation',
  description:
    "Conditions générales d'utilisation de FlexioPage : compte, services, paiements, contenu, intégrations (Messenger, paiement, livraison), responsabilités et résiliation.",
  alternates: { canonical: '/terms-of-service' },
};

const UPDATED = '20 mai 2026';
const CONTACT_EMAIL = 'support@flexiopage.com';

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← FlexioPage</Link>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Conditions d’utilisation</h1>
      <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : {UPDATED}</p>

      <div className="prose prose-sm mt-8 max-w-none space-y-8 text-foreground/90">
        <Section title="1. Acceptation des conditions">
          <p>
            En créant un compte ou en utilisant FlexioPage (« le Service »), tu acceptes les présentes
            conditions. Si tu n’es pas d’accord, n’utilise pas le Service.
          </p>
        </Section>

        <Section title="2. Description du service">
          <p>
            FlexioPage est une plateforme permettant de créer des boutiques et des pages de vente,
            de gérer un catalogue, d’accepter le paiement à la livraison (COD) ou en ligne, de
            dispatcher les commandes vers des transporteurs et, en option, d’automatiser la relation
            client via un chatbot connecté à une page Facebook Messenger ou à un numéro WhatsApp.
          </p>
        </Section>

        <Section title="3. Compte">
          <ul className="list-disc space-y-1 pl-5">
            <li>Tu dois fournir des informations exactes et garder ton mot de passe confidentiel.</li>
            <li>Tu es responsable de toute activité réalisée depuis ton compte.</li>
            <li>Tu dois avoir l’âge légal et la capacité d’exercer une activité commerciale.</li>
          </ul>
        </Section>

        <Section title="4. Utilisation acceptable">
          <p>Tu t’engages à ne pas utiliser le Service pour :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>vendre des produits illégaux, contrefaits, dangereux ou interdits ;</li>
            <li>tromper les clients (faux prix, fausses promotions, faux avis) ;</li>
            <li>envoyer du spam ou enfreindre les règles de Meta/Facebook ;</li>
            <li>porter atteinte aux droits d’autrui ou à la sécurité de la plateforme.</li>
          </ul>
        </Section>

        <Section title="5. Contenu du vendeur">
          <p>
            Tu restes propriétaire du contenu que tu publies (textes, images, produits). Tu nous accordes
            une licence limitée pour l’héberger et l’afficher afin de fournir le Service. Tu es seul
            responsable de la conformité de ton contenu et de tes ventes (TVA, droit de la consommation,
            mentions légales propres à ton activité).
          </p>
        </Section>

        <Section title="6. Commandes, paiements et livraison">
          <ul className="list-disc space-y-1 pl-5">
            <li>FlexioPage facilite la prise de commande mais n’est pas partie au contrat de vente entre toi et ton client.</li>
            <li>Les paiements en ligne sont traités par des prestataires tiers (CinetPay, Flutterwave) selon leurs propres conditions.</li>
            <li>La livraison peut être assurée via des transporteurs tiers (ex. MogaDelivery). Les délais et frais dépendent d’eux.</li>
            <li>La gestion des litiges, retours et remboursements relève de ta relation avec ton client.</li>
          </ul>
        </Section>

        <Section title="7. Messenger / WhatsApp Bot & IA">
          <p>
            Les modules Messenger Bot et WhatsApp Bot utilisent l’IA (Claude d’Anthropic) pour répondre à
            tes clients. Les réponses sont générées automatiquement : tu restes responsable de la
            supervision, des prix et des informations communiquées. Tu dois respecter les Politiques des
            plateformes Meta (Facebook, Messenger et WhatsApp Business) lorsque tu connectes une page ou un
            numéro.
          </p>
        </Section>

        <Section title="8. Tarifs">
          <p>
            Certaines fonctionnalités sont payantes (selon le plan ou la consommation). Les conditions
            tarifaires en vigueur sont présentées dans le tableau de bord avant tout engagement.
          </p>
        </Section>

        <Section title="9. Disponibilité & responsabilité">
          <p>
            Le Service est fourni « en l’état ». Nous faisons de notre mieux pour assurer sa disponibilité
            mais ne garantissons pas une absence totale d’interruption. Dans la limite permise par la loi,
            FlexioPage ne saurait être tenu responsable des pertes indirectes liées à l’utilisation du Service.
          </p>
        </Section>

        <Section title="10. Suspension & résiliation">
          <p>
            Nous pouvons suspendre ou clôturer un compte en cas de non-respect des présentes conditions.
            Tu peux fermer ton compte à tout moment ; voir notre{' '}
            <Link href="/privacy-policy" className="font-medium underline underline-offset-4">politique de confidentialité</Link>{' '}
            pour la suppression des données.
          </p>
        </Section>

        <Section title="11. Modifications">
          <p>
            Nous pouvons faire évoluer ces conditions. La date de « dernière mise à jour » indique la
            version en vigueur ; l’usage continu du Service vaut acceptation.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            Une question sur ces conditions ?{' '}
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
