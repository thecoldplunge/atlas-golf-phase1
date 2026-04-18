import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ScrollView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

const HOLES = [
  {
    id: 1,
    name: 'Pine Meadow',
    par: 4,
    ballStart: { x: 50, y: 148 },
    cup: { x: 78, y: 18 },
    terrain: {
      tee: { x: 43, y: 144, w: 14, h: 10, r: 4 },
      fairway: [
        { x: 39, y: 102, w: 22, h: 50, r: 12 },
        { x: 43, y: 62, w: 30, h: 52, r: 14 },
        { x: 58, y: 28, w: 24, h: 42, r: 12 }
      ],
      green: { x: 67, y: 7, w: 24, h: 26, r: 13 }
    },
    obstacles: [
      { type: 'circle', x: 27, y: 108, r: 5, look: 'tree' },
      { type: 'circle', x: 72, y: 95, r: 5, look: 'tree' },
      { type: 'circle', x: 30, y: 65, r: 6, look: 'tree' }
    ],
    hazards: [
      { type: 'sandRect', x: 61, y: 17, w: 10, h: 8 },
      { type: 'sandRect', x: 84, y: 20, w: 10, h: 8 }
    ]
  },
  {
    id: 2,
    name: 'Split Gate',
    par: 3,
    ballStart: { x: 50, y: 150 },
    cup: { x: 82, y: 18 },
    obstacles: [
      { type: 'rect', x: 20, y: 92, w: 60, h: 8 },
      { type: 'rect', x: 0, y: 56, w: 58, h: 8 }
    ],
    hazards: [{ type: 'sandRect', x: 62, y: 52, w: 30, h: 18 }]
  },
  {
    id: 3,
    name: 'Dogleg Drift',
    par: 4,
    ballStart: { x: 16, y: 148 },
    cup: { x: 84, y: 22 },
    obstacles: [
      { type: 'rect', x: 24, y: 110, w: 60, h: 8 },
      { type: 'rect', x: 16, y: 64, w: 58, h: 8 },
      { type: 'circle', x: 72, y: 92, r: 8 }
    ],
    hazards: [
      { type: 'waterRect', x: 0, y: 86, w: 24, h: 18 },
      { type: 'sandRect', x: 58, y: 48, w: 34, h: 16 }
    ]
  },
  {
    id: 4,
    name: 'Bumper Tunnel',
    par: 4,
    ballStart: { x: 12, y: 150 },
    cup: { x: 88, y: 14 },
    obstacles: [
      { type: 'rect', x: 0, y: 106, w: 72, h: 8 },
      { type: 'rect', x: 28, y: 70, w: 72, h: 8 },
      { type: 'circle', x: 38, y: 46, r: 8 },
      { type: 'circle', x: 60, y: 32, r: 7 }
    ],
    hazards: [
      { type: 'sandRect', x: 10, y: 26, w: 24, h: 14 },
      { type: 'waterRect', x: 72, y: 96, w: 28, h: 20 }
    ]
  },
  {
    id: 5,
    name: 'Mini Maze',
    par: 5,
    ballStart: { x: 8, y: 148 },
    cup: { x: 92, y: 10 },
    obstacles: [
      { type: 'rect', x: 16, y: 126, w: 64, h: 8 },
      { type: 'rect', x: 0, y: 96, w: 60, h: 8 },
      { type: 'rect', x: 40, y: 66, w: 60, h: 8 },
      { type: 'rect', x: 0, y: 36, w: 64, h: 8 },
      { type: 'circle', x: 76, y: 54, r: 7 },
      { type: 'circle', x: 26, y: 18, r: 7 }
    ],
    hazards: [
      { type: 'waterRect', x: 64, y: 112, w: 36, h: 16 },
      { type: 'waterRect', x: 0, y: 48, w: 26, h: 14 },
      { type: 'sandRect', x: 70, y: 22, w: 20, h: 14 }
    ]
  }
];

const WORLD = { w: 260, h: 420 };
const CAMERA_ZOOM = 3.2;
const MANUAL_PAN_GRACE_MS = 2200;
const BALL_RADIUS_WORLD = 1.2;
const CUP_RADIUS_WORLD = 2.0;
const SWING_PAD_SIZE = 148;
const PAD_CENTER = SWING_PAD_SIZE / 2;
const SWING_START_RADIUS = 60;
const MIN_PULL_TO_ARM = 12;
const MAX_PULL_DISTANCE = 92;
const PREVIEW_POWERS = [25, 50, 75, 100];
const PREVIEW_FRICTION = 2.1;
const STOP_SPEED = 6;
const GRAVITY = 74;
const GROUND_EPSILON = 0.05;
const FRINGE_BUFFER = 4;
const MIN_BOUNCE_VZ = 5.2;
const CLUBS = [
  { key: 'PT', name: 'Putter', short: 'PT', speed: 0.45, launch: 0.04, roll: 0.86, spin: 1.22 },
  { key: 'LW', name: 'Lob Wedge', short: 'LW', speed: 0.74, launch: 1.22, roll: 0.54, spin: 0.82 },
  { key: 'SW', name: 'Sand Wedge', short: 'SW', speed: 0.78, launch: 1.12, roll: 0.58, spin: 0.85 },
  { key: 'GW', name: 'Gap Wedge', short: 'GW', speed: 0.84, launch: 1.0, roll: 0.63, spin: 0.9 },
  { key: 'PW', name: 'Pitching Wedge', short: 'PW', speed: 0.9, launch: 0.92, roll: 0.68, spin: 0.93 },
  { key: '9I', name: '9 Iron', short: '9i', speed: 0.96, launch: 0.84, roll: 0.73, spin: 0.97 },
  { key: '8I', name: '8 Iron', short: '8i', speed: 1.01, launch: 0.78, roll: 0.79, spin: 1.0 },
  { key: '7I', name: '7 Iron', short: '7i', speed: 1.07, launch: 0.72, roll: 0.85, spin: 1.02 },
  { key: '6I', name: '6 Iron', short: '6i', speed: 1.12, launch: 0.67, roll: 0.92, spin: 1.04 },
  { key: '5I', name: '5 Iron', short: '5i', speed: 1.17, launch: 0.62, roll: 0.98, spin: 1.06 },
  { key: '4I', name: '4 Iron', short: '4i', speed: 1.22, launch: 0.58, roll: 1.03, spin: 1.08 },
  { key: '3I', name: '3 Iron', short: '3i', speed: 1.27, launch: 0.54, roll: 1.08, spin: 1.1 },
  { key: '7W', name: '7 Wood', short: '7w', speed: 1.25, launch: 0.64, roll: 1.02, spin: 1.0 },
  { key: '5W', name: '5 Wood', short: '5w', speed: 1.32, launch: 0.58, roll: 1.08, spin: 0.98 },
  { key: '3W', name: '3 Wood', short: '3w', speed: 1.4, launch: 0.52, roll: 1.13, spin: 0.96 },
  { key: 'DR', name: 'Driver', short: 'DR', speed: 1.5, launch: 0.48, roll: 1.18, spin: 0.92 }
];
const TEMPO_WINDOW = { min: 220, max: 840, idealMin: 360, idealMax: 620, stall: 220 };

