import type { CrawlerAdapter as CrawlerAdapterEnum } from '@prisma/client';
import type { CrawlerAdapter } from './adapter';
import { RedditAdapter } from './adapters/reddit-adapter';
import { RedgifsAdapter } from './adapters/redgifs-adapter';
import { Rule34Adapter } from './adapters/rule34-adapter';
import { E621Adapter } from './adapters/e621-adapter';
import { GenericHtmlAdapter } from './adapters/generic-html-adapter';
import { GenericBrowserAdapter } from './adapters/generic-browser-adapter';

const adapters = new Map<CrawlerAdapterEnum, CrawlerAdapter>([
  ['reddit', new RedditAdapter()],
  ['redgifs', new RedgifsAdapter()],
  ['rule34', new Rule34Adapter()],
  ['e621', new E621Adapter()],
  ['generic_html', new GenericHtmlAdapter()],
  ['generic_browser', new GenericBrowserAdapter()],
]);

export function getAdapter(name: CrawlerAdapterEnum): CrawlerAdapter {
  const adapter = adapters.get(name);
  if (!adapter) {
    throw new Error(`Adaptateur "${name}" non implemente`);
  }
  return adapter;
}

export function listImplementedAdapters(): CrawlerAdapterEnum[] {
  return Array.from(adapters.keys());
}

/**
 * Acces direct a l'instance GenericHtmlAdapter (pour endpoint de test).
 */
export function getGenericHtmlAdapter(): GenericHtmlAdapter {
  return adapters.get('generic_html') as GenericHtmlAdapter;
}

/**
 * Acces direct a l'instance GenericBrowserAdapter (pour endpoint de test).
 */
export function getGenericBrowserAdapter(): GenericBrowserAdapter {
  return adapters.get('generic_browser') as GenericBrowserAdapter;
}
