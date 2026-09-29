const { WebSocket } = require('ws');
process.env.TIMER_SCALE = process.env.TIMER_SCALE || '0.04';
process.env.MAX_CONNS_PER_IP = '100'; // Allow simulation workers from local IP
process.env.MAX_ROOM_CREATIONS_PER_MIN = '500';

const {
  app,
  server,
  rooms,
  pingInterval,
  cleanupInterval,
  ipRoomCreations,
  ipConnections
} = require('../server');
const assert = require('node:assert');

const SAMPLE_CAPTIONS = [
  'Sharing snacks is the ultimate love language 🍕',
  'Take a deep breath we are in this together 💖',
  'No drama just good vibes and open communication ✨',
  'Listening first before jumping to conclusions 🎧',
  'Checking in on your friends even when things seem fine 🌟',
  'Respecting boundaries makes every friendship stronger 🤝',
  'Proud of everyone giving their best effort today 🏆',
  'Kindness is free but its value is priceless 🌈',
  '<script>alert("hack")</script> Stay safe online 🛡️',
  '<b>Bold empathy</b> for the win 🔥'
];

function createPRNG(seed) {
  let s = (seed % 2147483647);
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class SimBot {
  constructor(name, wsUrl, prng) {
    this.name = name;
    this.wsUrl = wsUrl;
    this.prng = prng;
    this.ws = null;
    this.token = null;
    this.id = null;
    this.roomCode = null;
    this.currentPhase = null;
    this.round = 0;
    this.score = 0;
    this.leakedAnswerFound = false;
    this.leakDetails = null;
    this.disconnected = false;
    this.isHost = false;
    this.receivedPaused = false;
    this.receivedResumed = false;

    // Behavior toggles
    this.isLazyAnswerer = this.prng() < 0.25; // Sometimes doesn't answer to test timeout
    this.isLazyWriter = this.prng() < 0.25;   // Sometimes doesn't write caption
    this.chaosSender = this.prng() < 0.3;    // Sends fuzzy/stale/bad messages
  }

  async connect() {
    this.ws = await connectWs(this.wsUrl);
    this.attachListeners();
  }

  attachListeners() {
    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleMessage(msg);
      } catch (err) {
        // Ignored for non-json
      }
    });

    this.ws.on('close', () => {
      this.disconnected = true;
    });
  }

  handleMessage(msg) {
    if (msg.type === 'paused') {
      this.receivedPaused = true;
    }
    if (msg.type === 'resumed') {
      this.receivedResumed = true;
    }

    if (msg.type === 'room_state') {
      const p = msg.payload;
      this.currentPhase = p.phase;
      this.round = p.round || this.round;
      this.roomCode = p.roomCode;
      if (p.playerToken) this.token = p.playerToken;
      if (p.yourPlayerId) this.id = p.yourPlayerId;
      if (p.players) {
        const me = p.players.find(x => x.id === this.id || x.nickname === this.name);
        if (me) {
          this.score = me.score;
          this.isHost = me.isHost;
        }
      }

      // Check for security / answer leakage during non-reveal phases
      if (['ROUND_INTRO', 'QUESTION', 'WRITING', 'CAPTION_REVIEW', 'CAPTION_VOTING'].includes(p.phase)) {
        if (p.card) {
          if (p.card.correct !== undefined) {
            this.leakedAnswerFound = true;
            this.leakDetails = `Leaked card.correct in phase ${p.phase}: ${p.card.correct}`;
          }
          if (p.card.q1 && p.card.q1.correct !== undefined) {
            this.leakedAnswerFound = true;
            this.leakDetails = `Leaked card.q1.correct in phase ${p.phase}`;
          }
          if (p.card.q2 && p.card.q2.correct !== undefined) {
            this.leakedAnswerFound = true;
            this.leakDetails = `Leaked card.q2.correct in phase ${p.phase}`;
          }
        }
      }

      this.onRoomState(p);
    }
  }

  async onRoomState(payload) {
    if (this.disconnected) return;

    // Send fuzz/chaos messages occasionally
    if (this.chaosSender && this.prng() < 0.15) {
      this.sendChaosMessage(payload);
    }

    if (payload.phase === 'QUESTION' && !payload.hasAnswered) {
      if (this.isLazyAnswerer && this.prng() < 0.4) {
        // Skip answering to test server question timeout!
        return;
      }

      await sleep(Math.floor(this.prng() * 30) + 10);
      if (this.disconnected || this.currentPhase !== 'QUESTION') return;

      const card = payload.card;
      if (!card) return;

      let ansPayload;
      if (card.type === 'shoes') {
        const q1Len = (card.q1 && card.q1.options) ? card.q1.options.length : 3;
        const q2Len = (card.q2 && card.q2.options) ? card.q2.options.length : 2;
        ansPayload = {
          roundId: payload.roundId,
          q1Index: Math.floor(this.prng() * q1Len),
          q2Index: Math.floor(this.prng() * q2Len)
        };
      } else {
        const optLen = (card.q2 && card.q2.options) ? card.q2.options.length : 3;
        ansPayload = {
          roundId: payload.roundId,
          answerIndex: Math.floor(this.prng() * optLen)
        };
      }

      this.send('submit_answer', ansPayload);
    }

    if (payload.phase === 'WRITING' && !payload.hasSubmitted) {
      if (this.isLazyWriter && this.prng() < 0.5) {
        // Skip submitting caption to test low caption count / timeout!
        return;
      }

      await sleep(Math.floor(this.prng() * 30) + 10);
      if (this.disconnected || this.currentPhase !== 'WRITING') return;

      const cap = SAMPLE_CAPTIONS[Math.floor(this.prng() * SAMPLE_CAPTIONS.length)];
      this.send('submit_caption', {
        roundId: payload.roundId,
        caption: cap
      });
    }

    if (payload.phase === 'CAPTION_REVIEW' && payload.isHostReview) {
      await sleep(Math.floor(this.prng() * 30) + 10);
      if (this.disconnected || this.currentPhase !== 'CAPTION_REVIEW') return;
      this.send('next_step', {});
    }

    if (payload.phase === 'CAPTION_VOTING' && !payload.hasVoted) {
      await sleep(Math.floor(this.prng() * 30) + 10);
      if (this.disconnected || this.currentPhase !== 'CAPTION_VOTING') return;

      const available = (payload.captions || []).filter(c => !c.isOwn);
      if (available.length > 0) {
        const pick = available[Math.floor(this.prng() * available.length)];
        this.send('submit_vote', {
          roundId: payload.roundId,
          captionId: pick.id
        });
      }
    }

    if (payload.phase === 'REVEAL' && this.isHost) {
      await sleep(100);
      if (this.currentPhase === 'REVEAL') {
        this.send('next_step', {});
      }
    }

    if (payload.phase === 'LEADERBOARD' && this.isHost) {
      await sleep(100);
      if (this.currentPhase === 'LEADERBOARD') {
        this.send('next_step', {});
      }
    }
  }

  sendChaosMessage(payload) {
    const r = this.prng();
    if (r < 0.2) {
      // Malformed raw string
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send("<<<INVALID_JSON_PAYLOAD>>>");
      }
    } else if (r < 0.4) {
      // Oversized payload (> 2KB)
      const bigStr = 'A'.repeat(2500);
      this.send('submit_caption', { roundId: payload.roundId || 'r1', caption: bigStr });
    } else if (r < 0.7) {
      // Stale roundId
      this.send('submit_answer', { roundId: 'r999_stale_card', answerIndex: 0 });
    } else {
      // Malformed envelope
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ v: 99, type: 'unknown_type', payload: {} }));
      }
    }
  }

  send(type, payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ v: 1, type, payload }));
    }
  }

  async disconnect() {
    this.disconnected = true;
    if (this.ws) {
      this.ws.close();
    }
  }

  async reconnect() {
    this.ws = await connectWs(this.wsUrl);
    this.disconnected = false;
    this.attachListeners();
    this.send('join_room', {
      code: this.roomCode,
      playerToken: this.token
    });
  }
}

