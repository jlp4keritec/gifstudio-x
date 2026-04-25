'use client';

import { useEffect } from 'react';

export interface KeyboardShortcut {
  /** Touche à écouter (event.key). Ex: ' ', 'i', 'o', 'ArrowLeft'. Non sensible à la casse. */
  key: string;
  /** Fonction exécutée quand la touche est pressée */
  handler: (event: KeyboardEvent) => void;
  /** Si true (défaut), empêche le comportement natif du navigateur */
  preventDefault?: boolean;
  /** Si true (défaut), ignore l'événement si le focus est dans un input/textarea */
  ignoreWhenTyping?: boolean;
}

/**
 * Détecte si l'utilisateur est en train de taper dans un champ éditable.
 * On ne veut pas intercepter les raccourcis dans ce cas.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      for (const shortcut of shortcuts) {
        const match = event.key.toLowerCase() === shortcut.key.toLowerCase();
        if (!match) continue;

        const ignoreWhenTyping = shortcut.ignoreWhenTyping ?? true;
        if (ignoreWhenTyping && isTyping(event.target)) continue;

        const preventDefault = shortcut.preventDefault ?? true;
        if (preventDefault) event.preventDefault();

        shortcut.handler(event);
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
}
