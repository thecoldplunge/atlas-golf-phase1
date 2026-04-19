import type { ExportCourse, ExportHole, HoleData, ShapePreset, SlopeDirection, SurfaceKind, SurfaceShape } from '@/lib/types';
import { createEmptyHole, getDefaultEntityId } from '@/lib/store';
import {
  createPresetVectorShape,
  createRectVectorShape,
  fromExportVectorShape,
  pointInShape,
  rotateShape,
  shapeBounds,
  toExportVectorShape,
} from '@/lib/vector';

const VALID_SHAPES: ShapePreset[] = ['rectangle', 'circle', 'oval', 'squircle', 'diamond', 'capsule'];

function asShape(raw: unknown, fallback: ShapePreset): ShapePreset {
  return typeof raw === 'string' && (VALID_SHAPES as string[]).includes(raw) ? (raw as ShapePreset) : fallback;
}

/**
 * Add small organic perturbation to anchor points + handles so the shape
 * looks hand-drawn rather than geometrically perfect. Leaves overall
 * position/scale intact.
 */
function jitterShape(shape: SurfaceShape, magnitude = 0.06): SurfaceShape {
  const bounds = shapeBounds(shape);
  const scale = Math.min(bounds.w, bounds.h) * magnitude;
  if (!(scale > 0)) return shape;
  // Seed with a deterministic hash of id so re-renders don't shimmer
  let seed = 0;
  for (let i = 0; i < shape.id.length; i++) seed = (seed * 31 + shape.id.charCodeAt(i)) | 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) | 0;
    return ((seed >>> 0) / 0xffffffff) * 2 - 1;
  };
  shape.path.points = shape.path.points.map((p) => {
    const dx = rand() * scale;
    const dy = rand() * scale;
    return {
      ...p,
      x: p.x + dx,
      y: p.y + dy,
      inX: p.inX + dx,
      inY: p.inY + dy,
      outX: p.outX + dx,
      outY: p.outY + dy,
    };
  });
  return shape;
}

function createShapeFromRect(params: {
  id: string;
  kind: SurfaceKind;
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: ShapePreset;
  rotation?: number;
  jitter?: boolean;
}): SurfaceShape {
  const { id, kind, x, y, w, h, shape, rotation, jitter = true } = params;
  const preset: ShapePreset = shape ?? 'rectangle';
  let result = createPresetVectorShape({ id, kind, x, y, w, h, preset });
  if (rotation && Number.isFinite(rotation) && rotation !== 0) {
    result = rotateShape(result, rotation);
  }
  return jitter ? jitterShape(result) : result;
}

/** Build a fairway capsule between two waypoints, oriented along the segment. */
function capsuleBetween(params: {
  id: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
  width: number;
}): SurfaceShape {
  const { id, a, b, width } = params;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) {
    // Degenerate; emit a small circle
    return createShapeFromRect({
      id,
      kind: 'fairway',
      x: a.x - width / 2,
      y: a.y - width / 2,
      w: width,
      h: width,
      shape: 'circle',
    });
  }
  // Base capsule horizontal along +x, length = distance(a,b), height = width
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const baseX = cx - length / 2;
  const baseY = cy - width / 2;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  let shape = createPresetVectorShape({
    id,
    kind: 'fairway',
    x: baseX,
    y: baseY,
    w: length,
    h: width,
    preset: 'capsule',
  });
  if (angleDeg !== 0) shape = rotateShape(shape, angleDeg);
  return jitterShape(shape, 0.04);
}

const slopeDirections: SlopeDirection[] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
// Finer raster = smoother fairway corridors in the game (which renders rects,
// not vector paths). 12 keeps adjacent cells contiguous for rotated capsules.
const RASTER_STEP = 12;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampMin(value: number, minValue: number): number {
  return Math.max(minValue, value);
}

