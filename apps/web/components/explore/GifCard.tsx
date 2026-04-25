'use client';

import Link from 'next/link';
import {
  Card,
  CardActionArea,
  CardMedia,
  CardContent,
  Typography,
  Stack,
  Chip,
  Box,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import type { PublicGif } from '@gifstudio-x/shared';
import { getStorageUrl } from '@/lib/upload-service';

interface GifCardProps {
  gif: PublicGif;
}

function formatViews(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function GifCard({ gif }: GifCardProps) {
  return (
    <Card sx={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardActionArea
        component={Link}
        href={`/g/${gif.slug}`}
        sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
      >
        <Box sx={{ position: 'relative' }}>
          <CardMedia
            component="img"
            image={getStorageUrl(gif.filePath)}
            alt={gif.title}
            sx={{
              aspectRatio: '1 / 1',
              objectFit: 'cover',
              bgcolor: 'black',
            }}
          />
          {gif.views > 0 && (
            <Chip
              icon={<VisibilityIcon sx={{ fontSize: 14 }} />}
              label={formatViews(gif.views)}
              size="small"
              sx={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                bgcolor: 'rgba(0,0,0,0.7)',
                color: 'white',
                fontSize: 11,
                height: 22,
                '& .MuiChip-icon': { color: 'white', ml: 0.5 },
              }}
            />
          )}
        </Box>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, flexGrow: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
            {gif.title}
          </Typography>
          {gif.categories.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
              {gif.categories.slice(0, 2).map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 10 }}
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
