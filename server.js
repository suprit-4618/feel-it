const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { validateNickname, validateCaption } = require('./lib/filter');
const {
  buildDeck,
  calculateSpeedBonus,
  scoreAnswer,
  computeLeaderboard,
  assignPlayerTitles,
  CHALLENGES
} = require('./lib/game');

const PORT = process.env.PORT || 3000;
const app = express();

// Security headers
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:;"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Room storage (In-memory)
const rooms = new Map();

// Flood caps & IP rate limits
const MAX_TOTAL_ROOMS = 200;
const MAX_CONNS_PER_IP = 40;
const MAX_ROOM_CREATIONS_PER_MIN = 5;

const ipConnections = new Map(); // ip -> Set<ws>
const ipRoomCreations = new Map(); // ip -> number[] (timestamps)

function getClientIp(req) {
  if (!req) return '127.0.0.1';
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
  if (trustProxy) {
    const xForwarded = req.headers && req.headers['x-forwarded-for'];
    if (xForwarded && typeof xForwarded === 'string') {
      const parts = xForwarded.split(',');
      const lastIp = parts[parts.length - 1].trim();
      if (lastIp) return lastIp;
    }
  }
  return (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

function getScaledDuration(ms) {
  if (process.env.NODE_ENV === 'production') {
    return ms;
  }
  const scale = parseFloat(process.env.TIMER_SCALE || '1');
  if (!isNaN(scale) && scale > 0) {
    return Math.max(30, Math.round(ms * scale));
  }
  return ms;
}

// Helper constants
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 chars, no I or O
const AVATARS = ['🦊', '🐼', '🐯', '🦁', '🐨', '🐸', '🐙', '🦄', '🐬', '🦉', '🦔', '🦩', '🐝', '🐢', '🦋', '🐶'];

function generateRoomCode() {
  for (let attempts = 0; attempts < 1000; attempts++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      const idx = crypto.randomInt(0, CODE_ALPHABET.length);
      code += CODE_ALPHABET[idx];
    }
    if (!rooms.has(code)) {
      return code;
    }
  }
  return crypto.randomBytes(2).toString('hex').toUpperCase();
}

function generateId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function sendMsg(ws, type, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ v: 1, type, payload }));
  }
}

function sendError(ws, code, message) {
  sendMsg(ws, 'error_msg', { code, message });
}

function broadcastToRoom(room, type, payloadGenerator) {
  for (const player of room.players) {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      const payload = typeof payloadGenerator === 'function' ? payloadGenerator(player) : payloadGenerator;
      sendMsg(player.ws, type, payload);
    }
  }
}

function getSanitizedPlayers(room) {
  return room.players.map(p => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    isHost: p.id === room.hostId,
    connected: p.connected,
    score: p.score,
    streak: p.streak
  }));
}

