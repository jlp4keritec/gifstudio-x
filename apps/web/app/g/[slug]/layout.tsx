import type { Metadata } from 'next';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

async function fetchGifMeta(slug: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4003/api/v1';
  try {
    // On utilise embed=1 pour ne PAS incrémenter les vues lors du scraping social
    const response = await fetch(`${apiUrl}/g/${slug}?embed=1`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.gif ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { slug } = await params;
  const gif = await fetchGifMeta(slug);

  if (!gif) {
    return {
      title: 'GIF introuvable — GifStudio-X',
    };
  }

  const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4003/api/v1').replace(
    /\/api\/v1\/?$/,
    '',
  );
  const imageUrl = `${apiOrigin}${gif.filePath}`;
  const description = gif.description || `GIF partagé sur GifStudio-X — ${gif.title}`;

  return {
    title: `${gif.title} — GifStudio-X`,
    description,
    openGraph: {
      title: gif.title,
      description,
      type: 'video.other',
      images: [
        {
          url: imageUrl,
          width: gif.width,
          height: gif.height,
          alt: gif.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: gif.title,
      description,
      images: [imageUrl],
    },
  };
}

export default function GifSlugLayout({ children }: LayoutProps) {
  return <>{children}</>;
}
