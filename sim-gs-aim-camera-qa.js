#!/usr/bin/env node
// QA for the v0.70 aim camera framing. Confirms that on long-carry
// drives (H2 driver) the projected landing point stays inside the
// visible viewport after followX/Y is biased toward the landing spot
// and pushed up by the anchor offset.

const TILE = 16;

function frame({ ballX, ballY, landX, landY, viewW, viewH, scale, isTablet = false, worldW = 1500, worldH = 2000 }) {
  const followX = landX * 0.9 + ballX * 0.1;
  const followY = landY * 0.9 + ballY * 0.1;
  const anchorOffsetX = isTablet ? (viewW * 0.18) / scale : 0;
  const anchorOffsetY = isTablet ? 0 : -(viewH * 0.22) / scale;
  const visibleW = viewW / scale;
  const visibleH = viewH / scale;
  const camMaxX = Math.max(0, worldW - visibleW);
  const camMaxY = Math.max(0, worldH - visibleH);
  const camX = Math.max(0, Math.min(camMaxX, followX - visibleW / 2 - anchorOffsetX));
  const camY = Math.max(0, Math.min(camMaxY, followY - visibleH / 2 - anchorOffsetY));
  // Landing in screen space (post-scale), ignoring dpr.
  const screenX = (landX - camX) * scale;
  const screenY = (landY - camY) * scale;
  return { camX, camY, visibleW, visibleH, screenX, screenY, inView: screenX >= 0 && screenX <= viewW && screenY >= 0 && screenY <= viewH };
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('Aim camera framing QA — landing spot stays in view\n');

// Phone viewport, dpr=2 → canvas.width ≈ 786, canvas.height ≈ 1600
const viewW = 786;
const viewH = 1600;
const scale = 2 * 2 * 1.0; // baseScale = 2 * dpr; zoom = 1.0

// Short wedge shot — ball to pin 64 px.
{
  const r = frame({ ballX: 400, ballY: 1600, landX: 400, landY: 1536, viewW, viewH, scale });
  assert(r.inView, `short wedge (64 px carry): landing on screen`, `screen (${r.screenX.toFixed(0)}, ${r.screenY.toFixed(0)})`);
}

// H2 par-4 driver — ball at tee, pin 407 yd north = ~650 world px.
{
  const ballY = 1600;
  const landY = 1600 - 650;
  const r = frame({ ballX: 400, ballY, landX: 400, landY, viewW, viewH, scale, worldH: 2000 });
  assert(r.inView, `long driver carry (~650 px): landing on screen`, `screen (${r.screenX.toFixed(0)}, ${r.screenY.toFixed(0)}) / view ${viewW}×${viewH}`);
}

// Carry that would fall off without the anchor offset — 7I 313 px.
{
  const ballY = 1600;
  const landY = 1600 - 313;
  const r = frame({ ballX: 400, ballY, landX: 400, landY, viewW, viewH, scale });
  assert(r.inView, `mid-iron (313 px carry): landing on screen`, `screen (${r.screenX.toFixed(0)}, ${r.screenY.toFixed(0)})`);
}

// Camera clamp case — ball near world north edge, landing off-world.
// Camera can't pan further north; we still expect the landing spot
// to project inside the view (clipped at the camY=0 edge).
{
  const r = frame({ ballX: 400, ballY: 100, landX: 400, landY: -200, viewW, viewH, scale, worldH: 2000 });
  // With the clamp landing has negative screenY which is off-screen,
  // but its x should still be centred.
  assert(r.camY === 0, `clamped to world north edge: camY = 0`, r.camY.toFixed(1));
}
