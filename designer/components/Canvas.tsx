'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDesigner, getDefaultEntityId } from '@/lib/store';
import { courseExtent, pointInRect, renderScene } from '@/lib/renderer';
import { anchorHit, createPresetVectorShape, handleHit, nearestSegment, pointInShape, shapeBounds, splitSegmentAt, toggleSegmentCurve } from '@/lib/vector';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { DrawPreview, HoleData, SurfaceShape, ToolType, TreeType, Vec2 } from '@/lib/types';
import type { PathEditOverlay } from '@/lib/renderer';
import { WORLD_WIDTH as WORLD_BASE_W, WORLD_HEIGHT as WORLD_BASE_H } from '@/lib/world';

interface CanvasProps {
  onSelectObject: (id: string | null) => void;
}

type InteractionMode = 'none' | 'pan' | 'draw' | 'move' | 'move-anchor' | 'move-handle';

interface InteractionState {
  mode: InteractionMode;
  startScreen: Vec2;
  startWorld: Vec2;
  lastWorld: Vec2;
  lastScreen: Vec2;
  movingId: string | null;
  anchorIndex: number | null;
  handleKind: 'in' | 'out' | null;
}

const MIN_GREEN_SIZE = 40;

function snap(v: number, enabled: boolean): number {
  return enabled ? Math.round(v / 5) * 5 : v;
}

function clampWorld(v: number, max = WORLD_BASE_W): number {
  return Math.max(0, Math.min(Math.max(max, 1), v));
}

function normalizeRect(start: Vec2, end: Vec2) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

function pointInCircle(point: Vec2, x: number, y: number, r: number): boolean {
  return (point.x - x) ** 2 + (point.y - y) ** 2 <= r * r;
}

function treeRadius(type: TreeType): number {
  return { pine: 14, oak: 16, palm: 13, birch: 10, cypress: 12 }[type];
}

function findShape(hole: HoleData, id: string): SurfaceShape | null {
  return (
    (hole.terrain.green?.id === id ? hole.terrain.green : null) ??
    hole.terrain.fairway.find((s) => s.id === id) ??
    hole.terrain.rough.find((s) => s.id === id) ??
    hole.terrain.deepRough.find((s) => s.id === id) ??
    hole.terrain.desert.find((s) => s.id === id) ??
    hole.hazards.find((s) => s.id === id) ??
    null
  );
}

function replaceShape(hole: HoleData, id: string, next: SurfaceShape): HoleData {
  return {
    ...hole,
    terrain: {
      ...hole.terrain,
      green: hole.terrain.green?.id === id ? next : hole.terrain.green,
      fairway: hole.terrain.fairway.map((s) => (s.id === id ? next : s)),
      rough: hole.terrain.rough.map((s) => (s.id === id ? next : s)),
      deepRough: hole.terrain.deepRough.map((s) => (s.id === id ? next : s)),
      desert: hole.terrain.desert.map((s) => (s.id === id ? next : s)),
    },
    hazards: hole.hazards.map((s) => (s.id === id ? next : s)),
  };
}

function hitTest(hole: HoleData, point: Vec2): string | null {
  for (let i = hole.slopes.length - 1; i >= 0; i--) {
    if (pointInCircle(point, hole.slopes[i].x, hole.slopes[i].y, 9)) return hole.slopes[i].id;
  }
  if (hole.cup && pointInCircle(point, hole.cup.x, hole.cup.y, 8)) return hole.cup.id;
  if (hole.terrain.tee && pointInRect(point, hole.terrain.tee)) return hole.terrain.tee.id;
  for (let i = hole.obstacles.length - 1; i >= 0; i--) {
    const o = hole.obstacles[i];
    if (pointInCircle(point, o.x, o.y, o.r)) return o.id;
  }
  for (let i = hole.hazards.length - 1; i >= 0; i--) {
    if (pointInShape(hole.hazards[i], point)) return hole.hazards[i].id;
  }
  if (hole.terrain.green && pointInShape(hole.terrain.green, point)) return hole.terrain.green.id;
  for (let i = hole.terrain.fairway.length - 1; i >= 0; i--) {
    if (pointInShape(hole.terrain.fairway[i], point)) return hole.terrain.fairway[i].id;
  }
  for (let i = hole.terrain.desert.length - 1; i >= 0; i--) {
    if (pointInShape(hole.terrain.desert[i], point)) return hole.terrain.desert[i].id;
  }
  for (let i = hole.terrain.deepRough.length - 1; i >= 0; i--) {
    if (pointInShape(hole.terrain.deepRough[i], point)) return hole.terrain.deepRough[i].id;
  }
  for (let i = hole.terrain.rough.length - 1; i >= 0; i--) {
    if (pointInShape(hole.terrain.rough[i], point)) return hole.terrain.rough[i].id;
  }
  return null;
}

