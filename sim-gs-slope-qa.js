#!/usr/bin/env node
// QA for GS v0.44 per-region slopes. Mirrors the surfacePropsAt
// merge: a fairway (or any) surface carrying { slope: { angle, mag } }
// overrides the per-type default. Locks in that rolling physics will
// see the region-specific grade, not just the per-type slope.

// Minimal fixtures.
const T_GREEN = 1, T_FAIRWAY = 2, T_ROUGH = 3;
const SURFACE_PROPS = {
  [T_GREEN]:   { label: 'Green',   slopeAng: 0.5, slopeMag: 2, rollDecel: 0.85 },
  [T_FAIRWAY]: { label: 'Fairway', rollDecel: 0.78 },
  [T_ROUGH]:   { label: 'Rough',   rollDecel: 2.9 },
};

function pointInRect(pt, r) {
  return pt[0] >= r.x && pt[0] <= r.x + r.w && pt[1] >= r.y && pt[1] <= r.y + r.h;
}

// Lookup mirroring the production path.
function surfacePropsAt(surfaces, wx, wy) {
  let type = T_ROUGH;
  let regionSlope = null;
  for (let i = surfaces.length - 1; i >= 0; i--) {
    if (pointInRect([wx, wy], surfaces[i].shape)) {
      type = surfaces[i].type;
      regionSlope = surfaces[i].slope || null;
      break;
    }
  }
  const base = SURFACE_PROPS[type] || SURFACE_PROPS[T_ROUGH];
  if (regionSlope) return { ...base, slopeAng: regionSlope.angle, slopeMag: regionSlope.mag };
  return base;
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('Per-region slope plumbing QA\n');

// Fairway without a slope → base props, no slopeMag.
{
  const surfaces = [{ type: T_FAIRWAY, shape: { x: 0, y: 0, w: 10, h: 10 } }];
  const p = surfacePropsAt(surfaces, 5, 5);
  assert(p.label === 'Fairway', 'plain fairway → Fairway label', p.label);
  assert(!p.slopeMag, '  no slope inherited', p.slopeMag);
}

// Fairway WITH slope → slopeAng / slopeMag reflect the region.
{
  const surfaces = [{
    type: T_FAIRWAY,
    shape: { x: 0, y: 0, w: 10, h: 10 },
    slope: { angle: 1.23, mag: 4 },
  }];
  const p = surfacePropsAt(surfaces, 5, 5);
  assert(p.slopeMag === 4, 'sloped fairway mag propagates', p.slopeMag);
  assert(Math.abs(p.slopeAng - 1.23) < 1e-9, 'sloped fairway angle propagates', p.slopeAng);
}

// Green with its own per-region slope OVERRIDES the per-type default
// (per-type Green slope is { 0.5, 2 }).
{
  const surfaces = [{
    type: T_GREEN,
    shape: { x: 0, y: 0, w: 10, h: 10 },
    slope: { angle: 2.34, mag: 6 },
  }];
  const p = surfacePropsAt(surfaces, 5, 5);
  assert(p.slopeMag === 6, 'per-region green slope overrides per-type', p.slopeMag);
  assert(Math.abs(p.slopeAng - 2.34) < 1e-9, '  angle overridden', p.slopeAng);
}

// Green WITHOUT region slope falls back to per-type Green default.
{
  const surfaces = [{ type: T_GREEN, shape: { x: 0, y: 0, w: 10, h: 10 } }];
  const p = surfacePropsAt(surfaces, 5, 5);
  assert(p.slopeMag === 2, 'unsloped green inherits per-type slope', p.slopeMag);
  assert(Math.abs(p.slopeAng - 0.5) < 1e-9, '  angle from per-type', p.slopeAng);
}

// Topmost surface wins when shapes overlap — if a sloped fairway sits
// on top of a plain rough, the ball feels the fairway slope.
{
  const surfaces = [
    { type: T_ROUGH,   shape: { x: 0, y: 0, w: 10, h: 10 } },
    { type: T_FAIRWAY, shape: { x: 2, y: 2, w: 4, h: 4 }, slope: { angle: 0.9, mag: 5 } },
  ];
  const inFairway = surfacePropsAt(surfaces, 4, 4);
  const inRough = surfacePropsAt(surfaces, 8, 8);
  assert(inFairway.label === 'Fairway' && inFairway.slopeMag === 5, 'overlap: inside fairway uses its slope', `${inFairway.label} mag=${inFairway.slopeMag}`);
  assert(inRough.label === 'Rough' && !inRough.slopeMag, 'overlap: outside fairway falls back to rough', `${inRough.label} mag=${inRough.slopeMag}`);
}
