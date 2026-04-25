'use client';

import { useEffect, useState, use } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import type { PublicGif } from '@gifstudio-x/shared';
import { exploreService } from '@/lib/explore-service';
import { getStorageUrl } from '@/lib/upload-service';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function EmbedPage({ params }: PageProps) {
  const { slug } = use(params);
  const [gif, setGif] = useState<PublicGif | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    exploreService
      .getBySlug(slug)
      .then(setGif)
      .catch((err) => setError(err.message ?? 'Erreur'))
      .finally(() => setLoading(false));
  }, [slug]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const detailUrl = gif ? `${origin}/g/${gif.slug}` : '#';

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: 'black',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {loading && <CircularProgress sx={{ color: 'white' }} />}

      {error && (
        <Alert severity="error" sx={{ maxWidth: 400 }}>
          {error}
        </Alert>
      )}

      {gif && !loading && (
        <>
          <Box
            sx={{
              flexGrow: 1,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 0,
              minHeight: 0,
            }}
          >
            <Box
              component="img"
              src={getStorageUrl(gif.filePath)}
              alt={gif.title}
              sx={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          </Box>

          {/* Footer discret avec branding + lien vers la page détail */}
          <Box
            component="a"
            href={detailUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.5,
              py: 0.5,
              bgcolor: 'rgba(0,0,0,0.7)',
              color: 'white',
              borderRadius: 1,
              textDecoration: 'none',
              fontSize: 11,
              fontWeight: 600,
              opacity: 0.8,
              transition: 'opacity 0.2s',
              '&:hover': { opacity: 1 },
            }}
          >
            <MovieFilterIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              GifStudio
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}
