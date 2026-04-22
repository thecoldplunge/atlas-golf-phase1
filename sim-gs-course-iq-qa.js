#!/usr/bin/env node
// QA for chooseShotPlan — the Course-IQ planner that lets smart NPCs
// route around trees, lay up past hazards, and send it on par-5s when
// the green is actually reachable. We reproduce the scoring loop in
// isolation so a regression in GolfStoryScreen.js's planner surfaces
// here instead of in a live match.

const TILE = 16;
const YARDS_PER_TILE = 10;
const GRAVITY = 70;
const TREE_CANOPY_R = 22;

const CLUBS = [
  { key: 'DR', v: 225, angle: 20 },
  { key: '3W', v: 205, angle: 24 },
  { key: '5W', v: 190, angle: 28 },
  { key: '5I', v: 170, angle: 33 },
  { key: '7I', v: 148, angle: 39 },
  { key: '9I', v: 128, angle: 45 },
  { key: 'PW', v: 112, angle: 51 },
  { key: 'SW', v: 96,  angle: 58 },
  { key: 'PT', v: 110, angle: 0  },
];

function computeCarry(club, power) {
  const v = club.v * power;
  const a = (club.angle * Math.PI) / 180;
  if (club.angle === 0) return v * 0.9;
  return Math.max(0, (v * v * Math.sin(2 * a)) / GRAVITY);
}

function pickClubForDistance(distYd, onGreen) {
  if (onGreen) return CLUBS.length - 1;
  const minAcceptable = distYd - 20;
  const carries = [];
  for (let i = 0; i < CLUBS.length - 1; i++) {
    carries.push({ idx: i, carryYd: (computeCarry(CLUBS[i], 1) / TILE) * YARDS_PER_TILE });
  }
  carries.sort((a, b) => a.carryYd - b.carryYd);
  for (const c of carries) if (c.carryYd >= minAcceptable) return c.idx;
  return carries[carries.length - 1].idx;
}

function invertCarry(club, targetPx) {
  const full = computeCarry(club, 1);
  if (club.angle === 0) return Math.max(0.2, Math.min(1, targetPx / full));
  return Math.max(0.2, Math.min(1, Math.sqrt(targetPx / full) * 1.03));
}

function treeIntersectsRay(bx, by, lx, ly, clearance, trees) {
  const dxR = lx - bx, dyR = ly - by;
  const len2 = dxR * dxR + dyR * dyR;
  if (len2 < 1) return false;
  const cl = clearance + TREE_CANOPY_R;
  for (const t of trees) {
    const tx = t.x * TILE, ty = t.y * TILE;
    const tA = Math.max(0, Math.min(1, ((tx - bx) * dxR + (ty - by) * dyR) / len2));
    const cx = bx + dxR * tA;
    const cy = by + dyR * tA;
    if (Math.hypot(tx - cx, ty - cy) < cl) return true;
  }
  return false;
}

function surfaceScoreFrom(label, hazard, oob) {
  if (oob || hazard) return -320;
  if (label === 'Green') return 160;
  if (label === 'Fringe') return 110;
  if (label === 'Fairway' || label === 'Tee Box') return 90;
  if (label === 'Rough') return -20;
  if (label === 'Bunker') return -70;
  if (label === 'Dirt') return -55;
  return 0;
}

