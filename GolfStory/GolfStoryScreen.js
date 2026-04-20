import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const TILE = 16;
const MAP_W = 20;
const MAP_H = 30;
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;
const GRAVITY = 70;
const HOLE_RADIUS = 4;
const YARDS_PER_TILE = 10;
const MAX_LEAVES = 14;

const T_ROUGH = 0;
const T_FAIRWAY = 1;
const T_GREEN = 2;
const T_SAND = 3;
const T_WATER = 4;
const T_FRINGE = 5;
const T_TEE = 6;
const T_SHORE = 7;

function hRand(x, y, seed) {
  let n = (((x | 0) & 0xffff) * 73856093) ^ (((y | 0) & 0xffff) * 19349663) ^ (((seed | 0) & 0xffff) * 83492791);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 0xffffffff;
}

const SURFACES = [
  {
    type: T_FAIRWAY,
    shape: { kind: 'polygon', points: [
      [7.2, 8.8], [10, 8.6], [12.8, 8.8], [13.4, 9.4], [13.9, 10.4],
      [14.2, 11.8], [14.3, 13.5], [14.1, 15.5], [13.9, 17.5],
      [13.7, 19.3], [13.4, 20.8], [13, 21.9], [12.6, 22.8],
      [12.2, 23.6], [11.8, 24.4], [11.4, 25.1], [11.1, 25.7],
      [9, 25.7], [8.9, 25.1], [8.5, 24.4], [8.1, 23.6],
      [7.7, 22.8], [7.3, 21.9], [7, 20.8], [6.7, 19.3],
      [6.4, 17.5], [6.2, 15.5], [6, 13.5], [6.1, 11.8],
      [6.3, 10.4], [6.8, 9.4],
    ]},
  },
  {
    type: T_SAND,
    shape: { kind: 'polygon', points: [
      [12.9, 10.8], [13.8, 10.7], [14.6, 11], [14.9, 11.8],
      [14.8, 12.8], [14.4, 13.6], [13.6, 13.8], [12.9, 13.5],
      [12.5, 12.6], [12.6, 11.5],
    ]},
  },
  {
    type: T_SAND,
    shape: { kind: 'circle', cx: 13.9, cy: 7.4, r: 1.1 },
  },
  {
    type: T_SHORE,
    shape: { kind: 'polygon', points: [
      [1.05, 12.7], [3, 12.45], [4.85, 12.75], [5.75, 13.55], [6.15, 15.05],
      [6.2, 17.05], [5.85, 18.6], [4.95, 19.3], [3.55, 19.65], [1.9, 19.55],
      [0.55, 18.75], [0.25, 17.0], [0.35, 15.1], [0.7, 13.7],
    ]},
  },
  {
    type: T_WATER,
    shape: { kind: 'polygon', points: [
      [1.5, 13.2], [3, 13], [4.8, 13.3], [5.6, 14], [5.9, 15.3],
      [5.9, 17], [5.6, 18.4], [4.8, 19], [3.5, 19.3], [2, 19.2],
      [1, 18.4], [0.7, 17], [0.8, 15.3], [1.1, 14],
    ]},
  },
  {
    type: T_FRINGE,
    shape: { kind: 'annulus', cx: 9.5, cy: 5.5, inner: 3.2, outer: 4.05 },
  },
  {
    type: T_GREEN,
    shape: { kind: 'circle', cx: 9.5, cy: 5.5, r: 3.2 },
  },
  {
    type: T_TEE,
    shape: { kind: 'rect', x: 8.7, y: 24.2, w: 1.6, h: 1.1 },
  },
];

for (const surf of SURFACES) {
  const s = surf.shape;
  if (s.kind === 'circle') {
    s._bbox = [(s.cx - s.r) * TILE, (s.cy - s.r) * TILE, (s.cx + s.r) * TILE, (s.cy + s.r) * TILE];
  } else if (s.kind === 'annulus') {
    s._bbox = [(s.cx - s.outer) * TILE, (s.cy - s.outer) * TILE, (s.cx + s.outer) * TILE, (s.cy + s.outer) * TILE];
  } else if (s.kind === 'rect') {
    s._bbox = [s.x * TILE, s.y * TILE, (s.x + s.w) * TILE, (s.y + s.h) * TILE];
  } else if (s.kind === 'polygon') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of s.points) {
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    s._bbox = [x0 * TILE, y0 * TILE, x1 * TILE, y1 * TILE];
  }
}

function pointInShape(x, y, shape) {
  const bb = shape._bbox;
  if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) return false;
  if (shape.kind === 'circle') {
    const dx = x - shape.cx * TILE, dy = y - shape.cy * TILE;
    return dx * dx + dy * dy <= (shape.r * TILE) * (shape.r * TILE);
  }
  if (shape.kind === 'annulus') {
    const dx = x - shape.cx * TILE, dy = y - shape.cy * TILE;
    const d2 = dx * dx + dy * dy;
    const ro = shape.outer * TILE, ri = shape.inner * TILE;
    return d2 <= ro * ro && d2 >= ri * ri;
  }
  if (shape.kind === 'rect') return true;
  if (shape.kind === 'polygon') {
    let inside = false;
    const pts = shape.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0] * TILE, yi = pts[i][1] * TILE;
      const xj = pts[j][0] * TILE, yj = pts[j][1] * TILE;
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return false;
}

function surfaceAtPixel(x, y) {
  for (let i = SURFACES.length - 1; i >= 0; i--) {
    if (pointInShape(x, y, SURFACES[i].shape)) return SURFACES[i].type;
  }
  return T_ROUGH;
}

function surfaceAt(wx, wy) {
  return surfaceAtPixel(wx, wy);
}

const COLORS = {
  skyVoid: '#0b1a10',
  roughA: '#3d8232', roughB: '#326f26', roughC: '#24571c', roughD: '#52a640',
  fairA: '#5eae3a', fairB: '#52a032', fairC: '#418526', fairD: '#7ac94f',
  greenA: '#83cf52', greenB: '#77c146', greenC: '#5eaa32', greenD: '#9fde6a',
  fringeA: '#6db847', fringeB: '#5ca636', fringeC: '#4a8f24', fringeD: '#85cf5c',
  teeA: '#6fc045', teeB: '#5ab030', teeC: '#4a9420',
  sandA: '#ecd6a0', sandB: '#d8bd78', sandC: '#b8995c', sandD: '#f7e7ba',
  shoreA: '#9d7946', shoreB: '#7d5a32', shoreC: '#5c4322', shoreD: '#b88c58',
  waterA: '#4b9bd9', waterB: '#3a82c0', waterC: '#a8d6f0', waterD: '#2b6fab',
  trunkDark: '#3f2610', trunk: '#5a3a1a', trunkHi: '#7d5428',
  tree0: '#163016', tree1: '#224a22', tree2: '#2e6b2e',
  tree3: '#3f8c3f', tree4: '#5db35d', tree5: '#8ed88e',
  bushShadow: '#1e4a1e',
  shadow: 'rgba(0,0,0,0.3)',
  skin: '#f1b884', skinShadow: '#d49864',
  hat: '#c83030', hatDark: '#8a1e1e', hatHi: '#ea5a5a', hatBand: '#161616',
  shirt: '#2b70b7', shirtDark: '#1a4c88', shirtHi: '#4e95d8',
  pants: '#222f4a', pantsDark: '#121a2c',
  shoe: '#141414', shoeHi: '#3a3a3a',
  flagRed: '#e33838', flagDark: '#a82222', flagHi: '#ff6060', flagYellow: '#fbe043',
  pole: '#efe9cc', poleDark: '#a8a280',
  cup: '#141414',
  ballShadow: '#c9c9c9', ballWhite: '#ffffff',
  flowerRed: '#e94343', flowerYellow: '#fbe043', flowerWhite: '#ffffff',
  flowerStem: '#2d6a24', flowerCenter: '#fbe043',
  pebble: '#7e7966', pebbleHi: '#a9a38d',
};
const LEAF_COLORS = ['#d88a2e', '#e8a840', '#c66a22', '#88a028', '#a88a44', '#d4b048'];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
const RGB = {};
for (const [k, v] of Object.entries(COLORS)) {
  if (v && typeof v === 'string' && v.startsWith('#')) RGB[k] = hexToRgb(v);
}

