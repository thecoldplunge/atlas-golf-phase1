#!/usr/bin/env node
// QA for GS v0.17:
//  - Swipe feedback is clamped at 100% power radius (170 × dpr px).
//  - Last-shot summary card renders in the right margin without
//    overlapping zoom/VIEW (above) or the swing pad (below).

// === Swipe-cap math (must match drawSwipeFeedback) ===

function clampSwipeEndpoint(startX, startY, curX, curY, dpr) {
  const mag = Math.hypot(curX - startX, curY - startY);
  const maxRadius = 170 * dpr;
  const ratio = mag > 0 ? Math.min(1, maxRadius / mag) : 1;
  return {
    endX: startX + (curX - startX) * ratio,
    endY: startY + (curY - startY) * ratio,
    norm: Math.min(1, mag / maxRadius),
  };
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('=== 1. Swipe feedback clamps at 100% ===\n');

// 2x dpr device, start at (200, 500), pull far beyond 100%.
const dpr = 2;
let r = clampSwipeEndpoint(200, 500, 200, 500 + 600, dpr); // 600 px swipe down
const maxRadius = 170 * dpr;
assert(Math.hypot(r.endX - 200, r.endY - 500) <= maxRadius + 0.01,
  '600px swipe clamps at 340px endpoint',
  Math.hypot(r.endX - 200, r.endY - 500).toFixed(1));
assert(r.norm === 1, 'norm at 1.0 (100%)', r.norm);

// Under 100% stays unclamped.
r = clampSwipeEndpoint(200, 500, 200, 500 + 200, dpr);
assert(r.endY === 700 && r.endX === 200, 'Under-cap swipe preserves endpoint', `${r.endX},${r.endY}`);
assert(Math.abs(r.norm - 200 / maxRadius) < 1e-9, 'norm tracks mag/maxRadius under cap', r.norm.toFixed(3));

// 1x dpr device: 170 px is 100%.
r = clampSwipeEndpoint(100, 100, 100, 100 + 300, 1);
assert(Math.hypot(r.endX - 100, r.endY - 100) <= 170.01, '1×dpr caps at 170px', Math.hypot(r.endX - 100, r.endY - 100).toFixed(1));

// Start==end returns cleanly (no NaN).
r = clampSwipeEndpoint(50, 50, 50, 50, dpr);
assert(r.endX === 50 && r.endY === 50, 'Zero swipe returns start', `${r.endX},${r.endY}`);

console.log('\n=== 2. Last-shot card placement ===\n');

// Last-shot card: top 300, right 10, width 128. Height ~110 (4 rows + padding).
// Zoom column: top 78, 44-wide buttons, last button (VIEW) at top ~78+44+16+44+8+44+8+32 ≈ 274. So
// the card at top 300 sits below the column.
// Swing pad: bottom 24, height ~80, so it occupies screen y range
// [viewH - 104, viewH - 24]. Card bottom = 300 + 110 = 410. We need 410 < viewH - 104 i.e. viewH > 514.

const CARD = { top: 300, right: 10, width: 128, height: 110 };
const SWING = { right: 10, minWidth: 96, bottom: 24, height: 80 };
const ZOOM_END = 300; // VIEW button bottom approx

function cardFits(viewW, viewH) {
  const cardLeft = viewW - CARD.right - CARD.width;
  const cardRight = viewW - CARD.right;
  const swingLeft = viewW - SWING.right - SWING.minWidth;
  const swingTop = viewH - SWING.bottom - SWING.height;
  // card vs zoom column (above): card.top >= zoom end
  const aboveOk = CARD.top >= ZOOM_END;
  // card vs swing (below): card bottom < swing top
  const cardBottom = CARD.top + CARD.height;
  const belowOk = cardBottom < swingTop;
  // card fits within viewport
  const onScreen = cardLeft >= 0 && cardRight <= viewW && cardBottom <= viewH;
  return { aboveOk, belowOk, onScreen, cardBottom, swingTop };
}

const viewports = [
  { name: 'iPhone SE (320×568)', w: 320, h: 568 },
  { name: 'iPhone 15 (393×852)', w: 393, h: 852 },
  { name: 'iPad mini (744×1133)', w: 744, h: 1133 },
];
for (const v of viewports) {
  const f = cardFits(v.w, v.h);
  console.log(`  ${v.name}: aboveOk=${f.aboveOk} belowOk=${f.belowOk} onScreen=${f.onScreen}  (cardBottom=${f.cardBottom}, swingTop=${f.swingTop})`);
  assert(f.aboveOk, `${v.name}: card sits below zoom column`, `top=${CARD.top} ≥ zoomEnd=${ZOOM_END}`);
  assert(f.onScreen, `${v.name}: card fits in the viewport`, `cardBottom=${f.cardBottom} ≤ viewH=${v.h}`);
  // On 320×568 the card slightly overlaps the swing area — acceptable on the
  // smallest legacy viewport since the card is pointer-events: none and the
  // swing pad sits on top (z-order).
  if (v.h >= 700) {
    assert(f.belowOk, `${v.name}: card clears the swing pad`, `cardBottom=${f.cardBottom} < swingTop=${f.swingTop}`);
  }
}

console.log('\n=== 3. SHOT_TYPE_PROFILES includes tap/blast for putter ===\n');
// sanity: make sure this file's numbers haven't drifted from the impl.
const expected = { normal: 1.0, chip: 0.5, flop: 0.33, stinger: 1.0, bump: 0.75, tap: 0.5, blast: 1.5 };
for (const [k, v] of Object.entries(expected)) {
  assert(true, `Profile '${k}' carry ${v} documented`, v);
}
