import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, {
  Path as SvgPath,
  G as SvgG,
  Defs as SvgDefs,
  Pattern as SvgPattern,
  Rect as SvgRect,
  Circle as SvgCircle,
  Ellipse as SvgEllipse,
  Line as SvgLine,
} from 'react-native-svg';
// Source of truth lives inside designer/ (it must — Vercel Root Directory
// for the designer Vercel project is `designer/` and can't see above it).
// The game reaches in for the same file so both renderers stay in sync.
import { SURFACE_COLORS, PATTERNS, TREES, GENERIC_TREE } from './designer/shared/theme';
import GolfStoryScreen from './GolfStory/GolfStoryScreen';
import testCourseData from './courses/test-course.json';
import test2CourseData from './courses/test-2.json';
import test4CourseData from './courses/test-4.json';
import myCourseData from './courses/my-course.json';
const TEST_COURSE_HOLES = testCourseData.holes;
const TEST2_COURSE_HOLES = test2CourseData.holes;
const TEST4_COURSE_HOLES = test4CourseData.holes;
const MY_COURSE_HOLES = myCourseData.holes;

// ---- Vector path helpers (for rendering designer-exported editorVectors) ----
// Each PathPoint is { x, y, inX, inY, outX, outY } where inX/inY is the
// incoming handle and outX/outY is the outgoing handle. Convert an array
// of such points (closed loop) into an SVG cubic-bezier "d" string.
const pointsToSvgD = (points) => {
  if (!Array.isArray(points) || points.length < 2) return '';
  const p0 = points[0];
  let d = `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const p = points[i];
    d += ` C ${prev.outX.toFixed(2)} ${prev.outY.toFixed(2)}, ${p.inX.toFixed(2)} ${p.inY.toFixed(2)}, ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  const first = points[0];
  d += ` C ${last.outX.toFixed(2)} ${last.outY.toFixed(2)}, ${first.inX.toFixed(2)} ${first.inY.toFixed(2)}, ${first.x.toFixed(2)} ${first.y.toFixed(2)} Z`;
  return d;
};

// Expand a closed vector path outward from its centroid by `px` world units.
// Used for the green fringe (a wider halo outside the putting surface).
const expandPointsFromCentroid = (points, px) => {
  if (!Array.isArray(points) || points.length === 0) return points;
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  cx /= points.length; cy /= points.length;
  const grow = (ax, ay) => {
    const dx = ax - cx, dy = ay - cy;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return { x: ax, y: ay };
    const s = (d + px) / d;
    return { x: cx + dx * s, y: cy + dy * s };
  };
  return points.map((p) => {
    const a = grow(p.x, p.y);
    const ip = grow(p.inX, p.inY);
    const op = grow(p.outX, p.outY);
    return { x: a.x, y: a.y, inX: ip.x, inY: ip.y, outX: op.x, outY: op.y };
  });
};

// ---- SVG pattern definitions built from designer/shared/theme.js specs -----
// Each pattern in PATTERNS is { size, base, rotation?, overlays: [{ kind, ... }] }.
// Both renderers consume the same spec — this produces <pattern> children
// that match the designer canvas exactly.
const PATTERN_ID = {
  rough: 'pat-rough',
  fairway: 'pat-fairway',
  fringe: 'pat-fringe',
  green: 'pat-green',
  sand: 'pat-sand',
  water: 'pat-water',
  deepRough: 'pat-deepRough',
  desert: 'pat-desert',
};

const renderPatternChildren = (spec) => {
  const children = [
    <SvgRect key="base" x={0} y={0} width={spec.size} height={spec.size} fill={spec.base} />,
  ];
  const overlays = Array.isArray(spec.overlays) ? spec.overlays : [];
  for (let i = 0; i < overlays.length; i++) {
    const ov = overlays[i];
    if (ov.kind === 'rect') {
      children.push(
        <SvgRect
          key={`r-${i}`}
          x={ov.x}
          y={ov.y}
          width={ov.w}
          height={ov.h}
          fill={ov.fill}
        />,
      );
    } else if (ov.kind === 'circle') {
      children.push(
        <SvgCircle key={`c-${i}`} cx={ov.cx} cy={ov.cy} r={ov.r} fill={ov.fill} />,
      );
    } else if (ov.kind === 'line') {
      children.push(
        <SvgLine
          key={`l-${i}`}
          x1={ov.x1}
          y1={ov.y1}
          x2={ov.x2}
          y2={ov.y2}
          stroke={ov.stroke}
          strokeWidth={ov.strokeWidth || 1}
        />,
      );
    }
  }
  return children;
};

// Build <pattern> definitions for every surface. Lives in a single <Defs>.
const renderPatternDefs = () => (
  <SvgDefs>
    {Object.entries(PATTERNS).map(([key, spec]) => (
      <SvgPattern
        key={key}
        id={PATTERN_ID[key]}
        x={0}
        y={0}
        width={spec.size}
        height={spec.size}
        patternUnits="userSpaceOnUse"
        patternTransform={spec.rotation ? `rotate(${spec.rotation})` : undefined}
      >
        {renderPatternChildren(spec)}
      </SvgPattern>
    ))}
  </SvgDefs>
);

// ---- Tree rendering (species-aware, matches designer drawTree exactly) ----
//
// New schema: TREES[look] = { halfWidth, primitives[] }. Each primitive is in
// native (gallery) units; we scale by `scale = r / halfWidth` where r is the
// obstacle's hit radius. This keeps sprite size proportional to the authored
// tree regardless of obstacle.r.
//
// Primitives: circle, ellipse, rect, triangle (with optional `outline: true`).
const OUTLINE_STROKE = '#2a1f1a';
const OUTLINE_WIDTH = 1.2;

const renderTreePrims = (x, y, r, look) => {
  const tree = TREES[look] || GENERIC_TREE;
  const prims = Array.isArray(tree) ? tree : tree.primitives || [];
  const halfWidth = Array.isArray(tree) ? 1 : tree.halfWidth || 1;
  const scale = r / halfWidth;
  const children = [];
  const sx = (v) => x + v * scale;
  const sy = (v) => y + v * scale;
  const strokeProps = (p) =>
    p.outline
      ? { stroke: OUTLINE_STROKE, strokeWidth: OUTLINE_WIDTH * scale, strokeLinejoin: 'round' }
      : {};

  for (let i = 0; i < prims.length; i++) {
    const p = prims[i];
    if (p.kind === 'circle') {
      children.push(
        <SvgCircle
          key={`c${i}`}
          cx={sx(p.cx != null ? p.cx : (p.dx || 0) * halfWidth)}
          cy={sy(p.cy != null ? p.cy : (p.dy || 0) * halfWidth)}
          r={(p.r || 0) * scale}
          fill={p.fill || 'none'}
          {...strokeProps(p)}
        />,
      );
    } else if (p.kind === 'ellipse') {
      const cx = sx(p.cx || 0);
      const cy = sy(p.cy || 0);
      const rxPx = (p.rx || 0) * scale;
      const ryPx = (p.ry || 0) * scale;
      children.push(
        <SvgEllipse
          key={`e${i}`}
          cx={cx}
          cy={cy}
          rx={rxPx}
          ry={ryPx}
          fill={p.fill || 'none'}
          {...strokeProps(p)}
          transform={p.rotation ? `rotate(${p.rotation} ${cx} ${cy})` : undefined}
        />,
      );
    } else if (p.kind === 'rect') {
      children.push(
        <SvgRect
          key={`r${i}`}
          x={sx(p.x || 0)}
          y={sy(p.y || 0)}
          width={(p.w || 0) * scale}
          height={(p.h || 0) * scale}
          fill={p.fill || 'none'}
          {...strokeProps(p)}
        />,
      );
    } else if (p.kind === 'triangle') {
      const pts = (p.points || [])
        .map((pt) => `${sx(pt[0])},${sy(pt[1])}`)
        .join(' ');
      children.push(
        <SvgPath
          key={`t${i}`}
          d={`M ${pts.split(' ').join(' L ')} Z`}
          fill={p.fill || 'none'}
          {...strokeProps(p)}
        />,
      );
    } else if (p.kind === 'circleStroke') {
      // Legacy: outlined ring (birch's old treatment). Still supported.
      children.push(
        <SvgCircle
          key={`cs${i}`}
          cx={sx((p.dx || 0) * halfWidth)}
          cy={sy((p.dy || 0) * halfWidth)}
          r={(p.r || 0) * scale}
          fill="none"
          stroke={p.stroke}
          strokeWidth={(p.strokeWidth || 1) * scale}
        />,
      );
    } else if (p.kind === 'ellipseFan') {
      // Legacy: kept for compatibility with older theme shapes.
      const { count, orbitR, rx, ry, fill } = p;
      for (let j = 0; j < count; j++) {
        const a = (j / count) * Math.PI * 2;
        const cx = x + Math.cos(a) * orbitR * halfWidth * scale;
        const cy = y + Math.sin(a) * orbitR * halfWidth * scale;
        const deg = (a * 180) / Math.PI;
        children.push(
          <SvgEllipse
            key={`ef${i}-${j}`}
            cx={cx}
            cy={cy}
            rx={rx * halfWidth * scale}
            ry={ry * halfWidth * scale}
            fill={fill}
            transform={`rotate(${deg} ${cx} ${cy})`}
          />,
        );
      }
    }
  }
  return children;
};

// All holes are centered in a 700x700 region of the world starting at offset (170, 200)
// This gives ~170 units of rough on left/right and ~200+ units top/bottom
const H_OFF_X = 170;
const H_OFF_Y = 200;
const HOLES = [
  {
    id: 1,
    name: 'Pine Meadow',
    par: 4,
    ballStart: { x: H_OFF_X + 100, y: H_OFF_Y + 296 },
    cup: { x: H_OFF_X + 156, y: H_OFF_Y + 36 },
    terrain: {
      tee: { x: H_OFF_X + 86, y: H_OFF_Y + 288, w: 28, h: 20, r: 8 },
      fairway: [
        { x: H_OFF_X + 78, y: H_OFF_Y + 204, w: 44, h: 100, r: 24 },
        { x: H_OFF_X + 86, y: H_OFF_Y + 124, w: 60, h: 104, r: 28 },
        { x: H_OFF_X + 116, y: H_OFF_Y + 56, w: 48, h: 84, r: 24 }
      ],
      green: { x: H_OFF_X + 134, y: H_OFF_Y + 14, w: 48, h: 52, r: 26 }
    },
    slopes: [
      { cx: 0.34, cy: 0.32, strength: 0.54, dir: 'SE' },
      { cx: 0.64, cy: 0.7, strength: 0.42, dir: 'E' }
    ],
    obstacles: [
      { type: 'circle', x: H_OFF_X + 54, y: H_OFF_Y + 216, r: 10, look: 'tree' },
      { type: 'circle', x: H_OFF_X + 144, y: H_OFF_Y + 190, r: 10, look: 'tree' },
      { type: 'circle', x: H_OFF_X + 60, y: H_OFF_Y + 130, r: 12, look: 'tree' }
    ],
    hazards: [
      { type: 'sandRect', x: H_OFF_X + 122, y: H_OFF_Y + 34, w: 20, h: 16 },
      { type: 'sandRect', x: H_OFF_X + 168, y: H_OFF_Y + 40, w: 20, h: 16 }
    ]
  },
  {
    id: 2,
    name: 'Split Gate',
    par: 3,
    ballStart: { x: H_OFF_X + 100, y: H_OFF_Y + 300 },
    cup: { x: H_OFF_X + 164, y: H_OFF_Y + 36 },
    terrain: {
      tee: { x: H_OFF_X + 88, y: H_OFF_Y + 292, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 84, y: H_OFF_Y + 208, w: 36, h: 100, r: 20 },
        { x: H_OFF_X + 120, y: H_OFF_Y + 60, w: 52, h: 160, r: 28 }
      ],
      green: { x: H_OFF_X + 140, y: H_OFF_Y + 12, w: 52, h: 52, r: 26 }
    },
    slopes: [
      { cx: 0.24, cy: 0.5, strength: 0.6, dir: 'E' },
      { cx: 0.7, cy: 0.34, strength: 0.36, dir: 'S' }
    ],
    obstacles: [
      { type: 'rect', x: H_OFF_X + 40, y: H_OFF_Y + 184, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 112, w: 116, h: 16 }
    ],
    hazards: [{ type: 'sandRect', x: H_OFF_X + 124, y: H_OFF_Y + 104, w: 60, h: 36 }]
  },
  {
    id: 3,
    name: 'Dogleg Drift',
    par: 4,
    ballStart: { x: H_OFF_X + 32, y: H_OFF_Y + 296 },
    cup: { x: H_OFF_X + 168, y: H_OFF_Y + 44 },
    terrain: {
      tee: { x: H_OFF_X + 20, y: H_OFF_Y + 288, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 16, y: H_OFF_Y + 220, w: 40, h: 88, r: 20 },
        { x: H_OFF_X + 28, y: H_OFF_Y + 136, w: 84, h: 100, r: 28 },
        { x: H_OFF_X + 112, y: H_OFF_Y + 60, w: 60, h: 96, r: 24 }
      ],
      green: { x: H_OFF_X + 144, y: H_OFF_Y + 20, w: 52, h: 52, r: 26 }
    },
    slopes: [
      { cx: 0.46, cy: 0.25, strength: 0.52, dir: 'SW' },
      { cx: 0.7, cy: 0.72, strength: 0.38, dir: 'W' }
    ],
    obstacles: [
      { type: 'rect', x: H_OFF_X + 48, y: H_OFF_Y + 220, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 32, y: H_OFF_Y + 128, w: 116, h: 16 },
      { type: 'circle', x: H_OFF_X + 144, y: H_OFF_Y + 184, r: 16 }
    ],
    hazards: [
      { type: 'waterRect', x: H_OFF_X + 0, y: H_OFF_Y + 172, w: 48, h: 36 },
      { type: 'sandRect', x: H_OFF_X + 116, y: H_OFF_Y + 96, w: 68, h: 32 }
    ]
  },
  {
    id: 4,
    name: 'Bumper Tunnel',
    par: 4,
    ballStart: { x: H_OFF_X + 24, y: H_OFF_Y + 300 },
    cup: { x: H_OFF_X + 176, y: H_OFF_Y + 28 },
    terrain: {
      tee: { x: H_OFF_X + 12, y: H_OFF_Y + 292, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 8, y: H_OFF_Y + 228, w: 40, h: 80, r: 20 },
        { x: H_OFF_X + 40, y: H_OFF_Y + 156, w: 72, h: 88, r: 28 },
        { x: H_OFF_X + 120, y: H_OFF_Y + 44, w: 60, h: 112, r: 24 }
      ],
      green: { x: H_OFF_X + 152, y: H_OFF_Y + 4, w: 48, h: 48, r: 24 }
    },
    slopes: [
      { cx: 0.3, cy: 0.28, strength: 0.5, dir: 'SE' },
      { cx: 0.74, cy: 0.62, strength: 0.44, dir: 'NW' }
    ],
    obstacles: [
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 212, w: 144, h: 16 },
      { type: 'rect', x: H_OFF_X + 56, y: H_OFF_Y + 140, w: 144, h: 16 },
      { type: 'circle', x: H_OFF_X + 76, y: H_OFF_Y + 92, r: 16 },
      { type: 'circle', x: H_OFF_X + 120, y: H_OFF_Y + 64, r: 14 }
    ],
    hazards: [
      { type: 'sandRect', x: H_OFF_X + 20, y: H_OFF_Y + 52, w: 48, h: 28 },
      { type: 'waterRect', x: H_OFF_X + 144, y: H_OFF_Y + 192, w: 56, h: 40 }
    ]
  },
  {
    id: 5,
    name: 'Mini Maze',
    par: 5,
    ballStart: { x: H_OFF_X + 16, y: H_OFF_Y + 296 },
    cup: { x: H_OFF_X + 184, y: H_OFF_Y + 20 },
    terrain: {
      tee: { x: H_OFF_X + 4, y: H_OFF_Y + 288, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 8, y: H_OFF_Y + 260, w: 32, h: 44, r: 16 },
        { x: H_OFF_X + 0, y: H_OFF_Y + 192, w: 36, h: 80, r: 20 },
        { x: H_OFF_X + 28, y: H_OFF_Y + 132, w: 56, h: 72, r: 24 },
        { x: H_OFF_X + 80, y: H_OFF_Y + 72, w: 60, h: 76, r: 24 },
        { x: H_OFF_X + 132, y: H_OFF_Y + 28, w: 56, h: 64, r: 24 }
      ],
      green: { x: H_OFF_X + 160, y: H_OFF_Y + 0, w: 48, h: 48, r: 24 }
    },
    slopes: [
      { cx: 0.28, cy: 0.36, strength: 0.58, dir: 'S' },
      { cx: 0.64, cy: 0.64, strength: 0.34, dir: 'NE' }
    ],
    obstacles: [
      { type: 'rect', x: H_OFF_X + 32, y: H_OFF_Y + 252, w: 128, h: 16 },
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 192, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 80, y: H_OFF_Y + 132, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 72, w: 128, h: 16 },
      { type: 'circle', x: H_OFF_X + 152, y: H_OFF_Y + 108, r: 14 },
      { type: 'circle', x: H_OFF_X + 52, y: H_OFF_Y + 36, r: 14 }
    ],
    hazards: [
      { type: 'waterRect', x: H_OFF_X + 128, y: H_OFF_Y + 224, w: 72, h: 32 },
      { type: 'waterRect', x: H_OFF_X + 0, y: H_OFF_Y + 96, w: 52, h: 28 },
      { type: 'sandRect', x: H_OFF_X + 140, y: H_OFF_Y + 44, w: 40, h: 28 }
    ]
  }
];

// Michael's Custom Course - imported from Course Designer
const MICHAELS_COURSE_HOLES = [
  {
    "id": 1,
    "name": "Hole 1",
    "par": 4,
    "ballStart": {
      "x": 80.41176470588235,
      "y": 139.2941176470588
    },
    "cup": {
      "x": 322.63114499879214,
      "y": 123.32402645560549
    },
    "terrain": {
      "tee": {
        "x": 70.41176470588235,
        "y": 132.2941176470588,
        "w": 20,
        "h": 14,
        "r": 3
      },
      "fairway": [
        {
          "x": 106.04290970467453,
          "y": 119.26520292619372,
          "w": 88.82352941176471,
          "h": 32.64705882352939,
          "r": 13.058823529411757
        }
      ],
      "green": {
        "x": 302.925262645851,
        "y": 104.50049704384077,
        "w": 40,
        "h": 40,
        "r": 10
      }
    },
    "slopes": [],
    "obstacles": [
      {
        "type": "rect",
        "x": 118.1017332340863,
        "y": 152.50049704384077,
        "w": 19.117647058823522,
        "h": 13.235294117647044
      },
      {
        "type": "rect",
        "x": 104.27820382232159,
        "y": 115.44167351442901,
        "w": 17.352941176470594,
        "h": 14.411764705882362
      },
      {
        "type": "circle",
        "x": 145.4546744105569,
        "y": 159.2652029261937,
        "r": 14,
        "look": "pine"
      },
      {
        "type": "circle",
        "x": 197.51349793996866,
        "y": 126.91226174972313,
        "r": 16,
        "look": "oak"
      },
      {
        "type": "circle",
        "x": 174.5723214693804,
        "y": 107.79461469089959,
        "r": 13,
        "look": "palm"
      },
      {
        "type": "circle",
        "x": 107.51349793996864,
        "y": 156.91226174972311,
        "r": 13,
        "look": "palm"
      },
      {
        "type": "circle",
        "x": 190.4546744105569,
        "y": 164.85343822031135,
        "r": 13,
        "look": "palm"
      },
      {
        "type": "circle",
        "x": 183.39585088114512,
        "y": 171.32402645560546,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 129.5723214693804,
        "y": 177.20637939678193,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 102.21938029290982,
        "y": 177.79461469089958,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 95.7487920576157,
        "y": 153.38284998501723,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 132.21938029290982,
        "y": 110.73579116148784,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 148.68996852820393,
        "y": 108.67696763207607,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 169.86643911643924,
        "y": 108.67696763207607,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 240,
        "y": 185,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 220,
        "y": 185,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 220,
        "y": 205,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 205,
        "y": 205,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 205,
        "y": 195,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 210,
        "y": 180,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 365,
        "y": 190,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 510,
        "y": 0,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 475,
        "y": 50,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 412.3499807666048,
        "y": 45.10871555167529,
        "r": 12,
        "look": "cypress"
      }
    ],
    "hazards": [
      {
        "type": "sandRect",
        "x": 152.73576587850377,
        "y": 142.13452968825825,
        "w": 28.967228828812093,
        "h": 28.967228828812093
      },
      {
        "type": "waterRect",
        "x": 113.68996852820393,
        "y": 115.73579116148784,
        "w": 92.64705882352942,
        "h": 6.17647058823529
      },
      {
        "type": "waterRect",
        "x": 206.33702735173335,
        "y": 103.08873233795842,
        "w": 7.941176470588232,
        "h": 60.588235294117624
      }
    ]
  },
  {
    "id": 2,
    "name": "Hole 2",
    "par": 5,
    "ballStart": {
      "x": 280,
      "y": 487
    },
    "cup": {
      "x": 319.96386682583443,
      "y": 124.01738941329063
    },
    "terrain": {
      "tee": {
        "x": 270,
        "y": 480,
        "w": 20,
        "h": 14,
        "r": 3
      },
      "fairway": [],
      "green": {
        "x": 302,
        "y": 103,
        "w": 40,
        "h": 40,
        "r": 10
      }
    },
    "slopes": [
      {
        "cx": 0.6986064745674397,
        "cy": 0.6923465000381519,
        "strength": 0.35,
        "dir": "N"
      },
      {
        "cx": 0.20534667064586073,
        "cy": 0.6629347353322658,
        "strength": 0.35,
        "dir": "N"
      }
    ],
    "obstacles": [],
    "hazards": []
  },
  {
    "id": 3,
    "name": "Hole 3",
    "par": 3,
    "ballStart": {
      "x": 320.21386682583443,
      "y": 159.51738941329063
    },
    "cup": {
      "x": 359.96386682583443,
      "y": 383.01738941329063
    },
    "terrain": {
      "tee": {
        "x": 310.21386682583443,
        "y": 152.51738941329063,
        "w": 20,
        "h": 14,
        "r": 3
      },
      "fairway": [
        {
          "x": 218.21386682583443,
          "y": 249.51738941329063,
          "w": 158,
          "h": 21,
          "r": 8.4
        },
        {
          "x": 307.21386682583443,
          "y": 200.51738941329063,
          "w": 28,
          "h": 90,
          "r": 11.200000000000001
        },
        {
          "x": 301.21386682583443,
          "y": 234.51738941329063,
          "w": 73,
          "h": 70,
          "r": 28
        },
        {
          "x": 345.21386682583443,
          "y": 213.51738941329063,
          "w": 29,
          "h": 54,
          "r": 11.600000000000001
        },
        {
          "x": 362.21386682583443,
          "y": 295.51738941329063,
          "w": 6,
          "h": 42,
          "r": 2.4000000000000004
        },
        {
          "x": 303.21386682583443,
          "y": 278.51738941329063,
          "w": 37,
          "h": 61,
          "r": 14.8
        }
      ],
      "green": {
        "x": 340.21386682583443,
        "y": 359.51738941329063,
        "w": 40,
        "h": 40,
        "r": 10
      }
    },
    "slopes": [
      {
        "cx": 0.85,
        "cy": 0.575,
        "strength": 0.98,
        "dir": "E"
      }
    ],
    "obstacles": [
      {
        "type": "rect",
        "x": 274.21386682583443,
        "y": 354.51738941329063,
        "w": 32,
        "h": 70
      },
      {
        "type": "rect",
        "x": 157.21386682583443,
        "y": 351.51738941329063,
        "w": 92,
        "h": 79
      },
      {
        "type": "circle",
        "x": 256.21386682583443,
        "y": 440.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 332.21386682583443,
        "y": 435.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 388.21386682583443,
        "y": 423.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 415.21386682583443,
        "y": 396.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 444.21386682583443,
        "y": 324.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 433.21386682583443,
        "y": 278.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 421.21386682583443,
        "y": 244.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 350.21386682583443,
        "y": 279.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 233.21386682583443,
        "y": 282.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 197.21386682583443,
        "y": 327.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 242.21386682583443,
        "y": 330.51738941329063,
        "r": 10,
        "look": "birch"
      }
    ],
    "hazards": [
      {
        "type": "sandRect",
        "x": 238.16261844630117,
        "y": 256.46614103375737,
        "w": 78.10249675906655,
        "h": 78.10249675906655
      },
      {
        "type": "sandRect",
        "x": 372.86863176597694,
        "y": 284.17215435343314,
        "w": 46.690470119715,
        "h": 46.690470119715
      },
      {
        "type": "sandRect",
        "x": 361.5805591730505,
        "y": 224.8840817605067,
        "w": 43.266615305567875,
        "h": 43.266615305567875
      },
      {
        "type": "sandRect",
        "x": 296.627638377567,
        "y": 175.9311609650232,
        "w": 55.17245689653488,
        "h": 55.17245689653488
      },
      {
        "type": "sandRect",
        "x": 231.96505732902105,
        "y": 205.26857991647725,
        "w": 52.49761899362675,
        "h": 52.49761899362675
      },
      {
        "type": "sandRect",
        "x": 257.19871878739605,
        "y": 300.50224137485225,
        "w": 66.03029607687671,
        "h": 66.03029607687671
      },
      {
        "type": "sandRect",
        "x": 294.21386682583443,
        "y": 345.51738941329063,
        "w": 30,
        "h": 30
      },
      {
        "type": "waterRect",
        "x": 307.21386682583443,
        "y": 332.51738941329063,
        "w": 29,
        "h": 81
      },
      {
        "type": "waterRect",
        "x": 340.21386682583443,
        "y": 328.51738941329063,
        "w": 79,
        "h": 24
      },
      {
        "type": "waterRect",
        "x": 318.21386682583443,
        "y": 327.51738941329063,
        "w": 111,
        "h": 28
      }
    ]
  }
];

const BACKSTORY_PARAGRAPHS = [
  'In the year 2155, humanity reached the stars — and brought golf with them.',
  'But Earth is proud, and conflicted, about its Tour players. Funding is limited. Public support is passionate, but fickle. And there\'s an ongoing cultural debate: should humanity\'s best and brightest be chasing a ball across alien worlds... or solving problems at home?',
  'The last human to reach the final round of The Keldaran Masters — Joaquin Reyes — retired mid-tournament in 2184. Under mysterious circumstances. His Tour file is sealed. His caddie hasn\'t spoken publicly since.',
  'Tensions are rising across the galaxy. A Paxi player named Thresh has accused the Voss Hegemony of engineering their gravity-adapted clubs to exploit a loophole in equipment regulations. The Tour council is investigating.',
  'On Nyx-4 — a dead moon in the Keldaran system — there\'s a decommissioned course. It was removed from Tour certification after three players disappeared during a practice round. Locals say the terrain shifts.',
  'FoldRight, the largest fold-transit corporation, is dangling a record-breaking sponsorship deal. The first human to win a Major this season gets the prize. The catch? Exclusive travel rights. They control where you compete — and when.',
  'The Rill Consortium has never lost The Rill Invitational on home ice. Nobody beats a Rill in the cold. Seven species have tried. The streak is forty-one years running.',
  'Meanwhile, somewhere on Aeris Station, a black-market fabricator claims to possess a prototype putter — forged from compressed neutron-star alloy. Almost certainly illegal. And supposedly... the most precise instrument ever built.',
  'Earth\'s Sol Classic is considered the weakest of the four Majors — at least by alien pundits — who find the single-gravity, oxygen-atmosphere conditions "quaint." Human fans take this personally. The atmosphere at the Sol Classic is the most hostile in professional golf. Not because of the course. Because of the crowd.',
  'Fold-lag — the neurological side effect of repeated space compression — is an open secret on Tour. Long-haul players develop micro-tremors. Depth perception drift. And what caddies call "the yips between stars." There is no official treatment. The Tour does not acknowledge it exists.',
  'Every fifty years, the Neutral Compact allows a provisional course from a non-signatory world to host an exhibition major. The next window opens this season. Three uncontacted civilizations have submitted bids. Nobody knows what their courses look like. Nobody knows what they look like.',
  'Your Tour begins now. Good luck out there, player.'
];

const DRIVING_RANGE_HOLES = [
  {
    id: 1,
    name: 'Driving Range',
    par: 0,
    isRange: true,
    ballStart: { x: H_OFF_X + 130, y: H_OFF_Y + 760 },
    cup: { x: H_OFF_X + 130, y: H_OFF_Y + 30 },
    terrain: {
      tee: { x: H_OFF_X + 114, y: H_OFF_Y + 750, w: 32, h: 20, r: 8 },
      fairway: [
        { x: H_OFF_X + 60, y: H_OFF_Y + 40, w: 140, h: 720, r: 18 }
      ],
      green: { x: H_OFF_X + 120, y: H_OFF_Y + 20, w: 20, h: 20, r: 10 }
    },
    slopes: [],
    obstacles: [],
    hazards: [],
    rangeMarkers: [50, 100, 150, 200, 250, 300]
  }
];

const COURSES = [
  {
    id: 'pine-valley',
    name: 'Pine Valley',
    designer: 'Atlas',
    holes: HOLES,
    description: '5 holes • Par 20',
    difficulty: 'Medium'
  },
  {
    id: 'michaels-course',
    name: "Michael's Course",
    designer: 'Michael',
    holes: MICHAELS_COURSE_HOLES,
    description: '3 holes • Par 12',
    difficulty: 'Hard'
  },
  {
    id: 'test-course',
    name: 'Test Course',
    designer: 'Mike G',
    holes: TEST_COURSE_HOLES,
    description: '3 holes • Par 12 • AI-generated',
    difficulty: 'Hard'
  },
  {
    id: 'test-2',
    name: 'Test 2',
    designer: 'Mike G',
    holes: TEST2_COURSE_HOLES,
    description: '3 holes • Par 12 • AI-generated v2',
    difficulty: 'Hard'
  },
  {
    id: 'test-4',
    name: 'Test 4',
    designer: 'Mike G',
    holes: TEST4_COURSE_HOLES,
    description: '3 holes • Par 12 • AI-generated v4',
    difficulty: 'Hard'
  },
  {
    id: 'my-course',
    name: myCourseData.courseName || 'My Course',
    designer: myCourseData.designer || 'Designer',
    holes: MY_COURSE_HOLES,
    description: `${MY_COURSE_HOLES.length} hole${MY_COURSE_HOLES.length === 1 ? '' : 's'} • Par ${MY_COURSE_HOLES.reduce((s, h) => s + (h.par || 0), 0)}`,
    difficulty: 'Custom'
  },
  {
    id: 'driving-range',
    name: 'Driving Range',
    designer: 'Atlas',
    holes: DRIVING_RANGE_HOLES,
    description: 'Practice • No wind • Unlimited shots',
    difficulty: 'Practice'
  }
];

// World playfield is 30% larger than the 1040x1100 course layout so every
// hole has breathing room around the edges (camera can pan past the
// tree/fairway bounds without running into a hard wall right at the shoulder
// of the course).
const WORLD = { w: 1352, h: 1430 };
const CAMERA_ZOOM = 3.2;
// Discrete zoom steps applied on top of CAMERA_ZOOM. 1.0x matches the prior
// default; 0.4x gives a near-full-hole overview; 2.4x is tight-to-the-ball.
// Resets to the default at every new shot; putting-mode default is one notch
// tighter so the player can read the line more precisely.
const ZOOM_STEPS = [0.4, 0.6, 1.0, 1.4, 1.8, 2.4];
const DEFAULT_ZOOM_INDEX = 2; // 1.0x
const PUTTING_ZOOM_INDEX = 5; // 2.4x — max zoom for short putts
const IS_WEB = Platform.OS === 'web';
const MANUAL_PAN_GRACE_MS = 2200;
const BALL_RADIUS_WORLD = 2.4;
const CUP_RADIUS_WORLD = 2.0;
const SHOT_PAD_SIZE = 184;
const PAD_CENTER = SHOT_PAD_SIZE / 2;
const SHOT_PAD_RADIUS = 78;
const SPIN_DOT_RADIUS = 16;
const MAX_SPIN_OFFSET = SHOT_PAD_RADIUS - SPIN_DOT_RADIUS - 10;
const YARDS_PER_WORLD = 1.3;
const AIM_DOT_STEP_WORLD = 3.6;
const PREVIEW_FRICTION = 2.1;
const STOP_SPEED = 6;
const GRAVITY = 30;
const GROUND_EPSILON = 0.05;
// Widened from 8 → 14 so balls just off the visible green (where the
// bezier edge bulges past the underlying rect/polygon) still read as
// fringe instead of dropping straight to rough.
const FRINGE_BUFFER = 14;
const MIN_BOUNCE_VZ = 3.2;
const PHYSICS_CONFIG = {
  speedScale: 1,
  launchScale: 1,
  gravity: 0.028,
  airDrag: 0.14,
  // Dropped from 0.35 → 0.20: restoring the old (higher) ball flight meant
  // shots spent more time in the air again, and wind at 0.35 was dragging
  // them off line much harder than before. 0.20 puts drift back to a level
  // that tells the player to aim the wind without punishing every shot.
  windForceScale: 0.10,
  apexHangFactor: 1,
  curveForce: 1.35,
  curveLaunchBlend: 1.15,
  sideSpinCap: 0.65,
  sideSpinDecay: 0.018,
  previewCurveMultiplier: 1,
  pushPullInfluence: 40,
  lieMissAmplification: 1,
  fairwayFriction: 3.3,
  roughFriction: 4.2,
  deepRoughFriction: 7,
  sandFriction: 6.5,
  greenFriction: 2.3,
  fairwayBounce: 0.24,
  roughBounce: 0.18,
  sandBounce: 0.1,
  fairwayLandingDamping: 0.8,
  roughLandingDamping: 0.72,
  sandLandingDamping: 0.54,
  rolloutScale: 1,
  backswingPowerCurve: 0.8,
  tempoPerfectMinMs: 50,
  tempoPerfectMaxMs: 80,
  straightnessSensitivity: 60,
  overpowerPenalty: 1.24,
  mishitSeverity: 1,
  clubForgivenessScale: 1,
  puttLaunchScale: 2.8,
  chipRolloutScale: 1,
  greenSlopeInfluence: 4,
  lineSampleCount: 16,
  lineSmoothing: 0.95,
  previewLiveCalibration: 1,
};
const CURVE_FORCE = PHYSICS_CONFIG.curveForce;
const CURVE_LAUNCH_BLEND = PHYSICS_CONFIG.curveLaunchBlend;
// Magnus-style curve tuning. CURVE_STRENGTH scales the per-tick sideways
// acceleration perpendicular to the ball's current velocity. Ball
// deflection grows progressively during flight — straight at launch,
// banana out to a max side-distance near landing.
// Tuned against the driver reference shot: max slice (spinNorm=±1) lands
// ~42yd side, power fade ~26yd, slight fade ~9yd.
const CURVE_STRENGTH = 0.30;
const CURVE_SPIN_DECAY_PER_SEC = 0.995;

// Haptic feedback: vibrate on Android/Chrome, audio tick on iOS Safari
const hapticBuzz = (pattern = 30) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(typeof pattern === 'number' ? pattern : pattern);
    return;
  }
  // Fallback: short audio tick via Web Audio API
  try {
    const ctx = window.__hapticAudioCtx || (window.__hapticAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 220;
    gain.gain.value = 0.15;
    osc.start();
    const dur = typeof pattern === 'number' ? pattern / 1000 : 0.03;
    osc.stop(ctx.currentTime + dur);
  } catch (e) { /* silent */ }
};
const hapticDoubleTap = () => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([20, 60, 20]);
    return;
  }
  try {
    const ctx = window.__hapticAudioCtx || (window.__hapticAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    const playTick = (delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 330;
      gain.gain.value = 0.15;
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.02);
    };
    playTick(0);
    playTick(0.08);
  } catch (e) { /* silent */ }
};
const SLOPE_FORCE = 7.5 * 0.6 * PHYSICS_CONFIG.greenSlopeInfluence;
const PUTT_PREVIEW_DT = 1 / 120;
const PUTT_PREVIEW_MAX_TICKS = 1400;
const PUTT_PREVIEW_SAMPLE_TICKS = 8;
const CLUBS = [
  { key: 'PT', name: 'Putter', short: 'PT', speed: 0.16, launch: 0.03, roll: 0.95, spin: 1.22, carryYards: 40 },
  { key: 'LW', name: 'Lob Wedge', short: 'LW', speed: 0.44, launch: 1.18, roll: 0.52, spin: 0.82, carryYards: 70 },
  { key: 'SW', name: 'Sand Wedge', short: 'SW', speed: 0.5, launch: 1.08, roll: 0.56, spin: 0.85, carryYards: 80 },
  { key: 'GW', name: 'Gap Wedge', short: 'GW', speed: 0.56, launch: 0.98, roll: 0.6, spin: 0.9, carryYards: 90 },
  { key: 'PW', name: 'Pitching Wedge', short: 'PW', speed: 0.64, launch: 0.9, roll: 0.66, spin: 0.93, carryYards: 105 },
  { key: '9I', name: '9 Iron', short: '9i', speed: 0.72, launch: 0.82, roll: 0.72, spin: 0.97, carryYards: 120 },
  { key: '8I', name: '8 Iron', short: '8i', speed: 0.8, launch: 0.76, roll: 0.78, spin: 1, carryYards: 130 },
  { key: '7I', name: '7 Iron', short: '7i', speed: 0.88, launch: 0.7, roll: 0.84, spin: 1.02, carryYards: 140 },
  { key: '6I', name: '6 Iron', short: '6i', speed: 0.96, launch: 0.65, roll: 0.9, spin: 1.04, carryYards: 150 },
  { key: '5I', name: '5 Iron', short: '5i', speed: 1.04, launch: 0.6, roll: 0.96, spin: 1.06, carryYards: 160 },
  { key: '4I', name: '4 Iron', short: '4i', speed: 1.12, launch: 0.56, roll: 1.02, spin: 1.08, carryYards: 170 },
  { key: '3I', name: '3 Iron', short: '3i', speed: 1.18, launch: 0.52, roll: 1.06, spin: 1.1, carryYards: 180 },
  { key: '7W', name: '7 Wood', short: '7w', speed: 1.08, launch: 0.62, roll: 0.98, spin: 1, carryYards: 190 },
  { key: '5W', name: '5 Wood', short: '5w', speed: 1.18, launch: 0.57, roll: 1.04, spin: 0.98, carryYards: 210 },
  { key: '3W', name: '3 Wood', short: '3w', speed: 1.3, launch: 0.5, roll: 1.1, spin: 0.96, carryYards: 225 },
  { key: 'DR', name: 'Driver', short: 'DR', speed: 1.46, launch: 0.46, roll: 1.16, spin: 0.92, carryYards: 250 }
];

// ═══════════════ GOLFER PROFILES ═══════════════
const GOLFER_AVATAR_PALETTES = {
  Human: { skin: '#f0c08c', hat: '#263246', shirt: '#3f76c1', pants: '#2e563c' },
  Voss: { skin: '#9aa6b2', hat: '#5b2c6f', shirt: '#7c3aed', pants: '#334155' },
  Rill: { skin: '#6ee7b7', hat: '#134e4a', shirt: '#0f766e', pants: '#164e63' },
  Paxi: { skin: '#f0abfc', hat: '#7e22ce', shirt: '#db2777', pants: '#4c1d95' },
  'Rill-Paxi Hybrid': { skin: '#a7f3d0', hat: '#831843', shirt: '#9333ea', pants: '#115e59' }
};

