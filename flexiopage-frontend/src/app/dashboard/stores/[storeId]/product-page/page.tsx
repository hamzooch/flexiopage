import { redirect } from 'next/navigation';

/**
 * Ancienne page /product-page — consolidée dans le hub unifié
 * `/dashboard/stores/[storeId]` (block « Page produit »).
 * Ce fichier redirige les vendeurs qui ont l'ancienne URL bookmarkée.
 */
export default async function ProductPageRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/dashboard/stores/${storeId}?block=product-page`);
}
