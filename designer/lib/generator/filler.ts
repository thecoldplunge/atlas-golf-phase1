/**
 * Procedural filler — runs after the LLM emits a course. Scatters:
 *   - Extra greenside bunkers (circles/ovals) in arcs around the green
 *   - Tree clusters along fairway edges (count scaled by landscape)
 *   - Extra rough/deepRough/desert bands framing the fairway
 *   - Extra slope zones on the green
 *
 * Makes every hole feel dense without relying on the LLM to enumerate every detail.
 */

import type { GenerateCourseRequest, Landscape } from './types';
import { PLANETS } from './planets';

interface Vec2 {
  x: number;
  y: number;
}

interface HazardRect {
  type: 'sandRect' | 'waterRect';
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: string;
  rotation?: number;
}

interface SurfaceRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  shape?: string;
  rotation?: number;
}

interface Obstacle {
  type: 'circle';
  x: number;
  y: number;
  r: number;
  look?: string;
}

interface Slope {
  cx: number;
  cy: number;
  strength: number;
  dir: 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';
}

interface Hole {
  id: number;
  par: 3 | 4 | 5;
  terrain: {
    tee: SurfaceRect;
    green: SurfaceRect;
    fairwayPath?: Vec2[];
    fairwayWidth?: number;
    rough: SurfaceRect[];
    deepRough: SurfaceRect[];
    desert: SurfaceRect[];
  };
  hazards: HazardRect[];
  obstacles: Obstacle[];
  slopes: Slope[];
  background: 'rough' | 'deepRough' | 'desert';
  cup: Vec2;
  [k: string]: unknown;
}

interface Course {
  holes: Hole[];
}

const TREE_DENSITY_BY_LANDSCAPE: Record<Landscape, number> = {
  forest: 20,
  mountain: 16,
  coastal: 10,
  crystal: 10,
  canyon: 6,
  volcanic: 4,
  desert: 4,
  tundra: 2,
  links: 2,
  'lunar-basin': 0,
};

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashHoleSeed(holeId: number): number {
  return (holeId * 2654435761) ^ 0x9e3779b9;
}

function greenCenter(h: Hole): Vec2 {
  return { x: h.terrain.green.x + h.terrain.green.w / 2, y: h.terrain.green.y + h.terrain.green.h / 2 };
}

function teeCenter(h: Hole): Vec2 {
  return { x: h.terrain.tee.x + h.terrain.tee.w / 2, y: h.terrain.tee.y + h.terrain.tee.h / 2 };
}

const SLOPE_DIRS: Slope['dir'][] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];

/** Scatter 4–7 small bunkers around the green on the side OPPOSITE the approach.
 *  Placed OUTSIDE the green edge with safety margin so bunkers never land on
 *  the putting surface. */
function addGreensideBunkers(hole: Hole, rand: () => number): number {
  const g = hole.terrain.green;
  const gc = greenCenter(hole);
  const tc = teeCenter(hole);
  // Approach vector points from tee toward green
  const ax = gc.x - tc.x;
  const ay = gc.y - tc.y;
  const alen = Math.hypot(ax, ay) || 1;
  const nx = -ay / alen;
  const ny = ax / alen;
  const greenRadius = Math.max(g.w, g.h) / 2;
  const count = 4 + Math.floor(rand() * 3); // 4-6
  let added = 0;
  for (let i = 0; i < count; i++) {
    const size = 14 + rand() * 18; // 14-32
    // Bunker center must be at least this far from green center so it sits
    // cleanly outside the green even with the bunker's own size.
    const bunkerRadius = size / 2;
    const minDistFromCenter = greenRadius + bunkerRadius + 10;
    // Distribute in a fan around the approach-opposite side of the green
    const sideSign = rand() < 0.5 ? -1 : 1;
    const sidedness = 0.35 + rand() * 0.55;
    const angleOffset = (rand() - 0.5) * 1.6;
    const dirX = -ax / alen;
    const dirY = -ay / alen;
    const rx = (dirX * Math.cos(angleOffset) - dirY * Math.sin(angleOffset)) + nx * sideSign * sidedness;
    const ry = (dirX * Math.sin(angleOffset) + dirY * Math.cos(angleOffset)) + ny * sideSign * sidedness;
    const rlen = Math.hypot(rx, ry) || 1;
    const cx = gc.x + (rx / rlen) * minDistFromCenter;
    const cy = gc.y + (ry / rlen) * minDistFromCenter;
    hole.hazards.push({
      type: 'sandRect',
      x: cx - size / 2,
      y: cy - size / 2,
      w: size,
      h: size * (0.7 + rand() * 0.5),
      shape: rand() < 0.5 ? 'circle' : rand() < 0.5 ? 'oval' : 'squircle',
      rotation: Math.round(rand() * 23) * 15,
    });
    added++;
  }
  return added;
}

