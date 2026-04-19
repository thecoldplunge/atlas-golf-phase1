import type {
  DrawPreview,
  HoleData,
  RectShape,
  SlopeDirection,
  SurfaceShape,
  TreeType,
  Vec2,
} from '@/lib/types';
import { anchorHit, handleHit, pointInShape, shapeBounds } from '@/lib/vector';
import { WORLD_HEIGHT, WORLD_WIDTH } from '@/lib/world';

export const GREEN_FRINGE = 10;

const patternCache = new WeakMap<CanvasRenderingContext2D, Patterns>();

type Patterns = {
  rough: CanvasPattern | null;
  fairway: CanvasPattern | null;
  green: CanvasPattern | null;
  fringe: CanvasPattern | null;
  sand: CanvasPattern | null;
  water: CanvasPattern | null;
};

function createPatterns(ctx: CanvasRenderingContext2D): Patterns {
  return {
    rough: createRoughPattern(ctx),
    fairway: createFairwayPattern(ctx),
    green: createGreenPattern(ctx),
    fringe: createFringePattern(ctx),
    sand: createSandPattern(ctx),
    water: createWaterPattern(ctx),
  };
}

function getPatterns(ctx: CanvasRenderingContext2D): Patterns {
  const existing = patternCache.get(ctx);
  if (existing) return existing;
  const patterns = createPatterns(ctx);
  patternCache.set(ctx, patterns);
  return patterns;
}

function createPatternCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function createRoughPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const c = createPatternCanvas(20);
  const pctx = c.getContext('2d');
  if (!pctx) return null;
  pctx.fillStyle = '#2a5220';
  pctx.fillRect(0, 0, 20, 20);
  pctx.strokeStyle = 'rgba(0,0,0,0.08)';
  pctx.lineWidth = 1;
  pctx.beginPath();
  pctx.moveTo(-4, 18);
  pctx.lineTo(18, -4);
  pctx.moveTo(4, 24);
  pctx.lineTo(24, 4);
  pctx.stroke();
  return ctx.createPattern(c, 'repeat');
}

function createFairwayPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const c = createPatternCanvas(16);
  const pctx = c.getContext('2d');
  if (!pctx) return null;
  pctx.fillStyle = '#7ab855';
  pctx.fillRect(0, 0, 16, 16);
  pctx.fillStyle = 'rgba(0,0,0,0.07)';
  pctx.fillRect(8, 0, 8, 16);
  pctx.fillStyle = 'rgba(255,255,255,0.08)';
  pctx.fillRect(0, 0, 2, 16);
  return ctx.createPattern(c, 'repeat');
}

function createFringePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const c = createPatternCanvas(12);
  const pctx = c.getContext('2d');
  if (!pctx) return null;
  pctx.fillStyle = '#5fa048';
  pctx.fillRect(0, 0, 12, 12);
  pctx.fillStyle = 'rgba(0,0,0,0.05)';
  pctx.fillRect(0, 0, 6, 12);
  return ctx.createPattern(c, 'repeat');
}

function createGreenPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const c = createPatternCanvas(18);
  const pctx = c.getContext('2d');
  if (!pctx) return null;
  pctx.fillStyle = '#4ec96a';
  pctx.fillRect(0, 0, 18, 18);
  pctx.strokeStyle = 'rgba(255,255,255,0.07)';
  pctx.lineWidth = 1;
  pctx.beginPath();
  for (let i = -18; i < 36; i += 6) {
    pctx.moveTo(i, 0);
    pctx.lineTo(i + 18, 18);
  }
  pctx.stroke();
  return ctx.createPattern(c, 'repeat');
}

function createSandPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const c = createPatternCanvas(18);
  const pctx = c.getContext('2d');
  if (!pctx) return null;
  pctx.fillStyle = '#d4b96a';
  pctx.fillRect(0, 0, 18, 18);
  pctx.fillStyle = 'rgba(180,148,80,0.45)';
  for (let y = 2; y < 18; y += 5) {
    for (let x = (y % 2 === 0 ? 2 : 4); x < 18; x += 6) {
      pctx.beginPath();
      pctx.arc(x, y, 1.2, 0, Math.PI * 2);
      pctx.fill();
    }
  }
  return ctx.createPattern(c, 'repeat');
}

function createWaterPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const c = createPatternCanvas(24);
  const pctx = c.getContext('2d');
  if (!pctx) return null;
  pctx.fillStyle = '#3f88bc';
  pctx.fillRect(0, 0, 24, 24);
  pctx.strokeStyle = 'rgba(214,236,255,0.28)';
  pctx.lineWidth = 1.5;
  for (let y = 4; y <= 20; y += 8) {
    pctx.beginPath();
    pctx.moveTo(0, y);
    pctx.bezierCurveTo(4, y - 2.5, 8, y + 2.5, 12, y);
    pctx.bezierCurveTo(16, y - 2.5, 20, y + 2.5, 24, y);
    pctx.stroke();
  }
  return ctx.createPattern(c, 'repeat');
}

function traceShapePath(ctx: CanvasRenderingContext2D, shape: SurfaceShape) {
  const points = shape.path.points;
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    ctx.bezierCurveTo(current.outX, current.outY, next.inX, next.inY, next.x, next.y);
  }
  ctx.closePath();
}

function fillShape(
  ctx: CanvasRenderingContext2D,
  shape: SurfaceShape,
  fallback: string,
  pattern: CanvasPattern | null,
) {
  traceShapePath(ctx, shape);
  ctx.fillStyle = fallback;
  ctx.fill();
  if (pattern) {
    traceShapePath(ctx, shape);
    ctx.fillStyle = pattern;
    ctx.fill();
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, type: TreeType) {
  ctx.save();
  switch (type) {
    case 'pine': {
      ctx.fillStyle = '#2f6e3e';
      for (const [dx, dy, rr] of [
        [0, -r * 0.2, r * 0.74],
        [-r * 0.4, r * 0.2, r * 0.58],
        [r * 0.4, r * 0.2, r * 0.58],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#214e2b';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'oak': {
      ctx.fillStyle = '#2f6e3e';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f4c28';
      for (const [dx, dy] of [
        [-r * 0.22, -r * 0.14],
        [r * 0.18, -r * 0.2],
        [0, r * 0.2],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'palm': {
      ctx.fillStyle = '#2f6e3e';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(
          x + Math.cos(a) * r * 0.18,
          y + Math.sin(a) * r * 0.18,
          r * 0.72,
          r * 0.22,
          a,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.fillStyle = '#214e2b';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'birch': {
      ctx.fillStyle = '#86bf6a';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.88, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#edf1ea';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'cypress': {
      ctx.fillStyle = '#214e2b';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.55, r * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f6e3e';
      ctx.beginPath();
      ctx.ellipse(x, y - r * 0.08, r * 0.38, r * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function slopeVector(dir: SlopeDirection): { x: number; y: number } {
  const map: Record<SlopeDirection, { x: number; y: number }> = {
    N: { x: 0, y: -1 },
    S: { x: 0, y: 1 },
    E: { x: 1, y: 0 },
    W: { x: -1, y: 0 },
    NE: { x: 0.7, y: -0.7 },
    NW: { x: -0.7, y: -0.7 },
    SE: { x: 0.7, y: 0.7 },
    SW: { x: -0.7, y: 0.7 },
  };
  return map[dir];
}

function isTreeLook(look?: string): look is TreeType {
  return look === 'pine' || look === 'oak' || look === 'palm' || look === 'birch' || look === 'cypress';
}

export function getBoundsForId(hole: HoleData, id: string): RectShape | null {
  if (hole.terrain.tee?.id === id) {
    const t = hole.terrain.tee;
    return { x: t.x, y: t.y, w: t.w, h: t.h };
  }
  if (hole.terrain.green?.id === id) {
    return shapeBounds(hole.terrain.green);
  }
  const fairway = hole.terrain.fairway.find((segment) => segment.id === id);
  if (fairway) return shapeBounds(fairway);
  if (hole.cup?.id === id) {
    return { x: hole.cup.x - 6, y: hole.cup.y - 6, w: 12, h: 12 };
  }
  const slope = hole.slopes.find((zone) => zone.id === id);
  if (slope) return { x: slope.x - 8, y: slope.y - 8, w: 16, h: 16 };
  const obstacle = hole.obstacles.find((item) => item.id === id);
  if (obstacle) {
    return { x: obstacle.x - obstacle.r, y: obstacle.y - obstacle.r, w: obstacle.r * 2, h: obstacle.r * 2 };
  }
  const hazard = hole.hazards.find((item) => item.id === id);
  if (hazard) {
    return shapeBounds(hazard);
  }
  return null;
}

function drawSelectionBounds(ctx: CanvasRenderingContext2D, bounds: RectShape | null, zoom: number) {
  if (!bounds) return;
  ctx.save();
  ctx.strokeStyle = '#93d27c';
  ctx.lineWidth = 1.2 / zoom;
  ctx.setLineDash([8 / zoom, 6 / zoom]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.restore();
}

function drawPreview(ctx: CanvasRenderingContext2D, preview: DrawPreview | null, zoom: number) {
  if (!preview) return;
  ctx.save();
  ctx.strokeStyle = '#9fd58f';
  ctx.fillStyle = 'rgba(159,213,143,0.2)';
  ctx.lineWidth = 1.5 / zoom;
  if (preview.type === 'rect' && typeof preview.w === 'number' && typeof preview.h === 'number') {
    const x = Math.min(preview.x, preview.x + preview.w);
    const y = Math.min(preview.y, preview.y + preview.h);
    const w = Math.abs(preview.w);
    const h = Math.abs(preview.h);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }
  if (preview.type === 'circle' && typeof preview.r === 'number') {
    ctx.beginPath();
    ctx.arc(preview.x, preview.y, Math.max(0, preview.r), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export interface PathEditOverlay {
  selectedShapeId: string | null;
  activeAnchorIndex: number | null;
  activeHandle: { pointIndex: number; kind: 'in' | 'out' } | null;
}

function drawPathEditOverlay(
  ctx: CanvasRenderingContext2D,
  hole: HoleData,
  overlay: PathEditOverlay,
  zoom: number,
) {
  if (!overlay.selectedShapeId) return;
  const shape =
    hole.terrain.green?.id === overlay.selectedShapeId
      ? hole.terrain.green
      : hole.terrain.fairway.find((entry) => entry.id === overlay.selectedShapeId) ??
        hole.hazards.find((entry) => entry.id === overlay.selectedShapeId) ??
        null;
  if (!shape) return;

  ctx.save();
  traceShapePath(ctx, shape);
  ctx.strokeStyle = '#f4ffcc';
  ctx.lineWidth = 1.4 / zoom;
  ctx.stroke();

  const anchorRadius = 4.8 / zoom;
  const handleRadius = 3.7 / zoom;

  shape.path.points.forEach((p, index) => {
    const hasIn = Math.hypot(p.inX - p.x, p.inY - p.y) > 0.4;
    const hasOut = Math.hypot(p.outX - p.x, p.outY - p.y) > 0.4;

    if (hasIn) {
      ctx.strokeStyle = 'rgba(244,255,204,0.45)';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.inX, p.inY);
      ctx.stroke();
      ctx.fillStyle =
        overlay.activeHandle?.pointIndex === index && overlay.activeHandle.kind === 'in'
          ? '#ffdd44'
          : '#f4ffcc';
      ctx.beginPath();
      ctx.arc(p.inX, p.inY, handleRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (hasOut) {
      ctx.strokeStyle = 'rgba(244,255,204,0.45)';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.outX, p.outY);
      ctx.stroke();
      ctx.fillStyle =
        overlay.activeHandle?.pointIndex === index && overlay.activeHandle.kind === 'out'
          ? '#ffdd44'
          : '#f4ffcc';
      ctx.beginPath();
      ctx.arc(p.outX, p.outY, handleRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = overlay.activeAnchorIndex === index ? '#ffdd44' : '#f5fbef';
    ctx.strokeStyle = '#142415';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.arc(p.x, p.y, anchorRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
}

export function courseExtent(holes: HoleData[]): { w: number; h: number } {
  let maxX = WORLD_WIDTH;
  let maxY = WORLD_HEIGHT;
  const considerShape = (shape: SurfaceShape) => {
    const b = shapeBounds(shape);
    maxX = Math.max(maxX, b.x + b.w + 100);
    maxY = Math.max(maxY, b.y + b.h + 100);
  };
  for (const hole of holes) {
    if (hole.terrain.green) considerShape(hole.terrain.green);
    for (const s of hole.terrain.fairway) considerShape(s);
    for (const s of hole.terrain.rough) considerShape(s);
    for (const s of hole.terrain.deepRough) considerShape(s);
    for (const s of hole.terrain.desert) considerShape(s);
    for (const s of hole.hazards) considerShape(s);
    if (hole.terrain.tee) {
      maxX = Math.max(maxX, hole.terrain.tee.x + hole.terrain.tee.w + 100);
      maxY = Math.max(maxY, hole.terrain.tee.y + hole.terrain.tee.h + 100);
    }
    if (hole.cup) {
      maxX = Math.max(maxX, hole.cup.x + 50);
      maxY = Math.max(maxY, hole.cup.y + 50);
    }
    for (const o of hole.obstacles) {
      maxX = Math.max(maxX, o.x + o.r + 50);
      maxY = Math.max(maxY, o.y + o.r + 50);
    }
  }
  return { w: maxX, h: maxY };
}

function drawHoleTerrain(
  ctx: CanvasRenderingContext2D,
  hole: HoleData,
  patterns: Patterns,
  opts: { dim?: boolean } = {},
) {
  const dimAlpha = opts.dim ? 0.55 : 1;
  if (opts.dim) {
    ctx.save();
    ctx.globalAlpha = dimAlpha;
  }

  // Rough patches (lighter than default backdrop)
  for (const r of hole.terrain.rough) {
    fillShape(ctx, r, '#3a6230', patterns.rough);
  }
  // Deep rough patches
  for (const d of hole.terrain.deepRough) {
    fillShape(ctx, d, '#1e3e18', null);
  }
  // Desert waste
  for (const ds of hole.terrain.desert) {
    fillShape(ctx, ds, '#c8a06a', null);
  }

  // Water first (so fairway can overlap edges visually above)
  for (const water of hole.hazards.filter((h) => h.kind === 'water')) {
    fillShape(ctx, water, '#3f88bc', patterns.water);
  }

  // Fairway
  for (const fairway of hole.terrain.fairway) {
    fillShape(ctx, fairway, '#7ab855', patterns.fairway);
    ctx.save();
    traceShapePath(ctx, fairway);
    ctx.clip();
    const b = shapeBounds(fairway);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(b.x, b.y, b.w, b.h * 0.3);
    ctx.restore();
  }

  if (opts.dim) ctx.restore();
}

function drawHoleGreenAndSlopes(
  ctx: CanvasRenderingContext2D,
  hole: HoleData,
  patterns: Patterns,
  opts: { drawSlopes?: boolean; dim?: boolean } = {},
) {
  if (!hole.terrain.green) return;
  const { drawSlopes = true, dim = false } = opts;
  if (dim) {
    ctx.save();
    ctx.globalAlpha = 0.55;
  }

  const green = hole.terrain.green;
  const c = centroid(green);
  const fringe = {
    ...green,
    id: `${green.id}-fringe`,
    path: {
      ...green.path,
      points: green.path.points.map((p) => ({
        ...p,
        x: p.x + (p.x - c.x) * (GREEN_FRINGE / 100),
        y: p.y + (p.y - c.y) * (GREEN_FRINGE / 100),
        inX: p.inX + (p.inX - c.x) * (GREEN_FRINGE / 100),
        inY: p.inY + (p.inY - c.y) * (GREEN_FRINGE / 100),
        outX: p.outX + (p.outX - c.x) * (GREEN_FRINGE / 100),
        outY: p.outY + (p.outY - c.y) * (GREEN_FRINGE / 100),
      })),
    },
  };
  fillShape(ctx, fringe, '#5fa048', patterns.fringe);
  fillShape(ctx, green, '#4ec96a', patterns.green);

  if (drawSlopes) {
    for (const slope of hole.slopes) {
      if (!pointInShape(green, { x: slope.x, y: slope.y })) continue;
      const v = slopeVector(slope.dir);
      const len = 28 + slope.strength * 24;
      const startX = slope.x - v.x * (len / 2);
      const startY = slope.y - v.y * (len / 2);
      const endX = slope.x + v.x * (len / 2);
      const endY = slope.y + v.y * (len / 2);
      const grad = ctx.createLinearGradient(startX, startY, endX, endY);
      grad.addColorStop(0, 'rgba(10,35,10,0.08)');
      grad.addColorStop(1, `rgba(10,35,10,${0.18 + slope.strength * 0.35})`);
      ctx.save();
      traceShapePath(ctx, green);
      ctx.clip();
      ctx.strokeStyle = grad;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      const angle = Math.atan2(v.y, v.x);
      const arrowSize = 5 + slope.strength * 4;
      ctx.fillStyle = 'rgba(10,35,10,0.5)';
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - Math.cos(angle - Math.PI / 7) * arrowSize,
        endY - Math.sin(angle - Math.PI / 7) * arrowSize,
      );
      ctx.lineTo(
        endX - Math.cos(angle + Math.PI / 7) * arrowSize,
        endY - Math.sin(angle + Math.PI / 7) * arrowSize,
      );
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  if (dim) ctx.restore();
}

function drawHoleSandsAndObstacles(
  ctx: CanvasRenderingContext2D,
  hole: HoleData,
  patterns: Patterns,
  opts: { dim?: boolean } = {},
) {
  if (opts.dim) {
    ctx.save();
    ctx.globalAlpha = 0.55;
  }
  for (const sand of hole.hazards.filter((h) => h.kind === 'sand')) {
    fillShape(ctx, sand, '#d4b96a', patterns.sand);
  }
  for (const obstacle of hole.obstacles) {
    if (isTreeLook(obstacle.look)) {
      drawTree(ctx, obstacle.x, obstacle.y, obstacle.r, obstacle.look);
    } else {
      ctx.fillStyle = '#6e5a46';
      ctx.strokeStyle = '#4f3f31';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  if (opts.dim) ctx.restore();
}

function drawHoleTeeAndCup(
  ctx: CanvasRenderingContext2D,
  hole: HoleData,
  zoom: number,
  opts: { dim?: boolean; label?: string | null } = {},
) {
  if (opts.dim) {
    ctx.save();
    ctx.globalAlpha = 0.7;
  }
  if (hole.terrain.tee) {
    const tee = hole.terrain.tee;
    ctx.save();
    ctx.translate(tee.x + tee.w / 2, tee.y + tee.h / 2);
    ctx.rotate((((tee.rotation ?? 0) * Math.PI) / 180));
    ctx.fillStyle = '#5aad6a';
    ctx.fillRect(-tee.w / 2, -tee.h / 2, tee.w, tee.h);
    ctx.strokeStyle = '#3a8a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(-tee.w / 2, -tee.h / 2, tee.w, tee.h);
    ctx.restore();
  }

  if (hole.cup) {
    ctx.save();
    ctx.strokeStyle = '#f8fafc';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1.4 / zoom;
    ctx.beginPath();
    ctx.arc(hole.cup.x, hole.cup.y, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(hole.cup.x, hole.cup.y);
    ctx.lineTo(hole.cup.x, hole.cup.y - 16);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(hole.cup.x, hole.cup.y - 16);
    ctx.lineTo(hole.cup.x + 10, hole.cup.y - 12);
    ctx.lineTo(hole.cup.x, hole.cup.y - 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (opts.label && hole.terrain.tee) {
    const tee = hole.terrain.tee;
    const cx = tee.x + tee.w / 2;
    const cy = tee.y + tee.h / 2;
    ctx.save();
    ctx.font = `bold ${Math.max(10, 14 / zoom)}px sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3 / zoom;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(opts.label, cx, cy);
    ctx.fillText(opts.label, cx, cy);
    ctx.restore();
  }

  if (opts.dim) ctx.restore();
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  params: {
    hole: HoleData;
    holes?: HoleData[];
    activeHoleIndex?: number;
    selectedObjectId: string | null;
    preview: DrawPreview | null;
    zoom: number;
    pan: { x: number; y: number };
    width: number;
    height: number;
    pathEditOverlay?: PathEditOverlay;
  },
) {
  const { hole, holes, activeHoleIndex = 0, selectedObjectId, preview, zoom, pan, width, height, pathEditOverlay } = params;
  const patterns = getPatterns(ctx);
  const allHoles = holes && holes.length > 0 ? holes : [hole];
  const extent = courseExtent(allHoles);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#223923';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.scale(zoom, zoom);

  // Big-map backdrop sized to course extent
  ctx.fillStyle = '#2a5220';
  ctx.fillRect(0, 0, extent.w, extent.h);
  if (patterns.rough) {
    ctx.fillStyle = patterns.rough;
    ctx.fillRect(0, 0, extent.w, extent.h);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 0, extent.w, extent.h * 0.44);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, extent.h * 0.58, extent.w, extent.h * 0.42);

  // Pass 1: draw all NON-active holes dimmed
  allHoles.forEach((h, idx) => {
    if (idx === activeHoleIndex) return;
    drawHoleTerrain(ctx, h, patterns, { dim: true });
    drawHoleGreenAndSlopes(ctx, h, patterns, { drawSlopes: false, dim: true });
    drawHoleSandsAndObstacles(ctx, h, patterns, { dim: true });
    drawHoleTeeAndCup(ctx, h, zoom, { dim: true, label: `${h.id}` });
  });

  // Pass 2: draw active hole in full fidelity
  const active = allHoles[activeHoleIndex] ?? hole;
  drawHoleTerrain(ctx, active, patterns);
  drawHoleGreenAndSlopes(ctx, active, patterns);
  drawHoleSandsAndObstacles(ctx, active, patterns);
  drawHoleTeeAndCup(ctx, active, zoom, { label: null });

  // Active hole highlight ring
  {
    const gather: RectShape[] = [];
    if (active.terrain.green) gather.push(shapeBounds(active.terrain.green));
    for (const s of active.terrain.fairway) gather.push(shapeBounds(s));
    for (const s of active.terrain.rough) gather.push(shapeBounds(s));
    for (const s of active.terrain.deepRough) gather.push(shapeBounds(s));
    for (const s of active.terrain.desert) gather.push(shapeBounds(s));
    if (active.terrain.tee) {
      const t = active.terrain.tee;
      gather.push({ x: t.x, y: t.y, w: t.w, h: t.h });
    }
    if (gather.length > 0 && allHoles.length > 1) {
      let x1 = gather[0].x;
      let y1 = gather[0].y;
      let x2 = gather[0].x + gather[0].w;
      let y2 = gather[0].y + gather[0].h;
      for (const r of gather) {
        if (r.x < x1) x1 = r.x;
        if (r.y < y1) y1 = r.y;
        if (r.x + r.w > x2) x2 = r.x + r.w;
        if (r.y + r.h > y2) y2 = r.y + r.h;
      }
      ctx.save();
      ctx.strokeStyle = 'rgba(147,210,124,0.85)';
      ctx.setLineDash([10 / zoom, 6 / zoom]);
      ctx.lineWidth = 1.6 / zoom;
      const pad = 24;
      ctx.strokeRect(x1 - pad, y1 - pad, x2 - x1 + pad * 2, y2 - y1 + pad * 2);
      ctx.restore();
    }
  }

  drawPreview(ctx, preview, zoom);
  drawSelectionBounds(ctx, selectedObjectId ? getBoundsForId(active, selectedObjectId) : null, zoom);
  if (pathEditOverlay) {
    drawPathEditOverlay(ctx, active, pathEditOverlay, zoom);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1 / zoom;
  ctx.strokeRect(0, 0, extent.w, extent.h);
  ctx.restore();
}


function centroid(shape: SurfaceShape): Vec2 {
  const points = shape.path.points;
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

export function pointInRect(point: { x: number; y: number }, rect: RectShape): boolean {
  return (
    point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
  );
}

export function clampWorldX(v: number): number {
  return Math.max(0, Math.min(WORLD_WIDTH, v));
}

export function clampWorldY(v: number): number {
  return Math.max(0, Math.min(WORLD_HEIGHT, v));
}

export function treeRadius(type: TreeType): number {
  const map: Record<TreeType, number> = {
    pine: 14,
    oak: 16,
    palm: 13,
    birch: 10,
    cypress: 12,
  };
  return map[type];
}

export function pointInsideSurfaceShape(shape: SurfaceShape, point: Vec2): boolean {
  return pointInShape(shape, point);
}

export function hitAnchorOrHandle(
  shape: SurfaceShape,
  point: Vec2,
  zoom: number,
):
  | { type: 'anchor'; pointIndex: number }
  | { type: 'handle'; pointIndex: number; handle: 'in' | 'out' }
  | null {
  const handle = handleHit(shape, point, 8 / zoom);
  if (handle) {
    return { type: 'handle', pointIndex: handle.pointIndex, handle: handle.handle };
  }
  const anchor = anchorHit(shape, point, 10 / zoom);
  if (anchor) {
    return { type: 'anchor', pointIndex: anchor.pointIndex };
  }
  return null;
}