function moveById(hole: HoleData, id: string, dx: number, dy: number): HoleData {
  const moved = {
    ...hole,
    ballStart: { ...hole.ballStart },
    cup: hole.cup ? { ...hole.cup } : null,
    terrain: {
      tee: hole.terrain.tee ? { ...hole.terrain.tee } : null,
      green: hole.terrain.green
        ? { ...hole.terrain.green, path: { ...hole.terrain.green.path, points: hole.terrain.green.path.points.map((p) => ({ ...p })) } }
        : null,
      fairway: hole.terrain.fairway.map((s) => ({ ...s, path: { ...s.path, points: s.path.points.map((p) => ({ ...p })) } })),
      rough: hole.terrain.rough.map((s) => ({ ...s, path: { ...s.path, points: s.path.points.map((p) => ({ ...p })) } })),
      deepRough: hole.terrain.deepRough.map((s) => ({ ...s, path: { ...s.path, points: s.path.points.map((p) => ({ ...p })) } })),
      desert: hole.terrain.desert.map((s) => ({ ...s, path: { ...s.path, points: s.path.points.map((p) => ({ ...p })) } })),
    },
    hazards: hole.hazards.map((s) => ({ ...s, path: { ...s.path, points: s.path.points.map((p) => ({ ...p })) } })),
    obstacles: hole.obstacles.map((o) => ({ ...o })),
    slopes: hole.slopes.map((z) => ({ ...z })),
  };

  const mp = (p: { x: number; y: number; inX: number; inY: number; outX: number; outY: number }) => {
    p.x += dx; p.y += dy; p.inX += dx; p.inY += dy; p.outX += dx; p.outY += dy;
  };

  if (moved.terrain.tee?.id === id) {
    moved.terrain.tee.x = clampWorld(moved.terrain.tee.x + dx);
    moved.terrain.tee.y = clampWorld(moved.terrain.tee.y + dy, WORLD_BASE_H);
    moved.ballStart.x = moved.terrain.tee.x + moved.terrain.tee.w / 2;
    moved.ballStart.y = moved.terrain.tee.y + moved.terrain.tee.h / 2;
    return moved;
  }
  if (moved.terrain.green?.id === id) {
    moved.terrain.green.path.points.forEach(mp);
    moved.slopes = moved.slopes.map((z) => ({ ...z, x: z.x + dx, y: z.y + dy }));
    if (moved.cup) { moved.cup.x += dx; moved.cup.y += dy; }
    return moved;
  }
  if (moved.cup?.id === id) { moved.cup.x += dx; moved.cup.y += dy; return moved; }
  const fw = moved.terrain.fairway.find((s) => s.id === id);
  if (fw) { fw.path.points.forEach(mp); return moved; }
  const sl = moved.slopes.find((z) => z.id === id);
  if (sl) { sl.x += dx; sl.y += dy; return moved; }
  const ob = moved.obstacles.find((o) => o.id === id);
  if (ob) { ob.x += dx; ob.y += dy; return moved; }
  const hz = moved.hazards.find((s) => s.id === id);
  if (hz) { hz.path.points.forEach(mp); return moved; }
  return moved;
}

