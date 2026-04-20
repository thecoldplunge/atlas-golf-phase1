import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

const TILE = 16;
const MAP_W = 20;
const MAP_H = 30;

const T_ROUGH = 0;
const T_FAIRWAY = 1;
const T_GREEN = 2;
const T_SAND = 3;
const T_WATER = 4;

const HOLE_MAP = (() => {
  const m = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(T_ROUGH));
  for (let y = 5; y < 26; y++) {
    for (let x = 7; x < 13; x++) m[y][x] = T_FAIRWAY;
  }
  for (let x = 8; x < 13; x++) m[4][x] = T_FAIRWAY;
  for (let y = 3; y < 8; y++) {
    for (let x = 8; x < 12; x++) m[y][x] = T_GREEN;
  }
  m[2][9] = T_GREEN; m[2][10] = T_GREEN;
  m[8][9] = T_GREEN;
  for (let y = 10; y < 13; y++) {
    for (let x = 12; x < 15; x++) m[y][x] = T_SAND;
  }
  for (let y = 14; y < 19; y++) {
    for (let x = 2; x < 6; x++) m[y][x] = T_WATER;
  }
  return m;
})();

const TREES = [
  { x: 4, y: 8 }, { x: 16, y: 6 }, { x: 3, y: 11 }, { x: 17, y: 14 },
  { x: 5, y: 22 }, { x: 14, y: 25 }, { x: 1, y: 4 }, { x: 18, y: 3 },
  { x: 2, y: 27 }, { x: 17, y: 28 }, { x: 6, y: 27 }, { x: 13, y: 22 },
  { x: 1, y: 21 }, { x: 15, y: 20 }, { x: 0, y: 9 }, { x: 19, y: 10 },
];

const FLAG = { x: 9.5, y: 5 };
const TEE = { x: 9.5, y: 24 };

const COLORS = {
  skyVoid: '#0a1f14',
  roughA: '#3a7d2e',  roughB: '#2e6826',
  fairA:  '#5ca83a',  fairB:  '#4a9030',
  greenA: '#7fd04f',  greenB: '#6abe42',
  sandA:  '#e8d29b',  sandB:  '#c9a864',
  waterA: '#4b9bd9',  waterB: '#3580be',  waterC: '#95c9ec',
  trunk:  '#5a3a1a',  trunkHi:'#7a4e24',
  tree1:  '#1f5a1f',  tree2:  '#2e7a2e',  tree3:  '#48a848',
  shadow: 'rgba(0,0,0,0.25)',
  skin:   '#f1b884',
  hat:    '#c23030',  hatHi:  '#e45a5a',
  shirt:  '#2a6fb7',  shirtHi:'#4d90d6',
  pants:  '#16243d',
  flagRed:'#e63b3b',  flagHi: '#ff6a6a',
  pole:   '#f0f0e0',
  cup:    '#1a1a1a',
};

function drawTile(ctx, wx, wy, type) {
  let a, b;
  switch (type) {
    case T_FAIRWAY: a = COLORS.fairA;  b = COLORS.fairB;  break;
    case T_GREEN:   a = COLORS.greenA; b = COLORS.greenB; break;
    case T_SAND:    a = COLORS.sandA;  b = COLORS.sandB;  break;
    case T_WATER:   a = COLORS.waterA; b = COLORS.waterB; break;
    default:        a = COLORS.roughA; b = COLORS.roughB;
  }
  ctx.fillStyle = a;
  ctx.fillRect(wx, wy, TILE, TILE);
  ctx.fillStyle = b;
  if (type === T_FAIRWAY) {
    for (let i = 0; i < TILE; i += 4) ctx.fillRect(wx + i, wy, 1, TILE);
  } else if (type === T_GREEN) {
    for (let i = 2; i < TILE; i += 3) ctx.fillRect(wx + i, wy, 1, TILE);
  } else if (type === T_SAND) {
    for (let i = 1; i < TILE; i += 3) {
      for (let j = 1; j < TILE; j += 3) {
        if (((wx + i) * 13 + (wy + j) * 7) % 5 === 0) ctx.fillRect(wx + i, wy + j, 1, 1);
      }
    }
  } else if (type === T_WATER) {
    for (let j = 2; j < TILE; j += 5) {
      const o = ((wy / 5) | 0) % 2 === 0 ? 0 : 4;
      ctx.fillRect(wx + 1 + o, wy + j, 4, 1);
      ctx.fillRect(wx + 9 - o, wy + j + 2, 4, 1);
    }
    ctx.fillStyle = COLORS.waterC;
    for (let j = 4; j < TILE; j += 8) ctx.fillRect(wx + 2, wy + j, 1, 1);
  } else {
    for (let i = 0; i < TILE; i += 2) {
      for (let j = 0; j < TILE; j += 2) {
        if (((wx + i) * 31 + (wy + j) * 17) % 11 === 0) {
          ctx.fillRect(wx + i, wy + j, 1, 1);
        }
      }
    }
  }
}

