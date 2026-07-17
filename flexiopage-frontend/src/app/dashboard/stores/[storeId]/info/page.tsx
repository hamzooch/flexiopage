import { redirect } from 'next/navigation';

/**
 * Ancienne page /info — consolidée dans le hub unifié
 * `/dashboard/stores/[storeId]` (block « Identité »).
 * Ce fichier redirige les vendeurs qui ont l'ancienne URL bookmarkée.
 */
export default async function InfoRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/dashboard/stores/${storeId}?block=identity`);
}
