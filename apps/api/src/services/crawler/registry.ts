import type { CrawlerAdapter as CrawlerAdapterEnum } from '@prisma/client';
import type { CrawlerAdapter } from './adapter';
import { RedditAdapter } from './adapters/reddit-adapter';
import { RedgifsAdapter } from './adapters/redgifs-adapter';
import { Rule34Adapter } from './adapters/rule34-adapter';
import { E621Adapter } from './adapters/e621-adapter';

const adapters = new Map<CrawlerAdapterEnum, CrawlerAdapter>([
  ['reddit', new RedditAdapter()],
  ['redgifs', new RedgifsAdapter()],
  ['rule34', new Rule34Adapter()],
  ['e621', new E621Adapter()],
]);

export function getAdapter(name: CrawlerAdapterEnum): CrawlerAdapter {
  const adapter = adapters.get(name);
  if (!adapter) {
    throw new Error(`Adaptateur "${name}" non implemente (a venir etape 10.x)`);
  }
  return adapter;
}

export function listImplementedAdapters(): CrawlerAdapterEnum[] {
  return Array.from(adapters.keys());
}