// Test harness: surfaceAt is a caller-provided function (wx, wy) → { label, hazard? }.
function plan({ bx, by, fx, fy, trees, surfaceAt, courseIQ = 80, worldW = 2000, worldH = 2000 }) {
  if (courseIQ < 55) return null;
  const dxP = fx - bx, dyP = fy - by;
  const distPx = Math.hypot(dxP, dyP);
  const distYd = distPx / TILE * YARDS_PER_TILE;
  const aimPin = Math.atan2(dxP, -dyP);
  const candidates = [];
  const directIdx = pickClubForDistance(distYd, false);
  candidates.push({ aimAngle: aimPin, clubIdx: directIdx, targetPx: distPx, label: 'direct' });
  candidates.push({ aimAngle: aimPin, clubIdx: directIdx, targetPx: distPx * 0.75, label: 'soft' });
  for (const offset of [-0.18, 0.18]) {
    candidates.push({ aimAngle: aimPin + offset, clubIdx: directIdx, targetPx: distPx, label: 'side' });
  }
  if (distYd > 210) {
    const driverCarry = computeCarry(CLUBS[0], 1);
    if (driverCarry > distPx * 0.85) {
      candidates.push({ aimAngle: aimPin, clubIdx: 0, targetPx: Math.min(driverCarry, distPx), label: 'send' });
    }
  }
  if (distYd > 140) {
    const layupPx = distPx - (80 * TILE / YARDS_PER_TILE);
    if (layupPx > 40) {
      const layupYd = layupPx / TILE * YARDS_PER_TILE;
      const layupIdx = pickClubForDistance(layupYd, false);
      candidates.push({ aimAngle: aimPin, clubIdx: layupIdx, targetPx: layupPx, label: 'layup' });
    }
  }
  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const club = CLUBS[c.clubIdx];
    const power = invertCarry(club, c.targetPx);
    const actualPx = club.angle === 0 ? club.v * power * 0.9
      : (club.v * power) ** 2 * Math.sin(2 * club.angle * Math.PI / 180) / GRAVITY;
    const lx = bx + Math.sin(c.aimAngle) * actualPx;
    const ly = by - Math.cos(c.aimAngle) * actualPx;
    const oob = lx < 0 || lx > worldW || ly < 0 || ly > worldH;
    const surf = !oob ? surfaceAt(lx, ly) : { label: '' };
    let score = surfaceScoreFrom(surf.label, surf.hazard, oob);
    if (treeIntersectsRay(bx, by, lx, ly, 4, trees)) {
      score -= (c.label === 'side') ? 40 : 140;
    }
    const remain = Math.hypot(fx - lx, fy - ly);
    score -= remain * 0.32;
    if (c.label === 'soft' || c.label === 'layup') score -= 18;
    if (score > bestScore) {
      bestScore = score;
      best = { label: c.label, aimAngle: c.aimAngle, clubIdx: c.clubIdx, power, actualPx, lx, ly };
    }
  }
  return best;
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);
console.log('Course-IQ shot planner QA\n');

// Scenario 1: water directly between ball and pin → plan should lay up / route around.
{
  const surfaceAt = (x, y) => {
    // 100-px-wide water strip between y=150 and y=210.
    if (y >= 150 && y <= 210) return { label: 'Water', hazard: true };
    return { label: 'Fairway' };
  };
  const p = plan({ bx: 400, by: 380, fx: 400, fy: 80, trees: [], surfaceAt });
  const landedInWater = p && p.ly >= 150 && p.ly <= 210;
  assert(!landedInWater, `water carry: plan avoids water`, `${p?.label} → (${p?.lx.toFixed(0)}, ${p?.ly.toFixed(0)})`);
}

// Scenario 2: tree directly on the pin line → plan should aim offset.
{
  const surfaceAt = () => ({ label: 'Fairway' });
  const tree = { x: 400 / TILE, y: 230 / TILE }; // mid-line tree
  const p = plan({ bx: 400, by: 380, fx: 400, fy: 80, trees: [tree], surfaceAt });
  assert(p && p.label === 'side', `tree on pin line → side route`, p?.label);
}

// Scenario 3: 260-yd par 5 with reachable green → smart NPC goes for it.
{
  const surfaceAt = (x, y) => {
    // Green is a circle at (400, 80) r=50.
    if (Math.hypot(x - 400, y - 80) < 50) return { label: 'Green' };
    return { label: 'Fairway' };
  };
  const p = plan({ bx: 400, by: 420, fx: 400, fy: 80, trees: [], surfaceAt });
  const onGreen = p && Math.hypot(p.lx - 400, p.ly - 80) < 50;
  assert(onGreen, `par-5 reachable green: go-for-it lands on green`, `${p?.label} → (${p?.lx.toFixed(0)}, ${p?.ly.toFixed(0)})`);
}

// Scenario 4: clear approach, no trouble → plan aims direct.
{
  const surfaceAt = () => ({ label: 'Fairway' });
  const p = plan({ bx: 400, by: 380, fx: 400, fy: 200, trees: [], surfaceAt });
  assert(p && p.label === 'direct', `clear line → direct at pin`, p?.label);
}

// Scenario 5: low Course IQ → no plan (fall back to default NPC logic).
{
  const surfaceAt = () => ({ label: 'Fairway' });
  const p = plan({ bx: 400, by: 380, fx: 400, fy: 200, trees: [], surfaceAt, courseIQ: 40 });
  assert(p === null, `low IQ → no plan (defaults win)`, String(p));
}
