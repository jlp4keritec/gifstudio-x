'use client';

import { Box, Stack, Typography, Button, Chip, Link } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { type ReactNode } from 'react';

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  visibleCount: number;
  /** True quand toutes les lignes du tableau filtre sont selectionnees (incluant les pages non visibles) */
  allFilteredSelected: boolean;
  onSelectAllFiltered?: () => void;
  onClear: () => void;
  /** Boutons d'action a afficher (Approuver, Rejeter, Supprimer...) */
  actions: ReactNode;
}

/**
 * Barre sticky qui s'affiche en haut du tableau quand au moins 1 element est selectionne.
 *
 * Affichage :
 * - "12 selectionnees" + croix pour tout deselectionner
 * - Si toutes les lignes visibles sont cochees ET total > visible : lien "Selectionner les N resultats"
 * - Si selectAllFiltered actif : "Toutes les N selectionnees" + lien pour restreindre a la page
 * - Boutons d'action a droite
 */
export function BulkActionBar({
  selectedCount,
  totalCount,
  visibleCount,
  allFilteredSelected,
  onSelectAllFiltered,
  onClear,
  actions,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  const allVisibleSelected = selectedCount >= visibleCount && !allFilteredSelected;
  const showSelectAllOption =
    allVisibleSelected &&
    totalCount > visibleCount &&
    onSelectAllFiltered !== undefined;

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        px: 2,
        py: 1.25,
        borderRadius: 1,
        boxShadow: 2,
        mb: 1,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={2}>
        <Chip
          label={
            allFilteredSelected
              ? `Tous les ${totalCount} resultats selectionnes`
              : `${selectedCount} selectionne${selectedCount > 1 ? 's' : ''}`
          }
          size="small"
          sx={{
            bgcolor: 'rgba(255,255,255,0.2)',
            color: 'inherit',
            fontWeight: 600,
          }}
          onDelete={onClear}
          deleteIcon={<CloseIcon style={{ color: 'inherit' }} />}
        />

        {showSelectAllOption && (
          <Link
            component="button"
            onClick={onSelectAllFiltered}
            sx={{
              color: 'inherit',
              textDecoration: 'underline',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Selectionner les {totalCount} resultats
          </Link>
        )}

        {allFilteredSelected && (
          <Link
            component="button"
            onClick={onClear}
            sx={{
              color: 'inherit',
              textDecoration: 'underline',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Effacer la selection
          </Link>
        )}

        <Box sx={{ flexGrow: 1 }} />

        <Stack direction="row" spacing={1}>
          {actions}
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * Bouton d'action a placer dans le slot `actions` de BulkActionBar.
 * Style coherent avec la barre primaire (texte/icone clairs).
 */
export function BulkActionButton({
  onClick,
  disabled,
  startIcon,
  children,
  color = 'inherit',
}: {
  onClick: () => void;
  disabled?: boolean;
  startIcon?: ReactNode;
  children: ReactNode;
  color?: 'inherit' | 'warning' | 'error' | 'success';
}) {
  // On passe en variant outlined avec couleur custom adaptee au fond bleu
  const colorMap: Record<string, { bg: string; hover: string }> = {
    inherit: { bg: 'rgba(255,255,255,0.12)', hover: 'rgba(255,255,255,0.20)' },
    success: { bg: 'rgba(76,175,80,0.85)', hover: 'rgba(76,175,80,1)' },
    warning: { bg: 'rgba(255,152,0,0.85)', hover: 'rgba(255,152,0,1)' },
    error: { bg: 'rgba(244,67,54,0.85)', hover: 'rgba(244,67,54,1)' },
  };
  const c = colorMap[color] ?? colorMap.inherit;

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      size="small"
      startIcon={startIcon}
      sx={{
        color: 'white',
        bgcolor: c.bg,
        textTransform: 'none',
        fontWeight: 600,
        '&:hover': { bgcolor: c.hover },
        '&.Mui-disabled': { color: 'rgba(255,255,255,0.5)', bgcolor: 'rgba(255,255,255,0.1)' },
      }}
    >
      {children}
    </Button>
  );
}
