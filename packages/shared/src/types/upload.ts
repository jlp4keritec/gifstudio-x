export interface UploadedVideo {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
  uploadedAt: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}
