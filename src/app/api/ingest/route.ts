import { NextResponse } from 'next/server';
import { runIngestionPipeline } from '@/lib/engine';

export const maxDuration = 60; // Allow it to run up to 60 seconds (Next.js serverless config)
export const dynamic = 'force-dynamic';

async function handleIngest() {
  try {
    const result = await runIngestionPipeline();
    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (err: any) {
    console.error('[API Ingest] Error running pipeline:', err);
    return NextResponse.json(
      { success: false, error: 'Ingestion pipeline failed', details: err.message },
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
