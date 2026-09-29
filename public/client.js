// FEEL IT — Minimalist Monochrome Frontend Runtime
// Zero Dependencies, Pure Vanilla JS, Procedural Web Audio, Clean State Machine

(function () {
  'use strict';

  // -------------------------------------------------------------
  // 1. Audio Synthesizer (Web Audio API - Zero External Assets)
  // Muted by default
  // -------------------------------------------------------------
  class SoundManager {
    constructor() {
      this.ctx = null;
      this.enabled = localStorage.getItem('feel_it_sound') === 'true';
    }

    initCtx() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem('feel_it_sound', this.enabled ? 'true' : 'false');
      if (this.enabled) {
        this.initCtx();
        this.playTap();
      }
      return this.enabled;
    }

    playTap() {
      if (!this.enabled) return;
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    }

    playChime() {
      if (!this.enabled) return;
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);

        gain.gain.setValueAtTime(0.12, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.3);
      });
    }

    playCorrect() {
      if (!this.enabled) return;
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.2, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.5);
      });
    }

    playIncorrect() {
      if (!this.enabled) return;
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [329.63, 293.66, 261.63];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);

        gain.gain.setValueAtTime(0.15, now + idx * 0.1);
        gain.gain.linearRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.4);
      });
    }

    playTick() {
      if (!this.enabled) return;
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    }

    playMeterUp() {
      if (!this.enabled) return;
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [440, 554.37, 659.25, 880, 1108.73].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        gain.gain.setValueAtTime(0.12, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.25);
      });
    }

    playVictory() {
      if (!this.enabled) return;
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const melody = [
        { freq: 523.25, time: 0.00, dur: 0.15 },
        { freq: 659.25, time: 0.15, dur: 0.15 },
        { freq: 783.99, time: 0.30, dur: 0.15 },
        { freq: 1046.50, time: 0.45, dur: 0.45 }
      ];

      melody.forEach(item => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(item.freq, now + item.time);

        gain.gain.setValueAtTime(0.25, now + item.time);
        gain.gain.exponentialRampToValueAtTime(0.001, now + item.time + item.dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + item.time);
        osc.stop(now + item.time + item.dur);
      });
    }
  }

  const sound = new SoundManager();

  // -------------------------------------------------------------
  // 2. Confetti Particle Engine (Monochrome Palette, Motion-Aware)
  // -------------------------------------------------------------
  class ConfettiEngine {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.particles = [];
      this.animId = null;

      if (this.canvas) {
        this.resize();
        window.addEventListener('resize', () => this.resize());
      }
    }

    resize() {
      if (!this.canvas) return;
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }

    burst(count = 70) {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      if (!this.canvas || !this.ctx) return;
      this.resize();

      const colors = ['#fafafa', '#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a'];
      const cx = this.canvas.width / 2;
      const cy = this.canvas.height / 3;

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 3;
        this.particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          size: Math.random() * 6 + 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 10,
          opacity: 1,
          gravity: 0.15
        });
      }

      if (!this.animId) {
        this.loop();
      }
    }

    loop() {
      if (!this.ctx) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.012;

        if (p.opacity <= 0) {
          this.particles.splice(i, 1);
          continue;
        }

        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate((p.rotation * Math.PI) / 180);
        this.ctx.globalAlpha = p.opacity;
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        this.ctx.restore();
      }

      if (this.particles.length > 0) {
        this.animId = requestAnimationFrame(() => this.loop());
      } else {
        this.animId = null;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }
  }

  const confetti = new ConfettiEngine('confetti-canvas');

  // -------------------------------------------------------------
  // 3. Application State & DOM Cache
  // -------------------------------------------------------------
  let ws = null;
  let currentState = null;
  let myPlayerId = null;
  let myToken = sessionStorage.getItem('feel_it_token') || null;
  let savedRoom = sessionStorage.getItem('feel_it_room') || null;
  let timerInterval = null;
  let prevMeter = 0;

  // Selected answers in shoes mode
  let shoesSelectedQ1 = null;
  let shoesSelectedQ2 = null;

  // Views Map
  const views = {
    landing: document.getElementById('view-landing'),
    playMenu: document.getElementById('view-play-menu'),
    hostSetup: document.getElementById('view-host-setup'),
    joinSetup: document.getElementById('view-join-setup'),
    lobby: document.getElementById('view-lobby'),
    roundIntro: document.getElementById('view-round-intro'),
    question: document.getElementById('view-question'),
    reveal: document.getElementById('view-reveal'),
    leaderboard: document.getElementById('view-leaderboard'),
    final: document.getElementById('view-final')
  };

  // Header & Controls
  const gameHeader = document.getElementById('game-header');
  const meterPercent = document.getElementById('meter-percent');
  const meterFill = document.getElementById('meter-fill');
  const toastEl = document.getElementById('toast');
  const modalHowToPlay = document.getElementById('modal-how-to-play');
  const overlayPaused = document.getElementById('overlay-paused');
  const pauseReason = document.getElementById('pause-reason');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const btnSoundToggleLanding = document.getElementById('btn-sound-toggle-landing');

  // Forms
  const formHost = document.getElementById('form-host');
  const formJoin = document.getElementById('form-join');

  // Lobby Elements
  const lobbyRoomCode = document.getElementById('lobby-room-code');
  const lobbyPlayerList = document.getElementById('lobby-player-list');
  const lobbyPlayerCount = document.getElementById('lobby-player-count');
  const minPlayersWarning = document.getElementById('min-players-warning');
  const lobbySettingsPanel = document.getElementById('lobby-settings-panel');
  const btnStartGame = document.getElementById('btn-start-game');
  const lobbyWaitingMsg = document.getElementById('lobby-waiting-msg');
  const settingDeepDive = document.getElementById('setting-deep-dive');
  const settingCleanMode = document.getElementById('setting-clean-mode');

  // Question Elements
  const qRoundLabel = document.getElementById('q-round-label');
  const qTypeBadge = document.getElementById('q-type-badge');
  const qTimerBadge = document.getElementById('q-timer-badge');
  const qTimerSeconds = document.getElementById('q-timer-seconds');
  const qTimerBar = document.getElementById('q-timer-bar');
  const qSceneText = document.getElementById('q-scene-text');
  const shoesContainer = document.getElementById('shoes-container');
  const shoesQ1Prompt = document.getElementById('shoes-q1-prompt');
  const shoesQ1Options = document.getElementById('shoes-q1-options');
  const shoesQ2Prompt = document.getElementById('shoes-q2-prompt');
  const shoesQ2Options = document.getElementById('shoes-q2-options');
  const btnSubmitShoes = document.getElementById('btn-submit-shoes');
  const standardOptionsContainer = document.getElementById('standard-options-container');
  const standardQPrompt = document.getElementById('standard-q-prompt');
  const standardOptionsList = document.getElementById('standard-options-list');
  const writingContainer = document.getElementById('writing-container');
  const writingInput = document.getElementById('writing-input');
  const writingCharCount = document.getElementById('writing-char-count');
  const btnSubmitCaption = document.getElementById('btn-submit-caption');
  const qAnswerProgress = document.getElementById('q-answer-progress');
  const btnSkipRound = document.getElementById('btn-skip-round');

  // Reveal Elements
  const revealBadgeStatus = document.getElementById('reveal-badge-status');
  const revealSceneText = document.getElementById('reveal-scene-text');
  const revealExplainText = document.getElementById('reveal-explain-text');
  const revealSlangSection = document.getElementById('reveal-slang-section');
  const revealSlangList = document.getElementById('reveal-slang-list');
  const revealPointsGained = document.getElementById('reveal-points-gained');
  const revealSpeedBonus = document.getElementById('reveal-speed-bonus');
  const revealPlayerResults = document.getElementById('reveal-player-results');
  const btnRevealNext = document.getElementById('btn-reveal-next');
  const revealTimerCountdown = document.getElementById('reveal-timer-countdown');

  // Leaderboard Elements
  const lbRoundSubtext = document.getElementById('lb-round-subtext');
  const leaderboardList = document.getElementById('leaderboard-list');
  const btnLeaderboardNext = document.getElementById('btn-leaderboard-next');
  const lbTimerCountdown = document.getElementById('lb-timer-countdown');

  // Final Elements
  const finalMeterBanner = document.getElementById('final-meter-banner');
  const finalMeterPercent = document.getElementById('final-meter-percent');
  const finalMeterMsg = document.getElementById('final-meter-msg');
  const finalPodiumList = document.getElementById('final-podium-list');
  const finalTitlesList = document.getElementById('final-titles-list');
  const finalChallengeText = document.getElementById('final-challenge-text');
  const btnPlayAgain = document.getElementById('btn-play-again');

  // -------------------------------------------------------------
  // 4. UI Utilities & Sound Toggle
  // -------------------------------------------------------------
  function updateSoundButtonIcons() {
    const icon = sound.enabled ? '🔊' : '🔇';
    const label = sound.enabled ? 'Mute sound' : 'Unmute sound';
    if (btnSoundToggle) {
      btnSoundToggle.textContent = icon;
      btnSoundToggle.setAttribute('aria-label', label);
    }
    if (btnSoundToggleLanding) {
      btnSoundToggleLanding.textContent = icon;
      btnSoundToggleLanding.setAttribute('aria-label', label);
    }
  }
  updateSoundButtonIcons();

  if (btnSoundToggle) {
    btnSoundToggle.onclick = () => {
      sound.toggle();
      updateSoundButtonIcons();
    };
  }
  if (btnSoundToggleLanding) {
    btnSoundToggleLanding.onclick = () => {
      sound.toggle();
      updateSoundButtonIcons();
    };
  }

  function showToast(msg, duration = 3200) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    setTimeout(() => {
      toastEl.classList.add('hidden');
    }, duration);
  }

  function switchView(activeViewName) {
    Object.keys(views).forEach((name) => {
      if (name === activeViewName) {
        views[name].classList.remove('hidden');
        views[name].classList.add('active');
      } else {
        views[name].classList.add('hidden');
        views[name].classList.remove('active');
      }
    });

    const activePhases = ['roundIntro', 'question', 'reveal', 'leaderboard', 'final'];
    if (activePhases.includes(activeViewName)) {
      gameHeader.classList.remove('hidden');
    } else {
      gameHeader.classList.add('hidden');
    }
    window.scrollTo(0, 0);
  }

  function updateEmpathyMeter(meter) {
    const val = Math.min(100, Math.max(0, meter || 0));
    meterPercent.textContent = `${val}%`;
    meterFill.style.width = `${val}%`;

    if (val > prevMeter && prevMeter > 0) {
      sound.playMeterUp();
    }
    if (val >= 100 && prevMeter < 100) {
      confetti.burst(80);
    }
    prevMeter = val;
  }

  function startCountdown(endsAt, totalDurationMs, onTick, onComplete) {
    if (timerInterval) clearInterval(timerInterval);

    let lastTickSecond = -1;

    function tick() {
      const now = Date.now();
      const remaining = Math.max(0, endsAt - now);
      const fraction = Math.min(1, Math.max(0, remaining / totalDurationMs));
      const secondsLeft = Math.ceil(remaining / 1000);

      if (secondsLeft <= 5 && secondsLeft > 0 && secondsLeft !== lastTickSecond) {
        lastTickSecond = secondsLeft;
        sound.playTick();
      }

      onTick(secondsLeft, fraction);

      if (remaining <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        if (onComplete) onComplete();
      }
    }

    tick();
    timerInterval = setInterval(tick, 100);
  }

  // -------------------------------------------------------------
  // 5. WebSocket Connection & Protocol Envelope
  // -------------------------------------------------------------
  function getWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  function initWebSocket(onOpenCallback) {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      if (onOpenCallback && ws.readyState === WebSocket.OPEN) onOpenCallback();
      return;
    }

    ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      if (onOpenCallback) onOpenCallback();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.v === 1) {
          handleServerMessage(msg.type, msg.payload);
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WS Error:', err);
      showToast('Connection issue. Reconnecting...');
    };

    ws.onclose = () => {
      setTimeout(() => {
        if (myToken && savedRoom) {
          initWebSocket(() => {
            sendEnvelope('join_room', {
              code: savedRoom,
              nickname: '',
              playerToken: myToken
            });
          });
        }
      }, 2000);
    };
  }

  function sendEnvelope(type, payload = {}) {
    sound.playTap();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      initWebSocket(() => {
        ws.send(JSON.stringify({ v: 1, type, payload }));
      });
      return;
    }
    ws.send(JSON.stringify({ v: 1, type, payload }));
  }

  // -------------------------------------------------------------
  // 6. Server Message Handler
  // -------------------------------------------------------------
  function handleServerMessage(type, payload) {
    switch (type) {
      case 'room_state': {
        currentState = payload;
        if (payload.yourPlayerId) myPlayerId = payload.yourPlayerId;
        if (payload.playerToken) {
          myToken = payload.playerToken;
          sessionStorage.setItem('feel_it_token', myToken);
        }
        if (payload.roomCode) {
          savedRoom = payload.roomCode;
          sessionStorage.setItem('feel_it_room', payload.roomCode);
        }

        renderRoomState(payload);
        break;
      }

      case 'answer_progress': {
        if (qAnswerProgress) {
          qAnswerProgress.textContent = `${payload.answeredCount} of ${payload.totalPlayers} answered`;
        }
        break;
      }

      case 'error_msg': {
        sound.playIncorrect();
        showToast(`${payload.message || 'An error occurred'}`);
        break;
      }

      case 'kicked': {
        sessionStorage.removeItem('feel_it_token');
        sessionStorage.removeItem('feel_it_room');
        sound.playIncorrect();
        showToast('You were removed from the room.');
        switchView('landing');
        break;
      }

      case 'room_expired': {
        sessionStorage.removeItem('feel_it_token');
        sessionStorage.removeItem('feel_it_room');
        showToast('Room expired due to inactivity.');
        switchView('landing');
        break;
      }

      case 'paused': {
        if (overlayPaused) {
          pauseReason.textContent = payload.reason || 'Waiting for players...';
          overlayPaused.classList.remove('hidden');
        }
        break;
      }

      case 'resumed': {
        if (overlayPaused) {
          overlayPaused.classList.add('hidden');
        }
        break;
      }

      default:
        break;
    }
  }

  // -------------------------------------------------------------
  // 7. State Machine Renderer by Phase
  // -------------------------------------------------------------
  function renderRoomState(state) {
    const isHost = state.yourPlayerId === state.hostId;
    updateEmpathyMeter(state.meter);

    // 1. LOBBY
    if (state.phase === 'LOBBY') {
      switchView('lobby');
      lobbyRoomCode.textContent = state.roomCode;
      const count = state.players ? state.players.length : 0;
      lobbyPlayerCount.textContent = count;

      if (isHost) {
        lobbySettingsPanel.classList.remove('hidden');
        btnStartGame.classList.remove('hidden');
        lobbyWaitingMsg.classList.add('hidden');
        btnStartGame.disabled = count < 2;
        minPlayersWarning.classList.toggle('hidden', count >= 2);

        if (state.settings) {
          settingDeepDive.checked = !!state.settings.deepDive;
          settingCleanMode.checked = !!state.settings.cleanMode;
        }
      } else {
        lobbySettingsPanel.classList.add('hidden');
        btnStartGame.classList.add('hidden');
        lobbyWaitingMsg.classList.remove('hidden');
        minPlayersWarning.classList.add('hidden');
      }

      lobbyPlayerList.innerHTML = '';
      (state.players || []).forEach((player) => {
        const li = document.createElement('li');
        li.className = 'player-item';

        const metaDiv = document.createElement('div');
        metaDiv.className = 'player-meta';

        const avatarSpan = document.createElement('span');
        avatarSpan.className = 'player-avatar';
        avatarSpan.textContent = player.avatar || '•';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = player.nickname;

        metaDiv.appendChild(avatarSpan);
        metaDiv.appendChild(nameSpan);

        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'player-tags';

        if (player.id === state.hostId) {
          const hostTag = document.createElement('span');
          hostTag.className = 'tag host';
          hostTag.textContent = 'Host';
          tagsDiv.appendChild(hostTag);
        }

        if (player.id === state.yourPlayerId) {
          const youTag = document.createElement('span');
          youTag.className = 'tag you';
          youTag.textContent = 'You';
          tagsDiv.appendChild(youTag);
        }

        if (isHost && player.id !== state.hostId && state.settings && state.settings.allowKick) {
          const kickBtn = document.createElement('button');
          kickBtn.className = 'btn-kick';
          kickBtn.textContent = 'Kick';
          kickBtn.onclick = () => {
            if (confirm(`Kick ${player.nickname} from the room?`)) {
              sendEnvelope('kick_player', { targetPlayerId: player.id });
            }
          };
          tagsDiv.appendChild(kickBtn);
        }

        li.appendChild(metaDiv);
        li.appendChild(tagsDiv);
        lobbyPlayerList.appendChild(li);
      });
    }

    // 2. ROUND INTRO (3s)
    else if (state.phase === 'ROUND_INTRO') {
      switchView('roundIntro');
      document.getElementById('intro-round-num').textContent = `Round ${state.round} / ${state.totalRounds || 10}`;
      const titleEl = document.getElementById('intro-card-title');
      const topicEl = document.getElementById('intro-topic-badge');

      const titles = {
        shoes: "Step Into Their Shoes",
        reel: "Real or Reel?",
        smooth: "Say It Smooth",
        caption: "Caption This"
      };
      titleEl.textContent = titles[state.cardType] || "Get Ready";
      topicEl.textContent = `Topic: ${state.topic || 'General'}`;
    }

    // 3. QUESTION
    else if (state.phase === 'QUESTION') {
      switchView('question');
      shoesSelectedQ1 = null;
      shoesSelectedQ2 = null;

      qRoundLabel.textContent = `Round ${state.round}/${state.totalRounds || 10}`;
      qTypeBadge.textContent = (state.card && state.card.type ? state.card.type : 'Question').toUpperCase();
      qSceneText.textContent = state.card ? state.card.scene : '';

      qAnswerProgress.textContent = `${state.answeredCount || 0} of ${state.totalPlayers || 2} answered`;
      btnSkipRound.classList.toggle('hidden', !isHost);

      const duration = state.card && state.card.type === 'shoes' ? 30000 : 20000;
      startCountdown(state.endsAt, duration, (secondsLeft, fraction) => {
        qTimerSeconds.textContent = secondsLeft;
        qTimerBar.style.width = `${fraction * 100}%`;
      });

      shoesContainer.classList.add('hidden');
      standardOptionsContainer.classList.add('hidden');
      writingContainer.classList.add('hidden');
      const reviewContainer = document.getElementById('caption-review-container');
      const votingContainer = document.getElementById('caption-voting-container');
      if (reviewContainer) reviewContainer.classList.add('hidden');
      if (votingContainer) votingContainer.classList.add('hidden');

      const card = state.card;
      if (!card) return;

      // Handle Shoes Card Mode
      if (card.type === 'shoes') {
        shoesContainer.classList.remove('hidden');
        shoesQ1Prompt.textContent = `1. ${card.q1.prompt}`;
        shoesQ2Prompt.textContent = `2. ${card.q2.prompt}`;
        btnSubmitShoes.disabled = true;
        btnSubmitShoes.textContent = "Lock in Answers";

        shoesQ1Options.innerHTML = '';
        card.q1.options.forEach((opt, idx) => {
          const btn = document.createElement('button');
          btn.className = 'opt-btn';
          btn.textContent = opt;
          btn.onclick = () => {
            sound.playTap();
            shoesSelectedQ1 = idx;
            shoesQ1Options.querySelectorAll('.opt-btn').forEach((b, i) => b.classList.toggle('selected', i === idx));
            checkShoesSubmitReady();
          };
          shoesQ1Options.appendChild(btn);
        });

        shoesQ2Options.innerHTML = '';
        card.q2.options.forEach((opt, idx) => {
          const btn = document.createElement('button');
          btn.className = 'opt-btn';
          btn.textContent = opt;
          btn.onclick = () => {
            sound.playTap();
            shoesSelectedQ2 = idx;
            shoesQ2Options.querySelectorAll('.opt-btn').forEach((b, i) => b.classList.toggle('selected', i === idx));
            checkShoesSubmitReady();
          };
          shoesQ2Options.appendChild(btn);
        });

        function checkShoesSubmitReady() {
          btnSubmitShoes.disabled = !(shoesSelectedQ1 !== null && shoesSelectedQ2 !== null);
        }

        btnSubmitShoes.onclick = () => {
          if (shoesSelectedQ1 !== null && shoesSelectedQ2 !== null) {
            sound.playChime();
            btnSubmitShoes.disabled = true;
            btnSubmitShoes.textContent = "Locked in";
            sendEnvelope('submit_answer', {
              roundId: state.roundId,
              q1Index: shoesSelectedQ1,
              q2Index: shoesSelectedQ2
            });
          }
        };
      }

      // Handle Standard Choice (Reel, Smooth, Caption Pick)
      else if (card.type === 'reel' || card.type === 'smooth' || (card.type === 'caption' && card.mode === 'pick')) {
        standardOptionsContainer.classList.remove('hidden');
        const options = card.q2 ? card.q2.options : (card.q1 ? card.q1.options : []);
        standardQPrompt.textContent = card.q2 && card.q2.prompt ? card.q2.prompt : (card.type === 'reel' ? 'Is this Real or Reel?' : 'Choose the best move:');

        standardOptionsList.innerHTML = '';
        options.forEach((opt, idx) => {
          const btn = document.createElement('button');
          btn.className = 'opt-btn';
          btn.textContent = opt;
          btn.onclick = () => {
            sound.playChime();
            standardOptionsList.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);
            btn.classList.add('selected');
            sendEnvelope('submit_answer', {
              roundId: state.roundId,
              answerIndex: idx
            });
          };
          standardOptionsList.appendChild(btn);
        });
      }
    }

    // 4. WRITING (Caption This)
    else if (state.phase === 'WRITING') {
      switchView('question');
      shoesContainer.classList.add('hidden');
      standardOptionsContainer.classList.add('hidden');
      const reviewContainer = document.getElementById('caption-review-container');
      const votingContainer = document.getElementById('caption-voting-container');
      if (reviewContainer) reviewContainer.classList.add('hidden');
      if (votingContainer) votingContainer.classList.add('hidden');
      writingContainer.classList.remove('hidden');

      qRoundLabel.textContent = `Round ${state.round}/${state.totalRounds || 10}`;
      qTypeBadge.textContent = "CAPTION THIS";
      qSceneText.textContent = state.scene || '';
      document.getElementById('writing-prompt').textContent = state.prompt || "Write a caption:";

      writingInput.value = '';
      writingCharCount.textContent = '0/80';
      btnSubmitCaption.disabled = false;
      btnSubmitCaption.textContent = 'Submit Caption';

      startCountdown(state.endsAt, 20000, (secondsLeft, fraction) => {
        qTimerSeconds.textContent = secondsLeft;
        qTimerBar.style.width = `${fraction * 100}%`;
      });
    }

    // 4b. CAPTION REVIEW (Host Moderation Window - 5s)
    else if (state.phase === 'CAPTION_REVIEW') {
      switchView('question');
      shoesContainer.classList.add('hidden');
      standardOptionsContainer.classList.add('hidden');
      writingContainer.classList.add('hidden');
      const votingContainer = document.getElementById('caption-voting-container');
      if (votingContainer) votingContainer.classList.add('hidden');

      const reviewContainer = document.getElementById('caption-review-container');
      const reviewContent = document.getElementById('caption-review-content');
      const btnStartVotingEarly = document.getElementById('btn-start-voting-early');
      reviewContainer.classList.remove('hidden');

      qRoundLabel.textContent = `Round ${state.round}/${state.totalRounds || 10}`;
      qTypeBadge.textContent = "MODERATION (5s)";
      qSceneText.textContent = state.scene || '';

      if (state.isHostReview) {
        btnStartVotingEarly.classList.remove('hidden');
        btnStartVotingEarly.onclick = () => {
          sendEnvelope('next_step', {});
        };

        reviewContent.innerHTML = '<p class="helper-text" style="margin-bottom: 8px;"><strong>Host Moderation:</strong> Remove inappropriate submissions before anonymous voting starts.</p>';
        const list = document.createElement('ul');
        list.className = 'review-list';

        (state.captions || []).forEach(cap => {
          const li = document.createElement('li');
          li.className = 'review-item';
          li.innerHTML = `
            <div class="review-item-text">
              <strong>${cap.authorNickname || 'Anonymous'}:</strong> "${cap.text}"
            </div>
            <button class="btn-danger-ghost btn-small" title="Remove this caption">Remove</button>
          `;
          li.querySelector('button').onclick = () => {
            sendEnvelope('remove_caption', { roundId: state.roundId, captionId: cap.id });
          };
          list.appendChild(li);
        });
        reviewContent.appendChild(list);
      } else {
        btnStartVotingEarly.classList.add('hidden');
        reviewContent.innerHTML = `
          <div class="waiting-box text-center" style="padding: 16px 0;">
            <p>Host is reviewing submissions for safety...</p>
            <p class="subtitle" style="font-size: 0.9rem; margin-top: 4px;">Anonymous voting begins shortly.</p>
          </div>
        `;
      }

      startCountdown(state.endsAt, 5000, (secondsLeft, fraction) => {
        qTimerSeconds.textContent = secondsLeft;
        qTimerBar.style.width = `${fraction * 100}%`;
      });
    }

    // 4c. CAPTION VOTING (Anonymous Voting - 15s)
    else if (state.phase === 'CAPTION_VOTING') {
      switchView('question');
      shoesContainer.classList.add('hidden');
      standardOptionsContainer.classList.add('hidden');
      writingContainer.classList.add('hidden');
      const reviewContainer = document.getElementById('caption-review-container');
      if (reviewContainer) reviewContainer.classList.add('hidden');

      const votingContainer = document.getElementById('caption-voting-container');
      const votingList = document.getElementById('caption-voting-list');
      votingContainer.classList.remove('hidden');

      qRoundLabel.textContent = `Round ${state.round}/${state.totalRounds || 10}`;
      qTypeBadge.textContent = "VOTE FOR CAPTION";
      qSceneText.textContent = state.scene || '';

      votingList.innerHTML = '';
      (state.captions || []).forEach(cap => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        if (cap.isOwn) {
          btn.disabled = true;
          btn.innerHTML = `"${cap.text}" <span class="tag" style="margin-left: 8px; font-size: 0.8rem;">(Your caption)</span>`;
        } else {
          btn.textContent = `"${cap.text}"`;
          if (state.hasVoted) {
            btn.disabled = true;
          } else {
            btn.onclick = () => {
              sound.playChime();
              votingList.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);
              btn.classList.add('selected');
              sendEnvelope('submit_vote', {
                roundId: state.roundId,
                captionId: cap.id
              });
            };
          }
        }
        votingList.appendChild(btn);
      });

      startCountdown(state.endsAt, 15000, (secondsLeft, fraction) => {
        qTimerSeconds.textContent = secondsLeft;
        qTimerBar.style.width = `${fraction * 100}%`;
      });
    }

    // 5. REVEAL
    else if (state.phase === 'REVEAL') {
      switchView('reveal');
      revealSceneText.textContent = state.scene || '';
      revealExplainText.textContent = state.explain || '';

      const writeCaptionsBox = document.getElementById('reveal-write-captions');
      const writeCaptionsList = document.getElementById('reveal-captions-list');

      if (state.mode === 'write' && (state.allCaptions || state.winningCaptions)) {
        if (writeCaptionsBox) {
          writeCaptionsBox.classList.remove('hidden');
          writeCaptionsList.innerHTML = '';
          (state.allCaptions || []).forEach(c => {
            const li = document.createElement('li');
            li.className = `caption-reveal-item ${c.isWinner ? 'winner' : ''}`;
            li.innerHTML = `
              <div class="caption-reveal-text">
                "${c.text}" — <strong>${c.authorNickname}</strong>
              </div>
              <div class="caption-reveal-votes">
                ${c.votes} vote${c.votes === 1 ? '' : 's'} ${c.isWinner ? '<span class="tag" style="margin-left: 4px;">+150 pts</span>' : ''}
              </div>
            `;
            writeCaptionsList.appendChild(li);
          });
        }
      } else {
        if (writeCaptionsBox) writeCaptionsBox.classList.add('hidden');
      }

      const wasCorrect = state.wasCorrect;
      const isCorrect = typeof wasCorrect === 'object' ? (wasCorrect.q1Correct && wasCorrect.q2Correct) : !!wasCorrect;

      if (isCorrect) {
        sound.playCorrect();
        revealBadgeStatus.className = 'status-pill correct';
        revealBadgeStatus.textContent = 'Correct';
      } else {
        sound.playIncorrect();
        revealBadgeStatus.className = 'status-pill incorrect';
        revealBadgeStatus.textContent = 'Explanation Below';
      }

      // Slang glossary
      if (state.slang && state.slang.length > 0) {
        revealSlangSection.classList.remove('hidden');
        revealSlangList.innerHTML = '';
        state.slang.forEach((s) => {
          const li = document.createElement('li');
          li.innerHTML = `<strong>${s.word}:</strong> ${s.meaning}`;
          revealSlangList.appendChild(li);
        });
      } else {
        revealSlangSection.classList.add('hidden');
      }

      // Points & Speed bonus
      revealPointsGained.textContent = `+${state.yourPointsEarned || 0} pts`;
      if (state.speedBonus > 0) {
        revealSpeedBonus.textContent = `(+${state.speedBonus}s speed bonus)`;
        revealSpeedBonus.classList.remove('hidden');
      } else {
        revealSpeedBonus.classList.add('hidden');
      }

      // Player Results List
      revealPlayerResults.innerHTML = '';
      (state.playerResults || []).forEach((r) => {
        const li = document.createElement('li');
        li.className = 'result-item';
        li.innerHTML = `
          <span><strong>${r.nickname}</strong></span>
          <span style="color: ${r.correct ? 'var(--text-primary)' : 'var(--text-muted)'}; font-weight: 700;">
            ${r.correct ? 'Correct' : 'Incorrect'} (+${r.pointsGained})
          </span>
        `;
        revealPlayerResults.appendChild(li);
      });

      btnRevealNext.classList.toggle('hidden', !isHost);

      startCountdown(state.endsAt, 10000, (secondsLeft) => {
        revealTimerCountdown.textContent = secondsLeft;
      });
    }

    // 6. LEADERBOARD
    else if (state.phase === 'LEADERBOARD') {
      switchView('leaderboard');
      lbRoundSubtext.textContent = `After Round ${state.round} of ${state.totalRounds || 10}`;

      leaderboardList.innerHTML = '';
      (state.leaderboard || []).forEach((item) => {
        const li = document.createElement('li');
        li.className = `lb-item ${item.rank === 1 ? 'first' : ''}`;
        li.innerHTML = `
          <span class="lb-rank">#${item.rank}</span>
          <div class="lb-player">
            <span>${item.nickname}</span>
            ${item.streak >= 2 ? `<span class="tag">Streak: ${item.streak}</span>` : ''}
          </div>
          <span class="lb-score">${item.score} pts</span>
        `;
        leaderboardList.appendChild(li);
      });

      btnLeaderboardNext.classList.toggle('hidden', !isHost);

      startCountdown(state.endsAt, 5000, (secondsLeft) => {
        lbTimerCountdown.textContent = secondsLeft;
      });
    }

    // 7. FINAL (Game Over)
    else if (state.phase === 'FINAL') {
      switchView('final');
      sound.playVictory();
      confetti.burst(100);

      if (state.meterSuccess) {
        finalMeterPercent.textContent = '100%';
        finalMeterMsg.textContent = 'Team Empathy Goal Met! Everyone scored the +200 bonus!';
      } else {
        finalMeterPercent.textContent = `${state.meterFinal || 0}%`;
        finalMeterMsg.textContent = 'Team Empathy goal not reached this game.';
      }

      // Final Podium
      finalPodiumList.innerHTML = '';
      (state.finalScores || []).forEach((item) => {
        const li = document.createElement('li');
        li.className = `lb-item ${item.rank === 1 ? 'first' : ''}`;
        li.innerHTML = `
          <span class="lb-rank">#${item.rank}</span>
          <div class="lb-player">
            <span>${item.nickname}</span>
          </div>
          <span class="lb-score">${item.score} pts</span>
        `;
        finalPodiumList.appendChild(li);
      });

      // Player Honors / Titles
      finalTitlesList.innerHTML = '';
      (state.titles || []).forEach((t) => {
        const li = document.createElement('li');
        li.className = 'title-item';
        li.innerHTML = `
          <span class="title-name">${t.nickname} — ${t.title}</span>
          <span class="title-reason">${t.reason}</span>
        `;
        finalTitlesList.appendChild(li);
      });

      finalChallengeText.textContent = state.challenge || "Ask a friend today how they are really doing, and listen without giving advice.";

      btnPlayAgain.classList.toggle('hidden', !isHost);
    }
  }

  // -------------------------------------------------------------
  // 8. Event Listeners & Interactive Handlers
  // -------------------------------------------------------------
  // Landing Page -> Play Menu
  const btnLandingPlay = document.getElementById('btn-landing-play');
  const btnLandingPlayBottom = document.getElementById('btn-landing-play-bottom');
  if (btnLandingPlay) {
    btnLandingPlay.onclick = () => {
      sound.playTap();
      switchView('playMenu');
    };
  }
  if (btnLandingPlayBottom) {
    btnLandingPlayBottom.onclick = () => {
      sound.playTap();
      switchView('playMenu');
    };
  }

  // Play Menu Navigation
  const btnBackToLanding = document.getElementById('btn-back-to-landing');
  if (btnBackToLanding) {
    btnBackToLanding.onclick = () => {
      sound.playTap();
      switchView('landing');
    };
  }

  const btnHowToPlayMenu = document.getElementById('btn-how-to-play-menu');
  if (btnHowToPlayMenu) {
    btnHowToPlayMenu.onclick = () => openRules();
  }

  document.getElementById('btn-show-host').onclick = () => {
    sound.playTap();
    switchView('hostSetup');
    document.getElementById('host-nickname').focus();
  };

  document.getElementById('btn-show-join').onclick = () => {
    sound.playTap();
    switchView('joinSetup');
    document.getElementById('join-code').focus();
  };

  document.querySelectorAll('.btn-back[data-back]').forEach((btn) => {
    btn.onclick = () => {
      sound.playTap();
      const target = btn.getAttribute('data-back');
      if (target === 'view-play-menu') switchView('playMenu');
      else if (target === 'view-landing') switchView('landing');
    };
  });

  if (formHost) {
    formHost.onsubmit = (e) => {
      e.preventDefault();
      const nickInput = document.getElementById('host-nickname');
      const nickname = (nickInput.value || '').trim();
      if (!nickname) {
        showToast('Please enter a nickname.');
        return;
      }
      initWebSocket(() => {
        sendEnvelope('create_room', { nickname });
      });
    };
  }

  if (formJoin) {
    formJoin.onsubmit = (e) => {
      e.preventDefault();
      const code = (document.getElementById('join-code').value || '').trim().toUpperCase();
      const nickname = (document.getElementById('join-nickname').value || '').trim();
      if (!code || code.length !== 4) {
        showToast('Please enter a valid 4-letter room code.');
        return;
      }
      if (!nickname) {
        showToast('Please enter a nickname.');
        return;
      }
      initWebSocket(() => {
        sendEnvelope('join_room', { code, nickname, playerToken: myToken });
      });
    };
  }

  document.getElementById('btn-copy-code').onclick = () => {
    if (!currentState || !currentState.roomCode) return;
    sound.playTap();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(currentState.roomCode).then(() => {
        showToast('Room code copied');
      });
    } else {
      showToast(`Room code: ${currentState.roomCode}`);
    }
  };

  document.getElementById('btn-share-link').onclick = () => {
    if (!currentState || !currentState.roomCode) return;
    sound.playTap();
    const link = `${window.location.origin}${window.location.pathname}?code=${currentState.roomCode}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        showToast('Invite link copied');
      });
    } else {
      showToast(`Invite Link: ${link}`);
    }
  };

  function updateHostSettings() {
    if (!currentState || currentState.yourPlayerId !== currentState.hostId) return;
    sendEnvelope('update_settings', {
      deepDive: settingDeepDive.checked,
      cleanMode: settingCleanMode.checked,
      allowKick: true,
      allowCaptionRemoval: true
    });
  }

  settingDeepDive.onchange = updateHostSettings;
  settingCleanMode.onchange = updateHostSettings;

  btnStartGame.onclick = () => {
    sendEnvelope('start_game', {});
  };

  btnSkipRound.onclick = () => {
    sendEnvelope('skip_round', {});
  };

  btnRevealNext.onclick = () => {
    sendEnvelope('next_step', {});
  };

  btnLeaderboardNext.onclick = () => {
    sendEnvelope('next_step', {});
  };

  btnPlayAgain.onclick = () => {
    sendEnvelope('play_again', {});
  };

  document.getElementById('btn-final-home').onclick = () => {
    sound.playTap();
    sessionStorage.removeItem('feel_it_token');
    sessionStorage.removeItem('feel_it_room');
    currentState = null;
    myPlayerId = null;
    switchView('landing');
  };

  document.getElementById('btn-leave-room').onclick = () => {
    sound.playTap();
    sendEnvelope('leave_room', {});
    sessionStorage.removeItem('feel_it_token');
    sessionStorage.removeItem('feel_it_room');
    currentState = null;
    myPlayerId = null;
    switchView('landing');
  };

  if (writingInput) {
    writingInput.oninput = () => {
      const len = writingInput.value.length;
      writingCharCount.textContent = `${len}/80`;
    };
  }

  if (btnSubmitCaption) {
    btnSubmitCaption.onclick = () => {
      const text = (writingInput.value || '').trim();
      if (!text) {
        showToast('Please enter a caption.');
        return;
      }
      sound.playChime();
      btnSubmitCaption.disabled = true;
      btnSubmitCaption.textContent = 'Submitted';
      sendEnvelope('submit_caption', {
        roundId: currentState.roundId,
        caption: text
      });
    };
  }

  function openRules() {
    sound.playTap();
    modalHowToPlay.classList.remove('hidden');
  }
  function closeRules() {
    sound.playTap();
    modalHowToPlay.classList.add('hidden');
  }

  document.getElementById('btn-how-to-play-lobby').onclick = openRules;
  document.getElementById('btn-close-rules').onclick = closeRules;
  document.getElementById('btn-got-it').onclick = closeRules;

  // URL Auto Join parameter (?code=WXYZ)
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('code');
  if (codeParam) {
    document.getElementById('join-code').value = codeParam.trim().toUpperCase().substring(0, 4);
    switchView('joinSetup');
  }

  // Auto Reconnect if token and room exist in sessionStorage
  if (myToken && savedRoom) {
    initWebSocket(() => {
      sendEnvelope('join_room', {
        code: savedRoom,
        nickname: '',
        playerToken: myToken
      });
    });
  }

  // Keep-alive heartbeat ping
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendEnvelope('ping', {});
    }
  }, 25000);

})();