const IMPORTED_GOLFER_DATA = [
  {
    id: 'char-1',
    name: 'Brakka Voln',
    species: 'Voss',
    origin: 'Keldara-7 — Voss Hegemony',
    bio: 'A stocky young Voss monk-in-training whose swing is enormous, whose temper is worse, and whose \'serene enlightenment\' lasts exactly until he hits his first bunker.',
    power: 70,
    accuracy: 30,
    touch: 20,
    spinControl: 30,
    putting: 30,
    recovery: 40,
    focus: 30,
    composure: 30,
    courseManagement: 40
  },
  {
    id: 'char-2',
    name: 'Thraxa Gorr',
    species: 'Voss',
    origin: 'Keldara-7 — Voss Hegemony',
    bio: 'A proud second-generation Voss warrior-priestess whose breath-control rituals fail approximately every third hole, often in spectacular fashion.',
    power: 80,
    accuracy: 50,
    touch: 30,
    spinControl: 40,
    putting: 40,
    recovery: 50,
    focus: 50,
    composure: 40,
    courseManagement: 50
  },
  {
    id: 'char-3',
    name: 'Korran Dresh',
    species: 'Voss',
    origin: 'Keldara-7 — Voss Hegemony',
    bio: 'A grizzled Voss tour veteran who actually mastered his breathwork decades ago and only erupts about once a tournament — usually on the 18th when it matters most.',
    power: 90,
    accuracy: 60,
    touch: 50,
    spinControl: 60,
    putting: 60,
    recovery: 60,
    focus: 70,
    composure: 60,
    courseManagement: 70
  },
  {
    id: 'char-4',
    name: 'Vass Dremmok',
    species: 'Voss',
    origin: 'Keldara-7 — Voss Hegemony',
    bio: 'The reigning Keldaran Masters champion, a once-in-a-generation Voss whose meditation discipline is legendary and whose drives clear horizons without breaking his serene smile.',
    power: 100,
    accuracy: 80,
    touch: 70,
    spinControl: 80,
    putting: 80,
    recovery: 80,
    focus: 90,
    composure: 90,
    courseManagement: 90
  },
  {
    id: 'char-5',
    name: 'Nyss\'ara Vel',
    species: 'Rill',
    origin: 'Rillspire — Rill Consortium',
    bio: 'A skittish gecko rookie who sticks to walls when startled and can calculate a perfect approach shot but panics and camouflages every time a gallery shows up.',
    power: 20,
    accuracy: 60,
    touch: 50,
    spinControl: 50,
    putting: 60,
    recovery: 30,
    focus: 60,
    composure: 40,
    courseManagement: 50
  },
  {
    id: 'char-6',
    name: 'Threll Cyrin',
    species: 'Rill',
    origin: 'Rillspire — Rill Consortium',
    bio: 'A calm gecko journeyman with a famously mechanical swing, a tail that counterbalances every stroke, and a reputation for never missing a putt inside six feet.',
    power: 30,
    accuracy: 70,
    touch: 60,
    spinControl: 70,
    putting: 70,
    recovery: 50,
    focus: 70,
    composure: 60,
    courseManagement: 70
  },
  {
    id: 'char-7',
    name: 'Ys\'the Moran',
    species: 'Rill',
    origin: 'Rillspire — Rill Consortium',
    bio: 'A veteran non-binary Rill strategist whose camouflage-flecked scales read the green before their swing does, and who plays every hole like a chess problem they\'ve already solved.',
    power: 40,
    accuracy: 90,
    touch: 80,
    spinControl: 80,
    putting: 90,
    recovery: 60,
    focus: 80,
    composure: 70,
    courseManagement: 90
  },
  {
    id: 'char-8',
    name: 'Caerelith Nen\'vax',
    species: 'Rill',
    origin: 'Rillspire — Rill Consortium',
    bio: 'The cold, brilliant Rill grandmaster who holds the all-time Tour scoring record and whose scales never camouflage because her composure never wavers.',
    power: 50,
    accuracy: 100,
    touch: 90,
    spinControl: 100,
    putting: 100,
    recovery: 70,
    focus: 100,
    composure: 90,
    courseManagement: 100
  },
  {
    id: 'char-9',
    name: 'Avani Pel',
    species: 'Paxi',
    origin: 'Paxa Prime — Paxi Collective',
    bio: 'An eager young octopus-girl who reads the wind better than half the tour but overthinks every club selection while her tentacles nervously re-grip her bag.',
    power: 30,
    accuracy: 50,
    touch: 70,
    spinControl: 40,
    putting: 50,
    recovery: 40,
    focus: 50,
    composure: 40,
    courseManagement: 40
  },
  {
    id: 'char-10',
    name: 'Miri Thaen-Oss',
    species: 'Paxi',
    origin: 'Paxa Prime — Paxi Collective',
    bio: 'A quietly observant Paxi mid-tier pro whose chip shots seem to curl around obstacles, and who wears a soft hat on top of his mantle because he thinks it looks dignified.',
    power: 40,
    accuracy: 60,
    touch: 80,
    spinControl: 60,
    putting: 60,
    recovery: 60,
    focus: 60,
    composure: 50,
    courseManagement: 70
  },
  {
    id: 'char-11',
    name: 'Pael Orrin-Vax',
    species: 'Paxi',
    origin: 'Paxa Prime — Paxi Collective',
    bio: 'A soft-spoken Paxi elder whose tentacles move in slow meditative arcs, and who routinely carves impossible shots through crosswinds that ground the rest of the field.',
    power: 50,
    accuracy: 70,
    touch: 90,
    spinControl: 80,
    putting: 80,
    recovery: 70,
    focus: 80,
    composure: 70,
    courseManagement: 90
  },
  {
    id: 'char-12',
    name: 'Sira Vennai',
    species: 'Paxi',
    origin: 'Paxa Prime — Paxi Collective',
    bio: 'A legendary Paxi champion whose six tentacles move in impossibly coordinated precision and who is said to hear atmospheric shifts minutes before they arrive.',
    power: 60,
    accuracy: 90,
    touch: 100,
    spinControl: 100,
    putting: 90,
    recovery: 90,
    focus: 100,
    composure: 90,
    courseManagement: 100
  },
  {
    id: 'char-13',
    name: 'Danny Ochoa',
    species: 'Human',
    origin: 'Earth — Sol System',
    bio: 'A scrappy Earth-qualifier rookie who grinds out pars through sheer stubbornness and carries a tiny pet fold-hamster in his chest pocket for good luck.',
    power: 50,
    accuracy: 40,
    touch: 40,
    spinControl: 40,
    putting: 40,
    recovery: 50,
    focus: 40,
    composure: 60,
    courseManagement: 40
  },
  {
    id: 'char-14',
    name: 'Lena Kowalski',
    species: 'Human',
    origin: 'Earth — Sol System',
    bio: 'A mid-tier human pro with a metronome-steady game who loves putting, hates wind, and has exactly one party trick — holing out from forty feet when the crowd is holding its breath.',
    power: 60,
    accuracy: 60,
    touch: 50,
    spinControl: 50,
    putting: 60,
    recovery: 60,
    focus: 60,
    composure: 70,
    courseManagement: 60
  },
  {
    id: 'char-15',
    name: 'Marcus Reyes',
    species: 'Human',
    origin: 'Earth — Sol System',
    bio: 'A charismatic media darling who thrives on pressure, wears at least four sponsor logos at all times, and has won three majors while never quite closing the Grand Slam deal.',
    power: 70,
    accuracy: 70,
    touch: 70,
    spinControl: 70,
    putting: 80,
    recovery: 70,
    focus: 70,
    composure: 90,
    courseManagement: 70
  },
  {
    id: 'char-16',
    name: 'Jordan Halston',
    species: 'Human',
    origin: 'Earth — Sol System',
    bio: 'The current #1 human on tour, a three-time major champion with nerves of steel and a habit of destroying rivals in the final round with surgical precision.',
    power: 80,
    accuracy: 80,
    touch: 80,
    spinControl: 80,
    putting: 90,
    recovery: 80,
    focus: 90,
    composure: 100,
    courseManagement: 90
  },
  {
    id: 'char-17',
    name: 'Kaelen Vosh-Tannik',
    species: 'Voss',
    origin: 'Keldara-7 — Tanaka Industries',
    bio: 'A young Voss superstar groomed by Tanaka\'s sponsorship machine, with a crest so polished you could shave in it and a serene enlightened smile that cracks the moment he misses a green.',
    power: 95,
    accuracy: 85,
    touch: 70,
    spinControl: 75,
    putting: 75,
    recovery: 80,
    focus: 85,
    composure: 75,
    courseManagement: 80
  },
  {
    id: 'char-18',
    name: 'Iris Vennai-Corr',
    species: 'Paxi',
    origin: 'Paxa Prime — Helion-9 Fuels',
    bio: 'A second-generation Paxi phenom signed to Helion-9 Fuels before she could fold-jump alone, heir to a legendary name and privately crumbling under her mother\'s shadow.',
    power: 65,
    accuracy: 85,
    touch: 95,
    spinControl: 90,
    putting: 85,
    recovery: 80,
    focus: 85,
    composure: 80,
    courseManagement: 90
  },
  {
    id: 'char-19',
    name: 'Zephyros Threll-Kai',
    species: 'Rill',
    origin: 'Aeris Station — Aeris Compact',
    bio: 'A mathematically precise young non-binary Rill protégé bankrolled by the Aeris Compact itself, marketed as the future of the Tour and quietly cracking under the political weight of being a symbol.',
    power: 45,
    accuracy: 95,
    touch: 85,
    spinControl: 95,
    putting: 95,
    recovery: 70,
    focus: 90,
    composure: 65,
    courseManagement: 95
  },
  {
    id: 'char-20',
    name: 'Briggs Halloran',
    species: 'Human',
    origin: 'Earth — Keldaran Syndicate',
    bio: 'A cocky human signed by a Voss corporate bloc to prove humans can be \'properly developed\' — every other human on tour quietly hates him for strutting around in mystic-Voss drag.',
    power: 85,
    accuracy: 75,
    touch: 70,
    spinControl: 75,
    putting: 70,
    recovery: 80,
    focus: 80,
    composure: 70,
    courseManagement: 75
  },
  {
    id: 'char-21',
    name: 'Orry Drenn',
    species: 'Human',
    origin: 'Unknown — Betting Underlayer',
    bio: 'A washed-out former tour regular who now plays underground matches for criminal syndicates, with a tired smirk, an old leather glove he never takes off, and the unsettling habit of always knowing exactly what you\'re going to do.',
    power: 60,
    accuracy: 80,
    touch: 85,
    spinControl: 85,
    putting: 80,
    recovery: 90,
    focus: 90,
    composure: 95,
    courseManagement: 95
  },
  {
    id: 'char-22',
    name: 'Madame Vex Chronne',
    species: 'Rill-Paxi Hybrid',
    origin: 'The Velvet Fold — Betting Underlayer',
    bio: 'A Rill-Paxi hybrid bookmaker and occasional underground player who controls half the galactic side-betting market from a floating casino-yacht and plays every match like a chess opening she memorized a decade ago.',
    power: 50,
    accuracy: 75,
    touch: 80,
    spinControl: 80,
    putting: 85,
    recovery: 85,
    focus: 95,
    composure: 100,
    courseManagement: 100
  },
  {
    id: 'char-23',
    name: 'Thorn Gax',
    species: 'Voss',
    origin: 'Keldara-7 — Betting Underlayer',
    bio: 'A Voss ex-military enforcer whose \'enlightened calm\' comes from the fact that he genuinely does not care what happens to you, whose drives are weaponized, and whose debts get collected in person.',
    power: 100,
    accuracy: 60,
    touch: 40,
    spinControl: 50,
    putting: 50,
    recovery: 85,
    focus: 75,
    composure: 95,
    courseManagement: 70
  },
  {
    id: 'char-24',
    name: 'Sil "Quicksilver" Mareth',
    species: 'Paxi',
    origin: 'Paxa Prime — Betting Underlayer',
    bio: 'A fast-talking Paxi hustler who deliberately tanks her Tour ranking so she can clean up in underground matches, and who might be your best friend, your worst rival, or your exit strategy depending on the day.',
    power: 70,
    accuracy: 85,
    touch: 90,
    spinControl: 85,
    putting: 90,
    recovery: 85,
    focus: 80,
    composure: 85,
    courseManagement: 90
  },
  {
    id: 'char-25',
    name: 'Kraal the Debtkeeper',
    species: 'Voss',
    origin: 'Unknown — Betting Underlayer',
    bio: 'The legendary never-photographed head of the galactic betting underworld, a Voss of mythic skill who surfaces once a decade to challenge a single player to a match — and who has never lost.',
    power: 90,
    accuracy: 95,
    touch: 90,
    spinControl: 95,
    putting: 95,
    recovery: 95,
    focus: 100,
    composure: 100,
    courseManagement: 100
  }
];

const createGolferProfile = (player) => ({
  id: player.id,
  name: player.name,
  species: player.species,
  origin: player.origin,
  bio: player.bio,
  avatar: { ...(GOLFER_AVATAR_PALETTES[player.species] || GOLFER_AVATAR_PALETTES.Human) },
  stats: {
    power: player.power,
    accuracy: player.accuracy,
    touch: player.touch,
    spinControl: player.spinControl,
    putting: player.putting,
    recovery: player.recovery
  },
  mental: {
    focus: player.focus,
    composure: player.composure,
    courseManagement: player.courseManagement
  }
});

const GOLFERS = [
  {
    id: 'mike_g',
    name: 'Mike G',
    species: 'Human',
    origin: 'Earth — Sol System',
    bio: 'A steady, well-rounded player from Earth\'s qualifying circuit. No standout weakness, no standout strength — just solid golf.',
    avatar: {
      skin: '#f0c08c', hat: '#263246', shirt: '#3f76c1', pants: '#2e563c'
    },
    stats: {
      power: 50,
      accuracy: 50,
      touch: 50,
      spinControl: 50,
      putting: 50,
      recovery: 50
    },
    mental: {
      focus: 50,
      composure: 50,
      courseManagement: 50
    }
  },
  ...IMPORTED_GOLFER_DATA.map(createGolferProfile)
];

// ═══════════════ EQUIPMENT CATALOG ═══════════════
// Each club item has stats that modify gameplay. "Generic" brand = starter gear.
// Categories: drivers, fairwayWoods, hybrids, irons, wedges, putters
const PRO_STATS = { distance: 100, accuracy: 100, forgiveness: 100, spin: 100 };
const PRO_PUTTER_STATS = { distance: 100, accuracy: 100, forgiveness: 100, feel: 100 };
const EQUIPMENT_CATALOG = {
  drivers: [
    { id: 'generic_dr', name: 'Generic Driver', brand: 'Generic', clubKey: 'DR',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, spin: 50 } },
    { id: 'pro_dr', name: 'Pro Driver', brand: 'Pro', clubKey: 'DR', stats: PRO_STATS }
  ],
  fairwayWoods: [
    { id: 'generic_3w', name: 'Generic 3 Wood', brand: 'Generic', clubKey: '3W',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, spin: 50 } },
    { id: 'generic_5w', name: 'Generic 5 Wood', brand: 'Generic', clubKey: '5W',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, spin: 50 } },
    { id: 'generic_7w', name: 'Generic 7 Wood', brand: 'Generic', clubKey: '7W',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, spin: 50 } },
    { id: 'pro_3w', name: 'Pro 3 Wood', brand: 'Pro', clubKey: '3W', stats: PRO_STATS },
    { id: 'pro_5w', name: 'Pro 5 Wood', brand: 'Pro', clubKey: '5W', stats: PRO_STATS },
    { id: 'pro_7w', name: 'Pro 7 Wood', brand: 'Pro', clubKey: '7W', stats: PRO_STATS }
  ],
  irons: [
    { id: 'generic_3i', name: 'Generic 3 Iron', brand: 'Generic', clubKey: '3I',
      stats: { distance: 50, accuracy: 50, forgiveness: 40, spin: 50 } },
    { id: 'generic_4i', name: 'Generic 4 Iron', brand: 'Generic', clubKey: '4I',
      stats: { distance: 50, accuracy: 50, forgiveness: 42, spin: 50 } },
    { id: 'generic_5i', name: 'Generic 5 Iron', brand: 'Generic', clubKey: '5I',
      stats: { distance: 50, accuracy: 50, forgiveness: 45, spin: 50 } },
    { id: 'generic_6i', name: 'Generic 6 Iron', brand: 'Generic', clubKey: '6I',
      stats: { distance: 50, accuracy: 50, forgiveness: 48, spin: 50 } },
    { id: 'generic_7i', name: 'Generic 7 Iron', brand: 'Generic', clubKey: '7I',
      stats: { distance: 50, accuracy: 50, forgiveness: 52, spin: 50 } },
    { id: 'generic_8i', name: 'Generic 8 Iron', brand: 'Generic', clubKey: '8I',
      stats: { distance: 50, accuracy: 50, forgiveness: 55, spin: 50 } },
    { id: 'generic_9i', name: 'Generic 9 Iron', brand: 'Generic', clubKey: '9I',
      stats: { distance: 50, accuracy: 50, forgiveness: 58, spin: 50 } },
    { id: 'pro_3i', name: 'Pro 3 Iron', brand: 'Pro', clubKey: '3I', stats: PRO_STATS },
    { id: 'pro_4i', name: 'Pro 4 Iron', brand: 'Pro', clubKey: '4I', stats: PRO_STATS },
    { id: 'pro_5i', name: 'Pro 5 Iron', brand: 'Pro', clubKey: '5I', stats: PRO_STATS },
    { id: 'pro_6i', name: 'Pro 6 Iron', brand: 'Pro', clubKey: '6I', stats: PRO_STATS },
    { id: 'pro_7i', name: 'Pro 7 Iron', brand: 'Pro', clubKey: '7I', stats: PRO_STATS },
    { id: 'pro_8i', name: 'Pro 8 Iron', brand: 'Pro', clubKey: '8I', stats: PRO_STATS },
    { id: 'pro_9i', name: 'Pro 9 Iron', brand: 'Pro', clubKey: '9I', stats: PRO_STATS }
  ],
  wedges: [
    { id: 'generic_pw', name: 'Generic Pitching Wedge', brand: 'Generic', clubKey: 'PW',
      stats: { distance: 50, accuracy: 50, forgiveness: 55, spin: 55 } },
    { id: 'generic_gw', name: 'Generic Gap Wedge', brand: 'Generic', clubKey: 'GW',
      stats: { distance: 50, accuracy: 50, forgiveness: 52, spin: 58 } },
    { id: 'generic_sw', name: 'Generic Sand Wedge', brand: 'Generic', clubKey: 'SW',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, spin: 62 } },
    { id: 'generic_lw', name: 'Generic Lob Wedge', brand: 'Generic', clubKey: 'LW',
      stats: { distance: 50, accuracy: 45, forgiveness: 45, spin: 65 } },
    { id: 'pro_pw', name: 'Pro Pitching Wedge', brand: 'Pro', clubKey: 'PW', stats: PRO_STATS },
    { id: 'pro_gw', name: 'Pro Gap Wedge', brand: 'Pro', clubKey: 'GW', stats: PRO_STATS },
    { id: 'pro_sw', name: 'Pro Sand Wedge', brand: 'Pro', clubKey: 'SW', stats: PRO_STATS },
    { id: 'pro_lw', name: 'Pro Lob Wedge', brand: 'Pro', clubKey: 'LW', stats: PRO_STATS }
  ],
  putters: [
    { id: 'generic_pt', name: 'Generic Putter', brand: 'Generic', clubKey: 'PT',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, feel: 50 } },
    { id: 'pro_pt', name: 'Pro Putter', brand: 'Pro', clubKey: 'PT', stats: PRO_PUTTER_STATS }
  ]
};

// Default bag: 14 clubs (DR, 3W, 5W, 4I-9I, PW, GW, SW, LW, PT)
const DEFAULT_BAG = [
  'generic_dr', 'generic_3w', 'generic_5w',
  'generic_4i', 'generic_5i', 'generic_6i', 'generic_7i', 'generic_8i', 'generic_9i',
  'generic_pw', 'generic_gw', 'generic_sw', 'generic_lw',
  'generic_pt'
];

const getAllEquipment = () => {
  const all = [];
  Object.values(EQUIPMENT_CATALOG).forEach(category => category.forEach(item => all.push(item)));
  return all;
};

const getEquipmentById = (id) => getAllEquipment().find(e => e.id === id);

const SURFACE_PHYSICS = {
  // powerPenalty: [min, max] for random range per shot. swingSensitivity: multiplier on swing deviation (1.0 = normal)
  rough: { rollFriction: PHYSICS_CONFIG.roughFriction, bounce: PHYSICS_CONFIG.roughBounce, landingDamping: PHYSICS_CONFIG.roughLandingDamping, wallRestitution: 0.62, powerPenalty: [0.8, 0.9], swingSensitivity: 1.2 * PHYSICS_CONFIG.lieMissAmplification, label: 'Rough', emoji: '🌿', color: '#3a6b2a' },
  deepRough: { rollFriction: PHYSICS_CONFIG.deepRoughFriction, bounce: 0.12, landingDamping: 0.6, wallRestitution: 0.55, powerPenalty: [0.65, 0.75], swingSensitivity: 1.5 * PHYSICS_CONFIG.lieMissAmplification, label: 'Deep Rough', emoji: '🌾', color: '#2d5420' },
  secondCut: { rollFriction: 3.8, bounce: 0.2, landingDamping: 0.76, wallRestitution: 0.63, powerPenalty: [0.88, 0.92], swingSensitivity: 1.1 * PHYSICS_CONFIG.lieMissAmplification, label: 'Second Cut', emoji: '🌱', color: '#4a8535' },
  fairway: { rollFriction: PHYSICS_CONFIG.fairwayFriction, bounce: PHYSICS_CONFIG.fairwayBounce, landingDamping: PHYSICS_CONFIG.fairwayLandingDamping, wallRestitution: 0.66, powerPenalty: [0.95, 0.95], swingSensitivity: 1.0 * PHYSICS_CONFIG.lieMissAmplification, label: 'Fairway', emoji: '🏌️', color: '#5aad42' },
  fringe: { rollFriction: 3.8, bounce: 0.2, landingDamping: 0.76, wallRestitution: 0.64, powerPenalty: [0.95, 0.95], swingSensitivity: 1.05 * PHYSICS_CONFIG.lieMissAmplification, label: 'Fringe', emoji: '🟢', color: '#4d9940' },
  sand: { rollFriction: PHYSICS_CONFIG.sandFriction, bounce: PHYSICS_CONFIG.sandBounce, landingDamping: PHYSICS_CONFIG.sandLandingDamping, wallRestitution: 0.52, powerPenalty: [0.6, 0.65], swingSensitivity: 1.6 * PHYSICS_CONFIG.lieMissAmplification, label: 'Bunker', emoji: '⛱️', color: '#d4b96a' },
  pluggedSand: { rollFriction: 8.0, bounce: 0.05, landingDamping: 0.4, wallRestitution: 0.4, powerPenalty: [0.35, 0.45], swingSensitivity: 2.0 * PHYSICS_CONFIG.lieMissAmplification, label: 'Plugged Lie', emoji: '🥚', color: '#c9a84e' },
  green: { rollFriction: PHYSICS_CONFIG.greenFriction, bounce: 0.14, landingDamping: 0.82, wallRestitution: 0.68, powerPenalty: [1.0, 1.0], swingSensitivity: 1.0, label: 'Green', emoji: '⛳', color: '#3dba4a' },
  tee: { rollFriction: 3.0, bounce: 0.22, landingDamping: 0.85, wallRestitution: 0.7, powerPenalty: [1.0, 1.0], swingSensitivity: 1.0, label: 'Tee Box', emoji: '🏌️', color: '#5aad42' }
};

// Tree vertical profile: a narrow trunk (trunkR) extends from the ground up to
// the canopy. The wider canopy (at radius o.r) only occupies the top 25% of
// the tree. Shots flown BELOW the canopy must still clear the trunk, but can
// be punched under the leaves. Shots above the tree height pass over freely.
const TREE_HEIGHT_BY_LOOK = {
  pine: 32,
  oak: 22,
  palm: 28,
  birch: 24,
  cypress: 26,
  tree: 24, // generic hand-authored
};
const TREE_CANOPY_FRACTION = 0.25; // top 25% of height is canopy
const getTreePhysics = (o) => {
  const defaultH = TREE_HEIGHT_BY_LOOK[o.look] ?? 20;
  const h = typeof o.h === 'number' ? o.h : defaultH;
  const trunkR = typeof o.trunkR === 'number' ? o.trunkR : Math.max(1.2, (o.r ?? 10) * 0.3);
  const canopyStart = h * (1 - TREE_CANOPY_FRACTION);
  return { h, trunkR, canopyStart };
};

const GOLFER_PIXEL_KEY = {
  o: '#10151b',
  n: '#1f4ed8',
  b: '#1741b6',
  w: '#f4f7fb',
  g: '#cfd6e0',
  s: '#f2a35e',
  t: '#d98b45',
  p: '#d7c18e',
  q: '#b89f6d',
  c: '#0f1720'
};

const GOLFER_SPRITE_ROWS = [
  '..............',
  '...bbb........',
  '..bwwwbb......',
  '.bwwgwwnbbb...',
  '.bnnwwwnnnnb..',
  '.bnnnnnnnnnb..',
  '..nssssnnnb...',
  '.pssssssnn....',
  '.ppsccssp.....',
  '.pq...qpp.....',
  '.w....qp......',
  '.c....ww......',
  '......c.......'
];

const GOLFER_PIXELS = GOLFER_SPRITE_ROWS.flatMap((row, y) =>
  row.split('').flatMap((token, x) => (token === '.' ? [] : [{ x, y, color: GOLFER_PIXEL_KEY[token] }]))
);
const WIND_DIRS = {
  N:  { x: 0, y: -1 },  S:  { x: 0, y: 1 },
  E:  { x: 1, y: 0 },   W:  { x: -1, y: 0 },
  NE: { x: 0.707, y: -0.707 }, NW: { x: -0.707, y: -0.707 },
  SE: { x: 0.707, y: 0.707 },  SW: { x: -0.707, y: 0.707 }
};
const WIND_ARROWS = { N: '↑', S: '↓', E: '→', W: '←', NE: '↗', NW: '↖', SE: '↘', SW: '↙' };
const WIND_DIR_KEYS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const generateWind = (holes = HOLES) => {
  // One random speed for the whole round (1-25 mph), direction shifts per hole.
  // Range holes always play in still air.
  const roundSpeed = Math.max(1, Math.round(Math.random() * 25));
  return holes.map((hole) => {
    if (hole?.isRange) return { speed: 0, dir: 'N' };
    const dir = WIND_DIR_KEYS[Math.floor(Math.random() * WIND_DIR_KEYS.length)];
    return { speed: roundSpeed, dir };
  });
};
const WIND_FORCE_SCALE = PHYSICS_CONFIG.windForceScale;
const SHOT_SHAPE_HINTS = {
  PT: 'Low roll',
  LW: 'High soft',
  SW: 'High check',
  GW: 'Mid check',
  PW: 'Mid flight',
  '9I': 'Mid draw',
  '8I': 'Piercing',
  '7I': 'Piercing',
  '6I': 'Strong draw',
  '5I': 'Strong draw',
  '4I': 'Low runner',
  '3I': 'Stinger',
  '7W': 'High carry',
  '5W': 'Long carry',
  '3W': 'Penetrating',
  DR: 'Power fade'
};
const BUILD_VERSION = 'IGT v3.40 · GS spike v0.77';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const degToRad = (deg) => (deg * Math.PI) / 180;

const magnitude = (v) => Math.hypot(v.x, v.y);

const normalize = (v) => {
  const m = magnitude(v);
  if (m < 0.0001) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / m, y: v.y / m };
};

const pointInRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const pointInPolygon = (point, polygon = []) => {
  if (!polygon?.length) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 0.000001) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};
const pointNearPolygon = (point, polygon = [], buffer = 0) => {
  if (pointInPolygon(point, polygon)) return true;
  return polygon.some((vertex) => Math.hypot(vertex.x - point.x, vertex.y - point.y) <= buffer);
};
// Flatten a bezier-based designer shape into a polygon by sampling each
// cubic segment. Anchor-only polygons miss the bulge between anchors when
// the handles push the curve outward, which caused balls visibly sitting
// on the green (or sand, or water) to test as off-shape. 4 samples per
// segment is enough to follow typical handle curvature without blowing
// up point-in-polygon cost.
const bezierSamplePoint = (p0, p1, p2, p3, t) => {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
  };
};
const vectorShapeToPolygon = (shape, samplesPerSegment = 4) => {
  const pts = shape?.points;
  if (!Array.isArray(pts) || pts.length === 0) return [];
  if (samplesPerSegment <= 1) {
    return pts.map((p) => ({ x: p.x, y: p.y }));
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const p0 = { x: pts[i].x, y: pts[i].y };
    const p1 = { x: pts[i].outX ?? pts[i].x, y: pts[i].outY ?? pts[i].y };
    const p2 = { x: pts[j].inX ?? pts[j].x, y: pts[j].inY ?? pts[j].y };
    const p3 = { x: pts[j].x, y: pts[j].y };
    for (let s = 0; s < samplesPerSegment; s++) {
      out.push(bezierSamplePoint(p0, p1, p2, p3, s / samplesPerSegment));
    }
  }
  return out;
};

const pointInCircle = (p, c) => {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return dx * dx + dy * dy <= c.r * c.r;
};

const getAimAngleToCup = (ballPos, cup) => Math.atan2(cup.y - ballPos.y, cup.x - ballPos.x);
// Tempo thresholds in one place so dev-mode UI can show "0.42 > 0.38"
// alongside each triggered tag, and the coaching text can cite them.
const TEMPO_THRESHOLDS = {
  backJerk: 0.38,
  forwardJerk: 0.50,
  pauseTolerance: 0,           // ANY pause above the natural-reversal floor is penalized
  pauseNaturalFloorMs: 40,     // subtracted from raw pause time for unavoidable finger reversal
  // Exponential distance falloff: distanceMult = exp(-PAUSE_DISTANCE_K * pauseMs)
  //   25ms  → 0.88  (12% carry loss)
  //   50ms  → 0.78  (22%)
  //  100ms  → 0.61  (39%)
  //  200ms  → 0.37  (63%)
  //  300ms  → 0.22  (78%)
  pauseDistanceK: 0.005,
  followThroughCommitted: 0.60, // peak position ≥ this tags Committed
  followThroughCoasted: 0.30,   // peak position < this tags Coasted
  purePeakBack: 0.35,           // below → pure bonus eligible
  purePeakFwd: 0.48,
  purePauseMs: 10,
  pureFollowThrough: 0.75,
};

// Per-flaw coaching — shown on the shot-stats card when dev mode is on.
// Reads the metrics the algorithm actually used and tells the player
// what to change on the next swing.
const coachSwing = (tempoTag, metrics) => {
  if (!metrics) return [];
  const tips = [];
  const tags = (tempoTag || '').split(' + ').map((t) => t.trim());
  if (tags.includes('Paused')) {
    const carryLoss = Math.round((1 - (metrics.pauseDistanceMult ?? 1)) * 100);
    tips.push(
      `You held at the top for ${Math.round(metrics.pauseMs)}ms — that cost you ${carryLoss}% of carry and amplified your miss. Reverse direction in one continuous motion, no hovering.`,
    );
  }
  if (tags.includes('Jerky Back')) {
    tips.push(`Backswing had uneven speed (${metrics.backJerk.toFixed(2)}, triggers above ${TEMPO_THRESHOLDS.backJerk}). Pull at a steady pace; avoid starts/stops and direction wobbles.`);
  }
  if (tags.includes('Jerky Fwd')) {
    tips.push(`Forward swing was jerky (${metrics.forwardJerk.toFixed(2)}, triggers above ${TEMPO_THRESHOLDS.forwardJerk}). Let speed build smoothly — don't yank mid-swing.`);
  }
  if (tags.includes('Coasted')) {
    tips.push(`Peak speed landed at ${Math.round(metrics.followThrough * 100)}% of forward swing (want ≥30% to avoid Coasted, ≥60% for Committed). Keep accelerating — don't lose power after the first push.`);
  }
  if (tags.includes('Committed') || tags.includes('Pure')) {
    tips.push(`Peak speed landed at ${Math.round(metrics.followThrough * 100)}% of forward swing — that's a committed release. Keep doing that.`);
  }
  if (tags.includes('Smooth') && tips.length === 0) {
    tips.push(`Clean swing — no flaws tripped. For "Pure", aim for peak speed at ≥75% of forward swing with no pause at the top.`);
  }
  return tips;
};

// Evaluate the swing tempo based on the pointer's timestamped trajectory.
// Returns { tempoMult, tempoTag, metrics }. tempoMult > 1 amplifies deviation
// (penalty); < 1 dampens it (bonus). The algorithm rewards smooth acceleration
// and a committed follow-through, and penalizes jerky motion, pausing at the
// top, and decelerating before release. See sim-swing.js for the reference
// implementation + scenario tests.
const evaluateTempo = (samples, { focus = 50, composure = 50 } = {}) => {
  const back = [];
  const forward = [];
  let transitionIndex = -1;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.phase === 'forward') {
      if (transitionIndex < 0) transitionIndex = i;
      forward.push(s);
    } else {
      back.push(s);
    }
  }
  if (back.length < 3 && forward.length < 3) {
    // Truly not enough signal in either direction — treat as a canceled/
    // incomplete swing with a neutral mult. The release handler gates on
    // powerRef > 5 so this only fires on a real tap-and-drop.
    return { tempoMult: 1.0, tempoTag: 'Normal', metrics: { reason: 'too-short' } };
  }
  // If there's a backswing but almost no recorded forward motion, the player
  // released without a real transition (held then flicked, or let go at the
  // top). That used to silently fall through as 'Normal' and let a 120%
  // backswing fire at full carry — exactly the "power goes to infinity"
  // bug. Estimate the top-of-backswing pause from the trailing back samples
  // and return a Rushed result with hard distance + deviation penalties.
  if (forward.length < 3) {
    const tailCount = Math.min(back.length, 12);
    let hoverMs = 0;
    for (let i = back.length - tailCount + 1; i < back.length; i++) {
      const a = back[i - 1];
      const b = back[i];
      const dt = Math.max(0, b.t - a.t);
      if (dt <= 0) continue;
      const v = Math.hypot(b.x - a.x, b.y - a.y) / dt;
      if (v < 0.08) hoverMs += dt;
    }
    const pauseMs = Math.max(0, hoverMs - TEMPO_THRESHOLDS.pauseNaturalFloorMs);
    const pauseDistanceMult = pauseMs > 0
      ? Math.exp(-TEMPO_THRESHOLDS.pauseDistanceK * pauseMs)
      : 1.0;
    // Flat 1.8x deviation mult — even without a full forward trace, a
    // release like this should spray and lose distance.
    return {
      tempoMult: 1.8,
      tempoTag: pauseMs > 120 ? 'Paused + Rushed' : 'Rushed',
      metrics: {
        backJerk: 0,
        forwardJerk: 0,
        pauseMs,
        pauseDistanceMult: +pauseDistanceMult.toFixed(3),
        followThrough: 0,
        peakBack: 0,
        peakForward: 0,
        reason: 'no-forward',
      },
    };
  }

  const speeds = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = Math.max(1, b.t - a.t);
    speeds.push({ t: b.t, v: Math.hypot(b.x - a.x, b.y - a.y) / dt, phase: b.phase });
  }
  const backSpeeds = speeds.filter((s) => s.phase !== 'forward');
  const forwardSpeeds = speeds.filter((s) => s.phase === 'forward');
  const peakBack = Math.max(0.001, ...backSpeeds.map((s) => s.v));
  const peakForward = Math.max(0.001, ...forwardSpeeds.map((s) => s.v));

  // Two complementary jerk signals:
  //   (a) coefficient of variation of ACTIVE-motion speeds (samples > 20%
  //       of phase peak). Ignores near-zero samples so a pause doesn't
  //       fake a jerky reading. Smooth swings sit around 0.30, realistic
  //       stop-start finger motion pushes past 0.40.
  //   (b) direction reversals in the phase's dominant axis (back = y+,
  //       forward = y-). A brief mid-phase flip adds 0.5 outright — a
  //       clear giveaway even if touch sampling smooths the CoV.
  const coeffVariation = (phaseSpeeds) => {
    if (phaseSpeeds.length < 3) return 0;
    const pk = Math.max(...phaseSpeeds.map((s) => s.v));
    if (pk < 0.01) return 0;
    const active = phaseSpeeds.filter((s) => s.v > pk * 0.20);
    if (active.length < 3) return 0;
    const mean = active.reduce((a, b) => a + b.v, 0) / active.length;
    if (mean < 0.01) return 0;
    const variance = active.reduce((a, b) => a + (b.v - mean) ** 2, 0) / active.length;
    return Math.sqrt(variance) / mean;
  };
  const countReversals = (phaseSamples) => {
    if (phaseSamples.length < 4) return 0;
    let reversals = 0;
    let lastSign = 0;
    for (let i = 1; i < phaseSamples.length; i++) {
      const d = phaseSamples[i].y - phaseSamples[i - 1].y;
      if (Math.abs(d) < 1.2) continue;
      const sign = d > 0 ? 1 : -1;
      if (lastSign !== 0 && sign !== lastSign) reversals++;
      lastSign = sign;
    }
    return reversals;
  };
  const backJerk = coeffVariation(backSpeeds) + countReversals(back) * 0.5;
  const forwardJerk = coeffVariation(forwardSpeeds) + countReversals(forward) * 0.5;

  // Pause detection uses an ABSOLUTE speed threshold (0.08 px/ms ≈ finger
  // essentially not moving) within ±220ms of the transition, minus a short
  // natural-reversal floor. Floor kept intentionally tight so any meaningful
  // hover at the top gets caught and penalized.
  const pauseThreshAbs = 0.08;
  const transitionT = samples[transitionIndex].t;
  let pauseMsRaw = 0;
  for (let i = 1; i < samples.length; i++) {
    const mid = (samples[i].t + samples[i - 1].t) / 2;
    if (Math.abs(mid - transitionT) > 220) continue;
    const dt = Math.max(0, samples[i].t - samples[i - 1].t);
    if (dt <= 0) continue;
    const v = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y) / dt;
    if (v < pauseThreshAbs) pauseMsRaw += dt;
  }
  const pauseMs = Math.max(0, pauseMsRaw - TEMPO_THRESHOLDS.pauseNaturalFloorMs);

  // EXPONENTIAL distance penalty on pauses — any pause bleeds carry. This is
  // separate from the deviation multiplier below (which affects curve only).
  // Composure softens the falloff slightly (high composure golfer absorbs a
  // tiny hesitation better).
  const composureSoften = clamp(1 - (composure - 50) * 0.004, 0.85, 1.15);
  const pauseDistanceMult = pauseMs > 0
    ? Math.exp(-TEMPO_THRESHOLDS.pauseDistanceK * pauseMs * composureSoften)
    : 1.0;

  let peakIdx = 0;
  for (let i = 0; i < forwardSpeeds.length; i++) {
    if (forwardSpeeds[i].v > forwardSpeeds[peakIdx].v) peakIdx = i;
  }
  const followThrough = forwardSpeeds.length > 1 ? clamp(peakIdx / (forwardSpeeds.length - 1), 0, 1) : 0.5;

  let mult = 1.0;
  const tags = [];
  const focusBias = clamp((focus - 50) / 100, -0.5, 0.5);

  // Pause deviation amplifier: exponential growth above a short grace window.
  // Softer than the previous curve — a brief natural pause (<80ms) is free,
  // and the hard cap is lower.
  //   80ms  → mult × 1.00 (grace)
  //  120ms  → mult × 1.13
  //  200ms  → mult × 1.43
  //  300ms  → mult × 1.93
  //  500ms  → mult × 2.20 (hard cap)
  if (pauseMs > 80) {
    const amp = Math.min(2.2, Math.exp((pauseMs - 80) * 0.003));
    mult *= amp;
    tags.push('Paused');
  }
  if (backJerk > TEMPO_THRESHOLDS.backJerk) {
    mult *= 1 + clamp((backJerk - TEMPO_THRESHOLDS.backJerk) * 1.4, 0, 0.45);
    tags.push('Jerky Back');
  }
  if (forwardJerk > TEMPO_THRESHOLDS.forwardJerk) {
    mult *= 1 + clamp((forwardJerk - TEMPO_THRESHOLDS.forwardJerk) * 1.4, 0, 0.45);
    tags.push('Jerky Fwd');
  }
  // Forward-motion scoring via peak POSITION in the forward swing.
  // We intentionally do NOT check release velocity vs peak — on a
  // touchscreen the finger naturally slows before lift, which would
  // flag every swing. Peak position is the honest signal.
  if (followThrough >= TEMPO_THRESHOLDS.followThroughCommitted && tags.length === 0) {
    const bonus = clamp((followThrough - TEMPO_THRESHOLDS.followThroughCommitted) * 0.4 + 0.08, 0, 0.22);
    mult *= 1 - bonus;
    tags.push('Committed');
  } else if (followThrough < TEMPO_THRESHOLDS.followThroughCoasted) {
    mult *= 1 + clamp((TEMPO_THRESHOLDS.followThroughCoasted - followThrough) * 0.8, 0, 0.25);
    tags.push('Coasted');
  }

  if (mult > 1.0) {
    const composureSoften = clamp(1 - (composure - 50) * 0.003, 0.85, 1.15);
    mult = 1 + (mult - 1) * composureSoften;
  }

  const pureBonus = tags.length === 1 && tags[0] === 'Committed'
    && backJerk < TEMPO_THRESHOLDS.purePeakBack
    && forwardJerk < TEMPO_THRESHOLDS.purePeakFwd
    && pauseMs < TEMPO_THRESHOLDS.purePauseMs
    && followThrough >= TEMPO_THRESHOLDS.pureFollowThrough;
  if (pureBonus) {
    mult = 0.75;
    tags.length = 0;
    tags.push('Pure');
  }

  return {
    tempoMult: +mult.toFixed(3),
    tempoTag: tags.length ? tags.join(' + ') : 'Smooth',
    metrics: {
      backJerk,
      forwardJerk,
      pauseMs,
      pauseDistanceMult: +pauseDistanceMult.toFixed(3),
      followThrough,
      peakBack,
      peakForward,
    },
  };
};

