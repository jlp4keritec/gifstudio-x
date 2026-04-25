import axios from 'axios';
import type {
  CrawlerAdapter,
  CrawlerAdapterContext,
  CrawlerItem,
} from '../adapter';
import { env } from '../../../config/env';

/**
 * Rule34.xxx - depuis aout 2025 l'API JSON requiert authentification
 * via les parametres api_key + user_id (recuperables dans Options du compte).
 *
 * Credentials configures via .env :
 *   RULE34_API_KEY=xxx
 *   RULE34_USER_ID=6150546
 *
 * Config de source :
 *   {
 *     includeTags: string[],
 *     excludeTags?: string[],
 *     sort?: "date" | "score",
 *     minScore?: number
 *   }
 *
 * Filtre : video uniquement (.mp4 / .webm).
 */

const VIDEO_EXTENSIONS = ['.mp4', '.webm'];

interface Rule34Post {
  id: number;
  file_url: string;
  preview_url?: string;
  sample_url?: string;
  tags: string;
  score: number;
  width: number;
  height: number;
  rating: string;
  source?: string;
  owner?: string;
  created_at?: string;
}

export class Rule34Adapter implements CrawlerAdapter {
  readonly name = 'rule34';

  validateConfig(config: Record<string, unknown>): void {
    const include = config.includeTags;
    if (!Array.isArray(include) || include.length === 0) {
      throw new Error('config.includeTags requis (array non vide)');
    }
    for (const t of include) {
      if (typeof t !== 'string' || !t.trim()) {
        throw new Error('config.includeTags : chaque tag doit etre une string non vide');
      }
    }
    const exclude = config.excludeTags;
    if (exclude !== undefined) {
      if (!Array.isArray(exclude)) {
        throw new Error('config.excludeTags doit etre un array');
      }
      for (const t of exclude) {
        if (typeof t !== 'string') {
          throw new Error('config.excludeTags : chaque tag doit etre une string');
        }
      }
    }
    const sort = config.sort;
    if (sort !== undefined && !['date', 'score'].includes(String(sort))) {
      throw new Error('config.sort doit etre "date" ou "score"');
    }
    const minScore = config.minScore;
    if (minScore !== undefined && (typeof minScore !== 'number' || minScore < 0)) {
      throw new Error('config.minScore doit etre un nombre positif');
    }
  }

  async fetch(ctx: CrawlerAdapterContext): Promise<CrawlerItem[]> {
    this.validateConfig(ctx.config);

    if (!env.RULE34_API_KEY || !env.RULE34_USER_ID) {
      throw new Error(
        'Credentials Rule34 manquants : definir RULE34_API_KEY et RULE34_USER_ID dans .env',
      );
    }

    const includeTags = ctx.config.includeTags as string[];
    const excludeTags = (ctx.config.excludeTags as string[] | undefined) ?? [];
    const sort = (ctx.config.sort as string) ?? 'date';
    const minScore = typeof ctx.config.minScore === 'number' ? ctx.config.minScore : 0;

    const tagsArr = [
      ...includeTags,
      ...excludeTags.map((t) => (t.startsWith('-') ? t : `-${t}`)),
    ];

    if (sort === 'score') tagsArr.push('sort:score:desc');
    else tagsArr.push('sort:id:desc');

    const tags = tagsArr.join(' ');

    const limit = Math.min(100, ctx.maxResults * 3);

    const url = 'https://api.rule34.xxx/index.php';
    const response = await axios.get<Rule34Post[]>(url, {
      params: {
        page: 'dapi',
        s: 'post',
        q: 'index',
        json: 1,
        limit,
        tags,
        api_key: env.RULE34_API_KEY,
        user_id: env.RULE34_USER_ID,
      },
      timeout: 15_000,
      headers: {
        'User-Agent': ctx.userAgent,
        Accept: 'application/json',
      },
      validateStatus: (s) => s < 500,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Rule34 HTTP ${response.status} : credentials invalides ou expires`,
      );
    }
    if (response.status >= 400) {
      throw new Error(`Rule34 HTTP ${response.status}`);
    }

    const posts = Array.isArray(response.data) ? response.data : [];

    const items: CrawlerItem[] = [];
    for (const p of posts) {
      if (!p.file_url) continue;

      const lowerUrl = p.file_url.toLowerCase();
      if (!VIDEO_EXTENSIONS.some((ext) => lowerUrl.endsWith(ext))) continue;

      if (minScore > 0 && p.score < minScore) continue;

      items.push({
        sourceUrl: p.file_url,
        thumbnailUrl: p.sample_url ?? p.preview_url ?? null,
        title: `Rule34 #${p.id}`,
        externalId: String(p.id),
        metadata: {
          rule34Id: p.id,
          score: p.score,
          rating: p.rating,
          width: p.width,
          height: p.height,
          owner: p.owner,
          source: p.source,
          tags: p.tags?.split(' ').filter(Boolean),
          postUrl: `https://rule34.xxx/index.php?page=post&s=view&id=${p.id}`,
        },
      });

      if (items.length >= ctx.maxResults) break;
    }

    return items;
  }
}
