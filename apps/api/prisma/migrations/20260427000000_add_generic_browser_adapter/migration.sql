-- Ajout de la valeur 'generic_browser' a l'enum CrawlerAdapter
-- (pour le crawler base sur Playwright avec rendu JS)
ALTER TYPE "CrawlerAdapter" ADD VALUE IF NOT EXISTS 'generic_browser';
