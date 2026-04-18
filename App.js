import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

// All holes are centered in a 700x700 region of the world starting at offset (170, 200)
// This gives ~170 units of rough on left/right and ~200+ units top/bottom
const H_OFF_X = 170;
const H_OFF_Y = 200;
const HOLES = [
  {
    id: 1,
    name: 'Pine Meadow',
    par: 4,
    ballStart: { x: H_OFF_X + 100, y: H_OFF_Y + 296 },
    cup: { x: H_OFF_X + 156, y: H_OFF_Y + 36 },
    terrain: {
      tee: { x: H_OFF_X + 86, y: H_OFF_Y + 288, w: 28, h: 20, r: 8 },
      fairway: [
        { x: H_OFF_X + 78, y: H_OFF_Y + 204, w: 44, h: 100, r: 24 },
        { x: H_OFF_X + 86, y: H_OFF_Y + 124, w: 60, h: 104, r: 28 },
        { x: H_OFF_X + 116, y: H_OFF_Y + 56, w: 48, h: 84, r: 24 }
      ],
      green: { x: H_OFF_X + 134, y: H_OFF_Y + 14, w: 48, h: 52, r: 26 }
    },
    obstacles: [
      { type: 'circle', x: H_OFF_X + 54, y: H_OFF_Y + 216, r: 10, look: 'tree' },
      { type: 'circle', x: H_OFF_X + 144, y: H_OFF_Y + 190, r: 10, look: 'tree' },
      { type: 'circle', x: H_OFF_X + 60, y: H_OFF_Y + 130, r: 12, look: 'tree' }
    ],
    hazards: [
      { type: 'sandRect', x: H_OFF_X + 122, y: H_OFF_Y + 34, w: 20, h: 16 },
      { type: 'sandRect', x: H_OFF_X + 168, y: H_OFF_Y + 40, w: 20, h: 16 }
    ]
  },
  {
    id: 2,
    name: 'Split Gate',
    par: 3,
    ballStart: { x: H_OFF_X + 100, y: H_OFF_Y + 300 },
    cup: { x: H_OFF_X + 164, y: H_OFF_Y + 36 },
    terrain: {
      tee: { x: H_OFF_X + 88, y: H_OFF_Y + 292, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 84, y: H_OFF_Y + 208, w: 36, h: 100, r: 20 },
        { x: H_OFF_X + 120, y: H_OFF_Y + 60, w: 52, h: 160, r: 28 }
      ],
      green: { x: H_OFF_X + 140, y: H_OFF_Y + 12, w: 52, h: 52, r: 26 }
    },
    obstacles: [
      { type: 'rect', x: H_OFF_X + 40, y: H_OFF_Y + 184, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 112, w: 116, h: 16 }
    ],
    hazards: [{ type: 'sandRect', x: H_OFF_X + 124, y: H_OFF_Y + 104, w: 60, h: 36 }]
  },
  {
    id: 3,
    name: 'Dogleg Drift',
    par: 4,
    ballStart: { x: H_OFF_X + 32, y: H_OFF_Y + 296 },
    cup: { x: H_OFF_X + 168, y: H_OFF_Y + 44 },
    terrain: {
      tee: { x: H_OFF_X + 20, y: H_OFF_Y + 288, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 16, y: H_OFF_Y + 220, w: 40, h: 88, r: 20 },
        { x: H_OFF_X + 28, y: H_OFF_Y + 136, w: 84, h: 100, r: 28 },
        { x: H_OFF_X + 112, y: H_OFF_Y + 60, w: 60, h: 96, r: 24 }
      ],
      green: { x: H_OFF_X + 144, y: H_OFF_Y + 20, w: 52, h: 52, r: 26 }
    },
    obstacles: [
      { type: 'rect', x: H_OFF_X + 48, y: H_OFF_Y + 220, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 32, y: H_OFF_Y + 128, w: 116, h: 16 },
      { type: 'circle', x: H_OFF_X + 144, y: H_OFF_Y + 184, r: 16 }
    ],
    hazards: [
      { type: 'waterRect', x: H_OFF_X + 0, y: H_OFF_Y + 172, w: 48, h: 36 },
      { type: 'sandRect', x: H_OFF_X + 116, y: H_OFF_Y + 96, w: 68, h: 32 }
    ]
  },
  {
    id: 4,
    name: 'Bumper Tunnel',
    par: 4,
    ballStart: { x: H_OFF_X + 24, y: H_OFF_Y + 300 },
    cup: { x: H_OFF_X + 176, y: H_OFF_Y + 28 },
    terrain: {
      tee: { x: H_OFF_X + 12, y: H_OFF_Y + 292, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 8, y: H_OFF_Y + 228, w: 40, h: 80, r: 20 },
        { x: H_OFF_X + 40, y: H_OFF_Y + 156, w: 72, h: 88, r: 28 },
        { x: H_OFF_X + 120, y: H_OFF_Y + 44, w: 60, h: 112, r: 24 }
      ],
      green: { x: H_OFF_X + 152, y: H_OFF_Y + 4, w: 48, h: 48, r: 24 }
    },
    obstacles: [
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 212, w: 144, h: 16 },
      { type: 'rect', x: H_OFF_X + 56, y: H_OFF_Y + 140, w: 144, h: 16 },
      { type: 'circle', x: H_OFF_X + 76, y: H_OFF_Y + 92, r: 16 },
      { type: 'circle', x: H_OFF_X + 120, y: H_OFF_Y + 64, r: 14 }
    ],
    hazards: [
      { type: 'sandRect', x: H_OFF_X + 20, y: H_OFF_Y + 52, w: 48, h: 28 },
      { type: 'waterRect', x: H_OFF_X + 144, y: H_OFF_Y + 192, w: 56, h: 40 }
    ]
  },
  {
    id: 5,
    name: 'Mini Maze',
    par: 5,
    ballStart: { x: H_OFF_X + 16, y: H_OFF_Y + 296 },
    cup: { x: H_OFF_X + 184, y: H_OFF_Y + 20 },
    terrain: {
      tee: { x: H_OFF_X + 4, y: H_OFF_Y + 288, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 8, y: H_OFF_Y + 260, w: 32, h: 44, r: 16 },
        { x: H_OFF_X + 0, y: H_OFF_Y + 192, w: 36, h: 80, r: 20 },
        { x: H_OFF_X + 28, y: H_OFF_Y + 132, w: 56, h: 72, r: 24 },
        { x: H_OFF_X + 80, y: H_OFF_Y + 72, w: 60, h: 76, r: 24 },
        { x: H_OFF_X + 132, y: H_OFF_Y + 28, w: 56, h: 64, r: 24 }
      ],
      green: { x: H_OFF_X + 160, y: H_OFF_Y + 0, w: 48, h: 48, r: 24 }
    },
    obstacles: [
      { type: 'rect', x: H_OFF_X + 32, y: H_OFF_Y + 252, w: 128, h: 16 },
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 192, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 80, y: H_OFF_Y + 132, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 72, w: 128, h: 16 },
      { type: 'circle', x: H_OFF_X + 152, y: H_OFF_Y + 108, r: 14 },
      { type: 'circle', x: H_OFF_X + 52, y: H_OFF_Y + 36, r: 14 }
    ],
    hazards: [
      { type: 'waterRect', x: H_OFF_X + 128, y: H_OFF_Y + 224, w: 72, h: 32 },
      { type: 'waterRect', x: H_OFF_X + 0, y: H_OFF_Y + 96, w: 52, h: 28 },
      { type: 'sandRect', x: H_OFF_X + 140, y: H_OFF_Y + 44, w: 40, h: 28 }
    ]
  }
];

