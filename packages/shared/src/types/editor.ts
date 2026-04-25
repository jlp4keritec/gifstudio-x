export type FilterType = 'none' | 'bw' | 'sepia';

export type CropRatio = 'free' | '1:1' | '16:9' | '9:16' | '4:3';

export type TextFontFamily = 'Arial' | 'Impact' | 'Roboto' | 'Courier New';

export interface EditorTextOverlay {
  id: string;
  text: string;
  /** Position en % de la largeur du canvas (0-100) */
  xPercent: number;
  /** Position en % de la hauteur du canvas (0-100) */
  yPercent: number;
  /** Taille de police en % de la largeur du canvas (utile pour responsive) */
  fontSizePercent: number;
  fontFamily: TextFontFamily;
  color: string;
  hasOutline: boolean;
}

export interface EditorCrop {
  /** Ratio sélectionné */
  ratio: CropRatio;
  /** Rectangle en % du canvas (0-100) */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorState {
  filter: FilterType;
  speed: number; // 0.5, 1, 1.5, 2
  texts: EditorTextOverlay[];
  crop: EditorCrop | null;
}

export const DEFAULT_EDITOR_STATE: EditorState = {
  filter: 'none',
  speed: 1,
  texts: [],
  crop: null,
};
