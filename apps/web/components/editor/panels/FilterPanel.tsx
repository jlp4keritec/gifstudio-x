'use client';

import { Stack, Typography, Card, CardActionArea, CardContent, Box } from '@mui/material';
import type { FilterType } from '@gifstudio-x/shared';
import { AVAILABLE_FILTERS } from '@gifstudio-x/shared';
import { useEditor } from '@/lib/editor-context';

const FILTER_CSS_PREVIEW: Record<FilterType, string> = {
  none: 'none',
  bw: 'grayscale(1)',
  sepia: 'sepia(1)',
};

export function FilterPanel({ gifUrl }: { gifUrl: string }) {
  const { state, setFilter } = useEditor();

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Filtres
      </Typography>

      <Stack spacing={1}>
        {AVAILABLE_FILTERS.map((f) => (
          <Card
            key={f.id}
            variant="outlined"
            sx={{
              borderColor: state.filter === f.id ? 'primary.main' : 'divider',
              borderWidth: state.filter === f.id ? 2 : 1,
            }}
          >
            <CardActionArea onClick={() => setFilter(f.id as FilterType)}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box
                    component="img"
                    src={gifUrl}
                    sx={{
                      width: 48,
                      height: 48,
                      objectFit: 'cover',
                      borderRadius: 1,
                      filter: FILTER_CSS_PREVIEW[f.id as FilterType],
                    }}
                  />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {f.label}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
