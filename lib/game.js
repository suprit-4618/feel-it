const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateDeckForTopic } = require('./aiGenerator');

const cardsPath = process.env.CARDS_FILE_PATH || path.join(__dirname, '..', 'content', 'cards.json');
const packsDir = process.env.PACKS_DIR_PATH || path.join(__dirname, '..', 'content', 'packs');

let ALL_CARDS = [];
const CATEGORY_PACKS = new Map();

function loadAllPacks() {
  // 1. Load default empathy cards
  try {
    const data = fs.readFileSync(cardsPath, 'utf8');
    ALL_CARDS = JSON.parse(data);
    CATEGORY_PACKS.set('empathy', ALL_CARDS);
  } catch (e) {
    console.error('Error loading cards.json:', e);
  }

  // 2. Load modular category packs
  if (fs.existsSync(packsDir)) {
    const files = fs.readdirSync(packsDir);
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const catName = file.replace('.json', '');
        try {
          const content = fs.readFileSync(path.join(packsDir, file), 'utf8');
          const cards = JSON.parse(content);
          CATEGORY_PACKS.set(catName, cards);
        } catch (err) {
          console.error(`Error loading pack ${file}:`, err);
        }
      }
    });
  }

  return ALL_CARDS;
}

// Initial load
loadAllPacks();

const CHALLENGES = [
  "Ask one friend or family member today how they are really doing, and listen for 2 minutes without offering any advice.",
  "Notice when someone looks left out in a group chat or room today, and send them a friendly private message.",
  "If someone in your home is having a tough day or cramps, quietly offer a glass of water or a heat pack without making a fuss.",
  "Turn off the tap while brushing your teeth today and pick up one piece of litter you see outside.",
  "Compliment someone on their creative work, effort, or kindness instead of their appearance today."
];

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Calculates speed bonus with 1.0s grace period and max 50 points.
 */
function calculateSpeedBonus(startTime, receiveTime, durationMs) {
  const elapsed = Math.max(0, receiveTime - startTime);
  if (elapsed <= 1000) {
    return 50;
  }
  const remaining = durationMs - 1000;
  if (remaining <= 0) return 0;
  const decayFraction = Math.max(0, 1 - ((elapsed - 1000) / remaining));
  return Math.min(50, Math.max(0, Math.round(50 * decayFraction)));
}

/**
 * Validates whether a deck arrangement has no 3 same types in a row
 */
function isValidDeckSequence(deck) {
  for (let i = 0; i < deck.length - 2; i++) {
    if (deck[i].type === deck[i + 1].type && deck[i + 1].type === deck[i + 2].type) {
      return false;
    }
  }
  return true;
}

/**
 * Synchronously builds a 10-round deck from a given category or the core bank.
 */
