import { redirect } from 'next/navigation';

/**
 * Ancienne page /newsletter — consolidée dans le hub unifié
 * `/dashboard/stores/[storeId]` (block « Newsletter & popup »).
 * Ce fichier redirige les vendeurs qui ont l'ancienne URL bookmarkée.
 */
export default async function NewsletterRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/dashboard/stores/${storeId}?block=newsletter`);
}
