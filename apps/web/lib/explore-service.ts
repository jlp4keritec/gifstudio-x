import type { Category, ExploreFilters, ExploreResponse, PublicGif } from '@gifstudio-x/shared';
import { apiFetch } from './api-client';

export const exploreService = {
  async categories(): Promise<Category[]> {
    const { categories } = await apiFetch<{ categories: Category[] }>('/categories');
    return categories;
  },

  async explore(filters: ExploreFilters = {}): Promise<ExploreResponse> {
    const params = new URLSearchParams();
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.categorySlug) params.set('categorySlug', filters.categorySlug);
    if (filters.search) params.set('search', filters.search);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
    return apiFetch<ExploreResponse>(`/explore?${params.toString()}`);
  },

  async getBySlug(slug: string): Promise<PublicGif> {
    const { gif } = await apiFetch<{ gif: PublicGif }>(`/g/${slug}`);
    return gif;
  },
};
