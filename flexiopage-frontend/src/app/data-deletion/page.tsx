import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Suppression des données',
  description:
    "Comment demander la suppression de tes données FlexioPage / Messenger, et comment Meta déclenche automatiquement la suppression quand tu retires l'application.",
  alternates: { canonical: '/data-deletion' },
};

const CONTACT_EMAIL = 'support@flexiopage.com';

export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← FlexioPage</Link>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Suppression des données</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Cette page explique comment supprimer les données associées à ton utilisation de FlexioPage et du
        chatbot Messenger.
      </p>

      <div className="prose prose-sm mt-8 max-w-none space-y-8 text-foreground/90">
        <Section title="Suppression automatique via Facebook">
          <p>
            Si tu as interagi avec une boutique via notre chatbot Messenger, tu peux demander la suppression
            de tes données directement depuis Facebook :
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Ouvre <strong>Facebook → Paramètres et confidentialité → Paramètres</strong>.</li>
            <li>Va dans <strong>Applications et sites web</strong>.</li>
            <li>Sélectionne <strong>FlexioPage</strong> puis <strong>Supprimer</strong>.</li>
          </ol>
          <p>
            Facebook nous envoie alors automatiquement une demande de suppression. Nous supprimons tes
            conversations et messages, et anonymisons les commandes associées (les commandes sont conservées
            pour des obligations comptables, mais sans aucune donnée personnelle). Un <strong>code de
            confirmation</strong> et une <strong>page de statut</strong> sont générés pour suivre l'avancement.
          </p>
        </Section>

        <Section title="Suppression sur demande (e-mail)">
          <p>
            Tu peux aussi nous écrire directement. Envoie un e-mail à{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline underline-offset-4">{CONTACT_EMAIL}</a>{' '}
            avec pour objet <strong>« Suppression de données »</strong> en précisant :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>le nom de la page / boutique concernée ;</li>
            <li>ton identifiant Messenger ou le numéro de téléphone utilisé lors de la commande.</li>
          </ul>
          <p>Nous traitons toute demande sous <strong>30 jours maximum</strong>.</p>
        </Section>

        <Section title="Ce qui est supprimé">
          <ul className="list-disc space-y-1 pl-5">
            <li>Toutes les <strong>conversations</strong> et <strong>messages</strong> échangés avec le bot.</li>
            <li>Les <strong>données personnelles</strong> (nom, téléphone, adresse) des commandes associées sont anonymisées.</li>
          </ul>
        </Section>

        <Section title="En savoir plus">
          <p>
            Consulte notre{' '}
            <Link href="/privacy-policy" className="font-medium underline underline-offset-4">politique de confidentialité</Link>{' '}
            et nos{' '}
            <Link href="/terms-of-service" className="font-medium underline underline-offset-4">conditions d'utilisation</Link>.
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