function deleteById(hole: HoleData, id: string): HoleData {
  if (hole.terrain.tee?.id === id) return { ...hole, terrain: { ...hole.terrain, tee: null } };
  if (hole.terrain.green?.id === id) return { ...hole, terrain: { ...hole.terrain, green: null }, cup: null, slopes: [] };
  if (hole.cup?.id === id) return { ...hole, cup: null };
  const fw = hole.terrain.fairway.filter((s) => s.id !== id);
  if (fw.length !== hole.terrain.fairway.length) return { ...hole, terrain: { ...hole.terrain, fairway: fw } };
  const rg = hole.terrain.rough.filter((s) => s.id !== id);
  if (rg.length !== hole.terrain.rough.length) return { ...hole, terrain: { ...hole.terrain, rough: rg } };
  const dr = hole.terrain.deepRough.filter((s) => s.id !== id);
  if (dr.length !== hole.terrain.deepRough.length) return { ...hole, terrain: { ...hole.terrain, deepRough: dr } };
  const ds = hole.terrain.desert.filter((s) => s.id !== id);
  if (ds.length !== hole.terrain.desert.length) return { ...hole, terrain: { ...hole.terrain, desert: ds } };
  const sl = hole.slopes.filter((z) => z.id !== id);
  if (sl.length !== hole.slopes.length) return { ...hole, slopes: sl };
  const ob = hole.obstacles.filter((o) => o.id !== id);
  if (ob.length !== hole.obstacles.length) return { ...hole, obstacles: ob };
  const hz = hole.hazards.filter((s) => s.id !== id);
  if (hz.length !== hole.hazards.length) return { ...hole, hazards: hz };
  return hole;
}

function makePresetShape(
  id: string,
  kind: SurfaceShape['kind'],
  x: number,
  y: number,
  w: number,
  h: number,
  preset: 'rectangle' | 'circle' | 'oval' | 'squircle' | 'diamond' | 'capsule',
): SurfaceShape {
  const actualW = preset === 'circle' ? Math.max(w, h) : w;
  const actualH = preset === 'circle' ? Math.max(w, h) : h;
  return createPresetVectorShape({ id, kind, x, y, w: actualW, h: actualH, preset });
}

