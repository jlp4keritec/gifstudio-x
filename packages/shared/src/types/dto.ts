export interface SaveGifInput {
  title: string;
  description?: string;
  tags?: string[];
  isPublic: boolean;
  collectionIds: string[];
  width: number;
  height: number;
  durationMs: number;
  fps: number;
}

export interface CreateCollectionInput {
  name: string;
  description?: string;
  isPublic: boolean;
}

export interface UpdateCollectionInput {
  name?: string;
  description?: string;
  isPublic?: boolean;
}

export interface CollectionWithPreview {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  ownerId: string;
  gifCount: number;
  previewGifUrl: string | null;
  createdAt: string;
}