function requireTerrain(hole: HoleData): {
  tee: NonNullable<HoleData['terrain']['tee']>;
  green: NonNullable<HoleData['terrain']['green']>;
  cup: NonNullable<HoleData['cup']>;
} {
  if (!hole.terrain.tee) {
    throw new Error(`Hole ${hole.id} is missing a tee box`);
  }
  if (!hole.terrain.green) {
    throw new Error(`Hole ${hole.id} is missing a green`);
  }
  if (!hole.cup) {
    throw new Error(`Hole ${hole.id} is missing a cup`);
  }
  return {
    tee: hole.terrain.tee,
    green: hole.terrain.green,
    cup: hole.cup,
  };
}

function normalizeRectsFromShape(shape: SurfaceShape, radiusDefault = 8) {
  const bounds = shapeBounds(shape);
  if (bounds.w <= 0 || bounds.h <= 0) return [];

  const cells: Array<{ x: number; y: number; w: number; h: number }> = [];
  const maxX = bounds.x + bounds.w;
  const maxY = bounds.y + bounds.h;

  for (let y = bounds.y; y < maxY; y += RASTER_STEP) {
    for (let x = bounds.x; x < maxX; x += RASTER_STEP) {
      const cx = x + RASTER_STEP / 2;
      const cy = y + RASTER_STEP / 2;
      if (pointInShape(shape, { x: cx, y: cy })) {
        cells.push({
          x,
          y,
          w: Math.min(RASTER_STEP, maxX - x),
          h: Math.min(RASTER_STEP, maxY - y),
        });
      }
    }
  }

  if (cells.length === 0) {
    return [
      {
        x: bounds.x,
        y: bounds.y,
        w: clampMin(bounds.w, 8),
        h: clampMin(bounds.h, 8),
        r: Math.min(bounds.w, bounds.h, radiusDefault),
      },
    ];
  }

  const rows = new Map<number, Array<{ x: number; y: number; w: number; h: number }>>();
  for (const cell of cells) {
    const rowKey = Math.round(cell.y / RASTER_STEP);
    const row = rows.get(rowKey) ?? [];
    row.push(cell);
    rows.set(rowKey, row);
  }

  const merged: Array<{ x: number; y: number; w: number; h: number; r: number }> = [];
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    let current = row[0];
    for (let i = 1; i < row.length; i++) {
      const next = row[i];
      if (Math.abs(current.x + current.w - next.x) < 0.5) {
        current = { ...current, w: current.w + next.w };
      } else {
        merged.push({ ...current, r: 8 });
        current = next;
      }
    }
    merged.push({ ...current, r: 8 });
  }

  return merged;
}

export function toExportHole(hole: HoleData, index: number): ExportHole {
  const { tee, green, cup } = requireTerrain(hole);

  const fairwayRects = hole.terrain.fairway.flatMap((segment) => normalizeRectsFromShape(segment, 14));
  const greenBounds = shapeBounds(green);
  const waterRects = hole.hazards
    .filter((shape) => shape.kind === 'water')
    .flatMap((shape) => normalizeRectsFromShape(shape, 10))
    .map((rect) => ({ type: 'waterRect' as const, x: rect.x, y: rect.y, w: rect.w, h: rect.h }));
  const sandRects = hole.hazards
    .filter((shape) => shape.kind === 'sand')
    .flatMap((shape) => normalizeRectsFromShape(shape, 10))
    .map((rect) => ({ type: 'sandRect' as const, x: rect.x, y: rect.y, w: rect.w, h: rect.h }));

  return {
    id: index + 1,
    name: hole.name,
    par: hole.par,
    ballStart: { ...hole.ballStart },
    cup: { x: cup.x, y: cup.y },
    terrain: {
      tee: { x: tee.x, y: tee.y, w: tee.w, h: tee.h, r: tee.r },
      fairway: fairwayRects,
      green: {
        x: greenBounds.x,
        y: greenBounds.y,
        w: clampMin(greenBounds.w, 10),
        h: clampMin(greenBounds.h, 10),
        r: 10,
      },
    },
    slopes: hole.slopes.map((slope) => ({
      cx: clamp01((slope.x - greenBounds.x) / Math.max(1, greenBounds.w)),
      cy: clamp01((slope.y - greenBounds.y) / Math.max(1, greenBounds.h)),
      strength: clamp01(slope.strength),
      dir: slope.dir,
    })),
    obstacles: hole.obstacles.map((obstacle) => ({
      type: 'circle' as const,
      x: obstacle.x,
      y: obstacle.y,
      r: obstacle.r,
      look: obstacle.look,
    })),
    hazards: [...sandRects, ...waterRects],
    editorVectors: {
      version: 2,
      terrain: {
        fairway: hole.terrain.fairway.map(toExportVectorShape),
        green: hole.terrain.green ? toExportVectorShape(hole.terrain.green) : null,
      },
      hazards: {
        sand: hole.hazards.filter((shape) => shape.kind === 'sand').map(toExportVectorShape),
        water: hole.hazards.filter((shape) => shape.kind === 'water').map(toExportVectorShape),
      },
    },
  };
}

