// scripts/screenshot.js — Automated 360x640 Screenshot Capture for all Screen States
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { app, server, rooms } = require('../server');

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotsDir = process.env.SCREENSHOTS_DIR || path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function captureAllScreens() {
  console.log('📸 Starting automated 360x640 screenshot capture with new minimalist landing page...');

  let testServer;
  let port = parseInt(process.env.SCREENSHOT_PORT || process.env.PORT || '3110', 10);
  await new Promise((resolve) => {
    testServer = server.listen(port, () => {
      console.log(`Server listening on port ${port} for screenshots.`);
      resolve();
    });
  });

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=360,640'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 360,
    height: 640,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const baseUrl = `http://localhost:${port}`;
  await page.goto(baseUrl, { waitUntil: 'networkidle0' });

  // 1. Landing Page
  console.log('Capturing 01_home.png (Landing Page)...');
  await page.screenshot({ path: path.join(screenshotsDir, '01_home.png') });
  await page.screenshot({ path: path.join(screenshotsDir, '01_home_full.png'), fullPage: true });

  // 2. Play Menu
  console.log('Capturing 02_play_menu.png...');
  await page.click('#btn-landing-play');
  await page.waitForSelector('#view-play-menu:not(.hidden)');
  await page.screenshot({ path: path.join(screenshotsDir, '02_play_menu.png') });

  // How to Play Modal from Play Menu
  console.log('Capturing 02_how_to_play.png...');
  await page.click('#btn-how-to-play-menu');
  await page.waitForSelector('#modal-how-to-play:not(.hidden)');
  await page.screenshot({ path: path.join(screenshotsDir, '02_how_to_play.png') });
  await page.click('#btn-close-rules');
  await new Promise(r => setTimeout(r, 100));

  // 3. Host Setup Screen
  console.log('Capturing 03_host_setup.png...');
  await page.click('#btn-show-host');
  await page.waitForSelector('#view-host-setup:not(.hidden)');
  await page.screenshot({ path: path.join(screenshotsDir, '03_host_setup.png') });

  // 4. Join Setup Screen
  console.log('Capturing 04_join_setup.png...');
  await page.click('#view-host-setup .btn-back');
  await page.click('#btn-show-join');
  await page.waitForSelector('#view-join-setup:not(.hidden)');
  await page.screenshot({ path: path.join(screenshotsDir, '04_join_setup.png') });

  // 5. Lobby Screen (Create real room)
  console.log('Capturing 05_lobby.png...');
  await page.click('#view-join-setup .btn-back');
  await page.click('#btn-show-host');
  await page.type('#host-nickname', 'Maya');
  await page.click('#btn-create-room');
  await page.waitForSelector('#view-lobby:not(.hidden)');
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(screenshotsDir, '05_lobby.png') });

  const roomCode = await page.evaluate(() => document.getElementById('lobby-room-code').textContent);
  const room = rooms.get(roomCode);

  const mockPlayers = [
    { id: 'p1', nickname: 'Maya', avatar: '•', isHost: true, score: 320, streak: 3 },
    { id: 'p2', nickname: 'Sam', avatar: '•', isHost: false, score: 280, streak: 1 },
    { id: 'p3', nickname: 'Jordan', avatar: '•', isHost: false, score: 250, streak: 0 }
  ];

  if (room && room.players.length > 0) {
    const hostPlayer = room.players[0];

    // 6. Round Intro Screen
    console.log('Capturing 06_round_intro.png...');
    const introPayload = {
      phase: 'ROUND_INTRO',
      round: 1,
      totalRounds: 10,
      cardType: 'shoes',
      topic: 'Periods',
      meter: 25,
      roomCode: room.code,
      yourPlayerId: hostPlayer.id,
      hostId: room.hostId,
      players: mockPlayers,
      settings: room.settings,
      endsAt: Date.now() + 3000
    };
    hostPlayer.ws.send(JSON.stringify({ v: 1, type: 'room_state', payload: introPayload }));
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(screenshotsDir, '06_round_intro.png') });

    // 7. Question Screen (Shoes)
    console.log('Capturing 07_question_shoes.png...');
    const shoesCard = {
      id: 'shoes-001',
      type: 'shoes',
      pack: 'core',
      topic: 'periods',
      scene: 'Meera has severe period cramps and is quietly folding over her desk in class.',
      q1: {
        prompt: 'How is Meera feeling right now?',
        options: ['Just looking for attention', 'In genuine physical pain and feeling self-conscious', 'Bored and daydreaming']
      },
      q2: {
        prompt: 'What is the kindest, most supportive move?',
        options: ['Make a loud joke to distract class', 'Quietly ask if she needs water or a heat pack', 'Tell her to tough it out']
      }
    };
    const shoesPayload = {
      phase: 'QUESTION',
      round: 1,
      totalRounds: 10,
      meter: 35,
      card: shoesCard,
      roomCode: room.code,
      roundId: 'r1',
      yourPlayerId: hostPlayer.id,
      hostId: room.hostId,
      players: mockPlayers,
      settings: room.settings,
      endsAt: Date.now() + 25000,
      answeredCount: 1,
      totalPlayers: 3
    };
    hostPlayer.ws.send(JSON.stringify({ v: 1, type: 'room_state', payload: shoesPayload }));
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(screenshotsDir, '07_question_shoes.png') });

    // 8. Question Screen (Reel)
    console.log('Capturing 08_question_reel.png...');
    const reelCard = {
      id: 'reel-005',
      type: 'reel',
      pack: 'core',
      topic: 'beauty',
      scene: 'Viral Skincare Video: "If a product label lists long scientific names, it means it contains dangerous toxic chemicals!"',
      q2: {
        prompt: 'Is this claim Real or Reel?',
        options: ['Real', 'Reel']
      }
    };
    const reelPayload = {
      phase: 'QUESTION',
      round: 2,
      totalRounds: 10,
      meter: 50,
      card: reelCard,
      roomCode: room.code,
      roundId: 'r2',
      yourPlayerId: hostPlayer.id,
      hostId: room.hostId,
      players: mockPlayers,
      settings: room.settings,
      endsAt: Date.now() + 18000,
      answeredCount: 2,
      totalPlayers: 3
    };
    hostPlayer.ws.send(JSON.stringify({ v: 1, type: 'room_state', payload: reelPayload }));
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(screenshotsDir, '08_question_reel.png') });

    // 9. Question Screen (Writing - Caption This)
    console.log('Capturing 09_question_writing.png...');
    const writingPayload = {
      phase: 'WRITING',
      round: 3,
      totalRounds: 10,
      meter: 65,
      roomCode: room.code,
      roundId: 'r3',
      scene: 'Your cat knocked over the entire pizza box and is staring at you with zero regret.',
      prompt: 'Write a witty or kind caption (max 80 chars):',
      yourPlayerId: hostPlayer.id,
      hostId: room.hostId,
      players: mockPlayers,
      settings: room.settings,
      endsAt: Date.now() + 16000
    };
    hostPlayer.ws.send(JSON.stringify({ v: 1, type: 'room_state', payload: writingPayload }));
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(screenshotsDir, '09_question_writing.png') });

    // 10. Caption Review Screen (Moderation Window)
    console.log('Capturing 10_caption_review.png...');
    const reviewPayload = {
      phase: 'CAPTION_REVIEW',
      round: 3,
      totalRounds: 10,
      meter: 65,
      roomCode: room.code,
      roundId: 'r3',
      scene: 'Your cat knocked over the entire pizza box and is staring at you with zero regret.',
      isHostReview: true,
      captions: [
        { id: 'c1', text: 'Main character energy at its finest', authorNickname: 'Sam' },
        { id: 'c2', text: 'Thought you ordered this extra cheese for me', authorNickname: 'Maya' }
      ],
      yourPlayerId: hostPlayer.id,
      hostId: room.hostId,
      players: mockPlayers,
      settings: room.settings,
      endsAt: Date.now() + 4500
    };
    hostPlayer.ws.send(JSON.stringify({ v: 1, type: 'room_state', payload: reviewPayload }));
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(screenshotsDir, '10_caption_review.png') });

    // 11. Caption Voting Screen (Anonymous Voting)
    console.log('Capturing 11_caption_voting.png...');
    const votingPayload = {
      phase: 'CAPTION_VOTING',
      round: 3,
      totalRounds: 10,
      meter: 65,
      roomCode: room.code,
      roundId: 'r3',
      scene: 'Your cat knocked over the entire pizza box and is staring at you with zero regret.',
      captions: [
        { id: 'c1', text: 'Main character energy at its finest', isOwn: false },
        { id: 'c2', text: 'Thought you ordered this extra cheese for me', isOwn: true }
      ],
      hasVoted: false,
      yourPlayerId: hostPlayer.id,
      hostId: room.hostId,
      players: mockPlayers,
      settings: room.settings,
      endsAt: Date.now() + 12000
    };
    hostPlayer.ws.send(JSON.stringify({ v: 1, type: 'room_state', payload: votingPayload }));
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(screenshotsDir, '11_caption_voting.png') });

    // 12. Reveal Screen
    console.log('Capturing 12_reveal.png...');
    const revealPayload = {
      phase: 'REVEAL',
      round: 1,
      totalRounds: 10,
      meter: 80,
      scene: 'Meera has severe period cramps and is quietly folding over her desk in class.',
      explain: 'Period cramps are real physical contractions of uterine muscle. Offering quiet support like a heat pack or water helps, and severe pain is always worth seeing a doctor about.',
      slang: [
        { word: 'lowkey', meaning: 'subtly / without drawing unnecessary attention' }
      ],
      wasCorrect: { q1Correct: true, q2Correct: true },
      yourPointsEarned: 148,
      speedBonus: 48,
      playerResults: [
        { nickname: 'Maya', correct: true, pointsGained: 148 },
        { nickname: 'Sam', correct: true, pointsGained: 135 },
        { nickname: 'Jordan', correct: false, pointsGained: 0 }
      ],
      roomCode: room.code,
      yourPlayerId: hostPlayer.id,
      hostId: room.hostId,
      players: mockPlayers,
      settings: room.settings,
      endsAt: Date.now() + 9000
    };
    hostPlayer.ws.send(JSON.stringify({ v: 1, type: 'room_state', payload: revealPayload }));
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(screenshotsDir, '12_reveal.png') });

    // 13. Leaderboard Screen
    console.log('Capturing 13_leaderboard.png...');
    const leaderboardPayload = {
      phase: 'LEADERBOARD',
      round: 3,
      totalRounds: 10,
      meter: 80,
      leaderboard: [
        { rank: 1, nickname: 'Maya', score: 440, streak: 3 },
        { rank: 2, nickname: 'Sam', score: 380, streak: 1 },
        { rank: 3, nickname: 'Jordan', score: 250, streak: 0 }
      ],
      roomCode: room.code,
      yourPlayerId: hostPlayer.id,
      hostId: room.hostId,
      players: mockPlayers,
      settings: room.settings,
      endsAt: Date.now() + 4500
    };
    hostPlayer.ws.send(JSON.stringify({ v: 1, type: 'room_state', payload: leaderboardPayload }));
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(screenshotsDir, '13_leaderboard.png') });

    // 14. Final Screen (Game Complete)
    console.log('Capturing 14_final.png...');
    const finalPayload = {
      phase: 'FINAL',
      meterFinal: 100,
      meterSuccess: true,
      finalScores: [
        { rank: 1, nickname: 'Maya', score: 1420 },
        { rank: 2, nickname: 'Sam', score: 1340 },
        { rank: 3, nickname: 'Jordan', score: 1150 }
      ],
      titles: [
        { nickname: 'Maya', title: 'The Empathy MVP', reason: 'Highest overall empathy score' },
        { nickname: 'Sam', title: 'Myth Buster', reason: 'Spotted every social media myth' },
        { nickname: 'Jordan', title: 'Speed Demon', reason: 'Fastest average response time' }
      ],
      challenge: 'Ask a friend today how they are really doing, and listen without giving advice.',
      roomCode: room.code,
      yourPlayerId: hostPlayer.id,
      hostId: room.hostId,
      players: mockPlayers,
      settings: room.settings
    };
    hostPlayer.ws.send(JSON.stringify({ v: 1, type: 'room_state', payload: finalPayload }));
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(screenshotsDir, '14_final.png') });
  }

  await browser.close();
  await new Promise((resolve) => testServer.close(resolve));
  console.log('🎉 All 14 screenshots updated cleanly in screenshots/ at 360x640!');
}

captureAllScreens().catch((err) => {
  console.error('❌ Screenshot capture error:', err);
  process.exit(1);
});