function drawTree(ctx, px, py) {
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath(); ctx.ellipse(px, py + 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.trunk;
  ctx.fillRect(px - 2, py - 4, 4, 6);
  ctx.fillStyle = COLORS.trunkHi;
  ctx.fillRect(px - 2, py - 4, 1, 6);
  ctx.fillStyle = COLORS.tree1;
  ctx.beginPath(); ctx.arc(px, py - 10, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree2;
  ctx.beginPath(); ctx.arc(px - 1, py - 11, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree3;
  ctx.beginPath(); ctx.arc(px - 3, py - 13, 4, 0, Math.PI * 2); ctx.fill();
}

function drawFlag(ctx, px, py) {
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath(); ctx.ellipse(px, py + 1, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.cup;
  ctx.fillRect(px - 2, py - 1, 4, 2);
  ctx.fillStyle = COLORS.pole;
  ctx.fillRect(px, py - 15, 1, 15);
  ctx.fillStyle = COLORS.flagRed;
  ctx.beginPath();
  ctx.moveTo(px + 1, py - 15);
  ctx.lineTo(px + 8, py - 13);
  ctx.lineTo(px + 1, py - 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.flagHi;
  ctx.fillRect(px + 1, py - 15, 5, 1);
}

function drawGolfer(ctx, px, py, facing, phase) {
  const legSwing = Math.sin(phase) > 0 ? 1 : 0;
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath(); ctx.ellipse(px, py, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.pants;
  ctx.fillRect(px - 3, py - 6, 6, 6);
  if (phase !== null) {
    if (legSwing) {
      ctx.fillStyle = COLORS.pants;
      ctx.fillRect(px - 4, py - 2, 2, 2);
    } else {
      ctx.fillStyle = COLORS.pants;
      ctx.fillRect(px + 2, py - 2, 2, 2);
    }
  }
  ctx.fillStyle = COLORS.shirt;
  ctx.fillRect(px - 3, py - 10, 6, 5);
  ctx.fillStyle = COLORS.shirtHi;
  ctx.fillRect(px - 3, py - 10, 6, 1);
  ctx.fillStyle = COLORS.shirt;
  ctx.fillRect(px - 4, py - 9, 1, 4);
  ctx.fillRect(px + 3, py - 9, 1, 4);
  ctx.fillStyle = COLORS.skin;
  ctx.fillRect(px - 2, py - 14, 4, 4);
  ctx.fillStyle = COLORS.hat;
  ctx.fillRect(px - 3, py - 15, 6, 2);
  ctx.fillStyle = COLORS.hatHi;
  ctx.fillRect(px - 3, py - 15, 6, 1);
  if (facing === 'S') {
    ctx.fillStyle = COLORS.cup;
    ctx.fillRect(px - 1, py - 12, 1, 1);
    ctx.fillRect(px + 1, py - 12, 1, 1);
  } else if (facing === 'E') {
    ctx.fillStyle = COLORS.cup;
    ctx.fillRect(px + 1, py - 12, 1, 1);
  } else if (facing === 'W') {
    ctx.fillStyle = COLORS.cup;
    ctx.fillRect(px - 1, py - 12, 1, 1);
  }
}

function drawBall(ctx, px, py, z) {
  const lift = Math.max(0, z | 0);
  ctx.fillStyle = COLORS.shadow;
  const shadowInset = Math.min(1, lift / 12);
  ctx.fillRect(px - 1 + shadowInset, py, 3 - shadowInset * 2, 1);
  ctx.fillStyle = '#fff';
  ctx.fillRect(px - 1, py - 2 - lift, 2, 2);
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(px, py - 1 - lift, 1, 1);
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
  const posRef = useRef({ x: TEE.x * TILE, y: TEE.y * TILE, facing: 'N', walkPhase: 0, moving: false });
  const ballRef = useRef({
    x: TEE.x * TILE - 4, y: TEE.y * TILE + 2, z: 0,
    startX: 0, startY: 0, endX: 0, endY: 0,
    flightT: 0, flightDuration: 1, maxHeight: 0,
    lastSurface: T_FAIRWAY,
  });
  const swingRef = useRef({ state: SWING.IDLE, power: 0, chargePhase: 0, landedT: 0, message: null });
  const keysRef = useRef({});
  const rafRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

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
      sw.message = `Power ${(sw.power * 100) | 0}%  →  ${Math.round(range / 3)}yd`;
    };

    const trySwing = () => {
      const sw = swingRef.current;
      const b = ballRef.current;
      const p = posRef.current;
      if (sw.state === SWING.IDLE) {
        const dx = p.x - b.x, dy = p.y - b.y;
        if (Math.hypot(dx, dy) < 18) {
          sw.state = SWING.CHARGING;
          sw.chargePhase = 0;
          sw.power = 0;
          sw.message = 'Tap SPACE again to lock power';
        } else {
          sw.message = 'Walk next to the ball first';
          setTimeout(() => { if (sw.message === 'Walk next to the ball first') sw.message = null; }, 1400);
        }
      } else if (sw.state === SWING.CHARGING) {
        launchSwing();
      }
    };

    const kd = (e) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.key === ' ') {
        trySwing();
        e.preventDefault();
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
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
        if (Math.abs(vx) > Math.abs(vy)) {
          p.facing = vx > 0 ? 'E' : 'W';
        } else if (vy !== 0) {
          p.facing = vy > 0 ? 'S' : 'N';
        }
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
          const labels = { [T_GREEN]: 'on the green!', [T_FAIRWAY]: 'fairway', [T_ROUGH]: 'rough', [T_SAND]: 'in the bunker', [T_WATER]: 'in the water...' };
          sw.message = labels[b.lastSurface] || 'somewhere';
        }
      } else if (sw.state === SWING.LANDED) {
        sw.landedT += dt;
        if (sw.landedT > 1.2) {
          p.x = b.x + 4;
          p.y = b.y - 2;
          sw.state = SWING.IDLE;
          sw.message = null;
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

      for (let ty = 0; ty < MAP_H; ty++) {
        for (let tx = 0; tx < MAP_W; tx++) {
          drawTile(ctx, tx * TILE, ty * TILE, HOLE_MAP[ty][tx]);
        }
      }

      const drawables = [];
      for (const t of TREES) drawables.push({ kind: 'tree', x: t.x * TILE, y: t.y * TILE });
      drawables.push({ kind: 'flag', x: FLAG.x * TILE, y: FLAG.y * TILE });
      drawables.push({ kind: 'ball', x: b.x, y: b.y, z: b.z });
      drawables.push({ kind: 'golfer', x: p.x, y: p.y, facing: p.facing, phase: p.moving ? p.walkPhase : null });
      drawables.sort((a, b2) => a.y - b2.y);
      for (const d of drawables) {
        if (d.kind === 'tree') drawTree(ctx, d.x, d.y);
        else if (d.kind === 'flag') drawFlag(ctx, d.x, d.y);
        else if (d.kind === 'ball') drawBall(ctx, d.x, d.y, d.z || 0);
        else if (d.kind === 'golfer') drawGolfer(ctx, d.x, d.y, d.facing, d.phase);
      }

      ctx.restore();

      if (sw.state === SWING.CHARGING) {
        const meterW = Math.min(viewW * 0.55, 360 * dpr);
        const meterH = 14 * dpr;
        const mx = Math.floor((viewW - meterW) / 2);
        const my = Math.floor(viewH * 0.82);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(mx - 4 * dpr, my - 4 * dpr, meterW + 8 * dpr, meterH + 8 * dpr);
        ctx.fillStyle = '#1a1a1a';
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
      <SafeAreaView style={styles.root}>
        <View style={styles.nativeMsg}>
          <Text style={styles.nativeTitle}>Golf Story — web-only spike</Text>
          <Text style={styles.nativeBody}>
            The pixel-art prototype uses an HTML canvas. Open the web build to try it.
          </Text>
          <Pressable style={styles.nativeBack} onPress={onExit}>
            <Text style={styles.nativeBackText}>← BACK</Text>
          </Pressable>
        </View>
      </SafeAreaView>
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
          Arrows/WASD to walk. SPACE near the ball starts the power meter — SPACE again to launch.
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
  nativeBack: {
    borderWidth: 2, borderColor: '#f5f5ec',
    paddingHorizontal: 18, paddingVertical: 10,
  },
  nativeBackText: { color: '#f5f5ec', fontSize: 14 },
});
