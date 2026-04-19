'use client';

import type { HoleData, SlopeDirection, SurfaceKind, TreeType } from '@/lib/types';
import { getTreePhysics } from '@/lib/types';
import { shapeBounds, toggleSegmentCurve } from '@/lib/vector';

const slopeDirs: SlopeDirection[] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
const treeTypes: TreeType[] = ['pine', 'oak', 'palm', 'birch', 'cypress'];
const surfaceKinds: Array<{ value: SurfaceKind; label: string }> = [
  { value: 'fairway', label: 'Fairway' },
  { value: 'green', label: 'Green' },
  { value: 'rough', label: 'Rough' },
  { value: 'deepRough', label: 'Deep Rough' },
  { value: 'sand', label: 'Bunker' },
  { value: 'water', label: 'Water' },
  { value: 'desert', label: 'Desert' },
];

interface PropertiesPanelProps {
  hole: HoleData;
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  onDeleteSelected: () => void;
  onBeginSlopePlacement: () => void;
  onUpdateSlope: (id: string, patch: { dir?: SlopeDirection; strength?: number }) => void;
  onUpdateTree: (id: string, patch: { look?: TreeType; r?: number }) => void;
  onUpdateTee?: (patch: { rotation?: number }) => void;
  onRotateShape?: (id: string, degrees: number) => void;
  onUpdateShapeKind?: (id: string, kind: SurfaceKind) => void;
}

function hasTreeLook(look?: string): look is TreeType {
  return look === 'pine' || look === 'oak' || look === 'palm' || look === 'birch' || look === 'cypress';
}

function kindLabel(kind: SurfaceKind) {
  return {
    fairway: 'Fairway',
    green: 'Green',
    rough: 'Rough',
    deepRough: 'Deep Rough',
    sand: 'Bunker',
    water: 'Water',
    desert: 'Desert',
  }[kind];
}