export function buildExportCourse(data: {
  courseName: string;
  designer: string;
  holes: HoleData[];
}): ExportCourse {
  return {
    courseName: data.courseName,
    designer: data.designer,
    holes: data.holes.map((hole, index) => toExportHole(hole, index)),
  };
}

export function exportCourseJson(data: {
  courseName: string;
  designer: string;
  holes: HoleData[];
}): string {
  return JSON.stringify(buildExportCourse(data), null, 2);
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asPar(value: unknown): 3 | 4 | 5 {
  return value === 3 || value === 5 ? value : 4;
}

function parseEditorVectors(hole: HoleData, data: Record<string, unknown>) {
  const editorVectors = data.editorVectors as Record<string, unknown> | undefined;
  if (!editorVectors || asNumber(editorVectors.version, 0) !== 1) {
    return false;
  }

  const terrain = editorVectors.terrain as Record<string, unknown> | undefined;
  const hazards = editorVectors.hazards as Record<string, unknown> | undefined;
  if (!terrain || !hazards) return false;

  const fairwayRaw = Array.isArray(terrain.fairway) ? terrain.fairway : [];
  hole.terrain.fairway = fairwayRaw
    .map((item, index) =>
      fromExportVectorShape({
        id: getDefaultEntityId(`fairway-${index}`),
        kind: 'fairway',
        raw: item as never,
      }),
    )
    .filter((shape): shape is SurfaceShape => Boolean(shape));

  const greenRaw = terrain.green as Record<string, unknown> | null | undefined;
  hole.terrain.green = greenRaw
    ? fromExportVectorShape({
        id: getDefaultEntityId('green'),
        kind: 'green',
        raw: greenRaw as never,
      })
    : null;

  const sandRaw = Array.isArray(hazards.sand) ? hazards.sand : [];
  const waterRaw = Array.isArray(hazards.water) ? hazards.water : [];

  hole.hazards = [
    ...sandRaw
      .map((item, index) =>
        fromExportVectorShape({
          id: getDefaultEntityId(`sand-${index}`),
          kind: 'sand',
          raw: item as never,
        }),
      )
      .filter((shape): shape is SurfaceShape => Boolean(shape)),
    ...waterRaw
      .map((item, index) =>
        fromExportVectorShape({
          id: getDefaultEntityId(`water-${index}`),
          kind: 'water',
          raw: item as never,
        }),
      )
      .filter((shape): shape is SurfaceShape => Boolean(shape)),
  ];

  return hole.terrain.green !== null;
}

function normalizeHole(raw: unknown, index: number): HoleData {
  const hole = createEmptyHole(index + 1);
  const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

  hole.id = asNumber(data.id, index + 1);
  hole.name = asString(data.name, `Hole ${index + 1}`);
  hole.par = asPar(data.par);

  const ballStart = data.ballStart as Record<string, unknown> | undefined;
  hole.ballStart = {
    x: asNumber(ballStart?.x, hole.ballStart.x),
    y: asNumber(ballStart?.y, hole.ballStart.y),
  };

  const terrain = data.terrain as Record<string, unknown> | undefined;
  const tee = terrain?.tee as Record<string, unknown> | undefined;
  const green = terrain?.green as Record<string, unknown> | undefined;
  const fairway = Array.isArray(terrain?.fairway) ? terrain?.fairway : [];

  if (tee) {
    hole.terrain.tee = {
      id: getDefaultEntityId('tee'),
      x: asNumber(tee.x),
      y: asNumber(tee.y),
      w: asNumber(tee.w, 20),
      h: asNumber(tee.h, 14),
      r: asNumber(tee.r, 3),
      rotation: asNumber(tee.rotation, 0),
    };
  }

  const usedVectors = parseEditorVectors(hole, data);

  if (!usedVectors) {
    // Prefer fairwayPath waypoints (new v3 schema) over legacy fairway rects.
    const fairwayPath = Array.isArray(terrain?.fairwayPath) ? terrain?.fairwayPath : null;
    const fairwayWidth = asNumber(terrain?.fairwayWidth, 40);
    if (fairwayPath && fairwayPath.length >= 2) {
      const pts = fairwayPath
        .map((p) => (p ?? {}) as Record<string, unknown>)
        .map((p) => ({ x: asNumber(p.x), y: asNumber(p.y) }));
      const segments: SurfaceShape[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        segments.push(
          capsuleBetween({
            id: getDefaultEntityId(`fairway-${i}`),
            a: pts[i],
            b: pts[i + 1],
            width: Math.max(24, Math.min(80, fairwayWidth)),
          }),
        );
      }
      hole.terrain.fairway = segments;
    } else {
      hole.terrain.fairway = fairway
        .map((segment, segmentIndex) => {
          const item = (segment ?? {}) as Record<string, unknown>;
          return createShapeFromRect({
            id: getDefaultEntityId(`fairway-${segmentIndex}`),
            kind: 'fairway',
            x: asNumber(item.x),
            y: asNumber(item.y),
            w: asNumber(item.w),
            h: asNumber(item.h),
            shape: asShape(item.shape, 'capsule'),
            rotation: asNumber(item.rotation, 0),
          });
        })
        .filter((shape) => shape.path.points.length >= 3);
    }

    const readSurfaceArray = (raw: unknown, kind: 'rough' | 'deepRough' | 'desert'): SurfaceShape[] => {
      const items = Array.isArray(raw) ? raw : [];
      const defaultShape: ShapePreset = kind === 'desert' ? 'squircle' : 'oval';
      return items
        .map((entry, idx) => {
          const item = (entry ?? {}) as Record<string, unknown>;
          return createShapeFromRect({
            id: getDefaultEntityId(`${kind}-${idx}`),
            kind,
            x: asNumber(item.x),
            y: asNumber(item.y),
            w: asNumber(item.w),
            h: asNumber(item.h),
            shape: asShape(item.shape, defaultShape),
            rotation: asNumber(item.rotation, 0),
          });
        })
        .filter((shape) => shape.path.points.length >= 3);
    };

    hole.terrain.rough = readSurfaceArray(terrain?.rough, 'rough');
    hole.terrain.deepRough = readSurfaceArray(terrain?.deepRough, 'deepRough');
    hole.terrain.desert = readSurfaceArray(terrain?.desert, 'desert');

    const bg = data.background;
    if (bg === 'rough' || bg === 'deepRough' || bg === 'desert') {
      hole.background = bg;
    }

    hole.terrain.green = green
      ? createShapeFromRect({
          id: getDefaultEntityId('green'),
          kind: 'green',
          x: asNumber(green.x),
          y: asNumber(green.y),
          w: asNumber(green.w, 60),
          h: asNumber(green.h, 60),
          shape: asShape(green.shape, 'oval'),
          rotation: asNumber(green.rotation, 0),
        })
      : null;

    const hazards = Array.isArray(data.hazards) ? data.hazards : [];
    hole.hazards = [];
    for (const entry of hazards) {
      const item = (entry ?? {}) as Record<string, unknown>;
      if (item.type === 'sandRect') {
        hole.hazards.push(
          createShapeFromRect({
            id: getDefaultEntityId('haz-sand'),
            kind: 'sand',
            x: asNumber(item.x),
            y: asNumber(item.y),
            w: asNumber(item.w),
            h: asNumber(item.h),
            shape: asShape(item.shape, 'oval'),
            rotation: asNumber(item.rotation, 0),
          }),
        );
      }
      if (item.type === 'waterRect') {
        hole.hazards.push(
          createShapeFromRect({
            id: getDefaultEntityId('haz-water'),
            kind: 'water',
            x: asNumber(item.x),
            y: asNumber(item.y),
            w: asNumber(item.w),
            h: asNumber(item.h),
            shape: asShape(item.shape, 'squircle'),
            rotation: asNumber(item.rotation, 0),
          }),
        );
      }
    }
  }

  const cup = data.cup as Record<string, unknown> | undefined;
  hole.cup = cup
    ? {
        id: getDefaultEntityId('cup'),
        x: asNumber(cup.x),
        y: asNumber(cup.y),
      }
    : null;

  const obstacles = Array.isArray(data.obstacles) ? data.obstacles : [];
  hole.obstacles = [];
  for (const entry of obstacles) {
    const item = (entry ?? {}) as Record<string, unknown>;
    if (item.type === 'circle') {
      hole.obstacles.push({
        id: getDefaultEntityId('obs-circle'),
        type: 'circle',
        x: asNumber(item.x),
        y: asNumber(item.y),
        r: asNumber(item.r, 12),
        look: typeof item.look === 'string' ? item.look : undefined,
      });
    }
    // Legacy 'rect' (wall) obstacles are dropped on import.
  }

  const slopes = Array.isArray(data.slopes) ? data.slopes : [];
  hole.slopes = [];
  const greenShape = hole.terrain.green;
  const greenBounds = greenShape ? shapeBounds(greenShape) : null;
  for (const entry of slopes) {
    const item = (entry ?? {}) as Record<string, unknown>;
    const dir = slopeDirections.includes(item.dir as SlopeDirection)
      ? (item.dir as SlopeDirection)
      : 'N';
    if (!greenBounds) {
      continue;
    }
    const slopePoint = {
      x: greenBounds.x + clamp01(asNumber(item.cx, 0.5)) * Math.max(1, greenBounds.w),
      y: greenBounds.y + clamp01(asNumber(item.cy, 0.5)) * Math.max(1, greenBounds.h),
    };
    if (greenShape && !pointInShape(greenShape, slopePoint)) continue;
    hole.slopes.push({
      id: getDefaultEntityId('slope'),
      x: slopePoint.x,
      y: slopePoint.y,
      strength: clamp01(asNumber(item.strength, 0.3)),
      dir,
    });
  }

  return hole;
}

export function parseImportedCourseJson(text: string): {
  courseName: string;
  designer: string;
  holes: HoleData[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON. Please paste valid JSON and try again.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid format: expected a JSON object.');
  }

  const root = parsed as Record<string, unknown>;
  if (!Array.isArray(root.holes)) {
    throw new Error('Invalid format: expected a top-level "holes" array.');
  }

  const holes = root.holes.map((entry, idx) => normalizeHole(entry, idx));
  if (holes.length === 0) {
    throw new Error('Imported course has no holes.');
  }

  return {
    courseName: asString(root.courseName, 'Imported Course'),
    designer: asString(root.designer, 'Imported Designer'),
    holes,
  };
}
