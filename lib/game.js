const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cardsPath = path.join(__dirname, '..', 'content', 'cards.json');
let ALL_CARDS = [];

function loadCards() {
  const data = fs.readFileSync(cardsPath, 'utf8');
  ALL_CARDS = JSON.parse(data);
  return ALL_CARDS;
}

// Load cards initially
loadCards();

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
 * Builds a 10-round deck following all constraints:
 * - 3 shoes, 3 reel, 2 smooth, 2 caption
 * - No 3 same types in a row
 * - deepDive toggle (if on, >= 3 deep cards; if off, 0 deep cards)
 * - If playerCount < 3, caption write mode is replaced with pick mode
 * - Excludes usedCardIds until pool is exhausted
 */
function buildDeck(options = {}) {
  const {
    deepDive = true,
    playerCount = 2,
    usedCardIds = new Set()
  } = options;

  let availableCards = ALL_CARDS.filter(c => {
    if (!deepDive && c.pack === 'deep') return false;
    return !usedCardIds.has(c.id);
  });

  // If available cards are fewer than 10, reset used cards pool
  if (availableCards.length < 10) {
    usedCardIds.clear();
    availableCards = ALL_CARDS.filter(c => {
      if (!deepDive && c.pack === 'deep') return false;
      return true;
    });
  }

  // Filter available by type
  const shoesPool = availableCards.filter(c => c.type === 'shoes');
  const reelPool = availableCards.filter(c => c.type === 'reel');
  const smoothPool = availableCards.filter(c => c.type === 'smooth');
  let captionPool = availableCards.filter(c => c.type === 'caption');

  // If playerCount < 3, only pick mode caption cards can be used
  if (playerCount < 3) {
    captionPool = captionPool.filter(c => c.mode !== 'write');
  }

  // Helper to pick N cards ensuring deep count if needed
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
      // Fallback to all cards if subsets ran low
      selectedShoes = pickCards(ALL_CARDS.filter(c => c.type === 'shoes'), 3);
      selectedReel = pickCards(ALL_CARDS.filter(c => c.type === 'reel'), 3);
      selectedSmooth = pickCards(ALL_CARDS.filter(c => c.type === 'smooth'), 2);
      let caps = ALL_CARDS.filter(c => c.type === 'caption');
      if (playerCount < 3) caps = caps.filter(c => c.mode !== 'write');
      selectedCaption = pickCards(caps, 2);
    }

    const deck = [...selectedShoes, ...selectedReel, ...selectedSmooth, ...selectedCaption];
    const deepCount = deck.filter(c => c.pack === 'deep').length;

    if (deepDive && deepCount < 3) {
      // Continue searching for a permutation with >= 3 deep cards
      continue;
    }

    // Shuffle deck and verify no 3 identical types consecutively
    const shuffledDeck = shuffle(deck);
    if (isValidDeckSequence(shuffledDeck)) {
      // Track selected cards in usedCardIds
      shuffledDeck.forEach(c => usedCardIds.add(c.id));
      return shuffledDeck;
    }
  }

  // Fallback fallback: greedy interleave
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
  // playerStats: array of { id, nickname, stats: { kindMoveCount, fastestCorrectTime, maxStreak, writeVotes, correctCount } }
  const titles = [];

  // Sort candidates for each category
  const kindMoveSorted = [...playerStats].sort((a, b) => b.stats.kindMoveCount - a.stats.kindMoveCount);
  const streakSorted = [...playerStats].sort((a, b) => b.stats.maxStreak - a.stats.maxStreak);
  const speedSorted = [...playerStats].filter(p => p.stats.fastestCorrectMs < 99999).sort((a, b) => a.stats.fastestCorrectMs - b.stats.fastestCorrectMs);
  const votesSorted = [...playerStats].sort((a, b) => b.stats.writeVotes - a.stats.writeVotes);

  const assignedPlayers = new Set();

  function assign(player, title, reason) {
    if (!player) return;
    titles.push({
      playerId: player.id,
      nickname: player.nickname,
      title,
      reason
    });
    assignedPlayers.add(player.id);
  }

  if (kindMoveSorted.length > 0 && kindMoveSorted[0].stats.kindMoveCount > 0) {
    assign(kindMoveSorted[0], "Certified Ally 💖", `Chose the kindest move ${kindMoveSorted[0].stats.kindMoveCount} times`);
  }

  for (const p of streakSorted) {
    if (!assignedPlayers.has(p.id) && p.stats.maxStreak >= 2) {
      assign(p, "Certified Real One 🌟", `Locked in a ${p.stats.maxStreak}-question empathy streak`);
      break;
    }
  }

  for (const p of speedSorted) {
    if (!assignedPlayers.has(p.id)) {
      assign(p, "Speedy Empath ⚡", `Fastest kind reaction on the team`);
      break;
    }
  }

  for (const p of votesSorted) {
    if (!assignedPlayers.has(p.id) && p.stats.writeVotes > 0) {
      assign(p, "Caption Royalty 👑", `Earned ${p.stats.writeVotes} votes from the crew`);
      break;
    }
  }

  // Fallback for remaining players
  playerStats.forEach(p => {
    if (!assignedPlayers.has(p.id)) {
      assign(p, "Empathy MVP ✨", "Brought great energy and thoughtful answers");
    }
  });

  return titles;
}

module.exports = {
  loadCards,
  buildDeck,
  calculateSpeedBonus,
  scoreAnswer,
  computeLeaderboard,
  assignPlayerTitles,
  CHALLENGES,
  ALL_CARDS
};
