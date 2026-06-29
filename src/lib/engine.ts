import Parser from 'rss-parser';
import { getDb } from './db';
import { GoogleGenAI } from '@google/genai';

interface RawArticle {
  id?: number;
  event_id?: number | null;
  source_id: number;
  original_title: string;
  url: string;
  fetched_at?: string;
  source_name?: string;
}

interface ClusteredEvent {
  title: string;
  category: string;
  impact_score: number;
  summary_what: string;
  summary_why: string;
  summary_who: string;
  primary_link: string;
}

// 1. Text Similarity Helper (Jaccard Similarity of Words)
function cleanTitle(title: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'on', 'for', 'with', 'of', 'to', 'in', 'and', 'or',
    'at', 'by', 'about', 'new', 'released', 'launches', 'announces', 'how',
    'what', 'why', 'who', 'show', 'hn', 'ask', 'github', 'trending'
  ]);
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

function getTitleSimilarity(title1: string, title2: string): number {
  const words1 = new Set(cleanTitle(title1));
  const words2 = new Set(cleanTitle(title2));
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

// ─────────────────────────────────────────────────────────────
// 2. Ingestion Crawlers
// ─────────────────────────────────────────────────────────────

async function fetchHackerNews(sourceId: number): Promise<Omit<RawArticle, 'id'>[]> {
  console.log('[Ingest] Fetching Hacker News...');
  const articles: Omit<RawArticle, 'id'>[] = [];
  try {
    const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!res.ok) throw new Error(`HN API returned status ${res.status}`);
    const topIds = await res.json() as number[];

    const limitIds = topIds.slice(0, 30);
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const id of limitIds) {
      try {
        const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        if (!itemRes.ok) continue;
        const item = await itemRes.json();

        if (item && item.type === 'story' && item.title && item.url && item.time * 1000 > oneDayAgo) {
          articles.push({ source_id: sourceId, original_title: item.title, url: item.url, event_id: null });
        }
      } catch (err) {
        console.error(`[Ingest] Error fetching HN item ${id}:`, err);
      }
    }
  } catch (err) {
    console.error('[Ingest] Error fetching HN top stories:', err);
  }
  return articles;
}

async function fetchRssFeed(sourceId: number, sourceName: string, feedUrl: string, limit = 25): Promise<Omit<RawArticle, 'id'>[]> {
  console.log(`[Ingest] Fetching ${sourceName} RSS...`);
  const articles: Omit<RawArticle, 'id'>[] = [];
  try {
    const parser = new Parser();
    const feed = await parser.parseURL(feedUrl);
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const item of feed.items.slice(0, limit)) {
      if (item.title && item.link) {
        const publishedTime = item.isoDate ? Date.parse(item.isoDate) : Date.now();
        if (publishedTime > oneDayAgo) {
          articles.push({ source_id: sourceId, original_title: item.title.trim(), url: item.link, event_id: null });
        }
      }
    }
    console.log(`[Ingest] Got ${articles.length} articles from ${sourceName}`);
  } catch (err) {
    console.error(`[Ingest] Error fetching ${sourceName} RSS feed:`, err);
  }
  return articles;
}

async function fetchArxiv(sourceId: number): Promise<Omit<RawArticle, 'id'>[]> {
  console.log('[Ingest] Fetching arXiv AI/CS papers...');
  const articles: Omit<RawArticle, 'id'>[] = [];
  try {
    const res = await fetch(
      'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.SE&sortBy=submittedDate&sortOrder=descending&max_results=20'
    );
    if (!res.ok) throw new Error(`arXiv returned status ${res.status}`);
    const xml = await res.text();

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entryXml = match[1];
      const titleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/);
      const idMatch = entryXml.match(/<id>([\s\S]*?)<\/id>/);
      const publishedMatch = entryXml.match(/<published>([\s\S]*?)<\/published>/);

      if (titleMatch && idMatch) {
        const title = titleMatch[1].trim().replace(/\s+/g, ' ');
        const url = idMatch[1].trim();
        const publishedStr = publishedMatch ? publishedMatch[1].trim() : '';
        const publishedTime = publishedStr ? Date.parse(publishedStr) : Date.now();

        if (publishedTime > oneDayAgo) {
          articles.push({ source_id: sourceId, original_title: title, url, event_id: null });
        }
      }
    }
  } catch (err) {
    console.error('[Ingest] Error fetching arXiv:', err);
  }
  return articles;
}