function buildRoomStatePayload(room, targetPlayer) {
  const isHost = targetPlayer.id === room.hostId;
  const base = {
    roomCode: room.code,
    phase: room.phase,
    yourPlayerId: targetPlayer.id,
    hostId: room.hostId,
    players: getSanitizedPlayers(room),
    settings: room.settings,
    meter: Math.round(room.meter || 0),
    round: room.round,
    totalRounds: room.totalRounds || 10,
    endsAt: room.endsAt
  };

  if (room.phase === 'LOBBY') {
    return base;
  }

  if (room.phase === 'ROUND_INTRO') {
    const card = room.currentCard;
    return {
      ...base,
      roundId: room.roundId,
      cardType: card ? card.type : '',
      topic: card ? card.topic : '',
      pack: card ? card.pack : 'core'
    };
  }

  if (room.phase === 'QUESTION') {
    const card = room.currentCard;
    const answered = room.roundAnswers.has(targetPlayer.id);

    // Sanitize question data: NEVER send correct answers!
    let sanitizedCard = {
      type: card.type,
      topic: card.topic,
      scene: card.scene,
      emojiScene: card.emojiScene
    };

    if (card.type === 'shoes') {
      sanitizedCard.q1 = { prompt: card.q1.prompt, options: card.q1.options };
      sanitizedCard.q2 = { prompt: card.q2.prompt, options: card.q2.options };
    } else if (card.type === 'reel') {
      sanitizedCard.q1 = { prompt: card.q1.prompt, options: card.q1.options };
      sanitizedCard.q2 = { prompt: card.q2.prompt, options: card.q2.options };
    } else if (card.type === 'smooth') {
      sanitizedCard.q2 = { prompt: card.q2.prompt, options: card.q2.options };
    } else if (card.type === 'caption' && card.mode === 'pick') {
      sanitizedCard.mode = 'pick';
      sanitizedCard.q2 = { prompt: card.q2.prompt, options: card.q2.options };
    }

    return {
      ...base,
      roundId: room.roundId,
      card: sanitizedCard,
      questionStartTime: room.questionStartTime,
      answeredCount: room.roundAnswers.size,
      totalPlayers: room.players.filter(p => p.connected).length,
      hasAnswered: answered
    };
  }

  if (room.phase === 'WRITING') {
    const card = room.currentCard;
    const submitted = room.captionSubmissions ? room.captionSubmissions.has(targetPlayer.id) : false;
    return {
      ...base,
      roundId: room.roundId,
      cardType: 'caption',
      mode: 'write',
      topic: card.topic,
      scene: card.scene,
      emojiScene: card.emojiScene,
      prompt: card.prompt,
      submittedCount: room.captionSubmissions ? room.captionSubmissions.size : 0,
      totalPlayers: room.players.filter(p => p.connected).length,
      hasSubmitted: submitted
    };
  }

  if (room.phase === 'CAPTION_REVIEW') {
    const isHost = targetPlayer.id === room.hostId;
    const allSubs = room.captionSubmissions ? [...room.captionSubmissions.values()] : [];
    const approvedSubs = allSubs.filter(c => !c.removed);

    return {
      ...base,
      roundId: room.roundId,
      cardType: 'caption',
      mode: 'write',
      isHostReview: isHost,
      // Host sees authorNickname; non-hosts do NOT receive authorNicknames
      captions: isHost ? approvedSubs.map(c => ({ id: c.id, text: c.text, authorNickname: c.authorNickname })) : [],
      submittedCount: approvedSubs.length,
      totalPlayers: room.players.filter(p => p.connected).length
    };
  }

  if (room.phase === 'CAPTION_VOTING') {
    const approvedSubs = room.approvedCaptions || [];
    const hasVoted = room.captionVotes ? room.captionVotes.has(targetPlayer.id) : false;
    const mySubmission = room.captionSubmissions ? room.captionSubmissions.get(targetPlayer.id) : null;

    return {
      ...base,
      roundId: room.roundId,
      cardType: 'caption',
      mode: 'write',
      // Anonymous captions only! No authorNickname sent to anyone
      captions: approvedSubs.map(c => ({ id: c.id, text: c.text, isOwn: mySubmission ? mySubmission.id === c.id : false })),
      hasVoted,
      votedCount: room.captionVotes ? room.captionVotes.size : 0,
      totalPlayers: room.players.filter(p => p.connected).length
    };
  }

  if (room.phase === 'REVEAL') {
    const card = room.currentCard;
    const result = room.roundResults ? room.roundResults.get(targetPlayer.id) : null;

    const baseReveal = {
      ...base,
      roundId: room.roundId,
      cardType: card.type,
      mode: card.mode,
      topic: card.topic,
      scene: card.scene,
      emojiScene: card.emojiScene,
      explain: card.explain,
      slang: card.slang || [],
      meterDelta: Math.round(room.lastMeterDelta || 0),
      currentMeter: Math.round(room.meter || 0),
      yourAnswer: result ? result.yourAnswer : null,
      wasCorrect: result ? result.wasCorrect : false,
      yourPointsEarned: result ? result.pointsGained : 0,
      speedBonus: result ? result.speedBonus : 0,
      streak: targetPlayer.streak,
      playerResults: room.playerResultsSummary || []
    };

    if (card.type === 'shoes') {
      baseReveal.correctQ1 = card.q1.correct;
      baseReveal.correctQ2 = card.q2.correct;
    } else if (card.type === 'reel' || card.type === 'smooth' || (card.type === 'caption' && card.mode === 'pick')) {
      baseReveal.correctIndex = card.q2 ? card.q2.correct : (card.q1 ? card.q1.correct : 0);
    } else if (card.type === 'caption' && card.mode === 'write') {
      baseReveal.winningCaptions = room.winningCaptions || [];
      baseReveal.allCaptions = room.writeResultsSummary || [];
    }

    return baseReveal;
  }

  if (room.phase === 'LEADERBOARD') {
    return {
      ...base,
      leaderboard: computeLeaderboard(room.players)
    };
  }

  if (room.phase === 'FINAL') {
    return {
      ...base,
      finalScores: computeLeaderboard(room.players),
      meterFinal: room.meter,
      meterSuccess: room.meter >= 100,
      titles: room.finalTitles || [],
      challenge: room.finalChallenge || ''
    };
  }

  return base;
}

function broadcastRoomState(room, exceptPlayerId = null) {
  for (const player of room.players) {
    if (player.id !== exceptPlayerId && player.ws && player.ws.readyState === WebSocket.OPEN) {
      sendMsg(player.ws, 'room_state', buildRoomStatePayload(room, player));
    }
  }
}

function getAvailableAvatar(room) {
  const takenAvatars = new Set(room.players.map(p => p.avatar));
  const available = AVATARS.filter(a => !takenAvatars.has(a));
  if (available.length > 0) {
    return available[crypto.randomInt(0, available.length)];
  }
  return AVATARS[crypto.randomInt(0, AVATARS.length)];
}

function handleHostPromotion(room) {
  const connectedPlayers = room.players.filter(p => p.connected);
  if (connectedPlayers.length === 0) return;

  const newHost = connectedPlayers[0];
  room.hostId = newHost.id;
  room.hostToken = newHost.token;
  for (const p of room.players) {
    p.isHost = p.id === newHost.id;
  }
  broadcastRoomState(room);
}

function clearRoomTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

// -------------------------------------------------------------
// Core Game Loop State Machine
// -------------------------------------------------------------

function startRoundIntro(room) {
  clearRoomTimer(room);
  room.round++;

  if (room.round > (room.totalRounds || 10)) {
    endGame(room);
    return;
  }

  const duration = getScaledDuration(3000);
  room.phase = 'ROUND_INTRO';
  room.currentCard = room.deck[room.round - 1];
  room.roundId = `r${room.round}_${room.currentCard.id}`;
  room.roundAnswers = new Map();
  room.roundResults = new Map();
  room.endsAt = Date.now() + duration;

  broadcastRoomState(room);

  room.timer = setTimeout(() => {
    startQuestion(room);
  }, duration);
  room.timer.unref();
}

function startQuestion(room) {
  clearRoomTimer(room);
  const card = room.currentCard;

  if (card.type === 'caption' && card.mode === 'write' && room.players.filter(p => p.connected).length >= 3) {
    startWriting(room);
    return;
  }

  room.phase = 'QUESTION';
  const duration = getScaledDuration(card.type === 'shoes' ? 30000 : 20000);
  room.questionStartTime = Date.now();
  room.questionDurationMs = duration;
  room.endsAt = Date.now() + duration;

  broadcastRoomState(room);

  room.timer = setTimeout(() => {
    lockAndReveal(room);
  }, duration);
  room.timer.unref();
}

