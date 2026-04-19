/**
 * Post-processor for LLM-generated courses. Enforces hard caps the model
 * sometimes violates (e.g. tee-to-cup distance > par max). Keeps the tee
 * fixed and pulls the green / cup / fairway tail toward the tee by a scale
 * factor so distance lands in range.
 */

interface Vec2 {
  x: number;
  y: number;
}

interface RectWithShape {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  shape?: string;
  rotation?: number;
}

interface Hole {
  id: number;
  par: 3 | 4 | 5;
  routingAngle?: number;
  corridor?: { x: number; y: number; w: number; h: number };
  ballStart: Vec2;
  cup: Vec2;
  terrain: {
    tee: RectWithShape;
    fairway?: RectWithShape[];
    fairwayPath?: Vec2[];
    fairwayWidth?: number;
    green: RectWithShape;
    rough: RectWithShape[];
    deepRough: RectWithShape[];
    desert: RectWithShape[];
  };
  hazards: Array<{ type: string; x: number; y: number; w: number; h: number; shape?: string; rotation?: number }>;
  obstacles: Array<{ type: string; x: number; y: number; r: number; look?: string }>;
  slopes: Array<{ cx: number; cy: number; strength: number; dir: string }>;
  [k: string]: unknown;
}

interface Course {
  courseName: string;
  designer: string;
  worldWidth: number;
  worldHeight: number;
  holes: Hole[];
}

const MAX_BY_PAR: Record<number, number> = { 3: 240, 4: 500, 5: 650 };
const MIN_BY_PAR: Record<number, number> = { 3: 150, 4: 320, 5: 500 };

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function scalePointAroundPivot(point: Vec2, pivot: Vec2, factor: number): Vec2 {
  return {
    x: pivot.x + (point.x - pivot.x) * factor,
    y: pivot.y + (point.y - pivot.y) * factor,
  };
}

/**
 * Scale hole length to fit [min, max] for its par. Keeps the tee as pivot
 * and scales cup / green / fairway rects / hazards / obstacles proportionally
 * along the vector from tee to cup.
 */
function enforceDistanceCap(hole: Hole): { changed: boolean; oldDist: number; newDist: number } {
  const tee = hole.terrain.tee;
  const pivot: Vec2 = { x: tee.x + tee.w / 2, y: tee.y + tee.h / 2 };
  const oldDist = distance(pivot, hole.cup);
  const maxD = MAX_BY_PAR[hole.par];
  const minD = MIN_BY_PAR[hole.par];

  let factor = 1;
  if (oldDist > maxD) factor = maxD / oldDist;
  else if (oldDist > 0 && oldDist < minD) factor = minD / oldDist;
  else return { changed: false, oldDist, newDist: oldDist };

  // Scale cup
  const newCup = scalePointAroundPivot(hole.cup, pivot, factor);
  hole.cup = newCup;

  // Scale green by its center moving with the cup — keep green size intact
  const greenCenterOld: Vec2 = { x: hole.terrain.green.x + hole.terrain.green.w / 2, y: hole.terrain.green.y + hole.terrain.green.h / 2 };
  const greenCenterNew = scalePointAroundPivot(greenCenterOld, pivot, factor);
  hole.terrain.green.x = greenCenterNew.x - hole.terrain.green.w / 2;
  hole.terrain.green.y = greenCenterNew.y - hole.terrain.green.h / 2;

  // Scale fairway / rough / deepRough / desert rects' positions (not sizes)
  const scaleRectArray = (arr: RectWithShape[]) => {
    for (const r of arr) {
      const c: Vec2 = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      const nc = scalePointAroundPivot(c, pivot, factor);
      r.x = nc.x - r.w / 2;
      r.y = nc.y - r.h / 2;
    }
  };
  if (Array.isArray(hole.terrain.fairway)) scaleRectArray(hole.terrain.fairway);
  scaleRectArray(hole.terrain.rough);
  scaleRectArray(hole.terrain.deepRough);
  scaleRectArray(hole.terrain.desert);

  // Also scale fairwayPath waypoints inward
  if (Array.isArray(hole.terrain.fairwayPath)) {
    hole.terrain.fairwayPath = hole.terrain.fairwayPath.map((p) => scalePointAroundPivot(p, pivot, factor));
  }

  // Scale hazards
  for (const h of hole.hazards) {
    const c: Vec2 = { x: h.x + h.w / 2, y: h.y + h.h / 2 };
    const nc = scalePointAroundPivot(c, pivot, factor);
    h.x = nc.x - h.w / 2;
    h.y = nc.y - h.h / 2;
  }

  // Scale obstacle centers (trees)
  for (const o of hole.obstacles) {
    const nc = scalePointAroundPivot({ x: o.x, y: o.y }, pivot, factor);
    o.x = nc.x;
    o.y = nc.y;
  }

  return { changed: true, oldDist, newDist: distance(pivot, hole.cup) };
}

