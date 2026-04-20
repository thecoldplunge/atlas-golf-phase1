import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const TILE = 16;
const MAP_W = 20;
const MAP_H = 30;

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

const RAW_MAP = (() => {
  const m = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(T_ROUGH));
  const fwRows = {
    9: [6, 14], 10: [6, 14], 11: [6, 13], 12: [6, 13], 13: [6, 13],
    14: [6, 14], 15: [6, 14], 16: [6, 14], 17: [6, 14], 18: [6, 14],
    19: [6, 14], 20: [7, 13], 21: [7, 13], 22: [7, 12], 23: [7, 12],
    24: [8, 11], 25: [8, 11],
  };
  for (const [yStr, bounds] of Object.entries(fwRows)) {
    const y = +yStr, [x0, x1] = bounds;
    for (let x = x0; x <= x1; x++) m[y][x] = T_FAIRWAY;
  }
  // Circular green: every tile whose center is within r≈3.2 of (9.5, 5.5)
  const gcx = 9.5, gcy = 5.5, gr = 3.2;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const dx = (x + 0.5) - gcx;
      const dy = (y + 0.5) - gcy;
      if (Math.hypot(dx, dy) <= gr) m[y][x] = T_GREEN;
    }
  }
  m[11][13] = T_SAND; m[12][13] = T_SAND; m[12][14] = T_SAND; m[13][14] = T_SAND;
  m[6][13] = T_SAND; m[7][13] = T_SAND;
  for (let y = 14; y < 19; y++) for (let x = 2; x < 6; x++) m[y][x] = T_WATER;
  m[19][2] = T_WATER; m[19][3] = T_WATER; m[19][4] = T_WATER;
  m[13][3] = T_WATER; m[13][4] = T_WATER;
  m[24][9] = T_TEE; m[24][10] = T_TEE; m[25][9] = T_TEE; m[25][10] = T_TEE;
  return m;
})();

const HOLE_MAP = (() => {
  const m = RAW_MAP.map(row => [...row]);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = RAW_MAP[y][x];
      if (t === T_FAIRWAY || t === T_ROUGH) {
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < MAP_H && nx >= 0 && nx < MAP_W && RAW_MAP[ny][nx] === T_GREEN) {
            m[y][x] = T_FRINGE; break;
          }
        }
      }
    }
  }
  return m;
})();

const TREES = [
  { x: 3.5, y: 8 }, { x: 16.5, y: 6.5 }, { x: 2.5, y: 11.5 }, { x: 17.5, y: 14 },
  { x: 4.5, y: 22 }, { x: 14.5, y: 24.5 }, { x: 1.5, y: 3.5 }, { x: 18.5, y: 2.5 },
  { x: 2.5, y: 27.5 }, { x: 17.5, y: 28 }, { x: 6.5, y: 27.5 }, { x: 13.5, y: 21.5 },
  { x: 1.5, y: 20.5 }, { x: 15.5, y: 19.5 }, { x: 0.5, y: 9 }, { x: 19.5, y: 10 },
  { x: 2, y: 23.5 }, { x: 16.5, y: 10.5 }, { x: 1, y: 12.5 }, { x: 16.5, y: 16.5 },
  { x: 18.5, y: 19 }, { x: 0.5, y: 26 }, { x: 19.5, y: 23 }, { x: 4, y: 25.5 },
  { x: 15, y: 28 },
];
const FLAG = { x: 9.5, y: 5 };
const TEE = { x: 9.5, y: 24.5 };

const PROPS = (() => {
  const out = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = HOLE_MAP[y][x];
      if (t === T_ROUGH) {
        const tufts = Math.floor(hRand(x, y, 500) * 3);
        for (let i = 0; i < tufts; i++) {
          out.push({
            kind: 'tuft',
            x: x * TILE + Math.floor(hRand(x, y, 501 + i) * (TILE - 2)) + 1,
            y: y * TILE + Math.floor(hRand(x, y, 520 + i) * (TILE - 2)) + 1,
          });
        }
        if (hRand(x, y, 550) > 0.86) {
          const c = hRand(x, y, 553);
          out.push({
            kind: 'flower',
            x: x * TILE + Math.floor(hRand(x, y, 551) * (TILE - 2)) + 1,
            y: y * TILE + Math.floor(hRand(x, y, 552) * (TILE - 2)) + 1,
            color: c < 0.4 ? 'red' : c < 0.7 ? 'yellow' : 'white',
          });
        }
        if (hRand(x, y, 570) > 0.95) {
          out.push({
            kind: 'pebble',
            x: x * TILE + Math.floor(hRand(x, y, 571) * (TILE - 2)) + 1,
            y: y * TILE + Math.floor(hRand(x, y, 572) * (TILE - 2)) + 1,
          });
        }
      } else if (t === T_FAIRWAY) {
        if (hRand(x, y, 600) > 0.93) {
          out.push({
            kind: 'daisy',
            x: x * TILE + Math.floor(hRand(x, y, 601) * (TILE - 2)) + 1,
            y: y * TILE + Math.floor(hRand(x, y, 602) * (TILE - 2)) + 1,
          });
        }
      }
    }
  }
  return out;
})();