function startWriting(room) {
  clearRoomTimer(room);
  room.phase = 'WRITING';
  const duration = getScaledDuration(20000);
  room.writingStartTime = Date.now();
  room.captionSubmissions = new Map();
  room.captionVotes = new Map();
  room.endsAt = Date.now() + duration;

  broadcastRoomState(room);

  room.timer = setTimeout(() => {
    endWriting(room);
  }, duration);
  room.timer.unref();
}

function endWriting(room) {
  clearRoomTimer(room);
  const submissions = room.captionSubmissions ? [...room.captionSubmissions.values()] : [];
  if (submissions.length >= 2) {
    startCaptionReview(room);
  } else {
    // If fewer than 2 captions submitted, skip voting and reveal
    lockAndReveal(room);
  }
}

function startCaptionReview(room) {
  clearRoomTimer(room);
  room.phase = 'CAPTION_REVIEW';
  const duration = getScaledDuration(5000);
  room.endsAt = Date.now() + duration;

  broadcastRoomState(room);

  room.timer = setTimeout(() => {
    endCaptionReview(room);
  }, duration);
  room.timer.unref();
}

function endCaptionReview(room) {
  clearRoomTimer(room);
  const validCaptions = room.captionSubmissions ? [...room.captionSubmissions.values()].filter(c => !c.removed) : [];
  if (validCaptions.length >= 2) {
    startCaptionVoting(room, validCaptions);
  } else {
    lockAndReveal(room);
  }
}

function startCaptionVoting(room, validCaptions) {
  clearRoomTimer(room);
  room.phase = 'CAPTION_VOTING';
  room.approvedCaptions = validCaptions;
  room.captionVotes = new Map();
  const duration = getScaledDuration(15000);
  room.endsAt = Date.now() + duration;

  broadcastRoomState(room);

  room.timer = setTimeout(() => {
    lockAndReveal(room);
  }, duration);
  room.timer.unref();
}

function lockAndReveal(room) {
  clearRoomTimer(room);
  room.phase = 'REVEAL';
  const card = room.currentCard;
  const connectedPlayers = room.players.filter(p => p.connected);

  let kindMovePicks = 0;
  const resultsSummary = [];

  if (card.type === 'caption' && card.mode === 'write') {
    // Write Caption scoring & Empathy meter
    const approved = room.approvedCaptions || (room.captionSubmissions ? [...room.captionSubmissions.values()].filter(c => !c.removed) : []);
    const voteCounts = new Map();
    approved.forEach(c => voteCounts.set(c.id, 0));
    (room.captionVotes || new Map()).forEach(capId => {
      if (voteCounts.has(capId)) {
        voteCounts.set(capId, voteCounts.get(capId) + 1);
      }
    });

    let maxVotes = 0;
    approved.forEach(c => {
      const v = voteCounts.get(c.id) || 0;
      if (v > maxVotes) maxVotes = v;
    });

    const writeResults = [];
    const winningCaptions = [];

    approved.forEach(c => {
      const v = voteCounts.get(c.id) || 0;
      const isWinner = v === maxVotes && maxVotes > 0;
      const author = room.players.find(p => p.id === c.playerId);
      let pointsGained = 0;
      if (isWinner) pointsGained += 150;
      pointsGained += v * 25;

      if (author) {
        author.score += pointsGained;
        if (!author.stats) author.stats = { kindMoveCount: 0, maxStreak: 0, fastestCorrectMs: 99999, writeVotes: 0, correctCount: 0 };
        author.stats.writeVotes += v;
        if (isWinner) author.stats.kindMoveCount++;
      }

      const entry = {
        id: c.id,
        text: c.text,
        authorNickname: c.authorNickname,
        votes: v,
        isWinner,
        pointsGained
      };
      writeResults.push(entry);
      if (isWinner) winningCaptions.push(entry);
    });

    room.writeResultsSummary = writeResults;
    room.winningCaptions = winningCaptions;

    for (const player of room.players) {
      const mySub = approved.find(c => c.playerId === player.id);
      const points = mySub ? mySub.pointsGained || (writeResults.find(w => w.id === mySub.id)?.pointsGained || 0) : 0;
      room.roundResults.set(player.id, {
        yourAnswer: mySub ? mySub.text : null,
        wasCorrect: mySub ? mySub.isWinner : false,
        pointsGained: points,
        speedBonus: 0
      });

      resultsSummary.push({
        playerId: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        correct: mySub ? mySub.isWinner : false,
        pointsGained: points,
        totalScore: player.score
      });
    }

    // Empathy Meter for Write mode: credit = fractionOfCaptionsPassingFilterAndNotRemoved * 13.333%
    const totalEligible = Math.max(1, connectedPlayers.length);
    const fractionPassingFilterAndNotRemoved = Math.min(1, approved.length / totalEligible);
    const meterDelta = fractionPassingFilterAndNotRemoved * 13.333333333333334;
    room.lastMeterDelta = meterDelta;
    room.meter = Math.min(100, (room.meter || 0) + meterDelta);

  } else {
    // Standard and shoes cards
    for (const player of room.players) {
      const answer = room.roundAnswers.get(player.id);
      const scoreRes = scoreAnswer(
        card,
        answer,
        answer ? answer.receiveTime : 0,
        room.questionStartTime || Date.now(),
        room.questionDurationMs || 20000,
        player.streak || 0
      );

      player.score += scoreRes.totalPointsGained;
      player.streak = scoreRes.newStreak;

      // Track stats
      if (!player.stats) {
        player.stats = { kindMoveCount: 0, maxStreak: 0, fastestCorrectMs: 99999, writeVotes: 0, correctCount: 0 };
      }
      if (player.streak > player.stats.maxStreak) {
        player.stats.maxStreak = player.streak;
      }

      if (scoreRes.isFullyCorrect) {
        player.stats.correctCount++;
        if (answer && answer.receiveTime) {
          const elapsed = answer.receiveTime - room.questionStartTime;
          if (elapsed < player.stats.fastestCorrectMs) {
            player.stats.fastestCorrectMs = elapsed;
          }
        }
      }

      if (card.type === 'shoes') {
        const isKindMove = Array.isArray(card.q2.correct) ? card.q2.correct.includes(answer && answer.q2Index) : (answer && answer.q2Index === card.q2.correct);
        if (isKindMove) {
          kindMovePicks++;
          player.stats.kindMoveCount++;
        }
      } else if (scoreRes.isFullyCorrect) {
        kindMovePicks++;
        player.stats.kindMoveCount++;
      }

      room.roundResults.set(player.id, {
        yourAnswer: answer ? (card.type === 'shoes' ? { q1Index: answer.q1Index, q2Index: answer.q2Index } : { answerIndex: answer.answerIndex }) : null,
        wasCorrect: scoreRes.wasCorrectObj,
        pointsGained: scoreRes.totalPointsGained,
        speedBonus: scoreRes.speedBonus
      });

      resultsSummary.push({
        playerId: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        correct: scoreRes.isFullyCorrect,
        pointsGained: scoreRes.totalPointsGained,
        totalScore: player.score
      });
    }

    // Empathy Meter for Standard/Shoes: fractionCorrect * 13.333% (75% avg reaches 100%)
    const totalCount = Math.max(1, connectedPlayers.length);
    const fractionCorrect = kindMovePicks / totalCount;
    const meterDelta = fractionCorrect * 13.333333333333334;
    room.lastMeterDelta = meterDelta;
    room.meter = Math.min(100, (room.meter || 0) + meterDelta);
  }

  const duration = getScaledDuration(10000);
  room.playerResultsSummary = resultsSummary;
  room.endsAt = Date.now() + duration;

  broadcastRoomState(room);

  room.timer = setTimeout(() => {
    startLeaderboard(room);
  }, duration);
  room.timer.unref();
}

