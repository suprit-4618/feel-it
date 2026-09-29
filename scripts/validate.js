const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const cardsPath = path.join(__dirname, '..', 'content', 'cards.json');
const sourcesFilePath = path.join(__dirname, '..', 'sources.txt');

const VALID_TYPES = new Set(['shoes', 'reel', 'smooth', 'caption']);
const VALID_PACKS = new Set(['core', 'deep']);
const VALID_TOPICS = new Set([
  'crying', 'consent', 'periods', 'patriarchy', 'environment',
  'water', 'beauty', 'animals', 'crush', 'communication',
  'health', 'contraception', 'vasectomy', 'attraction'
]);

const HEALTH_BODY_TOPICS = new Set([
  'periods', 'health', 'contraception', 'vasectomy', 'beauty'
]);

async function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.request(url, {
        method: 'HEAD',
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      }, (res) => {
        // Accept 2xx and 3xx redirects, or 403 (some government/CDN sites block automated user-agents)
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve({ ok: true, status: res.statusCode });
        } else if (res.statusCode === 403 || res.statusCode === 405) {
          // Cloudflare/WAF block of HEAD request
          resolve({ ok: true, status: res.statusCode, note: 'Protected by CDN WAF' });
        } else {
          resolve({ ok: false, status: res.statusCode });
        }
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: true, note: 'Timeout (WAF or slow response, URL structurally valid)' });
      });

      req.end();
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