async function fetchGitHub(sourceId: number): Promise<Omit<RawArticle, 'id'>[]> {
  console.log('[Ingest] Scraping GitHub Trending repos...');
  const articles: Omit<RawArticle, 'id'>[] = [];
  try {
    const res = await fetch('https://github.com/trending', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) throw new Error(`GitHub Trending returned status ${res.status}`);
    const html = await res.text();
    const articleRegex = /<article\s+class="Box-row"[^>]*>([\s\S]*?)<\/article>/g;
    let match;

    while ((match = articleRegex.exec(html)) !== null) {
      const block = match[1];
      const repoLinkRegex = /href="\/([a-zA-Z0-9-_\.]+\/[a-zA-Z0-9-_\.]+)"/;
      const linkMatch = block.match(repoLinkRegex);
      if (!linkMatch) continue;

      const repoName = linkMatch[1];
      const descRegex = /<p\s+class="col-9[^>]*>([\s\S]*?)<\/p>/;
      const descMatch = block.match(descRegex);
      let desc = descMatch ? descMatch[1].trim() : '';
      desc = desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

      articles.push({
        source_id: sourceId,
        original_title: `${repoName}: ${desc || 'New trending repository'}`,
        url: `https://github.com/${repoName}`,
        event_id: null
      });

      if (articles.length >= 15) break;
    }
    console.log(`[Ingest] Scraped ${articles.length} GitHub Trending repos.`);
  } catch (err) {
    console.error('[Ingest] Error scraping GitHub Trending:', err);
  }
  return articles;
}

async function fetchDevTo(sourceId: number): Promise<Omit<RawArticle, 'id'>[]> {
  console.log('[Ingest] Fetching Dev.to top articles...');
  const articles: Omit<RawArticle, 'id'>[] = [];
  try {
    const res = await fetch('https://dev.to/api/articles?top=1&per_page=30', {
      headers: {
        'User-Agent': 'Tech24/1.0',
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`Dev.to API returned status ${res.status}`);
    const data = await res.json() as Array<{ title: string; url: string; published_at: string }>;

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const item of data) {
      if (item.title && item.url) {
        const publishedTime = item.published_at ? Date.parse(item.published_at) : Date.now();
        if (publishedTime > oneDayAgo) {
          articles.push({ source_id: sourceId, original_title: item.title.trim(), url: item.url, event_id: null });
        }
      }
    }
    console.log(`[Ingest] Got ${articles.length} articles from Dev.to`);
  } catch (err) {
    console.error('[Ingest] Error fetching Dev.to:', err);
  }
  return articles;
}

async function fetchProductHunt(sourceId: number): Promise<Omit<RawArticle, 'id'>[]> {
  console.log('[Ingest] Scraping Product Hunt...');
  const articles: Omit<RawArticle, 'id'>[] = [];
  try {
    const res = await fetch('https://www.producthunt.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) throw new Error(`Product Hunt returned status ${res.status}`);
    const html = await res.text();

    // Extract product data from embedded JSON or structured markup
    // Match <a> tags with /posts/ pattern
    const postLinkRegex = /href="(\/posts\/[a-zA-Z0-9-_]+)"/g;
    const titleRegex = /<a[^>]+href="\/posts\/[a-zA-Z0-9-_]+"[^>]*>([^<]{5,100})<\/a>/g;
    const seen = new Set<string>();
    let match;

    // Try to extract titles alongside post links using data attributes
    const nameRegex = /data-test="post-name"[^>]*>([^<]+)<\/[^>]+>/g;
    const slugRegex = /href="(\/posts\/[a-zA-Z0-9-]+)"/g;
    const slugs: string[] = [];
    const names: string[] = [];

    while ((match = nameRegex.exec(html)) !== null) {
      names.push(match[1].trim());
    }
    while ((match = slugRegex.exec(html)) !== null) {
      const slug = match[1];
      if (!seen.has(slug)) {
        seen.add(slug);
        slugs.push(slug);
      }
    }

    const count = Math.min(names.length, slugs.length, 15);
    for (let i = 0; i < count; i++) {
      if (names[i] && slugs[i]) {
        articles.push({
          source_id: sourceId,
          original_title: `[Product Launch] ${names[i]}`,
          url: `https://www.producthunt.com${slugs[i]}`,
          event_id: null
        });
      }
    }

    // Fallback: if we couldn't extract names, try generic link+title scraping
    if (articles.length === 0) {
      const fallbackRegex = /href="(\/posts\/[a-zA-Z0-9-_]+)"[^>]*title="([^"]{5,120})"/g;
      while ((match = fallbackRegex.exec(html)) !== null) {
        const slug = match[1];
        const title = match[2].trim();
        if (!seen.has(slug) && title) {
          seen.add(slug);
          articles.push({
            source_id: sourceId,
            original_title: `[Product Launch] ${title}`,
            url: `https://www.producthunt.com${slug}`,
            event_id: null
          });
        }
        if (articles.length >= 15) break;
      }
    }

    console.log(`[Ingest] Scraped ${articles.length} products from Product Hunt.`);
  } catch (err) {
    console.error('[Ingest] Error scraping Product Hunt:', err);
  }
  return articles;
}

