import Parser from "rss-parser";
import { logger } from "@/server/logging/logger";
import type { NewsCategory, NewsItem } from "@/lib/data/types";

/**
 * Real AI/tech news via public RSS feeds — no API key needed. Cached
 * in-memory with a TTL so page loads don't re-fetch four feeds every time.
 * A feed that's down is skipped, not fatal — the others still show.
 */

const parser = new Parser({ timeout: 5000 });

interface FeedConfig {
  url: string;
  source: string;
  category: NewsCategory;
  take: number;
}

const FEEDS: FeedConfig[] = [
  {
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    source: "TechCrunch",
    category: "AI/ML",
    take: 4,
  },
  {
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    source: "The Verge",
    category: "AI/ML",
    take: 3,
  },
  {
    url: "https://hnrss.org/newest?q=AI+OR+LLM+OR+%22machine+learning%22",
    source: "Hacker News",
    category: "Developer Tools",
    take: 3,
  },
  {
    url: "http://export.arxiv.org/rss/cs.AI",
    source: "ArXiv",
    category: "Research",
    take: 3,
  },
];

const CACHE_TTL_MS = 20 * 60_000;
let cache: { value: NewsItem[]; expiresAt: number } | null = null;

async function fetchFeed(config: FeedConfig): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(config.url);
    return feed.items.slice(0, config.take).map((item, i) => ({
      id: `${config.source.toLowerCase().replace(/\s+/g, "-")}-${i}`,
      title: (item.title ?? "Untitled").trim(),
      summary: (item.contentSnippet ?? "").trim().slice(0, 240),
      source: config.source,
      category: config.category,
      publishedAt: item.isoDate ?? new Date().toISOString(),
      url: item.link,
    }));
  } catch (err) {
    logger.warn("news.feed.failed", { source: config.source, error: String(err) });
    return [];
  }
}

async function fetchAllNews(): Promise<NewsItem[]> {
  const results = await Promise.all(FEEDS.map(fetchFeed));
  return results.flat().sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export async function getNews(): Promise<NewsItem[]> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;
  const value = await fetchAllNews();
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}
