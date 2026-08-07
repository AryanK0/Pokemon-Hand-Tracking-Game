import { useEffect, useRef, useState } from 'react';
import './App.css';

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;
const TRAIL_LENGTH = 10;
const MOTION_THRESHOLD = 25;
const SAMPLE_STEP = 4;
const MAX_MISSES = 3;

// Difficulty: base (slow) values, then scale up every DIFFICULTY_STEP score points
const BASE_SPAWN_INTERVAL = 1800;
const MIN_SPAWN_INTERVAL = 650;
const BASE_GRAVITY = 0.15;
const MAX_GRAVITY = 0.35;
const BASE_FALL_SPEED = 1.2;
const MAX_FALL_SPEED = 3;
const DIFFICULTY_STEP = 5; // every 5 points, difficulty increases
const MAX_DIFFICULTY_LEVEL = 6; // caps out after this many steps

const FRUIT_COLORS = [
  { fill: '#ff5e5e', glow: '#ff8a8a' },
  { fill: '#ffb347', glow: '#ffd28a' },
  { fill: '#a4de6c', glow: '#c9f2a0' },
  { fill: '#7ec8ff', glow: '#b3e0ff' },
  { fill: '#e07bff', glow: '#f0b3ff' },
];

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const objectsRef = useRef([]);
  const particlesRef = useRef([]);
  const lastSpawnRef = useRef(0);
  const trailRef = useRef([]);
  const scoreRef = useRef(0);
  const prevFrameRef = useRef(null);
  const missesRef = useRef(0);
  const gameOverRef = useRef(false);

  const [status, setStatus] = useState('Requesting camera access...');
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [level, setLevel] = useState(1);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStatus('Camera connected — wave your hand to slice!');
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
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const motionCanvas = document.createElement('canvas');
    const MOTION_W = 160;
    const MOTION_H = 120;
    motionCanvas.width = MOTION_W;
    motionCanvas.height = MOTION_H;
    const motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });

    let animationId;

    function getDifficultyLevel() {
      return Math.min(
        Math.floor(scoreRef.current / DIFFICULTY_STEP),
        MAX_DIFFICULTY_LEVEL
      );
    }

    function getSpawnInterval() {
      const lvl = getDifficultyLevel();
      const t = lvl / MAX_DIFFICULTY_LEVEL;
      return BASE_SPAWN_INTERVAL - t * (BASE_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL);
    }

    function getGravity() {
      const lvl = getDifficultyLevel();
      const t = lvl / MAX_DIFFICULTY_LEVEL;
      return BASE_GRAVITY + t * (MAX_GRAVITY - BASE_GRAVITY);
    }

    function getFallSpeed() {
      const lvl = getDifficultyLevel();
      const t = lvl / MAX_DIFFICULTY_LEVEL;
      return BASE_FALL_SPEED + t * (MAX_FALL_SPEED - BASE_FALL_SPEED);
    }

    function spawnObject() {
      const c = FRUIT_COLORS[Math.floor(Math.random() * FRUIT_COLORS.length)];
      const fallSpeed = getFallSpeed();
      objectsRef.current.push({
        id: Date.now() + Math.random(),
        x: 60 + Math.random() * (CANVAS_WIDTH - 120),
        y: -30,
        radius: 22 + Math.random() * 10,
        vy: fallSpeed + Math.random() * 1,
        vx: (Math.random() - 0.5) * 2,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.1,
        sliced: false,
        fill: c.fill,
        glow: c.glow,
      });
    }

    function spawnParticles(x, y, color) {
      for (let i = 0; i < 14; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        particlesRef.current.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          color,
        });
      }
    }

    function detectMotion() {
      motionCtx.save();
      motionCtx.scale(-1, 1);
      motionCtx.drawImage(video, -MOTION_W, 0, MOTION_W, MOTION_H);
      motionCtx.restore();

      const frame = motionCtx.getImageData(0, 0, MOTION_W, MOTION_H);
      const data = frame.data;

      if (!prevFrameRef.current) {
        prevFrameRef.current = data;
        return null;
      }

      const prev = prevFrameRef.current;
      let sumX = 0, sumY = 0, count = 0;

      for (let y = 0; y < MOTION_H; y += 1) {
        for (let x = 0; x < MOTION_W; x += SAMPLE_STEP) {
          const i = (y * MOTION_W + x) * 4;
          const diff =
            Math.abs(data[i] - prev[i]) +
            Math.abs(data[i + 1] - prev[i + 1]) +
            Math.abs(data[i + 2] - prev[i + 2]);
          if (diff > MOTION_THRESHOLD * 3) {
            sumX += x;
            sumY += y;
            count += 1;
          }
        }
      }

      prevFrameRef.current = data;
      if (count < 15) return null;

      const scaleX = CANVAS_WIDTH / MOTION_W;
      const scaleY = CANVAS_HEIGHT / MOTION_H;
      return { x: (sumX / count) * scaleX, y: (sumY / count) * scaleY };
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

      objectsRef.current.forEach((obj) => {
        if (obj.sliced) return;
        const dist = pointToSegmentDistance(obj.x, obj.y, p1.x, p1.y, p2.x, p2.y);
        if (dist < obj.radius) {
          obj.sliced = true;
          scoreRef.current += 1;
          setScore(scoreRef.current);
          setLevel(getDifficultyLevel() + 1);
          spawnParticles(obj.x, obj.y, obj.fill);
        }
      });
    }

    function drawFruit(obj) {
      ctx.save();
      ctx.translate(obj.x, obj.y);
      ctx.rotate(obj.rotation);
      ctx.shadowColor = obj.glow;
      ctx.shadowBlur = 18;
      const grad = ctx.createRadialGradient(-obj.radius * 0.3, -obj.radius * 0.3, 2, 0, 0, obj.radius);
      grad.addColorStop(0, obj.glow);
      grad.addColorStop(1, obj.fill);
      ctx.beginPath();
      ctx.arc(0, 0, obj.radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

    function drawParticles() {
      particlesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.life -= 0.03;
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      particlesRef.current = particlesRef.current.filter((p) => p.life > 0);
    }

    function drawTrail() {
      const trail = trailRef.current;
      if (trail.length < 2) return;
      for (let i = 1; i < trail.length; i += 1) {
        const p1 = trail[i - 1];
        const p2 = trail[i];
        const alpha = i / trail.length;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineCap = 'round';
        ctx.lineWidth = 3 + alpha * 6;
        ctx.strokeStyle = `rgba(0, 230, 255, ${alpha})`;
        ctx.shadowColor = '#00e6ff';
        ctx.shadowBlur = 15;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    function drawFrame(timestamp) {
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const motionPoint = detectMotion();
        if (motionPoint) {
          trailRef.current.push(motionPoint);
          if (trailRef.current.length > TRAIL_LENGTH) trailRef.current.shift();
        }
      } else {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (!gameOverRef.current) {
        if (!lastSpawnRef.current) lastSpawnRef.current = timestamp;
        if (timestamp - lastSpawnRef.current > getSpawnInterval()) {
          spawnObject();
          lastSpawnRef.current = timestamp;
        }
        checkCollisions();
      }

      objectsRef.current.forEach((obj) => {
        if (!obj.sliced && obj.y - obj.radius >= CANVAS_HEIGHT) {
          missesRef.current += 1;
          setMisses(missesRef.current);
          if (missesRef.current >= MAX_MISSES) {
            gameOverRef.current = true;
            setGameOver(true);
          }
        }
      });

      objectsRef.current = objectsRef.current.filter(
        (obj) => !obj.sliced && obj.y - obj.radius < CANVAS_HEIGHT
      );

      const gravity = getGravity();
      objectsRef.current.forEach((obj) => {
        obj.vy += gravity;
        obj.y += obj.vy;
        obj.x += obj.vx;
        obj.rotation += obj.rotSpeed;
        drawFruit(obj);
      });

      drawParticles();
      drawTrail();

      if (gameOverRef.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff5e5e';
        ctx.font = 'bold 42px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff5e5e';
        ctx.shadowBlur = 20;
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'white';
        ctx.font = '22px sans-serif';
        ctx.fillText(`Final Score: ${scoreRef.current}`, canvas.width / 2, canvas.height / 2 + 24);
      }

      animationId = requestAnimationFrame(drawFrame);
    }

    animationId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animationId);
  }, []);

  function handleRestart() {
    objectsRef.current = [];
    particlesRef.current = [];
    trailRef.current = [];
    scoreRef.current = 0;
    missesRef.current = 0;
    gameOverRef.current = false;
    lastSpawnRef.current = 0;
    setScore(0);
    setMisses(0);
    setGameOver(false);
    setLevel(1);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #1a1a2e, #0a0a0f)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Segoe UI', sans-serif",
        color: 'white',
        padding: '20px',
      }}
    >
      <h1
        style={{
          fontSize: '32px',
          margin: '0 0 4px',
          letterSpacing: '2px',
          background: 'linear-gradient(90deg, #00e6ff, #ff5e5e)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        FRUIT NINJA — HAND TRACKING
      </h1>
      <p style={{ color: status.includes('failed') ? '#ff5e5e' : '#aaa', marginBottom: '14px' }}>
        {status}
      </p>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
        <div style={badgeStyle('#00e6ff')}>Score: {score}</div>
        <div style={badgeStyle('#ffd166')}>Level: {level}</div>
        <div style={badgeStyle('#ff5e5e')}>Misses: {misses}/{MAX_MISSES}</div>
      </div>

      <div
        style={{
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 0 40px rgba(0,230,255,0.25), 0 0 8px rgba(0,0,0,0.6)',
          border: '2px solid rgba(255,255,255,0.1)',
        }}
      >
        <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }} />
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
      </div>

      {gameOver && (
        <button onClick={handleRestart} style={buttonStyle}>
          Play Again
        </button>
      )}
    </div>
  );
}

function badgeStyle(color) {
  return {
    padding: '8px 18px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid ${color}55`,
    color,
    fontWeight: 600,
    fontSize: '15px',
  };
}

const buttonStyle = {
  marginTop: '18px',
  padding: '12px 28px',
  fontSize: '16px',
  fontWeight: 600,
  cursor: 'pointer',
  borderRadius: '999px',
  border: 'none',
  background: 'linear-gradient(90deg, #00e6ff, #ff5e5e)',
  color: '#0a0a0f',
};

export default App;