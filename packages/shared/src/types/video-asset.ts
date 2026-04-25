export type VideoAssetSource = 'url_import' | 'file_upload' | 'crawler';
export type VideoAssetStatus = 'pending' | 'downloading' | 'ready' | 'failed';

export interface VideoAssetCrawlerOrigin {
  sourceName: string;
  adapter: string;
  resultId: string;
}

export interface VideoAsset {
  id: string;
  source: VideoAssetSource;
  sourceUrl: string | null;
  originalFilename: string | null;
  localPath: string | null;
  thumbnailPath: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  status: VideoAssetStatus;
  errorMessage: string | null;
  /** Slug pour acces public au fichier. Null si jamais partage. */
  shareSlug: string | null;
  importedById: string;
  createdAt: string;
  updatedAt: string;
  downloadedAt: string | null;
  crawlerOrigin: VideoAssetCrawlerOrigin | null;
}

export type VideoAssetSort =
  | 'date_desc'
  | 'date_asc'
  | 'duration_asc'
  | 'duration_desc'
  | 'size_desc';

export interface VideoAssetFilters {
  status?: VideoAssetStatus;
  source?: VideoAssetSource;
  dateFrom?: string;
  dateTo?: string;
  durationMin?: number;
  durationMax?: number;
  minWidth?: number;
  minHeight?: number;
  search?: string;
  sort?: VideoAssetSort;
  offset?: number;
  limit?: number;
}

export interface VideoAssetListResponse {
  items: VideoAsset[];
  total: number;
  offset: number;
  limit: number;
}
