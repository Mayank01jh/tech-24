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

  // Create bookmarks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      event_id INTEGER PRIMARY KEY,
      bookmarked_at TEXT DEFAULT (datetime('now', 'utc')),
      FOREIGN KEY(event_id) REFERENCES tech_events(id) ON DELETE CASCADE
    );
  `);

  // Seed default sources if they don't exist
  const checkSources = db.prepare('SELECT COUNT(*) as count FROM sources');
  const result = checkSources.get() as { count: number };
  
  if (result && result.count === 0) {
    const insertSource = db.prepare('INSERT INTO sources (name, url, category) VALUES (?, ?, ?)');
    insertSource.run('Hacker News', 'https://hacker-news.firebaseio.com/v0', 'API');
    insertSource.run('TechCrunch', 'https://techcrunch.com/feed/', 'RSS');
    insertSource.run('arXiv CS/AI', 'http://export.arxiv.org/api/query', 'API');
    insertSource.run('GitHub Trending', 'https://github.com/trending', 'RSS');
  }
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    // Save the DB file in the root directory
    const dbPath = path.resolve(process.cwd(), 'tech24.db');
    dbInstance = new DatabaseSync(dbPath);
    initDb(dbInstance);
  }
  return dbInstance;
}
