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

// 2. Ingestion Crawlers
async function fetchHackerNews(sourceId: number): Promise<Omit<RawArticle, 'id'>[]> {
  console.log('[Ingest] Fetching Hacker News...');
  const articles: Omit<RawArticle, 'id'>[] = [];
  try {
    const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!res.ok) throw new Error(`HN API returned status ${res.status}`);
    const topIds = await res.json() as number[];
    
    // Fetch details for top 30 stories
    const limitIds = topIds.slice(0, 30);
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const id of limitIds) {
      try {
        const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        if (!itemRes.ok) continue;
        const item = await itemRes.json();
        
        if (
          item &&
          item.type === 'story' &&
          item.title &&
          item.url &&
          item.time * 1000 > oneDayAgo
        ) {
          articles.push({
            source_id: sourceId,
            original_title: item.title,
            url: item.url,
            event_id: null
          });
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

async function fetchTechCrunch(sourceId: number): Promise<Omit<RawArticle, 'id'>[]> {
  console.log('[Ingest] Fetching TechCrunch RSS...');
  const articles: Omit<RawArticle, 'id'>[] = [];
  try {
    const parser = new Parser();
    const feed = await parser.parseURL('https://techcrunch.com/feed/');
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const item of feed.items) {
      if (item.title && item.link && item.isoDate) {
        const publishedTime = Date.parse(item.isoDate);
        if (publishedTime > oneDayAgo) {
          articles.push({
            source_id: sourceId,
            original_title: item.title,
            url: item.link,
            event_id: null
          });
        }
      }
    }
  } catch (err) {
    console.error('[Ingest] Error fetching TechCrunch feed:', err);
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
          articles.push({
            source_id: sourceId,
            original_title: title,
            url: url,
            event_id: null
          });
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

    if (!res.ok) throw new Error(`GitHub Trending page returned status ${res.status}`);
    
    const html = await res.text();
    const articleRegex = /<article\s+class="Box-row"[^>]*>([\s\S]*?)<\/article>/g;
    let match;
    
    while ((match = articleRegex.exec(html)) !== null) {
      const block = match[1];
      
      // Extract repo path: href="/owner/repo"
      const repoLinkRegex = /href="\/([a-zA-Z0-9-_\.]+\/[a-zA-Z0-9-_\.]+)"/;
      const linkMatch = block.match(repoLinkRegex);
      if (!linkMatch) continue;
      
      const repoName = linkMatch[1];
      
      // Extract description inside <p class="col-9 color-fg-muted my-1 pr-4">
      const descRegex = /<p\s+class="col-9[^>]*>([\s\S]*?)<\/p>/;
      const descMatch = block.match(descRegex);
      let desc = descMatch ? descMatch[1].trim() : '';
      
      // Clean HTML tags and spacing
      desc = desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
      
      articles.push({
        source_id: sourceId,
        original_title: `${repoName}: ${desc || 'New trending repository'}`,
        url: `https://github.com/${repoName}`,
        event_id: null
      });

      // Limit to top 15 trending repos
      if (articles.length >= 15) {
        break;
      }
    }
    
    console.log(`[Ingest] Successfully scraped ${articles.length} GitHub Trending repos.`);
  } catch (err) {
    console.error('[Ingest] Error scraping GitHub Trending:', err);
  }
  return articles;
}


// 3. Fallback Heuristic Curation
function generateFallbackEvent(title: string, link: string): ClusteredEvent {
  const clean = title.toLowerCase();
  let category = 'Development';
  let score = 5;

  if (
    clean.includes('ai') || clean.includes('ml') || clean.includes('gpt') || 
    clean.includes('llama') || clean.includes('openai') || clean.includes('gemini') || 
    clean.includes('claude') || clean.includes('model') || clean.includes('llm') || 
    clean.includes('learning') || clean.includes('neural')
  ) {
    category = 'AI/ML';
    score = 8;
  } else if (
    clean.includes('quantum') || clean.includes('science') || clean.includes('physics') || 
    clean.includes('fusion') || clean.includes('nasa') || clean.includes('space') || 
    clean.includes('bio') || clean.includes('gene')
  ) {
    category = 'Science';
    score = 7;
  } else if (
    clean.includes('startup') || clean.includes('acquired') || clean.includes('acquisition') || 
    clean.includes('funding') || clean.includes('vc') || clean.includes('billion') || 
    clean.includes('revenue') || clean.includes('antitrust') || clean.includes('stocks')
  ) {
    category = 'Business/Tech';
    score = 6;
  }

  // Adjust score based on length or source indicators
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

// 4. Scraper and Gemini API Curation
async function scrapeUrl(url: string): Promise<string> {
  // If the url is arXiv PDF or something we cannot easily read as HTML, handle/skip
  if (url.endsWith('.pdf')) {
    return '';
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP status ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml+xml')) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const htmlText = await res.text();
    
    // Remove script, style, head, noscript, iframe elements and their content
    let cleanText = htmlText.replace(/<(script|style|head|noscript|iframe|svg|canvas|map|video|audio)[^>]*>[\s\S]*?<\/\1>/gi, '');
    
    // Remove comments
    cleanText = cleanText.replace(/<!--[\s\S]*?-->/g, ' ');
    
    // Replace all tags with spaces (to prevent words sticking together)
    cleanText = cleanText.replace(/<[^>]+>/g, ' ');
    
    // Unescape standard HTML entities
    cleanText = cleanText
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&lsquo;/g, "'")
      .replace(/&rsquo;/g, "'");

    // Clean up multiple spaces/tabs/newlines
    cleanText = cleanText.replace(/\s+/g, ' ').trim();

    // Truncate to maximum characters (around 3500 characters)
    if (cleanText.length > 3500) {
      cleanText = cleanText.substring(0, 3500) + '...';
    }

    return cleanText;
  } catch (err: any) {
    console.warn(`[Scraper] Warning: Could not scrape ${url} (${err.message}). Using titles only fallback.`);
    return '';
  }
}

async function generateGeminiEvent(titles: string[], articlesListText: string, primaryLink: string): Promise<ClusteredEvent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return generateFallbackEvent(titles[0], primaryLink);
  }

  // Scrape full text content of the primary article if possible
  console.log(`[Ingest] Scraping content from primary link: ${primaryLink}`);
  const scrapedContent = await scrapeUrl(primaryLink);
  
  const contextSection = scrapedContent 
    ? `\nHere is the scraped content from the primary article for background context:\n\"\"\"\n${scrapedContent}\n\"\"\"\n`
    : '\n(No additional article text available; summarize using titles only)\n';

  try {
    const ai = new GoogleGenAI({ apiKey });
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
  } catch (err) {
    console.error('[AI Engine] Error with Gemini API, falling back to heuristic:', err);
    return generateFallbackEvent(titles[0], primaryLink);
  }
}

