# Feel It 💖

**Feel It** is a real-time multiplayer party game designed to build empathy through play. Built for young teens (13+) and everyone (2–8 players, mobile-first, zero build step, no logins/passwords, 4-letter room codes). Players navigate social situations, bust social media myths, test confident communication lines, and write/vote on funny captions.

---

## 🚀 Quick Start (Local Development)

### 1. Requirements
* Node.js 20+

### 2. Installation & Running Locally
```bash
# Install dependencies
npm install

# Start the game server
npm start
```
The game will be live at `http://localhost:3000`.

### 3. Running Automated Tests & Validation
```bash
# Run unit & integration test suites
npm test

# Validate card content bank & source citations
npm run validate

# Run 100-game multiplayer chaos simulation
npm run simulate
```

---

## ☁️ Deploying to Render (Step-by-Step)

### Option A: Automatic Blueprint Deployment (Recommended)
1. Push this repository to **GitHub**.
2. Log into your [Render Dashboard](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Select your `feel-it` repository.
5. Render reads [`render.yaml`](file:///d:/hackathon/Handshake/render.yaml) automatically and configures:
   * **Runtime:** Node
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
   * **Health Check Path:** `/health`
   * **Environment Variables:** `NODE_ENV=production`, `TRUST_PROXY=true`
6. Click **Apply**. Within ~1 minute, your live URL (e.g. `https://feel-it.onrender.com`) will be active!

---

### Option B: Manual Web Service Setup
1. Log into your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Fill in the service settings:
   * **Name:** `feel-it` (or your preferred name)
   * **Region:** Any (e.g., Oregon / Frankfurt / Singapore)
   * **Branch:** `main`
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
   * **Instance Type:** `Free`
5. Under **Advanced** settings:
   * **Health Check Path:** `/health`
   * Add Environment Variables:
     * `NODE_ENV` = `production`
     * `TRUST_PROXY` = `true`
6. Click **Create Web Service**.

---

## 🎮 How to Play
1. **Host a Game:** Tap **Host a Game**, enter your nickname, and share the 4-letter room code (or copy the invite link) with 1–7 friends.
2. **Join a Game:** Enter the 4-letter code and a nickname from any smartphone or browser.
3. **10 Rounds Across 4 Modes:**
   * **Step Into Their Shoes 👟:** Feel what someone else is going through and choose the kindest move.
   * **Real or Reel? 📱:** Spot social media myths vs. reality.
   * **Say It Smooth 💬:** Pick the confident, respectful line.
   * **Caption This ✨:** Write or vote on the funniest, kindest captions.
4. **Team Empathy Meter ✨:** When the room averages empathetic answers, the shared meter fills toward 100%, unlocking an endgame **+200 bonus** for everyone!

---

## 🛡️ Safety & Architecture
* **Zero Logins / Passwords:** Ephemeral player tokens stored in sessionStorage for reconnects.
* **Strict Production CSP:** Procedural Web Audio API sound synthesis and Canvas particle effects with zero external requests.
* **Content Safety:** Automated profanity/slur filtering with leetspeak normalization, host moderation window for captions, and token bans for kicked players.
