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
}

interface Hole {
  id: number;
  par: 3 | 4 | 5;
  ballStart: Vec2;
  cup: Vec2;
  terrain: {
    tee: RectWithShape;
    fairway: RectWithShape[];
    green: RectWithShape;
    rough: RectWithShape[];
    deepRough: RectWithShape[];
    desert: RectWithShape[];
  };
  hazards: Array<{ type: string; x: number; y: number; w: number; h: number; shape?: string }>;
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
  scaleRectArray(hole.terrain.fairway);
  scaleRectArray(hole.terrain.rough);
  scaleRectArray(hole.terrain.deepRough);
  scaleRectArray(hole.terrain.desert);

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
 * Ensure cup is inside the green rect after any scaling.
 */
function anchorCup(hole: Hole) {
  const g = hole.terrain.green;
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  // If cup is outside green, snap to center
  if (hole.cup.x < g.x || hole.cup.x > g.x + g.w || hole.cup.y < g.y || hole.cup.y > g.y + g.h) {
    hole.cup = { x: cx, y: cy };
  }
}

export interface PostProcessReport {
  holesScaled: number;
  details: Array<{ id: number; par: number; oldDist: number; newDist: number }>;
}

export function postProcessCourse(course: Course): PostProcessReport {
  const report: PostProcessReport = { holesScaled: 0, details: [] };
  for (const hole of course.holes) {
    if (!hole.terrain || !hole.terrain.tee || !hole.terrain.green || !hole.cup) continue;
    const result = enforceDistanceCap(hole);
    anchorBallStart(hole);
    anchorCup(hole);
    if (result.changed) {
      report.holesScaled++;
      report.details.push({
        id: hole.id,
        par: hole.par,
        oldDist: Math.round(result.oldDist),
        newDist: Math.round(result.newDist),
      });
    }
  }
  return report;
}
