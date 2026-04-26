export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const WATERMARK_POSITIONS: readonly WatermarkPosition[] = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
] as const;

export type WatermarkMode = 'text' | 'image' | 'text_and_image';

export interface WatermarkTextStyle {
  /** Texte a afficher */
  text: string;
  /** Famille de police (Arial, Impact, Roboto, Courier New) */
  fontFamily: string;
  /** Taille en pourcentage de la largeur du GIF (1-30) */
  fontSizePercent: number;
  /** Couleur hex (ex: #ffffff) */
  color: string;
  /** Opacite 0-1 */
  opacity: number;
  /** Active une ombre noire derriere le texte */
  hasShadow: boolean;
}

/**
 * Config d'un watermark complete : texte + logo, position, marge.
 * Persistee dans user_settings.data.watermark
 */
export interface WatermarkConfig {
  /** Active : si false, le watermark n'est pas applique (meme si configure) */
  enabled: boolean;
  mode: WatermarkMode;
  position: WatermarkPosition;
  /** Marge en pixels par rapport au bord choisi par 'position' */
  marginPx: number;
  /** Style du texte (utilise si mode=text|text_and_image) */
  text: WatermarkTextStyle;
  /**
   * Image stockee cote serveur. Le client recoit l'URL via /api/v1/settings/watermark/logo.
   * Cote frontend on garde le flag hasLogo, et la presence reelle est verifiee par l'API.
   */
  hasLogo: boolean;
  /** Largeur du logo en pourcentage de la largeur du GIF (5-50). Defaut: 15%. */
  logoWidthPercent: number;
  /** Opacite du logo 0-1 */
  logoOpacity: number;
}

export const AVAILABLE_WATERMARK_FONTS = [
  'Arial',
  'Impact',
  'Roboto',
  'Courier New',
] as const;

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  enabled: false,
  mode: 'text',
  position: 'bottom-right',
  marginPx: 16,
  text: {
    text: '@gifstudio-x',
    fontFamily: 'Impact',
    fontSizePercent: 5,
    color: '#ffffff',
    opacity: 0.85,
    hasShadow: true,
  },
  hasLogo: false,
  logoWidthPercent: 15,
  logoOpacity: 0.9,
};

export interface UserSettings {
  watermark: WatermarkConfig;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  watermark: DEFAULT_WATERMARK_CONFIG,
};
