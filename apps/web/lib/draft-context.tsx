'use client';

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import type { UploadedVideo } from '@gifstudio-x/shared';

interface GifDraft {
  sourceVideo: UploadedVideo;
  trim?: { start: number; end: number };
  gifBlob?: Blob;
  gifSettings?: { width: number; fps: number };
}

interface DraftContextValue {
  draft: GifDraft | null;
  setSourceVideo: (video: UploadedVideo) => void;
  setTrim: (trim: { start: number; end: number }) => void;
  setGifResult: (blob: Blob, settings: { width: number; fps: number }) => void;
  /**
   * Vide uniquement le resultat GIF + le trim, mais garde la video source
   * et permet de relancer une generation a partir de la meme video.
   * Utilise par le bouton "Refaire".
   */
  clearGifResult: () => void;
  clear: () => void;
}

const DraftContext = createContext<DraftContextValue | undefined>(undefined);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<GifDraft | null>(null);

  const setSourceVideo = useCallback((video: UploadedVideo) => {
    setDraft({ sourceVideo: video });
  }, []);

  const setTrim = useCallback((trim: { start: number; end: number }) => {
    setDraft((prev) => (prev ? { ...prev, trim } : prev));
  }, []);

  const setGifResult = useCallback(
    (blob: Blob, settings: { width: number; fps: number }) => {
      setDraft((prev) => (prev ? { ...prev, gifBlob: blob, gifSettings: settings } : prev));
    },
    [],
  );

  const clearGifResult = useCallback(() => {
    setDraft((prev) => {
      if (!prev) return prev;
      // On garde uniquement la sourceVideo, on retire trim/gifBlob/gifSettings
      return { sourceVideo: prev.sourceVideo };
    });
  }, []);

  const clear = useCallback(() => setDraft(null), []);

  const value = useMemo(
    () => ({ draft, setSourceVideo, setTrim, setGifResult, clearGifResult, clear }),
    [draft, setSourceVideo, setTrim, setGifResult, clearGifResult, clear],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useDraft must be used within DraftProvider');
  return ctx;
}