const WORLD = { w: 1040, h: 1100 };
const CAMERA_ZOOM = 3.2;
const IS_WEB = Platform.OS === 'web';
const MANUAL_PAN_GRACE_MS = 2200;
const BALL_RADIUS_WORLD = 2.4;
const CUP_RADIUS_WORLD = 4.0;
const SHOT_PAD_SIZE = 184;
const PAD_CENTER = SHOT_PAD_SIZE / 2;
const SHOT_PAD_RADIUS = 78;
const SPIN_DOT_RADIUS = 16;
const MAX_SPIN_OFFSET = SHOT_PAD_RADIUS - SPIN_DOT_RADIUS - 10;
const YARDS_PER_WORLD = 1.3;
const AIM_DOT_STEP_WORLD = 3.6;
const PREVIEW_FRICTION = 2.1;
const STOP_SPEED = 6;
const GRAVITY = 30;
const GROUND_EPSILON = 0.05;
const FRINGE_BUFFER = 8;
const MIN_BOUNCE_VZ = 3.2;
const CLUBS = [
  { key: 'PT', name: 'Putter', short: 'PT', speed: 0.16, launch: 0.03, roll: 0.95, spin: 1.22, carryYards: 20 },
  { key: 'LW', name: 'Lob Wedge', short: 'LW', speed: 0.44, launch: 1.18, roll: 0.52, spin: 0.82, carryYards: 70 },
  { key: 'SW', name: 'Sand Wedge', short: 'SW', speed: 0.5, launch: 1.08, roll: 0.56, spin: 0.85, carryYards: 80 },
  { key: 'GW', name: 'Gap Wedge', short: 'GW', speed: 0.56, launch: 0.98, roll: 0.6, spin: 0.9, carryYards: 90 },
  { key: 'PW', name: 'Pitching Wedge', short: 'PW', speed: 0.64, launch: 0.9, roll: 0.66, spin: 0.93, carryYards: 105 },
  { key: '9I', name: '9 Iron', short: '9i', speed: 0.72, launch: 0.82, roll: 0.72, spin: 0.97, carryYards: 120 },
  { key: '8I', name: '8 Iron', short: '8i', speed: 0.8, launch: 0.76, roll: 0.78, spin: 1, carryYards: 130 },
  { key: '7I', name: '7 Iron', short: '7i', speed: 0.88, launch: 0.7, roll: 0.84, spin: 1.02, carryYards: 140 },
  { key: '6I', name: '6 Iron', short: '6i', speed: 0.96, launch: 0.65, roll: 0.9, spin: 1.04, carryYards: 150 },
  { key: '5I', name: '5 Iron', short: '5i', speed: 1.04, launch: 0.6, roll: 0.96, spin: 1.06, carryYards: 160 },
  { key: '4I', name: '4 Iron', short: '4i', speed: 1.12, launch: 0.56, roll: 1.02, spin: 1.08, carryYards: 170 },
  { key: '3I', name: '3 Iron', short: '3i', speed: 1.18, launch: 0.52, roll: 1.06, spin: 1.1, carryYards: 180 },
  { key: '7W', name: '7 Wood', short: '7w', speed: 1.08, launch: 0.62, roll: 0.98, spin: 1, carryYards: 190 },
  { key: '5W', name: '5 Wood', short: '5w', speed: 1.18, launch: 0.57, roll: 1.04, spin: 0.98, carryYards: 210 },
  { key: '3W', name: '3 Wood', short: '3w', speed: 1.3, launch: 0.5, roll: 1.1, spin: 0.96, carryYards: 225 },
  { key: 'DR', name: 'Driver', short: 'DR', speed: 1.46, launch: 0.46, roll: 1.16, spin: 0.92, carryYards: 250 }
];

const SURFACE_PHYSICS = {
  rough: { rollFriction: 4.2, bounce: 0.18, landingDamping: 0.72, wallRestitution: 0.62, powerPenalty: 0.85, label: 'Rough', emoji: '🌿', color: '#3a6b2a' },
  deepRough: { rollFriction: 5.8, bounce: 0.12, landingDamping: 0.6, wallRestitution: 0.55, powerPenalty: 0.65, label: 'Deep Rough', emoji: '🌾', color: '#2d5420' },
  secondCut: { rollFriction: 3.8, bounce: 0.2, landingDamping: 0.76, wallRestitution: 0.63, powerPenalty: 0.9, label: 'Second Cut', emoji: '🌱', color: '#4a8535' },
  fairway: { rollFriction: 3.3, bounce: 0.24, landingDamping: 0.8, wallRestitution: 0.66, powerPenalty: 1.0, label: 'Fairway', emoji: '🏌️', color: '#5aad42' },
  fringe: { rollFriction: 3.8, bounce: 0.2, landingDamping: 0.76, wallRestitution: 0.64, powerPenalty: 0.95, label: 'Fringe', emoji: '🟢', color: '#4d9940' },
  sand: { rollFriction: 6.5, bounce: 0.1, landingDamping: 0.54, wallRestitution: 0.52, powerPenalty: 0.6, label: 'Bunker', emoji: '⛱️', color: '#d4b96a' },
  pluggedSand: { rollFriction: 8.0, bounce: 0.05, landingDamping: 0.4, wallRestitution: 0.4, powerPenalty: 0.4, label: 'Plugged Lie', emoji: '🥚', color: '#c9a84e' },
  green: { rollFriction: 2.6, bounce: 0.14, landingDamping: 0.82, wallRestitution: 0.68, powerPenalty: 1.0, label: 'Green', emoji: '⛳', color: '#3dba4a' },
  tee: { rollFriction: 3.0, bounce: 0.22, landingDamping: 0.85, wallRestitution: 0.7, powerPenalty: 1.05, label: 'Tee Box', emoji: '🏌️', color: '#5aad42' }
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
const WIND_DIRS = {
  N:  { x: 0, y: -1 },  S:  { x: 0, y: 1 },
  E:  { x: 1, y: 0 },   W:  { x: -1, y: 0 },
  NE: { x: 0.707, y: -0.707 }, NW: { x: -0.707, y: -0.707 },
  SE: { x: 0.707, y: 0.707 },  SW: { x: -0.707, y: 0.707 }
};
const WIND_ARROWS = { N: '↑', S: '↓', E: '→', W: '←', NE: '↗', NW: '↖', SE: '↘', SW: '↙' };
const WIND_PRESETS = [
  { speed: 25, dir: 'N' },
  { speed: 25, dir: 'NE' },
  { speed: 25, dir: 'W' },
  { speed: 25, dir: 'SW' },
  { speed: 25, dir: 'E' }
];
const WIND_FORCE_SCALE = 0.35;
const SHOT_SHAPE_HINTS = {
  PT: 'Low roll',
  LW: 'High soft',
  SW: 'High check',
  GW: 'Mid check',
  PW: 'Mid flight',
  '9I': 'Mid draw',
  '8I': 'Piercing',
  '7I': 'Piercing',
  '6I': 'Strong draw',
  '5I': 'Strong draw',
  '4I': 'Low runner',
  '3I': 'Stinger',
  '7W': 'High carry',
  '5W': 'Long carry',
  '3W': 'Penetrating',
  DR: 'Power fade'
};
const BUILD_VERSION = 'web v1.1.1';

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
const speedFromPower = (powerPct, club = CLUBS[0]) => {
  // Distance-calibrated: target carry in world units, then scale for drag/hang time
  const normalized = clamp(powerPct / 100, 0, 1.2);
  const targetWorldDist = (club.carryYards / YARDS_PER_WORLD) * normalized;
  // Need to overshoot initial speed to account for air drag reducing distance
  // At 0.14 drag coeff over ~1.2s, we lose about 8% to drag
  return targetWorldDist * 0.85;
};
const expandRect = (rect, inset) => ({
  x: rect.x - inset,
  y: rect.y - inset,
  w: rect.w + inset * 2,
  h: rect.h + inset * 2
});
const getSurfaceAtPoint = (hole, point) => {
  const inSand = hole.hazards?.some((h) => h.type === 'sandRect' && pointInRect(point, h));
  if (inSand) return 'sand';
  const terrain = hole.terrain;
  if (terrain?.tee && pointInRect(point, terrain.tee)) return 'tee';
  if (terrain?.green && pointInRect(point, terrain.green)) return 'green';
  if (terrain?.green && pointInRect(point, expandRect(terrain.green, FRINGE_BUFFER))) return 'fringe';
  if (terrain?.fairway?.some((f) => pointInRect(point, f))) return 'fairway';
  if (terrain?.fairway?.some((f) => pointInRect(point, expandRect(f, 12)))) return 'secondCut';
  const nearAnything = terrain?.fairway?.some((f) => pointInRect(point, expandRect(f, 30)));
  if (!nearAnything) return 'deepRough';
  return 'rough';
};
const estimateStraightDistance = (powerPct, club, strike = { launch: 1, spin: 1 }) => {
  const shotRatio = clamp(powerPct / 100, 0, 1.2);
  return (club.carryYards * shotRatio * strike.launch) / YARDS_PER_WORLD;
};

function useScreenSize() {
  const getSize = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return { width: window.innerWidth || 375, height: window.innerHeight || 667 };
    }
    const d = Dimensions.get('window');
    return { width: d.width || 375, height: d.height || 667 };
  };
  const [size, setSize] = useState(getSize);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handler = () => setSize({ width: window.innerWidth || 375, height: window.innerHeight || 667 });
      window.addEventListener('resize', handler);
      return () => window.removeEventListener('resize', handler);
    }
    const sub = Dimensions.addEventListener('change', ({ window: w }) => setSize({ width: w.width || 375, height: w.height || 667 }));
    return () => sub?.remove?.();
  }, []);
  return size;
}

