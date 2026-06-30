import { NextResponse } from 'next/server';
import { runIngestionPipeline } from '@/lib/engine';
import { after } from 'next/server';

export const maxDuration = 60; // Allow it to run up to 60 seconds (Next.js serverless config)
export const dynamic = 'force-dynamic';

async function handleIngest() {
  try {
    after(async () => {
      try {
        const result = await runIngestionPipeline();
        console.log(`[API Ingest] Background pipeline finished. Fetched: ${result.articlesFetched}, New: ${result.newArticles}, Events: ${result.eventsCreated}`);
      } catch (err: any) {
        console.error('[API Ingest] Background pipeline failed:', err);
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Ingestion pipeline triggered in the background'
    });
  } catch (err: any) {
    console.error('[API Ingest] Error triggering pipeline:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to trigger ingestion pipeline', details: err.message },
      { status: 500 }
    );
  }
}

export async function POST() {
  return handleIngest();
}

export async function GET() {
  return handleIngest();
}
