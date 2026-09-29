const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { WebSocket } = require('ws');
const {
  app,
  server,
  rooms,
  pingInterval,
  cleanupInterval,
  ipRoomCreations
} = require('../server');
const {
  buildDeck,
  calculateSpeedBonus,
  scoreAnswer,
  assignPlayerTitles,
  ALL_CARDS
} = require('../lib/game');

let testServer;
let wsUrl;

function connectWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function sendAndReceive(ws, type, payload, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Timeout waiting for response to ${type}`));
    }, timeoutMs);
    const handler = (data) => {
      clearTimeout(timer);
      const msg = JSON.parse(data.toString());
      ws.removeListener('message', handler);
      resolve(msg);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ v: 1, type, payload }));
  });
}

function waitForRoomState(ws, phase = null, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Timeout waiting for room_state (${phase || 'any'})`));
    }, timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'room_state') {
        if (!phase || msg.payload.phase === phase) {
          clearTimeout(timer);
          ws.removeListener('message', handler);
          resolve(msg);
        }
      }
    };
    ws.on('message', handler);
  });
}


describe('Phase 3 Core Game Loop & Scoring Engine Tests', () => {
  before(async () => {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      testServer = server.listen(0, () => {
        const port = testServer.address().port;
        wsUrl = `ws://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    clearInterval(pingInterval);
    clearInterval(cleanupInterval);
    await new Promise((resolve) => testServer.close(resolve));
  });

  beforeEach(() => {
    ipRoomCreations.clear();
  });

  test('1. Deck Building: 10 rounds, correct mix, no 3 same types in a row', () => {
    for (let i = 0; i < 20; i++) {
      const deck = buildDeck({ deepDive: true, playerCount: 4 });
      assert.strictEqual(deck.length, 10);

      const shoes = deck.filter(c => c.type === 'shoes').length;
      const reel = deck.filter(c => c.type === 'reel').length;
      const smooth = deck.filter(c => c.type === 'smooth').length;
      const caption = deck.filter(c => c.type === 'caption').length;

      assert.strictEqual(shoes, 3);
      assert.strictEqual(reel, 3);
      assert.strictEqual(smooth, 2);
      assert.strictEqual(caption, 2);

      // Check no 3 consecutive same types
      for (let j = 0; j < deck.length - 2; j++) {
        const t1 = deck[j].type;
        const t2 = deck[j + 1].type;
        const t3 = deck[j + 2].type;
        assert.ok(!(t1 === t2 && t2 === t3), `Found 3 consecutive ${t1} at index ${j}`);
      }
    }
  });

  test('2. Deck Building: Deep Dive pack toggle and player count fallback', () => {
    // When deepDive is false, 0 deep cards
    const coreOnlyDeck = buildDeck({ deepDive: false, playerCount: 4 });
    const deepInCore = coreOnlyDeck.filter(c => c.pack === 'deep').length;
    assert.strictEqual(deepInCore, 0);

    // When deepDive is true, >= 3 deep cards
    const deepDeck = buildDeck({ deepDive: true, playerCount: 4 });
    const deepCount = deepDeck.filter(c => c.pack === 'deep').length;
    assert.ok(deepCount >= 3, `Expected >= 3 deep cards, got ${deepCount}`);

    // When playerCount < 3, caption write mode is replaced with pick mode
    const smallGroupDeck = buildDeck({ deepDive: true, playerCount: 2 });
    const writeModeCards = smallGroupDeck.filter(c => c.type === 'caption' && c.mode === 'write').length;
    assert.strictEqual(writeModeCards, 0);
  });

  test('3. Card Exhaustion: Never repeat a card across games until pool exhausted', () => {
    const usedCardIds = new Set();
    const deck1 = buildDeck({ deepDive: true, playerCount: 4, usedCardIds });
    const deck1Ids = new Set(deck1.map(c => c.id));
    assert.strictEqual(deck1Ids.size, 10);

    const deck2 = buildDeck({ deepDive: true, playerCount: 4, usedCardIds });
    const deck2Ids = new Set(deck2.map(c => c.id));
    assert.strictEqual(deck2Ids.size, 10);

    // Ensure zero overlap between game 1 and game 2
    let overlap = 0;
    deck2.forEach(c => {
      if (deck1Ids.has(c.id)) overlap++;
    });
    assert.strictEqual(overlap, 0);
  });

  test('4. Speed Bonus Formula: 1s grace period, cap at 50, and linear decay', () => {
    const duration = 20000;
    const start = 100000;

    // Within 1000ms grace period -> 50
    assert.strictEqual(calculateSpeedBonus(start, start + 200, duration), 50);
    assert.strictEqual(calculateSpeedBonus(start, start + 1000, duration), 50);

    // Mid-way through remaining time (1000 + 9500 = 10500ms elapsed) -> ~25
    const mid = calculateSpeedBonus(start, start + 10500, duration);
    assert.ok(mid >= 23 && mid <= 27, `Expected ~25, got ${mid}`);

    // At expiration -> 0
    assert.strictEqual(calculateSpeedBonus(start, start + 20000, duration), 0);
    assert.strictEqual(calculateSpeedBonus(start, start + 25000, duration), 0);
  });

  test('5. Scoring & Streak Engine: Shoes, Reel, Streak bonus (+25 on streak 3)', () => {
    const sampleShoes = ALL_CARDS.find(c => c.type === 'shoes');
    const sampleReel = ALL_CARDS.find(c => c.type === 'reel');

    const start = 100000;
    const recv = start + 500; // Under 1s grace -> +50 speed

    // Shoes: both correct
    const shoesAns = { q1Index: sampleShoes.q1.correct, q2Index: sampleShoes.q2.correct };
    const s1 = scoreAnswer(sampleShoes, shoesAns, recv, start, 30000, 0);
    assert.strictEqual(s1.basePoints, 200); // 50 (q1) + 100 (q2) + 50 (speed)
    assert.strictEqual(s1.totalPointsGained, 200);
    assert.strictEqual(s1.newStreak, 1);

    // Reel: correct answer with streak reaching 3
    const reelAns = { answerIndex: sampleReel.q2.correct };
    const r1 = scoreAnswer(sampleReel, reelAns, recv, start, 20000, 2);
    assert.strictEqual(r1.basePoints, 150); // 100 (correct) + 50 (speed)
    assert.strictEqual(r1.streakBonus, 25); // Streak = 3 -> +25
    assert.strictEqual(r1.totalPointsGained, 175);
    assert.strictEqual(r1.newStreak, 3);
  });

  test('6. Full End-to-End WebSocket Game Round: No correct keys during Question, Score calculated on Reveal', async () => {
    const hostWs = await connectWs();
    const hostRes = await sendAndReceive(hostWs, 'create_room', { nickname: 'HostPlayer' });
    const code = hostRes.payload.roomCode;

    const guestWs = await connectWs();
    await sendAndReceive(guestWs, 'join_room', { code, nickname: 'GuestPlayer' });

    // Host starts game
    const introPromise = waitForRoomState(hostWs, 'ROUND_INTRO');
    hostWs.send(JSON.stringify({ v: 1, type: 'start_game', payload: {} }));

    // Both should receive ROUND_INTRO
    const introMsg = await introPromise;
    assert.strictEqual(introMsg.type, 'room_state');
    assert.strictEqual(introMsg.payload.phase, 'ROUND_INTRO');
    assert.strictEqual(introMsg.payload.round, 1);

    // Wait for auto-transition to QUESTION (3s timer)
    const questionMsg = await waitForRoomState(hostWs, 'QUESTION', 5000);
    assert.strictEqual(questionMsg.type, 'room_state');
    assert.strictEqual(questionMsg.payload.phase, 'QUESTION');

    // CRITICAL: Ensure NO answer key / correct index is present in question payload!
    const qCard = questionMsg.payload.card;
    assert.strictEqual(qCard.correct, undefined);
    if (qCard.q1) assert.strictEqual(qCard.q1.correct, undefined);
    if (qCard.q2) assert.strictEqual(qCard.q2.correct, undefined);

    const roundId = questionMsg.payload.roundId;

    // Both players submit valid answers
    let ansPayload;
    if (qCard.type === 'shoes') {
      ansPayload = { roundId, q1Index: 0, q2Index: 0 };
    } else {
      ansPayload = { roundId, answerIndex: 0 };
    }

    // Pre-register reveal listener
    const revealPromise = waitForRoomState(hostWs, 'REVEAL', 5000);

    // Submit for guest
    guestWs.send(JSON.stringify({ v: 1, type: 'submit_answer', payload: ansPayload }));

    // Submit for host
    hostWs.send(JSON.stringify({ v: 1, type: 'submit_answer', payload: ansPayload }));

    // Wait for instant lock & REVEAL transition
    const revealMsg = await revealPromise;
    assert.strictEqual(revealMsg.type, 'room_state');
    assert.strictEqual(revealMsg.payload.phase, 'REVEAL');
    assert.ok(revealMsg.payload.explain);
    assert.ok(revealMsg.payload.playerResults);
    assert.strictEqual(revealMsg.payload.playerResults.length, 2);

    hostWs.close();
    guestWs.close();
  });
});