/** Ensure ballStart is inside the tee rect. */
function anchorBallStart(hole: Hole) {
  const tee = hole.terrain.tee;
  const cx = tee.x + tee.w / 2;
  const cy = tee.y + tee.h / 2;
  hole.ballStart = { x: cx, y: cy };
}

/**
 * Ensure cup is inside the green. We ALWAYS place the cup inside the
 * inner 70% of the green bounding box so it's visibly on the green
 * regardless of the green's shape preset (oval, squircle, etc.) and
 * regardless of any rotation applied later.
 */
function anchorCup(hole: Hole) {
  const g = hole.terrain.green;
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  // Target: the cup's original offset from green center, clamped to inner 65% of the green.
  const dx = hole.cup.x - cx;
  const dy = hole.cup.y - cy;
  const maxDx = (g.w / 2) * 0.65;
  const maxDy = (g.h / 2) * 0.65;
  const clampedDx = Math.max(-maxDx, Math.min(maxDx, dx));
  const clampedDy = Math.max(-maxDy, Math.min(maxDy, dy));
  // If the cup was wildly off-green, just center it.
  const farOff =
    Math.abs(dx) > g.w * 0.9 || Math.abs(dy) > g.h * 0.9;
  hole.cup = farOff
    ? { x: cx, y: cy }
    : { x: cx + clampedDx, y: cy + clampedDy };
}

/** Point-in-axis-aligned-rect test. */
function pointInRect(p: Vec2, rect: RectWithShape): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

/** Rect overlaps another rect (axis-aligned). */
function rectsOverlap(a: RectWithShape, b: RectWithShape): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/**
 * Evict hazards that sit on top of the green. Water is pushed further out than
 * sand because water on a green is never acceptable; sand may kiss the edge.
 */
function evictHazardsFromGreen(hole: Hole): number {
  const g = hole.terrain.green;
  const gc: Vec2 = { x: g.x + g.w / 2, y: g.y + g.h / 2 };
  const greenRadius = Math.max(g.w, g.h) / 2;
  let moved = 0;

  for (const hz of hole.hazards) {
    const hc: Vec2 = { x: hz.x + hz.w / 2, y: hz.y + hz.h / 2 };
    const hazRadius = Math.max(hz.w, hz.h) / 2;
    const dx = hc.x - gc.x;
    const dy = hc.y - gc.y;
    const dist = Math.hypot(dx, dy);
    const isWater = hz.type === 'waterRect';
    // Sand may touch green edge lightly. Water must stay clear.
    const minDist = isWater
      ? greenRadius + hazRadius + 16
      : greenRadius + hazRadius * 0.6 + 4;
    if (dist < minDist) {
      let ux: number, uy: number;
      if (dist > 0.5) {
        ux = dx / dist;
        uy = dy / dist;
      } else {
        ux = 0;
        uy = 1;
      }
      const newCx = gc.x + ux * minDist;
      const newCy = gc.y + uy * minDist;
      hz.x = newCx - hz.w / 2;
      hz.y = newCy - hz.h / 2;
      moved++;
    }
  }
  return moved;
}

/**
 * Evict water hazards that overlap any fairway rect. Water should sit
 * beside the fairway, not on it. For each water rect that touches the
 * fairway bbox, push it laterally (perpendicular to the tee→green line)
 * until it clears the fairway.
 */
