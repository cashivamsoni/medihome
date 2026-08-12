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
  const safeContext = (context || '').slice(0, 24000);

  const systemPrompt =
    'You are a helpful assistant embedded in MediHome, a family medicine ' +
    'inventory app. Use the data below when the question is about the ' +
    'user\'s own medicines, branches, owners, categories, types, forms, or ' +
    'health diary entries. Medicines have a #ID shown on their card (e.g. #05).\n\n' +
    'App features you should know about and can explain if asked "how do I...":\n' +
    '- Add/Edit/Delete medicines, with fields: name, description, type, form, ' +
    'owner, category, quantity+unit, expiry date, frequently-used flag, low-stock flag, notes, image.\n' +
    '- Search bar: finds by name, owner, category, type, form, or the word "frequent".\n' +
    '- Filters/stat chips: All, Low Stock, Expiring Soon, Expired.\n' +
    '- Bulk Select mode: tap Select in the menu, tap cards to select, then bulk change owner/category or delete.\n' +
    '- Sort options: by Expiry, Name, Quantity, or Recently Added.\n' +
    '- Manage (in the menu): add/edit/delete Owners, Categories, Types, Forms.\n' +
    '- Branches (in the menu): separate "houses", each with its own medicines/owners/etc. ' +
    'One branch can be set as Default (auto-opens on refresh); switching branches is temporary until refresh.\n' +
    '- Health Diary (in the menu): per-owner log of health updates and medicines taken, with a search bar. For an ongoing issue, tap the calendar-plus "check in" button on that entry each day it\'s still happening instead of adding a new entry — it keeps the diary clean and tracks a day count on that one entry.\n' +
    '- Health Diary entries may include a dose marker like "M", "A", "E" (Morning, Afternoon, Evening) showing which times of day medicine was taken that day.\n' +
    '- A Health Diary entry tagged "[RESOLVED/CURED]" means that problem has been marked fixed by the user — treat it as resolved, not ongoing, when answering. Entries without that tag are still considered active/unresolved.\n' +
    '- For an ongoing issue (like a pimple being treated over several days), the user checks in on the SAME entry each day instead of creating a new one — you may see "[ongoing, day N]" on an entry, meaning it is one single issue that has been active for N days, not N separate occurrences.\n' +
    '- Owner Health Profile (in the menu): a per-owner profile (not shown for the shared/family owner) with a photo, weight, height, date of birth, and gender, editable right there along with the owner\'s name. ' +
    'It calculates actual BMI vs. the healthy 18.5–24.9 range, an overall wellbeing score out of 100, and Do/Avoid/Yoga-exercise suggestions based on the BMI category. ' +
    'It also surfaces that owner\'s recent Health Diary entries and a tally of medicines they\'ve taken recently, pulled live from the Health Diary. ' +
    'These recommendations and the score are AI-generated from that owner\'s BMI and their actual recent Health Diary entries (weighing trivial things like a pimple lightly and serious or recurring things more heavily) — still general wellness guidance, not a doctor\'s or dietitian\'s assessment — ' +
    'if asked, say so plainly and suggest a doctor for anything specific or concerning.\n' +
    '- Quantity Log (in the menu): read-only log of the last 20 medicine additions, deletions, and quantity increases/decreases, with a search bar.\n' +
    '- Export PDF, Share, Dark Mode toggle, and Reset to defaults are also in the menu.\n' +
    '- A reorder alert banner shows medicines that are low/finished.\n\n' +
    'For anything outside the app, answer from general knowledge. Keep answers ' +
    'short and conversational — a few sentences, not an essay. If asked for ' +
    'medical advice beyond basic factual info, suggest consulting a doctor or ' +
    'pharmacist rather than diagnosing or recommending dosages. You may wrap ' +
    'important keywords in double asterisks like **this** for strong emphasis ' +
    '(renders bold), or single asterisks like *this* for lighter emphasis ' +
    '(renders semi-bold) — use both sparingly, only for genuinely key terms.\n\n' +
    'Current data:\n' + (safeContext || 'No data provided.');

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
