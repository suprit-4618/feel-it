# Feel It 💖

**Feel It** is a real-time multiplayer party game designed to build empathy through play. Built for young teens (13+) and everyone, players navigate social situations, bust misinformation myths, test confident communication lines, and write/vote on funny captions.

---

## 🚀 Quick Start

### 1. Requirements
- Node.js 20+

### 2. Installation & Running Locally
```bash
# Install dependencies
npm install

# Start the game server
npm start
```
The game will be live at `http://localhost:3000`.

### 3. Running Automated Tests
```bash
npm test
```

### 4. Validating Content Bank
```bash
npm run validate
```

---

## 🎮 How to Play
1. **Host a Game:** Tap **Host a Game**, enter your nickname, and share the 4-letter room code with 1–7 friends.
2. **Join a Game:** Enter the 4-letter code and a nickname from your phone or browser.
3. **10 Rounds of Fun:**
   - **Step Into Their Shoes:** Feel what someone else is going through and pick the kindest move.
   - **Real or Reel:** Spot social media myths vs. reality.
   - **Say It Smooth:** Pick the confident, respectful line.
   - **Caption This:** Write or pick the best Gen Z captions.
4. **Team Empathy Meter:** Help the group reach 100% empathy for a +200 endgame point bonus!

---

## ☁️ Deployment (Render & Railway)

### Deploy to Render
1. Push this repository to GitHub.
2. Create a new **Web Service** on [Render](https://render.com).
3. Connect your GitHub repository.
4. Set:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Render assigns a public URL (e.g. `https://feel-it.onrender.com`).

---

## 🛡️ Safety & Moderation
- Zero login or personal data collection.
- Server-side profanity and slur filtering with leetspeak normalization.
- Host controls: kick disruptive players and moderate captions.
- Plain-language health and communication discussions.
