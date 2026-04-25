'use client';

import { useState, type FormEvent } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Alert,
  Typography,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import type { User } from '@gifstudio-x/shared';
import { usersService } from '@/lib/users-service';
import { ApiError } from '@/lib/api-client';

interface ResetPasswordModalProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onDone: () => void;
}

export function ResetPasswordModal({ open, user, onClose, onDone }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    if (submitting) return;
    setPassword('');
    setError(null);
    setShowPassword(false);
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError(null);
    setSubmitting(true);
    try {
      await usersService.update(user.id, { resetPassword: password });
      onDone();
      handleClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Erreur inattendue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {user && (
              <Typography variant="body2" color="text.secondary">
                Pour l&apos;utilisateur : <strong>{user.email}</strong>
              </Typography>
            )}

            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Nouveau mot de passe"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              helperText="Minimum 8 caractères, une majuscule et un chiffre. L'utilisateur devra le changer à sa prochaine connexion."
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword((s) => !s)} edge="end">
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="warning"
            disabled={submitting || !password}
            startIcon={submitting ? <CircularProgress size={18} /> : null}
          >
            {submitting ? 'En cours...' : 'Réinitialiser'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
