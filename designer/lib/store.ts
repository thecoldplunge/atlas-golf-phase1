'use client';

import {
  createElement,
  createContext,
  Dispatch,
  ReactNode,
  useContext,
  useMemo,
  useReducer,
} from 'react';
import type {
  DesignerState,
  HoleData,
  ShapePreset,
  SurfaceShape,
  ToolType,
  TreeType,
} from '@/lib/types';
import { cloneShape } from '@/lib/vector';

import { WORLD_WIDTH, WORLD_HEIGHT } from '@/lib/world';

const HISTORY_LIMIT = 120;

export type DesignerAction =
  | { type: 'SET_COURSE_NAME'; payload: string }
  | { type: 'SET_DESIGNER'; payload: string }
  | { type: 'SET_ACTIVE_HOLE_INDEX'; payload: number }
  | { type: 'SET_ACTIVE_TOOL'; payload: ToolType }
  | { type: 'SET_ACTIVE_TREE_TYPE'; payload: TreeType }
  | { type: 'SET_ACTIVE_SHAPE_PRESET'; payload: ShapePreset }
  | { type: 'SET_SELECTED_OBJECT'; payload: string | null }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'SET_PAN'; payload: { x: number; y: number } }
  | { type: 'RESET_VIEW' }
  | { type: 'TOGGLE_SNAP' }
  | {
      type: 'UPDATE_ACTIVE_HOLE';
      updater: (hole: HoleData) => HoleData;
      selectedObjectId?: string | null;
    }
  | {
      type: 'SET_HOLES';
      payload: HoleData[];
      activeHoleIndex?: number;
      commit?: boolean;
      selectedObjectId?: string | null;
    }
  | { type: 'UNDO' }
  | { type: 'REDO' };

interface DesignerContextValue {
  state: DesignerState;
  dispatch: Dispatch<DesignerAction>;
}

const DesignerContext = createContext<DesignerContextValue | null>(null);

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function createEmptyHole(id: number): HoleData {
  return {
    id,
    name: `Hole ${id}`,
    par: 4,
    ballStart: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT - 80 },
    cup: null,
    background: 'rough',
    terrain: {
      tee: null,
      fairway: [],
      green: null,
      rough: [],
      deepRough: [],
      desert: [],
    },
    slopes: [],
    obstacles: [],
    hazards: [],
  };
}

function cloneSurfaceArray(shapes: SurfaceShape[]): SurfaceShape[] {
  return shapes.map((shape) => cloneShape(shape));
}

function cloneHole(hole: HoleData): HoleData {
  return {
    id: hole.id,
    name: hole.name,
    par: hole.par,
    ballStart: { ...hole.ballStart },
    cup: hole.cup ? { ...hole.cup } : null,
    background: hole.background,
    terrain: {
      tee: hole.terrain.tee ? { ...hole.terrain.tee } : null,
      fairway: cloneSurfaceArray(hole.terrain.fairway),
      green: hole.terrain.green ? cloneShape(hole.terrain.green) : null,
      rough: cloneSurfaceArray(hole.terrain.rough),
      deepRough: cloneSurfaceArray(hole.terrain.deepRough),
      desert: cloneSurfaceArray(hole.terrain.desert),
    },
    slopes: hole.slopes.map((slope) => ({ ...slope })),
    obstacles: hole.obstacles.map((obstacle) => ({ ...obstacle })),
    hazards: cloneSurfaceArray(hole.hazards),
  };
}

export function cloneHoles(holes: HoleData[]): HoleData[] {
  return holes.map(cloneHole);
}

function pushHistory(state: DesignerState): HoleData[][] {
  const history = [...state.history, cloneHoles(state.holes)];
  if (history.length > HISTORY_LIMIT) {
    return history.slice(history.length - HISTORY_LIMIT);
  }
  return history;
}

function commitHoles(
  state: DesignerState,
  holes: HoleData[],
  selectedObjectId: string | null = state.selectedObjectId,
): DesignerState {
  return {
    ...state,
    holes,
    history: pushHistory(state),
    future: [],
    selectedObjectId,
  };
}