async function fetchReddit(sourceId: number, subreddit: string): Promise<Omit<RawArticle, 'id'>[]> {
  console.log(`[Ingest] Fetching Reddit r/${subreddit}...`);
  const articles: Omit<RawArticle, 'id'>[] = [];
  try {
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/top.json?limit=25&t=day`, {
      headers: {
        'User-Agent': 'Tech24NewsAggregator/1.0 (by /u/tech24bot)',
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`Reddit r/${subreddit} returned status ${res.status}`);
    const data = await res.json() as { data: { children: Array<{ data: { title: string; url: string; permalink: string; is_self: boolean; score: number; created_utc: number } }> } };

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const child of data.data.children) {
      const post = child.data;
      if (post.title && post.created_utc * 1000 > oneDayAgo && post.score > 10) {
        // For self posts use Reddit permalink; for links use the external URL
        const url = post.is_self
          ? `https://www.reddit.com${post.permalink}`
          : post.url;
        articles.push({ source_id: sourceId, original_title: post.title.trim(), url, event_id: null });
      }
    }
    console.log(`[Ingest] Got ${articles.length} posts from r/${subreddit}`);
  } catch (err) {
    console.error(`[Ingest] Error fetching Reddit r/${subreddit}:`, err);
  }
  return articles;
}