function paletteFor(type) {
  switch (type) {
    case T_FAIRWAY: return [RGB.fairA, RGB.fairB, RGB.fairC, RGB.fairD];
    case T_GREEN:   return [RGB.greenA, RGB.greenB, RGB.greenC, RGB.greenD];
    case T_FRINGE:  return [RGB.fringeA, RGB.fringeB, RGB.fringeC, RGB.fringeD];
    case T_TEE:     return [RGB.teeA, RGB.teeB, RGB.teeC, RGB.teeA];
    case T_SAND:    return [RGB.sandA, RGB.sandB, RGB.sandC, RGB.sandD];
    case T_SHORE:   return [RGB.shoreA, RGB.shoreB, RGB.shoreC, RGB.shoreD];
    case T_WATER:   return [RGB.waterA, RGB.waterD, RGB.waterB, RGB.waterC];
    default:        return [RGB.roughA, RGB.roughB, RGB.roughC, RGB.roughD];
  }
}

function pixelColor(x, y, type) {
  const [base, mid, dark, light] = paletteFor(type);
  let c = base;
  const noise = hRand(x, y, 1);
  if (type !== T_WATER && type !== T_SAND && type !== T_SHORE && noise > 0.52 && noise < 0.66) c = mid;
  if (type === T_FAIRWAY) {
    const tx = (x / TILE) | 0;
    const ty = (y / TILE) | 0;
    const horiz = ((tx + ty) & 1) === 0;
    if (horiz) { if (x % 3 === 0) c = mid; }
    else { if (y % 3 === 0) c = mid; }
  } else if (type === T_GREEN) {
    if (y % 2 === 0) c = mid;
  } else if (type === T_FRINGE) {
    if (y % 2 === 0) c = mid;
    if ((x + y) % 4 === 0) c = dark;
  } else if (type === T_TEE) {
    if ((x + y) % 3 === 0) c = mid;
  } else if (type === T_SAND) {
    if (noise > 0.55) c = mid;
  } else if (type === T_SHORE) {
    if (noise > 0.5) c = mid;
    if (noise > 0.74) c = dark;
  } else if (type === T_WATER) {
    const j = y % 4;
    const row = (y / 4) | 0;
    const startX = (row & 1) === 0 ? 1 : 5;
    const rel = ((x - startX) % 12 + 12) % 12;
    if (j === 2 && rel < 5) c = mid;
    else if (j === 0 && rel >= 7 && rel < 10) c = mid;
  }
  const dThresh = type === T_GREEN ? 0.97
                : type === T_FAIRWAY || type === T_FRINGE ? 0.96
                : type === T_SAND || type === T_SHORE ? 0.92 : 0.92;
  if (hRand(x, y, 10) > dThresh) c = dark;
  const lThresh = type === T_ROUGH ? 0.98 : 0.97;
  if (hRand(x, y, 20) > lThresh) c = light;
  if (type === T_SAND && hRand(x, y, 30) > 0.97) c = light;
  if (type === T_SHORE && hRand(x, y, 35) > 0.96) c = light;
  if (type === T_WATER && hRand(x, y, 40) > 0.985) c = light;
  return c;
}

function buildWorldImageData() {
  const data = new Uint8ClampedArray(WORLD_W * WORLD_H * 4);
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const type = surfaceAtPixel(x + 0.5, y + 0.5);
      const rgb = pixelColor(x, y, type);
      const i = (y * WORLD_W + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }
  }
  return new ImageData(data, WORLD_W, WORLD_H);
}

const WATER_PIXELS = (() => {
  const out = [];
  for (let y = 0; y < WORLD_H; y += 2) {
    for (let x = 0; x < WORLD_W; x += 2) {
      if (surfaceAtPixel(x + 0.5, y + 0.5) === T_WATER) {
        out.push([x, y]);
      }
    }
  }
  return out;
})();

const CLUBS = [
  { key: 'DR', name: 'Driver',      short: 'DR', v: 225, angle: 20, accMult: 1.25, powerRate: 1.2 },
  { key: '3W', name: '3-Wood',      short: '3W', v: 205, angle: 24, accMult: 1.15, powerRate: 1.2 },
  { key: '5W', name: '5-Wood',      short: '5W', v: 190, angle: 28, accMult: 1.08, powerRate: 1.2 },
  { key: '5I', name: '5-Iron',      short: '5I', v: 170, angle: 33, accMult: 1.0, powerRate: 1.2 },
  { key: '7I', name: '7-Iron',      short: '7I', v: 148, angle: 39, accMult: 0.95, powerRate: 1.25 },
  { key: '9I', name: '9-Iron',      short: '9I', v: 128, angle: 45, accMult: 0.9, powerRate: 1.3 },
  { key: 'PW', name: 'Pitch Wedge', short: 'PW', v: 112, angle: 51, accMult: 0.85, powerRate: 1.35 },
  { key: 'SW', name: 'Sand Wedge',  short: 'SW', v: 96,  angle: 58, accMult: 0.8, powerRate: 1.4 },
  { key: 'PT', name: 'Putter',      short: 'PT', v: 72,  angle: 0,  accMult: 0.55, powerRate: 0.7 },
];

const GREEN_SLOPE = { angle: Math.PI * 0.3, mag: 7 };

const SURFACE_PROPS = {
  [T_GREEN]:   { bounceKeep: 0.22, rollDecel: 0.85, label: 'Green', slopeAng: GREEN_SLOPE.angle, slopeMag: GREEN_SLOPE.mag },
  [T_FAIRWAY]: { bounceKeep: 0.38, rollDecel: 0.55, label: 'Fairway' },
  [T_ROUGH]:   { bounceKeep: 0.18, rollDecel: 2.2, label: 'Rough' },
  [T_FRINGE]:  { bounceKeep: 0.24, rollDecel: 0.8, label: 'Fringe' },
  [T_TEE]:     { bounceKeep: 0.36, rollDecel: 0.6, label: 'Tee Box' },
  [T_SAND]:    { bounceKeep: 0.06, rollDecel: 4.5, label: 'Bunker' },
  [T_SHORE]:   { bounceKeep: 0.12, rollDecel: 3.0, label: 'Dirt' },
  [T_WATER]:   { bounceKeep: 0, rollDecel: 0, label: 'Water', hazard: true },
};

function surfacePropsAt(wx, wy) {
  if (wx < 0 || wx > WORLD_W || wy < 0 || wy > WORLD_H) {
    return { bounceKeep: 0, rollDecel: 0, label: 'Out of Bounds', ob: true };
  }
  const s = surfaceAt(wx, wy);
  return SURFACE_PROPS[s] || SURFACE_PROPS[T_ROUGH];
}

const TREES = [
  { x: 3.5, y: 8 }, { x: 16.5, y: 6.5 }, { x: 2.5, y: 11.2 }, { x: 17.5, y: 14 },
  { x: 4.5, y: 22 }, { x: 14.5, y: 24.5 }, { x: 1.5, y: 3.5 }, { x: 18.5, y: 2.5 },
  { x: 2.5, y: 27.5 }, { x: 17.5, y: 28 }, { x: 6.5, y: 27.5 }, { x: 13.5, y: 21.5 },
  { x: 1.5, y: 20.5 }, { x: 15.5, y: 19.5 }, { x: 0.5, y: 9 }, { x: 19.5, y: 10 },
  { x: 2, y: 23.5 }, { x: 16.5, y: 10.5 }, { x: 16.5, y: 16.5 },
  { x: 18.5, y: 19 }, { x: 0.5, y: 26 }, { x: 19.5, y: 23 }, { x: 4, y: 25.5 },
  { x: 15, y: 28 },
];
const FLAG = { x: 9.5, y: 5.5 };
const TEE = { x: 9.5, y: 24.8 };

