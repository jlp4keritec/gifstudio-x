'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Container,
  Box,
  Typography,
  Stack,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Chip,
  Alert,
  CircularProgress,
  Button,
  Pagination,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import type { Category, PublicGif } from '@gifstudio-x/shared';
import { exploreService } from '@/lib/explore-service';
import { GifCard } from '@/components/explore/GifCard';
import { PublicTopbar } from '@/components/PublicTopbar';

export default function ExplorePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [gifs, setGifs] = useState<PublicGif[]>([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<'trending' | 'recent'>('trending');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Charger les catégories une fois
  useEffect(() => {
    exploreService.categories().then(setCategories).catch(console.error);
  }, []);

  // Débounce recherche
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadGifs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await exploreService.explore({
        sort,
        categorySlug: categorySlug ?? undefined,
        search: search || undefined,
        page,
        pageSize,
      });
      setGifs(response.gifs);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [sort, categorySlug, search, page]);

  useEffect(() => {
    loadGifs();
  }, [loadGifs]);

  const emptyMessage = useMemo(() => {
    if (search) return `Aucun GIF trouvé pour "${search}"`;
    if (categorySlug) {
      const cat = categories.find((c) => c.slug === categorySlug);
      return `Aucun GIF dans la catégorie "${cat?.name ?? categorySlug}"`;
    }
    return 'Aucun GIF public pour le moment';
  }, [search, categorySlug, categories]);

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <PublicTopbar />

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Explorer
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Parcourez les GIFs partagés par la communauté
            </Typography>
          </Box>

          <TextField
            placeholder="Rechercher un GIF par titre, description ou tag..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            fullWidth
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />

          <Tabs
            value={sort}
            onChange={(_, v) => {
              setSort(v);
              setPage(1);
            }}
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab
              icon={<WhatshotIcon />}
              iconPosition="start"
              label="Populaires"
              value="trending"
            />
            <Tab
              icon={<AccessTimeIcon />}
              iconPosition="start"
              label="Récents"
              value="recent"
            />
          </Tabs>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              label="Toutes"
              onClick={() => {
                setCategorySlug(null);
                setPage(1);
              }}
              color={categorySlug === null ? 'primary' : 'default'}
              variant={categorySlug === null ? 'filled' : 'outlined'}
            />
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                onClick={() => {
                  setCategorySlug(categorySlug === c.slug ? null : c.slug);
                  setPage(1);
                }}
                color={categorySlug === c.slug ? 'primary' : 'default'}
                variant={categorySlug === c.slug ? 'filled' : 'outlined'}
              />
            ))}
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : gifs.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography variant="h6" color="text.secondary">
                {emptyMessage}
              </Typography>
              {(search || categorySlug) && (
                <Button
                  sx={{ mt: 2 }}
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                    setCategorySlug(null);
                    setPage(1);
                  }}
                >
                  Réinitialiser les filtres
                </Button>
              )}
            </Box>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary">
                {total} GIF{total > 1 ? 's' : ''} trouvé{total > 1 ? 's' : ''}
              </Typography>

              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: {
                    xs: 'repeat(2, 1fr)',
                    sm: 'repeat(3, 1fr)',
                    md: 'repeat(4, 1fr)',
                    lg: 'repeat(5, 1fr)',
                  },
                }}
              >
                {gifs.map((gif) => (
                  <GifCard key={gif.id} gif={gif} />
                ))}
              </Box>

              {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2 }}>
                  <Pagination
                    count={totalPages}
                    page={page}
                    onChange={(_, p) => {
                      setPage(p);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    color="primary"
                  />
                </Box>
              )}
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
