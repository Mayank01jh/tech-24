import { NextResponse } from 'next/server';

const langCodeMap: Record<string, string> = {
  'Hindi': 'hi',
  'Spanish': 'es',
  'French': 'fr',
  'German': 'de',
  'Chinese': 'zh-CN',
  'Japanese': 'ja',
  'English': 'en'
};

async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || text.trim() === '') return '';
  const langCode = langCodeMap[targetLang] || 'en';
  if (langCode === 'en') return text;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${langCode}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    if (!res.ok) throw new Error(`Google Translate status ${res.status}`);
    const data = await res.json();
    if (data && data[0]) {
      return data[0].map((x: any) => x[0]).join('');
    }
    return text;
  } catch (err) {
    console.warn(`[Translate] Google Translate failed for "${text.substring(0, 20)}...", returning original:`, err);
    return text;
  }
}

export async function POST(request: Request) {
  try {
    const { events, targetLanguage } = await request.json();

    if (!targetLanguage || targetLanguage === 'English') {
      return NextResponse.json({ success: true, translatedEvents: events });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ success: true, translatedEvents: [] });
    }

    // Translate all events sequentially/concurrently using Google Translate
    const translatedEvents = await Promise.all(
      events.map(async (e: any) => {
        const [title, what, why, who] = await Promise.all([
          translateText(e.title, targetLanguage),
          translateText(e.ai_summary.what, targetLanguage),
          translateText(e.ai_summary.why, targetLanguage),
          translateText(e.ai_summary.who, targetLanguage)
        ]);

        return {
          ...e,
          title,
          ai_summary: { what, why, who }
        };
      })
    );

    return NextResponse.json({ success: true, translatedEvents });
  } catch (err: any) {
    console.error('[API Translate] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Translation failed', details: err.message },
      { status: 500 }
    );
  }
}
