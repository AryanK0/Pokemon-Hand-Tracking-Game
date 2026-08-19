import { useEffect, useRef, useState } from 'react';
import creature1 from './assets/creature1.png';
import creature2 from './assets/creature2.png';
import creature3 from './assets/creature3.png';
import charminder from './assets/charminder.png';
import water from './assets/water.png';
import rhagar from './assets/rhagar.png';
import rocket from './assets/rocket.png';
import villain from './assets/villain.png';
import evil1 from './assets/evil1.png';
import evil2 from './assets/evil2.png';
import evil4 from './assets/evil4.png';
import decent1 from './assets/decent1.png';
import decent2 from './assets/decent2.png';
import decent3 from './assets/decent3.png';
import gold1 from './assets/gold1.png';
import gold3 from './assets/gold3.png';

import './App.css';

const TRAIL_LENGTH = 15
const MOTION_THRESHOLD = 25;
const SAMPLE_STEP = 3;
const SMOOTHING = 0.50;
const MAX_MISSES = 3;

const BASE_SPAWN_INTERVAL = 1500;
const MIN_SPAWN_INTERVAL = 500;
const BASE_GRAVITY = 0.40;
const MAX_GRAVITY = 0.65;
const BASE_LAUNCH_SPEED = 22;
const MAX_LAUNCH_SPEED = 27;
const DIFFICULTY_STEP = 5;
const MAX_DIFFICULTY_LEVEL = 7;

const GOOD_CREATURE_IMAGES = [creature1, creature2, evil1, evil2, evil4];
const BONUS_CREATURE_IMAGES = [rhagar, rocket, villain, gold1, gold3];
const BAD_CREATURE_IMAGES = [creature3, charminder, water, decent1, decent2, decent3];
const BAD_SPAWN_CHANCE = 0.30;
const BONUS_SPAWN_CHANCE = 0.35;
const AVATAR_BOX_WIDTH = 200;
const AVATAR_BOX_HEIGHT = 150;

// Using relative paths for Vercel Serverless Functions
const API_URL = '';

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const avatarCanvasRef = useRef(null);
  const objectsRef = useRef([]);
  const halvesRef = useRef([]);
  const particlesRef = useRef([]);
  const sparklesRef = useRef([]);
  const confettiRef = useRef([]);
  const flashRef = useRef(null);
  const shouldSpawnSparklesRef = useRef(false);
  const sparkleCounterRef = useRef(0);
  const celebrationCounterRef = useRef(0);
  const celebrationTriggeredRef = useRef(false);
  const strikesRef = useRef(0);
  const leftPadHitRef = useRef(0);
  const rightPadHitRef = useRef(0);
  const punchRef = useRef(0);
  const levelUpAnimRef = useRef(0);
  const lastLevelRef = useRef(1);
  const lastSpawnRef = useRef(0);
  const trailRef = useRef([]);
  const scoreRef = useRef(0);
  const prevFrameRef = useRef(null);
  const smoothedPosRef = useRef(null);
  const missesRef = useRef(0);
  const gameOverRef = useRef(false);
  const nameSubmittedRef = useRef(false);
  const playerNameRef = useRef('');

  const [status, setStatus] = useState('Requesting camera access...');
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [level, setLevel] = useState(1);
  const [playerName, setPlayerName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [isTopScore, setIsTopScore] = useState(false);
  const topScoreTriggeredRef = useRef(false);
  const trackingColorRef = useRef('blue');
  const [trackingColor, setTrackingColor] = useState('blue');

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStatus('Camera ready — point your blue light at the screen!');
        }
      })
      .catch((err) => {
        console.error('Camera error:', err);
        setStatus(
          `Camera failed: ${err.name}. Allow camera access via the address bar icon, then reload.`
        );
      });
  }, []);

  useEffect(() => {
    // Check if current score is a top score
    if (nameSubmitted && !gameOver && leaderboard.length > 0) {
      const isTop = leaderboard.some((entry) => scoreRef.current > entry.score);
      if (isTop && !topScoreTriggeredRef.current) {
        setIsTopScore(true);
        shouldSpawnSparklesRef.current = true;
        topScoreTriggeredRef.current = true;
      } else if (!isTop) {
        topScoreTriggeredRef.current = false;
      }
    }
  }, [leaderboard, nameSubmitted, gameOver]);

