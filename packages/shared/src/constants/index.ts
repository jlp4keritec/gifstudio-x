export const APP_NAME = 'GifStudio-X';

export const UPLOAD_CONSTRAINTS = {
  maxSizeMb: 500,
  acceptedMimes: ['video/mp4', 'video/quicktime', 'video/webm'] as const,
  acceptedExtensions: ['.mp4', '.mov', '.webm'] as const,
} as const;

export const GIF_CONSTRAINTS = {
  minDurationSeconds: 3,
  maxDurationSeconds: 10,
  resolutions: [240, 360, 480, 720] as const,
  fpsOptions: [10, 15, 24, 30] as const,
} as const;

export const AVAILABLE_FONTS = [
  'Arial',
  'Impact',
  'Roboto',
  'Courier New',
] as const;

export const AVAILABLE_FILTERS = [
  { id: 'none', label: 'Normal' },
  { id: 'bw', label: 'Noir & Blanc' },
  { id: 'sepia', label: 'Sépia' },
] as const;

export const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;

export const CROP_PRESETS = [
  { id: 'free', label: 'Libre', ratio: null },
  { id: '1:1', label: '1:1 (carré)', ratio: 1 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16 (vertical)', ratio: 9 / 16 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
] as const;

export const PASSWORD_RULES = {
  minLength: 8,
  requireUppercase: true,
  requireNumber: true,
} as const;

export const THEME_NAMES = ['dark', 'medium', 'light'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];