const SURFACE_PHYSICS = {
  rough: { rollFriction: 2.7, bounce: 0.26, landingDamping: 0.82, wallRestitution: 0.66 },
  fairway: { rollFriction: 2.0, bounce: 0.34, landingDamping: 0.9, wallRestitution: 0.7 },
  fringe: { rollFriction: 2.35, bounce: 0.28, landingDamping: 0.85, wallRestitution: 0.68 },
  sand: { rollFriction: 4.9, bounce: 0.14, landingDamping: 0.62, wallRestitution: 0.58 },
  green: { rollFriction: 1.35, bounce: 0.24, landingDamping: 0.94, wallRestitution: 0.74 }
};

const GOLFER_PIXEL_KEY = {
  h: '#d25f49',
  o: '#20282a',
  s: '#3f76c1',
  k: '#f0c08c',
  p: '#2e563c',
  b: '#1a1f1c',
  c: '#d9ddd2',
  n: '#263246',
  w: '#edf1ea'
};

const GOLFER_SPRITE_ROWS = [
  '.....nn.....',
  '....nwwn....',
  '...nkkkkn...',
  '..nnssssnn..',
  '..nsshhssn..',
  '.ppsssssspp.',
  '.ppsskksspp.',
  '..pppppppp..',
  '..bb....bb..',
  '.bb......bb.',
  '.b........b.'
];

const GOLFER_PIXELS = GOLFER_SPRITE_ROWS.flatMap((row, y) =>
  row.split('').flatMap((token, x) => (token === '.' ? [] : [{ x, y, color: GOLFER_PIXEL_KEY[token] }]))
);

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const degToRad = (deg) => (deg * Math.PI) / 180;

const magnitude = (v) => Math.hypot(v.x, v.y);

const normalize = (v) => {
  const m = magnitude(v);
  if (m < 0.0001) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / m, y: v.y / m };
};

const pointInRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

const pointInCircle = (p, c) => {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return dx * dx + dy * dy <= c.r * c.r;
};

const getAimAngleToCup = (ballPos, cup) => Math.atan2(cup.y - ballPos.y, cup.x - ballPos.x);
const speedFromPower = (powerPct, club = CLUBS[0], tempo = { speed: 1, launch: 1, accuracy: 1, note: 'Smooth tempo.' }) => {
  const base = 95 + (powerPct / 125) * 290;
  return base * club.speed * tempo.speed;
};
const getTempoFeedback = (track, sampleTs = Date.now()) => {
  const deepestTs = track.deepestTs || track.lastPullTs || sampleTs;
  const crossedTs = track.crossedTs || 0;
  const backswingMs = Math.max(1, deepestTs - track.startTs);
  const elapsedMs = Math.max(1, sampleTs - track.startTs);
  const topHoldMs = crossedTs
    ? Math.max(0, crossedTs - deepestTs)
    : Math.max(0, sampleTs - deepestTs);
  const stallMs = Math.max(track.maxPauseMs, topHoldMs);
  const pullSpeed = track.maxPullDown / backswingMs;
  const flickMs = crossedTs ? Math.max(1, sampleTs - crossedTs) : 0;
  let speed = 1;
  let launch = 1;
  let accuracy = 1;
  let note = 'Smooth tempo';

  if (backswingMs < TEMPO_WINDOW.min || pullSpeed > 0.32 || flickMs > 0 && flickMs < 45) {
    speed = 0.92;
    launch = 0.94;
    accuracy = 0.76;
    note = 'Too quick';
  } else if (backswingMs > TEMPO_WINDOW.max || stallMs > TEMPO_WINDOW.stall) {
    speed = 0.9;
    launch = 1.02;
    accuracy = 0.82;
    note = 'Too slow';
  } else if (backswingMs >= TEMPO_WINDOW.idealMin && backswingMs <= TEMPO_WINDOW.idealMax && stallMs < 140) {
    speed = 1.03;
    launch = 1.02;
    accuracy = 1.08;
    note = 'Smooth tempo';
  } else {
    note = 'Decent tempo';
  }

  return { speed, launch, accuracy, note, backswingMs, stallMs, pullSpeed, elapsedMs };
};
const expandRect = (rect, inset) => ({
  x: rect.x - inset,
  y: rect.y - inset,
  w: rect.w + inset * 2,
  h: rect.h + inset * 2
});
const getSurfaceAtPoint = (hole, point) => {
  const inSand = hole.hazards?.some((h) => h.type === 'sandRect' && pointInRect(point, h));
  if (inSand) {
    return 'sand';
  }

  const terrain = hole.terrain;
  if (terrain?.green && pointInRect(point, terrain.green)) {
    return 'green';
  }
  if (terrain?.green && pointInRect(point, expandRect(terrain.green, FRINGE_BUFFER))) {
    return 'fringe';
  }
  if (terrain?.fairway?.some((f) => pointInRect(point, f))) {
    return 'fairway';
  }
  if (terrain?.tee && pointInRect(point, terrain.tee)) {
    return 'fairway';
  }
  return 'rough';
};
const estimateStraightDistance = (powerPct, club, tempo) => {
  const shotRatio = clamp(powerPct / 125, 0, 1);
  const effectiveSpeed = speedFromPower(powerPct, club, tempo);
  const carry = shotRatio * shotRatio * 12 * club.speed + 10 * club.launch * tempo.launch;
  const rollout = Math.max(0, effectiveSpeed - STOP_SPEED) / (PREVIEW_FRICTION * (1.6 / club.roll));
  return carry + rollout * 0.68;
};