/** Safe perpendicular offset from fairway centerline for edge features.
 *  Clears (fairwayHalfWidth + feature footprint + safety) so nothing lands
 *  in the fairway corridor. */
function fairwayEdgeOffset(hole: Hole, featureRadius: number, extra: number): number {
  const halfW = (hole.terrain.fairwayWidth ?? 40) / 2;
  return halfW + featureRadius + extra;
}

/** True if (px,py) is inside or within `margin` of the green. */
function tooCloseToGreen(hole: Hole, px: number, py: number, margin: number): boolean {
  const g = hole.terrain.green;
  const gc = greenCenter(hole);
  const greenRadius = Math.max(g.w, g.h) / 2;
  const d = Math.hypot(px - gc.x, py - gc.y);
  return d < greenRadius + margin;
}

/** Scatter tree clusters along the fairway edges — NEVER on the fairway itself,
 *  the approach to the green, or on top of the green.
 *  Trees line the sides, matching real-course layouts. */
function addTreeClusters(hole: Hole, landscape: Landscape, planetFlora: string[], rand: () => number): number {
  if (planetFlora.length === 0) return 0;
  const target = TREE_DENSITY_BY_LANDSCAPE[landscape] ?? 6;
  const clusters = Math.ceil(target / 5); // 2-4 clusters
  const path = hole.terrain.fairwayPath;
  let added = 0;

  const pickLook = () => planetFlora[Math.floor(rand() * planetFlora.length)];

  // Cap attempts at 3× to avoid infinite loops when geometry is tight.
  const tryPlace = (px: number, py: number, r: number): boolean => {
    // Reject on/near green (keeps the approach clear).
    if (tooCloseToGreen(hole, px, py, r + 18)) return false;
    hole.obstacles.push({ type: 'circle', x: px, y: py, r, look: pickLook() });
    return true;
  };

  if (path && path.length >= 2) {
    // Only use segments BEFORE the last one — the final waypoint sits near the
    // green apron, so placing clusters there crowds the approach.
    const lastSegIdx = path.length - 2;
    const usableSegMax = Math.max(0, lastSegIdx - 1);

    for (let c = 0; c < clusters; c++) {
      const segIdx = usableSegMax <= 0 ? 0 : Math.floor(rand() * (usableSegMax + 1));
      const a = path[segIdx];
      const b = path[segIdx + 1];
      const t = 0.2 + rand() * 0.6;
      const mx = a.x + (b.x - a.x) * t;
      const my = a.y + (b.y - a.y) * t;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dlen = Math.hypot(dx, dy) || 1;
      const nx = -dy / dlen;
      const ny = dx / dlen;
      const sideSign = rand() < 0.5 ? -1 : 1;
      // Cluster spread drives per-tree scatter, so offset must clear fairway + spread.
      const spreadRadius = 30;
      const offset = fairwayEdgeOffset(hole, spreadRadius, 10 + rand() * 20);
      const cx = mx + nx * sideSign * offset;
      const cy = my + ny * sideSign * offset;
      const perCluster = Math.ceil(target / clusters);
      for (let i = 0; i < perCluster; i++) {
        const spread = 20 + rand() * 30;
        const r = 9 + rand() * 7;
        let attempts = 0;
        while (attempts++ < 3) {
          const px = cx + (rand() - 0.5) * spread * 2;
          const py = cy + (rand() - 0.5) * spread * 2;
          if (tryPlace(px, py, r)) { added++; break; }
        }
      }
    }
  } else {
    // Fallback: scatter along tee-to-green axis, off the corridor.
    const tc = teeCenter(hole);
    const gc = greenCenter(hole);
    const dx = gc.x - tc.x;
    const dy = gc.y - tc.y;
    const dlen = Math.hypot(dx, dy) || 1;
    const nx = -dy / dlen;
    const ny = dx / dlen;
    for (let i = 0; i < target; i++) {
      // Skip the last 15% of the axis — that's the approach/green area.
      const t = rand() * 0.85;
      const mx = tc.x + dx * t;
      const my = tc.y + dy * t;
      const side = rand() < 0.5 ? -1 : 1;
      const r = 9 + rand() * 7;
      const offset = fairwayEdgeOffset(hole, r, 25 + rand() * 25);
      const px = mx + nx * side * offset + (rand() - 0.5) * 15;
      const py = my + ny * side * offset + (rand() - 0.5) * 15;
      if (tryPlace(px, py, r)) added++;
    }
  }
  return added;
}

