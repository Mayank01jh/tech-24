import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60; // Allow 60s for translation batch

export async function POST(request: Request) {
  try {
    const { events, targetLanguage } = await request.json();

    if (!targetLanguage || targetLanguage === 'English') {
      return NextResponse.json({ success: true, translatedEvents: events });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ success: true, translatedEvents: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY is not configured' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Prepare batch input for Gemini to minimize calls and latency
    const batchData = events.map((e: any) => ({
      id: e.id,
      title: e.title,
      what: e.ai_summary.what,
      why: e.ai_summary.why,
      who: e.ai_summary.who,
    }));

    const prompt = `You are a professional translator. Translate the following technology event cards into ${targetLanguage}.
Keep all technical terms, acronyms, and product names (e.g. OpenAI, LLMs, GPT, GitHub, etc.) intact if they are commonly used in the target language.
Ensure the translation sounds professional, natural, and editorially polished.
Do not summarize or change the meaning, only translate.

Here is the JSON list of events to translate:
${JSON.stringify(batchData, null, 2)}

Return the translations in a JSON array matching the input structure exactly, with the same "id", and translated "title", "what", "why", and "who" fields.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              id: { type: 'INTEGER' },
              title: { type: 'STRING' },
              what: { type: 'STRING' },
              why: { type: 'STRING' },
              who: { type: 'STRING' }
            },
            required: ['id', 'title', 'what', 'why', 'who']
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error('Empty response from translation model');
    const translatedList = JSON.parse(text);

    // Map translated fields back to TechEvent structure
    const translatedEvents = events.map((original: any) => {
      const match = translatedList.find((t: any) => t.id === original.id);
      if (match) {
        return {
          ...original,
          title: match.title,
          ai_summary: {
            what: match.what,
            why: match.why,
            who: match.who
          }
        };
      }
      return original;
    });

    return NextResponse.json({ success: true, translatedEvents });
  } catch (err: any) {
    console.error('[API Translate] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Translation failed', details: err.message },
      { status: 500 }
    );
  }
}
