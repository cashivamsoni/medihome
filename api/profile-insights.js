// api/profile-insights.js
// Vercel serverless function — runs on Vercel's servers, never in the browser.
// Powers the Owner Health Profile's Health Score + Recommendations by having
// Gemini reason over that owner's actual BMI and recent Health Diary entries,
// instead of the blunt keyword list this used to run on. Same setup as
// api/chat.js — reuses the same GEMINI_API_KEY env var.

const MODEL = 'gemini-3.5-flash-lite';

// ── Simple in-memory rate limit (separate pool from the chat assistant's) ──
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60000;
const requestLog = new Map();

function isRateLimited(id) {
  const now = Date.now();
  const timestamps = (requestLog.get(id) || []).filter(t => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(id, timestamps);
  return timestamps.length > RATE_LIMIT;
}

function computeBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  if (h <= 0) return null;
  const bmi = weightKg / (h * h);
  return isFinite(bmi) ? bmi : null;
}
function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

function clampScore(n) {
  n = Math.round(Number(n));
  if (isNaN(n)) return null;
  return Math.max(0, Math.min(100, n));
}
function cleanStringArray(arr, max) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(x => typeof x === 'string' && x.trim())
    .map(x => x.trim().slice(0, 140))
    .slice(0, max);
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
    res.status(429).json({ error: 'Too many requests — please wait a moment.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set in Vercel environment variables.');
    res.status(500).json({ error: 'Insights are not configured yet.' });
    return;
  }

  const body = req.body || {};
  const weight = typeof body.weight === 'number' ? body.weight : null;
  const height = typeof body.height === 'number' ? body.height : null;
  const age = typeof body.age === 'number' ? body.age : null;
  const gender = typeof body.gender === 'string' ? body.gender.slice(0, 20) : '';
  // Cap entries defensively even though the client already trims this list —
  // never trust request size, and keep the prompt (and quota use) small.
  const entries = Array.isArray(body.entries) ? body.entries.slice(0, 15) : [];
  const safeEntries = entries.map(e => ({
    date: typeof e.date === 'string' ? e.date.slice(0, 10) : '',
    issue: typeof e.issue === 'string' ? e.issue.slice(0, 200) : '',
    medicines: typeof e.medicines === 'string' ? e.medicines.slice(0, 200) : '',
    cured: e.cured === true,
    daysTracked: typeof e.daysTracked === 'number' && e.daysTracked > 0 ? Math.round(e.daysTracked) : 1
  })).filter(e => e.issue);

  const bmi = computeBMI(weight, height);
  const category = bmiCategory(bmi);

  const diaryText = safeEntries.length
    ? safeEntries.map(e => `- ${e.date || 'undated'}: ${e.issue}${e.medicines ? ` (took: ${e.medicines})` : ''}${e.daysTracked > 1 ? ` [ongoing ${e.daysTracked} days via check-ins, same single issue — not ${e.daysTracked} separate occurrences]` : ''}${e.cured ? ` [RESOLVED — marked cured${e.daysTracked > 1 ? ` after ${e.daysTracked} days` : ''}]` : ''}`).join('\n')
    : '(No Health Diary entries logged yet.)';

  const systemPrompt =
    'You generate a wellbeing score and short recommendations for one person in a ' +
    'family medicine-tracking app, based on their BMI and their own recent Health ' +
    'Diary log (self-reported health notes + medicines taken). Respond with ONLY ' +
    'raw JSON, no markdown fences, no commentary, matching exactly this shape:\n' +
    '{"score": <integer 0-100>, "note": "<one short sentence, <=18 words, plain and ' +
    'encouraging tone>", "do": ["...", "..."], "avoid": ["...", "..."], "yoga": ["...", "..."]}\n' +
    '"do", "avoid", and "yoga" should each have 2-4 short, concrete, practical items ' +
    '(yoga asanas, breathing exercises, or light physical activity). Tailor them to ' +
    'the actual STILL-ACTIVE issues in the diary below when there are any (skip ones ' +
    'marked resolved/cured — no need to keep recommending for something already fixed) ' +
    '— not generic filler — and to the BMI category otherwise. ' +
    'This household is strictly pure vegetarian and does not eat eggs, meat, fish, or ' +
    'any other non-vegetarian food, and also avoids onion and garlic — never suggest ' +
    'any of these in "do" or elsewhere, and only ever suggest food that fits this diet.\n\n' +
    'Scoring guidance — use real judgment, not a fixed formula:\n' +
    '- Start from how close the BMI is to the healthy 18.5–24.9 range (closer to ' +
    'the middle, ~21.7, is better).\n' +
    '- Then adjust for the Health Diary: purely cosmetic or trivial complaints ' +
    '(a pimple, dandruff, dry lips, a mild scrape, occasional mild headache, etc.) ' +
    'should barely move the score at all — a couple of these with an otherwise ' +
    'healthy BMI should still land in the 80s or 90s. ' +
    'Genuinely concerning things — a fever, an infection, chest pain, breathlessness, ' +
    'a diagnosed condition, an injury, or a DIFFERENT issue that keeps coming back across ' +
    'separate entries (suggesting a recurring pattern) — should pull the score down more ' +
    'meaningfully, more so the more severe or persistent the pattern looks. ' +
    'An entry marked "[ongoing N days via check-ins]" is ONE single issue the person has ' +
    'been honestly checking in on day after day — it is not N separate problems, so do not ' +
    'multiply the penalty by the day count. It is fine for a longer-running issue to weigh ' +
    'a little more than a same-day one, but scale that gently, and reward the fact that ' +
    'they are tracking it consistently rather than penalizing the honesty of logging it. ' +
    'Entries marked "[RESOLVED — marked cured]" have already been fixed — do not ' +
    'penalize the score for these at all; if anything, treat consistently marking ' +
    'issues as resolved as a good sign of the person managing their health well. ' +
    'No data at all is neutral, not bad. Use your own reasoning about severity; ' +
    'do not just count entries.\n\n' +
    `Person: ${age != null ? age + ' years old, ' : ''}${gender || 'gender not specified'}.\n` +
    `BMI: ${bmi != null ? bmi.toFixed(1) + ' (' + category + ')' : 'not enough data to calculate'}.\n` +
    `Recent Health Diary entries (most relevant first):\n${diaryText}`;

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
        contents: [{ role: 'user', parts: [{ text: 'Generate the JSON now.' }] }],
        generationConfig: { maxOutputTokens: 500 }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error (profile-insights):', response.status, errText);
      if (response.status === 429) {
        res.status(429).json({ error: 'Insights are busy right now (free-tier limit reached) — try again shortly.' });
        return;
      }
      res.status(502).json({ error: 'The insights service returned an error.' });
      return;
    }

    const data = await response.json();
    const rawText =
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text) || '';

    let parsed;
    try {
      // Defensive: strip markdown fences if the model adds them despite instructions.
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Could not parse Gemini JSON (profile-insights):', rawText);
      res.status(502).json({ error: 'Could not generate insights right now.' });
      return;
    }

    const score = clampScore(parsed.score);
    if (score === null) {
      res.status(502).json({ error: 'Could not generate insights right now.' });
      return;
    }

    res.status(200).json({
      score,
      note: typeof parsed.note === 'string' ? parsed.note.trim().slice(0, 200) : '',
      do: cleanStringArray(parsed.do, 4),
      avoid: cleanStringArray(parsed.avoid, 4),
      yoga: cleanStringArray(parsed.yoga, 4)
    });
  } catch (err) {
    console.error('Profile insights proxy error:', err);
    res.status(500).json({ error: 'Server error — please try again.' });
  }
}