const BUSHES = (() => {
  const out = [];
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const cx = (tx + 0.5) * TILE;
      const cy = (ty + 0.5) * TILE;
      const t = surfaceAtPixel(cx, cy);
      if (t !== T_ROUGH) continue;
      if (hRand(tx, ty, 800) < 0.90) continue;
      const px = tx * TILE + Math.floor(hRand(tx, ty, 801) * (TILE - 4)) + 2;
      const py = ty * TILE + Math.floor(hRand(tx, ty, 802) * (TILE - 4)) + 2;
      let tooClose = false;
      for (const tr of TREES) {
        if (Math.hypot(tr.x * TILE - px, tr.y * TILE - py) < 18) { tooClose = true; break; }
      }
      if (!tooClose) out.push({ x: px / TILE, y: py / TILE, variant: Math.floor(hRand(tx, ty, 803) * 3) });
    }
  }
  return out;
})();

const PROPS = (() => {
  const out = [];
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const cx = (tx + 0.5) * TILE;
      const cy = (ty + 0.5) * TILE;
      const type = surfaceAtPixel(cx, cy);
      if (type === T_ROUGH) {
        const tufts = Math.floor(hRand(tx, ty, 500) * 3);
        for (let i = 0; i < tufts; i++) {
          const px = tx * TILE + Math.floor(hRand(tx, ty, 501 + i) * (TILE - 2)) + 1;
          const py = ty * TILE + Math.floor(hRand(tx, ty, 520 + i) * (TILE - 2)) + 1;
          if (surfaceAtPixel(px, py) === T_ROUGH) out.push({ kind: 'tuft', x: px, y: py });
        }
        if (hRand(tx, ty, 550) > 0.86) {
          const px = tx * TILE + Math.floor(hRand(tx, ty, 551) * (TILE - 2)) + 1;
          const py = ty * TILE + Math.floor(hRand(tx, ty, 552) * (TILE - 2)) + 1;
          if (surfaceAtPixel(px, py) === T_ROUGH) {
            const c = hRand(tx, ty, 553);
            out.push({ kind: 'flower', x: px, y: py, color: c < 0.4 ? 'red' : c < 0.7 ? 'yellow' : 'white' });
          }
        }
        if (hRand(tx, ty, 570) > 0.95) {
          const px = tx * TILE + Math.floor(hRand(tx, ty, 571) * (TILE - 2)) + 1;
          const py = ty * TILE + Math.floor(hRand(tx, ty, 572) * (TILE - 2)) + 1;
          if (surfaceAtPixel(px, py) === T_ROUGH) out.push({ kind: 'pebble', x: px, y: py });
        }
      } else if (type === T_FAIRWAY) {
        if (hRand(tx, ty, 600) > 0.94) {
          const px = tx * TILE + Math.floor(hRand(tx, ty, 601) * (TILE - 2)) + 1;
          const py = ty * TILE + Math.floor(hRand(tx, ty, 602) * (TILE - 2)) + 1;
          if (surfaceAtPixel(px, py) === T_FAIRWAY) out.push({ kind: 'daisy', x: px, y: py });
        }
      } else if (type === T_SHORE) {
        if (hRand(tx, ty, 650) > 0.7) {
          const px = tx * TILE + Math.floor(hRand(tx, ty, 651) * (TILE - 2)) + 1;
          const py = ty * TILE + Math.floor(hRand(tx, ty, 652) * (TILE - 2)) + 1;
          if (surfaceAtPixel(px, py) === T_SHORE) out.push({ kind: 'pebble', x: px, y: py });
        }
      }
    }
  }
  return out;
})();

function drawProp(ctx, p) {
  if (p.kind === 'tuft') {
    ctx.fillStyle = COLORS.roughC;
    ctx.fillRect(p.x, p.y, 1, 2);
    ctx.fillRect(p.x + 1, p.y - 1, 1, 2);
    ctx.fillRect(p.x - 1, p.y, 1, 1);
    ctx.fillStyle = COLORS.roughD;
    ctx.fillRect(p.x, p.y - 1, 1, 1);
  } else if (p.kind === 'flower') {
    ctx.fillStyle = COLORS.flowerStem;
    ctx.fillRect(p.x, p.y, 1, 2);
    const petal = p.color === 'red' ? COLORS.flowerRed : p.color === 'yellow' ? COLORS.flowerYellow : COLORS.flowerWhite;
    ctx.fillStyle = petal;
    ctx.fillRect(p.x - 1, p.y - 1, 1, 1);
    ctx.fillRect(p.x + 1, p.y - 1, 1, 1);
    ctx.fillRect(p.x, p.y - 2, 1, 1);
    ctx.fillStyle = COLORS.flowerCenter;
    ctx.fillRect(p.x, p.y - 1, 1, 1);
  } else if (p.kind === 'daisy') {
    ctx.fillStyle = COLORS.flowerWhite;
    ctx.fillRect(p.x, p.y, 1, 1);
    ctx.fillStyle = COLORS.flowerCenter;
    ctx.fillRect(p.x, p.y - 1, 1, 1);
  } else if (p.kind === 'pebble') {
    ctx.fillStyle = COLORS.pebble;
    ctx.fillRect(p.x, p.y, 2, 1);
    ctx.fillStyle = COLORS.pebbleHi;
    ctx.fillRect(p.x, p.y, 1, 1);
  }
}

