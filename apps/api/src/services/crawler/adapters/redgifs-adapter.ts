import type {
  CrawlerAdapter,
  CrawlerAdapterContext,
  CrawlerItem,
} from '../adapter';
import {
  searchByTag,
  searchQuery,
  pickVideoUrl,
  type RedgifsGif,
} from '../../../lib/redgifs-client';

/**
 * Adaptateur Redgifs.
 *
 * Config :
 *   Mode A (tag) :
 *     { mode: "tag", tag: "cute", order?: "trending|new|top|best", quality?: "hd|sd", minDurationSec?: number }
 *
 *   Mode B (query libre) :
 *     { mode: "query", query: "some phrase", order?: "...", quality?: "hd|sd", minDurationSec?: number }
 *
 *   Par defaut : mode="tag", order="trending", quality="hd".
 */

type Mode = 'tag' | 'query';

export class RedgifsAdapter implements CrawlerAdapter {
  readonly name = 'redgifs';

  validateConfig(config: Record<string, unknown>): void {
    const mode = (config.mode as Mode | undefined) ?? 'tag';
    if (!['tag', 'query'].includes(mode)) {
      throw new Error('config.mode doit etre "tag" ou "query"');
    }
    if (mode === 'tag') {
      if (typeof config.tag !== 'string' || !config.tag.trim()) {
        throw new Error('config.tag requis en mode tag (ex: "cute")');
      }
    } else {
      if (typeof config.query !== 'string' || !config.query.trim()) {
        throw new Error('config.query requis en mode query');
      }
    }

    const order = config.order;
    if (order !== undefined && !['trending', 'new', 'top', 'best'].includes(String(order))) {
      throw new Error('config.order doit etre "trending", "new", "top" ou "best"');
    }

    const quality = config.quality;
    if (quality !== undefined && !['hd', 'sd'].includes(String(quality))) {
      throw new Error('config.quality doit etre "hd" ou "sd"');
    }

    const minDuration = config.minDurationSec;
    if (minDuration !== undefined && (typeof minDuration !== 'number' || minDuration < 0)) {
      throw new Error('config.minDurationSec doit etre un nombre positif');
    }
  }

  async fetch(ctx: CrawlerAdapterContext): Promise<CrawlerItem[]> {
    this.validateConfig(ctx.config);

    const mode = (ctx.config.mode as Mode | undefined) ?? 'tag';
    const order = (ctx.config.order as 'trending' | 'new' | 'top' | 'best') ?? 'trending';
    const quality = (ctx.config.quality as 'hd' | 'sd') ?? 'hd';
    const minDuration =
      typeof ctx.config.minDurationSec === 'number' ? ctx.config.minDurationSec : 0;

    // On demande 2x plus pour absorber les filtres
    const count = Math.min(100, ctx.maxResults * 2);

    let response;
    if (mode === 'tag') {
      response = await searchByTag({
        tag: String(ctx.config.tag),
        order,
        count,
      });
    } else {
      response = await searchQuery({
        query: String(ctx.config.query),
        order,
        count,
      });
    }

    const gifs: RedgifsGif[] = response.gifs ?? [];

    const items: CrawlerItem[] = [];
    for (const g of gifs) {
      const videoUrl = pickVideoUrl(g.urls, quality);
      if (!videoUrl) continue;

      if (minDuration > 0 && (g.duration ?? 0) < minDuration) continue;

      items.push({
        sourceUrl: videoUrl,
        thumbnailUrl: g.urls.poster ?? g.urls.thumbnail ?? g.urls.vthumbnail ?? null,
        title: g.title || g.description || `Redgifs ${g.id}`,
        externalId: g.id,
        metadata: {
          redgifsId: g.id,
          userName: g.userName,
          createDate: g.createDate,
          views: g.views,
          likes: g.likes,
          duration: g.duration,
          width: g.width,
          height: g.height,
          tags: g.tags,
          quality,
          watchUrl: `https://redgifs.com/watch/${g.id}`,
        },
      });

      if (items.length >= ctx.maxResults) break;
    }

    return items;
  }
}
