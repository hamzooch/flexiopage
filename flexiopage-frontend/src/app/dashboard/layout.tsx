'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { AuthGuard } from '@/components/dashboard/auth-guard';
import { EmailVerificationBanner } from '@/components/dashboard/email-verification-banner';
import { isRtl, useLangStore } from '@/lib/i18n';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const lang = useLangStore((s) => s.lang);

  // Drive <html lang> and <html dir> from the seller's language preference.
  // Done at layout level so every dashboard route reflects the choice without
  // each page having to opt in.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = isRtl(lang) ? 'rtl' : 'ltr';
  }, [lang]);

  return (
    <AuthGuard>
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