export default function App() {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const viewWidth = screenWidth;
  const viewHeight = screenHeight;
  const basePixelsPerWorld = Math.max(screenWidth / WORLD.w, screenHeight / WORLD.h);
  const pixelsPerWorld = basePixelsPerWorld * CAMERA_ZOOM;
  const halfVpW = (viewWidth / 2) / pixelsPerWorld;
  const halfVpH = (viewHeight / 2) / pixelsPerWorld;

  const [holeIndex, setHoleIndex] = useState(0);
  const [strokesCurrent, setStrokesCurrent] = useState(0);
  const [scores, setScores] = useState(Array(HOLES.length).fill(null));
  const [ball, setBall] = useState(HOLES[0].ballStart);
  const [aimAngle, setAimAngle] = useState(getAimAngleToCup(HOLES[0].ballStart, HOLES[0].cup));
  const [isAiming, setIsAiming] = useState(false);
  const [sunk, setSunk] = useState(false);
  const [waterNotice, setWaterNotice] = useState(false);
  const [swingActive, setSwingActive] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [powerPct, setPowerPct] = useState(0);
  const [selectedClubIndex, setSelectedClubIndex] = useState(15);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastShotNote, setLastShotNote] = useState('Pull down with tempo, then flick up through center.');
  const [tempoLabel, setTempoLabel] = useState('Tempo idle');
  const [golferBallAnchor, setGolferBallAnchor] = useState(HOLES[0].ballStart);
  const [ballHeight, setBallHeight] = useState(0);
  const [camera, setCamera] = useState({ x: HOLES[0].ballStart.x, y: HOLES[0].ballStart.y });
  const cameraRef = useRef({ x: HOLES[0].ballStart.x, y: HOLES[0].ballStart.y });
  const manualPanUntilRef = useRef(0);
  const panCentroidRef = useRef(null);
  const isTwoFingerPanningRef = useRef(false);

  const ballRef = useRef(ball);
  const velocityRef = useRef({ x: 0, y: 0 });
  const flightRef = useRef({ z: 0, vz: 0 });
  const lastTsRef = useRef(null);
  const frameRef = useRef(null);
  const courseRef = useRef(null);
  const courseFrameRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const swingTrackRef = useRef({
    active: false,
    armed: false,
    maxPullDown: 0,
    maxPullLateral: 0,
    deepest: { x: 0, y: 0 },
    crossedCenter: false,
    maxUpLateral: 0,
    startTs: 0,
    lastMoveTs: 0,
    lastPullTs: 0,
    maxPauseMs: 0,
    deepestTs: 0,
    crossedTs: 0
  });

  const currentHole = HOLES[holeIndex];
  const selectedClub = CLUBS[selectedClubIndex];
  const scaleX = pixelsPerWorld;
  const scaleY = pixelsPerWorld;
  const ballRadius = clamp(BALL_RADIUS_WORLD * pixelsPerWorld * 0.48, 5, 14);
  const cupRadius = clamp(CUP_RADIUS_WORLD * pixelsPerWorld * 0.32, 6, 14);
  const clampCamera = (c) => ({
    x: clamp(c.x, halfVpW, WORLD.w - halfVpW),
    y: clamp(c.y, halfVpH, WORLD.h - halfVpH)
  });
  const ballMoving =
    magnitude(velocityRef.current) > 0.3 ||
    flightRef.current.z > 0.04 ||
    Math.abs(flightRef.current.vz) > 0.35;

  const syncCourseFrame = () => {
    if (!courseRef.current || typeof courseRef.current.measureInWindow !== 'function') {
      return;
    }
    courseRef.current.measureInWindow((x, y, width, height) => {
      courseFrameRef.current = { x, y, width, height };
    });
  };

  const toScreen = (p) => ({
    x: (p.x - cameraRef.current.x) * pixelsPerWorld + viewWidth / 2,
    y: (p.y - cameraRef.current.y) * pixelsPerWorld + viewHeight / 2
  });
  const toWorld = (p) => ({
    x: cameraRef.current.x + (p.x - viewWidth / 2) / pixelsPerWorld,
    y: cameraRef.current.y + (p.y - viewHeight / 2) / pixelsPerWorld
  });

  const resetBall = ({ penaltyStroke = false } = {}) => {
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setSwingActive(false);
    setPullDistance(0);
    setPowerPct(0);
    setTempoLabel('Tempo idle');
    const nc = clampCamera(currentHole.ballStart);
    setCamera(nc);
    cameraRef.current = nc;
    manualPanUntilRef.current = 0;
    if (penaltyStroke) {
      setStrokesCurrent((s) => s + 1);
      setWaterNotice(true);
    }
  };

  const retryHole = () => {
    setSunk(false);
    setWaterNotice(false);
    setStrokesCurrent(0);
    setScores((prev) => {
      const next = [...prev];
      next[holeIndex] = null;
      return next;
    });
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setSwingActive(false);
    setPullDistance(0);
    setPowerPct(0);
    setTempoLabel('Tempo idle');
    setLastShotNote('Pull down with tempo, then flick up through center.');
    const nc = clampCamera(currentHole.ballStart);
    setCamera(nc);
    cameraRef.current = nc;
    manualPanUntilRef.current = 0;
  };

  useEffect(() => {
    ballRef.current = ball;
  }, [ball]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    if (ballMoving) {
      return;
    }
    setGolferBallAnchor((prev) => {
      const dx = prev.x - ball.x;
      const dy = prev.y - ball.y;
      if (Math.hypot(dx, dy) < 0.05) {
        return prev;
      }
      return ball;
    });
  }, [ball, ballMoving]);

  useEffect(() => {
    setSunk(false);
    setWaterNotice(false);
    setStrokesCurrent(0);
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setSwingActive(false);
    setPullDistance(0);
    setPowerPct(0);
    setTempoLabel('Tempo idle');
    setLastShotNote('Pull down with tempo, then flick up through center.');
  }, [holeIndex, currentHole.ballStart, currentHole.cup]);

  useEffect(() => {
    const tick = (ts) => {
      if (lastTsRef.current == null) {
        lastTsRef.current = ts;
      }
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.033);
      lastTsRef.current = ts;

      if (!sunk) {
        const vel = velocityRef.current;
        const flight = flightRef.current;
        const speed = magnitude(vel);
        const movingVertically = flight.z > 0.01 || Math.abs(flight.vz) > 0.15;

        if (speed > 0.3 || movingVertically) {
          let next = {
            x: ballRef.current.x + vel.x * dt,
            y: ballRef.current.y + vel.y * dt
          };

          const surfaceName = getSurfaceAtPoint(currentHole, next);
          const surfacePhysics = SURFACE_PHYSICS[surfaceName] || SURFACE_PHYSICS.rough;
          const onGround = flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.3;

          if (onGround) {
            const dragFactor = Math.max(0, 1 - surfacePhysics.rollFriction * dt);
            vel.x *= dragFactor;
            vel.y *= dragFactor;
          } else {
            const airDrag = Math.max(0, 1 - 0.14 * dt);
            vel.x *= airDrag;
            vel.y *= airDrag;
          }

          flight.vz -= GRAVITY * dt;
          flight.z += flight.vz * dt;
          if (flight.z <= 0) {
            const impactVz = Math.abs(flight.vz);
            flight.z = 0;
            if (impactVz > MIN_BOUNCE_VZ) {
              flight.vz = impactVz * surfacePhysics.bounce;
              vel.x *= surfacePhysics.landingDamping;
              vel.y *= surfacePhysics.landingDamping;
            } else {
              flight.vz = 0;
            }
          }

          const radiusWorld = BALL_RADIUS_WORLD;
          const restitution = surfacePhysics.wallRestitution;

          // No outer arena walls. Let the larger course feel open.
          next.x = clamp(next.x, radiusWorld, WORLD.w - radiusWorld);
          next.y = clamp(next.y, radiusWorld, WORLD.h - radiusWorld);

          if (flight.z <= 1.15) {
            currentHole.obstacles.forEach((o) => {
              if (o.type === 'rect') {
                const nearestX = clamp(next.x, o.x, o.x + o.w);
                const nearestY = clamp(next.y, o.y, o.y + o.h);
                const dx = next.x - nearestX;
                const dy = next.y - nearestY;
                const overlap = radiusWorld * radiusWorld - (dx * dx + dy * dy);
                if (overlap > 0) {
                  let normal = normalize({ x: dx, y: dy });
                  if (Math.abs(normal.x) < 0.01 && Math.abs(normal.y) < 0.01) {
                    const center = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
                    normal = normalize({ x: next.x - center.x, y: next.y - center.y });
                    if (Math.abs(normal.x) < 0.01 && Math.abs(normal.y) < 0.01) {
                      normal = { x: 0, y: -1 };
                    }
                  }
                  next = {
                    x: nearestX + normal.x * (radiusWorld + 0.1),
                    y: nearestY + normal.y * (radiusWorld + 0.1)
                  };
                  const vn = vel.x * normal.x + vel.y * normal.y;
                  if (vn < 0) {
                    vel.x -= (1 + restitution) * vn * normal.x;
                    vel.y -= (1 + restitution) * vn * normal.y;
                  }
                }
              }

              if (o.type === 'circle') {
                const dx = next.x - o.x;
                const dy = next.y - o.y;
                const dist = Math.hypot(dx, dy);
                const minDist = o.r + radiusWorld;
                if (dist < minDist) {
                  const normal = dist < 0.001 ? { x: 1, y: 0 } : { x: dx / dist, y: dy / dist };
                  next = {
                    x: o.x + normal.x * (minDist + 0.1),
                    y: o.y + normal.y * (minDist + 0.1)
                  };
                  const vn = vel.x * normal.x + vel.y * normal.y;
                  if (vn < 0) {
                    vel.x -= (1 + restitution) * vn * normal.x;
                    vel.y -= (1 + restitution) * vn * normal.y;
                  }
                }
              }
            });
          }

          const fellInWater = currentHole.hazards.some((h) => h.type === 'waterRect' && pointInRect(next, h));
          if (fellInWater) {
            resetBall({ penaltyStroke: true });
          } else {
            ballRef.current = next;
            setBall(next);
            setBallHeight(flight.z);
          }

          if (magnitude(vel) < 6 && flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.35) {
            vel.x = 0;
            vel.y = 0;
          }
          if (flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.35) {
            flight.z = 0;
            flight.vz = 0;
          }
        }
      }

      // Camera auto-follow
      const nowMs = Date.now();
      if (nowMs >= manualPanUntilRef.current) {
        const vel = velocityRef.current;
        const ballPos = ballRef.current;
        setCamera((prev) => {
          const target = clampCamera({
            x: ballPos.x + clamp(vel.x * 0.025, -5, 5),
            y: ballPos.y + clamp(vel.y * 0.025, -7, 7)
          });
          const ease = magnitude(vel) > 1 ? 0.14 : 0.08;
          const next = clampCamera({
            x: prev.x + (target.x - prev.x) * ease,
            y: prev.y + (target.y - prev.y) * ease
          });
          if (Math.hypot(next.x - prev.x, next.y - prev.y) < 0.001) return prev;
          return next;
        });
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      lastTsRef.current = null;
    };
  }, [currentHole.hazards, currentHole.obstacles, sunk]);

  useEffect(() => {
    if (sunk) {
      return;
    }
    if (ballHeight > 0.2 || Math.abs(flightRef.current.vz) > 0.35) {
      return;
    }
    const vel = velocityRef.current;
    const ballStopped = magnitude(vel) < 0.25;
    if (!ballStopped) {
      return;
    }
    const dx = ball.x - currentHole.cup.x;
    const dy = ball.y - currentHole.cup.y;
    const dist = Math.hypot(dx, dy);
    const slowEnough = magnitude(velocityRef.current) < 26 && ballHeight < 0.35;
    if (dist < CUP_RADIUS_WORLD + BALL_RADIUS_WORLD * 0.7 && slowEnough) {
      setSunk(true);
      velocityRef.current = { x: 0, y: 0 };
      setBall(currentHole.cup);
      ballRef.current = currentHole.cup;
      setScores((prev) => {
        const next = [...prev];
        next[holeIndex] = strokesCurrent;
        return next;
      });
    }
  }, [ball, ballHeight, currentHole.cup.x, currentHole.cup.y, holeIndex, strokesCurrent, sunk]);

  const totalScore = scores.reduce((sum, s) => (typeof s === 'number' ? sum + s : sum), 0);
  const completed = scores.filter((s) => s != null).length;

  const setAimFromTouch = (pageX, pageY) => {
    const frame = courseFrameRef.current;
    if (frame.width <= 0 || frame.height <= 0) {
      return;
    }
    const localX = clamp(pageX - frame.x, 0, frame.width);
    const localY = clamp(pageY - frame.y, 0, frame.height);
    const target = toWorld({ x: localX, y: localY });
    const dir = { x: target.x - ballRef.current.x, y: target.y - ballRef.current.y };
    if (magnitude(dir) < 0.2) {
      return;
    }
    setAimAngle(Math.atan2(dir.y, dir.x));
  };

  const isTouchInsideCourse = (evt) => {
    const frame = courseFrameRef.current;
    if (frame.width <= 0 || frame.height <= 0) {
      return false;
    }
    const { pageX, pageY } = evt.nativeEvent;
    return (
      pageX >= frame.x &&
      pageX <= frame.x + frame.width &&
      pageY >= frame.y &&
      pageY <= frame.y + frame.height
    );
  };

  const getTouchesCentroid = (nativeEvent) => {
    const touches = nativeEvent.touches;
    if (!touches || touches.length < 2) return null;
    return {
      x: (touches[0].pageX + touches[1].pageX) / 2,
      y: (touches[0].pageY + touches[1].pageY) / 2
    };
  };

  const aimResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          if (sunk || swingActive || ballMoving) {
            return false;
          }
          return true;
        },
        onStartShouldSetPanResponderCapture: (evt) => isTouchInsideCourse(evt),
        onPanResponderGrant: (evt) => {
          syncCourseFrame();
          if (!isTouchInsideCourse(evt)) {
            return;
          }
          const centroid = getTouchesCentroid(evt.nativeEvent);
          if (centroid) {
            isTwoFingerPanningRef.current = true;
            panCentroidRef.current = centroid;
            setIsAiming(false);
            return;
          }
          isTwoFingerPanningRef.current = false;
          setIsAiming(true);
          setAimFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        },
        onMoveShouldSetPanResponder: () => false,
        onPanResponderMove: (evt) => {
          const centroid = getTouchesCentroid(evt.nativeEvent);
          if (centroid) {
            isTwoFingerPanningRef.current = true;
            const prev = panCentroidRef.current;
            if (prev) {
              const dx = centroid.x - prev.x;
              const dy = centroid.y - prev.y;
              if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
                setCamera((c) => clampCamera({ x: c.x - dx / pixelsPerWorld, y: c.y - dy / pixelsPerWorld }));
              }
            }
            panCentroidRef.current = centroid;
            setIsAiming(false);
            return;
          }
          panCentroidRef.current = null;
          if (isTwoFingerPanningRef.current) {
            setIsAiming(false);
            return;
          }
          if (!isTouchInsideCourse(evt)) {
            return;
          }
          setAimFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        },
        onPanResponderRelease: () => {
          setIsAiming(false);
          if (isTwoFingerPanningRef.current) {
            manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
          }
          isTwoFingerPanningRef.current = false;
          panCentroidRef.current = null;
        },
        onPanResponderTerminate: () => {
          setIsAiming(false);
          if (isTwoFingerPanningRef.current) {
            manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
          }
          isTwoFingerPanningRef.current = false;
          panCentroidRef.current = null;
        }
      }),
    [ballMoving, pixelsPerWorld, sunk, swingActive]
  );

  const fireSwingShot = ({ releaseDx, releaseDy, releaseTs }) => {
    const track = swingTrackRef.current;
    const pull = clamp(track.maxPullDown, 0, MAX_PULL_DISTANCE);
    const shotPower = Math.round((pull / MAX_PULL_DISTANCE) * 125);
    const overswingPct = Math.max(0, shotPower - 100);
    const overswingRatio = overswingPct / 25;
    const tempo = getTempoFeedback(track, releaseTs);

    const upTravel = Math.max(1, track.deepest.y - releaseDy);
    const xTravel = releaseDx - track.deepest.x;
    const slope = Math.abs(xTravel) / upTravel;
    const lateral = Math.max(track.maxPullLateral, track.maxUpLateral, Math.abs(releaseDx));
    const crookedNorm = clamp(slope * 1.35 + lateral / 24, 0, 1.4);

    const rawSign = Math.sign(releaseDx || xTravel || track.deepest.x || 1);
    const tempoMiss = (1 - tempo.accuracy) * 24;
    const errorDeg = crookedNorm * (4.5 + overswingRatio * 16) + tempoMiss;
    const finalAngle = aimAngle + degToRad(errorDeg * rawSign);

    const direction = { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };
    const speed = speedFromPower(shotPower, selectedClub, tempo);
    const launchRatio = clamp(shotPower / 125, 0, 1);
    const horizSpeed = speed * (0.62 - selectedClub.launch * 0.04 + selectedClub.roll * 0.05);
    const clubLaunchBoost = selectedClub.key === 'PT'
      ? 1
      : 1.35 + selectedClub.launch * 0.95;
    velocityRef.current = {
      x: direction.x * horizSpeed,
      y: direction.y * horizSpeed
    };
    flightRef.current = {
      z: 0.08,
      vz: selectedClub.key === 'PT'
        ? 0.35 + launchRatio * 1.25
        : (8.5 + launchRatio * 34 + overswingRatio * 6.5) * selectedClub.launch * tempo.launch * clubLaunchBoost
    };
    setBallHeight(flightRef.current.z);
    setTempoLabel(tempo.note);
    setStrokesCurrent((s) => s + 1);

    if (errorDeg > 11) {
      setLastShotNote(`${selectedClub.name}: ${tempo.note} cadence added ${errorDeg.toFixed(1)}° miss.`);
    } else if (overswingPct > 0) {
      setLastShotNote(`${selectedClub.short} ${shotPower}% overswing. Tempo: ${tempo.note}.`);
    } else {
      setLastShotNote(`${selectedClub.name} at ${shotPower}% power. Tempo: ${tempo.note}.`);
    }
  };

  const swingResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (sunk || ballMoving) {
            return false;
          }
          return true;
        },
        onStartShouldSetPanResponderCapture: () => {
          if (sunk || ballMoving) {
            return false;
          }
          return true;
        },
        onPanResponderGrant: (evt) => {
          const dx = evt.nativeEvent.locationX - PAD_CENTER;
          const dy = evt.nativeEvent.locationY - PAD_CENTER;
          const dist = Math.hypot(dx, dy);
          if (dist > SWING_START_RADIUS) {
            swingTrackRef.current.active = false;
            setSwingActive(false);
            setPullDistance(0);
            setPowerPct(0);
            setLastShotNote('Start the swing closer to pad center.');
            return;
          }

          const now = Date.now();
          swingTrackRef.current = {
            active: true,
            armed: false,
            maxPullDown: 0,
            maxPullLateral: 0,
            deepest: { x: 0, y: 0 },
            crossedCenter: false,
            maxUpLateral: 0,
            startTs: now,
            lastMoveTs: now,
            lastPullTs: now,
            maxPauseMs: 0,
            deepestTs: now,
            crossedTs: 0
          };
          setSwingActive(true);
          setPullDistance(0);
          setPowerPct(0);
          setTempoLabel('Build tempo...');
          setWaterNotice(false);
        },
        onMoveShouldSetPanResponder: () => swingTrackRef.current.active,
        onMoveShouldSetPanResponderCapture: () => swingTrackRef.current.active,
        onPanResponderMove: (evt) => {
          const track = swingTrackRef.current;
          if (!track.active) {
            return;
          }

          const now = Date.now();
          const dx = evt.nativeEvent.locationX - PAD_CENTER;
          const dy = evt.nativeEvent.locationY - PAD_CENTER;

          if (dy > track.maxPullDown) {
            track.maxPauseMs = Math.max(track.maxPauseMs, now - track.lastPullTs);
            track.maxPullDown = dy;
            track.deepest = { x: dx, y: dy };
            track.lastPullTs = now;
            track.deepestTs = now;
          }

          track.lastMoveTs = now;
          track.maxPullLateral = Math.max(track.maxPullLateral, Math.abs(dx));

          if (track.maxPullDown >= MIN_PULL_TO_ARM) {
            track.armed = true;
          }

          if (track.armed && dy < track.maxPullDown - 2) {
            track.maxUpLateral = Math.max(track.maxUpLateral, Math.abs(dx));
          }

          if (track.armed && dy < -6) {
            track.crossedCenter = true;
            if (!track.crossedTs) {
              track.crossedTs = now;
            }
          }

          const clampedPull = clamp(track.maxPullDown, 0, MAX_PULL_DISTANCE);
          setPullDistance(clampedPull);
          setPowerPct(Math.round((clampedPull / MAX_PULL_DISTANCE) * 125));

          const tempoPreview = getTempoFeedback(track, now);
          setTempoLabel(tempoPreview.note);
        },
        onPanResponderRelease: (evt) => {
          const track = swingTrackRef.current;
          const releaseDx = evt.nativeEvent.locationX - PAD_CENTER;
          const releaseDy = evt.nativeEvent.locationY - PAD_CENTER;

          if (!track.armed) {
            setLastShotNote('Pull farther down to load power.');
          } else if (!track.crossedCenter) {
            setLastShotNote('Flick up through center to strike the ball.');
          } else {
            fireSwingShot({ releaseDx, releaseDy, releaseTs: Date.now() });
          }

          swingTrackRef.current = {
            active: false,
            armed: false,
            maxPullDown: 0,
            maxPullLateral: 0,
            deepest: { x: 0, y: 0 },
            crossedCenter: false,
            maxUpLateral: 0,
            startTs: 0,
            lastMoveTs: 0,
            lastPullTs: 0,
            maxPauseMs: 0,
            deepestTs: 0,
            crossedTs: 0
          };
          setSwingActive(false);
          setPullDistance(0);
          setPowerPct(0);
        },
        onPanResponderTerminate: () => {
          swingTrackRef.current = {
            active: false,
            armed: false,
            maxPullDown: 0,
            maxPullLateral: 0,
            deepest: { x: 0, y: 0 },
            crossedCenter: false,
            maxUpLateral: 0,
            startTs: 0,
            lastMoveTs: 0,
            lastPullTs: 0,
            maxPauseMs: 0,
            deepestTs: 0,
            crossedTs: 0
          };
          setSwingActive(false);
          setPullDistance(0);
          setPowerPct(0);
          setTempoLabel('Tempo idle');
        }
      }),
    [aimAngle, ballMoving, selectedClub, sunk]
  );

  const screenBall = toScreen(ball);
  const screenCup = toScreen(currentHole.cup);
  const liftPx = clamp(ballHeight * pixelsPerWorld * 1.55, 0, 54);
  const airborneRatio = clamp(ballHeight / 18, 0, 1);
  const ballVisualScale = 1 - airborneRatio * 0.12;
  const shadowScale = 1 + airborneRatio * 0.5;
  const shadowOpacity = 0.28 - airborneRatio * 0.18;

  const finishedAll = scores.every((s) => typeof s === 'number');
  const isLastHole = holeIndex === HOLES.length - 1;
  const overSwing = powerPct > 100;
  const previewTempo = swingActive ? getTempoFeedback(swingTrackRef.current) : { speed: 1, launch: 1, accuracy: 1, note: 'Tempo idle' };
  const previewDots = PREVIEW_POWERS.map((power) => {
    const distanceWorld = estimateStraightDistance(power, selectedClub, previewTempo);
    const size = clamp(pixelsPerWorld * (1.25 + power / 140), 2.4, 4.8);
    return {
      power,
      size,
      x: screenBall.x + Math.cos(aimAngle) * distanceWorld * pixelsPerWorld,
      y: screenBall.y + Math.sin(aimAngle) * distanceWorld * pixelsPerWorld
    };
  });

  const aimDir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
  const aimPerp = { x: -aimDir.y, y: aimDir.x };
  const golferAnchorWorld = {
    x: clamp(golferBallAnchor.x - 8.1 + aimPerp.x * 0.6, 2.5, WORLD.w - 2.5),
    y: clamp(golferBallAnchor.y - aimDir.y * 1.6 + aimPerp.y * 0.6, 2.5, WORLD.h - 2.5)
  };
  const golferAnchor = toScreen(golferAnchorWorld);
  const golferPixelSize = clamp(pixelsPerWorld * 0.62, 1.55, 2.5);
  const golferWidth = GOLFER_SPRITE_ROWS[0].length * golferPixelSize;
  const golferHeight = GOLFER_SPRITE_ROWS.length * golferPixelSize;
  const golferAngle = (aimAngle * 180) / Math.PI + 90;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.menuWrap}>
            <Pressable style={styles.menuButton} onPress={() => setMenuOpen((v) => !v)}>
              <Text style={styles.menuIcon}>☰</Text>
            </Pressable>
            {menuOpen ? (
              <View style={styles.menuPanel}>
                <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); retryHole(); }}>
                  <Text style={styles.menuItemText}>Retry Hole</Text>
                </Pressable>
                <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); resetBall({ penaltyStroke: true }); }}>
                  <Text style={styles.menuItemText}>Quick Reset</Text>
                </Pressable>
                <Pressable
                  style={[styles.menuItem, holeIndex === 0 && styles.disabled]}
                  disabled={holeIndex === 0}
                  onPress={() => {
                    setMenuOpen(false);
                    setHoleIndex((h) => Math.max(0, h - 1));
                  }}
                >
                  <Text style={styles.menuItemText}>Prev Hole</Text>
                </Pressable>
                <Pressable
                  style={[styles.menuItem, !sunk && styles.disabled]}
                  disabled={!sunk}
                  onPress={() => {
                    setMenuOpen(false);
                    if (!isLastHole) {
                      setHoleIndex((h) => h + 1);
                    }
                  }}
                >
                  <Text style={styles.menuItemText}>{isLastHole ? 'Round Done' : 'Next Hole'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.headerPill}>
            <Text style={styles.meta}>
              Hole {holeIndex + 1}/{HOLES.length} • {currentHole.name} • Par {currentHole.par}
            </Text>
            <Text style={styles.meta}>Strokes: {strokesCurrent} • Total: {totalScore}</Text>
          </View>
        </View>
      </View>

      <View
        ref={courseRef}
        onLayout={syncCourseFrame}
        style={[styles.course, { width: viewWidth, height: viewHeight }]}
        {...aimResponder.panHandlers}
      >
        {currentHole.terrain?.fairway?.map((f, i) => (
          <View
            key={`fair-${i}`}
            style={[
              styles.fairway,
              {
                left: f.x * scaleX,
                top: f.y * scaleY,
                width: f.w * scaleX,
                height: f.h * scaleY,
                borderRadius: (f.r || 8) * scaleX
              }
            ]}
          />
        ))}

        {currentHole.terrain?.green ? (
          <>
            <View
              style={[
                styles.fringe,
                {
                  left: (currentHole.terrain.green.x - FRINGE_BUFFER) * scaleX,
                  top: (currentHole.terrain.green.y - FRINGE_BUFFER) * scaleY,
                  width: (currentHole.terrain.green.w + FRINGE_BUFFER * 2) * scaleX,
                  height: (currentHole.terrain.green.h + FRINGE_BUFFER * 2) * scaleY,
                  borderRadius: (currentHole.terrain.green.r + FRINGE_BUFFER) * scaleX
                }
              ]}
            />
            <View
              style={[
                styles.green,
                {
                  left: currentHole.terrain.green.x * scaleX,
                  top: currentHole.terrain.green.y * scaleY,
                  width: currentHole.terrain.green.w * scaleX,
                  height: currentHole.terrain.green.h * scaleY,
                  borderRadius: currentHole.terrain.green.r * scaleX
                }
              ]}
            />
          </>
        ) : null}

        {currentHole.terrain?.tee ? (
          <View
            style={[
              styles.tee,
              {
                left: currentHole.terrain.tee.x * scaleX,
                top: currentHole.terrain.tee.y * scaleY,
                width: currentHole.terrain.tee.w * scaleX,
                height: currentHole.terrain.tee.h * scaleY,
                borderRadius: currentHole.terrain.tee.r * scaleX
              }
            ]}
          />
        ) : null}

        {currentHole.hazards.map((h, i) => {
          const common = {
            left: h.x * scaleX,
            top: h.y * scaleY,
            width: h.w * scaleX,
            height: h.h * scaleY
          };

          if (h.type === 'sandRect') {
            return <View key={`haz-${i}`} style={[styles.sand, common]} />;
          }

          if (h.type === 'waterRect') {
            return <View key={`haz-${i}`} style={[styles.water, common]} />;
          }

          return null;
        })}

        {currentHole.obstacles.map((o, i) => {
          if (o.type === 'rect') {
            return (
              <View
                key={`obs-${i}`}
                style={[
                  styles.wall,
                  {
                    left: o.x * scaleX,
                    top: o.y * scaleY,
                    width: o.w * scaleX,
                    height: o.h * scaleY
                  }
                ]}
              />
            );
          }

          if (o.type === 'circle') {
            const size = o.r * scaleX * 2;
            return (
              <View
                key={`obs-${i}`}
                style={[
                  o.look === 'tree' ? styles.tree : styles.bumper,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    left: (o.x - o.r) * scaleX,
                    top: (o.y - o.r) * scaleY
                  }
                ]}
              >
                {o.look === 'tree' ? <View style={styles.treeCore} /> : null}
              </View>
            );
          }

          return null;
        })}

        <View
          style={[
            styles.flagPole,
            {
              left: screenCup.x - 1,
              top: screenCup.y - 18 * pixelsPerWorld,
              height: 17 * pixelsPerWorld
            }
          ]}
        />
        <View
          style={[
            styles.flag,
            {
              left: screenCup.x,
              top: screenCup.y - 18 * pixelsPerWorld,
              borderTopWidth: 4 * pixelsPerWorld,
              borderBottomWidth: 4 * pixelsPerWorld,
              borderRightWidth: 9 * pixelsPerWorld
            }
          ]}
        />

        <View
          style={[
            styles.cup,
            {
              width: cupRadius * 2,
              height: cupRadius * 2,
              borderRadius: cupRadius,
              left: screenCup.x - cupRadius,
              top: screenCup.y - cupRadius
            }
          ]}
        />

        {previewDots.map((dot) => (
          <View
            key={`preview-${dot.power}`}
            style={[
              styles.previewDot,
              {
                width: dot.size,
                height: dot.size,
                borderRadius: dot.size / 2,
                left: dot.x - dot.size / 2,
                top: dot.y - dot.size / 2,
                opacity: 0.42 + dot.power / 250
              }
            ]}
          />
        ))}

        <View
          pointerEvents="none"
          style={[
            styles.golferWrap,
            {
              width: golferWidth,
              height: golferHeight,
              left: golferAnchor.x - golferWidth / 2,
              top: golferAnchor.y - golferHeight / 2,
              transform: [{ rotate: `${golferAngle}deg` }]
            }
          ]}
        >
          {GOLFER_PIXELS.map((pixel, i) => (
            <View
              key={`golfer-px-${i}`}
              style={[
                styles.golferPixel,
                {
                  width: golferPixelSize,
                  height: golferPixelSize,
                  left: pixel.x * golferPixelSize,
                  top: pixel.y * golferPixelSize,
                  backgroundColor: pixel.color
                }
              ]}
            />
          ))}
        </View>

        <View
          style={[
            styles.ballShadow,
            {
              width: ballRadius * 2.05,
              height: ballRadius * 1.15,
              borderRadius: ballRadius,
              left: screenBall.x - ballRadius * 1.02,
              top: screenBall.y - ballRadius * 0.46,
              opacity: Math.max(0.08, shadowOpacity),
              transform: [{ scaleX: shadowScale }, { scaleY: shadowScale * 0.96 }]
            }
          ]}
        />

        <View
          style={[
            styles.ball,
            {
              width: ballRadius * 2,
              height: ballRadius * 2,
              borderRadius: ballRadius,
              left: screenBall.x - ballRadius,
              top: screenBall.y - ballRadius - liftPx,
              transform: [{ scale: ballVisualScale }]
            }
          ]}
        />
      </View>

      <View style={styles.footer} pointerEvents="box-none">
        <View style={styles.footerPanel}>
        <Text style={styles.tip}>
          {isAiming
            ? 'Adjusting aim...'
            : 'Aim: tap or press-and-drag anywhere on course. Swing: pull down with tempo, then flick up through center.'}
        </Text>

        <View style={styles.clubPanel}>
          <View style={styles.clubHeaderRow}>
            <Text style={styles.clubTitle}>Club</Text>
            <Text style={styles.clubMeta}>{selectedClub.name} • {tempoLabel}</Text>
          </View>
          <View style={styles.clubGrid}>
            {CLUBS.map((club, index) => (
              <Pressable
                key={club.key}
                style={[styles.clubChip, index === selectedClubIndex && styles.clubChipActive]}
                onPress={() => setSelectedClubIndex(index)}
              >
                <Text style={[styles.clubChipText, index === selectedClubIndex && styles.clubChipTextActive]}>
                  {club.short}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.controlsRow}>
          <View style={styles.swingArea}>
            <View style={[styles.swingPad, swingActive && styles.swingPadActive]} {...swingResponder.panHandlers}>
              <View style={styles.padRing}>
                <View style={styles.padCenter} />
              </View>
              <View
                style={[
                  styles.pullMarker,
                  {
                    top: PAD_CENTER + pullDistance - 7,
                    backgroundColor: overSwing ? '#bc3b2f' : '#f0ead3'
                  }
                ]}
              />
            </View>
          </View>

          <View style={styles.powerMeterWrap}>
            <Text style={styles.powerLabel}>{selectedClub.short} • {powerPct}%</Text>
            <View style={styles.powerMeterTrack}>
              <View style={[styles.powerMeterSafe, { height: `${(100 / 125) * 100}%` }]} />
              <View style={[styles.powerMeterFill, { height: `${(powerPct / 125) * 100}%` }]} />
              <View style={styles.powerMeterCut} />
            </View>
            <Text style={[styles.powerHint, overSwing && styles.overSwingText]}>
              {overSwing ? 'Over-swing zone' : tempoLabel}
            </Text>
          </View>
        </View>

        <Text style={styles.tip}>{lastShotNote}</Text>

        {waterNotice && !sunk ? <Text style={styles.warning}>Water hazard: +1 stroke, ball reset.</Text> : null}

        {sunk ? <Text style={styles.success}>Hole complete in {strokesCurrent} strokes.</Text> : null}


        {finishedAll ? (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Round Complete</Text>
            <Text style={styles.summaryText}>Played holes: {completed}</Text>
            <Text style={styles.summaryText}>Final strokes: {totalScore}</Text>
          </View>
        ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#3a5c30'
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 60,
    paddingTop: 12,
    paddingHorizontal: 12,
    elevation: 20
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  menuWrap: {
    position: 'relative',
    zIndex: 80,
    elevation: 30
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(21, 31, 24, 0.82)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuIcon: {
    color: '#f7fbf4',
    fontSize: 21,
    fontWeight: '700'
  },
  menuPanel: {
    position: 'absolute',
    top: 48,
    left: 0,
    width: 150,
    borderRadius: 14,
    backgroundColor: 'rgba(21, 31, 24, 0.92)',
    padding: 6,
    gap: 4
  },
  menuItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  menuItemText: {
    color: '#f7fbf4',
    fontWeight: '700',
    fontSize: 13
  },
  headerPill: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(21, 31, 24, 0.68)',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  meta: {
    fontSize: 13,
    color: '#f2f7ee',
    marginTop: 2
  },
  course: {
    backgroundColor: '#3a5c30',
    overflow: 'hidden',
    position: 'relative'
  },
  tee: {
    position: 'absolute',
    backgroundColor: '#4d9955',
    borderWidth: 1,
    borderColor: '#31683a'
  },
  fairway: {
    position: 'absolute',
    backgroundColor: '#9ccc78'
  },
  green: {
    position: 'absolute',
    backgroundColor: '#a9d88a',
    borderWidth: 1,
    borderColor: '#6f9c53'
  },
  fringe: {
    position: 'absolute',
    backgroundColor: '#8ebe71'
  },
  wall: {
    position: 'absolute',
    backgroundColor: '#4f3f2f',
    borderRadius: 5
  },
  bumper: {
    position: 'absolute',
    backgroundColor: '#635344'
  },
  tree: {
    position: 'absolute',
    backgroundColor: '#3f723d',
    alignItems: 'center',
    justifyContent: 'center'
  },
  treeCore: {
    width: '45%',
    height: '45%',
    borderRadius: 999,
    backgroundColor: '#2e562e'
  },
  sand: {
    position: 'absolute',
    backgroundColor: '#dcc784',
    borderRadius: 16
  },
  water: {
    position: 'absolute',
    backgroundColor: '#4fa0d8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2f6b94'
  },
  flagPole: {
    position: 'absolute',
    width: 2,
    backgroundColor: '#dce6cf'
  },
  flag: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#f15b4f'
  },
  cup: {
    position: 'absolute',
    backgroundColor: '#16220f',
    borderWidth: 2,
    borderColor: '#0a1307'
  },
  ball: {
    position: 'absolute',
    backgroundColor: '#f7f7f4',
    borderWidth: 1,
    borderColor: '#cfd5ca'
  },
  ballShadow: {
    position: 'absolute',
    backgroundColor: '#1d2e1a'
  },
  previewDot: {
    position: 'absolute',
    backgroundColor: '#eef2d6',
    borderWidth: 1,
    borderColor: '#cedab5'
  },
  golferWrap: {
    position: 'absolute'
  },
  golferPixel: {
    position: 'absolute'
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 22
  },
  footerPanel: {
    gap: 7,
    backgroundColor: 'rgba(14, 22, 14, 0.82)',
    borderRadius: 18,
    padding: 12
  },
  clubPanel: {
    gap: 6
  },
  clubHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8
  },
  clubTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#d4e8cc'
  },
  clubMeta: {
    flex: 1,
    textAlign: 'right',
    fontSize: 11,
    color: '#9dc490'
  },
  clubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  clubChip: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center'
  },
  clubChipActive: {
    backgroundColor: '#2e5f34',
    borderColor: '#2e5f34'
  },
  clubChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#c5dcc0'
  },
  clubChipTextActive: {
    color: '#f6fbf4'
  },
  tip: {
    fontSize: 13,
    color: '#c8dfc0'
  },
  warning: {
    fontSize: 13,
    color: '#933e2d',
    fontWeight: '700'
  },
  success: {
    fontSize: 13,
    color: '#1c5d22',
    fontWeight: '700'
  },
  row: {
    flexDirection: 'row',
    gap: 10
  },
  button: {
    flex: 1,
    backgroundColor: '#2e5f34',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center'
  },
  ghost: {
    backgroundColor: '#476d4c'
  },
  buttonText: {
    color: '#f8fbf3',
    fontWeight: '700'
  },
  disabled: {
    opacity: 0.45
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  powerLabel: {
    fontSize: 12,
    color: '#d4e8cc',
    fontWeight: '700',
    textAlign: 'center'
  },
  powerHint: {
    fontSize: 11,
    color: '#9dc490',
    fontWeight: '700',
    textAlign: 'center'
  },
  overSwingText: {
    color: '#9e352b'
  },
  powerMeterWrap: {
    width: 92,
    alignItems: 'center',
    gap: 4
  },
  powerMeterTrack: {
    width: 30,
    height: SWING_PAD_SIZE + 6,
    borderRadius: 18,
    backgroundColor: '#d9e4d0',
    overflow: 'hidden',
    position: 'relative'
  },
  powerMeterSafe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#afd58f'
  },
  powerMeterFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#3f8f4c'
  },
  powerMeterCut: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: `${(100 / 125) * 100}%`,
    height: 2,
    backgroundColor: '#9e352b'
  },
  swingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2
  },
  swingPad: {
    width: SWING_PAD_SIZE,
    height: SWING_PAD_SIZE,
    borderRadius: SWING_PAD_SIZE / 2,
    backgroundColor: '#314432',
    borderWidth: 2,
    borderColor: '#516f55',
    alignItems: 'center',
    justifyContent: 'center'
  },
  swingPadActive: {
    borderColor: '#9fd273'
  },
  padRing: {
    width: 64,
    height: 64,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#d9e4cf',
    alignItems: 'center',
    justifyContent: 'center'
  },
  padCenter: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#f4f6f2'
  },
  pullMarker: {
    position: 'absolute',
    left: PAD_CENTER - 7,
    width: 14,
    height: 14,
    borderRadius: 999
  },
  summary: {
    marginTop: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#dce9d2'
  },
  summaryTitle: {
    fontWeight: '800',
    color: '#1d321f'
  },
  summaryText: {
    color: '#2f4730'
  }
});
