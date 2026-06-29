const triggerIngest = async () => {
  try {
    console.log(`[Daemon] [${new Date().toISOString()}] Triggering scheduled ingestion...`);
    const res = await fetch('http://localhost:3000/api/ingest', { method: 'POST' });
    if (!res.ok) {
      console.error(`[Daemon] API returned status ${res.status}`);
      return;
    }
    const result = await res.json();
    if (result && result.success) {
      console.log(`[Daemon] Success. Fetched: ${result.articlesFetched}, New: ${result.newArticles}, Events: ${result.eventsCreated}`);
    } else {
      console.error('[Daemon] Ingestion failed:', result ? result.error : 'No response');
    }
  } catch (err) {
    console.error('[Daemon] Ingestion trigger failed:', err.message);
  }
};

// Run immediately on startup
triggerIngest();

// Run every 1 minutes (300,000 ms)
const INTERVAL_MS = 1 * 60 * 1000;
setInterval(triggerIngest, INTERVAL_MS);
console.log(`[Daemon] Background ingestion daemon active (polling every 5 minutes).`);
