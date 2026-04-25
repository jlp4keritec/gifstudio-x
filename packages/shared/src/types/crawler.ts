export type CrawlerAdapter =
  | 'reddit'
  | 'redgifs'
  | 'rule34'
  | 'e621'
  | 'generic_html';

export type CrawlerRunStatus = 'pending' | 'running' | 'success' | 'failed';

export type CrawlerResultStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'imported'
  | 'import_failed';

export interface CrawlerSource {
  id: string;
  name: string;
  adapter: CrawlerAdapter;
  config: Record<string, unknown>;
  cronExpression: string;
  enabled: boolean;
  maxResultsPerRun: number;
  lastRunAt: string | null;
  lastRunStatus: CrawlerRunStatus | null;
  lastRunMessage: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrawlerResult {
  id: string;
  crawlerSourceId: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  externalId: string | null;
  metadata: unknown;
  status: CrawlerResultStatus;
  rejectedAt: string | null;
  importedVideoAssetId: string | null;
  importErrorMessage: string | null;
  discoveredAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  crawlerSource?: {
    name: string;
    adapter: CrawlerAdapter;
  } | null;
}

export interface CrawlerAdapterInfo {
  name: CrawlerAdapter;
  implemented: boolean;
}
