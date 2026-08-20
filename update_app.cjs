const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Add Import
content = content.replace("import { useEffect, useRef, useState } from 'react';", "import { useEffect, useRef, useState } from 'react';\nimport { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';");

// 2. Add State Refs
content = content.replace("const trackingColorRef = useRef('blue');", "const trackingColorRef = useRef('blue');\n  const handLandmarkerRef = useRef(null);\n  const [isModelLoading, setIsModelLoading] = useState(false);");

// 3. Add Model Loading Effect
const modelLoadingEffect = `
  useEffect(() => {
    async function loadModel() {
      setIsModelLoading(true);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        handLandmarkerRef.current = landmarker;
      } catch (err) {
        console.error("Failed to load hand tracking model:", err);
      }
      setIsModelLoading(false);
    }
    loadModel();
  }, []);
`;
content = content.replace("useEffect(() => {\n    navigator.mediaDevices", modelLoadingEffect + "\n  useEffect(() => {\n    navigator.mediaDevices");

// 4. Update detectLight
const oldDetectLightStart = `function detectLight() {
      motionCtx.save();`;
      
const newDetectLightStart = `function detectLight() {
      const isHandMode = trackingColorRef.current === 'hand';

      let rawX = 0;
      let rawY = 0;

      if (isHandMode) {
        if (!handLandmarkerRef.current || !video || video.readyState !== video.HAVE_ENOUGH_DATA) return null;
        let results;
        try {
           results = handLandmarkerRef.current.detectForVideo(video, performance.now());
        } catch(e) {
           return null;
        }
        if (results && results.landmarks && results.landmarks.length > 0) {
          const indexFinger = results.landmarks[0][8]; // Index Finger Tip
          rawX = (1 - indexFinger.x) * canvas.width;
          rawY = indexFinger.y * canvas.height;
        } else {
          return null;
        }
      } else {
        motionCtx.save();`;

content = content.replace(oldDetectLightStart, newDetectLightStart);

// 5. Connect rawX and rawY logic in detectLight
const oldRawAssignment = `if (count === 0) return null;

      const scaleX = canvas.width / MOTION_W;
      const scaleY = canvas.height / MOTION_H;
      let rawX = (sumX / count) * scaleX;
      let rawY = (sumY / count) * scaleY;`;
      
const newRawAssignment = `if (count === 0) return null;

        const scaleX = canvas.width / MOTION_W;
        const scaleY = canvas.height / MOTION_H;
        rawX = (sumX / count) * scaleX;
        rawY = (sumY / count) * scaleY;
      }`;
content = content.replace(oldRawAssignment, newRawAssignment);


// 6. Update UI buttons
const oldButtons = `<div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
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
          </div>`;
          
const newButtons = `<div style={{ display: 'flex', gap: '15px', marginBottom: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
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
            <button 
              onClick={() => { trackingColorRef.current = 'hand'; setTrackingColor('hand'); }}
              style={{ background: trackingColor === 'hand' ? '#2ecc71' : 'transparent', color: trackingColor === 'hand' ? '#000' : '#2ecc71', border: '2px solid #2ecc71', padding: '10px 20px', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', position: 'relative' }}
            >
              ✋ Hand Tracking
              {isModelLoading && <div style={{position:'absolute', top:'-10px', right:'-10px', background:'#ffcb05', color:'#000', fontSize:'12px', padding:'2px 6px', borderRadius:'10px'}}>Loading...</div>}
            </button>
          </div>`;

content = content.replace(oldButtons, newButtons);


fs.writeFileSync('src/App.jsx', content);
console.log('App.jsx updated successfully');
