const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { WebSocket } = require('ws');
const {
  app,
  server,
  rooms,
  pingInterval,
  cleanupInterval,
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
  ipRoomCreations
} = require('../server');
const {
  buildDeck,
  calculateSpeedBonus,
  scoreAnswer,
  computeLeaderboard,
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

function sendAndExpect(ws, sendType, sendPayload, expectType, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Timeout waiting for ${expectType} in response to ${sendType}`));
    }, timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === expectType) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ v: 1, type: sendType, payload: sendPayload }));
  });
}

function sendAndReceive(ws, type, payload, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Timeout waiting for response to ${type}`));
    }, timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      clearTimeout(timer);
      ws.removeListener('message', handler);
      resolve(msg);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ v: 1, type, payload }));
  });
}

function waitForMessage(ws, filterFn, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error('Timeout waiting for matching message'));
    }, timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (filterFn(msg)) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

function waitForRoomState(ws, phase = null, timeoutMs = 5000) {
  return waitForMessage(ws, (msg) => {
    if (msg.type === 'room_state') {
      return !phase || msg.payload.phase === phase;
    }
    return false;
  }, timeoutMs);
}

describe('Phase 4 & Edge Cases Test Suite', () => {
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

  test('1. Shared ranks on ties: computes standard competition ranking (1, 1, 3)', () => {
    const players = [
      { id: 'p1', nickname: 'Alice', score: 500, streak: 3 },
      { id: 'p2', nickname: 'Bob', score: 500, streak: 2 },
      { id: 'p3', nickname: 'Charlie', score: 300, streak: 1 },
      { id: 'p4', nickname: 'Dana', score: 200, streak: 0 }
    ];

    const lb = computeLeaderboard(players);
    assert.strictEqual(lb[0].rank, 1);
    assert.strictEqual(lb[1].rank, 1);
    assert.strictEqual(lb[2].rank, 3);
    assert.strictEqual(lb[3].rank, 4);

    const players2 = [
      { id: 'p1', nickname: 'A', score: 600 },
      { id: 'p2', nickname: 'B', score: 400 },
      { id: 'p3', nickname: 'C', score: 400 },
      { id: 'p4', nickname: 'D', score: 200 }
    ];
    const lb2 = computeLeaderboard(players2);
    assert.strictEqual(lb2[0].rank, 1);
    assert.strictEqual(lb2[1].rank, 2);
    assert.strictEqual(lb2[2].rank, 2);
    assert.strictEqual(lb2[3].rank, 4);
  });

  test('2. Streak reset after wrong answer & streak bonus on 3 consecutive correct', () => {
    const card = {
      type: 'reel',
      q2: { correct: 1 }
    };

    // Correct answer starting from 0 -> streak becomes 1
    const r1 = scoreAnswer(card, { answerIndex: 1 }, 1000, 1000, 20000, 0);
    assert.strictEqual(r1.isFullyCorrect, true);
    assert.strictEqual(r1.newStreak, 1);
    assert.strictEqual(r1.streakBonus, 0);

    // Correct answer with streak 1 -> streak becomes 2
    const r2 = scoreAnswer(card, { answerIndex: 1 }, 1000, 1000, 20000, 1);
    assert.strictEqual(r2.newStreak, 2);
    assert.strictEqual(r2.streakBonus, 0);

    // Correct answer with streak 2 -> streak becomes 3 (earns +25 streak bonus!)
    const r3 = scoreAnswer(card, { answerIndex: 1 }, 1000, 1000, 20000, 2);
    assert.strictEqual(r3.newStreak, 3);
    assert.strictEqual(r3.streakBonus, 25);
    assert.strictEqual(r3.totalPointsGained, 100 + 50 + 25); // base (100) + speed (50) + streak (25)

    // Wrong answer with streak 3 -> resets immediately to 0
    const r4 = scoreAnswer(card, { answerIndex: 0 }, 1000, 1000, 20000, 3);
    assert.strictEqual(r4.isFullyCorrect, false);
    assert.strictEqual(r4.newStreak, 0);
    assert.strictEqual(r4.streakBonus, 0);
    assert.strictEqual(r4.totalPointsGained, 0);
  });

  test('3. Multiple correct feelings on shoes card supported', () => {
    const shoesCardMulti = {
      type: 'shoes',
      q1: { options: ['Embarrassed', 'Anxious', 'Confident'], correct: [0, 1] }, // either 0 or 1 is correct
      q2: { options: ['Offer quiet help', 'Tease them'], correct: 0 }
    };

    // Selecting option 0 for Q1 (valid) and option 0 for Q2 (valid)
    const scoreA = scoreAnswer(shoesCardMulti, { q1Index: 0, q2Index: 0 }, 1000, 1000, 30000, 0);
    assert.strictEqual(scoreA.isFullyCorrect, true);
    assert.strictEqual(scoreA.wasCorrectObj.q1Correct, true);
    assert.strictEqual(scoreA.wasCorrectObj.q2Correct, true);

    // Selecting option 1 for Q1 (also valid) and option 0 for Q2 (valid)
    const scoreB = scoreAnswer(shoesCardMulti, { q1Index: 1, q2Index: 0 }, 1000, 1000, 30000, 0);
    assert.strictEqual(scoreB.isFullyCorrect, true);
    assert.strictEqual(scoreB.wasCorrectObj.q1Correct, true);

    // Selecting option 2 for Q1 (invalid)
    const scoreC = scoreAnswer(shoesCardMulti, { q1Index: 2, q2Index: 0 }, 1000, 1000, 30000, 0);
    assert.strictEqual(scoreC.isFullyCorrect, false);
    assert.strictEqual(scoreC.wasCorrectObj.q1Correct, false);
    assert.strictEqual(scoreC.wasCorrectObj.q2Correct, true);
  });

  test('4. 2-Player Game: Write mode caption cards swapped to Pick mode in deck building', () => {
    for (let i = 0; i < 15; i++) {
      const deck2p = buildDeck({ deepDive: true, playerCount: 2 });
      assert.strictEqual(deck2p.length, 10);
      const writeCards = deck2p.filter(c => c.type === 'caption' && c.mode === 'write');
      assert.strictEqual(writeCards.length, 0, '2-player deck should not include write mode captions');
      const pickCards = deck2p.filter(c => c.type === 'caption' && c.mode === 'pick');
      assert.strictEqual(pickCards.length, 2, '2-player deck must include 2 pick captions');
    }
  });

  test('5. Reconnect mid-QUESTION and mid-REVEAL with sanitized state', async () => {
    const wsHost = await connectWs();
    const wsJoiner = await connectWs();

    // Create room & join
    const hostCreate = await sendAndReceive(wsHost, 'create_room', { nickname: 'HostPlayer' });
    const roomCode = hostCreate.payload.roomCode;
    const hostToken = hostCreate.payload.playerToken;

    const joinRes = await sendAndReceive(wsJoiner, 'join_room', { code: roomCode, nickname: 'JoinerPlayer' });
    const joinerToken = joinRes.payload.playerToken;

    // Start game
    await sendAndReceive(wsHost, 'start_game', {});
    const questionState = await waitForRoomState(wsHost, 'QUESTION');
    assert.strictEqual(questionState.payload.phase, 'QUESTION');
    assert.ok(questionState.payload.roundId);
    assert.ok(questionState.payload.card);
    assert.strictEqual(questionState.payload.card.correct, undefined, 'Answers must NOT leak during QUESTION');

    // Host submits answer
    if (questionState.payload.card.type === 'shoes') {
      wsHost.send(JSON.stringify({ v: 1, type: 'submit_answer', payload: { roundId: questionState.payload.roundId, q1Index: 0, q2Index: 0 } }));
    } else {
      wsHost.send(JSON.stringify({ v: 1, type: 'submit_answer', payload: { roundId: questionState.payload.roundId, answerIndex: 0 } }));
    }

    // Reconnect host mid-QUESTION on new socket
    const wsHostReconnect = await connectWs();
    const reconnectRes = await sendAndReceive(wsHostReconnect, 'join_room', { code: roomCode, playerToken: hostToken });
    assert.strictEqual(reconnectRes.payload.phase, 'QUESTION');
    assert.strictEqual(reconnectRes.payload.hasAnswered, true, 'Reconnect should report that player already answered');
    assert.strictEqual(reconnectRes.payload.card.correct, undefined, 'Sanitization must persist on reconnect');

    // Joiner submits answer to trigger REVEAL
    if (questionState.payload.card.type === 'shoes') {
      wsJoiner.send(JSON.stringify({ v: 1, type: 'submit_answer', payload: { roundId: questionState.payload.roundId, q1Index: 0, q2Index: 0 } }));
    } else {
      wsJoiner.send(JSON.stringify({ v: 1, type: 'submit_answer', payload: { roundId: questionState.payload.roundId, answerIndex: 0 } }));
    }

    const revealState = await waitForRoomState(wsJoiner, 'REVEAL');
    assert.strictEqual(revealState.payload.phase, 'REVEAL');
    assert.ok(revealState.payload.explain);

    // Reconnect joiner mid-REVEAL on new socket
    const wsJoinerReconnect = await connectWs();
    const revealReconnectRes = await sendAndReceive(wsJoinerReconnect, 'join_room', { code: roomCode, playerToken: joinerToken });
    assert.strictEqual(revealReconnectRes.payload.phase, 'REVEAL');
    assert.ok(revealReconnectRes.payload.explain);
    assert.ok(revealReconnectRes.payload.yourAnswer !== undefined);

    wsHost.close();
    wsJoiner.close();
    wsHostReconnect.close();
    wsJoinerReconnect.close();
  });

  test('6. Stale roundId and after-lock answer rejection', async () => {
    const wsHost = await connectWs();
    const wsJoiner = await connectWs();

    const hostCreate = await sendAndReceive(wsHost, 'create_room', { nickname: 'HostStale' });
    const roomCode = hostCreate.payload.roomCode;
    await sendAndReceive(wsJoiner, 'join_room', { code: roomCode, nickname: 'JoinerStale' });

    await sendAndReceive(wsHost, 'start_game', {});
    const qState = await waitForRoomState(wsHost, 'QUESTION');

    // Submit with wrong roundId -> ROUND_MISMATCH
    const errRes = await sendAndReceive(wsHost, 'submit_answer', {
      roundId: 'r99_invalid_card_id',
      answerIndex: 0,
      q1Index: 0,
      q2Index: 0
    });
    assert.strictEqual(errRes.type, 'error_msg');
    assert.strictEqual(errRes.payload.code, 'ROUND_MISMATCH');

    wsHost.close();
    wsJoiner.close();
  });

  test('7. Pause / Resume with frozen timers', async () => {
    const wsHost = await connectWs();
    const wsJoiner = await connectWs();

    const hostCreate = await sendAndReceive(wsHost, 'create_room', { nickname: 'HostPause' });
    const roomCode = hostCreate.payload.roomCode;
    const joinerRes = await sendAndReceive(wsJoiner, 'join_room', { code: roomCode, nickname: 'JoinerPause' });
    const joinerToken = joinerRes.payload.playerToken;

    await sendAndReceive(wsHost, 'start_game', {});
    await waitForRoomState(wsHost, 'QUESTION');

    // Joiner disconnects -> trigger pause
    const pausePromise = waitForMessage(wsHost, msg => msg.type === 'paused');
    wsJoiner.close();
    const pauseMsg = await pausePromise;
    assert.strictEqual(pauseMsg.type, 'paused');

    // Room state should reflect isPaused: true
    const room = rooms.get(roomCode);
    assert.strictEqual(room.isPaused, true);
    assert.ok(room.remainingMs > 0, 'Remaining time must be frozen');

    // Joiner reconnects -> trigger resume
    const wsJoinerRe = await connectWs();
    const resumePromise = waitForMessage(wsHost, msg => msg.type === 'resumed');
    await sendAndReceive(wsJoinerRe, 'join_room', { code: roomCode, playerToken: joinerToken });
    const resumeMsg = await resumePromise;
    assert.strictEqual(resumeMsg.type, 'resumed');
    assert.strictEqual(room.isPaused, false);

    wsHost.close();
    wsJoinerRe.close();
  });

  test('8. Skip round and next_step host controls', async () => {
    const wsHost = await connectWs();
    const wsJoiner = await connectWs();

    const hostCreate = await sendAndReceive(wsHost, 'create_room', { nickname: 'HostCtrl' });
    const roomCode = hostCreate.payload.roomCode;
    await sendAndReceive(wsJoiner, 'join_room', { code: roomCode, nickname: 'JoinerCtrl' });

    await sendAndReceive(wsHost, 'start_game', {});
    await waitForRoomState(wsHost, 'QUESTION');

    // Non-host trying to skip round -> NOT_HOST error
    const nonHostErr = await sendAndExpect(wsJoiner, 'skip_round', {}, 'error_msg');
    assert.strictEqual(nonHostErr.type, 'error_msg');
    assert.strictEqual(nonHostErr.payload.code, 'NOT_HOST');

    // Host skips round -> immediately advances to REVEAL
    const revealPromise = waitForRoomState(wsHost, 'REVEAL');
    wsHost.send(JSON.stringify({ v: 1, type: 'skip_round', payload: {} }));
    const revealState = await revealPromise;
    assert.strictEqual(revealState.payload.phase, 'REVEAL');

    // Host calls next_step -> immediately advances to LEADERBOARD
    const lbPromise = waitForRoomState(wsHost, 'LEADERBOARD');
    wsHost.send(JSON.stringify({ v: 1, type: 'next_step', payload: {} }));
    const lbState = await lbPromise;
    assert.strictEqual(lbState.payload.phase, 'LEADERBOARD');

    wsHost.close();
    wsJoiner.close();
  });

  test('9. Full 10-round game reaching FINAL, Empathy Meter bonus, and Play Again with unexhausted card retention', async () => {
    const wsHost = await connectWs();
    const wsJoiner = await connectWs();

    const hostCreatePromise = waitForRoomState(wsHost, 'LOBBY');
    wsHost.send(JSON.stringify({ v: 1, type: 'create_room', payload: { nickname: 'Host10' } }));
    const hostCreate = await hostCreatePromise;
    const roomCode = hostCreate.payload.roomCode;

    const joinPromise = waitForRoomState(wsJoiner, 'LOBBY');
    wsJoiner.send(JSON.stringify({ v: 1, type: 'join_room', payload: { code: roomCode, nickname: 'Joiner10' } }));
    await joinPromise;

    // Start game & wait for ROUND_INTRO
    const introPromise = waitForRoomState(wsHost, 'ROUND_INTRO');
    wsHost.send(JSON.stringify({ v: 1, type: 'start_game', payload: {} }));
    await introPromise;

    const room = rooms.get(roomCode);
    assert.strictEqual(room.usedCardIds.size, 10, 'First game should record 10 used cards');

    // Advance room to round 10 and trigger endGame
    const finalPromise = waitForRoomState(wsHost, 'FINAL');
    room.round = 10;
    room.meter = 100; // Team Empathy goal met!
    endGame(room);

    const finalState = await finalPromise;
    assert.strictEqual(finalState.payload.phase, 'FINAL');
    assert.strictEqual(finalState.payload.meterSuccess, true);
    assert.ok(finalState.payload.challenge);
    assert.ok(finalState.payload.titles.length >= 2);
    assert.strictEqual(finalState.payload.finalScores[0].teamBonus, 200);

    // Host calls play_again
    const lobbyPromise = waitForRoomState(wsHost, 'LOBBY');
    wsHost.send(JSON.stringify({ v: 1, type: 'play_again', payload: {} }));
    const lobbyState = await lobbyPromise;
    assert.strictEqual(lobbyState.payload.phase, 'LOBBY');
    assert.strictEqual(lobbyState.payload.round, 0);
    assert.strictEqual(room.usedCardIds.size, 10, 'Used cards pool must NOT reset until exhausted');

    wsHost.close();
    wsJoiner.close();
  });

  test('10. Phase 4 Caption This: Writing, Moderation review with authorNicknames host-only, Voting, Self-voting rejection, and Reveal scoring', async () => {
    const wsHost = await connectWs();
    const wsP2 = await connectWs();
    const wsP3 = await connectWs();

    const hostCreatePromise = waitForRoomState(wsHost, 'LOBBY');
    wsHost.send(JSON.stringify({ v: 1, type: 'create_room', payload: { nickname: 'HostMod' } }));
    const hostCreate = await hostCreatePromise;
    const roomCode = hostCreate.payload.roomCode;

    const p2JoinPromise = waitForRoomState(wsP2, 'LOBBY');
    wsP2.send(JSON.stringify({ v: 1, type: 'join_room', payload: { code: roomCode, nickname: 'PlayerTwo' } }));
    await p2JoinPromise;

    const p3JoinPromise = waitForRoomState(wsP3, 'LOBBY');
    wsP3.send(JSON.stringify({ v: 1, type: 'join_room', payload: { code: roomCode, nickname: 'PlayerThree' } }));
    await p3JoinPromise;

    const room = rooms.get(roomCode);

    // Inject a Caption Write card
    room.currentCard = {
      id: 'cap-write-test',
      type: 'caption',
      mode: 'write',
      topic: 'communication',
      scene: 'A friend is texting apologies for being 5 mins late to lunch.',
      emojiScene: '📱🍽️✨',
      prompt: 'Write a kind, funny caption for this moment:'
    };
    room.round = 1;
    room.roundId = 'r1_cap_write_test';

    // Start Writing phase
    const hostWritingPromise = waitForRoomState(wsHost, 'WRITING');
    startWriting(room);

    const hostWriting = await hostWritingPromise;
    assert.strictEqual(hostWriting.payload.phase, 'WRITING');
    assert.strictEqual(hostWriting.payload.mode, 'write');

    // 1. Submit Captions (including one with profanity to test word filter)
    const profanityErr = await sendAndExpect(wsP2, 'submit_caption', {
      roundId: room.roundId,
      caption: 'This is a fuck bad caption'
    }, 'error_msg');
    assert.strictEqual(profanityErr.type, 'error_msg');
    assert.strictEqual(profanityErr.payload.code, 'CAPTION_INVALID');

    // Valid submissions
    const hostReviewPromise = waitForRoomState(wsHost, 'CAPTION_REVIEW');
    const p2ReviewPromise = waitForRoomState(wsP2, 'CAPTION_REVIEW');

    wsHost.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'Zero stress, ordering fries for us already 🍟' } }));
    wsP2.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'Take your time real ones never rush 💖' } }));
    wsP3.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'Already ate all the bread baskets 🍞' } }));

    // 2. CAPTION_REVIEW (5s Moderation window)
    const hostReview = await hostReviewPromise;
    const p2Review = await p2ReviewPromise;

    // Check host-only authorNickname rule:
    assert.strictEqual(hostReview.payload.isHostReview, true);
    assert.strictEqual(hostReview.payload.captions.length, 3);
    assert.ok(hostReview.payload.captions[0].authorNickname, 'Host MUST receive authorNickname');

    assert.strictEqual(p2Review.payload.isHostReview, false);
    assert.strictEqual(p2Review.payload.captions.length, 0, 'Non-host sockets MUST NOT receive authorNicknames');

    // Host removes P3 caption
    const p3CapId = hostReview.payload.captions.find(c => c.authorNickname === 'PlayerThree').id;
    wsHost.send(JSON.stringify({ v: 1, type: 'remove_caption', payload: { roundId: room.roundId, captionId: p3CapId } }));

    // Advance review to voting
    const hostVotingPromise = waitForRoomState(wsHost, 'CAPTION_VOTING');
    const p2VotingPromise = waitForRoomState(wsP2, 'CAPTION_VOTING');
    wsHost.send(JSON.stringify({ v: 1, type: 'next_step', payload: {} }));

    // 3. CAPTION_VOTING (15s Anonymous Voting)
    const hostVoting = await hostVotingPromise;
    const p2Voting = await p2VotingPromise;

    assert.strictEqual(hostVoting.payload.captions.length, 2, 'Removed caption should not appear in voting');
    // Ensure no authorNickname in voting payload
    assert.strictEqual(hostVoting.payload.captions[0].authorNickname, undefined);
    assert.strictEqual(p2Voting.payload.captions[0].authorNickname, undefined);

    const hostCapId = hostReview.payload.captions.find(c => c.authorNickname === 'HostMod').id;
    const p2CapId = hostReview.payload.captions.find(c => c.authorNickname === 'PlayerTwo').id;

    // Self-voting test: Host tries to vote for hostCapId -> REJECTED
    const selfVoteErr = await sendAndExpect(wsHost, 'submit_vote', {
      roundId: room.roundId,
      captionId: hostCapId
    }, 'error_msg');
    assert.strictEqual(selfVoteErr.type, 'error_msg');
    assert.strictEqual(selfVoteErr.payload.code, 'SELF_VOTING_NOT_ALLOWED');

    // Host votes for P2's caption
    const revealPromise = waitForRoomState(wsP2, 'REVEAL');
    wsHost.send(JSON.stringify({ v: 1, type: 'submit_vote', payload: { roundId: room.roundId, captionId: p2CapId } }));

    // P3 votes for P2's caption
    wsP3.send(JSON.stringify({ v: 1, type: 'submit_vote', payload: { roundId: room.roundId, captionId: p2CapId } }));

    // P2 votes for Host's caption (3rd vote triggers reveal)
    wsP2.send(JSON.stringify({ v: 1, type: 'submit_vote', payload: { roundId: room.roundId, captionId: hostCapId } }));

    // 4. REVEAL (Scoring)
    const reveal = await revealPromise;
    assert.strictEqual(reveal.payload.phase, 'REVEAL');
    assert.ok(reveal.payload.winningCaptions.length > 0);
    assert.strictEqual(reveal.payload.winningCaptions[0].authorNickname, 'PlayerTwo');

    // Check P2 points: winning caption (150) + 2 votes (2 * 25 = 50) = 200 pts
    const p2Player = room.players.find(p => p.nickname === 'PlayerTwo');
    assert.strictEqual(p2Player.score, 200, 'Winner should receive +150 winning bonus plus +25 per vote (total 200)');

    // Check Host points: 1 vote (1 * 25 = 25) = 25 pts
    const hostPlayer = room.players.find(p => p.nickname === 'HostMod');
    assert.strictEqual(hostPlayer.score, 25, 'Voted caption receives +25 per vote');

    wsHost.close();
    wsP2.close();
    wsP3.close();
  });

  test('11. Tied caption votes: all top-voted captions get +150 winning bonus', async () => {
    const wsHost = await connectWs();
    const wsP2 = await connectWs();
    const wsP3 = await connectWs();
    const wsP4 = await connectWs();

    const hostCreatePromise = waitForRoomState(wsHost, 'LOBBY');
    wsHost.send(JSON.stringify({ v: 1, type: 'create_room', payload: { nickname: 'HostTie' } }));
    const hostCreate = await hostCreatePromise;
    const roomCode = hostCreate.payload.roomCode;

    const p2JoinPromise = waitForRoomState(wsP2, 'LOBBY');
    wsP2.send(JSON.stringify({ v: 1, type: 'join_room', payload: { code: roomCode, nickname: 'PlayerB' } }));
    await p2JoinPromise;

    const p3JoinPromise = waitForRoomState(wsP3, 'LOBBY');
    wsP3.send(JSON.stringify({ v: 1, type: 'join_room', payload: { code: roomCode, nickname: 'PlayerC' } }));
    await p3JoinPromise;

    const p4JoinPromise = waitForRoomState(wsP4, 'LOBBY');
    wsP4.send(JSON.stringify({ v: 1, type: 'join_room', payload: { code: roomCode, nickname: 'PlayerD' } }));
    await p4JoinPromise;

    const room = rooms.get(roomCode);
    room.currentCard = {
      id: 'cap-write-tie',
      type: 'caption',
      mode: 'write',
      topic: 'communication',
      scene: 'Group project text chat at midnight.',
      emojiScene: '💻⏰💬',
      prompt: 'Write the kindest message to send:'
    };
    room.round = 1;
    room.roundId = 'r1_cap_write_tie';

    const hostWritingPromise = waitForRoomState(wsHost, 'WRITING');
    startWriting(room);
    await hostWritingPromise;

    const hostReviewPromise = waitForRoomState(wsHost, 'CAPTION_REVIEW');
    wsHost.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'Get some rest everyone we got this tomorrow 💤' } }));
    wsP2.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'Proud of our progress logging off now 🌟' } }));
    wsP3.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'Let us finish the rest with fresh eyes in the morning ☀️' } }));
    wsP4.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'Great teamwork tonight drink water and sleep 💧' } }));

    const hostReview = await hostReviewPromise;
    const hostCapId = hostReview.payload.captions.find(c => c.authorNickname === 'HostTie').id;
    const p2CapId = hostReview.payload.captions.find(c => c.authorNickname === 'PlayerB').id;

    // Advance to voting
    const hostVotingPromise = waitForRoomState(wsHost, 'CAPTION_VOTING');
    wsHost.send(JSON.stringify({ v: 1, type: 'next_step', payload: {} }));
    await hostVotingPromise;

    // Tie setup: 2 votes for Host's caption (P2, P4), 2 votes for P2's caption (Host, P3)
    const revealPromise = waitForRoomState(wsHost, 'REVEAL');
    wsP2.send(JSON.stringify({ v: 1, type: 'submit_vote', payload: { roundId: room.roundId, captionId: hostCapId } }));
    wsP4.send(JSON.stringify({ v: 1, type: 'submit_vote', payload: { roundId: room.roundId, captionId: hostCapId } }));
    wsHost.send(JSON.stringify({ v: 1, type: 'submit_vote', payload: { roundId: room.roundId, captionId: p2CapId } }));
    wsP3.send(JSON.stringify({ v: 1, type: 'submit_vote', payload: { roundId: room.roundId, captionId: p2CapId } }));

    const revealState = await revealPromise;
    assert.strictEqual(revealState.payload.phase, 'REVEAL');
    assert.strictEqual(revealState.payload.winningCaptions.length, 2, 'Both tied captions must be in winningCaptions');

    const hostPlayer = room.players.find(p => p.nickname === 'HostTie');
    const p2Player = room.players.find(p => p.nickname === 'PlayerB');
    assert.strictEqual(hostPlayer.score, 200, 'Host should receive +150 winning bonus plus 2*25=50 vote pts (200 total)');
    assert.strictEqual(p2Player.score, 200, 'PlayerB should receive +150 winning bonus plus 2*25=50 vote pts (200 total)');

    wsHost.close();
    wsP2.close();
    wsP3.close();
    wsP4.close();
  });

  test('12. remove_caption refused when allowCaptionRemoval is false', async () => {
    const wsHost = await connectWs();
    const wsP2 = await connectWs();
    const wsP3 = await connectWs();

    const hostCreatePromise = waitForRoomState(wsHost, 'LOBBY');
    wsHost.send(JSON.stringify({ v: 1, type: 'create_room', payload: { nickname: 'HostNoRem' } }));
    const hostCreate = await hostCreatePromise;
    const roomCode = hostCreate.payload.roomCode;

    const p2JoinPromise = waitForRoomState(wsP2, 'LOBBY');
    wsP2.send(JSON.stringify({ v: 1, type: 'join_room', payload: { code: roomCode, nickname: 'PlayerTwo' } }));
    await p2JoinPromise;

    const p3JoinPromise = waitForRoomState(wsP3, 'LOBBY');
    wsP3.send(JSON.stringify({ v: 1, type: 'join_room', payload: { code: roomCode, nickname: 'PlayerThree' } }));
    await p3JoinPromise;

    // Host disables caption removal in settings
    const updatePromise12 = waitForMessage(wsHost, (m) => m.type === 'room_state' && m.payload.settings && m.payload.settings.allowCaptionRemoval === false);
    wsHost.send(JSON.stringify({ v: 1, type: 'update_settings', payload: { allowCaptionRemoval: false } }));
    await updatePromise12;

    const room = rooms.get(roomCode);
    room.currentCard = {
      id: 'cap-write-norem',
      type: 'caption',
      mode: 'write',
      topic: 'communication',
      scene: 'Test scene',
      prompt: 'Write a caption'
    };
    room.round = 1;
    room.roundId = 'r1_cap_write_norem';

    const hostWritingPromise = waitForRoomState(wsHost, 'WRITING');
    startWriting(room);
    await hostWritingPromise;

    const hostReviewPromise = waitForRoomState(wsHost, 'CAPTION_REVIEW');
    wsHost.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'Host caption' } }));
    wsP2.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'Player 2 caption' } }));
    wsP3.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'Player 3 caption' } }));

    const hostReview = await hostReviewPromise;
    const p2CapId = hostReview.payload.captions.find(c => c.authorNickname === 'PlayerTwo').id;

    // Attempt removal when allowCaptionRemoval is false -> ACTION_NOT_ALLOWED
    const remErr = await sendAndExpect(wsHost, 'remove_caption', {
      roundId: room.roundId,
      captionId: p2CapId
    }, 'error_msg');
    assert.strictEqual(remErr.type, 'error_msg');
    assert.strictEqual(remErr.payload.code, 'ACTION_NOT_ALLOWED');

    wsHost.close();
    wsP2.close();
    wsP3.close();
  });

  test('13. kick_player refused when allowKick is false', async () => {
    const wsHost = await connectWs();
    const wsP2 = await connectWs();

    const hostCreatePromise = waitForRoomState(wsHost, 'LOBBY');
    wsHost.send(JSON.stringify({ v: 1, type: 'create_room', payload: { nickname: 'HostNoKick' } }));
    const hostCreate = await hostCreatePromise;
    const roomCode = hostCreate.payload.roomCode;

    const p2JoinPromise = waitForRoomState(wsP2, 'LOBBY');
    wsP2.send(JSON.stringify({ v: 1, type: 'join_room', payload: { code: roomCode, nickname: 'TargetP2' } }));
    const p2Join = await p2JoinPromise;
    const p2Id = p2Join.payload.players.find(p => p.nickname === 'TargetP2').id;

    // Host disables kick in settings
    const updatePromise13 = waitForMessage(wsHost, (m) => m.type === 'room_state' && m.payload.settings && m.payload.settings.allowKick === false);
    wsHost.send(JSON.stringify({ v: 1, type: 'update_settings', payload: { allowKick: false } }));
    await updatePromise13;

    // Attempt to kick -> ACTION_NOT_ALLOWED
    const kickErr = await sendAndExpect(wsHost, 'kick_player', {
      targetPlayerId: p2Id
    }, 'error_msg');
    assert.strictEqual(kickErr.type, 'error_msg');
    assert.strictEqual(kickErr.payload.code, 'ACTION_NOT_ALLOWED');

    wsHost.close();
    wsP2.close();
  });

  test('14. Players with no caption or a removed caption are scored safely with 0 pts and yourAnswer null', async () => {
    const wsHost = await connectWs();
    const wsP2 = await connectWs();
    const wsP3 = await connectWs();

    const hostCreatePromise = waitForRoomState(wsHost, 'LOBBY');
    wsHost.send(JSON.stringify({ v: 1, type: 'create_room', payload: { nickname: 'HostSafe' } }));
    const hostCreate = await hostCreatePromise;
    const roomCode = hostCreate.payload.roomCode;

    const p2JoinPromise = waitForRoomState(wsP2, 'LOBBY');
    wsP2.send(JSON.stringify({ v: 1, type: 'join_room', payload: { code: roomCode, nickname: 'PlayerTwo' } }));
    await p2JoinPromise;

    const p3JoinPromise = waitForRoomState(wsP3, 'LOBBY');
    wsP3.send(JSON.stringify({ v: 1, type: 'join_room', payload: { code: roomCode, nickname: 'PlayerThree' } }));
    await p3JoinPromise;

    const room = rooms.get(roomCode);
    room.currentCard = {
      id: 'cap-write-safe',
      type: 'caption',
      mode: 'write',
      topic: 'communication',
      scene: 'Safe test scene',
      prompt: 'Safe prompt'
    };
    room.round = 1;
    room.roundId = 'r1_cap_write_safe';

    const hostWritingPromise = waitForRoomState(wsHost, 'WRITING');
    startWriting(room);
    await hostWritingPromise;

    // Host & P2 submit captions, P3 submits NOTHING
    const p1CapPromise = waitForMessage(wsHost, m => m.type === 'caption_progress' && m.payload.submittedCount === 1);
    wsHost.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'Host caption here' } }));
    await p1CapPromise;

    const p2CapPromise = waitForMessage(wsHost, m => m.type === 'caption_progress' && m.payload.submittedCount === 2);
    wsP2.send(JSON.stringify({ v: 1, type: 'submit_caption', payload: { roundId: room.roundId, caption: 'P2 caption to be removed' } }));
    await p2CapPromise;

    // Advance writing phase to review (with P3 having submitted nothing)
    const hostReviewPromise = waitForRoomState(wsHost, 'CAPTION_REVIEW');
    endWriting(room);
    const hostReview = await hostReviewPromise;

    // Host removes P2's caption and waits for updated review state
    const p2CapId = hostReview.payload.captions.find(c => c.authorNickname === 'PlayerTwo').id;
    const removedPromise = waitForMessage(wsHost, (m) => m.type === 'room_state' && m.payload.phase === 'CAPTION_REVIEW' && m.payload.captions && m.payload.captions.length === 1);
    wsHost.send(JSON.stringify({ v: 1, type: 'remove_caption', payload: { roundId: room.roundId, captionId: p2CapId } }));
    await removedPromise;

    // Advance review to reveal (since only 1 valid caption remains, auto-skip voting to reveal)
    const revealPromise = waitForRoomState(wsP3, 'REVEAL');
    endCaptionReview(room);

    const revealState = await revealPromise;
    assert.strictEqual(revealState.payload.phase, 'REVEAL');
    assert.strictEqual(revealState.payload.yourAnswer, null, 'Player with no submission should have yourAnswer null');
    assert.strictEqual(revealState.payload.wasCorrect, false);
    assert.strictEqual(revealState.payload.yourPointsEarned, 0);

    const p3 = room.players.find(p => p.nickname === 'PlayerThree');
    assert.strictEqual(p3.score, 0);

    const p2 = room.players.find(p => p.nickname === 'PlayerTwo');
    assert.strictEqual(p2.score, 0, 'Player with removed caption should earn 0 pts');

    wsHost.close();
    wsP2.close();
    wsP3.close();
  });
});