function reducer(state: DesignerState, action: DesignerAction): DesignerState {
  switch (action.type) {
    case 'SET_COURSE_NAME':
      return { ...state, courseName: action.payload };
    case 'SET_DESIGNER':
      return { ...state, designer: action.payload };
    case 'SET_ACTIVE_HOLE_INDEX':
      return {
        ...state,
        activeHoleIndex: Math.max(0, Math.min(action.payload, state.holes.length - 1)),
        selectedObjectId: null,
      };
    case 'SET_ACTIVE_TOOL':
      return { ...state, activeTool: action.payload };
    case 'SET_ACTIVE_TREE_TYPE':
      return { ...state, activeTreeType: action.payload };
    case 'SET_ACTIVE_SHAPE_PRESET':
      return { ...state, activeShapePreset: action.payload };
    case 'SET_SELECTED_OBJECT':
      return { ...state, selectedObjectId: action.payload };
    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(0.12, Math.min(4, action.payload)) };
    case 'SET_PAN':
      return { ...state, panOffset: action.payload };
    case 'RESET_VIEW':
      return { ...state, zoom: 1, panOffset: { x: 0, y: 0 } };
    case 'TOGGLE_SNAP':
      return { ...state, snapToGrid: !state.snapToGrid };
    case 'UPDATE_ACTIVE_HOLE': {
      const holes = cloneHoles(state.holes);
      const index = state.activeHoleIndex;
      holes[index] = action.updater(holes[index]);
      return commitHoles(state, holes, action.selectedObjectId ?? state.selectedObjectId);
    }
    case 'SET_HOLES': {
      const nextHoles = cloneHoles(action.payload);
      if (action.commit === false) {
        return {
          ...state,
          holes: nextHoles,
          activeHoleIndex:
            action.activeHoleIndex ?? Math.max(0, Math.min(state.activeHoleIndex, nextHoles.length - 1)),
          selectedObjectId: action.selectedObjectId ?? state.selectedObjectId,
        };
      }
      return {
        ...commitHoles(state, nextHoles, action.selectedObjectId ?? state.selectedObjectId),
        activeHoleIndex:
          action.activeHoleIndex ?? Math.max(0, Math.min(state.activeHoleIndex, nextHoles.length - 1)),
      };
    }
    case 'UNDO': {
      if (state.history.length === 0) {
        return state;
      }
      const previous = state.history[state.history.length - 1];
      return {
        ...state,
        holes: cloneHoles(previous),
        history: state.history.slice(0, -1),
        future: [cloneHoles(state.holes), ...state.future],
        selectedObjectId: null,
      };
    }
    case 'REDO': {
      if (state.future.length === 0) {
        return state;
      }
      const next = state.future[0];
      return {
        ...state,
        holes: cloneHoles(next),
        history: [...state.history, cloneHoles(state.holes)],
        future: state.future.slice(1),
        selectedObjectId: null,
      };
    }
    default:
      return state;
  }
}

export const initialState: DesignerState = {
  courseName: 'My Course',
  designer: 'Designer',
  holes: [createEmptyHole(1)],
  activeHoleIndex: 0,
  activeTool: 'select',
  activeTreeType: 'pine',
  activeShapePreset: 'rectangle',
  selectedObjectId: null,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  snapToGrid: false,
  history: [],
  future: [],
};

export function DesignerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return createElement(DesignerContext.Provider, { value }, children);
}

export function useDesigner() {
  const context = useContext(DesignerContext);
  if (!context) {
    throw new Error('useDesigner must be used within a DesignerProvider');
  }
  return context;
}

export function nextHoleId(holes: HoleData[]): number {
  if (holes.length === 0) return 1;
  return Math.max(...holes.map((hole) => hole.id)) + 1;
}

export function getDefaultEntityId(prefix: string): string {
  return makeId(prefix);
}