function evictWaterFromFairway(hole: Hole): number {
  if (!Array.isArray(hole.terrain.fairway) || hole.terrain.fairway.length === 0) return 0;
  const tc: Vec2 = { x: hole.terrain.tee.x + hole.terrain.tee.w / 2, y: hole.terrain.tee.y + hole.terrain.tee.h / 2 };
  const gc: Vec2 = { x: hole.terrain.green.x + hole.terrain.green.w / 2, y: hole.terrain.green.y + hole.terrain.green.h / 2 };
  const ax = gc.x - tc.x;
  const ay = gc.y - tc.y;
  const alen = Math.hypot(ax, ay) || 1;
  // Perpendicular unit vector to the tee→green line
  const nx = -ay / alen;
  const ny = ax / alen;

  // Compute fairway bbox (axis-aligned bound of all fairway rects)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of hole.terrain.fairway) {
    minX = Math.min(minX, f.x);
    minY = Math.min(minY, f.y);
    maxX = Math.max(maxX, f.x + f.w);
    maxY = Math.max(maxY, f.y + f.h);
  }
  const fwCx = (minX + maxX) / 2;
  const fwCy = (minY + maxY) / 2;
  const fwHalfW = (maxX - minX) / 2;
  const fwHalfH = (maxY - minY) / 2;

  let moved = 0;
  for (const hz of hole.hazards) {
    if (hz.type !== 'waterRect') continue;
    const hc: Vec2 = { x: hz.x + hz.w / 2, y: hz.y + hz.h / 2 };
    // Simple overlap check against fairway bbox
    const overlap =
      hc.x >= minX - hz.w / 2 &&
      hc.x <= maxX + hz.w / 2 &&
      hc.y >= minY - hz.h / 2 &&
      hc.y <= maxY + hz.h / 2;
    if (!overlap) continue;
    // Decide push direction: whichever side of the tee→green line the water
    // currently leans toward (dot product with perpendicular).
    const relX = hc.x - fwCx;
    const relY = hc.y - fwCy;
    const lateral = relX * nx + relY * ny;
    const sign = lateral >= 0 ? 1 : -1;
    // Push far enough that water is fully outside the fairway bbox in the
    // perpendicular direction.
    const pushDist = Math.max(fwHalfW, fwHalfH) + Math.max(hz.w, hz.h) / 2 + 20;
    hz.x = fwCx + nx * sign * pushDist - hz.w / 2;
    hz.y = fwCy + ny * sign * pushDist - hz.h / 2;
    moved++;
  }
  return moved;
}

/** Also evict trees that sit on the green. */
function evictObstaclesFromGreen(hole: Hole): number {
  const g = hole.terrain.green;
  const gc: Vec2 = { x: g.x + g.w / 2, y: g.y + g.h / 2 };
  const greenRadius = Math.max(g.w, g.h) / 2;
  let moved = 0;
  for (const o of hole.obstacles) {
    const dx = o.x - gc.x;
    const dy = o.y - gc.y;
    const dist = Math.hypot(dx, dy);
    const minDist = greenRadius + o.r + 6;
    if (dist < minDist) {
      let ux: number, uy: number;
      if (dist > 0.5) { ux = dx / dist; uy = dy / dist; }
      else { ux = 0; uy = 1; }
      o.x = gc.x + ux * minDist;
      o.y = gc.y + uy * minDist;
      moved++;
    }
  }
  return moved;
}

/**
 * Rotate every geometric element of a hole around the hole's centroid.
 */
function rotatePointBy(p: Vec2, pivot: Vec2, rad: number): Vec2 {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: pivot.x + (p.x - pivot.x) * cos - (p.y - pivot.y) * sin,
    y: pivot.y + (p.x - pivot.x) * sin + (p.y - pivot.y) * cos,
  };
}

function holeCentroid(hole: Hole): Vec2 {
  // Use midpoint of tee-center and cup
  const t = hole.terrain.tee;
  const tc: Vec2 = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
  return { x: (tc.x + hole.cup.x) / 2, y: (tc.y + hole.cup.y) / 2 };
}