export default function Canvas({ onSelectObject }: CanvasProps) {
  const { state, dispatch } = useDesigner();
  const hole = state.holes[state.activeHoleIndex];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 700, height: 700 });
  const [preview, setPreview] = useState<DrawPreview | null>(null);
  const [overlay, setOverlay] = useState<PathEditOverlay>({ selectedShapeId: null, activeAnchorIndex: null, activeHandle: null });
  const [spaceDown, setSpaceDown] = useState(false);

  const interaction = useRef<InteractionState>({
    mode: 'none',
    startScreen: { x: 0, y: 0 },
    startWorld: { x: 0, y: 0 },
    lastScreen: { x: 0, y: 0 },
    lastWorld: { x: 0, y: 0 },
    movingId: null,
    anchorIndex: null,
    handleKind: null,
  });

  const extent = useMemo(() => courseExtent(state.holes), [state.holes]);

  // Sync overlay when selection changes externally (e.g. undo)
  useEffect(() => {
    if (!state.selectedObjectId) {
      setOverlay({ selectedShapeId: null, activeAnchorIndex: null, activeHandle: null });
    } else if (findShape(hole, state.selectedObjectId)) {
      setOverlay((prev) => ({ ...prev, selectedShapeId: state.selectedObjectId }));
    }
  }, [state.selectedObjectId, hole]);

  // Auto-fit when course extent grows significantly (e.g. newly generated course loads).
  const lastFittedExtentRef = useRef<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (size.width < 320 || size.height < 320) return;
    const prev = lastFittedExtentRef.current;
    const grew = !prev || Math.abs(prev.w - extent.w) > 400 || Math.abs(prev.h - extent.h) > 400;
    if (!grew) return;
    lastFittedExtentRef.current = extent;
    const margin = 40;
    const zx = (size.width - margin * 2) / Math.max(1, extent.w);
    const zy = (size.height - margin * 2) / Math.max(1, extent.h);
    const fitZoom = Math.max(0.12, Math.min(4, Math.min(zx, zy)));
    const panX = (size.width - extent.w * fitZoom) / 2;
    const panY = (size.height - extent.h * fitZoom) / 2;
    dispatch({ type: 'SET_ZOOM', payload: fitZoom });
    dispatch({ type: 'SET_PAN', payload: { x: panX, y: panY } });
  }, [extent, size.width, size.height, dispatch]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: Math.max(320, r.width), height: Math.max(320, r.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceDown(true);
      const target = event.target as HTMLElement | null;
      const inInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (inInput) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedObjectId) {
        event.preventDefault();
        dispatch({
          type: 'UPDATE_ACTIVE_HOLE',
          updater: (h) => deleteById(h, state.selectedObjectId as string),
          selectedObjectId: null,
        });
        onSelectObject(null);
        setOverlay({ selectedShapeId: null, activeAnchorIndex: null, activeHandle: null });
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [dispatch, onSelectObject, state.selectedObjectId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const frame = requestAnimationFrame(() => {
      renderScene(ctx, {
        hole,
        holes: state.holes,
        activeHoleIndex: state.activeHoleIndex,
        selectedObjectId: state.selectedObjectId,
        preview,
        zoom: state.zoom,
        pan: state.panOffset,
        width: size.width,
        height: size.height,
        pathEditOverlay: overlay,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [hole, state.holes, state.activeHoleIndex, overlay, preview, size, state.panOffset, state.selectedObjectId, state.zoom]);

  const screenToWorld = useMemo(() => (screen: Vec2): Vec2 => ({
    x: (screen.x - state.panOffset.x) / state.zoom,
    y: (screen.y - state.panOffset.y) / state.zoom,
  }), [state.panOffset.x, state.panOffset.y, state.zoom]);

  const getScreenPoint = (event: ReactMouseEvent<HTMLCanvasElement, MouseEvent>): Vec2 => {
    const r = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLCanvasElement, MouseEvent>) => {
    event.preventDefault();
    const screen = getScreenPoint(event);
    const world = screenToWorld(screen);
    interaction.current.startScreen = screen;
    interaction.current.lastScreen = screen;
    interaction.current.startWorld = world;
    interaction.current.lastWorld = world;

    if (event.button === 1 || (spaceDown && event.button === 0)) {
      interaction.current.mode = 'pan';
      return;
    }

    const point = {
      x: snap(clampWorld(world.x, extent.w), state.snapToGrid),
      y: snap(clampWorld(world.y, extent.h), state.snapToGrid),
    };

    // --- PATH EDIT MODE ---
    if (state.activeTool === 'pathEdit' && state.selectedObjectId) {
      const shape = findShape(hole, state.selectedObjectId);
      if (shape) {
        // 1. Check handles first
        const hitH = handleHit(shape, point, 8 / state.zoom);
        if (hitH) {
          interaction.current.mode = 'move-handle';
          interaction.current.movingId = state.selectedObjectId;
          interaction.current.anchorIndex = hitH.pointIndex;
          interaction.current.handleKind = hitH.handle;
          setOverlay({ selectedShapeId: state.selectedObjectId, activeAnchorIndex: hitH.pointIndex, activeHandle: { pointIndex: hitH.pointIndex, kind: hitH.handle } });
          return;
        }
        // 2. Check anchors
        const hitA = anchorHit(shape, point, 10 / state.zoom);
        if (hitA) {
          const anchor = shape.path.points[hitA.pointIndex];
          const inCollapsed = Math.abs(anchor.inX - anchor.x) < 0.001 && Math.abs(anchor.inY - anchor.y) < 0.001;
          const outCollapsed = Math.abs(anchor.outX - anchor.x) < 0.001 && Math.abs(anchor.outY - anchor.y) < 0.001;

          if (inCollapsed && outCollapsed) {
            dispatch({
              type: 'UPDATE_ACTIVE_HOLE',
              updater: (h) => {
                const selected = findShape(h, state.selectedObjectId!);
                if (!selected) return h;
                const pts = selected.path.points.map((p) => ({ ...p }));
                const pt = pts[hitA.pointIndex];
                const prev = pts[(hitA.pointIndex - 1 + pts.length) % pts.length];
                const next = pts[(hitA.pointIndex + 1) % pts.length];
                const vx = next.x - prev.x;
                const vy = next.y - prev.y;
                const len = Math.hypot(vx, vy) || 1;
                const ux = vx / len;
                const uy = vy / len;
                const handleLen = Math.max(18, Math.min(36, len / 6));
                pt.inX = pt.x - ux * handleLen;
                pt.inY = pt.y - uy * handleLen;
                pt.outX = pt.x + ux * handleLen;
                pt.outY = pt.y + uy * handleLen;
                return replaceShape(h, state.selectedObjectId!, { ...selected, path: { ...selected.path, points: pts } });
              },
              selectedObjectId: state.selectedObjectId,
            });
          }

          interaction.current.mode = 'move-anchor';
          interaction.current.movingId = state.selectedObjectId;
          interaction.current.anchorIndex = hitA.pointIndex;
          interaction.current.handleKind = null;
          setOverlay({ selectedShapeId: state.selectedObjectId, activeAnchorIndex: hitA.pointIndex, activeHandle: null });
          return;
        }
        // 3. Click on segment — add anchor
        const seg = nearestSegment(shape, point);
        if (seg && seg.distance < 14 / state.zoom) {
          const newPointId = getDefaultEntityId('pt');
          dispatch({
            type: 'UPDATE_ACTIVE_HOLE',
            updater: (h) => {
              const s = findShape(h, state.selectedObjectId!);
              if (!s) return h;
              const { shape: nextShape, pointIndex } = splitSegmentAt(s, seg.segIndex, seg.t, newPointId);
              setOverlay({ selectedShapeId: state.selectedObjectId, activeAnchorIndex: pointIndex, activeHandle: null });
              return replaceShape(h, state.selectedObjectId!, nextShape);
            },
            selectedObjectId: state.selectedObjectId,
          });
          return;
        }
      }
    }

    // --- SELECT / pathEdit clicking on shapes ---
    if (state.activeTool === 'select' || state.activeTool === 'pathEdit') {
      const id = hitTest(hole, point);
      dispatch({ type: 'SET_SELECTED_OBJECT', payload: id });
      onSelectObject(id);
      if (id && findShape(hole, id)) {
        setOverlay({ selectedShapeId: id, activeAnchorIndex: null, activeHandle: null });
      } else {
        setOverlay({ selectedShapeId: null, activeAnchorIndex: null, activeHandle: null });
      }
      if (id && event.button === 0) {
        interaction.current.mode = 'move';
        interaction.current.movingId = id;
      }
      return;
    }

    // --- PLACE TEE ---
    if (state.activeTool === 'tee') {
      const w = 20; const h = 14;
      const x = snap(clampWorld(point.x - w / 2, extent.w), state.snapToGrid);
      const y = snap(clampWorld(point.y - h / 2, extent.h), state.snapToGrid);
      dispatch({
        type: 'UPDATE_ACTIVE_HOLE',
        updater: (h) => ({
          ...h,
          terrain: { ...h.terrain, tee: { id: getDefaultEntityId('tee'), x, y, w, h: 14, r: 3 } },
          ballStart: { x: x + w / 2, y: y + 7 },
        }),
      });
      return;
    }

    // --- PLACE CUP ---
    if (state.activeTool === 'cup') {
      if (!hole.terrain.green || !pointInShape(hole.terrain.green, point)) return;
      dispatch({
        type: 'UPDATE_ACTIVE_HOLE',
        updater: (h) => ({ ...h, cup: { id: getDefaultEntityId('cup'), x: point.x, y: point.y } }),
      });
      return;
    }

    // --- PLACE TREE ---
    if (state.activeTool === 'tree') {
      const r = treeRadius(state.activeTreeType);
      dispatch({
        type: 'UPDATE_ACTIVE_HOLE',
        updater: (h) => ({
          ...h,
          obstacles: [...h.obstacles, { id: getDefaultEntityId('tree'), type: 'circle', x: point.x, y: point.y, r, look: state.activeTreeType }],
        }),
      });
      return;
    }

    // --- PLACE SLOPE ---
    if (state.activeTool === 'slope') {
      if (!hole.terrain.green || !pointInShape(hole.terrain.green, point)) return;
      const slopeId = getDefaultEntityId('slope');
      dispatch({
        type: 'UPDATE_ACTIVE_HOLE',
        updater: (h) => ({ ...h, slopes: [...h.slopes, { id: slopeId, x: point.x, y: point.y, dir: 'N', strength: 0.35 }] }),
        selectedObjectId: slopeId,
      });
      onSelectObject(slopeId);
      dispatch({ type: 'SET_ACTIVE_TOOL', payload: 'select' });
      return;
    }

    // --- DRAW SHAPE ---
    if (event.button === 0) {
      interaction.current.mode = 'draw';
    }
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLCanvasElement, MouseEvent>) => {
    const screen = getScreenPoint(event);
    const world = screenToWorld(screen);

    if (interaction.current.mode === 'pan') {
      const dx = screen.x - interaction.current.lastScreen.x;
      const dy = screen.y - interaction.current.lastScreen.y;
      dispatch({ type: 'SET_PAN', payload: { x: state.panOffset.x + dx, y: state.panOffset.y + dy } });
      interaction.current.lastScreen = screen;
      return;
    }

    const point = {
      x: snap(clampWorld(world.x, extent.w), state.snapToGrid),
      y: snap(clampWorld(world.y, extent.h), state.snapToGrid),
    };

    if (interaction.current.mode === 'draw') {
      const rectTools: ToolType[] = ['green', 'fairway', 'rough', 'deepRough', 'desert', 'water'];
      if (rectTools.includes(state.activeTool)) {
        setPreview({ type: 'rect', x: interaction.current.startWorld.x, y: interaction.current.startWorld.y, w: point.x - interaction.current.startWorld.x, h: point.y - interaction.current.startWorld.y });
      } else if (state.activeTool === 'sand') {
        setPreview({ type: 'circle', x: interaction.current.startWorld.x, y: interaction.current.startWorld.y, r: Math.hypot(point.x - interaction.current.startWorld.x, point.y - interaction.current.startWorld.y) });
      }
      interaction.current.lastWorld = point;
      return;
    }

    if (interaction.current.mode === 'move' && interaction.current.movingId) {
      const dx = point.x - interaction.current.lastWorld.x;
      const dy = point.y - interaction.current.lastWorld.y;
      if (dx === 0 && dy === 0) return;
      dispatch({ type: 'UPDATE_ACTIVE_HOLE', updater: (h) => moveById(h, interaction.current.movingId!, dx, dy) });
      interaction.current.lastWorld = point;
      return;
    }

    if (interaction.current.mode === 'move-anchor' && interaction.current.movingId !== null && interaction.current.anchorIndex !== null) {
      dispatch({
        type: 'UPDATE_ACTIVE_HOLE',
        updater: (h) => {
          const shape = findShape(h, interaction.current.movingId!);
          if (!shape) return h;
          const pts = shape.path.points.map((p) => ({ ...p }));
          const pt = pts[interaction.current.anchorIndex!];
          const dx = point.x - pt.x;
          const dy = point.y - pt.y;
          pt.x = point.x; pt.y = point.y;
          pt.inX += dx; pt.inY += dy;
          pt.outX += dx; pt.outY += dy;
          return replaceShape(h, interaction.current.movingId!, { ...shape, path: { ...shape.path, points: pts } });
        },
        selectedObjectId: interaction.current.movingId,
      });
      interaction.current.lastWorld = point;
      return;
    }

    if (interaction.current.mode === 'move-handle' && interaction.current.movingId !== null && interaction.current.anchorIndex !== null && interaction.current.handleKind) {
      const mirror = event.altKey; // Alt mirrors the opposite handle
      dispatch({
        type: 'UPDATE_ACTIVE_HOLE',
        updater: (h) => {
          const shape = findShape(h, interaction.current.movingId!);
          if (!shape) return h;
          const pts = shape.path.points.map((p) => ({ ...p }));
          const pt = pts[interaction.current.anchorIndex!];
          const kind = interaction.current.handleKind!;
          if (kind === 'in') { pt.inX = point.x; pt.inY = point.y; }
          else { pt.outX = point.x; pt.outY = point.y; }
          if (mirror) {
            const dx = point.x - pt.x;
            const dy = point.y - pt.y;
            if (kind === 'in') { pt.outX = pt.x - dx; pt.outY = pt.y - dy; }
            else { pt.inX = pt.x - dx; pt.inY = pt.y - dy; }
          }
          return replaceShape(h, interaction.current.movingId!, { ...shape, path: { ...shape.path, points: pts } });
        },
        selectedObjectId: interaction.current.movingId,
      });
      interaction.current.lastWorld = point;
      return;
    }
  };

  const handleMouseUp = () => {
    if (interaction.current.mode === 'draw') {
      const start = interaction.current.startWorld;
      const end = interaction.current.lastWorld;
      const rect = normalizeRect(start, end);

      if (state.activeTool === 'green') {
        const w = Math.max(MIN_GREEN_SIZE, rect.w);
        const h = Math.max(MIN_GREEN_SIZE, rect.h);
        const id = getDefaultEntityId('green');
        const shape = makePresetShape(id, 'green', rect.x, rect.y, w, h, state.activeShapePreset);
        const bounds = shapeBounds(shape);
        dispatch({
          type: 'UPDATE_ACTIVE_HOLE',
          updater: (hole) => ({
            ...hole,
            terrain: { ...hole.terrain, green: shape },
            cup: hole.cup && pointInRect(hole.cup, bounds) ? hole.cup : null,
            slopes: hole.slopes.filter((z) => pointInRect(z, bounds)),
          }),
          selectedObjectId: id,
        });
        onSelectObject(id);
        setOverlay({ selectedShapeId: id, activeAnchorIndex: null, activeHandle: null });
      }

      if (state.activeTool === 'fairway' && rect.w > 3 && rect.h > 3) {
        const id = getDefaultEntityId('fairway');
        const shape = makePresetShape(id, 'fairway', rect.x, rect.y, rect.w, rect.h, state.activeShapePreset);
        dispatch({
          type: 'UPDATE_ACTIVE_HOLE',
          updater: (hole) => ({ ...hole, terrain: { ...hole.terrain, fairway: [...hole.terrain.fairway, shape] } }),
          selectedObjectId: id,
        });
        onSelectObject(id);
        setOverlay({ selectedShapeId: id, activeAnchorIndex: null, activeHandle: null });
      }

      if ((state.activeTool === 'sand' || state.activeTool === 'water') && rect.w > 3 && rect.h > 3) {
        const kind = state.activeTool;
        const id = getDefaultEntityId(kind);
        const shape = makePresetShape(id, kind, rect.x, rect.y, rect.w, rect.h, state.activeShapePreset);
        dispatch({
          type: 'UPDATE_ACTIVE_HOLE',
          updater: (hole) => ({ ...hole, hazards: [...hole.hazards, shape] }),
          selectedObjectId: id,
        });
        onSelectObject(id);
        setOverlay({ selectedShapeId: id, activeAnchorIndex: null, activeHandle: null });
      }

      if ((state.activeTool === 'rough' || state.activeTool === 'deepRough' || state.activeTool === 'desert') && rect.w > 3 && rect.h > 3) {
        const kind = state.activeTool;
        const id = getDefaultEntityId(kind);
        const shape = makePresetShape(id, kind, rect.x, rect.y, rect.w, rect.h, state.activeShapePreset);
        dispatch({
          type: 'UPDATE_ACTIVE_HOLE',
          updater: (hole) => ({
            ...hole,
            terrain: {
              ...hole.terrain,
              [kind]: [...hole.terrain[kind], shape],
            },
          }),
          selectedObjectId: id,
        });
        onSelectObject(id);
        setOverlay({ selectedShapeId: id, activeAnchorIndex: null, activeHandle: null });
      }
    }

    interaction.current.mode = 'none';
    interaction.current.movingId = null;
    interaction.current.anchorIndex = null;
    interaction.current.handleKind = null;
    setPreview(null);
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement, MouseEvent>) => {
    if (state.activeTool !== 'pathEdit') return;
    const screen = getScreenPoint(event);
    const world = screenToWorld(screen);
    const point = { x: clampWorld(world.x, extent.w), y: clampWorld(world.y, extent.h) };

    if (!state.selectedObjectId) return;
    const shape = findShape(hole, state.selectedObjectId);
    if (!shape) return;
    const seg = nearestSegment(shape, point);
    if (!seg || seg.distance > 14 / state.zoom) return;
    const updatedShape = toggleSegmentCurve(shape, seg.segIndex);
    dispatch({
      type: 'UPDATE_ACTIVE_HOLE',
      updater: (h) => replaceShape(h, state.selectedObjectId!, updatedShape),
      selectedObjectId: state.selectedObjectId,
    });
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const screen = getScreenPoint(event);
    const worldBefore = screenToWorld(screen);
    const nextZoom = Math.max(1, Math.min(4, state.zoom + (event.deltaY > 0 ? -0.1 : 0.1)));
    dispatch({ type: 'SET_ZOOM', payload: Number(nextZoom.toFixed(2)) });
    dispatch({ type: 'SET_PAN', payload: { x: screen.x - worldBefore.x * nextZoom, y: screen.y - worldBefore.y * nextZoom } });
  };

  const cursor = useMemo(() => {
    if (state.activeTool === 'pathEdit') return 'cursor-pointer';
    return 'cursor-crosshair';
  }, [state.activeTool]);

  return (
    <div ref={containerRef} className="flex-1 min-h-0 bg-gray-700 p-2">
      <canvas
        ref={canvasRef}
        className={`w-full h-full rounded border border-gray-600 ${cursor}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />
      <div className="sr-only">Canvas world is 700 by 700 per hole.</div>
    </div>
  );
}
