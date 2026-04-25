'use client';

import {
  Box,
  Stack,
  TextField,
  MenuItem,
  Typography,
  Slider,
  Button,
  IconButton,
  FormControlLabel,
  Checkbox,
  Divider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import type { TextFontFamily } from '@gifstudio-x/shared';
import { AVAILABLE_FONTS } from '@gifstudio-x/shared';
import { useEditor } from '@/lib/editor-context';

const COLORS = ['#ffffff', '#000000', '#ff0000', '#ffeb3b', '#4caf50', '#2196f3', '#ff9800', '#e91e63'];

export function TextPanel() {
  const { state, selectedTextId, updateText, removeText, addText, selectText } = useEditor();
  const selectedText = state.texts.find((t) => t.id === selectedTextId);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Textes
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => addText()}>
          Ajouter
        </Button>
      </Stack>

      {/* Liste des textes */}
      {state.texts.length > 0 && (
        <Stack spacing={0.5}>
          {state.texts.map((t) => (
            <Stack
              key={t.id}
              direction="row"
              alignItems="center"
              spacing={1}
              onClick={() => selectText(t.id)}
              sx={{
                p: 1,
                borderRadius: 1,
                cursor: 'pointer',
                bgcolor: selectedTextId === t.id ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Typography variant="body2" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                {t.text || '(vide)'}
              </Typography>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  removeText(t.id);
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}

      {state.texts.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          Aucun texte. Cliquez sur &quot;Ajouter&quot; pour commencer.
        </Typography>
      )}

      {selectedText && (
        <>
          <Divider />
          <Typography variant="overline" color="text.secondary">
            Édition du texte sélectionné
          </Typography>

          <TextField
            label="Texte"
            size="small"
            fullWidth
            multiline
            maxRows={3}
            value={selectedText.text}
            onChange={(e) => updateText(selectedText.id, { text: e.target.value })}
          />

          <TextField
            select
            label="Police"
            size="small"
            fullWidth
            value={selectedText.fontFamily}
            onChange={(e) =>
              updateText(selectedText.id, { fontFamily: e.target.value as TextFontFamily })
            }
          >
            {AVAILABLE_FONTS.map((f) => (
              <MenuItem key={f} value={f} sx={{ fontFamily: `"${f}", sans-serif` }}>
                {f}
              </MenuItem>
            ))}
          </TextField>

          <Box>
            <Typography variant="caption" color="text.secondary">
              Taille : {selectedText.fontSizePercent.toFixed(1)}%
            </Typography>
            <Slider
              value={selectedText.fontSizePercent}
              min={2}
              max={20}
              step={0.5}
              onChange={(_, v) => updateText(selectedText.id, { fontSizePercent: v as number })}
              size="small"
            />
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Couleur
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {COLORS.map((color) => (
                <Box
                  key={color}
                  onClick={() => updateText(selectedText.id, { color })}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    bgcolor: color,
                    cursor: 'pointer',
                    border: 2,
                    borderColor: selectedText.color === color ? 'primary.main' : 'divider',
                  }}
                />
              ))}
            </Stack>
          </Box>

          <FormControlLabel
            control={
              <Checkbox
                checked={selectedText.hasOutline}
                onChange={(e) => updateText(selectedText.id, { hasOutline: e.target.checked })}
                size="small"
              />
            }
            label={<Typography variant="body2">Contour noir</Typography>}
          />
        </>
      )}
    </Stack>
  );
}
