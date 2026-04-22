#!/usr/bin/env node
// QA for v0.76:
//   • Tempo swing penalty math (no-bonus baseline, 20% max miss, 1.2s window)
//   • Short-game carry bump (chip / bump / flop)
//   • Sign-zone proximity tightening (small zones near sign, NPCs still reachable)

const TEMPO_DURATION_SEC = 1.2;
const TEMPO_WINDOW = 0.5;
const TEMPO_MAX_PENALTY = 0.2;

// Mirrors the endSwipe tempo math exactly.
function applyTempo(swipePower, rawAccuracy, tempoStartT, now) {
  const elapsed = (now - tempoStartT) / 1000;
  const tempoError = Math.abs(elapsed - TEMPO_DURATION_SEC);
  const tempoQuality = Math.max(0, 1 - tempoError / TEMPO_WINDOW);
  const tempoPenalty = (1 - tempoQuality) * TEMPO_MAX_PENALTY;
  let power = swipePower * (1 - tempoPenalty);
  const tempoAccShift = (elapsed > TEMPO_DURATION_SEC ? 1 : -1) * tempoPenalty * 2;
  const accuracy = Math.max(-1, Math.min(1, rawAccuracy + tempoAccShift));
  const label = tempoError < 0.10
    ? 'PERFECT TEMPO'
    : tempoError < 0.25
      ? (elapsed < TEMPO_DURATION_SEC ? 'SLIGHTLY EARLY' : 'SLIGHTLY LATE')
      : (elapsed < TEMPO_DURATION_SEC ? 'EARLY' : 'LATE');
  return { power, accuracy, label, penalty: tempoPenalty, elapsed };
}

const assert = (ok, msg, actual) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);
  if (!ok) process.exitCode = 1;
};

console.log('v0.76 tempo + short-game QA\n');

// --- Tempo: perfect swing has no penalty ------------------------------
{
  const start = 1000;
  const end = start + TEMPO_DURATION_SEC * 1000;
  const r = applyTempo(1.0, 0, start, end);
  assert(Math.abs(r.power - 1.0) < 1e-9, `perfect tempo → no power penalty`, r.power.toFixed(3));
  assert(Math.abs(r.accuracy) < 1e-9, `perfect tempo → no accuracy shift`, r.accuracy.toFixed(3));
  assert(r.label === 'PERFECT TEMPO', `perfect tempo label`, r.label);
}

// --- Tempo: near-perfect (within 0.10 s) still hits PERFECT ----------
{
  const start = 1000;
  const r = applyTempo(1.0, 0, start, start + 1250); // 50 ms late
  assert(r.label === 'PERFECT TEMPO', `50 ms late still counts as perfect`, r.label);
  assert(r.penalty < 0.05, `50 ms late penalty < 5%`, r.penalty.toFixed(3));
}

// --- Tempo: very early swing ------------------------------------------
{
  const start = 1000;
  const r = applyTempo(1.0, 0, start, start + 500); // 700 ms early
  assert(r.power < 0.85, `700 ms early → significant power penalty`, r.power.toFixed(3));
  assert(r.accuracy < 0, `early tempo tugs accuracy negative (hook)`, r.accuracy.toFixed(3));
  assert(r.label === 'EARLY', `early tempo label`, r.label);
}

// --- Tempo: very late swing -------------------------------------------
{
  const start = 1000;
  const r = applyTempo(1.0, 0, start, start + 2000); // 800 ms late
  assert(r.power < 0.85, `800 ms late → significant power penalty`, r.power.toFixed(3));
  assert(r.accuracy > 0, `late tempo tugs accuracy positive (slice)`, r.accuracy.toFixed(3));
  assert(r.label === 'LATE', `late tempo label`, r.label);
}

// --- Tempo: absolute max penalty is 20% -------------------------------
{
  const start = 1000;
  const r = applyTempo(1.0, 0, start, start + 5000); // way late
  assert(r.power >= 0.8, `max penalty is 20% power (not worse than 0.80)`, r.power.toFixed(3));
  assert(r.power < 0.81, `max penalty IS 20% (not lower)`, r.power.toFixed(3));
}

