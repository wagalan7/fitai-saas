import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import SentryInit from '@/components/SentryInit';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FitAI — Seu personal trainer, nutricionista e coach de IA',
  description: 'Treinos personalizados, dietas e acompanhamento inteligente com IA.',
  manifest: '/manifest.json',
  applicationName: 'FitAI',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FitAI',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#D4AF37',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <SentryInit />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