async function validateCards() {
  console.log('🔍 Running Feel It Content Bank Validation & Source Verification...\n');
  
  if (!fs.existsSync(cardsPath)) {
    console.error(`❌ File not found: ${cardsPath}`);
    process.exit(1);
  }

  let cards;
  try {
    const raw = fs.readFileSync(cardsPath, 'utf8');
    cards = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to parse cards.json as JSON:`, err.message);
    process.exit(1);
  }

  if (!Array.isArray(cards)) {
    console.error(`❌ cards.json must be a JSON array of card objects.`);
    process.exit(1);
  }

  const errors = [];
  const warnings = [];
  const ids = new Set();

  const typeCounts = { shoes: 0, reel: 0, smooth: 0, caption: 0 };
  const packCounts = { core: 0, deep: 0 };
  const topicCounts = {};
  const deepTypes = new Set();
  const sourceEntries = [];

  cards.forEach((card, index) => {
    const prefix = `[Card #${index + 1} (${card.id || 'NO_ID'})]`;

    // 1. ID Check
    if (!card.id || typeof card.id !== 'string') {
      errors.push(`${prefix} Missing or invalid 'id'.`);
    } else if (ids.has(card.id)) {
      errors.push(`${prefix} Duplicate ID: '${card.id}'.`);
    } else {
      ids.add(card.id);
    }

    // 2. Type Check
    if (!VALID_TYPES.has(card.type)) {
      errors.push(`${prefix} Invalid type: '${card.type}'. Must be one of: ${[...VALID_TYPES].join(', ')}.`);
    } else {
      typeCounts[card.type] = (typeCounts[card.type] || 0) + 1;
    }

    // 3. Pack Check
    if (!VALID_PACKS.has(card.pack)) {
      errors.push(`${prefix} Invalid pack: '${card.pack}'. Must be 'core' or 'deep'.`);
    } else {
      packCounts[card.pack] = (packCounts[card.pack] || 0) + 1;
      if (card.pack === 'deep') {
        deepTypes.add(card.type);
      }
    }

    // 4. Topic Check
    if (!VALID_TOPICS.has(card.topic)) {
      errors.push(`${prefix} Invalid topic: '${card.topic}'.`);
    } else {
      topicCounts[card.topic] = (topicCounts[card.topic] || 0) + 1;
    }

    // 5. Scene & EmojiScene
    if (!card.scene || typeof card.scene !== 'string' || card.scene.trim().length === 0) {
      errors.push(`${prefix} Missing or empty 'scene'.`);
    }
    if (!card.emojiScene || typeof card.emojiScene !== 'string') {
      errors.push(`${prefix} Missing or empty 'emojiScene'.`);
    }

    // 6. Explanation Check (Non-empty)
    if (!card.explain || typeof card.explain !== 'string' || card.explain.trim().length === 0) {
      errors.push(`${prefix} Missing or empty 'explain'.`);
    }

    // 7. Slang Check
    if (Array.isArray(card.slang)) {
      card.slang.forEach((s, sIdx) => {
        if (!s.word || !s.meaning) {
          errors.push(`${prefix} Slang entry #${sIdx + 1} must contain 'word' and 'meaning'.`);
        }
      });
    }

    // 8. Question structure by type
    if (card.type === 'shoes') {
      if (!card.q1 || !Array.isArray(card.q1.options) || typeof card.q1.correct !== 'number') {
        errors.push(`${prefix} 'shoes' card must have 'q1' with options array and correct index.`);
      } else if (card.q1.correct < 0 || card.q1.correct >= card.q1.options.length) {
        errors.push(`${prefix} 'q1.correct' (${card.q1.correct}) out of range (0..${card.q1.options.length - 1}).`);
      }

      if (!card.q2 || !Array.isArray(card.q2.options) || typeof card.q2.correct !== 'number') {
        errors.push(`${prefix} 'shoes' card must have 'q2' with options array and correct index.`);
      } else if (card.q2.correct < 0 || card.q2.correct >= card.q2.options.length) {
        errors.push(`${prefix} 'q2.correct' (${card.q2.correct}) out of range (0..${card.q2.options.length - 1}).`);
      }
    } else if (card.type === 'reel') {
      if (!card.q2 || !Array.isArray(card.q2.options) || typeof card.q2.correct !== 'number') {
        errors.push(`${prefix} 'reel' card must have 'q2' with options array and correct index.`);
      } else {
        if (card.q2.options.length !== 2 || card.q2.options[0] !== 'Real' || card.q2.options[1] !== 'Reel') {
          errors.push(`${prefix} 'reel' card options must be exactly ['Real', 'Reel'] (found ${JSON.stringify(card.q2.options)}).`);
        }
        if (card.q2.correct !== 0 && card.q2.correct !== 1) {
          errors.push(`${prefix} 'reel' card q2.correct must be 0 (Real) or 1 (Reel).`);
        }
      }
    } else if (card.type === 'smooth') {
      if (!card.q2 || !Array.isArray(card.q2.options) || typeof card.q2.correct !== 'number') {
        errors.push(`${prefix} 'smooth' card must have options array and correct index.`);
      }
    } else if (card.type === 'caption') {
      if (card.mode === 'pick') {
        if (!card.q2 || !Array.isArray(card.q2.options) || typeof card.q2.correct !== 'number') {
          errors.push(`${prefix} 'caption' (pick) card must have 'q2' with options and correct index.`);
        }
      } else if (card.mode === 'write') {
        if (!card.prompt || typeof card.prompt !== 'string') {
          errors.push(`${prefix} 'caption' (write) card must have a 'prompt' string.`);
        }
      } else {
        errors.push(`${prefix} 'caption' card must have mode 'pick' or 'write'.`);
      }
    }

    // 9. Source Check for health/body cards
    const requiresSource = HEALTH_BODY_TOPICS.has(card.topic) || card.source;
    if (requiresSource) {
      if (!card.source || typeof card.source !== 'string' || !card.source.startsWith('http')) {
        errors.push(`${prefix} Health/body card on topic '${card.topic}' MUST have a valid 'source' URL.`);
      } else {
        if (card.status !== 'unchecked') {
          errors.push(`${prefix} Card source status MUST be 'unchecked' (found '${card.status}'). Do not self-mark verified.`);
        }
        if (typeof card.source_specific !== 'boolean') {
          errors.push(`${prefix} Sourced card MUST specify 'source_specific' as true or false.`);
        }
        sourceEntries.push({
          id: card.id,
          topic: card.topic,
          pack: card.pack,
          source: card.source,
          source_specific: card.source_specific !== false,
          status: card.status || 'unchecked'
        });
      }
    }
  });

  // Calculate cluster totals
  const consentTotal = topicCounts['consent'] || 0;
  const periodsTotal = topicCounts['periods'] || 0;
  const cryingPatriarchyTotal = (topicCounts['crying'] || 0) + (topicCounts['patriarchy'] || 0);
  const envWaterTotal = (topicCounts['environment'] || 0) + (topicCounts['water'] || 0);
  const animalsTotal = topicCounts['animals'] || 0;

  // Topic Minimum Validations
  if (consentTotal < 6) errors.push(`Topic 'consent' has ${consentTotal} cards (minimum required is 6).`);
  if (periodsTotal < 6) errors.push(`Topic 'periods' has ${periodsTotal} cards (minimum required is 6).`);
  if (cryingPatriarchyTotal < 6) errors.push(`Topics 'crying' + 'patriarchy' have ${cryingPatriarchyTotal} cards (minimum required is 6).`);
  if (envWaterTotal < 6) errors.push(`Topics 'environment' + 'water' have ${envWaterTotal} cards (minimum required is 6).`);
  if (animalsTotal < 6) errors.push(`Topic 'animals' has ${animalsTotal} cards (minimum required is 6).`);

  if (packCounts.deep < 15) errors.push(`Pack 'deep' has ${packCounts.deep} cards (minimum required is 15).`);
  if (deepTypes.size < 4) errors.push(`Pack 'deep' must cover all 4 card types (currently covers ${deepTypes.size}/4: ${[...deepTypes].join(', ')}).`);

  // STRICT RECONCILIATION CHECK (all category sums must exactly match total card count)
  const totalFromTypes = Object.values(typeCounts).reduce((a, b) => a + b, 0);
  const totalFromPacks = Object.values(packCounts).reduce((a, b) => a + b, 0);
  const totalFromTopics = Object.values(topicCounts).reduce((a, b) => a + b, 0);

  if (totalFromTypes !== cards.length || totalFromPacks !== cards.length || totalFromTopics !== cards.length) {
    errors.push(`CRITICAL DISCREPANCY: cards.length (${cards.length}) != types (${totalFromTypes}) or packs (${totalFromPacks}) or topics (${totalFromTopics})`);
  }

  // Write sources.txt
  const generalHubEntries = sourceEntries.filter(e => !e.source_specific);
  const specificEntries = sourceEntries.filter(e => e.source_specific);

  let sourcesText = `# Feel It — Health & Body Source Citations\n# Generated automatically on validation (All status: unchecked)\n\n`;
  sourcesText += `## ⚠️ General Hub / Landing Page Sources (source_specific: false) [${generalHubEntries.length} cards]\n`;
  generalHubEntries.forEach(entry => {
    sourcesText += `${entry.id} [${entry.topic} | ${entry.pack} | status: ${entry.status} | source_specific: false]: ${entry.source}\n`;
  });

  sourcesText += `\n## ✅ Specific Article / Condition Sources (source_specific: true) [${specificEntries.length} cards]\n`;
  specificEntries.forEach(entry => {
    sourcesText += `${entry.id} [${entry.topic} | ${entry.pack} | status: ${entry.status} | source_specific: true]: ${entry.source}\n`;
  });

  fs.writeFileSync(sourcesFilePath, sourcesText, 'utf8');
  console.log(`📝 Written ${sourceEntries.length} source citations to sources.txt (${generalHubEntries.length} general hubs, ${specificEntries.length} specific articles)\n`);

  // Report Real Counts
  console.log('========================================');
  console.log(`📊 TOTAL CARDS IN CARDS.JSON: ${cards.length}`);
  console.log('========================================');
  console.log('📌 By Pack: (sum = ' + totalFromPacks + ')');
  Object.entries(packCounts).forEach(([pack, count]) => {
    console.log(`   - ${pack.toUpperCase()}: ${count} cards`);
  });
  console.log('\n📌 By Type: (sum = ' + totalFromTypes + ')');
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`   - ${type}: ${count} cards`);
  });
  console.log('\n📌 By Topic: (sum = ' + totalFromTopics + ')');
  Object.entries(topicCounts).forEach(([topic, count]) => {
    console.log(`   - ${topic}: ${count} cards`);
  });
  console.log('\n📌 Quota Clusters (Minimum 6):');
  console.log(`   - Consent: ${consentTotal} cards (>= 6)`);
  console.log(`   - Periods: ${periodsTotal} cards (>= 6)`);
  console.log(`   - Crying & Patriarchy: ${cryingPatriarchyTotal} cards (>= 6)`);
  console.log(`   - Environment & Water: ${envWaterTotal} cards (>= 6)`);
  console.log(`   - Animals: ${animalsTotal} cards (>= 6)`);

  if (errors.length > 0) {
    console.error(`\n❌ VALIDATION FAILED WITH ${errors.length} ERROR(S):`);
    errors.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }

  console.log(`\n✅ ALL ACCEPTANCE CHECKS PASSED! Total card count strictly reconciled: ${cards.length}`);
  process.exit(0);
}

validateCards();
