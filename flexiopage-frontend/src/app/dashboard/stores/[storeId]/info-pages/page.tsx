import { redirect } from 'next/navigation';

/**
 * Ancienne page /info-pages — consolidée dans le hub unifié
 * `/dashboard/stores/[storeId]` (block « Pages d'information »).
 * Ce fichier redirige les vendeurs qui ont l'ancienne URL bookmarkée.
 */
export default async function InfoPagesRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/dashboard/stores/${storeId}?block=info-pages`);
}
