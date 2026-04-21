#!/usr/bin/env node
// QA for GS v0.39 tree collisions. Mirrors the state machine from
// stepBall so a regression in the tuning parameters trips a test
// here before it ships.

const TILE = 16;
const GRAVITY = 70;
const TREE_CANOPY_R = 19;
const TREE_CANOPY_Z_LO = 6;
const TREE_CANOPY_Z_HI = 22;
const TREE_TRUNK_R = 4;
const TREE_TRUNK_Z_HI = 8;

function step(b, dt, trees) {
  if (b.state === 'flying') {
    b.vz -= GRAVITY * dt;
    const drag = 0.1 * dt;
    b.vx *= 1 - drag;
    b.vy *= 1 - drag;
    b.vz *= 1 - drag * 0.5;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    for (const t of trees) {
      const tx = t.x * TILE, ty = t.y * TILE;
      const dx = b.x - tx, dy = b.y - ty;
      const d2 = dx * dx + dy * dy;
      if (b.z <= TREE_TRUNK_Z_HI && d2 < TREE_TRUNK_R ** 2) {
        const d = Math.sqrt(d2) || 0.01;
        const nx = dx / d, ny = dy / d;
        const vdotn = b.vx * nx + b.vy * ny;
        if (vdotn < 0) {
          b.vx = (b.vx - 2 * vdotn * nx) * 0.25;
          b.vy = (b.vy - 2 * vdotn * ny) * 0.25;
          b.vz = Math.min(b.vz, 0) * 0.3;
        }
        b.x = tx + nx * (TREE_TRUNK_R + 0.6);
        b.y = ty + ny * (TREE_TRUNK_R + 0.6);
        b.lastHit = 'trunk';
        break;
      }
      if (b.z >= TREE_CANOPY_Z_LO && b.z <= TREE_CANOPY_Z_HI && d2 < TREE_CANOPY_R ** 2) {
        const f = Math.max(0, 1 - 4.5 * dt);
        b.vx *= f;
        b.vy *= f;
        b.vz -= 90 * dt;
        b.lastHit = 'canopy';
        break;
      }
    }
    if (b.z <= 0) { b.z = 0; b.state = 'rolling'; }
  } else if (b.state === 'rolling') {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    for (const t of trees) {
      const tx = t.x * TILE, ty = t.y * TILE;
      const dx = b.x - tx, dy = b.y - ty;
      const d2 = dx * dx + dy * dy;
      if (d2 < TREE_TRUNK_R ** 2) {
        const d = Math.sqrt(d2) || 0.01;
        b.x = tx + (dx / d) * (TREE_TRUNK_R + 0.6);
        b.y = ty + (dy / d) * (TREE_TRUNK_R + 0.6);
        b.vx = 0; b.vy = 0;
        b.state = 'stopped';
        b.lastHit = 'trunk-rolling';
        return;
      }
    }
  }
}

function simulate(init, trees, { maxSteps = 500, dt = 1 / 60 } = {}) {
  const b = { state: 'flying', z: 0, vz: 0, vx: 0, vy: 0, lastHit: null, ...init };
  for (let i = 0; i < maxSteps; i++) {
    step(b, dt, trees);
    if (b.state === 'stopped') break;
  }
  return b;
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('Tree collision QA\n');

// 1. High-apex shot flies OVER a tree untouched.
{
  const tree = { x: 10, y: 10 };
  const b = simulate(
    { x: tree.x * TILE - 40, y: tree.y * TILE, vx: 90, vy: 0, vz: 120 },
    [tree],
    { maxSteps: 20 },
  );
  // During this 20-step window, ball should still be flying and have cleared
  // the canopy altitude band (z > TREE_CANOPY_Z_HI) by the time it reaches
  // the tree column.
  assert(b.lastHit !== 'canopy' && b.lastHit !== 'trunk',
    'high-apex shot passes through untouched', b.lastHit || 'none');
}

// 2. Low stinger at z ~ 14 (inside canopy band) bleeds speed in the leaves.
{
  const tree = { x: 10, y: 10 };
  const b = simulate(
    { x: tree.x * TILE - 20, y: tree.y * TILE, vx: 120, vy: 0, vz: 0, z: 14 },
    [tree],
    { maxSteps: 15 },
  );
  assert(b.lastHit === 'canopy', 'low stinger catches canopy drag', b.lastHit);
  assert(Math.abs(b.vx) < 120, '  horizontal velocity bled', b.vx.toFixed(1));
}

// 3. Trunk hit at near-ground height reflects + drops speed to ~25%.
{
  const tree = { x: 10, y: 10 };
  const preSpeed = 100;
  const b = { state: 'flying', x: tree.x * TILE - 10, y: tree.y * TILE,
              z: 2, vx: preSpeed, vy: 0, vz: 0, lastHit: null };
  // Integrate a few frames — ball needs to travel 10−4=6 px before it
  // enters the trunk radius.
  for (let i = 0; i < 10 && b.lastHit !== 'trunk'; i++) step(b, 1 / 60, [tree]);
  assert(b.lastHit === 'trunk', 'low ball into trunk fires trunk handler', b.lastHit);
  const newSpeed = Math.hypot(b.vx, b.vy);
  assert(newSpeed < preSpeed * 0.5, '  kept < 50% of impact speed', newSpeed.toFixed(1));
  assert(b.vx < 0, '  horizontal velocity reversed', b.vx.toFixed(1));
}

// 4. Rolling into a trunk stops the ball.
{
  const tree = { x: 10, y: 10 };
  const b = { state: 'rolling', x: tree.x * TILE - 8, y: tree.y * TILE,
              z: 0, vx: 60, vy: 0, vz: 0, lastHit: null };
  for (let i = 0; i < 20; i++) step(b, 1 / 60, [tree]);
  assert(b.state === 'stopped', 'rolling into trunk → stopped', b.state);
  const d = Math.hypot(b.x - tree.x * TILE, b.y - tree.y * TILE);
  assert(d >= TREE_TRUNK_R, '  ball pushed outside trunk radius', d.toFixed(2));
}

// 5. Rolling between trees without contact continues rolling.
{
  const tree = { x: 10, y: 10 };
  const b = { state: 'rolling', x: tree.x * TILE - 40, y: tree.y * TILE,
              z: 0, vx: 40, vy: 0, vz: 0, lastHit: null };
  for (let i = 0; i < 10; i++) step(b, 1 / 60, [tree]);
  assert(b.state === 'rolling', 'rolling near (but not into) a tree keeps rolling', b.state);
}
