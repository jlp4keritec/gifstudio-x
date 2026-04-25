import axios from 'axios';
import type {
  CrawlerAdapter,
  CrawlerAdapterContext,
  CrawlerItem,
} from '../adapter';

/**
 * E621 : API JSON publique https://e621.net/posts.json
 * Requiert obligatoirement un User-Agent identifiable (sinon 403).
 * L'UA par defaut de GifStudio-X ("gifstudio-x/0.1 (private instance crawler)")
 * est conforme aux regles E621 (identifiant + version + contact implicite).
 *
 * Config :
 *   {
 *     includeTags: string[],
 *     excludeTags?: string[],
 *     sort?: "date" | "score",
 *     minScore?: number,
 *     rating?: "s" | "q" | "e"    // safe / questionable / explicit (optionnel)
 *   }
 */

const VIDEO_FILE_EXTS = ['mp4', 'webm'];

interface E621Post {
  id: number;
  file?: {
    width: number;
    height: number;
    ext: string;
    size: number;
    url: string | null;
  };
  preview?: { url: string | null };
  sample?: { url: string | null };
  score?: { total: number };
  rating?: string;
  tags?: Record<string, string[]>;
  sources?: string[];
  created_at?: string;
}

interface E621Response {
  posts: E621Post[];
}

export class E621Adapter implements CrawlerAdapter {
  readonly name = 'e621';

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
    if (minScore !== undefined && (typeof minScore !== 'number')) {
      throw new Error('config.minScore doit etre un nombre');
    }
    const rating = config.rating;
    if (rating !== undefined && !['s', 'q', 'e'].includes(String(rating))) {
      throw new Error('config.rating doit etre "s", "q" ou "e"');
    }
  }

  async fetch(ctx: CrawlerAdapterContext): Promise<CrawlerItem[]> {
    this.validateConfig(ctx.config);

    const includeTags = ctx.config.includeTags as string[];
    const excludeTags = (ctx.config.excludeTags as string[] | undefined) ?? [];
    const sort = (ctx.config.sort as string) ?? 'date';
    const minScore = typeof ctx.config.minScore === 'number' ? ctx.config.minScore : 0;
    const rating = ctx.config.rating as string | undefined;

    // Construction tags e621 : "tag1 tag2 -badtag type:webm"
    const tagsArr = [
      ...includeTags,
      ...excludeTags.map((t) => (t.startsWith('-') ? t : `-${t}`)),
    ];

    // Restriction video uniquement (on en demande explicitement mp4 OU webm)
    // e621 ne supporte pas le OR natif, donc on fait 2 requetes et on merge
    if (rating) tagsArr.push(`rating:${rating}`);
    if (sort === 'score') tagsArr.push('order:score');
    // date = order par defaut

    const limit = Math.min(100, Math.ceil(ctx.maxResults * 1.2));
    const baseUrl = 'https://e621.net/posts.json';

    // Deux requetes (mp4 / webm) en parallele
    const makeReq = (ext: string) =>
      axios.get<E621Response>(baseUrl, {
        params: {
          tags: [...tagsArr, `type:${ext}`].join(' '),
          limit: Math.ceil(limit / 2),
        },
        timeout: 15_000,
        headers: {
          'User-Agent': ctx.userAgent,
          Accept: 'application/json',
        },
        validateStatus: (s) => s < 500,
      });

    const [respMp4, respWebm] = await Promise.all([makeReq('mp4'), makeReq('webm')]);

    for (const r of [respMp4, respWebm]) {
      if (r.status >= 400) {
        throw new Error(`E621 HTTP ${r.status} (User-Agent bloque ? tag invalide ?)`);
      }
    }

    const posts: E621Post[] = [
      ...(respMp4.data?.posts ?? []),
      ...(respWebm.data?.posts ?? []),
    ];

    // Dedup par id + tri par score/date desc
    const byId = new Map<number, E621Post>();
    for (const p of posts) {
      if (!byId.has(p.id)) byId.set(p.id, p);
    }
    const deduped = Array.from(byId.values()).sort((a, b) => {
      if (sort === 'score') return (b.score?.total ?? 0) - (a.score?.total ?? 0);
      return b.id - a.id;
    });

    const items: CrawlerItem[] = [];
    for (const p of deduped) {
      if (!p.file?.url) continue;
      if (!VIDEO_FILE_EXTS.includes(p.file.ext?.toLowerCase())) continue;

      const score = p.score?.total ?? 0;
      if (minScore > 0 && score < minScore) continue;

      const tagsFlat: string[] = [];
      if (p.tags) {
        for (const list of Object.values(p.tags)) {
          if (Array.isArray(list)) tagsFlat.push(...list);
        }
      }

      items.push({
        sourceUrl: p.file.url,
        thumbnailUrl: p.sample?.url ?? p.preview?.url ?? null,
        title: `E621 #${p.id}`,
        externalId: String(p.id),
        metadata: {
          e621Id: p.id,
          score,
          rating: p.rating,
          width: p.file.width,
          height: p.file.height,
          fileSize: p.file.size,
          ext: p.file.ext,
          tags: tagsFlat.slice(0, 40),
          sources: p.sources ?? [],
          postUrl: `https://e621.net/posts/${p.id}`,
        },
      });

      if (items.length >= ctx.maxResults) break;
    }

    return items;
  }
}
