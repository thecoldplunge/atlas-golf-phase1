'use client';

import { useState } from 'react';
import type { HoleData } from '@/lib/types';

interface HolePanelProps {
  holes: HoleData[];
  activeHoleIndex: number;
  onSetActiveHole: (index: number) => void;
  onAddHole: () => void;
  onDeleteHole: (index: number) => void;
  onReorderHoles: (fromIndex: number, toIndex: number) => void;
  onUpdateHoleMeta: (index: number, patch: { name?: string; par?: 3 | 4 | 5 }) => void;
}

function isComplete(hole: HoleData): boolean {
  return Boolean(hole.terrain.tee && hole.terrain.green && hole.cup);
}

export default function HolePanel({
  holes,
  activeHoleIndex,
  onSetActiveHole,
  onAddHole,
  onDeleteHole,
  onReorderHoles,
  onUpdateHoleMeta,
}: HolePanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const activeHole = holes[activeHoleIndex];

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Holes</h2>
          <div className="text-[11px] text-gray-400">One canvas per hole</div>
        </div>
        <button
          type="button"
          className="h-7 w-7 rounded bg-green-600 hover:bg-green-500 text-white"
          onClick={onAddHole}
          title="Add hole"
        >
          +
        </button>
      </div>

      <div className="space-y-1 max-h-64 overflow-auto pr-1">
        {holes.map((hole, index) => (
          <button
            type="button"
            key={hole.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex === null || dragIndex === index) return;
              onReorderHoles(dragIndex, index);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            onClick={() => onSetActiveHole(index)}
            className={`w-full text-left rounded p-2 border transition-colors ${
              index === activeHoleIndex
                ? 'bg-green-700/35 border-green-500'
                : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
            }`}
          >
            <div className="flex items-center justify-between text-sm text-gray-100">
              <span>#{index + 1}</span>
              <span>{isComplete(hole) ? '✅' : '⏳'}</span>
            </div>
            <div className="text-xs text-gray-300 truncate">{hole.name}</div>
            <div className="text-[11px] text-gray-400">Par {hole.par}</div>
          </button>
        ))}
      </div>

      {activeHole && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-gray-400">Hole Settings</h3>
          <div>
            <label className="text-xs text-gray-300 block mb-1">Name</label>
            <input
              value={activeHole.name}
              onChange={(e) => onUpdateHoleMeta(activeHoleIndex, { name: e.target.value })}
              className="w-full h-9 rounded bg-gray-700 border border-gray-600 px-2 text-sm text-gray-100"
            />
          </div>
          <div>
            <label className="text-xs text-gray-300 block mb-1">Par</label>
            <select
              value={activeHole.par}
              onChange={(e) =>
                onUpdateHoleMeta(activeHoleIndex, { par: Number(e.target.value) as 3 | 4 | 5 })
              }
              className="w-full h-9 rounded bg-gray-700 border border-gray-600 px-2 text-sm text-gray-100"
            >
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </div>
          <div className="rounded border border-gray-700 bg-gray-900/50 p-2 text-xs text-gray-400">
            Fairways: {activeHole.terrain.fairway.length} • Hazards: {activeHole.hazards.length} • Trees: {activeHole.obstacles.length} • Slopes: {activeHole.slopes.length}
          </div>
          <button
            type="button"
            className="w-full h-9 rounded bg-red-700 hover:bg-red-600 text-white text-sm"
            onClick={() => {
              if (holes.length <= 1) return;
              if (window.confirm(`Delete ${activeHole.name}?`)) {
                onDeleteHole(activeHoleIndex);
              }
            }}
            disabled={holes.length <= 1}
          >
            Delete Hole
          </button>
        </div>
      )}
    </section>
  );
}
