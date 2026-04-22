#!/usr/bin/env node
// Headless render of the H1 fairway chevron pattern. Reproduces the
// v0.62/0.63 math + the "topmost surface" check from rebuildStatic
// so we can actually see what ends up on the static canvas. Prints
// an ASCII heatmap of the fairway plus a dark/light pixel count.

const TILE = 16;

const H1 = {
  width: 20,
  height: 30,
  surfaces: [
    // Order matches HOLES[0].surfaces — FAIRWAY, SAND, SAND, SHORE,
    // WATER, FRINGE, GREEN, TEE.
    { type: 'FAIRWAY', kind: 'polygon', points: [
      [7.2,8.8],[10,8.6],[12.8,8.8],[13.4,9.4],[13.9,10.4],
      [14.2,11.8],[14.3,13.5],[14.1,15.5],[13.9,17.5],
      [13.7,19.3],[13.4,20.8],[13,21.9],[12.6,22.8],
      [12.2,23.6],[11.8,24.4],[11.4,25.1],[11.1,25.7],
      [9,25.7],[8.9,25.1],[8.5,24.4],[8.1,23.6],
      [7.7,22.8],[7.3,21.9],[7,20.8],[6.7,19.3],
      [6.4,17.5],[6.2,15.5],[6,13.5],[6.1,11.8],
      [6.3,10.4],[6.8,9.4],
    ], slope: { angle: Math.PI * 0.35, mag: 3 } },
    { type: 'SAND', kind: 'polygon', points: [
      [12.9,10.8],[13.8,10.7],[14.6,11],[14.9,11.8],
      [14.8,12.8],[14.4,13.6],[13.6,13.8],[12.9,13.5],
      [12.5,12.6],[12.6,11.5],
    ]},
    { type: 'SAND', kind: 'circle', cx: 13.9, cy: 7.4, r: 1.1 },
    { type: 'SHORE', kind: 'polygon', points: [
      [1.05,12.7],[3,12.45],[4.85,12.75],[5.75,13.55],[6.15,15.05],
      [6.2,17.05],[5.85,18.6],[4.95,19.3],[3.55,19.65],[1.9,19.55],
      [0.55,18.75],[0.25,17.0],[0.35,15.1],[0.7,13.7],
    ]},
    { type: 'WATER', kind: 'polygon', points: [
      [1.5,13.2],[3,13],[4.8,13.3],[5.6,14],[5.9,15.3],
      [5.9,17],[5.6,18.4],[4.8,19],[3.5,19.3],[2,19.2],
      [1,18.4],[0.7,17],[0.8,15.3],[1.1,14],
    ]},
    { type: 'FRINGE', kind: 'annulus', cx: 9.5, cy: 5.5, inner: 3.2, outer: 4.05 },
    { type: 'GREEN', kind: 'circle', cx: 9.5, cy: 5.5, r: 3.2 },
    { type: 'TEE', kind: 'rect', x: 8.7, y: 24.2, w: 1.6, h: 1.1 },
  ],
};

// Convert each shape's units from tiles → world px.
for (const s of H1.surfaces) {
  if (s.kind === 'polygon') s.points = s.points.map(([px, py]) => [px * TILE, py * TILE]);
  else if (s.kind === 'circle') { s.cx *= TILE; s.cy *= TILE; s.r *= TILE; }
  else if (s.kind === 'annulus') { s.cx *= TILE; s.cy *= TILE; s.inner *= TILE; s.outer *= TILE; }
  else if (s.kind === 'rect') { s.x *= TILE; s.y *= TILE; s.w *= TILE; s.h *= TILE; }
}

function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    const intersect = (yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function inShape(x, y, s) {
  if (s.kind === 'polygon') return pointInPolygon(x, y, s.points);
  if (s.kind === 'circle') return Math.hypot(x - s.cx, y - s.cy) <= s.r;
  if (s.kind === 'annulus') {
    const d = Math.hypot(x - s.cx, y - s.cy);
    return d >= s.inner && d <= s.outer;
  }
  if (s.kind === 'rect') return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  return false;
}
function bboxOf(s) {
  if (s.kind === 'polygon') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of s.points) {
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    return [x0, y0, x1, y1];
  }
  if (s.kind === 'circle') return [s.cx - s.r, s.cy - s.r, s.cx + s.r, s.cy + s.r];
  if (s.kind === 'annulus') return [s.cx - s.outer, s.cy - s.outer, s.cx + s.outer, s.cy + s.outer];
  if (s.kind === 'rect') return [s.x, s.y, s.x + s.w, s.y + s.h];
  return [0, 0, 0, 0];
}

const fairwayIdx = 0;
const fairway = H1.surfaces[fairwayIdx];
const slope = fairway.slope;
const gx = Math.sin(slope.angle);
const gy = -Math.cos(slope.angle);
const P = 24, half = P / 2;

const bb = bboxOf(fairway);
const x0 = Math.max(0, Math.floor(bb[0]));
const y0 = Math.max(0, Math.floor(bb[1]));
const x1 = Math.min(H1.width * TILE, Math.ceil(bb[2]));
const y1 = Math.min(H1.height * TILE, Math.ceil(bb[3]));

const toplayers = H1.surfaces.slice(fairwayIdx + 1);
const isTopHere = (x, y) => !toplayers.some((s) => inShape(x + 0.5, y + 0.5, s));

// Centre the chevron math on the bbox (v0.68 fix) so the V-apex
// ridge passes through the fairway, not the world origin.
const cx0 = (bb[0] + bb[2]) * 0.5;
const cy0 = (bb[1] + bb[3]) * 0.5;

let dark = 0, light = 0, skipped = 0;
const grid = [];
for (let ty = y0; ty < y1; ty += 4) {
  let row = '';
  for (let tx = x0; tx < x1; tx += 2) {
    if (!inShape(tx + 0.5, ty + 0.5, fairway)) { row += ' '; continue; }
    if (!isTopHere(tx, ty)) { row += '.'; skipped++; continue; }
    const lx = tx - cx0, ly = ty - cy0;
    const u = gx * lx + gy * ly;
    const v = -gy * lx + gx * ly;
    const phase = ((u + Math.abs(v)) % P + P) % P;
    if (phase < half) { row += '#'; dark++; } else { row += '-'; light++; }
  }
  grid.push(row);
}

console.log('Hole 1 fairway — slope angle=' + slope.angle.toFixed(3) + ' mag=' + slope.mag);
console.log(`bbox world px: (${bb[0]},${bb[1]}) → (${bb[2]},${bb[3]})`);
console.log(`# = dark chevron stripe  - = light  . = covered by topper  ' ' = outside fairway`);
console.log('--------------------------------------------------');
for (const r of grid) console.log(r);
console.log('--------------------------------------------------');
console.log(`dark=${dark}  light=${light}  skipped=${skipped}  ratio=${(dark / (dark + light || 1)).toFixed(2)}`);
console.log(dark > 50 && light > 50 ? 'PASS — chevron pattern is being produced on H1 fairway.' : 'FAIL — pattern not produced');
