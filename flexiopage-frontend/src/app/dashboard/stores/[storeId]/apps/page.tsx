import { redirect } from 'next/navigation';

/**
 * Ancienne page /apps — consolidée dans le hub unifié
 * `/dashboard/stores/[storeId]` (block « Apps & intégrations »).
 * Ce fichier redirige les vendeurs qui ont l'ancienne URL bookmarkée.
 */
export default async function AppsRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/dashboard/stores/${storeId}?block=apps`);
}