export default function App() {
  const { width: screenWidth, height: screenHeight } = useScreenSize();
  const viewWidth = Math.max(screenWidth, 320);
  const viewHeight = Math.max(screenHeight, 568);
  const basePixelsPerWorld = Math.max(viewWidth / WORLD.w, viewHeight / WORLD.h);
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
  const [shotControlOpen, setShotControlOpen] = useState(false);
  const [spinOffset, setSpinOffset] = useState({ x: 0, y: 0 });
  const [powerPct, setPowerPct] = useState(0);
  const powerRef = useRef(0);
  const [swingPhase, setSwingPhase] = useState('idle'); // idle | backswing | forward
  const [swingDeviation, setSwingDeviation] = useState(0); // -1 to 1, how far off center on forward swing
  const swingStartRef = useRef({ x: 0, y: 0 });
  const swingLowestRef = useRef({ x: 0, y: 0 });
  const swingTrailRef = useRef([]); // [{x,y}] trail of forward swing path
  const fullSwingPathRef = useRef([]); // entire drag path for visualization
  const peakPowerRef = useRef(0); // max power reached during backswing
  const swingLockedRef = useRef(false); // true once forward swing starts
  const [lastShotStats, setLastShotStats] = useState(null);
  const [showShotStats, setShowShotStats] = useState(false);
  const shotStartPosRef = useRef(null);
  const shotLandPosRef = useRef(null);
  const shotPeakHeightRef = useRef(0);
  const shotCarryRef = useRef(0);
  const shotRollRef = useRef(0);
  const [currentLie, setCurrentLie] = useState('tee');
  const [selectedClubIndex, setSelectedClubIndex] = useState(15);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [lastShotNote, setLastShotNote] = useState('Tap Yards to shape the shot, then tap the big ball to strike it.');
  const [tempoLabel, setTempoLabel] = useState('Blue dot centered');
  const [golferBallAnchor, setGolferBallAnchor] = useState(HOLES[0].ballStart);
  const [ballHeight, setBallHeight] = useState(0);
  const [camera, setCamera] = useState({ x: HOLES[0].ballStart.x, y: HOLES[0].ballStart.y });
  const cameraRef = useRef({ x: HOLES[0].ballStart.x, y: HOLES[0].ballStart.y });
  const manualPanUntilRef = useRef(0);
  const panCentroidRef = useRef(null);
  const isTwoFingerPanningRef = useRef(false);
  const webPanStartCameraRef = useRef(null);

  const ballRef = useRef(ball);
  const velocityRef = useRef({ x: 0, y: 0 });
  const flightRef = useRef({ z: 0, vz: 0 });
  const lastTsRef = useRef(null);
  const frameRef = useRef(null);
  const courseRef = useRef(null);
  const courseFrameRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const sunkRef = useRef(false);
  const holeIndexRef = useRef(0);
  const [draggingSpinDot, setDraggingSpinDot] = useState(false);

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
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    powerRef.current = 0; setPowerPct(0);
    setTempoLabel('Blue dot centered');
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
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    powerRef.current = 0; setPowerPct(0);
    setTempoLabel('Blue dot centered');
    setLastShotNote('Tap Yards to shape the shot, then tap the big ball to strike it.');
    const nc = clampCamera(currentHole.ballStart);
    setCamera(nc);
    cameraRef.current = nc;
    manualPanUntilRef.current = 0;
  };

  useEffect(() => { ballRef.current = ball; }, [ball]);
  useEffect(() => { cameraRef.current = camera; }, [camera]);
  useEffect(() => { sunkRef.current = sunk; }, [sunk]);
  useEffect(() => { holeIndexRef.current = holeIndex; }, [holeIndex]);

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
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    powerRef.current = 0; setPowerPct(0);
    setTempoLabel('Blue dot centered');
    setLastShotNote('Tap Yards to shape the shot, then tap the big ball to strike it.');
  }, [holeIndex, currentHole.ballStart, currentHole.cup]);

  useEffect(() => {
    const tick = (ts) => {
      if (lastTsRef.current == null) {
        lastTsRef.current = ts;
      }
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.033);
      lastTsRef.current = ts;


      const tickSunk = sunkRef.current;
      const tickHole = HOLES[holeIndexRef.current];
      if (!tickSunk) {
        const vel = velocityRef.current;
        const flight = flightRef.current;
        const speed = magnitude(vel);
        const movingVertically = flight.z > 0.01 || Math.abs(flight.vz) > 0.15;

        if (speed > 0.3 || movingVertically) {
          let next = {
            x: ballRef.current.x + vel.x * dt,
            y: ballRef.current.y + vel.y * dt
          };

          const surfaceName = getSurfaceAtPoint(tickHole, next);
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
            // Wind force while airborne
            const wind = WIND_PRESETS[holeIndexRef.current % WIND_PRESETS.length];
            const wDir = WIND_DIRS[wind.dir] || { x: 0, y: 0 };
            const wForce = wind.speed * WIND_FORCE_SCALE * dt;
            vel.x += wDir.x * wForce;
            vel.y += wDir.y * wForce;
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
            tickHole.obstacles.forEach((o) => {
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

          // Track peak height
          if (flight.z > shotPeakHeightRef.current) shotPeakHeightRef.current = flight.z;

          // Track carry (first landing)
          if (flight.z <= GROUND_EPSILON && shotLandPosRef.current === null && shotStartPosRef.current) {
            shotLandPosRef.current = { x: next.x, y: next.y };
            shotCarryRef.current = Math.hypot(next.x - shotStartPosRef.current.x, next.y - shotStartPosRef.current.y) * YARDS_PER_WORLD;
          }

          const fellInWater = tickHole.hazards.some((h) => h.type === 'waterRect' && pointInRect(next, h));
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

          // Ball stopped — compute final stats
          if (magnitude(vel) < 0.3 && flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.15 && shotStartPosRef.current) {
            const totalDist = Math.round(Math.hypot(next.x - shotStartPosRef.current.x, next.y - shotStartPosRef.current.y) * YARDS_PER_WORLD);
            const carry = Math.round(shotCarryRef.current);
            const roll = Math.max(0, totalDist - carry);
            const endLie = getSurfaceAtPoint(tickHole, next);
            setCurrentLie(endLie);
            setLastShotStats(prev => prev ? {
              ...prev,
              carry,
              roll,
              totalDist,
              peakHeight: Math.round(shotPeakHeightRef.current * 3),
              endLie
            } : null);
            setShowShotStats(true);
            shotStartPosRef.current = null;
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
  }, []);

  useEffect(() => {
    if (sunk) {
      return;
    }
    if (ballHeight > 0.28 || Math.abs(flightRef.current.vz) > 0.5) {
      return;
    }
    const speed = magnitude(velocityRef.current);
    const dx = ball.x - currentHole.cup.x;
    const dy = ball.y - currentHole.cup.y;
    const dist = Math.hypot(dx, dy);
    const captureRadius = CUP_RADIUS_WORLD + BALL_RADIUS_WORLD * 1.05;
    const slowEnough = speed < 14;
    if (dist < captureRadius && slowEnough) {
      setSunk(true);
      velocityRef.current = { x: 0, y: 0 };
      flightRef.current = { z: 0, vz: 0 };
      setBallHeight(0);
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
          if (sunk || ballMoving) {
            return false;
          }
          return true;
        },
        onStartShouldSetPanResponderCapture: () => false,
        onPanResponderGrant: (evt) => {
          syncCourseFrame();
          if (!isTouchInsideCourse(evt)) {
            return;
          }
          webPanStartCameraRef.current = cameraRef.current;
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
        onPanResponderMove: (evt, gestureState) => {
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
          // On web: short drag = aim, long drag = pan
          if (Platform.OS === 'web') {
            const totalMove = Math.hypot(gestureState.dx, gestureState.dy);
            if (totalMove > 40) {
              // Long drag — switch to pan mode
              setIsAiming(false);
              manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
              const startCamera = webPanStartCameraRef.current || cameraRef.current;
              setCamera(clampCamera({
                x: startCamera.x - gestureState.dx / pixelsPerWorld,
                y: startCamera.y - gestureState.dy / pixelsPerWorld
              }));
              return;
            }
          }
          if (!isTouchInsideCourse(evt)) {
            return;
          }
          setAimFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        },
        onPanResponderRelease: (evt, gestureState) => {
          if (isTouchInsideCourse(evt) && Math.abs(gestureState.dx) < 40 && Math.abs(gestureState.dy) < 40) {
            setAimFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
          }
          setIsAiming(false);
          if (isTwoFingerPanningRef.current || Platform.OS === 'web') {
            manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
          }
          isTwoFingerPanningRef.current = false;
          panCentroidRef.current = null;
          webPanStartCameraRef.current = null;
        },
        onPanResponderTerminate: () => {
          setIsAiming(false);
          if (isTwoFingerPanningRef.current || Platform.OS === 'web') {
            manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
          }
          isTwoFingerPanningRef.current = false;
          panCentroidRef.current = null;
          webPanStartCameraRef.current = null;
        }
      }),
    [ballMoving, pixelsPerWorld, sunk]
  );

  const getShotControlMetrics = (offset = spinOffset) => {
    const xNorm = clamp(offset.x / MAX_SPIN_OFFSET, -1, 1);
    const yNorm = clamp(offset.y / MAX_SPIN_OFFSET, -1, 1);
    const launchAdjust = clamp(1 - yNorm * 0.4, 0.68, 1.38);
    const spinAdjust = clamp(1 - yNorm * 0.36, 0.7, 1.34);
    const curveDeg = xNorm * 18;
    let shapeLabel = 'Dead straight';

    if (xNorm < -0.55) shapeLabel = 'Slice';
    else if (xNorm < -0.18) shapeLabel = 'Fade';
    else if (xNorm > 0.55) shapeLabel = 'Hook';
    else if (xNorm > 0.18) shapeLabel = 'Draw';

    let flightLabel = 'Mid flight';
    if (yNorm < -0.4) flightLabel = 'Higher launch, less spin';
    else if (yNorm > 0.4) flightLabel = 'Lower launch, more spin';

    return { xNorm, yNorm, launchAdjust, spinAdjust, curveDeg, shapeLabel, flightLabel };
  };

  const strikeBall = (deviation = 0) => {
    if (sunk || ballMoving) return;

    const shotMetrics = getShotControlMetrics();
    // deviation: -1 (hard left) to +1 (hard right) from forward swing path
    const swingCurveDeg = deviation * 25; // up to 25° curve from off-center swipe
    const finalAngle = aimAngle + degToRad(shotMetrics.curveDeg + swingCurveDeg);
    const direction = { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };
    const effectivePower = powerRef.current;
    const speed = speedFromPower(effectivePower, selectedClub);
    const launchRatio = clamp(effectivePower / 125, 0, 1);
    const horizSpeed = speed;
    const clubLaunchBoost = selectedClub.key === 'PT' ? 1 : 0.92 + selectedClub.launch * 0.42;

    velocityRef.current = {
      x: direction.x * horizSpeed,
      y: direction.y * horizSpeed
    };
    // Hang time calibrated to match distance: higher lofted clubs hang longer proportionally
    const targetHangTime = selectedClub.key === 'PT' ? 0.3 + launchRatio * 0.5 : 1.0 + selectedClub.launch * 1.0;
    const launchVz = selectedClub.key === 'PT'
      ? 0.8 + launchRatio * 2.4
      : (GRAVITY * targetHangTime * 0.5) * Math.max(0.3, launchRatio) * shotMetrics.launchAdjust;
    flightRef.current = {
      z: 0.08,
      vz: launchVz
    };

    // Track shot stats
    shotStartPosRef.current = { ...ballRef.current };
    shotLandPosRef.current = null;
    shotPeakHeightRef.current = 0;
    shotCarryRef.current = 0;
    shotRollRef.current = 0;
    setShowShotStats(false);

    const contactLabel = Math.abs(deviation) < 0.08 ? 'Center' : Math.abs(deviation) < 0.25 ? (deviation < 0 ? 'Slight Heel' : 'Slight Toe') : (deviation < 0 ? 'Heel' : 'Toe');
    const shotShapeLabel = Math.abs(deviation) < 0.1 ? 'Straight' : deviation < -0.3 ? 'Hook' : deviation > 0.3 ? 'Slice' : deviation < 0 ? 'Draw' : 'Fade';

    // Normalize swing path for visualization (relative to start, scaled to fit a box)
    const rawPath = [...fullSwingPathRef.current];
    let swingPath = [];
    if (rawPath.length > 2) {
      const sx = rawPath[0].x, sy = rawPath[0].y;
      const pts = rawPath.map(p => ({ x: p.x - sx, y: p.y - sy, phase: p.phase }));
      const maxAbs = Math.max(1, ...pts.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))));
      swingPath = pts.map(p => ({ x: p.x / maxAbs, y: p.y / maxAbs, phase: p.phase }));
    }

    setLastShotStats({
      club: selectedClub.short,
      clubName: selectedClub.name,
      power: effectivePower,
      contact: contactLabel,
      shape: shotShapeLabel,
      deviationDeg: Math.round(swingCurveDeg * 10) / 10,
      carry: 0,
      roll: 0,
      totalDist: 0,
      peakHeight: 0,
      startLie: currentLie,
      endLie: 'unknown',
      swingPath
    });

    setBallHeight(flightRef.current.z);
    setTempoLabel(`${shotShapeLabel} • ${effectivePower}%`);
    setStrokesCurrent((s) => s + 1);
    setShotControlOpen(false);
    setSwingPhase('idle');
    setPowerPct(0);
    powerRef.current = 0;
    setSwingDeviation(0);
    setLastShotNote(`${selectedClub.short} — ${contactLabel}, ${shotShapeLabel.toLowerCase()}, ${effectivePower}% power.`);
  };

  const shotControlResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => shotControlOpen && !sunk && !ballMoving,
        onStartShouldSetPanResponderCapture: () => shotControlOpen && !sunk && !ballMoving,
        onPanResponderGrant: (evt) => {
          if (!shotControlOpen) {
            return;
          }
          const dx = evt.nativeEvent.locationX - PAD_CENTER;
          const dy = evt.nativeEvent.locationY - PAD_CENTER;
          const distanceFromDot = Math.hypot(dx - spinOffset.x, dy - spinOffset.y);
          setDraggingSpinDot(distanceFromDot <= SPIN_DOT_RADIUS + 12);
        },
        onPanResponderMove: (evt) => {
          if (!shotControlOpen || !draggingSpinDot) {
            return;
          }
          const dx = evt.nativeEvent.locationX - PAD_CENTER;
          const dy = evt.nativeEvent.locationY - PAD_CENTER;
          const distance = Math.hypot(dx, dy);
          const scale = distance > MAX_SPIN_OFFSET ? MAX_SPIN_OFFSET / distance : 1;
          const nextOffset = { x: dx * scale, y: dy * scale };
          setSpinOffset(nextOffset);
          const metrics = getShotControlMetrics(nextOffset);
          setTempoLabel(`${metrics.shapeLabel} • ${metrics.flightLabel}`);
        },
        onPanResponderRelease: () => {
          setDraggingSpinDot(false);
        },
        onPanResponderTerminate: () => {
          setDraggingSpinDot(false);
        }
      }),
    [ballMoving, draggingSpinDot, shotControlOpen, sunk, spinOffset.x, spinOffset.y]
  );

  const swingResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !sunk && !ballMoving && !shotControlOpen,
        onStartShouldSetPanResponderCapture: () => !sunk && !ballMoving && !shotControlOpen,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          swingStartRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
          swingLowestRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
          swingTrailRef.current = [];
          fullSwingPathRef.current = [{ x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY, phase: 'start' }];
          setSwingPhase('backswing');
          powerRef.current = 0;
          peakPowerRef.current = 0;
          swingLockedRef.current = false;
          setPowerPct(0);
          setSwingDeviation(0);
        },
        onPanResponderMove: (evt, gestureState) => {
          const currentY = evt.nativeEvent.pageY;
          const currentX = evt.nativeEvent.pageX;
          const dy = currentY - swingStartRef.current.y;

          fullSwingPathRef.current.push({ x: currentX, y: currentY, phase: swingLockedRef.current ? 'forward' : 'back' });

          if (!swingLockedRef.current) {
            // BACKSWING: dragging down charges power
            const dyFromLowest = currentY - swingLowestRef.current.y;
            if (dy > 0) {
              // Still moving down or at lowest point
              const pct = clamp(Math.round(dy / 0.8), 0, 120);
              powerRef.current = pct;
              peakPowerRef.current = Math.max(peakPowerRef.current, pct);
              setPowerPct(pct);
              swingLowestRef.current = { x: currentX, y: currentY };
              swingTrailRef.current = [];
            } else if (peakPowerRef.current > 5 && dyFromLowest < -8) {
              // Finger reversed direction upward — LOCK power and start forward swing
              swingLockedRef.current = true;
              powerRef.current = peakPowerRef.current;
              setPowerPct(peakPowerRef.current);
              setSwingPhase('forward');
            }
          } else {
            // FORWARD SWING: track deviation
            swingTrailRef.current.push({ x: currentX, y: currentY });
            const centerX = swingLowestRef.current.x;
            const devPx = currentX - centerX;
            const devNorm = clamp(devPx / 60, -1, 1);
            setSwingDeviation(devNorm);
          }
        },
        onPanResponderRelease: () => {
          if (powerRef.current > 5) {
            strikeBall(swingDeviation);
          } else {
            setSwingPhase('idle');
            setPowerPct(0);
            powerRef.current = 0;
          }
        },
        onPanResponderTerminate: () => {
          setSwingPhase('idle');
          setPowerPct(0);
          powerRef.current = 0;
        }
      }),
    [ballMoving, shotControlOpen, sunk, swingDeviation]
  );


  const screenBall = toScreen(ball);
  const screenCup = toScreen(currentHole.cup);
  const liftPx = clamp(ballHeight * pixelsPerWorld * 1.55, 0, 54);
  const airborneRatio = clamp(ballHeight / 18, 0, 1);
  const ballVisualScale = 1 - airborneRatio * 0.12;
  const shadowScale = 1 + airborneRatio * 0.5;
  const shadowOpacity = 0.28 - airborneRatio * 0.18;
  const worldOffsetX = viewWidth / 2 - camera.x * pixelsPerWorld;
  const worldOffsetY = viewHeight / 2 - camera.y * pixelsPerWorld;

  const finishedAll = scores.every((s) => typeof s === 'number');
  const isLastHole = holeIndex === HOLES.length - 1;
  const shotMetrics = getShotControlMetrics();
  const overSwing = powerPct > 100;
  const neutralStrike = { launch: 1, spin: 1 };

  const aimDir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
  const aimPerp = { x: -aimDir.y, y: aimDir.x };
  const distanceToCupWorld = Math.hypot(currentHole.cup.x - ball.x, currentHole.cup.y - ball.y);
  const yardsToCup = Math.max(0, Math.round(distanceToCupWorld * YARDS_PER_WORLD));
  const windData = WIND_PRESETS[holeIndex % WIND_PRESETS.length];
  const windLabel = `${windData.speed} mph`;
  const windArrow = WIND_ARROWS[windData.dir] || '•';
  const windDirLabel = windData.dir;
  const stockClubYards = Math.round(estimateStraightDistance(100, selectedClub, neutralStrike) * YARDS_PER_WORLD);
  const previewPower = powerPct;
  const previewYards = Math.round(estimateStraightDistance(previewPower, selectedClub, { launch: shotMetrics.launchAdjust, spin: shotMetrics.spinAdjust }) * YARDS_PER_WORLD);
  const shotShape = `${SHOT_SHAPE_HINTS[selectedClub.key] || 'Neutral'} • ${shotMetrics.shapeLabel}`;
  const shotNumber = sunk ? strokesCurrent : strokesCurrent + 1;

  const rayToWorldEdge = (() => {
    const candidates = [];
    if (Math.abs(aimDir.x) > 0.0001) {
      const tx0 = (0 - ball.x) / aimDir.x;
      const tx1 = (WORLD.w - ball.x) / aimDir.x;
      if (tx0 > 0) candidates.push(tx0);
      if (tx1 > 0) candidates.push(tx1);
    }
    if (Math.abs(aimDir.y) > 0.0001) {
      const ty0 = (0 - ball.y) / aimDir.y;
      const ty1 = (WORLD.h - ball.y) / aimDir.y;
      if (ty0 > 0) candidates.push(ty0);
      if (ty1 > 0) candidates.push(ty1);
    }
    if (!candidates.length) {
      return 0;
    }
    return Math.max(0, Math.min(...candidates));
  })();
  const aimGuideWorld = clamp(
    estimateStraightDistance(100, selectedClub, { launch: shotMetrics.launchAdjust, spin: shotMetrics.spinAdjust }),
    6,
    rayToWorldEdge
  );

  const aimLineDots = [0.25, 0.5, 0.75, 1].map((pct) => {
    const worldDist = aimGuideWorld * pct;
    const curveOffset = Math.sin(pct * Math.PI * 0.95) * aimGuideWorld * degToRad(shotMetrics.curveDeg) * 0.55 * pct;
    const loftOffset = -(shotMetrics.launchAdjust - 1) * 10 * Math.sin(pct * Math.PI) * 0.4;
    const point = {
      x: ball.x + aimDir.x * worldDist + aimPerp.x * curveOffset,
      y: ball.y + aimDir.y * worldDist + aimPerp.y * curveOffset + loftOffset
    };
    const screen = toScreen(point);
    return {
      key: `aim-dot-${pct}`,
      x: screen.x,
      y: screen.y,
      size: 4 + pct * 3,
      opacity: 0.5 + pct * 0.35,
      color: '#ffdd44'
    };
  });

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
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.courseShell}>
        <View
          ref={courseRef}
          onLayout={syncCourseFrame}
          style={[styles.course, { width: viewWidth, height: viewHeight }]}
        >
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none" {...aimResponder.panHandlers}>
            <View style={styles.courseTintTop} pointerEvents="none" />
            <View style={styles.courseTintBottom} pointerEvents="none" />

          <View
            style={[
              styles.worldLayer,
              {
                left: worldOffsetX,
                top: worldOffsetY,
                width: WORLD.w * scaleX,
                height: WORLD.h * scaleY
              }
            ]}
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
              >
                <View style={styles.fairwaySheen} />
              </View>
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
          </View>

          {!ballMoving && !sunk ? aimLineDots.map((dot) => (
            <View
              key={dot.key}
              pointerEvents="none"
              style={[
                styles.aimDot,
                {
                  width: dot.size,
                  height: dot.size,
                  borderRadius: dot.size / 2,
                  left: dot.x - dot.size / 2,
                  top: dot.y - dot.size / 2,
                  opacity: dot.opacity,
                  backgroundColor: dot.color
                }
              ]}
            />
          )) : null}

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

          {!sunk ? (
            <>
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
            </>
          ) : null}
          </View>
        </View>

        <View style={styles.topOverlay} pointerEvents="box-none">
          <View style={styles.versionWrap} pointerEvents="none">
            <Text style={styles.versionText}>{BUILD_VERSION}</Text>
          </View>
          <View style={styles.topHudRow}>
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

            <View style={styles.hudStrip}>
              <View style={styles.hudItem}>
                <Text style={styles.hudLabel}>Hole</Text>
                <Text style={styles.hudValue}>{holeIndex + 1} / {HOLES.length}</Text>
              </View>
              <View style={styles.hudItem}>
                <Text style={styles.hudLabel}>Par</Text>
                <Text style={styles.hudValue}>{currentHole.par}</Text>
              </View>
              <View style={styles.hudItem}>
                <Text style={styles.hudLabel}>Shot</Text>
                <Text style={styles.hudValue}>{shotNumber}</Text>
              </View>
              <Pressable
                style={[styles.hudItem, styles.hudItemPressable, shotControlOpen && styles.hudItemActive]}
                onPress={() => {
                  setShotControlOpen((v) => !v);
                  setLastShotNote('Shot shape opened from yardage. Drag the blue dot, then tap the ball to hit.');
                }}
              >
                <Text style={styles.hudLabel}>Yards</Text>
                <Text style={styles.hudValue}>{yardsToCup}</Text>
              </Pressable>
              <View style={styles.hudItem}>
                <Text style={styles.hudLabel}>Wind</Text>
                <Text style={styles.hudValue}>{windLabel}</Text>
              </View>
              <View style={styles.hudItemWind}>
                <Text style={styles.windArrow}>{windArrow}</Text>
                <Text style={styles.windDirText}>{windDirLabel}</Text>
              </View>
            </View>
          </View>
        </View>


        <View style={styles.bottomOverlay}>
          <View style={styles.bottomMainRow}>
            <Pressable
              style={[styles.clubCard, shotControlOpen && styles.clubCardActive]}
              onPress={() => {
                setShotControlOpen(true);
                setLastShotNote('Shot shape opened. Drag the blue dot, then tap the ball to hit.');
              }}
            >
              <Text style={styles.clubCardTitle}>{selectedClub.name}</Text>
              <Text style={styles.clubCardSub}>{selectedClub.short} • {shotShape}</Text>
              <Text style={styles.clubCardYards}>{previewYards} yd</Text>
              <Text style={styles.clubCardMeta}>Stock {stockClubYards} • To pin {yardsToCup}</Text>
              <Text style={styles.clubCardMeta}>{tempoLabel}</Text>
            </Pressable>

            <View style={styles.swingDock}>
              {shotControlOpen ? (
                <View style={[styles.swingPad, styles.swingPadActive]}>
                  <View style={styles.shotPadGuideWrap} {...shotControlResponder.panHandlers}>
                    <View style={styles.shotPadCrosshairH} pointerEvents="none" />
                    <View style={styles.shotPadCrosshairV} pointerEvents="none" />
                    <View
                      pointerEvents="none"
                      style={[
                        styles.spinDot,
                        draggingSpinDot && styles.spinDotActive,
                        {
                          left: PAD_CENTER + spinOffset.x - SPIN_DOT_RADIUS,
                          top: PAD_CENTER + spinOffset.y - SPIN_DOT_RADIUS
                        }
                      ]}
                    />
                  </View>
                  <Pressable
                    style={styles.shotDoneButton}
                    onPress={() => {
                      setShotControlOpen(false);
                      setLastShotNote('Shot shape set. Tap Hit to strike the ball.');
                    }}
                  >
                    <Text style={styles.shotDoneText}>Done</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.swingPad} {...swingResponder.panHandlers}>
                  {/* Radial power ring */}
                  <View style={[
                    styles.powerRing,
                    {
                      width: SHOT_PAD_SIZE * clamp(powerPct / 100, 0.15, 1.2),
                      height: SHOT_PAD_SIZE * clamp(powerPct / 100, 0.15, 1.2),
                      borderRadius: SHOT_PAD_SIZE * clamp(powerPct / 100, 0.15, 1.2) / 2,
                      borderColor: powerPct > 100 ? '#ff4444' : '#4adb6a',
                      opacity: swingPhase !== 'idle' ? 0.7 : 0.25
                    }
                  ]} />
                  <View style={styles.swingHaloOuter} />
                  <View style={styles.swingHaloInner}>
                    <Text style={styles.swingPct}>
                      {swingPhase === 'backswing' ? `${powerPct}%`
                        : swingPhase === 'forward' ? (Math.abs(swingDeviation) < 0.1 ? '↑' : swingDeviation < 0 ? '↰' : '↱')
                        : '⛳'}
                    </Text>
                  </View>
                  {/* Swing guide */}
                  {swingPhase !== 'idle' ? (
                    <View style={styles.swingGuideWrap} pointerEvents="none">
                      <Text style={styles.swingGuideText}>
                        {swingPhase === 'backswing' ? '↓ Pull down for power'
                          : `Swipe up straight! ${Math.abs(swingDeviation) < 0.1 ? '✓ Straight' : swingDeviation < -0.3 ? '← Pull' : swingDeviation > 0.3 ? '→ Push' : swingDeviation < 0 ? '← Slight' : '→ Slight'}`}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.swingGuideWrap} pointerEvents="none">
                      <Text style={styles.swingGuideText}>Hold & drag down</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>

          <View style={styles.clubSelectorWrap}>
            <Pressable style={styles.clubPickerTrigger} onPress={() => setClubPickerOpen((v) => !v)}>
              <Text style={styles.clubPickerTriggerLabel}>Club</Text>
              <Text style={styles.clubPickerTriggerValue}>{selectedClub.short} • {selectedClub.name}</Text>
              <Text style={styles.clubPickerTriggerChevron}>{clubPickerOpen ? '▲' : '▼'}</Text>
            </Pressable>

            {clubPickerOpen ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clubScrollContent}>
                {CLUBS.map((club, index) => (
                  <Pressable
                    key={club.key}
                    style={[styles.clubChip, index === selectedClubIndex && styles.clubChipActive]}
                    onPress={() => {
                      setSelectedClubIndex(index);
                      setClubPickerOpen(false);
                    }}
                  >
                    <Text style={[styles.clubChipText, index === selectedClubIndex && styles.clubChipTextActive]}>
                      {club.short}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>

          <Text style={styles.helperText}>
            {isAiming
              ? 'Adjusting aim...'
              : shotControlOpen
                ? 'Drag the blue dot, then tap Shoot to hit.'
                : Platform.OS === 'web'
                  ? 'Tap Yards, the club card, or Hit to open shot shaping. Drag on the course to pan, tap to aim.'
                  : 'Tap Yards, the club card, or Hit to open shot shaping. Use two fingers on course to pan camera.'}
          </Text>
          <Text style={styles.lastShotText}>{lastShotNote}</Text>

          {waterNotice && !sunk ? <Text style={styles.warning}>Water hazard: +1 stroke, ball reset.</Text> : null}
          {sunk ? (
            <View style={styles.sunkRow}>
              <Text style={styles.success}>Hole complete in {strokesCurrent} strokes.</Text>
              {!isLastHole ? (
                <Pressable style={styles.nextHoleBtn} onPress={() => setHoleIndex((h) => h + 1)}>
                  <Text style={styles.nextHoleBtnText}>Next Hole →</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {finishedAll ? (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>Round Complete</Text>
              <Text style={styles.summaryText}>Played holes: {completed}</Text>
              <Text style={styles.summaryText}>Final strokes: {totalScore}</Text>
            </View>
          ) : null}
        </View>

        {/* Ball Lie PiP */}
        {!sunk && !ballMoving ? (
          <View style={styles.liePip}>
            <View style={[styles.lieColorBar, { backgroundColor: (SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).color }]} />
            <Text style={styles.lieEmoji}>{(SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).emoji}</Text>
            <Text style={styles.lieLabel}>{(SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).label}</Text>
            {(SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).powerPenalty < 1 ? (
              <Text style={styles.liePenalty}>{Math.round((SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).powerPenalty * 100)}% power</Text>
            ) : null}
          </View>
        ) : null}

        {/* Shot Stats Card */}
        {showShotStats && lastShotStats && !ballMoving ? (
          <Pressable style={styles.shotStatsOverlay} onPress={() => setShowShotStats(false)}>
            <View style={styles.shotStatsCard}>
              <Text style={styles.shotStatsTitle}>📊 Shot Stats</Text>

              {/* Swing Path Visualization */}
              {lastShotStats.swingPath && lastShotStats.swingPath.length > 2 ? (
                <View style={styles.swingPathBox}>
                  <Text style={styles.swingPathLabel}>Swing Path</Text>
                  <View style={styles.swingPathCanvas}>
                    {/* Center line (ideal straight path) */}
                    <View style={styles.swingPathCenterLine} />
                    {/* Draw the swing trail as dots */}
                    {lastShotStats.swingPath.map((pt, i) => {
                      const cx = 60 + pt.x * 55;
                      const cy = 75 + pt.y * 70;
                      const isBack = pt.phase === 'back' || pt.phase === 'start';
                      const size = isBack ? 4 : 5;
                      return (
                        <View
                          key={i}
                          style={{
                            position: 'absolute',
                            left: cx - size / 2,
                            top: cy - size / 2,
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            backgroundColor: isBack ? '#4adb6a' : '#ffdd44',
                            opacity: 0.4 + (i / lastShotStats.swingPath.length) * 0.6
                          }}
                        />
                      );
                    })}
                    {/* Start dot */}
                    <View style={[styles.swingPathDot, { left: 57, top: 72, backgroundColor: '#fff' }]} />
                  </View>
                  <View style={styles.swingPathLegend}>
                    <View style={styles.swingPathLegendItem}>
                      <View style={[styles.swingPathLegendDot, { backgroundColor: '#4adb6a' }]} />
                      <Text style={styles.swingPathLegendText}>Backswing</Text>
                    </View>
                    <View style={styles.swingPathLegendItem}>
                      <View style={[styles.swingPathLegendDot, { backgroundColor: '#ffdd44' }]} />
                      <Text style={styles.swingPathLegendText}>Forward</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              <View style={styles.shotStatsGrid}>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Club</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.clubName}</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Power</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.power}%</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Carry</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.carry} yds</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Roll</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.roll} yds</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Total</Text>
                  <Text style={[styles.shotStatValue, styles.shotStatTotal]}>{lastShotStats.totalDist} yds</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Peak Height</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.peakHeight} ft</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Contact</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.contact}</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Shape</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.shape}</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Curve</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.deviationDeg}°</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Lie</Text>
                  <Text style={styles.shotStatValue}>{(SURFACE_PHYSICS[lastShotStats.endLie] || SURFACE_PHYSICS.rough).emoji} {(SURFACE_PHYSICS[lastShotStats.endLie] || SURFACE_PHYSICS.rough).label}</Text>
                </View>
              </View>
              <Text style={styles.shotStatsDismiss}>Tap to dismiss</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#223923'
  },
  aimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 300,
    zIndex: 10
  },
  courseShell: {
    flex: 1
  },
  course: {
    backgroundColor: '#486f3d',
    overflow: 'hidden',
    position: 'relative'
  },
  worldLayer: {
    position: 'absolute'
  },
  courseTintTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '44%',
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  courseTintBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
    backgroundColor: 'rgba(0,0,0,0.10)'
  },
  tee: {
    position: 'absolute',
    backgroundColor: '#4a965a',
    borderWidth: 2,
    borderColor: '#2f6b3d'
  },
  fairway: {
    position: 'absolute',
    backgroundColor: '#9ac977',
    borderWidth: 2,
    borderColor: '#86b064',
    overflow: 'hidden'
  },
  fairwaySheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '36%',
    backgroundColor: 'rgba(255,255,255,0.15)'
  },
  green: {
    position: 'absolute',
    backgroundColor: '#b4dd97',
    borderWidth: 2,
    borderColor: '#7ea565'
  },
  fringe: {
    position: 'absolute',
    backgroundColor: '#7dae62'
  },
  wall: {
    position: 'absolute',
    backgroundColor: '#5a4732',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#3c2d22'
  },
  bumper: {
    position: 'absolute',
    backgroundColor: '#6e5a46',
    borderWidth: 2,
    borderColor: '#4f3f31'
  },
  tree: {
    position: 'absolute',
    backgroundColor: '#2f6e3e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1f4c28'
  },
  treeCore: {
    width: '45%',
    height: '45%',
    borderRadius: 999,
    backgroundColor: '#214e2b'
  },
  sand: {
    position: 'absolute',
    backgroundColor: '#d9c17f',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#b59b5f'
  },
  water: {
    position: 'absolute',
    backgroundColor: '#3f88bc',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#26618a'
  },
  aimDot: {
    position: 'absolute',
    backgroundColor: '#ffdd44',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.5)',
    shadowColor: '#ffdd44',
    shadowOpacity: 0.7,
    shadowRadius: 4
  },
  aimDotLabel: {
    position: 'absolute',
    width: 28,
    textAlign: 'center',
    color: 'rgba(245,249,236,0.82)',
    fontSize: 9,
    fontWeight: '700'
  },
  cup: {
    position: 'absolute',
    backgroundColor: '#1b2514',
    borderWidth: 2,
    borderColor: '#091006'
  },
  ball: {
    position: 'absolute',
    backgroundColor: '#fbfbf8',
    borderWidth: 1,
    borderColor: '#ccd2c7'
  },
  ballShadow: {
    position: 'absolute',
    backgroundColor: '#142415'
  },
  golferWrap: {
    position: 'absolute'
  },
  golferPixel: {
    position: 'absolute'
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 80,
    paddingHorizontal: 10,
    paddingTop: 4
  },
  topHudRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  versionWrap: {
    alignItems: 'flex-end',
    marginBottom: 6
  },
  versionText: {
    color: 'rgba(228,239,222,0.72)',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(7, 11, 9, 0.54)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden'
  },
  menuWrap: {
    position: 'relative',
    zIndex: 95
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(8, 12, 10, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuIcon: {
    color: '#f6f7f3',
    fontSize: 20,
    fontWeight: '700'
  },
  menuPanel: {
    position: 'absolute',
    top: 48,
    left: 0,
    width: 160,
    borderRadius: 14,
    backgroundColor: 'rgba(7, 11, 9, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
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
    color: '#f2f9ec',
    fontWeight: '700',
    fontSize: 13
  },
  hudStrip: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'rgba(7, 11, 9, 0.64)',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 6,
    paddingVertical: 6
  },
  hudItem: {
    minWidth: 52,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  hudItemWind: {
    minWidth: 42,
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(80, 140, 220, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(111, 174, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  windArrow: {
    color: '#78b7ff',
    fontSize: 18,
    fontWeight: '800'
  },
  windDirText: {
    color: '#9fc8ff',
    fontSize: 9,
    fontWeight: '700'
  },
  hudItemPressable: {
    borderWidth: 1,
    borderColor: 'rgba(111, 174, 255, 0.28)'
  },
  hudItemActive: {
    backgroundColor: 'rgba(52, 102, 173, 0.28)',
    borderColor: 'rgba(111, 174, 255, 0.9)'
  },
  hudLabel: {
    color: '#9fb59f',
    fontSize: 10,
    fontWeight: '600'
  },
  hudValue: {
    color: '#f5fbef',
    fontSize: 13,
    fontWeight: '700'
  },
  powerRailWrap: {
    position: 'absolute',
    right: 10,
    top: '27%',
    zIndex: 85,
    width: 58,
    alignItems: 'center',
    gap: 4
  },
  powerRailPct: {
    color: '#f5f9f0',
    fontSize: 13,
    fontWeight: '800',
    backgroundColor: 'rgba(6, 10, 8, 0.74)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  powerRailTrack: {
    width: 24,
    height: 204,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(8,12,10,0.78)',
    overflow: 'hidden',
    position: 'relative'
  },
  powerRailSafe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(106,165,113,0.58)'
  },
  powerRailFill: {
    position: 'absolute',
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: 10,
    backgroundColor: '#8fd37a'
  },
  powerRailCut: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: `${(100 / 125) * 100}%`,
    height: 2,
    backgroundColor: '#e06f58'
  },
  powerRailMeta: {
    color: '#d2dfcc',
    fontSize: 11,
    fontWeight: '700'
  },
  bottomOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    zIndex: 90,
    gap: 8
  },
  bottomMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10
  },
  clubCard: {
    flex: 1,
    minHeight: 124,
    borderRadius: 16,
    backgroundColor: 'rgba(8, 12, 10, 0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.17)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'space-between'
  },
  clubCardActive: {
    borderColor: 'rgba(111, 174, 255, 0.92)',
    backgroundColor: 'rgba(14, 27, 47, 0.78)'
  },
  clubCardTitle: {
    color: '#eff8e6',
    fontSize: 15,
    fontWeight: '700'
  },
  clubCardSub: {
    color: '#aec3a9',
    fontSize: 12
  },
  clubCardYards: {
    color: '#f5fbef',
    fontSize: 26,
    fontWeight: '800'
  },
  clubCardMeta: {
    color: '#a9bda5',
    fontSize: 11
  },
  swingDock: {
    width: SHOT_PAD_SIZE + 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  swingPad: {
    width: SHOT_PAD_SIZE,
    height: SHOT_PAD_SIZE,
    borderRadius: SHOT_PAD_SIZE / 2,
    backgroundColor: 'rgba(7, 11, 9, 0.84)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  swingPadActive: {
    borderColor: '#93d27c',
    shadowColor: '#94d87d',
    shadowOpacity: 0.48,
    shadowRadius: 12
  },
  powerRing: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#4adb6a'
  },
  swingHaloOuter: {
    position: 'absolute',
    width: 102,
    height: 102,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)'
  },
  swingHaloInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: 'rgba(248,251,242,0.8)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  swingPct: {
    color: '#f6fbef',
    fontSize: 18,
    fontWeight: '800'
  },
  shotPadGuideWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center'
  },
  shotPadCrosshairH: {
    position: 'absolute',
    width: SHOT_PAD_SIZE - 46,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  shotPadCrosshairV: {
    position: 'absolute',
    width: 1,
    height: SHOT_PAD_SIZE - 46,
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  spinDot: {
    position: 'absolute',
    width: SPIN_DOT_RADIUS * 2,
    height: SPIN_DOT_RADIUS * 2,
    borderRadius: SPIN_DOT_RADIUS,
    backgroundColor: '#4b94ff',
    borderWidth: 2,
    borderColor: '#d8ecff',
    shadowColor: '#4b94ff',
    shadowOpacity: 0.55,
    shadowRadius: 10
  },
  spinDotActive: {
    transform: [{ scale: 1.08 }],
    shadowOpacity: 0.78,
    shadowRadius: 14
  },
  swingGuideWrap: {
    position: 'absolute',
    bottom: -28,
    width: SHOT_PAD_SIZE + 40,
    alignItems: 'center'
  },
  swingGuideText: {
    color: '#d0dfcb',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center'
  },
  shotDoneButton: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 10
  },
  shotDoneText: {
    color: '#f6fbef',
    fontSize: 13,
    fontWeight: '700'
  },
  spinDotClosed: {
    position: 'absolute',
    width: SPIN_DOT_RADIUS * 2,
    height: SPIN_DOT_RADIUS * 2,
    borderRadius: SPIN_DOT_RADIUS,
    backgroundColor: '#4b94ff',
    borderWidth: 2,
    borderColor: '#d8ecff'
  },
  clubSelectorWrap: {
    borderRadius: 14,
    backgroundColor: 'rgba(7, 11, 9, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 8,
    gap: 8
  },
  clubPickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8
  },
  clubPickerTriggerLabel: {
    color: '#9fb59f',
    fontSize: 11,
    fontWeight: '700'
  },
  clubPickerTriggerValue: {
    flex: 1,
    color: '#f5fbef',
    fontSize: 13,
    fontWeight: '700'
  },
  clubPickerTriggerChevron: {
    color: '#d6e7d0',
    fontSize: 11,
    fontWeight: '700'
  },
  clubScrollContent: {
    paddingHorizontal: 8,
    gap: 7
  },
  clubChip: {
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center'
  },
  clubChipActive: {
    backgroundColor: '#2c6842',
    borderColor: '#95d28a'
  },
  clubChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#d6e7d0'
  },
  clubChipTextActive: {
    color: '#f6fbf4'
  },
  helperText: {
    fontSize: 12,
    color: '#d0dfcb',
    textAlign: 'center'
  },
  lastShotText: {
    fontSize: 12,
    color: '#aeca9f',
    textAlign: 'center'
  },
  warning: {
    fontSize: 12,
    color: '#e1917f',
    textAlign: 'center',
    fontWeight: '700'
  },
  success: {
    fontSize: 12,
    color: '#9ed98f',
    textAlign: 'center',
    fontWeight: '700'
  },
  sunkRow: {
    alignItems: 'center',
    gap: 6
  },
  nextHoleBtn: {
    backgroundColor: '#4a9e3f',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8
  },
  nextHoleBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700'
  },
  overSwingText: {
    color: '#e07f6d'
  },
  disabled: {
    opacity: 0.45
  },
  summary: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(232, 243, 225, 0.92)'
  },
  summaryTitle: {
    fontWeight: '800',
    color: '#1d321f'
  },
  summaryText: {
    color: '#2f4730'
  },
  liePip: {
    position: 'absolute',
    top: 130,
    left: 10,
    backgroundColor: 'rgba(20, 35, 20, 0.88)',
    borderRadius: 12,
    padding: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 100
  },
  lieColorBar: {
    width: 4,
    height: 28,
    borderRadius: 2
  },
  lieEmoji: {
    fontSize: 18
  },
  lieLabel: {
    color: '#d4e8ce',
    fontSize: 12,
    fontWeight: '700'
  },
  liePenalty: {
    color: '#ff9944',
    fontSize: 10,
    fontWeight: '600'
  },
  shotStatsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200
  },
  shotStatsCard: {
    backgroundColor: 'rgba(20, 38, 22, 0.96)',
    borderRadius: 16,
    padding: 20,
    width: 280,
    borderWidth: 1,
    borderColor: 'rgba(100, 180, 100, 0.3)'
  },
  shotStatsTitle: {
    color: '#e8f3e0',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center'
  },
  swingPathBox: {
    marginBottom: 12,
    alignItems: 'center'
  },
  swingPathLabel: {
    color: '#8aab82',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4
  },
  swingPathCanvas: {
    width: 120,
    height: 150,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden'
  },
  swingPathCenterLine: {
    position: 'absolute',
    left: 59,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 1
  },
  swingPathDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4
  },
  swingPathLegend: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4
  },
  swingPathLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  swingPathLegendDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  swingPathLegendText: {
    color: '#8aab82',
    fontSize: 9,
    fontWeight: '600'
  },
  shotStatsGrid: {
    gap: 6
  },
  shotStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)'
  },
  shotStatLabel: {
    color: '#8aab82',
    fontSize: 13,
    fontWeight: '600'
  },
  shotStatValue: {
    color: '#e0f0d8',
    fontSize: 13,
    fontWeight: '700'
  },
  shotStatTotal: {
    color: '#ffdd44',
    fontWeight: '800'
  },
  shotStatsDismiss: {
    color: 'rgba(200,220,200,0.5)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12
  }
});
