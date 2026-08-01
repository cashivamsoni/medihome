// api/chat.js
// Vercel serverless function — runs on Vercel's servers, never in the browser.
// This is the ONLY place your Gemini API key should ever appear.
//
// Setup:
//   1. Get a free API key at https://aistudio.google.com/apikey
//      (no credit card required)
//   2. In your Vercel project: Settings → Environment Variables →
//      add GEMINI_API_KEY = <your key> → redeploy
//   3. Make sure this file lives at /api/chat.js in your repo root
//      (sibling to your other project files, not inside a subfolder).

const MODEL = 'gemini-3.5-flash-lite'; // current GA model with best free-tier headroom

// ── Simple in-memory rate limit ────────────────────────────
// Caps how many messages one caller (by IP, since no auth token is checked
// here) can send per minute — cheap insurance against a stuck tab or script
// draining the whole app's shared free-tier quota. Resets on cold starts,
// which is an acceptable trade-off for a small family app.
const RATE_LIMIT = 10;       // max requests
const RATE_WINDOW_MS = 60000; // per this many ms (1 minute)
const requestLog = new Map(); // identifier -> array of request timestamps

function isRateLimited(id) {
  const now = Date.now();
  const timestamps = (requestLog.get(id) || []).filter(t => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(id, timestamps);
  return timestamps.length > RATE_LIMIT;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const identifier =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (isRateLimited(identifier)) {
    res.status(429).json({ error: 'Too many messages — please wait a moment before asking again.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set in Vercel environment variables.');
    res.status(500).json({ error: 'Assistant is not configured yet.' });
    return;
  }

  const { message, context } = req.body || {};
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Message is required.' });
    return;
  }
  // Basic guardrails: cap length so a runaway request can't burn through quota
  const safeMessage = message.slice(0, 2000);
  const safeContext = (context || '').slice(0, 6000);

  const systemPrompt =
    'You are a helpful assistant embedded in MediHome, a family medicine ' +
    'inventory app. Use the inventory data below when the question is about ' +
    'the user\'s own medicines (stock, expiry, owners, categories). For ' +
    'anything else, answer from general knowledge. Keep answers short and ' +
    'conversational — a few sentences, not an essay. If asked for medical ' +
    'advice beyond basic factual info, suggest consulting a doctor or ' +
    'pharmacist rather than diagnosing or recommending dosages.\n\n' +
    'Current inventory:\n' + (safeContext || 'No data provided.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: safeMessage }] }],
        generationConfig: { maxOutputTokens: 400 }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText);
      // 429 = free-tier rate limit hit — a clear, specific message helps
      // more than a generic one when this happens.
      if (response.status === 429) {
        res.status(429).json({ error: 'The assistant is a bit busy right now (free-tier limit reached) — try again in a moment.' });
        return;
      }
      res.status(502).json({ error: 'The assistant service returned an error.' });
      return;
    }

    const data = await response.json();
    const reply =
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text) ||
      "Sorry, I couldn't generate a response.";
    res.status(200).json({ reply });
  } catch (err) {
    console.error('Chat proxy error:', err);
    res.status(500).json({ error: 'Server error — please try again.' });
  }
}