// 5. Ingestion Pipeline Orchestrator
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
  const db = getDb();
  
  // Get sources
  const getSourcesStmt = db.prepare('SELECT * FROM sources');
  const dbSources = getSourcesStmt.all() as unknown as { id: number; name: string; url: string; category: string }[];
  
  let totalFetched = 0;
  const allRawArticles: Omit<RawArticle, 'id'>[] = [];

  for (const src of dbSources) {
    log(`Crawling source: ${src.name}`);
    let fetched: Omit<RawArticle, 'id'>[] = [];
    if (src.name === 'Hacker News') {
      fetched = await fetchHackerNews(src.id);
    } else if (src.name === 'TechCrunch') {
      fetched = await fetchTechCrunch(src.id);
    } else if (src.name === 'arXiv CS/AI') {
      fetched = await fetchArxiv(src.id);
    } else if (src.name === 'GitHub Trending') {
      fetched = await fetchGitHub(src.id);
    }
    log(`Fetched ${fetched.length} recent articles from ${src.name}`);
    totalFetched += fetched.length;
    allRawArticles.push(...fetched);
  }

  // Insert raw articles into DB, skipping duplicates
  log('Saving raw articles to database...');
  const insertArticle = db.prepare(`
    INSERT OR IGNORE INTO raw_articles (source_id, original_title, url, fetched_at)
    VALUES (?, ?, ?, datetime('now', 'utc'))
  `);

  let newArticlesCount = 0;
  for (const art of allRawArticles) {
    const res = insertArticle.run(art.source_id, art.original_title, art.url) as { changes: number };
    if (res.changes > 0) {
      newArticlesCount++;
    }
  }
  log(`Ingested ${newArticlesCount} new unique articles.`);

  // Load all raw articles from the last 24 hours that are not grouped into an event
  log('Loading ungrouped articles from the past 24 hours...');
  const getUngrouped = db.prepare(`
    SELECT r.*, s.name as source_name 
    FROM raw_articles r
    JOIN sources s ON r.source_id = s.id
    WHERE r.event_id IS NULL 
      AND r.fetched_at >= datetime('now', '-24 hours')
  `);
  
  const ungroupedArticles = getUngrouped.all() as unknown as RawArticle[];
  log(`Found ${ungroupedArticles.length} ungrouped articles from the last 24 hours.`);

  if (ungroupedArticles.length === 0) {
    log('No new articles to cluster. Pipeline complete.');
    return { articlesFetched: totalFetched, newArticles: newArticlesCount, eventsCreated: 0, logs };
  }

  // Local Clustering (Similarity threshold > 0.22)
  log('Clustering articles based on title similarity...');
  const clusters: RawArticle[][] = [];
  const similarityThreshold = 0.22;

  for (const art of ungroupedArticles) {
    let matchedCluster = false;
    for (const cluster of clusters) {
      // Compare with the primary (first) article in the cluster
      const sim = getTitleSimilarity(art.original_title, cluster[0].original_title);
      if (sim > similarityThreshold) {
        cluster.push(art);
        matchedCluster = true;
        break;
      }
    }
    if (!matchedCluster) {
      clusters.push([art]);
    }
  }
  log(`Grouped ${ungroupedArticles.length} articles into ${clusters.length} clusters.`);

  // Create Events and Assign Links
  let eventsCreated = 0;
  const insertEvent = db.prepare(`
    INSERT INTO tech_events (title, ai_summary, impact_score, category, primary_link, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'utc'))
  `);
  const updateArticleEvent = db.prepare(`
    UPDATE raw_articles SET event_id = ? WHERE id = ?
  `);

  for (const cluster of clusters) {
    const titles = cluster.map(a => a.original_title);
    const articlesListText = cluster.map(a => `- [${a.source_name}] ${a.original_title} (${a.url})`).join('\n');
    
    // Primary link is from the most reputable source in the cluster, or just the first
    // Prefer TechCrunch or HN, fallback to first
    let primaryLink = cluster[0].url;
    const preferred = cluster.find(a => a.source_name === 'TechCrunch' || a.source_name === 'Hacker News');
    if (preferred) {
      primaryLink = preferred.url;
    }

    log(`Processing cluster: "${titles[0]}" (${cluster.length} sources)`);
    
    // Generate AI metrics and summary
    const enriched = await generateGeminiEvent(titles, articlesListText, primaryLink);
    
    // Write Event to DB
    const summaryText = JSON.stringify({
      what: enriched.summary_what,
      why: enriched.summary_why,
      who: enriched.summary_who
    });

    const eventResult = insertEvent.run(
      enriched.title,
      summaryText,
      enriched.impact_score,
      enriched.category,
      enriched.primary_link
    ) as { lastInsertRowid: number };

    const newEventId = eventResult.lastInsertRowid;
    eventsCreated++;

    // Update raw articles with event id
    for (const art of cluster) {
      if (art.id) {
        updateArticleEvent.run(newEventId, art.id);
      }
    }
  }

  // 6. Data Cleanup / Retention
  log('Running retention policy (purging raw data older than 48 hours)...');
  
  // Delete articles older than 48 hours
  const purgeArticles = db.prepare("DELETE FROM raw_articles WHERE fetched_at < datetime('now', '-48 hours')");
  const purgedArticlesRes = purgeArticles.run() as { changes: number };
  log(`Purged ${purgedArticlesRes.changes} raw articles older than 48 hours.`);

  // Delete events older than 48 hours that are NOT bookmarked
  const purgeEvents = db.prepare(`
    DELETE FROM tech_events 
    WHERE created_at < datetime('now', '-48 hours') 
      AND id NOT IN (SELECT event_id FROM bookmarks)
  `);
  const purgedEventsRes = purgeEvents.run() as { changes: number };
  log(`Purged ${purgedEventsRes.changes} un-bookmarked events older than 48 hours.`);

  log('Ingestion pipeline completed successfully!');
  return {
    articlesFetched: totalFetched,
    newArticles: newArticlesCount,
    eventsCreated,
    logs
  };
}
