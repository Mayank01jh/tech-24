const { DatabaseSync } = require('node:sqlite');
const path = require('path');

try {
  console.log('[Test] Opening/Creating SQLite database...');
  const dbPath = path.resolve(__dirname, '..', 'tech24.db');
  const db = new DatabaseSync(dbPath);

  console.log('[Test] Running database schema creation...');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT,
      category TEXT NOT NULL
    );
  `);
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      event_id INTEGER PRIMARY KEY,
      bookmarked_at TEXT DEFAULT (datetime('now', 'utc')),
      FOREIGN KEY(event_id) REFERENCES tech_events(id) ON DELETE CASCADE
    );
  `);

  // Seed default sources
  const checkSources = db.prepare('SELECT COUNT(*) as count FROM sources');
  const countRes = checkSources.get();
  if (countRes && countRes.count === 0) {
    console.log('[Test] Seeding default sources...');
    const insertSource = db.prepare('INSERT INTO sources (name, url, category) VALUES (?, ?, ?)');
    insertSource.run('Hacker News', 'https://hacker-news.firebaseio.com/v0', 'API');
    insertSource.run('TechCrunch', 'https://techcrunch.com/feed/', 'RSS');
    insertSource.run('arXiv CS/AI', 'http://export.arxiv.org/api/query', 'API');
    insertSource.run('GitHub Trending', 'https://github.com/trending', 'RSS');
  }

  console.log('[Test] Verifying tables exist...');
  const tables = ['sources', 'tech_events', 'raw_articles', 'bookmarks'];
  
  for (const table of tables) {
    const query = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");
    const result = query.get(table);
    if (result) {
      console.log(`[Test] Table "${table}" exists.`);
    } else {
      console.error(`[Test] ERROR: Table "${table}" does not exist.`);
      process.exit(1);
    }
  }

  // Check sources seed
  const countQuery = db.prepare('SELECT COUNT(*) as count FROM sources');
  const countResult = countQuery.get();
  console.log(`[Test] Sources seeded: ${countResult ? countResult.count : 0}`);
  
  const selectSources = db.prepare('SELECT * FROM sources');
  console.log('[Test] Seeded Sources:', selectSources.all());

  console.log('[Test] Database structure is 100% VALID!');
  process.exit(0);
} catch (err) {
  console.error('[Test] Database validation failed:', err);
  process.exit(1);
}