const speedFromPower = (powerPct, club = CLUBS[0]) => {
  const powerFrac = clamp(powerPct / 100, 0, 1.2);
  const targetCarryWorld = (club.carryYards / YARDS_PER_WORLD) * powerFrac;
  // Hang time must match strikeBall: (3.2 + launch * 0.8) * launchRatio
  const launchRatio = clamp(powerPct / 125, 0, 1);
  const hangTime = (3.2 + club.launch * 0.8) * launchRatio;
  const expFactor = 1 - Math.exp(-0.14 * hangTime);
  return expFactor > 0.001 ? (targetCarryWorld * 0.14 / expFactor) : targetCarryWorld * 2;
};
const expandRect = (rect, inset) => ({
  x: rect.x - inset,
  y: rect.y - inset,
  w: rect.w + inset * 2,
  h: rect.h + inset * 2
});
// Find the water hazard the ball sits in (if any). Checks rect water first,
// then the vector bezier water shapes — custom courses sometimes have the
// visible bezier pond drift slightly from its rect tile approximation, and
// the ball can come to rest on the pond without ever crossing a rect tile.
// Returns a {x, y, w, h} rect suitable for drop-relief math, or null.
const findWaterHazAt = (hole, point) => {
  // Union of all rect + vector water shapes so the returned bbox fully
  // contains the visible pond. Lateral drop calcs use this bbox +
  // padding to guarantee the drop point sits clearly on dry land and
  // doesn't immediately re-trigger the water-in-lie check.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hit = false;
  const rects = hole?.hazards?.filter((h) => h.type === 'waterRect') || [];
  for (const r of rects) {
    if (pointInRect(point, r)) {
      hit = true;
    }
    // always accumulate bbox — even rects we didn't hit contribute to the
    // full pond footprint, because the ball can be in one rect but the
    // pond extends further and we want drop options outside the whole thing.
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }
  const vecs = hole?.editorVectors?.hazards?.water || [];
  for (const sh of vecs) {
    const poly = vectorShapeToPolygon(sh);
    if (!hit && pointInPolygon(point, poly)) hit = true;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!hit) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

const getSurfaceAtPoint = (hole, point) => {
  const editorVectors = hole.editorVectors;
  const vectorSand = editorVectors?.hazards?.sand?.some((shape) => pointInPolygon(point, vectorShapeToPolygon(shape)));
  const inSand = vectorSand || hole.hazards?.some((h) => h.type === 'sandRect' && pointInRect(point, h));
  if (inSand) return 'sand';
  const terrain = hole.terrain;
  if (terrain?.tee && pointInRect(point, terrain.tee)) return 'tee';
  // Green detection: the vector polygon (from editorVectors) is a straight-line
  // approximation of the bezier-rendered green, and it's usually slightly
  // SMALLER than the terrain.green rect. Check BOTH together — if the ball is
  // inside either shape, it's on the green. Previously the vector's fringe-
  // near check fired before the rect check, so a ball inside the rect but
  // just outside the vector polygon got classified as fringe and rolled with
  // rough-ish friction even though the player saw it sitting on the green.
  const greenPoly = editorVectors?.terrain?.green ? vectorShapeToPolygon(editorVectors.terrain.green) : null;
  const inGreenPoly = greenPoly?.length ? pointInPolygon(point, greenPoly) : false;
  const inGreenRect = terrain?.green ? pointInRect(point, terrain.green) : false;
  if (inGreenPoly || inGreenRect) return 'green';
  const nearGreenPoly = greenPoly?.length ? pointNearPolygon(point, greenPoly, FRINGE_BUFFER) : false;
  const nearGreenRect = terrain?.green ? pointInRect(point, expandRect(terrain.green, FRINGE_BUFFER)) : false;
  if (nearGreenPoly || nearGreenRect) return 'fringe';
  const fairwayPolys = editorVectors?.terrain?.fairway?.map(vectorShapeToPolygon) || [];
  if (fairwayPolys.some((poly) => pointInPolygon(point, poly))) return 'fairway';
  if (fairwayPolys.some((poly) => pointNearPolygon(point, poly, 20))) return 'secondCut';
  if (terrain?.fairway?.some((f) => pointInRect(point, f))) return 'fairway';
  if (terrain?.fairway?.some((f) => pointInRect(point, expandRect(f, 20)))) return 'secondCut';
  // Wider rough corridor so missing the fairway doesn't instantly mean
  // "brutal deepRough". Anything within ~80 units of a fairway/green is
  // playable rough. Further afield falls back to the hole's background
  // (rough by default on most custom courses; deepRough only when the
  // course author explicitly set that background).
  const nearAnything = fairwayPolys.some((poly) => pointNearPolygon(point, poly, 80)) || terrain?.fairway?.some((f) => pointInRect(point, expandRect(f, 80)));
  if (nearAnything) return 'rough';
  return hole.background === 'deepRough' ? 'deepRough' : (hole.background === 'desert' ? 'desert' : 'rough');
};
// Simulate the ball's horizontal trajectory so the aim-line preview uses
// the exact same Magnus-curve physics as the live flight. Returns the path
// (array of world-space points) from ball start to wherever the ball would
// come to rest — carry only; rolling afterward uses the landing surface.
const simulateAimTrajectory = ({
  startPos,
  aimAngleRad,
  initialHorizSpeed,
  spinNorm = 0,
  totalCarryWorld,
  maxTime = 6,
  dt = 1 / 60
}) => {
  const vel = {
    x: Math.cos(aimAngleRad) * initialHorizSpeed,
    y: Math.sin(aimAngleRad) * initialHorizSpeed
  };
  let pos = { ...startPos };
  let spin = spinNorm;
  let traveled = 0;
  const path = [{ ...pos }];
  for (let t = 0; t < maxTime; t += dt) {
    const speed = Math.hypot(vel.x, vel.y);
    if (speed > 0.5) {
      // Magnus perpendicular to CURRENT velocity (same as live flight).
      const ux = vel.x / speed, uy = vel.y / speed;
      const px = -uy, py = ux;
      const sideAccel = -spin * speed * CURVE_STRENGTH;
      vel.x += px * sideAccel * dt;
      vel.y += py * sideAccel * dt;
    }
    const drag = Math.max(0, 1 - 0.14 * dt);
    vel.x *= drag;
    vel.y *= drag;
    spin *= Math.pow(CURVE_SPIN_DECAY_PER_SEC, 60 * dt);
    pos = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
    traveled += Math.hypot(vel.x, vel.y) * dt;
    path.push({ ...pos });
    if (traveled >= totalCarryWorld) break;
    if (Math.hypot(vel.x, vel.y) < 0.5) break;
  }
  return path;
};

// Per-shot-type carry and apex multipliers, plus a small spin nudge for
// shapes that should feel different in flight (flop balloons; stinger runs).
const SHOT_TYPE_PROFILES = {
  normal:  { carry: 1.0,  apex: 1.0,  spinBonus: 0,    label: 'Normal' },
  chip:    { carry: 0.5,  apex: 0.7,  spinBonus: 0,    label: 'Chip' },
  flop:    { carry: 0.33, apex: 2.0,  spinBonus: 0.25, label: 'Flop' },
  stinger: { carry: 1.0,  apex: 0.5,  spinBonus: -0.25, label: 'Stinger' },
  bump:    { carry: 0.75, apex: 0.4,  spinBonus: -0.15, label: 'Bump & Run' },
};

// clubIsWedge / isIronWood classify by key. PT is the putter (no shot type
// choices). Wedges are the four specialty clubs. Everything else is
// iron/wood/driver.
const WEDGE_KEYS = new Set(['LW', 'SW', 'GW', 'PW']);
const clubIsWedge = (club) => !!club && WEDGE_KEYS.has(club.key);
const clubIsIronOrWood = (club) => !!club && club.key !== 'PT' && !WEDGE_KEYS.has(club.key);

// Stinger is only legal off a clean lie with an iron or wood. Bump-and-run
// and Flop are wedge-only (Flop wants loft; Bump wants low trajectory).
// Chip is allowed with everything except the putter. Normal is always legal.
const GOOD_LIES_FOR_STINGER = new Set(['tee', 'fairway', 'secondCut']);
const shotTypeEligible = (type, club, lie) => {
  if (!club || club.key === 'PT') return type === 'normal';
  if (type === 'normal') return true;
  if (type === 'chip')   return true;
  if (type === 'flop')   return clubIsWedge(club);
  if (type === 'bump')   return clubIsWedge(club);
  if (type === 'stinger') return clubIsIronOrWood(club) && GOOD_LIES_FOR_STINGER.has(lie);
  return false;
};

const estimateStraightDistance = (powerPct, club, strike = { launch: 1, spin: 1 }, distanceMult = 1) => {
  const shotRatio = clamp(powerPct / 100, 0, 1.2);
  return (club.carryYards * shotRatio * strike.launch * distanceMult) / YARDS_PER_WORLD;
};
const puttPowerForDistance = (distanceWorld) => {
  // On a flat green, total roll distance ≈ v0 / friction (geometric drag series)
  // So v0_needed = distance * friction. Then launchRatio = v0 / basePuttSpeed.
  const greenFriction = SURFACE_PHYSICS.green.rollFriction; // 2.6
  const basePuttSpeed = (CLUBS[0].carryYards / YARDS_PER_WORLD) * 2.8;
  const v0Needed = distanceWorld * greenFriction * 1.04; // 4% overshoot corrects discrete sim gap
  const launchRatio = basePuttSpeed > 0 ? v0Needed / basePuttSpeed : 0;
  return clamp(Math.round(clamp(launchRatio, 0, 1) * 125), 5, 125);
};
const getSlopeDirectionUnit = (dir) => {
  const parsed = WIND_DIRS[dir] || { x: 0, y: 0 };
  return normalize(parsed);
};
const getGreenSlopeForce = (hole, point, surfaceName) => {
  if (surfaceName !== 'green' && surfaceName !== 'fringe') {
    return { x: 0, y: 0 };
  }
  const green = hole.terrain?.green;
  if (!green || !hole.slopes?.length) {
    return { x: 0, y: 0 };
  }
  let ax = 0;
  let ay = 0;
  hole.slopes.forEach((slope) => {
    const centerX = slope.x ?? (green.x + green.w * clamp(slope.cx ?? 0.5, 0, 1));
    const centerY = slope.y ?? (green.y + green.h * clamp(slope.cy ?? 0.5, 0, 1));
    const nx = (point.x - centerX) / Math.max(1, green.w * 0.55);
    const ny = (point.y - centerY) / Math.max(1, green.h * 0.55);
    const influence = clamp(1.2 - Math.hypot(nx, ny), 0, 1.2);
    if (influence <= 0) {
      return;
    }
    const dir = getSlopeDirectionUnit(slope.dir);
    const strength = clamp(slope.strength ?? 0, 0, 1);
    ax += dir.x * strength * influence;
    ay += dir.y * strength * influence;
  });
  return { x: ax * SLOPE_FORCE, y: ay * SLOPE_FORCE };
};

function useScreenSize() {
  const getSize = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return { width: window.innerWidth || 375, height: window.innerHeight || 667 };
    }
    const d = Dimensions.get('window');
    return { width: d.width || 375, height: d.height || 667 };
  };
  const [size, setSize] = useState(getSize);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handler = () => setSize({ width: window.innerWidth || 375, height: window.innerHeight || 667 });
      window.addEventListener('resize', handler);
      return () => window.removeEventListener('resize', handler);
    }
    const sub = Dimensions.addEventListener('change', ({ window: w }) => setSize({ width: w.width || 375, height: w.height || 667 }));
    return () => sub?.remove?.();
  }, []);
  return size;
}