function buildDeck(options = {}) {
  const {
    category = 'empathy',
    deepDive = true,
    playerCount = 2,
    usedCardIds = new Set()
  } = options;

  let sourceCards = CATEGORY_PACKS.get(category) || ALL_CARDS;
  if (!sourceCards || sourceCards.length === 0) {
    sourceCards = ALL_CARDS;
  }

  let availableCards = sourceCards.filter(c => {
    if (!deepDive && c.pack === 'deep') return false;
    return !usedCardIds.has(c.id);
  });

  // If available cards are fewer than 10, reset used cards pool
  if (availableCards.length < 10) {
    usedCardIds.clear();
    availableCards = sourceCards.filter(c => {
      if (!deepDive && c.pack === 'deep') return false;
      return true;
    });
  }

  // Filter available by type
  const shoesPool = availableCards.filter(c => c.type === 'shoes');
  const reelPool = availableCards.filter(c => c.type === 'reel');
  const smoothPool = availableCards.filter(c => c.type === 'smooth');
  let captionPool = availableCards.filter(c => c.type === 'caption');

  // If playerCount < 3, only pick mode caption cards can be used. If fewer than 2 pick cards exist in pack, adapt write cards to pick mode.
  if (playerCount < 3) {
    const pickCards = captionPool.filter(c => c.mode !== 'write');
    if (pickCards.length >= 2) {
      captionPool = pickCards;
    } else {
      captionPool = captionPool.map(c => {
        if (c.mode === 'write') {
          return {
            ...c,
            mode: 'pick',
            q2: c.q2 || {
              prompt: c.prompt || "Pick the funniest / best caption:",
              options: [
                "The ultimate moment! 😂",
                "Literally me every single time 💀",
                "No thoughts, just vibes ✨"
              ],
              correct: 0
            }
          };
        }
        return c;
      });
    }
  }

  // Helper to pick N cards
  function pickCards(pool, count) {
    const shuffled = shuffle(pool);
    return shuffled.slice(0, count);
  }

  // Try multiple permutations to satisfy sequence and deep constraints
  for (let attempt = 0; attempt < 500; attempt++) {
    let selectedShoes = pickCards(shoesPool, 3);
    let selectedReel = pickCards(reelPool, 3);
    let selectedSmooth = pickCards(smoothPool, 2);
    let selectedCaption = pickCards(captionPool, 2);

    if (selectedShoes.length < 3 || selectedReel.length < 3 || selectedSmooth.length < 2 || selectedCaption.length < 2) {
      // Fallback to all source cards if subsets ran low
      selectedShoes = pickCards(sourceCards.filter(c => c.type === 'shoes'), 3);
      selectedReel = pickCards(sourceCards.filter(c => c.type === 'reel'), 3);
      selectedSmooth = pickCards(sourceCards.filter(c => c.type === 'smooth'), 2);
      let caps = sourceCards.filter(c => c.type === 'caption');
      if (playerCount < 3) {
        caps = caps.map(c => c.mode === 'write' ? {
          ...c,
          mode: 'pick',
          q2: c.q2 || {
            prompt: c.prompt || "Pick the best caption:",
            options: ["The ultimate moment! 😂", "Literally me every time 💀", "No thoughts, just vibes ✨"],
            correct: 0
          }
        } : c);
      }
      selectedCaption = pickCards(caps, 2);
    }

    const deck = [...selectedShoes, ...selectedReel, ...selectedSmooth, ...selectedCaption];
    const deepCount = deck.filter(c => c.pack === 'deep').length;

    if (category === 'empathy' && deepDive && deepCount < 3 && sourceCards.filter(c => c.pack === 'deep').length >= 3) {
      // Continue searching for a permutation with >= 3 deep cards
      continue;
    }

    // Shuffle deck and verify no 3 identical types consecutively
    const shuffledDeck = shuffle(deck);
    if (isValidDeckSequence(shuffledDeck)) {
      shuffledDeck.forEach(c => usedCardIds.add(c.id));
      return shuffledDeck;
    }
  }

  // Fallback: greedy interleave
  const fallback = shuffle([
    ...shoesPool.slice(0, 3),
    ...reelPool.slice(0, 3),
    ...smoothPool.slice(0, 2),
    ...captionPool.slice(0, 2)
  ]);
  fallback.forEach(c => usedCardIds.add(c.id));
  return fallback;
}

/**
 * Async Deck Builder with AI Generation support & local pack fallback.
 */
async function buildDeckAsync(options = {}) {
  const {
    category = 'empathy',
    customTopic = '',
    useAi = false,
    deepDive = true,
    playerCount = 2,
    usedCardIds = new Set()
  } = options;

  // 1. If AI mode is enabled or custom category requested, attempt Gemini AI generation
  if ((category === 'custom' || useAi) && (customTopic || category)) {
    const topicToPrompt = customTopic.trim() || category;
    try {
      const aiDeck = await generateDeckForTopic(topicToPrompt, { playerCount });
      if (aiDeck && Array.isArray(aiDeck) && aiDeck.length >= 8) {
        let deck = aiDeck.slice(0, 10);
        if (isValidDeckSequence(deck)) {
          return deck;
        }
        const shuffled = shuffle(deck);
        return shuffled;
      }
    } catch (err) {
      console.warn('[Game Engine] AI generation fallback:', err.message);
    }
  }

  // 2. Standard Curated Deck Builder
  return buildDeck(options);
}

/**
 * Calculates scoring for a player's answer on a given card
 */
