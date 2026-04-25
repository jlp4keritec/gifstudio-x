export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface PublicGif {
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
  ownerEmail: string;
  tags: string[];
  categories: Category[];
  createdAt: string;
}

export interface ExploreFilters {
  sort?: 'trending' | 'recent';
  categorySlug?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ExploreResponse {
  gifs: PublicGif[];
  total: number;
  page: number;
  pageSize: number;
}
