import type { Metadata } from 'next';

interface LayoutProps {
  children: React.ReactNode;
}

export const metadata: Metadata = {
  title: 'GIF embed — GifStudio-X',
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: LayoutProps) {
  return <>{children}</>;
}