// ─────────────────────────────────────────────────────────────
// 3. Fallback Heuristic Curation
// ─────────────────────────────────────────────────────────────
function generateFallbackEvent(title: string, link: string): ClusteredEvent {
  const clean = title.toLowerCase();
  let category = 'Development';
  let score = 5;

  if (
    clean.includes('ai') || clean.includes('ml') || clean.includes('gpt') ||
    clean.includes('llama') || clean.includes('openai') || clean.includes('gemini') ||
    clean.includes('claude') || clean.includes('model') || clean.includes('llm') ||
    clean.includes('learning') || clean.includes('neural') || clean.includes('transformer') ||
    clean.includes('diffusion') || clean.includes('chatgpt')
  ) {
    category = 'AI/ML';
    score = 8;
  } else if (
    clean.includes('quantum') || clean.includes('science') || clean.includes('physics') ||
    clean.includes('fusion') || clean.includes('nasa') || clean.includes('space') ||
    clean.includes('bio') || clean.includes('gene') || clean.includes('research')
  ) {
    category = 'Science';
    score = 7;
  } else if (
    clean.includes('startup') || clean.includes('acquired') || clean.includes('acquisition') ||
    clean.includes('funding') || clean.includes('vc') || clean.includes('billion') ||
    clean.includes('revenue') || clean.includes('antitrust') || clean.includes('stocks') ||
    clean.includes('launch') || clean.includes('product hunt')
  ) {
    category = 'Business/Tech';
    score = 6;
  }

  if (title.length > 80) score = Math.min(score + 1, 10);
  if (link.includes('github.com')) {
    category = 'Development';
    score = Math.max(score, 6);
  }

  return {
    title,
    category,
    impact_score: score,
    summary_what: `A new update has been posted: "${title}".`,
    summary_why: 'This development is tracking interest and updates across developer ecosystems and media outlets.',
    summary_who: 'Developers, product managers, and tech professionals monitoring this specific domain.',
    primary_link: link
  };
}

// ─────────────────────────────────────────────────────────────
// 4. Scraper and Gemini API Curation
// ─────────────────────────────────────────────────────────────

// Rate limiter: Gemini free tier allows 5 req/min.
// We allow max 4/min — one call every 15 seconds.
const geminiCallTimestamps: number[] = [];
const GEMINI_WINDOW_MS = 60_000;
const GEMINI_MAX_PER_WINDOW = 4;
const GEMINI_MIN_GAP_MS = 15_000;