async function submitScore(finalScore) {
  try {
    const res = await fetch(`${API_URL}/api/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: playerNameRef.current,
        score: finalScore,
      }),
    });

    if (!res.ok) {
      console.error('Score submission rejected:', await res.text());
      return;
    }

    setScoreSaved(true);
    await fetchLeaderboard();

  } catch (err) {
    console.error('Failed to submit score:', err);
  }
}

async function fetchLeaderboard() {
  try {
    const res = await fetch(`${API_URL}/api/scores/top`);
    const data = await res.json();
    setLeaderboard(data);
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err);
  }
}

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const motionCanvas = document.createElement('canvas');
    const MOTION_W = 160;
    const MOTION_H = 120;
    motionCanvas.width = MOTION_W;
    motionCanvas.height = MOTION_H;
    const motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });

    function rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h, s, v = max;
      const d = max - min;
      s = max === 0 ? 0 : d / max;
      if (max === min) {
        h = 0;
      } else {
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return [h * 360, s, v];
    }

    let prevRawPoint = null;

    function detectLight() {
      motionCtx.save();
      motionCtx.scale(-1, 1);
      motionCtx.drawImage(video, -MOTION_W, 0, MOTION_W, MOTION_H);
      motionCtx.restore();

      const frame = motionCtx.getImageData(0, 0, MOTION_W, MOTION_H);
      const data = frame.data;

      let bestX = 0;
      let bestY = 0;
      let maxScore = 0;
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      
      const isBlue = trackingColorRef.current === 'blue';

      for (let y = 0; y < MOTION_H; y += 2) {
        for (let x = 0; x < MOTION_W; x += 2) {
          const i = (y * MOTION_W + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          
          if (isBlue) {
            if (b > r && b > g && b > 80) {
              const [h, s, v] = rgbToHsv(r, g, b);
              if (h > 190 && h < 270 && s > 0.4 && v > 0.4) {
                const score = s * v * (b - Math.max(r, g));
                if (score > maxScore) { maxScore = score; bestX = x; bestY = y; }
              }
            }
          } else {
            if (r > b && r > g && r > 80) {
              const [h, s, v] = rgbToHsv(r, g, b);
              if ((h < 30 || h > 330) && s > 0.4 && v > 0.4) {
                const score = s * v * (r - Math.max(b, g));
                if (score > maxScore) { maxScore = score; bestX = x; bestY = y; }
              }
            }
          }
        }
      }

      if (maxScore < 5) return null;

      for (let y = Math.max(0, bestY - 15); y < Math.min(MOTION_H, bestY + 15); y += 1) {
        for (let x = Math.max(0, bestX - 15); x < Math.min(MOTION_W, bestX + 15); x += 1) {
          const i = (y * MOTION_W + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const [h, s, v] = rgbToHsv(r, g, b);
          
          if (isBlue) {
            if (h > 190 && h < 270 && s > 0.3 && v > 0.3) { sumX += x; sumY += y; count++; }
          } else {
            if ((h < 30 || h > 330) && s > 0.3 && v > 0.3) { sumX += x; sumY += y; count++; }
          }
        }
      }

      if (count === 0) return null;

      const scaleX = canvas.width / MOTION_W;
      const scaleY = canvas.height / MOTION_H;
      let rawX = (sumX / count) * scaleX;
      let rawY = (sumY / count) * scaleY;

      if (prevRawPoint) {
        const dist = Math.hypot(rawX - prevRawPoint.x, rawY - prevRawPoint.y);
        if (dist > canvas.width * 0.4) {
          return null;
        }
      }
      prevRawPoint = { x: rawX, y: rawY };

      if (!smoothedPosRef.current) {
        smoothedPosRef.current = { x: rawX, y: rawY };
      } else {
        smoothedPosRef.current = {
          x: smoothedPosRef.current.x + (rawX - smoothedPosRef.current.x) * 0.45,
          y: smoothedPosRef.current.y + (rawY - smoothedPosRef.current.y) * 0.45,
        };
      }

      return { x: smoothedPosRef.current.x, y: smoothedPosRef.current.y };
    }


    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);


    let animationId;

    function stripWhiteBackground(img) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width || img.naturalWidth || 1;
      tempCanvas.height = img.height || img.naturalHeight || 1;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(img, 0, 0);

      const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const data = imageData.data;

      const corners = [
        [0, 0],
        [tempCanvas.width - 1, 0],
        [0, tempCanvas.height - 1],
        [tempCanvas.width - 1, tempCanvas.height - 1],
      ];

      let bgR = 255;
      let bgG = 255;
      let bgB = 255;
      let sampleCount = 0;

      corners.forEach(([x, y]) => {
        const i = (y * tempCanvas.width + x) * 4;
        const a = data[i + 3];
        if (a > 0) {
          bgR += data[i];
          bgG += data[i + 1];
          bgB += data[i + 2];
          sampleCount += 1;
        }
      });

      if (sampleCount > 0) {
        bgR = bgR / (sampleCount + 1);
        bgG = bgG / (sampleCount + 1);
        bgB = bgB / (sampleCount + 1);
      }

      const tolerance = 45;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        const closeToBackground =
          Math.abs(r - bgR) < tolerance &&
          Math.abs(g - bgG) < tolerance &&
          Math.abs(b - bgB) < tolerance;

        if (a === 0 || closeToBackground) {
          data[i + 3] = 0;
        }
      }

      tempCtx.putImageData(imageData, 0, 0);
      const cleaned = new Image();
      cleaned.src = tempCanvas.toDataURL('image/png');
      return cleaned;
    }

    function loadTransparentImage(src) {
      const img = new Image();
      img.onload = () => {
        const cleaned = stripWhiteBackground(img);
        img.onload = null;
        img.src = cleaned.src;
      };
      img.src = src;
      return img;
    }

    const loadedGoodImages = GOOD_CREATURE_IMAGES.map((src) => loadTransparentImage(src));
    const loadedBonusImages = BONUS_CREATURE_IMAGES.map((src) => loadTransparentImage(src));
    const loadedBadImages = BAD_CREATURE_IMAGES.map((src) => loadTransparentImage(src));

    function getDifficultyLevel() {
      return Math.min(
        1 + Math.floor(strikesRef.current / 5),
        10
      );
    }

    function getSpawnInterval() {
      const lvl = getDifficultyLevel();
      if (lvl >= 8) return 250;
      const t = (lvl - 1) / 9;
      return BASE_SPAWN_INTERVAL - t * (BASE_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL);
    }

    function getGravity() {
      const lvl = getDifficultyLevel();
      const t = (lvl - 1) / 9;
      return BASE_GRAVITY + t * (MAX_GRAVITY - BASE_GRAVITY);
    }

    function getLaunchSpeed() {
      const lvl = getDifficultyLevel();
      const t = (lvl - 1) / 9;
      return BASE_LAUNCH_SPEED + t * (MAX_LAUNCH_SPEED - BASE_LAUNCH_SPEED);
    }

function spawnObject() {
      const isBad = Math.random() < BAD_SPAWN_CHANCE;
      const isBonus = !isBad && Math.random() < BONUS_SPAWN_CHANCE;
      const launchSpeed = getLaunchSpeed();

      // Spawn from a safe in-screen range so objects stay visible and land inside the monitor.
      const marginX = 120;
      const startX = marginX + Math.random() * (canvas.width - marginX * 2);
      const startY = canvas.height - 50;

      // Randomize the launch direction: angle measured from straight up.
      // 0 = straight up, negative = leaning left, positive = leaning right.
      // Keeping it within roughly ±25 degrees to keep creatures more centered
      // and reachable for a significant time by hand.
      const maxLeanDegrees = 50;
      const leanDegrees = (Math.random() * 2 - 1) * maxLeanDegrees; // -50 to +50
      const leanRadians = (leanDegrees * Math.PI) / 180;

      // Convert angle + speed into vx/vy components.
      // "Straight up" in canvas terms is vy negative, vx zero.
      const speedVariance = launchSpeed + Math.random() * 3;
      const vx = Math.sin(leanRadians) * speedVariance;
      const vy = -Math.cos(leanRadians) * speedVariance;

      const goodPool = isBonus ? loadedBonusImages : loadedGoodImages;

      objectsRef.current.push({
        id: Date.now() + Math.random(),
        x: startX,
        y: startY,
        radius: 65,
        vy,
        vx,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.08,
        sliced: false,
        pastPeak: false,
        isBad,
        isBonus,
        imgIndex: isBad ? Math.floor(Math.random() * loadedBadImages.length) : Math.floor(Math.random() * goodPool.length),
        badImageIndex: isBad ? Math.floor(Math.random() * loadedBadImages.length) : 0,
      });
    }

    function spawnParticles(x, y, color) {
      for (let i = 0; i < 22; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 6;
        particlesRef.current.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: 2 + Math.random() * 3,
          color,
        });
      }
    }

    function spawnSparkles(x, y) {
      const colors = ['#FFD700', '#FFF44F', '#FFEB3B', '#FFC107'];
      for (let i = 0; i < 15; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5;
        sparklesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          life: 1,
          size: 3 + Math.random() * 2,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }

    function spawnConfetti(x, y) {
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
      for (let i = 0; i < 25; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 8;
        confettiRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          life: 1,
          size: 4 + Math.random() * 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.2,
        });
      }
    }

    function spawnHalves(obj, sliceAngle) {
      const img = obj.isBad
        ? loadedBadImages[obj.badImageIndex ?? obj.imgIndex]
        : (obj.isBonus ? loadedBonusImages[obj.imgIndex] : loadedGoodImages[obj.imgIndex]);
      const perp = sliceAngle + Math.PI / 2;
      const kick = 5;

      [-1, 1].forEach((side) => {
        halvesRef.current.push({
          img,
          x: obj.x,
          y: obj.y,
          radius: obj.radius,
          rotation: obj.rotation,
          rotSpeed: obj.rotSpeed + side * 0.15,
          vx: obj.vx + Math.cos(perp) * kick * side,
          vy: obj.vy + Math.sin(perp) * kick * side - 2,
          side,
          sliceAngle,
          life: 1,
        });
      });
    }



    function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lengthSq = dx * dx + dy * dy;
      let t = lengthSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lengthSq;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function checkCollisions() {
      const trail = trailRef.current;
      if (trail.length < 2) return;

      const p1 = trail[trail.length - 2];
      const p2 = trail[trail.length - 1];
      const speed = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (speed < 4) return;

      const sliceAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    objectsRef.current.forEach((obj) => {
  if (obj.sliced) return;

  const dist = pointToSegmentDistance(
    obj.x,
    obj.y,
    p1.x,
    p1.y,
    p2.x,
    p2.y
  );

  // Slightly larger hitbox for more generous/reliable slicing in a fair environment
  const hitboxRadius = obj.radius * 1.5;

  if (dist < hitboxRadius) {
    obj.sliced = true;

    if (obj.isBad) {
      missesRef.current += 1;
      setMisses(missesRef.current);

      if (missesRef.current >= MAX_MISSES) {
        gameOverRef.current = true;
        setGameOver(true);
        submitScore(scoreRef.current);
      }

      spawnParticles(obj.x, obj.y, '#ff3b3b');
    } else {
      const scoreGain = obj.isBonus ? 2 : 1;
      scoreRef.current += scoreGain;
      strikesRef.current += 1;
      setScore(scoreRef.current);

      const newLevel = getDifficultyLevel() + 1;
      setLevel(newLevel);

      if (newLevel > lastLevelRef.current) {
        lastLevelRef.current = newLevel;
        levelUpAnimRef.current = 1;
      }

      spawnParticles(
        obj.x,
        obj.y,
        obj.isBonus ? '#ffd166' : '#2ecc71'
      );
    }

    spawnHalves(obj, sliceAngle);
    flashRef.current = { p1, p2, life: 1 };
    punchRef.current = 1;
  }
});
    }

    function drawCreature(obj) {
      const img = obj.isBad
        ? loadedBadImages[obj.badImageIndex ?? obj.imgIndex]
        : (obj.isBonus ? loadedBonusImages[obj.imgIndex] : loadedGoodImages[obj.imgIndex]);
      if (!img.complete || img.naturalWidth === 0) return;

      const ringColor = obj.isBad ? '#ff3b3b' : (obj.isBonus ? '#ffd166' : '#2ecc71');

      ctx.save();
      ctx.translate(obj.x, obj.y);
      ctx.rotate(obj.rotation);

      ctx.beginPath();
      ctx.arc(0, 0, obj.radius * 1.08, 0, Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = ringColor;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const size = obj.radius * 2;
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    }

    function drawHalves() {
      halvesRef.current.forEach((h) => {
        h.x += h.vx;
        h.y += h.vy;
        h.vy += 0.3;
        h.rotation += h.rotSpeed;
        h.life -= 0.018;

        if (!h.img.complete || h.img.naturalWidth === 0) return;

        const size = h.radius * 2;
        ctx.save();
        ctx.globalAlpha = Math.max(h.life, 0);
        ctx.translate(h.x, h.y);
        ctx.rotate(h.rotation);

        ctx.beginPath();
        const cutNormal = h.sliceAngle - h.rotation + Math.PI / 2;
        const cx = Math.cos(cutNormal) * size;
        const cy = Math.sin(cutNormal) * size;
        ctx.moveTo(0, 0);
        ctx.lineTo(cx * h.side, cy * h.side);
        ctx.lineTo(cx * h.side - cy * h.side * 2, cy * h.side + cx * h.side * 2);
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(h.img, -size / 2, -size / 2, size, size);
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      halvesRef.current = halvesRef.current.filter((h) => h.life > 0 && h.y < canvas.height + 200);
    }

    function drawParticles() {
      particlesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life -= 0.035;
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      particlesRef.current = particlesRef.current.filter((p) => p.life > 0);
    }

    function drawSparkles() {
      sparklesRef.current.forEach((s) => {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.1;
        s.life -= 0.04;
        ctx.globalAlpha = Math.max(s.life, 0);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = s.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      ctx.globalAlpha = 1;
      sparklesRef.current = sparklesRef.current.filter((s) => s.life > 0);
    }

    function drawConfetti() {
      confettiRef.current.forEach((c) => {
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.25;
        c.rotation += c.rotSpeed;
        c.life -= 0.02;
        ctx.globalAlpha = Math.max(c.life, 0);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rotation);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      confettiRef.current = confettiRef.current.filter((c) => c.life > 0);
    }
    function drawLevelUpBanner() {
      if (levelUpAnimRef.current <= 0) return;

      // life goes from 1 down to 0 over time — use it to drive scale + fade
      levelUpAnimRef.current -= 0.015;

      const animProgress = 1 - levelUpAnimRef.current;
      const alpha = Math.max(0, Math.sin(levelUpAnimRef.current * Math.PI));
      const slideX = -100 + (animProgress * 200);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(canvas.width / 2 + slideX, canvas.height / 3);
      ctx.rotate(-0.05);

      ctx.font = 'bold 64px Arial';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(77,208,255,0.8)';
      ctx.shadowBlur = 30;
      ctx.fillStyle = '#4dd0ff';
      ctx.fillText(`LEVEL ${lastLevelRef.current}!`, 0, 0);
      ctx.shadowBlur = 0;

      ctx.font = 'bold 20px Arial';
      ctx.fillStyle = '#ffcb05';
      ctx.fillText('LEVEL UP', 0, -50);

      ctx.restore();
    }

    function drawPads() {
      if (leftPadHitRef.current > 0) leftPadHitRef.current -= 0.05;
      if (rightPadHitRef.current > 0) rightPadHitRef.current -= 0.05;

      const padWidth = 16;
      const padHeight = canvas.height * 0.7;
      const padY = canvas.height * 0.15;

      if (leftPadHitRef.current > 0) {
        ctx.save();
        const glow = leftPadHitRef.current;
        const offset = glow * -10;
        ctx.fillStyle = `rgba(77, 208, 255, ${0.1 + glow * 0.7})`;
        ctx.shadowColor = '#4dd0ff';
        ctx.shadowBlur = 10 + glow * 30;
        ctx.beginPath();
        ctx.roundRect(15 + offset, padY, padWidth, padHeight, 8);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = 'rgba(77, 208, 255, 0.15)';
        ctx.beginPath();
        ctx.roundRect(15, padY, padWidth, padHeight, 8);
        ctx.fill();
        ctx.restore();
      }

      if (rightPadHitRef.current > 0) {
        ctx.save();
        const glow = rightPadHitRef.current;
        const offset = glow * 10;
        ctx.fillStyle = `rgba(77, 208, 255, ${0.1 + glow * 0.7})`;
        ctx.shadowColor = '#4dd0ff';
        ctx.shadowBlur = 10 + glow * 30;
        ctx.beginPath();
        ctx.roundRect(canvas.width - 15 - padWidth + offset, padY, padWidth, padHeight, 8);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = 'rgba(77, 208, 255, 0.15)';
        ctx.beginPath();
        ctx.roundRect(canvas.width - 15 - padWidth, padY, padWidth, padHeight, 8);
        ctx.fill();
        ctx.restore();
      }
    }

  function drawFlash() {
      if (!flashRef.current) return;
      const f = flashRef.current;

      // extend the slice line well past the actual swipe points so it
      // reads as a full blade streak across the screen, not just a dot-to-dot line
      const dx = f.p2.x - f.p1.x;
      const dy = f.p2.y - f.p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const extend = 260;
      const ux = (dx / len) * extend;
      const uy = (dy / len) * extend;
      const startX = f.p1.x - ux;
      const startY = f.p1.y - uy;
      const endX = f.p2.x + ux;
      const endY = f.p2.y + uy;

      ctx.save();
      ctx.globalAlpha = Math.max(f.life, 0);
      ctx.lineCap = 'round';

      // outer glow pass — soft and wide
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 50;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // sharp bright core pass on top
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.restore();

      f.life -= 0.12;
      if (f.life <= 0) flashRef.current = null;
    }

    function drawTrail() {
      const trail = trailRef.current;
      if (trail.length < 2) return;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = 1; i < trail.length - 1; i += 1) {
        const p0 = trail[i - 1];
        const p1 = trail[i];
        const p2 = trail[i + 1];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const alpha = (i / trail.length) * 0.35;

        ctx.beginPath();
        ctx.moveTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
        ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
        ctx.lineWidth = 10;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.stroke();
      }

      for (let i = 1; i < trail.length - 1; i += 1) {
        const p0 = trail[i - 1];
        const p1 = trail[i];
        const p2 = trail[i + 1];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const alpha = i / trail.length;

        ctx.beginPath();
        ctx.moveTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
        ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
        ctx.lineWidth = 1.5 + alpha * 2.5;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.stroke();
      }
    }

    function drawAvatar() {
    
      const avatarCanvas = avatarCanvasRef.current;
      if (!avatarCanvas) return;
      const actx = avatarCanvas.getContext('2d');
      const W = AVATAR_BOX_WIDTH;
      const H = AVATAR_BOX_HEIGHT;
      actx.clearRect(0, 0, W, H);
      actx.globalAlpha=1;

      const cx = W / 2;
      const cy = H / 2;
actx.clearRect(0, 0, W, H);
      actx.fillStyle = 'rgba(13, 27, 42, 0.4)';
      actx.fillRect(0, 0, W, H);

      const pos = smoothedPosRef.current;
      const targetX = pos ? Math.min(Math.max(pos.x / (canvas.width || 1) * W, 18), W - 18) : cx;
      const targetY = pos ? Math.min(Math.max(pos.y / (canvas.height || 1) * H, 18), H - 18) : cy;

      actx.globalAlpha = 0.35;
      const isRed = trackingColorRef.current === 'red';
      actx.shadowColor = isRed ? '#ff3b3b' : '#3bb4ff';
      actx.shadowBlur = 12;
      actx.fillStyle = isRed ? '#ff4d4d' : '#4dd0ff';
      actx.beginPath();
      actx.arc(targetX, targetY, 18, 0, Math.PI * 2);
      actx.fill();

      actx.shadowBlur = 0;
      actx.strokeStyle = isRed ? '#ffb7b7' : '#b7ecff';
      actx.lineWidth = 2;
      actx.beginPath();
      actx.arc(targetX, targetY, 26, 0, Math.PI * 2);
      actx.stroke();
      actx.globalAlpha = 1;
      
    }

    function drawFrame(timestamp) {
      // Spawn sparkles for top score periodically
      if (isTopScore) {
        sparkleCounterRef.current += 1;
        if (sparkleCounterRef.current % 15 === 0) {
          spawnSparkles(canvas.width / 2, 80);
        }
      } else {
        sparkleCounterRef.current = 0;
      }

      // Spawn celebration confetti when game ends
      if (gameOverRef.current && !celebrationTriggeredRef.current) {
        for (let i = 0; i < 8; i += 1) {
          spawnConfetti(
            canvas.width / 2 + (Math.random() - 0.5) * 200,
            canvas.height / 3
          );
        }
        celebrationTriggeredRef.current = true;
      }

      // Continue spawning confetti during celebration
      if (gameOverRef.current) {
        celebrationCounterRef.current += 1;
        if (celebrationCounterRef.current % 12 === 0) {
          for (let i = 0; i < 3; i += 1) {
            spawnConfetti(
              canvas.width / 2 + (Math.random() - 0.5) * 250,
              canvas.height / 4 + (Math.random() - 0.5) * 50
            );
          }
        }
      } else {
        celebrationCounterRef.current = 0;
      }

      punchRef.current = Math.max(punchRef.current - 0.08, 0);
      const zoom = 1 + punchRef.current * 0.015;

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);

      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();

        const motionPoint = detectLight();
        if (motionPoint) {
          trailRef.current.push({...motionPoint});
          if (trailRef.current.length > TRAIL_LENGTH) trailRef.current.shift();
        }
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (!gameOverRef.current && nameSubmittedRef.current) {
        if (!lastSpawnRef.current) lastSpawnRef.current = timestamp;
        if (timestamp - lastSpawnRef.current > getSpawnInterval()) {
          spawnObject();
          lastSpawnRef.current = timestamp;
        }
        checkCollisions();
      }

      const gravity = getGravity();

      objectsRef.current.forEach((obj) => {
        obj.vy += gravity;
        obj.y += obj.vy;
        obj.x += obj.vx;

        const minX = 70;
        const maxX = canvas.width - 70;
        if (obj.x < minX) {
          obj.x = minX;
          obj.vx *= -0.35;
          leftPadHitRef.current = 1;
        } else if (obj.x > maxX) {
          obj.x = maxX;
          obj.vx *= -0.35;
          rightPadHitRef.current = 1;
        }

      

        obj.rotation += obj.rotSpeed;
        if (obj.vy > 0) obj.pastPeak = true;
      });

      objectsRef.current.forEach((obj) => {
        if (!obj.sliced && obj.pastPeak && obj.y - obj.radius >= canvas.height) {
          if (!obj.isBad) {
            missesRef.current += 1;
            setMisses(missesRef.current);
            if (missesRef.current >= MAX_MISSES) {
              gameOverRef.current = true;
              setGameOver(true);
              submitScore(scoreRef.current);
            }
          }
        }
      });

      objectsRef.current = objectsRef.current.filter((obj) => {
        if (obj.sliced) return false;
        if (obj.pastPeak && obj.y - obj.radius >= canvas.height) return false;
        return true;
      });

      objectsRef.current.forEach((obj) => drawCreature(obj));
      drawHalves();
      drawParticles();
      drawSparkles();
      drawConfetti();
      drawTrail();
      drawFlash();
      drawPads();
      drawLevelUpBanner();

      if (gameOverRef.current) {
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 44px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(255,68,68,0.6)';
        ctx.shadowBlur = 20;
        ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 16);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffcb05';
        ctx.font = 'bold 22px Arial';
        ctx.fillText(`Final Score: ${scoreRef.current}`, canvas.width / 2, canvas.height / 2 + 26);
      }

      ctx.restore();

      drawAvatar();

      animationId = requestAnimationFrame(drawFrame);
    }

    animationId = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  function handleRestart() {
    setNameSubmitted(false);
    setPlayerName('');
    setScoreSaved(false);
    setIsTopScore(false);
    nameSubmittedRef.current = false;
    objectsRef.current = [];
    halvesRef.current = [];
    particlesRef.current = [];
    sparklesRef.current = [];
    confettiRef.current = [];
    flashRef.current = null;
    punchRef.current = 0;
    levelUpAnimRef.current = 0;
    lastLevelRef.current = 1;
    trailRef.current = [];
    smoothedPosRef.current = null;
    scoreRef.current = 0;
    missesRef.current = 0;
    gameOverRef.current = false;
    lastSpawnRef.current = 0;
    topScoreTriggeredRef.current = false;
    celebrationTriggeredRef.current = false;
    setScore(0);
    setMisses(0);
    setGameOver(false);
    setLevel(1);
    strikesRef.current = 0;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }} />
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', top: 0, left: 0, display: 'block' }}
      />

     

 <div
  style={{
    position: 'fixed',
    top: '18px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '24px',
    padding: '10px 28px',
    fontFamily: "'Trebuchet MS', Arial, sans-serif",
    fontSize: '25px',
    fontWeight: 800,
    letterSpacing: '0.3px',
    textShadow: '0 2px 8px rgba(0,0,0,0.85)',
    zIndex: 12,
  }}
>
<span style={{ color: '#ffcb05', textShadow: '0 0 8px rgba(255,203,5,0.6)' }}>Score: {score}</span>
  <span style={{ opacity: 0.4, color: '#fff' }}>|</span>
  <span style={{ color: '#4dd0ff', textShadow: '0 0 8px rgba(77,208,255,0.5)' }}>Level: {level}</span>
  <span style={{ opacity: 0.4, color: '#fff' }}>|</span>
  <span style={{ color: '#ff6b6b', textShadow: '0 0 8px rgba(255,107,107,0.5)' }}>Lives: {Math.max(MAX_MISSES - misses, 0)}/{MAX_MISSES}</span>
</div>



      {nameSubmitted && !gameOver && (
      <div
          style={{
            position: 'fixed',
            top: '25px',
            left: '30px',
            color: '#fff',
            padding: '14px 18px',
            textAlign: 'left',
            minWidth: '180px',
            fontFamily: 'Arial, sans-serif',
            textShadow: '0 2px 8px rgba(0,0,0,0.85)',
            zIndex: 12,
          }}
        >
        <p style={{ fontWeight: 700, margin: '0 0 12px', fontSize: '22px', color: '#fff', textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>🏆 Leaderboard</p>
          {leaderboard.length > 0 ? (
            leaderboard.map((entry, i) => {
              let entryColor = '#fff';
              let glowColor = 'rgba(255,255,255,0.4)';
              if (i === 0) { entryColor = '#ffcb05'; glowColor = 'rgba(255,203,5,0.6)'; }
              else if (i === 1) { entryColor = '#4dd0ff'; glowColor = 'rgba(77,208,255,0.5)'; }
              else if (i === 2) { entryColor = '#ff6b6b'; glowColor = 'rgba(255,107,107,0.5)'; }
              return (
                <p key={i} style={{ margin: '8px 0', fontSize: '26px', color: entryColor, textShadow: `0 0 8px ${glowColor}` }}>
                  {i + 1}. {entry.name} — {entry.score}
                </p>
              );
            })
          ) : (
            <p style={{ margin: 0, fontSize: '14px', color: '#fff' }}>No scores yet</p>
          )}
        </div>
      )}

   <canvas
        ref={avatarCanvasRef}
        width={AVATAR_BOX_WIDTH}
        height={AVATAR_BOX_HEIGHT}
        style={{
          position: 'fixed',
          bottom: '30px',
          right: '30px',
          zIndex: 3,
          background: 'transparent',
        }}
      />
       
      
   

      {!nameSubmitted && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 5,
          }}
        >
          {/* GAME INSTRUCTIONS */}
          <p
            style={{
    
    fontSize: '32px',
    fontWeight: 800,
    letterSpacing: '2px',
    marginBottom: '16px',
    textShadow: '0 0 12px rgba(185,103,255,0.6)',
  }}>INSTRUCTIONS
            
          </p>
<div
  style={{
    color: '#fff',
    textAlign: 'center',
    marginBottom: '12px',
    fontFamily: 'Arial, sans-serif',
    fontSize: '20px',
    lineHeight: '1.5',
   
  }}
>
  <p style={{ margin: '4px 0', color: '#4dd0ff', textShadow: '0 0 8px rgba(77,208,255,0.5)' }}>* Move the blue light to slice creatures</p>
  <p style={{ margin: '4px 0', color: '#2ecc71', textShadow: '0 0 8px rgba(46,204,113,0.5)' }}>*slicing green gives 1 point</p>
  <p style={{ margin: '4px 0', color: '#ffcb05', textShadow: '0 0 8px rgba(255,203,5,0.5)' }}>*Slice bonus creatures for +2 points</p>
  <p style={{ margin: '4px 0', color: '#ff4444', textShadow: '0 0 8px rgba(255,68,68,0.5)' }}>*Avoid red creatures & don't miss 3 times</p>
</div>
      
        
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && playerName && (setNameSubmitted(true), nameSubmittedRef.current = true, playerNameRef.current = playerName.trim())}
            placeholder="Your name"
            style={{
              padding: '10px 16px',
              fontSize: '20px',
              borderRadius: '8px',
              border: 'none',
              marginBottom: '12px',
              width: '220px',
              textAlign: 'center',
            }}
          />
          <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
            <button 
              onClick={() => { trackingColorRef.current = 'blue'; setTrackingColor('blue'); }}
              style={{ background: trackingColor === 'blue' ? '#4dd0ff' : 'transparent', color: trackingColor === 'blue' ? '#000' : '#4dd0ff', border: '2px solid #4dd0ff', padding: '10px 20px', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' }}
            >
              🔵 Blue Light
            </button>
            <button 
              onClick={() => { trackingColorRef.current = 'red'; setTrackingColor('red'); }}
              style={{ background: trackingColor === 'red' ? '#ff4d4d' : 'transparent', color: trackingColor === 'red' ? '#000' : '#ff4d4d', border: '2px solid #ff4d4d', padding: '10px 20px', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' }}
            >
              🔴 Red Light
            </button>
          </div>
 <button
         onClick={() => {
              if (playerName.trim()) {
                setNameSubmitted(true);
                nameSubmittedRef.current = true;
                playerNameRef.current = playerName.trim();
              }
            }}
            style={{
              padding: '12px 32px',
              fontSize: '16px',
              fontWeight: 800,
              cursor: 'pointer',
              borderRadius: '999px',
              border: '3px solid #1a1a1a',
              background: '#ff4444',
              color: '#fff',
              boxShadow: '0 4px 0 #cc2222',
              letterSpacing: '0.5px',
            }}
          >
            Start Game
          </button>
        </div>
      )}
      {gameOver && (
        <div
          style={{
            position: 'fixed',
            top: '25%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            zIndex: 14,
          }}
        > 
       <div
            style={{
              color: '#fff',
              padding: '14px 18px',
              textAlign: 'center',
              minWidth: '200px',
              textShadow: '0 2px 8px rgba(0,0,0,0.85)',
            }}
          >
           <p style={{ fontWeight: 800, margin: '0 0 16px', fontSize: '32px', color: '#fff', letterSpacing: '0.4px', textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>🏆 TOP 3</p>
            {leaderboard.length > 0 ? (
              leaderboard.map((entry, i) => {
                let entryColor = '#fff';
                let glowColor = 'rgba(255,255,255,0.4)';
                if (i === 0) { entryColor = '#ffcb05'; glowColor = 'rgba(255,203,5,0.6)'; }
                else if (i === 1) { entryColor = '#4dd0ff'; glowColor = 'rgba(77,208,255,0.5)'; }
                else if (i === 2) { entryColor = '#ff6b6b'; glowColor = 'rgba(255,107,107,0.5)'; }
                return (
                  <p key={i} style={{ margin: '8px 0', fontSize: '28px', color: entryColor, textShadow: `0 0 8px ${glowColor}` }}>
                    {i + 1}. {entry.name} — {entry.score}
                  </p>
                );
              })
            ) : (
              <p style={{ margin: 0, color: '#fff' }}>No scores yet</p>
            )}
          
             
        
          </div>
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
<button
            onClick={handleRestart}
            style={{
              position: 'fixed',
              top: 'calc(50% + 300px)',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              padding: '18px 80px',
              fontSize: '16px',
              fontWeight: 800,
              cursor: 'pointer',
              borderRadius: '400px',
              border: '3px solid #1a1a1a',
              background: '#3b82f6',
              color: '#fff',
              boxShadow: '0 4px 0 #2563eb',
              letterSpacing: '0.5px',
              zIndex: 14,
            }}
          >
            Play Again
          </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