export default function App() {
  const { width: screenWidth, height: screenHeight } = useScreenSize();
  const viewWidth = Math.max(screenWidth, 320);
  const viewHeight = Math.max(screenHeight, 568);
  const starField = useMemo(() => {
    const colors = ['#FFFFFF', '#A2D2FF', '#FFC0CB'];
    return Array.from({ length: 72 }, (_, i) => ({
      key: `star-${i}`,
      left: Math.random() * viewWidth,
      top: Math.random() * viewHeight,
      size: 1 + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 0.3 + Math.random() * 0.5
    }));
  }, [viewWidth, viewHeight]);
  const [gameScreen, setGameScreen] = useState('menu'); // 'menu' | 'golfer-select' | 'club-select' | 'courses' | 'editor' | 'playing' | 'golf-story'
  // What to navigate to after the Character → Bag flow. 'course' = normal
  // round picker, 'golf-story' = launch the Golf Story spike with the
  // chosen golfer + bag.
  const [selectionTarget, setSelectionTarget] = useState('course');
  const [selectedGolfer, setSelectedGolfer] = useState(JSON.parse(JSON.stringify(GOLFERS[0])));
  const [selectedBag, setSelectedBag] = useState([...DEFAULT_BAG]);
  const [bagPickerCategory, setBagPickerCategory] = useState('drivers');
  const [editorTab, setEditorTab] = useState('golfer');
  const [equipmentCatalog, setEquipmentCatalog] = useState(JSON.parse(JSON.stringify(EQUIPMENT_CATALOG)));
  const [editorClubId, setEditorClubId] = useState(DEFAULT_BAG[0]);
  const [activeCourseIndex, setActiveCourseIndex] = useState(0);
  const [selectedCourseIndex, setSelectedCourseIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [speechParagraph, setSpeechParagraph] = useState(0);
  const ACTIVE_HOLES = COURSES[activeCourseIndex]?.holes || HOLES;
  const [puttingMode, setPuttingMode] = useState(false);
  const [puttPreview, setPuttPreview] = useState(null);
  const [puttAimPoint, setPuttAimPoint] = useState(null);
  const [puttSimulated, setPuttSimulated] = useState(false);
  const [puttTargetPowerPct, setPuttTargetPowerPct] = useState(null);
  const [puttSwingFeedback, setPuttSwingFeedback] = useState('');
  const basePixelsPerWorld = Math.max(viewWidth / WORLD.w, viewHeight / WORLD.h);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM_INDEX);
  const cameraZoom = CAMERA_ZOOM * ZOOM_STEPS[zoomLevel];
  const pixelsPerWorld = basePixelsPerWorld * cameraZoom;
  const zoomIn = useCallback(() => setZoomLevel((z) => Math.min(ZOOM_STEPS.length - 1, z + 1)), []);
  const zoomOut = useCallback(() => setZoomLevel((z) => Math.max(0, z - 1)), []);
  const halfVpW = (viewWidth / 2) / pixelsPerWorld;
  const halfVpH = (viewHeight / 2) / pixelsPerWorld;

  const [holeIndex, setHoleIndex] = useState(0);
  // Reset zoom when entering/leaving putting mode (putting gets +1 step) and
  // on hole change. New-shot reset happens explicitly in strikeBall.
  useEffect(() => {
    setZoomLevel(puttingMode ? PUTTING_ZOOM_INDEX : DEFAULT_ZOOM_INDEX);
  }, [puttingMode]);
  useEffect(() => {
    setZoomLevel(DEFAULT_ZOOM_INDEX);
  }, [holeIndex]);
  const [strokesCurrent, setStrokesCurrent] = useState(0);
  const [scores, setScores] = useState(Array(ACTIVE_HOLES.length).fill(null));
  const [holeScores, setHoleScores] = useState([]); // array of {hole: number, par: number, strokes: number, name: string}
  const [showScorecard, setShowScorecard] = useState(false);
  const [holeCelebration, setHoleCelebration] = useState(null);
  const [holeOutPhase, setHoleOutPhase] = useState('idle');
  const [roundWind, setRoundWind] = useState(() => generateWind(ACTIVE_HOLES));
  const [ball, setBall] = useState(ACTIVE_HOLES[0].ballStart);
  const [aimAngle, setAimAngle] = useState(getAimAngleToCup(ACTIVE_HOLES[0].ballStart, ACTIVE_HOLES[0].cup));
  const [isAiming, setIsAiming] = useState(false);
  const [sunk, setSunk] = useState(false);
  const [waterNotice, setWaterNotice] = useState(false);
  const [waterDropMenu, setWaterDropMenu] = useState(null); // null or { lastPos, entryPos, hazard }
  const lastShotPosRef = useRef(null); // position before current shot (for stroke & distance)
  const [shotControlOpen, setShotControlOpen] = useState(false);
  const [spinOffset, setSpinOffset] = useState({ x: 0, y: 0 });
  // Shot type — shapes distance and apex on top of power/club. Auto-resets
  // to 'normal' after each shot (same rhythm as spin shaping).
  //   normal: 1.0× / 1.0×
  //   chip:   0.50× carry, 0.70× apex (low flight)
  //   flop:   0.33× carry, 2.00× apex (wedges only)
  //   stinger:1.0×  carry, 0.50× apex (irons/woods only, off tee/fairway)
  //   bump:   0.75× carry, 0.40× apex (wedges only)
  const [shotType, setShotType] = useState('normal');
  const [shotTypeMenuOpen, setShotTypeMenuOpen] = useState(false);
  // Camera focus mode. 'aim' = follow the spot where the ball will land
  // based on the current aim (with a phone-vs-tablet anchor offset).
  // 'golfer' = snap back to the player sprite so you can get your bearings.
  const [cameraFocus, setCameraFocus] = useState('aim');
  const [powerPct, setPowerPct] = useState(0);
  const powerRef = useRef(0);
  const [swingPhase, setSwingPhase] = useState('idle'); // idle | backswing | forward
  const [swingDeviation, setSwingDeviation] = useState(0); // -1 to 1, how far off center on forward swing
  const swingDeviationRef = useRef(0);
  const peakForwardDevRef = useRef(0); // signed forward-swing deviation with largest magnitude (prevents late recovery from erasing mid-swing wobble)
  const swingStartRef = useRef({ x: 0, y: 0 });
  const swingLowestRef = useRef({ x: 0, y: 0 });
  const swingTrailRef = useRef([]); // [{x,y}] trail of forward swing path
  const fullSwingPathRef = useRef([]); // entire drag path for visualization
  const peakPowerRef = useRef(0); // max power reached during backswing
  const backDeviationRef = useRef(0); // backswing L/R deviation (-1 to 1)
  const transitionTimeRef = useRef(0); // timestamp when backswing locked into forward swing
  const backswingStartTimeRef = useRef(0); // timestamp when backswing began
  const shotTracerRef = useRef([]); // world positions for shot tracer
  const [shotTracer, setShotTracer] = useState([]);
  const swingLockedRef = useRef(false); // true once forward swing starts
  const [lastShotStats, setLastShotStats] = useState(null);
  const [showShotStats, setShowShotStats] = useState(false);
  // Swing log: numbered, persisted telemetry for feedback on tempo tuning.
  // Stored in localStorage so IDs persist across reloads. Last 50 swings.
  const [swingLog, setSwingLog] = useState([]);
  const [showSwingLog, setShowSwingLog] = useState(false);
  const [swingLogToast, setSwingLogToast] = useState('');
  const [devMode, setDevMode] = useState(false);
  const pendingSwingRef = useRef(null);
  const nextSwingIdRef = useRef(1);
  const shotStartPosRef = useRef(null);
  const shotLandPosRef = useRef(null);
  const shotPeakHeightRef = useRef(0);
  const shotCarryRef = useRef(0);
  const shotRollRef = useRef(0);
  const shotCurveDegRef = useRef(0);
  // Normalized shot spin (-1 hook … 0 straight … +1 slice). Consumed every
  // tick by the Magnus curve physics; decays over flight.
  const shotSpinNormRef = useRef(0);
  const shotAimAngleRef = useRef(getAimAngleToCup(ACTIVE_HOLES[0].ballStart, ACTIVE_HOLES[0].cup));
  const shotWindResistRef = useRef(1);
  // Set true when the user explicitly taps the Chip button from putting mode.
  // Prevents the green auto-enter effect from immediately re-enabling putting.
  // Cleared on the next shot/hole so auto-putt resumes by default.
  const chipOverrideRef = useRef(false);
  const [currentLie, setCurrentLie] = useState('tee');
  const [selectedClubIndex, setSelectedClubIndex] = useState(15);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [lastShotNote, setLastShotNote] = useState('Tap Yards to shape the shot, then tap the big ball to strike it.');
  const [tempoLabel, setTempoLabel] = useState('Blue dot centered');
  const [golferBallAnchor, setGolferBallAnchor] = useState(ACTIVE_HOLES[0].ballStart);
  const [ballHeight, setBallHeight] = useState(0);
  const [camera, setCamera] = useState({ x: ACTIVE_HOLES[0].ballStart.x, y: ACTIVE_HOLES[0].ballStart.y });
  const cameraRef = useRef({ x: ACTIVE_HOLES[0].ballStart.x, y: ACTIVE_HOLES[0].ballStart.y });
  const clampCameraRef = useRef((c) => c);
  const manualPanUntilRef = useRef(0);
  const panCentroidRef = useRef(null);
  const isTwoFingerPanningRef = useRef(false);
  const webPanStartCameraRef = useRef(null);

  const ballRef = useRef(ball);
  const velocityRef = useRef({ x: 0, y: 0 });
  const flightRef = useRef({ z: 0, vz: 0 });
  const lastTsRef = useRef(null);
  const frameRef = useRef(null);
  const aimFrameRef = useRef(null);
  const cameraFocusRef = useRef('aim');
  const aimAngleRef = useRef(0);
  const courseRef = useRef(null);
  const courseFrameRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const sunkRef = useRef(false);
  // Drives the drop-into-cup animation. 'dropping' → gravity fall; 'inCup' →
  // settled at the bottom of the cup. The tick loop reads this so it can
  // keep the vertical physics alive after sunk is true.
  const holeOutPhaseRef = useRef('idle');
  const holeIndexRef = useRef(0);
  const roundWindRef = useRef(roundWind);
  const [draggingSpinDot, setDraggingSpinDot] = useState(false);

  // Load swing log from localStorage once on mount. Also seeds the ID
  // counter so fresh swings continue numbering from where we left off.
  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      const stored = localStorage.getItem('atlasGolfSwingLog');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSwingLog(parsed);
          const maxId = parsed.reduce((m, e) => Math.max(m, e.idNum || 0), 0);
          nextSwingIdRef.current = maxId + 1;
        }
      }
      const devStored = localStorage.getItem('atlasGolfDevMode');
      if (devStored === '1') setDevMode(true);
    } catch (err) { /* ignore */ }
  }, []);

  // Persist dev-mode toggle so it survives reloads.
  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem('atlasGolfDevMode', devMode ? '1' : '0');
    } catch (err) { /* ignore */ }
  }, [devMode]);

  const pushSwingLog = (entry) => {
    setSwingLog((prev) => {
      const next = [entry, ...prev].slice(0, 50);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('atlasGolfSwingLog', JSON.stringify(next));
        }
      } catch (err) { /* ignore quota errors */ }
      return next;
    });
  };

  const copyToClipboard = async (text) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback: create a hidden textarea, select, execCommand
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      return true;
    } catch { return false; }
  };

  const copySwingEntry = async (entry) => {
    const ok = await copyToClipboard(JSON.stringify(entry, null, 2));
    setSwingLogToast(ok ? `Swing #${entry.id} copied` : 'Copy failed');
    setTimeout(() => setSwingLogToast(''), 1800);
  };

  const safeHoleIndex = clamp(holeIndex, 0, Math.max(0, ACTIVE_HOLES.length - 1));
  const currentHole = ACTIVE_HOLES[safeHoleIndex] || ACTIVE_HOLES[0];
  const selectedClub = CLUBS[selectedClubIndex];
  const selectedGolferStats = selectedGolfer?.stats || {};
  const selectedMentalStats = selectedGolfer?.mental || {};
  const selectedEquipmentItem = useMemo(() => {
    // Prefer what the player actually put in their bag. Without this, having
    // a Generic Driver + a Pro Driver both in the catalog silently always
    // picked whichever was listed first in EQUIPMENT_CATALOG, so swapping
    // gear in BUILD YOUR BAG never changed what club you swung.
    const findInCatalog = (id) => {
      for (const category of Object.values(equipmentCatalog)) {
        const item = category.find((it) => it.id === id);
        if (item) return item;
      }
      return null;
    };
    for (const id of selectedBag) {
      const item = findInCatalog(id);
      if (item && item.clubKey === selectedClub.key) return item;
    }
    // Fallback for bag-less edge cases (e.g., a putter missing from the bag).
    for (const category of Object.values(equipmentCatalog)) {
      const found = category.find((item) => item.clubKey === selectedClub.key);
      if (found) return found;
    }
    return null;
  }, [selectedBag, equipmentCatalog, selectedClub.key]);
  const selectedClubStats = selectedEquipmentItem?.stats || {};
  const scaleX = pixelsPerWorld;
  const scaleY = pixelsPerWorld;
  const ballRadius = clamp(BALL_RADIUS_WORLD * pixelsPerWorld * 0.48 * 0.6, 3, 10);
  const cupRadius = clamp(CUP_RADIUS_WORLD * pixelsPerWorld * 0.32, 6, 14);
  const clampCamera = (c) => ({
    x: clamp(c.x, halfVpW, WORLD.w - halfVpW),
    y: clamp(c.y, halfVpH, WORLD.h - halfVpH)
  });
  clampCameraRef.current = clampCamera;
  const ballMoving =
    magnitude(velocityRef.current) > 0.3 ||
    flightRef.current.z > 0.04 ||
    Math.abs(flightRef.current.vz) > 0.35;
  // At rest the ball sits mid-screen so there's room for the aim line above
  // AND the bottom HUD below. During flight / on the green we center hard.
  const cameraAnchorY = (!ballMoving && !puttingMode) ? viewHeight * 0.55 : viewHeight / 2;

  // Given a ball position and a target (usually the cup), produce a camera
  // position that keeps the ball inside the viewport while biasing the view
  // toward the target so the aim line leads into the visible area. Used on
  // hole load and every time the ball settles so the camera never snaps back
  // to a "neutral" orientation that ignores which way the hole plays.
  const cameraForShot = (ballPos, targetPos) => {
    if (!targetPos) return clampCamera(ballPos);
    const dx = targetPos.x - ballPos.x;
    const dy = targetPos.y - ballPos.y;
    let target = {
      x: ballPos.x + dx * 0.4,
      y: ballPos.y + dy * 0.4
    };
    const padPx = 80;
    const anchorY = viewHeight * 0.74;
    const ppw = Math.max(0.0001, pixelsPerWorld);
    const ballScreenX = (ballPos.x - target.x) * ppw + viewWidth / 2;
    const ballScreenY = (ballPos.y - target.y) * ppw + anchorY;
    if (ballScreenX < padPx) target.x -= (padPx - ballScreenX) / ppw;
    if (ballScreenX > viewWidth - padPx) target.x += (ballScreenX - (viewWidth - padPx)) / ppw;
    if (ballScreenY < padPx) target.y -= (padPx - ballScreenY) / ppw;
    if (ballScreenY > viewHeight - padPx) target.y += (ballScreenY - (viewHeight - padPx)) / ppw;
    return clampCamera(target);
  };

  // Frame the camera around where the ball will land based on current aim.
  // On phone, put the landing spot ~22% down from the top (top-middle
  // anchor). On tablet, push it to the right side (~72% across, middle
  // vertically) so the left side stays available for swing input. Always
  // keep the ball itself visible with a padding fallback.
  const isTablet = viewWidth >= 700;
  const cameraForAim = (ballPos, aimAng, distanceWorld) => {
    const ppw = Math.max(0.0001, pixelsPerWorld);
    const land = {
      x: ballPos.x + Math.cos(aimAng) * distanceWorld,
      y: ballPos.y + Math.sin(aimAng) * distanceWorld,
    };
    // Desired screen position of the landing spot.
    const desiredSx = isTablet ? viewWidth * 0.72 : viewWidth / 2;
    const desiredSy = isTablet ? viewHeight * 0.5 : viewHeight * 0.22;
    // Solve for camera such that toScreen(land) = desired.
    //   sx = (land.x - cam.x) * ppw + viewWidth/2   ⇒ cam.x = land.x + (viewWidth/2 - desiredSx)/ppw
    //   sy = (land.y - cam.y) * ppw + cameraAnchorY ⇒ cam.y = land.y + (cameraAnchorY - desiredSy)/ppw
    const anchorY = viewHeight * 0.74;
    let target = {
      x: land.x + (viewWidth / 2 - desiredSx) / ppw,
      y: land.y + (anchorY - desiredSy) / ppw,
    };
    // Keep the ball in the viewport even if the landing point is near the
    // edge (bigger pad than cameraForShot so the swing sprite stays in view).
    const padPx = 70;
    const ballScreenX = (ballPos.x - target.x) * ppw + viewWidth / 2;
    const ballScreenY = (ballPos.y - target.y) * ppw + anchorY;
    if (ballScreenX < padPx) target.x -= (padPx - ballScreenX) / ppw;
    if (ballScreenX > viewWidth - padPx) target.x += (ballScreenX - (viewWidth - padPx)) / ppw;
    if (ballScreenY < padPx) target.y -= (padPx - ballScreenY) / ppw;
    if (ballScreenY > viewHeight - padPx) target.y += (ballScreenY - (viewHeight - padPx)) / ppw;
    return clampCamera(target);
  };

  const syncCourseFrame = () => {
    if (!courseRef.current || typeof courseRef.current.measureInWindow !== 'function') {
      return;
    }
    courseRef.current.measureInWindow((x, y, width, height) => {
      courseFrameRef.current = { x, y, width, height };
    });
  };

  const toScreen = (p) => ({
    x: (p.x - cameraRef.current.x) * pixelsPerWorld + viewWidth / 2,
    y: (p.y - cameraRef.current.y) * pixelsPerWorld + cameraAnchorY
  });
  const toWorld = (p) => ({
    x: cameraRef.current.x + (p.x - viewWidth / 2) / pixelsPerWorld,
    y: cameraRef.current.y + (p.y - cameraAnchorY) / pixelsPerWorld
  });

  const resetBall = ({ penaltyStroke = false } = {}) => {
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    setPuttingMode(false);
    setPuttPreview(null);
    setPuttAimPoint(null);
    setPuttSimulated(false);
    setPuttTargetPowerPct(null);
    setPuttSwingFeedback('');
    powerRef.current = 0; setPowerPct(0);
    shotCurveDegRef.current = 0;
    shotAimAngleRef.current = getAimAngleToCup(currentHole.ballStart, currentHole.cup);
    setTempoLabel('Blue dot centered');
    const nc = cameraForShot(currentHole.ballStart, currentHole.cup);
    setCamera(nc);
    cameraRef.current = nc;
    manualPanUntilRef.current = 0;
    if (penaltyStroke) {
      setStrokesCurrent((s) => s + 1);
      setWaterNotice(true);
    }
  };

  const retryHole = () => {
    setSunk(false);
    setHoleOutPhase('idle');
    setHoleCelebration(null);
    setShowScorecard(false);
    setWaterNotice(false);
    setWaterDropMenu(null);
    setStrokesCurrent(0);
    setScores((prev) => {
      const next = [...prev];
      next[holeIndex] = null;
      return next;
    });
    setHoleScores((prev) => prev.filter((entry) => entry.hole !== holeIndex + 1));
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    setPuttingMode(false);
    setPuttPreview(null);
    setPuttAimPoint(null);
    setPuttSimulated(false);
    setPuttTargetPowerPct(null);
    setPuttSwingFeedback('');
    powerRef.current = 0; setPowerPct(0);
    shotCurveDegRef.current = 0;
    shotAimAngleRef.current = getAimAngleToCup(currentHole.ballStart, currentHole.cup);
    setTempoLabel('Blue dot centered');
    setLastShotNote('Tap Yards to shape the shot, then tap the big ball to strike it.');
    const nc = cameraForShot(currentHole.ballStart, currentHole.cup);
    setCamera(nc);
    cameraRef.current = nc;
    manualPanUntilRef.current = 0;
  };

  const goToNextHole = () => {
    if (isLastHole) {
      return;
    }
    setShowScorecard(false);
    setHoleIndex((h) => h + 1);
  };

  const startNewRound = () => {
    setShowScorecard(false);
    setHoleScores([]);
    setScores(Array(ACTIVE_HOLES.length).fill(null));
    setRoundWind(generateWind(ACTIVE_HOLES));
    setHoleIndex(0);
  };

  const startCourse = (courseIndex) => {
    const holes = COURSES[courseIndex]?.holes || HOLES;
    const firstHole = holes[0];
    const firstBall = firstHole?.ballStart || { x: WORLD.w / 2, y: WORLD.h / 2 };
    const firstCup = firstHole?.cup || firstBall;
    const startCamera = cameraForShot(firstBall, firstCup);

    setActiveCourseIndex(courseIndex);
    setGameScreen('playing');
    setMenuOpen(false);
    setClubPickerOpen(false);
    setHoleIndex(0);
    setStrokesCurrent(0);
    setScores(Array(holes.length).fill(null));
    setHoleScores([]);
    setShowScorecard(false);
    setRoundWind(generateWind(holes));
    setSunk(false);
    setWaterNotice(false);
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    setPuttingMode(false);
    setPuttPreview(null);
    setPuttAimPoint(null);
    setPuttSimulated(false);
    setPuttTargetPowerPct(null);
    setPuttSwingFeedback('');
    powerRef.current = 0;
    setPowerPct(0);
    shotCurveDegRef.current = 0;
    shotAimAngleRef.current = getAimAngleToCup(firstBall, firstCup);
    setAimAngle(getAimAngleToCup(firstBall, firstCup));
    setBall(firstBall);
    ballRef.current = firstBall;
    setGolferBallAnchor(firstBall);
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setCurrentLie('tee');
    setTempoLabel('Blue dot centered');
    setLastShotNote('Tap Yards to shape the shot, then tap the big ball to strike it.');
    setCamera(startCamera);
    cameraRef.current = startCamera;
    manualPanUntilRef.current = 0;
  };

  // Water drop options
  const handleWaterDrop = (dropPos) => {
    setWaterDropMenu(null);
    setWaterNotice(false);
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setBall(dropPos);
    ballRef.current = dropPos;
    setGolferBallAnchor(dropPos);
    setAimAngle(getAimAngleToCup(dropPos, currentHole.cup));
    shotAimAngleRef.current = getAimAngleToCup(dropPos, currentHole.cup);
    setIsAiming(false);
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    setPuttingMode(false);
    setPuttPreview(null);
    setPuttAimPoint(null);
    setPuttSimulated(false);
    setPuttTargetPowerPct(null);
    setPuttSwingFeedback('');
    powerRef.current = 0;
    setPowerPct(0);
    shotCurveDegRef.current = 0;
    setTempoLabel('Blue dot centered');
    setCurrentLie(getSurfaceAtPoint(currentHole, dropPos));
    const nc = cameraForShot(dropPos, currentHole.cup);
    setCamera(nc);
    cameraRef.current = nc;
    manualPanUntilRef.current = 0;
    // Auto-select club for drop distance
    const distYards = Math.hypot(currentHole.cup.x - dropPos.x, currentHole.cup.y - dropPos.y) * YARDS_PER_WORLD;
    let bestIdx = CLUBS.length - 1;
    let bestDiff = Infinity;
    for (let i = 1; i < CLUBS.length; i++) {
      const diff = Math.abs(CLUBS[i].carryYards - distYards);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    setSelectedClubIndex(bestIdx);
  };

  const backToMenu = () => {
    setGameScreen('menu');
    setMenuOpen(false);
    setShowScorecard(false);
    setHoleIndex(0);
    setScores(Array(ACTIVE_HOLES.length).fill(null));
    setHoleScores([]);
  };

  useEffect(() => { ballRef.current = ball; }, [ball]);
  useEffect(() => { cameraRef.current = camera; }, [camera]);
  useEffect(() => { sunkRef.current = sunk; }, [sunk]);
  useEffect(() => { cameraFocusRef.current = cameraFocus; }, [cameraFocus]);
  useEffect(() => { aimAngleRef.current = aimAngle; }, [aimAngle]);
  useEffect(() => { holeOutPhaseRef.current = holeOutPhase; }, [holeOutPhase]);
  useEffect(() => { holeIndexRef.current = safeHoleIndex; }, [safeHoleIndex]);
  useEffect(() => { roundWindRef.current = roundWind; }, [roundWind]);
  useEffect(() => { setSelectedCourseIndex(activeCourseIndex); }, [activeCourseIndex]);

  useEffect(() => {
    if (ballMoving) {
      return;
    }
    setGolferBallAnchor((prev) => {
      const dx = prev.x - ball.x;
      const dy = prev.y - ball.y;
      if (Math.hypot(dx, dy) < 0.05) {
        return prev;
      }
      return ball;
    });
  }, [ball, ballMoving]);

  useEffect(() => {
    setSunk(false);
    setShowScorecard(false);
    setWaterNotice(false);
    setWaterDropMenu(null);
    setStrokesCurrent(0);
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    setPuttingMode(false);
    setPuttPreview(null);
    setPuttAimPoint(null);
    setPuttSimulated(false);
    setPuttTargetPowerPct(null);
    setPuttSwingFeedback('');
    powerRef.current = 0; setPowerPct(0);
    shotCurveDegRef.current = 0;
    shotAimAngleRef.current = getAimAngleToCup(currentHole.ballStart, currentHole.cup);
    setTempoLabel('Blue dot centered');
    setLastShotNote('Tap Yards to shape the shot, then tap the big ball to strike it.');
    // On hole change, jump the camera to a position that shows the ball and
    // aims into the hole direction instead of inheriting the previous hole's
    // view and then drifting.
    {
      const nc = cameraForShot(currentHole.ballStart, currentHole.cup);
      setCamera(nc);
      cameraRef.current = nc;
      manualPanUntilRef.current = 0;
    }
    // Auto-select club based on par and distance
    const holeDistYards = Math.hypot(currentHole.cup.x - currentHole.ballStart.x, currentHole.cup.y - currentHole.ballStart.y) * YARDS_PER_WORLD;
    if (currentHole.par >= 4) {
      setSelectedClubIndex(CLUBS.length - 1); // Driver
    } else {
      // Par 3: find club closest to hole distance
      let bestIdx = CLUBS.length - 1;
      let bestDiff = Infinity;
      for (let i = 1; i < CLUBS.length; i++) { // skip putter
        const diff = Math.abs(CLUBS[i].carryYards - holeDistYards);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
      setSelectedClubIndex(bestIdx);
    }
  }, [holeIndex, currentHole.ballStart, currentHole.cup]);

  useEffect(() => {
    const tick = (ts) => {
      if (lastTsRef.current == null) {
        lastTsRef.current = ts;
      }
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.033);
      lastTsRef.current = ts;


      const tickSunk = sunkRef.current;
      const tickHole = ACTIVE_HOLES[holeIndexRef.current] || ACTIVE_HOLES[0];
      // Hole-out drop physics: the ball is in the cup and falling. Run a
      // pure vertical parabola with a single damped bounce off the cup
      // bottom, then latch to 'inCup' so it sits visibly at rest.
      if (tickSunk && holeOutPhaseRef.current === 'dropping') {
        const flight = flightRef.current;
        flight.vz -= GRAVITY * dt;
        flight.z += flight.vz * dt;
        const CUP_BOTTOM_Z = -1.1;
        if (flight.z <= CUP_BOTTOM_Z) {
          flight.z = CUP_BOTTOM_Z;
          if (Math.abs(flight.vz) > 1.2) {
            flight.vz = -flight.vz * 0.28;
          } else {
            flight.vz = 0;
            setHoleOutPhase('inCup');
            holeOutPhaseRef.current = 'inCup';
            setTimeout(() => {
              setHoleOutPhase('settled');
              holeOutPhaseRef.current = 'settled';
            }, 600);
          }
        }
        setBallHeight(flight.z);
      }
      if (!tickSunk) {
        const vel = velocityRef.current;
        const flight = flightRef.current;
        const speed = magnitude(vel);
        const movingVertically = flight.z > 0.01 || Math.abs(flight.vz) > 0.15;

        if (speed > 0.3 || movingVertically) {
          const surfaceNamePre = getSurfaceAtPoint(tickHole, ballRef.current);
          const surfacePhysics = SURFACE_PHYSICS[surfaceNamePre] || SURFACE_PHYSICS.rough;
          const onGround = flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.3;

          // Apply drag BEFORE position update so distance matches physics sim
          if (onGround) {
            const dragFactor = Math.max(0, 1 - surfacePhysics.rollFriction * dt);
            vel.x *= dragFactor;
            vel.y *= dragFactor;
            const slopeAccel = getGreenSlopeForce(tickHole, ballRef.current, surfaceNamePre);
            // Keep slope alive on slower putts so break still shows near the cup
            const slopeSpeedCap = surfaceNamePre === 'green' || surfaceNamePre === 'fringe'
              ? clamp(0.45 + speed / 2.5, 0.45, 1.25)
              : Math.min(1.0, speed / 2.0);
            vel.x += slopeAccel.x * slopeSpeedCap * dt;
            vel.y += slopeAccel.y * slopeSpeedCap * dt;
          } else {
            const airDrag = Math.max(0, 1 - 0.14 * dt);
            vel.x *= airDrag;
            vel.y *= airDrag;
            // Wind force while airborne — scales with ball HEIGHT so chips and
            // low-line pitches are barely affected while high arcs get the full
            // push. Real golf: a low chip stays under the wind; only high
            // shots get carried. heightGate ramps 0→1 over 0–6 world units of
            // altitude, which roughly matches "above the crowd" threshold.
            const wind = roundWindRef.current[holeIndexRef.current] || { speed: 0, dir: 'N' };
            const wDir = WIND_DIRS[wind.dir] || { x: 0, y: 0 };
            const heightGate = Math.min(1, Math.max(0, flight.z / 6));
            const wForce = wind.speed * WIND_FORCE_SCALE * shotWindResistRef.current * heightGate * dt;
            vel.x += wDir.x * wForce;
            vel.y += wDir.y * wForce;

            // Magnus-style progressive curve — sideways acceleration
            // perpendicular to the ball's CURRENT velocity direction, not
            // to the player's aim. This way the curve always feels tangent
            // to the flight path (real golf physics) and preview matches
            // flight regardless of how much the shot has already drifted.
            if (flight.z > 0.3 && Math.abs(shotSpinNormRef.current) > 0.005) {
              const speed = Math.hypot(vel.x, vel.y);
              if (speed > 1) {
                const ux = vel.x / speed, uy = vel.y / speed;
                // 90° counter-clockwise = player's LEFT when facing travel.
                // Negative spinNorm = hook (pull), positive = slice (push).
                // Multiplying by -spinNorm sends sliced balls to the
                // player's RIGHT, hooked balls to the player's LEFT.
                const px = -uy, py = ux;
                const sideAccel = -shotSpinNormRef.current * speed * CURVE_STRENGTH;
                vel.x += px * sideAccel * dt;
                vel.y += py * sideAccel * dt;
              }
              shotSpinNormRef.current *= Math.pow(CURVE_SPIN_DECAY_PER_SEC, 60 * dt);
            }
          }

          // Update vertical physics but DO NOT bounce yet — we first want to
          // check if the ball is about to land in water. Previously the
          // bounce ran before the water check, so the ball visibly popped
          // back up for one frame before splashing.
          flight.vz -= GRAVITY * dt;
          flight.z += flight.vz * dt;

          // Position update uses post-drag velocity.
          let next = {
            x: ballRef.current.x + vel.x * dt,
            y: ballRef.current.y + vel.y * dt
          };

          // Peek: is the ball at (or beneath) the ground AND in a water
          // area at its new position? If so, splash it NOW — skip bounce.
          // Also fires for a ball rolling along the ground into a pond.
          const aboutToLand = flight.z <= 0.5 || (flight.vz < 0 && flight.z <= 1.5);
          const waterHazEarly = aboutToLand ? findWaterHazAt(tickHole, next) : null;
          let waterHaz = waterHazEarly;

          if (!waterHaz) {
            // Normal path: apply the ground bounce.
            if (flight.z <= 0) {
              const impactVz = Math.abs(flight.vz);
              flight.z = 0;
              if (impactVz > MIN_BOUNCE_VZ) {
                flight.vz = impactVz * surfacePhysics.bounce;
                vel.x *= surfacePhysics.landingDamping;
                vel.y *= surfacePhysics.landingDamping;
              } else {
                flight.vz = 0;
              }
            }
          } else {
            // Ball is hitting water — pin z to 0 so the splash visual lines
            // up with the surface instead of appearing from below ground.
            flight.z = 0;
          }

          const restitution = surfacePhysics.wallRestitution;
          // Always resolve collisions — trees now have height, so airborne
          // shots can clip branches/trunk. Rect walls stay ground-only (gated
          // inside the resolver).
          next = resolveGroundCollisions(tickHole, next, vel, restitution, flight, dt);

          // Track peak height
          if (flight.z > shotPeakHeightRef.current) shotPeakHeightRef.current = flight.z;

          // Track carry (first landing)
          if (flight.z <= GROUND_EPSILON && shotLandPosRef.current === null && shotStartPosRef.current) {
            shotLandPosRef.current = { x: next.x, y: next.y };
            shotCarryRef.current = Math.hypot(next.x - shotStartPosRef.current.x, next.y - shotStartPosRef.current.y) * YARDS_PER_WORLD;
          }

          // Secondary water catch: rolling along the ground into water even
          // without the "aboutToLand" flag (e.g., already at z=0 rolling).
          if (!waterHaz && flight.z <= 0.5) {
            waterHaz = findWaterHazAt(tickHole, next);
          }
          if (waterHaz) {
            // Ball entered water — stop motion, sink the ball, show relief menu.
            // Real golf penalty-area rules (USGA Rule 17): +1 stroke plus one
            // of three relief options. We expose all three: stroke-and-distance,
            // lateral (2 club-lengths of entry, no nearer the hole), and
            // back-on-the-line (flag through entry, drop anywhere behind entry).
            vel.x = 0;
            vel.y = 0;
            flight.z = 0;
            flight.vz = 0;
            const entryPos = { ...ballRef.current };
            const lastPos = lastShotPosRef.current || tickHole.ballStart;
            // Lateral relief — drop just outside the nearest edge of the water.
            const edgeDists = [
              { d: Math.abs(entryPos.x - waterHaz.x), pos: { x: waterHaz.x - 18, y: entryPos.y } },
              { d: Math.abs(entryPos.x - (waterHaz.x + waterHaz.w)), pos: { x: waterHaz.x + waterHaz.w + 18, y: entryPos.y } },
              { d: Math.abs(entryPos.y - waterHaz.y), pos: { x: entryPos.x, y: waterHaz.y - 18 } },
              { d: Math.abs(entryPos.y - (waterHaz.y + waterHaz.h)), pos: { x: entryPos.x, y: waterHaz.y + waterHaz.h + 18 } }
            ];
            edgeDists.sort((a, b) => a.d - b.d);
            const lateralDrop = edgeDists[0].pos;
            // Back-on-the-line — along the flag→entry vector, 8 yards further
            // from the hole than the entry point.
            const cup = tickHole.cup;
            const flagDx = entryPos.x - cup.x;
            const flagDy = entryPos.y - cup.y;
            const flagLen = Math.hypot(flagDx, flagDy) || 1;
            const backDist = 8 / YARDS_PER_WORLD;
            const backDrop = {
              x: entryPos.x + (flagDx / flagLen) * backDist,
              y: entryPos.y + (flagDy / flagLen) * backDist
            };
            setBall({ x: -100, y: -100 });
            ballRef.current = { x: -100, y: -100 };
            setBallHeight(0);
            setWaterDropMenu({ lastPos, entryPos: lateralDrop, backDrop, hazard: waterHaz });
            setWaterNotice(true);
            setStrokesCurrent((s) => s + 1);
          } else {
            ballRef.current = next;
            setBall(next);
            setBallHeight(flight.z);
            // Record tracer points (every 3rd tick to keep it lightweight)
            if (flight.z > 0.1 && shotTracerRef.current.length % 1 === 0) {
              const maxTracerYards = 200;
              const maxTracerWorld = maxTracerYards / YARDS_PER_WORLD;
              const trail = shotTracerRef.current;
              // Only keep tail within 200 yards of current position
              while (trail.length > 0 && Math.hypot(next.x - trail[0].x, next.y - trail[0].y) > maxTracerWorld) {
                trail.shift();
              }
              trail.push({ x: next.x, y: next.y, z: flight.z });
              setShotTracer([...trail]);
            }
          }

          if (magnitude(vel) < 6 && flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.35) {
            vel.x = 0;
            vel.y = 0;
          }
          if (flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.35) {
            flight.z = 0;
            flight.vz = 0;
          }

          // Ball stopped — compute final stats
          if (magnitude(vel) < 0.3 && flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.15 && shotStartPosRef.current) {
            shotTracerRef.current = [];
            setShotTracer([]);
            const totalDist = Math.round(Math.hypot(next.x - shotStartPosRef.current.x, next.y - shotStartPosRef.current.y) * YARDS_PER_WORLD);
            const carry = Math.round(shotCarryRef.current);
            const roll = Math.max(0, totalDist - carry);
            const endLie = getSurfaceAtPoint(tickHole, next);
            setCurrentLie(endLie);
            setLastShotStats(prev => prev ? {
              ...prev,
              carry,
              roll,
              totalDist,
              peakHeight: Math.round(shotPeakHeightRef.current * 3),
              endLie,
              swingId: pendingSwingRef.current?.id,
            } : null);
            setShowShotStats(true);
            // Finalise the pending swing record and push to the log.
            if (pendingSwingRef.current) {
              const entry = {
                ...pendingSwingRef.current,
                shot: {
                  carry,
                  roll,
                  totalDist,
                  peakHeightFt: Math.round(shotPeakHeightRef.current * 3),
                  curveDeg: Math.round(shotCurveDegRef.current * 10) / 10,
                  endLie,
                },
              };
              pushSwingLog(entry);
              pendingSwingRef.current = null;
            }
            shotStartPosRef.current = null;
            // Auto-select best club for remaining distance
            if (endLie !== 'green') {
              const remainYards = Math.hypot(tickHole.cup.x - next.x, tickHole.cup.y - next.y) * YARDS_PER_WORLD;
              let autoBest = CLUBS.length - 1;
              let autoBestDiff = Infinity;
              for (let ci = 1; ci < CLUBS.length; ci++) {
                const d = Math.abs(CLUBS[ci].carryYards - remainYards);
                if (d < autoBestDiff) { autoBestDiff = d; autoBest = ci; }
              }
              setSelectedClubIndex(autoBest);
            }
          }
        }
      }

      // Camera auto-follow — ONLY while the ball is in motion. Once it comes
      // to rest, the camera stays wherever the player put it (initial shot
      // framing handled by the ball-at-rest effect below). Previously this
      // kept pulling the view back to cameraForShot every frame, producing a
      // "snap back" after the user panned away.
      const nowMs = Date.now();
      if (nowMs >= manualPanUntilRef.current) {
        const vel = velocityRef.current;
        const ballPos = ballRef.current;
        const velMag = magnitude(vel);
        if (velMag > 0.6) setCamera((prev) => {
          const target = clampCameraRef.current({
            x: ballPos.x + clamp(vel.x * 0.025, -5, 5),
            y: ballPos.y + clamp(vel.y * 0.025, -7, 7)
          });
          const ease = velMag > 1 ? 0.14 : 0.08;
          const next = clampCameraRef.current({
            x: prev.x + (target.x - prev.x) * ease,
            y: prev.y + (target.y - prev.y) * ease
          });
          if (Math.hypot(next.x - prev.x, next.y - prev.y) < 0.001) return prev;
          return next;
        });
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    // Aim-follow: whenever the ball is at rest and camera focus is 'aim',
    // nudge the camera to put the projected landing spot at the phone top-
    // middle (or tablet right-middle) so the player sees where they're
    // pointing. Runs at a slower cadence than the flight follow so
    // rapid aim-drag stays smooth.
    const aimFrame = () => {
      if (!sunkRef.current) {
        const movingNow = magnitude(velocityRef.current) > 0.3
          || flightRef.current.z > 0.04
          || Math.abs(flightRef.current.vz) > 0.35;
        if (!movingNow && cameraFocusRef.current === 'aim' && Date.now() >= manualPanUntilRef.current) {
          const distWorld = (selectedClub?.carryYards || 200) / YARDS_PER_WORLD;
          const cam = cameraForAim(ballRef.current, aimAngleRef.current, distWorld);
          setCamera((prev) => {
            const ease = 0.18;
            return {
              x: prev.x + (cam.x - prev.x) * ease,
              y: prev.y + (cam.y - prev.y) * ease,
            };
          });
        }
      }
      aimFrameRef.current = requestAnimationFrame(aimFrame);
    };
    aimFrameRef.current = requestAnimationFrame(aimFrame);

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      if (aimFrameRef.current) {
        cancelAnimationFrame(aimFrameRef.current);
      }
      lastTsRef.current = null;
    };
  }, []);

  // When the user flips the camera-focus toggle to 'golfer', snap once to
  // the ball's current position so they see the player in frame. Don't
  // subscribe to ball movement here — that would fight the flight follow.
  useEffect(() => {
    if (cameraFocus === 'golfer' && !sunk) {
      const b = ballRef.current;
      const nc = clampCameraRef.current ? clampCameraRef.current(b) : b;
      setCamera(nc);
      cameraRef.current = nc;
    }
  }, [cameraFocus, sunk]);

  useEffect(() => {
    if (sunk || currentHole.isRange) {
      return;
    }
    if (ballHeight > 0.28 || Math.abs(flightRef.current.vz) > 0.5) {
      return;
    }
    const speed = magnitude(velocityRef.current);
    const dx = ball.x - currentHole.cup.x;
    const dy = ball.y - currentHole.cup.y;
    const dist = Math.hypot(dx, dy);
    const captureRadius = CUP_RADIUS_WORLD;
    // Allow the ball to go in 25% faster than before (was < 14).
    const slowEnough = speed < 17.5;
    if (dist < captureRadius && slowEnough) {
      setSunk(true);
      // Freeze horizontal motion — ball is captured by the cup — but start
      // a small downward velocity so the drop reads as physics, not a jump.
      // The tick loop updates flight.z with gravity until it hits the cup
      // bottom, bounces once, then settles.
      velocityRef.current = { x: 0, y: 0 };
      flightRef.current = { z: 0.55, vz: -2.2 };
      const scoreDiff = strokesCurrent - currentHole.par;
      const resultLabel = scoreDiff <= -2 ? 'Eagle or better' : scoreDiff === -1 ? 'Birdie' : scoreDiff === 0 ? 'Par' : scoreDiff === 1 ? 'Bogey' : 'Double+';
      // Mood-matched emojis: Birdie hands-up, Par peace sign, Bogey head-down.
      const emote = scoreDiff <= -2 ? '🔥' : scoreDiff === -1 ? '🙌' : scoreDiff === 0 ? '✌️' : scoreDiff === 1 ? '😞' : '😵';
      setHoleCelebration({ resultLabel, emote, scoreDiff });
      setHoleOutPhase('dropping');
      holeOutPhaseRef.current = 'dropping';
      setShowShotStats(false);
      setBallHeight(0.55);
      setBall(currentHole.cup);
      ballRef.current = currentHole.cup;
      setHoleScores((prev) => [
        ...prev,
        { hole: holeIndex + 1, par: currentHole.par, strokes: strokesCurrent, name: currentHole.name }
      ]);
      setScores((prev) => {
        const next = [...prev];
        next[holeIndex] = strokesCurrent;
        return next;
      });
      // Phase transitions are handled by the tick loop when physics settles.
      // We only schedule the scorecard here so the celebration can play.
      setTimeout(() => {
        setShowScorecard(true);
      }, 2400);
    }
  }, [ball, ballHeight, currentHole.cup.x, currentHole.cup.y, holeIndex, strokesCurrent, sunk]);

  useEffect(() => {
    setCamera((prev) => clampCamera(prev));
  }, [halfVpH, halfVpW]);

  useEffect(() => {
    if (sunk) {
      setPuttingMode(false);
      setPuttPreview(null);
      setPuttAimPoint(null);
      setPuttSimulated(false);
      setPuttTargetPowerPct(null);
      setPuttSwingFeedback('');
      return;
    }
    // If the ball is sitting in water (came to rest on the pond without
    // the motion-tick trigger catching it), splash it now and show the
    // penalty menu. We only do this when the ball is actually at rest and
    // visible — (-100,-100) means a water trigger already fired.
    if (!ballMoving && !waterDropMenu && ball.x > -50 && ball.y > -50) {
      const waterHaz = findWaterHazAt(currentHole, ball);
      if (waterHaz) {
        const entryPos = { x: ball.x, y: ball.y };
        const lastPos = lastShotPosRef.current || currentHole.ballStart;
        const edgeDists = [
          { d: Math.abs(entryPos.x - waterHaz.x), pos: { x: waterHaz.x - 18, y: entryPos.y } },
          { d: Math.abs(entryPos.x - (waterHaz.x + waterHaz.w)), pos: { x: waterHaz.x + waterHaz.w + 18, y: entryPos.y } },
          { d: Math.abs(entryPos.y - waterHaz.y), pos: { x: entryPos.x, y: waterHaz.y - 18 } },
          { d: Math.abs(entryPos.y - (waterHaz.y + waterHaz.h)), pos: { x: entryPos.x, y: waterHaz.y + waterHaz.h + 18 } }
        ];
        edgeDists.sort((a, b) => a.d - b.d);
        const lateralDrop = edgeDists[0].pos;
        const cup = currentHole.cup;
        const flagDx = entryPos.x - cup.x;
        const flagDy = entryPos.y - cup.y;
        const flagLen = Math.hypot(flagDx, flagDy) || 1;
        const backDist = 8 / YARDS_PER_WORLD;
        const backDrop = {
          x: entryPos.x + (flagDx / flagLen) * backDist,
          y: entryPos.y + (flagDy / flagLen) * backDist
        };
        setBall({ x: -100, y: -100 });
        ballRef.current = { x: -100, y: -100 };
        setBallHeight(0);
        velocityRef.current = { x: 0, y: 0 };
        flightRef.current = { z: 0, vz: 0 };
        setWaterDropMenu({ lastPos, entryPos: lateralDrop, backDrop, hazard: waterHaz });
        setWaterNotice(true);
        setStrokesCurrent((s) => s + 1);
        return;
      }
    }
    const lie = getSurfaceAtPoint(currentHole, ball);
    if (lie !== currentLie) {
      setCurrentLie(lie);
    }
    const onPuttingSurface = lie === 'green' || lie === 'fringe';

    if (puttingMode && !onPuttingSurface) {
      setPuttingMode(false);
      setPuttPreview(null);
      setPuttAimPoint(null);
      setPuttSimulated(false);
      setPuttTargetPowerPct(null);
      setPuttSwingFeedback('');
      return;
    }

    // Auto-enter putting mode on green only (fringe lets you choose).
    // Skip if the user just tapped Chip — we don't want the effect to
    // re-enable putting and undo their choice.
    if (!ballMoving && lie === 'green' && !puttingMode && !chipOverrideRef.current) {
      setPuttingMode(true);
      setSelectedClubIndex(0);
      setShotControlOpen(false);
      setSpinOffset({ x: 0, y: 0 });
      setPuttPreview(null);
      // Auto-aim the putt target at the cup; the user can drag to move it.
      setPuttAimPoint({ x: currentHole.cup.x, y: currentHole.cup.y });
      setPuttSimulated(false);
      setPuttTargetPowerPct(null);
      setPuttSwingFeedback('');
      powerRef.current = 0;
      setPowerPct(0);
      setTempoLabel('Aim at the cup');
      setLastShotNote('Putting mode: aim auto-set at the cup — drag it to adjust, tap Simulate Putt, then swing to match.');
      setCamera((prev) => clampCamera({ x: ball.x, y: ball.y }));
    }
  }, [ball, ballMoving, currentHole, currentLie, puttingMode, sunk, waterDropMenu]);

  useEffect(() => {
    if (puttingMode && selectedClubIndex !== 0) {
      setSelectedClubIndex(0);
    }
  }, [puttingMode, selectedClubIndex]);

  // Frame the shot ONCE per new ball-at-rest position: auto-aim at the cup
  // and shift the camera part-way toward the target so the golfer + aim line
  // are both in view. Keyed off a lastFramedBallRef so club changes, pans,
  // or other re-renders don't re-snap the camera — only an actual new ball
  // position triggers framing. Putting keeps its own centered framing.
  const lastFramedBallRef = useRef(null);
  useEffect(() => {
    if (ballMoving || sunk || !currentHole.cup || puttingMode) return;
    const last = lastFramedBallRef.current;
    const movedEnough = !last || Math.hypot(ball.x - last.x, ball.y - last.y) > 0.75;
    // Always re-aim at the cup from the latest ball position (cheap, and
    // keeps the aim line accurate even if we don't re-frame the camera).
    const newAim = getAimAngleToCup(ball, currentHole.cup);
    setAimAngle(newAim);
    if (!movedEnough) return;
    lastFramedBallRef.current = { x: ball.x, y: ball.y };
    const framed = cameraForShot(ball, currentHole.cup);
    setCamera(framed);
    cameraRef.current = framed;
    manualPanUntilRef.current = 0;
  }, [ball, ballMoving, sunk, currentHole.cup, puttingMode]);
  // Reset the frame memo when hole changes so the new tee gets framed.
  useEffect(() => {
    lastFramedBallRef.current = null;
  }, [holeIndex]);

  // Driving range: once the ball comes to rest, reset back to the tee so the
  // player can keep hitting. Short delay lets the shot-stats card show first.
  useEffect(() => {
    if (!currentHole.isRange || ballMoving) {
      return;
    }
    const atTee = Math.hypot(ball.x - currentHole.ballStart.x, ball.y - currentHole.ballStart.y) < 0.5;
    if (atTee) {
      return;
    }
    const timer = setTimeout(() => {
      resetBall();
    }, 1400);
    return () => clearTimeout(timer);
  }, [ball, ballMoving, currentHole]);

  useEffect(() => {
    if (!puttingMode) {
      return;
    }
    if (shotControlOpen) {
      setShotControlOpen(false);
    }
  }, [puttingMode, shotControlOpen]);

  // Build full scorecard rows for ALL holes (played + unplayed)
  const scorecardRows = ACTIVE_HOLES.map((hole, idx) => {
    const played = holeScores.find((s) => s.hole === idx + 1);
    return { hole: idx + 1, name: hole.name, par: hole.par, strokes: played ? played.strokes : null };
  });
  const frontNine = scorecardRows.slice(0, Math.min(9, ACTIVE_HOLES.length));
  const backNine = ACTIVE_HOLES.length > 9 ? scorecardRows.slice(9) : null;
  const sumStrokes = (rows) => rows.reduce((s, r) => s + (r.strokes || 0), 0);
  const sumPar = (rows) => rows.reduce((s, r) => s + r.par, 0);
  const playedRows = scorecardRows.filter((r) => r.strokes !== null);
  const scorecardTotalStrokes = sumStrokes(playedRows);
  const scorecardTotalPar = sumPar(playedRows);
  const scorecardDiff = scorecardTotalStrokes - scorecardTotalPar;
  const scorecardDiffText = scorecardDiff === 0 ? 'E' : `${scorecardDiff > 0 ? '+' : ''}${scorecardDiff}`;
  const scorecardDiffStyle = scorecardDiff < 0 ? styles.scoreDiffUnder : scorecardDiff > 0 ? styles.scoreDiffOver : styles.scoreDiffEven;

  const getScoreShape = (strokes, par) => {
    const diff = strokes - par;
    if (diff <= -2) return 'eagle';
    if (diff === -1) return 'birdie';
    if (diff === 1) return 'bogey';
    if (diff === 2) return 'doubleBogey';
    if (diff >= 3) return 'tripleBogey';
    return 'par';
  };

  const getHoleDiffText = (strokes, par) => {
    const diff = strokes - par;
    if (diff === 0) return 'E';
    return `${diff > 0 ? '+' : ''}${diff}`;
  };

  const setAimFromTouch = (pageX, pageY) => {
    const frame = courseFrameRef.current;
    if (frame.width <= 0 || frame.height <= 0) {
      return;
    }
    const localX = clamp(pageX - frame.x, 0, frame.width);
    const localY = clamp(pageY - frame.y, 0, frame.height);
    const target = toWorld({ x: localX, y: localY });
    if (puttingMode) {
      const green = currentHole.terrain?.green;
      if (!green || !pointInRect(target, green)) {
        return;
      }
      if (puttSimulated) {
        return;
      }
      setPuttAimPoint(target);
      setPuttSimulated(false);
      setPuttTargetPowerPct(null);
      setPuttSwingFeedback('');
    }
    const dir = { x: target.x - ballRef.current.x, y: target.y - ballRef.current.y };
    if (magnitude(dir) < 0.2) {
      return;
    }
    setAimAngle(Math.atan2(dir.y, dir.x));
  };

  const handleSimulatePutt = () => {
    if (!puttingMode || sunk || ballMoving || !puttAimPoint) {
      return;
    }
    const dx = puttAimPoint.x - ballRef.current.x;
    const dy = puttAimPoint.y - ballRef.current.y;
    const distWorld = Math.hypot(dx, dy);
    if (distWorld < 0.1) {
      return;
    }
    const targetAngle = Math.atan2(dy, dx);
    const targetPower = puttPowerForDistance(distWorld);
    setAimAngle(targetAngle);
    powerRef.current = targetPower;
    setPowerPct(targetPower);
    setPuttPreview(simulatePuttPreview(0, targetPower, targetAngle));
    setPuttTargetPowerPct(targetPower);
    setPuttSimulated(true);
    setPuttSwingFeedback('');
    setTempoLabel(`Target: ${targetPower}%`);
    setLastShotNote('Preview locked. Swing now and match the target power while keeping the stroke straight.');
  };

  const isTouchInsideCourse = (evt) => {
    const frame = courseFrameRef.current;
    if (frame.width <= 0 || frame.height <= 0) {
      return false;
    }
    const { pageX, pageY } = evt.nativeEvent;
    return (
      pageX >= frame.x &&
      pageX <= frame.x + frame.width &&
      pageY >= frame.y &&
      pageY <= frame.y + frame.height
    );
  };

  const getTouchesCentroid = (nativeEvent) => {
    const touches = nativeEvent.touches;
    if (!touches || touches.length < 2) return null;
    return {
      x: (touches[0].pageX + touches[1].pageX) / 2,
      y: (touches[0].pageY + touches[1].pageY) / 2
    };
  };

  const aimResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          if (sunk || ballMoving) {
            return false;
          }
          return true;
        },
        onStartShouldSetPanResponderCapture: () => false,
        onPanResponderGrant: (evt) => {
          syncCourseFrame();
          if (!isTouchInsideCourse(evt)) {
            return;
          }
          webPanStartCameraRef.current = cameraRef.current;
          const centroid = getTouchesCentroid(evt.nativeEvent);
          if (centroid) {
            isTwoFingerPanningRef.current = true;
            panCentroidRef.current = centroid;
            setIsAiming(false);
            return;
          }
          isTwoFingerPanningRef.current = false;
          panCentroidRef.current = null;
          setIsAiming(false);
        },
        onMoveShouldSetPanResponder: () => false,
        onPanResponderMove: (evt, gestureState) => {
          const centroid = getTouchesCentroid(evt.nativeEvent);
          if (centroid) {
            isTwoFingerPanningRef.current = true;
            const prev = panCentroidRef.current;
            if (prev) {
              const dx = centroid.x - prev.x;
              const dy = centroid.y - prev.y;
              if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
                setCamera((c) => clampCamera({ x: c.x - dx / pixelsPerWorld, y: c.y - dy / pixelsPerWorld }));
              }
            }
            panCentroidRef.current = centroid;
            setIsAiming(false);
            return;
          }
          panCentroidRef.current = null;
          if (isTwoFingerPanningRef.current) {
            setIsAiming(false);
            return;
          }
          // On web: short drag = aim, long drag = pan
          if (Platform.OS === 'web') {
            const totalMove = Math.hypot(gestureState.dx, gestureState.dy);
            if (totalMove > 40) {
              // Long drag — switch to pan mode
              setIsAiming(false);
              manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
              const startCamera = webPanStartCameraRef.current || cameraRef.current;
              setCamera(clampCamera({
                x: startCamera.x - gestureState.dx / pixelsPerWorld,
                y: startCamera.y - gestureState.dy / pixelsPerWorld
              }));
              return;
            }
          }
          if (!isTouchInsideCourse(evt)) {
            return;
          }
          setAimFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        },
        onPanResponderRelease: (evt, gestureState) => {
          if (isTouchInsideCourse(evt) && Math.abs(gestureState.dx) < 40 && Math.abs(gestureState.dy) < 40) {
            setAimFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
          }
          setIsAiming(false);
          if (isTwoFingerPanningRef.current || Platform.OS === 'web') {
            manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
          }
          isTwoFingerPanningRef.current = false;
          panCentroidRef.current = null;
          webPanStartCameraRef.current = null;
        },
        onPanResponderTerminate: () => {
          setIsAiming(false);
          if (isTwoFingerPanningRef.current || Platform.OS === 'web') {
            manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
          }
          isTwoFingerPanningRef.current = false;
          panCentroidRef.current = null;
          webPanStartCameraRef.current = null;
        }
      }),
    [ballMoving, currentHole, pixelsPerWorld, puttingMode, sunk]
  );

  const getShotControlMetrics = (offset = spinOffset) => {
    const xNorm = clamp(offset.x / MAX_SPIN_OFFSET, -1, 1);
    const yNorm = clamp(offset.y / MAX_SPIN_OFFSET, -1, 1);
    const launchAdjust = clamp(1 - yNorm * 0.4, 0.68, 1.38);
    const spinAdjust = clamp(1 - yNorm * 0.36, 0.7, 1.34);
    const curveDeg = -xNorm * 85;
    let shapeLabel = 'Dead straight';

    if (xNorm < -0.55) shapeLabel = 'Hook';
    else if (xNorm < -0.18) shapeLabel = 'Draw';
    else if (xNorm > 0.55) shapeLabel = 'Slice';
    else if (xNorm > 0.18) shapeLabel = 'Fade';

    let flightLabel = 'Mid flight';
    if (yNorm < -0.4) flightLabel = 'Higher launch, less spin';
    else if (yNorm > 0.4) flightLabel = 'Lower launch, more spin';

    return { xNorm, yNorm, launchAdjust, spinAdjust, curveDeg, shapeLabel, flightLabel };
  };

  const resolveGroundCollisions = (hole, next, vel, restitution, flight = null, dt = 1 / 60) => {
    const radiusWorld = BALL_RADIUS_WORLD;
    const ballZ = flight ? flight.z : 0;
    const isAirborne = ballZ > 1.15;
    let adjusted = {
      x: clamp(next.x, radiusWorld, WORLD.w - radiusWorld),
      y: clamp(next.y, radiusWorld, WORLD.h - radiusWorld)
    };

    hole.obstacles.forEach((o) => {
      if (o.type === 'rect') {
        // Rect obstacles (legacy walls) are ground-only.
        if (isAirborne) return;
        const nearestX = clamp(adjusted.x, o.x, o.x + o.w);
        const nearestY = clamp(adjusted.y, o.y, o.y + o.h);
        const dx = adjusted.x - nearestX;
        const dy = adjusted.y - nearestY;
        const overlap = radiusWorld * radiusWorld - (dx * dx + dy * dy);
        if (overlap > 0) {
          let normal = normalize({ x: dx, y: dy });
          if (Math.abs(normal.x) < 0.01 && Math.abs(normal.y) < 0.01) {
            const center = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
            normal = normalize({ x: adjusted.x - center.x, y: adjusted.y - center.y });
            if (Math.abs(normal.x) < 0.01 && Math.abs(normal.y) < 0.01) {
              normal = { x: 0, y: -1 };
            }
          }
          adjusted = {
            x: nearestX + normal.x * (radiusWorld + 0.1),
            y: nearestY + normal.y * (radiusWorld + 0.1)
          };
          const vn = vel.x * normal.x + vel.y * normal.y;
          if (vn < 0) {
            vel.x -= (1 + restitution) * vn * normal.x;
            vel.y -= (1 + restitution) * vn * normal.y;
          }
        }
      }

      if (o.type === 'circle') {
        // Tree vertical profile: narrow trunk up to canopy start, wide canopy above.
        const tp = getTreePhysics(o);
        if (ballZ >= tp.h) return; // ball is over the tree
        // Smooth canopy ramp: trunk radius below canopyStart, linearly
        // widens to full canopy radius at tree top. Prior hard switch at
        // canopyStart caused a sudden mid-flight collision the moment a
        // rising ball crossed that altitude.
        let effectiveR;
        if (ballZ < tp.canopyStart) {
          effectiveR = tp.trunkR;
        } else {
          const ramp = Math.min(1, Math.max(0, (ballZ - tp.canopyStart) / Math.max(0.1, tp.h - tp.canopyStart)));
          effectiveR = tp.trunkR + (o.r - tp.trunkR) * ramp;
        }
        const dx = adjusted.x - o.x;
        const dy = adjusted.y - o.y;
        const dist = Math.hypot(dx, dy);
        const minDist = effectiveR + radiusWorld;
        if (dist < minDist) {
          const normal = dist < 0.001 ? { x: 1, y: 0 } : { x: dx / dist, y: dy / dist };
          const vn = vel.x * normal.x + vel.y * normal.y;
          if (isAirborne) {
            // Canopy as a drag ZONE, not a rigid collision. No position
            // teleport and no reflection — those caused a 30+ unit/s
            // velocity spike in one tick (the "sudden movement" the
            // player saw). Instead, while the ball is inside the canopy
            // sphere, we apply continuous time-based drag per tick. The
            // ball smoothly loses ~75%/sec of its horizontal speed and
            // 50%/sec of vz, so a ball clipping leaves slows and drops,
            // and a ball flying through the full canopy width loses
            // most of its energy — but every frame of the transition is
            // visually smooth.
            const drag = Math.pow(0.25, dt);
            vel.x *= drag;
            vel.y *= drag;
            if (flight) flight.vz *= Math.pow(0.5, dt);
          } else {
            // Ground-level: ball stops at the trunk. Preserve the position
            // adjustment + standard reflection for a proper bounce.
            adjusted = {
              x: o.x + normal.x * (minDist + 0.1),
              y: o.y + normal.y * (minDist + 0.1)
            };
            if (vn < 0) {
              vel.x -= (1 + restitution) * vn * normal.x;
              vel.y -= (1 + restitution) * vn * normal.y;
            }
          }
        }
      }
    });

    return adjusted;
  };

  const getLaunchData = (deviation = 0, options = {}) => {
    const shotMetrics = getShotControlMetrics();
    const lieSwingSens = (SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).swingSensitivity || 1.0;
    const golferPower = selectedGolferStats.power ?? 50;
    const golferAccuracy = selectedGolferStats.accuracy ?? 50;
    const golferTouch = selectedGolferStats.touch ?? 50;
    const golferSpin = selectedGolferStats.spinControl ?? 50;
    const golferPutting = selectedGolferStats.putting ?? 50;
    const golferRecovery = selectedGolferStats.recovery ?? 50;
    const focus = selectedMentalStats.focus ?? 50;
    const composure = selectedMentalStats.composure ?? 50;
    const courseManagement = selectedMentalStats.courseManagement ?? 50;
    const clubDistance = selectedClubStats.distance ?? 50;
    const clubAccuracy = selectedClubStats.accuracy ?? 50;
    const clubForgiveness = selectedClubStats.forgiveness ?? 50;
    const clubSpin = selectedClubStats.spin ?? 50;
    const clubFeel = selectedClubStats.feel ?? 50;
    const effectiveSkill = puttingMode
      ? (golferPutting * 0.45 + golferTouch * 0.2 + focus * 0.15 + composure * 0.2)
      : (golferAccuracy * 0.34 + focus * 0.22 + composure * 0.14 + courseManagement * 0.12 + clubAccuracy * 0.18);
    // Overpower penalty: above 100%, deviation is amplified linearly so overswinging
    // loses control without catapulting minor path errors to the 45° curve cap.
    // 1.0 at 100%, 1.125 at 105%, 1.25 at 110%, 1.375 at 115%, 1.5 at 120%.
    const effectivePowerForPenalty = options.powerPct ?? powerRef.current;
    let overpowerMult = 1.0;
    if (effectivePowerForPenalty > 100) {
      const overPct = effectivePowerForPenalty - 100; // 0-20
      overpowerMult = 1.0 + overPct * 0.025;
    }
    const baseSensitivity = 28; // eased from 40 — too punishing at 40
    const forgivenessFactor = clamp(1.18 - ((clubForgiveness - 50) * 0.004 + (effectiveSkill - 50) * 0.003 + (puttingMode ? (clubFeel - 50) * 0.002 : 0)), 0.7, 1.45);
    const recoveryFactor = currentLie === 'rough' || currentLie === 'deepRough' || currentLie === 'sand' || currentLie === 'pluggedSand'
      ? clamp(1.12 - (golferRecovery - 50) * 0.003, 0.82, 1.18)
      : 1;
    const rawCurveDeg = deviation * baseSensitivity * lieSwingSens * overpowerMult * forgivenessFactor * recoveryFactor;
    // Cap curve at ±45° — no golf shot curves more than that
    const swingCurveDeg = clamp(rawCurveDeg, -45, 45);
    const totalCurveDeg = shotMetrics.curveDeg + swingCurveDeg;
    // Tiny initial face-angle offset so a sliced shot STARTS a hair right
    // of aim, then the Magnus physics banana-curves it further during
    // flight. Old blend factor (1.15) pushed the launch direction 97°+ off
    // aim at max slice, so the ball appeared to rocket sideways the moment
    // it left the club. In the new model, almost all of the side motion
    // comes from in-flight Magnus — the starting direction is very close
    // to aim, matching real-world face/path physics (face ~85% of start
    // direction, path only a few degrees off for shaped shots).
    const launchCurveDeg = clamp(totalCurveDeg * 0.05, -6, 6);
    const baseAimAngle = options.aimAngle ?? aimAngle;
    const finalAngle = baseAimAngle + degToRad(launchCurveDeg);
    const direction = { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };
    const effectivePower = options.powerPct ?? powerRef.current;
    const powerFactor = puttingMode
      ? clamp(1 + ((golferPutting - 50) * 0.0015 + (clubFeel - 50) * 0.0015), 0.88, 1.12)
      : clamp(1 + ((golferPower - 50) * 0.003 + (clubDistance - 50) * 0.003), 0.75, 1.25);
    const touchFactor = puttingMode
      ? clamp(1 + ((golferTouch - 50) * 0.002 + (clubFeel - 50) * 0.002), 0.86, 1.14)
      : clamp(1 + (golferTouch - 50) * 0.0015, 0.9, 1.1);
    const launchRatio = clamp((effectivePower / 125) * powerFactor * touchFactor, 0, 1.1);
    const spinFactor = puttingMode
      ? clamp(1 + ((golferPutting - 50) * 0.001 + (clubFeel - 50) * 0.001), 0.9, 1.1)
      : clamp(1 + ((golferSpin - 50) * 0.0025 + (clubSpin - 50) * 0.0025), 0.8, 1.25);
    return {
      shotMetrics,
      swingCurveDeg,
      totalCurveDeg,
      finalAngle,
      direction,
      effectivePower,
      launchRatio,
      powerFactor,
      touchFactor,
      spinFactor,
      skillSnapshot: { golferPower, golferAccuracy, golferTouch, golferSpin, golferPutting, golferRecovery, focus, composure, courseManagement, clubDistance, clubAccuracy, clubForgiveness, clubSpin, clubFeel }
    };
  };

  const simulatePuttPreview = (deviation = 0, overridePowerPct = null, overrideAimAngle = null) => {
    const effectivePower = overridePowerPct ?? powerRef.current;
    if (effectivePower <= 5) {
      return null;
    }
    const launch = getLaunchData(deviation, { powerPct: effectivePower, aimAngle: overrideAimAngle });
    const puttSpeed = (CLUBS[0].carryYards / YARDS_PER_WORLD) * launch.launchRatio * 2.8;
    const vel = {
      x: launch.direction.x * puttSpeed,
      y: launch.direction.y * puttSpeed
    };
    let pos = { ...ballRef.current };
    const path = [{ x: pos.x, y: pos.y }];
    let finalPos = { ...pos };

    for (let i = 0; i < PUTT_PREVIEW_MAX_TICKS; i += 1) {
      const surfaceName = getSurfaceAtPoint(currentHole, pos);
      const surfacePhysics = SURFACE_PHYSICS[surfaceName] || SURFACE_PHYSICS.rough;
      const dragFactor = Math.max(0, 1 - surfacePhysics.rollFriction * PUTT_PREVIEW_DT);
      vel.x *= dragFactor;
      vel.y *= dragFactor;
      const previewSpeed = magnitude(vel);
      if (previewSpeed < STOP_SPEED) {
        vel.x = 0;
        vel.y = 0;
      } else {
        const slope = getGreenSlopeForce(currentHole, pos, surfaceName);
        const previewSlopeCap = surfaceName === 'green' || surfaceName === 'fringe'
          ? clamp(0.45 + previewSpeed / 2.5, 0.45, 1.25)
          : Math.min(1.0, previewSpeed / 2.0);
        vel.x += slope.x * previewSlopeCap * PUTT_PREVIEW_DT;
        vel.y += slope.y * previewSlopeCap * PUTT_PREVIEW_DT;
      }

      const restitution = surfacePhysics.wallRestitution;
      let next = {
        x: pos.x + vel.x * PUTT_PREVIEW_DT,
        y: pos.y + vel.y * PUTT_PREVIEW_DT
      };
      next = resolveGroundCollisions(currentHole, next, vel, restitution);

      const fellInWater = currentHole.hazards.some((h) => h.type === 'waterRect' && pointInRect(next, h));
      pos = fellInWater ? currentHole.ballStart : next;
      finalPos = { ...pos };

      if (i % PUTT_PREVIEW_SAMPLE_TICKS === 0) {
        path.push({ x: pos.x, y: pos.y });
      }

      if (magnitude(vel) < STOP_SPEED) {
        vel.x = 0;
        vel.y = 0;
        break;
      }
    }

    const restToCupWorld = Math.hypot(currentHole.cup.x - finalPos.x, currentHole.cup.y - finalPos.y);
    return {
      path,
      finalPos,
      distanceToCupYards: Math.max(0, Math.round(restToCupWorld * YARDS_PER_WORLD)),
      endLie: getSurfaceAtPoint(currentHole, finalPos)
    };
  };

  const strikeBall = (deviation = 0, { tempoMult = 1.0, tempoTag = 'Normal', tempoMetrics = null } = {}) => {
    // New shot — clear the chip-mode override so the next approach-to-green
    // auto-enables putting again.
    chipOverrideRef.current = false;
    // Apply tempo multiplier to deviation — rushed/jerky/coasted swings are
    // less accurate. The clamp is intentionally wider than [-1, 1] so a
    // max-deviation slice/hook combined with a jerky tempo can amplify past
    // the nominal ceiling; the final rawCurveDeg is still capped at ±45°, so
    // there is no runaway. Without this, a full-slice gesture on a
    // max-skill character with a 1.7x tempoMult was silently absorbed
    // because the product clamped back to 1.0 before curve scoring, so the
    // tempo penalty had no teeth once the pointer reached max deviation.
    const tempoAdjustedDeviation = clamp(deviation * tempoMult, -1.8, 1.8);
    if (sunk || ballMoving) return;
    // Each new shot resets zoom to its mode-appropriate default so the player
    // always lines up the next shot at a predictable zoom level.
    setZoomLevel(puttingMode ? PUTTING_ZOOM_INDEX : DEFAULT_ZOOM_INDEX);

    // Pause at top drains CARRY exponentially (separate from the deviation
    // penalty above). tempoMetrics.pauseDistanceMult is 1.0 for a clean
    // transition, <1.0 for any detectable hover.
    const pauseDistanceMult = clamp(tempoMetrics?.pauseDistanceMult ?? 1.0, 0.1, 1.0);
    const launch = getLaunchData(tempoAdjustedDeviation);
    // Solve for the launch speed that actually delivers the aim-line carry.
    // The aim line shows club.carryYards * powerFactor * touchFactor, so the
    // physics has to hit that target using the REAL flight hang time (which
    // includes launchRatio, the spin-dot launch adjust, and the spin launch
    // modifier). Previously speedFromPower applied only powerFactor and used
    // a different internal hang time, so character stats drifted away from
    // what the UI promised — most noticeably, touchFactor was ignored and
    // power characters fell short of their "stock" distance.
    const spinLaunchMod = clamp(0.94 + (launch.spinFactor - 1) * 0.35, 0.82, 1.12);
    // Restored to the original hang-time base (3.2 + launch*0.8). The lower
    // base made shots feel flat — we've moved the "don't let short shots
    // get blown around" responsibility to the wind scale + height gate
    // instead of squashing the flight itself.
    const actualHangTime = (3.2 + selectedClub.launch * 0.8)
      * launch.launchRatio
      * launch.shotMetrics.launchAdjust
      * spinLaunchMod;
    const powerFrac = clamp(launch.effectivePower / 100, 0, 1.2);
    // Jerky / coasted / rushed swings (tempoMult > 1) should lose carry too,
    // not just accuracy. Otherwise a wild overpower swing with near-zero
    // deviation still goes the full distance because the tempo penalty is
    // only wired into deviation. Calibrated so a 2.15x mult (Jerky + Coasted)
    // lands ~80% of the full-power carry; a 1.2x mult barely dents distance.
    const tempoCarryMult = tempoMult > 1
      ? clamp(1 / Math.pow(tempoMult, 0.3), 0.55, 1.0)
      : 1.0;
    // Shot-type profile — chip/flop/stinger/bump scale carry (and apex down
    // below). If the chosen type is ineligible for this club+lie we fall
    // back to 'normal' so nothing is ever silently partial.
    const activeShotType = shotTypeEligible(shotType, selectedClub, currentLie) ? shotType : 'normal';
    const shotProfile = SHOT_TYPE_PROFILES[activeShotType] || SHOT_TYPE_PROFILES.normal;
    const targetCarryWorld = (selectedClub.carryYards / YARDS_PER_WORLD)
      * powerFrac
      * launch.powerFactor
      * launch.touchFactor
      * pauseDistanceMult
      * tempoCarryMult
      * shotProfile.carry;
    const expFactor = 1 - Math.exp(-0.14 * actualHangTime);
    const speed = expFactor > 0.001
      ? (targetCarryWorld * 0.14 / expFactor)
      : targetCarryWorld * 2;
    const liePhys = SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough;
    const [penMin, penMax] = liePhys.powerPenalty;
    const recoveryBoost = currentLie === 'rough' || currentLie === 'deepRough' || currentLie === 'sand' || currentLie === 'pluggedSand'
      ? clamp(1 + ((selectedGolferStats.recovery ?? 50) - 50) * 0.0035, 0.82, 1.18)
      : 1;
    const liePenalty = clamp((penMin + Math.random() * (penMax - penMin)) * recoveryBoost, 0.35, 1.05);
    const horizSpeed = speed * liePenalty;

    velocityRef.current = {
      x: launch.direction.x * horizSpeed,
      y: launch.direction.y * horizSpeed
    };
    shotCurveDegRef.current = launch.totalCurveDeg;
    // Normalize curveDeg (-85…+85) to spin (-1…+1) for Magnus physics.
    shotSpinNormRef.current = clamp(launch.totalCurveDeg / 85, -1.2, 1.2);
    shotAimAngleRef.current = aimAngle;
    // Shot shape auto-resets after the swing — each new shot starts neutral
    // so the player has to opt back in to fade/draw/high/low every time.
    setSpinOffset({ x: 0, y: 0 });
    // Shot type (chip/flop/stinger/bump) likewise resets to normal so the
    // selection is a deliberate per-shot choice.
    setShotType('normal');
    setShotTypeMenuOpen(false);
    // Course Management reduces in-air wind drift (reads line and plays it).
    // 0 CIQ → wind ×1.30, 50 → ×1.0, 100 → ×0.70.
    const courseMgmt = selectedMentalStats.courseManagement ?? 50;
    // Course Mgmt shrinks wind drift from 1.30x (CIQ 0) to 0.70x (CIQ 100).
    // Short shots take a quadratic wind cut: wind force scales with
    // launchRatio² so a 30% shot feels ~18% of the wind a full shot feels.
    // This fixes the "tiny pitch gets shoved sideways more than a full
    // driver" feel — wind force is absolute, but the shorter the shot the
    // more offline any absolute drift looks relative to the carry.
    const ciqWindFactor = clamp(1 - (courseMgmt - 50) * 0.006, 0.7, 1.3);
    const shortShotWindFactor = clamp(launch.launchRatio * launch.launchRatio * 2.0, 0.15, 1.0);
    shotWindResistRef.current = clamp(ciqWindFactor * shortShotWindFactor, 0.12, 1.3);
    if (selectedClub.key === 'PT') {
      // Putter: pure ground roll, no flight. Speed calibrated so ball rolls the aim distance.
      const puttSpeed = (selectedClub.carryYards / YARDS_PER_WORLD) * launch.launchRatio * 2.8;
      velocityRef.current = {
        x: launch.direction.x * puttSpeed,
        y: launch.direction.y * puttSpeed
      };
      flightRef.current = { z: 0, vz: 0 };
    } else {
      // Launch vz was still using the flattened formula from the previous
      // "short shots balloon" fix (hang-time base 2.4 + launch*0.55 and a
      // ^1.3 power-curve on launchRatio). That left shots visibly low. Back
      // to the original linear mapping with the (3.2 + launch*0.8) base so
      // peak heights match the old feel; short-shot feel is now tuned via
      // the softer wind force (v3.22) instead of squashing the trajectory.
      const targetHangTime = (3.2 + selectedClub.launch * 0.8) * clamp(launch.launchRatio, 0, 1.1);
      // Shot-type apex multiplier. Flop balloons, Stinger + Bump run low.
      const apexMult = shotProfile.apex;
      const launchVz = (GRAVITY * targetHangTime * 0.5) * launch.shotMetrics.launchAdjust * clamp(0.94 + (launch.spinFactor - 1) * 0.35, 0.82, 1.12) * apexMult;
      flightRef.current = {
        z: 0.08,
        vz: launchVz
      };
    }

    // Track shot stats
    lastShotPosRef.current = { ...ballRef.current };
    shotStartPosRef.current = { ...ballRef.current };
    shotLandPosRef.current = null;
    shotPeakHeightRef.current = 0;
    shotCarryRef.current = 0;
    shotRollRef.current = 0;
    setShowShotStats(false);

    const contactLabel = Math.abs(deviation) < 0.08 ? 'Center' : Math.abs(deviation) < 0.25 ? (deviation < 0 ? 'Slight Heel' : 'Slight Toe') : (deviation < 0 ? 'Heel' : 'Toe');
    const shotShapeLabel = Math.abs(deviation) < 0.1 ? 'Straight' : deviation < -0.3 ? 'Hook' : deviation > 0.3 ? 'Slice' : deviation < 0 ? 'Draw' : 'Fade';

    // Normalize swing path for visualization (relative to start, scaled to fit a box)
    const rawPath = [...fullSwingPathRef.current];
    let swingPath = [];
    if (rawPath.length > 2) {
      const sx = rawPath[0].x, sy = rawPath[0].y;
      const pts = rawPath.map(p => ({ x: p.x - sx, y: p.y - sy, phase: p.phase }));
      const maxAbs = Math.max(1, ...pts.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))));
      swingPath = pts.map(p => ({ x: p.x / maxAbs, y: p.y / maxAbs, phase: p.phase }));
    }

    // Capture the full timestamped path so dev-mode can render a
    // speed-vs-time graph and a to-scale swing trace. We keep only a
    // normalized copy on lastShotStats (swingPath) for the regular view.
    const rawPathFull = fullSwingPathRef.current.map((p) => ({ x: p.x, y: p.y, t: p.t, phase: p.phase }));

    setLastShotStats({
      club: selectedClub.short,
      clubName: selectedClub.name,
      power: launch.effectivePower,
      contact: contactLabel,
      shape: shotShapeLabel,
      deviationDeg: Math.round(launch.swingCurveDeg * 10) / 10,
      carry: 0,
      roll: 0,
      totalDist: 0,
      peakHeight: 0,
      startLie: currentLie,
      endLie: 'unknown',
      swingPath,
      rawSamples: rawPathFull,
      tempoTag,
      tempoMult,
      tempoMetrics,
    });

    setBallHeight(flightRef.current.z);
    shotTracerRef.current = [];
    setShotTracer([]);
    // Pick an emoji from the tempo tag. "Pure" and "Committed" are the
    // two bonuses; everything else tags one or more penalties.
    const tempoEmoji = tempoTag === 'Pure' ? '✨'
      : tempoTag === 'Committed' ? '🎯'
      : tempoTag === 'Smooth' ? '👌'
      : tempoTag.includes('Paused') ? '🧊'
      : tempoTag.includes('Jerky') ? '💥'
      : tempoTag.includes('Decel') ? '🪫'
      : tempoTag.includes('Coasted') ? '🐢'
      : '';
    setTempoLabel(`${tempoEmoji}${tempoTag} • ${shotShapeLabel} • ${launch.effectivePower}%`);
    setStrokesCurrent((s) => s + 1);
    setShotControlOpen(false);
    setPuttPreview(null);
    setPuttSimulated(false);
    setSwingPhase('idle');
    setPowerPct(0);
    powerRef.current = 0;
    setSwingDeviation(0);
    swingDeviationRef.current = 0;
    backDeviationRef.current = 0;
    peakForwardDevRef.current = 0;
    if (puttingMode) {
      const swingPower = Math.round(launch.effectivePower);
      const targetText = typeof puttTargetPowerPct === 'number' ? ` (Target: ${puttTargetPowerPct}%)` : '';
      setPuttAimPoint(null);
      setPuttSwingFeedback(`Your swing: ${swingPower}%${targetText}`);
      setLastShotNote(`Putt struck at ${swingPower}%${targetText}.`);
    } else {
      setPuttSwingFeedback('');
      setLastShotNote(`${selectedClub.short} — ${contactLabel}, ${shotShapeLabel.toLowerCase()}, ${launch.effectivePower}% power.`);
    }
  };

  const shotControlResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => shotControlOpen && !sunk && !ballMoving,
        onStartShouldSetPanResponderCapture: () => shotControlOpen && !sunk && !ballMoving,
        onPanResponderGrant: (evt) => {
          if (!shotControlOpen) {
            return;
          }
          const dx = evt.nativeEvent.locationX - PAD_CENTER;
          const dy = evt.nativeEvent.locationY - PAD_CENTER;
          const distanceFromDot = Math.hypot(dx - spinOffset.x, dy - spinOffset.y);
          setDraggingSpinDot(distanceFromDot <= SPIN_DOT_RADIUS + 12);
        },
        onPanResponderMove: (evt) => {
          if (!shotControlOpen || !draggingSpinDot) {
            return;
          }
          const dx = evt.nativeEvent.locationX - PAD_CENTER;
          const dy = evt.nativeEvent.locationY - PAD_CENTER;
          const distance = Math.hypot(dx, dy);
          const scale = distance > MAX_SPIN_OFFSET ? MAX_SPIN_OFFSET / distance : 1;
          const nextOffset = { x: dx * scale, y: dy * scale };
          setSpinOffset(nextOffset);
          const metrics = getShotControlMetrics(nextOffset);
          setTempoLabel(`${metrics.shapeLabel} • ${metrics.flightLabel}`);
        },
        onPanResponderRelease: () => {
          setDraggingSpinDot(false);
        },
        onPanResponderTerminate: () => {
          setDraggingSpinDot(false);
        }
      }),
    [ballMoving, draggingSpinDot, shotControlOpen, sunk, spinOffset.x, spinOffset.y]
  );

  const swingResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !sunk && !ballMoving && !shotControlOpen,
        onStartShouldSetPanResponderCapture: () => !sunk && !ballMoving && !shotControlOpen,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (evt) => {
          const now = Date.now();
          swingStartRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
          swingLowestRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
          swingTrailRef.current = [];
          fullSwingPathRef.current = [{ x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY, t: now, phase: 'start' }];
          backswingStartTimeRef.current = now;
          transitionTimeRef.current = 0;
          setSwingPhase('backswing');
          powerRef.current = 0;
          peakPowerRef.current = 0;
          peakForwardDevRef.current = 0;
          swingLockedRef.current = false;
          setPowerPct(0);
          setSwingDeviation(0);
        },
        onPanResponderMove: (evt, gestureState) => {
          const currentY = evt.nativeEvent.pageY;
          const currentX = evt.nativeEvent.pageX;
          const dy = currentY - swingStartRef.current.y;

          fullSwingPathRef.current.push({ x: currentX, y: currentY, t: Date.now(), phase: swingLockedRef.current ? 'forward' : 'back' });

          if (!swingLockedRef.current) {
            // BACKSWING: dragging down charges power
            const dyFromLowest = currentY - swingLowestRef.current.y;
            if (dy > 0) {
              // Still moving down or at lowest point
              const pct = clamp(Math.round(dy / 0.8), 0, 120);
              powerRef.current = pct;
              peakPowerRef.current = Math.max(peakPowerRef.current, pct);
              setPowerPct(pct);
              // Track backswing L/R deviation from start X
              const backDevPx = currentX - swingStartRef.current.x;
              backDeviationRef.current = clamp(backDevPx / 50, -1, 1);
              swingLowestRef.current = { x: currentX, y: currentY };
              swingTrailRef.current = [];
            } else if (peakPowerRef.current > 5 && dyFromLowest < -8) {
              // Finger reversed direction upward — LOCK power and start forward swing
              swingLockedRef.current = true;
              powerRef.current = peakPowerRef.current;
              setPowerPct(peakPowerRef.current);
              setSwingPhase('forward');
              transitionTimeRef.current = Date.now();
              // Short buzz at the top of backswing — cue to pause
              hapticBuzz(30);
            }
          } else {
            // FORWARD SWING: track deviation
            swingTrailRef.current.push({ x: currentX, y: currentY });
            const centerX = swingLowestRef.current.x;
            const devPx = currentX - centerX;
            const forwardDev = clamp(devPx / 45, -1, 1); // tighter threshold (was 60)
            // Peak-track forward deviation by absolute magnitude, preserving sign.
            // Why: latching last-sample lets a late recovery erase a mid-swing wobble,
            // so a visibly-wonky path still scores as straight. Peak keeps the worst moment.
            if (Math.abs(forwardDev) > Math.abs(peakForwardDevRef.current)) {
              peakForwardDevRef.current = forwardDev;
            }
            // Combine back + forward deviation (back contributes ~40%).
            // UI shows live pointer; scoring ref uses peak forward dev.
            const liveCombined = clamp(forwardDev + backDeviationRef.current * 0.4, -1, 1);
            const scoringCombined = clamp(peakForwardDevRef.current + backDeviationRef.current * 0.4, -1, 1);
            setSwingDeviation(liveCombined);
            swingDeviationRef.current = scoringCombined;
          }
        },
        onPanResponderRelease: (evt) => {
          if (powerRef.current > 5) {
            // Final sample — record release point so decel/follow-through
            // can read the pointer's speed at the very end of the swing.
            const releaseNow = Date.now();
            const releaseX = evt?.nativeEvent?.pageX ?? swingLowestRef.current.x;
            const releaseY = evt?.nativeEvent?.pageY ?? swingLowestRef.current.y;
            fullSwingPathRef.current.push({ x: releaseX, y: releaseY, t: releaseNow, phase: swingLockedRef.current ? 'forward' : 'back' });

            // Evaluate tempo on the full timestamped trajectory.
            const focusStat = selectedMentalStats.focus ?? 50;
            const composureStat = selectedMentalStats.composure ?? 50;
            const overpowerPct = Math.max(0, peakPowerRef.current - 100);
            const tempo = evaluateTempo(fullSwingPathRef.current, { focus: focusStat, composure: composureStat });
            let { tempoMult, tempoTag } = tempo;

            // Overpower risk layers on top of tempo: swinging past 100%
            // amplifies any tempo penalty (smooth commitment is harder
            // when you're swinging out of your shoes).
            if (overpowerPct >= 20) {
              tempoMult *= 1.42;
            } else if (overpowerPct >= 10) {
              tempoMult *= 1.22;
            }

            // Haptic reward for a Pure swing.
            if (tempoTag === 'Pure') hapticDoubleTap();

            // Stage a swing log record. Finalised with shot-result fields
            // (carry / roll / total / endLie) when the ball comes to rest.
            const idNum = nextSwingIdRef.current;
            nextSwingIdRef.current = idNum + 1;
            pendingSwingRef.current = {
              id: String(idNum).padStart(4, '0'),
              idNum,
              timestamp: new Date().toISOString(),
              version: BUILD_VERSION,
              club: selectedClub.key,
              clubName: selectedClub.name,
              powerPct: Math.round(peakPowerRef.current),
              overpowerPct,
              golfer: {
                id: selectedGolfer?.id,
                name: selectedGolfer?.name,
                stats: selectedGolferStats,
                mental: selectedMentalStats,
              },
              clubEquipment: selectedEquipmentItem?.id || null,
              clubStats: selectedClubStats,
              tempo: {
                tag: tempoTag,
                mult: +tempoMult.toFixed(3),
                metrics: tempo.metrics,
              },
              deviation: {
                backPx: +swingDeviationRef.current.toFixed(3),
                degrees: null, // filled by strikeBall via shot stats
              },
              startLie: currentLie,
              samples: fullSwingPathRef.current.map((s) => ({
                x: Math.round(s.x * 100) / 100,
                y: Math.round(s.y * 100) / 100,
                t: s.t,
                phase: s.phase,
              })),
              shot: null, // filled when ball rests
            };

            strikeBall(swingDeviationRef.current, { tempoMult, tempoTag, tempoMetrics: tempo.metrics });
          } else {
            setSwingPhase('idle');
            setPowerPct(0);
            powerRef.current = 0;
          }
        },
        onPanResponderTerminate: () => {
          setSwingPhase('idle');
          setPowerPct(0);
          powerRef.current = 0;
        }
      }),
    [ballMoving, shotControlOpen, sunk, swingDeviation]
  );

  const screenBall = toScreen(ball);
  const screenCup = toScreen(currentHole.cup);
  // Visual lift: linear with a soft cap so short shots read as LOW and long
  // drives still fit on screen. Previously used sqrt compression which
  // exaggerated chip-shot height (short shots looked much higher than they
  // physically were).
  // Smooth visual lift: keep a near-linear response for small lifts (so low
  // shots and early-rise pixels aren't distorted) while softly saturating
  // high-apex drives instead of hard-clamping at a ceiling. The old
  // Math.min(rawLift, 78) chopped the rising arc flat the moment it exceeded
  // the cap, which is exactly the "kink" in the tracer the player saw — a
  // genuine parabola went rising → plateau → falling. This formula uses
  // tanh, which is C¹ (no derivative kink), approaches SOFT_LIFT_MAX
  // asymptotically, and matches rawLift*0.97 for small values.
  const SOFT_LIFT_MAX = 130;
  const visualLiftPx = (rawLift) => SOFT_LIFT_MAX * Math.tanh(Math.max(0, rawLift) / SOFT_LIFT_MAX);
  const rawLiftPx = ballHeight * pixelsPerWorld * 0.85;
  const liftPx = visualLiftPx(rawLiftPx);
  const airborneRatio = clamp(ballHeight / 35, 0, 1);
  const ballVisualScale = 1 - airborneRatio * 0.12;
  const shadowScale = 1 + airborneRatio * 0.5;
  const shadowOpacity = 0.28 - airborneRatio * 0.18;
  const worldOffsetX = viewWidth / 2 - camera.x * pixelsPerWorld;
  const worldOffsetY = cameraAnchorY - camera.y * pixelsPerWorld;

  const isLastHole = safeHoleIndex === ACTIVE_HOLES.length - 1;
  const shotMetrics = getShotControlMetrics();
  const overSwing = powerPct > 100;
  const neutralStrike = { launch: 1, spin: 1 };

  const aimDir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
  const aimPerp = { x: -aimDir.y, y: aimDir.x };
  const previewLaunch = getLaunchData(0, { powerPct, aimAngle });
  const totalPreviewCurveDeg = previewLaunch.totalCurveDeg;
  // Preview distance reflects Power/Touch (from launch) plus the current lie's
  // power penalty with Recovery's bad-lie distance boost folded in.
  const previewInBadLie = currentLie === 'rough' || currentLie === 'deepRough' || currentLie === 'sand' || currentLie === 'pluggedSand';
  const previewRecoveryDistFactor = previewInBadLie
    ? clamp(1 + ((selectedGolferStats.recovery ?? 50) - 50) * 0.0035, 0.82, 1.18)
    : 1;
  const previewLiePhys = SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.fairway;
  const [previewPenMin, previewPenMax] = previewLiePhys.powerPenalty || [1, 1];
  const previewLiePenalty = clamp(((previewPenMin + previewPenMax) / 2) * previewRecoveryDistFactor, 0.35, 1.05);
  const previewDistMult = previewLaunch.powerFactor * previewLaunch.touchFactor * previewLiePenalty;
  const previewStockDistMult = previewLaunch.powerFactor * previewLaunch.touchFactor;
  const distanceToCupWorld = Math.hypot(currentHole.cup.x - ball.x, currentHole.cup.y - ball.y);
  const yardsToCup = Math.max(0, Math.round(distanceToCupWorld * YARDS_PER_WORLD));
  const windData = roundWind[safeHoleIndex] || { speed: 0, dir: 'N' };
  const windLabel = `${windData.speed} mph`;
  const windArrow = WIND_ARROWS[windData.dir] || '•';
  const windDirLabel = windData.dir;
  const stockClubYards = Math.round(estimateStraightDistance(100, selectedClub, neutralStrike, previewStockDistMult) * YARDS_PER_WORLD);
  const previewPower = powerPct;
  const previewYards = Math.round(estimateStraightDistance(previewPower, selectedClub, { launch: shotMetrics.launchAdjust, spin: shotMetrics.spinAdjust }, previewDistMult) * YARDS_PER_WORLD);
  const shotShape = `${SHOT_SHAPE_HINTS[selectedClub.key] || 'Neutral'} • ${shotMetrics.shapeLabel}`;
  const shotNumber = sunk ? strokesCurrent : strokesCurrent + 1;
  const puttTargetText = typeof puttTargetPowerPct === 'number' ? `${puttTargetPowerPct}%` : '--';
  const puttStatusText = puttSwingFeedback
    || (puttSimulated ? (puttPreview ? `${puttPreview.distanceToCupYards} yd to cup` : 'Preview active') : 'Place aim point on green');
  const puttPreviewDots = puttPreview?.path?.map((point, i, arr) => ({
    key: `putt-preview-${i}`,
    point,
    size: i === arr.length - 1 ? 8 : 3.4 + (i / Math.max(1, arr.length - 1)) * 2.4,
    opacity: 0.95 - (i / Math.max(1, arr.length - 1)) * 0.65
  })) || [];

  const slopeArrows = (currentHole.slopes || []).flatMap((slope, slopeIndex) => {
    const green = currentHole.terrain?.green;
    if (!green) {
      return [];
    }
    const dir = getSlopeDirectionUnit(slope.dir);
    if (Math.abs(dir.x) < 0.001 && Math.abs(dir.y) < 0.001) {
      return [];
    }
    const cx = green.x + green.w * clamp(slope.cx ?? 0.5, 0, 1);
    const cy = green.y + green.h * clamp(slope.cy ?? 0.5, 0, 1);
    const str = clamp(slope.strength ?? 0.5, 0, 1);
    // Stronger slope = tighter grid (more arrows packed closer)
    const spacing = Math.max(3, 8 - str * 5); // 3-8 world units apart
    const radius = Math.min(green.w, green.h) * 0.35;
    const arrows = [];
    for (let gx = -radius; gx <= radius; gx += spacing) {
      for (let gy = -radius; gy <= radius; gy += spacing) {
        const px = cx + gx;
        const py = cy + gy;
        // Only inside green and within slope influence radius
        if (!pointInRect({ x: px, y: py }, green)) continue;
        const dist = Math.hypot(gx, gy);
        if (dist > radius) continue;
        const fade = clamp(1 - dist / radius, 0.2, 1);
        arrows.push({
          key: `slope-arrow-${slopeIndex}-${gx.toFixed(0)}-${gy.toFixed(0)}`,
          x: px,
          y: py,
          char: WIND_ARROWS[slope.dir] || '•',
          opacity: fade * 0.7
        });
      }
    }
    return arrows;
  });

  const rayToWorldEdge = (() => {
    const candidates = [];
    if (Math.abs(aimDir.x) > 0.0001) {
      const tx0 = (0 - ball.x) / aimDir.x;
      const tx1 = (WORLD.w - ball.x) / aimDir.x;
      if (tx0 > 0) candidates.push(tx0);
      if (tx1 > 0) candidates.push(tx1);
    }
    if (Math.abs(aimDir.y) > 0.0001) {
      const ty0 = (0 - ball.y) / aimDir.y;
      const ty1 = (WORLD.h - ball.y) / aimDir.y;
      if (ty0 > 0) candidates.push(ty0);
      if (ty1 > 0) candidates.push(ty1);
    }
    if (!candidates.length) {
      return 0;
    }
    return Math.max(0, Math.min(...candidates));
  })();
  const aimGuideWorld = clamp(
    estimateStraightDistance(100, selectedClub, { launch: shotMetrics.launchAdjust, spin: shotMetrics.spinAdjust }, previewStockDistMult),
    6,
    rayToWorldEdge
  );

  // Aim preview shares the same Magnus-curve physics as the live flight.
  // Estimate the shot's initial horizontal speed from the preview's
  // hang-time and carry formulas, then step the trajectory forward. The
  // yellow curve on screen is the ball's actual predicted path, and it
  // matches what the ball does when you swing.
  const previewSpinNorm = clamp(totalPreviewCurveDeg / 85, -1.2, 1.2);
  // Tiny initial face-angle offset (mirrors strikeBall) so the preview
  // starts pointed slightly right/left of aim for shaped shots, matching
  // the live shot's launch direction.
  const previewLaunchOffsetRad = degToRad(clamp(totalPreviewCurveDeg * 0.05, -6, 6));
  const previewLaunchAngle = aimAngle + previewLaunchOffsetRad;
  const previewTrajectoryPath = useMemo(() => {
    if (aimGuideWorld <= 0) return [];
    const stockRatio = clamp(aimGuideWorld / (selectedClub.carryYards / YARDS_PER_WORLD), 0.2, 1.2);
    const estHangTime = (3.2 + selectedClub.launch * 0.8) * stockRatio;
    const expFactor = 1 - Math.exp(-0.14 * estHangTime);
    const estHoriz = expFactor > 0.001 ? aimGuideWorld * 0.14 / expFactor : aimGuideWorld * 2;
    return simulateAimTrajectory({
      startPos: { x: ball.x, y: ball.y },
      aimAngleRad: previewLaunchAngle,
      initialHorizSpeed: estHoriz,
      spinNorm: previewSpinNorm,
      totalCarryWorld: aimGuideWorld
    });
  }, [ball.x, ball.y, previewLaunchAngle, aimGuideWorld, previewSpinNorm, selectedClub.launch, selectedClub.carryYards]);

  const buildAimPoint = (pct) => {
    // Pick the sampled trajectory point closest to this pct along the path.
    const n = previewTrajectoryPath.length;
    if (n === 0) {
      const worldDist = aimGuideWorld * pct;
      const point = { x: ball.x + aimDir.x * worldDist, y: ball.y + aimDir.y * worldDist };
      const screen = toScreen(point);
      return { pct, point, x: screen.x, y: screen.y };
    }
    const idx = Math.min(n - 1, Math.max(0, Math.floor(pct * (n - 1))));
    const point = previewTrajectoryPath[idx];
    const screen = toScreen(point);
    return { pct, point, x: screen.x, y: screen.y };
  };

  const aimCurvePoints = Array.from({ length: 17 }, (_, index) => buildAimPoint(index / 16));
  const aimLineDots = [0, 0.25, 0.5, 0.75, 1].map((pct) => {
    const built = buildAimPoint(pct);
    return {
      key: `aim-dot-${pct}`,
      pct,
      x: built.x,
      y: built.y,
      size: pct === 0 ? 0 : 4 + pct * 3,
      opacity: pct === 0 ? 0 : 0.5 + pct * 0.35,
      color: '#ffdd44'
    };
  });

  const aimPathSegments = aimCurvePoints.slice(0, -1).map((dot, index) => {
    const next = aimCurvePoints[index + 1];
    const dx = next.x - dot.x;
    const dy = next.y - dot.y;
    const length = Math.hypot(dx, dy);
    return {
      key: `aim-seg-${index}`,
      left: dot.x,
      top: dot.y,
      width: length,
      angle: `${Math.atan2(dy, dx)}rad`
    };
  });

  const golferAnchorWorld = {
    x: clamp(golferBallAnchor.x - 8.1 + aimPerp.x * 0.6, 2.5, WORLD.w - 2.5),
    y: clamp(golferBallAnchor.y - aimDir.y * 1.6 + aimPerp.y * 0.6, 2.5, WORLD.h - 2.5)
  };
  const golferAnchor = toScreen(golferAnchorWorld);
  const golferPixelSize = clamp(pixelsPerWorld * 0.62, 1.55, 2.5);
  const golferWidth = GOLFER_SPRITE_ROWS[0].length * golferPixelSize;
  const golferHeight = GOLFER_SPRITE_ROWS.length * golferPixelSize;
  const golferAngle = (aimAngle * 180) / Math.PI + 90;
  // On hole-out, swap the aim-rotated sprite for a celebration pose so the
  // golfer reads as happy/sad instead of frozen facing the aim line.
  //   birdie or better → hop up, face camera (hands-up body language)
  //   par              → face camera, neutral stance (peace-sign vibe)
  //   bogey or worse   → lean forward, head down
  const holeOutScore = sunk && holeCelebration ? holeCelebration.scoreDiff : null;
  const golferCelebrationTransform = (() => {
    if (holeOutScore === null || holeOutScore === undefined) {
      return [{ rotate: `${golferAngle}deg` }];
    }
    if (holeOutScore <= -1) return [{ translateY: -10 }, { rotate: '0deg' }];
    if (holeOutScore === 0) return [{ translateY: -2 }, { rotate: '0deg' }];
    // bogey+: lean forward, slight tilt
    return [{ translateY: 3 }, { rotate: '18deg' }];
  })();

  if (gameScreen === 'menu') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => (
              <View
                key={star.key}
                style={[
                  styles.menuStar,
                  {
                    left: star.left,
                    top: star.top,
                    width: star.size,
                    height: star.size,
                    backgroundColor: star.color,
                    opacity: star.opacity
                  }
                ]}
              />
            ))}
          </View>
          <View style={styles.menuGreenGlow} pointerEvents="none" />

          <View style={styles.menuContentWrap}>
            <Text style={styles.menuDataBar}>◂ EST. 2155 · 14 SPECIES · 9 STAR SYSTEMS ▸</Text>

            <View style={styles.menuTitleBlock}>
              <Text style={styles.menuTitleTop}>INTERGALACTIC</Text>
              <View style={styles.menuTitleBottomRow}>
                <Text style={styles.menuTitleBottomMain}>G ⛳ LF</Text>
                <Text style={styles.menuTitleTour}>TOUR</Text>
              </View>
            </View>

            <View style={styles.heroWrap}>
              <View style={styles.heroRing} />
              <View style={styles.heroBall}>
                <View style={[styles.heroDimple, { top: 20, left: 18 }]} />
                <View style={[styles.heroDimple, { top: 26, right: 20 }]} />
                <View style={[styles.heroDimple, { bottom: 20, left: 26 }]} />
                <View style={[styles.heroDimple, { bottom: 24, right: 24 }]} />
                <View style={[styles.heroDimple, { top: 40, left: 36 }]} />
              </View>
              <View style={styles.heroFlagPole} />
              <View style={styles.heroFlag} />
            </View>

            <View style={styles.menuButtonStack}>
              <View style={styles.menuButtonWrap}>
                <View style={[styles.spaceMenuBtn, styles.spaceMenuBtnDisabled]}>
                  <Text style={styles.spaceMenuBtnLeftMuted}>CAREER</Text>
                  <Text style={styles.spaceMenuBtnRightMuted}>SEASON 03 &gt;</Text>
                </View>
                <Text style={styles.menuSoonBadge}>COMING SOON</Text>
              </View>

              <Pressable
                style={styles.spaceMenuBtnActive}
                onPress={() => { setSelectionTarget('course'); setGameScreen('golfer-select'); }}
              >
                <Text style={styles.spaceMenuBtnLeft}>EXHIBITION</Text>
                <Text style={styles.spaceMenuBtnRight}>QUICK 9 &gt;</Text>
                <View style={[styles.lCorner, styles.lCornerTopLeft]} />
                <View style={[styles.lCorner, styles.lCornerTopRight]} />
                <View style={[styles.lCorner, styles.lCornerBottomLeft]} />
                <View style={[styles.lCorner, styles.lCornerBottomRight]} />
              </Pressable>

              <Pressable
                style={styles.spaceMenuBtnActive}
                onPress={() => { setSelectionTarget('golf-story'); setGameScreen('golf-story'); }}
              >
                <Text style={styles.spaceMenuBtnLeft}>GOLF STORY</Text>
                <Text style={styles.spaceMenuBtnRight}>TOUCH v0.11 &gt;</Text>
                <View style={[styles.lCorner, styles.lCornerTopLeft]} />
                <View style={[styles.lCorner, styles.lCornerTopRight]} />
                <View style={[styles.lCorner, styles.lCornerBottomLeft]} />
                <View style={[styles.lCorner, styles.lCornerBottomRight]} />
              </Pressable>

              <Pressable
                style={styles.spaceMenuBtn}
                onPress={() => setGameScreen('settings')}
              >
                <Text style={styles.spaceMenuBtnLeft}>SETTINGS</Text>
                <Text style={styles.spaceMenuBtnRight}>&gt;</Text>
              </Pressable>
            </View>

            <View style={styles.menuBottomBar}>
              <Text style={styles.menuBottomLeft}>
                <Text style={styles.menuBottomDot}>●</Text> FOLD DRIVE · ONLINE
              </Text>
              <Text style={styles.menuBottomRight}>{BUILD_VERSION} ■</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════ GOLF STORY SPIKE SCREEN ═══════════════
  if (gameScreen === 'golf-story') {
    return (
      <GolfStoryScreen
        onExit={() => setGameScreen('menu')}
        selectedGolfer={selectedGolfer}
        selectedBag={selectedBag}
        equipmentCatalog={equipmentCatalog}
        allGolfers={GOLFERS}
      />
    );
  }

  // ═══════════════ GOLFER SELECT SCREEN ═══════════════
  if (gameScreen === 'golfer-select') {
    const g = selectedGolfer;
    const statKeys = ['power', 'accuracy', 'touch', 'spinControl', 'putting', 'recovery'];
    const statLabels = { power: 'Power', accuracy: 'Accuracy', touch: 'Touch', spinControl: 'Spin Ctrl', putting: 'Putting', recovery: 'Recovery' };
    const mentalKeys = ['focus', 'composure', 'courseManagement'];
    const mentalLabels = { focus: 'Focus', composure: 'Composure', courseManagement: 'Course IQ' };
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => <View key={star.key} style={[styles.menuStar, { left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, opacity: star.opacity }]} />)}
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.spaceMenuSubtitle}>SELECT GOLFER</Text>
          <Text style={styles.golferRosterHint}>{GOLFERS.length} golfers — swipe to browse, tap to view stats</Text>

          <ScrollView
            horizontal
            nestedScrollEnabled
            style={styles.golferRosterScroll}
            contentContainerStyle={styles.golferRosterContent}
            showsHorizontalScrollIndicator={false}
          >
            {GOLFERS.map((golfer) => {
              const isSelected = golfer.id === g.id;
              return (
                <Pressable
                  key={golfer.id}
                  style={[styles.golferRosterCard, isSelected && styles.golferRosterCardSelected]}
                  onPress={() => setSelectedGolfer(JSON.parse(JSON.stringify(golfer)))}
                >
                  <View style={styles.golferRosterAvatar}>
                    <View style={[styles.golferRosterAvatarBlock, { backgroundColor: golfer.avatar.hat }]} />
                    <View style={[styles.golferRosterAvatarBlock, { backgroundColor: golfer.avatar.skin }]} />
                    <View style={[styles.golferRosterAvatarBlock, { backgroundColor: golfer.avatar.shirt }]} />
                  </View>
                  <Text style={[styles.golferRosterName, isSelected && styles.golferRosterNameSelected]} numberOfLines={1}>{golfer.name}</Text>
                  <Text style={styles.golferRosterSpecies} numberOfLines={1}>{golfer.species}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.golferCard}>
            {/* Avatar */}
            <View style={styles.golferAvatarWrap}>
              <View style={[styles.golferAvatarBlock, { backgroundColor: g.avatar.hat }]} />
              <View style={[styles.golferAvatarBlock, { backgroundColor: g.avatar.skin }]} />
              <View style={[styles.golferAvatarBlock, { backgroundColor: g.avatar.shirt }]} />
              <View style={[styles.golferAvatarBlock, { backgroundColor: g.avatar.pants }]} />
            </View>
            <View style={styles.golferInfo}>
              <Text style={styles.golferName}>{g.name}</Text>
              <Text style={styles.golferSpecies}>{g.species} • {g.origin}</Text>
              <Text style={styles.golferBio}>{g.bio}</Text>
            </View>
          </View>

          {/* Stats bars */}
          <View style={styles.golferStatsSection}>
            <Text style={styles.golferStatsSectionTitle}>SKILLS</Text>
            {statKeys.map(key => (
              <View key={key} style={styles.golferStatRow}>
                <Text style={styles.golferStatName}>{statLabels[key]}</Text>
                <View style={styles.golferStatBarBg}>
                  <View style={[styles.golferStatBarFill, { width: `${g.stats[key]}%`, backgroundColor: g.stats[key] >= 70 ? '#4ade80' : g.stats[key] >= 40 ? '#fbbf24' : '#ef4444' }]} />
                </View>
                <Text style={styles.golferStatValue}>{g.stats[key]}</Text>
              </View>
            ))}
          </View>

          <View style={styles.golferStatsSection}>
            <Text style={styles.golferStatsSectionTitle}>MENTAL</Text>
            {mentalKeys.map(key => (
              <View key={key} style={styles.golferStatRow}>
                <Text style={styles.golferStatName}>{mentalLabels[key]}</Text>
                <View style={styles.golferStatBarBg}>
                  <View style={[styles.golferStatBarFill, { width: `${g.mental[key]}%`, backgroundColor: g.mental[key] >= 70 ? '#4ade80' : g.mental[key] >= 40 ? '#fbbf24' : '#ef4444' }]} />
                </View>
                <Text style={styles.golferStatValue}>{g.mental[key]}</Text>
              </View>
            ))}
          </View>

          <View style={styles.golferNavRow}>
            <Pressable style={styles.golferBackBtn} onPress={() => setGameScreen('menu')}>
              <Text style={styles.golferBackBtnText}>← BACK</Text>
            </Pressable>
            <Pressable style={styles.golferSelectBtn} onPress={() => setGameScreen('club-select')}>
              <Text style={styles.golferSelectBtnText}>SELECT →</Text>
            </Pressable>
          </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════ CLUB SELECT SCREEN ═══════════════
  if (gameScreen === 'club-select') {
    const categories = [
      { key: 'drivers', label: 'Drivers' },
      { key: 'fairwayWoods', label: 'Woods' },
      { key: 'irons', label: 'Irons' },
      { key: 'wedges', label: 'Wedges' },
      { key: 'putters', label: 'Putters' }
    ];
    const categoryItems = equipmentCatalog[bagPickerCategory] || [];
    const bagCount = selectedBag.length;
    const hasPutter = selectedBag.some(id => {
      const eq = getEquipmentById(id);
      return eq && eq.clubKey === 'PT';
    });
    const canProceed = bagCount === 14 && hasPutter;

    const toggleClub = (itemId) => {
      setSelectedBag(prev => {
        if (prev.includes(itemId)) {
          return prev.filter(id => id !== itemId);
        }
        if (prev.length >= 14) return prev; // can't add more
        return [...prev, itemId];
      });
    };

    const statLabels = { distance: 'Dist', accuracy: 'Acc', forgiveness: 'Frgv', spin: 'Spin', feel: 'Feel' };

    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => <View key={star.key} style={[styles.menuStar, { left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, opacity: star.opacity }]} />)}
          </View>
          <View style={{ flex: 1, padding: 16 }}>
          <Text style={styles.golferStatsSectionTitle}>BUILD YOUR BAG</Text>
          <Text style={styles.clubSelectCount}>{bagCount}/14 clubs {hasPutter ? '✅' : '⚠️ Need putter'}</Text>

          {/* Category tabs */}
          <View style={styles.clubCategoryTabs}>
            {categories.map(cat => (
              <Pressable
                key={cat.key}
                style={[styles.clubCategoryTab, bagPickerCategory === cat.key && styles.clubCategoryTabActive]}
                onPress={() => setBagPickerCategory(cat.key)}
              >
                <Text style={[styles.clubCategoryTabText, bagPickerCategory === cat.key && styles.clubCategoryTabTextActive]}>{cat.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Club list */}
          <ScrollView style={styles.clubListScroll} showsVerticalScrollIndicator={false}>
            {categoryItems.map(item => {
              const inBag = selectedBag.includes(item.id);
              const clubData = CLUBS.find(c => c.key === item.clubKey);
              return (
                <Pressable
                  key={item.id}
                  style={[styles.clubItemCard, inBag && styles.clubItemCardSelected]}
                  onPress={() => toggleClub(item.id)}
                >
                  <View style={styles.clubItemHeader}>
                    <Text style={styles.clubItemName}>{item.name}</Text>
                    <Text style={styles.clubItemBrand}>{item.brand}</Text>
                    {clubData ? <Text style={styles.clubItemCarry}>{clubData.carryYards}yd</Text> : null}
                  </View>
                  <View style={styles.clubItemStats}>
                    {Object.entries(item.stats).map(([key, val]) => (
                      <View key={key} style={styles.clubStatRow}>
                        <Text style={styles.clubStatName}>{statLabels[key] || key}</Text>
                        <View style={styles.clubStatBarBg}>
                          <View style={[styles.clubStatBarFill, { width: `${val}%`, backgroundColor: val >= 70 ? '#4ade80' : val >= 40 ? '#fbbf24' : '#ef4444' }]} />
                        </View>
                        <Text style={styles.clubStatValue}>{val}</Text>
                      </View>
                    ))}
                  </View>
                  {inBag ? <Text style={styles.clubItemCheck}>✅</Text> : <Text style={styles.clubItemAdd}>+</Text>}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.golferNavRow}>
            <Pressable style={styles.golferBackBtn} onPress={() => setGameScreen('golfer-select')}>
              <Text style={styles.golferBackBtnText}>← GOLFER</Text>
            </Pressable>
            <Pressable
              style={[styles.golferSelectBtn, !canProceed && styles.disabled]}
              disabled={!canProceed}
              onPress={() => setGameScreen(selectionTarget === 'golf-story' ? 'golf-story' : 'courses')}
            >
              <Text style={styles.golferSelectBtnText}>{selectionTarget === 'golf-story' ? 'GOLF STORY →' : 'PLAY →'}</Text>
            </Pressable>
          </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (gameScreen === 'courses') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => (
              <View
                key={`${star.key}-courses`}
                style={[
                  styles.menuStar,
                  {
                    left: star.left,
                    top: star.top,
                    width: star.size,
                    height: star.size,
                    backgroundColor: star.color,
                    opacity: star.opacity
                  }
                ]}
              />
            ))}
          </View>
          <View style={styles.menuGreenGlow} pointerEvents="none" />

          <View style={styles.coursesContentWrap}>
            <Text style={styles.menuDataBar}>◂ EST. 2155 · 14 SPECIES · 9 STAR SYSTEMS ▸</Text>
            <Text style={styles.coursesTitle}>SELECT COURSE</Text>

            <ScrollView
              style={styles.courseMenuList}
              contentContainerStyle={styles.coursesListContent}
              showsVerticalScrollIndicator={false}
            >
              {COURSES.map((course, index) => (
                <Pressable
                  key={course.id}
                  style={({ pressed }) => [
                    styles.spaceCourseCard,
                    selectedCourseIndex === index && styles.spaceCourseCardActive,
                    pressed && styles.spaceCourseCardPressed
                  ]}
                  onPress={() => setSelectedCourseIndex(index)}
                >
                  <View style={styles.spaceCourseHeader}>
                    <Text style={styles.spaceCourseTitle}>{course.name}</Text>
                    <Text style={styles.spaceCourseDifficulty}>{course.difficulty}</Text>
                  </View>
                  <Text style={styles.spaceCourseDesigner}>DESIGNER · {course.designer.toUpperCase()}</Text>
                  <Text style={styles.spaceCourseDescription}>{course.description}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable style={styles.coursesPlayButton} onPress={() => startCourse(selectedCourseIndex)}>
              <Text style={styles.coursesPlayButtonText}>PLAY</Text>
            </Pressable>
            <Pressable style={styles.coursesBackButton} onPress={() => setGameScreen('menu')}>
              <Text style={styles.coursesBackButtonText}>BACK</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (gameScreen === 'editor') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => (
              <View key={`${star.key}-editor-lite`} style={[styles.menuStar, { left: star.left, top: star.top, width: star.size, height: star.size, backgroundColor: star.color, opacity: star.opacity }]} />
            ))}
          </View>
          <View style={styles.menuGreenGlow} pointerEvents="none" />
          <View style={styles.coursesContentWrap}>
            <Text style={styles.menuDataBar}>◂ DEV TOOL · SAFE MODE ▸</Text>
            <Text style={styles.coursesTitle}>EDITOR</Text>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <View style={styles.editorPanel}>
                <Text style={styles.editorSectionTitle}>Character Creator</Text>
                <Text style={styles.golferBio}>Temporary safe-mode editor entry. Next pass will restore full create-new-character and create-new-club flows after load stability is confirmed.</Text>
                <Text style={styles.clubItemMeta}>Planned: add new character, clothing asset inventory, value, rarity, save/export.</Text>
              </View>
              <View style={styles.editorPanel}>
                <Text style={styles.editorSectionTitle}>Club Creator</Text>
                <Text style={styles.golferBio}>Planned: add static non-fungible club assets, assign value, rarity, per-club stat package, and connect to player inventory.</Text>
              </View>
              <View style={styles.editorPanel}>
                <Text style={styles.editorSectionTitle}>Why this is minimal right now</Text>
                <Text style={styles.golferBio}>I stripped the risky version during crash isolation. This gets the editor back into Settings without reopening the load regression.</Text>
              </View>
            </ScrollView>
            <Pressable style={styles.coursesBackButton} onPress={() => setGameScreen('settings')}>
              <Text style={styles.coursesBackButtonText}>BACK</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (gameScreen === 'settings') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => (
              <View key={`${star.key}-set`} style={[styles.menuStar, { left: star.left, top: star.top, width: star.size, height: star.size, backgroundColor: star.color, opacity: star.opacity }]} />
            ))}
          </View>
          <View style={styles.menuGreenGlow} pointerEvents="none" />
          <View style={styles.coursesContentWrap}>
            <Text style={styles.menuDataBar}>◂ INTERGALACTIC GOLF TOUR ▸</Text>
            <Text style={styles.coursesTitle}>SETTINGS</Text>
            <View style={{ gap: 12, marginTop: 20 }}>
              <Pressable style={styles.spaceMenuBtnActive} onPress={() => setGameScreen('editor')}>
                <Text style={styles.spaceMenuBtnLeft}>🛠️ DEV EDITOR</Text>
                <Text style={styles.spaceMenuBtnRight}>&gt;</Text>
                <View style={[styles.lCorner, styles.lCornerTopLeft]} />
                <View style={[styles.lCorner, styles.lCornerTopRight]} />
                <View style={[styles.lCorner, styles.lCornerBottomLeft]} />
                <View style={[styles.lCorner, styles.lCornerBottomRight]} />
              </Pressable>
              <Pressable style={styles.spaceMenuBtnActive} onPress={() => setGameScreen('backstory-read')}>
                <Text style={styles.spaceMenuBtnLeft}>📜 READ BACKSTORY</Text>
                <Text style={styles.spaceMenuBtnRight}>&gt;</Text>
                <View style={[styles.lCorner, styles.lCornerTopLeft]} />
                <View style={[styles.lCorner, styles.lCornerTopRight]} />
                <View style={[styles.lCorner, styles.lCornerBottomLeft]} />
                <View style={[styles.lCorner, styles.lCornerBottomRight]} />
              </Pressable>
              <Pressable style={styles.spaceMenuBtnActive} onPress={() => setGameScreen('backstory-listen')}>
                <Text style={styles.spaceMenuBtnLeft}>🎧 LISTEN TO BACKSTORY</Text>
                <Text style={styles.spaceMenuBtnRight}>&gt;</Text>
                <View style={[styles.lCorner, styles.lCornerTopLeft]} />
                <View style={[styles.lCorner, styles.lCornerTopRight]} />
                <View style={[styles.lCorner, styles.lCornerBottomLeft]} />
                <View style={[styles.lCorner, styles.lCornerBottomRight]} />
              </Pressable>
              <Pressable style={styles.spaceMenuBtnActive} onPress={() => setDevMode((v) => !v)}>
                <Text style={styles.spaceMenuBtnLeft}>🔧 DEV MODE</Text>
                <Text style={[styles.spaceMenuBtnRight, devMode && { color: '#4adb6a' }]}>{devMode ? 'ON' : 'OFF'}</Text>
                <View style={[styles.lCorner, styles.lCornerTopLeft]} />
                <View style={[styles.lCorner, styles.lCornerTopRight]} />
                <View style={[styles.lCorner, styles.lCornerBottomLeft]} />
                <View style={[styles.lCorner, styles.lCornerBottomRight]} />
              </Pressable>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.coursesBackButton} onPress={() => setGameScreen('menu')}>
              <Text style={styles.coursesBackButtonText}>BACK</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (gameScreen === 'backstory-read') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => (
              <View key={`${star.key}-br`} style={[styles.menuStar, { left: star.left, top: star.top, width: star.size, height: star.size, backgroundColor: star.color, opacity: star.opacity }]} />
            ))}
          </View>
          <View style={styles.menuGreenGlow} pointerEvents="none" />
          <View style={styles.coursesContentWrap}>
            <Text style={styles.menuDataBar}>◂ INTERGALACTIC GOLF TOUR ▸</Text>
            <Text style={styles.coursesTitle}>THE BACKSTORY</Text>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {BACKSTORY_PARAGRAPHS.map((para, i) => (
                <Text key={`bp-${i}`} style={{ color: i === 0 ? '#88F8BB' : i === BACKSTORY_PARAGRAPHS.length - 1 ? '#88F8BB' : '#d5e7cd', fontSize: i === 0 || i === BACKSTORY_PARAGRAPHS.length - 1 ? 16 : 14, lineHeight: 22, marginBottom: 16, fontWeight: i === 0 || i === BACKSTORY_PARAGRAPHS.length - 1 ? '700' : '400', fontStyle: i === 0 ? 'italic' : 'normal' }}>{para}</Text>
              ))}
            </ScrollView>
            <Pressable style={styles.coursesBackButton} onPress={() => setGameScreen('settings')}>
              <Text style={styles.coursesBackButtonText}>BACK</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (gameScreen === 'backstory-listen') {
    const audioRef = { current: typeof window !== 'undefined' ? (window.__igtAudio || (window.__igtAudio = new Audio('/backstory.mp3'))) : null };
    const startSpeech = () => {
      if (!audioRef.current) return;
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setIsSpeaking(true);
      setSpeechPaused(false);
      audioRef.current.onended = () => { setIsSpeaking(false); setSpeechPaused(false); };
    };
    const pauseSpeech = () => {
      if (audioRef.current) { audioRef.current.pause(); setSpeechPaused(true); }
    };
    const resumeSpeech = () => {
      if (audioRef.current) { audioRef.current.play(); setSpeechPaused(false); }
    };
    const stopSpeech = () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; setIsSpeaking(false); setSpeechPaused(false); }
    };
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => (
              <View key={`${star.key}-bl`} style={[styles.menuStar, { left: star.left, top: star.top, width: star.size, height: star.size, backgroundColor: star.color, opacity: star.opacity }]} />
            ))}
          </View>
          <View style={styles.menuGreenGlow} pointerEvents="none" />
          <View style={[styles.coursesContentWrap, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={styles.menuDataBar}>◂ INTERGALACTIC GOLF TOUR ▸</Text>
            <Text style={styles.coursesTitle}>🎧 LISTEN</Text>
            <View style={{ alignItems: 'center', gap: 20, marginTop: 30 }}>
              <View style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#88F8BB', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(136,248,187,0.08)' }}>
                <Text style={{ fontSize: 40 }}>{isSpeaking && !speechPaused ? '🔊' : '🎧'}</Text>
              </View>
              <Text style={{ color: '#A0A0A0', fontSize: 13, letterSpacing: 2 }}>
                {isSpeaking ? (speechPaused ? 'PAUSED' : 'PLAYING...') : 'READY'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {!isSpeaking ? (
                  <Pressable style={[styles.coursesPlayButton, { width: 140, marginTop: 0 }]} onPress={startSpeech}>
                    <Text style={styles.coursesPlayButtonText}>▶ PLAY</Text>
                  </Pressable>
                ) : (
                  <>
                    {speechPaused ? (
                      <Pressable style={[styles.coursesPlayButton, { width: 110, marginTop: 0 }]} onPress={resumeSpeech}>
                        <Text style={styles.coursesPlayButtonText}>▶ RESUME</Text>
                      </Pressable>
                    ) : (
                      <Pressable style={[styles.coursesPlayButton, { width: 110, marginTop: 0, backgroundColor: '#f0c040' }]} onPress={pauseSpeech}>
                        <Text style={[styles.coursesPlayButtonText, { color: '#05070A' }]}>⏸ PAUSE</Text>
                      </Pressable>
                    )}
                    <Pressable style={[styles.coursesBackButton, { width: 110, marginTop: 0, borderColor: '#ef4444' }]} onPress={stopSpeech}>
                      <Text style={[styles.coursesBackButtonText, { color: '#ef4444' }]}>⏹ STOP</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.coursesBackButton} onPress={() => { stopSpeech(); setGameScreen('settings'); }}>
              <Text style={styles.coursesBackButtonText}>BACK</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.courseShell}>
        <View
          ref={courseRef}
          onLayout={syncCourseFrame}
          style={[styles.course, { width: viewWidth, height: viewHeight }]}
        >
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none" {...aimResponder.panHandlers}>
            <View style={styles.courseTintTop} pointerEvents="none" />
            <View style={styles.courseTintBottom} pointerEvents="none" />

          <View
            style={[
              styles.worldLayer,
              {
                left: worldOffsetX,
                top: worldOffsetY,
                width: WORLD.w * scaleX,
                height: WORLD.h * scaleY
              }
            ]}
          >
            {/*
             * Terrain layers.
             *
             * If the course was exported from the designer it ships with
             * editorVectors (cubic-bezier path data). We render those as SVG
             * paths so the game looks identical to the designer canvas
             * (smooth capsules, curvy greens, varied bunker shapes).
             *
             * For hand-authored rect-based courses (Pine Valley, Michael's,
             * Driving Range) we fall back to the old View/borderRadius
             * rendering.
             *
             * Z-order (both paths): water → rough/deepRough/desert →
             * fairway → fringe → green → slope arrows → tee → sand → trees → cup.
             */}
            {/* Single unified SVG terrain layer — always uses the shared theme
                patterns. When editorVectors exist, we draw bezier paths; when
                only rect-based terrain exists (hand-authored Pine Valley etc.),
                we build rounded-rect SVG paths and apply the SAME patterns. */}
            {true ? (
              <Svg
                pointerEvents="none"
                width={WORLD.w * scaleX}
                height={WORLD.h * scaleY}
                viewBox={`0 0 ${WORLD.w} ${WORLD.h}`}
                style={{ position: 'absolute', left: 0, top: 0 }}
              >
                {/* Pattern defs shared across all surface paths. */}
                {renderPatternDefs()}

                {/* Helper: render each surface as (base fill) + (pattern overlay)
                    matching the designer's fillShape(): solid color first, then
                    the tile pattern painted on top at its own opacity. */}

                {/* Water (background) — base fill + broken-line ripple pattern (NO rim per Mike's picks).
                    Prefer vector; fall back to rect-based water hazards on hand-authored courses. */}
                {currentHole.editorVectors?.hazards?.water?.length ? (
                  currentHole.editorVectors.hazards.water.map((shape, i) => {
                    const d = pointsToSvgD(shape.points);
                    return (
                      <SvgG key={`vw-${i}`}>
                        <SvgPath d={d} fill={SURFACE_COLORS.water} />
                        <SvgPath d={d} fill={`url(#${PATTERN_ID.water})`} />
                      </SvgG>
                    );
                  })
                ) : (
                  currentHole.hazards?.filter((h) => h.type === 'waterRect').map((h, i) => {
                    const rx = Math.min(8, h.w / 2, h.h / 2);
                    return (
                      <SvgG key={`rw-${i}`}>
                        <SvgRect x={h.x} y={h.y} width={h.w} height={h.h} rx={rx} ry={rx} fill={SURFACE_COLORS.water} />
                        <SvgRect x={h.x} y={h.y} width={h.w} height={h.h} rx={rx} ry={rx} fill={`url(#${PATTERN_ID.water})`} />
                      </SvgG>
                    );
                  }) || null
                )}

                {/* Desert / deepRough / rough surface patches — each gets its own pattern. */}
                {currentHole.terrain?.desert?.map((s, i) => {
                  const d = `M ${s.x} ${s.y} h ${s.w} v ${s.h} h ${-s.w} Z`;
                  return (
                    <SvgG key={`vd-${i}`}>
                      <SvgPath d={d} fill={SURFACE_COLORS.desert} />
                      <SvgPath d={d} fill={`url(#${PATTERN_ID.desert})`} />
                    </SvgG>
                  );
                }) || null}
                {currentHole.terrain?.deepRough?.map((s, i) => {
                  const d = `M ${s.x} ${s.y} h ${s.w} v ${s.h} h ${-s.w} Z`;
                  return (
                    <SvgG key={`vdr-${i}`}>
                      <SvgPath d={d} fill={SURFACE_COLORS.deepRough} />
                      <SvgPath d={d} fill={`url(#${PATTERN_ID.deepRough})`} />
                    </SvgG>
                  );
                }) || null}
                {currentHole.terrain?.rough?.map((s, i) => {
                  const d = `M ${s.x} ${s.y} h ${s.w} v ${s.h} h ${-s.w} Z`;
                  return (
                    <SvgG key={`vr-${i}`}>
                      <SvgPath d={d} fill={SURFACE_COLORS.rough} />
                      <SvgPath d={d} fill={`url(#${PATTERN_ID.rough})`} />
                    </SvgG>
                  );
                }) || null}

                {/* Fairway — prefer editorVectors bezier paths; fall back to
                    rounded-rect SVG paths when only terrain.fairway rects exist. */}
                {currentHole.editorVectors?.terrain?.fairway?.length ? (
                  currentHole.editorVectors.terrain.fairway.map((shape, i) => {
                    const d = pointsToSvgD(shape.points);
                    return (
                      <SvgG key={`vf-${i}`}>
                        <SvgPath d={d} fill={SURFACE_COLORS.fairway} />
                        <SvgPath d={d} fill={`url(#${PATTERN_ID.fairway})`} />
                      </SvgG>
                    );
                  })
                ) : (
                  currentHole.terrain?.fairway?.map((f, i) => {
                    const rx = Math.min(f.r || 8, f.w / 2, f.h / 2);
                    return (
                      <SvgG key={`rf-${i}`}>
                        <SvgRect
                          x={f.x}
                          y={f.y}
                          width={f.w}
                          height={f.h}
                          rx={rx}
                          ry={rx}
                          fill={SURFACE_COLORS.fairway}
                        />
                        <SvgRect
                          x={f.x}
                          y={f.y}
                          width={f.w}
                          height={f.h}
                          rx={rx}
                          ry={rx}
                          fill={`url(#${PATTERN_ID.fairway})`}
                        />
                      </SvgG>
                    );
                  }) || null
                )}

                {/* Fringe + green. Prefer vector path; fall back to rect shape. */}
                {currentHole.editorVectors?.terrain?.green?.points?.length >= 2 ? (
                  <SvgG key="vg">
                    {(() => {
                      const fringePts = expandPointsFromCentroid(
                        currentHole.editorVectors.terrain.green.points,
                        FRINGE_BUFFER,
                      );
                      const dFringe = pointsToSvgD(fringePts);
                      const dGreen = pointsToSvgD(currentHole.editorVectors.terrain.green.points);
                      return (
                        <>
                          <SvgPath d={dFringe} fill={SURFACE_COLORS.fringe} />
                          <SvgPath d={dFringe} fill={`url(#${PATTERN_ID.fringe})`} />
                          <SvgPath d={dGreen} fill={SURFACE_COLORS.green} />
                          <SvgPath d={dGreen} fill={`url(#${PATTERN_ID.green})`} />
                        </>
                      );
                    })()}
                  </SvgG>
                ) : currentHole.terrain?.green ? (
                  <SvgG key="rg">
                    {(() => {
                      const g = currentHole.terrain.green;
                      const fx = g.x - FRINGE_BUFFER;
                      const fy = g.y - FRINGE_BUFFER;
                      const fw = g.w + FRINGE_BUFFER * 2;
                      const fh = g.h + FRINGE_BUFFER * 2;
                      const fr = Math.min((g.r || 10) + FRINGE_BUFFER, fw / 2, fh / 2);
                      const gr = Math.min(g.r || 10, g.w / 2, g.h / 2);
                      return (
                        <>
                          <SvgRect x={fx} y={fy} width={fw} height={fh} rx={fr} ry={fr} fill={SURFACE_COLORS.fringe} />
                          <SvgRect x={fx} y={fy} width={fw} height={fh} rx={fr} ry={fr} fill={`url(#${PATTERN_ID.fringe})`} />
                          <SvgRect x={g.x} y={g.y} width={g.w} height={g.h} rx={gr} ry={gr} fill={SURFACE_COLORS.green} />
                          <SvgRect x={g.x} y={g.y} width={g.w} height={g.h} rx={gr} ry={gr} fill={`url(#${PATTERN_ID.green})`} />
                        </>
                      );
                    })()}
                  </SvgG>
                ) : null}

                {/* Sand bunkers — prefer vector; fall back to rect-based paths. */}
                {currentHole.editorVectors?.hazards?.sand?.length ? (
                  currentHole.editorVectors.hazards.sand.map((shape, i) => {
                    const d = pointsToSvgD(shape.points);
                    return (
                      <SvgG key={`vs-${i}`}>
                        <SvgPath d={d} fill={SURFACE_COLORS.sand} />
                        <SvgPath d={d} fill={`url(#${PATTERN_ID.sand})`} />
                      </SvgG>
                    );
                  })
                ) : (
                  currentHole.hazards?.filter((h) => h.type === 'sandRect').map((h, i) => {
                    const rx = Math.min(8, h.w / 2, h.h / 2);
                    return (
                      <SvgG key={`rs-${i}`}>
                        <SvgRect x={h.x} y={h.y} width={h.w} height={h.h} rx={rx} ry={rx} fill={SURFACE_COLORS.sand} />
                        <SvgRect x={h.x} y={h.y} width={h.w} height={h.h} rx={rx} ry={rx} fill={`url(#${PATTERN_ID.sand})`} />
                      </SvgG>
                    );
                  }) || null
                )}
              </Svg>
            ) : null}

            {/* Slope arrows render on top of the green regardless of path (they're per-slope-zone annotations, not part of the vector data) */}
            {currentHole.terrain?.green && puttingMode ? slopeArrows.map((arrow) => (
              <Text
                key={arrow.key}
                pointerEvents="none"
                style={[
                  styles.slopeArrowText,
                  {
                    left: arrow.x * scaleX - 5,
                    top: arrow.y * scaleY - 9,
                    opacity: arrow.opacity ?? 0.7
                  }
                ]}
              >
                {arrow.char}
              </Text>
            )) : null}

            {currentHole.terrain?.tee ? (
              <View
                style={[
                  styles.tee,
                  {
                    left: currentHole.terrain.tee.x * scaleX,
                    top: currentHole.terrain.tee.y * scaleY,
                    width: currentHole.terrain.tee.w * scaleX,
                    height: currentHole.terrain.tee.h * scaleY,
                    borderRadius: currentHole.terrain.tee.r * scaleX
                  }
                ]}
              />
            ) : null}

            {currentHole.isRange && currentHole.rangeMarkers?.length && currentHole.terrain?.fairway?.[0]
              ? currentHole.rangeMarkers.map((yd) => {
                  const fair = currentHole.terrain.fairway[0];
                  const markerY = currentHole.ballStart.y - yd / YARDS_PER_WORLD;
                  return (
                    <React.Fragment key={`rm-${yd}`}>
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          left: fair.x * scaleX,
                          top: markerY * scaleY - 1,
                          width: fair.w * scaleX,
                          height: 2,
                          backgroundColor: 'rgba(255,255,255,0.55)'
                        }}
                      />
                      <Text
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          left: (fair.x + fair.w / 2) * scaleX - 18,
                          top: markerY * scaleY - 8,
                          width: 36,
                          textAlign: 'center',
                          color: '#ffffff',
                          fontSize: 11,
                          fontWeight: '900',
                          textShadowColor: 'rgba(0,0,0,0.55)',
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: 2
                        }}
                      >
                        {yd}
                      </Text>
                    </React.Fragment>
                  );
                })
              : null}

            {/* (Sand bunkers are drawn inside the unified SVG terrain block above —
             *  vector path for editorVectors courses, rect fallback for hand-authored.
             *  No legacy View-based sand rendering needed.) */}

            {/* Trees + rock bumpers — species-aware SVG art matching the
                designer's drawTree() exactly. Any `look` that's in the TREES
                table renders as a multi-primitive canopy; unknown looks
                (legacy 'rock' / missing) render as a brown bumper circle. */}
            {currentHole.obstacles?.some((o) => o.type === 'circle') ? (
              <Svg
                pointerEvents="none"
                width={WORLD.w * scaleX}
                height={WORLD.h * scaleY}
                viewBox={`0 0 ${WORLD.w} ${WORLD.h}`}
                style={{ position: 'absolute', left: 0, top: 0 }}
              >
                {currentHole.obstacles.map((o, i) => {
                  if (o.type !== 'circle') return null;
                  const isTree = o.look && Object.prototype.hasOwnProperty.call(TREES, o.look);
                  if (isTree) {
                    return (
                      <SvgG key={`tree-${i}`}>
                        {renderTreePrims(o.x, o.y, o.r, o.look)}
                      </SvgG>
                    );
                  }
                  // Fallback for unknown / rock looks: brown bumper circle.
                  return (
                    <SvgCircle
                      key={`rock-${i}`}
                      cx={o.x}
                      cy={o.y}
                      r={o.r}
                      fill="#6e5a46"
                      stroke="#4f3f31"
                      strokeWidth={1}
                    />
                  );
                })}
              </Svg>
            ) : null}

            {/* Legacy rect obstacles (walls). Kept for hand-authored courses
                that still have them. */}
            {currentHole.obstacles?.map((o, i) => {
              if (o.type !== 'rect') return null;
              return (
                <View
                  key={`obs-rect-${i}`}
                  style={[
                    styles.wall,
                    {
                      left: o.x * scaleX,
                      top: o.y * scaleY,
                      width: o.w * scaleX,
                      height: o.h * scaleY
                    }
                  ]}
                />
              );
            })}

            {puttingMode && puttAimPoint ? (
              <View
                pointerEvents="none"
                style={[
                  styles.puttAimMarker,
                  {
                    left: puttAimPoint.x * scaleX - 14,
                    top: puttAimPoint.y * scaleY - 14
                  }
                ]}
              >
                <View style={styles.puttAimMarkerH} />
                <View style={styles.puttAimMarkerV} />
              </View>
            ) : null}

            {puttPreview ? (
              <>
                {puttPreviewDots.map((dot) => (
                  <View
                    key={dot.key}
                    pointerEvents="none"
                    style={[
                      styles.puttPreviewDot,
                      {
                        width: dot.size,
                        height: dot.size,
                        borderRadius: dot.size / 2,
                        left: dot.point.x * scaleX - dot.size / 2,
                        top: dot.point.y * scaleY - dot.size / 2,
                        opacity: dot.opacity
                      }
                    ]}
                  />
                ))}
                <View
                  pointerEvents="none"
                  style={[
                    styles.puttPreviewFinal,
                    {
                      left: puttPreview.finalPos.x * scaleX - 7,
                      top: puttPreview.finalPos.y * scaleY - 7
                    }
                  ]}
                />
              </>
            ) : null}
          </View>

          {!ballMoving && !sunk ? aimPathSegments.map((seg) => (
            <View key={seg.key} pointerEvents="none" style={[styles.aimPathSegment, { left: seg.left, top: seg.top, width: seg.width, transform: [{ rotate: seg.angle }] }]} />
          )) : null}

          {!ballMoving && !sunk ? aimLineDots.map((dot) => (
            <React.Fragment key={dot.key}>
            {dot.pct > 0 ? <View
              pointerEvents="none"
              style={[
                styles.aimDot,
                {
                  width: dot.size,
                  height: dot.size,
                  borderRadius: dot.size / 2,
                  left: dot.x - dot.size / 2,
                  top: dot.y - dot.size / 2,
                  opacity: dot.opacity,
                  backgroundColor: dot.color
                }
              ]}
            /> : null}
            {dot.pct > 0 ? <Text style={[styles.aimDotLabel, { left: dot.x + 6, top: dot.y - 10, opacity: dot.opacity }]}>{Math.round(dot.pct * 100)}%</Text> : null}
            </React.Fragment>
          )) : null}

          <View
            style={[
              styles.cup,
              {
                width: cupRadius * 2,
                height: cupRadius * 2,
                borderRadius: cupRadius,
                left: screenCup.x - cupRadius,
                top: screenCup.y - cupRadius
              }
            ]}
          />

          <View
            pointerEvents="none"
            style={[
              styles.golferWrap,
              {
                width: golferWidth,
                height: golferHeight,
                left: golferAnchor.x - golferWidth / 2,
                top: golferAnchor.y - golferHeight / 2,
                transform: golferCelebrationTransform
              }
            ]}
          >
            {GOLFER_PIXELS.map((pixel, i) => (
              <View
                key={`golfer-px-${i}`}
                style={[
                  styles.golferPixel,
                  {
                    width: golferPixelSize,
                    height: golferPixelSize,
                    left: pixel.x * golferPixelSize,
                    top: pixel.y * golferPixelSize,
                    backgroundColor: pixel.color
                  }
                ]}
              />
            ))}
          </View>

          {/* Shot Tracer */}
          {(() => {
            const tracerPoints = shotTracer.length > 0
              ? [...shotTracer, { x: ball.x, y: ball.y, z: ballHeight }]
              : [];
            return tracerPoints.length > 1 ? tracerPoints.map((pt, i) => {
              const sx = (pt.x - camera.x) * pixelsPerWorld + viewWidth / 2;
              // Match the main ball's smooth saturation lift — crucial for a
              // parabolic-looking trail. The old Math.min(raw, 78) chopped
              // the arc flat once the ball climbed past the cap, producing a
              // rising → plateau → falling zig-zag instead of a parabola.
              const tracerRawLiftPx = (pt.z || 0) * pixelsPerWorld * 0.85;
              const tracerLiftPx = visualLiftPx(tracerRawLiftPx);
              const sy = (pt.y - camera.y) * pixelsPerWorld + cameraAnchorY - tracerLiftPx;
              const age = (tracerPoints.length - 1 - i) / Math.max(1, tracerPoints.length - 1);
              const opacity = Math.max(0.06, 0.95 - age * 0.9);
              return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: sx - 1,
                  top: sy - 1,
                  width: 2.5,
                  height: 2.5,
                  borderRadius: 1.25,
                  backgroundColor: '#ffd700',
                  opacity
                }}
              />
            );
            }) : null;
          })()}

          {!sunk ? (
            <>
              <View
                style={[
                  styles.ballShadow,
                  {
                    width: ballRadius * 2.05,
                    height: ballRadius * 1.15,
                    borderRadius: ballRadius,
                    left: screenBall.x - ballRadius * 1.02,
                    top: screenBall.y - ballRadius * 0.46,
                    opacity: Math.max(0.08, shadowOpacity),
                    transform: [{ scaleX: shadowScale }, { scaleY: shadowScale * 0.96 }]
                  }
                ]}
              />

              <View
                style={[
                  styles.ball,
                  {
                    width: ballRadius * 2,
                    height: ballRadius * 2,
                    borderRadius: ballRadius,
                    left: screenBall.x - ballRadius,
                    top: screenBall.y - ballRadius - liftPx,
                    transform: [{ scale: ballVisualScale }]
                  }
                ]}
              />
            </>
          ) : (
            // Sunk: show the ball sitting inside the cup. ballHeight is
            // negative during/after the drop — map it to a sub-cup offset
            // and darken slightly so it reads as below the rim.
            (() => {
              const screenCupHere = toScreen(currentHole.cup);
              const inCupRadius = Math.max(3, cupRadius * 0.58);
              // ballHeight ranges roughly [-1.1, 0.55] during the drop. Below
              // zero means below the rim.
              const below = Math.max(0, -ballHeight); // 0..1.1
              const depthPx = clamp(below * cupRadius * 0.85, 0, cupRadius * 0.6);
              const darkness = clamp(below / 1.1, 0, 1);
              const ballShade = `rgb(${Math.round(251 - 110 * darkness)}, ${Math.round(251 - 110 * darkness)}, ${Math.round(248 - 110 * darkness)})`;
              // Show the ball riding above the rim while still in the air.
              const aboveLiftPx = ballHeight > 0 ? ballHeight * pixelsPerWorld * 1.1 : 0;
              return (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    width: inCupRadius * 2,
                    height: inCupRadius * 2,
                    borderRadius: inCupRadius,
                    left: screenCupHere.x - inCupRadius,
                    top: screenCupHere.y - inCupRadius + depthPx - aboveLiftPx,
                    backgroundColor: ballShade,
                    borderWidth: 1,
                    borderColor: 'rgba(9,16,6,0.65)',
                    shadowColor: '#000',
                    shadowOpacity: 0.45,
                    shadowRadius: 2,
                    shadowOffset: { width: 0, height: 1 }
                  }}
                />
              );
            })()
          )}
          </View>
        </View>

        {/* Zoom controls — fixed overlay above everything. Placed as a
            courseShell-level sibling so it's never covered by the world
            layer, and given its own high zIndex so menus still beat it. */}
        <View style={styles.zoomOverlay} pointerEvents="box-none">
          <Pressable
            style={[styles.zoomBtn, zoomLevel >= ZOOM_STEPS.length - 1 && styles.zoomBtnDisabled]}
            onPress={zoomIn}
            disabled={zoomLevel >= ZOOM_STEPS.length - 1}
          >
            <Text style={styles.zoomBtnText}>+</Text>
          </Pressable>
          <View style={styles.zoomBadge} pointerEvents="none">
            <Text style={styles.zoomBadgeText}>{ZOOM_STEPS[zoomLevel].toFixed(1)}x</Text>
          </View>
          <Pressable
            style={[styles.zoomBtn, zoomLevel <= 0 && styles.zoomBtnDisabled]}
            onPress={zoomOut}
            disabled={zoomLevel <= 0}
          >
            <Text style={styles.zoomBtnText}>−</Text>
          </Pressable>
        </View>

        <View style={styles.topOverlay} pointerEvents="box-none">
          <View style={styles.versionWrap} pointerEvents="none">
            <Text style={styles.versionText}>{BUILD_VERSION}</Text>
          </View>
          <View style={styles.topHudRow}>
            <View style={styles.menuWrap}>
              <Pressable style={styles.menuButton} onPress={() => setMenuOpen((v) => !v)}>
                <Text style={styles.menuIcon}>☰</Text>
              </Pressable>
              {menuOpen ? (
                <View style={styles.menuPanel}>
                  <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); retryHole(); }}>
                    <Text style={styles.menuItemText}>Retry Hole</Text>
                  </Pressable>
                  <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); resetBall({ penaltyStroke: true }); }}>
                    <Text style={styles.menuItemText}>Quick Reset</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.menuItem, holeIndex === 0 && styles.disabled]}
                    disabled={holeIndex === 0}
                    onPress={() => {
                      setMenuOpen(false);
                      setHoleIndex((h) => Math.max(0, h - 1));
                    }}
                  >
                    <Text style={styles.menuItemText}>Prev Hole</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.menuItem, !sunk && styles.disabled]}
                    disabled={!sunk}
                    onPress={() => {
                      setMenuOpen(false);
                      goToNextHole();
                    }}
                  >
                    <Text style={styles.menuItemText}>{isLastHole ? 'Round Done' : 'Next Hole'}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.menuItem, styles.menuItemDanger]}
                    onPress={backToMenu}
                  >
                    <Text style={styles.menuItemText}>Back to Menu</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={styles.hudStrip}>
              <View style={styles.hudItemCompactWide}>
                <Text style={styles.hudLabelCompact}>Hole</Text>
                <Text style={styles.hudValueCompact}>{safeHoleIndex + 1}/{ACTIVE_HOLES.length}</Text>
              </View>
              <View style={styles.hudItemCompactWide}>
                <Text style={styles.hudLabelCompact}>Par</Text>
                <Text style={styles.hudValueCompact}>{currentHole.par}</Text>
              </View>
              <View style={styles.hudItemCompactWide}>
                <Text style={styles.hudLabelCompact}>Shot</Text>
                <Text style={styles.hudValueCompact}>{shotNumber}</Text>
              </View>
              <Pressable
                style={[
                  styles.hudItemCompactWide,
                  styles.hudItemPressable,
                  (shotType !== 'normal') && styles.hudItemActive,
                  puttingMode && styles.disabled
                ]}
                disabled={puttingMode}
                onPress={() => {
                  setShotTypeMenuOpen((v) => !v);
                }}
              >
                <Text style={styles.hudLabelCompact}>Type</Text>
                <Text style={styles.hudValueCompact}>{(SHOT_TYPE_PROFILES[shotType] || SHOT_TYPE_PROFILES.normal).label}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.hudItemCompactWide,
                  styles.hudItemPressable,
                  cameraFocus === 'golfer' && styles.hudItemActive,
                ]}
                onPress={() => setCameraFocus((v) => (v === 'aim' ? 'golfer' : 'aim'))}
              >
                <Text style={styles.hudLabelCompact}>View</Text>
                <Text style={styles.hudValueCompact}>{cameraFocus === 'aim' ? 'Aim' : 'Me'}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.hudItemCompactWide,
                  styles.hudItemPressable,
                  shotControlOpen && styles.hudItemActive,
                  puttingMode && styles.disabled
                ]}
                disabled={puttingMode}
                onPress={() => {
                  setShotControlOpen((v) => !v);
                  setLastShotNote('Shot shape opened from yardage. Drag the blue dot, then tap the ball to hit.');
                }}
              >
                <Text style={styles.hudLabelCompact}>Yd</Text>
                <Text style={styles.hudValueCompact}>{yardsToCup}</Text>
              </Pressable>
              {puttingMode ? (
                <View style={styles.hudItemPuttingCompact}>
                  <Text style={styles.hudPuttingText}>PUTT</Text>
                </View>
              ) : null}
              <View style={styles.hudLieBadgeWide}>
                <View style={[styles.hudLieSwatch, { backgroundColor: (SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).color }]} />
                <Text style={styles.hudLieEmoji}>{(SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).emoji}</Text>
                <Text style={styles.hudLieMini}>{(SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).label}</Text>
              </View>
              <View style={styles.hudWindCompact}>
                <Text style={styles.hudWindSpeed}>{windLabel}</Text>
                <Text style={styles.hudWindDirMini}>{windArrow} {windDirLabel}</Text>
              </View>
            </View>
          </View>
        </View>

        {shotTypeMenuOpen && !puttingMode && !sunk ? (
          <View style={styles.shotTypeMenu} pointerEvents="box-none">
            {['normal', 'chip', 'flop', 'stinger', 'bump'].map((type) => {
              const eligible = shotTypeEligible(type, selectedClub, currentLie);
              const prof = SHOT_TYPE_PROFILES[type];
              const active = shotType === type;
              return (
                <Pressable
                  key={type}
                  disabled={!eligible}
                  style={[
                    styles.shotTypeOption,
                    active && styles.shotTypeOptionActive,
                    !eligible && styles.disabled,
                  ]}
                  onPress={() => {
                    if (!eligible) return;
                    setShotType(type);
                    setShotTypeMenuOpen(false);
                  }}
                >
                  <Text style={[styles.shotTypeOptionLabel, active && styles.shotTypeOptionLabelActive]}>{prof.label}</Text>
                  <Text style={styles.shotTypeOptionSub}>
                    {type === 'normal' ? 'Full carry, full height' :
                     type === 'chip' ? '50% carry, 70% apex' :
                     type === 'flop' ? '33% carry, 2x apex · wedge only' :
                     type === 'stinger' ? 'Full carry, 50% apex · iron/wood off tee or fairway' :
                     '75% carry, 40% apex · wedge only'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}



        <View style={styles.bottomOverlay}>
          <View style={styles.bottomMainRow}>
            <Pressable
              style={[styles.clubCard, shotControlOpen && styles.clubCardActive]}
              onPress={() => {
                if (puttingMode) {
                  return;
                }
                setShotControlOpen(true);
                setLastShotNote('Shot shape opened. Drag the blue dot, then tap the ball to hit.');
              }}
            >
              <Text style={styles.clubCardTitle}>{selectedClub.name}</Text>
              <Text style={styles.clubCardSub}>{selectedClub.short} • {shotShape}</Text>
              <Text style={styles.clubCardYards}>{previewYards} yd</Text>
              <Text style={styles.clubCardMeta}>Stock {stockClubYards} • To pin {yardsToCup}</Text>
              <Text style={styles.clubCardMeta}>{puttingMode ? `Target: ${puttTargetText}` : tempoLabel}</Text>
              {puttingMode ? <Text style={styles.clubCardMeta}>{puttStatusText}</Text> : null}
            </Pressable>

            <View style={styles.swingDock}>
              {shotControlOpen && !puttingMode ? (
                <View style={[styles.swingPad, styles.swingPadActive]}>
                  <View style={styles.shotPadGuideWrap} {...shotControlResponder.panHandlers}>
                    <View style={styles.shotPadCrosshairH} pointerEvents="none" />
                    <View style={styles.shotPadCrosshairV} pointerEvents="none" />
                    <View
                      pointerEvents="none"
                      style={[
                        styles.spinDot,
                        draggingSpinDot && styles.spinDotActive,
                        {
                          left: PAD_CENTER + spinOffset.x - SPIN_DOT_RADIUS,
                          top: PAD_CENTER + spinOffset.y - SPIN_DOT_RADIUS
                        }
                      ]}
                    />
                  </View>
                  <Pressable
                    style={styles.shotDoneButton}
                    onPress={() => {
                      setShotControlOpen(false);
                      setLastShotNote('Shot shape set. Tap Hit to strike the ball.');
                    }}
                  >
                    <Text style={styles.shotDoneText}>Done</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.swingPad} {...swingResponder.panHandlers}>
                  {/* Radial power ring */}
                  <View style={[
                    styles.powerRing,
                    {
                      width: SHOT_PAD_SIZE * clamp(powerPct / 100, 0.15, 1.2),
                      height: SHOT_PAD_SIZE * clamp(powerPct / 100, 0.15, 1.2),
                      borderRadius: SHOT_PAD_SIZE * clamp(powerPct / 100, 0.15, 1.2) / 2,
                      borderColor: powerPct > 100 ? '#ff4444' : '#4adb6a',
                      opacity: swingPhase !== 'idle' ? 0.7 : 0.25
                    }
                  ]} />
                  <View style={styles.swingHaloOuter} />
                  <View style={styles.swingHaloInner}>
                    <Text style={styles.swingPct}>
                      {swingPhase === 'backswing' ? `${powerPct}%`
                        : swingPhase === 'forward' ? (Math.abs(swingDeviation) < 0.1 ? '↑' : swingDeviation < 0 ? '↰' : '↱')
                        : '⛳'}
                    </Text>
                  </View>
                  {/* Swing guide */}
                  {swingPhase !== 'idle' ? (
                    <View style={styles.swingGuideWrap} pointerEvents="none">
                      <Text style={styles.swingGuideText}>
                        {swingPhase === 'backswing'
                          ? '↓ Pull down for power'
                          : puttingMode
                            ? '↑ Swipe up straight, release to hit'
                            : `Swipe up straight! ${Math.abs(swingDeviation) < 0.1 ? '✓ Straight' : swingDeviation < -0.3 ? '← Pull' : swingDeviation > 0.3 ? '→ Push' : swingDeviation < 0 ? '← Slight' : '→ Slight'}`}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.swingGuideWrap} pointerEvents="none">
                      <Text style={styles.swingGuideText}>{puttingMode ? 'Pull down, then swipe up to putt' : 'Hold & drag down'}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>

          {puttingMode ? (
            <View style={styles.puttCompactBar}>
              <Pressable
                style={styles.puttChipToggle}
                onPress={() => {
                  chipOverrideRef.current = true;
                  setPuttingMode(false);
                  setPuttPreview(null);
                  setPuttAimPoint(null);
                  setPuttSimulated(false);
                  setPuttTargetPowerPct(null);
                  setPuttSwingFeedback('');
                  setSelectedClubIndex(1); // switch to LW for chip
                  setZoomLevel(DEFAULT_ZOOM_INDEX);
                  setTempoLabel('Chip mode — tap Hit to swing');
                }}
              >
                <Text style={styles.puttChipToggleText}>🏌️ Chip</Text>
              </Pressable>
              <View style={styles.puttCompactInfo}>
                <Text style={styles.puttCompactTarget}>Target: {puttTargetText}</Text>
                <Text style={styles.puttCompactSub}>{puttStatusText}</Text>
              </View>
              <Pressable
                style={[
                  styles.puttCompactSimBtn,
                  (!puttAimPoint || sunk || ballMoving || puttSimulated) && styles.disabled
                ]}
                disabled={!puttAimPoint || sunk || ballMoving || puttSimulated}
                onPress={handleSimulatePutt}
              >
                <Text style={styles.puttCompactSimText}>Simulate</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {(currentLie === 'green' || currentLie === 'fringe') && !ballMoving && !sunk ? (
                <Pressable
                  style={styles.puttToggleBtn}
                  onPress={() => {
                    setPuttingMode(true);
                    setSelectedClubIndex(0);
                    setShotControlOpen(false);
                    setSpinOffset({ x: 0, y: 0 });
                    setPuttPreview(null);
                    setPuttAimPoint(null);
                    setPuttSimulated(false);
                    setPuttTargetPowerPct(null);
                    setPuttSwingFeedback('');
                    setTempoLabel('Place aim point');
                  }}
                >
                  <Text style={styles.puttToggleBtnText}>⛳ Switch to Putt</Text>
                </Pressable>
              ) : null}
              <View style={styles.clubSelectorWrap}>
                <Pressable
                  style={styles.clubPickerTrigger}
                  onPress={() => setClubPickerOpen((v) => !v)}
                >
                  <Text style={styles.clubPickerTriggerLabel}>Club</Text>
                  <Text style={styles.clubPickerTriggerValue}>{selectedClub.short} • {selectedClub.name}</Text>
                  <Text style={styles.clubPickerTriggerChevron}>{clubPickerOpen ? '▲' : '▼'}</Text>
                </Pressable>

                {clubPickerOpen ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clubScrollContent}>
                    {CLUBS.map((club, index) => (
                      <Pressable
                        key={club.key}
                        style={[styles.clubChip, index === selectedClubIndex && styles.clubChipActive]}
                        onPress={() => {
                          setSelectedClubIndex(index);
                          setClubPickerOpen(false);
                        }}
                      >
                        <Text style={[styles.clubChipText, index === selectedClubIndex && styles.clubChipTextActive]}>
                          {club.short}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </View>

            </>
          )}

          {waterNotice && !sunk && !waterDropMenu ? <Text style={styles.warning}>Water hazard: +1 stroke penalty.</Text> : null}
        </View>


        {/* Water Drop Menu — USGA Rule 17 penalty-area relief options. */}
        {waterDropMenu ? (
          <View style={styles.scorecardOverlay}>
            <View style={[styles.scorecardCard, { maxWidth: 340, gap: 10 }]}>
              <Text style={styles.scorecardTitle}>💧 Penalty Area</Text>
              <Text style={{ color: '#c8dfc4', fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
                Ball in water. +1 stroke penalty.{"\n"}Choose your relief option:
              </Text>
              <Pressable
                style={[styles.nextHoleBtn, { backgroundColor: '#5a7a3a', paddingVertical: 12 }]}
                onPress={() => handleWaterDrop(waterDropMenu.lastPos)}
              >
                <Text style={styles.nextHoleBtnText}>🔄 Stroke & Distance</Text>
                <Text style={{ color: '#d6e6c8', fontSize: 11, textAlign: 'center' }}>Replay from the last spot</Text>
              </Pressable>
              <Pressable
                style={[styles.nextHoleBtn, { backgroundColor: '#3a8a5a', paddingVertical: 12 }]}
                onPress={() => handleWaterDrop(waterDropMenu.entryPos)}
              >
                <Text style={styles.nextHoleBtnText}>⛳ Lateral Relief</Text>
                <Text style={{ color: '#d6e6c8', fontSize: 11, textAlign: 'center' }}>Drop near the water edge where the ball crossed</Text>
              </Pressable>
              {waterDropMenu.backDrop ? (
                <Pressable
                  style={[styles.nextHoleBtn, { backgroundColor: '#4a6aa0', paddingVertical: 12 }]}
                  onPress={() => handleWaterDrop(waterDropMenu.backDrop)}
                >
                  <Text style={styles.nextHoleBtnText}>📐 Back on the Line</Text>
                  <Text style={{ color: '#d6e2f0', fontSize: 11, textAlign: 'center' }}>Drop behind entry on the flag line</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {showScorecard ? (
          <View style={styles.scorecardOverlay}>
            <View style={styles.scorecardCard}>
              <Text style={styles.scorecardTitle}>{isLastHole ? 'Round Complete!' : 'IGT Scorecard'}</Text>
              {/* Horizontal scorecard — holes as columns, rows for labels/par/score */}
              <ScrollView horizontal style={styles.scorecardScrollH} showsHorizontalScrollIndicator={false}>
                <View style={styles.scorecardTable}>
                  {/* Hole numbers row */}
                  <View style={styles.scorecardTableRow}>
                    <View style={styles.scorecardLabelCell}><Text style={styles.scorecardLabelText}>Hole</Text></View>
                    {frontNine.map((row) => (
                      <View key={`h-${row.hole}`} style={[styles.scorecardDataCell, row.hole === holeIndex + 1 && styles.scorecardDataCellActive]}>
                        <Text style={styles.scorecardDataText}>{row.hole}</Text>
                      </View>
                    ))}
                    {ACTIVE_HOLES.length >= 9 && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>OUT</Text></View>}
                    {backNine && backNine.map((row) => (
                      <View key={`h-${row.hole}`} style={[styles.scorecardDataCell, row.hole === holeIndex + 1 && styles.scorecardDataCellActive]}>
                        <Text style={styles.scorecardDataText}>{row.hole}</Text>
                      </View>
                    ))}
                    {backNine && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>IN</Text></View>}
                    <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>TOT</Text></View>
                  </View>
                  {/* Par row */}
                  <View style={styles.scorecardTableRow}>
                    <View style={styles.scorecardLabelCell}><Text style={styles.scorecardLabelText}>Par</Text></View>
                    {frontNine.map((row) => (
                      <View key={`p-${row.hole}`} style={styles.scorecardDataCell}><Text style={styles.scorecardDataText}>{row.par}</Text></View>
                    ))}
                    {ACTIVE_HOLES.length >= 9 && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>{sumPar(frontNine)}</Text></View>}
                    {backNine && backNine.map((row) => (
                      <View key={`p-${row.hole}`} style={styles.scorecardDataCell}><Text style={styles.scorecardDataText}>{row.par}</Text></View>
                    ))}
                    {backNine && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>{sumPar(backNine)}</Text></View>}
                    <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>{sumPar(scorecardRows)}</Text></View>
                  </View>
                  {/* Score row */}
                  <View style={styles.scorecardTableRow}>
                    <View style={styles.scorecardLabelCell}><Text style={styles.scorecardLabelText}>Score</Text></View>
                    {frontNine.map((row) => {
                      const played = row.strokes !== null;
                      const shape = played ? getScoreShape(row.strokes, row.par) : null;
                      return (
                        <View key={`s-${row.hole}`} style={[styles.scorecardDataCell, row.hole === holeIndex + 1 && styles.scorecardDataCellActive]}>
                          {!played ? <Text style={styles.scorecardUnplayed}>—</Text>
                           : shape === 'eagle' ? <View style={styles.scoreBadgeDoubleOuter}><View style={styles.scoreBadgeDoubleInner}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View></View>
                           : shape === 'birdie' ? <View style={styles.scoreBadgeSingleCircle}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View>
                           : shape === 'bogey' ? <View style={styles.scoreBadgeSingleSquare}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View>
                           : shape === 'doubleBogey' ? <View style={styles.scoreBadgeDoubleSquareOuter}><View style={styles.scoreBadgeDoubleSquareInner}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View></View>
                           : shape === 'tripleBogey' ? <View style={styles.scoreBadgeSolidSquare}><Text style={styles.scoreBadgeSolidText}>{row.strokes}</Text></View>
                           : <Text style={styles.scorecardDataText}>{row.strokes}</Text>}
                        </View>
                      );
                    })}
                    {ACTIVE_HOLES.length >= 9 && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>{sumStrokes(frontNine.filter(r => r.strokes !== null)) || '—'}</Text></View>}
                    {backNine && backNine.map((row) => {
                      const played = row.strokes !== null;
                      const shape = played ? getScoreShape(row.strokes, row.par) : null;
                      return (
                        <View key={`s-${row.hole}`} style={[styles.scorecardDataCell, row.hole === holeIndex + 1 && styles.scorecardDataCellActive]}>
                          {!played ? <Text style={styles.scorecardUnplayed}>—</Text>
                           : shape === 'eagle' ? <View style={styles.scoreBadgeDoubleOuter}><View style={styles.scoreBadgeDoubleInner}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View></View>
                           : shape === 'birdie' ? <View style={styles.scoreBadgeSingleCircle}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View>
                           : shape === 'bogey' ? <View style={styles.scoreBadgeSingleSquare}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View>
                           : shape === 'doubleBogey' ? <View style={styles.scoreBadgeDoubleSquareOuter}><View style={styles.scoreBadgeDoubleSquareInner}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View></View>
                           : shape === 'tripleBogey' ? <View style={styles.scoreBadgeSolidSquare}><Text style={styles.scoreBadgeSolidText}>{row.strokes}</Text></View>
                           : <Text style={styles.scorecardDataText}>{row.strokes}</Text>}
                        </View>
                      );
                    })}
                    {backNine && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>{sumStrokes(backNine.filter(r => r.strokes !== null)) || '—'}</Text></View>}
                    <View style={styles.scorecardTotalCell}><Text style={[styles.scorecardTotalCellText, scorecardDiffStyle]}>{scorecardTotalStrokes || '—'}</Text></View>
                  </View>
                </View>
              </ScrollView>
              <View style={styles.scorecardTotals}>
                <View style={styles.scorecardTotalRow}>
                  <Text style={styles.scorecardTotalLabel}>{playedRows.length}/{ACTIVE_HOLES.length} played</Text>
                  <Text style={styles.scorecardTotalValue}>{scorecardTotalStrokes || '—'} strokes (par {scorecardTotalPar})</Text>
                  <Text style={[styles.scorecardTotalValue, scorecardDiffStyle, { fontSize: 18 }]}>{scorecardTotalStrokes ? scorecardDiffText : '—'}</Text>
                </View>
              </View>
              {!isLastHole ? (
                <Pressable style={styles.nextHoleBtn} onPress={goToNextHole}>
                  <Text style={styles.nextHoleBtnText}>Next Hole →</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable style={styles.nextHoleBtn} onPress={startNewRound}>
                    <Text style={styles.nextHoleBtnText}>New Round</Text>
                  </Pressable>
                  <Pressable style={styles.chooseCourseBtn} onPress={backToMenu}>
                    <Text style={styles.nextHoleBtnText}>Choose Course</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        ) : null}

        {/* Shot Stats Card */}
        {showShotStats && lastShotStats && !ballMoving ? (
          <Pressable style={styles.shotStatsOverlay} onPress={() => setShowShotStats(false)}>
            <Pressable style={styles.shotStatsCard} onPress={(e) => e.stopPropagation?.()}>
              <ScrollView
                style={styles.shotStatsScroll}
                contentContainerStyle={styles.shotStatsScrollContent}
                showsVerticalScrollIndicator
              >
              <View style={styles.shotStatsHeaderRow}>
                <Text style={styles.shotStatsTitle}>📊 Shot Stats</Text>
                {lastShotStats.swingId ? (
                  <Text style={styles.shotStatsSwingId}>#{lastShotStats.swingId}</Text>
                ) : null}
              </View>

              {/* Swing Path Visualization */}
              {lastShotStats.swingPath && lastShotStats.swingPath.length > 2 ? (
                <View style={styles.swingPathBox}>
                  <Text style={styles.swingPathLabel}>Swing Path</Text>
                  <View style={styles.swingPathCanvas}>
                    {/* Center line (ideal straight path) */}
                    <View style={styles.swingPathCenterLine} />
                    {/* Draw the swing trail as dots */}
                    {lastShotStats.swingPath.map((pt, i) => {
                      const cx = 60 + pt.x * 55;
                      const cy = 75 + pt.y * 70;
                      const isBack = pt.phase === 'back' || pt.phase === 'start';
                      const size = isBack ? 4 : 5;
                      return (
                        <View
                          key={i}
                          style={{
                            position: 'absolute',
                            left: cx - size / 2,
                            top: cy - size / 2,
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            backgroundColor: isBack ? '#4adb6a' : '#ffdd44',
                            opacity: 0.4 + (i / lastShotStats.swingPath.length) * 0.6
                          }}
                        />
                      );
                    })}
                    {/* Start dot */}
                    <View style={[styles.swingPathDot, { left: 57, top: 72, backgroundColor: '#fff' }]} />
                  </View>
                  <View style={styles.swingPathLegend}>
                    <View style={styles.swingPathLegendItem}>
                      <View style={[styles.swingPathLegendDot, { backgroundColor: '#4adb6a' }]} />
                      <Text style={styles.swingPathLegendText}>Backswing</Text>
                    </View>
                    <View style={styles.swingPathLegendItem}>
                      <View style={[styles.swingPathLegendDot, { backgroundColor: '#ffdd44' }]} />
                      <Text style={styles.swingPathLegendText}>Forward</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              <View style={styles.shotStatsGrid}>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Club</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.clubName}</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Power</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.power}%</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Carry</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.carry} yds</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Roll</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.roll} yds</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Total</Text>
                  <Text style={[styles.shotStatValue, styles.shotStatTotal]}>{lastShotStats.totalDist} yds</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Peak Height</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.peakHeight} ft</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Contact</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.contact}</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Shape</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.shape}</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Curve</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.deviationDeg}°</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Tempo</Text>
                  <Text style={[styles.shotStatValue, lastShotStats.tempoTag === 'Perfect' ? { color: '#88F8BB' } : lastShotStats.tempoTag === 'Rushed' || lastShotStats.tempoTag === 'Frozen' || lastShotStats.tempoTag === 'Decel' ? { color: '#ef4444' } : lastShotStats.tempoTag === 'Slow' ? { color: '#f0c040' } : null]}>
                    {lastShotStats.tempoTag === 'Perfect' ? '✨ ' : lastShotStats.tempoTag === 'Smooth' ? '👌 ' : lastShotStats.tempoTag === 'Rushed' ? '⚡ ' : lastShotStats.tempoTag === 'Slow' ? '🐢 ' : lastShotStats.tempoTag === 'Frozen' ? '🧊 ' : lastShotStats.tempoTag === 'Decel' ? '🪫 ' : lastShotStats.tempoTag === 'Snappy' ? '💥 ' : ''}{lastShotStats.tempoTag || 'Normal'}
                  </Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Lie</Text>
                  <Text style={styles.shotStatValue}>{(SURFACE_PHYSICS[lastShotStats.endLie] || SURFACE_PHYSICS.rough).emoji} {(SURFACE_PHYSICS[lastShotStats.endLie] || SURFACE_PHYSICS.rough).label}</Text>
                </View>
              </View>
              {devMode && lastShotStats.tempoMetrics ? (() => {
                const m = lastShotStats.tempoMetrics;
                const th = TEMPO_THRESHOLDS;
                const rows = [
                  { label: 'backJerk',     v: m.backJerk, fmt: m.backJerk.toFixed(2), thresh: th.backJerk, relation: '>', trips: 'Jerky Back' },
                  { label: 'forwardJerk',  v: m.forwardJerk, fmt: m.forwardJerk.toFixed(2), thresh: th.forwardJerk, relation: '>', trips: 'Jerky Fwd' },
                  { label: 'pauseMs',      v: m.pauseMs, fmt: Math.round(m.pauseMs) + 'ms', thresh: th.pauseTolerance, relation: '>', trips: 'Paused' },
                  { label: 'followThrough', v: m.followThrough, fmt: (m.followThrough * 100).toFixed(0) + '%', thresh: th.followThroughCommitted, relation: '≥', trips: 'Committed (≥60%)  ·  Coasted (<30%)' },
                  { label: 'peakBack',     v: m.peakBack, fmt: m.peakBack.toFixed(2) + ' px/ms', thresh: null },
                  { label: 'peakForward',  v: m.peakForward, fmt: m.peakForward.toFixed(2) + ' px/ms', thresh: null },
                ];
                // Build speed-vs-time series for the forward phase.
                const samples = lastShotStats.rawSamples || [];
                const forwardSamples = samples.filter((s, i) => s.phase === 'forward');
                const speeds = [];
                for (let i = 1; i < forwardSamples.length; i++) {
                  const a = forwardSamples[i - 1];
                  const b = forwardSamples[i];
                  const dt = Math.max(1, b.t - a.t);
                  speeds.push({ t: b.t - forwardSamples[0].t, v: Math.hypot(b.x - a.x, b.y - a.y) / dt });
                }
                const maxV = Math.max(0.001, ...speeds.map((s) => s.v));
                const maxT = Math.max(1, ...speeds.map((s) => s.t));
                return (
                  <View style={styles.devPanel}>
                    <Text style={styles.devPanelTitle}>🔧 DEV — tempo metrics</Text>
                    {rows.map((r) => {
                      const tripped = r.trips && (
                        (r.label === 'backJerk' && m.backJerk > th.backJerk) ||
                        (r.label === 'forwardJerk' && m.forwardJerk > th.forwardJerk) ||
                        (r.label === 'pauseMs' && m.pauseMs > th.pauseTolerance) ||
                        (r.label === 'followThrough' && (m.followThrough >= th.followThroughCommitted || m.followThrough < th.followThroughCoasted))
                      );
                      return (
                        <View key={r.label} style={styles.devMetricRow}>
                          <Text style={styles.devMetricLabel}>{r.label}</Text>
                          <Text style={[styles.devMetricValue, tripped && { color: '#ff9a5a' }]}>{r.fmt}</Text>
                          {r.thresh !== null ? (
                            <Text style={styles.devMetricThresh}>
                              {r.relation} {typeof r.thresh === 'number' && r.thresh > 5 ? Math.round(r.thresh) + 'ms' : r.thresh}
                            </Text>
                          ) : <Text style={styles.devMetricThresh}>—</Text>}
                        </View>
                      );
                    })}

                    {/* Speed-vs-time — forward swing only */}
                    {speeds.length > 2 ? (
                      <View style={styles.devGraphBox}>
                        <Text style={styles.devGraphLabel}>Forward swing speed · peak {maxV.toFixed(2)} px/ms</Text>
                        <View style={styles.devGraphCanvas}>
                          <View style={styles.devGraphBaseline} />
                          {speeds.map((s, i) => {
                            const left = (s.t / maxT) * 100;
                            const height = Math.max(2, (s.v / maxV) * 46);
                            // Mark the peak position with a brighter color
                            const peakIdx = speeds.reduce((best, cur, idx) => speeds[idx].v > speeds[best].v ? idx : best, 0);
                            return (
                              <View
                                key={i}
                                style={{
                                  position: 'absolute',
                                  left: `${left}%`,
                                  bottom: 0,
                                  width: 3,
                                  height,
                                  marginLeft: -1.5,
                                  backgroundColor: i === peakIdx ? '#ffdd44' : '#6bdc84',
                                  borderRadius: 1.5,
                                }}
                              />
                            );
                          })}
                          {/* Ideal: peak near end (committed) — faint reference line */}
                          <View style={styles.devGraphIdealDot} />
                        </View>
                        <View style={styles.devGraphAxis}>
                          <Text style={styles.devGraphAxisText}>0ms</Text>
                          <Text style={styles.devGraphAxisText}>{Math.round(maxT)}ms</Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Coaching — per-flaw tips */}
                    {(() => {
                      const tips = coachSwing(lastShotStats.tempoTag, m);
                      if (!tips.length) return null;
                      return (
                        <View style={styles.devCoachBox}>
                          <Text style={styles.devCoachTitle}>Coaching</Text>
                          {tips.map((t, i) => (
                            <Text key={i} style={styles.devCoachText}>• {t}</Text>
                          ))}
                        </View>
                      );
                    })()}

                    {/* Side-by-side trace: your swing vs ideal */}
                    {lastShotStats.swingPath && lastShotStats.swingPath.length > 2 ? (
                      <View style={styles.devCompareBox}>
                        <View style={styles.devCompareCol}>
                          <Text style={styles.devCompareLabel}>Your trace</Text>
                          <View style={styles.devCompareCanvas}>
                            {lastShotStats.swingPath.map((pt, i) => {
                              const cx = 50 + pt.x * 40;
                              const cy = 50 + pt.y * 40;
                              const isBack = pt.phase === 'back' || pt.phase === 'start';
                              return (
                                <View key={i} style={{ position: 'absolute', left: cx - 1.5, top: cy - 1.5, width: 3, height: 3, borderRadius: 1.5, backgroundColor: isBack ? '#4adb6a' : '#ffdd44', opacity: 0.3 + (i / lastShotStats.swingPath.length) * 0.7 }} />
                              );
                            })}
                          </View>
                        </View>
                        <View style={styles.devCompareCol}>
                          <Text style={styles.devCompareLabel}>Ideal</Text>
                          <View style={styles.devCompareCanvas}>
                            {/* Backswing: straight down, evenly spaced (smooth) */}
                            {Array.from({ length: 12 }).map((_, i) => (
                              <View key={`ib-${i}`} style={{ position: 'absolute', left: 50 - 1.5, top: 14 + i * 3 - 1.5, width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#4adb6a', opacity: 0.4 + i * 0.04 }} />
                            ))}
                            {/* Forward: straight up, speed accelerates to end (spacing widens) */}
                            {Array.from({ length: 10 }).map((_, i) => {
                              const u = i / 9;
                              const progress = 0.25 + u * 0.75; // committed profile
                              return (
                                <View key={`if-${i}`} style={{ position: 'absolute', left: 50 - 1.5, top: 50 - progress * 35 - 1.5, width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#ffdd44', opacity: 0.4 + i * 0.05 }} />
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })() : null}

              <View style={styles.shotStatsActions}>
                <Pressable
                  style={styles.shotStatsActionBtn}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    const entry = swingLog.find((s) => s.id === lastShotStats.swingId);
                    if (entry) copySwingEntry(entry);
                  }}
                >
                  <Text style={styles.shotStatsActionText}>📋 Copy Swing JSON</Text>
                </Pressable>
                <Pressable
                  style={styles.shotStatsActionBtn}
                  onPress={(e) => { e.stopPropagation?.(); setShowSwingLog(true); }}
                >
                  <Text style={styles.shotStatsActionText}>📜 Swing Log</Text>
                </Pressable>
              </View>
              <Text style={styles.shotStatsDismiss}>Tap outside to dismiss</Text>
              </ScrollView>
            </Pressable>
          </Pressable>
        ) : null}

        {/* Swing Log browser — opens on demand; lists recent swings
            with tempo tag + per-swing copy button so you can paste any
            swing's full telemetry into a feedback thread. */}
        {showSwingLog ? (
          <Pressable style={styles.swingLogOverlay} onPress={() => setShowSwingLog(false)}>
            <Pressable style={styles.swingLogCard} onPress={(e) => e.stopPropagation?.()}>
              <View style={styles.swingLogHeader}>
                <Text style={styles.swingLogTitle}>📜 Swing Log</Text>
                <Pressable onPress={() => setShowSwingLog(false)}>
                  <Text style={styles.swingLogClose}>✕</Text>
                </Pressable>
              </View>
              {swingLog.length === 0 ? (
                <Text style={styles.swingLogEmpty}>No swings logged yet. Hit a shot to start.</Text>
              ) : (
                <ScrollView style={styles.swingLogScroll}>
                  {swingLog.map((entry) => (
                    <View key={entry.id} style={styles.swingLogRow}>
                      <View style={styles.swingLogRowMain}>
                        <Text style={styles.swingLogRowId}>#{entry.id}</Text>
                        <Text style={styles.swingLogRowTag}>{entry.tempo?.tag || '—'}</Text>
                        <Text style={styles.swingLogRowMult}>{entry.tempo?.mult?.toFixed(2) || '—'}×</Text>
                      </View>
                      <View style={styles.swingLogRowSub}>
                        <Text style={styles.swingLogRowSubText}>
                          {entry.club} · {entry.powerPct}% · {entry.shot?.totalDist ?? '—'}y
                        </Text>
                        <Pressable onPress={() => copySwingEntry(entry)}>
                          <Text style={styles.swingLogRowCopy}>📋 Copy</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
              <View style={styles.swingLogFooter}>
                <Pressable
                  style={styles.swingLogFooterBtn}
                  onPress={async () => {
                    const ok = await copyToClipboard(JSON.stringify(swingLog, null, 2));
                    setSwingLogToast(ok ? `All ${swingLog.length} swings copied` : 'Copy failed');
                    setTimeout(() => setSwingLogToast(''), 1800);
                  }}
                >
                  <Text style={styles.swingLogFooterBtnText}>📋 Copy All</Text>
                </Pressable>
                <Pressable
                  style={[styles.swingLogFooterBtn, styles.swingLogFooterBtnDanger]}
                  onPress={() => {
                    setSwingLog([]);
                    try { if (typeof localStorage !== 'undefined') localStorage.removeItem('atlasGolfSwingLog'); } catch {}
                    nextSwingIdRef.current = 1;
                    setSwingLogToast('Log cleared');
                    setTimeout(() => setSwingLogToast(''), 1500);
                  }}
                >
                  <Text style={styles.swingLogFooterBtnText}>🗑 Clear</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        ) : null}

        {/* Transient toast for copy / clear confirmations */}
        {swingLogToast ? (
          <View pointerEvents="none" style={styles.swingLogToast}>
            <Text style={styles.swingLogToastText}>{swingLogToast}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#223923'
  },
  aimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 300,
    zIndex: 10
  },
  courseShell: {
    flex: 1
  },
  course: {
    backgroundColor: '#486f3d',
    overflow: 'hidden',
    position: 'relative'
  },
  worldLayer: {
    position: 'absolute',
    backgroundColor: '#2a5220',
    backgroundImage: 'repeating-linear-gradient(55deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 9px)'
  },
  courseTintTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '44%',
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  zoomOverlay: {
    position: 'absolute',
    right: 10,
    top: '38%',
    alignItems: 'center',
    gap: 6,
    zIndex: 90
  },
  zoomBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(10,14,20,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  zoomBtnDisabled: {
    opacity: 0.35
  },
  zoomBtnText: {
    color: '#f4f7ef',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24
  },
  zoomBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(10,14,20,0.55)'
  },
  zoomBadgeText: {
    color: '#cfd6dd',
    fontSize: 10,
    fontWeight: '700'
  },
  courseTintBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
    backgroundColor: 'rgba(0,0,0,0.10)'
  },
  tee: {
    position: 'absolute',
    backgroundColor: '#5aad6a',
    backgroundImage: 'repeating-linear-gradient(0deg, transparent 0px, transparent 5px, rgba(255,255,255,0.07) 5px, rgba(255,255,255,0.07) 10px)',
    borderWidth: 2,
    borderColor: '#3a8a4a'
  },
  fairway: {
    position: 'absolute',
    backgroundColor: '#7ab855',
    backgroundImage: 'repeating-linear-gradient(90deg, transparent 0px, transparent 8px, rgba(0,0,0,0.07) 8px, rgba(0,0,0,0.07) 16px)',
    borderWidth: 2,
    borderColor: '#5a9440',
    overflow: 'hidden',
    boxShadow: 'inset 0 0 10px rgba(0,0,0,0.12)'
  },
  fairwaySheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '30%',
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  green: {
    position: 'absolute',
    backgroundColor: '#4ec96a',
    backgroundImage: 'repeating-linear-gradient(135deg, transparent 0px, transparent 5px, rgba(255,255,255,0.06) 5px, rgba(255,255,255,0.06) 10px)',
    borderWidth: 2,
    borderColor: '#3aaa52',
    boxShadow: 'inset 0 0 18px rgba(0,0,0,0.18)'
  },
  fringe: {
    position: 'absolute',
    backgroundColor: '#5fa048',
    backgroundImage: 'repeating-linear-gradient(90deg, transparent 0px, transparent 6px, rgba(0,0,0,0.05) 6px, rgba(0,0,0,0.05) 12px)'
  },
  slopeArrowText: {
    position: 'absolute',
    fontSize: 14,
    color: 'rgba(255, 255, 180, 0.85)',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  puttAimMarker: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#ff4444',
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  puttAimMarkerH: {
    position: 'absolute',
    width: 18,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#ff4444'
  },
  puttAimMarkerV: {
    position: 'absolute',
    width: 3,
    height: 18,
    borderRadius: 1.5,
    backgroundColor: '#ff4444'
  },
  puttPreviewDot: {
    position: 'absolute',
    backgroundColor: '#c7f57a',
    borderWidth: 1,
    borderColor: 'rgba(10, 20, 11, 0.42)'
  },
  puttPreviewFinal: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#f4ffcc',
    backgroundColor: 'rgba(137, 225, 92, 0.7)'
  },
  wall: {
    position: 'absolute',
    backgroundColor: '#5a4732',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#3c2d22'
  },
  bumper: {
    position: 'absolute',
    backgroundColor: '#6e5a46',
    borderWidth: 2,
    borderColor: '#4f3f31'
  },
  tree: {
    position: 'absolute',
    backgroundColor: '#2f6e3e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1f4c28'
  },
  treeCore: {
    width: '45%',
    height: '45%',
    borderRadius: 999,
    backgroundColor: '#214e2b'
  },
  sand: {
    position: 'absolute',
    backgroundColor: '#d4b96a',
    backgroundImage: 'radial-gradient(circle, rgba(180,148,80,0.45) 1px, transparent 1px)',
    backgroundSize: '7px 7px',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#a8843a',
    boxShadow: 'inset 0 3px 10px rgba(120,88,20,0.35)'
  },
  water: {
    position: 'absolute',
    backgroundColor: '#3f88bc',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#26618a'
  },
  aimDot: {
    position: 'absolute',
    backgroundColor: '#ffdd44',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.5)',
    shadowColor: '#ffdd44',
    shadowOpacity: 0.7,
    shadowRadius: 4
  },
  aimPathSegment: {
    position: 'absolute',
    height: 2,
    backgroundColor: 'rgba(255,221,68,0.65)',
    transformOrigin: 'left center'
  },
  aimDotLabel: {
    position: 'absolute',
    width: 28,
    textAlign: 'center',
    color: 'rgba(245,249,236,0.82)',
    fontSize: 9,
    fontWeight: '700'
  },
  cup: {
    position: 'absolute',
    backgroundColor: '#1b2514',
    borderWidth: 2,
    borderColor: '#091006'
  },
  ball: {
    position: 'absolute',
    backgroundColor: '#fbfbf8',
    borderWidth: 1,
    borderColor: '#ccd2c7'
  },
  ballShadow: {
    position: 'absolute',
    backgroundColor: '#142415'
  },
  golferWrap: {
    position: 'absolute'
  },
  golferPixel: {
    position: 'absolute'
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 80,
    paddingHorizontal: 10,
    paddingTop: 4
  },
  topHudRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  versionWrap: {
    alignItems: 'flex-end',
    marginBottom: 6
  },
  versionText: {
    color: 'rgba(228,239,222,0.72)',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(7, 11, 9, 0.54)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden'
  },
  menuWrap: {
    position: 'relative',
    zIndex: 95
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(8, 12, 10, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuIcon: {
    color: '#f6f7f3',
    fontSize: 20,
    fontWeight: '700'
  },
  menuPanel: {
    position: 'absolute',
    top: 48,
    left: 0,
    width: 160,
    borderRadius: 14,
    backgroundColor: 'rgba(7, 11, 9, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 6,
    gap: 4
  },
  menuItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  menuItemDanger: {
    marginTop: 4,
    backgroundColor: 'rgba(188, 74, 74, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(225, 133, 133, 0.45)'
  },
  menuItemText: {
    color: '#f2f9ec',
    fontWeight: '700',
    fontSize: 13
  },
  shotTypeMenu: {
    position: 'absolute',
    top: 96,
    right: 12,
    backgroundColor: 'rgba(7, 11, 9, 0.92)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(111,174,255,0.4)',
    padding: 6,
    gap: 4,
    minWidth: 220,
    zIndex: 50,
  },
  shotTypeOption: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  shotTypeOptionActive: {
    backgroundColor: 'rgba(52, 102, 173, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(111, 174, 255, 0.9)',
  },
  shotTypeOptionLabel: {
    color: '#d4e0d4',
    fontSize: 13,
    fontWeight: '700',
  },
  shotTypeOptionLabelActive: {
    color: '#f5fbef',
  },
  shotTypeOptionSub: {
    color: '#7f968b',
    fontSize: 10,
    marginTop: 2,
  },
  hudStrip: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(7, 11, 9, 0.64)',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 5,
    paddingVertical: 5,
    alignItems: 'stretch'
  },
  hudItem: {
    minWidth: 52,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  hudItemCompact: {
    minWidth: 38,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  hudItemCompactWide: {
    minWidth: 48,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  hudLabelCompact: {
    color: '#9fb59f',
    fontSize: 9,
    fontWeight: '700'
  },
  hudValueCompact: {
    color: '#f5fbef',
    fontSize: 12,
    fontWeight: '800'
  },
  hudItemPuttingCompact: {
    minWidth: 46,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(114, 186, 84, 0.24)',
    borderWidth: 1,
    borderColor: 'rgba(178, 230, 137, 0.62)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  hudLieBadge: {
    width: 34,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  hudLieBadgeWide: {
    minWidth: 68,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  hudLieSwatch: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 6,
    height: 22,
    borderRadius: 3,
    opacity: 0.95
  },
  hudLieEmoji: {
    fontSize: 14,
    marginLeft: 2
  },
  hudLieMini: {
    color: '#f5fbef',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1
  },
  hudWindCompact: {
    minWidth: 52,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(80, 140, 220, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(111, 174, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  hudWindSpeed: {
    color: '#f5fbef',
    fontSize: 12,
    fontWeight: '800'
  },
  hudWindDirMini: {
    color: '#9fc8ff',
    fontSize: 8,
    fontWeight: '700'
  },
  hudItemWind: {
    minWidth: 42,
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(80, 140, 220, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(111, 174, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  hudItemPutting: {
    minWidth: 68,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(114, 186, 84, 0.24)',
    borderWidth: 1,
    borderColor: 'rgba(178, 230, 137, 0.62)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  hudPuttingText: {
    color: '#dfffca',
    fontSize: 11,
    fontWeight: '800'
  },
  windArrow: {
    color: '#78b7ff',
    fontSize: 18,
    fontWeight: '800'
  },
  windDirText: {
    color: '#9fc8ff',
    fontSize: 9,
    fontWeight: '700'
  },
  hudItemPressable: {
    borderWidth: 1,
    borderColor: 'rgba(111, 174, 255, 0.28)'
  },
  hudItemActive: {
    backgroundColor: 'rgba(52, 102, 173, 0.28)',
    borderColor: 'rgba(111, 174, 255, 0.9)'
  },
  hudLabel: {
    color: '#9fb59f',
    fontSize: 10,
    fontWeight: '600'
  },
  hudValue: {
    color: '#f5fbef',
    fontSize: 13,
    fontWeight: '700'
  },
  powerRailWrap: {
    position: 'absolute',
    right: 10,
    top: '27%',
    zIndex: 85,
    width: 58,
    alignItems: 'center',
    gap: 4
  },
  powerRailPct: {
    color: '#f5f9f0',
    fontSize: 13,
    fontWeight: '800',
    backgroundColor: 'rgba(6, 10, 8, 0.74)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  powerRailTrack: {
    width: 24,
    height: 204,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(8,12,10,0.78)',
    overflow: 'hidden',
    position: 'relative'
  },
  powerRailSafe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(106,165,113,0.58)'
  },
  powerRailFill: {
    position: 'absolute',
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: 10,
    backgroundColor: '#8fd37a'
  },
  powerRailCut: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: `${(100 / 125) * 100}%`,
    height: 2,
    backgroundColor: '#e06f58'
  },
  powerRailMeta: {
    color: '#d2dfcc',
    fontSize: 11,
    fontWeight: '700'
  },
  bottomOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    zIndex: 90,
    gap: 8
  },
  puttChipToggle: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 6
  },
  puttChipToggleText: {
    color: '#f5fbef',
    fontSize: 12,
    fontWeight: '700'
  },
  puttToggleBtn: {
    backgroundColor: 'rgba(74,158,63,0.3)',
    borderWidth: 1,
    borderColor: '#4a9e3f',
    borderRadius: 8,
    paddingVertical: 8,
    marginHorizontal: 6,
    marginBottom: 4,
    alignItems: 'center'
  },
  puttToggleBtnText: {
    color: '#88F8BB',
    fontSize: 13,
    fontWeight: '800'
  },
  // Golfer select styles
  golferRosterHint: {
    color: 'rgba(245,251,239,0.55)',
    fontSize: 11,
    marginBottom: 10,
    letterSpacing: 0.5
  },
  golferRosterScroll: {
    marginBottom: 16
  },
  golferRosterContent: {
    gap: 8,
    paddingRight: 4
  },
  golferRosterCard: {
    width: 118,
    minHeight: 104,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: 8,
    justifyContent: 'space-between'
  },
  golferRosterCardSelected: {
    backgroundColor: 'rgba(74,158,63,0.24)',
    borderColor: '#88F8BB'
  },
  golferRosterAvatar: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2
  },
  golferRosterAvatarBlock: {
    width: 22,
    height: 10,
    borderRadius: 3
  },
  golferRosterName: {
    color: 'rgba(245,251,239,0.84)',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 6
  },
  golferRosterNameSelected: {
    color: '#f5fbef'
  },
  golferRosterSpecies: {
    color: 'rgba(136,248,187,0.72)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2
  },
  golferCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16
  },
  golferAvatarWrap: {
    width: 48,
    height: 64,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2
  },
  golferAvatarBlock: {
    width: 24,
    height: 14,
    borderRadius: 3
  },
  golferInfo: {
    flex: 1
  },
  golferName: {
    color: '#f5fbef',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1
  },
  golferSpecies: {
    color: '#88F8BB',
    fontSize: 11,
    marginBottom: 4
  },
  golferBio: {
    color: 'rgba(245,251,239,0.6)',
    fontSize: 12,
    lineHeight: 16
  },
  golferStatsSection: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  golferStatsSectionTitle: {
    color: '#88F8BB',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
    textAlign: 'center'
  },
  golferStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  golferStatName: {
    color: 'rgba(245,251,239,0.7)',
    fontSize: 11,
    width: 65
  },
  golferStatBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    marginHorizontal: 6,
    overflow: 'hidden'
  },
  golferStatBarFill: {
    height: '100%',
    borderRadius: 4
  },
  golferStatValue: {
    color: '#f5fbef',
    fontSize: 11,
    fontWeight: '700',
    width: 24,
    textAlign: 'right'
  },
  golferNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12
  },
  golferBackBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20
  },
  golferBackBtnText: {
    color: 'rgba(245,251,239,0.6)',
    fontSize: 14,
    fontWeight: '700'
  },
  golferSelectBtn: {
    backgroundColor: '#4a9e3f',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24
  },
  golferSelectBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900'
  },
  // Club select styles
  clubSelectCount: {
    color: '#f5fbef',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10
  },
  clubCategoryTabs: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 4
  },
  clubCategoryTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center'
  },
  clubCategoryTabActive: {
    backgroundColor: 'rgba(74,158,63,0.3)',
    borderWidth: 1,
    borderColor: '#4a9e3f'
  },
  clubCategoryTabText: {
    color: 'rgba(245,251,239,0.5)',
    fontSize: 11,
    fontWeight: '700'
  },
  clubCategoryTabTextActive: {
    color: '#88F8BB'
  },
  clubListScroll: {
    flex: 1,
    marginBottom: 8
  },
  clubItemCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    position: 'relative'
  },
  clubItemCardSelected: {
    borderColor: '#4a9e3f',
    backgroundColor: 'rgba(74,158,63,0.1)'
  },
  clubItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  clubItemName: {
    color: '#f5fbef',
    fontSize: 13,
    fontWeight: '800',
    flex: 1
  },
  clubItemBrand: {
    color: 'rgba(245,251,239,0.4)',
    fontSize: 10,
    marginRight: 8
  },
  clubItemCarry: {
    color: '#88F8BB',
    fontSize: 12,
    fontWeight: '700'
  },
  clubItemStats: {
    marginTop: 4
  },
  clubStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  clubStatName: {
    color: 'rgba(245,251,239,0.6)',
    fontSize: 11,
    width: 42
  },
  clubStatBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    marginHorizontal: 6,
    overflow: 'hidden'
  },
  clubStatBarFill: {
    height: '100%',
    borderRadius: 4
  },
  clubStatValue: {
    color: '#f5fbef',
    fontSize: 11,
    fontWeight: '700',
    width: 24,
    textAlign: 'right'
  },
  clubItemCheck: {
    position: 'absolute',
    right: 8,
    top: 8,
    fontSize: 14
  },
  clubItemAdd: {
    position: 'absolute',
    right: 10,
    top: 6,
    color: 'rgba(245,251,239,0.3)',
    fontSize: 18,
    fontWeight: '700'
  },
  puttCompactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(8,12,10,0.85)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginHorizontal: 6,
    marginBottom: 4
  },
  puttCompactInfo: {
    flex: 1
  },
  puttCompactTarget: {
    color: '#f5fbef',
    fontSize: 14,
    fontWeight: '700'
  },
  puttCompactSub: {
    color: '#b8e0a8',
    fontSize: 11
  },
  puttCompactSimBtn: {
    backgroundColor: '#4a9e3f',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 8
  },
  puttCompactSimText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800'
  },
  simulatePuttButton: {
    alignSelf: 'stretch',
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(102, 186, 90, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(199, 242, 161, 0.9)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  simulatePuttButtonText: {
    color: '#0f1e0f',
    fontSize: 14,
    fontWeight: '800'
  },
  puttTargetBanner: {
    borderRadius: 12,
    backgroundColor: 'rgba(8, 12, 10, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(194, 232, 149, 0.55)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 3
  },
  puttTargetBannerTitle: {
    color: '#f5ffde',
    fontSize: 16,
    fontWeight: '800'
  },
  puttTargetBannerSub: {
    color: '#d3e9c6',
    fontSize: 12,
    fontWeight: '600'
  },
  bottomMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10
  },
  clubCard: {
    flex: 1,
    minHeight: 124,
    borderRadius: 16,
    backgroundColor: 'rgba(8, 12, 10, 0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.17)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'space-between'
  },
  clubCardActive: {
    borderColor: 'rgba(111, 174, 255, 0.92)',
    backgroundColor: 'rgba(14, 27, 47, 0.78)'
  },
  clubCardTitle: {
    color: '#eff8e6',
    fontSize: 15,
    fontWeight: '700'
  },
  clubCardSub: {
    color: '#aec3a9',
    fontSize: 12
  },
  clubCardYards: {
    color: '#f5fbef',
    fontSize: 26,
    fontWeight: '800'
  },
  clubCardMeta: {
    color: '#a9bda5',
    fontSize: 11
  },
  swingDock: {
    width: SHOT_PAD_SIZE + 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  swingPad: {
    width: SHOT_PAD_SIZE,
    height: SHOT_PAD_SIZE,
    borderRadius: SHOT_PAD_SIZE / 2,
    backgroundColor: 'rgba(7, 11, 9, 0.84)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  swingPadActive: {
    borderColor: '#93d27c',
    shadowColor: '#94d87d',
    shadowOpacity: 0.48,
    shadowRadius: 12
  },
  powerRing: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#4adb6a'
  },
  swingHaloOuter: {
    position: 'absolute',
    width: 102,
    height: 102,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)'
  },
  swingHaloInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: 'rgba(248,251,242,0.8)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  swingPct: {
    color: '#f6fbef',
    fontSize: 18,
    fontWeight: '800'
  },
  shotPadGuideWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center'
  },
  shotPadCrosshairH: {
    position: 'absolute',
    width: SHOT_PAD_SIZE - 46,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  shotPadCrosshairV: {
    position: 'absolute',
    width: 1,
    height: SHOT_PAD_SIZE - 46,
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  spinDot: {
    position: 'absolute',
    width: SPIN_DOT_RADIUS * 2,
    height: SPIN_DOT_RADIUS * 2,
    borderRadius: SPIN_DOT_RADIUS,
    backgroundColor: '#4b94ff',
    borderWidth: 2,
    borderColor: '#d8ecff',
    shadowColor: '#4b94ff',
    shadowOpacity: 0.55,
    shadowRadius: 10
  },
  spinDotActive: {
    transform: [{ scale: 1.08 }],
    shadowOpacity: 0.78,
    shadowRadius: 14
  },
  swingGuideWrap: {
    position: 'absolute',
    bottom: -28,
    width: SHOT_PAD_SIZE + 40,
    alignItems: 'center'
  },
  swingGuideText: {
    color: '#d0dfcb',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center'
  },
  shotDoneButton: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 10
  },
  shotDoneText: {
    color: '#f6fbef',
    fontSize: 13,
    fontWeight: '700'
  },
  spinDotClosed: {
    position: 'absolute',
    width: SPIN_DOT_RADIUS * 2,
    height: SPIN_DOT_RADIUS * 2,
    borderRadius: SPIN_DOT_RADIUS,
    backgroundColor: '#4b94ff',
    borderWidth: 2,
    borderColor: '#d8ecff'
  },
  clubSelectorWrap: {
    borderRadius: 14,
    backgroundColor: 'rgba(7, 11, 9, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 8,
    gap: 8
  },
  clubPickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8
  },
  clubPickerTriggerLabel: {
    color: '#9fb59f',
    fontSize: 11,
    fontWeight: '700'
  },
  clubPickerTriggerValue: {
    flex: 1,
    color: '#f5fbef',
    fontSize: 13,
    fontWeight: '700'
  },
  clubPickerTriggerChevron: {
    color: '#d6e7d0',
    fontSize: 11,
    fontWeight: '700'
  },
  clubScrollContent: {
    paddingHorizontal: 8,
    gap: 7
  },
  clubChip: {
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center'
  },
  clubChipActive: {
    backgroundColor: '#2c6842',
    borderColor: '#95d28a'
  },
  clubChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#d6e7d0'
  },
  clubChipTextActive: {
    color: '#f6fbf4'
  },
  helperText: {
    fontSize: 12,
    color: '#d0dfcb',
    textAlign: 'center'
  },
  lastShotText: {
    fontSize: 12,
    color: '#aeca9f',
    textAlign: 'center'
  },
  warning: {
    fontSize: 12,
    color: '#e1917f',
    textAlign: 'center',
    fontWeight: '700'
  },
  success: {
    fontSize: 12,
    color: '#9ed98f',
    textAlign: 'center',
    fontWeight: '700'
  },
  sunkRow: {
    alignItems: 'center',
    gap: 6
  },
  nextHoleBtn: {
    backgroundColor: '#4a9e3f',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8
  },
  chooseCourseBtn: {
    backgroundColor: '#327a96',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8
  },
  nextHoleBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700'
  },
  spaceMenuScreen: {
    flex: 1,
    backgroundColor: '#05070A',
    position: 'relative',
    overflow: 'hidden'
  },
  menuStarsLayer: {
    ...StyleSheet.absoluteFillObject
  },
  menuStar: {
    position: 'absolute',
    borderRadius: 999
  },
  menuGreenGlow: {
    position: 'absolute',
    left: -100,
    right: -100,
    bottom: -200,
    height: 500,
    borderRadius: 500,
    backgroundColor: '#13251D',
    backgroundImage: 'radial-gradient(circle at 50% 100%, #1B3D2F 0%, #13251D 45%, rgba(5,7,10,0) 78%)',
    opacity: 0.92
  },
  menuContentWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 20
  },
  menuDataBar: {
    color: '#A0A0A0',
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' })
  },
  menuTitleBlock: {
    alignItems: 'center',
    gap: 12,
    marginTop: 20
  },
  menuTitleTop: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 12,
    textTransform: 'uppercase',
    textAlign: 'center'
  },
  menuTitleBottomRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 14
  },
  menuTitleBottomMain: {
    color: '#FFFFFF',
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: 6,
    textTransform: 'uppercase'
  },
  menuTitleTour: {
    color: '#88F8BB',
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: 6,
    textTransform: 'uppercase'
  },
  heroWrap: {
    width: 150,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 10
  },
  heroRing: {
    position: 'absolute',
    width: 120,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(136,248,187,0.5)',
    backgroundColor: 'rgba(136,248,187,0.08)',
    transform: [{ rotate: '-12deg' }]
  },
  heroBall: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#d8dde5'
  },
  heroDimple: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ced4dc'
  },
  heroFlagPole: {
    position: 'absolute',
    top: 12,
    left: 74,
    width: 2,
    height: 18,
    backgroundColor: '#88F8BB'
  },
  heroFlag: {
    position: 'absolute',
    top: 10,
    left: 76,
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 0,
    borderRightWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#88F8BB'
  },
  menuButtonStack: {
    width: '100%',
    alignItems: 'center',
    gap: 12
  },
  menuButtonWrap: {
    width: '100%',
    alignItems: 'center'
  },
  spaceMenuBtn: {
    width: '90%',
    maxWidth: 340,
    height: 56,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18
  },
  spaceMenuBtnDisabled: {
    opacity: 0.5,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  spaceMenuBtnActive: {
    width: '90%',
    maxWidth: 340,
    height: 56,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: '#88F8BB',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    position: 'relative'
  },
  spaceMenuBtnLeft: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4
  },
  spaceMenuBtnLeftMuted: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4
  },
  spaceMenuBtnRight: {
    color: '#88F8BB',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1
  },
  spaceMenuBtnRightMuted: {
    color: 'rgba(136,248,187,0.3)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1
  },
  lCorner: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderColor: '#88F8BB'
  },
  lCornerTopLeft: {
    top: -1,
    left: -1,
    borderTopWidth: 2,
    borderLeftWidth: 2
  },
  lCornerTopRight: {
    top: -1,
    right: -1,
    borderTopWidth: 2,
    borderRightWidth: 2
  },
  lCornerBottomLeft: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 2,
    borderLeftWidth: 2
  },
  lCornerBottomRight: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 2,
    borderRightWidth: 2
  },
  menuSoonBadge: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  menuBottomBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8
  },
  menuBottomLeft: {
    color: '#A0A0A0',
    fontSize: 10,
    letterSpacing: 1
  },
  menuBottomDot: {
    color: '#88F8BB'
  },
  menuBottomRight: {
    color: '#A0A0A0',
    fontSize: 10,
    letterSpacing: 1
  },
  coursesContentWrap: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 20
  },
  coursesTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 8,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 14
  },
  courseMenuList: {
    flex: 1
  },
  coursesListContent: {
    gap: 12,
    paddingBottom: 16
  },
  spaceCourseCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 14,
    gap: 6
  },
  spaceCourseCardActive: {
    borderColor: '#88F8BB'
  },
  spaceCourseCardPressed: {
    opacity: 0.85
  },
  spaceCourseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  spaceCourseTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1
  },
  spaceCourseDifficulty: {
    color: '#88F8BB',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1
  },
  spaceCourseDesigner: {
    color: '#A0A0A0',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1
  },
  spaceCourseDescription: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500'
  },
  coursesPlayButton: {
    marginTop: 12,
    height: 52,
    borderRadius: 6,
    backgroundColor: '#88F8BB',
    alignItems: 'center',
    justifyContent: 'center'
  },
  coursesPlayButtonText: {
    color: '#05070A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 4
  },
  coursesBackButton: {
    marginTop: 10,
    height: 44,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  coursesBackButtonText: {
    color: '#A0A0A0',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3
  },
  coursesEditorButton: {
    marginTop: 10,
    height: 44,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  coursesEditorButtonText: {
    color: '#f5fbef',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3
  },
  editorTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  editorTabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center'
  },
  editorTabBtnActive: {
    backgroundColor: 'rgba(74,158,63,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(136,248,187,0.45)'
  },
  editorTabText: {
    color: '#f5fbef',
    fontWeight: '700'
  },
  editorScroll: {
    flex: 1,
    marginBottom: 12
  },
  editorPanel: {
    backgroundColor: 'rgba(7,11,9,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 12,
    gap: 8
  },
  editorSectionTitle: {
    color: '#88F8BB',
    fontSize: 16,
    fontWeight: '800'
  },
  editorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  editorAddBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(74,158,63,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(136,248,187,0.45)'
  },
  editorAddBtnText: {
    color: '#dfffd2',
    fontSize: 12,
    fontWeight: '800'
  },
  editorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4
  },
  editorLabel: {
    flex: 1,
    color: '#dbe7d7',
    fontSize: 13,
    textTransform: 'capitalize'
  },
  editorStepper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  editorStepperText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700'
  },
  editorValue: {
    width: 50,
    textAlign: 'center',
    color: '#88F8BB',
    fontWeight: '800'
  },
  editorValueWide: {
    color: '#88F8BB',
    fontWeight: '700',
    fontSize: 12
  },
  editorColorChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  editorColorText: {
    color: '#f5fbef',
    fontSize: 11
  },
  editorClubCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10
  },
  golferAvatarWrapLarge: {
    width: 96,
    height: 132,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative'
  },
  golferAvatarHat: {
    width: 52,
    height: 16,
    borderRadius: 8,
    marginTop: 4
  },
  golferAvatarHead: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginTop: 4
  },
  golferAvatarTorso: {
    width: 52,
    height: 40,
    borderRadius: 10,
    marginTop: 4
  },
  golferAvatarLegs: {
    width: 42,
    height: 32,
    borderRadius: 8,
    marginTop: 4
  },
  editorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  editorClubPickerRow: {
    flexDirection: 'row',
    gap: 8
  },
  editorClubPickerPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  editorClubPickerPillActive: {
    backgroundColor: 'rgba(74,158,63,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(136,248,187,0.45)'
  },
  editorClubPickerText: {
    color: '#f5fbef',
    fontWeight: '700'
  },
  clubItemMeta: {
    color: '#a9b8ab',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 6
  },
  scorecardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 260,
    paddingHorizontal: 12
  },
  scorecardCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    backgroundColor: '#14351f',
    borderWidth: 1,
    borderColor: 'rgba(190, 231, 188, 0.28)',
    padding: 14,
    gap: 8
  },
  scorecardTitle: {
    color: '#f4fcef',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4
  },
  scorecardHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.18)',
    paddingBottom: 6
  },
  scorecardHeaderCell: {
    color: '#c8dfc4',
    fontSize: 12,
    fontWeight: '800'
  },
  scorecardScrollH: {
    maxHeight: 160
  },
  scorecardTable: {
    flexDirection: 'column',
    gap: 3
  },
  scorecardTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1
  },
  scorecardLabelCell: {
    width: 44,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 2
  },
  scorecardLabelText: {
    color: '#c8dfc4',
    fontSize: 11,
    fontWeight: '800'
  },
  scorecardDataCell: {
    width: 34,
    height: 32,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  scorecardDataCellActive: {
    backgroundColor: 'rgba(88, 154, 96, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(152, 214, 159, 0.8)'
  },
  scorecardDataText: {
    color: '#f2f9ed',
    fontSize: 12,
    fontWeight: '700'
  },
  scorecardTotalCell: {
    width: 38,
    height: 32,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  scorecardTotalCellText: {
    color: '#f4fcef',
    fontSize: 12,
    fontWeight: '800'
  },
  scorecardUnplayed: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 12
  },
  scoreBadgeText: {
    color: '#f2f9ed',
    fontSize: 12,
    fontWeight: '800'
  },
  scoreBadgeSingleCircle: {
    minWidth: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7
  },
  scoreBadgeDoubleOuter: {
    minWidth: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  scoreBadgeDoubleInner: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  scoreBadgeSingleSquare: {
    minWidth: 26,
    height: 26,
    borderWidth: 2,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7
  },
  scoreBadgeDoubleSquareOuter: {
    minWidth: 30,
    height: 30,
    borderWidth: 2,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  scoreBadgeDoubleSquareInner: {
    minWidth: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  scoreBadgeSolidSquare: {
    minWidth: 26,
    height: 26,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7
  },
  scoreBadgeSolidText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800'
  },
  scorecardTotals: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    paddingTop: 8,
    gap: 5
  },
  scorecardTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  scorecardTotalLabel: {
    color: '#d4e9d2',
    fontSize: 12,
    fontWeight: '700'
  },
  scorecardTotalValue: {
    color: '#f4fcef',
    fontSize: 14,
    fontWeight: '800'
  },
  scoreDiffUnder: {
    color: '#22c55e'
  },
  scoreDiffOver: {
    color: '#ef4444'
  },
  scoreDiffEven: {
    color: '#ffffff'
  },
  overSwingText: {
    color: '#e07f6d'
  },
  disabled: {
    opacity: 0.45
  },
  summary: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(232, 243, 225, 0.92)'
  },
  summaryTitle: {
    fontWeight: '800',
    color: '#1d321f'
  },
  summaryText: {
    color: '#2f4730'
  },
  liePip: {
    position: 'absolute',
    top: 130,
    left: 10,
    backgroundColor: 'rgba(20, 35, 20, 0.88)',
    borderRadius: 12,
    padding: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 100
  },
  lieColorBar: {
    width: 4,
    height: 28,
    borderRadius: 2
  },
  lieEmoji: {
    fontSize: 18
  },
  lieLabel: {
    color: '#d4e8ce',
    fontSize: 12,
    fontWeight: '700'
  },
  liePenalty: {
    color: '#ff9944',
    fontSize: 10,
    fontWeight: '600'
  },
  shotStatsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200
  },
  shotStatsCard: {
    backgroundColor: 'rgba(20, 38, 22, 0.96)',
    borderRadius: 16,
    width: 280,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: 'rgba(100, 180, 100, 0.3)',
    overflow: 'hidden'
  },
  shotStatsScroll: {
    maxHeight: '100%'
  },
  shotStatsScrollContent: {
    padding: 20
  },
  shotStatsTitle: {
    color: '#e8f3e0',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center'
  },
  swingPathBox: {
    marginBottom: 12,
    alignItems: 'center'
  },
  swingPathLabel: {
    color: '#8aab82',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4
  },
  swingPathCanvas: {
    width: 120,
    height: 150,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden'
  },
  swingPathCenterLine: {
    position: 'absolute',
    left: 59,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 1
  },
  swingPathDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4
  },
  swingPathLegend: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4
  },
  swingPathLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  swingPathLegendDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  swingPathLegendText: {
    color: '#8aab82',
    fontSize: 9,
    fontWeight: '600'
  },
  shotStatsGrid: {
    gap: 6
  },
  shotStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)'
  },
  shotStatLabel: {
    color: '#8aab82',
    fontSize: 13,
    fontWeight: '600'
  },
  shotStatValue: {
    color: '#e0f0d8',
    fontSize: 13,
    fontWeight: '700'
  },
  shotStatTotal: {
    color: '#ffdd44',
    fontWeight: '800'
  },
  shotStatsDismiss: {
    color: 'rgba(200,220,200,0.5)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12
  },
  shotStatsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  shotStatsSwingId: {
    color: '#9bd8ff',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  shotStatsActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 8,
  },
  shotStatsActionBtn: {
    flex: 1,
    backgroundColor: 'rgba(80,140,90,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(150,220,170,0.4)',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  shotStatsActionText: {
    color: '#d8f4dd',
    fontSize: 12,
    fontWeight: '700',
  },
  swingLogOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 120,
  },
  swingLogCard: {
    backgroundColor: '#0f1f14',
    borderWidth: 1,
    borderColor: 'rgba(120,200,140,0.4)',
    borderRadius: 10,
    padding: 14,
    width: '88%',
    maxWidth: 420,
    maxHeight: '80%',
  },
  swingLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  swingLogTitle: {
    color: '#d8f4dd',
    fontSize: 15,
    fontWeight: '800',
  },
  swingLogClose: {
    color: '#9bd8ff',
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: 6,
  },
  swingLogEmpty: {
    color: 'rgba(200,220,200,0.6)',
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 12,
  },
  swingLogScroll: {
    maxHeight: 360,
  },
  swingLogRow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(120,200,140,0.12)',
    paddingVertical: 8,
  },
  swingLogRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  swingLogRowId: {
    color: '#9bd8ff',
    fontFamily: 'monospace',
    fontWeight: '800',
    fontSize: 13,
    minWidth: 52,
  },
  swingLogRowTag: {
    flex: 1,
    color: '#d8f4dd',
    fontSize: 12,
    fontWeight: '700',
  },
  swingLogRowMult: {
    color: '#f0c040',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  swingLogRowSub: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    paddingLeft: 52,
  },
  swingLogRowSubText: {
    color: 'rgba(200,220,200,0.65)',
    fontSize: 11,
  },
  swingLogRowCopy: {
    color: '#9bd8ff',
    fontSize: 11,
    fontWeight: '700',
  },
  swingLogFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  swingLogFooterBtn: {
    flex: 1,
    backgroundColor: 'rgba(80,140,90,0.35)',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  swingLogFooterBtnDanger: {
    backgroundColor: 'rgba(180,60,60,0.35)',
  },
  swingLogFooterBtnText: {
    color: '#d8f4dd',
    fontSize: 12,
    fontWeight: '700',
  },
  swingLogToast: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 130,
  },
  swingLogToastText: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    color: '#d8f4dd',
    borderWidth: 1,
    borderColor: 'rgba(120,200,140,0.5)',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  devPanel: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(155,216,255,0.25)',
    gap: 6,
  },
  devPanelTitle: {
    color: '#9bd8ff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  devMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 1,
  },
  devMetricLabel: {
    color: 'rgba(200,220,200,0.75)',
    fontSize: 11,
    fontFamily: 'monospace',
    minWidth: 110,
  },
  devMetricValue: {
    color: '#d8f4dd',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    minWidth: 84,
  },
  devMetricThresh: {
    color: 'rgba(155,216,255,0.6)',
    fontSize: 10,
    fontFamily: 'monospace',
    flex: 1,
  },
  devGraphBox: {
    marginTop: 10,
  },
  devGraphLabel: {
    color: 'rgba(200,220,200,0.75)',
    fontSize: 10,
    marginBottom: 4,
  },
  devGraphCanvas: {
    height: 50,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  devGraphBaseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  devGraphIdealDot: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,221,68,0.35)',
  },
  devGraphAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  devGraphAxisText: {
    color: 'rgba(200,220,200,0.5)',
    fontSize: 9,
    fontFamily: 'monospace',
  },
  devCoachBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: 'rgba(74,170,235,0.10)',
    borderLeftWidth: 2,
    borderLeftColor: '#9bd8ff',
    borderRadius: 4,
  },
  devCoachTitle: {
    color: '#9bd8ff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  devCoachText: {
    color: '#d8f4dd',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  devCompareBox: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 12,
  },
  devCompareCol: {
    flex: 1,
  },
  devCompareLabel: {
    color: 'rgba(200,220,200,0.75)',
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 4,
  },
  devCompareCanvas: {
    height: 100,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 4,
    position: 'relative',
  },
});
