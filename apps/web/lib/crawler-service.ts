import type {
  CrawlerSource,
  CrawlerResult,
  CrawlerAdapterInfo,
  CrawlerAdapter,
  CrawlerResultStatus,
} from '@gifstudio-x/shared';
import { apiFetch, API_BASE_URL } from './api-client';

export interface CreateSourceInput {
  name: string;
  adapter: CrawlerAdapter;
  config: Record<string, unknown>;
  cronExpression: string;
  enabled?: boolean;
  maxResultsPerRun?: number;
}

export type UpdateSourceInput = Partial<CreateSourceInput>;

export interface ListResultsFilters {
  status?: CrawlerResultStatus;
  sourceId?: string;
  search?: string;
  offset?: number;
  limit?: number;
}

export const crawlerService = {
  async listAdapters(): Promise<CrawlerAdapterInfo[]> {
    const data = await apiFetch<{ adapters: CrawlerAdapterInfo[] }>(
      '/admin/crawler/adapters',
    );
    return data.adapters;
  },

  async listSources(): Promise<CrawlerSource[]> {
    const data = await apiFetch<{ items: CrawlerSource[] }>(
      '/admin/crawler/sources',
    );
    return data.items;
  },

  async createSource(input: CreateSourceInput): Promise<CrawlerSource> {
    const data = await apiFetch<{ source: CrawlerSource }>(
      '/admin/crawler/sources',
      { method: 'POST', json: input },
    );
    return data.source;
  },

  async updateSource(id: string, patch: UpdateSourceInput): Promise<CrawlerSource> {
    const data = await apiFetch<{ source: CrawlerSource }>(
      `/admin/crawler/sources/${id}`,
      { method: 'PATCH', json: patch },
    );
    return data.source;
  },

  async deleteSource(id: string): Promise<void> {
    await apiFetch<{ deleted: boolean }>(`/admin/crawler/sources/${id}`, {
      method: 'DELETE',
    });
  },

  async triggerRun(id: string): Promise<{ jobId: string | null }> {
    return apiFetch<{ enqueued: boolean; jobId: string | null }>(
      `/admin/crawler/sources/${id}/run`,
      { method: 'POST' },
    );
  },

  async listResults(filters: ListResultsFilters = {}): Promise<{
    items: CrawlerResult[];
    total: number;
    offset: number;
    limit: number;
  }> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    });
    const qs = params.toString();
    return apiFetch<{
      items: CrawlerResult[];
      total: number;
      offset: number;
      limit: number;
    }>(`/admin/crawler/results${qs ? `?${qs}` : ''}`);
  },

  async approveResult(id: string): Promise<CrawlerResult> {
    const data = await apiFetch<{ result: CrawlerResult }>(
      `/admin/crawler/results/${id}/approve`,
      { method: 'POST' },
    );
    return data.result;
  },

  async rejectResult(id: string): Promise<CrawlerResult> {
    const data = await apiFetch<{ result: CrawlerResult }>(
      `/admin/crawler/results/${id}/reject`,
      { method: 'POST' },
    );
    return data.result;
  },

  async reopenResult(id: string): Promise<CrawlerResult> {
    const data = await apiFetch<{ result: CrawlerResult }>(
      `/admin/crawler/results/${id}/reopen`,
      { method: 'POST' },
    );
    return data.result;
  },

  async deleteResult(id: string): Promise<void> {
    await apiFetch<{ deleted: boolean }>(`/admin/crawler/results/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * URL proxy pour la thumbnail d'un CrawlerResult.
   * Le backend telecharge l'image distante (avec Referer/UA appropries)
   * et la stream au navigateur, contournant les blocages hotlink.
   */
  thumbnailUrl(resultId: string): string {
    return `${API_BASE_URL}/admin/crawler/results/${resultId}/thumbnail`;
  },
};
