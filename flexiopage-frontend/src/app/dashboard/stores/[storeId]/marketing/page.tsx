import { redirect } from 'next/navigation';

/**
 * Ancienne page /marketing — consolidée dans le hub unifié
 * `/dashboard/stores/[storeId]` (block « Marketing & pixels »).
 * Ce fichier redirige les vendeurs qui ont l'ancienne URL bookmarkée.
 */
export default async function MarketingRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/dashboard/stores/${storeId}?block=marketing`);
}