function startLeaderboard(room) {
  clearRoomTimer(room);
  const duration = getScaledDuration(5000);
  room.phase = 'LEADERBOARD';
  room.endsAt = Date.now() + duration;

  broadcastRoomState(room);

  room.timer = setTimeout(() => {
    if (room.round < (room.totalRounds || 10)) {
      startRoundIntro(room);
    } else {
      endGame(room);
    }
  }, duration);
  room.timer.unref();
}

function endGame(room) {
  clearRoomTimer(room);
  room.phase = 'FINAL';

  // Use unrounded meter float for the +200 bonus check
  const meterSuccess = (room.meter || 0) >= 100 - 1e-9;
  if (meterSuccess) {
    room.players.forEach(p => {
      p.score += 200;
      p.teamBonus = 200;
    });
  }

  room.finalLeaderboard = computeLeaderboard(room.players);
  room.finalTitles = assignPlayerTitles(room.players);
  room.finalChallenge = CHALLENGES[crypto.randomInt(0, CHALLENGES.length)];

  broadcastRoomState(room);
}

function pauseRoom(room, reason = 'Waiting for players to reconnect...') {
  if (room.isPaused || room.phase === 'LOBBY' || room.phase === 'FINAL') return;
  room.isPaused = true;
  room.remainingMs = Math.max(0, (room.endsAt || 0) - Date.now());
  clearRoomTimer(room);
  broadcastToRoom(room, 'paused', { reason });
}

function resumeRoom(room) {
  if (!room.isPaused) return;
  room.isPaused = false;
  const minRemaining = getScaledDuration(1000);
  const remaining = Math.max(minRemaining, room.remainingMs || getScaledDuration(3000));
  room.endsAt = Date.now() + remaining;
  broadcastToRoom(room, 'resumed', {});
  broadcastRoomState(room);

  if (room.phase === 'ROUND_INTRO') {
    room.timer = setTimeout(() => startQuestion(room), remaining);
    room.timer.unref();
  } else if (room.phase === 'QUESTION') {
    room.timer = setTimeout(() => lockAndReveal(room), remaining);
    room.timer.unref();
  } else if (room.phase === 'WRITING') {
    room.timer = setTimeout(() => endWriting(room), remaining);
    room.timer.unref();
  } else if (room.phase === 'CAPTION_REVIEW') {
    room.timer = setTimeout(() => endCaptionReview(room), remaining);
    room.timer.unref();
  } else if (room.phase === 'CAPTION_VOTING') {
    room.timer = setTimeout(() => lockAndReveal(room), remaining);
    room.timer.unref();
  } else if (room.phase === 'REVEAL') {
    room.timer = setTimeout(() => startLeaderboard(room), remaining);
    room.timer.unref();
  } else if (room.phase === 'LEADERBOARD') {
    room.timer = setTimeout(() => {
      if (room.round < (room.totalRounds || 10)) startRoundIntro(room);
      else endGame(room);
    }, remaining);
    room.timer.unref();
  }
}

function checkPauseCondition(room) {
  if (room.phase === 'LOBBY' || room.phase === 'FINAL') return;
  const connectedCount = room.players.filter(p => p.connected).length;
  if (connectedCount < 2 && !room.isPaused) {
    pauseRoom(room, 'Waiting for players to reconnect...');
  } else if (connectedCount >= 2 && room.isPaused) {
    resumeRoom(room);
  }
}

function cleanupInactiveRooms(maxAgeMs = 2 * 60 * 60 * 1000) {
  const now = Date.now();
  let deletedCount = 0;
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActivity > maxAgeMs) {
      broadcastToRoom(room, 'room_expired', { reason: 'Room expired due to inactivity.' });
      clearRoomTimer(room);
      rooms.delete(code);
      deletedCount++;
    }
  }
  return deletedCount;
}

