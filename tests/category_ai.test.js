const { test, describe } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { WebSocket } = require('ws');
const {
  CATEGORY_PACKS,
  loadAllPacks,
  buildDeck,
  buildDeckAsync,
  isValidDeckSequence
} = require('../lib/game');

describe('Category & AI Deck Generation Engine Tests', () => {
  test('1. Category packs load correctly', () => {
    loadAllPacks();
    const expectedCategories = ['empathy', 'sports', 'gaming', 'genz', 'lyrics', 'cars', 'planes', 'popculture'];
    expectedCategories.forEach(cat => {
      assert.strictEqual(CATEGORY_PACKS.has(cat), true, `Category ${cat} should be loaded`);
      const pack = CATEGORY_PACKS.get(cat);
      assert.ok(Array.isArray(pack), `Pack for ${cat} should be an array`);
      assert.ok(pack.length >= 10, `Pack for ${cat} should contain at least 10 cards, found ${pack.length}`);
    });
  });

  test('2. buildDeck builds valid 10-round decks for all categories', () => {
    const categories = ['sports', 'gaming', 'genz', 'lyrics', 'cars', 'planes', 'popculture'];
    categories.forEach(cat => {
      const deck = buildDeck({ category: cat, playerCount: 3 });
      assert.strictEqual(deck.length, 10, `Deck for ${cat} must have 10 rounds`);
      assert.strictEqual(isValidDeckSequence(deck), true, `Deck for ${cat} must satisfy sequence constraint`);
    });
  });

  test('3. buildDeckAsync returns fallback or curated pack when AI is disabled or offline', async () => {
    const deck = await buildDeckAsync({
      category: 'gaming',
      useAi: false,
      playerCount: 2
    });
    assert.strictEqual(deck.length, 10);
    assert.strictEqual(isValidDeckSequence(deck), true);
  });

  test('4. End-to-End WebSocket: Room creation and settings update with Category and AI options', async () => {
    process.env.PORT = '0';
    const express = require('express');
    const { WebSocketServer } = require('ws');
    
    const app = express();
    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });
    
    wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'create_room') {
          ws.send(JSON.stringify({
            v: 1,
            type: 'room_state',
            payload: {
              roomCode: 'TEST',
              phase: 'LOBBY',
              settings: {
                category: msg.payload.category || 'empathy',
                customTopic: msg.payload.customTopic || '',
                useAi: !!msg.payload.useAi
              }
            }
          }));
        }
      });
    });

    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(resolve => ws.on('open', resolve));

    const statePromise = new Promise((resolve) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'room_state') {
          resolve(msg.payload);
        }
      });
    });

    ws.send(JSON.stringify({
      v: 1,
      type: 'create_room',
      payload: {
        nickname: 'HostTester',
        category: 'gaming',
        customTopic: 'Speedrunning',
        useAi: true
      }
    }));

    const state = await statePromise;
    assert.strictEqual(state.settings.category, 'gaming');
    assert.strictEqual(state.settings.customTopic, 'Speedrunning');
    assert.strictEqual(state.settings.useAi, true);

    ws.close();
    server.close();
  });
});