function drawBush(ctx, px, py, variant, time, windStrength) {
  const x = Math.floor(px), y = Math.floor(py);
  const seed = (x * 0.31 + y * 0.67);
  const sway = Math.sin(time * 0.0024 + seed) * windStrength * 0.8;
  const swayFloor = Math.floor(sway);
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath(); ctx.ellipse(x, y + 1, 5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.bushShadow;
  ctx.beginPath(); ctx.ellipse(x + swayFloor * 0.4, y - 1, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree1;
  ctx.beginPath(); ctx.ellipse(x + swayFloor * 0.6, y - 2, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree2;
  ctx.beginPath(); ctx.ellipse(x - 1 + swayFloor, y - 3, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree3;
  ctx.fillRect(x - 2 + swayFloor, y - 4, 2, 1);
  ctx.fillRect(x + swayFloor, y - 4, 1, 1);
  if (variant === 1) {
    ctx.fillStyle = COLORS.flowerRed;
    ctx.fillRect(x + swayFloor - 1, y - 3, 1, 1);
    ctx.fillRect(x + swayFloor + 1, y - 2, 1, 1);
  } else if (variant === 2) {
    ctx.fillStyle = COLORS.flowerYellow;
    ctx.fillRect(x + swayFloor, y - 4, 1, 1);
    ctx.fillRect(x + swayFloor - 2, y - 3, 1, 1);
  }
}

function drawTree(ctx, px, py, time, windStrength) {
  const x = Math.floor(px), y = Math.floor(py);
  const seed = (x * 0.29 + y * 0.71);
  const sway = Math.sin(time * 0.0018 + seed) * windStrength * 1.4;
  const swayFloor = Math.floor(sway);
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 2, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.trunkDark;
  ctx.fillRect(x - 2, y - 7, 4, 7);
  ctx.fillStyle = COLORS.trunk;
  ctx.fillRect(x - 2, y - 7, 3, 7);
  ctx.fillStyle = COLORS.trunkHi;
  ctx.fillRect(x - 2, y - 6, 1, 5);
  ctx.fillStyle = COLORS.tree0;
  ctx.beginPath(); ctx.ellipse(x + 2 + swayFloor, y - 12, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree1;
  ctx.beginPath(); ctx.ellipse(x + 1 + swayFloor, y - 13, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree2;
  ctx.beginPath(); ctx.ellipse(x + swayFloor, y - 14, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree3;
  ctx.beginPath(); ctx.ellipse(x - 2 + swayFloor, y - 15, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree4;
  ctx.beginPath(); ctx.ellipse(x - 3 + swayFloor, y - 16, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree5;
  ctx.fillRect(x - 4 + swayFloor, y - 17, 2, 1);
  ctx.fillRect(x - 3 + swayFloor, y - 17, 1, 1);
  ctx.fillStyle = COLORS.tree0;
  ctx.fillRect(x + 5 + swayFloor, y - 10, 1, 1);
  ctx.fillRect(x + 6 + swayFloor, y - 13, 1, 1);
  ctx.fillRect(x - 7 + swayFloor, y - 12, 1, 1);
  ctx.fillStyle = COLORS.tree4;
  ctx.fillRect(x + 4 + swayFloor, y - 15, 1, 1);
  ctx.fillRect(x - 6 + swayFloor, y - 14, 1, 1);
}

function drawFlag(ctx, px, py, time) {
  const x = Math.floor(px), y = Math.floor(py);
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath(); ctx.ellipse(x, y + 1, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.cup;
  ctx.fillRect(x - 2, y - 1, 4, 2);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x - 2, y - 1, 4, 1);
  ctx.fillStyle = COLORS.poleDark;
  ctx.fillRect(x + 1, y - 17, 1, 17);
  ctx.fillStyle = COLORS.pole;
  ctx.fillRect(x, y - 17, 1, 17);
  const wave = Math.sin(time * 0.004);
  const flapX = x + 2;
  const flapY = y - 17;
  ctx.fillStyle = COLORS.flagRed;
  ctx.beginPath();
  ctx.moveTo(flapX, flapY);
  ctx.lineTo(flapX + 8, flapY + 1 + wave * 0.5);
  ctx.lineTo(flapX + 8, flapY + 3 + wave);
  ctx.lineTo(flapX, flapY + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.flagDark;
  ctx.beginPath();
  ctx.moveTo(flapX, flapY + 3);
  ctx.lineTo(flapX + 6, flapY + 3 + wave * 0.7);
  ctx.lineTo(flapX + 7, flapY + 4 + wave);
  ctx.lineTo(flapX, flapY + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.flagHi;
  ctx.fillRect(flapX, flapY, 5, 1);
  ctx.fillStyle = COLORS.flagYellow;
  ctx.fillRect(flapX + 2, flapY + 2, 1, 1);
}

function drawGolfer(ctx, px, py, facing, phase) {
  const x = Math.floor(px), y = Math.floor(py);
  const moving = phase !== null;
  const step = moving ? (Math.sin(phase) > 0 ? 1 : 0) : 0;
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath(); ctx.ellipse(x, y, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  const lfX = x - 3 + (moving && step ? -1 : 0);
  const rfX = x + 1 + (moving && !step ? 1 : 0);
  ctx.fillStyle = COLORS.shoe;
  ctx.fillRect(lfX, y - 1, 2, 1);
  ctx.fillRect(rfX, y - 1, 2, 1);
  ctx.fillStyle = COLORS.shoeHi;
  ctx.fillRect(lfX, y - 1, 1, 1);
  ctx.fillRect(rfX, y - 1, 1, 1);
  ctx.fillStyle = COLORS.pants;
  ctx.fillRect(x - 3, y - 4, 2, 3);
  ctx.fillRect(x + 1, y - 4, 2, 3);
  ctx.fillStyle = COLORS.pantsDark;
  ctx.fillRect(x - 3, y - 4, 1, 3);
  ctx.fillRect(x + 2, y - 4, 1, 3);
  ctx.fillStyle = COLORS.pants;
  ctx.fillRect(x - 3, y - 8, 6, 4);
  ctx.fillStyle = COLORS.pantsDark;
  ctx.fillRect(x - 3, y - 8, 6, 1);
  ctx.fillStyle = COLORS.shirt;
  ctx.fillRect(x - 4, y - 14, 8, 6);
  ctx.fillStyle = COLORS.shirtDark;
  ctx.fillRect(x - 4, y - 9, 8, 1);
  ctx.fillStyle = COLORS.shirtHi;
  ctx.fillRect(x - 4, y - 14, 8, 1);
  ctx.fillStyle = COLORS.shirt;
  ctx.fillRect(x - 5, y - 13, 1, 3);
  ctx.fillRect(x + 4, y - 13, 1, 3);
  ctx.fillStyle = COLORS.skin;
  ctx.fillRect(x - 5, y - 10, 1, 2);
  ctx.fillRect(x + 4, y - 10, 1, 2);
  ctx.fillStyle = COLORS.skinShadow;
  ctx.fillRect(x - 1, y - 15, 3, 1);
  ctx.fillStyle = COLORS.skin;
  ctx.fillRect(x - 3, y - 19, 6, 4);
  ctx.fillStyle = COLORS.skinShadow;
  ctx.fillRect(x + 2, y - 19, 1, 4);
  ctx.fillRect(x - 3, y - 16, 6, 1);
  ctx.fillStyle = COLORS.hat;
  ctx.fillRect(x - 4, y - 21, 8, 2);
  ctx.fillRect(x - 3, y - 22, 6, 1);
  ctx.fillStyle = COLORS.hatHi;
  ctx.fillRect(x - 3, y - 22, 3, 1);
  ctx.fillStyle = COLORS.hatDark;
  ctx.fillRect(x - 4, y - 19, 8, 1);
  ctx.fillRect(x + 3, y - 21, 1, 2);
  ctx.fillStyle = COLORS.hatBand;
  ctx.fillRect(x - 4, y - 20, 8, 1);
  if (facing === 'S') {
    ctx.fillStyle = COLORS.cup;
    ctx.fillRect(x - 2, y - 18, 1, 1);
    ctx.fillRect(x + 1, y - 18, 1, 1);
    ctx.fillStyle = '#a83030';
    ctx.fillRect(x, y - 17, 1, 1);
  } else if (facing === 'E') {
    ctx.fillStyle = COLORS.cup;
    ctx.fillRect(x + 1, y - 18, 1, 1);
  } else if (facing === 'W') {
    ctx.fillStyle = COLORS.cup;
    ctx.fillRect(x - 2, y - 18, 1, 1);
  }
}

function drawBall(ctx, px, py, z) {
  const lift = Math.max(0, z | 0);
  const x = Math.floor(px), y = Math.floor(py);
  ctx.fillStyle = COLORS.shadow;
  const inset = Math.min(1, lift / 20);
  ctx.fillRect(x - 1 + inset, y, 3 - inset * 2, 1);
  ctx.fillStyle = COLORS.ballShadow;
  ctx.fillRect(x - 1, y - 2 - lift, 2, 2);
  ctx.fillStyle = COLORS.ballWhite;
  ctx.fillRect(x - 1, y - 2 - lift, 1, 1);
}

function drawLeaf(ctx, leaf, time) {
  const x = Math.floor(leaf.x), y = Math.floor(leaf.y);
  const wob = Math.sin(time * 0.01 + leaf.phase);
  ctx.fillStyle = leaf.color;
  if (wob > 0) {
    ctx.fillRect(x, y, 2, 1);
    ctx.fillRect(x, y + 1, 1, 1);
  } else {
    ctx.fillRect(x, y, 1, 2);
    ctx.fillRect(x + 1, y, 1, 1);
  }
}

function drawWaterSparkles(ctx, time) {
  const phase = time * 0.0016;
  ctx.fillStyle = COLORS.waterC;
  for (let i = 0; i < WATER_PIXELS.length; i++) {
    const [wx, wy] = WATER_PIXELS[i];
    const s = Math.sin(phase + wx * 0.09 + wy * 0.06);
    if (s > 0.85) ctx.fillRect(wx, wy, 1, 1);
  }
  ctx.fillStyle = COLORS.waterD;
  for (let i = 0; i < WATER_PIXELS.length; i += 3) {
    const [wx, wy] = WATER_PIXELS[i];
    const s = Math.sin(phase * 1.3 + wx * 0.05 + wy * 0.08);
    if (s > 0.88) ctx.fillRect(wx + 1, wy, 1, 1);
  }
}

function simulateFlight(startX, startY, aimAngle, accuracy, power, club, windX, windY, stopAtGround) {
  const v0 = club.v * power;
  const angleRad = (club.angle * Math.PI) / 180;
  const defl = ((accuracy * 18 * club.accMult) * Math.PI) / 180;
  const dir = aimAngle + defl;
  const cosAng = club.angle === 0 ? 1 : Math.cos(angleRad);
  let vx = v0 * cosAng * Math.sin(dir);
  let vy = v0 * cosAng * -Math.cos(dir);
  let vz = club.angle === 0 ? 0 : v0 * Math.sin(angleRad);
  let x = startX, y = startY, z = 0;
  const stepDt = 0.04;
  const maxSteps = 180;
  const points = [];
  for (let s = 0; s < maxSteps; s++) {
    const hf = Math.min(1, z / 15);
    vx += windX * hf * stepDt;
    vy += windY * hf * stepDt;
    vz -= GRAVITY * stepDt;
    const d = 0.1 * stepDt;
    vx *= 1 - d;
    vy *= 1 - d;
    vz *= 1 - d * 0.5;
    x += vx * stepDt;
    y += vy * stepDt;
    z += vz * stepDt;
    points.push({ x, y, z });
    if (stopAtGround && z <= 0 && s > 1) break;
  }
  return points;
}

function drawShotPredict(ctx, points) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let i = 2; i < points.length; i += 3) {
    const p = points[i];
    if (p.x < 0 || p.x > WORLD_W || p.y < 0 || p.y > WORLD_H) continue;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);
  }
  for (let i = 2; i < points.length; i += 2) {
    const p = points[i];
    if (p.x < 0 || p.x > WORLD_W || p.y < 0 || p.y > WORLD_H) continue;
    const a = 0.95 - 0.55 * (i / points.length);
    ctx.fillStyle = `rgba(255,246,216,${a})`;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y - p.z), 1, 1);
  }
  if (points.length > 0) {
    const last = points[points.length - 1];
    const lx = Math.floor(last.x), ly = Math.floor(last.y);
    ctx.fillStyle = COLORS.flagRed;
    ctx.fillRect(lx - 2, ly, 5, 1);
    ctx.fillRect(lx, ly - 2, 1, 5);
    ctx.fillStyle = '#fff';
    ctx.fillRect(lx, ly, 1, 1);
  }
}

function drawFlightTrail(ctx, trail) {
  for (let i = 0; i < trail.length; i++) {
    const p = trail[i];
    const a = 0.75 * (i / trail.length);
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y - p.z), 1, 1);
  }
}

function computeCarry(club, power) {
  const v = club.v * power;
  const angleRad = (club.angle * Math.PI) / 180;
  if (club.angle === 0) return v * 0.9;
  return Math.max(0, (v * v * Math.sin(2 * angleRad)) / GRAVITY);
}

function launchBall(b, aimAngle, power, accuracyOffset, club) {
  const v0 = club.v * power;
  const angleRad = (club.angle * Math.PI) / 180;
  const deflectionRad = ((accuracyOffset * 18 * club.accMult) * Math.PI) / 180;
  const effectiveDir = aimAngle + deflectionRad;
  const horizVel = club.angle === 0 ? v0 : v0 * Math.cos(angleRad);
  b.vx = horizVel * Math.sin(effectiveDir);
  b.vy = horizVel * -Math.cos(effectiveDir);
  b.vz = club.angle === 0 ? 0 : v0 * Math.sin(angleRad);
  b.z = 0;
  b.state = 'flying';
  b.trail = [];
}

function stepBall(b, dt, windX, windY, flagX, flagY) {
  if (b.state === 'flying') {
    const heightFactor = Math.min(1, b.z / 15);
    b.vx += windX * heightFactor * dt;
    b.vy += windY * heightFactor * dt;
    b.vz -= GRAVITY * dt;
    const drag = 0.1 * dt;
    b.vx *= 1 - drag;
    b.vy *= 1 - drag;
    b.vz *= 1 - drag * 0.5;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) { b.state = 'ob'; return; }
    if (b.z < 5) {
      const dcx = b.x - flagX, dcy = b.y - flagY;
      if (Math.hypot(dcx, dcy) < HOLE_RADIUS && Math.hypot(b.vx, b.vy) < 90) { b.state = 'holed'; return; }
    }
    if (b.z <= 0) {
      b.z = 0;
      const sp = surfacePropsAt(b.x, b.y);
      if (sp.hazard) { b.state = 'hazard'; return; }
      if (sp.ob) { b.state = 'ob'; return; }
      const impactVz = -b.vz;
      const horizSpeed = Math.hypot(b.vx, b.vy);
      if (impactVz > 18 && horizSpeed > 20) {
        b.vz = impactVz * sp.bounceKeep;
        b.vx *= 0.75;
        b.vy *= 0.75;
      } else {
        b.vz = 0;
        b.state = 'rolling';
      }
    }
  } else if (b.state === 'rolling') {
    const sp = surfacePropsAt(b.x, b.y);
    if (sp.hazard) { b.state = 'hazard'; return; }
    if (sp.ob) { b.state = 'ob'; return; }
    if (sp.slopeMag) {
      b.vx += Math.sin(sp.slopeAng) * sp.slopeMag * dt;
      b.vy += -Math.cos(sp.slopeAng) * sp.slopeMag * dt;
    }
    const speed = Math.hypot(b.vx, b.vy);
    if (speed < 4) {
      b.state = 'stopped';
      b.vx = 0; b.vy = 0;
      return;
    }
    const decel = sp.rollDecel * 40 * dt;
    const factor = Math.max(0, 1 - decel / Math.max(speed, 0.01));
    b.vx *= factor;
    b.vy *= factor;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) { b.state = 'ob'; return; }
    const dcx = b.x - flagX, dcy = b.y - flagY;
    if (Math.hypot(dcx, dcy) < HOLE_RADIUS && speed < 60) b.state = 'holed';
  }
}

const SW = {
  IDLE: 'idle', AIMING: 'aiming', POWER: 'power', ACCURACY: 'accuracy',
  FLYING: 'flying', ROLLING: 'rolling', STOPPED: 'stopped',
  HAZARD: 'hazard', OB: 'ob', HOLED: 'holed',
};

function spawnLeaf(windX, windY) {
  const fromLeft = windX >= 0;
  const fromTop = windY >= 0;
  const side = Math.random();
  let x, y;
  if (side < 0.5) {
    x = fromLeft ? -6 - Math.random() * 20 : WORLD_W + 6 + Math.random() * 20;
    y = Math.random() * WORLD_H;
  } else {
    x = Math.random() * WORLD_W;
    y = fromTop ? -6 - Math.random() * 20 : WORLD_H + 6 + Math.random() * 20;
  }
  return {
    x, y,
    vx: windX * 0.8 + (Math.random() - 0.5) * 6,
    vy: windY * 0.8 + (Math.random() - 0.5) * 6,
    age: 0,
    maxAge: 10 + Math.random() * 10,
    color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
    phase: Math.random() * Math.PI * 2,
  };
}

export default function GolfStoryScreen({ onExit }) {
  const canvasRef = useRef(null);
  const staticRef = useRef(null);
  const posRef = useRef({ x: TEE.x * TILE, y: TEE.y * TILE, facing: 'N', walkPhase: 0, moving: false });
  const ballRef = useRef({
    x: TEE.x * TILE - 4, y: TEE.y * TILE + 2, z: 0,
    vx: 0, vy: 0, vz: 0,
    state: 'rest',
    lastGoodX: TEE.x * TILE - 4,
    lastGoodY: TEE.y * TILE + 2,
    trail: [],
  });
  const swingRef = useRef({
    state: SW.IDLE,
    aimAngle: 0,
    clubIdx: 4,
    power: 0,
    powerPhase: 0,
    accuracy: 0,
    accuracyPhase: 0,
    strokeCount: 0,
    messageTimer: 0,
  });
  const windRef = useRef({ x: 0, y: 0, angle: 0, speed: 0, mph: 0 });
  const leavesRef = useRef([]);
  const keysRef = useRef({});
  const rafRef = useRef(null);

  const [hud, setHud] = useState({
    state: SW.IDLE, club: 'Driver', clubShort: 'DR',
    clubCarryYd: 250, strokes: 1, pinYd: 0, lie: 'Tee Box',
    windMph: 0, windAngleDeg: 0, message: null, power: 0, accuracy: 0,
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const staticC = document.createElement('canvas');
    staticC.width = WORLD_W;
    staticC.height = WORLD_H;
    const sctx = staticC.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    const imgData = buildWorldImageData();
    sctx.putImageData(imgData, 0, 0);
    for (const p of PROPS) drawProp(sctx, p);
    staticRef.current = staticC;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    window.addEventListener('resize', resize);

    const windAngle = Math.random() * Math.PI * 2;
    const windSpeed = 5 + Math.random() * 18;
    windRef.current = {
      x: Math.sin(windAngle) * windSpeed,
      y: -Math.cos(windAngle) * windSpeed,
      angle: windAngle,
      speed: windSpeed,
      mph: Math.round(windSpeed * 0.55),
    };

    for (let i = 0; i < MAX_LEAVES; i++) {
      const l = spawnLeaf(windRef.current.x, windRef.current.y);
      l.age = Math.random() * l.maxAge;
      l.x = Math.random() * WORLD_W;
      l.y = Math.random() * WORLD_H;
      leavesRef.current.push(l);
    }

    swingRef.current.strokeCount = 1;
    const b0 = ballRef.current;
    swingRef.current.aimAngle = Math.atan2(FLAG.x * TILE - b0.x, -(FLAG.y * TILE - b0.y));

    const flushHud = () => {
      const sw = swingRef.current;
      const ball = ballRef.current;
      const club = CLUBS[sw.clubIdx];
      const carryPx = computeCarry(club, 1.0);
      const carryYd = Math.round(carryPx / TILE * YARDS_PER_TILE);
      const pinDistPx = Math.hypot(ball.x - FLAG.x * TILE, ball.y - FLAG.y * TILE);
      const pinYd = Math.round(pinDistPx / TILE * YARDS_PER_TILE);
      const lie = surfacePropsAt(ball.x, ball.y).label;
      let message = null;
      if (sw.state === SW.HAZARD) message = 'IN THE WATER — +1 penalty';
      else if (sw.state === SW.OB) message = 'OUT OF BOUNDS — +1 penalty';
      else if (sw.state === SW.HOLED) message = `HOLED IT IN ${sw.strokeCount}!`;
      setHud({
        state: sw.state,
        club: club.name, clubShort: club.short, clubCarryYd: carryYd,
        strokes: sw.strokeCount, pinYd, lie,
        windMph: windRef.current.mph,
        windAngleDeg: (windRef.current.angle * 180 / Math.PI) % 360,
        message, power: sw.power, accuracy: sw.accuracy,
      });
    };
    flushHud();

    const resetHole = () => {
      const ball = ballRef.current;
      const p = posRef.current;
      ball.x = TEE.x * TILE - 4;
      ball.y = TEE.y * TILE + 2;
      ball.z = 0; ball.vx = 0; ball.vy = 0; ball.vz = 0;
      ball.state = 'rest';
      ball.lastGoodX = ball.x; ball.lastGoodY = ball.y;
      ball.trail = [];
      p.x = ball.x + 4; p.y = ball.y - 2;
      p.facing = 'N'; p.moving = false;
      swingRef.current.state = SW.IDLE;
      swingRef.current.strokeCount = 1;
      swingRef.current.aimAngle = Math.atan2(FLAG.x * TILE - ball.x, -(FLAG.y * TILE - ball.y));
      flushHud();
    };

    const tryAction = () => {
      const sw = swingRef.current;
      const ball = ballRef.current;
      const p = posRef.current;
      if (sw.state === SW.IDLE) {
        if (Math.hypot(p.x - ball.x, p.y - ball.y) < 26) {
          sw.state = SW.AIMING;
          sw.aimAngle = Math.atan2(FLAG.x * TILE - ball.x, -(FLAG.y * TILE - ball.y));
          if (surfaceAt(ball.x, ball.y) === T_GREEN) sw.clubIdx = CLUBS.length - 1;
          flushHud();
        }
      } else if (sw.state === SW.AIMING) {
        sw.state = SW.POWER;
        sw.powerPhase = 0; sw.power = 0;
        flushHud();
      } else if (sw.state === SW.POWER) {
        sw.state = SW.ACCURACY;
        sw.accuracyPhase = 0; sw.accuracy = 0;
        flushHud();
      } else if (sw.state === SW.ACCURACY) {
        const club = CLUBS[sw.clubIdx];
        ball.lastGoodX = ball.x; ball.lastGoodY = ball.y;
        launchBall(ball, sw.aimAngle, Math.max(0.15, sw.power), sw.accuracy, club);
        sw.state = SW.FLYING;
        sw.strokeCount++;
        flushHud();
      } else if (sw.state === SW.HOLED) {
        resetHole();
      }
    };

    const cycleClub = (dir) => {
      const sw = swingRef.current;
      if (sw.state !== SW.AIMING) return;
      sw.clubIdx = (sw.clubIdx + dir + CLUBS.length) % CLUBS.length;
      flushHud();
    };

    const cancelAim = () => {
      const sw = swingRef.current;
      if (sw.state === SW.AIMING) {
        sw.state = SW.IDLE;
        flushHud();
      }
    };

    const kd = (e) => {
      keysRef.current[e.key.toLowerCase()] = true;
      const sw = swingRef.current;
      if (e.key === ' ' || e.key === 'Enter') { tryAction(); e.preventDefault(); return; }
      if (e.key === 'Escape') { cancelAim(); e.preventDefault(); return; }
      if (sw.state === SW.AIMING) {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { cycleClub(-1); e.preventDefault(); }
        else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { cycleClub(+1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); }
      } else if (sw.state === SW.IDLE) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      }
    };
    const ku = (e) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    let last = performance.now();
    let hudAccum = 0;
    const flagX = FLAG.x * TILE;
    const flagY = FLAG.y * TILE;

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = keysRef.current;
      const p = posRef.current;
      const ball = ballRef.current;
      const sw = swingRef.current;
      const w = windRef.current;

      for (const leaf of leavesRef.current) {
        leaf.vx += w.x * 0.35 * dt + (Math.random() - 0.5) * 2 * dt;
        leaf.vy += w.y * 0.35 * dt + (Math.random() - 0.5) * 2 * dt;
        leaf.vx *= 1 - 0.25 * dt;
        leaf.vy *= 1 - 0.25 * dt;
        leaf.x += leaf.vx * dt;
        leaf.y += leaf.vy * dt;
        leaf.age += dt;
        if (leaf.age > leaf.maxAge || leaf.x < -30 || leaf.x > WORLD_W + 30 || leaf.y < -30 || leaf.y > WORLD_H + 30) {
          Object.assign(leaf, spawnLeaf(w.x, w.y));
        }
      }

      if (sw.state === SW.IDLE) {
        const speed = 44;
        let vx = 0, vy = 0;
        if (k.arrowleft || k.a) vx -= 1;
        if (k.arrowright || k.d) vx += 1;
        if (k.arrowup || k.w) vy -= 1;
        if (k.arrowdown || k.s) vy += 1;
        p.moving = !!(vx || vy);
        if (vx && vy) { vx *= 0.707; vy *= 0.707; }
        if (Math.abs(vx) > Math.abs(vy)) p.facing = vx > 0 ? 'E' : 'W';
        else if (vy !== 0) p.facing = vy > 0 ? 'S' : 'N';
        p.x = Math.max(8, Math.min(WORLD_W - 8, p.x + vx * speed * dt));
        p.y = Math.max(8, Math.min(WORLD_H - 8, p.y + vy * speed * dt));
        if (p.moving) p.walkPhase += dt * 8; else p.walkPhase = 0;
      } else if (sw.state === SW.AIMING) {
        const rotSpeed = 1.6;
        if (k.arrowleft || k.a) sw.aimAngle -= rotSpeed * dt;
        if (k.arrowright || k.d) sw.aimAngle += rotSpeed * dt;
        const dx = Math.sin(sw.aimAngle), dy = -Math.cos(sw.aimAngle);
        if (Math.abs(dx) > Math.abs(dy)) p.facing = dx > 0 ? 'E' : 'W';
        else p.facing = dy > 0 ? 'S' : 'N';
        p.moving = false;
        p.x = ball.x + 4;
        p.y = ball.y - 2;
      } else if (sw.state === SW.POWER) {
        const rate = CLUBS[sw.clubIdx].powerRate || 1.2;
        sw.powerPhase += dt * rate;
        const u = sw.powerPhase % 2;
        sw.power = u < 1 ? u : 2 - u;
        p.x = ball.x + 4; p.y = ball.y - 2; p.moving = false;
      } else if (sw.state === SW.ACCURACY) {
        sw.accuracyPhase += dt * 2.0;
        const u = sw.accuracyPhase % 2;
        sw.accuracy = (u < 1 ? u : 2 - u) * 2 - 1;
        p.x = ball.x + 4; p.y = ball.y - 2; p.moving = false;
      } else if (sw.state === SW.FLYING || sw.state === SW.ROLLING) {
        stepBall(ball, dt, w.x, w.y, flagX, flagY);
        if (sw.state === SW.FLYING) {
          ball.trail.push({ x: ball.x, y: ball.y, z: ball.z });
          if (ball.trail.length > 40) ball.trail.shift();
        }
        if (ball.state === 'rolling') sw.state = SW.ROLLING;
        else if (ball.state === 'stopped') sw.state = SW.STOPPED;
        else if (ball.state === 'hazard') { sw.state = SW.HAZARD; sw.messageTimer = 2.2; sw.strokeCount++; flushHud(); }
        else if (ball.state === 'ob') { sw.state = SW.OB; sw.messageTimer = 2.2; sw.strokeCount++; flushHud(); }
        else if (ball.state === 'holed') { sw.state = SW.HOLED; sw.messageTimer = 6; flushHud(); }
      } else if (sw.state === SW.STOPPED) {
        p.x = ball.x + 4; p.y = ball.y - 2; p.facing = 'N';
        ball.state = 'rest';
        ball.trail = [];
        sw.state = SW.IDLE;
        flushHud();
      } else if (sw.state === SW.HAZARD || sw.state === SW.OB) {
        sw.messageTimer -= dt;
        if (sw.messageTimer <= 0) {
          ball.x = ball.lastGoodX; ball.y = ball.lastGoodY;
          ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.z = 0;
          ball.state = 'rest';
          ball.trail = [];
          p.x = ball.x + 4; p.y = ball.y - 2; p.facing = 'N';
          sw.state = SW.IDLE;
          flushHud();
        }
      } else if (sw.state === SW.HOLED) {
        sw.messageTimer -= dt;
      }

      hudAccum += dt;
      if (hudAccum > 0.1 && (sw.state === SW.POWER || sw.state === SW.ACCURACY)) {
        hudAccum = 0;
        setHud((h) => ({ ...h, power: sw.power, accuracy: sw.accuracy }));
      }

      const viewW = canvas.width;
      const viewH = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.max(2, Math.min(3 * dpr, Math.floor(Math.min(
        viewW / (WORLD_W * 0.95),
        viewH / (WORLD_H * 0.75),
      ))));
      const followX = sw.state === SW.IDLE ? p.x : ball.x;
      const followY = sw.state === SW.IDLE ? p.y : ball.y;
      const camX = Math.max(0, Math.min(Math.max(0, WORLD_W - viewW / scale), followX - viewW / (2 * scale)));
      const camY = Math.max(0, Math.min(Math.max(0, WORLD_H - viewH / scale), followY - viewH / (2 * scale)));

      ctx.fillStyle = COLORS.skyVoid;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(-camX, -camY);

      if (staticRef.current) ctx.drawImage(staticRef.current, 0, 0);
      drawWaterSparkles(ctx, now);

      if (sw.state === SW.AIMING || sw.state === SW.POWER || sw.state === SW.ACCURACY) {
        const club = CLUBS[sw.clubIdx];
        const powerForPredict = sw.state === SW.AIMING ? 1.0 : Math.max(0.15, sw.power);
        const accForPredict = sw.state === SW.ACCURACY ? sw.accuracy : 0;
        const pts = simulateFlight(ball.x, ball.y, sw.aimAngle, accForPredict, powerForPredict, club, w.x, w.y, true);
        drawShotPredict(ctx, pts);
      }

      if (sw.state === SW.FLYING && ball.trail.length > 1) {
        drawFlightTrail(ctx, ball.trail);
      }

      const windStrength = Math.min(1, w.speed / 16);

      const drawables = [];
      for (const t of TREES) drawables.push({ kind: 'tree', x: t.x * TILE, y: t.y * TILE });
      for (const b of BUSHES) drawables.push({ kind: 'bush', x: b.x * TILE, y: b.y * TILE, variant: b.variant });
      drawables.push({ kind: 'flag', x: FLAG.x * TILE, y: FLAG.y * TILE });
      drawables.push({ kind: 'ball', x: ball.x, y: ball.y, z: ball.z });
      const showGolfer = !(sw.state === SW.FLYING || sw.state === SW.ROLLING || sw.state === SW.HOLED);
      if (showGolfer) {
        drawables.push({ kind: 'golfer', x: p.x, y: p.y, facing: p.facing, phase: p.moving ? p.walkPhase : null });
      }
      drawables.sort((a, b2) => a.y - b2.y);
      for (const d of drawables) {
        if (d.kind === 'tree') drawTree(ctx, d.x, d.y, now, windStrength);
        else if (d.kind === 'bush') drawBush(ctx, d.x, d.y, d.variant, now, windStrength);
        else if (d.kind === 'flag') drawFlag(ctx, d.x, d.y, now);
        else if (d.kind === 'ball') drawBall(ctx, d.x, d.y, d.z || 0);
        else if (d.kind === 'golfer') drawGolfer(ctx, d.x, d.y, d.facing, d.phase);
      }

      for (const leaf of leavesRef.current) drawLeaf(ctx, leaf, now);

      ctx.restore();

      if (sw.state === SW.POWER) {
        drawMeter(ctx, viewW, viewH, dpr, 'POWER', sw.power, false);
      } else if (sw.state === SW.ACCURACY) {
        drawMeter(ctx, viewW, viewH, dpr, 'ACCURACY', sw.accuracy, true);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.root}>
        <View style={styles.nativeMsg}>
          <Text style={styles.nativeTitle}>Golf Story — web-only spike</Text>
          <Text style={styles.nativeBody}>Open the web build to try it.</Text>
          <Pressable style={styles.nativeBack} onPress={onExit}>
            <Text style={styles.nativeBackText}>← BACK</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const hint = hintForState(hud.state);
  return (
    <View style={styles.root}>
      <View style={styles.canvasHost}>
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            imageRendering: 'pixelated',
            background: COLORS.skyVoid,
          }}
        />
      </View>

      <View style={styles.hudTopLeft} pointerEvents="none">
        <Text style={styles.hudLabel}>CLUB</Text>
        <Text style={styles.hudClubShort}>{hud.clubShort}</Text>
        <Text style={styles.hudValue}>{hud.club}</Text>
        <Text style={styles.hudSub}>{hud.clubCarryYd} yd max</Text>
      </View>

      <View style={styles.hudTopRight} pointerEvents="none">
        <Text style={styles.hudLabel}>WIND</Text>
        <View style={styles.windRow}>
          <Text style={[styles.windArrow, { transform: [{ rotate: `${hud.windAngleDeg.toFixed(0)}deg` }] }]}>↑</Text>
          <Text style={styles.hudValue}>{hud.windMph} mph</Text>
        </View>
      </View>

      <View style={styles.hudBottomLeft} pointerEvents="none">
        <Text style={styles.hudLabel}>STROKE {hud.strokes}</Text>
        <Text style={styles.hudValue}>{hud.pinYd} yd to pin</Text>
        <Text style={styles.hudSub}>Lie: {hud.lie}</Text>
      </View>

      {hud.message ? (
        <View style={styles.messageBox} pointerEvents="none">
          <Text style={styles.messageText}>{hud.message}</Text>
          {hud.state === SW.HOLED ? (
            <Text style={styles.messageSub}>SPACE to play again</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.dialogBox} pointerEvents="none">
        <Text style={styles.dialogText}>{hint}</Text>
      </View>

      <Pressable style={styles.exitBtn} onPress={onExit}>
        <Text style={styles.exitText}>✕</Text>
      </Pressable>
    </View>
  );
}

function hintForState(state) {
  switch (state) {
    case SW.IDLE: return 'Arrows: walk  ·  SPACE near ball: aim';
    case SW.AIMING: return '← → aim  ·  ↑ ↓ club  ·  SPACE: swing  ·  ESC: cancel';
    case SW.POWER: return 'SPACE to lock POWER';
    case SW.ACCURACY: return 'SPACE to lock ACCURACY — center is pure';
    case SW.FLYING: case SW.ROLLING: return '…';
    case SW.HAZARD: return 'Drop pending…';
    case SW.OB: return 'Drop pending…';
    case SW.HOLED: return 'SPACE to play again';
    default: return '';
  }
}

function drawMeter(ctx, viewW, viewH, dpr, label, value, isAccuracy) {
  const w = Math.min(viewW * 0.6, 420 * dpr);
  const h = (isAccuracy ? 12 : 16) * dpr;
  const x = Math.floor((viewW - w) / 2);
  const y = Math.floor(viewH * (isAccuracy ? 0.74 : 0.83));
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 5 * dpr, y - 22 * dpr, w + 10 * dpr, h + 32 * dpr);
  ctx.fillStyle = '#f5f5ec';
  ctx.fillRect(x - 2 * dpr, y - 19 * dpr, w + 4 * dpr, 1 * dpr);
  ctx.fillRect(x - 2 * dpr, y + h + 9 * dpr, w + 4 * dpr, 1 * dpr);
  ctx.font = `bold ${11 * dpr}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#f5f5ec';
  ctx.fillText(label, x + w / 2, y - 6 * dpr);
  ctx.fillStyle = '#111';
  ctx.fillRect(x, y, w, h);
  if (isAccuracy) {
    ctx.fillStyle = '#e33838';
    ctx.fillRect(x, y, Math.floor(w * 0.2), h);
    ctx.fillRect(x + Math.floor(w * 0.8), y, Math.floor(w * 0.2), h);
    ctx.fillStyle = '#fbe043';
    ctx.fillRect(x + Math.floor(w * 0.2), y, Math.floor(w * 0.2), h);
    ctx.fillRect(x + Math.floor(w * 0.6), y, Math.floor(w * 0.2), h);
    ctx.fillStyle = '#77c146';
    ctx.fillRect(x + Math.floor(w * 0.4), y, Math.floor(w * 0.2), h);
    const indicatorX = x + Math.floor(w * (0.5 + value * 0.5));
    ctx.fillStyle = '#f5f5ec';
    ctx.fillRect(indicatorX - 2 * dpr, y - 4 * dpr, 4 * dpr, h + 8 * dpr);
    ctx.fillStyle = '#111';
    ctx.fillRect(indicatorX - 1, y - 4 * dpr, 1, h + 8 * dpr);
  } else {
    const fw = Math.floor(w * value);
    const hue = 120 - 110 * value;
    ctx.fillStyle = `hsl(${hue}, 74%, 52%)`;
    ctx.fillRect(x, y, fw, h);
    ctx.fillStyle = '#f5f5ec';
    for (let i = 1; i < 4; i++) ctx.fillRect(x + Math.floor(w * i / 4) - 1, y, 1, h);
  }
}

const HUD_BORDER = '#f5f5ec';
const HUD_BG = 'rgba(14,26,18,0.9)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.skyVoid },
  canvasHost: { flex: 1 },
  dialogBox: {
    position: 'absolute', left: 16, right: 16, bottom: 24,
    backgroundColor: HUD_BG, borderWidth: 3, borderColor: HUD_BORDER,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  dialogText: {
    color: '#f5f5ec',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
    fontSize: 13, lineHeight: 18, textAlign: 'center',
  },
  exitBtn: {
    position: 'absolute', top: 16, right: 16,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
  },
  exitText: { color: '#f5f5ec', fontSize: 18, lineHeight: 20 },
  hudTopLeft: {
    position: 'absolute', top: 16, left: 16,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    paddingHorizontal: 10, paddingVertical: 8, minWidth: 120,
  },
  hudTopRight: {
    position: 'absolute', top: 16, right: 60,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    paddingHorizontal: 10, paddingVertical: 8, minWidth: 110, alignItems: 'center',
  },
  hudBottomLeft: {
    position: 'absolute', bottom: 88, left: 16,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    paddingHorizontal: 10, paddingVertical: 8, minWidth: 140,
  },
  hudLabel: {
    color: '#a9d4a9', fontSize: 10, letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  hudClubShort: {
    color: '#fff6d8', fontSize: 22, fontWeight: '900',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  hudValue: {
    color: '#f5f5ec', fontSize: 13, fontWeight: '700',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  hudSub: {
    color: '#bfc4b9', fontSize: 11,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  windRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  windArrow: { color: '#fff6d8', fontSize: 22, marginRight: 4 },
  messageBox: {
    position: 'absolute', top: '40%', left: 16, right: 16,
    backgroundColor: '#0e1a12', borderWidth: 3, borderColor: '#fbe043',
    paddingVertical: 20, paddingHorizontal: 20, alignItems: 'center',
  },
  messageText: {
    color: '#fbe043', fontSize: 22, fontWeight: '900',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
    textAlign: 'center',
  },
  messageSub: {
    color: '#f5f5ec', fontSize: 12, marginTop: 8,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  nativeMsg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  nativeTitle: { color: '#f5f5ec', fontSize: 18, marginBottom: 12 },
  nativeBody: { color: '#bfc4b9', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  nativeBack: { borderWidth: 2, borderColor: '#f5f5ec', paddingHorizontal: 18, paddingVertical: 10 },
  nativeBackText: { color: '#f5f5ec', fontSize: 14 },
});
