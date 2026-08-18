const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;



// always resolve the path relative to this file, not wherever the terminal happens to be
const DB_PATH = path.join(__dirname, 'scores.json');




// website which will talk to server
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: '10kb' }));

// prevents flooding submissions
const scoreLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'too many requests, slow down' },
});
app.use('/api/scores', scoreLimiter);

// reads scores.json off disk and returns the array inside it
function readScores() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ scores: [] }, null, 2));
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    return JSON.parse(raw).scores;
  } catch {
    return [];
  }
}




// saves an updated array back to disk safely
function writeScores(scores) {
  const tmpPath = DB_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify({ scores }, null, 2));
  
  fs.renameSync(tmpPath, DB_PATH);
  // If the server crashed mid-save, you're left with either the OLD
  // complete file or the NEW complete file — never a half-broken one
}

// cleans up the submitted name before saving
function sanitizeName(name) {
  return name
    .toString()
    .trim()

    .replace(/[<>{}]/g, '')
    .slice(0, 15);
}

// POST /api/scores — game sends { name, score }, we save it and reply with the top 3
app.post('/api/scores', (req, res) => {
  const { name, score } = req.body || {};

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }

  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100000) {
    return res.status(400).json({ error: 'invalid score' });
  }

  const cleanName = sanitizeName(name);
  if (cleanName.length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }

  const roundedScore = Math.floor(score);
  const scores = readScores();

  // check if this player already has an entry
  const existingIndex = scores.findIndex(
    (entry) => entry.name.toLowerCase() === cleanName.toLowerCase()
  );

  if (existingIndex === -1) {
    // new player — add a fresh entry
    scores.push({
      name: cleanName,
      score: roundedScore,
      date: new Date().toISOString(),
    });
  } else if (roundedScore > scores[existingIndex].score) {
    // existing player, but this run beat their old best — update it
    scores[existingIndex] = {
      name: cleanName,
      score: roundedScore,
      date: new Date().toISOString(),
    };
  }
  // if roundedScore <= their existing best, do nothing — keep their old record

  writeScores(scores);
  res.json({ success: true });
});

// GET /api/scores/top — lets the frontend fetch the leaderboard anytime (e.g. on page load)
app.get('/api/scores/top', (req, res) => {
  const scores = readScores();
  const top3 = [...scores]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  res.json(top3);
});

app.listen(PORT, () => {
  console.log(`backend listening to the port ${PORT}`);
});