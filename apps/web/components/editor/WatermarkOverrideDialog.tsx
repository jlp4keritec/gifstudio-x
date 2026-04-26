'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import type { WatermarkConfig } from '@gifstudio-x/shared';
import { WatermarkEditor } from '@/components/settings/WatermarkEditor';

interface Props {
  open: boolean;
  initialConfig: WatermarkConfig;
  onApply: (config: WatermarkConfig) => void;
  onClose: () => void;
}

/**
 * Dialog pour editer le watermark ponctuellement (a l'export).
 * Ne sauvegarde PAS dans les settings : juste retourne la config a appliquer
 * pour cet export specifique.
 */
export function WatermarkOverrideDialog({
  open,
  initialConfig,
  onApply,
  onClose,
}: Props) {
  const [config, setConfig] = useState<WatermarkConfig>(initialConfig);

  useEffect(() => {
    if (open) setConfig(initialConfig);
  }, [open, initialConfig]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Watermark pour cet export</DialogTitle>
      <DialogContent>
        <WatermarkEditor
          config={config}
          onChange={setConfig}
          manageLogoUpload={false}
          showHeader={false}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        <Button
          variant="contained"
          onClick={() => {
            onApply(config);
            onClose();
          }}
        >
          Appliquer pour cet export
        </Button>
      </DialogActions>
    </Dialog>
  );
}
