import { redirect } from 'next/navigation';

/**
 * Ancienne page /appearance — consolidée dans le hub unifié
 * `/dashboard/stores/[storeId]` (blocks « Thème » + « Logo & favicon »).
 * Ce fichier redirige les vendeurs qui ont l'ancienne URL bookmarkée.
 */
export default async function AppearanceRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/dashboard/stores/${storeId}?block=theme`);
}
