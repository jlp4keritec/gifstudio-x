'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { Box, Paper } from '@mui/material';
import type { EditorTextOverlay, EditorCrop } from '@gifstudio-x/shared';
import { useEditor } from '@/lib/editor-context';
import { AnimatedGif } from './AnimatedGif';

interface EditorCanvasProps {
  gifUrl: string;
  width: number;
  height: number;
}

export function EditorCanvas({ gifUrl }: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, selectedTextId, selectText, updateText, setCrop, activeTool } = useEditor();

  return (
    <Box
      sx={{
        flexGrow: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3,
        minHeight: 400,
      }}
    >
      <Paper
        ref={containerRef}
        elevation={2}
        sx={{
          position: 'relative',
          maxWidth: '100%',
          maxHeight: '100%',
          display: 'inline-block',
          bgcolor: 'black',
          overflow: 'hidden',
        }}
      >
        <AnimatedGif
          src={gifUrl}
          speed={state.speed}
          filter={state.filter}
          onClick={() => selectText(null)}
        />

        {state.texts.map((text) => (
          <DraggableText
            key={text.id}
            text={text}
            containerRef={containerRef}
            isSelected={selectedTextId === text.id}
            onSelect={() => selectText(text.id)}
            onMove={(x, y) => updateText(text.id, { xPercent: x, yPercent: y })}
          />
        ))}

        {state.crop && activeTool === 'crop' && (
          <CropOverlay crop={state.crop} onChange={setCrop} containerRef={containerRef} />
        )}

        {state.speed !== 1 && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              bgcolor: 'rgba(0,0,0,0.7)',
              color: 'white',
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              fontSize: 12,
              fontWeight: 600,
              pointerEvents: 'none',
            }}
          >
            Vitesse x{state.speed}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

// ============================================================================
// Texte draggable (inchangé)
// ============================================================================

interface DraggableTextProps {
  text: EditorTextOverlay;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (xPercent: number, yPercent: number) => void;
}

function DraggableText({ text, containerRef, isSelected, onSelect, onMove }: DraggableTextProps) {
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; initialX: number; initialY: number } | null>(
    null,
  );

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onSelect();
    const container = containerRef.current;
    if (!container) return;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: text.xPercent,
      initialY: text.yPercent,
    };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragStartRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - dragStartRef.current.x) / rect.width) * 100;
    const dyPct = ((e.clientY - dragStartRef.current.y) / rect.height) * 100;
    const newX = Math.max(0, Math.min(100, dragStartRef.current.initialX + dxPct));
    const newY = Math.max(0, Math.min(100, dragStartRef.current.initialY + dyPct));
    onMove(newX, newY);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    dragStartRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <Box
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      sx={{
        position: 'absolute',
        left: `${text.xPercent}%`,
        top: `${text.yPercent}%`,
        transform: 'translate(-50%, -50%)',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
        color: text.color,
        fontFamily: `"${text.fontFamily}", sans-serif`,
        fontSize: `${text.fontSizePercent}cqw`,
        fontWeight: 700,
        lineHeight: 1.1,
        whiteSpace: 'nowrap',
        textShadow: text.hasOutline
          ? '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000'
          : 'none',
        outline: isSelected ? '2px dashed rgba(33, 150, 243, 0.8)' : 'none',
        outlineOffset: 4,
        padding: '2px 4px',
      }}
    >
      {text.text || ' '}
    </Box>
  );
}

// ============================================================================
// Overlay crop (inchangé)
// ============================================================================

interface CropOverlayProps {
  crop: EditorCrop;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onChange: (crop: EditorCrop) => void;
}

function CropOverlay({ crop }: CropOverlayProps) {
  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `
            linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.5) ${crop.x}%, transparent ${crop.x}%, transparent ${crop.x + crop.width}%, rgba(0,0,0,0.5) ${crop.x + crop.width}%),
            linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.5) ${crop.y}%, transparent ${crop.y}%, transparent ${crop.y + crop.height}%, rgba(0,0,0,0.5) ${crop.y + crop.height}%)
          `,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          left: `${crop.x}%`,
          top: `${crop.y}%`,
          width: `${crop.width}%`,
          height: `${crop.height}%`,
          border: '2px solid #2196F3',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.5)',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