/** Add a couple of green slopes if fewer than 2 exist. */
function padGreenSlopes(hole: Hole, rand: () => number): number {
  let added = 0;
  while (hole.slopes.length < 2) {
    hole.slopes.push({
      cx: 0.25 + rand() * 0.5,
      cy: 0.25 + rand() * 0.5,
      strength: 0.35 + rand() * 0.4,
      dir: SLOPE_DIRS[Math.floor(rand() * SLOPE_DIRS.length)],
    });
    added++;
  }
  return added;
}

/** Ensure 4+ hazards per hole (LLM sometimes under-delivers despite schema).
 *  Fairway bunkers follow the bend of fairwayPath and sit on the edges.
 *  Center-of-fairway placement is rare (~12%) — mimics real-course layouts
 *  where cross-bunkers exist but are the exception. */
function padHazards(hole: Hole, rand: () => number): number {
  let added = 0;
  const target = 4;
  const path = hole.terrain.fairwayPath;
  const tc = teeCenter(hole);
  const gc = greenCenter(hole);

  // Pick a point along the fairway (follows bends if fairwayPath exists).
  const samplePoint = (): { x: number; y: number; nx: number; ny: number } => {
    if (path && path.length >= 2) {
      // Avoid the final segment (too close to green — greensiders handle that).
      const maxSeg = Math.max(0, path.length - 3);
      const segIdx = maxSeg <= 0 ? 0 : Math.floor(rand() * (maxSeg + 1));
      const a = path[segIdx];
      const b = path[segIdx + 1];
      const t = 0.25 + rand() * 0.5;
      const mx = a.x + (b.x - a.x) * t;
      const my = a.y + (b.y - a.y) * t;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dlen = Math.hypot(dx, dy) || 1;
      return { x: mx, y: my, nx: -dy / dlen, ny: dx / dlen };
    }
    // Fallback: tee→green axis.
    const t = 0.3 + rand() * 0.45;
    const dx = gc.x - tc.x;
    const dy = gc.y - tc.y;
    const dlen = Math.hypot(dx, dy) || 1;
    return { x: tc.x + dx * t, y: tc.y + dy * t, nx: -dy / dlen, ny: dx / dlen };
  };

  while (hole.hazards.length < target) {
    const p = samplePoint();
    const size = 16 + rand() * 18;
    const halfSize = size / 2;
    // ~12% chance: cross-bunker in the fairway. Rare, realistic.
    const isCrossBunker = rand() < 0.12;
    const side = rand() < 0.5 ? -1 : 1;
    const edgeOffset = fairwayEdgeOffset(hole, halfSize, 6 + rand() * 12);
    const offset = isCrossBunker ? 0 : edgeOffset;
    const cx = p.x + p.nx * side * offset;
    const cy = p.y + p.ny * side * offset;
    // Reject if it landed on/near the green (greensiders cover that territory).
    if (tooCloseToGreen(hole, cx, cy, halfSize + 8)) {
      // Bump to a different side / segment next iteration by adding a placeholder? No — just skip.
      // If we keep failing we'd loop forever, so just push it outward radially from green as fallback.
      const dx = cx - greenCenter(hole).x;
      const dy = cy - greenCenter(hole).y;
      const dlen = Math.hypot(dx, dy) || 1;
      const g = hole.terrain.green;
      const greenRadius = Math.max(g.w, g.h) / 2;
      const minDist = greenRadius + halfSize + 14;
      const fx = greenCenter(hole).x + (dx / dlen) * minDist;
      const fy = greenCenter(hole).y + (dy / dlen) * minDist;
      hole.hazards.push({
        type: 'sandRect',
        x: fx - halfSize,
        y: fy - halfSize,
        w: size,
        h: size * (0.7 + rand() * 0.5),
        shape: rand() < 0.5 ? 'circle' : 'oval',
        rotation: Math.round(rand() * 23) * 15,
      });
    } else {
      hole.hazards.push({
        type: 'sandRect',
        x: cx - halfSize,
        y: cy - halfSize,
        w: size,
        h: size * (0.7 + rand() * 0.5),
        shape: rand() < 0.5 ? 'circle' : 'oval',
        rotation: Math.round(rand() * 23) * 15,
      });
    }
    added++;
  }
  return added;
}