function scoreAnswer(card, answer, receiveTime, startTime, durationMs, currentStreak = 0) {
  let basePoints = 0;
  let isFullyCorrect = false;
  let wasCorrectObj = {};
  const speedBonus = calculateSpeedBonus(startTime, receiveTime, durationMs);

  if (card.type === 'shoes') {
    let q1Correct = false;
    if (answer && typeof answer.q1Index === 'number') {
      if (Array.isArray(card.q1.correct)) {
        q1Correct = card.q1.correct.includes(answer.q1Index);
      } else {
        q1Correct = answer.q1Index === card.q1.correct;
      }
    }

    let q2Correct = false;
    if (answer && typeof answer.q2Index === 'number') {
      if (Array.isArray(card.q2.correct)) {
        q2Correct = card.q2.correct.includes(answer.q2Index);
      } else {
        q2Correct = answer.q2Index === card.q2.correct;
      }
    }

    wasCorrectObj = { q1Correct: !!q1Correct, q2Correct: !!q2Correct };

    if (q1Correct) basePoints += 50;
    if (q2Correct) {
      basePoints += 100;
      basePoints += speedBonus;
    }
    isFullyCorrect = !!(q1Correct && q2Correct);
  } else if (card.type === 'reel' || card.type === 'smooth' || (card.type === 'caption' && card.mode === 'pick')) {
    const correctIdx = card.q2 ? card.q2.correct : (card.q1 ? card.q1.correct : 0);
    let isCorrect = false;
    if (answer && typeof answer.answerIndex === 'number') {
      if (Array.isArray(correctIdx)) {
        isCorrect = correctIdx.includes(answer.answerIndex);
      } else {
        isCorrect = answer.answerIndex === correctIdx;
      }
    }
    wasCorrectObj = isCorrect;

    if (isCorrect) {
      basePoints = 100 + speedBonus;
      isFullyCorrect = true;
    }
  }

  // Streak calculation: streak resets immediately to 0 on any wrong answer
  let newStreak = isFullyCorrect ? currentStreak + 1 : 0;
  let streakBonus = 0;
  if (isFullyCorrect && newStreak > 0 && newStreak % 3 === 0) {
    streakBonus = 25;
  }

  const totalPointsGained = basePoints + streakBonus;

  return {
    basePoints,
    speedBonus: isFullyCorrect ? speedBonus : 0,
    streakBonus,
    totalPointsGained,
    isFullyCorrect,
    wasCorrectObj,
    newStreak
  };
}

/**
 * Computes leaderboard with shared ranks on ties (e.g. 1, 1, 3)
 */
function computeLeaderboard(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let currentRank = 1;
  return sorted.map((p, idx) => {
    if (idx > 0 && p.score < sorted[idx - 1].score) {
      currentRank = idx + 1;
    }
    return {
      rank: currentRank,
      playerId: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      streak: p.streak || 0,
      teamBonus: p.teamBonus || 0
    };
  });
}

/**
 * Assigns personalized titles at the end of the game
 */
function assignPlayerTitles(playerStats) {
  const titles = [];
  const assigned = new Set();

  // 1. Empathy Champion (Highest score)
  const sortedByScore = [...playerStats].sort((a, b) => b.score - a.score);
  if (sortedByScore.length > 0) {
    const top = sortedByScore[0];
    titles.push({
      playerId: top.id,
      nickname: top.nickname,
      title: "Empathy Champion 👑",
      reason: `Finished in 1st place with ${top.score} pts`
    });
    assigned.add(top.id);
  }

  // 2. Speed Demon (Highest average speed bonus on correct answers)
  const speedCandidates = playerStats
    .filter(p => !assigned.has(p.id) && p.totalSpeedBonus > 0)
    .sort((a, b) => b.totalSpeedBonus - a.totalSpeedBonus);

  if (speedCandidates.length > 0) {
    const fastest = speedCandidates[0];
    titles.push({
      playerId: fastest.id,
      nickname: fastest.nickname,
      title: "Lightning Intuition ⚡",
      reason: `Fastest empathetic responses (+${fastest.totalSpeedBonus} speed bonus)`
    });
    assigned.add(fastest.id);
  }

  // 3. Streak Master (Longest correct streak)
  const streakCandidates = playerStats
    .filter(p => !assigned.has(p.id) && p.maxStreak >= 2)
    .sort((a, b) => b.maxStreak - a.maxStreak);

  if (streakCandidates.length > 0) {
    const streaker = streakCandidates[0];
    titles.push({
      playerId: streaker.id,
      nickname: streaker.nickname,
      title: "Streak Virtuoso 🔥",
      reason: `Hit an incredible ${streaker.maxStreak}-round streak`
    });
    assigned.add(streaker.id);
  }

  // Fallback titles for remaining players
  const fallbackTitles = [
    { title: "Compassion Anchor ⚓", reason: "Steady emotional support across all rounds" },
    { title: "Perspective Master 👟", reason: "Always looked at the situation from another viewpoint" },
    { title: "Myth Buster 🔍", reason: "Called out misinformation and stood for the truth" },
    { title: "Heart of Gold 💛", reason: "Contributed consistently to the Team Empathy Meter" }
  ];

  let fbIdx = 0;
  playerStats.forEach(p => {
    if (!assigned.has(p.id)) {
      const fb = fallbackTitles[fbIdx % fallbackTitles.length];
      titles.push({
        playerId: p.id,
        nickname: p.nickname,
        title: fb.title,
        reason: fb.reason
      });
      fbIdx++;
      assigned.add(p.id);
    }
  });

  return titles;
}

module.exports = {
  ALL_CARDS,
  CATEGORY_PACKS,
  loadAllPacks,
  buildDeck,
  buildDeckAsync,
  calculateSpeedBonus,
  isValidDeckSequence,
  scoreAnswer,
  computeLeaderboard,
  assignPlayerTitles,
  CHALLENGES
};
