'use client';

import { useEffect, useMemo, useState } from 'react';
import Canvas from '@/components/Canvas';
import ExportModal from '@/components/ExportModal';
import GenerateCourseWizard from '@/components/GenerateCourseWizard';
import HolePanel from '@/components/HolePanel';
import PropertiesPanel from '@/components/PropertiesPanel';
import Toolbar from '@/components/Toolbar';
import { cloneShape, rotateShape, shapeBounds, toggleSegmentCurve } from '@/lib/vector';
import { cloneHoles, createEmptyHole, nextHoleId, useDesigner } from '@/lib/store';
import type { SurfaceKind, SurfaceShape, ToolType, TreeType } from '@/lib/types';

const treeKeyMap: Record<string, TreeType> = {
  '1': 'pine',
  '2': 'oak',
  '3': 'palm',
  '4': 'birch',
  '5': 'cypress',
};

const toolKeyMap: Record<string, ToolType> = {
  v: 'select',
  p: 'pathEdit',
  t: 'tee',
  g: 'green',
  h: 'cup',
  f: 'fairway',
  r: 'rough',
  x: 'deepRough',
  s: 'sand',
  w: 'water',
  d: 'desert',
  l: 'slope',
};

function findSelectedShape(hole: (typeof useDesigner extends never ? never : never) | any, id: string | null): SurfaceShape | null {
  if (!id) return null;
  return (
    hole.terrain.green?.id === id
      ? hole.terrain.green
      : hole.terrain.fairway.find((entry: SurfaceShape) => entry.id === id) ??
        hole.hazards.find((entry: SurfaceShape) => entry.id === id) ??
        null
  );
}

function replaceShape(hole: any, shapeId: string, nextShape: SurfaceShape) {
  return {
    ...hole,
    terrain: {
      ...hole.terrain,
      green: hole.terrain.green?.id === shapeId ? nextShape : hole.terrain.green,
      fairway: hole.terrain.fairway.map((entry: SurfaceShape) => (entry.id === shapeId ? nextShape : entry)),
    },
    hazards: hole.hazards.map((entry: SurfaceShape) => (entry.id === shapeId ? nextShape : entry)),
  };
}

function moveShapeKind(hole: any, shapeId: string, kind: SurfaceKind) {
  const selected = findSelectedShape(hole, shapeId);
  if (!selected) return hole;
  const next = cloneShape(selected);
  next.kind = kind;
  const fairway = hole.terrain.fairway.filter((entry: SurfaceShape) => entry.id !== shapeId);
  const hazards = hole.hazards.filter((entry: SurfaceShape) => entry.id !== shapeId);
  const green = hole.terrain.green?.id === shapeId ? null : hole.terrain.green;
  return {
    ...hole,
    terrain: {
      ...hole.terrain,
      fairway: [...fairway, ...(kind === 'fairway' ? [next] : [])],
      green: kind === 'green' ? next : green,
    },
    hazards: [...hazards, ...(kind === 'sand' || kind === 'water' ? [next] : [])],
  };
}

