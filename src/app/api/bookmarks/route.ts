import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = await getDb();
    
    // Fetch all bookmarked events (even if they are older than 24 hours)
    const query = `
      SELECT e.* FROM tech_events e
      JOIN bookmarks b ON e.id = b.event_id
      ORDER BY b.bookmarked_at DESC
    `;
    const eventsRes = await db.execute(query);
    const events = eventsRes.rows;

    const enrichedEvents = await Promise.all(
      events.map(async (event: any) => {
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

        const articlesRes = await db.execute({
          sql: `
            SELECT r.id, r.original_title, r.url, r.fetched_at, s.name as source_name
            FROM raw_articles r
            JOIN sources s ON r.source_id = s.id
            WHERE r.event_id = ?
          `,
          args: [event.id]
        });
        const articles = articlesRes.rows;

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
      })
    );

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

    const db = await getDb();

    // Check if bookmark exists
    const checkRes = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM bookmarks WHERE event_id = ?',
      args: [eventId]
    });
    const count = Number(checkRes.rows[0]?.count || 0);
    const exists = count > 0;

    if (exists) {
      // Remove bookmark
      await db.execute({
        sql: 'DELETE FROM bookmarks WHERE event_id = ?',
        args: [eventId]
      });
      return NextResponse.json({ bookmarked: false });
    } else {
      // Add bookmark
      await db.execute({
        sql: 'INSERT INTO bookmarks (event_id, bookmarked_at) VALUES (?, datetime(\'now\', \'utc\'))',
        args: [eventId]
      });
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
