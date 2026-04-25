import axios from 'axios';
import type {
  CrawlerAdapter,
  CrawlerAdapterContext,
  CrawlerItem,
} from '../adapter';

/**
 * Adaptateur Reddit - utilise l'API JSON publique (sans auth).
 *
 * Config attendue :
 *   {
 *     subreddit: string,              // ex: "oddlysatisfying" (sans r/)
 *     sort?: "hot" | "new" | "top",   // defaut: "hot"
 *     timeFilter?: "hour"|"day"|"week"|"month"|"year"|"all",  // pour sort=top
 *     minScore?: number,              // filtre karma min
 *     requireVideo?: boolean,         // defaut: true -> ignore posts sans video
 *     nsfw?: "only" | "allow" | "deny" // filtre contenu NSFW (defaut "allow")
 *   }
 *
 * NOTE : Reddit bloque les User-Agent generiques/automate avec HTTP 403.
 * On utilise old.reddit.com (plus tolerant) + un UA navigateur realiste.
 */

interface RedditPost {
  data: {
    id: string;
    title: string;
    permalink: string;
    url_overridden_by_dest?: string;
    url?: string;
    thumbnail?: string;
    score?: number;
    over_18?: boolean;
    is_video?: boolean;
    domain?: string;
    author?: string;
    created_utc?: number;
    preview?: {
      images?: Array<{
        source?: { url?: string; width?: number; height?: number };
      }>;
      reddit_video_preview?: { fallback_url?: string; duration?: number };
    };
    media?: {
      reddit_video?: {
        fallback_url?: string;
        duration?: number;
        height?: number;
        width?: number;
      };
    };
    secure_media?: {
      reddit_video?: {
        fallback_url?: string;
      };
    };
  };
}

interface RedditListingResponse {
  data: {
    children: RedditPost[];
    after?: string | null;
  };
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function unescapeRedditUrl(url: string): string {
  // Reddit echappe les & en &amp; dans les URLs
  return url.replace(/&amp;/g, '&');
}

/**
 * Extrait une URL video directe si possible depuis un post.
 * Priorite : reddit_video > redgifs.com > url directe .mp4
 */
function extractVideoUrl(post: RedditPost['data']): string | null {
  // 1. Reddit-hosted video (v.redd.it)
  const rv =
    post.media?.reddit_video?.fallback_url ??
    post.secure_media?.reddit_video?.fallback_url;
  if (rv) return unescapeRedditUrl(rv);

  // 2. URL directe vers un fichier video ?
  const target = post.url_overridden_by_dest ?? post.url;
  if (target && /\.(mp4|webm|mov|mkv)(\?|$)/i.test(target)) {
    return unescapeRedditUrl(target);
  }

  // 3. redgifs.com (on garde l'URL, un adaptateur redgifs pourra resoudre plus tard)
  if (target && /redgifs\.com/i.test(target)) {
    return unescapeRedditUrl(target);
  }

  return null;
}

function extractThumbnailUrl(post: RedditPost['data']): string | null {
  const preview = post.preview?.images?.[0]?.source?.url;
  if (preview) return unescapeRedditUrl(preview);

  if (post.thumbnail && /^https?:\/\//i.test(post.thumbnail)) {
    return unescapeRedditUrl(post.thumbnail);
  }
  return null;
}

export class RedditAdapter implements CrawlerAdapter {
  readonly name = 'reddit';

  validateConfig(config: Record<string, unknown>): void {
    const subreddit = config.subreddit;
    if (typeof subreddit !== 'string' || !subreddit.trim()) {
      throw new Error('config.subreddit requis (ex: "oddlysatisfying")');
    }
    if (!/^[A-Za-z0-9_]+$/.test(subreddit)) {
      throw new Error('config.subreddit : caracteres alphanumeriques et _ uniquement');
    }
    const sort = config.sort;
    if (sort !== undefined && !['hot', 'new', 'top'].includes(String(sort))) {
      throw new Error('config.sort doit etre "hot", "new" ou "top"');
    }
    const tf = config.timeFilter;
    if (
      tf !== undefined &&
      !['hour', 'day', 'week', 'month', 'year', 'all'].includes(String(tf))
    ) {
      throw new Error('config.timeFilter invalide');
    }
    const nsfw = config.nsfw;
    if (nsfw !== undefined && !['only', 'allow', 'deny'].includes(String(nsfw))) {
      throw new Error('config.nsfw doit etre "only", "allow" ou "deny"');
    }
    const minScore = config.minScore;
    if (minScore !== undefined && (typeof minScore !== 'number' || minScore < 0)) {
      throw new Error('config.minScore doit etre un nombre positif');
    }
  }

  async fetch(ctx: CrawlerAdapterContext): Promise<CrawlerItem[]> {
    this.validateConfig(ctx.config);

    const subreddit = String(ctx.config.subreddit);
    const sort = (ctx.config.sort as string) ?? 'hot';
    const timeFilter = (ctx.config.timeFilter as string) ?? 'day';
    const minScore = typeof ctx.config.minScore === 'number' ? ctx.config.minScore : 0;
    const requireVideo = ctx.config.requireVideo !== false; // defaut true
    const nsfw = (ctx.config.nsfw as string) ?? 'allow';

    // Limit Reddit : on demande 3x plus que maxResults car on va filtrer
    const listingLimit = Math.min(100, ctx.maxResults * 3);

    const params = new URLSearchParams({
      limit: String(listingLimit),
      raw_json: '1',
    });
    if (sort === 'top') params.set('t', timeFilter);

    // old.reddit.com : plus tolerant avec les User-Agent
    const url = `https://old.reddit.com/r/${subreddit}/${sort}.json?${params.toString()}`;

    const response = await axios.get<RedditListingResponse>(url, {
      timeout: 15_000,
      headers: {
        // UA navigateur realiste pour eviter les HTTP 403 de Reddit
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      validateStatus: (s) => s < 500,
    });

    if (response.status === 429) {
      throw new Error('Reddit rate limit (HTTP 429) - ralentis le cron');
    }
    if (response.status >= 400) {
      throw new Error(
        `Reddit HTTP ${response.status} - subreddit prive/introuvable ou acces bloque`,
      );
    }

    const posts = response.data?.data?.children ?? [];

    const items: CrawlerItem[] = [];
    for (const post of posts) {
      const d = post.data;

      // NSFW
      if (nsfw === 'only' && !d.over_18) continue;
      if (nsfw === 'deny' && d.over_18) continue;

      // Score
      if (minScore > 0 && (d.score ?? 0) < minScore) continue;

      // Video
      const videoUrl = extractVideoUrl(d);
      if (requireVideo && !videoUrl) continue;

      items.push({
        sourceUrl: videoUrl ?? `https://reddit.com${d.permalink}`,
        thumbnailUrl: extractThumbnailUrl(d),
        title: d.title,
        externalId: d.id,
        metadata: {
          subreddit,
          sort,
          score: d.score,
          over18: d.over_18,
          domain: d.domain,
          author: d.author,
          createdUtc: d.created_utc,
          permalink: `https://reddit.com${d.permalink}`,
          rawVideoWidth: d.media?.reddit_video?.width,
          rawVideoHeight: d.media?.reddit_video?.height,
          rawVideoDuration: d.media?.reddit_video?.duration,
        },
      });

      if (items.length >= ctx.maxResults) break;
    }

    return items;
  }
}
