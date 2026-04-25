export interface Gif {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  filePath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  fileSize: number;
  views: number;
  isPublic: boolean;
  ownerId: string;
  tags: string[];
  metadata: GifMetadata;
  createdAt: string;
}

export interface GifMetadata {
  filters?: 'none' | 'bw' | 'sepia';
  speed?: number;
  texts?: GifTextOverlay[];
  crop?: { x: number; y: number; width: number; height: number };
  sourceDuration?: number;
  trim?: { start: number; end: number };
}

export interface GifTextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  hasOutline: boolean;
}

export type GifResolution = 240 | 360 | 480 | 720;
export type GifFps = 10 | 15 | 24 | 30;