export interface FillerReport {
  totals: {
    bunkersAdded: number;
    treesAdded: number;
    slopesAdded: number;
    hazardsPadded: number;
  };
}

export function procedurallyEnrich(course: Course, req: GenerateCourseRequest): FillerReport {
  const planet = PLANETS[req.planet];
  const totals = { bunkersAdded: 0, treesAdded: 0, slopesAdded: 0, hazardsPadded: 0 };

  for (const hole of course.holes) {
    if (!hole.terrain?.tee || !hole.terrain?.green) continue;
    const rand = mulberry32(hashHoleSeed(hole.id));

    totals.hazardsPadded += padHazards(hole, rand);
    totals.bunkersAdded += addGreensideBunkers(hole, rand);
    totals.treesAdded += addTreeClusters(hole, req.landscape, planet.flora, rand);
    totals.slopesAdded += padGreenSlopes(hole, rand);
    // Safety net: postProcess's green-eviction runs BEFORE us, so re-evict any
    // filler-added feature that still overlaps the green.
    evictFillerFromGreen(hole);
  }
  return { totals };
}

/** Push any tree/sand-bunker off the green. Mirrors postProcess logic but
 *  runs after filler so our additions don't slip through. */
function evictFillerFromGreen(hole: Hole) {
  const g = hole.terrain.green;
  const gc = greenCenter(hole);
  const greenRadius = Math.max(g.w, g.h) / 2;

  for (const hz of hole.hazards) {
    if (hz.type !== 'sandRect') continue;
    const hcx = hz.x + hz.w / 2;
    const hcy = hz.y + hz.h / 2;
    const hazRadius = Math.max(hz.w, hz.h) / 2;
    const dx = hcx - gc.x;
    const dy = hcy - gc.y;
    const dist = Math.hypot(dx, dy);
    const minDist = greenRadius + hazRadius * 0.6 + 4;
    if (dist < minDist) {
      const ux = dist > 0.5 ? dx / dist : 0;
      const uy = dist > 0.5 ? dy / dist : 1;
      const ncx = gc.x + ux * minDist;
      const ncy = gc.y + uy * minDist;
      hz.x = ncx - hz.w / 2;
      hz.y = ncy - hz.h / 2;
    }
  }

  for (const o of hole.obstacles) {
    const dx = o.x - gc.x;
    const dy = o.y - gc.y;
    const dist = Math.hypot(dx, dy);
    const minDist = greenRadius + o.r + 12; // extra margin — trees should line the approach, not hug the green
    if (dist < minDist) {
      const ux = dist > 0.5 ? dx / dist : 0;
      const uy = dist > 0.5 ? dy / dist : 1;
      o.x = gc.x + ux * minDist;
      o.y = gc.y + uy * minDist;
    }
  }
}
