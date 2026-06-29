import { DatabaseSync } from 'node:sqlite';
import path from 'path';

let dbInstance: DatabaseSync | null = null;

function initDb(db: DatabaseSync) {
  // Enable foreign keys
  db.exec('PRAGMA foreign_keys = ON;');

  // Create sources table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT,
      category TEXT NOT NULL
    );
  `);

  // Create tech_events table
  db.exec(`
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
  db.exec(`
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
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_raw_articles_fetched_at ON raw_articles(fetched_at);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tech_events_created_at ON tech_events(created_at);
  `);

  // Create bookmarks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      event_id INTEGER PRIMARY KEY,
      bookmarked_at TEXT DEFAULT (datetime('now', 'utc')),
      FOREIGN KEY(event_id) REFERENCES tech_events(id) ON DELETE CASCADE
    );
  `);

  // Seed all 13 default sources if table is empty
  const checkSources = db.prepare('SELECT COUNT(*) as count FROM sources');
  const result = checkSources.get() as { count: number };

  if (result && result.count === 0) {
    const insertSource = db.prepare('INSERT INTO sources (name, url, category) VALUES (?, ?, ?)');

    // Original 4 sources
    insertSource.run('Hacker News',    'https://hacker-news.firebaseio.com/v0',  'API');
    insertSource.run('TechCrunch',     'https://techcrunch.com/feed/',            'RSS');
    insertSource.run('arXiv CS/AI',    'http://export.arxiv.org/api/query',       'API');
    insertSource.run('GitHub Trending','https://github.com/trending',             'Scrape');

    // New RSS sources
    insertSource.run('The Verge',      'https://www.theverge.com/rss/index.xml',  'RSS');
    insertSource.run('Wired',          'https://www.wired.com/feed/rss',           'RSS');
    insertSource.run('Ars Technica',   'http://feeds.arstechnica.com/arstechnica/index', 'RSS');
    insertSource.run('VentureBeat',    'https://venturebeat.com/feed/',            'RSS');
    insertSource.run('MIT Tech Review','https://www.technologyreview.com/feed/',   'RSS');

    // New API / Scrape sources
    insertSource.run('Dev.to',              'https://dev.to/api/articles',        'API');
    insertSource.run('Product Hunt',        'https://www.producthunt.com/',       'Scrape');
    insertSource.run('Reddit r/technology', 'https://www.reddit.com/r/technology','API');
    insertSource.run('Reddit r/MachineLearning', 'https://www.reddit.com/r/MachineLearning', 'API');
  }
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    const dbPath = path.resolve(process.cwd(), 'tech24.db');
    dbInstance = new DatabaseSync(dbPath);
    initDb(dbInstance);
  }
  return dbInstance;
}