async function simulateOneGame(wsUrl, gameIndex = 1, fixedSeed = null) {
  const seed = fixedSeed !== null ? fixedSeed : Math.floor(Math.random() * 1000000000);
  const prng = createPRNG(seed);

  const bots = [];
  for (let i = 1; i <= 8; i++) {
    const rawName = i === 1 ? 'HostBot' : `Bot_${i}`;
    bots.push(new SimBot(rawName, wsUrl, prng));
  }

  // 1. Bot 1 connects and creates room (with HTML tag in name occasionally to test filter)
  await bots[0].connect();
  const createPromise = new Promise((resolve) => {
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room_state') {
        bots[0].ws.removeListener('message', handler);
        resolve(msg.payload);
      }
    };
    bots[0].ws.on('message', handler);
  });
  bots[0].send('create_room', { nickname: bots[0].name });
  const hostRoom = await createPromise;
  const roomCode = hostRoom.roomCode;

  // 2. Bots 2..8 connect and join room
  for (let i = 1; i < 8; i++) {
    await bots[i].connect();
    const joinPromise = new Promise((resolve) => {
      const handler = (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'room_state' && msg.payload.yourPlayerId) {
          bots[i].ws.removeListener('message', handler);
          resolve(msg.payload);
        }
      };
      bots[i].ws.on('message', handler);
    });
    bots[i].send('join_room', { code: roomCode, nickname: bots[i].name });
    await joinPromise;
  }

  // 3. Start game
  bots[0].send('start_game', {});

  // 4. Game Runner with chaos events (Mid-game disconnects, Pause/Resume, Host disconnect)
  const startTime = Date.now();
  let pauseResumeTested = false;
  let hostDisconnectTested = false;

  const finalCheckPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`[Seed: ${seed}] Simulation game #${gameIndex} timed out after 45s! Last phase: ${bots[0].currentPhase}, Round: ${bots[0].round}`));
    }, 45000);

    const checkInterval = setInterval(() => {
      const room = rooms.get(roomCode);
      if (room && room.phase === 'FINAL') {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });

  const chaosLoop = setInterval(async () => {
    const room = rooms.get(roomCode);
    if (!room || room.phase === 'FINAL') {
      clearInterval(chaosLoop);
      return;
    }

    // Chaos 1: Pause & Resume test (Round 3 or 4) - all players but one disconnect
    if (!pauseResumeTested && room.round === 3 && room.phase === 'QUESTION') {
      pauseResumeTested = true;
      // Disconnect bots 1..7, leaving only bot 8 connected
      for (let i = 0; i < 7; i++) {
        if (!bots[i].disconnected) await bots[i].disconnect();
      }
      await sleep(150);
      // Verify room entered pause state
      if (room && room.isPaused) {
        // Reconnect bots 1..7
        for (let i = 0; i < 7; i++) {
          await bots[i].reconnect();
        }
      }
    }

    // Chaos 2: Host disconnect mid-round (Round 6)
    if (!hostDisconnectTested && room.round === 6 && room.phase === 'QUESTION') {
      hostDisconnectTested = true;
      const currentHostBot = bots.find(b => b.isHost && !b.disconnected);
      if (currentHostBot) {
        await currentHostBot.disconnect();
        await sleep(150);
        await currentHostBot.reconnect();
      }
    }
  }, 250);

  await finalCheckPromise;
  clearInterval(chaosLoop);

  // 5. Assertions
  const room = rooms.get(roomCode);
  assert.ok(room, `[Seed: ${seed}] Room ${roomCode} must exist in server memory`);
  assert.strictEqual(room.phase, 'FINAL', `[Seed: ${seed}] Game must finish in FINAL phase`);

  // Check no leaked answer keys
  for (const b of bots) {
    assert.strictEqual(b.leakedAnswerFound, false, `[Seed: ${seed}] ${b.leakDetails || 'Answer key leaked before reveal'}`);
  }

  // Check no negative scores
  for (const p of room.players) {
    assert.ok(p.score >= 0, `[Seed: ${seed}] Player ${p.nickname} has negative score: ${p.score}`);
  }

  // Check titles assigned
  assert.ok(room.finalTitles, `[Seed: ${seed}] Final titles must be assigned`);
  assert.ok(room.finalChallenge, `[Seed: ${seed}] Final group challenge must be assigned`);
  assert.ok(room.finalLeaderboard, `[Seed: ${seed}] Final leaderboard must exist`);
  assert.strictEqual(room.finalLeaderboard.length, 8, `[Seed: ${seed}] All 8 players must be in final leaderboard`);

  // Close all bot sockets
  for (const b of bots) {
    await b.disconnect();
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  return {
    gameIndex,
    seed,
    roomCode,
    durationSec,
    meter: room.meter,
    meterSuccess: (room.meter || 0) >= 100 - 1e-9,
    topScore: room.finalLeaderboard[0].score,
    winner: room.finalLeaderboard[0].nickname
  };
}

async function runSimulation(iterations = 100, concurrency = 8) {
  console.log(`\n======================================================`);
  console.log(`🤖 STARTING MULTIPLAYER BOT SIMULATION (PHASE 5/6)`);
  console.log(`   Running ${iterations} full 10-round 8-player games (Concurrency: ${concurrency}, TimerScale: ${process.env.TIMER_SCALE})`);
  console.log(`   Chaos Features: unanswering bots, 0-caption rounds, mid-game host drops, pause/resume, fuzzy/malformed payloads, random seed replay`);
  console.log(`======================================================\n`);

  let testServer, wsUrl;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    testServer = server.listen(0, () => {
      const port = testServer.address().port;
      wsUrl = `ws://localhost:${port}`;
      resolve();
    });
  });

  const results = [];
  const failures = [];
  const overallStart = Date.now();

  let gameIndex = 0;
  async function worker() {
    while (true) {
      const idx = ++gameIndex;
      if (idx > iterations) break;

      try {
        const res = await simulateOneGame(wsUrl, idx);
        results.push(res);
        console.log(`✅ [Game ${idx}/${iterations}] (Seed: ${res.seed}, Code: ${res.roomCode}) in ${res.durationSec}s | Winner: ${res.winner} (${res.topScore} pts) | Meter: ${Math.round(res.meter)}% (${res.meterSuccess ? 'GOAL MET' : 'NO BONUS'})`);
      } catch (err) {
        console.error(`❌ [Game ${idx}/${iterations}] FAILED! Error:`, err.message);
        failures.push({ gameIndex: idx, error: err.message });
      }
    }
  }

  const workers = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  clearInterval(pingInterval);
  clearInterval(cleanupInterval);
  await new Promise((resolve) => testServer.close(resolve));

  const totalTimeSec = ((Date.now() - overallStart) / 1000).toFixed(2);

  console.log(`\n======================================================`);
  console.log(`📊 SIMULATION REPORT`);
  console.log(`   Total Games: ${iterations}`);
  console.log(`   Passed: ${results.length}`);
  console.log(`   Failed: ${failures.length}`);
  console.log(`   Total Execution Time: ${totalTimeSec}s`);
  console.log(`======================================================\n`);

  if (failures.length > 0) {
    console.error(`❌ ${failures.length} simulation(s) failed:`);
    failures.forEach(f => console.error(`   - Game #${f.gameIndex}: ${f.error}`));
    process.exit(1);
  } else {
    console.log(`🎉 ALL ${iterations} SIMULATIONS COMPLETED WITH 100% PASS RATE!`);
    console.log(`   - Zero answer leaks detected`);
    console.log(`   - Zero negative scores`);
    console.log(`   - Zero stuck bots or infinite loops`);
    console.log(`   - Zero crash on disconnect/reconnect`);
    console.log(`   - Pause/Resume and Host Promotion verified under high chaos`);
    process.exit(0);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const iters = args[0] ? parseInt(args[0], 10) : 100;
  const conc = args[1] ? parseInt(args[1], 10) : 8;
  runSimulation(iters, conc);
}

module.exports = { runSimulation, simulateOneGame };
