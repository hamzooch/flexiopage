import { redirect } from 'next/navigation';

/**
 * Ancienne page /sections — consolidée dans le hub unifié
 * `/dashboard/stores/[storeId]` (blocks « Announce », « Navbar », « Hero »,
 * « Slider », « Grille produits », « Témoignages », « Section order »,
 * « Footer », « WhatsApp »). Ce fichier redirige les vendeurs qui ont
 * l'ancienne URL bookmarkée. On atterrit sur « Section order » qui est
 * le point d'entrée naturel pour re-arranger sa page d'accueil.
 */
export default async function SectionsRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/dashboard/stores/${storeId}?block=section-order`);
}