const COLORS = {
  skyVoid: '#0b1a10',
  roughA: '#3d8232', roughB: '#326f26', roughC: '#24571c', roughD: '#52a640',
  fairA:  '#5eae3a', fairB:  '#52a032', fairC:  '#418526', fairD:  '#7ac94f',
  greenA: '#83cf52', greenB: '#77c146', greenC: '#5eaa32', greenD: '#9fde6a',
  fringeA:'#6db847', fringeB:'#5ca636', fringeC:'#4a8f24', fringeD:'#85cf5c',
  teeA:   '#6fc045', teeB:   '#5ab030', teeC:   '#4a9420',
  sandA:  '#ecd6a0', sandB:  '#d8bd78', sandC:  '#b8995c', sandD:  '#f7e7ba',
  waterA: '#4b9bd9', waterB: '#3a82c0', waterC: '#a8d6f0', waterD: '#2b6fab',
  trunkDark:'#3f2610', trunk:'#5a3a1a', trunkHi:'#7d5428',
  tree0:'#163016', tree1:'#224a22', tree2:'#2e6b2e',
  tree3:'#3f8c3f', tree4:'#5db35d', tree5:'#8ed88e',
  shadow: 'rgba(0,0,0,0.3)',
  skin: '#f1b884', skinShadow: '#d49864',
  hat: '#c83030', hatDark: '#8a1e1e', hatHi: '#ea5a5a', hatBand: '#161616',
  shirt: '#2b70b7', shirtDark: '#1a4c88', shirtHi: '#4e95d8',
  pants: '#222f4a', pantsDark: '#121a2c',
  shoe: '#141414', shoeHi: '#3a3a3a',
  flagRed:'#e33838', flagDark:'#a82222', flagHi:'#ff6060', flagYellow:'#fbe043',
  pole: '#efe9cc', poleDark: '#a8a280',
  cup: '#141414',
  ballShadow: '#c9c9c9', ballWhite: '#ffffff',
  flowerRed:'#e94343', flowerYellow:'#fbe043', flowerWhite:'#ffffff',
  flowerStem:'#2d6a24', flowerCenter:'#fbe043',
  pebble: '#7e7966', pebbleHi: '#a9a38d',
};

