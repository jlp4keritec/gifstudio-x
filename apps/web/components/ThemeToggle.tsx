'use client';

import { IconButton, Tooltip } from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import { useAppTheme } from '@/lib/theme-context';

const ICONS = {
  dark: <DarkModeIcon />,
  medium: <Brightness4Icon />,
  light: <LightModeIcon />,
} as const;

const LABELS = {
  dark: 'Thème sombre (cliquer pour passer à medium)',
  medium: 'Thème medium (cliquer pour passer à clair)',
  light: 'Thème clair (cliquer pour passer à sombre)',
} as const;

export function ThemeToggle() {
  const { themeName, cycleTheme } = useAppTheme();

  return (
    <Tooltip title={LABELS[themeName]}>
      <IconButton
        onClick={cycleTheme}
        color="inherit"
        aria-label={`Changer de thème (actuel: ${themeName})`}
      >
        {ICONS[themeName]}
      </IconButton>
    </Tooltip>
  );
}
