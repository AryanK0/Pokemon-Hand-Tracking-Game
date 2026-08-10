import { useEffect, useRef, useState } from 'react';
import creature1 from './assets/creature1.png';
import creature2 from './assets/creature2.png';
import creature3 from './assets/creature3.png';
import './App.css';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 680;
const TRAIL_LENGTH = 10;
const MOTION_THRESHOLD = 25;
const SAMPLE_STEP = 3;
const SMOOTHING = 0.45;
const MAX_MISSES = 3;

const BASE_SPAWN_INTERVAL = 1800;
const MIN_SPAWN_INTERVAL = 650;
const BASE_GRAVITY = 0.22;
const MAX_GRAVITY = 0.4;
const BASE_LAUNCH_SPEED = 12;
const MAX_LAUNCH_SPEED = 16.5;
const DIFFICULTY_STEP = 5;
const MAX_DIFFICULTY_LEVEL = 6;

const GOOD_CREATURE_IMAGES = [creature1, creature2];
const BAD_CREATURE_IMAGE = creature3;
const BAD_SPAWN_CHANCE = 0.25;
const AVATAR_BOX_SIZE = 160;

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const avatarCanvasRef = useRef(null);
  const objectsRef = useRef([]);
  const halvesRef = useRef([]);
  const particlesRef = useRef([]);
  const flashRef = useRef(null);
  const punchRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const trailRef = useRef([]);
  const scoreRef = useRef(0);
  const prevFrameRef = useRef(null);
  const smoothedPosRef = useRef(null);
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

    const loadedGoodImages = GOOD_CREATURE_IMAGES.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    const loadedBadImage = new Image();
    loadedBadImage.src = BAD_CREATURE_IMAGE;

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

    function getLaunchSpeed() {
      const lvl = getDifficultyLevel();
      const t = lvl / MAX_DIFFICULTY_LEVEL;
      return BASE_LAUNCH_SPEED + t * (MAX_LAUNCH_SPEED - BASE_LAUNCH_SPEED);
    }

    function spawnObject() {
      const isBad = Math.random() < BAD_SPAWN_CHANCE;
      const launchSpeed = getLaunchSpeed();
      const startX = 120 + Math.random() * (CANVAS_WIDTH - 240);

      objectsRef.current.push({
        id: Date.now() + Math.random(),
        x: startX,
        y: CANVAS_HEIGHT + 30,
        radius: 65,
        vy: -(launchSpeed + Math.random() * 3),
        vx: (Math.random() - 0.5) * 4,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.08,
        sliced: false,
        pastPeak: false,
        isBad,
        imgIndex: isBad ? -1 : Math.floor(Math.random() * loadedGoodImages.length),
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

    function spawnHalves(obj, sliceAngle) {
      const img = obj.isBad ? loadedBadImage : loadedGoodImages[obj.imgIndex];
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
      let sumX = 0, sumY = 0, totalWeight = 0;

      for (let y = 0; y < MOTION_H; y += 1) {
        for (let x = 0; x < MOTION_W; x += SAMPLE_STEP) {
          const i = (y * MOTION_W + x) * 4;
          const diff =
            Math.abs(data[i] - prev[i]) +
            Math.abs(data[i + 1] - prev[i + 1]) +
            Math.abs(data[i + 2] - prev[i + 2]);
          if (diff > MOTION_THRESHOLD * 3) {
            sumX += x * diff;
            sumY += y * diff;
            totalWeight += diff;
          }
        }
      }

      prevFrameRef.current = data;
      if (totalWeight < 2500) return null;

      const scaleX = CANVAS_WIDTH / MOTION_W;
      const scaleY = CANVAS_HEIGHT / MOTION_H;
      const rawX = (sumX / totalWeight) * scaleX;
      const rawY = (sumY / totalWeight) * scaleY;

      if (!smoothedPosRef.current) {
        smoothedPosRef.current = { x: rawX, y: rawY };
      } else {
        smoothedPosRef.current = {
          x: smoothedPosRef.current.x + (rawX - smoothedPosRef.current.x) * SMOOTHING,
          y: smoothedPosRef.current.y + (rawY - smoothedPosRef.current.y) * SMOOTHING,
        };
      }

      return { x: smoothedPosRef.current.x, y: smoothedPosRef.current.y };
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
        const dist = pointToSegmentDistance(obj.x, obj.y, p1.x, p1.y, p2.x, p2.y);
        if (dist < obj.radius) {
          obj.sliced = true;

          if (obj.isBad) {
            missesRef.current += 1;
            setMisses(missesRef.current);
            if (missesRef.current >= MAX_MISSES) {
              gameOverRef.current = true;
              setGameOver(true);
            }
            spawnParticles(obj.x, obj.y, '#ff3b3b');
          } else {
            scoreRef.current += 1;
            setScore(scoreRef.current);
            setLevel(getDifficultyLevel() + 1);
            spawnParticles(obj.x, obj.y, '#ffcc00');
          }

          spawnHalves(obj, sliceAngle);
          flashRef.current = { p1, p2, life: 1 };
          punchRef.current = 1;
        }
      });
    }

    function drawCreature(obj) {
      const img = obj.isBad ? loadedBadImage : loadedGoodImages[obj.imgIndex];
      if (!img.complete || img.naturalWidth === 0) return;

      const glowColor = obj.isBad ? 'rgba(255, 59, 59, 0.55)' : 'rgba(255, 203, 60, 0.5)';

      ctx.save();
      ctx.translate(obj.x, obj.y);
      ctx.rotate(obj.rotation);

      const glowRadius = obj.radius * 1.15;
      const grad = ctx.createRadialGradient(0, 0, obj.radius * 0.3, 0, 0, glowRadius);
      grad.addColorStop(0, glowColor);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

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
      halvesRef.current = halvesRef.current.filter((h) => h.life > 0 && h.y < CANVAS_HEIGHT + 200);
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

    function drawFlash() {
      if (!flashRef.current) return;
      const f = flashRef.current;
      ctx.save();
      ctx.globalAlpha = Math.max(f.life, 0);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(f.p1.x, f.p1.y);
      ctx.lineTo(f.p2.x, f.p2.y);
      ctx.stroke();
      ctx.restore();
      f.life -= 0.15;
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
      const W = AVATAR_BOX_SIZE;
      const H = AVATAR_BOX_SIZE;
      actx.clearRect(0, 0, W, H);

      const pos = smoothedPosRef.current;
      let armAngle = -0.6;
      if (pos) {
        const dx = pos.x - CANVAS_WIDTH / 2;
        const dy = pos.y - CANVAS_HEIGHT / 2;
        armAngle = Math.atan2(dy, dx);
      }

      const cx = W / 2;
      const cy = H / 2 + 20;

      actx.strokeStyle = '#5a4632';
      actx.lineWidth = 8;
      actx.lineCap = 'round';
      actx.beginPath();
      actx.moveTo(cx - 8, cy + 20);
      actx.lineTo(cx - 12, cy + 45);
      actx.moveTo(cx + 8, cy + 20);
      actx.lineTo(cx + 12, cy + 45);
      actx.stroke();

      actx.fillStyle = '#8a7250';
      actx.beginPath();
      actx.ellipse(cx, cy, 22, 28, 0, 0, Math.PI * 2);
      actx.fill();

      actx.strokeStyle = '#8a7250';
      actx.lineWidth = 10;
      actx.beginPath();
      actx.moveTo(cx - 14, cy - 10);
      actx.lineTo(cx - 26, cy + 8);
      actx.stroke();
      actx.fillStyle = '#d97a6c';
      actx.beginPath();
      actx.arc(cx - 26, cy + 8, 9, 0, Math.PI * 2);
      actx.fill();

      const armLen = 34;
      const shoulderX = cx + 12;
      const shoulderY = cy - 10;
      const handX = shoulderX + Math.cos(armAngle) * armLen;
      const handY = shoulderY + Math.sin(armAngle) * armLen * 0.6;

      actx.strokeStyle = '#8a7250';
      actx.lineWidth = 10;
      actx.beginPath();
      actx.moveTo(shoulderX, shoulderY);
      actx.lineTo(handX, handY);
      actx.stroke();

      actx.fillStyle = '#e8544a';
      actx.beginPath();
      actx.arc(handX, handY, 11, 0, Math.PI * 2);
      actx.fill();
      actx.strokeStyle = '#a8342c';
      actx.lineWidth = 2;
      actx.stroke();

      actx.fillStyle = '#a08860';
      actx.beginPath();
      actx.arc(cx, cy - 32, 16, 0, Math.PI * 2);
      actx.fill();

      actx.fillStyle = '#1a1a1a';
      actx.beginPath();
      actx.arc(cx - 5, cy - 34, 2, 0, Math.PI * 2);
      actx.arc(cx + 5, cy - 34, 2, 0, Math.PI * 2);
      actx.fill();

      actx.fillStyle = '#2c4a2c';
      actx.font = 'bold 11px Arial';
      actx.textAlign = 'center';
      actx.fillText('YOUR FIGHTER', cx, H - 8);
    }

    function drawFrame(timestamp) {
      punchRef.current = Math.max(punchRef.current - 0.08, 0);
      const zoom = 1 + punchRef.current * 0.015;

      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);

      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -CANVAS_WIDTH, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();

        const motionPoint = detectMotion();
        if (motionPoint) {
          trailRef.current.push(motionPoint);
          if (trailRef.current.length > TRAIL_LENGTH) trailRef.current.shift();
        }
      } else {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      if (!gameOverRef.current) {
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
        obj.rotation += obj.rotSpeed;
        if (obj.vy > 0) obj.pastPeak = true;
      });

      objectsRef.current.forEach((obj) => {
        if (!obj.sliced && obj.pastPeak && obj.y - obj.radius >= CANVAS_HEIGHT) {
          if (!obj.isBad) {
            missesRef.current += 1;
            setMisses(missesRef.current);
            if (missesRef.current >= MAX_MISSES) {
              gameOverRef.current = true;
              setGameOver(true);
            }
          }
        }
      });

      objectsRef.current = objectsRef.current.filter((obj) => {
        if (obj.sliced) return false;
        if (obj.pastPeak && obj.y - obj.radius >= CANVAS_HEIGHT) return false;
        return true;
      });

      objectsRef.current.forEach((obj) => drawCreature(obj));
      drawHalves();
      drawParticles();
      drawTrail();
      drawFlash();

      if (gameOverRef.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 44px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Game Over', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 16);
        ctx.font = '22px Arial';
        ctx.fillText(`Final Score: ${scoreRef.current}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 26);
      }

      ctx.restore();

      drawAvatar();

      animationId = requestAnimationFrame(drawFrame);
    }

    animationId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animationId);
  }, []);

  function handleRestart() {
    objectsRef.current = [];
    halvesRef.current = [];
    particlesRef.current = [];
    flashRef.current = null;
    punchRef.current = 0;
    trailRef.current = [];
    smoothedPosRef.current = null;
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
        background: 'linear-gradient(180deg, #7ec8e3 0%, #a8dba8 55%, #6fb86f 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Trebuchet MS', Verdana, sans-serif",
        color: '#1a2e1a',
        padding: '30px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={blobStyle('#ffcb3c', -120, -80)} />
      <div style={blobStyle('#ff6b6b', -100, 500)} />
      <div style={blobStyle('#4a9fd6', 'calc(100% - 40px)', -60)} />
      <div style={blobStyle('#7cb85c', 'calc(100% - 60px)', 520)} />

      <h1
        style={{
          fontSize: '30px',
          margin: '0 0 4px',
          fontWeight: 800,
          color: '#fff',
          textShadow: '0 3px 0 #2c6e2c, 0 4px 6px rgba(0,0,0,0.25)',
          letterSpacing: '1px',
          zIndex: 2,
        }}
      >
        CREATURE NINJA ARENA
      </h1>
      <p
        style={{
          color: status.includes('failed') ? '#c0392b' : '#2c4a2c',
          marginBottom: '4px',
          fontSize: '14px',
          fontWeight: 600,
          zIndex: 2,
        }}
      >
        {status}
      </p>
      <p style={{ fontSize: '13px', color: '#2c4a2c', marginTop: '0', marginBottom: '14px', zIndex: 2 }}>
        Slice the glowing creatures — avoid the red one!
      </p>

      <div style={{ display: 'flex', gap: '14px', marginBottom: '14px', zIndex: 2 }}>
        <div style={badgeStyle('#4a9fd6')}>⚡ Score: {score}</div>
        <div style={badgeStyle('#ffcb3c')}>🔥 Level: {level}</div>
        <div style={badgeStyle('#ff6b6b')}>❤ Lives: {MAX_MISSES - misses}/{MAX_MISSES}</div>
      </div>

      <div
        style={{
          borderRadius: '20px',
          overflow: 'visible',
          border: '6px solid #fff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          zIndex: 2,
          position: 'relative',
        }}
      >
        <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }} />
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ display: 'block', borderRadius: '14px' }} />
        <canvas
          ref={avatarCanvasRef}
          width={AVATAR_BOX_SIZE}
          height={AVATAR_BOX_SIZE}
          style={{
            position: 'absolute',
            bottom: '14px',
            right: '14px',
            background: 'rgba(255,255,255,0.85)',
            borderRadius: '12px',
            border: '3px solid #ffcb3c',
          }}
        />
      </div>

      {gameOver && (
        <button onClick={handleRestart} style={buttonStyle}>
          Play Again
        </button>
      )}
    </div>
  );
}

function blobStyle(color, left, top) {
  return {
    position: 'absolute',
    left,
    top,
    width: '260px',
    height: '260px',
    borderRadius: '50%',
    background: color,
    opacity: 0.35,
    filter: 'blur(40px)',
    zIndex: 1,
  };
}

function badgeStyle(color) {
  return {
    padding: '10px 18px',
    borderRadius: '999px',
    background: '#fff',
    border: `3px solid ${color}`,
    color: '#1a2e1a',
    fontWeight: 700,
    fontSize: '15px',
    boxShadow: '0 3px 0 rgba(0,0,0,0.15)',
  };
}

const buttonStyle = {
  marginTop: '20px',
  padding: '12px 30px',
  fontSize: '16px',
  fontWeight: 700,
  cursor: 'pointer',
  borderRadius: '999px',
  border: '3px solid #2c6e2c',
  background: '#ffcb3c',
  color: '#1a2e1a',
  boxShadow: '0 4px 0 #2c6e2c',
  zIndex: 2,
};

export default App;