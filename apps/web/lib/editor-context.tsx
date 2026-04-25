'use client';

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import type {
  EditorState,
  EditorTextOverlay,
  FilterType,
  EditorCrop,
} from '@gifstudio-x/shared';
import { DEFAULT_EDITOR_STATE } from '@gifstudio-x/shared';

type ToolType = 'text' | 'crop' | 'filter' | 'speed';

interface EditorContextValue {
  state: EditorState;
  activeTool: ToolType | null;
  selectedTextId: string | null;

  setActiveTool: (tool: ToolType | null) => void;
  setFilter: (filter: FilterType) => void;
  setSpeed: (speed: number) => void;

  addText: () => string;
  updateText: (id: string, patch: Partial<EditorTextOverlay>) => void;
  removeText: (id: string) => void;
  selectText: (id: string | null) => void;

  setCrop: (crop: EditorCrop | null) => void;

  reset: () => void;
}

const EditorContext = createContext<EditorContextValue | undefined>(undefined);

let textIdCounter = 0;

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>(DEFAULT_EDITOR_STATE);
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  const setFilter = useCallback((filter: FilterType) => {
    setState((prev) => ({ ...prev, filter }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, speed }));
  }, []);

  const addText = useCallback((): string => {
    const id = `text-${Date.now()}-${textIdCounter++}`;
    const newText: EditorTextOverlay = {
      id,
      text: 'Votre texte',
      xPercent: 50,
      yPercent: 50,
      fontSizePercent: 8,
      fontFamily: 'Impact',
      color: '#ffffff',
      hasOutline: true,
    };
    setState((prev) => ({ ...prev, texts: [...prev.texts, newText] }));
    setSelectedTextId(id);
    return id;
  }, []);

  const updateText = useCallback((id: string, patch: Partial<EditorTextOverlay>) => {
    setState((prev) => ({
      ...prev,
      texts: prev.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const removeText = useCallback((id: string) => {
    setState((prev) => ({ ...prev, texts: prev.texts.filter((t) => t.id !== id) }));
    setSelectedTextId((prev) => (prev === id ? null : prev));
  }, []);

  const setCrop = useCallback((crop: EditorCrop | null) => {
    setState((prev) => ({ ...prev, crop }));
  }, []);

  const reset = useCallback(() => {
    setState(DEFAULT_EDITOR_STATE);
    setActiveTool(null);
    setSelectedTextId(null);
  }, []);

  const value = useMemo<EditorContextValue>(
    () => ({
      state,
      activeTool,
      selectedTextId,
      setActiveTool,
      setFilter,
      setSpeed,
      addText,
      updateText,
      removeText,
      selectText: setSelectedTextId,
      setCrop,
      reset,
    }),
    [
      state,
      activeTool,
      selectedTextId,
      setFilter,
      setSpeed,
      addText,
      updateText,
      removeText,
      setCrop,
      reset,
    ],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}

export type { ToolType };
