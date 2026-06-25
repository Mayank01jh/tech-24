import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    
    // Fetch all bookmarked events (even if they are older than 24 hours)
    const query = `
      SELECT e.* FROM tech_events e
      JOIN bookmarks b ON e.id = b.event_id
      ORDER BY b.bookmarked_at DESC
    `;
    const stmt = db.prepare(query);
    const events = stmt.all() as any[];

    // Fetch associated articles
    const getArticlesStmt = db.prepare(`
      SELECT r.id, r.original_title, r.url, r.fetched_at, s.name as source_name
      FROM raw_articles r
      JOIN sources s ON r.source_id = s.id
      WHERE r.event_id = ?
    `);

    const enrichedEvents = events.map(event => {
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

      return {
        id: event.id,
        title: event.title,
        ai_summary: parsedSummary,
        impact_score: event.impact_score,
        category: event.category,
        primary_link: event.primary_link,
        created_at: event.created_at,
        bookmarked: true,
        articles
      };
    });

    return NextResponse.json(enrichedEvents);
  } catch (err: any) {
    console.error('[API Bookmarks GET] Error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch bookmarks', details: err.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { eventId } = await request.json();
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const db = getDb();

    // Check if bookmark exists
    const checkStmt = db.prepare('SELECT COUNT(*) as count FROM bookmarks WHERE event_id = ?');
    const result = checkStmt.get(eventId) as { count: number };
    const exists = result ? result.count > 0 : false;

    if (exists) {
      // Remove bookmark
      const deleteStmt = db.prepare('DELETE FROM bookmarks WHERE event_id = ?');
      deleteStmt.run(eventId);
      return NextResponse.json({ bookmarked: false });
    } else {
      // Add bookmark
      const insertStmt = db.prepare('INSERT INTO bookmarks (event_id, bookmarked_at) VALUES (?, datetime(\'now\', \'utc\'))');
      insertStmt.run(eventId);
      return NextResponse.json({ bookmarked: true });
    }
  } catch (err: any) {
    console.error('[API Bookmarks POST] Error:', err);
    return NextResponse.json(
      { error: 'Failed to toggle bookmark', details: err.message },
      { status: 500 }
    );
  }
}
