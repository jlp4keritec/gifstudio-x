'use client';

import Link from 'next/link';
import {
  Container,
  Card,
  CardContent,
  Typography,
  Stack,
  Box,
  Avatar,
  Chip,
  Divider,
  Button,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  moderator: 'Modérateur',
  user: 'Utilisateur',
};

const ROLE_COLORS: Record<string, 'error' | 'warning' | 'default'> = {
  admin: 'error',
  moderator: 'warning',
  user: 'default',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Jamais';
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  if (!user) return null;

  const initials = user.email.slice(0, 2).toUpperCase();

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Stack spacing={3}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Mon profil
        </Typography>

        <Card>
          <CardContent sx={{ p: 4 }}>
            <Stack spacing={3} alignItems="center" textAlign="center">
              <Avatar sx={{ width: 80, height: 80, bgcolor: 'primary.main', fontSize: '2rem' }}>
                {initials}
              </Avatar>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {user.email}
                </Typography>
                <Chip
                  label={ROLE_LABELS[user.role] ?? user.role}
                  size="small"
                  color={ROLE_COLORS[user.role] ?? 'default'}
                  sx={{ mt: 1 }}
                />
              </Box>
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Identifiant
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {user.id.slice(0, 8)}...
                </Typography>
              </Stack>

              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Créé le
                </Typography>
                <Typography variant="body2">{formatDate(user.createdAt)}</Typography>
              </Stack>

              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Dernière connexion
                </Typography>
                <Typography variant="body2">{formatDate(user.lastLoginAt ?? null)}</Typography>
              </Stack>

              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Statut
                </Typography>
                <Chip
                  label={user.isActive ? 'Actif' : 'Désactivé'}
                  size="small"
                  color={user.isActive ? 'success' : 'default'}
                  variant="outlined"
                />
              </Stack>
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Stack spacing={1.5}>
              <Button
                component={Link}
                href="/change-password"
                variant="outlined"
                startIcon={<LockResetIcon />}
                fullWidth
              >
                Changer mon mot de passe
              </Button>
              <Button
                onClick={handleLogout}
                variant="text"
                color="error"
                startIcon={<LogoutIcon />}
                fullWidth
              >
                Se déconnecter
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