export default function PropertiesPanel({
  hole,
  selectedObjectId,
  onSelectObject,
  onDeleteSelected,
  onBeginSlopePlacement,
  onUpdateSlope,
  onUpdateTree,
  onUpdateTee,
  onRotateShape,
  onUpdateShapeKind,
}: PropertiesPanelProps) {
  const selectedTee = hole.terrain.tee?.id === selectedObjectId ? hole.terrain.tee : null;
  const selectedCup = hole.cup?.id === selectedObjectId ? hole.cup : null;
  const selectedGreen = hole.terrain.green?.id === selectedObjectId ? hole.terrain.green : null;
  const selectedFairway = hole.terrain.fairway.find((s) => s.id === selectedObjectId) ?? null;
  const selectedHazard = hole.hazards.find((s) => s.id === selectedObjectId) ?? null;
  const selectedSlope = hole.slopes.find((z) => z.id === selectedObjectId) ?? null;
  const selectedObstacle = hole.obstacles.find((o) => o.id === selectedObjectId) ?? null;
  const selectedTree = selectedObstacle && hasTreeLook(selectedObstacle.look) ? selectedObstacle : null;
  const selectedShape = selectedGreen ?? selectedFairway ?? selectedHazard;

  const stats = {
    objects: (hole.terrain.tee ? 1 : 0) + (hole.terrain.green ? 1 : 0) + (hole.cup ? 1 : 0) + hole.terrain.fairway.length + hole.slopes.length + hole.obstacles.length + hole.hazards.length,
    tee: Boolean(hole.terrain.tee),
    green: Boolean(hole.terrain.green),
    cup: Boolean(hole.cup),
  };

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-md p-3 space-y-3">
      <h2 className="text-sm font-semibold text-gray-100">Properties</h2>

      {/* Delete button when anything is selected */}
      {selectedObjectId && (
        <button
          type="button"
          onClick={onDeleteSelected}
          className="w-full h-8 rounded bg-red-700 hover:bg-red-600 text-white text-sm font-medium"
        >
          Delete Selected
        </button>
      )}

      {!selectedObjectId && (
        <div className="space-y-2 text-sm text-gray-300">
          <div className="flex justify-between"><span>Objects</span><span>{stats.objects}</span></div>
          <div className="flex justify-between"><span>Tee</span><span>{stats.tee ? '✓' : '—'}</span></div>
          <div className="flex justify-between"><span>Green</span><span>{stats.green ? '✓' : '—'}</span></div>
          <div className="flex justify-between"><span>Cup</span><span>{stats.cup ? '✓' : '—'}</span></div>
          <div className="pt-2 border-t border-gray-700 text-xs text-gray-400 space-y-1">
            <div className="font-medium text-gray-300">Path Edit mode (P):</div>
            <div>- Click shape to select</div>
            <div>- Drag anchors to reshape</div>
            <div>- Click near an edge to add anchor</div>
            <div>- Double-click edge to toggle curve</div>
            <div>- Drag handles to adjust curve</div>
            <div>- Alt+drag handle to mirror</div>
            <div>- Delete/Backspace to remove</div>
          </div>
        </div>
      )}

      {selectedTee && (
        <div className="space-y-2 text-sm text-gray-300">
          <h3 className="text-xs uppercase text-gray-400">Tee Box</h3>
          <div className="text-xs space-y-1">
            <div>Position: ({Math.round(selectedTee.x)}, {Math.round(selectedTee.y)})</div>
            <div>Size: {Math.round(selectedTee.w)} × {Math.round(selectedTee.h)}</div>
          </div>
          {onUpdateTee ? <div>
            <label className="text-xs text-gray-400 block mb-1">Rotation: {Math.round(selectedTee.rotation ?? 0)}°</label>
            <input type="range" min={-180} max={180} step={1} value={selectedTee.rotation ?? 0} className="w-full"
              onChange={(e) => onUpdateTee({ rotation: Number(e.target.value) })} />
          </div> : null}
        </div>
      )}

      {selectedCup && (
        <div className="space-y-2 text-sm text-gray-300">
          <h3 className="text-xs uppercase text-gray-400">Cup (Hole)</h3>
          <div className="text-xs">Position: ({Math.round(selectedCup.x)}, {Math.round(selectedCup.y)})</div>
        </div>
      )}

      {selectedShape && (
        <div className="space-y-3 text-sm text-gray-300">
          <h3 className="text-xs uppercase text-gray-400">{kindLabel(selectedShape.kind)} Path</h3>
          <div className="text-xs space-y-1">
            <div>Anchors: {selectedShape.path.points.length}</div>
            <div>Size: {Math.round(shapeBounds(selectedShape).w)} × {Math.round(shapeBounds(selectedShape).h)}</div>
          </div>

          {onUpdateShapeKind && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Shape Type</label>
              <select
                value={selectedShape.kind}
                className="w-full h-9 rounded bg-gray-700 border border-gray-600 px-2 text-sm text-gray-100"
                onChange={(e) => onUpdateShapeKind(selectedShape.id, e.target.value as SurfaceKind)}
              >
                {surfaceKinds.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
          )}

          {onRotateShape ? (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Rotate Shape</label>
              <div className="grid grid-cols-3 gap-2">
                {[-15, 15, 45].map((amount) => (
                  <button key={amount} type="button" className="h-9 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-100" onClick={() => onRotateShape(selectedShape.id, amount)}>
                    {amount > 0 ? `+${amount}°` : `${amount}°`}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {selectedGreen && (
            <>
              <button
                type="button"
                className="w-full h-9 rounded bg-green-600 hover:bg-green-500 text-white text-sm"
                onClick={onBeginSlopePlacement}
              >
                Add Slope Zone
              </button>
              <div className="space-y-1">
                <div className="text-xs text-gray-400">Slopes ({hole.slopes.length})</div>
                {hole.slopes.length === 0 && <div className="text-xs text-gray-500">No slopes yet.</div>}
                {hole.slopes.map((slope, index) => (
                  <button
                    key={slope.id}
                    type="button"
                    className={`w-full text-left text-xs rounded p-2 border ${slope.id === selectedObjectId ? 'bg-green-700/30 border-green-500' : 'bg-gray-700 border-gray-600'}`}
                    onClick={() => onSelectObject(slope.id)}
                  >
                    #{index + 1} {slope.dir} ({Math.round(slope.strength * 100)}%)
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {selectedSlope && (
        <div className="space-y-3 text-sm text-gray-300">
          <h3 className="text-xs uppercase text-gray-400">Slope Zone</h3>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Direction</label>
            <select
              value={selectedSlope.dir}
              className="w-full h-9 rounded bg-gray-700 border border-gray-600 px-2 text-sm text-gray-100"
              onChange={(e) => onUpdateSlope(selectedSlope.id, { dir: e.target.value as SlopeDirection })}
            >
              {slopeDirs.map((dir) => <option key={dir} value={dir}>{dir}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Strength: {selectedSlope.strength.toFixed(2)}</label>
            <input type="range" min={0} max={1} step={0.01} value={selectedSlope.strength} className="w-full"
              onChange={(e) => onUpdateSlope(selectedSlope.id, { strength: Number(e.target.value) })} />
          </div>
        </div>
      )}

      {selectedTree && (
        <div className="space-y-3 text-sm text-gray-300">
          <h3 className="text-xs uppercase text-gray-400">Tree</h3>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Type</label>
            <select
              value={selectedTree.look}
              className="w-full h-9 rounded bg-gray-700 border border-gray-600 px-2 text-sm text-gray-100"
              onChange={(e) => onUpdateTree(selectedTree.id, { look: e.target.value as TreeType })}
            >
              {treeTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Size: {selectedTree.r.toFixed(1)}</label>
            <input type="range" min={8} max={24} step={0.5} value={selectedTree.r} className="w-full"
              onChange={(e) => onUpdateTree(selectedTree.id, { r: Number(e.target.value) })} />
          </div>
          {(() => {
            const tp = getTreePhysics(selectedTree.look, selectedTree.r);
            return (
              <div className="text-xs text-gray-400 border-t border-gray-700 pt-2 space-y-1">
                <div className="font-medium text-gray-300 mb-1">Collision (auto)</div>
                <div className="flex justify-between"><span>Height</span><span>{tp.h} yd</span></div>
                <div className="flex justify-between"><span>Trunk radius</span><span>{tp.trunkR.toFixed(1)}</span></div>
                <div className="flex justify-between"><span>Canopy from</span><span>{tp.canopyStart.toFixed(1)} yd</span></div>
                <div className="text-gray-500 pt-1">Ball clips trunk below {tp.canopyStart.toFixed(0)}yd, canopy above. Passes over at {tp.h}yd.</div>
              </div>
            );
          })()}
        </div>
      )}

    </section>
  );
}
