#!/usr/bin/env node
// QA for v0.75 clubhouse: walker NPC patrol math, proximity detection
// (signs + NPCs), building collision, range/putting auto-reset timer.

const TILE = 16;
const PROX = 26;
const FADE_DUR = 0.45;

// ─── Walker NPC tick ────────────────────────────────────────────────
function makeWalker() {
  return {
    type: 'walker',
    x: 12, y: 22, facing: 'E',
    wpA: { x: 6,  y: 24 },
    wpB: { x: 18, y: 24 },
    speed: 22,
    pauseAt: 1.6,
    walking: false, idleT: 0, dir: 1, walkPhase: 0,
  };
}

function tickWalker(npc, dt) {
  if (npc.type !== 'walker') return;
  npc.idleT = (npc.idleT || 0) + dt;
  if (!npc.walking && npc.idleT >= (npc.pauseAt || 1.5)) {
    npc.walking = true;
    npc.idleT = 0;
  }
  if (npc.walking) {
    const tgt = npc.dir > 0 ? npc.wpB : npc.wpA;
    const dx = tgt.x - npc.x;
    const dy = tgt.y - npc.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.2) {
      npc.dir = -npc.dir;
      npc.walking = false;
      npc.idleT = 0;
    } else {
      const step = ((npc.speed || 20) / TILE) * dt;
      const stepClamped = Math.min(step, dist);
      npc.x += (dx / dist) * stepClamped;
      npc.y += (dy / dist) * stepClamped;
      npc.walkPhase = (npc.walkPhase || 0) + dt * 8;
      if (Math.abs(dx) > Math.abs(dy)) npc.facing = dx > 0 ? 'E' : 'W';
      else npc.facing = dy > 0 ? 'S' : 'N';
    }
  }
}

const assert = (ok, msg, actual) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);
  if (!ok) process.exitCode = 1;
};

console.log('v0.75 clubhouse QA\n');

// Walker should idle, then walk to wpB, idle, walk to wpA, idle, etc.
{
  const npc = makeWalker();
  const dt = 1 / 60;
  let reachedB = false, reachedA = false;
  let ticks = 0;
  while (ticks < 60 * 30 && !(reachedB && reachedA)) {
    tickWalker(npc, dt);
    if (!reachedB && Math.hypot(npc.x - 18, npc.y - 24) < 0.5) reachedB = true;
    if (reachedB && !reachedA && Math.hypot(npc.x - 6, npc.y - 24) < 0.5) reachedA = true;
    ticks++;
  }
  assert(reachedB, `walker reaches wpB`, `after ${(ticks / 60).toFixed(1)} s`);
  assert(reachedA, `walker reverses and reaches wpA`, `after ${(ticks / 60).toFixed(1)} s`);
}

// Walker idle pause is honoured before first move.
{
  const npc = makeWalker();
  let started = false;
  let firstMoveAt = null;
  const dt = 1 / 60;
  for (let i = 0; i < 600; i++) {
    const x0 = npc.x;
    tickWalker(npc, dt);
    if (!started && npc.x !== x0) {
      started = true;
      firstMoveAt = i * dt;
    }
  }
  assert(firstMoveAt !== null, `walker eventually starts moving`, `${firstMoveAt?.toFixed(2)}s`);
  assert(firstMoveAt > 1.4, `walker waits ≥ pauseAt before first step`, `${firstMoveAt?.toFixed(2)}s vs 1.6 expected`);
}

// ─── Proximity detection (signs + NPCs) ────────────────────────────
function findNearestInteraction(px, py, signs, npcs) {
  let nearest = null;
  let bestDist = PROX;
  for (const sg of signs) {
    const d = Math.hypot(px - sg.x * TILE, py - sg.y * TILE);
    if (d < bestDist) {
      bestDist = d;
      nearest = { kind: 'sign', id: sg.id, target: sg.target, label: sg.label };
    }
  }
  for (const npc of npcs) {
    const d = Math.hypot(px - npc.x * TILE, py - npc.y * TILE);
    if (d < bestDist) {
      bestDist = d;
      nearest = { kind: 'npc', id: npc.id, label: npc.name };
    }
  }
  return nearest;
}

{
  const signs = [
    { id: 'sign_tee', x: 21, y: 13, target: 'roundSetup', label: '1ST TEE' },
    { id: 'sign_range', x: 4, y: 3, target: 'range', label: 'DRIVING RANGE' },
  ];
  const npcs = [
    { id: 'sammy', x: 6, y: 27, name: 'SLICK SAMMY' },
    { id: 'caddy', x: 7, y: 22, name: 'CADDY CARL' },
  ];
  // Player on top of 1ST TEE sign.
  const r1 = findNearestInteraction(21 * TILE, 13 * TILE, signs, npcs);
  assert(r1 && r1.id === 'sign_tee', `proximity at sign returns the sign`, `${r1?.id}`);
  // Player far from everything.
  const r2 = findNearestInteraction(0, 0, signs, npcs);
  assert(!r2, `proximity far away returns null`, `${r2?.id || 'null'}`);
  // Player on top of caddy.
  const r3 = findNearestInteraction(7 * TILE, 22 * TILE, signs, npcs);
  assert(r3 && r3.id === 'caddy', `proximity at NPC returns the NPC`, `${r3?.id}`);
  // Player exactly at the proximity boundary (just outside).
  const farY = 13 * TILE + PROX + 1;
  const r4 = findNearestInteraction(21 * TILE, farY, signs, npcs);
  assert(!r4, `proximity just outside threshold returns null`, `${r4?.id || 'null'}`);
}

// ─── Building collision ─────────────────────────────────────────────
function clampOutOfBuilding(newX, newY, oldX, oldY, building) {
  if (!building) return [newX, newY];
  const bx = building.x * TILE - 4;
  const by = building.y * TILE - 4;
  const bw = building.w * TILE + 8;
  const bh = building.h * TILE + 8;
  if (newX > bx && newX < bx + bw && newY > by && newY < by + bh) {
    return [oldX, oldY];
  }
  return [newX, newY];
}

{
  const bldg = { x: 9, y: 6, w: 6, h: 7 };
  // Step from outside into the building footprint — should snap back.
  const [x1, y1] = clampOutOfBuilding(12 * TILE, 8 * TILE, 8.5 * TILE, 8 * TILE, bldg);
  assert(x1 === 8.5 * TILE && y1 === 8 * TILE, `step into building footprint is blocked`, `(${x1}, ${y1})`);
  // Step in open space — passes.
  const [x2, y2] = clampOutOfBuilding(20 * TILE, 30 * TILE, 19 * TILE, 30 * TILE, bldg);
  assert(x2 === 20 * TILE && y2 === 30 * TILE, `step in open space allowed`, `(${x2}, ${y2})`);
}

// ─── Practice auto-reset timer ──────────────────────────────────────
function tickPracticeReset(state, dt) {
  if (state.swState === 'STOPPED') {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.swState = 'AIMING';
      state.shots++;
      state.timer = 0;
    }
  }
}

{
  const s = { swState: 'STOPPED', timer: 1.4, shots: 0 };
  const dt = 1 / 60;
  let ticks = 0;
  while (s.swState === 'STOPPED' && ticks < 600) {
    tickPracticeReset(s, dt);
    ticks++;
  }
  const elapsed = ticks * dt;
  assert(s.swState === 'AIMING', `practice auto-reset returns to AIMING`, s.swState);
  assert(elapsed >= 1.4 && elapsed < 1.5, `auto-reset fires after ~1.4 s`, `${elapsed.toFixed(2)} s`);
}
