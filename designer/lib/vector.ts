import type {
  ExportVectorShape,
  PathPoint,
  RectShape,
  ShapePreset,
  SurfaceKind,
  SurfaceShape,
  Vec2,
} from '@/lib/types';

const SEGMENT_SAMPLES = 28;

export function clonePoint(point: PathPoint): PathPoint {
  return { ...point };
}

export function cloneShape(shape: SurfaceShape): SurfaceShape {
  return {
    ...shape,
    path: {
      closed: true,
      points: shape.path.points.map(clonePoint),
    },
  };
}

export function shapeBounds(shape: SurfaceShape): RectShape {
  const points = shape.path.points;
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const include = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  points.forEach((point) => {
    include(point.x, point.y);
    include(point.inX, point.inY);
    include(point.outX, point.outY);
  });

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

export function moveShapeBy(shape: SurfaceShape, dx: number, dy: number): SurfaceShape {
  const moved = cloneShape(shape);
  moved.path.points = moved.path.points.map((point) => ({
    ...point,
    x: point.x + dx,
    y: point.y + dy,
    inX: point.inX + dx,
    inY: point.inY + dy,
    outX: point.outX + dx,
    outY: point.outY + dy,
  }));
  return moved;
}

export function rotateShape(shape: SurfaceShape, degrees: number): SurfaceShape {
  const rotated = cloneShape(shape);
  const bounds = shapeBounds(shape);
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotatePoint = (x: number, y: number) => ({
    x: cx + (x - cx) * cos - (y - cy) * sin,
    y: cy + (x - cx) * sin + (y - cy) * cos,
  });

  rotated.path.points = rotated.path.points.map((point) => {
    const anchor = rotatePoint(point.x, point.y);
    const handleIn = rotatePoint(point.inX, point.inY);
    const handleOut = rotatePoint(point.outX, point.outY);
    return {
      ...point,
      x: anchor.x,
      y: anchor.y,
      inX: handleIn.x,
      inY: handleIn.y,
      outX: handleOut.x,
      outY: handleOut.y,
    };
  });

  return rotated;
}

function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t2 * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function lineDistanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function segmentControls(shape: SurfaceShape, segIndex: number): [Vec2, Vec2, Vec2, Vec2] {
  const points = shape.path.points;
  const from = points[segIndex];
  const to = points[(segIndex + 1) % points.length];
  return [
    { x: from.x, y: from.y },
    { x: from.outX, y: from.outY },
    { x: to.inX, y: to.inY },
    { x: to.x, y: to.y },
  ];
}

function pathPolygonPoints(shape: SurfaceShape, samples = SEGMENT_SAMPLES): Vec2[] {
  const points = shape.path.points;
  if (points.length < 2) return [];
  const poly: Vec2[] = [];
  for (let seg = 0; seg < points.length; seg++) {
    const [p0, p1, p2, p3] = segmentControls(shape, seg);
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      poly.push(cubicPoint(p0, p1, p2, p3, t));
    }
  }
  return poly;
}

export function pointInShape(shape: SurfaceShape, point: Vec2): boolean {
  const poly = pathPolygonPoints(shape, 24);
  if (poly.length < 3) return false;

  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 0.000001) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function nearestSegment(
  shape: SurfaceShape,
  target: Vec2,
): { segIndex: number; t: number; distance: number; point: Vec2 } | null {
  const points = shape.path.points;
  if (points.length < 2) return null;

  let best: { segIndex: number; t: number; distance: number; point: Vec2 } | null = null;
  for (let segIndex = 0; segIndex < points.length; segIndex++) {
    const [p0, p1, p2, p3] = segmentControls(shape, segIndex);
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const at = cubicPoint(p0, p1, p2, p3, t);
      const dist = Math.sqrt(lineDistanceSq(at, target));
      if (!best || dist < best.distance) {
        best = { segIndex, t, distance: dist, point: at };
      }
    }
  }
  return best;
}

