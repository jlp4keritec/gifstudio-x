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
  Container,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';

function passwordStrength(password: string): { score: number; label: string; color: 'error' | 'warning' | 'success' } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score: (score / 5) * 100, label: 'Faible', color: 'error' };
  if (score <= 3) return { score: (score / 5) * 100, label: 'Moyen', color: 'warning' };
  return { score: (score / 5) * 100, label: 'Fort', color: 'success' };
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isForced = user?.mustChangePassword ?? false;
  const strength = passwordStrength(newPassword);
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const canSubmit =
    !!currentPassword &&
    newPassword.length >= 8 &&
    /[A-Z]/.test(newPassword) &&
    /\d/.test(newPassword) &&
    passwordsMatch;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setTimeout(() => router.replace('/dashboard'), 1200);
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
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Card elevation={isForced ? 4 : 1}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Stack direction="row" spacing={2} alignItems="center">
              <LockResetIcon fontSize="large" color="primary" />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {isForced ? 'Définissez votre mot de passe' : 'Changer mon mot de passe'}
                </Typography>
                {isForced && (
                  <Typography variant="body2" color="text.secondary">
                    Première connexion : veuillez choisir un nouveau mot de passe pour continuer.
                  </Typography>
                )}
              </Box>
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}
            {success && <Alert severity="success">Mot de passe modifié avec succès. Redirection...</Alert>}

            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={2.5}>
                <TextField
                  label={isForced ? 'Mot de passe actuel (temporaire)' : 'Mot de passe actuel'}
                  type="password"
                  fullWidth
                  required
                  autoFocus
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={submitting}
                />

                <Box>
                  <TextField
                    label="Nouveau mot de passe"
                    type="password"
                    fullWidth
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={submitting}
                    helperText="Minimum 8 caractères, une majuscule et un chiffre"
                  />
                  {newPassword && (
                    <Box sx={{ mt: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={strength.score}
                        color={strength.color}
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                      <Typography
                        variant="caption"
                        color={`${strength.color}.main`}
                        sx={{ display: 'block', mt: 0.5 }}
                      >
                        Robustesse : {strength.label}
                      </Typography>
                    </Box>
                  )}
                </Box>

                <TextField
                  label="Confirmez le nouveau mot de passe"
                  type="password"
                  fullWidth
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                  error={confirmPassword.length > 0 && !passwordsMatch}
                  helperText={
                    confirmPassword.length > 0 && !passwordsMatch
                      ? 'Les mots de passe ne correspondent pas'
                      : ''
                  }
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={!canSubmit || submitting}
                  startIcon={submitting ? <CircularProgress size={20} /> : null}
                >
                  {submitting ? 'Enregistrement...' : 'Enregistrer le nouveau mot de passe'}
                </Button>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
