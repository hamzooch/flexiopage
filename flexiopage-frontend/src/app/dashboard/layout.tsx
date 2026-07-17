'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { AuthGuard } from '@/components/dashboard/auth-guard';
import { EmailVerificationBanner } from '@/components/dashboard/email-verification-banner';
import { PushRegistration } from '@/components/push-registration';
import { isRtl, useLangStore } from '@/lib/i18n';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const lang = useLangStore((s) => s.lang);
  const searchParams = useSearchParams();
  // Mode « iframe embed » : le hub unifié affiche certaines sous-pages CRUD
  // (collections, coupons, paniers) dans une modale plein-écran via iframe.
  // Dans ce mode on retire la sidebar + header du dashboard pour ne montrer
  // que le contenu utile, sinon le vendeur voit deux fois le chrome.
  const embed = searchParams?.get('embed') === '1';

  // Drive <html lang> and <html dir> from the seller's language preference.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = isRtl(lang) ? 'rtl' : 'ltr';
  }, [lang]);

  if (embed) {
    return (
      <AuthGuard>
        <main className="min-h-screen bg-background p-3 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <PushRegistration />
      <div className="flex min-h-screen bg-background">
        <Sidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
          <EmailVerificationBanner />
          <main className="flex-1 p-3 sm:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
