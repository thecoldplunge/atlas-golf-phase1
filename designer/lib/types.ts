export type ToolType =
  | 'select'
  | 'pathEdit'
  | 'tee'
  | 'green'
  | 'cup'
  | 'fairway'
  | 'rough'
  | 'deepRough'
  | 'sand'
  | 'water'
  | 'desert'
  | 'tree'
  | 'slope';

export type TreeType = 'pine' | 'oak' | 'palm' | 'birch' | 'cypress';

// Vertical profile of a tree — the game uses these to decide whether an
// airborne ball clips the trunk (narrow, full height) or the canopy (wide,
// only at the top 25% of height). Keep in sync with App.js:getTreePhysics.
export const TREE_HEIGHT_BY_LOOK: Record<TreeType | 'tree', number> = {
  pine: 32,
  oak: 22,
  palm: 28,
  birch: 24,
  cypress: 26,
  tree: 24,
};
export const TREE_CANOPY_FRACTION = 0.25;
export function getTreePhysics(look: string | undefined, r: number): { h: number; trunkR: number; canopyStart: number } {
  const k = (look ?? 'tree') as keyof typeof TREE_HEIGHT_BY_LOOK;
  const h = TREE_HEIGHT_BY_LOOK[k] ?? 20;
  const trunkR = Math.max(1.2, r * 0.3);
  const canopyStart = h * (1 - TREE_CANOPY_FRACTION);
  return { h, trunkR, canopyStart };
}
export type SlopeDirection = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';
export type ShapePreset = 'rectangle' | 'circle' | 'oval' | 'squircle' | 'diamond' | 'capsule';
export type SurfaceKind = 'fairway' | 'green' | 'rough' | 'deepRough' | 'sand' | 'water' | 'desert';
export type BackgroundKind = 'rough' | 'deepRough' | 'desert';

export interface Vec2 {
  x: number;
  y: number;
}

export interface RectShape {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PathPoint {
  id: string;
  x: number;
  y: number;
  inX: number;
  inY: number;
  outX: number;
  outY: number;
}

export interface VectorPath {
  closed: true;
  points: PathPoint[];
}

export interface SurfaceShape {
  id: string;
  kind: SurfaceKind;
  path: VectorPath;
}

export interface TeeBox extends RectShape {
  id: string;
  r: number;
  rotation?: number;
}

export interface Cup {
  id: string;
  x: number;
  y: number;
}

export interface SlopeZone {
  id: string;
  x: number;
  y: number;
  dir: SlopeDirection;
  strength: number;
}

export interface CircleObstacle {
  id: string;
  type: 'circle';
  x: number;
  y: number;
  r: number;
  look?: string;
}

export type Obstacle = CircleObstacle;

export interface HoleData {
  id: number;
  name: string;
  par: 3 | 4 | 5;
  ballStart: Vec2;
  cup: Cup | null;
  background: BackgroundKind;
  terrain: {
    tee: TeeBox | null;
    fairway: SurfaceShape[];
    green: SurfaceShape | null;
    rough: SurfaceShape[];
    deepRough: SurfaceShape[];
    desert: SurfaceShape[];
  };
  slopes: SlopeZone[];
  obstacles: Obstacle[];
  hazards: SurfaceShape[];
}

export interface DesignerState {
  courseName: string;
  designer: string;
  holes: HoleData[];
  activeHoleIndex: number;
  activeTool: ToolType;
  activeTreeType: TreeType;
  activeShapePreset: ShapePreset;
  selectedObjectId: string | null;
  zoom: number;
  panOffset: Vec2;
  snapToGrid: boolean;
  history: HoleData[][];
  future: HoleData[][];
}

export interface ExportTerrainRect extends RectShape {
  r: number;
}

export interface ExportVectorPoint {
  x: number;
  y: number;
  inX: number;
  inY: number;
  outX: number;
  outY: number;
}

export interface ExportVectorShape {
  points: ExportVectorPoint[];
}

export interface ExportHole {
  id: number;
  name: string;
  par: number;
  ballStart: Vec2;
  cup: Vec2;
  background?: BackgroundKind;
  terrain: {
    tee: ExportTerrainRect;
    fairway: ExportTerrainRect[];
    green: ExportTerrainRect;
    rough?: ExportTerrainRect[];
    deepRough?: ExportTerrainRect[];
    desert?: ExportTerrainRect[];
  };
  slopes: Array<{
    cx: number;
    cy: number;
    strength: number;
    dir: SlopeDirection;
  }>;
  obstacles: Array<{ type: 'circle'; x: number; y: number; r: number; look?: string }>;
  hazards: Array<
    | { type: 'sandRect'; x: number; y: number; w: number; h: number }
    | { type: 'waterRect'; x: number; y: number; w: number; h: number }
  >;
  editorVectors?: {
    version: 2;
    background?: BackgroundKind;
    terrain: {
      fairway: ExportVectorShape[];
      green: ExportVectorShape | null;
      rough?: ExportVectorShape[];
      deepRough?: ExportVectorShape[];
      desert?: ExportVectorShape[];
    };
    hazards: {
      sand: ExportVectorShape[];
      water: ExportVectorShape[];
    };
  };
}

export interface ExportCourse {
  courseName: string;
  designer: string;
  holes: ExportHole[];
}

export interface DrawPreview {
  type: 'rect' | 'circle';
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
}

export interface HitTarget {
  id: string;
  kind: 'tee' | 'green' | 'fairway' | 'cup' | 'slope' | 'obstacle' | 'hazard' | 'surface';
  bounds: RectShape;
}
