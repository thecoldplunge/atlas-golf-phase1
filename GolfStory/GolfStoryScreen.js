import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const TILE = 16;
const MAP_W = 20;
const MAP_H = 30;
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;

const T_ROUGH = 0;
const T_FAIRWAY = 1;
const T_GREEN = 2;
const T_SAND = 3;
const T_WATER = 4;
const T_FRINGE = 5;
const T_TEE = 6;

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
  waterA: '#4b9bd9', waterB: '#3a82c0', waterC: '#a8d6f0', waterD: '#2b6fab',
  trunkDark: '#3f2610', trunk: '#5a3a1a', trunkHi: '#7d5428',
  tree0: '#163016', tree1: '#224a22', tree2: '#2e6b2e',
  tree3: '#3f8c3f', tree4: '#5db35d', tree5: '#8ed88e',
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
    case T_WATER:   return [RGB.waterA, RGB.waterD, RGB.waterB, RGB.waterC];
    default:        return [RGB.roughA, RGB.roughB, RGB.roughC, RGB.roughD];
  }
}

function pixelColor(x, y, type) {
  const [base, mid, dark, light] = paletteFor(type);
  let c = base;
  const noise = hRand(x, y, 1);

  if (type !== T_WATER && type !== T_SAND && noise > 0.52 && noise < 0.66) c = mid;

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
                : type === T_SAND ? 0.93
                : 0.92;
  if (hRand(x, y, 10) > dThresh) c = dark;

  const lThresh = type === T_ROUGH ? 0.98 : 0.97;
  if (hRand(x, y, 20) > lThresh) c = light;

  if (type === T_SAND) {
    if (hRand(x, y, 30) > 0.97) c = light;
  }
  if (type === T_WATER) {
    if (hRand(x, y, 40) > 0.985) c = light;
  }

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

const TREES = [
  { x: 3.5, y: 8 }, { x: 16.5, y: 6.5 }, { x: 2.5, y: 11.5 }, { x: 17.5, y: 14 },
  { x: 4.5, y: 22 }, { x: 14.5, y: 24.5 }, { x: 1.5, y: 3.5 }, { x: 18.5, y: 2.5 },
  { x: 2.5, y: 27.5 }, { x: 17.5, y: 28 }, { x: 6.5, y: 27.5 }, { x: 13.5, y: 21.5 },
  { x: 1.5, y: 20.5 }, { x: 15.5, y: 19.5 }, { x: 0.5, y: 9 }, { x: 19.5, y: 10 },
  { x: 2, y: 23.5 }, { x: 16.5, y: 10.5 }, { x: 1, y: 12.5 }, { x: 16.5, y: 16.5 },
  { x: 18.5, y: 19 }, { x: 0.5, y: 26 }, { x: 19.5, y: 23 }, { x: 4, y: 25.5 },
  { x: 15, y: 28 },
];
const FLAG = { x: 9.5, y: 5.5 };
const TEE = { x: 9.5, y: 24.8 };

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

function drawTree(ctx, px, py) {
  const x = Math.floor(px), y = Math.floor(py);
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
  ctx.beginPath(); ctx.ellipse(x + 2, y - 12, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree1;
  ctx.beginPath(); ctx.ellipse(x + 1, y - 13, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree2;
  ctx.beginPath(); ctx.ellipse(x, y - 14, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree3;
  ctx.beginPath(); ctx.ellipse(x - 2, y - 15, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree4;
  ctx.beginPath(); ctx.ellipse(x - 3, y - 16, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree5;
  ctx.fillRect(x - 4, y - 17, 2, 1);
  ctx.fillRect(x - 3, y - 17, 1, 1);
  ctx.fillStyle = COLORS.tree0;
  ctx.fillRect(x + 5, y - 10, 1, 1);
  ctx.fillRect(x + 6, y - 13, 1, 1);
  ctx.fillRect(x - 7, y - 12, 1, 1);
  ctx.fillStyle = COLORS.tree4;
  ctx.fillRect(x + 4, y - 15, 1, 1);
  ctx.fillRect(x - 6, y - 14, 1, 1);
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
  const inset = Math.min(1, lift / 14);
  ctx.fillRect(x - 1 + inset, y, 3 - inset * 2, 1);
  ctx.fillStyle = COLORS.ballShadow;
  ctx.fillRect(x - 1, y - 2 - lift, 2, 2);
  ctx.fillStyle = COLORS.ballWhite;
  ctx.fillRect(x - 1, y - 2 - lift, 1, 1);
}

const SWING = { IDLE: 'idle', CHARGING: 'charging', FLYING: 'flying', LANDED: 'landed' };

export default function GolfStoryScreen({ onExit }) {
  const canvasRef = useRef(null);
  const staticRef = useRef(null);
  const posRef = useRef({ x: TEE.x * TILE, y: TEE.y * TILE, facing: 'N', walkPhase: 0, moving: false });
  const ballRef = useRef({
    x: TEE.x * TILE - 4, y: TEE.y * TILE + 2, z: 0,
    startX: 0, startY: 0, endX: 0, endY: 0,
    flightT: 0, flightDuration: 1, maxHeight: 0,
    lastSurface: T_TEE,
  });
  const swingRef = useRef({ state: SWING.IDLE, power: 0, chargePhase: 0, landedT: 0 });
  const keysRef = useRef({});
  const rafRef = useRef(null);

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

    const launchSwing = () => {
      const sw = swingRef.current;
      const b = ballRef.current;
      const flagX = FLAG.x * TILE;
      const flagY = FLAG.y * TILE;
      const dx = flagX - b.x;
      const dy = flagY - b.y;
      const distToFlag = Math.max(1, Math.hypot(dx, dy));
      const maxRange = Math.max(distToFlag * 1.15, 260);
      const range = sw.power * maxRange;
      b.startX = b.x; b.startY = b.y;
      b.endX = b.x + (dx / distToFlag) * range;
      b.endY = b.y + (dy / distToFlag) * range;
      b.flightT = 0;
      b.flightDuration = 0.7 + sw.power * 0.9;
      b.maxHeight = 14 + sw.power * 34;
      sw.state = SWING.FLYING;
    };

    const trySwing = () => {
      const sw = swingRef.current;
      const b = ballRef.current;
      const p = posRef.current;
      if (sw.state === SWING.IDLE) {
        if (Math.hypot(p.x - b.x, p.y - b.y) < 18) {
          sw.state = SWING.CHARGING;
          sw.chargePhase = 0;
          sw.power = 0;
        }
      } else if (sw.state === SWING.CHARGING) {
        launchSwing();
      }
    };

    const kd = (e) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.key === ' ') { trySwing(); e.preventDefault(); }
      else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    };
    const ku = (e) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      const k = keysRef.current;
      const p = posRef.current;
      const b = ballRef.current;
      const sw = swingRef.current;

      const canWalk = sw.state === SWING.IDLE || sw.state === SWING.LANDED;
      if (canWalk) {
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
      } else {
        p.moving = false;
      }

      if (sw.state === SWING.CHARGING) {
        sw.chargePhase += dt * 1.1;
        const u = sw.chargePhase % 2;
        sw.power = u < 1 ? u : 2 - u;
      } else if (sw.state === SWING.FLYING) {
        b.flightT += dt;
        const u = Math.min(1, b.flightT / b.flightDuration);
        b.x = b.startX + (b.endX - b.startX) * u;
        b.y = b.startY + (b.endY - b.startY) * u;
        b.z = b.maxHeight * Math.sin(Math.PI * u);
        if (u >= 1) {
          b.z = 0;
          b.lastSurface = surfaceAt(b.x, b.y);
          sw.state = SWING.LANDED;
          sw.landedT = 0;
        }
      } else if (sw.state === SWING.LANDED) {
        sw.landedT += dt;
        if (sw.landedT > 1.2) {
          p.x = b.x + 4;
          p.y = b.y - 2;
          sw.state = SWING.IDLE;
        }
      }

      const viewW = canvas.width;
      const viewH = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.max(2, Math.min(3 * dpr, Math.floor(Math.min(
        viewW / (WORLD_W * 0.95),
        viewH / (WORLD_H * 0.75),
      ))));
      const followX = sw.state === SWING.FLYING ? b.x : p.x;
      const followY = sw.state === SWING.FLYING ? b.y : p.y;
      const camX = Math.max(0, Math.min(Math.max(0, WORLD_W - viewW / scale), followX - viewW / (2 * scale)));
      const camY = Math.max(0, Math.min(Math.max(0, WORLD_H - viewH / scale), followY - viewH / (2 * scale)));

      ctx.fillStyle = COLORS.skyVoid;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(-camX, -camY);

      if (staticRef.current) ctx.drawImage(staticRef.current, 0, 0);

      const drawables = [];
      for (const t of TREES) drawables.push({ kind: 'tree', x: t.x * TILE, y: t.y * TILE });
      drawables.push({ kind: 'flag', x: FLAG.x * TILE, y: FLAG.y * TILE });
      drawables.push({ kind: 'ball', x: b.x, y: b.y, z: b.z });
      drawables.push({ kind: 'golfer', x: p.x, y: p.y, facing: p.facing, phase: p.moving ? p.walkPhase : null });
      drawables.sort((a, b2) => a.y - b2.y);
      for (const d of drawables) {
        if (d.kind === 'tree') drawTree(ctx, d.x, d.y);
        else if (d.kind === 'flag') drawFlag(ctx, d.x, d.y, now);
        else if (d.kind === 'ball') drawBall(ctx, d.x, d.y, d.z || 0);
        else if (d.kind === 'golfer') drawGolfer(ctx, d.x, d.y, d.facing, d.phase);
      }

      ctx.restore();

      if (sw.state === SWING.CHARGING) {
        const meterW = Math.min(viewW * 0.55, 360 * dpr);
        const meterH = 14 * dpr;
        const mx = Math.floor((viewW - meterW) / 2);
        const my = Math.floor(viewH * 0.82);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(mx - 4 * dpr, my - 4 * dpr, meterW + 8 * dpr, meterH + 8 * dpr);
        ctx.fillStyle = '#111';
        ctx.fillRect(mx, my, meterW, meterH);
        const fillW = Math.floor(meterW * sw.power);
        const hue = 120 - 110 * sw.power;
        ctx.fillStyle = `hsl(${hue}, 72%, 52%)`;
        ctx.fillRect(mx, my, fillW, meterH);
        ctx.fillStyle = '#f5f5ec';
        for (let i = 1; i < 4; i++) {
          ctx.fillRect(mx + Math.floor(meterW * i / 4) - 1, my, 1, meterH);
        }
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
      <View style={styles.dialogBox} pointerEvents="none">
        <Text style={styles.dialogText}>
          Arrows/WASD to walk. SPACE near the ball opens the power meter; SPACE again to launch.
        </Text>
      </View>
      <Pressable style={styles.exitBtn} onPress={onExit}>
        <Text style={styles.exitText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.skyVoid },
  canvasHost: { flex: 1 },
  dialogBox: {
    position: 'absolute',
    left: 16, right: 16, bottom: 24,
    backgroundColor: '#0e1a12',
    borderWidth: 3,
    borderColor: '#f5f5ec',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dialogText: {
    color: '#f5f5ec',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
    fontSize: 13,
    lineHeight: 18,
  },
  exitBtn: {
    position: 'absolute', top: 16, right: 16,
    backgroundColor: '#0e1a12',
    borderWidth: 2, borderColor: '#f5f5ec',
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
  },
  exitText: { color: '#f5f5ec', fontSize: 18, lineHeight: 20 },
  nativeMsg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  nativeTitle: { color: '#f5f5ec', fontSize: 18, marginBottom: 12 },
  nativeBody: { color: '#bfc4b9', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  nativeBack: { borderWidth: 2, borderColor: '#f5f5ec', paddingHorizontal: 18, paddingVertical: 10 },
  nativeBackText: { color: '#f5f5ec', fontSize: 14 },
});