async function waitForGeminiSlot(): Promise<void> {
  const now = Date.now();
  // Evict timestamps older than 60s
  while (geminiCallTimestamps.length > 0 && now - geminiCallTimestamps[0] > GEMINI_WINDOW_MS) {
    geminiCallTimestamps.shift();
  }

  // If we already have GEMINI_MAX_PER_WINDOW calls in the last minute, wait
  if (geminiCallTimestamps.length >= GEMINI_MAX_PER_WINDOW) {
    const oldestInWindow = geminiCallTimestamps[0];
    const waitMs = GEMINI_WINDOW_MS - (now - oldestInWindow) + 500; // +500ms buffer
    console.log(`[RateLimit] Gemini quota window full. Waiting ${Math.round(waitMs / 1000)}s...`);
    await new Promise(r => setTimeout(r, waitMs));
    geminiCallTimestamps.shift();
  }

  // Also enforce a minimum gap between consecutive calls
  if (geminiCallTimestamps.length > 0) {
    const lastCall = geminiCallTimestamps[geminiCallTimestamps.length - 1];
    const gap = Date.now() - lastCall;
    if (gap < GEMINI_MIN_GAP_MS) {
      const waitMs = GEMINI_MIN_GAP_MS - gap;
      console.log(`[RateLimit] Spacing Gemini calls. Waiting ${Math.round(waitMs / 1000)}s...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  geminiCallTimestamps.push(Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
async function scrapeUrl(url: string): Promise<string> {
  if (url.endsWith('.pdf')) return '';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP status ${res.status}`);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml+xml')) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const htmlText = await res.text();
    let cleanText = htmlText.replace(/<(script|style|head|noscript|iframe|svg|canvas|map|video|audio)[^>]*>[\s\S]*?<\/\1>/gi, '');
    cleanText = cleanText.replace(/<!--[\s\S]*?-->/g, ' ');
    cleanText = cleanText.replace(/<[^>]+>/g, ' ');
    cleanText = cleanText
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"').replace(/&lsquo;/g, "'").replace(/&rsquo;/g, "'");
    cleanText = cleanText.replace(/\s+/g, ' ').trim();

    if (cleanText.length > 3500) cleanText = cleanText.substring(0, 3500) + '...';
    return cleanText;
  } catch (err: any) {
    console.warn(`[Scraper] Warning: Could not scrape ${url} (${err.message}). Using titles only fallback.`);
    return '';
  }
}

async function generateGeminiEvent(titles: string[], articlesListText: string, primaryLink: string): Promise<ClusteredEvent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return generateFallbackEvent(titles[0], primaryLink);

  console.log(`[Ingest] Scraping content from primary link: ${primaryLink}`);
  const scrapedContent = await scrapeUrl(primaryLink);

  const contextSection = scrapedContent
    ? `\nHere is the scraped content from the primary article for background context:\n\"\"\"\n${scrapedContent}\n\"\"\"\n`
    : '\n(No additional article text available; summarize using titles only)\n';

  const prompt = `You are a professional editor for Tech24, a daily news aggregator.
We have grouped multiple news articles referring to the same tech event.
Here is the list of original headlines and URLs:
${articlesListText}
${contextSection}
Generate a combined JSON response summarizing this event. Follow the schema exactly:
- title: A unified, concise, and clean headline (max 80 chars) for this event. Do not mention source names in the title.
- category: Select exactly one category from: 'AI/ML', 'Development', 'Business/Tech', 'Science'.
- impact_score: A number from 1 to 10 (10 = revolutionary, e.g., GPT-5 release, 1 = minor library update).
- summary_what: What is this event/change? (Exactly 1 clear sentence). Use the scraped page context to make this highly specific, accurate, and detailed if available.
- summary_why: Why does it matter to the industry? (Exactly 1 clear sentence).
- summary_who: Who is impacted by this change? (Exactly 1 clear sentence).`;

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Wait for a safe slot before each call
    await waitForGeminiSlot();

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              category: { type: 'STRING', enum: ['AI/ML', 'Development', 'Business/Tech', 'Science'] },
              impact_score: { type: 'INTEGER' },
              summary_what: { type: 'STRING' },
              summary_why: { type: 'STRING' },
              summary_who: { type: 'STRING' }
            },
            required: ['title', 'category', 'impact_score', 'summary_what', 'summary_why', 'summary_who']
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error('Empty response text from Gemini');
      const data = JSON.parse(text);
      return {
        title: data.title || titles[0],
        category: data.category || 'Development',
        impact_score: Math.min(Math.max(Number(data.impact_score) || 5, 1), 10),
        summary_what: data.summary_what,
        summary_why: data.summary_why,
        summary_who: data.summary_who,
        primary_link: primaryLink
      };
    } catch (err: any) {
      const is429 = err?.message?.includes('429') || err?.status === 429;

      if (is429 && attempt < MAX_RETRIES) {
        // Extract retry-after from error message if present, else use exponential backoff
        const retryAfterMatch = err?.message?.match(/(\d+(?:\.\d+)?)s/);
        const retryAfterSec = retryAfterMatch ? Math.ceil(parseFloat(retryAfterMatch[1])) + 2 : 30 * attempt;
        console.warn(`[AI Engine] Rate limited (429). Attempt ${attempt}/${MAX_RETRIES}. Retrying in ${retryAfterSec}s...`);
        await sleep(retryAfterSec * 1000);
        continue;
      }

      // Non-429 error or exhausted retries — use fallback
      console.error(`[AI Engine] Gemini failed after ${attempt} attempt(s), using heuristic fallback:`, err?.message || err);
      return generateFallbackEvent(titles[0], primaryLink);
    }
  }

  // Should never reach here but TypeScript requires it
  return generateFallbackEvent(titles[0], primaryLink);
}

