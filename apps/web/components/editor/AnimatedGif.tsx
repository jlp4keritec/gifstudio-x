'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { parseGIF, decompressFrames, type ParsedFrame } from 'gifuct-js';
import { Box, CircularProgress } from '@mui/material';
import type { FilterType } from '@gifstudio-x/shared';

const FILTER_CSS: Record<FilterType, string> = {
  none: 'none',
  bw: 'grayscale(1)',
  sepia: 'sepia(1)',
};

interface AnimatedGifProps {
  src: string;
  speed: number;
  filter: FilterType;
  onLoad?: (dimensions: { width: number; height: number }) => void;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export interface AnimatedGifHandle {
  getCanvas: () => HTMLCanvasElement | null;
}

export const AnimatedGif = forwardRef<AnimatedGifHandle, AnimatedGifProps>(function AnimatedGif(
  { src, speed, filter, onLoad, onClick, style, className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ParsedFrame[]>([]);
  const frameIndexRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const speedRef = useRef(speed);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
  }));

  // Maintient la dernière valeur de speed sans re-décoder
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Décodage du GIF
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const response = await fetch(src);
        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        const gif = parseGIF(buffer);
        const frames = decompressFrames(gif, true);

        if (cancelled) return;

        if (frames.length === 0) {
          console.error('GIF sans frames');
          setLoading(false);
          return;
        }

        const width = gif.lsd.width;
        const height = gif.lsd.height;

        framesRef.current = frames;
        frameIndexRef.current = 0;
        setDimensions({ width, height });
        onLoad?.({ width, height });

        // Canvas offscreen pour composer les frames (gère les modes disposal)
        const offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        offscreenRef.current = offscreen;

        setLoading(false);
        lastFrameTimeRef.current = performance.now();

        // Démarre la boucle d'animation
        startAnimationLoop();
      } catch (err) {
        console.error('Erreur décodage GIF:', err);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function startAnimationLoop() {
    const loop = (now: number) => {
      const frames = framesRef.current;
      const canvas = canvasRef.current;
      const offscreen = offscreenRef.current;

      if (!frames.length || !canvas || !offscreen) {
        animationFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      const currentFrame = frames[frameIndexRef.current];
      // delay est en 1/100 secondes. Plancher à 20ms pour éviter 0 sur certains GIFs
      const delayMs = Math.max(20, currentFrame.delay);
      const adjustedDelay = delayMs / Math.max(0.1, speedRef.current);

      if (now - lastFrameTimeRef.current >= adjustedDelay) {
        renderFrame(canvas, offscreen, frames, frameIndexRef.current);
        frameIndexRef.current = (frameIndexRef.current + 1) % frames.length;
        lastFrameTimeRef.current = now;
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
  }

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-block',
        lineHeight: 0,
        ...style,
      }}
      className={className}
      onClick={onClick}
    >
      {loading && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(0,0,0,0.5)',
            zIndex: 1,
          }}
        >
          <CircularProgress size={32} />
        </Box>
      )}
      <canvas
        ref={canvasRef}
        width={dimensions.width || 1}
        height={dimensions.height || 1}
        style={{
          display: 'block',
          maxWidth: '100%',
          maxHeight: '60vh',
          width: 'auto',
          height: 'auto',
          filter: FILTER_CSS[filter],
        }}
      />
    </Box>
  );
});

/**
 * Rend une frame GIF sur le canvas principal en gérant les modes disposal
 * (composition progressive des frames).
 */
function renderFrame(
  canvas: HTMLCanvasElement,
  offscreen: HTMLCanvasElement,
  frames: ParsedFrame[],
  frameIndex: number,
): void {
  const ctx = canvas.getContext('2d');
  const offCtx = offscreen.getContext('2d');
  if (!ctx || !offCtx) return;

  const frame = frames[frameIndex];

  // Si c'est la première frame ou qu'on revient au début, on efface tout
  if (frameIndex === 0) {
    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
  }

  // Disposal mode 2 = restore to background (frame précédente) avant de dessiner
  if (frameIndex > 0) {
    const prevFrame = frames[frameIndex - 1];
    if (prevFrame.disposalType === 2) {
      const { left, top, width, height } = prevFrame.dims;
      offCtx.clearRect(left, top, width, height);
    }
  }

  // Dessiner la frame courante sur l'offscreen
  const imageData = new ImageData(
    new Uint8ClampedArray(frame.patch),
    frame.dims.width,
    frame.dims.height,
  );

  // On crée un canvas temporaire pour le patch (ImageData doit correspondre aux dims du patch)
  const temp = document.createElement('canvas');
  temp.width = frame.dims.width;
  temp.height = frame.dims.height;
  const tempCtx = temp.getContext('2d');
  if (!tempCtx) return;
  tempCtx.putImageData(imageData, 0, 0);

  offCtx.drawImage(temp, frame.dims.left, frame.dims.top);

  // Copier le résultat sur le canvas principal
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(offscreen, 0, 0);
}