export function splitSegmentAt(
  shape: SurfaceShape,
  segIndex: number,
  t: number,
  pointId: string,
): { shape: SurfaceShape; pointIndex: number } {
  const nextShape = cloneShape(shape);
  const points = nextShape.path.points;

  const from = points[segIndex];
  const toIndex = (segIndex + 1) % points.length;
  const to = points[toIndex];

  const p0 = { x: from.x, y: from.y };
  const p1 = { x: from.outX, y: from.outY };
  const p2 = { x: to.inX, y: to.inY };
  const p3 = { x: to.x, y: to.y };

  const p01 = lerpVec(p0, p1, t);
  const p12 = lerpVec(p1, p2, t);
  const p23 = lerpVec(p2, p3, t);
  const p012 = lerpVec(p01, p12, t);
  const p123 = lerpVec(p12, p23, t);
  const p0123 = lerpVec(p012, p123, t);

  from.outX = p01.x;
  from.outY = p01.y;
  to.inX = p23.x;
  to.inY = p23.y;

  const inserted: PathPoint = {
    id: pointId,
    x: p0123.x,
    y: p0123.y,
    inX: p012.x,
    inY: p012.y,
    outX: p123.x,
    outY: p123.y,
  };

  points.splice(segIndex + 1, 0, inserted);
  return { shape: nextShape, pointIndex: segIndex + 1 };
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function segmentHasCurve(shape: SurfaceShape, segIndex: number): boolean {
  const points = shape.path.points;
  const from = points[segIndex];
  const to = points[(segIndex + 1) % points.length];
  return !(
    almostEqual(from.x, from.outX) &&
    almostEqual(from.y, from.outY) &&
    almostEqual(to.x, to.inX) &&
    almostEqual(to.y, to.inY)
  );
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.001;
}

export function toggleSegmentCurve(shape: SurfaceShape, segIndex: number): SurfaceShape {
  const next = cloneShape(shape);
  const points = next.path.points;
  const from = points[segIndex];
  const to = points[(segIndex + 1) % points.length];

  if (segmentHasCurve(next, segIndex)) {
    from.outX = from.x;
    from.outY = from.y;
    to.inX = to.x;
    to.inY = to.y;
    return next;
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  from.outX = from.x + dx / 3;
  from.outY = from.y + dy / 3;
  to.inX = to.x - dx / 3;
  to.inY = to.y - dy / 3;
  return next;
}

export function createRectVectorShape(params: {
  id: string;
  kind: SurfaceKind;
  x: number;
  y: number;
  w: number;
  h: number;
}): SurfaceShape {
  return createPresetVectorShape({ ...params, preset: 'rectangle' });
}

export function createPresetVectorShape(params: {
  id: string;
  kind: SurfaceKind;
  x: number;
  y: number;
  w: number;
  h: number;
  preset: ShapePreset;
}): SurfaceShape {
  const { id, kind, x, y, w, h, preset } = params;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const k = 0.5522847498;

  const rectPoints: PathPoint[] = [
    { id: `${id}-p0`, x, y, inX: x, inY: y, outX: x, outY: y },
    { id: `${id}-p1`, x: x + w, y, inX: x + w, inY: y, outX: x + w, outY: y },
    { id: `${id}-p2`, x: x + w, y: y + h, inX: x + w, inY: y + h, outX: x + w, outY: y + h },
    { id: `${id}-p3`, x, y: y + h, inX: x, inY: y + h, outX: x, outY: y + h },
  ];

  const circlePoints: PathPoint[] = [
    { id: `${id}-p0`, x: cx, y, inX: cx - (w / 2) * k, inY: y, outX: cx + (w / 2) * k, outY: y },
    { id: `${id}-p1`, x: x + w, y: cy, inX: x + w, inY: cy - (h / 2) * k, outX: x + w, outY: cy + (h / 2) * k },
    { id: `${id}-p2`, x: cx, y: y + h, inX: cx + (w / 2) * k, inY: y + h, outX: cx - (w / 2) * k, outY: y + h },
    { id: `${id}-p3`, x, y: cy, inX: x, inY: cy + (h / 2) * k, outX: x, outY: cy - (h / 2) * k },
  ];

  const diamondPoints: PathPoint[] = [
    { id: `${id}-p0`, x: cx, y, inX: cx, inY: y, outX: cx, outY: y },
    { id: `${id}-p1`, x: x + w, y: cy, inX: x + w, inY: cy, outX: x + w, outY: cy },
    { id: `${id}-p2`, x: cx, y: y + h, inX: cx, inY: y + h, outX: cx, outY: y + h },
    { id: `${id}-p3`, x, y: cy, inX: x, inY: cy, outX: x, outY: cy },
  ];

  const capsuleR = Math.min(w, h) / 2;
  const capsuleK = capsuleR * k;
  const capsuleHorizontal = w >= h;
  const capsulePoints: PathPoint[] = capsuleHorizontal
    ? [
        { id: `${id}-p0`, x: x + capsuleR, y, inX: x + capsuleR - capsuleK, inY: y, outX: x + capsuleR + capsuleK, outY: y },
        { id: `${id}-p1`, x: x + w - capsuleR, y, inX: x + w - capsuleR - capsuleK, inY: y, outX: x + w - capsuleR + capsuleK, outY: y },
        { id: `${id}-p2`, x: x + w, y: cy, inX: x + w, inY: cy - capsuleK, outX: x + w, outY: cy + capsuleK },
        { id: `${id}-p3`, x: x + w - capsuleR, y: y + h, inX: x + w - capsuleR + capsuleK, inY: y + h, outX: x + w - capsuleR - capsuleK, outY: y + h },
        { id: `${id}-p4`, x: x + capsuleR, y: y + h, inX: x + capsuleR + capsuleK, inY: y + h, outX: x + capsuleR - capsuleK, outY: y + h },
        { id: `${id}-p5`, x, y: cy, inX: x, inY: cy + capsuleK, outX: x, outY: cy - capsuleK },
      ]
    : [
        { id: `${id}-p0`, x: cx, y, inX: cx - capsuleK, inY: y, outX: cx + capsuleK, outY: y },
        { id: `${id}-p1`, x: x + w, y: y + capsuleR, inX: x + w, inY: y + capsuleR - capsuleK, outX: x + w, outY: y + capsuleR + capsuleK },
        { id: `${id}-p2`, x: x + w, y: y + h - capsuleR, inX: x + w, inY: y + h - capsuleR - capsuleK, outX: x + w, outY: y + h - capsuleR + capsuleK },
        { id: `${id}-p3`, x: cx, y: y + h, inX: cx + capsuleK, inY: y + h, outX: cx - capsuleK, outY: y + h },
        { id: `${id}-p4`, x, y: y + h - capsuleR, inX: x, inY: y + h - capsuleR + capsuleK, outX: x, outY: y + h - capsuleR - capsuleK },
        { id: `${id}-p5`, x, y: y + capsuleR, inX: x, inY: y + capsuleR + capsuleK, outX: x, outY: y + capsuleR - capsuleK },
      ];

  const squircleInset = Math.min(w, h) * 0.22;
  const squirclePoints: PathPoint[] = [
    { id: `${id}-p0`, x: x + squircleInset, y, inX: x + squircleInset / 2, inY: y, outX: x + squircleInset * 1.5, outY: y },
    { id: `${id}-p1`, x: x + w - squircleInset, y, inX: x + w - squircleInset * 1.5, inY: y, outX: x + w - squircleInset / 2, outY: y },
    { id: `${id}-p2`, x: x + w, y: y + squircleInset, inX: x + w, inY: y + squircleInset / 2, outX: x + w, outY: y + squircleInset * 1.5 },
    { id: `${id}-p3`, x: x + w, y: y + h - squircleInset, inX: x + w, inY: y + h - squircleInset * 1.5, outX: x + w, outY: y + h - squircleInset / 2 },
    { id: `${id}-p4`, x: x + w - squircleInset, y: y + h, inX: x + w - squircleInset / 2, inY: y + h, outX: x + w - squircleInset * 1.5, outY: y + h },
    { id: `${id}-p5`, x: x + squircleInset, y: y + h, inX: x + squircleInset * 1.5, inY: y + h, outX: x + squircleInset / 2, outY: y + h },
    { id: `${id}-p6`, x, y: y + h - squircleInset, inX: x, inY: y + h - squircleInset / 2, outX: x, outY: y + h - squircleInset * 1.5 },
    { id: `${id}-p7`, x, y: y + squircleInset, inX: x, inY: y + squircleInset * 1.5, outX: x, outY: y + squircleInset / 2 },
  ];

  const points =
    preset === 'rectangle' ? rectPoints :
    preset === 'circle' || preset === 'oval' ? circlePoints :
    preset === 'diamond' ? diamondPoints :
    preset === 'capsule' ? capsulePoints :
    squirclePoints;

  return {
    id,
    kind,
    path: { closed: true, points },
  };
}

export function toExportVectorShape(shape: SurfaceShape): ExportVectorShape {
  return {
    points: shape.path.points.map((point) => ({
      x: point.x,
      y: point.y,
      inX: point.inX,
      inY: point.inY,
      outX: point.outX,
      outY: point.outY,
    })),
  };
}

export function fromExportVectorShape(params: {
  id: string;
  kind: SurfaceKind;
  raw: ExportVectorShape;
}): SurfaceShape | null {
  const points = params.raw.points;
  if (!Array.isArray(points) || points.length < 3) return null;

  const pathPoints: PathPoint[] = points.map((point, index) => ({
    id: `${params.id}-p${index}`,
    x: safeNumber(point.x, 0),
    y: safeNumber(point.y, 0),
    inX: safeNumber(point.inX, safeNumber(point.x, 0)),
    inY: safeNumber(point.inY, safeNumber(point.y, 0)),
    outX: safeNumber(point.outX, safeNumber(point.x, 0)),
    outY: safeNumber(point.outY, safeNumber(point.y, 0)),
  }));

  return {
    id: params.id,
    kind: params.kind,
    path: {
      closed: true,
      points: pathPoints,
    },
  };
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function anchorHit(
  shape: SurfaceShape,
  point: Vec2,
  radius: number,
): { pointIndex: number; distance: number } | null {
  let best: { pointIndex: number; distance: number } | null = null;
  shape.path.points.forEach((p, pointIndex) => {
    const d = Math.hypot(point.x - p.x, point.y - p.y);
    if (d <= radius && (!best || d < best.distance)) {
      best = { pointIndex, distance: d };
    }
  });
  return best;
}

export function handleHit(
  shape: SurfaceShape,
  point: Vec2,
  radius: number,
): { pointIndex: number; handle: 'in' | 'out'; distance: number } | null {
  let best: { pointIndex: number; handle: 'in' | 'out'; distance: number } | null = null;
  shape.path.points.forEach((p, pointIndex) => {
    const inDist = Math.hypot(point.x - p.inX, point.y - p.inY);
    if (!(almostEqual(p.inX, p.x) && almostEqual(p.inY, p.y)) && inDist <= radius) {
      if (!best || inDist < best.distance) best = { pointIndex, handle: 'in', distance: inDist };
    }
    const outDist = Math.hypot(point.x - p.outX, point.y - p.outY);
    if (!(almostEqual(p.outX, p.x) && almostEqual(p.outY, p.y)) && outDist <= radius) {
      if (!best || outDist < best.distance) best = { pointIndex, handle: 'out', distance: outDist };
    }
  });
  return best;
}