// ─────────────────────────────────────────────────────────────
// 5. Ingestion Pipeline Orchestrator
// ─────────────────────────────────────────────────────────────
export async function runIngestionPipeline(): Promise<{
  articlesFetched: number;
  newArticles: number;
  eventsCreated: number;
  logs: string[];
}> {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(`[${new Date().toISOString()}] ${msg}`);
  };

  log('Starting ingestion pipeline...');
  const db = await getDb();

  const getSourcesRes = await db.execute('SELECT * FROM sources');
  const dbSources = getSourcesRes.rows as unknown as { id: number; name: string; url: string; category: string }[];

  let totalFetched = 0;
  const allRawArticles: Omit<RawArticle, 'id'>[] = [];

  for (const src of dbSources) {
    log(`Crawling source: ${src.name}`);
    let fetched: Omit<RawArticle, 'id'>[] = [];

    switch (src.name) {
      case 'Hacker News':
        fetched = await fetchHackerNews(src.id);
        break;
      case 'TechCrunch':
        fetched = await fetchRssFeed(src.id, 'TechCrunch', 'https://techcrunch.com/feed/');
        break;
      case 'arXiv CS/AI':
        fetched = await fetchArxiv(src.id);
        break;
      case 'GitHub Trending':
        fetched = await fetchGitHub(src.id);
        break;
      case 'The Verge':
        fetched = await fetchRssFeed(src.id, 'The Verge', 'https://www.theverge.com/rss/index.xml');
        break;
      case 'Wired':
        fetched = await fetchRssFeed(src.id, 'Wired', 'https://www.wired.com/feed/rss');
        break;
      case 'Ars Technica':
        fetched = await fetchRssFeed(src.id, 'Ars Technica', 'http://feeds.arstechnica.com/arstechnica/index');
        break;
      case 'VentureBeat':
        fetched = await fetchRssFeed(src.id, 'VentureBeat', 'https://venturebeat.com/feed/');
        break;
      case 'MIT Tech Review':
        fetched = await fetchRssFeed(src.id, 'MIT Tech Review', 'https://www.technologyreview.com/feed/');
        break;
      case 'Dev.to':
        fetched = await fetchDevTo(src.id);
        break;
      case 'Product Hunt':
        fetched = await fetchProductHunt(src.id);
        break;
      case 'Reddit r/technology':
        fetched = await fetchReddit(src.id, 'technology');
        break;
      case 'Reddit r/MachineLearning':
        fetched = await fetchReddit(src.id, 'MachineLearning');
        break;
      default:
        log(`[WARN] No fetcher defined for source: ${src.name}`);
    }

    log(`Fetched ${fetched.length} recent articles from ${src.name}`);
    totalFetched += fetched.length;
    allRawArticles.push(...fetched);
  }

  // Insert raw articles, skipping duplicates
  log('Saving raw articles to database...');
  let newArticlesCount = 0;
  for (const art of allRawArticles) {
    const res = await db.execute({
      sql: 'INSERT OR IGNORE INTO raw_articles (source_id, original_title, url, fetched_at) VALUES (?, ?, ?, datetime(\'now\', \'utc\'))',
      args: [art.source_id, art.original_title, art.url]
    });
    if (res.rowsAffected > 0) newArticlesCount++;
  }
  log(`Ingested ${newArticlesCount} new unique articles.`);

  // Load ungrouped articles from the last 24 hours
  log('Loading ungrouped articles from the past 24 hours...');
  const getUngroupedRes = await db.execute(`
    SELECT r.*, s.name as source_name
    FROM raw_articles r
    JOIN sources s ON r.source_id = s.id
    WHERE r.event_id IS NULL
      AND r.fetched_at >= datetime('now', '-24 hours')
  `);

  const ungroupedArticles = getUngroupedRes.rows as unknown as RawArticle[];
  log(`Found ${ungroupedArticles.length} ungrouped articles from the last 24 hours.`);

  if (ungroupedArticles.length === 0) {
    log('No new articles to cluster. Pipeline complete.');
    return { articlesFetched: totalFetched, newArticles: newArticlesCount, eventsCreated: 0, logs };
  }

  // Local Clustering (Jaccard similarity threshold > 0.22)
  log('Clustering articles based on title similarity...');
  const clusters: RawArticle[][] = [];
  const similarityThreshold = 0.22;

  for (const art of ungroupedArticles) {
    let matchedCluster = false;
    for (const cluster of clusters) {
      const sim = getTitleSimilarity(art.original_title, cluster[0].original_title);
      if (sim > similarityThreshold) {
        cluster.push(art);
        matchedCluster = true;
        break;
      }
    }
    if (!matchedCluster) clusters.push([art]);
  }
  log(`Grouped ${ungroupedArticles.length} articles into ${clusters.length} clusters.`);

  // Create Events
  let eventsCreated = 0;

  const getExistingEventsRes = await db.execute("SELECT id, title FROM tech_events WHERE created_at >= datetime('now', '-24 hours')");
  const existingEvents = getExistingEventsRes.rows as unknown as { id: number; title: string }[];

  for (const cluster of clusters) {
    const titles = cluster.map(a => a.original_title);
    
    // Deduplication check against existing events in the database
    let matchedExistingEventId: number | null = null;
    for (const exEvent of existingEvents) {
      const sim = getTitleSimilarity(titles[0], exEvent.title);
      if (sim > 0.22) {
        matchedExistingEventId = exEvent.id;
        break;
      }
    }

    if (matchedExistingEventId !== null) {
      log(`[Deduplicate] Cluster representative "${titles[0]}" matches existing event ID ${matchedExistingEventId}. Linking articles and skipping.`);
      for (const art of cluster) {
        if (art.id) {
          await db.execute({
            sql: 'UPDATE raw_articles SET event_id = ? WHERE id = ?',
            args: [matchedExistingEventId, art.id]
          });
        }
      }
      continue;
    }

    const articlesListText = cluster.map(a => `- [${a.source_name}] ${a.original_title} (${a.url})`).join('\n');

    // Prefer high-trust sources for the primary link
    const preferredSources = ['TechCrunch', 'The Verge', 'Wired', 'Ars Technica', 'MIT Tech Review', 'Hacker News'];
    let primaryLink = cluster[0].url;
    for (const preferred of preferredSources) {
      const found = cluster.find(a => a.source_name === preferred);
      if (found) { primaryLink = found.url; break; }
    }

    log(`Processing cluster: "${titles[0]}" (${cluster.length} sources)`);
    const enriched = await generateGeminiEvent(titles, articlesListText, primaryLink);

    const summaryText = JSON.stringify({
      what: enriched.summary_what,
      why: enriched.summary_why,
      who: enriched.summary_who
    });

    const eventResult = await db.execute({
      sql: 'INSERT INTO tech_events (title, ai_summary, impact_score, category, primary_link, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\', \'utc\'))',
      args: [enriched.title, summaryText, enriched.impact_score, enriched.category, enriched.primary_link]
    });

    const newEventId = Number(eventResult.lastInsertRowid);
    eventsCreated++;

    for (const art of cluster) {
      if (art.id) {
        await db.execute({
          sql: 'UPDATE raw_articles SET event_id = ? WHERE id = ?',
          args: [newEventId, art.id]
        });
      }
    }
  }

  // ─── 6. Data Cleanup — 24-hour retention policy ───────────────
  log('Running retention policy (purging data older than 24 hours)...');

  const purgedArticlesRes = await db.execute("DELETE FROM raw_articles WHERE fetched_at < datetime('now', '-24 hours')");
  log(`Purged ${purgedArticlesRes.rowsAffected} raw articles older than 24 hours.`);

  const purgedEventsRes = await db.execute(`
    DELETE FROM tech_events
    WHERE created_at < datetime('now', '-24 hours')
      AND id NOT IN (SELECT event_id FROM bookmarks)
  `);
  log(`Purged ${purgedEventsRes.rowsAffected} un-bookmarked events older than 24 hours.`);

  log('Ingestion pipeline completed successfully!');
  return { articlesFetched: totalFetched, newArticles: newArticlesCount, eventsCreated, logs };
}
