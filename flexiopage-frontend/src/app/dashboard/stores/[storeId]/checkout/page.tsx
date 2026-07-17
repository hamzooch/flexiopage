import { redirect } from 'next/navigation';

/**
 * Ancienne page /checkout — consolidée dans le hub unifié
 * `/dashboard/stores/[storeId]` (block « Formulaire COD »).
 * Ce fichier redirige les vendeurs qui ont l'ancienne URL bookmarkée.
 */
export default async function CheckoutRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/dashboard/stores/${storeId}?block=cod`);
}
