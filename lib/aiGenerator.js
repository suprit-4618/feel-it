const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

function getApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/);
      if (match && match[1]) {
        process.env.GEMINI_API_KEY = match[1].trim();
        return process.env.GEMINI_API_KEY;
      }
    }
  } catch {}
  return '';
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_HOST = process.env.GEMINI_API_HOST || 'generativelanguage.googleapis.com';
const GEMINI_TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS || '10000', 10);
const GEMINI_TEMPERATURE = parseFloat(process.env.GEMINI_TEMPERATURE || '0.8');
const GEMINI_TOP_P = parseFloat(process.env.GEMINI_TOP_P || '0.95');

// In-memory deck cache: key (normalized topic) -> cards array
const deckCache = new Map();

/**
 * Builds the strict prompt requesting structured JSON for Feel It's 4 game arenas.
 */
function buildPrompt(topic, options = {}) {
  const is2Player = options.playerCount < 3;
  return `You are an expert game question designer for "Feel It", a friendly, fun multiplayer party game.
Generate a cohesive 10-round party game deck for the topic: "${topic}".

STRICT FORMATTING REQUIREMENTS:
The 10 cards must be a JSON array containing EXACTLY:
- 3 "shoes" cards (perspective taking / relatable dilemmas)
- 3 "reel" cards (Real or Reel? - viral myths, internet claims, or surprising facts where options MUST BE EXACTLY ["Real", "Reel"])
- 2 "smooth" cards (communication / best moves / multiple choice with 3 options)
- 2 "caption" cards (${is2Player ? 'multiple choice with 3 funny options and mode: "pick"' : 'open writing prompt with mode: "write"'})

CARD STRUCTURE DEFINITIONS:

1. SHOES Card:
{
  "id": "ai-shoes-<random>",
  "type": "shoes",
  "pack": "core",
  "topic": "${topic}",
  "scene": "Relatable 1-2 sentence dilemma or situation related to ${topic}",
  "q1": {
    "prompt": "How does the person feel / what is their perspective?",
    "options": ["Option A", "Option B", "Option C"],
    "correct": 0
  },
  "q2": {
    "prompt": "What is the best, kindest, or smartest move?",
    "options": ["Move A", "Move B", "Move C"],
    "correct": 1
  },
  "explain": "Clear explanation of why this was the best move."
}

2. REEL Card (Myth vs Fact):
{
  "id": "ai-reel-<random>",
  "type": "reel",
  "pack": "core",
  "topic": "${topic}",
  "scene": "A viral claim, rumour, or surprising statement about ${topic}",
  "q1": {
    "prompt": "Is this Real or Reel (Myth)?",
    "options": ["Real", "Reel"],
    "correct": 0 // 0 if true statement, 1 if myth/false
  },
  "explain": "The verified reality and fun fact explaining why it is Real or Reel."
}

3. SMOOTH Card (Tactful Choice):
{
  "id": "ai-smooth-<random>",
  "type": "smooth",
  "pack": "core",
  "topic": "${topic}",
  "scene": "A funny, tricky, or energetic scenario about ${topic}",
  "q2": {
    "prompt": "What is the smoothest or most accurate choice?",
    "options": ["Choice A", "Choice B", "Choice C"],
    "correct": 0
  },
  "explain": "Why this choice wins."
}

4. CAPTION Card:
${is2Player ? `{
  "id": "ai-caption-<random>",
  "type": "caption",
  "pack": "core",
  "mode": "pick",
  "topic": "${topic}",
  "scene": "A hilarious or memorable moment about ${topic}",
  "q2": {
    "prompt": "Pick the funniest / most accurate caption:",
    "options": ["Caption A", "Caption B", "Caption C"],
    "correct": 0
  },
  "explain": "Why this caption hits."
}` : `{
  "id": "ai-caption-<random>",
  "type": "caption",
  "pack": "core",
  "mode": "write",
  "topic": "${topic}",
  "scene": "A hilarious or memorable moment about ${topic}",
  "prompt": "Write the best caption for this scene (max 80 chars):",
  "explain": "Vote anonymously for the funniest caption!"
}`}

OUTPUT: Return ONLY the raw JSON array of 10 card objects. No markdown backticks, no code blocks, no intro or outro text.`;
}

/**
 * Calls Gemini REST API to generate a fresh deck.
 */
async function fetchGeminiDeck(topic, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const promptText = buildPrompt(topic, options);

  const payload = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: GEMINI_TEMPERATURE,
      topP: GEMINI_TOP_P
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: GEMINI_API_HOST,
        path: `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: GEMINI_TIMEOUT_MS
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Gemini API error: HTTP ${res.statusCode} - ${data.substring(0, 200)}`));
          }
          try {
            const parsed = JSON.parse(data);
            const rawText = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cards = JSON.parse(rawText.trim());
            if (!Array.isArray(cards) || cards.length < 4) {
              return reject(new Error('Gemini returned an invalid card array structure'));
            }

            // Sanitize IDs and structure
            const sanitized = cards.map((c, idx) => ({
              id: c.id || `ai-${c.type || 'card'}-${Date.now()}-${idx}`,
              type: c.type || 'smooth',
              pack: 'ai-custom',
              topic: c.topic || topic,
              scene: c.scene || `${topic} Question`,
              q1: c.q1,
              q2: c.q2,
              mode: c.mode,
              prompt: c.prompt,
              explain: c.explain || 'Great job discussing this scenario!',
              slang: c.slang || []
            }));

            resolve(sanitized);
          } catch (err) {
            reject(new Error(`Failed to parse Gemini response JSON: ${err.message}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Gets or generates a fresh AI deck with caching.
 */
async function generateDeckForTopic(topic, options = {}) {
  const cacheKey = `${topic.toLowerCase().trim()}_${options.playerCount < 3 ? '2p' : 'multi'}`;

  // Check cache (valid for session duration)
  if (deckCache.has(cacheKey)) {
    const cached = deckCache.get(cacheKey);
    if (cached && cached.length >= 8) {
      return cached;
    }
  }

  try {
    const freshCards = await fetchGeminiDeck(topic, options);
    deckCache.set(cacheKey, freshCards);
    return freshCards;
  } catch (err) {
    console.warn(`[AI Generator] Failed to generate deck for "${topic}": ${err.message}`);
    return null; // Signals fallback to local curated category bank
  }
}

module.exports = {
  generateDeckForTopic,
  fetchGeminiDeck
};
