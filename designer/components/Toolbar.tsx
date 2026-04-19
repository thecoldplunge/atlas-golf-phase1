'use client';

import type { ShapePreset, ToolType, TreeType } from '@/lib/types';

const toolButtons: Array<{ tool: ToolType; label: string; hotkey: string }> = [
  { tool: 'select', label: 'Select', hotkey: 'V' },
  { tool: 'pathEdit', label: 'Path', hotkey: 'P' },
  { tool: 'tee', label: 'Tee', hotkey: 'T' },
  { tool: 'green', label: 'Green', hotkey: 'G' },
  { tool: 'cup', label: 'Cup', hotkey: 'H' },
  { tool: 'fairway', label: 'Fairway', hotkey: 'F' },
  { tool: 'sand', label: 'Sand', hotkey: 'S' },
  { tool: 'water', label: 'Water', hotkey: 'W' },
  { tool: 'wall', label: 'Wall', hotkey: 'B' },
  { tool: 'tree', label: 'Tree', hotkey: '1-5' },
];

const treeTypes: TreeType[] = ['pine', 'oak', 'palm', 'birch', 'cypress'];
const shapePresets: Array<{ value: ShapePreset; label: string }> = [
  { value: 'rectangle', label: 'Rect' },
  { value: 'circle', label: 'Circle' },
  { value: 'oval', label: 'Oval' },
  { value: 'squircle', label: 'Squirkle' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'capsule', label: 'Capsule' },
];

interface ToolbarProps {
  activeTool: ToolType;
  activeTreeType: TreeType;
  activeShapePreset: ShapePreset;
  onToolChange: (tool: ToolType) => void;
  onTreeTypeChange: (tree: TreeType) => void;
  onShapePresetChange: (preset: ShapePreset) => void;
}

export default function Toolbar({
  activeTool,
  activeTreeType,
  activeShapePreset,
  onToolChange,
  onTreeTypeChange,
  onShapePresetChange,
}: ToolbarProps) {
  return (
    <aside className="w-24 shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col items-center py-2 gap-2">
      {toolButtons.map((item) => {
        const active = item.tool === activeTool;
        return (
          <button
            key={item.tool}
            type="button"
            title={`${item.tool} (${item.hotkey})`}
            className={`h-14 w-20 rounded-md border text-[11px] font-semibold transition-colors ${
              active
                ? 'bg-green-600 border-green-500 text-white'
                : 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600'
            }`}
            onClick={() => onToolChange(item.tool)}
          >
            <div className="leading-tight">{item.label}</div>
            <div className="text-[10px] text-gray-300">{item.hotkey}</div>
          </button>
        );
      })}

      <div className="mt-1 w-full px-1 space-y-2">
        <div>
          <label className="text-[10px] text-gray-300 block mb-1 text-center">Shape</label>
          <select
            value={activeShapePreset}
            className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded text-[11px] p-1"
            onChange={(e) => onShapePresetChange(e.target.value as ShapePreset)}
          >
            {shapePresets.map((shape) => (
              <option key={shape.value} value={shape.value}>
                {shape.label}
              </option>
            ))}
          </select>
        </div>
        <div>
        <label className="text-[10px] text-gray-300 block mb-1 text-center">Tree</label>
        <select
          value={activeTreeType}
          className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded text-[11px] p-1"
          onChange={(e) => {
            onTreeTypeChange(e.target.value as TreeType);
            onToolChange('tree');
          }}
        >
          {treeTypes.map((tree, idx) => (
            <option key={tree} value={tree}>
              {idx + 1}: {tree}
            </option>
          ))}
        </select>
        </div>
      </div>
    </aside>
  );
}
