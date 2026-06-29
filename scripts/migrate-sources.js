/**
 * Migration: Add 9 new news sources to the existing tech24.db
 * Run once with: node scripts/migrate-sources.js
 */
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.resolve(process.cwd(), 'tech24.db');
const db = new DatabaseSync(dbPath);

const newSources = [
  ['The Verge',                'https://www.theverge.com/rss/index.xml',           'RSS'],
  ['Wired',                    'https://www.wired.com/feed/rss',                    'RSS'],
  ['Ars Technica',             'http://feeds.arstechnica.com/arstechnica/index',    'RSS'],
  ['VentureBeat',              'https://venturebeat.com/feed/',                     'RSS'],
  ['MIT Tech Review',          'https://www.technologyreview.com/feed/',            'RSS'],
  ['Dev.to',                   'https://dev.to/api/articles',                       'API'],
  ['Product Hunt',             'https://www.producthunt.com/',                      'Scrape'],
  ['Reddit r/technology',      'https://www.reddit.com/r/technology',               'API'],
  ['Reddit r/MachineLearning', 'https://www.reddit.com/r/MachineLearning',          'API'],
];

const checkStmt = db.prepare('SELECT COUNT(*) as count FROM sources WHERE name = ?');
const insertStmt = db.prepare('INSERT INTO sources (name, url, category) VALUES (?, ?, ?)');

let added = 0;
let skipped = 0;

for (const [name, url, category] of newSources) {
  const row = checkStmt.get(name);
  if (row.count === 0) {
    insertStmt.run(name, url, category);
    console.log(`[Migration] Added source: ${name}`);
    added++;
  } else {
    console.log(`[Migration] Skipped (already exists): ${name}`);
    skipped++;
  }
}

console.log(`\n[Migration] Done. Added: ${added}, Skipped: ${skipped}`);
db.close();
