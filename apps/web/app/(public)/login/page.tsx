'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Stack,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { APP_NAME } from '@gifstudio-x/shared';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(identifier, password);
      router.replace(user.mustChangePassword ? '/change-password' : '/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Une erreur inattendue est survenue');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card sx={{ width: '100%', maxWidth: 420 }} elevation={4}>
      <CardContent sx={{ p: 4 }}>
        <Stack spacing={3} alignItems="center" textAlign="center">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: 'primary.main',
            }}
          >
            <MovieFilterIcon fontSize="large" />
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
              {APP_NAME}
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary">
            Connectez-vous pour accéder à l&apos;outil
          </Typography>

          {error && (
            <Alert severity="error" sx={{ width: '100%' }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
            <Stack spacing={2}>
              <TextField
                label="Identifiant ou email"
                type="text"
                fullWidth
                required
                autoFocus
                autoComplete="username"
                placeholder="admin"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={submitting}
                helperText='Ex : "admin" ou "admin@gifstudio.local"'
              />

              <TextField
                label="Mot de passe"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((s) => !s)}
                        edge="end"
                        aria-label="toggle password visibility"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={submitting || !identifier || !password}
                startIcon={submitting ? <CircularProgress size={20} /> : null}
              >
                {submitting ? 'Connexion...' : 'Se connecter'}
              </Button>
            </Stack>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Outil interne — Comptes créés par l&apos;administrateur
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
