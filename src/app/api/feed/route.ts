import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const sort = searchParams.get('sort') || 'impact';
    const search = searchParams.get('search');

    const db = getDb();

    // Base query: only select events created in the last 24 hours
    let query = `
      SELECT * FROM tech_events
      WHERE created_at >= datetime('now', '-24 hours')
    `;
    const params: any[] = [];

    if (category && category !== 'All') {
      query += ` AND category = ?`;
      params.push(category);
    }

    if (search) {
      query += ` AND (title LIKE ? OR ai_summary LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (sort === 'newest') {
      query += ` ORDER BY created_at DESC, impact_score DESC`;
    } else {
      // Default: sort by impact score DESC, then recency
      query += ` ORDER BY impact_score DESC, created_at DESC`;
    }

    const stmt = db.prepare(query);
    const events = stmt.all(...params) as any[];

    // Prepared statement to fetch raw articles for an event
    const getArticlesStmt = db.prepare(`
      SELECT r.id, r.original_title, r.url, r.fetched_at, s.name as source_name
      FROM raw_articles r
      JOIN sources s ON r.source_id = s.id
      WHERE r.event_id = ?
    `);

    // Prepared statement to check if bookmarked
    const checkBookmarkStmt = db.prepare(`
      SELECT COUNT(*) as count FROM bookmarks WHERE event_id = ?
    `);

    const enrichedEvents = events.map(event => {
      // Parse summary JSON
      let parsedSummary = { what: '', why: '', who: '' };
      try {
        if (event.ai_summary) {
          parsedSummary = JSON.parse(event.ai_summary);
        }
      } catch (e) {
        parsedSummary = {
          what: event.ai_summary || '',
          why: 'Detailed context and impact of this update.',
          who: 'Developers, system administrators, and industry professionals.'
        };
      }

      const articles = getArticlesStmt.all(event.id) as any[];
      const isBookmarkedResult = checkBookmarkStmt.get(event.id) as { count: number };
      const bookmarked = isBookmarkedResult ? isBookmarkedResult.count > 0 : false;

      return {
        id: event.id,
        title: event.title,
        ai_summary: parsedSummary,
        impact_score: event.impact_score,
        category: event.category,
        primary_link: event.primary_link,
        created_at: event.created_at,
        bookmarked,
        articles
      };
    });

    return NextResponse.json(enrichedEvents);
  } catch (err: any) {
    console.error('[API Feed] Error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch feed events', details: err.message },
      { status: 500 }
    );
  }
}
