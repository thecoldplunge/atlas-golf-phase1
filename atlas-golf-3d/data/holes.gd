extends Node
## Course layout — ported from HOLES[] in the JS build. Each hole is
## a collection of surface shapes (circles / polygons / rects) plus
## tee and flag locations in tile units (1 tile = 10 yards). When a
## hole loads, hole.gd translates these into 3D voxel/mesh geometry.
##
## The shape format mirrors the JS one to keep the port 1:1.

const HOLES := [
	{
		"name": "Hole 1",
		"par": 3,
		"width": 20,
		"height": 30,
		"tee":  { "x": 10, "y": 25 },
		"flag": { "x": 10, "y": 4 },
		"green_slope": { "angle": 0.0, "mag": 0.0 },
		"surfaces": [
			{ "type": "rough",   "shape": { "kind": "rect",    "x": 0, "y": 0, "w": 20, "h": 30 } },
			{ "type": "fairway", "shape": { "kind": "rect",    "x": 6, "y": 6, "w": 8,  "h": 18 } },
			{ "type": "tee",     "shape": { "kind": "rect",    "x": 8, "y": 24, "w": 4, "h": 3 } },
			{ "type": "green",   "shape": { "kind": "circle",  "cx": 10, "cy": 4, "r": 3.5 } },
			{ "type": "sand",    "shape": { "kind": "circle",  "cx": 7,  "cy": 2, "r": 1.2 } },
		],
		"trees": [
			{ "x": 4, "y": 12 }, { "x": 16, "y": 12 },
			{ "x": 3, "y": 18 }, { "x": 17, "y": 18 },
		],
	},
	{
		"name": "Hole 2",
		"par": 4,
		"width": 24,
		"height": 48,
		"tee":  { "x": 4,  "y": 44 },
		"flag": { "x": 20, "y": 4 },
		"green_slope": { "angle": 0.3, "mag": 4.0 },
		"surfaces": [
			{ "type": "rough",   "shape": { "kind": "rect", "x": 0,  "y": 0,  "w": 24, "h": 48 } },
			{ "type": "fairway", "shape": { "kind": "polygon", "points": [[3,42],[9,42],[14,30],[18,18],[22,8],[22,3],[18,3],[16,8],[12,18],[8,30],[4,38]] } },
			{ "type": "water",   "shape": { "kind": "rect", "x": 0,  "y": 4,  "w": 14, "h": 20 } },
			{ "type": "tee",     "shape": { "kind": "rect", "x": 3,  "y": 43, "w": 3, "h": 3 } },
			{ "type": "green",   "shape": { "kind": "circle", "cx": 20, "cy": 4, "r": 3.0 } },
			{ "type": "sand",    "shape": { "kind": "circle", "cx": 22, "cy": 6, "r": 1.5 } },
		],
		"trees": [
			{ "x": 2, "y": 40 }, { "x": 10, "y": 44 }, { "x": 18, "y": 14 }, { "x": 20, "y": 10 },
		],
	},
	{
		"name": "Hole 3",
		"par": 5,
		"width": 30,
		"height": 56,
		"tee":  { "x": 4,  "y": 52 },
		"flag": { "x": 24, "y": 4 },
		"green_slope": { "angle": -0.4, "mag": 5.0 },
		"surfaces": [
			{ "type": "rough",   "shape": { "kind": "rect", "x": 0, "y": 0, "w": 30, "h": 56 } },
			{ "type": "fairway", "shape": { "kind": "polygon", "points": [[3,50],[10,50],[14,40],[22,30],[26,18],[28,8],[28,3],[22,3],[20,8],[18,18],[10,30],[6,40]] } },
			{ "type": "tee",     "shape": { "kind": "rect", "x": 3, "y": 51, "w": 3, "h": 3 } },
			{ "type": "green",   "shape": { "kind": "circle", "cx": 24, "cy": 4, "r": 3.2 } },
			{ "type": "sand",    "shape": { "kind": "circle", "cx": 22, "cy": 10, "r": 1.4 } },
			{ "type": "sand",    "shape": { "kind": "circle", "cx": 14, "cy": 34, "r": 1.0 } },
		],
		"trees": [
			{ "x": 2, "y": 48 }, { "x": 12, "y": 42 }, { "x": 24, "y": 22 }, { "x": 26, "y": 8 },
			{ "x": 4,  "y": 28 }, { "x": 16, "y": 20 },
		],
	},
]

func load_hole(idx: int) -> Dictionary:
	return HOLES[clamp(idx, 0, HOLES.size() - 1)]
