import type {
  CollectionWithPreview,
  CreateCollectionInput,
  UpdateCollectionInput,
  Gif,
} from '@gifstudio-x/shared';
import { apiFetch } from './api-client';

interface CollectionDetail {
  collection: CollectionWithPreview;
  gifs: Array<{
    id: string;
    slug: string;
    title: string;
    thumbnailPath: string;
    filePath: string;
    width: number;
    height: number;
    views: number;
    isPublic: boolean;
    addedAt: string;
  }>;
}

export const collectionsService = {
  async list(): Promise<CollectionWithPreview[]> {
    const { collections } = await apiFetch<{ collections: CollectionWithPreview[] }>(
      '/collections',
    );
    return collections;
  },

  async get(id: string): Promise<CollectionDetail> {
    return apiFetch<CollectionDetail>(`/collections/${id}`);
  },

  async create(input: CreateCollectionInput): Promise<CollectionWithPreview> {
    const { collection } = await apiFetch<{ collection: CollectionWithPreview }>(
      '/collections',
      { method: 'POST', json: input },
    );
    return collection;
  },

  async update(id: string, input: UpdateCollectionInput): Promise<CollectionWithPreview> {
    const { collection } = await apiFetch<{ collection: CollectionWithPreview }>(
      `/collections/${id}`,
      { method: 'PATCH', json: input },
    );
    return collection;
  },

  async remove(id: string): Promise<void> {
    await apiFetch(`/collections/${id}`, { method: 'DELETE' });
  },

  async addGif(collectionId: string, gifId: string): Promise<void> {
    await apiFetch(`/collections/${collectionId}/gifs`, {
      method: 'POST',
      json: { gifId },
    });
  },

  async removeGif(collectionId: string, gifId: string): Promise<void> {
    await apiFetch(`/collections/${collectionId}/gifs/${gifId}`, {
      method: 'DELETE',
    });
  },
};

export type { Gif, CollectionDetail };
