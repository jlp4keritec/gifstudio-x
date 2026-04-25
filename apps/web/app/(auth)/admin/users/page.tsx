'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Typography,
  Stack,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Chip,
  Alert,
  CircularProgress,
  MenuItem,
  Select,
  TextField,
  InputAdornment,
  Snackbar,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import LockResetIcon from '@mui/icons-material/LockReset';
import BlockIcon from '@mui/icons-material/Block';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { User, UserRole } from '@gifstudio-x/shared';
import { useAuth } from '@/lib/auth-context';
import { usersService } from '@/lib/users-service';
import { ApiError } from '@/lib/api-client';
import { CreateUserModal } from '@/components/admin/CreateUserModal';
import { ResetPasswordModal } from '@/components/admin/ResetPasswordModal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  moderator: 'Modérateur',
  user: 'Utilisateur',
};

const ROLE_COLORS: Record<UserRole, 'error' | 'warning' | 'default'> = {
  admin: 'error',
  moderator: 'warning',
  user: 'default',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { user: currentUser, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [confirmUser, setConfirmUser] = useState<User | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ msg: string; severity: 'success' | 'error' } | null>(
    null,
  );

  useEffect(() => {
    if (!authLoading && currentUser && currentUser.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [authLoading, currentUser, router]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await usersService.list();
      setUsers(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      loadUsers();
    }
  }, [currentUser, loadUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'inactive' && u.isActive) return false;
      if (search && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [users, roleFilter, statusFilter, search]);

  async function handleRoleChange(user: User, newRole: UserRole) {
    if (user.role === newRole) return;
    setUpdatingRoleId(user.id);
    try {
      const updated = await usersService.update(user.id, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setSnackbar({ msg: `Rôle mis à jour pour ${updated.email}`, severity: 'success' });
    } catch (err) {
      setSnackbar({
        msg: err instanceof ApiError ? err.message : 'Erreur lors de la mise à jour',
        severity: 'error',
      });
    } finally {
      setUpdatingRoleId(null);
    }
  }

  async function handleDeactivate(user: User) {
    setConfirmLoading(true);
    try {
      const updated = await usersService.deactivate(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setSnackbar({ msg: `${updated.email} désactivé`, severity: 'success' });
      setConfirmUser(null);
    } catch (err) {
      setSnackbar({
        msg: err instanceof ApiError ? err.message : 'Erreur',
        severity: 'error',
      });
    } finally {
      setConfirmLoading(false);
    }
  }

  async function handleReactivate(user: User) {
    try {
      const updated = await usersService.update(user.id, { isActive: true });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setSnackbar({ msg: `${updated.email} réactivé`, severity: 'success' });
    } catch (err) {
      setSnackbar({
        msg: err instanceof ApiError ? err.message : 'Erreur',
        severity: 'error',
      });
    }
  }

  if (authLoading || !currentUser || currentUser.role !== 'admin') {
    return (
      <Box
        sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Stack spacing={3}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Gestion des utilisateurs
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {users.length} utilisateur{users.length > 1 ? 's' : ''}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Rafraîchir">
              <IconButton onClick={loadUsers} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<PersonAddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              Nouvel utilisateur
            </Button>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <TextField
            placeholder="Rechercher par email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ minWidth: 240 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select
            label="Rôle"
            size="small"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="all">Tous les rôles</MenuItem>
            <MenuItem value="admin">Administrateurs</MenuItem>
            <MenuItem value="moderator">Modérateurs</MenuItem>
            <MenuItem value="user">Utilisateurs</MenuItem>
          </TextField>
          <TextField
            select
            label="Statut"
            size="small"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="all">Tous</MenuItem>
            <MenuItem value="active">Actifs</MenuItem>
            <MenuItem value="inactive">Désactivés</MenuItem>
          </TextField>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Rôle</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell>Dernière connexion</TableCell>
                <TableCell>Créé le</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={32} />
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    Aucun utilisateur trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((u) => {
                  const isMe = u.id === currentUser.id;
                  return (
                    <TableRow key={u.id} hover>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {u.email}
                          </Typography>
                          {isMe && (
                            <Chip label="Vous" size="small" color="primary" variant="outlined" />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={u.role}
                          size="small"
                          disabled={
                            updatingRoleId === u.id ||
                            (isMe && u.role === 'admin') ||
                            !u.isActive
                          }
                          onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                          renderValue={(value) => (
                            <Chip
                              label={ROLE_LABELS[value as UserRole]}
                              size="small"
                              color={ROLE_COLORS[value as UserRole]}
                              variant="filled"
                            />
                          )}
                          sx={{ minWidth: 170 }}
                        >
                          <MenuItem value="user">Utilisateur</MenuItem>
                          <MenuItem value="moderator">Modérateur</MenuItem>
                          <MenuItem value="admin">Administrateur</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={u.isActive ? 'Actif' : 'Désactivé'}
                          size="small"
                          color={u.isActive ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatDate(u.lastLoginAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatDate(u.createdAt)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Réinitialiser le mot de passe">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => setResetUser(u)}
                                disabled={!u.isActive}
                              >
                                <LockResetIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          {u.isActive ? (
                            <Tooltip title={isMe ? 'Vous ne pouvez pas vous désactiver' : 'Désactiver'}>
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => setConfirmUser(u)}
                                  disabled={isMe}
                                >
                                  <BlockIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Réactiver">
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => handleReactivate(u)}
                              >
                                <RestartAltIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setSnackbar({ msg: 'Utilisateur créé avec succès', severity: 'success' });
          loadUsers();
        }}
      />

      <ResetPasswordModal
        open={Boolean(resetUser)}
        user={resetUser}
        onClose={() => setResetUser(null)}
        onDone={() =>
          setSnackbar({ msg: 'Mot de passe réinitialisé', severity: 'success' })
        }
      />

      <ConfirmDialog
        open={Boolean(confirmUser)}
        title="Désactiver l'utilisateur"
        message={
          confirmUser
            ? `Êtes-vous sûr de vouloir désactiver ${confirmUser.email} ? Il ne pourra plus se connecter.`
            : ''
        }
        confirmLabel="Désactiver"
        confirmColor="error"
        loading={confirmLoading}
        onCancel={() => setConfirmUser(null)}
        onConfirm={() => confirmUser && handleDeactivate(confirmUser)}
      />

      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {snackbar ? (
          <Alert onClose={() => setSnackbar(null)} severity={snackbar.severity} variant="filled">
            {snackbar.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Container>
  );
}