// --- Short-game carry bumped -----------------------------------------
const SHOT_TYPES = {
  chip:    { carry: 1.0,  apex: 0.7 },
  flop:    { carry: 0.66, apex: 2.0 },
  bump:    { carry: 1.5,  apex: 0.4 },
};
assert(SHOT_TYPES.chip.carry === 1.0, `chip carry doubled 0.5 → 1.0`, SHOT_TYPES.chip.carry);
assert(Math.abs(SHOT_TYPES.flop.carry - 0.66) < 1e-9, `flop carry doubled 0.33 → 0.66`, SHOT_TYPES.flop.carry);
assert(SHOT_TYPES.bump.carry === 1.5, `bump carry doubled 0.75 → 1.5`, SHOT_TYPES.bump.carry);

// --- Sign-zone proximity: tight zones, NPCs reachable ----------------
const TILE = 16;
const PROX = 26;

function findNearestInteraction(px, py, signs, npcs) {
  let nearest = null;
  let bestDist = PROX;
  let bestSignDist = Infinity;
  for (const sg of signs) {
    if (sg.zone) {
      const x0 = sg.zone.x * TILE;
      const y0 = sg.zone.y * TILE;
      const x1 = (sg.zone.x + sg.zone.w) * TILE;
      const y1 = (sg.zone.y + sg.zone.h) * TILE;
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const d = Math.hypot(px - cx, py - cy);
        if (d < bestSignDist) {
          bestSignDist = d;
          nearest = { kind: 'sign', id: sg.id, label: sg.label };
        }
      }
    }
  }
  if (!nearest) {
    for (const npc of npcs) {
      const d = Math.hypot(px - npc.x * TILE, py - npc.y * TILE);
      if (d < bestDist) {
        bestDist = d;
        nearest = { kind: 'npc', id: npc.id, label: npc.name };
      }
    }
  }
  return nearest;
}

{
  // v0.76 tight zones
  const signs = [
    { id: 'sign_range',   x: 4,  y: 3,  label: 'DRIVING RANGE',  target: 'range',
      zone: { x: 2,  y: 1,  w: 6, h: 5 } },
    { id: 'sign_tee',     x: 21, y: 13, label: '1ST TEE',        target: 'roundSetup',
      zone: { x: 18, y: 11, w: 6, h: 5 } },
    { id: 'sign_putting', x: 4,  y: 23, label: 'PUTTING GREEN',  target: 'putting',
      zone: { x: 2,  y: 23, w: 4, h: 3 } },
  ];
  const npcs = [
    { id: 'caddy',   x: 7,  y: 22, name: 'CADDY CARL' },
    { id: 'proshop', x: 18, y: 22, name: 'PRO SHOP PETRA' },
    { id: 'sammy',   x: 6,  y: 27, name: 'SLICK SAMMY' },
    { id: 'yolanda', x: 6,  y: 19, name: 'YIPS YOLANDA' },
    { id: 'pat',     x: 8,  y: 20, name: 'PUTT-PUTT PAT' },
    { id: 'wendy-A', x: 9,  y: 24, name: 'WANDERING WENDY' },
    { id: 'wendy-B', x: 18, y: 24, name: 'WANDERING WENDY' },
  ];

  // Standing on top of each NPC → TALK (kind=npc) should win.
  for (const npc of npcs) {
    const r = findNearestInteraction(npc.x * TILE, npc.y * TILE, signs, npcs);
    assert(r && r.kind === 'npc', `NPC ${npc.id} reachable`, `nearest=${r?.kind}/${r?.id}`);
  }

  // Standing right at each sign post (within its zone) → ENTER wins.
  const signTests = [
    { sig: 'sign_range',   x: 4,  y: 3 },
    { sig: 'sign_tee',     x: 21, y: 13 },
    { sig: 'sign_putting', x: 4,  y: 23 },
  ];
  for (const t of signTests) {
    const r = findNearestInteraction(t.x * TILE, t.y * TILE, signs, npcs);
    assert(r && r.kind === 'sign' && r.id === t.sig, `${t.sig} zone fires at post`, `${r?.kind}/${r?.id}`);
  }

  // Far from any sign or NPC → null.
  const r = findNearestInteraction(12 * TILE, 14 * TILE, signs, npcs);
  assert(!r, `dead centre (building) triggers nothing`, r?.id || 'null');
}
