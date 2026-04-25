'use client';

import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Box, Typography, Button, Stack, Paper } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { UPLOAD_CONSTRAINTS } from '@gifstudio-x/shared';

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

const ACCEPT_ATTR = UPLOAD_CONSTRAINTS.acceptedExtensions.join(',');

export function UploadDropzone({ onFileSelected, disabled = false }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    // Reset pour permettre de re-sélectionner le même fichier
    e.target.value = '';
  }

  function openFileDialog() {
    if (!disabled) inputRef.current?.click();
  }

  return (
    <Paper
      variant="outlined"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={openFileDialog}
      sx={{
        p: 6,
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderStyle: 'dashed',
        borderWidth: 2,
        borderColor: isDragging ? 'primary.main' : 'divider',
        backgroundColor: isDragging ? 'action.hover' : 'transparent',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s ease',
        '&:hover': disabled
          ? {}
          : {
              borderColor: 'primary.main',
              backgroundColor: 'action.hover',
            },
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        onChange={handleInputChange}
        disabled={disabled}
        style={{ display: 'none' }}
      />

      <Stack spacing={2} alignItems="center">
        <CloudUploadIcon sx={{ fontSize: 64, color: isDragging ? 'primary.main' : 'text.secondary' }} />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {isDragging ? 'Déposez votre vidéo ici' : 'Glissez votre vidéo ici'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            ou cliquez pour parcourir vos fichiers
          </Typography>
        </Box>
        <Button variant="outlined" disabled={disabled}>
          Sélectionner un fichier
        </Button>
        <Typography variant="caption" color="text.secondary">
          Formats acceptés : MP4, MOV, WebM — Taille max : {UPLOAD_CONSTRAINTS.maxSizeMb} Mo
        </Typography>
      </Stack>
    </Paper>
  );
}