export default function CourseDesigner() {
  const { state, dispatch } = useDesigner();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'export' | 'import'>('export');
  const [generatorOpen, setGeneratorOpen] = useState(false);

  const activeHole = state.holes[state.activeHoleIndex];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inTextInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (inTextInput) return;

      const key = event.key.toLowerCase();
      if (toolKeyMap[key]) {
        event.preventDefault();
        dispatch({ type: 'SET_ACTIVE_TOOL', payload: toolKeyMap[key] });
      }

      if (treeKeyMap[key]) {
        event.preventDefault();
        dispatch({ type: 'SET_ACTIVE_TREE_TYPE', payload: treeKeyMap[key] });
        dispatch({ type: 'SET_ACTIVE_TOOL', payload: 'tree' });
      }

      if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          dispatch({ type: 'REDO' });
        } else {
          dispatch({ type: 'UNDO' });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  const completion = useMemo(() => {
    return state.holes.map((hole) => Boolean(hole.terrain.tee && hole.terrain.green && hole.cup));
  }, [state.holes]);

  const holeDistance = useMemo(() => {
    if (!activeHole.terrain.tee || !activeHole.terrain.green) return null;
    const tee = activeHole.terrain.tee;
    const teeCenter = { x: tee.x + tee.w / 2, y: tee.y + tee.h / 2 };
    const target = activeHole.cup
      ? { x: activeHole.cup.x, y: activeHole.cup.y }
      : (() => {
          const bounds = shapeBounds(activeHole.terrain.green as SurfaceShape);
          return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
        })();
    const pixels = Math.hypot(target.x - teeCenter.x, target.y - teeCenter.y);
    return Math.round(pixels);
  }, [activeHole]);

  return (
    <div className="min-h-screen h-screen flex flex-col bg-gray-900 text-gray-100">
      <header className="h-12 shrink-0 border-b border-gray-700 bg-gray-800 px-3 flex items-center gap-2">
        <input
          value={state.courseName}
          onChange={(e) => dispatch({ type: 'SET_COURSE_NAME', payload: e.target.value })}
          className="h-8 px-2 rounded bg-gray-700 border border-gray-600 text-sm w-48"
          placeholder="Course Name"
        />
        <input
          value={state.designer}
          onChange={(e) => dispatch({ type: 'SET_DESIGNER', payload: e.target.value })}
          className="h-8 px-2 rounded bg-gray-700 border border-gray-600 text-sm w-40"
          placeholder="Designer"
        />

        <button
          type="button"
          className="h-8 px-3 rounded bg-fuchsia-600 hover:bg-fuchsia-500 text-sm font-semibold"
          onClick={() => setGeneratorOpen(true)}
        >
          ✨ Generate Course
        </button>

        <button
          type="button"
          className="h-8 px-3 rounded bg-green-600 hover:bg-green-500 text-sm"
          onClick={() => {
            setModalTab('export');
            setModalOpen(true);
          }}
        >
          Export JSON
        </button>

        <button
          type="button"
          className="h-8 px-3 rounded bg-gray-700 hover:bg-gray-600 text-sm"
          onClick={() => {
            setModalTab('import');
            setModalOpen(true);
          }}
        >
          Import JSON
        </button>

        <button
          type="button"
          className="h-8 px-3 rounded bg-gray-700 hover:bg-gray-600 text-sm disabled:opacity-50"
          disabled={state.history.length === 0}
          onClick={() => dispatch({ type: 'UNDO' })}
        >
          Undo
        </button>
        <button
          type="button"
          className="h-8 px-3 rounded bg-gray-700 hover:bg-gray-600 text-sm disabled:opacity-50"
          disabled={state.future.length === 0}
          onClick={() => dispatch({ type: 'REDO' })}
        >
          Redo
        </button>

        <button
          type="button"
          className={`h-8 px-3 rounded text-sm ${
            state.snapToGrid ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          onClick={() => dispatch({ type: 'TOGGLE_SNAP' })}
        >
          Grid Snap {state.snapToGrid ? 'On' : 'Off'}
        </button>

        <div className="ml-auto flex items-center gap-2 text-sm text-gray-300">
          {holeDistance !== null && <span className="mr-2">Hole length {holeDistance}</span>}
          <div className="flex items-center rounded overflow-hidden border border-gray-600">
            <button
              type="button"
              className="h-8 px-2 bg-gray-700 hover:bg-gray-600 border-r border-gray-600 text-base leading-none"
              onClick={() => dispatch({ type: 'SET_ZOOM', payload: Math.max(0.12, state.zoom / 1.25) })}
              title="Zoom out"
            >
              −
            </button>
            <span className="h-8 px-3 bg-gray-800 flex items-center font-mono text-xs">{state.zoom.toFixed(2)}x</span>
            <button
              type="button"
              className="h-8 px-2 bg-gray-700 hover:bg-gray-600 border-l border-gray-600 text-base leading-none"
              onClick={() => dispatch({ type: 'SET_ZOOM', payload: Math.min(4, state.zoom * 1.25) })}
              title="Zoom in"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="h-8 px-3 rounded bg-gray-700 hover:bg-gray-600 text-sm"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('atlas-golf:fit-course'));
            }}
            title="Fit whole course in view"
          >
            Fit
          </button>
          <button
            type="button"
            className="h-8 px-2 rounded bg-gray-700 hover:bg-gray-600 text-sm"
            onClick={() => dispatch({ type: 'RESET_VIEW' })}
            title="Reset view (zoom 1x, pan 0)"
          >
            Reset
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex">
        <Toolbar
          activeTool={state.activeTool}
          activeTreeType={state.activeTreeType}
          activeShapePreset={state.activeShapePreset}
          onToolChange={(tool) => dispatch({ type: 'SET_ACTIVE_TOOL', payload: tool })}
          onTreeTypeChange={(tree) => dispatch({ type: 'SET_ACTIVE_TREE_TYPE', payload: tree })}
          onShapePresetChange={(preset) => dispatch({ type: 'SET_ACTIVE_SHAPE_PRESET', payload: preset })}
        />

        <Canvas onSelectObject={(id) => dispatch({ type: 'SET_SELECTED_OBJECT', payload: id })} />

        <aside className="w-[320px] shrink-0 border-l border-gray-700 bg-gray-900 p-2 space-y-2 overflow-auto">
          <HolePanel
            holes={state.holes}
            activeHoleIndex={state.activeHoleIndex}
            onSetActiveHole={(index) => dispatch({ type: 'SET_ACTIVE_HOLE_INDEX', payload: index })}
            onAddHole={() => {
              const holes = cloneHoles(state.holes);
              holes.push(createEmptyHole(nextHoleId(holes)));
              dispatch({ type: 'SET_HOLES', payload: holes, activeHoleIndex: holes.length - 1, selectedObjectId: null });
            }}
            onDeleteHole={(index) => {
              if (state.holes.length <= 1) return;
              const holes = cloneHoles(state.holes).filter((_, holeIndex) => holeIndex !== index);
              dispatch({
                type: 'SET_HOLES',
                payload: holes,
                activeHoleIndex: Math.max(0, Math.min(state.activeHoleIndex, holes.length - 1)),
                selectedObjectId: null,
              });
            }}
            onReorderHoles={(fromIndex, toIndex) => {
              const holes = cloneHoles(state.holes);
              const [item] = holes.splice(fromIndex, 1);
              holes.splice(toIndex, 0, item);
              dispatch({ type: 'SET_HOLES', payload: holes, activeHoleIndex: toIndex, selectedObjectId: null });
            }}
            onUpdateHoleMeta={(index, patch) => {
              const holes = cloneHoles(state.holes);
              holes[index] = {
                ...holes[index],
                name: patch.name ?? holes[index].name,
                par: patch.par ?? holes[index].par,
              };
              dispatch({ type: 'SET_HOLES', payload: holes, commit: false });
            }}
          />

          <PropertiesPanel
            hole={activeHole}
            selectedObjectId={state.selectedObjectId}
            onSelectObject={(id) => dispatch({ type: 'SET_SELECTED_OBJECT', payload: id })}
            onDeleteSelected={() => {
              const id = state.selectedObjectId;
              if (!id) return;
              dispatch({
                type: 'UPDATE_ACTIVE_HOLE',
                updater: (hole) => {
                  if (hole.terrain.tee?.id === id) return { ...hole, terrain: { ...hole.terrain, tee: null } };
                  if (hole.terrain.green?.id === id) return { ...hole, terrain: { ...hole.terrain, green: null }, cup: null, slopes: [] };
                  if (hole.cup?.id === id) return { ...hole, cup: null };
                  const fw = hole.terrain.fairway.filter((s) => s.id !== id);
                  if (fw.length !== hole.terrain.fairway.length) return { ...hole, terrain: { ...hole.terrain, fairway: fw } };
                  const sl = hole.slopes.filter((z) => z.id !== id);
                  if (sl.length !== hole.slopes.length) return { ...hole, slopes: sl };
                  const ob = hole.obstacles.filter((o) => o.id !== id);
                  if (ob.length !== hole.obstacles.length) return { ...hole, obstacles: ob };
                  const hz = hole.hazards.filter((s) => s.id !== id);
                  if (hz.length !== hole.hazards.length) return { ...hole, hazards: hz };
                  return hole;
                },
                selectedObjectId: null,
              });
            }}
            onBeginSlopePlacement={() => dispatch({ type: 'SET_ACTIVE_TOOL', payload: 'slope' })}
            onUpdateSlope={(id, patch) => {
              dispatch({
                type: 'UPDATE_ACTIVE_HOLE',
                updater: (hole) => ({
                  ...hole,
                  slopes: hole.slopes.map((zone) =>
                    zone.id === id
                      ? { ...zone, dir: patch.dir ?? zone.dir, strength: patch.strength ?? zone.strength }
                      : zone,
                  ),
                }),
              });
            }}
            onUpdateTree={(id, patch) => {
              dispatch({
                type: 'UPDATE_ACTIVE_HOLE',
                updater: (hole) => ({
                  ...hole,
                  obstacles: hole.obstacles.map((item) => {
                    if (item.id !== id) return item;
                    return { ...item, look: patch.look ?? item.look, r: patch.r ?? item.r };
                  }),
                }),
              });
            }}
            onUpdateTee={(patch) => {
              dispatch({
                type: 'UPDATE_ACTIVE_HOLE',
                updater: (hole) => hole.terrain.tee ? { ...hole, terrain: { ...hole.terrain, tee: { ...hole.terrain.tee, rotation: patch.rotation ?? hole.terrain.tee.rotation ?? 0 } } } : hole,
              });
            }}
            onRotateShape={(id, degrees) => {
              dispatch({
                type: 'UPDATE_ACTIVE_HOLE',
                updater: (hole) => {
                  const shape = findSelectedShape(hole, id);
                  if (!shape) return hole;
                  const rotated = rotateShape(shape, degrees);
                  return replaceShape(hole, id, rotated);
                },
              });
            }}
            onUpdateShapeKind={(id, kind) => {
              dispatch({
                type: 'UPDATE_ACTIVE_HOLE',
                updater: (hole) => {
                  const shape = findSelectedShape(hole, id);
                  if (!shape) return hole;
                  const next = cloneShape(shape);
                  next.kind = kind;
                  const fairway = hole.terrain.fairway.filter((s: SurfaceShape) => s.id !== id);
                  const hazards = hole.hazards.filter((s: SurfaceShape) => s.id !== id);
                  const green = hole.terrain.green?.id === id ? null : hole.terrain.green;
                  return {
                    ...hole,
                    terrain: {
                      ...hole.terrain,
                      fairway: [...fairway, ...(kind === 'fairway' ? [next] : [])],
                      green: kind === 'green' ? next : green,
                    },
                    hazards: [...hazards, ...(kind === 'sand' || kind === 'water' ? [next] : [])],
                  };
                },
              });
            }}
          />

          <div className="text-xs text-gray-400 bg-gray-800 border border-gray-700 rounded p-2">
            <div>Completion</div>
            <div className="mt-1 grid grid-cols-6 gap-1">
              {completion.map((done, index) => (
                <div
                  key={`${index}-${done}`}
                  className={`text-center rounded py-0.5 ${done ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  {index + 1}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      <ExportModal
        open={modalOpen}
        defaultTab={modalTab}
        onClose={() => setModalOpen(false)}
        courseName={state.courseName}
        designer={state.designer}
        holes={state.holes}
        onImportCourse={(payload) => {
          dispatch({ type: 'SET_COURSE_NAME', payload: payload.courseName });
          dispatch({ type: 'SET_DESIGNER', payload: payload.designer });
          dispatch({ type: 'SET_HOLES', payload: payload.holes, activeHoleIndex: 0, selectedObjectId: null });
        }}
      />

      <GenerateCourseWizard
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        initialCourseName={state.courseName}
        initialDesigner={state.designer}
        onCourseGenerated={(payload) => {
          dispatch({ type: 'SET_COURSE_NAME', payload: payload.courseName });
          dispatch({ type: 'SET_DESIGNER', payload: payload.designer });
          dispatch({ type: 'SET_HOLES', payload: payload.holes, activeHoleIndex: 0, selectedObjectId: null });
          dispatch({ type: 'RESET_VIEW' });
        }}
      />
    </div>
  );
}
