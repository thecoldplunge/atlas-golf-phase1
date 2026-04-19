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

/** Scatter 4–7 small bunkers around the green on the side OPPOSITE the approach. */
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
  const radius = Math.max(g.w, g.h) * 0.55;
  const count = 4 + Math.floor(rand() * 3); // 4-6
  let added = 0;
  for (let i = 0; i < count; i++) {
    // Distribute in a fan around the approach-opposite side of the green
    const sideSign = rand() < 0.5 ? -1 : 1;
    const sidedness = 0.35 + rand() * 0.55;
    const angleOffset = (rand() - 0.5) * 1.6;
    // Base direction opposite to approach, rotated around green
    const dirX = -ax / alen;
    const dirY = -ay / alen;
    const rx = (dirX * Math.cos(angleOffset) - dirY * Math.sin(angleOffset)) + nx * sideSign * sidedness;
    const ry = (dirX * Math.sin(angleOffset) + dirY * Math.cos(angleOffset)) + ny * sideSign * sidedness;
    const rlen = Math.hypot(rx, ry) || 1;
    const cx = gc.x + (rx / rlen) * radius;
    const cy = gc.y + (ry / rlen) * radius;
    const size = 14 + rand() * 18; // 14-32
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

/** Scatter tree clusters along the fairway edges. */
function addTreeClusters(hole: Hole, landscape: Landscape, planetFlora: string[], rand: () => number): number {
  if (planetFlora.length === 0) return 0;
  const target = TREE_DENSITY_BY_LANDSCAPE[landscape] ?? 6;
  // How many clusters? 2-4
  const clusters = Math.ceil(target / 5);
  const path = hole.terrain.fairwayPath;
  let added = 0;

  const pickLook = () => planetFlora[Math.floor(rand() * planetFlora.length)];

  if (path && path.length >= 2) {
    // Place clusters along fairway path, offset perpendicular to edges
    for (let c = 0; c < clusters; c++) {
      // Pick a segment
      const segIdx = Math.min(path.length - 2, Math.floor(rand() * (path.length - 1)));
      const a = path[segIdx];
      const b = path[segIdx + 1];
      const t = 0.2 + rand() * 0.6;
      const mx = a.x + (b.x - a.x) * t;
      const my = a.y + (b.y - a.y) * t;
      // Perpendicular unit
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dlen = Math.hypot(dx, dy) || 1;
      const nx = -dy / dlen;
      const ny = dx / dlen;
      const sideSign = rand() < 0.5 ? -1 : 1;
      const offset = 55 + rand() * 50; // 55-105 off fairway center
      const cx = mx + nx * sideSign * offset;
      const cy = my + ny * sideSign * offset;
      const perCluster = Math.ceil(target / clusters);
      for (let i = 0; i < perCluster; i++) {
        const spread = 20 + rand() * 30;
        const px = cx + (rand() - 0.5) * spread * 2;
        const py = cy + (rand() - 0.5) * spread * 2;
        hole.obstacles.push({
          type: 'circle',
          x: px,
          y: py,
          r: 9 + rand() * 7,
          look: pickLook(),
        });
        added++;
      }
    }
  } else {
    // Fallback: scatter around tee-to-green axis
    const tc = teeCenter(hole);
    const gc = greenCenter(hole);
    for (let i = 0; i < target; i++) {
      const t = rand();
      const mx = tc.x + (gc.x - tc.x) * t;
      const my = tc.y + (gc.y - tc.y) * t;
      const side = rand() < 0.5 ? -1 : 1;
      const offset = 60 + rand() * 40;
      // Perpendicular
      const dx = gc.x - tc.x;
      const dy = gc.y - tc.y;
      const dlen = Math.hypot(dx, dy) || 1;
      const nx = -dy / dlen;
      const ny = dx / dlen;
      hole.obstacles.push({
        type: 'circle',
        x: mx + nx * side * offset + (rand() - 0.5) * 15,
        y: my + ny * side * offset + (rand() - 0.5) * 15,
        r: 9 + rand() * 7,
        look: pickLook(),
      });
      added++;
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

/** Ensure 6+ hazards per hole (LLM sometimes under-delivers despite schema). */
function padHazards(hole: Hole, rand: () => number): number {
  let added = 0;
  const target = 6;
  const gc = greenCenter(hole);
  const tc = teeCenter(hole);
  while (hole.hazards.length < target) {
    // Place a small bunker along the fairway on a random side
    const t = 0.3 + rand() * 0.5;
    const mx = tc.x + (gc.x - tc.x) * t;
    const my = tc.y + (gc.y - tc.y) * t;
    const side = rand() < 0.5 ? -1 : 1;
    const dx = gc.x - tc.x;
    const dy = gc.y - tc.y;
    const dlen = Math.hypot(dx, dy) || 1;
    const nx = -dy / dlen;
    const ny = dx / dlen;
    const offset = 35 + rand() * 25;
    const size = 16 + rand() * 18;
    hole.hazards.push({
      type: 'sandRect',
      x: mx + nx * side * offset - size / 2,
      y: my + ny * side * offset - size / 2,
      w: size,
      h: size * (0.7 + rand() * 0.5),
      shape: rand() < 0.5 ? 'circle' : 'oval',
      rotation: Math.round(rand() * 23) * 15,
    });
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
  }
  return { totals };
}
