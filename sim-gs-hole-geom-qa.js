#!/usr/bin/env node
// QA for GS hole geometry. Every flag must sit inside its green shape,
// every tee must sit inside its fairway (or at least a tee box), and
// the fairway must be at least 20 yd wide at the tee.

const fs = require('fs');
const TILE = 16;
const YARDS_PER_TILE = 10;

// Pull the HOLES array out of the source.
const src = fs.readFileSync('GolfStory/GolfStoryScreen.js', 'utf8');
const start = src.indexOf('const HOLES = [');
const end = src.indexOf('\n];', start);
if (start < 0 || end < 0) { console.error('HOLES array not found'); process.exit(1); }
const body = src.slice(start + 'const HOLES = ['.length, end);
// Strip `// ...` comments so JSON-ish parsing works.
const clean = body.replace(/\/\/[^\n]*/g, '');
const HOLES = new Function('T_GREEN','T_FAIRWAY','T_ROUGH','T_FRINGE','T_TEE','T_SAND','T_SHORE','T_WATER','Math',
  `return [${clean}];`
)('GREEN','FAIRWAY','ROUGH','FRINGE','TEE','SAND','SHORE','WATER', Math);

function pointInPolygon(pt, poly) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = (yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInShape(pt, shape) {
  if (shape.kind === 'polygon') return pointInPolygon(pt, shape.points);
  if (shape.kind === 'circle') {
    const dx = pt[0] - shape.cx, dy = pt[1] - shape.cy;
    return Math.hypot(dx, dy) <= shape.r;
  }
  if (shape.kind === 'annulus') {
    const dx = pt[0] - shape.cx, dy = pt[1] - shape.cy;
    const d = Math.hypot(dx, dy);
    return d >= shape.inner && d <= shape.outer;
  }
  if (shape.kind === 'rect') {
    return pt[0] >= shape.x && pt[0] <= shape.x + shape.w
        && pt[1] >= shape.y && pt[1] <= shape.y + shape.h;
  }
  return false;
}

const assert = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) process.exitCode = 1; };

console.log('Hole geometry QA\n');

for (const hole of HOLES) {
  console.log(`  ${hole.name}  par ${hole.par}`);
  const green = hole.surfaces.find((s) => s.type === 'GREEN');
  const fairways = hole.surfaces.filter((s) => s.type === 'FAIRWAY');
  const tees = hole.surfaces.filter((s) => s.type === 'TEE');
  const flag = [hole.flag.x, hole.flag.y];
  const tee = [hole.tee.x, hole.tee.y];

  assert(green && pointInShape(flag, green.shape),
    `    flag (${flag}) is on the green`);
  assert(tees.some((t) => pointInShape(tee, t.shape)),
    `    tee (${tee}) is on the tee box`);

  // Fairway width at the tee row — sample x across the fairway bounding
  // box at y = tee.y and count tiles that land inside any fairway piece.
  let maxX = -Infinity, minX = Infinity;
  for (const fw of fairways) {
    if (fw.shape.kind !== 'polygon') continue;
    for (const [x] of fw.shape.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  // Sample along rows from the tee northward until we find a row that
  // actually intersects at least one fairway polygon — covers holes
  // where the tee sits just south of the fairway (e.g. hole 6 split
  // fairway with water between them).
  let maxWidthYd = 0;
  for (let rowStep = 0; rowStep <= 30; rowStep += 0.5) {
    const sampleY = hole.tee.y - rowStep;
    let widthHere = 0;
    for (let x = Math.floor(minX * 10); x <= Math.ceil(maxX * 10); x++) {
      const worldX = x / 10;
      if (fairways.some((fw) => pointInShape([worldX, sampleY], fw.shape))) {
        widthHere++;
      }
    }
    const ydHere = Math.round((widthHere / 10) * YARDS_PER_TILE);
    if (ydHere > maxWidthYd) maxWidthYd = ydHere;
    if (ydHere >= 20) break;
  }
  const widthYd = maxWidthYd;
  assert(widthYd >= 20, `    fairway ≥ 20 yd wide at tee row (${widthYd} yd)`);
}
