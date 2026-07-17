import { redirect } from 'next/navigation';

/**
 * Ancienne page /delivery — consolidée dans le hub unifié
 * `/dashboard/stores/[storeId]` (block « Livraison »).
 * Ce fichier redirige les vendeurs qui ont l'ancienne URL bookmarkée.
 */
export default async function DeliveryRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/dashboard/stores/${storeId}?block=delivery`);
}