function drawGrassTile(ctx, wx, wy, type) {
  let pal;
  switch (type) {
    case T_FAIRWAY: pal = [COLORS.fairA, COLORS.fairB, COLORS.fairC, COLORS.fairD]; break;
    case T_GREEN:   pal = [COLORS.greenA, COLORS.greenB, COLORS.greenC, COLORS.greenD]; break;
    case T_FRINGE:  pal = [COLORS.fringeA, COLORS.fringeB, COLORS.fringeC, COLORS.fringeD]; break;
    case T_TEE:     pal = [COLORS.teeA, COLORS.teeB, COLORS.teeC, COLORS.teeA]; break;
    default:        pal = [COLORS.roughA, COLORS.roughB, COLORS.roughC, COLORS.roughD];
  }
  const [base, mid, dark, light] = pal;
  ctx.fillStyle = base;
  ctx.fillRect(wx, wy, TILE, TILE);

  ctx.fillStyle = mid;
  for (let j = 0; j < TILE; j++) {
    for (let i = 0; i < TILE; i++) {
      const r = hRand(wx + i, wy + j, 1);
      if (r > 0.52 && r < 0.68) ctx.fillRect(wx + i, wy + j, 1, 1);
    }
  }

  if (type === T_FAIRWAY || type === T_GREEN || type === T_FRINGE || type === T_TEE) {
    ctx.fillStyle = dark;
    const alternate = ((wx / TILE) | 0) % 2 === 0;
    const period = type === T_GREEN ? 2 : 3;
    ctx.globalAlpha = type === T_GREEN ? 0.35 : 0.45;
    if (alternate) {
      for (let i = 0; i < TILE; i += period) ctx.fillRect(wx + i, wy, 1, TILE);
    } else {
      for (let i = 0; i < TILE; i += period) ctx.fillRect(wx, wy + i, TILE, 1);
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = dark;
  const dn = type === T_GREEN ? 1 : type === T_FAIRWAY || type === T_FRINGE ? 2 : 5;
  for (let k = 0; k < dn; k++) {
    const px = Math.floor(hRand(wx, wy, 10 + k) * TILE);
    const py = Math.floor(hRand(wx, wy, 50 + k) * TILE);
    ctx.fillRect(wx + px, wy + py, 1, 1);
    if (hRand(wx, wy, 90 + k) > 0.65 && py + 1 < TILE) ctx.fillRect(wx + px, wy + py + 1, 1, 1);
  }

  ctx.fillStyle = light;
  const ln = type === T_GREEN ? 3 : type === T_FAIRWAY ? 2 : type === T_ROUGH ? 1 : 2;
  for (let k = 0; k < ln; k++) {
    const px = Math.floor(hRand(wx, wy, 130 + k) * TILE);
    const py = Math.floor(hRand(wx, wy, 170 + k) * TILE);
    ctx.fillRect(wx + px, wy + py, 1, 1);
  }

  if (type === T_TEE) {
    ctx.fillStyle = COLORS.teeC;
    for (let i = 2; i < TILE; i += 3) {
      ctx.fillRect(wx + i, wy + 2, 1, 1);
      ctx.fillRect(wx + i, wy + TILE - 3, 1, 1);
    }
  }
}

function drawSandTile(ctx, wx, wy) {
  ctx.fillStyle = COLORS.sandA;
  ctx.fillRect(wx, wy, TILE, TILE);
  ctx.fillStyle = COLORS.sandB;
  for (let j = 0; j < TILE; j++) {
    for (let i = 0; i < TILE; i++) {
      const r = hRand(wx + i, wy + j, 2);
      if (r > 0.68) ctx.fillRect(wx + i, wy + j, 1, 1);
    }
  }
  ctx.fillStyle = COLORS.sandC;
  for (let k = 0; k < 3; k++) {
    ctx.fillRect(wx + Math.floor(hRand(wx, wy, 210 + k) * TILE), wy + Math.floor(hRand(wx, wy, 230 + k) * TILE), 1, 1);
  }
  ctx.fillStyle = COLORS.sandD;
  for (let k = 0; k < 2; k++) {
    ctx.fillRect(wx + Math.floor(hRand(wx, wy, 260 + k) * TILE), wy + Math.floor(hRand(wx, wy, 280 + k) * TILE), 1, 1);
  }
}

function drawWaterTile(ctx, wx, wy) {
  ctx.fillStyle = COLORS.waterA;
  ctx.fillRect(wx, wy, TILE, TILE);
  ctx.fillStyle = COLORS.waterD;
  for (let j = 0; j < TILE; j++) {
    for (let i = 0; i < TILE; i++) {
      const r = hRand(wx + i, wy + j, 3);
      if (r > 0.7 && r < 0.78) ctx.fillRect(wx + i, wy + j, 1, 1);
    }
  }
  ctx.fillStyle = COLORS.waterB;
  for (let j = 2; j < TILE; j += 4) {
    const o = ((wy + j) / 4 | 0) % 2 === 0 ? 1 : 5;
    ctx.fillRect(wx + o, wy + j, 5, 1);
    ctx.fillRect(wx + o + 7, wy + j + 2, 3, 1);
  }
  ctx.fillStyle = COLORS.waterC;
  for (let k = 0; k < 2; k++) {
    ctx.fillRect(wx + Math.floor(hRand(wx, wy, 310 + k) * TILE), wy + Math.floor(hRand(wx, wy, 330 + k) * TILE), 1, 1);
  }
}

function drawTile(ctx, wx, wy, type) {
  if (type === T_WATER) drawWaterTile(ctx, wx, wy);
  else if (type === T_SAND) drawSandTile(ctx, wx, wy);
  else drawGrassTile(ctx, wx, wy, type);
}

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

function surfaceAt(wx, wy) {
  const tx = Math.floor(wx / TILE);
  const ty = Math.floor(wy / TILE);
  if (ty < 0 || ty >= MAP_H || tx < 0 || tx >= MAP_W) return T_ROUGH;
  return HOLE_MAP[ty][tx];
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
    staticC.width = MAP_W * TILE;
    staticC.height = MAP_H * TILE;
    const sctx = staticC.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        drawTile(sctx, tx * TILE, ty * TILE, HOLE_MAP[ty][tx]);
      }
    }
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
        p.x = Math.max(8, Math.min(MAP_W * TILE - 8, p.x + vx * speed * dt));
        p.y = Math.max(8, Math.min(MAP_H * TILE - 8, p.y + vy * speed * dt));
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
        viewW / (MAP_W * TILE * 0.95),
        viewH / (MAP_H * TILE * 0.75),
      ))));
      const worldW = MAP_W * TILE;
      const worldH = MAP_H * TILE;
      const followX = sw.state === SWING.FLYING ? b.x : p.x;
      const followY = sw.state === SWING.FLYING ? b.y : p.y;
      const camX = Math.max(0, Math.min(Math.max(0, worldW - viewW / scale), followX - viewW / (2 * scale)));
      const camY = Math.max(0, Math.min(Math.max(0, worldH - viewH / scale), followY - viewH / (2 * scale)));

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
