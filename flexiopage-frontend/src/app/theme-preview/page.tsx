'use client';

import Link from 'next/link';
import { STORE_THEME_TEMPLATES } from '@/data/store-themes';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

export default function ThemePreviewsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b py-12 px-4">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-4xl font-bold mb-3">Theme Library</h1>
          <p className="text-gray-600 text-lg">
            Browse all available themes. Click "Preview" to see a live demo with sample products.
          </p>
        </div>
      </div>

      {/* Themes Grid */}
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {STORE_THEME_TEMPLATES.map((theme) => (
            <div
              key={theme.id}
              className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
            >
              {/* Theme Preview Card */}
              <div
                className="h-40 flex items-center justify-center relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${theme.theme.primary} 0%, ${theme.theme.accent} 100%)`,
                }}
              >
                {/* Decorative pattern */}
                <div className="absolute inset-0 opacity-10">
                  <div
                    className="h-full w-full"
                    style={{
                      backgroundImage:
                        'linear-gradient(45deg, transparent 25%, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.1) 50%, transparent 50%, transparent 75%, rgba(255,255,255,0.1) 75%, rgba(255,255,255,0.1))',
                      backgroundSize: '30px 30px',
                    }}
                  />
                </div>

                {/* Theme name overlay */}
                <div
                  className="relative z-10 text-center text-white"
                  style={{
                    textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                  }}
                >
                  <h2 className="text-3xl font-bold">{theme.name}</h2>
                  <p className="text-sm opacity-90 mt-1">{theme.nicheLabel}</p>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-gray-600 text-sm mb-4">{theme.description}</p>

                {/* Theme Info */}
                <div className="space-y-2 mb-6 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Store Type:</span>
                    <span className="font-medium">
                      {theme.forStoreTypes.join(', ')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Style:</span>
                    <span className="font-medium capitalize">{theme.theme.style}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Layout:</span>
                    <span className="font-medium capitalize">
                      {theme.theme.layout.hero} hero
                    </span>
                  </div>
                </div>

                {/* Color Swatch */}
                <div className="mb-6 flex gap-2">
                  <div
                    className="h-6 w-6 rounded border border-gray-300"
                    style={{ backgroundColor: theme.theme.primary }}
                    title="Primary"
                  />
                  <div
                    className="h-6 w-6 rounded border border-gray-300"
                    style={{ backgroundColor: theme.theme.accent }}
                    title="Accent"
                  />
                  <div
                    className="h-6 w-6 rounded border border-gray-300"
                    style={{ backgroundColor: theme.theme.background }}
                    title="Background"
                  />
                  <div
                    className="h-6 w-6 rounded border border-gray-300"
                    style={{ backgroundColor: theme.theme.surface }}
                    title="Surface"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 text-sm"
                    asChild
                  >
                    <Link href={`/theme-preview/${theme.id}`}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Preview
                    </Link>
                  </Button>
                  <Button
                    className="flex-1 text-sm"
                    asChild
                  >
                    <a href="#">Create Store</a>
                  </Button>
                </div>
              </div>

              {/* Badge */}
              {theme.id === 'forge' && (
                <div className="px-6 pb-4">
                  <div className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded text-xs font-semibold">
                    ✨ NEW
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-gray-100 py-12 px-4 border-t">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-2xl font-bold mb-6">How to Use Themes</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <h3 className="font-bold mb-2">1. Preview</h3>
              <p className="text-gray-600 text-sm">
                Click "Preview" on any theme to see a live demo with sample products and all sections.
              </p>
            </div>
            <div>
              <h3 className="font-bold mb-2">2. Customize</h3>
              <p className="text-gray-600 text-sm">
                Edit colors, fonts, and sections in the theme customizer. See changes in real-time.
              </p>
            </div>
            <div>
              <h3 className="font-bold mb-2">3. Launch</h3>
              <p className="text-gray-600 text-sm">
                Create your store with the theme and start adding your real products immediately.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
