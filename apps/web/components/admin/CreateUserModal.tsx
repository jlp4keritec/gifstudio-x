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
  MenuItem,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import type { UserRole } from '@gifstudio-x/shared';
import { usersService } from '@/lib/users-service';
import { ApiError } from '@/lib/api-client';

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'user', label: 'Utilisateur' },
  { value: 'moderator', label: 'Modérateur' },
  { value: 'admin', label: 'Administrateur' },
];

export function CreateUserModal({ open, onClose, onCreated }: CreateUserModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setEmail('');
    setPassword('');
    setRole('user');
    setMustChangePassword(true);
    setShowPassword(false);
    setError(null);
  }

  function handleClose() {
    if (submitting) return;
    resetForm();
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await usersService.create({ email, password, role, mustChangePassword });
      onCreated();
      resetForm();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Erreur inattendue');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Nouvel utilisateur</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Email"
              type="email"
              fullWidth
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />

            <TextField
              label="Mot de passe temporaire"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              helperText="Minimum 8 caractères, une majuscule et un chiffre"
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

            <TextField
              label="Rôle"
              select
              fullWidth
              required
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              disabled={submitting}
            >
              {ROLES.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </TextField>

            <FormControlLabel
              control={
                <Checkbox
                  checked={mustChangePassword}
                  onChange={(e) => setMustChangePassword(e.target.checked)}
                  disabled={submitting}
                />
              }
              label="Forcer le changement de mot de passe à la première connexion"
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
            disabled={submitting || !email || !password}
            startIcon={submitting ? <CircularProgress size={18} /> : null}
          >
            {submitting ? 'Création...' : 'Créer'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