function applyRoutingAngle(hole: Hole) {
  const angle = hole.routingAngle ?? 0;
  if (!Number.isFinite(angle) || angle === 0) return;
  const rad = (angle * Math.PI) / 180;
  const pivot = holeCentroid(hole);

  const rotateRect = (r: RectWithShape) => {
    const c = rotatePointBy({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, pivot, rad);
    r.x = c.x - r.w / 2;
    r.y = c.y - r.h / 2;
    // Stack per-surface rotation on top of routing rotation
    r.rotation = normalize360(((r.rotation as number | undefined) ?? 0) + angle);
  };

  rotateRect(hole.terrain.tee);
  rotateRect(hole.terrain.green);
  if (Array.isArray(hole.terrain.fairway)) hole.terrain.fairway.forEach(rotateRect);
  if (Array.isArray(hole.terrain.fairwayPath)) {
    hole.terrain.fairwayPath = hole.terrain.fairwayPath.map((p) => rotatePointBy(p, pivot, rad));
  }
  hole.terrain.rough.forEach(rotateRect);
  hole.terrain.deepRough.forEach(rotateRect);
  hole.terrain.desert.forEach(rotateRect);

  for (const hz of hole.hazards) {
    const c = rotatePointBy({ x: hz.x + hz.w / 2, y: hz.y + hz.h / 2 }, pivot, rad);
    hz.x = c.x - hz.w / 2;
    hz.y = c.y - hz.h / 2;
    hz.rotation = normalize360((hz.rotation ?? 0) + angle);
  }
  for (const o of hole.obstacles) {
    const c = rotatePointBy({ x: o.x, y: o.y }, pivot, rad);
    o.x = c.x;
    o.y = c.y;
  }
  hole.cup = rotatePointBy(hole.cup, pivot, rad);
  hole.ballStart = rotatePointBy(hole.ballStart, pivot, rad);
}

function normalize360(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

export interface PostProcessReport {
  holesScaled: number;
  holesRotated: number;
  hazardsEvicted: number;
  treesEvicted: number;
  corridorsClamped: number;
  details: Array<{ id: number; par: number; oldDist: number; newDist: number; routingAngle?: number }>;
}

export function postProcessCourse(course: Course): PostProcessReport {
  const report: PostProcessReport = {
    holesScaled: 0,
    holesRotated: 0,
    hazardsEvicted: 0,
    treesEvicted: 0,
    corridorsClamped: 0,
    details: [],
  };
  for (const hole of course.holes) {
    if (!hole.terrain || !hole.terrain.tee || !hole.terrain.green || !hole.cup) continue;
    // Apply routing angle FIRST, then distance cap (distance cap works regardless of rotation)
    if ((hole.routingAngle ?? 0) !== 0) {
      applyRoutingAngle(hole);
      report.holesRotated++;
    }
    const result = enforceDistanceCap(hole);
    anchorBallStart(hole);
    anchorCup(hole);
    // Evict any bunker/water/tree that landed on top of the green
    report.hazardsEvicted += evictHazardsFromGreen(hole);
    // Evict water sitting on fairway (water should be beside the corridor, not on it)
    report.hazardsEvicted += evictWaterFromFairway(hole);
    report.treesEvicted += evictObstaclesFromGreen(hole);
    // Clamp into allocated corridor (if any)
    if (hole.corridor) {
      const clamped = clampHoleToCorridor(hole, hole.corridor);
      if (clamped) report.corridorsClamped++;
    }
    if (result.changed) {
      report.holesScaled++;
      report.details.push({
        id: hole.id,
        par: hole.par,
        oldDist: Math.round(result.oldDist),
        newDist: Math.round(result.newDist),
        routingAngle: hole.routingAngle,
      });
    }
  }
  return report;
}

/**
 * Clamp every geometric element of the hole to stay inside the given corridor
 * rectangle. For points, hard-clamp. For rects/bboxes, shift inward if their
 * bounds exceed the corridor.
 */
function clampHoleToCorridor(hole: Hole, corridor: { x: number; y: number; w: number; h: number }): boolean {
  const minX = corridor.x + 8;
  const minY = corridor.y + 8;
  const maxX = corridor.x + corridor.w - 8;
  const maxY = corridor.y + corridor.h - 8;
  let clamped = false;

  const clampRect = (r: RectWithShape) => {
    let cx = r.x + r.w / 2;
    let cy = r.y + r.h / 2;
    const halfW = Math.min(r.w / 2, (maxX - minX) / 2);
    const halfH = Math.min(r.h / 2, (maxY - minY) / 2);
    const nx = Math.max(minX + halfW, Math.min(maxX - halfW, cx));
    const ny = Math.max(minY + halfH, Math.min(maxY - halfH, cy));
    if (nx !== cx || ny !== cy) clamped = true;
    r.x = nx - r.w / 2;
    r.y = ny - r.h / 2;
  };

  const clampPoint = (p: Vec2) => {
    const nx = Math.max(minX, Math.min(maxX, p.x));
    const ny = Math.max(minY, Math.min(maxY, p.y));
    if (nx !== p.x || ny !== p.y) clamped = true;
    p.x = nx;
    p.y = ny;
  };

  clampRect(hole.terrain.tee);
  clampRect(hole.terrain.green);
  if (Array.isArray(hole.terrain.fairway)) hole.terrain.fairway.forEach(clampRect);
  if (Array.isArray(hole.terrain.fairwayPath)) hole.terrain.fairwayPath.forEach(clampPoint);
  hole.terrain.rough.forEach(clampRect);
  hole.terrain.deepRough.forEach(clampRect);
  hole.terrain.desert.forEach(clampRect);
  for (const hz of hole.hazards) clampRect(hz);
  for (const o of hole.obstacles) {
    const p = { x: o.x, y: o.y };
    clampPoint(p);
    o.x = p.x;
    o.y = p.y;
  }
  clampPoint(hole.cup);
  clampPoint(hole.ballStart);
  return clamped;
}
