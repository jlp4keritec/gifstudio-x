'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import LockResetIcon from '@mui/icons-material/LockReset';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import SettingsIcon from '@mui/icons-material/Settings';
import { useAuth } from '@/lib/auth-context';

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

export function UserMenu() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  if (!user) return null;

  const initials = user.email.slice(0, 2).toUpperCase();
  const open = Boolean(anchorEl);

  async function handleLogout() {
    setAnchorEl(null);
    await logout();
    router.replace('/login');
  }

  function navigateTo(path: string) {
    setAnchorEl(null);
    router.push(path);
  }

  return (
    <>
      <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} aria-label="Menu utilisateur">
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.875rem' }}>
          {initials}
        </Avatar>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 240, mt: 1 } } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {user.email}
          </Typography>
          <Chip
            label={ROLE_LABELS[user.role] ?? user.role}
            size="small"
            color={ROLE_COLORS[user.role] ?? 'default'}
            sx={{ mt: 0.5 }}
          />
        </Box>

        <Divider />

        <MenuItem onClick={() => navigateTo('/profile')}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Mon profil</ListItemText>
        </MenuItem>

        <MenuItem onClick={() => navigateTo('/settings')}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Paramètres</ListItemText>
        </MenuItem>

        <MenuItem onClick={() => navigateTo('/change-password')}>
          <ListItemIcon>
            <LockResetIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Changer mon mot de passe</ListItemText>
        </MenuItem>

        {user.role === 'admin' && (
          <>
            <Divider />
            <MenuItem onClick={() => navigateTo('/admin/users')}>
              <ListItemIcon>
                <AdminPanelSettingsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Gestion des utilisateurs</ListItemText>
            </MenuItem>
          </>
        )}

        <Divider />

        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Déconnexion</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
