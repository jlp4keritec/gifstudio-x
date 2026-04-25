import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'GifStudio-X',
    template: '%s — GifStudio-X',
  },
  description: 'Instance privée',
  applicationName: 'GifStudio-X',
  robots: 'noindex, nofollow, noarchive, nosnippet',
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