// Inactivity cleanup every 5 minutes
const cleanupInterval = setInterval(() => {
  cleanupInactiveRooms();
}, 5 * 60 * 1000);
cleanupInterval.unref();

// WebSocket connection lifecycle
wss.on('connection', (ws, req) => {
  const clientIp = getClientIp(req);
  const maxConns = process.env.MAX_CONNS_PER_IP ? parseInt(process.env.MAX_CONNS_PER_IP, 10) : MAX_CONNS_PER_IP;
  const currentConns = ipConnections.get(clientIp) || new Set();

  if (currentConns.size >= maxConns) {
    sendError(ws, 'RATE_LIMITED', 'Too many connections from this IP.');
    ws.close(1008, 'Connection limit exceeded');
    return;
  }

  currentConns.add(ws);
  ipConnections.set(clientIp, currentConns);

  let messageCount = 0;
  let lastRateReset = Date.now();
  let boundPlayer = null;
  let boundRoom = null;

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    if (raw.length > 2048) {
      sendError(ws, 'PAYLOAD_TOO_LARGE', 'Message size exceeds 2KB limit.');
      return;
    }

    const now = Date.now();
    if (now - lastRateReset > 1000) {
      messageCount = 0;
      lastRateReset = now;
    }
    messageCount++;
    if (messageCount > 10) {
      sendError(ws, 'RATE_LIMITED', 'Too many requests. Please slow down.');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      sendError(ws, 'INVALID_ENVELOPE', 'Invalid JSON message.');
      return;
    }

    if (!parsed || parsed.v !== 1 || typeof parsed.type !== 'string' || typeof parsed.payload !== 'object') {
      sendError(ws, 'INVALID_ENVELOPE', 'Malformed envelope. Expected { v: 1, type, payload }.');
      return;
    }

    const { type, payload } = parsed;

    if (boundRoom) {
      boundRoom.lastActivity = Date.now();
    }

    switch (type) {
      case 'ping': {
        sendMsg(ws, 'pong', {});
        break;
      }

      case 'create_room': {
        const maxRooms = process.env.MAX_TOTAL_ROOMS ? parseInt(process.env.MAX_TOTAL_ROOMS, 10) : MAX_TOTAL_ROOMS;
        if (rooms.size >= maxRooms) {
          sendError(ws, 'ROOM_LIMIT_REACHED', `Server room limit reached (maximum ${maxRooms} active rooms). Please try again later.`);
          return;
        }

        const maxCreates = process.env.MAX_ROOM_CREATIONS_PER_MIN ? parseInt(process.env.MAX_ROOM_CREATIONS_PER_MIN, 10) : MAX_ROOM_CREATIONS_PER_MIN;
        const nowMs = Date.now();
        const recentCreations = (ipRoomCreations.get(clientIp) || []).filter(t => nowMs - t < 60000);
        if (recentCreations.length >= maxCreates) {
          sendError(ws, 'RATE_LIMITED', 'Too many rooms created from this IP. Please wait a minute.');
          return;
        }
        recentCreations.push(nowMs);
        ipRoomCreations.set(clientIp, recentCreations);

        const val = validateNickname(payload.nickname);
        if (!val.valid) {
          sendError(ws, 'NAME_INVALID', val.error);
          return;
        }

        const roomCode = generateRoomCode();
        const playerId = generateId('p');
        const playerToken = generateId('tok');
        const avatar = AVATARS[crypto.randomInt(0, AVATARS.length)];

        const hostPlayer = {
          id: playerId,
          token: playerToken,
          nickname: val.nickname,
          avatar,
          isHost: true,
          connected: true,
          score: 0,
          streak: 0,
          stats: { kindMoveCount: 0, maxStreak: 0, fastestCorrectMs: 99999, writeVotes: 0, correctCount: 0 },
          ws,
          disconnectTimer: null
        };

        const newRoom = {
          code: roomCode,
          hostId: playerId,
          hostToken: playerToken,
          players: [hostPlayer],
          bannedTokens: new Set(),
          usedCardIds: new Set(),
          phase: 'LOBBY',
          round: 0,
          totalRounds: 10,
          settings: {
            deepDive: true,
            cleanMode: false,
            allowKick: true,
            allowCaptionRemoval: true
          },
          meter: 0,
          roundAnswers: new Map(),
          roundResults: new Map(),
          timer: null,
          isPaused: false,
          lastActivity: Date.now()
        };

        rooms.set(roomCode, newRoom);
        boundPlayer = hostPlayer;
        boundRoom = newRoom;

        sendMsg(ws, 'room_state', {
          ...buildRoomStatePayload(newRoom, hostPlayer),
          playerToken
        });
        break;
      }

      case 'join_room': {
        const code = (payload.code || '').trim().toUpperCase();
        const room = rooms.get(code);

        if (!room) {
          sendError(ws, 'ROOM_NOT_FOUND', 'Room not found. Check the 4-letter code.');
          return;
        }

        const playerToken = payload.playerToken;

        if (playerToken && room.bannedTokens.has(playerToken)) {
          sendError(ws, 'BANNED_FROM_ROOM', 'You have been removed from this room.');
          return;
        }

        if (playerToken) {
          const existingPlayer = room.players.find(p => p.token === playerToken);
          if (existingPlayer) {
            if (existingPlayer.disconnectTimer) {
              clearTimeout(existingPlayer.disconnectTimer);
              existingPlayer.disconnectTimer = null;
            }
            existingPlayer.ws = ws;
            existingPlayer.connected = true;
            boundPlayer = existingPlayer;
            boundRoom = room;

            sendMsg(ws, 'room_state', {
              ...buildRoomStatePayload(room, existingPlayer),
              playerToken: existingPlayer.token
            });
            broadcastRoomState(room, existingPlayer.id);
            checkPauseCondition(room);
            return;
          }
        }

        if (room.phase !== 'LOBBY') {
          sendError(ws, 'GAME_ALREADY_STARTED', 'This game has already started.');
          return;
        }

        const val = validateNickname(payload.nickname);
        if (!val.valid) {
          sendError(ws, 'NAME_INVALID', val.error);
          return;
        }

        const isDuplicateName = room.players.some(
          p => p.nickname.toLowerCase() === val.nickname.toLowerCase()
        );
        if (isDuplicateName) {
          sendError(ws, 'NAME_TAKEN', 'That nickname is already taken in this room.');
          return;
        }

        if (room.players.length >= 8) {
          sendError(ws, 'ROOM_FULL', 'This room is full (max 8 players).');
          return;
        }

        const newPlayerId = generateId('p');
        const newPlayerToken = generateId('tok');
        const avatar = getAvailableAvatar(room);

        const newPlayer = {
          id: newPlayerId,
          token: newPlayerToken,
          nickname: val.nickname,
          avatar,
          isHost: false,
          connected: true,
          score: 0,
          streak: 0,
          stats: { kindMoveCount: 0, maxStreak: 0, fastestCorrectMs: 99999, writeVotes: 0, correctCount: 0 },
          ws,
          disconnectTimer: null
        };

        room.players.push(newPlayer);
        boundPlayer = newPlayer;
        boundRoom = room;

        sendMsg(ws, 'room_state', {
          ...buildRoomStatePayload(room, newPlayer),
          playerToken: newPlayerToken
        });
        broadcastRoomState(room, newPlayer.id);
        break;
      }

      case 'update_settings': {
        if (!boundRoom || !boundPlayer) {
          sendError(ws, 'ROOM_NOT_FOUND', 'Not connected to a room.');
          return;
        }
        if (boundPlayer.id !== boundRoom.hostId) {
          sendError(ws, 'NOT_HOST', 'Only the host can update settings.');
          return;
        }
        if (boundRoom.phase !== 'LOBBY') {
          sendError(ws, 'INVALID_PHASE', 'Settings cannot be updated mid-game.');
          return;
        }

        if (typeof payload.deepDive === 'boolean') {
          boundRoom.settings.deepDive = payload.deepDive;
        }
        if (typeof payload.cleanMode === 'boolean') {
          boundRoom.settings.cleanMode = payload.cleanMode;
        }
        if (typeof payload.allowKick === 'boolean') {
          boundRoom.settings.allowKick = payload.allowKick;
        }
        if (typeof payload.allowCaptionRemoval === 'boolean') {
          boundRoom.settings.allowCaptionRemoval = payload.allowCaptionRemoval;
        }

        broadcastRoomState(boundRoom);
        break;
      }

      case 'start_game': {
        if (!boundRoom || !boundPlayer) {
          sendError(ws, 'ROOM_NOT_FOUND', 'Not connected to a room.');
          return;
        }
        if (boundPlayer.id !== boundRoom.hostId) {
          sendError(ws, 'NOT_HOST', 'Only the host can start the game.');
          return;
        }
        if (boundRoom.phase !== 'LOBBY') {
          sendError(ws, 'INVALID_PHASE', 'Game already started.');
          return;
        }
        if (boundRoom.players.length < 2) {
          sendError(ws, 'INSUFFICIENT_PLAYERS', 'Need at least 2 players to start.');
          return;
        }

        // Initialize game & deck (drawing fresh cards without repeat until exhausted)
        boundRoom.deck = buildDeck({
          deepDive: boundRoom.settings.deepDive,
          playerCount: boundRoom.players.length,
          usedCardIds: boundRoom.usedCardIds
        });
        boundRoom.round = 0;
        boundRoom.totalRounds = 10;
        boundRoom.meter = 0;

        boundRoom.players.forEach(p => {
          p.score = 0;
          p.streak = 0;
          p.stats = { kindMoveCount: 0, maxStreak: 0, fastestCorrectMs: 99999, writeVotes: 0, correctCount: 0 };
        });

        startRoundIntro(boundRoom);
        break;
      }

      case 'submit_answer': {
        if (!boundRoom || !boundPlayer) {
          sendError(ws, 'ROOM_NOT_FOUND', 'Not connected to a room.');
          return;
        }
        if (boundRoom.phase !== 'QUESTION') {
          sendError(ws, 'INVALID_PHASE', 'Cannot submit answers outside QUESTION phase.');
          return;
        }
        if (payload.roundId !== boundRoom.roundId) {
          sendError(ws, 'ROUND_MISMATCH', 'Answer submitted for an inactive round.');
          return;
        }
        if (boundRoom.roundAnswers.has(boundPlayer.id)) {
          sendError(ws, 'ALREADY_ANSWERED', 'You have already submitted your answer.');
          return;
        }

        const card = boundRoom.currentCard;
        const answerObj = {
          receiveTime: Date.now()
        };

        if (card.type === 'shoes') {
          if (typeof payload.q1Index !== 'number' || typeof payload.q2Index !== 'number' ||
              payload.q1Index < 0 || payload.q1Index >= card.q1.options.length ||
              payload.q2Index < 0 || payload.q2Index >= card.q2.options.length) {
            sendError(ws, 'INVALID_ANSWER', 'Invalid answer indices for shoes card.');
            return;
          }
          answerObj.q1Index = payload.q1Index;
          answerObj.q2Index = payload.q2Index;
        } else {
          const maxOpts = card.q2 ? card.q2.options.length : 2;
          if (typeof payload.answerIndex !== 'number' || payload.answerIndex < 0 || payload.answerIndex >= maxOpts) {
            sendError(ws, 'INVALID_ANSWER', 'Invalid answer index.');
            return;
          }
          answerObj.answerIndex = payload.answerIndex;
        }

        boundRoom.roundAnswers.set(boundPlayer.id, answerObj);

        // Broadcast progress indicator
        const connectedCount = boundRoom.players.filter(p => p.connected).length;
        broadcastToRoom(boundRoom, 'answer_progress', {
          answeredCount: boundRoom.roundAnswers.size,
          totalPlayers: connectedCount
        });

        // If everyone has answered, lock and reveal immediately
        if (boundRoom.roundAnswers.size >= connectedCount) {
          lockAndReveal(boundRoom);
        }
        break;
      }

      case 'submit_caption': {
        if (!boundRoom || !boundPlayer) {
          sendError(ws, 'ROOM_NOT_FOUND', 'Not connected to a room.');
          return;
        }
        if (boundRoom.phase !== 'WRITING') {
          sendError(ws, 'INVALID_PHASE', 'Cannot submit captions outside WRITING phase.');
          return;
        }
        if (payload.roundId !== boundRoom.roundId) {
          sendError(ws, 'ROUND_MISMATCH', 'Caption submitted for an inactive round.');
          return;
        }
        if (boundRoom.captionSubmissions && boundRoom.captionSubmissions.has(boundPlayer.id)) {
          sendError(ws, 'ALREADY_SUBMITTED', 'You have already submitted a caption.');
          return;
        }

        const val = validateCaption(payload.caption);
        if (!val.valid) {
          sendError(ws, 'CAPTION_INVALID', val.error);
          return;
        }

        const capId = generateId('cap');
        boundRoom.captionSubmissions.set(boundPlayer.id, {
          id: capId,
          playerId: boundPlayer.id,
          authorNickname: boundPlayer.nickname,
          text: val.caption,
          removed: false
        });

        // Broadcast progress
        const connectedCount = boundRoom.players.filter(p => p.connected).length;
        broadcastToRoom(boundRoom, 'caption_progress', {
          submittedCount: boundRoom.captionSubmissions.size,
          totalPlayers: connectedCount
        });

        // If everyone has submitted, advance immediately to review
        if (boundRoom.captionSubmissions.size >= connectedCount) {
          endWriting(boundRoom);
        }
        break;
      }

      case 'remove_caption': {
        if (!boundRoom || !boundPlayer) {
          sendError(ws, 'ROOM_NOT_FOUND', 'Not connected to a room.');
          return;
        }
        if (boundPlayer.id !== boundRoom.hostId) {
          sendError(ws, 'NOT_HOST', 'Only the host can moderate captions.');
          return;
        }
        if (boundRoom.settings && boundRoom.settings.allowCaptionRemoval === false) {
          sendError(ws, 'ACTION_NOT_ALLOWED', 'Caption removal is disabled in room settings.');
          return;
        }
        if (boundRoom.phase !== 'CAPTION_REVIEW') {
          sendError(ws, 'INVALID_PHASE', 'Cannot remove captions outside CAPTION_REVIEW phase.');
          return;
        }
        if (payload.roundId !== boundRoom.roundId) {
          sendError(ws, 'ROUND_MISMATCH', 'Round mismatch.');
          return;
        }

        const capId = payload.captionId;
        if (boundRoom.captionSubmissions) {
          for (const sub of boundRoom.captionSubmissions.values()) {
            if (sub.id === capId) {
              sub.removed = true;
              break;
            }
          }
        }

        broadcastRoomState(boundRoom);
        break;
      }

      case 'submit_vote': {
        if (!boundRoom || !boundPlayer) {
          sendError(ws, 'ROOM_NOT_FOUND', 'Not connected to a room.');
          return;
        }
        if (boundRoom.phase !== 'CAPTION_VOTING') {
          sendError(ws, 'INVALID_PHASE', 'Cannot vote outside CAPTION_VOTING phase.');
          return;
        }
        if (payload.roundId !== boundRoom.roundId) {
          sendError(ws, 'ROUND_MISMATCH', 'Vote submitted for an inactive round.');
          return;
        }
        if (boundRoom.captionVotes && boundRoom.captionVotes.has(boundPlayer.id)) {
          sendError(ws, 'ALREADY_VOTED', 'You have already voted this round.');
          return;
        }

        const capId = payload.captionId;
        const targetSub = boundRoom.approvedCaptions ? boundRoom.approvedCaptions.find(c => c.id === capId) : null;
        if (!targetSub) {
          sendError(ws, 'INVALID_VOTE', 'Caption not found or already removed.');
          return;
        }

        // Self-voting check: player cannot vote for their own caption!
        if (targetSub.playerId === boundPlayer.id) {
          sendError(ws, 'SELF_VOTING_NOT_ALLOWED', 'You cannot vote for your own caption.');
          return;
        }

        boundRoom.captionVotes.set(boundPlayer.id, capId);

        // Broadcast progress
        const connectedCount = boundRoom.players.filter(p => p.connected).length;
        broadcastToRoom(boundRoom, 'vote_progress', {
          votedCount: boundRoom.captionVotes.size,
          totalPlayers: connectedCount
        });

        if (boundRoom.captionVotes.size >= connectedCount) {
          lockAndReveal(boundRoom);
        }
        break;
      }

      case 'next_step': {
        if (!boundRoom || !boundPlayer) return;
        if (boundPlayer.id !== boundRoom.hostId) {
          sendError(ws, 'NOT_HOST', 'Only host can advance.');
          return;
        }

        if (boundRoom.phase === 'CAPTION_REVIEW') {
          endCaptionReview(boundRoom);
        } else if (boundRoom.phase === 'REVEAL') {
          startLeaderboard(boundRoom);
        } else if (boundRoom.phase === 'LEADERBOARD') {
          if (boundRoom.round < (boundRoom.totalRounds || 10)) {
            startRoundIntro(boundRoom);
          } else {
            endGame(boundRoom);
          }
        }
        break;
      }

      case 'skip_round': {
        if (!boundRoom || !boundPlayer) return;
        if (boundPlayer.id !== boundRoom.hostId) {
          sendError(ws, 'NOT_HOST', 'Only host can skip round.');
          return;
        }
        if (boundRoom.phase === 'QUESTION' || boundRoom.phase === 'WRITING' || boundRoom.phase === 'CAPTION_REVIEW' || boundRoom.phase === 'CAPTION_VOTING') {
          lockAndReveal(boundRoom);
        }
        break;
      }

      case 'play_again': {
        if (!boundRoom || !boundPlayer) return;
        if (boundPlayer.id !== boundRoom.hostId) {
          sendError(ws, 'NOT_HOST', 'Only host can restart game.');
          return;
        }
        if (boundRoom.phase !== 'FINAL') {
          sendError(ws, 'INVALID_PHASE', 'Game is not over yet.');
          return;
        }

        boundRoom.phase = 'LOBBY';
        boundRoom.round = 0;
        boundRoom.meter = 0;
        boundRoom.currentCard = null;
        boundRoom.roundId = null;
        boundRoom.roundAnswers = new Map();
        boundRoom.roundResults = new Map();

        boundRoom.players.forEach(p => {
          p.score = 0;
          p.streak = 0;
        });

        broadcastRoomState(boundRoom);
        break;
      }

      case 'kick_player': {
        if (!boundRoom || !boundPlayer) {
          sendError(ws, 'ROOM_NOT_FOUND', 'Not connected to a room.');
          return;
        }
        if (boundPlayer.id !== boundRoom.hostId) {
          sendError(ws, 'NOT_HOST', 'Only the host can kick players.');
          return;
        }
        if (!boundRoom.settings.allowKick) {
          sendError(ws, 'ACTION_NOT_ALLOWED', 'Kicking is disabled in this room.');
          return;
        }

        const targetId = payload.targetPlayerId;
        const targetIndex = boundRoom.players.findIndex(p => p.id === targetId);

        if (targetIndex === -1) {
          sendError(ws, 'PLAYER_NOT_FOUND', 'Player not found in room.');
          return;
        }

        const targetPlayer = boundRoom.players[targetIndex];
        if (targetPlayer.id === boundRoom.hostId) {
          sendError(ws, 'INVALID_ACTION', 'Host cannot kick themselves.');
          return;
        }

        boundRoom.bannedTokens.add(targetPlayer.token);

        if (targetPlayer.ws && targetPlayer.ws.readyState === WebSocket.OPEN) {
          sendMsg(targetPlayer.ws, 'kicked', { reason: 'You were removed from the room by the host.' });
          targetPlayer.ws.close();
        }

        boundRoom.players.splice(targetIndex, 1);
        broadcastRoomState(boundRoom);
        checkPauseCondition(boundRoom);
        break;
      }

      case 'leave_room': {
        if (!boundRoom || !boundPlayer) return;

        const idx = boundRoom.players.findIndex(p => p.id === boundPlayer.id);
        if (idx !== -1) {
          if (boundRoom.phase === 'LOBBY') {
            boundRoom.players.splice(idx, 1);
            if (boundPlayer.id === boundRoom.hostId && boundRoom.players.length > 0) {
              handleHostPromotion(boundRoom);
            } else if (boundRoom.players.length === 0) {
              clearRoomTimer(boundRoom);
              rooms.delete(boundRoom.code);
            } else {
              broadcastRoomState(boundRoom);
            }
          } else {
            boundPlayer.connected = false;
            broadcastRoomState(boundRoom);
            checkPauseCondition(boundRoom);
          }
        }
        boundPlayer = null;
        boundRoom = null;
        break;
      }

      default: {
        sendError(ws, 'INVALID_ACTION', `Unknown message type: ${type}`);
        break;
      }
    }
  });

  ws.on('close', () => {
    const conns = ipConnections.get(clientIp);
    if (conns) {
      conns.delete(ws);
      if (conns.size === 0) {
        ipConnections.delete(clientIp);
      }
    }

    if (!boundPlayer || !boundRoom) return;

    boundPlayer.connected = false;

    if (boundRoom.phase === 'LOBBY') {
      if (boundPlayer.id === boundRoom.hostId) {
        boundPlayer.disconnectTimer = setTimeout(() => {
          if (!boundPlayer.connected && rooms.has(boundRoom.code)) {
            handleHostPromotion(boundRoom);
          }
        }, 60 * 1000);
      }
      broadcastRoomState(boundRoom);
    } else {
      if (boundPlayer.id === boundRoom.hostId) {
        boundPlayer.disconnectTimer = setTimeout(() => {
          if (!boundPlayer.connected && rooms.has(boundRoom.code)) {
            handleHostPromotion(boundRoom);
          }
        }, 60 * 1000);
      }
      broadcastRoomState(boundRoom);
      checkPauseCondition(boundRoom);
    }
  });
});

// Keep-alive heartbeat interval (25s)
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);
pingInterval.unref();

wss.on('close', () => {
  clearInterval(pingInterval);
});

// Start listening when run directly
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Feel It server running at http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  server,
  rooms,
  generateRoomCode,
  wss,
  pingInterval,
  cleanupInterval,
  cleanupInactiveRooms,
  handleHostPromotion,
  startRoundIntro,
  startQuestion,
  startWriting,
  endWriting,
  startCaptionReview,
  endCaptionReview,
  startCaptionVoting,
  lockAndReveal,
  startLeaderboard,
  endGame,
  pauseRoom,
  resumeRoom,
  checkPauseCondition,
  ipConnections,
  ipRoomCreations,
  MAX_TOTAL_ROOMS,
  MAX_CONNS_PER_IP,
  MAX_ROOM_CREATIONS_PER_MIN,
  getClientIp,
  getScaledDuration
};
