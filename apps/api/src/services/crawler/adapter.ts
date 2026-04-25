/**
 * Interface commune pour tous les adaptateurs de crawler.
 * Chaque adaptateur (Reddit, Redgifs, etc.) implemente cette interface.
 */

export interface CrawlerItem {
  /** URL directe de la video (ex: https://v.redd.it/.../DASH_720.mp4). Si indisponible, URL du post. */
  sourceUrl: string;
  /** URL de la thumbnail (preview image) */
  thumbnailUrl?: string | null;
  /** Titre lisible du post */
  title?: string | null;
  /** ID externe unique chez la source (pour deduplication / debug) */
  externalId?: string | null;
  /** Metadata specifique a l'adapter (score, auteur, duree connue, etc.) */
  metadata?: Record<string, unknown>;
}

export interface CrawlerAdapterContext {
  /** Limite max d'items a retourner */
  maxResults: number;
  /** Config brute depuis CrawlerSource.config (JSONB) */
  config: Record<string, unknown>;
  /** User-agent a utiliser pour les requetes HTTP (etre "poli" avec les sites) */
  userAgent: string;
}

export interface CrawlerAdapter {
  /** Nom lisible (ex: "reddit") */
  readonly name: string;
  /**
   * Valide la config fournie. Lance une Error si invalide.
   * Appele au CRUD CrawlerSource pour empecher les configs absurdes.
   */
  validateConfig(config: Record<string, unknown>): void;
  /**
   * Recupere une liste d'items depuis la source externe.
   * Doit respecter maxResults. Peut retourner moins si rien trouve.
   */
  fetch(ctx: CrawlerAdapterContext): Promise<CrawlerItem[]>;
}
