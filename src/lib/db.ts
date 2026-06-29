import { createClient, Client } from '@libsql/client';

let dbInstance: Client | null = null;

async function initDb(db: Client, isLocal: boolean) {
  // Enable foreign keys on local SQLite only
  if (isLocal) {
    try {
      await db.execute('PRAGMA foreign_keys = ON;');
    } catch (e) {
      console.warn('Could not enable foreign keys:', e);
    }
  }

  // Create sources table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT,
      category TEXT NOT NULL
    );
  `);

  // Create tech_events table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tech_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      ai_summary TEXT,
      impact_score INTEGER DEFAULT 5,
      category TEXT DEFAULT 'General',
      primary_link TEXT,
      created_at TEXT DEFAULT (datetime('now', 'utc'))
    );
  `);

  // Create raw_articles table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS raw_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER,
      source_id INTEGER,
      original_title TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      fetched_at TEXT DEFAULT (datetime('now', 'utc')),
      FOREIGN KEY(event_id) REFERENCES tech_events(id) ON DELETE SET NULL,
      FOREIGN KEY(source_id) REFERENCES sources(id)
    );
  `);

  // Index for fast retention-policy queries
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_raw_articles_fetched_at ON raw_articles(fetched_at);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_tech_events_created_at ON tech_events(created_at);
  `);

  // Create bookmarks table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      event_id INTEGER PRIMARY KEY,
      bookmarked_at TEXT DEFAULT (datetime('now', 'utc')),
      FOREIGN KEY(event_id) REFERENCES tech_events(id) ON DELETE CASCADE
    );
  `);

  // Seed default and new sources individually if missing
  const sources = [
    ['Hacker News',    'https://hacker-news.firebaseio.com/v0',  'API'],
    ['TechCrunch',     'https://techcrunch.com/feed/',            'RSS'],
    ['arXiv CS/AI',    'http://export.arxiv.org/api/query',       'API'],
    ['GitHub Trending','https://github.com/trending',             'Scrape'],
    ['The Verge',      'https://www.theverge.com/rss/index.xml',  'RSS'],
    ['Wired',          'https://www.wired.com/feed/rss',           'RSS'],
    ['Ars Technica',   'http://feeds.arstechnica.com/arstechnica/index', 'RSS'],
    ['VentureBeat',    'https://venturebeat.com/feed/',            'RSS'],
    ['MIT Tech Review','https://www.technologyreview.com/feed/',   'RSS'],
    ['Dev.to',              'https://dev.to/api/articles',        'API'],
    ['Product Hunt',        'https://www.producthunt.com/',       'Scrape'],
    ['Reddit r/technology', 'https://www.reddit.com/r/technology','API'],
    ['Reddit r/MachineLearning', 'https://www.reddit.com/r/MachineLearning', 'API'],
    
    // New 5 premium tech & AI blogs
    ['OpenAI Blog',         'https://openai.com/blog/rss.xml',         'RSS'],
    ['Hugging Face Blog',   'https://huggingface.co/blog/feed.xml',    'RSS'],
    ['AWS News Blog',       'https://aws.amazon.com/blogs/aws/feed/',   'RSS'],
    ['Engadget',            'https://www.engadget.com/rss.xml',        'RSS'],
    ['The Register',        'https://www.theregister.com/headlines.rss', 'RSS']
  ];

  for (const src of sources) {
    const res = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM sources WHERE name = ?',
      args: [src[0]]
    });
    const exists = Number(res.rows[0]?.count || 0) > 0;
    if (!exists) {
      await db.execute({
        sql: 'INSERT INTO sources (name, url, category) VALUES (?, ?, ?)',
        args: src
      });
    }
  }
}

export async function getDb(): Promise<Client> {
  if (!dbInstance) {
    const hasTurso = process.env.TURSO_DATABASE_URL && 
                     process.env.TURSO_AUTH_TOKEN && 
                     process.env.TURSO_AUTH_TOKEN !== 'your_auth_token_here';
                     
    const url = hasTurso ? process.env.TURSO_DATABASE_URL! : 'file:tech24.db';
    const authToken = hasTurso ? process.env.TURSO_AUTH_TOKEN! : '';
    const isLocal = url.startsWith('file:');
    
    dbInstance = createClient({ url, authToken });
    await initDb(dbInstance, isLocal);
  }
  return dbInstance;
}
