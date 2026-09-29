const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { WebSocket } = require('ws');
const {
  app,
  server,
  rooms,
  generateRoomCode,
  pingInterval,
  cleanupInterval,
  cleanupInactiveRooms,
  handleHostPromotion,
  ipRoomCreations,
  ipConnections
} = require('../server');
const { validateNickname, containsBlockedWord } = require('../lib/filter');

let testPort = 3101;
let testServer;
let wsUrl;

function connectWs(headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function sendAndReceive(ws, type, payload, timeoutMs = 2000) {
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

function sendRawAndReceive(ws, rawString, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Timeout waiting for raw response`));
    }, timeoutMs);
    const handler = (data) => {
      clearTimeout(timer);
      const msg = JSON.parse(data.toString());
      ws.removeListener('message', handler);
      resolve(msg);
    };
    ws.on('message', handler);
    ws.send(rawString);
  });
}


describe('Phase 1 Acceptance & Verification Tests', () => {
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
    ipConnections.clear();
  });

  test('1. Room code generation generates 4-letter uppercase without I or O', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      assert.strictEqual(code.length, 4);
      assert.match(code, /^[A-HJ-NP-Z]{4}$/);
      assert.strictEqual(code.includes('I'), false);
      assert.strictEqual(code.includes('O'), false);
    }
  });

  test('2. Word filter catches profanities & slurs, BUT avoids false positives on innocent words', () => {
    // True positives (should be blocked)
    assert.strictEqual(containsBlockedWord('f.u.c.k'), true);
    assert.strictEqual(containsBlockedWord('b!tch'), true);
    assert.strictEqual(containsBlockedWord('n1gg@'), true);
    assert.strictEqual(containsBlockedWord('f*ck'), true);

    // Innocent words (must NEVER be blocked - Scunthorpe problem)
    assert.strictEqual(containsBlockedWord('classic'), false);
    assert.strictEqual(containsBlockedWord('pass'), false);
    assert.strictEqual(containsBlockedWord('compass'), false);
    assert.strictEqual(containsBlockedWord('peacock'), false);
    assert.strictEqual(containsBlockedWord('cocktail'), false);
    assert.strictEqual(containsBlockedWord('document'), false);
    assert.strictEqual(containsBlockedWord('cassette'), false);
    assert.strictEqual(containsBlockedWord('assistant'), false);
    assert.strictEqual(containsBlockedWord('hello world'), false);

    assert.strictEqual(validateNickname('classic').valid, true);
    assert.strictEqual(validateNickname('peacock').valid, true);
  });

  test('3. Envelope validation and unknown type handling', async () => {
    const ws = await connectWs();

    // Malformed JSON
    const malformedRes = await sendRawAndReceive(ws, 'NOT_JSON');
    assert.strictEqual(malformedRes.type, 'error_msg');
    assert.strictEqual(malformedRes.payload.code, 'INVALID_ENVELOPE');

    // Missing v: 1
    const noVRes = await sendRawAndReceive(ws, JSON.stringify({ type: 'ping', payload: {} }));
    assert.strictEqual(noVRes.type, 'error_msg');
    assert.strictEqual(noVRes.payload.code, 'INVALID_ENVELOPE');

    // Unknown message type
    const unknownRes = await sendAndReceive(ws, 'non_existent_type', {});
    assert.strictEqual(unknownRes.type, 'error_msg');
    assert.strictEqual(unknownRes.payload.code, 'INVALID_ACTION');

    ws.close();
  });

  test('4. Payload size limit (> 2KB) and rate limiting (> 10/sec)', async () => {
    const ws = await connectWs();

    // Payload > 2KB
    const oversized = 'x'.repeat(2500);
    const sizeRes = await sendRawAndReceive(ws, JSON.stringify({ v: 1, type: 'ping', payload: { data: oversized } }));
    assert.strictEqual(sizeRes.type, 'error_msg');
    assert.strictEqual(sizeRes.payload.code, 'PAYLOAD_TOO_LARGE');

    // Rate limiting: Send 15 messages rapidly in parallel
    const rateLimitPromise = new Promise((resolve) => {
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'error_msg' && msg.payload.code === 'RATE_LIMITED') {
          ws.removeListener('message', handler);
          resolve(true);
        }
      };
      ws.on('message', handler);
    });

    for (let i = 0; i < 15; i++) {
      ws.send(JSON.stringify({ v: 1, type: 'ping', payload: {} }));
    }

    const triggered = await Promise.race([
      rateLimitPromise,
      new Promise((r) => setTimeout(() => r(false), 1000))
    ]);
    assert.strictEqual(triggered, true);

    ws.close();
  });


  test('5. Nickname length and HTML validation', () => {
    // Empty
    assert.strictEqual(validateNickname('').valid, false);
    assert.strictEqual(validateNickname('   ').valid, false);

    // Too long (> 12 chars)
    assert.strictEqual(validateNickname('SuperLongNickname123').valid, false);

    // HTML input (length checked and trimmed safely)
    const scriptTag = '<script>1</script>'; // 18 chars
    assert.strictEqual(validateNickname(scriptTag).valid, false);

    const validHtmlChars = '<b>Hi</b>'; // 9 chars
    assert.strictEqual(validateNickname(validHtmlChars).valid, true);
  });

  test('6. Host creates a room, receives room_state and playerToken', async () => {
    const ws = await connectWs();
    const res = await sendAndReceive(ws, 'create_room', { nickname: 'HostAlex' });

    assert.strictEqual(res.type, 'room_state');
    assert.strictEqual(res.payload.phase, 'LOBBY');
    assert.strictEqual(res.payload.players.length, 1);
    assert.strictEqual(res.payload.players[0].nickname, 'HostAlex');
    assert.strictEqual(res.payload.players[0].isHost, true);
    assert.ok(res.payload.playerToken);
    assert.ok(res.payload.roomCode);

    ws.close();
  });

  test('7. Settings update for deepDive, cleanMode, allowKick, allowCaptionRemoval (host only)', async () => {
    const hostWs = await connectWs();
    const hostRes = await sendAndReceive(hostWs, 'create_room', { nickname: 'HostMaya' });
    const code = hostRes.payload.roomCode;

    const playerWs = await connectWs();
    await sendAndReceive(playerWs, 'join_room', { code, nickname: 'Sam' });

    // Non-host attempts to update settings -> rejected
    const nonHostUpdate = await sendAndReceive(playerWs, 'update_settings', { deepDive: false });
    assert.strictEqual(nonHostUpdate.type, 'error_msg');
    assert.strictEqual(nonHostUpdate.payload.code, 'NOT_HOST');

    // Host updates settings -> accepted
    const hostUpdate = await sendAndReceive(hostWs, 'update_settings', {
      deepDive: false,
      cleanMode: true,
      allowKick: true,
      allowCaptionRemoval: true
    });
    assert.strictEqual(hostUpdate.type, 'room_state');
    assert.strictEqual(hostUpdate.payload.settings.deepDive, false);
    assert.strictEqual(hostUpdate.payload.settings.cleanMode, true);

    hostWs.close();
    playerWs.close();
  });

  test('8. Kick player with token ban prevents rejoining with same token', async () => {
    const hostWs = await connectWs();
    const hostRes = await sendAndReceive(hostWs, 'create_room', { nickname: 'Host' });
    const code = hostRes.payload.roomCode;

    const trollWs = await connectWs();
    const trollJoin = await sendAndReceive(trollWs, 'join_room', { code, nickname: 'Troll' });
    const trollToken = trollJoin.payload.playerToken;
    const trollId = trollJoin.payload.yourPlayerId;

    // Listen for kicked message on trollWs
    const kickedPromise = new Promise((resolve) => {
      trollWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'kicked') resolve(msg);
      });
    });

    // Host kicks troll
    await sendAndReceive(hostWs, 'kick_player', { targetPlayerId: trollId });

    const kickedMsg = await kickedPromise;
    assert.strictEqual(kickedMsg.type, 'kicked');

    // Troll tries to reconnect using the same token
    const reconnectWs = await connectWs();
    const bannedRes = await sendAndReceive(reconnectWs, 'join_room', { code, playerToken: trollToken });
    assert.strictEqual(bannedRes.type, 'error_msg');
    assert.strictEqual(bannedRes.payload.code, 'BANNED_FROM_ROOM');

    hostWs.close();
    reconnectWs.close();
  });

  test('9. Leave room removes player and deletes empty room', async () => {
    const hostWs = await connectWs();
    const hostRes = await sendAndReceive(hostWs, 'create_room', { nickname: 'SoloHost' });
    const code = hostRes.payload.roomCode;
    assert.strictEqual(rooms.has(code), true);

    // Host leaves room
    hostWs.send(JSON.stringify({ v: 1, type: 'leave_room', payload: {} }));
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(rooms.has(code), false);

    hostWs.close();
  });


  test('10. Host promotion when host leaves or disconnects', async () => {
    const hostWs = await connectWs();
    const hostRes = await sendAndReceive(hostWs, 'create_room', { nickname: 'Host1' });
    const code = hostRes.payload.roomCode;

    const playerWs = await connectWs();
    const playerJoin = await sendAndReceive(playerWs, 'join_room', { code, nickname: 'Player2' });
    const player2Id = playerJoin.payload.yourPlayerId;

    const room = rooms.get(code);
    assert.strictEqual(room.hostId, hostRes.payload.yourPlayerId);

    // Simulate host disconnection & timer promotion trigger
    room.players[0].connected = false;
    handleHostPromotion(room);

    assert.strictEqual(room.hostId, player2Id);
    assert.strictEqual(room.players.find(p => p.id === player2Id).isHost, true);

    hostWs.close();
    playerWs.close();
  });

  test('11. Joining a game in progress is rejected for new players', async () => {
    const hostWs = await connectWs();
    const hostRes = await sendAndReceive(hostWs, 'create_room', { nickname: 'Host' });
    const code = hostRes.payload.roomCode;

    const room = rooms.get(code);
    room.phase = 'QUESTION'; // Simulate game started

    const newWs = await connectWs();
    const joinRes = await sendAndReceive(newWs, 'join_room', { code, nickname: 'LatePlayer' });
    assert.strictEqual(joinRes.type, 'error_msg');
    assert.strictEqual(joinRes.payload.code, 'GAME_ALREADY_STARTED');

    hostWs.close();
    newWs.close();
  });

  test('12. Inactive room expiry after 2 hours', async () => {
    const hostWs = await connectWs();
    const hostRes = await sendAndReceive(hostWs, 'create_room', { nickname: 'IdleHost' });
    const code = hostRes.payload.roomCode;

    const room = rooms.get(code);
    // Simulate room being inactive for 2 hours + 1 second
    room.lastActivity = Date.now() - (2 * 60 * 60 * 1000 + 1000);

    const expiredCount = cleanupInactiveRooms();
    assert.strictEqual(expiredCount >= 1, true);
    assert.strictEqual(rooms.has(code), false);

    hostWs.close();
  });

  test('13. Flood Protection: Total rooms cap (200) rejects create_room when full', async () => {
    const hostWs = await connectWs();
    // Temporarily fill rooms map to 200 dummy rooms
    const dummyCodes = [];
    for (let i = 0; i < 200; i++) {
      const dCode = `DUM${i.toString().padStart(3, '0')}`;
      rooms.set(dCode, { code: dCode, players: [], lastActivity: Date.now() });
      dummyCodes.push(dCode);
    }

    const res = await sendAndReceive(hostWs, 'create_room', { nickname: 'CapTester' });
    assert.strictEqual(res.type, 'error_msg');
    assert.strictEqual(res.payload.code, 'ROOM_LIMIT_REACHED');

    // Clean up dummy rooms
    for (const dCode of dummyCodes) {
      rooms.delete(dCode);
    }
    hostWs.close();
  });

  test('14. Flood Protection: Cap on connections per IP (40) rejects 41st connection', async () => {
    const sockets = [];
    try {
      for (let i = 0; i < 40; i++) {
        const ws = await connectWs();
        sockets.push(ws);
      }

      // 41st socket should be closed by server with code 1008
      const ws41 = new WebSocket(wsUrl);
      const closePromise = new Promise((resolve) => {
        ws41.on('close', (code, reason) => {
          resolve({ code, reason: reason.toString() });
        });
      });
      const closeEv = await closePromise;
      assert.strictEqual(closeEv.code, 1008);
    } finally {
      for (const s of sockets) {
        s.close();
      }
      ipConnections.clear();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('15. Flood Protection: Cap on room creations per IP per minute (5) rate limits', async () => {
    const ws = await connectWs();
    const createdCodes = [];
    try {
      // First 5 should succeed (or until limit)
      for (let i = 0; i < 5; i++) {
        const res = await sendAndReceive(ws, 'create_room', { nickname: `CreateBot${i}` });
        if (res.type === 'room_state') {
          createdCodes.push(res.payload.roomCode);
        }
      }

      // Next create_room within the same minute should be rate limited
      const resRateLimited = await sendAndReceive(ws, 'create_room', { nickname: 'TooFastHost' });
      assert.strictEqual(resRateLimited.type, 'error_msg');
      assert.strictEqual(resRateLimited.payload.code, 'RATE_LIMITED');
    } finally {
      ws.close();
      for (const c of createdCodes) {
        rooms.delete(c);
      }
    }
  });

  test('16. Trust Proxy: Ignores client X-Forwarded-For when TRUST_PROXY is off, and extracts last IP when TRUST_PROXY is on', async () => {
    const origTrust = process.env.TRUST_PROXY;

    // 1. When TRUST_PROXY is unset / false
    delete process.env.TRUST_PROXY;
    const wsNoTrust = await connectWs({ 'x-forwarded-for': '203.0.113.50' });
    // Should still resolve to 127.0.0.1 (remoteAddress)
    const resNoTrust = await sendAndReceive(wsNoTrust, 'create_room', { nickname: 'NoTrustBot' });
    assert.strictEqual(resNoTrust.type, 'room_state');
    assert.strictEqual(ipRoomCreations.has('127.0.0.1') || ipRoomCreations.has('::1') || ipRoomCreations.has('::ffff:127.0.0.1'), true);
    assert.strictEqual(ipRoomCreations.has('203.0.113.50'), false);
    wsNoTrust.close();
    if (resNoTrust.payload && resNoTrust.payload.roomCode) {
      rooms.delete(resNoTrust.payload.roomCode);
    }

    // 2. When TRUST_PROXY is true: simulate two different forwarded IPs where last entry is the client IP
    process.env.TRUST_PROXY = 'true';
    ipRoomCreations.clear();
    ipConnections.clear();

    const ip1 = '198.51.100.1';
    const ip2 = '198.51.100.2';

    const wsIp1 = await connectWs({ 'x-forwarded-for': `70.41.3.18, ${ip1}` });
    const wsIp2 = await connectWs({ 'x-forwarded-for': `70.41.3.19, ${ip2}` });

    // IP 1 creates 5 rooms up to limit
    const codesIp1 = [];
    for (let i = 0; i < 5; i++) {
      const res = await sendAndReceive(wsIp1, 'create_room', { nickname: `Ip1Host${i}` });
      if (res.type === 'room_state') codesIp1.push(res.payload.roomCode);
    }
    // IP 1 6th attempt is rate limited
    const resIp1Limit = await sendAndReceive(wsIp1, 'create_room', { nickname: 'Ip1Overflow' });
    assert.strictEqual(resIp1Limit.type, 'error_msg');
    assert.strictEqual(resIp1Limit.payload.code, 'RATE_LIMITED');

    // IP 2 is an independent IP and should NOT be blocked by IP 1's limit!
    const resIp2 = await sendAndReceive(wsIp2, 'create_room', { nickname: 'Ip2Host' });
    assert.strictEqual(resIp2.type, 'room_state');
    assert.ok(resIp2.payload.roomCode);
    codesIp1.push(resIp2.payload.roomCode);

    wsIp1.close();
    wsIp2.close();
    for (const c of codesIp1) {
      rooms.delete(c);
    }

    // Restore env
    if (origTrust !== undefined) process.env.TRUST_PROXY = origTrust;
    else delete process.env.TRUST_PROXY;
  });
});

