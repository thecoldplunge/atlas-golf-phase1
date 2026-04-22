import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CLUBHOUSE_WORLD,
  RANGE_WORLD,
  PUTTING_WORLD,
  NpcDialogOverlay,
  translateSurfaceType,
} from './Clubhouse';

// Simple on-screen error boundary. When any child throws during
// render / effect, we fall back to a dark screen with the exact
// message + stack so the crash is visible to the user instead of
// vanishing into a blank canvas.
class GsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null, stack: '' };
  }
  static getDerivedStateFromError(err) {
    return { err: String(err?.message || err), stack: String(err?.stack || '') };
  }
  componentDidCatch(err, info) {
    try { console.error('[GS crash]', err, info?.componentStack); } catch (_) {}
  }
  render() {
    if (this.state.err) {
      return (
        <View style={{
          flex: 1, backgroundColor: '#0b1a10', alignItems: 'center',
          justifyContent: 'center', padding: 20,
        }}>
          <Text style={{
            color: '#ff6ad5', fontSize: 14, fontWeight: '900',
            letterSpacing: 2, marginBottom: 10, textAlign: 'center',
            fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
          }}>GS HIT A CRASH</Text>
          <Text style={{
            color: '#fff6d8', fontSize: 12, marginBottom: 10, textAlign: 'center',
            fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
          }}>{this.state.err}</Text>
          <Text style={{
            color: '#a9d4a9', fontSize: 10, textAlign: 'left',
            fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
          }}>
            {this.state.stack.slice(0, 900)}
          </Text>
          <Pressable
            onPress={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
            style={{
              marginTop: 16, paddingVertical: 10, paddingHorizontal: 22,
              borderWidth: 3, borderColor: '#88f8bb',
              backgroundColor: 'rgba(136,248,187,0.12)',
            }}
          >
            <Text style={{
              color: '#f5fbef', fontSize: 13, fontWeight: '900', letterSpacing: 2,
              fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
            }}>RELOAD</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const TILE = 16;
const GRAVITY = 70;
const HOLE_RADIUS = 4;
// Tree collision tuning (world px). Canopy is a horizontal-circle drag
// zone active only in the canopy altitude band. Trunk is a tight
// hard-impact core near the ground; trunks also stop rolling balls.
// Scaled with the v0.40 sprite upscale so collisions match the visible
// silhouette — canopy ~30 px radius (crown is ~32 px wide), z band
// extends higher since the new canopy reaches y-40.
// Tree collision radii — trimmed ~20% in v0.53 vs the earlier tuning
// (they felt too grabby; balls clipped trees they clearly cleared).
const TREE_CANOPY_R = 22;
const TREE_CANOPY_Z_LO = 12;
const TREE_CANOPY_Z_HI = 42;
const TREE_TRUNK_R = 4;
const TREE_TRUNK_Z_HI = 14;
// When the ball starts under a tree, we suppress that tree's collision
// until the shot has physically cleared it — either by rising above
// the canopy or exiting its horizontal radius. `escapeTree` is a
// { x, y } tuple in world px and `escapeUntilExit` gates the skip.
const escapeTree = { x: null, y: null };
// Flagstick collider — radius in world px, and the max altitude at
// which the pole still registers contact (drawn to y-17 in sprite px).
const FLAG_STICK_R = 1.8;
const FLAG_STICK_Z_HI = 18;
// Shared shake state for the flagstick — set when the ball pings the
// pole so drawFlag can render a brief wobble. { t: seconds since hit }
const pinShake = { t: 999, intensity: 0 };
// Shared burst leaves queue — pushed by tree collisions so drawLeaves
// can paint a flurry at the impact point.
const burstLeaves = [];
const YARDS_PER_TILE = 10;
const MAX_LEAVES = 14;

const T_ROUGH = 0;
const T_FAIRWAY = 1;
const T_GREEN = 2;
const T_SAND = 3;
const T_WATER = 4;
const T_FRINGE = 5;
const T_TEE = 6;
const T_SHORE = 7;

function hRand(x, y, seed) {
  let n = (((x | 0) & 0xffff) * 73856093) ^ (((y | 0) & 0xffff) * 19349663) ^ (((seed | 0) & 0xffff) * 83492791);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 0xffffffff;
}

function ss(t) { return t * t * (3 - 2 * t); }

function noise2d(x, y, scale, seed) {
  const sx = x / scale, sy = y / scale;
  const ix = Math.floor(sx), iy = Math.floor(sy);
  const fx = sx - ix, fy = sy - iy;
  const ux = ss(fx), uy = ss(fy);
  const n00 = hRand(ix, iy, seed);
  const n10 = hRand(ix + 1, iy, seed);
  const n01 = hRand(ix, iy + 1, seed);
  const n11 = hRand(ix + 1, iy + 1, seed);
  const a = n00 + (n10 - n00) * ux;
  const b = n01 + (n11 - n01) * ux;
  return a + (b - a) * uy;
}

function fbm(x, y) {
  const a = noise2d(x, y, 18, 11) * 0.55;
  const b = noise2d(x, y, 7, 22) * 0.3;
  const c = noise2d(x, y, 3, 33) * 0.15;
  return a + b + c;
}

const HOLES = [
  {
    name: 'Hole 1', par: 3, width: 20, height: 30,
    tee: { x: 9.5, y: 24.8 },
    flag: { x: 9.5, y: 5.5 },
    greenSlope: { angle: Math.PI * 0.3, mag: 7 },
    surfaces: [
      { type: T_FAIRWAY, shape: { kind: 'polygon', points: [
        [7.2, 8.8], [10, 8.6], [12.8, 8.8], [13.4, 9.4], [13.9, 10.4],
        [14.2, 11.8], [14.3, 13.5], [14.1, 15.5], [13.9, 17.5],
        [13.7, 19.3], [13.4, 20.8], [13, 21.9], [12.6, 22.8],
        [12.2, 23.6], [11.8, 24.4], [11.4, 25.1], [11.1, 25.7],
        [9, 25.7], [8.9, 25.1], [8.5, 24.4], [8.1, 23.6],
        [7.7, 22.8], [7.3, 21.9], [7, 20.8], [6.7, 19.3],
        [6.4, 17.5], [6.2, 15.5], [6, 13.5], [6.1, 11.8],
        [6.3, 10.4], [6.8, 9.4],
      ],
      // Fairway slopes gently east-to-green, pushing anything rolling
      // through the dogleg toward the cup side.
      }, slope: { angle: Math.PI * 0.35, mag: 3 } },
      { type: T_SAND, shape: { kind: 'polygon', points: [
        [12.9, 10.8], [13.8, 10.7], [14.6, 11], [14.9, 11.8],
        [14.8, 12.8], [14.4, 13.6], [13.6, 13.8], [12.9, 13.5],
        [12.5, 12.6], [12.6, 11.5],
      ]}},
      { type: T_SAND, shape: { kind: 'circle', cx: 13.9, cy: 7.4, r: 1.1 }},
      { type: T_SHORE, shape: { kind: 'polygon', points: [
        [1.05, 12.7], [3, 12.45], [4.85, 12.75], [5.75, 13.55], [6.15, 15.05],
        [6.2, 17.05], [5.85, 18.6], [4.95, 19.3], [3.55, 19.65], [1.9, 19.55],
        [0.55, 18.75], [0.25, 17.0], [0.35, 15.1], [0.7, 13.7],
      ]}},
      { type: T_WATER, shape: { kind: 'polygon', points: [
        [1.5, 13.2], [3, 13], [4.8, 13.3], [5.6, 14], [5.9, 15.3],
        [5.9, 17], [5.6, 18.4], [4.8, 19], [3.5, 19.3], [2, 19.2],
        [1, 18.4], [0.7, 17], [0.8, 15.3], [1.1, 14],
      ]}},
      { type: T_FRINGE, shape: { kind: 'annulus', cx: 9.5, cy: 5.5, inner: 3.2, outer: 4.05 }},
      { type: T_GREEN, shape: { kind: 'circle', cx: 9.5, cy: 5.5, r: 3.2 }},
      { type: T_TEE, shape: { kind: 'rect', x: 8.7, y: 24.2, w: 1.6, h: 1.1 }},
    ],
    trees: [
      { x: 3.5, y: 8 }, { x: 16.5, y: 6.5 }, { x: 2.5, y: 11.2 }, { x: 17.5, y: 14 },
      { x: 4.5, y: 22 }, { x: 14.5, y: 24.5 }, { x: 1.5, y: 3.5 }, { x: 18.5, y: 2.5 },
      { x: 2.5, y: 27.5 }, { x: 17.5, y: 28 }, { x: 6.5, y: 27.5 }, { x: 13.5, y: 21.5 },
      { x: 1.5, y: 20.5 }, { x: 15.5, y: 19.5 }, { x: 0.5, y: 9 }, { x: 19.5, y: 10 },
      { x: 2, y: 23.5 }, { x: 16.5, y: 10.5 }, { x: 16.5, y: 16.5 },
      { x: 18.5, y: 19 }, { x: 0.5, y: 26 }, { x: 19.5, y: 23 }, { x: 4, y: 25.5 },
      { x: 15, y: 28 },
    ],
  },
  {
    name: 'Hole 2', par: 4, width: 22, height: 48,
    tee: { x: 11, y: 45.5 },
    flag: { x: 13, y: 5 },
    greenSlope: { angle: Math.PI * 1.05, mag: 8 },
    surfaces: [
      { type: T_FAIRWAY, shape: { kind: 'polygon', points: [
        [9, 46], [13, 46], [13.8, 44.5], [14.5, 41], [15, 37], [15.5, 32],
        [16, 27], [16.2, 22], [16, 17], [15.5, 13], [14.7, 10], [13.5, 8],
        [11.5, 7], [9.8, 7.3], [8.7, 9], [8, 12], [7.3, 16],
        [7, 21], [7, 27], [7.2, 33], [7.6, 38], [8, 42.5], [8.5, 45.5]
      ]}},
      { type: T_SAND, shape: { kind: 'circle', cx: 16, cy: 7, r: 1.2 }},
      { type: T_SAND, shape: { kind: 'polygon', points: [
        [8.5, 27.5], [9.5, 27.3], [10.2, 28], [10, 29], [9, 29.2], [8.3, 28.5]
      ]}},
      { type: T_SHORE, shape: { kind: 'polygon', points: [
        [0.1, 8], [2, 7.7], [4, 8.1], [5.5, 9.6], [6.1, 12.5], [6.3, 18],
        [6.3, 26], [6.2, 33], [5.9, 38.5], [5.3, 42.5], [4, 43.8], [2, 43.5], [0.1, 42.2]
      ]}},
      { type: T_WATER, shape: { kind: 'polygon', points: [
        [0.4, 8.5], [2, 8.2], [3.8, 8.7], [5, 10.3], [5.5, 13], [5.7, 18.5],
        [5.7, 26], [5.5, 32.5], [5.2, 37.5], [4.6, 41.3], [3.2, 42.5], [1.5, 42.3], [0.4, 41]
      ]}},
      { type: T_FRINGE, shape: { kind: 'annulus', cx: 13, cy: 5, inner: 2.7, outer: 3.45 }},
      { type: T_GREEN, shape: { kind: 'circle', cx: 13, cy: 5, r: 2.7 }},
      { type: T_TEE, shape: { kind: 'rect', x: 10.2, y: 45.1, w: 1.6, h: 1.0 }},
    ],
    trees: [
      { x: 19, y: 5 }, { x: 20, y: 9 }, { x: 19.5, y: 13 }, { x: 20, y: 17 },
      { x: 19.5, y: 21 }, { x: 20, y: 25 }, { x: 19.5, y: 29 }, { x: 20, y: 33 },
      { x: 19.5, y: 37 }, { x: 20, y: 41 }, { x: 19, y: 45 }, { x: 18, y: 47 },
      { x: 16, y: 2.5 }, { x: 13, y: 2 }, { x: 10, y: 2.5 }, { x: 7, y: 2 },
      { x: 8, y: 47 }, { x: 13, y: 47 }, { x: 21, y: 46.5 },
      { x: 0.5, y: 3 }, { x: 2, y: 3 }, { x: 0.5, y: 45 }, { x: 2, y: 46 },
      { x: 18, y: 10 }, { x: 17.5, y: 19 }, { x: 18, y: 28 }, { x: 17.8, y: 36 },
    ],
  },
  {
    name: 'Hole 3', par: 5, width: 26, height: 58,
    tee: { x: 22, y: 55.5 },
    flag: { x: 4, y: 5 },
    greenSlope: { angle: Math.PI * 0.55, mag: 7 },
    surfaces: [
      { type: T_FAIRWAY, shape: { kind: 'polygon', points: [
        [20, 56.2], [23, 56.2],
        [23.3, 54], [23.3, 49], [23.2, 43], [22.8, 38],
        [22.3, 34], [21.4, 30.5], [19.8, 28], [17, 26.5], [14, 25.7], [10, 25.3],
        [7, 24.8], [4.8, 23.8], [3.5, 21.5], [3.1, 18], [3, 14], [3.1, 10],
        [3.3, 6], [3.1, 4.5], [2.3, 4.3],
        [1.6, 5], [1.4, 10], [1.5, 16], [1.7, 22], [2.1, 27], [3, 31],
        [4.8, 32.5], [8, 33.3], [12, 33.8], [15.5, 34], [18, 34.5],
        [20, 35.5], [20.6, 39], [20.8, 44], [20.6, 49], [20.3, 53], [20, 56.2]
      ],
      // Par-5 dogleg: fairway tilts north-west so a well-struck drive
      // chases the corner and rolls further toward the green.
      }, slope: { angle: Math.PI * 1.2, mag: 4 } },
      { type: T_SAND, shape: { kind: 'circle', cx: 17.5, cy: 29.5, r: 1.3 }},
      { type: T_SAND, shape: { kind: 'polygon', points: [
        [5.3, 7], [6.2, 6.8], [6.8, 7.5], [6.5, 8.3], [5.6, 8.4], [5, 7.7]
      ]}},
      { type: T_FRINGE, shape: { kind: 'annulus', cx: 4, cy: 5, inner: 2.5, outer: 3.2 }},
      { type: T_GREEN, shape: { kind: 'circle', cx: 4, cy: 5, r: 2.5 }},
      { type: T_TEE, shape: { kind: 'rect', x: 21.2, y: 55.1, w: 1.6, h: 1.0 }},
    ],
    trees: [
      { x: 10, y: 40 }, { x: 12, y: 38 }, { x: 14, y: 40 }, { x: 16, y: 38 },
      { x: 11, y: 43 }, { x: 13, y: 44 }, { x: 15, y: 43 }, { x: 17, y: 41 },
      { x: 9, y: 46 }, { x: 12, y: 47 }, { x: 14, y: 48 }, { x: 16, y: 47 },
      { x: 18, y: 44 }, { x: 10, y: 50 }, { x: 13, y: 50 }, { x: 15, y: 51 },
      { x: 11, y: 53 }, { x: 14, y: 54 }, { x: 8, y: 43 }, { x: 9, y: 37 },
      { x: 11, y: 35.5 }, { x: 13, y: 35.5 }, { x: 15, y: 36 }, { x: 17, y: 37 },
      { x: 18, y: 49 }, { x: 18, y: 53 }, { x: 16, y: 55 }, { x: 13, y: 55.5 },
      { x: 0.5, y: 9 }, { x: 0.5, y: 15 }, { x: 0.5, y: 21 }, { x: 0.5, y: 27 },
      { x: 0.5, y: 33 }, { x: 0.5, y: 40 }, { x: 0.5, y: 46 }, { x: 0.5, y: 52 },
      { x: 25, y: 5 }, { x: 25, y: 10 }, { x: 25, y: 15 }, { x: 25, y: 20 },
      { x: 25, y: 25 }, { x: 25, y: 30 }, { x: 25, y: 36 }, { x: 25, y: 42 },
      { x: 25, y: 48 }, { x: 25, y: 53 }, { x: 24.5, y: 57 },
      { x: 3, y: 2 }, { x: 6, y: 2 }, { x: 9, y: 2 }, { x: 13, y: 2 }, { x: 19, y: 2 },
      { x: 20, y: 57.5 }, { x: 23, y: 57.5 },
    ],
  },
  {
    // Hole 4 — "Frogman": forced water carry from tee to a small green.
    // No bail-out. Short but demands commitment.
    name: 'Hole 4', par: 3, width: 22, height: 30,
    tee: { x: 11, y: 26 },
    flag: { x: 11, y: 5 },
    greenSlope: { angle: Math.PI * 0.15, mag: 5 },
    surfaces: [
      { type: T_FAIRWAY, shape: { kind: 'polygon', points: [
        [9.5, 27], [12.5, 27], [12.5, 23.5], [11, 22.5], [9.5, 23.5]
      ]}},
      { type: T_SHORE, shape: { kind: 'polygon', points: [
        [2, 9], [4, 8.3], [7, 8.2], [10, 8.1], [13, 8.2], [16, 8.3], [19, 8.7], [20.5, 10],
        [20.3, 16], [19, 20.5], [16.5, 22.5], [13, 23], [9, 23.3], [5, 23], [3, 21.7],
        [1.7, 19], [1.5, 15], [1.5, 11.5]
      ]}},
      { type: T_WATER, shape: { kind: 'polygon', points: [
        [3, 10], [6, 9.3], [10, 9.1], [14, 9.3], [17.5, 9.7], [19.3, 11],
        [19.2, 16], [18, 19.7], [16, 21.3], [13, 21.9], [9, 22.1], [5.5, 21.7],
        [3.5, 20.5], [2.6, 18], [2.5, 15], [2.6, 12]
      ]}},
      { type: T_FRINGE, shape: { kind: 'annulus', cx: 11, cy: 5, inner: 2.3, outer: 3.0 }},
      { type: T_GREEN, shape: { kind: 'circle', cx: 11, cy: 5, r: 2.3 }},
      { type: T_SAND, shape: { kind: 'circle', cx: 8, cy: 5.5, r: 0.9 }},
      { type: T_SAND, shape: { kind: 'circle', cx: 14, cy: 6, r: 0.9 }},
      { type: T_TEE, shape: { kind: 'rect', x: 10.2, y: 25.6, w: 1.6, h: 1.0 }},
    ],
    trees: [
      { x: 0.8, y: 3 }, { x: 3, y: 3.5 }, { x: 5.5, y: 3 }, { x: 8, y: 2.5 }, { x: 13.5, y: 2.5 },
      { x: 16, y: 3 }, { x: 18.5, y: 3.5 }, { x: 21, y: 3 },
      { x: 0.5, y: 7 }, { x: 21.3, y: 6.5 }, { x: 0.5, y: 23 }, { x: 21, y: 23 },
      { x: 0.5, y: 27 }, { x: 2.5, y: 28.5 }, { x: 5.5, y: 28.5 }, { x: 8, y: 28.5 },
      { x: 14, y: 28.5 }, { x: 16.5, y: 28.5 }, { x: 19, y: 28.5 }, { x: 21.3, y: 28 },
    ],
  },
  {
    // Hole 5 — "Hook Around": par 3 dogleg-left. Straight shot is blocked
    // by trees; player must shape a draw or play conservatively.
    name: 'Hole 5', par: 3, width: 24, height: 30,
    tee: { x: 20, y: 26 },
    flag: { x: 4, y: 5 },
    greenSlope: { angle: Math.PI * 0.75, mag: 6 },
    surfaces: [
      { type: T_FAIRWAY, shape: { kind: 'polygon', points: [
        [18.5, 27], [21.5, 27], [21.5, 22], [20.5, 18], [19, 15], [16, 12],
        [12, 10], [8, 9], [5.5, 9], [3.5, 9.5], [2.5, 11], [2.5, 14],
        [3, 16.5], [5, 17.5], [9, 17], [13, 16], [15.5, 15], [17, 18],
        [18, 22], [18.5, 26]
      ]}},
      { type: T_SAND, shape: { kind: 'circle', cx: 6.3, cy: 7, r: 1.1 }},
      { type: T_SAND, shape: { kind: 'polygon', points: [
        [13, 14.3], [14.5, 14.1], [15.3, 14.8], [14.8, 15.6], [13.2, 15.4]
      ]}},
      { type: T_FRINGE, shape: { kind: 'annulus', cx: 4, cy: 5, inner: 2.2, outer: 2.9 }},
      { type: T_GREEN, shape: { kind: 'circle', cx: 4, cy: 5, r: 2.2 }},
      { type: T_TEE, shape: { kind: 'rect', x: 19.2, y: 25.6, w: 1.6, h: 1.0 }},
    ],
    trees: [
      // Dogleg blockade — a wall of trees the player must curve around.
      { x: 7, y: 12.5 }, { x: 8.5, y: 13 }, { x: 10, y: 13.5 }, { x: 11.5, y: 14 },
      { x: 13, y: 13 }, { x: 14.5, y: 12.5 }, { x: 16, y: 13 }, { x: 10, y: 15 },
      { x: 11.5, y: 16 }, { x: 13, y: 17 },
      { x: 0.5, y: 2 }, { x: 3, y: 2 }, { x: 6, y: 2.5 }, { x: 9, y: 2.5 },
      { x: 12, y: 2 }, { x: 15, y: 2.5 }, { x: 18, y: 2 }, { x: 21, y: 2 }, { x: 23, y: 2 },
      { x: 0.5, y: 10 }, { x: 0.5, y: 16 }, { x: 0.5, y: 22 }, { x: 0.5, y: 28 },
      { x: 23, y: 8 }, { x: 23, y: 14 }, { x: 23, y: 20 }, { x: 23, y: 26 },
      { x: 3, y: 28 }, { x: 6, y: 28 }, { x: 10, y: 28 }, { x: 14, y: 28 }, { x: 17, y: 28 },
    ],
  },
  {
    // Hole 6 — "The Fork": par 4 with a ribbon of rough + water down the
    // middle splitting the fairway into two paths (safe right / aggressive
    // left with a shorter approach).
    name: 'Hole 6', par: 4, width: 26, height: 48,
    tee: { x: 13, y: 45.5 },
    flag: { x: 13, y: 5 },
    greenSlope: { angle: Math.PI * 1.2, mag: 6 },
    surfaces: [
      // LEFT fairway (aggressive) — shorter but tight between water + trees.
      { type: T_FAIRWAY, shape: { kind: 'polygon', points: [
        [9, 44], [12, 44], [11.5, 40], [10, 35], [8, 30], [6, 25], [5.5, 20],
        [6.5, 15], [9, 12], [11, 10], [10.5, 9], [9, 9.5], [7, 11.5], [5, 15],
        [4, 20], [3.8, 26], [4.7, 32], [6.5, 38], [8, 42]
      ]}},
      // RIGHT fairway (safe) — wider, more trees to clear on the approach.
      { type: T_FAIRWAY, shape: { kind: 'polygon', points: [
        [14, 44], [17, 44], [18.5, 40], [19.5, 35], [20, 28], [20, 22], [19.5, 16],
        [18, 12], [15.5, 9.5], [13, 9], [14, 10.5], [15.5, 12.5], [17, 15.5], [17.5, 20],
        [17.3, 26], [16.8, 32], [15.3, 38], [14, 42]
      ]}},
      // Water + shore splitting the two fairways.
      { type: T_SHORE, shape: { kind: 'polygon', points: [
        [12, 40], [14, 40], [14.5, 34], [14.5, 28], [14.2, 22], [13.5, 16], [13, 13],
        [12.5, 16], [11.8, 22], [11.5, 28], [11.5, 34]
      ]}},
      { type: T_WATER, shape: { kind: 'polygon', points: [
        [12.4, 39], [13.6, 39], [14, 34], [14, 28], [13.7, 22], [13.2, 17], [13, 14],
        [12.8, 17], [12.3, 22], [12, 28], [12, 34]
      ]}},
      { type: T_SAND, shape: { kind: 'circle', cx: 8, cy: 8, r: 1.2 }},
      { type: T_SAND, shape: { kind: 'circle', cx: 18, cy: 8, r: 1.2 }},
      { type: T_FRINGE, shape: { kind: 'annulus', cx: 13, cy: 5, inner: 2.8, outer: 3.5 }},
      { type: T_GREEN, shape: { kind: 'circle', cx: 13, cy: 5, r: 2.8 }},
      { type: T_TEE, shape: { kind: 'rect', x: 12.2, y: 45.1, w: 1.6, h: 1.0 }},
    ],
    trees: [
      { x: 0.5, y: 5 }, { x: 0.5, y: 11 }, { x: 0.5, y: 17 }, { x: 0.5, y: 23 },
      { x: 0.5, y: 29 }, { x: 0.5, y: 35 }, { x: 0.5, y: 41 }, { x: 0.5, y: 47 },
      { x: 25, y: 5 }, { x: 25, y: 11 }, { x: 25, y: 17 }, { x: 25, y: 23 },
      { x: 25, y: 29 }, { x: 25, y: 35 }, { x: 25, y: 41 }, { x: 25, y: 47 },
      { x: 3, y: 2 }, { x: 7, y: 2 }, { x: 13, y: 2 }, { x: 19, y: 2 }, { x: 23, y: 2 },
      { x: 5, y: 47 }, { x: 9, y: 47 }, { x: 17, y: 47 }, { x: 21, y: 47 },
      // Tight trees near the fork chokepoint to punish risky left route.
      { x: 3, y: 20 }, { x: 2.5, y: 25 }, { x: 3, y: 30 }, { x: 3, y: 35 },
    ],
  },
  {
    // Hole 7 — "Cape": par 3 with water down the full right side. Longer
    // aggressive line cuts the corner over water; safe line plays left.
    name: 'Hole 7', par: 3, width: 22, height: 32,
    tee: { x: 6, y: 28 },
    flag: { x: 15, y: 5 },
    greenSlope: { angle: Math.PI * 0.35, mag: 6 },
    surfaces: [
      { type: T_FAIRWAY, shape: { kind: 'polygon', points: [
        [3, 29.5], [9, 29.5], [7.5, 24], [8, 20], [8.5, 15], [9.5, 11], [11, 8.5],
        [14, 7.5], [15, 8], [14.5, 10], [13, 13], [12, 17], [11.5, 21], [11, 25], [11, 28]
      ]}},
      { type: T_SHORE, shape: { kind: 'polygon', points: [
        [12, 10], [14.5, 9.5], [17, 9.8], [19, 10.8], [20.5, 13], [20.8, 16], [20.5, 20],
        [19.8, 25], [18.5, 29], [17, 30.5], [15, 30.5], [12.5, 29], [11.5, 26], [11.3, 22],
        [11.6, 18], [11.9, 14]
      ]}},
      { type: T_WATER, shape: { kind: 'polygon', points: [
        [13, 11], [15, 10.5], [17, 10.8], [18.7, 11.8], [19.8, 13.5], [20, 16.5],
        [19.7, 20.5], [19, 25], [17.8, 28.5], [16.5, 29.5], [14.7, 29.3], [13, 28], [12.5, 25],
        [12.5, 21], [12.6, 17], [12.8, 14]
      ]}},
      { type: T_SAND, shape: { kind: 'polygon', points: [
        [12.5, 6], [14, 5.7], [15.2, 6.3], [14.7, 7.4], [13, 7.3]
      ]}},
      { type: T_FRINGE, shape: { kind: 'annulus', cx: 15, cy: 5, inner: 2.2, outer: 2.9 }},
      { type: T_GREEN, shape: { kind: 'circle', cx: 15, cy: 5, r: 2.2 }},
      { type: T_TEE, shape: { kind: 'rect', x: 5.2, y: 27.6, w: 1.6, h: 1.0 }},
    ],
    trees: [
      { x: 0.5, y: 4 }, { x: 2.5, y: 3 }, { x: 5, y: 3 }, { x: 8, y: 3 }, { x: 11, y: 3 },
      { x: 18, y: 3 }, { x: 21, y: 3 },
      { x: 0.5, y: 9 }, { x: 0.5, y: 14 }, { x: 0.5, y: 19 }, { x: 0.5, y: 24 },
      { x: 0.5, y: 29 }, { x: 21, y: 8 }, { x: 21, y: 14 }, { x: 21, y: 20 }, { x: 21, y: 26 },
      { x: 3, y: 31 }, { x: 7, y: 31 }, { x: 11, y: 31 }, { x: 15, y: 31 }, { x: 19, y: 31 },
    ],
  },
  {
    // Hole 8 — "Crescent": par 3 with a curved peanut-shaped green. Pin
    // hidden behind a sand spine; playing to the correct lobe matters.
    name: 'Hole 8', par: 3, width: 20, height: 28,
    tee: { x: 10, y: 24 },
    flag: { x: 14.5, y: 6.5 },
    greenSlope: { angle: Math.PI * 0.9, mag: 4 },
    surfaces: [
      { type: T_FAIRWAY, shape: { kind: 'polygon', points: [
        [7.5, 26], [12.5, 26], [13, 22], [12.5, 18], [12, 15], [11.5, 11.5],
        [8.5, 11.5], [8, 15], [7.5, 18], [7.5, 22]
      ]}},
      // Peanut green — two lobes joined by a narrow waist.
      { type: T_FRINGE, shape: { kind: 'polygon', points: [
        [6.8, 5.5], [8.5, 4.3], [10.5, 4], [11.3, 5.3], [11.8, 7], [12.2, 7.2],
        [13.5, 5.5], [15, 4.5], [16.5, 5], [16.8, 7], [16, 8.8], [14.5, 9.5],
        [13, 9.3], [12, 8.3], [11, 8.5], [9.5, 9.5], [8, 9.5], [6.8, 8.5], [6.3, 7]
      ]}},
      { type: T_GREEN, shape: { kind: 'polygon', points: [
        [7.3, 5.8], [8.8, 4.9], [10.2, 4.7], [10.8, 5.8], [11.2, 7.2], [12, 7.4],
        [13.2, 6], [14.7, 5.2], [15.9, 5.6], [16.1, 7], [15.5, 8.3], [14.3, 8.9],
        [13.2, 8.7], [12.2, 8.1], [11.2, 8.2], [9.7, 9], [8.4, 9], [7.4, 8.1], [7, 7]
      ]}},
      // Sand spine along the waist of the peanut.
      { type: T_SAND, shape: { kind: 'polygon', points: [
        [10.4, 6.5], [11.7, 6.4], [12.6, 7.2], [11.8, 7.8], [10.7, 7.7]
      ]}},
      { type: T_SAND, shape: { kind: 'circle', cx: 13, cy: 11, r: 0.9 }},
      { type: T_TEE, shape: { kind: 'rect', x: 9.2, y: 23.6, w: 1.6, h: 1.0 }},
    ],
    trees: [
      { x: 0.8, y: 3 }, { x: 3, y: 2.5 }, { x: 5, y: 2.5 }, { x: 9, y: 1.5 },
      { x: 14, y: 2 }, { x: 17, y: 2.5 }, { x: 19.2, y: 3 },
      { x: 0.5, y: 10 }, { x: 0.5, y: 16 }, { x: 0.5, y: 22 }, { x: 0.5, y: 26 },
      { x: 19, y: 10 }, { x: 19, y: 16 }, { x: 19, y: 22 }, { x: 19, y: 26 },
      { x: 3, y: 13 }, { x: 4, y: 17 }, { x: 3.5, y: 21 },
      { x: 15, y: 13 }, { x: 16, y: 17 }, { x: 15.5, y: 21 },
      { x: 4, y: 27 }, { x: 7, y: 27 }, { x: 13, y: 27 }, { x: 16, y: 27 },
    ],
  },
  {
    // Hole 9 — "Amen": closer. Par 3 with water short + long, kidney
    // green tucked behind a bunker. Miss right = sand; miss left = trees.
    name: 'Hole 9', par: 3, width: 22, height: 32,
    tee: { x: 11, y: 28 },
    flag: { x: 11, y: 6 },
    greenSlope: { angle: Math.PI * 1.4, mag: 5 },
    surfaces: [
      { type: T_FAIRWAY, shape: { kind: 'polygon', points: [
        [9.5, 29], [12.5, 29], [12.5, 26], [12, 22], [11, 18], [10, 16], [10, 14],
        [11, 13], [12.5, 13], [13.5, 14], [13, 16], [12, 18], [11, 22], [10.5, 26]
      ]}},
      // Front water hazard.
      { type: T_SHORE, shape: { kind: 'polygon', points: [
        [5, 11], [8, 10.5], [11.5, 11], [14.5, 10.7], [17, 11.3], [17.8, 12.5],
        [17.2, 13.8], [15, 14.3], [11, 14], [7, 13.7], [4.7, 13], [4.2, 12]
      ]}},
      { type: T_WATER, shape: { kind: 'polygon', points: [
        [6, 11.7], [9, 11.3], [12, 11.7], [14.5, 11.5], [16.5, 12], [16.8, 12.8],
        [15.5, 13.5], [12, 13.3], [8, 13], [5.7, 12.5], [5.5, 12.1]
      ]}},
      // Kidney green: concave on the front-left.
      { type: T_FRINGE, shape: { kind: 'polygon', points: [
        [7.8, 7], [9.5, 4.8], [12, 4], [14.3, 4.7], [15.5, 6.5], [15.2, 8.5], [14, 9.3],
        [12.2, 9.2], [11, 8.5], [10, 9.2], [8.5, 9.2], [7.5, 8.2]
      ]}},
      { type: T_GREEN, shape: { kind: 'polygon', points: [
        [8.4, 7.1], [9.9, 5.3], [12, 4.7], [14, 5.4], [14.9, 6.8], [14.7, 8.2],
        [13.7, 8.8], [12.2, 8.7], [11.2, 8.1], [10.2, 8.6], [9, 8.5], [8.2, 7.8]
      ]}},
      // Front-greenside bunker blocking a bump-and-run.
      { type: T_SAND, shape: { kind: 'polygon', points: [
        [9.5, 8.8], [11, 9], [12.5, 9], [12.8, 9.8], [11, 10.3], [9.5, 9.8]
      ]}},
      { type: T_SAND, shape: { kind: 'circle', cx: 15.5, cy: 6, r: 0.9 }},
      { type: T_TEE, shape: { kind: 'rect', x: 10.2, y: 27.6, w: 1.6, h: 1.0 }},
    ],
    trees: [
      { x: 0.8, y: 3 }, { x: 3, y: 2.5 }, { x: 5.5, y: 2.5 }, { x: 8, y: 2 },
      { x: 14, y: 2 }, { x: 16.5, y: 2.5 }, { x: 19, y: 2.5 }, { x: 21, y: 3 },
      { x: 0.5, y: 9 }, { x: 0.5, y: 16 }, { x: 0.5, y: 22 }, { x: 0.5, y: 28 },
      { x: 21, y: 9 }, { x: 21, y: 16 }, { x: 21, y: 22 }, { x: 21, y: 28 },
      // Heavy tree line on the left — punishes the pull.
      { x: 3, y: 10 }, { x: 3, y: 14 }, { x: 3, y: 18 }, { x: 3, y: 22 }, { x: 3, y: 25 },
      { x: 18.5, y: 10 }, { x: 18.5, y: 16 }, { x: 18.5, y: 22 }, { x: 18.5, y: 26 },
      { x: 4, y: 31 }, { x: 7, y: 31 }, { x: 11, y: 31 }, { x: 15, y: 31 }, { x: 18, y: 31 },
    ],
  },
];

function rotateShape90CCW(shape, H) {
  if (shape.kind === 'polygon') {
    return { kind: 'polygon', points: shape.points.map(([x, y]) => [H - y, x]) };
  }
  if (shape.kind === 'circle') {
    return { kind: 'circle', cx: H - shape.cy, cy: shape.cx, r: shape.r };
  }
  if (shape.kind === 'annulus') {
    return { kind: 'annulus', cx: H - shape.cy, cy: shape.cx, inner: shape.inner, outer: shape.outer };
  }
  if (shape.kind === 'rect') {
    return { kind: 'rect', x: H - shape.y - shape.h, y: shape.x, w: shape.h, h: shape.w };
  }
  return shape;
}

function rotateHole90CCW(h) {
  const H = h.height;
  return {
    name: h.name,
    par: h.par,
    width: h.height,
    height: h.width,
    tee: { x: H - h.tee.y, y: h.tee.x },
    flag: { x: H - h.flag.y, y: h.flag.x },
    greenSlope: { angle: h.greenSlope.angle + Math.PI / 2, mag: h.greenSlope.mag },
    surfaces: h.surfaces.map((s) => ({
      type: s.type,
      shape: rotateShape90CCW(s.shape, H),
      slope: s.slope ? { angle: s.slope.angle + Math.PI / 2, mag: s.slope.mag } : undefined,
    })),
    trees: h.trees.map((t) => ({ x: H - t.y, y: t.x })),
  };
}

// Pad each hole's tile dimensions by 30% so the camera has rough margin to
// pan into past the designed playfield — matches the main game's WORLD
// inflation. Course features stay anchored to the original layout coords.
// Course playfield is 1.8× larger than the designed hole dimensions so
// there's a generous rough/OOB buffer on every side of the green, tee,
// and fairway. Course features get centered in the padded world via
// the shift helpers below, so the margin sits on ALL sides (not just
// the right + bottom like the 1.3× pad did).
const WORLD_PAD_FACTOR = 1.8;

let ORIENTATION = 'portrait';
let MAP_W = Math.ceil(HOLES[0].width * WORLD_PAD_FACTOR);
let MAP_H = Math.ceil(HOLES[0].height * WORLD_PAD_FACTOR);
let WORLD_W = MAP_W * TILE;
let WORLD_H = MAP_H * TILE;
let SURFACES = null;
let TREES = null;
let FLAG = null;
let TEE = null;
let GREEN_SLOPE = null;
let BUSHES = null;
let PROPS = null;
let WATER_PIXELS = null;
let CURRENT_HOLE = null;
// v0.75 clubhouse / range / putting world extras. Populated by the
// matching loadClubhouse() / loadRange() / loadPutting() functions
// and consumed by the tick + render loops when gameModeRef.current is
// set to 'clubhouse' | 'range' | 'putting'. Round mode leaves these
// empty so the existing draw paths see [].
let BUILDING = null;            // { x, y, w, h } in tile units, or null
let SIGNS = [];                 // [{ id, x, y, label, target, dir }]
let NPCS = [];                  // see Clubhouse.js npcs[] schema
let DISTANCE_MARKERS = [];      // [50, 100, 150, ...] yards (range mode)
let PRACTICE_CUPS = [];         // [{ x, y }] extra holes (putting mode)
let WORLD_KIND = 'round';       // 'round' | 'clubhouse' | 'range' | 'putting'

// Shift every coordinate-bearing field on a surface shape by (dx, dy)
// tile units. Used by loadHole to CENTER each hole's original features
// inside the padded WORLD, so the OOB buffer sits equally on all sides.
function shiftShape(shape, dx, dy) {
  const s = { ...shape };
  if (s.kind === 'circle' || s.kind === 'annulus') {
    s.cx = (s.cx || 0) + dx;
    s.cy = (s.cy || 0) + dy;
  } else if (s.kind === 'rect') {
    s.x = (s.x || 0) + dx;
    s.y = (s.y || 0) + dy;
  } else if (s.kind === 'polygon') {
    s.points = s.points.map(([x, y]) => [x + dx, y + dy]);
  }
  return s;
}

function addBbox(surf) {
  const s = Object.assign({}, surf.shape);
  if (s.kind === 'circle') {
    s._bbox = [(s.cx - s.r) * TILE, (s.cy - s.r) * TILE, (s.cx + s.r) * TILE, (s.cy + s.r) * TILE];
  } else if (s.kind === 'annulus') {
    s._bbox = [(s.cx - s.outer) * TILE, (s.cy - s.outer) * TILE, (s.cx + s.outer) * TILE, (s.cy + s.outer) * TILE];
  } else if (s.kind === 'rect') {
    s._bbox = [s.x * TILE, s.y * TILE, (s.x + s.w) * TILE, (s.y + s.h) * TILE];
  } else if (s.kind === 'polygon') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of s.points) {
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    s._bbox = [x0 * TILE, y0 * TILE, x1 * TILE, y1 * TILE];
  }
  const out = { type: surf.type, shape: s };
  if (surf.slope) out.slope = surf.slope;
  return out;
}

function pointInShape(x, y, shape) {
  const bb = shape._bbox;
  if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) return false;
  if (shape.kind === 'circle') {
    const dx = x - shape.cx * TILE, dy = y - shape.cy * TILE;
    return dx * dx + dy * dy <= (shape.r * TILE) * (shape.r * TILE);
  }
  if (shape.kind === 'annulus') {
    const dx = x - shape.cx * TILE, dy = y - shape.cy * TILE;
    const d2 = dx * dx + dy * dy;
    const ro = shape.outer * TILE, ri = shape.inner * TILE;
    return d2 <= ro * ro && d2 >= ri * ri;
  }
  if (shape.kind === 'rect') return true;
  if (shape.kind === 'polygon') {
    let inside = false;
    const pts = shape.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0] * TILE, yi = pts[i][1] * TILE;
      const xj = pts[j][0] * TILE, yj = pts[j][1] * TILE;
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return false;
}

function surfaceAtPixel(x, y) {
  for (let i = SURFACES.length - 1; i >= 0; i--) {
    if (pointInShape(x, y, SURFACES[i].shape)) return SURFACES[i].type;
  }
  return T_ROUGH;
}

function surfaceAt(wx, wy) { return surfaceAtPixel(wx, wy); }

const COLORS = {
  skyVoid: '#0b1a10',
  shadow: 'rgba(0,0,0,0.3)',
  trunkDark: '#3f2610', trunk: '#5a3a1a', trunkHi: '#7d5428',
  tree0: '#163016', tree1: '#224a22', tree2: '#2e6b2e',
  tree3: '#3f8c3f', tree4: '#5db35d', tree5: '#8ed88e',
  bushShadow: '#1e4a1e',
  skin: '#f1b884', skinShadow: '#d49864',
  hat: '#c83030', hatDark: '#8a1e1e', hatHi: '#ea5a5a', hatBand: '#161616',
  shirt: '#2b70b7', shirtDark: '#1a4c88', shirtHi: '#4e95d8',
  pants: '#222f4a', pantsDark: '#121a2c',
  shoe: '#141414', shoeHi: '#3a3a3a',
  flagRed: '#e33838', flagDark: '#a82222', flagHi: '#ff6060', flagYellow: '#fbe043',
  pole: '#efe9cc', poleDark: '#a8a280',
  cup: '#141414',
  ballShadow: '#c9c9c9', ballWhite: '#ffffff',
  flowerRed: '#e94343', flowerYellow: '#fbe043', flowerWhite: '#ffffff',
  flowerStem: '#2d6a24', flowerCenter: '#fbe043',
  pebble: '#7e7966', pebbleHi: '#a9a38d',
  roughC: '#24571c', roughD: '#52a640',
};
// Leaves pull from the tree canopy palette so the flurry reads as
// foliage matching the trees they fell from.
const LEAF_COLORS = ['#224a22', '#2e6b2e', '#3f8c3f', '#5db35d', '#8ed88e', '#6a8f3a'];

const SURFACE_BASE = {
  [T_ROUGH]:   { r: 60,  g: 126, b: 47,  amp: 38, warmth: -3 },
  [T_FAIRWAY]: { r: 94,  g: 174, b: 58,  amp: 24, warmth: 0 },
  [T_GREEN]:   { r: 131, g: 207, b: 82,  amp: 18, warmth: 4 },
  [T_FRINGE]:  { r: 109, g: 184, b: 71,  amp: 22, warmth: 2 },
  [T_TEE]:     { r: 111, g: 192, b: 69,  amp: 20, warmth: 3 },
  [T_SAND]:    { r: 236, g: 214, b: 160, amp: 32, warmth: 10 },
  [T_SHORE]:   { r: 157, g: 121, b: 70,  amp: 42, warmth: 8 },
};

function pixelColor(x, y, type) {
  if (type === T_WATER) {
    let r = 75, g = 155, b = 217;
    const n = fbm(x, y);
    const shift = (n - 0.5) * 26;
    r += shift * 0.6; g += shift * 0.7; b += shift;
    const j = y % 4;
    const row = (y / 4) | 0;
    const startX = (row & 1) === 0 ? 1 : 5;
    const rel = ((x - startX) % 12 + 12) % 12;
    if (j === 2 && rel < 5) { r -= 28; g -= 32; b -= 18; }
    else if (j === 0 && rel >= 7 && rel < 10) { r -= 20; g -= 24; b -= 14; }
    if (hRand(x, y, 40) > 0.985) { r += 60; g += 45; b += 25; }
    return [clamp255(r), clamp255(g), clamp255(b)];
  }

  const base = SURFACE_BASE[type] || SURFACE_BASE[T_ROUGH];
  let r = base.r, g = base.g, b = base.b;

  const n = fbm(x, y);
  const shift = (n - 0.5) * base.amp;
  r += shift;
  g += shift * 1.08;
  b += shift * 0.75;

  const fine = (hRand(x, y, 5) - 0.5) * 6;
  r += fine; g += fine * 1.1; b += fine * 0.8;

  if (type === T_FAIRWAY) {
    const tx = (x / TILE) | 0;
    const ty = (y / TILE) | 0;
    const horiz = ((tx + ty) & 1) === 0;
    if (horiz && x % 3 === 0) { r -= 8; g -= 10; b -= 7; }
    else if (!horiz && y % 3 === 0) { r -= 8; g -= 10; b -= 7; }
  } else if (type === T_GREEN) {
    if (y % 2 === 0) { r -= 6; g -= 8; b -= 5; }
  } else if (type === T_FRINGE) {
    if (y % 2 === 0) { r -= 7; g -= 9; b -= 6; }
    if ((x + y) % 4 === 0) { r -= 4; g -= 5; b -= 3; }
  } else if (type === T_TEE) {
    if ((x + y) % 3 === 0) { r -= 8; g -= 10; b -= 7; }
  } else if (type === T_SAND) {
    const dot = hRand(x, y, 30);
    if (dot > 0.86) { r -= 22; g -= 18; b -= 12; }
    else if (dot > 0.98) { r += 12; g += 10; b += 6; }
  } else if (type === T_SHORE) {
    const dot = hRand(x, y, 35);
    if (dot > 0.88) { r -= 18; g -= 14; b -= 8; }
    else if (dot > 0.975) { r += 18; g += 14; b += 8; }
  }

  if (type === T_ROUGH || type === T_FAIRWAY || type === T_GREEN || type === T_FRINGE || type === T_TEE) {
    if (hRand(x, y, 55) > 0.985) { r -= 24; g -= 28; b -= 18; }
    if (hRand(x, y, 65) > 0.992) { r += 24; g += 30; b += 16; }
  }

  r += base.warmth * 0.3;
  b -= base.warmth * 0.2;

  return [clamp255(r), clamp255(g), clamp255(b)];
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

function buildWorldImageData() {
  const data = new Uint8ClampedArray(WORLD_W * WORLD_H * 4);
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const type = surfaceAtPixel(x + 0.5, y + 0.5);
      const rgb = pixelColor(x, y, type);
      const i = (y * WORLD_W + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }
  }
  return new ImageData(data, WORLD_W, WORLD_H);
}

function computeWaterPixels() {
  const out = [];
  for (let y = 0; y < WORLD_H; y += 2) {
    for (let x = 0; x < WORLD_W; x += 2) {
      if (surfaceAtPixel(x + 0.5, y + 0.5) === T_WATER) out.push([x, y]);
    }
  }
  return out;
}

// v0.72 rebalance — all carries scaled to the target:
//   50 PWR + 50 TCH + 50 club distance → 250 yd driver
//   95 PWR + 95 TCH + 100 club distance → 400 yd driver
// Paired with tightened multiplier exponents below (max product
// 1.27×, was 1.39×). Putter v untouched — putt physics is linear.
const CLUBS = [
  { key: 'DR', name: 'Driver',      short: 'DR', v: 209, angle: 20, accMult: 1.25, powerRate: 1.2 },
  { key: '3W', name: '3-Wood',      short: '3W', v: 190, angle: 24, accMult: 1.15, powerRate: 1.2 },
  { key: '5W', name: '5-Wood',      short: '5W', v: 176, angle: 28, accMult: 1.08, powerRate: 1.2 },
  { key: '5I', name: '5-Iron',      short: '5I', v: 158, angle: 33, accMult: 1.0, powerRate: 1.2 },
  { key: '7I', name: '7-Iron',      short: '7I', v: 137, angle: 39, accMult: 0.95, powerRate: 1.25 },
  { key: '9I', name: '9-Iron',      short: '9I', v: 119, angle: 45, accMult: 0.9, powerRate: 1.3 },
  { key: 'PW', name: 'Pitch Wedge', short: 'PW', v: 104, angle: 51, accMult: 0.85, powerRate: 1.35 },
  { key: 'SW', name: 'Sand Wedge',  short: 'SW', v: 89,  angle: 58, accMult: 0.8, powerRate: 1.4 },
  { key: 'PT', name: 'Putter',      short: 'PT', v: 110, angle: 0,  accMult: 0.55, powerRate: 0.55 },
];

// Mirrors the main game (App.js v3.40). Each profile scales carry distance
// (via v0Final) and apex (via the launch angle / vz factor in launchBall).
const SHOT_TYPE_PROFILES = {
  normal:  { carry: 1.0,  apex: 1.0,  label: 'Normal' },
  chip:    { carry: 0.5,  apex: 0.7,  label: 'Chip' },
  flop:    { carry: 0.33, apex: 2.0,  label: 'Flop' },
  stinger: { carry: 1.0,  apex: 0.5,  label: 'Stinger' },
  bump:    { carry: 0.75, apex: 0.4,  label: 'Bump & Run' },
  // Putter-only. 'tap' rolls a short putt; 'blast' charges past the cup.
  tap:     { carry: 0.5,  apex: 1.0,  label: 'Tap' },
  blast:   { carry: 1.5,  apex: 1.0,  label: 'Blast' },
};

const WEDGE_KEYS_GS = new Set(['LW', 'SW', 'PW']); // GS only ships SW + PW
const clubIsWedgeGS = (club) => !!club && WEDGE_KEYS_GS.has(club.key);
const clubIsIronOrWoodGS = (club) => !!club && club.key !== 'PT' && !WEDGE_KEYS_GS.has(club.key);
// GS surface labels live in SURFACE_PROPS.label — Stinger needs a clean lie.
const STINGER_GOOD_LIES = new Set(['Tee Box', 'Fairway', 'Fringe']);
const shotTypeEligibleGS = (type, club, lieLabel) => {
  if (!club) return type === 'normal';
  // Putter gets its own shortlist: Normal, Tap (50%), Blast (150%).
  if (club.key === 'PT') return type === 'normal' || type === 'tap' || type === 'blast';
  // Non-putters can't tap/blast — those are putter-exclusive.
  if (type === 'tap' || type === 'blast') return false;
  if (type === 'normal') return true;
  if (type === 'chip')   return true;
  if (type === 'flop')   return clubIsWedgeGS(club);
  if (type === 'bump')   return clubIsWedgeGS(club);
  if (type === 'stinger') return clubIsIronOrWoodGS(club) && STINGER_GOOD_LIES.has(lieLabel);
  return false;
};

// powerPenalty[min..max] caps the fraction of the launch velocity you keep
// when hitting from the surface (mirrors the main game's lie model).
// swingSensitivity amplifies the swing-deviation → curve mapping, so bad
// lies widen the miss cone. Bounce/roll numbers are main's rebalanced
// low-bounce set.
const SURFACE_PROPS = {
  // powerPenalty halved vs. GS ≤ v0.33 — each endpoint moved halfway
  // to 1.0 (e.g. Rough 0.835 → 0.9175, Bunker 0.55 → 0.775) so lie
  // distance loss is roughly half of what it was before.
  [T_GREEN]:   { bounceKeep: 0.20, rollDecel: 0.85, label: 'Green',   slopeAng: 0, slopeMag: 0, powerPenalty: [1.0, 1.0],    swingSensitivity: 1.0 },
  [T_FAIRWAY]: { bounceKeep: 0.28, rollDecel: 0.78, label: 'Fairway',                           powerPenalty: [0.975, 0.99],  swingSensitivity: 1.0 },
  [T_ROUGH]:   { bounceKeep: 0.15, rollDecel: 2.9,  label: 'Rough',                             powerPenalty: [0.9175, 0.9625], swingSensitivity: 1.25 },
  [T_FRINGE]:  { bounceKeep: 0.22, rollDecel: 1.05, label: 'Fringe',                            powerPenalty: [0.965, 0.985], swingSensitivity: 1.05 },
  [T_TEE]:     { bounceKeep: 0.26, rollDecel: 0.82, label: 'Tee Box',                           powerPenalty: [1.0, 1.0],    swingSensitivity: 1.0 },
  [T_SAND]:    { bounceKeep: 0.05, rollDecel: 5.5,  label: 'Bunker',                            powerPenalty: [0.775, 0.85], swingSensitivity: 1.6 },
  [T_SHORE]:   { bounceKeep: 0.12, rollDecel: 3.8,  label: 'Dirt',                              powerPenalty: [0.85, 0.91],  swingSensitivity: 1.35 },
  [T_WATER]:   { bounceKeep: 0, rollDecel: 0,       label: 'Water',  hazard: true,              powerPenalty: [1.0, 1.0],    swingSensitivity: 1.0 },
};

function surfacePropsAt(wx, wy) {
  if (wx < 0 || wx > WORLD_W || wy < 0 || wy > WORLD_H) {
    return { bounceKeep: 0, rollDecel: 0, label: 'Out of Bounds', ob: true };
  }
  // Walk the surface stack top-down so the topmost shape wins. Pick up
  // any region-specific slope from that same surface so the ball
  // physics feels the localised grade (hills on the fairway etc.),
  // not just the per-type default.
  let type = T_ROUGH;
  let regionSlope = null;
  for (let i = SURFACES.length - 1; i >= 0; i--) {
    if (pointInShape(wx, wy, SURFACES[i].shape)) {
      type = SURFACES[i].type;
      regionSlope = SURFACES[i].slope || null;
      break;
    }
  }
  const base = SURFACE_PROPS[type] || SURFACE_PROPS[T_ROUGH];
  if (regionSlope) {
    return { ...base, slopeAng: regionSlope.angle, slopeMag: regionSlope.mag };
  }
  return base;
}

function computeBushes() {
  const out = [];
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const cx = (tx + 0.5) * TILE;
      const cy = (ty + 0.5) * TILE;
      if (surfaceAtPixel(cx, cy) !== T_ROUGH) continue;
      if (hRand(tx, ty, 800) < 0.90) continue;
      const px = tx * TILE + Math.floor(hRand(tx, ty, 801) * (TILE - 4)) + 2;
      const py = ty * TILE + Math.floor(hRand(tx, ty, 802) * (TILE - 4)) + 2;
      let tooClose = false;
      for (const tr of TREES) {
        if (Math.hypot(tr.x * TILE - px, tr.y * TILE - py) < 18) { tooClose = true; break; }
      }
      if (!tooClose) out.push({ x: px / TILE, y: py / TILE, variant: Math.floor(hRand(tx, ty, 803) * 3) });
    }
  }
  return out;
}

function computeProps() {
  const out = [];
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const cx = (tx + 0.5) * TILE;
      const cy = (ty + 0.5) * TILE;
      const type = surfaceAtPixel(cx, cy);
      if (type === T_ROUGH) {
        const tufts = Math.floor(hRand(tx, ty, 500) * 3);
        for (let i = 0; i < tufts; i++) {
          const px = tx * TILE + Math.floor(hRand(tx, ty, 501 + i) * (TILE - 2)) + 1;
          const py = ty * TILE + Math.floor(hRand(tx, ty, 520 + i) * (TILE - 2)) + 1;
          if (surfaceAtPixel(px, py) === T_ROUGH) out.push({ kind: 'tuft', x: px, y: py });
        }
        if (hRand(tx, ty, 550) > 0.86) {
          const px = tx * TILE + Math.floor(hRand(tx, ty, 551) * (TILE - 2)) + 1;
          const py = ty * TILE + Math.floor(hRand(tx, ty, 552) * (TILE - 2)) + 1;
          if (surfaceAtPixel(px, py) === T_ROUGH) {
            const c = hRand(tx, ty, 553);
            out.push({ kind: 'flower', x: px, y: py, color: c < 0.4 ? 'red' : c < 0.7 ? 'yellow' : 'white' });
          }
        }
        if (hRand(tx, ty, 570) > 0.95) {
          const px = tx * TILE + Math.floor(hRand(tx, ty, 571) * (TILE - 2)) + 1;
          const py = ty * TILE + Math.floor(hRand(tx, ty, 572) * (TILE - 2)) + 1;
          if (surfaceAtPixel(px, py) === T_ROUGH) out.push({ kind: 'pebble', x: px, y: py });
        }
      } else if (type === T_FAIRWAY) {
        if (hRand(tx, ty, 600) > 0.94) {
          const px = tx * TILE + Math.floor(hRand(tx, ty, 601) * (TILE - 2)) + 1;
          const py = ty * TILE + Math.floor(hRand(tx, ty, 602) * (TILE - 2)) + 1;
          if (surfaceAtPixel(px, py) === T_FAIRWAY) out.push({ kind: 'daisy', x: px, y: py });
        }
      } else if (type === T_SHORE) {
        if (hRand(tx, ty, 650) > 0.7) {
          const px = tx * TILE + Math.floor(hRand(tx, ty, 651) * (TILE - 2)) + 1;
          const py = ty * TILE + Math.floor(hRand(tx, ty, 652) * (TILE - 2)) + 1;
          if (surfaceAtPixel(px, py) === T_SHORE) out.push({ kind: 'pebble', x: px, y: py });
        }
      }
    }
  }
  return out;
}

function loadHole(idx, orientation) {
  const baseIdx = ((idx % HOLES.length) + HOLES.length) % HOLES.length;
  const base = HOLES[baseIdx];
  ORIENTATION = orientation || ORIENTATION || 'portrait';
  const h = ORIENTATION === 'landscape' ? rotateHole90CCW(base) : base;
  MAP_W = Math.ceil(h.width * WORLD_PAD_FACTOR);
  MAP_H = Math.ceil(h.height * WORLD_PAD_FACTOR);
  WORLD_W = MAP_W * TILE;
  WORLD_H = MAP_H * TILE;
  // Center the designed hole inside the padded map so margin sits on
  // every side, not just right+bottom.
  const padDx = Math.floor((MAP_W - h.width) / 2);
  const padDy = Math.floor((MAP_H - h.height) / 2);
  CURRENT_HOLE = { ...h, idxBase: baseIdx, padDx, padDy };
  SURFACES = h.surfaces.map((surf) => addBbox({
    type: surf.type,
    shape: shiftShape(surf.shape, padDx, padDy),
    slope: surf.slope || null,
  }));
  TREES = (h.trees || []).map((t) => {
    // Deterministic 5-bucket variant hash — 20% palm, 20% pine, 60% leafy.
    const hash = ((t.x * 73.3 + t.y * 31.7) | 0);
    const mod = ((hash % 5) + 5) % 5;
    const variant = mod === 0 ? 'palm' : mod === 1 ? 'pine' : 'leafy';
    return { ...t, x: t.x + padDx, y: t.y + padDy, variant };
  });
  FLAG = { ...h.flag, x: h.flag.x + padDx, y: h.flag.y + padDy };
  TEE = { ...h.tee, x: h.tee.x + padDx, y: h.tee.y + padDy };
  GREEN_SLOPE = h.greenSlope;
  SURFACE_PROPS[T_GREEN].slopeAng = GREEN_SLOPE.angle;
  SURFACE_PROPS[T_GREEN].slopeMag = GREEN_SLOPE.mag;
  WATER_PIXELS = computeWaterPixels();
  BUSHES = computeBushes();
  PROPS = computeProps();
  // Round mode — clear clubhouse-only entities so the renderer skips them.
  WORLD_KIND = 'round';
  BUILDING = null;
  SIGNS = [];
  NPCS = [];
  DISTANCE_MARKERS = [];
  PRACTICE_CUPS = [];
  return h;
}

// v0.75 — load any of the bespoke "non-round" worlds (clubhouse, range,
// putting). Mirrors loadHole's contract (rewrites the same module-scope
// globals) so the existing renderer + camera + physics keep working.
// Differences:
//   • No WORLD_PAD_FACTOR padding — these worlds are sized as authored.
//   • TREES is empty and FLAG/CURRENT_HOLE are stubbed for the renderer.
//   • Clubhouse extras (BUILDING, SIGNS, NPCS) populate from the def.
const T_CONSTANTS = {
  ROUGH: 0, FAIRWAY: 1, GREEN: 2, SAND: 3, WATER: 4,
  FRINGE: 5, TEE: 6, SHORE: 7,
};

function loadNonRoundWorld(def, kind, orientation) {
  ORIENTATION = orientation || ORIENTATION || 'portrait';
  MAP_W = def.width;
  MAP_H = def.height;
  WORLD_W = MAP_W * TILE;
  WORLD_H = MAP_H * TILE;
  CURRENT_HOLE = { name: def.id.toUpperCase(), par: 0, padDx: 0, padDy: 0, idxBase: -1 };
  SURFACES = (def.surfaces || []).map((surf) => addBbox({
    type: translateSurfaceType(surf.type, T_CONSTANTS),
    shape: shiftShape(surf.shape, 0, 0),
    slope: surf.slope || null,
  }));
  TREES = [];
  FLAG = def.flag ? { x: def.flag.x, y: def.flag.y } : { x: def.tee.x, y: def.tee.y };
  TEE = { x: def.tee.x, y: def.tee.y };
  GREEN_SLOPE = def.greenSlope || { angle: 0, mag: 0 };
  SURFACE_PROPS[T_GREEN].slopeAng = GREEN_SLOPE.angle;
  SURFACE_PROPS[T_GREEN].slopeMag = GREEN_SLOPE.mag;
  WATER_PIXELS = computeWaterPixels();
  BUSHES = computeBushes();
  PROPS = computeProps();
  WORLD_KIND = kind;
  BUILDING = def.building || null;
  SIGNS = (def.signs || []).map((s) => ({ ...s }));
  NPCS = (def.npcs || []).map((n) => ({ ...n, walkPhase: 0, idleT: 0, dir: 1 }));
  DISTANCE_MARKERS = def.distanceMarkers || [];
  PRACTICE_CUPS = def.cups || [];
  return def;
}

function loadClubhouse(orientation) { return loadNonRoundWorld(CLUBHOUSE_WORLD, 'clubhouse', orientation); }
function loadRange(orientation)     { return loadNonRoundWorld(RANGE_WORLD,     'range',     orientation); }
function loadPutting(orientation)   { return loadNonRoundWorld(PUTTING_WORLD,   'putting',   orientation); }

loadHole(0, 'portrait');

function drawProp(ctx, p) {
  if (p.kind === 'tuft') {
    ctx.fillStyle = COLORS.roughC;
    ctx.fillRect(p.x, p.y, 1, 2);
    ctx.fillRect(p.x + 1, p.y - 1, 1, 2);
    ctx.fillRect(p.x - 1, p.y, 1, 1);
    ctx.fillStyle = COLORS.roughD;
    ctx.fillRect(p.x, p.y - 1, 1, 1);
  } else if (p.kind === 'flower') {
    ctx.fillStyle = COLORS.flowerStem;
    ctx.fillRect(p.x, p.y, 1, 2);
    const petal = p.color === 'red' ? COLORS.flowerRed : p.color === 'yellow' ? COLORS.flowerYellow : COLORS.flowerWhite;
    ctx.fillStyle = petal;
    ctx.fillRect(p.x - 1, p.y - 1, 1, 1);
    ctx.fillRect(p.x + 1, p.y - 1, 1, 1);
    ctx.fillRect(p.x, p.y - 2, 1, 1);
    ctx.fillStyle = COLORS.flowerCenter;
    ctx.fillRect(p.x, p.y - 1, 1, 1);
  } else if (p.kind === 'daisy') {
    ctx.fillStyle = COLORS.flowerWhite;
    ctx.fillRect(p.x, p.y, 1, 1);
    ctx.fillStyle = COLORS.flowerCenter;
    ctx.fillRect(p.x, p.y - 1, 1, 1);
  } else if (p.kind === 'pebble') {
    ctx.fillStyle = COLORS.pebble;
    ctx.fillRect(p.x, p.y, 2, 1);
    ctx.fillStyle = COLORS.pebbleHi;
    ctx.fillRect(p.x, p.y, 1, 1);
  }
}

function drawBush(ctx, px, py, variant, time, windStrength) {
  const x = Math.floor(px), y = Math.floor(py);
  const seed = (x * 0.31 + y * 0.67);
  const sway = Math.sin(time * 0.0024 + seed) * windStrength * 0.8;
  const sF = Math.floor(sway);
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath(); ctx.ellipse(x, y + 1, 5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.bushShadow;
  ctx.beginPath(); ctx.ellipse(x + sF * 0.4, y - 1, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree1;
  ctx.beginPath(); ctx.ellipse(x + sF * 0.6, y - 2, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree2;
  ctx.beginPath(); ctx.ellipse(x - 1 + sF, y - 3, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.tree3;
  ctx.fillRect(x - 2 + sF, y - 4, 2, 1);
  ctx.fillRect(x + sF, y - 4, 1, 1);
  if (variant === 1) {
    ctx.fillStyle = COLORS.flowerRed;
    ctx.fillRect(x + sF - 1, y - 3, 1, 1);
    ctx.fillRect(x + sF + 1, y - 2, 1, 1);
  } else if (variant === 2) {
    ctx.fillStyle = COLORS.flowerYellow;
    ctx.fillRect(x + sF, y - 4, 1, 1);
    ctx.fillRect(x + sF - 2, y - 3, 1, 1);
  }
}

// Pixel-art trees — three silhouettes dispatched by tree.variant.
// Scaled ~2.1× vs. the pre-v0.40 sprite so they read as distinct
// props at 1.0× game zoom. Canopy base overlaps the trunk top so
// there's no visible gap between crown and stem.
function drawTreeShadow(ctx, x, y) {
  // Chunky stepped ellipse — 28×8 footprint, anchored just below
  // the trunk base. Pixel-style (no smooth curves) matches the rest
  // of the sprite art.
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(x - 5, y + 1, 11, 1);
  ctx.fillRect(x - 9, y + 2, 19, 1);
  ctx.fillRect(x - 12, y + 3, 25, 2);
  ctx.fillRect(x - 9, y + 5, 19, 1);
  ctx.fillRect(x - 5, y + 6, 11, 1);
}

function drawLeafyCanopy(ctx, x, y, sF) {
  const cx = x + sF;
  // Darkest base layer — spans the full silhouette. Canopy bottom
  // overlaps the trunk top (trunk ends at y-14; canopy bottom at y-13).
  ctx.fillStyle = COLORS.tree0;
  ctx.fillRect(cx - 13, y - 19, 26, 6);
  ctx.fillRect(cx - 15, y - 25, 30, 6);
  ctx.fillRect(cx - 13, y - 31, 26, 6);
  ctx.fillRect(cx - 10, y - 35, 20, 4);
  ctx.fillRect(cx - 6,  y - 38, 12, 3);
  ctx.fillRect(cx - 3,  y - 40, 6,  2);
  // Mid green — main body.
  ctx.fillStyle = COLORS.tree1;
  ctx.fillRect(cx - 11, y - 19, 22, 4);
  ctx.fillRect(cx - 13, y - 23, 23, 6);
  ctx.fillRect(cx - 11, y - 29, 20, 4);
  ctx.fillRect(cx - 8,  y - 33, 14, 3);
  ctx.fillRect(cx - 4,  y - 37, 8,  2);
  // Light layer (upper-left lit side).
  ctx.fillStyle = COLORS.tree2;
  ctx.fillRect(cx - 10, y - 20, 6, 2);
  ctx.fillRect(cx - 12, y - 24, 6, 3);
  ctx.fillRect(cx - 10, y - 29, 4, 2);
  ctx.fillRect(cx - 7,  y - 32, 3, 2);
  ctx.fillRect(cx - 4,  y - 36, 2, 1);
  // Brighter highlights.
  ctx.fillStyle = COLORS.tree3;
  ctx.fillRect(cx - 9, y - 22, 4, 1);
  ctx.fillRect(cx - 11, y - 26, 3, 2);
  ctx.fillRect(cx - 9, y - 30, 2, 1);
  ctx.fillRect(cx - 5, y - 34, 3, 1);
  ctx.fillRect(cx - 2, y - 37, 2, 1);
  // Brightest pixel dots — rim light on the crown.
  ctx.fillStyle = COLORS.tree4;
  ctx.fillRect(cx - 9, y - 27, 1, 1);
  ctx.fillRect(cx - 7, y - 32, 1, 1);
  ctx.fillRect(cx - 3, y - 36, 1, 1);
  ctx.fillRect(cx,     y - 39, 1, 1);
  ctx.fillStyle = COLORS.tree5;
  ctx.fillRect(cx - 1, y - 40, 2, 1);
  // Dark dots on the shaded (far) side for foliage texture.
  ctx.fillStyle = COLORS.tree0;
  ctx.fillRect(cx + 7,  y - 21, 2, 1);
  ctx.fillRect(cx + 10, y - 24, 2, 1);
  ctx.fillRect(cx + 9,  y - 28, 1, 1);
  ctx.fillRect(cx + 7,  y - 32, 2, 1);
  ctx.fillRect(cx + 4,  y - 36, 1, 1);
  // Individual leaf clumps — tiny 1×1 mid-green dots scattered across
  // the crown to break up big fills.
  ctx.fillStyle = COLORS.tree2;
  ctx.fillRect(cx - 13, y - 22, 1, 1);
  ctx.fillRect(cx + 11, y - 22, 1, 1);
  ctx.fillRect(cx - 14, y - 26, 1, 1);
  ctx.fillRect(cx + 12, y - 27, 1, 1);
  ctx.fillRect(cx - 11, y - 33, 1, 1);
  ctx.fillRect(cx + 9,  y - 34, 1, 1);
}

function drawPalmCanopy(ctx, x, y, sF) {
  // Palm has a taller trunk (drawn separately in drawTree) so the
  // fronds sit higher up. Eight splayed fronds in dark + light
  // tones with a small coconut cluster at the crown.
  const fx = x + sF;
  const cy = y - 28; // crown centre
  // Dark base fronds — wide sweep.
  ctx.fillStyle = COLORS.tree1;
  // Left swept frond.
  ctx.fillRect(fx - 13, cy + 3, 4, 1);
  ctx.fillRect(fx - 11, cy + 2, 6, 1);
  ctx.fillRect(fx - 9,  cy + 1, 6, 1);
  ctx.fillRect(fx - 7,  cy,     5, 1);
  // Right swept frond.
  ctx.fillRect(fx + 9,  cy + 3, 4, 1);
  ctx.fillRect(fx + 5,  cy + 2, 6, 1);
  ctx.fillRect(fx + 3,  cy + 1, 6, 1);
  ctx.fillRect(fx + 2,  cy,     5, 1);
  // Upper-left frond.
  ctx.fillRect(fx - 10, cy - 4, 3, 1);
  ctx.fillRect(fx - 8,  cy - 3, 5, 1);
  ctx.fillRect(fx - 6,  cy - 2, 5, 1);
  ctx.fillRect(fx - 4,  cy - 1, 4, 1);
  // Upper-right frond.
  ctx.fillRect(fx + 7,  cy - 4, 3, 1);
  ctx.fillRect(fx + 3,  cy - 3, 5, 1);
  ctx.fillRect(fx + 1,  cy - 2, 5, 1);
  ctx.fillRect(fx,      cy - 1, 4, 1);
  // Central vertical fronds (up).
  ctx.fillRect(fx - 2, cy - 7, 4, 2);
  ctx.fillRect(fx - 1, cy - 9, 2, 2);
  // Drooping side fronds (down-left / down-right).
  ctx.fillRect(fx - 9, cy + 5, 4, 1);
  ctx.fillRect(fx - 7, cy + 6, 3, 1);
  ctx.fillRect(fx + 5, cy + 5, 4, 1);
  ctx.fillRect(fx + 4, cy + 6, 3, 1);
  // Mid green on the upper sides — adds dimension.
  ctx.fillStyle = COLORS.tree2;
  ctx.fillRect(fx - 9,  cy - 2, 3, 1);
  ctx.fillRect(fx + 6,  cy - 2, 3, 1);
  ctx.fillRect(fx - 11, cy + 1, 2, 1);
  ctx.fillRect(fx + 9,  cy + 1, 2, 1);
  ctx.fillRect(fx - 1,  cy - 6, 2, 1);
  // Highlights along frond tops.
  ctx.fillStyle = COLORS.tree3;
  ctx.fillRect(fx - 13, cy + 2, 2, 1);
  ctx.fillRect(fx + 11, cy + 2, 2, 1);
  ctx.fillRect(fx - 10, cy - 3, 2, 1);
  ctx.fillRect(fx + 8,  cy - 3, 2, 1);
  ctx.fillRect(fx - 1,  cy - 10, 2, 1);
  // Coconut cluster — three dark balls under the crown.
  ctx.fillStyle = COLORS.trunkDark;
  ctx.fillRect(fx - 2, cy + 2, 2, 2);
  ctx.fillRect(fx + 1, cy + 2, 2, 2);
  ctx.fillStyle = COLORS.trunkHi;
  ctx.fillRect(fx - 2, cy + 2, 1, 1);
  ctx.fillRect(fx + 1, cy + 2, 1, 1);
}

function drawPineCanopy(ctx, x, y, sF) {
  const cx = x + sF;
  // Stacked triangles — overlaps the trunk top at y-14.
  ctx.fillStyle = COLORS.tree0;
  ctx.fillRect(cx - 11, y - 17, 22, 5);
  ctx.fillRect(cx - 9,  y - 22, 18, 5);
  ctx.fillRect(cx - 7,  y - 27, 14, 5);
  ctx.fillRect(cx - 5,  y - 32, 10, 5);
  ctx.fillRect(cx - 3,  y - 37, 6,  5);
  ctx.fillRect(cx - 1,  y - 40, 2,  3);
  // Mid green — main body of needles.
  ctx.fillStyle = COLORS.tree1;
  ctx.fillRect(cx - 9, y - 17, 17, 3);
  ctx.fillRect(cx - 7, y - 21, 14, 4);
  ctx.fillRect(cx - 5, y - 26, 10, 3);
  ctx.fillRect(cx - 3, y - 31, 6,  3);
  ctx.fillRect(cx - 1, y - 36, 3,  2);
  // Bright highlights on the lit (west) side — catch the light.
  ctx.fillStyle = COLORS.tree3;
  ctx.fillRect(cx - 11, y - 17, 1, 1);
  ctx.fillRect(cx - 10, y - 19, 1, 1);
  ctx.fillRect(cx - 9,  y - 22, 1, 1);
  ctx.fillRect(cx - 8,  y - 24, 1, 1);
  ctx.fillRect(cx - 7,  y - 27, 1, 1);
  ctx.fillRect(cx - 6,  y - 29, 1, 1);
  ctx.fillRect(cx - 5,  y - 32, 1, 1);
  ctx.fillRect(cx - 4,  y - 34, 1, 1);
  ctx.fillRect(cx - 3,  y - 37, 1, 1);
  ctx.fillRect(cx - 2,  y - 39, 1, 1);
  ctx.fillRect(cx - 1,  y - 41, 1, 1);
  // Edge shadow on the far side.
  ctx.fillStyle = COLORS.tree0;
  ctx.fillRect(cx + 7,  y - 17, 3, 1);
  ctx.fillRect(cx + 6,  y - 22, 2, 1);
  ctx.fillRect(cx + 4,  y - 27, 2, 1);
  ctx.fillRect(cx + 3,  y - 32, 1, 1);
  // Needle texture dots across the body.
  ctx.fillStyle = COLORS.tree2;
  ctx.fillRect(cx - 6, y - 18, 1, 1);
  ctx.fillRect(cx + 3, y - 19, 1, 1);
  ctx.fillRect(cx - 4, y - 23, 1, 1);
  ctx.fillRect(cx + 2, y - 24, 1, 1);
  ctx.fillRect(cx - 2, y - 28, 1, 1);
  ctx.fillRect(cx + 1, y - 33, 1, 1);
}

function drawTree(ctx, px, py, time, windStrength, variant) {
  const x = Math.floor(px), y = Math.floor(py);
  const seed = (x * 0.29 + y * 0.71);
  const sway = Math.sin(time * 0.0018 + seed) * windStrength * 1.4;
  const sF = Math.floor(sway);
  // Pixel shadow — size held at ~28×8 footprint.
  drawTreeShadow(ctx, x + 1, y - 1);
  // Trunk — palms get a tall slender banded trunk; leafy and pine
  // share a stocky two-tone trunk with a simple bark highlight.
  if (variant === 'palm') {
    // 22 px tall slender trunk.
    ctx.fillStyle = COLORS.trunkDark;
    ctx.fillRect(x - 2, y - 22, 5, 22);
    ctx.fillStyle = COLORS.trunk;
    ctx.fillRect(x - 2, y - 22, 4, 22);
    ctx.fillStyle = COLORS.trunkHi;
    ctx.fillRect(x - 2, y - 21, 1, 19);
    // Bark bands.
    ctx.fillStyle = COLORS.trunkDark;
    for (let i = 3; i < 22; i += 4) ctx.fillRect(x - 2, y - i, 5, 1);
  } else {
    // 14 px stocky trunk.
    ctx.fillStyle = COLORS.trunkDark;
    ctx.fillRect(x - 3, y - 14, 7, 14);
    ctx.fillStyle = COLORS.trunk;
    ctx.fillRect(x - 3, y - 14, 5, 14);
    ctx.fillStyle = COLORS.trunkHi;
    ctx.fillRect(x - 3, y - 13, 1, 12);
    // Bark ridges — small dark flecks for texture.
    ctx.fillStyle = COLORS.trunkDark;
    ctx.fillRect(x - 2, y - 11, 1, 1);
    ctx.fillRect(x,     y - 9,  1, 1);
    ctx.fillRect(x - 1, y - 6,  1, 1);
    ctx.fillRect(x + 1, y - 4,  1, 1);
  }
  if (variant === 'palm') drawPalmCanopy(ctx, x, y, sF);
  else if (variant === 'pine') drawPineCanopy(ctx, x, y, sF);
  else drawLeafyCanopy(ctx, x, y, sF);
}

// 3D-ish cup: ground shadow, dark pit with a subtle elliptical taper,
// a lighter inner rim on the "near" side to read as depth, and a
// white rim highlight on the far side for lift.
function drawCup(ctx, px, py) {
  const x = Math.floor(px), y = Math.floor(py);
  // Dark pit (the hole itself), elongated vertically for a top-down-ish 3D look.
  ctx.fillStyle = '#050807';
  ctx.beginPath(); ctx.ellipse(x, y, 3.2, 2.0, 0, 0, Math.PI * 2); ctx.fill();
  // Inner rim on the NEAR (south) side — slightly lighter so it reads as a lip.
  ctx.fillStyle = '#13201a';
  ctx.beginPath(); ctx.ellipse(x, y + 0.4, 3.0, 1.4, 0, 0, Math.PI, false); ctx.fill();
  // Rim highlight on the FAR (north) side — light, thin.
  ctx.strokeStyle = 'rgba(236,242,214,0.6)';
  ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.ellipse(x, y - 0.3, 3.05, 1.75, 0, Math.PI, Math.PI * 2); ctx.stroke();
  // Turf ring around the lip so the hole sits into the grass instead of floating.
  ctx.strokeStyle = 'rgba(52, 82, 40, 0.8)';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.ellipse(x, y, 3.3, 2.05, 0, 0, Math.PI * 2); ctx.stroke();
}

function drawFlag(ctx, px, py, time, { showPole = true } = {}) {
  const x = Math.floor(px), y = Math.floor(py);
  drawCup(ctx, x, y);
  if (!showPole) return;
  // When the ball has just pinged the pin, bend the top of the pole
  // back and forth on a decaying sine for ~0.6 s. sx varies with
  // height (base fixed at 0, tip offset by ±2 px at peak).
  const shakeT = pinShake.t;
  const shakeAmp = shakeT < 0.6
    ? Math.sin(shakeT * 42) * Math.max(0, 1 - shakeT / 0.6) * pinShake.intensity
    : 0;
  const tipDx = Math.round(shakeAmp * 2);
  // Pole: 2-column flagstick with a light/dark shade for round feel,
  // plus a gold finial at the very top. Each row is offset by shake
  // fraction of tipDx so the pole curves from the base.
  for (let row = 0; row < 17; row++) {
    const rowDx = Math.round(tipDx * ((17 - row) / 17));
    ctx.fillStyle = COLORS.poleDark;
    ctx.fillRect(x + 1 + rowDx, y - 17 + row, 1, 1);
    ctx.fillStyle = COLORS.pole;
    ctx.fillRect(x + rowDx, y - 17 + row, 1, 1);
  }
  // Bright highlight on the sun side of the pole — shifted along the
  // same curve so the shake reads cleanly.
  ctx.fillStyle = 'rgba(255,246,216,0.55)';
  for (let row = 0; row < 10; row++) {
    const rowDx = Math.round(tipDx * ((14 - row) / 17));
    ctx.fillRect(x + rowDx, y - 14 + row, 1, 1);
  }
  // Gold finial (ball) at the very top — sits at the shaken tip.
  ctx.fillStyle = COLORS.flagYellow;
  ctx.beginPath(); ctx.arc(x + 0.5 + tipDx, y - 17.5, 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x + 1 + tipDx, y - 17, 1, 1);
  // Flag cloth — triangular with a gentle wave, two colour bands + a
  // darker lower stripe for depth. Anchored to the shaken tip.
  const wave = Math.sin(time * 0.004);
  const wave2 = Math.sin(time * 0.004 + 0.6);
  const flapX = x + 2 + tipDx;
  const flapY = y - 17;
  // Main flag body.
  ctx.fillStyle = COLORS.flagRed;
  ctx.beginPath();
  ctx.moveTo(flapX, flapY);
  ctx.lineTo(flapX + 9, flapY + 1 + wave * 0.5);
  ctx.lineTo(flapX + 9, flapY + 3 + wave);
  ctx.lineTo(flapX, flapY + 5);
  ctx.closePath();
  ctx.fill();
  // Middle band — slightly lighter for depth.
  ctx.fillStyle = COLORS.flagHi;
  ctx.beginPath();
  ctx.moveTo(flapX, flapY + 0.8);
  ctx.lineTo(flapX + 8, flapY + 1.6 + wave2 * 0.4);
  ctx.lineTo(flapX + 8, flapY + 2.6 + wave2 * 0.4);
  ctx.lineTo(flapX, flapY + 2.3);
  ctx.closePath();
  ctx.fill();
  // Dark lower stripe (wave into shadow).
  ctx.fillStyle = COLORS.flagDark;
  ctx.beginPath();
  ctx.moveTo(flapX, flapY + 3.4);
  ctx.lineTo(flapX + 7, flapY + 3.3 + wave * 0.7);
  ctx.lineTo(flapX + 7.5, flapY + 4.1 + wave);
  ctx.lineTo(flapX, flapY + 5);
  ctx.closePath();
  ctx.fill();
  // Stitch at the hoist (left edge of flag).
  ctx.fillStyle = 'rgba(255,246,216,0.55)';
  ctx.fillRect(flapX, flapY, 1, 5);
  // Tiny yellow pennant detail at the tip.
  ctx.fillStyle = COLORS.flagYellow;
  ctx.fillRect(flapX + 7, flapY + 2, 1, 1);
}

// Map a club key to a silhouette category so drawClub can render the
// right shaft length + head shape.
// Address pose for a right-handed golfer. Given the ball and the aim
// angle (radians, 0 = north, π/2 = east — matches sw.aimAngle), return
// the sprite position + facing cardinal + the aim vector itself so the
// swing animation can swing toward the target regardless of hole
// orientation.
//
// Stance rule: body faces the target. Ball sits on the golfer's RIGHT
// side, so the golfer is on the LEFT side of the ball. In screen
// coords (y-down), the "right" direction relative to target T is the
// CW-rotated vector (-Ty, Tx), so the golfer offset from the ball is
// the opposite: (Ty, -Tx) (≈ LEFT of target).
function addressPose(ball, aimAngle) {
  const tx = Math.sin(aimAngle);
  const ty = -Math.cos(aimAngle);
  // Right direction relative to target (CW rotation in screen space).
  const rx = -ty;
  const ry = tx;
  const stanceOffset = 7;
  const px = ball.x - rx * stanceOffset;
  const py = ball.y - ry * stanceOffset;
  // Pick nearest cardinal for sprite facing.
  const ax = Math.abs(tx), ay = Math.abs(ty);
  let facing;
  if (ax > ay) facing = tx > 0 ? 'E' : 'W';
  else facing = ty > 0 ? 'S' : 'N';
  return { px, py, facing, tx, ty, rx, ry };
}

function clubCategoryFor(clubKey) {
  if (clubKey === 'PT') return 'putter';
  if (clubKey === 'PW' || clubKey === 'SW' || clubKey === 'LW' || clubKey === 'GW') return 'wedge';
  if (clubKey === 'DR' || clubKey === '3W' || clubKey === '5W' || clubKey === '7W') return 'wood';
  return 'iron';
}

// Swing-arc angle in screen-degrees, where 0° = east (ball direction),
// −90° = north (up the screen, behind golfer's head), 90° = south
// (down-screen, follow-through side). Address sits slightly below east;
// full backswing rotates up-and-back; forward swing sweeps back → impact
// → follow-through finish.
function swingAngleDeg(info) {
  if (!info || info.phase === 'address') return 15;
  if (info.phase === 'back') {
    const p = Math.max(0, Math.min(1, info.power || 0));
    return 15 - p * 115; // 15° → −100°
  }
  if (info.phase === 'forward') {
    const t = Math.max(0, Math.min(1, info.forwardT || 0));
    if (t < 0.45) return -100 + (t / 0.45) * 115; // back → impact (15°)
    return 15 + ((t - 0.45) / 0.55) * 100;        // impact → finish (115°)
  }
  return 15;
}

// Draws the equipped club coming out of the golfer's right hand. Colors
// match the rest of the GS palette so the club reads as part of the
// sprite, not a dev overlay.
function drawClub(ctx, hx, hy, angleDeg, category) {
  const len = category === 'putter' ? 8 : category === 'wedge' ? 10 : category === 'iron' ? 11 : 13;
  const rad = (angleDeg * Math.PI) / 180;
  const ex = hx + Math.cos(rad) * len;
  const ey = hy + Math.sin(rad) * len;
  // Shaft
  ctx.strokeStyle = '#cfd0d3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  // Head
  const perp = rad + Math.PI / 2;
  if (category === 'putter') {
    ctx.strokeStyle = '#9a9fa7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(perp) * 2, ey + Math.sin(perp) * 2);
    ctx.lineTo(ex - Math.cos(perp) * 2, ey - Math.sin(perp) * 2);
    ctx.stroke();
  } else if (category === 'wood') {
    ctx.fillStyle = '#1b2025';
    ctx.beginPath();
    ctx.arc(ex, ey, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = 0.75;
    ctx.stroke();
  } else {
    // Iron + wedge: thin angled blade, wedge a touch wider.
    ctx.strokeStyle = category === 'wedge' ? '#8b9096' : '#6b7078';
    ctx.lineWidth = 1.5;
    const w = category === 'wedge' ? 3 : 2.2;
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(perp) * w, ey + Math.sin(perp) * w);
    ctx.lineTo(ex - Math.cos(perp) * w, ey - Math.sin(perp) * w);
    ctx.stroke();
  }
}

function drawGolfer(ctx, px, py, facing, phase, swingInfo) {
  const x = Math.floor(px), y = Math.floor(py);
  const moving = phase !== null;
  const step = moving ? (Math.sin(phase) > 0 ? 1 : 0) : 0;
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath(); ctx.ellipse(x, y, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  const lfX = x - 3 + (moving && step ? -1 : 0);
  const rfX = x + 1 + (moving && !step ? 1 : 0);
  ctx.fillStyle = COLORS.shoe;
  ctx.fillRect(lfX, y - 1, 2, 1);
  ctx.fillRect(rfX, y - 1, 2, 1);
  ctx.fillStyle = COLORS.shoeHi;
  ctx.fillRect(lfX, y - 1, 1, 1);
  ctx.fillRect(rfX, y - 1, 1, 1);
  ctx.fillStyle = COLORS.pants;
  ctx.fillRect(x - 3, y - 4, 2, 3);
  ctx.fillRect(x + 1, y - 4, 2, 3);
  ctx.fillStyle = COLORS.pantsDark;
  ctx.fillRect(x - 3, y - 4, 1, 3);
  ctx.fillRect(x + 2, y - 4, 1, 3);
  ctx.fillStyle = COLORS.pants;
  ctx.fillRect(x - 3, y - 8, 6, 4);
  ctx.fillStyle = COLORS.pantsDark;
  ctx.fillRect(x - 3, y - 8, 6, 1);
  ctx.fillStyle = COLORS.shirt;
  ctx.fillRect(x - 4, y - 14, 8, 6);
  ctx.fillStyle = COLORS.shirtDark;
  ctx.fillRect(x - 4, y - 9, 8, 1);
  ctx.fillStyle = COLORS.shirtHi;
  ctx.fillRect(x - 4, y - 14, 8, 1);
  ctx.fillStyle = COLORS.shirt;
  ctx.fillRect(x - 5, y - 13, 1, 3);
  ctx.fillRect(x + 4, y - 13, 1, 3);
  ctx.fillStyle = COLORS.skin;
  ctx.fillRect(x - 5, y - 10, 1, 2);
  ctx.fillRect(x + 4, y - 10, 1, 2);
  ctx.fillStyle = COLORS.skinShadow;
  ctx.fillRect(x - 1, y - 15, 3, 1);
  ctx.fillStyle = COLORS.skin;
  ctx.fillRect(x - 3, y - 19, 6, 4);
  ctx.fillStyle = COLORS.skinShadow;
  ctx.fillRect(x + 2, y - 19, 1, 4);
  ctx.fillRect(x - 3, y - 16, 6, 1);
  ctx.fillStyle = COLORS.hat;
  ctx.fillRect(x - 4, y - 21, 8, 2);
  ctx.fillRect(x - 3, y - 22, 6, 1);
  ctx.fillStyle = COLORS.hatHi;
  ctx.fillRect(x - 3, y - 22, 3, 1);
  ctx.fillStyle = COLORS.hatDark;
  ctx.fillRect(x - 4, y - 19, 8, 1);
  ctx.fillRect(x + 3, y - 21, 1, 2);
  ctx.fillStyle = COLORS.hatBand;
  ctx.fillRect(x - 4, y - 20, 8, 1);
  // === Detail pass — Golf-Story-style features visible even at close
  // zoom. Adds eyes / brim shadow / ear / belt / shirt buttons so the
  // sprite reads as a character rather than a colored pixel stack.
  // Hat brim shadow along the forehead — thin dark line under the hat.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(x - 3, y - 18, 6, 1);
  // Belt (between shirt and pants) — helps separate the blocks.
  ctx.fillStyle = '#1a2a1e';
  ctx.fillRect(x - 3, y - 8, 6, 1);
  // Belt buckle centered.
  ctx.fillStyle = COLORS.hatBand;
  ctx.fillRect(x - 0.5, y - 8, 1, 1);
  if (facing === 'S') {
    // Eyes — small dark cup-color dots, one per eye.
    ctx.fillStyle = COLORS.cup;
    ctx.fillRect(x - 2, y - 17, 1, 1);
    ctx.fillRect(x + 1, y - 17, 1, 1);
    // Mouth — 1px on the jaw.
    ctx.fillStyle = '#a83030';
    ctx.fillRect(x, y - 15, 1, 1);
    // Shirt buttons — small darker dots down the center.
    ctx.fillStyle = COLORS.shirtDark;
    ctx.fillRect(x, y - 12, 1, 1);
    ctx.fillRect(x, y - 10, 1, 1);
  } else if (facing === 'E') {
    // Side-view eye + ear.
    ctx.fillStyle = COLORS.cup;
    ctx.fillRect(x + 1, y - 17, 1, 1);
    ctx.fillStyle = COLORS.skinShadow;
    ctx.fillRect(x - 3, y - 17, 1, 1);
    // Shoulder seam hint — 1px dark on the right sleeve.
    ctx.fillStyle = COLORS.shirtDark;
    ctx.fillRect(x + 3, y - 13, 1, 2);
  } else if (facing === 'W') {
    ctx.fillStyle = COLORS.cup;
    ctx.fillRect(x - 2, y - 17, 1, 1);
    ctx.fillStyle = COLORS.skinShadow;
    ctx.fillRect(x + 2, y - 17, 1, 1);
    ctx.fillStyle = COLORS.shirtDark;
    ctx.fillRect(x - 4, y - 13, 1, 2);
  } else if (facing === 'N') {
    // Back of head — hair detail only, no face.
    ctx.fillStyle = COLORS.hatDark;
    ctx.fillRect(x - 2, y - 18, 5, 1);
  }
  // Hat brim highlight (always) — bright edge along the front of the hat.
  ctx.fillStyle = 'rgba(255,246,216,0.35)';
  ctx.fillRect(x - 3, y - 19, 6, 1);
  // Club overlay — only when facing east (the address pose) so the club
  // doesn't stick out through the body on other facings.
  if (swingInfo && facing === 'E') {
    const hx = x + 4, hy = y - 9;
    drawClub(ctx, hx, hy, swingAngleDeg(swingInfo), swingInfo.clubCategory || 'iron');
  }
}

// v0.75 — clubhouse building. A chunky pixel structure with a peaked
// roof, two windows, and a doorway facing south. Drawn at the bbox
// passed in (already in canvas pixels). The footprint shadow sits a
// few pixels south for grounding.
function drawClubhouseBuilding(ctx, x, y, w, h, label) {
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 2, y + h - 2, w - 4, 4);
  // Wall body
  ctx.fillStyle = '#7a4a2e';
  ctx.fillRect(x, y + 8, w, h - 8);
  // Wall darker stripe at base
  ctx.fillStyle = '#5a3520';
  ctx.fillRect(x, y + h - 4, w, 4);
  // Roof — triangular pixel approximation. Two trapezoidal bands.
  ctx.fillStyle = '#3a1a0e';
  for (let i = 0; i < 8; i++) {
    const inset = i * 2;
    if (inset >= w / 2) break;
    ctx.fillRect(x + inset, y + i, w - inset * 2, 1);
  }
  ctx.fillStyle = '#5a2a16';
  ctx.fillRect(x + 2, y + 8, w - 4, 1);
  // Windows — two square panels.
  const winY = y + 14;
  const winH = 6;
  const winW = 6;
  const winS = (w - winW * 2) / 3;
  ctx.fillStyle = '#1a1a0e';
  ctx.fillRect(x + winS, winY, winW, winH);
  ctx.fillRect(x + winS * 2 + winW, winY, winW, winH);
  ctx.fillStyle = '#fbe043';
  ctx.fillRect(x + winS + 1, winY + 1, 2, 2);
  ctx.fillRect(x + winS + winW - 3, winY + winH - 3, 2, 2);
  ctx.fillRect(x + winS * 2 + winW + 1, winY + 1, 2, 2);
  ctx.fillRect(x + winS * 2 + winW * 2 - 3, winY + winH - 3, 2, 2);
  // Door — centered, opens south.
  const doorW = 8;
  const doorH = 12;
  const doorX = x + (w - doorW) / 2;
  const doorY = y + h - doorH;
  ctx.fillStyle = '#241008';
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.fillStyle = '#fbe043';
  ctx.fillRect(doorX + doorW - 2, doorY + doorH / 2, 1, 2); // doorknob
  // Sign placard above door
  ctx.fillStyle = '#0e1a12';
  ctx.fillRect(x + w / 2 - 18, y + 7, 36, 4);
  ctx.fillStyle = '#fbe043';
  ctx.font = '4px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label || 'CLUBHOUSE', x + w / 2, y + 9);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// Sign post — wooden plank with yellow lettering pointing in `dir`.
// Renders a small post + a horizontal placard that sticks out in the
// pointing direction so the player can tell which way it sends them.
function drawSign(ctx, x, y, label, dir) {
  // Post (vertical 2×8 brown stake)
  ctx.fillStyle = '#3a1a0e';
  ctx.fillRect(x - 1, y - 8, 2, 8);
  ctx.fillStyle = '#5a2a16';
  ctx.fillRect(x, y - 8, 1, 8);
  // Placard — horizontal yellow board
  const plW = Math.max(28, label.length * 4 + 6);
  const plH = 8;
  let plX, plY = y - 16;
  const arrow = dir === 'E' ? '→' : dir === 'W' ? '←' : dir === 'S' ? '↓' : '↑';
  if (dir === 'W') plX = x - plW + 2;
  else if (dir === 'E') plX = x - 2;
  else plX = x - plW / 2;
  // Plank body
  ctx.fillStyle = '#fbe043';
  ctx.fillRect(plX, plY, plW, plH);
  ctx.fillStyle = '#caa427';
  ctx.fillRect(plX, plY + plH - 1, plW, 1);
  ctx.fillRect(plX, plY, 1, plH);
  // Text
  ctx.fillStyle = '#0e1a12';
  ctx.font = 'bold 5px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${label} ${arrow}`, plX + plW / 2, plY + plH / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// Tiny dark dot for a putting practice cup — the "real" flag/cup is
// already drawn elsewhere; this just marks the supplementary holes.
function drawPracticeCup(ctx, x, y) {
  ctx.fillStyle = '#0e1a12';
  ctx.fillRect(x - 2, y - 1, 4, 2);
  ctx.fillRect(x - 1, y - 2, 2, 4);
  ctx.fillStyle = '#3a4a3a';
  ctx.fillRect(x - 1, y - 1, 1, 1);
}

// Range distance markers — short faint horizontal lines spaced
// every 50yd north of the tee, with a small numeric label on the
// right. Painted on the fairway so the player can read carry.
function drawRangeMarkers(ctx, yards, tee) {
  if (!tee) return;
  const teePxY = tee.y * TILE;
  const yardsToPx = TILE / 10; // 10 yd per tile (YARDS_PER_TILE = 10)
  for (const yd of yards) {
    const yPx = teePxY - yd * yardsToPx;
    if (yPx < 4) continue;
    ctx.fillStyle = 'rgba(14, 26, 18, 0.35)';
    ctx.fillRect(4 * TILE, yPx, 16 * TILE, 1);
    ctx.font = 'bold 6px ui-monospace, monospace';
    ctx.fillStyle = '#fff6d8';
    ctx.fillText(`${yd}YD`, 4 * TILE + 2, yPx - 2);
  }
}

// Floating name tag above an NPC — drawn after sprites so it sits on
// top. Yellow on dark band so it pops against any surface.
function drawNpcLabel(ctx, x, y, name) {
  if (!name) return;
  const w = name.length * 3 + 6;
  ctx.fillStyle = 'rgba(14, 26, 18, 0.85)';
  ctx.fillRect(x - w / 2, y - 22, w, 7);
  ctx.font = 'bold 5px ui-monospace, monospace';
  ctx.fillStyle = '#fbe043';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x, y - 18);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawBall(ctx, px, py, z) {
  const lift = Math.max(0, z | 0);
  const x = Math.floor(px), y = Math.floor(py);
  // Drop shadow — small subtle puck when the ball is grounded, then
  // grows up to ~1.7× the ball sprite and fades as altitude rises
  // (real penumbra widens and softens with caster height).
  if (lift === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 0.5, 1.0, 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const t = Math.min(1, lift / 35);
    const rx = 1.5 + t * 1.05;    // 1.5 → 2.55 radius (3 → 5.1 wide)
    const ry = 1.3 + t * 0.9;     // 1.3 → 2.2  radius (2.6 → 4.4 tall)
    const alpha = 0.55 - t * 0.3; // 0.55 → 0.25
    ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y + 0.5, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Ball body — 3×3 (50% larger than the previous 2×2 sprite).
  ctx.fillStyle = COLORS.ballShadow;
  ctx.fillRect(x - 1, y - 3 - lift, 3, 3);
  ctx.fillStyle = COLORS.ballWhite;
  ctx.fillRect(x - 1, y - 3 - lift, 2, 1);
  ctx.fillRect(x - 1, y - 3 - lift, 1, 2);
}

function drawBallDropping(ctx, px, py, t) {
  const x = Math.floor(px), y = Math.floor(py);
  const u = Math.max(0, Math.min(1, t));
  ctx.save();
  ctx.globalAlpha = 1 - u * 0.9;
  const size = Math.max(1, Math.round(2 - u * 1.5));
  ctx.fillStyle = COLORS.ballWhite;
  ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = `rgba(255,255,255,${(1 - u) * 0.5})`;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(x, y, 1 + u * 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLeaf(ctx, leaf, time) {
  const x = Math.floor(leaf.x), y = Math.floor(leaf.y);
  const wob = Math.sin(time * 0.01 + leaf.phase);
  ctx.fillStyle = leaf.color;
  if (wob > 0) {
    ctx.fillRect(x, y, 2, 1);
    ctx.fillRect(x, y + 1, 1, 1);
  } else {
    ctx.fillRect(x, y, 1, 2);
    ctx.fillRect(x + 1, y, 1, 1);
  }
}

function drawWaterSparkles(ctx, time) {
  const phase = time * 0.0016;
  ctx.fillStyle = '#a8d6f0';
  for (let i = 0; i < WATER_PIXELS.length; i++) {
    const [wx, wy] = WATER_PIXELS[i];
    const s = Math.sin(phase + wx * 0.09 + wy * 0.06);
    if (s > 0.85) ctx.fillRect(wx, wy, 1, 1);
  }
  ctx.fillStyle = '#2b6fab';
  for (let i = 0; i < WATER_PIXELS.length; i += 3) {
    const [wx, wy] = WATER_PIXELS[i];
    const s = Math.sin(phase * 1.3 + wx * 0.05 + wy * 0.08);
    if (s > 0.88) ctx.fillRect(wx + 1, wy, 1, 1);
  }
}

function shotParams(club, power, spinY, accuracyOffset) {
  const v0Raw = club.v * power;
  const launchMod = 1 - spinY * 0.32;
  const effAngleDeg = club.angle * Math.max(0.35, launchMod);
  // A "high" shot trades carry for apex: energy goes vertical, so
  // v0 dips as spinY goes negative. Scaled down for high-angle clubs
  // (wedges already launch near 45°, so adding more angle past that
  // loses range even without a penalty, and the penalty would over-
  // whiff). Flat-faced clubs feel the hit hardest.
  //   DR / 3W / 5W / 5I / 7I (≤ 39°):  k = 1 + spinY · 0.18  → 0.82 at BIG HIGH
  //   9I / PW / SW       (> 39°):      k = 1 + spinY · 0.08  → 0.92 at BIG HIGH
  // Positive spinY (LOW / stinger) keeps full v0 — the flatter launch
  // angle already cuts carry on a sub-45° club, no extra penalty.
  const highBite = club.angle <= 39 ? 0.18 : 0.08;
  const highPenalty = spinY < 0 ? (1 + spinY * highBite) : 1;
  const v0 = v0Raw * highPenalty;
  const angleRad = (effAngleDeg * Math.PI) / 180;
  const curveDeg = accuracyOffset * 18 * club.accMult;
  return { v0, angleRad, effAngleDeg, curveDeg };
}

const MAGNUS_MAX = 38;

function simulateFlight(startX, startY, aimAngle, accuracy, power, spinX, spinY, club, windX, windY, stopAtGround, shotType = 'normal') {
  const { v0, angleRad, curveDeg } = shotParams(club, power, spinY, accuracy);
  const prof = SHOT_TYPE_PROFILES[shotType] || SHOT_TYPE_PROFILES.normal;
  const v0Typed = v0 * prof.carry;
  const deflectionRad = (curveDeg * Math.PI) / 180;
  const dir = aimAngle + deflectionRad;
  const cosAng = club.angle === 0 ? 1 : Math.cos(angleRad);
  let vx = v0Typed * cosAng * Math.sin(dir);
  let vy = v0Typed * cosAng * -Math.cos(dir);
  // Apex modifier — flop balloons, stinger/bump run low.
  let vz = club.angle === 0 ? 0 : v0Typed * Math.sin(angleRad) * prof.apex;
  let x = startX, y = startY, z = 0;
  const stepDt = 0.04;
  const maxSteps = 220;
  const points = [];
  for (let s = 0; s < maxSteps; s++) {
    const hf = Math.min(1, z / 15);
    vx += windX * hf * stepDt;
    vy += windY * hf * stepDt;
    if (spinX && hf > 0.08) {
      const hSpeed = Math.hypot(vx, vy);
      if (hSpeed > 5) {
        const perpX = -vy / hSpeed;
        const perpY = vx / hSpeed;
        const mag = spinX * MAGNUS_MAX * hf;
        vx += perpX * mag * stepDt;
        vy += perpY * mag * stepDt;
      }
    }
    vz -= GRAVITY * stepDt;
    const d = 0.1 * stepDt;
    vx *= 1 - d;
    vy *= 1 - d;
    vz *= 1 - d * 0.5;
    x += vx * stepDt;
    y += vy * stepDt;
    z += vz * stepDt;
    points.push({ x, y, z });
    if (stopAtGround && z <= 0 && s > 1) break;
  }
  return points;
}

function simulatePutt(startX, startY, aimAngle, accuracy, power, club, spinX, shotType = 'normal') {
  // Putter profiles: 'tap' 50%, 'blast' 150%. Other putter types fall back
  // to 1.0. Applied BEFORE the physics loop so the roll decays from the
  // adjusted launch speed.
  const prof = SHOT_TYPE_PROFILES[shotType] || SHOT_TYPE_PROFILES.normal;
  const v0 = club.v * power * prof.carry;
  const curveDeg = (accuracy + spinX * 0.4) * 18 * club.accMult;
  const dir = aimAngle + (curveDeg * Math.PI) / 180;
  let vx = v0 * Math.sin(dir);
  let vy = v0 * -Math.cos(dir);
  let x = startX, y = startY;
  const stepDt = 0.04;
  const points = [];
  for (let s = 0; s < 250; s++) {
    if (x < 0 || x > WORLD_W || y < 0 || y > WORLD_H) break;
    const sp = surfacePropsAt(x, y);
    if (sp.hazard || sp.ob) break;
    if (sp.slopeMag) {
      // v0.72 — 2× the slope acceleration so pitches actually push
      // the ball around (players reported "not noticing it").
      vx += Math.sin(sp.slopeAng) * sp.slopeMag * 2 * stepDt;
      vy += -Math.cos(sp.slopeAng) * sp.slopeMag * 2 * stepDt;
    }
    const speed = Math.hypot(vx, vy);
    if (speed < 4) break;
    const decel = (sp.rollDecel || 1.0) * 40 * stepDt;
    const factor = Math.max(0, 1 - decel / Math.max(speed, 0.01));
    vx *= factor;
    vy *= factor;
    x += vx * stepDt;
    y += vy * stepDt;
    points.push({ x, y, z: 0 });
  }
  return points;
}

function drawShotPredict(ctx, points) {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,246,216,0.35)';
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y - points[0].z);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y - points[i].z);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,246,216,0.85)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y - points[0].z);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y - points[i].z);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y - points[0].z);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y - points[i].z);
  ctx.stroke();

  const last = points[points.length - 1];
  const lx = Math.floor(last.x), ly = Math.floor(last.y);
  ctx.fillStyle = '#e33838';
  ctx.fillRect(lx - 3, ly, 7, 1);
  ctx.fillRect(lx, ly - 3, 1, 7);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(lx - 1, ly - 1, 3, 3);
  ctx.fillStyle = '#e33838';
  ctx.fillRect(lx, ly, 1, 1);
  ctx.restore();
}

function drawFlightTrail(ctx, trail) {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < trail.length; i++) {
    const p0 = trail[i - 1], p1 = trail[i];
    const a = (i / trail.length);
    ctx.strokeStyle = `rgba(255,246,216,${(a * 0.42).toFixed(3)})`;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y - p0.z);
    ctx.lineTo(p1.x, p1.y - p1.z);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${(a * 0.8).toFixed(3)})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y - p0.z);
    ctx.lineTo(p1.x, p1.y - p1.z);
    ctx.stroke();
  }
  ctx.restore();
}

function computeCarry(club, power) {
  const v = club.v * power;
  const angleRad = (club.angle * Math.PI) / 180;
  if (club.angle === 0) return v * 0.9;
  return Math.max(0, (v * v * Math.sin(2 * angleRad)) / GRAVITY);
}

// Pick the smallest non-putter club whose full-power carry either
// reaches the pin or lands no more than 20 yd short. If nothing
// reaches that threshold, fall back to the longest-carrying club.
function pickClubForDistance(distYd, onGreen) {
  if (onGreen) return CLUBS.length - 1;
  const minAcceptable = distYd - 20;
  const carries = [];
  for (let i = 0; i < CLUBS.length - 1; i++) {
    const carryPx = computeCarry(CLUBS[i], 1.0);
    carries.push({ idx: i, carryYd: (carryPx / TILE) * YARDS_PER_TILE });
  }
  carries.sort((a, b) => a.carryYd - b.carryYd);
  for (const c of carries) {
    if (c.carryYd >= minAcceptable) return c.idx;
  }
  return carries[carries.length - 1].idx;
}

// Character + club + lie-aware launch. opts carries in the selected golfer's
// derived multipliers (powerFactor/touchFactor/forgivenessFactor/
// recoveryFactor/windResist), the equipped club's stats (distance/accuracy/
// forgiveness), and the surface properties at the ball's current spot
// (powerPenalty + swingSensitivity). When no opts are provided the function
// behaves exactly like the pre-character-stats version.
function launchBall(b, aimAngle, power, accuracyOffset, spinX, spinY, club, opts = {}) {
  // Free-escape bookkeeping: if the ball starts inside a tree canopy,
  // remember that tree so stepBall skips its collision until the shot
  // has physically cleared.
  escapeTree.x = null;
  escapeTree.y = null;
  if (typeof TREES !== 'undefined' && TREES && TREES.length) {
    for (const t of TREES) {
      const tx = t.x * TILE, ty = t.y * TILE;
      const dx = b.x - tx, dy = b.y - ty;
      if (dx * dx + dy * dy < TREE_CANOPY_R * TREE_CANOPY_R) {
        escapeTree.x = tx;
        escapeTree.y = ty;
        break;
      }
    }
  }
  const {
    golferFactors = { powerFactor: 1, touchFactor: 1, forgivenessFactor: 1, recoveryFactor: 1, windResist: 1 },
    clubStats = {},
    liePhys = null,
    shotType = 'normal',
  } = opts;
  // Shot type: scales carry (via v0Final) and apex (via vz at launch).
  // Eligibility is enforced at strike time so an invalid combo silently
  // falls back to normal instead of producing weird results.
  const activeShotType = shotTypeEligibleGS(shotType, club, liePhys?.label) ? shotType : 'normal';
  const shotProfile = SHOT_TYPE_PROFILES[activeShotType] || SHOT_TYPE_PROFILES.normal;
  const { v0, angleRad, curveDeg } = shotParams(club, power, spinY, accuracyOffset);
  const cm = clubStatMultipliers(clubStats);
  const lp = liePhys?.powerPenalty || [1.0, 1.0];
  const liePowerRoll = lp[0] + Math.random() * (lp[1] - lp[0]);
  const badLie = liePhys?.label === 'Rough' || liePhys?.label === 'Bunker' || liePhys?.label === 'Dirt';
  const recoveryDistBoost = badLie ? (2 - golferFactors.recoveryFactor) : 1;
  const v0Final = v0
    * golferFactors.powerFactor
    * golferFactors.touchFactor
    * cm.distanceFactor
    * liePowerRoll
    * recoveryDistBoost
    * shotProfile.carry;
  // Curve amplification: bad lies widen the miss, skilled golfers (low
  // forgivenessFactor) tighten it, high-forgiveness clubs tighten it.
  const lieCurveAmp = liePhys?.swingSensitivity ?? 1;
  const curveAmp = lieCurveAmp
    * golferFactors.forgivenessFactor
    * (badLie ? golferFactors.recoveryFactor : 1)
    * cm.clubCurveFactor;
  const adjustedCurveDeg = curveDeg * curveAmp;
  const deflectionRad = (adjustedCurveDeg * Math.PI) / 180;
  const effectiveDir = aimAngle + deflectionRad;
  const horizVel = club.angle === 0 ? v0Final : v0Final * Math.cos(angleRad);
  b.vx = horizVel * Math.sin(effectiveDir);
  b.vy = horizVel * -Math.cos(effectiveDir);
  // Apex multiplier — flop balloons (×2), stinger / bump run low (<1).
  b.vz = club.angle === 0 ? 0 : v0Final * Math.sin(angleRad) * shotProfile.apex;
  b.z = 0;
  b.state = 'flying';
  b.trail = [];
  // Feed the Magnus integrator in stepBall. Amplify spinX by the same
  // curveAmp so bad lies / less-forgiving clubs bend the ball harder mid-
  // flight too, not just at launch.
  b.spinX = spinX * curveAmp;
  b.spinY = spinY;
  b.dropT = 0;
  b.windResist = golferFactors.windResist;
  b.launchLieLabel = liePhys?.label || null;
}

function stepBall(b, dt, windX, windY, flagX, flagY) {
  if (b.state === 'flying') {
    const heightFactor = Math.min(1, b.z / 15);
    const windMult = b.windResist ?? 1;
    b.vx += windX * heightFactor * dt * windMult;
    b.vy += windY * heightFactor * dt * windMult;
    if (b.spinX && heightFactor > 0.08) {
      const hSpeed = Math.hypot(b.vx, b.vy);
      if (hSpeed > 5) {
        const perpX = -b.vy / hSpeed;
        const perpY = b.vx / hSpeed;
        const mag = b.spinX * MAGNUS_MAX * heightFactor;
        b.vx += perpX * mag * dt;
        b.vy += perpY * mag * dt;
      }
    }
    b.vz -= GRAVITY * dt;
    const drag = 0.1 * dt;
    b.vx *= 1 - drag;
    b.vy *= 1 - drag;
    b.vz *= 1 - drag * 0.5;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) { b.state = 'ob'; return; }
    // Tree collisions (flying): canopy drag bleeds horizontal velocity
    // and drops the ball out of the leaves; trunk hits deflect low
    // shots sharply and dump most of the ball's energy.
    if (TREES && TREES.length) {
      for (const t of TREES) {
        const tx = t.x * TILE, ty = t.y * TILE;
        // Free escape: if the ball started inside this tree, skip
        // collisions until it has physically cleared the canopy or
        // risen above it. Otherwise a ball resting under a tree can't
        // be hit out without clipping the same tree it's sitting in.
        if (escapeTree.x === tx && escapeTree.y === ty) {
          const ex = b.x - tx, ey = b.y - ty;
          const clearedHoriz = (ex * ex + ey * ey) > (TREE_CANOPY_R * TREE_CANOPY_R) * 1.21;
          const clearedVert = b.z > TREE_CANOPY_Z_HI + 4;
          if (clearedHoriz || clearedVert) {
            escapeTree.x = null;
            escapeTree.y = null;
          } else {
            continue;
          }
        }
        const dx = b.x - tx, dy = b.y - ty;
        const d2 = dx * dx + dy * dy;
        // Trunk impact — only when the ball is low enough to hit the stem.
        if (b.z <= TREE_TRUNK_Z_HI && d2 < TREE_TRUNK_R * TREE_TRUNK_R) {
          const d = Math.sqrt(d2) || 0.01;
          const nx = dx / d, ny = dy / d;
          const vdotn = b.vx * nx + b.vy * ny;
          if (vdotn < 0) {
            // Reflect across the trunk normal and keep ~25% of the speed.
            b.vx = (b.vx - 2 * vdotn * nx) * 0.25;
            b.vy = (b.vy - 2 * vdotn * ny) * 0.25;
            b.vz = Math.min(b.vz, 0) * 0.3;
          }
          // Push the ball outside the trunk so it doesn't re-trigger.
          b.x = tx + nx * (TREE_TRUNK_R + 0.6);
          b.y = ty + ny * (TREE_TRUNK_R + 0.6);
          triggerLeafBurst(tx, ty - 24, 10);
          break;
        }
        // Canopy drag — soft "eaten by leaves" deceleration while the
        // ball is inside the canopy altitude band.
        if (b.z >= TREE_CANOPY_Z_LO && b.z <= TREE_CANOPY_Z_HI
            && d2 < TREE_CANOPY_R * TREE_CANOPY_R) {
          const drag = 4.5 * dt;
          const f = Math.max(0, 1 - drag);
          b.vx *= f;
          b.vy *= f;
          b.vz -= 90 * dt;
          triggerLeafBurst(b.x, b.y - b.z, 4);
          break;
        }
      }
    }
    // Flagstick collision — the pin behaves like a very thin trunk when
    // the ball is at pin-height. Triggers the pinShake wobble + keeps a
    // small chance to drop in if the ball also hits the cup band.
    {
      const fdx = b.x - flagX;
      const fdy = b.y - flagY;
      const fd2 = fdx * fdx + fdy * fdy;
      if (b.z <= FLAG_STICK_Z_HI && fd2 < FLAG_STICK_R * FLAG_STICK_R && fd2 > 0.01) {
        const fd = Math.sqrt(fd2);
        const nx = fdx / fd, ny = fdy / fd;
        const vdotn = b.vx * nx + b.vy * ny;
        if (vdotn < 0) {
          b.vx = (b.vx - 2 * vdotn * nx) * 0.35;
          b.vy = (b.vy - 2 * vdotn * ny) * 0.35;
          b.vz = Math.min(b.vz, 0) * 0.4;
        }
        b.x = flagX + nx * (FLAG_STICK_R + 0.4);
        b.y = flagY + ny * (FLAG_STICK_R + 0.4);
        pinShake.t = 0;
        pinShake.intensity = Math.min(1.6, 0.6 + Math.hypot(b.vx, b.vy) / 120);
      }
    }
    if (b.z < 5) {
      const dcx = b.x - flagX, dcy = b.y - flagY;
      if (Math.hypot(dcx, dcy) < HOLE_RADIUS && Math.hypot(b.vx, b.vy) < 90) {
        b.x = flagX; b.y = flagY; b.z = 0;
        b.vx = 0; b.vy = 0; b.vz = 0;
        b.state = 'dropping'; b.dropT = 0;
        return;
      }
    }
    if (b.z <= 0) {
      b.z = 0;
      const sp = surfacePropsAt(b.x, b.y);
      if (sp.hazard) { b.state = 'hazard'; return; }
      if (sp.ob) { b.state = 'ob'; return; }
      const impactVz = -b.vz;
      const horizSpeed = Math.hypot(b.vx, b.vy);
      if (impactVz > 6 && horizSpeed > 10) {
        b.vz = impactVz * sp.bounceKeep;
        b.vx *= 0.55;
        b.vy *= 0.55;
      } else {
        b.vz = 0;
        b.state = 'rolling';
      }
    }
  } else if (b.state === 'rolling') {
    const sp = surfacePropsAt(b.x, b.y);
    if (sp.hazard) { b.state = 'hazard'; return; }
    if (sp.ob) { b.state = 'ob'; return; }
    if (sp.slopeMag) {
      // v0.72 — 2× the slope acceleration (see stepRoll above).
      b.vx += Math.sin(sp.slopeAng) * sp.slopeMag * 2 * dt;
      b.vy += -Math.cos(sp.slopeAng) * sp.slopeMag * 2 * dt;
    }
    const speed = Math.hypot(b.vx, b.vy);
    if (speed < 4) {
      b.state = 'stopped';
      b.vx = 0; b.vy = 0;
      return;
    }
    const decel = sp.rollDecel * 40 * dt;
    const factor = Math.max(0, 1 - decel / Math.max(speed, 0.01));
    b.vx *= factor;
    b.vy *= factor;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) { b.state = 'ob'; return; }
    // Tree trunk thud while rolling — stop, back the ball off the trunk.
    if (TREES && TREES.length) {
      for (const t of TREES) {
        const tx = t.x * TILE, ty = t.y * TILE;
        const dx = b.x - tx, dy = b.y - ty;
        const d2 = dx * dx + dy * dy;
        if (d2 < TREE_TRUNK_R * TREE_TRUNK_R) {
          const d = Math.sqrt(d2) || 0.01;
          b.x = tx + (dx / d) * (TREE_TRUNK_R + 0.6);
          b.y = ty + (dy / d) * (TREE_TRUNK_R + 0.6);
          b.vx = 0; b.vy = 0;
          b.state = 'stopped';
          triggerLeafBurst(tx, ty - 24, 6);
          return;
        }
      }
    }
    // Flagstick thud while rolling — reflect, keep 35% of speed,
    // wobble the pin. Skips the cup drop so the ball doesn't
    // teleport into the hole from a stick hit.
    {
      const fdx = b.x - flagX, fdy = b.y - flagY;
      const fd2 = fdx * fdx + fdy * fdy;
      if (fd2 < FLAG_STICK_R * FLAG_STICK_R && fd2 > 0.01) {
        const fd = Math.sqrt(fd2);
        const nx = fdx / fd, ny = fdy / fd;
        const vdotn = b.vx * nx + b.vy * ny;
        if (vdotn < 0) {
          b.vx = (b.vx - 2 * vdotn * nx) * 0.35;
          b.vy = (b.vy - 2 * vdotn * ny) * 0.35;
        }
        b.x = flagX + nx * (FLAG_STICK_R + 0.4);
        b.y = flagY + ny * (FLAG_STICK_R + 0.4);
        pinShake.t = 0;
        pinShake.intensity = Math.min(1.4, 0.5 + Math.hypot(b.vx, b.vy) / 140);
      }
    }
    const dcx = b.x - flagX, dcy = b.y - flagY;
    if (Math.hypot(dcx, dcy) < HOLE_RADIUS && speed < 60) {
      b.x = flagX; b.y = flagY;
      b.vx = 0; b.vy = 0;
      b.state = 'dropping'; b.dropT = 0;
    }
  } else if (b.state === 'dropping') {
    b.dropT += dt;
    if (b.dropT > 0.75) b.state = 'holed';
  }
}

const SW = {
  IDLE: 'idle', AIMING: 'aiming', SWIPING: 'swiping',
  FLYING: 'flying', ROLLING: 'rolling', STOPPED: 'stopped',
  DROPPING: 'dropping',
  SPLASHING: 'splashing',
  HAZARD: 'hazard', OB: 'ob', HOLED: 'holed',
};

// Water splash playback state — set by settleBallTransitions when
// the ball enters a hazard, read by the renderer. Module-level so
// the physics code can poke it without threading a ref through.
const splashFx = { x: 0, y: 0, t: 0, active: false, droplets: [] };
const SPLASH_DURATION = 0.5;
const SPLASH_PAUSE = 0.02;

function triggerLeafBurst(cx, cy, count) {
  // Pushes short-lived falling leaves into the shared burstLeaves
  // array. The main tick loop advances and culls them; renderer
  // draws them alongside the ambient leaf cloud.
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 10 + Math.random() * 20;
    burstLeaves.push({
      x: cx + (Math.random() - 0.5) * 6,
      y: cy + (Math.random() - 0.5) * 6,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd - 4,
      age: 0,
      maxAge: 1.6 + Math.random() * 1.2,
      color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function spawnLeaf(windX, windY) {
  const side = Math.random();
  let x, y;
  if (side < 0.5) {
    x = windX >= 0 ? -6 - Math.random() * 20 : WORLD_W + 6 + Math.random() * 20;
    y = Math.random() * WORLD_H;
  } else {
    x = Math.random() * WORLD_W;
    y = windY >= 0 ? -6 - Math.random() * 20 : WORLD_H + 6 + Math.random() * 20;
  }
  return {
    x, y,
    vx: windX * 0.8 + (Math.random() - 0.5) * 6,
    vy: windY * 0.8 + (Math.random() - 0.5) * 6,
    age: 0,
    maxAge: 10 + Math.random() * 10,
    color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
    phase: Math.random() * Math.PI * 2,
  };
}

function shapeLabel(spinX, spinY) {
  const xAbs = Math.abs(spinX), yAbs = Math.abs(spinY);
  if (xAbs < 0.12 && yAbs < 0.12) return 'PURE';
  const parts = [];
  if (yAbs > 0.12) parts.push(spinY < 0 ? 'HIGH' : 'LOW');
  if (xAbs > 0.12) parts.push(spinX < 0 ? 'DRAW' : 'FADE');
  if (parts.length === 0) return 'PURE';
  const intensity = Math.max(xAbs, yAbs);
  const prefix = intensity > 0.75 ? 'BIG ' : intensity > 0.45 ? '' : 'SOFT ';
  return prefix + parts.join(' ');
}

function drawJoystick(ctx, cx, cy, dx, dy, active, dpr) {
  const base = 56 * dpr;
  const knob = 22 * dpr;
  ctx.save();
  ctx.fillStyle = active ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.arc(cx, cy, base, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = active ? 'rgba(255,246,216,0.8)' : 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.arc(cx, cy, base, 0, Math.PI * 2); ctx.stroke();
  const maxKnobDisp = base - knob - 4 * dpr;
  let kdx = dx * dpr, kdy = dy * dpr;
  const mag = Math.hypot(kdx, kdy);
  if (mag > maxKnobDisp) {
    kdx = (kdx / mag) * maxKnobDisp;
    kdy = (kdy / mag) * maxKnobDisp;
  }
  ctx.fillStyle = active ? 'rgba(255,246,216,0.95)' : 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(cx + kdx, cy + kdy, knob, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawSwipeFeedback(ctx, swipe, dpr) {
  const sx = swipe.startX, sy = swipe.startY;
  const maxRadius = 80 * dpr;
  // Phase 1 power reads off the backswing depth. Once the swing is
  // locked it stops charging — the peakDy / peakY captured at the
  // reversal moment is what's shown from then on.
  const peakDy = swipe.locked
    ? swipe.peakDy
    : Math.max(swipe.peakDy, Math.max(0, swipe.currentY - sy));
  const drawDy = Math.min(maxRadius, peakDy);
  const px = sx;
  const py = sy + drawDy;
  const norm = Math.min(1, peakDy / maxRadius);
  const headR = (8 + norm * 12) * dpr;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 100% ring at the start point.
  ctx.strokeStyle = norm >= 1 ? 'rgba(255,240,170,0.85)' : 'rgba(255,255,255,0.32)';
  ctx.lineWidth = (norm >= 1 ? 1.5 : 1) * dpr;
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.beginPath(); ctx.arc(sx, sy, maxRadius, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  // Backswing shaft: start → peak (vertical line down).
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 10 * dpr;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(px, py); ctx.stroke();
  const hue = 120 - 110 * norm;
  ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.9)`;
  ctx.lineWidth = 6 * dpr;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(px, py); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(px, py); ctx.stroke();
  // Origin halo.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.arc(sx, sy, (10 + norm * 14) * dpr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.7)`;
  ctx.beginPath(); ctx.arc(sx, sy, (8 + norm * 10) * dpr, 0, Math.PI * 2); ctx.fill();
  // Head dot at the backswing peak — ringed in gold once locked.
  ctx.fillStyle = `hsla(${hue}, 85%, 60%, 0.95)`;
  ctx.beginPath(); ctx.arc(px, py, headR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = swipe.locked ? 'rgba(255,230,120,0.95)' : 'rgba(255,255,255,0.9)';
  ctx.lineWidth = (swipe.locked ? 2 : 1) * dpr;
  ctx.beginPath(); ctx.arc(px, py, headR + (swipe.locked ? 2 * dpr : 0), 0, Math.PI * 2); ctx.stroke();
  // Power label.
  ctx.font = `bold ${14 * dpr}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff6d8';
  const label = swipe.locked ? `LOCK ${Math.round(norm * 100)}%` : `${Math.round(norm * 100)}%`;
  ctx.fillText(label, px, py + headR + 14 * dpr);
  // Forward-swing deviation indicator — visible only after lock. A
  // straight upward swipe holds the dashed line vertical and tinted
  // green; drifting left / right hooks the line sideways and warms it.
  if (swipe.locked) {
    // Clamp the indicator endpoint so the dashed forward-swing line
    // can't visually extend past the start ring — a long pull-through
    // otherwise reads as "more than 100%" even though the backswing
    // peak (power) was long since locked.
    const rawDx = swipe.currentX - px;
    const rawDy = swipe.currentY - py;
    const rawLen = Math.hypot(rawDx, rawDy);
    const maxLen = maxRadius * 1.05;
    const scale = rawLen > maxLen ? maxLen / rawLen : 1;
    const cx = px + rawDx * scale;
    const cy = py + rawDy * scale;
    const devPx = swipe.currentX - swipe.peakX;
    const devNorm = Math.max(-1, Math.min(1, devPx / (45 * dpr)));
    const devHue = 120 - Math.abs(devNorm) * 110;
    ctx.strokeStyle = `hsla(${devHue}, 80%, 60%, 0.9)`;
    ctx.lineWidth = 4 * dpr;
    ctx.setLineDash([6 * dpr, 4 * dpr]);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `hsla(${devHue}, 85%, 60%, 0.95)`;
    ctx.beginPath(); ctx.arc(cx, cy, 5 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.arc(cx, cy, 5 * dpr, 0, Math.PI * 2); ctx.stroke();
    // Shape tag.
    ctx.fillStyle = '#fff6d8';
    const shape = Math.abs(devNorm) < 0.15 ? 'STRAIGHT' : devNorm < 0 ? 'HOOK ←' : 'SLICE →';
    ctx.fillText(shape, cx, cy - 16 * dpr);
  }
  ctx.restore();
}

// Given the selected golfer's stats, produce multipliers that fold into
// launch velocity and the curve magnitude — mirrors the main game's
// getLaunchData math so both modes feel tied to the same character sheet.
function golferMultipliers(selectedGolfer) {
  const s = selectedGolfer?.stats || {};
  const m = selectedGolfer?.mental || {};
  const power = s.power ?? 50;
  const accuracy = s.accuracy ?? 50;
  const touch = s.touch ?? 50;
  const recovery = s.recovery ?? 50;
  const focus = m.focus ?? 50;
  const composure = m.composure ?? 50;
  const courseMgmt = m.courseManagement ?? 50;
  // v0.72 — tightened so max stats don't blow past 400 yd on driver.
  //   powerFactor: 0.003 → 0.0022 (1.10 at 95 PWR, was 1.135)
  //   touchFactor: 0.0015 kept (1.0675 at 95 TCH)
  const powerFactor = Math.max(0.80, Math.min(1.20, 1 + (power - 50) * 0.0022));
  const touchFactor = Math.max(0.92, Math.min(1.08, 1 + (touch - 50) * 0.0015));
  const effectiveSkill = accuracy * 0.34 + focus * 0.22 + composure * 0.14 + courseMgmt * 0.12 + 50 * 0.18;
  const forgivenessFactor = Math.max(0.7, Math.min(1.45, 1.18 - (effectiveSkill - 50) * 0.003));
  const recoveryFactor = Math.max(0.82, Math.min(1.18, 1.12 - (recovery - 50) * 0.003));
  const windResist = Math.max(0.7, Math.min(1.3, 1 - (courseMgmt - 50) * 0.006));
  return { powerFactor, touchFactor, forgivenessFactor, recoveryFactor, windResist };
}

// Map the selected bag into a clubKey → {distance, accuracy, forgiveness,
// spin, feel} stat block, picking the first equipped item per clubKey.
function buildBagClubStats(selectedBag, equipmentCatalog) {
  const byKey = {};
  if (!selectedBag || !equipmentCatalog) return byKey;
  const allItems = Object.values(equipmentCatalog).flat();
  const findItem = (id) => allItems.find((it) => it && it.id === id);
  for (const id of selectedBag) {
    const item = findItem(id);
    if (!item || !item.clubKey || byKey[item.clubKey]) continue;
    byKey[item.clubKey] = { ...(item.stats || {}) };
  }
  return byKey;
}

function clubStatMultipliers(clubStats) {
  const distance = clubStats?.distance ?? 50;
  const accuracy = clubStats?.accuracy ?? 50;
  const forgiveness = clubStats?.forgiveness ?? 50;
  // v0.72 — distance exponent tightened 0.003 → 0.0017 so a 100-distance
  // club bumps v0 by 1.085× instead of 1.15× (cap stays in that range).
  const distanceFactor = Math.max(0.92, Math.min(1.09, 1 + (distance - 50) * 0.0017));
  const clubCurveFactor = Math.max(0.75, Math.min(1.25, 1 - ((accuracy - 50) * 0.003 + (forgiveness - 50) * 0.002)));
  return { distanceFactor, clubCurveFactor };
}

export default function GolfStoryScreen(props) {
  return (
    <GsErrorBoundary>
      <GolfStoryScreenInner {...props} />
    </GsErrorBoundary>
  );
}

function GolfStoryScreenInner({ onExit, selectedGolfer, selectedBag, equipmentCatalog, allGolfers = [] }) {
  // Orientation is auto-picked from the viewport so we never make the
  // player tap an extra device-picker screen — match setup is the
  // first thing they see when entering Golf Story.
  const [orientation, setOrientation] = useState(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
  });
  // matchConfig === null  →  the clubhouse / range / putting modes
  // are still happily playable. Once the player walks to the 1ST TEE
  // sign (or accepts a 1V1 challenger), MatchSetupOverlay populates
  // it and enterMode('round') swaps the world to hole 1.
  // Shape: { players: [{ id, name, isNPC, golfer }, ...] }
  const [matchConfig, setMatchConfig] = useState(null);
  // Mirror of matchConfig for the tick-loop closure — the main effect
  // runs once at mount so it can't read the latest React state value
  // directly.
  const matchConfigRef = useRef(null);
  // v0.75 game mode: 'clubhouse' (the default landing area) | 'range'
  // (driving-range practice) | 'putting' (practice green) | 'round'
  // (real match on a HOLES[] hole). The ref is what the tick loop
  // reads; the React state mirror drives HUD reactivity.
  const [gameMode, setGameMode] = useState('clubhouse');
  const gameModeRef = useRef('clubhouse');
  // MatchSetupOverlay visibility — gated by user action (1ST TEE sign
  // tap or challenger accept) instead of "matchConfig === null" so the
  // clubhouse loads first.
  const [matchSetupOpen, setMatchSetupOpen] = useState(false);
  // When opening match setup from a challenger, the opponent slot is
  // pre-filled with that NPC's golfer; we skip the human + cpu picker
  // and commit straight away.
  const matchSetupSeedRef = useRef(null);
  // NPC dialog overlay state — null when no NPC is being talked to.
  // Shape: { npcId, lineIdx } — the screen looks up NPCS[id] to draw.
  const [npcDialog, setNpcDialog] = useState(null);
  // Active proximity interaction surfaced to the HUD (sign or NPC).
  // Shape: { kind: 'sign' | 'npc', id, label } | null.
  const [interaction, setInteraction] = useState(null);
  const interactionRef = useRef(null);
  // Mode-switch entry point exposed to React handlers (sign tap, EXIT
  // button, challenger accept). Wired inside the main effect.
  const enterModeRef = useRef(null);
  // Range / putting practice telemetry — shot count this session and
  // a small auto-reset timer so the ball settles for a beat before
  // returning to the mat.
  const practiceShotCountRef = useRef(0);
  const practiceResetTimerRef = useRef(0);
  const bestRangeShotRef = useRef(0);
  const [practiceHud, setPracticeHud] = useState({ shots: 0, lastYd: 0, bestYd: 0 });
  // playersRef carries per-player ball/stroke/scores state once a match
  // is active. Populated from matchConfig the first time loadHole runs.
  const playersRef = useRef([]);
  const currentPlayerIdxRef = useRef(0);
  // When true the tick loop is expected to fire an NPC auto-swing on
  // the next tick where sw.state === SW.AIMING. Cleared inside the
  // NPC handler so we don't loop.
  const npcPendingRef = useRef(false);
  const npcCooldownRef = useRef(0);
  // Exposed by the main effect; the TEE OFF button calls this to
  // transition from walk-around (SW.IDLE) into the swing flow.
  const teeOffRef = useRef(() => {});
  // React-friendly "can tee off now" flag, updated by the tick loop
  // when the player steps onto the tee during walking. The ref mirror
  // avoids extra setState churn every frame.
  const canTeeOffRef = useRef(false);
  const [canTeeOff, setCanTeeOff] = useState(false);
  const golferFactorsRef = useRef(golferMultipliers(selectedGolfer));
  const bagStatsRef = useRef(buildBagClubStats(selectedBag, equipmentCatalog));
  useEffect(() => {
    golferFactorsRef.current = golferMultipliers(selectedGolfer);
  }, [selectedGolfer]);
  useEffect(() => {
    bagStatsRef.current = buildBagClubStats(selectedBag, equipmentCatalog);
  }, [selectedBag, equipmentCatalog]);
  const canvasRef = useRef(null);
  const staticRef = useRef(null);
  const holeIdxRef = useRef(0);
  // Per-round score tracking — one entry per hole finished, e.g.
  // { hole: 1, par: 3, strokes: 4 }. Used by the scorecard overlay.
  const scoresRef = useRef([]);
  const [scorecardOpen, setScorecardOpen] = useState(false);
  // React mirror of scoresRef — drives the scorecard re-render.
  const [scoresHud, setScoresHud] = useState([]);
  // React mirror of playersRef for the multi-player scorecard. Each
  // entry is { name, isNPC, scores: [{hole,par,strokes}] } so the
  // overlay can re-render whenever a hole finishes.
  const [playersHud, setPlayersHud] = useState([]);
  // Drives the "TURN: <name>" banner so the player knows whose shot
  // is pending, especially during NPC auto-play.
  const [turnHud, setTurnHud] = useState({ name: 'YOU', isNPC: false });
  // Signal from the scorecard overlay back into the tick loop — flips
  // to true when the player taps "Next Hole" and the loop calls
  // advanceHole on the following frame.
  const pendingAdvanceRef = useRef(false);
  // v0.74 walk-to-next-hole. After a solo player holes out, instead of
  // auto-popping the scorecard we drop them into walking mode on the
  // green and show a "NEXT HOLE" waypoint at the north world edge.
  // When the player walks within trigger radius, fade out → advanceHole
  // → fade in at the next tee. Fields:
  //   active     true while the walk-out is running
  //   targetX/Y  world-space waypoint (top-center of current hole)
  //   fading     proximity reached — driving the fade animation
  //   fadeT      0..FADE_DUR seconds elapsed in the current phase
  //   fadePhase  'in' (opaque → covered) | 'out' (covered → clear)
  const walkOutRef = useRef({ active: false, targetX: 0, targetY: 0, fading: false, fadeT: 0, fadePhase: 'in' });
  // Mirror of the walk-out state consumed by the React HUD (banner,
  // arrow rotation, fade overlay opacity). Tracked via a ref too so
  // the tick loop can diff cheaply and only setState when a field
  // actually changes meaningfully.
  const walkOutHudRef = useRef({ active: false, dir: 0, fadeAlpha: 0 });
  const [walkOutHud, setWalkOutHud] = useState({ active: false, dir: 0, fadeAlpha: 0 });
  const zoomRef = useRef(1.0);
  const joystickRef = useRef(null);
  const swipeRef = useRef(null);
  const posRef = useRef({ x: TEE.x * TILE, y: TEE.y * TILE, facing: 'N', walkPhase: 0, moving: false });
  const ballRef = useRef({
    x: TEE.x * TILE - 4, y: TEE.y * TILE + 2, z: 0,
    vx: 0, vy: 0, vz: 0,
    state: 'rest',
    lastGoodX: TEE.x * TILE - 4,
    lastGoodY: TEE.y * TILE + 2,
    trail: [],
    spinX: 0, spinY: 0,
    dropT: 0,
  });
  const swingRef = useRef({
    state: SW.IDLE,
    aimAngle: 0,
    clubIdx: 4,
    spinX: 0,
    spinY: 0,
    strokeCount: 0,
    messageTimer: 0,
    shotType: 'normal',
    // Aim-lock flow: before the swing fires the player rotates aim +
    // dials a pre-power cap via the AimPad; tapping OK flips
    // aimLocked = true and the SWING button takes over.
    aimLocked: false,
    prePowerCap: 1.0,
    aimBaseAngle: 0,
  });
  const windRef = useRef({ x: 0, y: 0, angle: 0, speed: 0, mph: 0 });
  const leavesRef = useRef([]);
  const rafRef = useRef(null);
  const cameraRef = useRef({ camX: 0, camY: 0, scale: 2 });
  // Camera focus mode — 'aim' follows the ball/aim spot, 'golfer' follows
  // the player sprite. Mirrors v3.40 in the main game.
  const cameraModeRef = useRef('aim');
  const [cameraMode, setCameraModeState] = useState('aim');
  const setCameraMode = (m) => { cameraModeRef.current = m; setCameraModeState(m); };
  // Mobile UI: which sub-overlay is open. null/'shape'/'club'/'shotType'.
  const [shotTypeMenuOpen, setShotTypeMenuOpen] = useState(false);
  const [hudShotType, setHudShotType] = useState('normal');
  // Set to true whenever the player manually picks a shot type from the
  // menu. Cleared on strike (endSwipe) so every new shot setup re-runs
  // the auto-Tap heuristic from scratch.
  const shotTypeManualRef = useRef(false);
  // Set to true when the user taps zoom in/out manually. Auto-fit branches
  // (aim zoom, flight zoom, putting zoom) honor this and stop overriding
  // until the next shot clears it.
  const zoomUserOverrideRef = useRef(false);
  // Last-shot stats — captured at strike time, finalised when the ball
  // comes to rest (or drops). Drives the small summary card on the
  // right side of the screen.
  const lastShotRef = useRef(null);
  const [lastShotHud, setLastShotHud] = useState(null);

  const [hud, setHud] = useState({
    state: SW.IDLE, club: 'Driver', clubShort: 'DR',
    clubCarryYd: 250, strokes: 1, pinYd: 0, lie: 'Tee Box',
    windMph: 0, windAngleDeg: 0, message: null,
    spinX: 0, spinY: 0, shape: 'PURE',
    holeName: HOLES[0].name, holePar: HOLES[0].par, holeIdx: 0,
    zoom: 1.0,
    aimLocked: false, prePowerCap: 1.0,
  });

  const [shapeOverlay, setShapeOverlay] = useState(false);
  const [clubPicker, setClubPicker] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!orientation) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const bodyStyle = document.createElement('style');
    bodyStyle.textContent = `
      html, body {
        overscroll-behavior: none;
        touch-action: none;
        overflow: hidden;
        -webkit-user-select: none;
        user-select: none;
      }
    `;
    document.head.appendChild(bodyStyle);

    // v0.75 — boot into the clubhouse instead of straight onto hole 1.
    // The match config arrives later when the player walks to the
    // 1ST TEE sign or accepts a 1V1 challenger.
    loadClubhouse(orientation);
    gameModeRef.current = 'clubhouse';
    holeIdxRef.current = 0;

    staticRef.current = document.createElement('canvas');

    const rebuildStatic = () => {
      staticRef.current.width = WORLD_W;
      staticRef.current.height = WORLD_H;
      const sctx = staticRef.current.getContext('2d');
      sctx.imageSmoothingEnabled = false;
      sctx.clearRect(0, 0, WORLD_W, WORLD_H);
      const imgData = buildWorldImageData();
      sctx.putImageData(imgData, 0, 0);
      // Mower patterns on every fairway + green.
      //   • Flat surfaces (no slope) get parallel diagonal stripes —
      //     standard lawn mowing look.
      //   • Sloped surfaces get CHEVRON stripes pointing downhill. The
      //     chevron apex lines up with the gradient so the shape itself
      //     reads as "pitch goes this way".
      // Two-tone high-contrast alpha blend so the pattern actually pops
      // off the fairway base colour. No "display-only" fallback — real
      // slope ↔ chevron, one-to-one.
      const MOW_DARK  = 'rgba(5, 22, 8, 0.38)';
      const MOW_LIGHT = 'rgba(236, 248, 208, 0.16)';
      const paintBands = (x0, y0, x1, y1, shape, stripeFn, bandStyles) => {
        for (let y = y0; y < y1; y++) {
          const runs = bandStyles.map(() => -1);
          for (let x = x0; x <= x1; x++) {
            const inside = x < x1 && pointInShape(x + 0.5, y + 0.5, shape);
            const band = inside ? stripeFn(x, y) : -1;
            for (let b = 0; b < bandStyles.length; b++) {
              if (band === b) {
                if (runs[b] < 0) runs[b] = x;
              } else if (runs[b] >= 0) {
                sctx.fillStyle = bandStyles[b];
                sctx.fillRect(runs[b], y, x - runs[b], 1);
                runs[b] = -1;
              }
            }
          }
        }
      };
      for (let surfIdx = 0; surfIdx < SURFACES.length; surfIdx++) {
        const surf = SURFACES[surfIdx];
        if (surf.type !== T_FAIRWAY && surf.type !== T_GREEN) continue;
        const bb = surf.shape._bbox;
        if (!bb) continue;
        const slope = surf.slope
          || (surf.type === T_GREEN && GREEN_SLOPE && GREEN_SLOPE.mag
              ? { angle: GREEN_SLOPE.angle, mag: GREEN_SLOPE.mag }
              : null);
        const hasSlope = !!(slope && slope.mag);
        const gx = hasSlope ? Math.sin(slope.angle) : Math.cos(Math.PI * 0.18);
        const gy = hasSlope ? -Math.cos(slope.angle) : Math.sin(Math.PI * 0.18);
        // Tight diagonals (14 px) for the lawn-stripe look; wider
        // chevrons (24 px) so the V actually reads as an arrow.
        const P = hasSlope ? 24 : 14;
        const half = P / 2;
        // Only paint where THIS surface is the topmost one — any
        // surface defined after it in the SURFACES array (sand,
        // fringe, green, tee, water, etc.) hides the layers below.
        // Stops fairway stripes from showing through greens / sand /
        // hazards and stops green chevrons from bleeding onto the
        // tee box.
        const toplayerShapes = [];
        for (let i = surfIdx + 1; i < SURFACES.length; i++) {
          toplayerShapes.push(SURFACES[i].shape);
        }
        const isTopHere = (x, y) => {
          for (let i = 0; i < toplayerShapes.length; i++) {
            if (pointInShape(x + 0.5, y + 0.5, toplayerShapes[i])) return false;
          }
          return true;
        };
        // Center the chevron math on the surface's bbox so the V-apex
        // axis actually passes through the fairway. Without this the
        // v=0 ridge sits out at the world origin and every fairway
        // sees only one side of the V — reading as diagonals.
        const cx0 = (bb[0] + bb[2]) * 0.5;
        const cy0 = (bb[1] + bb[3]) * 0.5;
        // Limit chevron paint to a centred sub-region so only the
        // sloped SECTION of the fairway wears arrows — the rest still
        // shows the flat diagonal lawn stripes. Radius is ~38% of the
        // shorter bbox dimension. Outside the zone we fall through to
        // the flat stripe function so both patterns coexist on the
        // same fairway (matches how real greens often have 2+ slopes).
        const bbW = bb[2] - bb[0];
        const bbH = bb[3] - bb[1];
        const zoneR = Math.max(24, Math.min(bbW, bbH) * 0.38);
        const zoneR2 = zoneR * zoneR;
        const flatGx = Math.cos(Math.PI * 0.18);
        const flatGy = Math.sin(Math.PI * 0.18);
        const flatP = 14;
        const flatHalf = 7;
        const stripeFn = hasSlope
          ? (x, y) => {
              if (!isTopHere(x, y)) return -1;
              const lx = x - cx0, ly = y - cy0;
              const inZone = (lx * lx + ly * ly) < zoneR2;
              if (inZone) {
                const u = gx * lx + gy * ly;
                const v = -gy * lx + gx * ly;
                const phase = ((u + Math.abs(v)) % P + P) % P;
                return phase < half ? 0 : 1;
              }
              const u = flatGx * x + flatGy * y;
              const phase = ((u % flatP) + flatP) % flatP;
              return phase < flatHalf ? 0 : 1;
            }
          : (x, y) => {
              if (!isTopHere(x, y)) return -1;
              const u = gx * x + gy * y;
              const phase = ((u % P) + P) % P;
              return phase < half ? 0 : 1;
            };
        const bandStyles = [MOW_DARK, MOW_LIGHT];
        const x0 = Math.max(0, Math.floor(bb[0]));
        const y0 = Math.max(0, Math.floor(bb[1]));
        const x1 = Math.min(WORLD_W, Math.ceil(bb[2]));
        const y1 = Math.min(WORLD_H, Math.ceil(bb[3]));
        paintBands(x0, y0, x1, y1, surf.shape, stripeFn, bandStyles);
        // Second pass — directional shading inside the slope zone so
        // the fairway reads as a 3D bump. Downhill side gets a darker
        // tint, uphill gets a soft highlight; quantised into 4 bands
        // so paintBands' run-length batching keeps the bake cheap.
        if (hasSlope) {
          const shadeBands = [
            'rgba(245, 250, 210, 0.14)',  // 0: strong uphill highlight
            'rgba(245, 250, 210, 0.07)',  // 1: soft highlight
            'rgba(6, 20, 8, 0.10)',       // 2: soft downhill shadow
            'rgba(2, 12, 4, 0.22)',       // 3: strong downhill shadow
          ];
          const shadeFn = (x, y) => {
            if (!isTopHere(x, y)) return -1;
            const lx = x - cx0, ly = y - cy0;
            const d2 = lx * lx + ly * ly;
            if (d2 > zoneR2) return -1; // outside the slope zone
            const u = gx * lx + gy * ly;
            const t = u / zoneR;
            if (t < -0.55) return 0;
            if (t < -0.18) return 1;
            if (t < 0.18) return -1; // neutral band — no tint
            if (t < 0.55) return 2;
            return 3;
          };
          paintBands(x0, y0, x1, y1, surf.shape, shadeFn, shadeBands);
        }
      }
      for (const p of PROPS) drawProp(sctx, p);
    };
    rebuildStatic();

    const resize = () => {
      // Render at up to 3× device pixels so high-DPR phones get crisp
      // tiles at close zoom. Capped at 3× to keep iPad draw costs sane.
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const prevW = canvas.width;
      const prevH = canvas.height;
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      // Keep pixel-art crispness at normal zoom; the per-frame tick flips
      // imageSmoothing on when zoomed past ~1.6× so the grain smooths out.
      ctx.imageSmoothingEnabled = false;
      // If the viewport dimensions flipped (device rotation), reset the
      // zoom so the new viewport gets a fresh auto-fit and the min-zoom
      // clamp doesn't lock the user into a huge close-up. Without this
      // the minScale grows on rotation, pins zoomRef up, and there's no
      // way down.
      const flipped = prevW > 0 && prevH > 0
        && ((prevW > prevH) !== (canvas.width > canvas.height));
      if (flipped) {
        zoomRef.current = 1.0;
        zoomUserOverrideRef.current = false;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    const randomizeWind = () => {
      const windAngle = Math.random() * Math.PI * 2;
      const windSpeed = 5 + Math.random() * 18;
      windRef.current = {
        x: Math.sin(windAngle) * windSpeed,
        y: -Math.cos(windAngle) * windSpeed,
        angle: windAngle,
        speed: windSpeed,
        mph: Math.round(windSpeed * 0.55),
      };
    };
    randomizeWind();

    leavesRef.current = [];
    for (let i = 0; i < MAX_LEAVES; i++) {
      const l = spawnLeaf(windRef.current.x, windRef.current.y);
      l.age = Math.random() * l.maxAge;
      l.x = Math.random() * WORLD_W;
      l.y = Math.random() * WORLD_H;
      leavesRef.current.push(l);
    }

    const aimAtFlag = () => {
      const ball = ballRef.current;
      swingRef.current.aimAngle = Math.atan2(FLAG.x * TILE - ball.x, -(FLAG.y * TILE - ball.y));
    };

    const autoPickClubAndZoom = () => {
      const ball = ballRef.current;
      const onGreen = surfaceAt(ball.x, ball.y) === T_GREEN;
      const distPx = Math.hypot(ball.x - FLAG.x * TILE, ball.y - FLAG.y * TILE);
      const distYd = distPx / TILE * YARDS_PER_TILE;
      const idx = pickClubForDistance(distYd, onGreen);
      swingRef.current.clubIdx = idx;
      zoomRef.current = (CLUBS[idx].key === 'PT') ? 2.2 : 1.0;
    };

    const setBallOnTee = () => {
      const b = ballRef.current;
      b.x = TEE.x * TILE - 4; b.y = TEE.y * TILE + 2;
      b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0;
      b.state = 'rest';
      b.lastGoodX = b.x; b.lastGoodY = b.y;
      b.trail = [];
      b.spinX = 0; b.spinY = 0;
      b.dropT = 0;
      const p = posRef.current;
      swingRef.current.strokeCount = 1;
      swingRef.current.spinX = 0;
      swingRef.current.spinY = 0;
      swingRef.current.state = SW.AIMING;
      swingRef.current.aimLocked = false;
      swingRef.current.prePowerCap = 1.0;
      aimAtFlag();
      autoPickClubAndZoom();
      swingRef.current.aimBaseAngle = swingRef.current.aimAngle;
      // Pose the golfer AFTER aim is resolved so stance orients to the
      // actual target line, not a stale cardinal.
      const pose = addressPose(b, swingRef.current.aimAngle);
      p.x = pose.px; p.y = pose.py; p.facing = pose.facing; p.moving = false;
    };
    setBallOnTee();

    // ═══════════════ MATCH / TURN ENGINE ═══════════════
    // Turn order for an individual hole:
    //   1. Tee-off: players in slot order.
    //   2. Subsequent shots: player farthest from the pin plays next.
    //   3. When all players have holed out, show the scorecard.
    //
    // Each player carries their own ball position, this-hole stroke
    // count, holed flag, and per-hole score history. The shared
    // ballRef / swingRef always reflects the CURRENT player's state
    // so existing physics / HUD / input work unchanged.

    const initPlayersFromMatch = () => {
      // v0.75 — read from matchConfigRef so the function can be called
      // from enterMode('round') after match setup commits without
      // tearing down the whole effect.
      const cfg = matchConfigRef.current || matchConfig;
      const list = (cfg?.players || []).map((slot, i) => ({
        id: slot.id,
        name: slot.name,
        isNPC: slot.isNPC,
        golfer: slot.golfer,
        factors: golferMultipliers(slot.golfer),
        // Ball position where the player currently lies. Reset to tee
        // at the start of every hole.
        ballX: TEE.x * TILE - 4,
        ballY: TEE.y * TILE + 2,
        strokeCountThisHole: 0,
        holedOutThisHole: false,
        teedOff: false,
        scores: [],
      }));
      if (!list.length) {
        list.push({
          id: 'p1', name: 'YOU', isNPC: false,
          golfer: selectedGolfer,
          factors: golferMultipliers(selectedGolfer),
          ballX: TEE.x * TILE - 4, ballY: TEE.y * TILE + 2,
          strokeCountThisHole: 0, holedOutThisHole: false, teedOff: false,
          scores: [],
        });
      }
      playersRef.current = list;
      currentPlayerIdxRef.current = 0;
      setPlayersHud(list.map((p) => ({ name: p.name, isNPC: p.isNPC, scores: [] })));
      setTurnHud({ name: list[0].name, isNPC: list[0].isNPC });
    };

    const resetPlayersForHole = () => {
      for (const pl of playersRef.current) {
        pl.ballX = TEE.x * TILE - 4;
        pl.ballY = TEE.y * TILE + 2;
        pl.strokeCountThisHole = 0;
        pl.holedOutThisHole = false;
        pl.teedOff = false;
      }
      currentPlayerIdxRef.current = 0;
    };

    const flushPlayersHud = () => {
      setPlayersHud(playersRef.current.map((p) => ({
        name: p.name,
        isNPC: p.isNPC,
        scores: p.scores.slice(),
      })));
    };

    const saveActivePlayer = () => {
      const idx = currentPlayerIdxRef.current;
      const pl = playersRef.current[idx];
      if (!pl) return;
      const b = ballRef.current;
      pl.ballX = b.x;
      pl.ballY = b.y;
      pl.strokeCountThisHole = swingRef.current.strokeCount;
    };

    const loadActivePlayer = (isTeeShot) => {
      const idx = currentPlayerIdxRef.current;
      const pl = playersRef.current[idx];
      if (!pl) return;
      const b = ballRef.current;
      const p = posRef.current;
      const sw = swingRef.current;
      // Place ball at the player's lie and reset transient physics.
      b.x = pl.ballX; b.y = pl.ballY;
      b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0;
      b.state = 'rest';
      b.lastGoodX = b.x; b.lastGoodY = b.y;
      b.trail = [];
      b.spinX = 0; b.spinY = 0;
      b.dropT = 0;
      sw.strokeCount = pl.strokeCountThisHole || (isTeeShot ? 1 : Math.max(1, pl.strokeCountThisHole));
      if (sw.strokeCount < 1) sw.strokeCount = 1;
      sw.spinX = 0; sw.spinY = 0; sw.shotType = 'normal';
      golferFactorsRef.current = pl.factors;
      aimAtFlag();
      autoPickClubAndZoom();
      // Human tee shots start in walking mode — the player spawns at
      // the clubhouse (south of the tee box) and has to walk over to
      // the ball before a TEE OFF button lets them swing. NPCs and
      // fairway shots go straight to AIMING.
      if (!pl.isNPC && isTeeShot) {
        sw.state = SW.IDLE;
        p.x = b.x + 2;
        p.y = b.y + 72;  // ~4.5 tiles south of the tee
        p.facing = 'N';
        p.moving = false;
        p.walkPhase = 0;
      } else {
        sw.state = SW.AIMING;
        sw.aimLocked = false;
        sw.prePowerCap = 1.0;
        sw.aimBaseAngle = sw.aimAngle;
        const pose = addressPose(b, sw.aimAngle);
        p.x = pose.px; p.y = pose.py; p.facing = pose.facing; p.moving = false;
      }
      setTurnHud({ name: pl.name, isNPC: pl.isNPC });
      npcCooldownRef.current = pl.isNPC ? 0.55 : 0;
      npcPendingRef.current = pl.isNPC;
      flushHud();
    };

    const pickNextPlayerIdx = () => {
      // Farthest-from-pin rule. Among players who haven't holed out
      // this hole, the one with the greatest pin distance plays next.
      const flagX = FLAG.x * TILE, flagY = FLAG.y * TILE;
      let bestIdx = -1;
      let bestDist = -Infinity;
      for (let i = 0; i < playersRef.current.length; i++) {
        const pl = playersRef.current[i];
        if (pl.holedOutThisHole) continue;
        const d = Math.hypot(pl.ballX - flagX, pl.ballY - flagY);
        if (d > bestDist) { bestDist = d; bestIdx = i; }
      }
      return bestIdx;
    };

    const finishHoleForPlayer = (idx, holed) => {
      const pl = playersRef.current[idx];
      if (!pl) return;
      if (holed) pl.holedOutThisHole = true;
      // Record score only when holed — leaving one in the rough still
      // keeps the hole "in progress" until they hole out.
      if (holed) {
        const holeNum = holeIdxRef.current + 1;
        const existing = pl.scores.find((s) => s.hole === holeNum);
        if (!existing) {
          pl.scores = [...pl.scores, {
            hole: holeNum, par: CURRENT_HOLE.par, strokes: swingRef.current.strokeCount,
          }];
        }
        flushPlayersHud();
      }
    };

    // ═══════════════ COURSE-IQ SHOT PLANNER ═══════════════
    // Returns { aimAngle, clubIdx, power, shotType } for an NPC with
    // decent Course IQ so they can steer around trees, lay up past
    // water, and go for par-5 greens when it's actually reachable.
    // Low-IQ NPCs skip this and fall through to the pin-at-full-send
    // defaults. The returned plan is the IDEAL target — runNPCSwing
    // still adds per-stat noise on top.
    const invertCarry = (club, targetPx) => {
      const full = computeCarry(club, 1.0);
      if (full <= 1) return 1;
      if (club.angle === 0) {
        return Math.max(0.2, Math.min(1, targetPx / full));
      }
      return Math.max(0.2, Math.min(1, Math.sqrt(Math.max(0, targetPx) / full) * 1.03));
    };
    const treeIntersectsRay = (bx, by, lx, ly, clearance) => {
      if (!TREES || !TREES.length) return false;
      const dxR = lx - bx, dyR = ly - by;
      const len2 = dxR * dxR + dyR * dyR;
      if (len2 < 1) return false;
      const cl = clearance + TREE_CANOPY_R;
      for (const t of TREES) {
        const tx = t.x * TILE, ty = t.y * TILE;
        const tAlong = Math.max(0, Math.min(1, ((tx - bx) * dxR + (ty - by) * dyR) / len2));
        const cx = bx + dxR * tAlong;
        const cy = by + dyR * tAlong;
        const d = Math.hypot(tx - cx, ty - cy);
        if (d < cl) return true;
      }
      return false;
    };
    const surfaceScore = (wx, wy) => {
      if (wx < 0 || wx > WORLD_W || wy < 0 || wy > WORLD_H) return -320;
      const props = surfacePropsAt(wx, wy);
      if (props?.hazard) return -320;
      const label = props?.label || '';
      if (label === 'Green') return 160;
      if (label === 'Fringe') return 110;
      if (label === 'Fairway' || label === 'Tee Box') return 90;
      if (label === 'Rough') return -20;
      if (label === 'Bunker') return -70;
      if (label === 'Dirt') return -55;
      return 0;
    };
    const chooseShotPlan = (pl, bx, by, fx, fy, opts = {}) => {
      const baseIQ = pl.golfer?.mental?.courseManagement ?? 50;
      const courseIQ = opts.forceIQ != null ? Math.max(baseIQ, opts.forceIQ) : baseIQ;
      if (courseIQ < 55) return null;
      if (surfaceAt(bx, by) === T_GREEN) return null; // putter logic handles this
      const dxP = fx - bx, dyP = fy - by;
      const distPx = Math.hypot(dxP, dyP);
      const distYd = distPx / TILE * YARDS_PER_TILE;
      const aimPin = Math.atan2(dxP, -dyP);
      const candidates = [];
      // 1. Direct at pin, club sized to reach.
      const directIdx = pickClubForDistance(distYd, false);
      candidates.push({ aimAngle: aimPin, clubIdx: directIdx, targetPx: distPx, shotType: 'normal', label: 'direct' });
      // 2. Half-speed with the direct club (lay-up around trouble).
      candidates.push({ aimAngle: aimPin, clubIdx: directIdx, targetPx: distPx * 0.75, shotType: 'normal', label: 'soft' });
      // 3. Pin ± 10° at full power — route around obstacles.
      for (const offset of [-0.18, 0.18]) {
        candidates.push({ aimAngle: aimPin + offset, clubIdx: directIdx, targetPx: distPx, shotType: 'normal', label: 'side' });
      }
      // 4. Par-5 "go for it" with a driver / 3W if distance demands it.
      if (distYd > 210 && CLUBS[0].key === 'DR') {
        const driverCarry = computeCarry(CLUBS[0], 1.0);
        if (driverCarry > distPx * 0.85) {
          candidates.push({ aimAngle: aimPin, clubIdx: 0, targetPx: Math.min(driverCarry, distPx), shotType: 'normal', label: 'send' });
        }
      }
      // 5. Lay up to ~80 yd short so the next club is a full wedge.
      if (distYd > 140) {
        const layupPx = distPx - (80 * TILE / YARDS_PER_TILE);
        if (layupPx > 40) {
          const layupYd = layupPx / TILE * YARDS_PER_TILE;
          const layupIdx = pickClubForDistance(layupYd, false);
          candidates.push({ aimAngle: aimPin, clubIdx: layupIdx, targetPx: layupPx, shotType: 'normal', label: 'layup' });
        }
      }
      // Score each — higher is better.
      let bestScore = -Infinity;
      let best = null;
      for (const c of candidates) {
        const club = CLUBS[c.clubIdx];
        const power = invertCarry(club, c.targetPx);
        const actualPx = club.angle === 0 ? club.v * power * 0.9
          : (club.v * power) ** 2 * Math.sin(2 * club.angle * Math.PI / 180) / GRAVITY;
        const lx = bx + Math.sin(c.aimAngle) * actualPx;
        const ly = by - Math.cos(c.aimAngle) * actualPx;
        let score = surfaceScore(lx, ly);
        // Tree cost — more painful if we're NOT aiming offset to
        // dodge (direct / send / layup shots through a tree line are
        // worse than a deliberate side route).
        if (treeIntersectsRay(bx, by, lx, ly, 4)) {
          score -= (c.label === 'side') ? 40 : 140;
        }
        // Reward getting closer to the pin next shot.
        const remain = Math.hypot(fx - lx, fy - ly);
        score -= remain * 0.32;
        // Slight penalty for deliberate layups so smart NPCs still
        // fire at the flag when the line is clear.
        if (c.label === 'soft' || c.label === 'layup') score -= 18;
        if (score > bestScore) {
          bestScore = score;
          best = { aimAngle: c.aimAngle, clubIdx: c.clubIdx, power, shotType: c.shotType };
        }
      }
      return best;
    };

    const runNPCSwing = () => {
      const idx = currentPlayerIdxRef.current;
      const pl = playersRef.current[idx];
      if (!pl || !pl.isNPC) return;
      const b = ballRef.current;
      const sw = swingRef.current;
      const flagX = FLAG.x * TILE, flagY = FLAG.y * TILE;
      const dx = flagX - b.x, dy = flagY - b.y;
      const distPx = Math.hypot(dx, dy);
      const distYd = distPx / TILE * YARDS_PER_TILE;
      const onGreen = surfaceAt(b.x, b.y) === T_GREEN;
      const stats = pl.golfer?.stats || {};
      const mental = pl.golfer?.mental || {};
      const acc = stats.accuracy ?? 50;
      const power = stats.power ?? 50;
      const touch = stats.touch ?? 50;
      const composure = mental.composure ?? 50;
      // Consult the Course-IQ planner — smart NPCs route around trees
      // and hazards; low-IQ NPCs fall back to pin-at-pin defaults.
      // If the NPC just rinsed it / went OOB, force the planner on (so
      // they can see the water score −320 and pick a safer candidate)
      // AND back off power by 15% per retry, capped at 3 retries. Keeps
      // a bad-luck NPC from sending it into the water five shots in a row.
      const retries = Math.min(3, pl.hazardRetries || 0);
      const planOpts = retries > 0 ? { forceIQ: 80 } : {};
      const plan = chooseShotPlan(pl, b.x, b.y, flagX, flagY, planOpts);
      if (plan && retries > 0) {
        plan.power = Math.max(0.35, plan.power * Math.pow(0.85, retries));
      }
      const clubIdx = plan ? plan.clubIdx : pickClubForDistance(distYd, onGreen);
      sw.clubIdx = clubIdx;
      const club = CLUBS[clubIdx];
      const planAim = plan ? plan.aimAngle : Math.atan2(dx, -dy);
      // Base aim — plan target if we have one, otherwise straight at
      // the pin — then noise inversely proportional to accuracy.
      const accNoise = (Math.random() - 0.5) * 2 * (0.20 - Math.min(0.18, acc / 600));
      sw.aimAngle = planAim + accNoise;
      if (plan) sw.shotType = plan.shotType;
      let powerPct;
      if (onGreen) {
        // Putting physics: ball launches horizontally and decays
        // LINEARLY via sp.rollDecel * 40 px/s², so roll distance
        // scales with v0² — a linear dist/carry ratio wildly under-
        // hits. Invert the quadratic so the NPC actually reaches the
        // cup: v0 = sqrt(2 · R · d). That was the "12 on a short putt
        // because it kept missing short" bug.
        const surf = surfacePropsAt(b.x, b.y);
        const R = (surf?.rollDecel || 0.85) * 40;
        const overshoot = 1.08; // bias slightly past the hole
        const desiredV0 = Math.sqrt(2 * R * Math.max(1, distPx)) * overshoot;
        const tapFullV0 = club.v * 0.5;   // SHOT_TYPE_PROFILES.tap.carry
        const normalFullV0 = club.v * 1.0;
        if (desiredV0 <= tapFullV0) {
          sw.shotType = 'tap';
          powerPct = desiredV0 / tapFullV0;
        } else {
          sw.shotType = 'normal';
          powerPct = desiredV0 / normalFullV0;
        }
        // Putt precision comes from TOUCH, not raw power. Small noise
        // so the NPC doesn't yank a gimme 40% short.
        const puttNoise = (Math.random() - 0.5) * 2 * Math.max(0.02, 0.14 - touch / 700);
        powerPct = Math.max(0.25, Math.min(1.0, powerPct + puttNoise));
      } else {
        // Approach / tee shots: projectile carry scales with v² (which
        // is power²), so the inverse is sqrt(target / fullCarry), not
        // target / fullCarry. The legacy linear formula was the reason
        // NPCs kept coming up short — a 60% target needed ~77% power.
        let basePower;
        if (plan) {
          // Course-IQ planner already sized the power to the target.
          basePower = plan.power;
        } else {
          const carryPx = computeCarry(club, 1.0);
          const ratio = Math.max(0, Math.min(1, distPx / Math.max(1, carryPx)));
          basePower = Math.max(0.2, Math.min(1.0, Math.sqrt(ratio) * 1.03));
        }
        // Noise tightens as PWR rises: 50 → ±0.12, 90 → ±0.04.
        const noiseRange = Math.max(0.03, 0.17 - power / 700);
        const powerNoise = (Math.random() - 0.5) * 2 * noiseRange;
        const clutchBump = (distYd < 80 ? (composure - 50) / 700 : 0);
        powerPct = Math.max(0.15, Math.min(1.0, basePower + powerNoise + clutchBump));
      }
      // Shape: small spin coming from touch.
      sw.spinX = ((Math.random() - 0.5) * 2) * (1 - touch / 120) * 0.35;
      sw.spinY = 0;
      // Fire.
      b.lastGoodX = b.x; b.lastGoodY = b.y;
      const liePhys = surfacePropsAt(b.x, b.y);
      const clubStats = bagStatsRef.current[club.key] || null;
      lastShotRef.current = {
        clubShort: club.short || club.key,
        clubName: club.name || '',
        shotType: sw.shotType || 'normal',
        powerPct: Math.round(powerPct * 100),
        accuracy: 0,
        startX: b.x, startY: b.y,
        startLie: liePhys?.label || '—',
        carryYd: null, endLie: null, holed: false,
      };
      launchBall(b, sw.aimAngle, powerPct, 0, sw.spinX, sw.spinY, club, {
        golferFactors: pl.factors,
        clubStats,
        liePhys,
        shotType: sw.shotType || 'normal',
      });
      sw.state = SW.FLYING;
      sw.strokeCount++;
      sw.strikeT = Date.now();
      sw.spinX = 0; sw.spinY = 0; sw.shotType = 'normal';
      zoomUserOverrideRef.current = false;
      flushHud();
    };

    // Expose the tee-off transition so the TEE OFF button can call it.
    // Swaps SW.IDLE → SW.AIMING, aims at the flag, and snaps the
    // golfer into an address pose next to the ball.
    teeOffRef.current = () => {
      const b = ballRef.current;
      const p = posRef.current;
      const sw = swingRef.current;
      if (sw.state !== SW.IDLE) return;
      sw.state = SW.AIMING;
      sw.aimLocked = false;
      sw.prePowerCap = 1.0;
      sw.aimBaseAngle = sw.aimAngle;
      aimAtFlag();
      autoPickClubAndZoom();
      const pose = addressPose(b, sw.aimAngle);
      p.x = pose.px; p.y = pose.py; p.facing = pose.facing; p.moving = false;
      canTeeOffRef.current = false;
      setCanTeeOff(false);
      flushHud();
    };

    const flushHud = () => {
      const sw = swingRef.current;
      const ball = ballRef.current;
      const club = CLUBS[sw.clubIdx];
      const carryPx = computeCarry(club, 1.0);
      const carryYd = Math.round(carryPx / TILE * YARDS_PER_TILE);
      const pinDistPx = Math.hypot(ball.x - FLAG.x * TILE, ball.y - FLAG.y * TILE);
      const pinYd = Math.round(pinDistPx / TILE * YARDS_PER_TILE);
      const lie = surfacePropsAt(ball.x, ball.y).label;
      let message = null;
      if (sw.state === SW.HAZARD) message = 'IN THE WATER — +1 penalty';
      else if (sw.state === SW.OB) message = 'OUT OF BOUNDS — +1 penalty';
      else if (sw.state === SW.HOLED) {
        const par = CURRENT_HOLE.par;
        const s = sw.strokeCount;
        const vs = s - par;
        let tag = '';
        if (vs <= -3) tag = 'ALBATROSS';
        else if (vs === -2) tag = 'EAGLE';
        else if (vs === -1) tag = 'BIRDIE';
        else if (vs === 0) tag = 'PAR';
        else if (vs === 1) tag = 'BOGEY';
        else if (vs === 2) tag = 'DOUBLE';
        else tag = `+${vs}`;
        message = `HOLED IN ${s}  ·  ${tag}`;
      }
      setHud({
        state: sw.state,
        club: club.name, clubShort: club.short, clubCarryYd: carryYd,
        strokes: sw.strokeCount, pinYd, lie,
        windMph: windRef.current.mph,
        windAngleDeg: (windRef.current.angle * 180 / Math.PI) % 360,
        message,
        spinX: sw.spinX, spinY: sw.spinY, shape: shapeLabel(sw.spinX, sw.spinY),
        holeName: CURRENT_HOLE.name, holePar: CURRENT_HOLE.par, holeIdx: holeIdxRef.current,
        zoom: zoomRef.current,
        aimLocked: !!sw.aimLocked, prePowerCap: sw.prePowerCap ?? 1.0,
      });
    };
    flushHud();

    // v0.75 — boot scene is the clubhouse, not a hole. Place the
    // player at the clubhouse spawn (TEE field of the clubhouse def)
    // and skip match/player init until the round actually starts via
    // enterMode('round'). The ball is parked off-canvas so the
    // existing draw paths happily ignore it in clubhouse mode.
    const placePlayerAtSpawn = () => {
      const p = posRef.current;
      const b = ballRef.current;
      p.x = TEE.x * TILE;
      p.y = TEE.y * TILE;
      p.facing = 'N';
      p.moving = false;
      p.walkPhase = 0;
      b.x = -100; b.y = -100; b.z = 0;
      b.vx = 0; b.vy = 0; b.vz = 0;
      b.state = 'rest';
      b.lastGoodX = b.x; b.lastGoodY = b.y;
      b.trail = [];
      swingRef.current.state = SW.IDLE;
      swingRef.current.aimLocked = false;
      swingRef.current.prePowerCap = 1.0;
    };
    placePlayerAtSpawn();

    // Place the ball on the practice tee (range / putting modes) and
    // park the golfer at the address pose, ready to swing. No score,
    // no players list — these modes are stateless practice loops.
    const placeBallForPractice = () => {
      const b = ballRef.current;
      const sw = swingRef.current;
      b.x = TEE.x * TILE;
      b.y = TEE.y * TILE;
      b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0;
      b.state = 'rest';
      b.lastGoodX = b.x; b.lastGoodY = b.y;
      b.trail = [];
      b.spinX = 0; b.spinY = 0; b.dropT = 0;
      sw.spinX = 0; sw.spinY = 0;
      sw.shotType = 'normal';
      sw.strokeCount = 1;
      sw.aimLocked = false;
      sw.prePowerCap = 1.0;
      aimAtFlag();
      sw.aimBaseAngle = sw.aimAngle;
      sw.state = SW.AIMING;
      const pose = addressPose(b, sw.aimAngle);
      const p = posRef.current;
      p.x = pose.px; p.y = pose.py; p.facing = pose.facing; p.moving = false;
      // Range counter — incremented each swing for the HUD.
      practiceShotCountRef.current = 0;
      practiceResetTimerRef.current = 0;
    };

    // Mode entry — swap the world, reset transient state, place
    // entities. The single source of truth for "what game mode are
    // we in" lives in gameModeRef.current; the React state mirror
    // (gameMode) drives HUD reactivity.
    const enterMode = (mode, opts = {}) => {
      // 1. Cancel any in-flight transient state from the previous mode.
      walkOutRef.current.active = false;
      walkOutRef.current.fading = false;
      walkOutRef.current.fadeT = 0;
      walkOutHudRef.current = { active: false, dir: 0, fadeAlpha: 0 };
      setWalkOutHud({ active: false, dir: 0, fadeAlpha: 0 });
      npcPendingRef.current = false;
      npcCooldownRef.current = 0;
      setNpcDialog(null);
      setInteraction(null);
      interactionRef.current = null;
      setMatchSetupOpen(false);
      setScorecardOpen(false);
      setLastShotHud(null);
      lastShotRef.current = null;
      canTeeOffRef.current = false;
      setCanTeeOff(false);

      // 2. Load the new world.
      if (mode === 'clubhouse')      loadClubhouse(orientation);
      else if (mode === 'range')     loadRange(orientation);
      else if (mode === 'putting')   loadPutting(orientation);
      else if (mode === 'round') {
        holeIdxRef.current = 0;
        loadHole(0, orientation);
      }
      rebuildStatic();
      randomizeWind();
      leavesRef.current = [];
      burstLeaves.length = 0;
      pinShake.t = 999;
      pinShake.intensity = 0;
      for (let i = 0; i < MAX_LEAVES; i++) {
        const l = spawnLeaf(windRef.current.x, windRef.current.y);
        l.age = Math.random() * l.maxAge;
        l.x = Math.random() * WORLD_W;
        l.y = Math.random() * WORLD_H;
        leavesRef.current.push(l);
      }

      // 3. Per-mode entity setup.
      gameModeRef.current = mode;
      setGameMode(mode);
      if (mode === 'clubhouse') {
        placePlayerAtSpawn();
      } else if (mode === 'range') {
        // Driver default — what most folks practice with at a range.
        swingRef.current.clubIdx = 0;
        placeBallForPractice();
      } else if (mode === 'putting') {
        // Putter — find by key so a CLUBS reorder doesn't break this.
        const ptIdx = CLUBS.findIndex((c) => c.key === 'PT');
        swingRef.current.clubIdx = ptIdx >= 0 ? ptIdx : (CLUBS.length - 1);
        placeBallForPractice();
      } else if (mode === 'round') {
        initPlayersFromMatch();
        loadActivePlayer(true);
      }

      flushHud();
    };
    enterModeRef.current = enterMode;

    const advanceHole = () => {
      const wrapping = (holeIdxRef.current + 1) >= HOLES.length;
      holeIdxRef.current = (holeIdxRef.current + 1) % HOLES.length;
      if (wrapping) {
        // New round — reset each player's scores.
        for (const pl of playersRef.current) pl.scores = [];
        scoresRef.current = [];
        setScoresHud([]);
        flushPlayersHud();
      }
      setScorecardOpen(false);
      loadHole(holeIdxRef.current, orientation);
      rebuildStatic();
      randomizeWind();
      leavesRef.current = [];
      burstLeaves.length = 0;
      pinShake.t = 999;
      pinShake.intensity = 0;
      for (let i = 0; i < MAX_LEAVES; i++) {
        const l = spawnLeaf(windRef.current.x, windRef.current.y);
        l.age = Math.random() * l.maxAge;
        l.x = Math.random() * WORLD_W;
        l.y = Math.random() * WORLD_H;
        leavesRef.current.push(l);
      }
      resetPlayersForHole();
      loadActivePlayer(true);
      flushHud();
    };

    // v0.75 — practice-mode rest handler. Replaces the round
    // settleBallTransitions for range / putting since there are no
    // players, no scorecard, and no hazard penalty pause to honour.
    // When the ball stops we record the carry, update the practice
    // HUD, then arm a short timer so the ball auto-resets onto the
    // mat for the next swing.
    const settlePracticeBall = () => {
      const ball = ballRef.current;
      const sw = swingRef.current;
      if (ball.state === 'rolling') sw.state = SW.ROLLING;
      else if (ball.state === 'dropping') sw.state = SW.DROPPING;
      else if (ball.state === 'stopped' || ball.state === 'holed' || ball.state === 'hazard' || ball.state === 'ob') {
        if (lastShotRef.current && lastShotRef.current.carryYd === null) {
          const ls = lastShotRef.current;
          const distPx = Math.hypot(ball.x - ls.startX, ball.y - ls.startY);
          ls.carryYd = Math.round(distPx / TILE * YARDS_PER_TILE);
          ls.endLie = ball.state === 'holed'
            ? 'Holed'
            : (surfacePropsAt(ball.x, ball.y)?.label || '—');
          ls.holed = ball.state === 'holed';
          setLastShotHud({ ...ls });
        }
        practiceShotCountRef.current++;
        const ls = lastShotRef.current;
        const yd = ls?.carryYd || 0;
        if (yd > bestRangeShotRef.current) bestRangeShotRef.current = yd;
        setPracticeHud({
          shots: practiceShotCountRef.current,
          lastYd: yd,
          bestYd: bestRangeShotRef.current,
        });
        sw.state = SW.STOPPED;
        // Hazard / OB resets faster so the player isn't waiting on a
        // splash they don't care about in practice.
        practiceResetTimerRef.current =
          (ball.state === 'hazard' || ball.state === 'ob') ? 0.6 : 1.4;
      }
    };

    const settleBallTransitions = () => {
      const ball = ballRef.current;
      const sw = swingRef.current;
      if (ball.state === 'rolling') sw.state = SW.ROLLING;
      else if (ball.state === 'dropping') sw.state = SW.DROPPING;
      else if (ball.state === 'stopped' || ball.state === 'holed') {
        // Finalize the last-shot stats (summary card needs carry + end lie).
        if (lastShotRef.current && lastShotRef.current.carryYd === null) {
          const ls = lastShotRef.current;
          const distPx = Math.hypot(ball.x - ls.startX, ball.y - ls.startY);
          ls.carryYd = Math.round(distPx / TILE * YARDS_PER_TILE);
          ls.endLie = ball.state === 'holed'
            ? 'Holed'
            : (surfacePropsAt(ball.x, ball.y)?.label || '—');
          ls.holed = ball.state === 'holed';
          setLastShotHud({ ...ls });
        }
        const holed = ball.state === 'holed';
        // Successful dry landing — clear the hazard-retry streak so
        // the NPC's next approach doesn't still be scaled down.
        const activePlayerForReset = playersRef.current[currentPlayerIdxRef.current];
        if (activePlayerForReset) activePlayerForReset.hazardRetries = 0;
        const activeIdx = currentPlayerIdxRef.current;
        const active = playersRef.current[activeIdx];
        if (active) active.teedOff = true;
        saveActivePlayer();
        finishHoleForPlayer(activeIdx, holed);
        const allHoled = playersRef.current.every((pl) => pl.holedOutThisHole);
        if (allHoled) {
          // Solo round: skip the scorecard auto-pop and drop the player
          // back into walking mode on the green. The tick loop watches
          // for proximity to the north world edge and fires advanceHole
          // through a black fade (see walkOutRef below).
          const soloHuman = playersRef.current.length === 1 && !playersRef.current[0].isNPC;
          if (holed && soloHuman) {
            sw.state = SW.IDLE;
            sw.messageTimer = 0;
            // Plant the golfer on top of their ball (which is in the
            // cup) so they "step back" out of the hole before walking.
            const pNow = posRef.current;
            pNow.x = ball.x;
            pNow.y = ball.y + 6;
            pNow.moving = false;
            pNow.facing = 'N';
            // Waypoint: top-center of the world, a few px south of the
            // edge so the trigger fires while the sprite is still on
            // screen. 24 px ≈ 1.5 tiles is loose enough that a shallow
            // joystick push still crosses it.
            walkOutRef.current.active = true;
            walkOutRef.current.targetX = WORLD_W / 2;
            walkOutRef.current.targetY = 12;
            walkOutRef.current.fading = false;
            walkOutRef.current.fadeT = 0;
            walkOutRef.current.fadePhase = 'in';
            // Clear the TEE-OFF-near-ball check — the ball is sitting
            // in the cup right under the golfer.
            canTeeOffRef.current = false;
            setCanTeeOff(false);
            setWalkOutHud({ active: true, dir: -Math.PI / 2, fadeAlpha: 0 });
            flushHud();
          } else {
            sw.state = SW.HOLED;
            sw.messageTimer = 0;
            setScorecardOpen(true);
            flushHud();
          }
        } else {
          const nextIdx = pickNextPlayerIdx();
          if (nextIdx < 0) {
            sw.state = SW.HOLED;
            setScorecardOpen(true);
            flushHud();
          } else {
            currentPlayerIdxRef.current = nextIdx;
            const isTee = !playersRef.current[nextIdx].teedOff;
            loadActivePlayer(isTee);
          }
        }
      }
      else if (ball.state === 'hazard') {
        // Play the splash first, wait 20 ms, THEN show the hazard card.
        sw.state = SW.SPLASHING;
        sw.messageTimer = SPLASH_DURATION + SPLASH_PAUSE;
        sw.strokeCount++;
        const pl = playersRef.current[currentPlayerIdxRef.current];
        if (pl) pl.hazardRetries = (pl.hazardRetries || 0) + 1;
        splashFx.x = ball.x;
        splashFx.y = ball.y;
        splashFx.t = 0;
        splashFx.active = true;
        splashFx.droplets.length = 0;
        for (let i = 0; i < 9; i++) {
          const a = Math.PI + (Math.random() * Math.PI);   // upward arcs
          const s = 45 + Math.random() * 40;
          splashFx.droplets.push({
            x: 0, y: 0,
            vx: Math.cos(a) * s * 0.6,
            vy: Math.sin(a) * s,
          });
        }
        flushHud();
      }
      else if (ball.state === 'ob') {
        sw.state = SW.OB; sw.messageTimer = 2.2; sw.strokeCount++;
        const pl = playersRef.current[currentPlayerIdxRef.current];
        if (pl) pl.hazardRetries = (pl.hazardRetries || 0) + 1;
        flushHud();
      }
    };

    const screenToWorld = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const canvasX = (clientX - rect.left) * (canvas.width / rect.width);
      const canvasY = (clientY - rect.top) * (canvas.height / rect.height);
      const cam = cameraRef.current;
      return {
        worldX: cam.camX + canvasX / cam.scale,
        worldY: cam.camY + canvasY / cam.scale,
        canvasX, canvasY,
      };
    };

    const joystickCenter = () => {
      const dpr = window.devicePixelRatio || 1;
      // Shared control-pad slot shared by Walk / Aim / Swing. 130 css
      // px diameter, bottom: 116, right: 14 — so the pad centre sits
      // at (cssW − 79, cssH − 181). Radius 60 leaves ~5 px of frame
      // around the joystick knob.
      return { cx: canvas.width - 79 * dpr, cy: canvas.height - 181 * dpr, radius: 60 * dpr };
    };

    const isInJoystick = (canvasX, canvasY) => {
      // Only claim the zone while the player is walking. Otherwise
      // taps in the bottom-right routinely land on the SWING button.
      if (swingRef.current.state !== SW.IDLE) return false;
      const j = joystickCenter();
      return Math.hypot(canvasX - j.cx, canvasY - j.cy) < j.radius;
    };

    const startSwipe = (canvasX, canvasY) => {
      const sw = swingRef.current;
      if (sw.state !== SW.AIMING) return false;
      sw.state = SW.SWIPING;
      swipeRef.current = {
        startX: canvasX, startY: canvasY,
        currentX: canvasX, currentY: canvasY,
        // Backswing tracking — mirrors App.js swing state machine.
        //   peakDy  = max downward travel from start (charges power)
        //   peakX/Y = lowest point reached during the backswing
        //   locked  = true once the finger reverses back up past a
        //             threshold. Power commits at that moment.
        peakDy: 0,
        peakX: canvasX,
        peakY: canvasY,
        locked: false,
        // Forward-swing deviation — signed peak horizontal drift from
        // the lock point. Drives hook / slice.
        fwdPeakDevX: 0,
      };
      flushHud();
      return true;
    };

    const updateSwipe = (canvasX, canvasY) => {
      const s = swipeRef.current;
      if (!s) return;
      const dpr = window.devicePixelRatio || 1;
      const maxPull = 80 * dpr;
      s.currentX = canvasX; s.currentY = canvasY;
      const dy = canvasY - s.startY;
      if (!s.locked) {
        if (dy > s.peakDy) {
          // Still pulling down — charge power. Clamp at the 100% cap
          // so we can't accumulate "past 100%" internally. Keeps the
          // visual feedback, the internal power, and the committed
          // shot all locked to the same ceiling.
          s.peakDy = Math.min(dy, maxPull);
          s.peakX = canvasX;
          s.peakY = canvasY;
        } else if (s.peakDy > 20 * dpr && (s.peakY - canvasY) > 8 * dpr) {
          // Finger reversed upward past the threshold — LOCK power and
          // enter the forward swing. Power cannot grow beyond this point.
          s.locked = true;
        }
      } else {
        // Forward swing — peak-track the signed horizontal drift from
        // the lock point. The worst moment is what scores (a late
        // recovery doesn't erase a mid-swing wobble).
        const dev = (canvasX - s.peakX) / (45 * dpr);
        const clamped = Math.max(-1, Math.min(1, dev));
        if (Math.abs(clamped) > Math.abs(s.fwdPeakDevX)) {
          s.fwdPeakDevX = clamped;
        }
      }
    };

    const endSwipe = () => {
      const sw = swingRef.current;
      const s = swipeRef.current;
      if (sw.state !== SW.SWIPING || !s) { swipeRef.current = null; return; }
      const ball = ballRef.current;
      const club = CLUBS[sw.clubIdx];
      const dpr = window.devicePixelRatio || 1;
      // Two-phase swing, matching App.js:
      //   Phase 1 (backswing):   pull down → peakDy sets the power ceiling
      //   Phase 2 (forward):     swipe up  → horizontal drift shapes the shot
      // Releasing without a reversal (pure pull-and-lift) aborts — the
      // user must commit to the forward swing for the shot to fire.
      if (!s.locked || s.peakDy < 20 * dpr) {
        sw.state = SW.AIMING;
        swipeRef.current = null;
        flushHud();
        return;
      }
      const swipePower = Math.max(0.1, Math.min(1, s.peakDy / (80 * dpr)));
      // Pre-power cap set during the AimPad phase multiplies the final
      // launched power, so a 100% swipe on a 90%-capped club lands at
      // 90% of full carry.
      const cap = Math.max(0.3, Math.min(1, sw.prePowerCap ?? 1));
      const power = swipePower * cap;
      // Accuracy = forward peak deviation + a small backswing-drift contribution
      // (~25% weight, same blend as App.js).
      const backDev = Math.max(-1, Math.min(1, (s.peakX - s.startX) / (45 * dpr)));
      const accuracy = Math.max(-1, Math.min(1, s.fwdPeakDevX + backDev * 0.25));
      ball.lastGoodX = ball.x; ball.lastGoodY = ball.y;
      const liePhys = surfacePropsAt(ball.x, ball.y);
      const clubStats = bagStatsRef.current[club.key] || null;
      // Stash the start of the shot — end coords + lie are filled in
      // when settleBallTransitions detects the ball has stopped.
      lastShotRef.current = {
        clubShort: club.short || club.key,
        clubName: club.name || '',
        shotType: sw.shotType || 'normal',
        powerPct: Math.round(power * 100),
        accuracy,
        startX: ball.x,
        startY: ball.y,
        startLie: liePhys?.label || '—',
        carryYd: null,
        endLie: null,
        holed: false,
      };
      launchBall(ball, sw.aimAngle, power, accuracy, sw.spinX, sw.spinY, club, {
        golferFactors: golferFactorsRef.current,
        clubStats,
        liePhys,
        shotType: sw.shotType || 'normal',
      });
      sw.state = SW.FLYING;
      sw.strokeCount++;
      sw.strikeT = Date.now();
      // Auto-reset shaping + shot type after every swing — each new shot
      // starts neutral so a deliberate choice is required each time.
      sw.spinX = 0;
      sw.spinY = 0;
      sw.shotType = 'normal';
      shotTypeManualRef.current = false;
      // Release manual zoom override so the next shot gets fresh auto-fit.
      zoomUserOverrideRef.current = false;
      setHudShotType('normal');
      setShotTypeMenuOpen(false);
      swipeRef.current = null;
      flushHud();
    };

    const setAimFromCanvas = (canvasX, canvasY) => {
      const sw = swingRef.current;
      if (sw.state !== SW.AIMING) return;
      const cam = cameraRef.current;
      const worldX = cam.camX + canvasX / cam.scale;
      const worldY = cam.camY + canvasY / cam.scale;
      const ball = ballRef.current;
      const dx = worldX - ball.x;
      const dy = worldY - ball.y;
      if (Math.hypot(dx, dy) < 4) return;
      const targetAngle = Math.atan2(dx, -dy);
      // Damp the aim change. Without this, the projected landing spot
      // sweeps ~3× as fast as the finger on long clubs because a small
      // angle change at the ball maps to a big arc at carry distance.
      // 1/3 lerp per update matches the "about 3x too fast" feedback.
      let delta = targetAngle - sw.aimAngle;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      sw.aimAngle += delta / 3;
    };

    const activePointers = new Map();

    const pd = (e) => {
      const rect = canvas.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
      const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);

      if (isInJoystick(canvasX, canvasY)) {
        const j = joystickCenter();
        joystickRef.current = {
          pointerId: e.pointerId,
          cx: j.cx, cy: j.cy,
          dx: canvasX - j.cx, dy: canvasY - j.cy,
        };
        activePointers.set(e.pointerId, 'joystick');
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      const sw = swingRef.current;
      if (sw.state === SW.AIMING) {
        setAimFromCanvas(canvasX, canvasY);
        activePointers.set(e.pointerId, 'aim');
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (sw.state === SW.HOLED) {
        advanceHole();
        e.preventDefault();
      }
    };

    const pm = (e) => {
      const role = activePointers.get(e.pointerId);
      if (!role) return;
      const rect = canvas.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
      const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
      if (role === 'joystick') {
        const j = joystickRef.current;
        if (j) { j.dx = canvasX - j.cx; j.dy = canvasY - j.cy; }
      } else if (role === 'aim') {
        setAimFromCanvas(canvasX, canvasY);
      } else if (role === 'swipe') {
        updateSwipe(canvasX, canvasY);
      }
    };

    const pu = (e) => {
      const role = activePointers.get(e.pointerId);
      if (role === 'joystick') {
        if (joystickRef.current && joystickRef.current.pointerId === e.pointerId) {
          joystickRef.current = null;
        }
      } else if (role === 'swipe') {
        endSwipe();
      }
      activePointers.delete(e.pointerId);
    };

    canvas.addEventListener('pointerdown', pd);
    canvas.addEventListener('pointermove', pm);
    canvas.addEventListener('pointerup', pu);
    canvas.addEventListener('pointercancel', pu);

    swingButtonCapture.current = {
      start: (canvasX, canvasY, pointerId) => {
        const sw = swingRef.current;
        if (sw.state !== SW.AIMING) return false;
        sw.state = SW.SWIPING;
        swipeRef.current = {
          startX: canvasX, startY: canvasY,
          currentX: canvasX, currentY: canvasY,
          peakDy: 0, peakX: canvasX, peakY: canvasY,
          locked: false, fwdPeakDevX: 0,
          fromButton: true,
        };
        activePointers.set(pointerId, 'swipe');
        flushHud();
        return true;
      },
      move: (canvasX, canvasY) => {
        updateSwipe(canvasX, canvasY);
      },
      end: () => {
        endSwipe();
      },
    };

    const computeMinZoom = () => {
      const dpr = window.devicePixelRatio || 1;
      const baseScale = 2 * dpr;
      const minScaleX = canvas.width / WORLD_W;
      const minScaleY = canvas.height / WORLD_H;
      const minScale = Math.max(minScaleX, minScaleY);
      return Math.max(0.5, minScale / baseScale);
    };

    const clampZoom = (z) => {
      const minZ = computeMinZoom();
      // Putting caps out at 2.0× — anything tighter than that makes the
      // green read as noise and fights the auto-framing on the green.
      const sw = swingRef.current;
      const isPutt = sw && CLUBS[sw.clubIdx] && CLUBS[sw.clubIdx].key === 'PT';
      const maxZ = isPutt ? 2.0 : 3.0;
      return Math.max(minZ, Math.min(maxZ, z));
    };

    zoomActions.current = {
      zoomIn: () => {
        zoomRef.current = clampZoom(zoomRef.current + 0.25);
        // User has taken manual control — stop the aim/putting auto-fit
        // from overriding until the next shot.
        zoomUserOverrideRef.current = true;
        flushHud();
      },
      zoomOut: () => {
        zoomRef.current = clampZoom(zoomRef.current - 0.25);
        zoomUserOverrideRef.current = true;
        flushHud();
      },
    };

    clubActions.current = {
      cycle: (dir) => {
        const sw = swingRef.current;
        if (sw.state !== SW.AIMING) return;
        sw.clubIdx = (sw.clubIdx + dir + CLUBS.length) % CLUBS.length;
        zoomRef.current = (CLUBS[sw.clubIdx].key === 'PT') ? 2.2 : 1.0;
        flushHud();
      },
      set: (idx) => {
        const sw = swingRef.current;
        if (sw.state !== SW.AIMING) return;
        sw.clubIdx = idx;
        zoomRef.current = (CLUBS[sw.clubIdx].key === 'PT') ? 2.2 : 1.0;
        flushHud();
      },
    };

    shapeActions.current = {
      set: (spinX, spinY) => {
        const sw = swingRef.current;
        sw.spinX = Math.max(-1, Math.min(1, spinX));
        sw.spinY = Math.max(-1, Math.min(1, spinY));
        const mag = Math.hypot(sw.spinX, sw.spinY);
        if (mag > 1) { sw.spinX /= mag; sw.spinY /= mag; }
        flushHud();
      },
      reset: () => {
        const sw = swingRef.current;
        sw.spinX = 0; sw.spinY = 0;
        flushHud();
      },
    };

    let last = performance.now();
    let hudAccum = 0;

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = posRef.current;
      const ball = ballRef.current;
      const sw = swingRef.current;
      const w = windRef.current;
      const flagX = FLAG.x * TILE;
      const flagY = FLAG.y * TILE;

      for (const leaf of leavesRef.current) {
        leaf.vx += w.x * 0.35 * dt + (Math.random() - 0.5) * 2 * dt;
        leaf.vy += w.y * 0.35 * dt + (Math.random() - 0.5) * 2 * dt;
        leaf.vx *= 1 - 0.25 * dt;
        leaf.vy *= 1 - 0.25 * dt;
        leaf.x += leaf.vx * dt;
        leaf.y += leaf.vy * dt;
        leaf.age += dt;
        if (leaf.age > leaf.maxAge || leaf.x < -30 || leaf.x > WORLD_W + 30 || leaf.y < -30 || leaf.y > WORLD_H + 30) {
          Object.assign(leaf, spawnLeaf(w.x, w.y));
        }
      }
      // Burst leaves — spawned by tree-hit physics. Drift + fall + cull.
      if (burstLeaves.length) {
        for (let i = burstLeaves.length - 1; i >= 0; i--) {
          const bl = burstLeaves[i];
          bl.vx += w.x * 0.2 * dt + (Math.random() - 0.5) * 6 * dt;
          bl.vy += (w.y * 0.2 + 18) * dt + (Math.random() - 0.5) * 4 * dt;
          bl.vx *= 1 - 1.2 * dt;
          bl.vy *= 1 - 1.2 * dt;
          bl.x += bl.vx * dt;
          bl.y += bl.vy * dt;
          bl.age += dt;
          if (bl.age > bl.maxAge) burstLeaves.splice(i, 1);
        }
      }
      // Advance the pin-shake timer so drawFlag can decay the wobble.
      if (pinShake.t < 10) pinShake.t += dt;

      if (sw.state === SW.IDLE) {
        const j = joystickRef.current;
        let vx = 0, vy = 0;
        if (j) {
          const dpr = window.devicePixelRatio || 1;
          const maxMag = 50 * dpr;
          const mag = Math.hypot(j.dx, j.dy);
          if (mag > 6 * dpr) {
            const nx = j.dx / Math.max(mag, 1);
            const ny = j.dy / Math.max(mag, 1);
            const m = Math.min(1, mag / maxMag);
            vx = nx * m;
            vy = ny * m;
          }
        }
        const speed = 50;
        p.moving = (vx !== 0 || vy !== 0);
        if (Math.abs(vx) > Math.abs(vy)) p.facing = vx > 0 ? 'E' : 'W';
        else if (vy !== 0) p.facing = vy > 0 ? 'S' : 'N';
        const oldX = p.x, oldY = p.y;
        p.x = Math.max(8, Math.min(WORLD_W - 8, p.x + vx * speed * dt));
        p.y = Math.max(8, Math.min(WORLD_H - 8, p.y + vy * speed * dt));
        // v0.75 — clubhouse building collision. Block movement that
        // would push the player into the building footprint. Inflate
        // by 4 px so the sprite doesn't overlap the wall edge.
        if (BUILDING) {
          const bx = BUILDING.x * TILE - 4;
          const by = BUILDING.y * TILE - 4;
          const bw = BUILDING.w * TILE + 8;
          const bh = BUILDING.h * TILE + 8;
          if (p.x > bx && p.x < bx + bw && p.y > by && p.y < by + bh) {
            p.x = oldX; p.y = oldY;
            p.moving = false;
          }
        }
        if (p.moving) p.walkPhase += dt * 8; else p.walkPhase = 0;
        // Surface the TEE OFF button when the golfer walks into the
        // tee box proximity. Suppressed during walk-to-next-hole AND
        // in clubhouse mode (no playable ball there).
        if (!walkOutRef.current.active && gameModeRef.current !== 'clubhouse') {
          const near = Math.hypot(p.x - ball.x, p.y - ball.y) < 22;
          if (near !== canTeeOffRef.current) {
            canTeeOffRef.current = near;
            setCanTeeOff(near);
          }
        }
        // v0.75 clubhouse — walker NPCs patrol between waypoints with
        // a brief idle pause at each end. Proximity probe surfaces the
        // TALK / ENTER button via interactionRef + setInteraction.
        if (gameModeRef.current === 'clubhouse') {
          for (const npc of NPCS) {
            if (npc.type === 'walker') {
              npc.idleT = (npc.idleT || 0) + dt;
              if (!npc.walking && npc.idleT >= (npc.pauseAt || 1.5)) {
                npc.walking = true;
                npc.idleT = 0;
              }
              if (npc.walking) {
                const tgt = npc.dir > 0 ? (npc.wpB || npc) : (npc.wpA || npc);
                const dx = tgt.x - npc.x;
                const dy = tgt.y - npc.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 0.2) {
                  npc.dir = -npc.dir;
                  npc.walking = false;
                  npc.idleT = 0;
                } else {
                  const step = ((npc.speed || 20) / TILE) * dt;
                  const stepClamped = Math.min(step, dist);
                  npc.x += (dx / dist) * stepClamped;
                  npc.y += (dy / dist) * stepClamped;
                  npc.walkPhase = (npc.walkPhase || 0) + dt * 8;
                  if (Math.abs(dx) > Math.abs(dy)) npc.facing = dx > 0 ? 'E' : 'W';
                  else npc.facing = dy > 0 ? 'S' : 'N';
                }
              }
            } else if (npc.type === 'putter') {
              // Subtle facing-flip every few seconds so the putter
              // doesn't read as completely frozen on the green.
              npc.idleT = (npc.idleT || 0) + dt;
              if (npc.idleT > 3.2) {
                npc.idleT = 0;
                npc.facing = npc.facing === 'N' ? 'W' : 'N';
              }
            }
          }
          // Proximity to signs / NPCs → surface the floating TALK or
          // ENTER button.
          let nearest = null;
          let bestDist = 26; // px proximity threshold
          for (const sg of SIGNS) {
            const d = Math.hypot(p.x - sg.x * TILE, p.y - sg.y * TILE);
            if (d < bestDist) {
              bestDist = d;
              nearest = { kind: 'sign', id: sg.id, target: sg.target, label: sg.label };
            }
          }
          for (const npc of NPCS) {
            const d = Math.hypot(p.x - npc.x * TILE, p.y - npc.y * TILE);
            if (d < bestDist) {
              bestDist = d;
              nearest = { kind: 'npc', id: npc.id, label: npc.name };
            }
          }
          const prev = interactionRef.current;
          const changed =
            (!prev && nearest) ||
            (prev && !nearest) ||
            (prev && nearest && (prev.kind !== nearest.kind || prev.id !== nearest.id));
          if (changed) {
            interactionRef.current = nearest;
            setInteraction(nearest);
          }
        }
        // v0.74 walk-to-next-hole tick: drive the waypoint proximity
        // → fade-to-black → advanceHole → fade-back handoff. Arrow
        // rotation is derived further down in the HUD-mirror block.
        const wo = walkOutRef.current;
        if (wo.active) {
          const FADE_DUR = 0.45;
          const dx = wo.targetX - p.x;
          const dy = wo.targetY - p.y;
          if (!wo.fading) {
            // Trigger the fade when the golfer reaches the waypoint
            // or hits the world edge (top 24 px).
            if (Math.hypot(dx, dy) < 24 || p.y < 24) {
              wo.fading = true;
              wo.fadeT = 0;
              wo.fadePhase = 'in';
            }
          } else {
            wo.fadeT += dt;
            if (wo.fadePhase === 'in') {
              if (wo.fadeT >= FADE_DUR) {
                // Covered — advance the hole under the black veil,
                // then play the fade-out at the next tee.
                advanceHole();
                wo.fadePhase = 'out';
                wo.fadeT = 0;
              }
            } else {
              if (wo.fadeT >= FADE_DUR) {
                wo.active = false;
                wo.fading = false;
                wo.fadeT = 0;
              }
            }
          }
        }
      } else if (sw.state === SW.AIMING || sw.state === SW.SWIPING) {
        p.moving = false;
        {
          const pose = addressPose(ball, sw.aimAngle);
          p.x = pose.px; p.y = pose.py;
          // facing is re-read here each tick so rotating aim rotates
          // the sprite + the swing-arc direction too.
          p.facing = pose.facing;
        }
        const j = joystickRef.current;
        if (sw.state === SW.AIMING && j) {
          const dpr = window.devicePixelRatio || 1;
          const mag = Math.hypot(j.dx, j.dy);
          if (mag > 20 * dpr) {
            sw.state = SW.IDLE;
            flushHud();
          }
        }
      } else if (sw.state === SW.FLYING || sw.state === SW.ROLLING || sw.state === SW.DROPPING) {
        stepBall(ball, dt, w.x, w.y, flagX, flagY);
        if (sw.state === SW.FLYING) {
          ball.trail.push({ x: ball.x, y: ball.y, z: ball.z });
          if (ball.trail.length > 40) ball.trail.shift();
        }
        if (gameModeRef.current === 'round') {
          settleBallTransitions();
        } else {
          settlePracticeBall();
        }
      } else if (sw.state === SW.STOPPED) {
        // Practice modes — wait out a short beat after the ball comes
        // to rest, then re-spawn on the mat for the next swing. Round
        // mode never sits in SW.STOPPED (settleBallTransitions hands
        // off to the next player or scorecard immediately).
        if (gameModeRef.current === 'range' || gameModeRef.current === 'putting') {
          practiceResetTimerRef.current -= dt;
          if (practiceResetTimerRef.current <= 0) {
            placeBallForPractice();
          }
        }
      } else if (sw.state === SW.SPLASHING) {
        sw.messageTimer -= dt;
        splashFx.t += dt;
        // Tick droplets — gravity-ish arc and fade.
        for (const d of splashFx.droplets) {
          d.vy += 220 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
        }
        if (sw.messageTimer <= 0) {
          splashFx.active = false;
          splashFx.droplets.length = 0;
          sw.state = SW.HAZARD;
          sw.messageTimer = 2.2;
          flushHud();
        }
      } else if (sw.state === SW.HAZARD || sw.state === SW.OB) {
        sw.messageTimer -= dt;
        if (sw.messageTimer <= 0) {
          ball.x = ball.lastGoodX; ball.y = ball.lastGoodY;
          ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.z = 0;
          ball.state = 'rest';
          ball.trail = [];
          const poseA = addressPose(ball, sw.aimAngle);
          p.x = poseA.px; p.y = poseA.py; p.facing = poseA.facing;
          aimAtFlag();
          autoPickClubAndZoom();
          sw.state = SW.AIMING;
          sw.aimLocked = false;
          sw.prePowerCap = 1.0;
          sw.aimBaseAngle = sw.aimAngle;
          // Persist current-player lie for the match bookkeeping.
          saveActivePlayer();
          // If the player whose ball just got penalised is an NPC,
          // re-kick the NPC auto-swing so the turn doesn't silently
          // stall (the previous runNPCSwing had cleared the pending
          // flag before the ball splashed into the hazard).
          const pl = playersRef.current[currentPlayerIdxRef.current];
          if (pl && pl.isNPC) {
            npcCooldownRef.current = 0.55;
            npcPendingRef.current = true;
          }
          flushHud();
        }
      } else if (sw.state === SW.HOLED) {
        sw.messageTimer -= dt;
        // Auto-advance only for the non-HOLED stall states (HAZARD /
        // OB). HOLED is driven by the scorecard overlay's Next Hole
        // button; the pendingAdvanceRef flag below picks that up.
        if (sw.messageTimer <= 0 && sw.state !== SW.HOLED) {
          advanceHole();
        }
      }
      if (pendingAdvanceRef.current) {
        pendingAdvanceRef.current = false;
        advanceHole();
      }
      // NPC auto-swing: wait out a short cooldown for pacing, then
      // fire runNPCSwing the next tick we're back in SW.AIMING.
      if (npcPendingRef.current) {
        if (npcCooldownRef.current > 0) {
          npcCooldownRef.current -= dt;
        } else if (swingRef.current.state === SW.AIMING) {
          npcPendingRef.current = false;
          runNPCSwing();
        }
      }

      hudAccum += dt;
      if (hudAccum > 0.25) {
        hudAccum = 0;
        setHud((h) => ({ ...h }));
      }

      // Walk-out HUD mirror: drives the NEXT-HOLE banner, directional
      // arrow, and full-screen fade overlay. During the fade we update
      // every tick so the black veil animates smoothly; while the
      // player is walking we only fire when the arrow angle drifts
      // enough to matter (≥ 4°) or the state changes.
      const woS = walkOutRef.current;
      if (woS.active || walkOutHudRef.current.active) {
        let fadeAlpha = 0;
        const FADE_DUR = 0.45;
        if (woS.fading) {
          const tFrac = Math.max(0, Math.min(1, woS.fadeT / FADE_DUR));
          fadeAlpha = woS.fadePhase === 'in' ? tFrac : (1 - tFrac);
        }
        const dir = Math.atan2(woS.targetY - p.y, woS.targetX - p.x);
        const prev = walkOutHudRef.current;
        const angleDelta = Math.abs(((dir - prev.dir + Math.PI) % (2 * Math.PI)) - Math.PI);
        const needsUpdate =
          prev.active !== woS.active ||
          woS.fading ||
          Math.abs(fadeAlpha - prev.fadeAlpha) > 0.001 ||
          angleDelta > 0.07;
        if (needsUpdate) {
          const next = { active: woS.active, dir, fadeAlpha };
          walkOutHudRef.current = next;
          setWalkOutHud(next);
        }
      }

      const viewW = canvas.width;
      const viewH = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      const baseScale = 2 * dpr;
      const minScale = Math.max(viewW / WORLD_W, viewH / WORLD_H);
      const minZoomHere = Math.max(0.5, minScale / baseScale);
      const cMode = cameraModeRef.current;
      const isTabletGS = (viewW / dpr) >= 700;
      const selectedClub = CLUBS[sw.clubIdx] || CLUBS[0];
      const isPutting = selectedClub.key === 'PT';
      // Zoom is fixed — 1.0× normally, 1.5× when putting. No +/- manual
      // override, no auto-fit fiddling. The minZoom floor still applies
      // so tiny viewports don't clip the world.
      zoomRef.current = Math.max(minZoomHere, isPutting ? 1.5 : 1.0);
      // Putter auto-shot-type: pick Tap (50% roll) when the ball is
      // close enough that a normal putt would sail past the cup.
      if (isPutting && (sw.state === SW.IDLE || sw.state === SW.AIMING || sw.state === SW.SWIPING || sw.state === SW.STOPPED)
          && !shotTypeManualRef.current) {
        const flagX = FLAG.x * TILE;
        const flagY = FLAG.y * TILE;
        const dist = Math.hypot(flagX - ball.x, flagY - ball.y);
        const tapReach = selectedClub.v * 0.5;
        const want = dist <= tapReach ? 'tap' : 'normal';
        if (sw.shotType !== want) {
          sw.shotType = want;
          if (hudShotType !== want) setHudShotType(want);
        }
      }
      const scale = baseScale * zoomRef.current;
      let followX, followY, anchorOffsetX = 0, anchorOffsetY = 0;
      // Ball-in-motion always wins over the VIEW toggle — once the
      // player has swung, the camera leads the ball so the shot is
      // actually visible. Applies equally to aim mode, golfer mode,
      // and putting.
      const ballMoving =
        sw.state === SW.FLYING || sw.state === SW.ROLLING || sw.state === SW.DROPPING;
      if (ballMoving) {
        const lead = sw.state === SW.FLYING ? 0.6 : 0.3;
        followX = ball.x + (ball.vx || 0) * lead;
        followY = ball.y + (ball.vy || 0) * lead;
        anchorOffsetX = isTabletGS ? (viewW * 0.20) / scale : 0;
        anchorOffsetY = isTabletGS ? 0 : -(viewH * 0.22) / scale;
      } else if (isPutting && (sw.state === SW.IDLE || sw.state === SW.AIMING || sw.state === SW.SWIPING || sw.state === SW.STOPPED)) {
        const flagX = FLAG.x * TILE;
        const flagY = FLAG.y * TILE;
        followX = (ball.x + flagX) / 2;
        followY = (ball.y + flagY) / 2;
      } else if (cMode === 'golfer') {
        followX = p.x;
        followY = p.y;
      } else {
        // Aim mode — project where the ball will land so the camera shows
        // the LANDING SPOT, not the player. Applies on the tee (state=IDLE),
        // while aiming, and during the swipe — otherwise the aim toggle
        // would read "Aim" but the view would be on the player at setup,
        // which matches the bug the player reported on the tee.
        // While the ball is flying/rolling/settling, follow the ball itself
        // with a small velocity lead so fast shots don't outrun the frame.
        const club = CLUBS[sw.clubIdx] || CLUBS[0];
        // Real carry distance (projectile range), not club.v (launch speed).
        const clubCarryPx = computeCarry(club, 1.0);
        const isSetupPhase =
          sw.state === SW.AIMING || sw.state === SW.SWIPING;
        const isWalking = sw.state === SW.IDLE;
        const isBallMoving =
          sw.state === SW.FLYING || sw.state === SW.ROLLING || sw.state === SW.DROPPING;
        if (isWalking) {
          // Walking — camera follows the PLAYER (they're out walking
          // the course), not the projected landing spot.
          followX = p.x;
          followY = p.y;
          anchorOffsetX = 0;
          anchorOffsetY = 0;
        } else if (isSetupPhase) {
          const activePlayer = playersRef.current[currentPlayerIdxRef.current];
          const isNPCTurn = activePlayer && activePlayer.isNPC;
          if (isNPCTurn) {
            // NPC setup: frame the golfer (sprite) so the player sees
            // WHO is about to hit. When the NPC swings (state →
            // FLYING) the ballMoving branch below takes over and
            // tracks the ball.
            followX = p.x;
            followY = p.y;
            anchorOffsetX = 0;
            anchorOffsetY = 0;
          } else {
            // Human VIEW=AIM framing: follow the projected LANDING
            // spot, and push it toward the top of the frame so the
            // player always sees where the shot will land. On long
            // clubs the ball may slide off the bottom edge, but the
            // aim crosshair stays clearly visible — that's the whole
            // point of the AIM view. (The v0.68 midpoint experiment
            // lost the crosshair on a H2 driver carry.)
            const lx = ball.x + Math.sin(sw.aimAngle) * clubCarryPx;
            const ly = ball.y - Math.cos(sw.aimAngle) * clubCarryPx;
            // Bias the followed point slightly back toward the ball so
            // short shots keep both endpoints in frame, but heavily
            // toward the landing so long drives don't push the
            // crosshair off the top of the screen.
            followX = lx * 0.9 + ball.x * 0.1;
            followY = ly * 0.9 + ball.y * 0.1;
            anchorOffsetX = isTabletGS ? (viewW * 0.18) / scale : 0;
            anchorOffsetY = isTabletGS ? 0 : -(viewH * 0.22) / scale;
          }
        } else if (isBallMoving) {
          // Flight framing: lead the ball aggressively and push it toward
          // the BOTTOM of the frame so the arc/apex/landing fills the top
          // ~70% of the screen. Strong lead (~0.6s of current velocity)
          // keeps the flight path visible as the ball climbs and drops.
          const lead = sw.state === SW.FLYING ? 0.6 : 0.3;
          followX = ball.x + (ball.vx || 0) * lead;
          followY = ball.y + (ball.vy || 0) * lead;
          // Anchor the ball in the lower quarter of the frame. anchorOffsetY
          // is subtracted from camY, so a negative value pushes camY up in
          // world space — which draws the followed point LOWER on screen.
          anchorOffsetX = isTabletGS ? (viewW * 0.20) / scale : 0;
          anchorOffsetY = isTabletGS ? 0 : -(viewH * 0.22) / scale;
        } else {
          followX = ball.x;
          followY = ball.y;
        }
      }
      const visibleW = viewW / scale;
      const visibleH = viewH / scale;
      const camMaxX = Math.max(0, WORLD_W - visibleW);
      const camMaxY = Math.max(0, WORLD_H - visibleH);
      const camX = Math.max(0, Math.min(camMaxX, followX - visibleW / 2 - anchorOffsetX));
      const camY = Math.max(0, Math.min(camMaxY, followY - visibleH / 2 - anchorOffsetY));
      cameraRef.current.camX = camX;
      cameraRef.current.camY = camY;
      cameraRef.current.scale = scale;

      ctx.fillStyle = COLORS.skyVoid;
      ctx.fillRect(0, 0, viewW, viewH);
      // Smooth the pixel art when zoomed in past ~1.6× — the tile grid
      // only has 16 px of detail, so hard nearest-neighbor sampling at
      // 2× + zoom reads as grainy. Slight bilinear softens the crunch.
      ctx.imageSmoothingEnabled = zoomRef.current > 1.6;
      ctx.imageSmoothingQuality = 'high';
      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(-camX, -camY);

      if (staticRef.current) ctx.drawImage(staticRef.current, 0, 0);
      drawWaterSparkles(ctx, now);

      if (sw.state === SW.AIMING || sw.state === SW.SWIPING) {
        // Hide the aim tracer while it's a CPU's turn — the player
        // shouldn't see the NPC's intended line, and the camera is
        // framed on the NPC so the trace would overlap the sprite.
        const activePlayer = playersRef.current[currentPlayerIdxRef.current];
        const isNPCTurn = activePlayer && activePlayer.isNPC;
        if (!isNPCTurn) {
          const club = CLUBS[sw.clubIdx];
          // Mirror launchBall's v0 multipliers so the tracer predicts
          // where the ball ACTUALLY lands, not where a raw
          // club.v × power shot would. Previously the aim line was
          // ignoring golfer powerFactor / clubStats.distanceFactor /
          // lie powerPenalty, so a high-power player saw a short
          // tracer and a much longer real shot.
          const gf = golferFactorsRef.current || {};
          const cm = clubStatMultipliers(bagStatsRef.current[club.key] || null);
          const liePhys = surfacePropsAt(ball.x, ball.y);
          const lp = liePhys?.powerPenalty || [1.0, 1.0];
          const liePowerMid = (lp[0] + lp[1]) * 0.5;
          const badLie = liePhys?.label === 'Rough' || liePhys?.label === 'Bunker' || liePhys?.label === 'Dirt';
          const recoveryBoost = badLie ? (2 - (gf.recoveryFactor ?? 1)) : 1;
          const powerMul = (gf.powerFactor ?? 1)
            * (gf.touchFactor ?? 1)
            * (cm.distanceFactor ?? 1)
            * liePowerMid
            * recoveryBoost;
          const effPower = Math.min(1.6, (sw.prePowerCap ?? 1) * powerMul);
          const pts = club.angle === 0
            ? simulatePutt(ball.x, ball.y, sw.aimAngle, 0, effPower, club, sw.spinX, sw.shotType || 'normal')
            : simulateFlight(ball.x, ball.y, sw.aimAngle, 0, effPower, sw.spinX, sw.spinY, club, w.x, w.y, true, sw.shotType || 'normal');
          drawShotPredict(ctx, pts);
        }
      }

      if (sw.state === SW.FLYING && ball.trail.length > 1) {
        drawFlightTrail(ctx, ball.trail);
      }

      const windStrength = Math.min(1, w.speed / 16);

      const drawables = [];
      for (const t of TREES) drawables.push({ kind: 'tree', x: t.x * TILE, y: t.y * TILE, variant: t.variant });
      for (const b of BUSHES) drawables.push({ kind: 'bush', x: b.x * TILE, y: b.y * TILE, variant: b.variant });
      // v0.75 — clubhouse / range / putting world extras. The
      // building draws as a chunky pixel structure with a roof
      // overhang. Signs are short posts with a yellow plank. NPCs
      // re-use drawGolfer with their walk phase + facing.
      if (BUILDING) {
        drawables.push({
          kind: 'building',
          x: BUILDING.x * TILE, y: BUILDING.y * TILE,
          w: BUILDING.w * TILE, h: BUILDING.h * TILE,
          label: BUILDING.label || 'CLUBHOUSE',
        });
      }
      for (const sg of SIGNS) {
        drawables.push({
          kind: 'sign',
          x: sg.x * TILE, y: sg.y * TILE,
          label: sg.label, target: sg.target, dir: sg.dir,
        });
      }
      for (const cup of PRACTICE_CUPS) {
        drawables.push({
          kind: 'practiceCup',
          x: cup.x * TILE, y: cup.y * TILE,
        });
      }
      for (const npc of NPCS) {
        drawables.push({
          kind: 'npc',
          npc,
          x: npc.x * TILE, y: npc.y * TILE,
          facing: npc.facing,
          phase: npc.type === 'walker' && npc.walking ? npc.walkPhase : null,
        });
      }
      // Pull the flag pole whenever the putter is equipped — the tall
      // red pin is what a caddie would remove for a real putt. Applies
      // across every swing state so the pin doesn't reappear mid-putt.
      // Skip the flag entirely in clubhouse mode (no cup there).
      if (WORLD_KIND !== 'clubhouse') {
        drawables.push({
          kind: 'flag',
          x: FLAG.x * TILE,
          y: FLAG.y * TILE,
          showPole: !isPutting,
        });
      }
      if (ball.state === 'dropping') {
        drawables.push({ kind: 'balldrop', x: ball.x, y: ball.y, t: ball.dropT / 0.75 });
      } else if (sw.state !== SW.HOLED && sw.state !== SW.SPLASHING) {
        // Hide the ball during the splash — it's "under water" until
        // the hazard notification brings it back to the last-good lie.
        drawables.push({ kind: 'ball', x: ball.x, y: ball.y, z: ball.z });
      }
      // Always draw the golfer — players expect to see themselves
      // watching the shot unfold, not vanish at impact. Hidden only
      // briefly during the HOLED celebration so the ball drop is the
      // only focal point.
      const showGolfer = sw.state !== SW.HOLED;
      if (showGolfer) {
        // Compute live swing info so drawGolfer can animate the club:
        //   back   while swiping (power = current swipe magnitude / max)
        //   forward for ~0.22s after release
        //   address otherwise
        let swingInfo = null;
        const selectedClubForAnim = CLUBS[sw.clubIdx] || CLUBS[0];
        const clubCatForAnim = clubCategoryFor(selectedClubForAnim.key);
        if (sw.state === SW.SWIPING && swipeRef.current) {
          const s = swipeRef.current;
          const dprLocal = window.devicePixelRatio || 1;
          const backPower = Math.min(1, s.peakDy / (80 * dprLocal));
          if (s.locked) {
            // Forward phase — progress is how far back up from the peak
            // the finger has traveled, relative to the backswing depth.
            const travelUp = Math.max(0, s.peakY - s.currentY);
            const forwardT = s.peakDy > 0 ? Math.max(0, Math.min(1, travelUp / s.peakDy)) : 0;
            swingInfo = { phase: 'forward', forwardT, clubCategory: clubCatForAnim };
          } else {
            swingInfo = { phase: 'back', power: backPower, clubCategory: clubCatForAnim };
          }
        } else if (sw.state === SW.FLYING || sw.state === SW.ROLLING || sw.state === SW.DROPPING) {
          const elapsed = sw.strikeT ? (Date.now() - sw.strikeT) / 1000 : 999;
          if (elapsed < 0.22) {
            swingInfo = { phase: 'forward', forwardT: elapsed / 0.22, clubCategory: clubCatForAnim };
          }
        } else {
          swingInfo = { phase: 'address', clubCategory: clubCatForAnim };
        }
        drawables.push({ kind: 'golfer', x: p.x, y: p.y, facing: p.facing, phase: p.moving ? p.walkPhase : null, swingInfo });
      }
      drawables.sort((a, b2) => a.y - b2.y);
      for (const d of drawables) {
        if (d.kind === 'tree') drawTree(ctx, d.x, d.y, now, windStrength, d.variant);
        else if (d.kind === 'bush') drawBush(ctx, d.x, d.y, d.variant, now, windStrength);
        else if (d.kind === 'flag') drawFlag(ctx, d.x, d.y, now, { showPole: d.showPole !== false });
        else if (d.kind === 'ball') drawBall(ctx, d.x, d.y, d.z || 0);
        else if (d.kind === 'balldrop') drawBallDropping(ctx, d.x, d.y, d.t);
        else if (d.kind === 'golfer') drawGolfer(ctx, d.x, d.y, d.facing, d.phase, d.swingInfo);
        else if (d.kind === 'building') drawClubhouseBuilding(ctx, d.x, d.y, d.w, d.h, d.label);
        else if (d.kind === 'sign') drawSign(ctx, d.x, d.y, d.label, d.dir);
        else if (d.kind === 'practiceCup') drawPracticeCup(ctx, d.x, d.y);
        else if (d.kind === 'npc') drawGolfer(ctx, d.x, d.y, d.facing, d.phase, null);
      }
      // Range mode — distance markers along the fairway. Drawn AFTER
      // sprites so the text reads on top of mowing patterns.
      if (WORLD_KIND === 'range' && DISTANCE_MARKERS.length) {
        drawRangeMarkers(ctx, DISTANCE_MARKERS, TEE);
      }
      // NPC name tags — drawn after sprites so the labels float above
      // the heads. Skipped during a swing pose so they don't fight the
      // golfer's own card.
      if (WORLD_KIND === 'clubhouse') {
        for (const npc of NPCS) drawNpcLabel(ctx, npc.x * TILE, npc.y * TILE, npc.name);
      }

      for (const leaf of leavesRef.current) drawLeaf(ctx, leaf, now);
      for (const leaf of burstLeaves) drawLeaf(ctx, leaf, now);

      // Water splash — pixelated ripples + droplets at the entry point.
      if (splashFx.active) {
        const sx = Math.floor(splashFx.x);
        const sy = Math.floor(splashFx.y);
        const t = Math.max(0, Math.min(1, splashFx.t / SPLASH_DURATION));
        // Three expanding pixel rings (chunky, stepped).
        const ringRadii = [5 + t * 12, 3 + t * 9, 1 + t * 6];
        const ringAlphas = [0.8 * (1 - t), 0.7 * (1 - t * 0.8), 0.9 * (1 - t * 0.6)];
        for (let i = 0; i < 3; i++) {
          const r = Math.floor(ringRadii[i]);
          const a = Math.max(0, ringAlphas[i]);
          ctx.fillStyle = `rgba(220,236,255,${a.toFixed(3)})`;
          // Draw ring as 8-point pixel dots around circumference.
          for (let k = 0; k < 12; k++) {
            const ang = (k / 12) * Math.PI * 2;
            const rx = Math.round(Math.cos(ang) * r);
            const ry = Math.round(Math.sin(ang) * r * 0.55); // flatten for top-down
            ctx.fillRect(sx + rx, sy + ry, 2, 1);
          }
        }
        // Droplets — 2×2 light-blue pixels arcing outward.
        ctx.fillStyle = `rgba(200,228,255,${(1 - t * 0.9).toFixed(3)})`;
        for (const d of splashFx.droplets) {
          ctx.fillRect(sx + Math.round(d.x), sy + Math.round(d.y), 2, 2);
        }
        // Central bright splash kernel fading out.
        ctx.fillStyle = `rgba(255,255,255,${(0.9 * (1 - t)).toFixed(3)})`;
        ctx.fillRect(sx - 1, sy - 1, 3, 2);
      }

      ctx.restore();

      const j = joystickRef.current;
      if (sw.state === SW.IDLE || j) {
        const jc = joystickCenter();
        drawJoystick(ctx, jc.cx, jc.cy, j ? j.dx / dpr : 0, j ? j.dy / dpr : 0, !!j, dpr);
      }

      if (sw.state === SW.SWIPING && swipeRef.current) {
        drawSwipeFeedback(ctx, swipeRef.current, dpr);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', pd);
      canvas.removeEventListener('pointermove', pm);
      canvas.removeEventListener('pointerup', pu);
      canvas.removeEventListener('pointercancel', pu);
      if (bodyStyle.parentNode) bodyStyle.parentNode.removeChild(bodyStyle);
    };
    // Effect deps intentionally do NOT include matchConfig — the
    // match data lives in matchConfigRef and feeds enterMode('round')
    // when the player commits at the 1ST TEE sign. Tearing the canvas
    // down whenever the match changes would lose the clubhouse state
    // and reload the world from scratch.
  }, [orientation]);

  // Mirror matchConfig into the ref so the tick / enterMode closures
  // always read the latest value.
  useEffect(() => { matchConfigRef.current = matchConfig; }, [matchConfig]);

  const swingButtonCapture = useRef({});
  const zoomActions = useRef({});
  const clubActions = useRef({});
  const shapeActions = useRef({});

  const swingBtnPointer = useRef(null);

  const clientToCanvas = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const onSwingPointerDown = (e) => {
    if (!swingButtonCapture.current.start) return;
    const pt = clientToCanvas(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (!pt) return;
    const started = swingButtonCapture.current.start(pt.x, pt.y, e.nativeEvent.pointerId);
    if (started) {
      swingBtnPointer.current = e.nativeEvent.pointerId;
      try { e.currentTarget.setPointerCapture(e.nativeEvent.pointerId); } catch {}
    }
  };

  const onSwingPointerMove = (e) => {
    if (swingBtnPointer.current !== e.nativeEvent.pointerId) return;
    if (!swingButtonCapture.current.move) return;
    const pt = clientToCanvas(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (pt) swingButtonCapture.current.move(pt.x, pt.y);
  };

  const onSwingPointerUp = (e) => {
    if (swingBtnPointer.current !== e.nativeEvent.pointerId) return;
    if (swingButtonCapture.current.end) swingButtonCapture.current.end();
    swingBtnPointer.current = null;
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.root}>
        <View style={styles.nativeMsg}>
          <Text style={styles.nativeTitle}>Golf Story — web-only spike</Text>
          <Text style={styles.nativeBody}>Open the web build to try it.</Text>
          <Pressable style={styles.nativeBack} onPress={onExit}>
            <Text style={styles.nativeBackText}>← BACK</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // v0.75 — MatchSetupOverlay is no longer the entry-screen gate.
  // It opens as a transient overlay when the player walks into the
  // 1ST TEE sign in the clubhouse (matchSetupOpen flips true). The
  // canvas underneath stays mounted in clubhouse mode while setup is
  // shown so cancelling drops them back where they were.
  // The overlay itself is rendered further down alongside the other
  // floating UI so it can sit on top of the canvas.

  // canSwing requires the aim to already be locked via the AimPad.
  // Before that, the swing pad slot hosts the AimPad + OK button.
  const canSwing = hud.state === SW.AIMING && hud.aimLocked && !shapeOverlay && !clubPicker && !turnHud.isNPC;
  const showAimPad = hud.state === SW.AIMING && !hud.aimLocked && !shapeOverlay && !clubPicker && !turnHud.isNPC;
  // Hide the swing pad while the player is mid-swipe, the ball is in
  // motion, the hole is done, or an overlay is open — otherwise the pad
  // sits on top of the swipe feedback UI drawn on the canvas.
  const showSwingPad =
    !shapeOverlay &&
    !clubPicker &&
    hud.aimLocked &&
    hud.state !== SW.IDLE &&
    hud.state !== SW.SWIPING &&
    hud.state !== SW.FLYING &&
    hud.state !== SW.ROLLING &&
    hud.state !== SW.DROPPING &&
    hud.state !== SW.SPLASHING &&
    hud.state !== SW.HOLED &&
    hud.state !== SW.HAZARD &&
    hud.state !== SW.OB;
  // Walk-to-next-hole suppresses the tee-off walk prompt (the ball's
  // in the cup, there's nothing to tee off) and the club/shape/type
  // cards (nothing to aim with until the new tee loads).
  const walkingOut = !!walkOutHud.active;
  // v0.75 — clubhouse hides the round HUD (CLUB / SHAPE / TYPE, walk
  // prompt, hole-par card). Range / putting still need clubs + shape
  // since the player is taking real shots.
  const inClubhouse = gameMode === 'clubhouse';
  const showWalkPrompt = hud.state === SW.IDLE && !turnHud.isNPC && !walkingOut && !inClubhouse;
  const shapeDotLeft = 22 + hud.spinX * 18;
  const shapeDotTop = 22 + hud.spinY * 18;

  return (
    <View style={styles.root}>
      <View style={styles.canvasHost}>
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            imageRendering: 'pixelated',
            background: COLORS.skyVoid,
            touchAction: 'none',
          }}
        />
      </View>

      <View style={styles.hudTopLeft} pointerEvents="none">
        {gameMode === 'clubhouse' ? (
          <>
            <Text style={styles.hudLabel}>CLUBHOUSE</Text>
            <Text style={styles.hudValue}>ATLAS GOLF</Text>
            <Text style={styles.hudSub}>walk around — talk to anyone</Text>
          </>
        ) : gameMode === 'range' ? (
          <>
            <Text style={styles.hudLabel}>RANGE</Text>
            <Text style={styles.hudValue}>DRIVING RANGE</Text>
            <Text style={styles.hudSub}>practice — no score</Text>
          </>
        ) : gameMode === 'putting' ? (
          <>
            <Text style={styles.hudLabel}>PUTTING</Text>
            <Text style={styles.hudValue}>PRACTICE GREEN</Text>
            <Text style={styles.hudSub}>roll some balls</Text>
          </>
        ) : (
          <>
            <Text style={styles.hudLabel}>HOLE</Text>
            <Text style={styles.hudValue}>{hud.holeName}</Text>
            <Text style={styles.hudSub}>PAR {hud.holePar}  ·  {hud.pinYd} yd</Text>
            <Text style={styles.hudSub}>Stroke {hud.strokes}  ·  {hud.lie}</Text>
            {playersHud.length > 1 ? (
              <Text style={[styles.hudSub, turnHud.isNPC ? styles.hudTurnCpu : styles.hudTurnYou]}>
                TURN · {(turnHud.name || '').toUpperCase()}{turnHud.isNPC ? ' ·CPU' : ''}
              </Text>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.hudTopRight} pointerEvents="none">
        <Text style={styles.hudLabel}>WIND</Text>
        <View style={styles.windRow}>
          <Text style={[styles.windArrow, { transform: [{ rotate: `${hud.windAngleDeg.toFixed(0)}deg` }] }]}>↑</Text>
          <Text style={styles.hudValue}>{hud.windMph} mph</Text>
        </View>
      </View>

      <View style={styles.zoomColumn}>
        {/* Zoom is locked (1.0× / 1.5× putting) — just the VIEW toggle
            sits here now. */}
        <Pressable style={styles.viewToggleBtn} onPress={() => setCameraMode(cameraMode === 'aim' ? 'golfer' : 'aim')}>
          <Text style={styles.zoomLabel}>VIEW</Text>
          <Text style={{ color: '#fff6d8', fontSize: 13, fontWeight: '800', letterSpacing: 1 }}>{cameraMode === 'aim' ? 'AIM' : 'ME'}</Text>
        </Pressable>
      </View>


      {/* Bottom-row HUD cards: CLUB · SHAPE · TYPE. Each is 78–84 wide so
          all three fit left of the SWING button on a 390+ viewport. VIEW
          now lives in the right-side zoom column (above). Hidden during
          walk-to-next-hole — nothing to aim with until the new tee loads. */}
      {!walkingOut && !inClubhouse ? (
        <>
          <Pressable style={styles.clubCard} onPress={() => setClubPicker(true)}>
            <Text style={styles.hudLabel}>CLUB</Text>
            <Text style={[styles.hudClubShort, { fontSize: 22 }]}>{hud.clubShort}</Text>
            <Text style={[styles.hudSub, { marginTop: 2 }]}>{hud.clubCarryYd} yd</Text>
          </Pressable>

          <Pressable style={styles.shapeCard} onPress={() => setShapeOverlay(true)}>
            <Text style={styles.hudLabel}>SHAPE</Text>
            <View style={styles.shapeBall}>
              <View style={styles.shapeCrossH} />
              <View style={styles.shapeCrossV} />
              <View style={[styles.shapeDot, { left: shapeDotLeft, top: shapeDotTop }]} />
            </View>
            <Text style={[styles.hudValue, { textAlign: 'center', marginTop: 2, fontSize: 11 }]}>{hud.shape}</Text>
          </Pressable>

          <Pressable style={styles.typeCard} onPress={() => setShotTypeMenuOpen((v) => !v)}>
            <Text style={styles.hudLabel}>TYPE</Text>
            <Text style={[styles.hudValue, { textAlign: 'center', marginTop: 10, fontSize: 12 }]}>{(SHOT_TYPE_PROFILES[hudShotType] || SHOT_TYPE_PROFILES.normal).label}</Text>
          </Pressable>
        </>
      ) : null}

      {shotTypeMenuOpen ? (
        <View style={styles.shotTypeOverlay}>
          {['normal', 'chip', 'flop', 'stinger', 'bump', 'tap', 'blast'].map((t) => {
            const club = CLUBS[swingRef.current.clubIdx] || CLUBS[0];
            const liePhys = surfacePropsAt(ballRef.current.x, ballRef.current.y);
            const eligible = shotTypeEligibleGS(t, club, liePhys?.label);
            const active = (swingRef.current.shotType || 'normal') === t;
            const prof = SHOT_TYPE_PROFILES[t];
            return (
              <Pressable
                key={t}
                disabled={!eligible}
                style={[
                  styles.shotTypeOpt,
                  active && styles.shotTypeOptActive,
                  !eligible && styles.shotTypeOptDisabled,
                ]}
                onPress={() => {
                  if (!eligible) return;
                  swingRef.current.shotType = t;
                  // Manual pick wins — block the putter auto-Tap helper
                  // from re-applying until the player strikes.
                  shotTypeManualRef.current = true;
                  setHudShotType(t);
                  setShotTypeMenuOpen(false);
                }}
              >
                <Text style={[styles.shotTypeOptLabel, active && styles.shotTypeOptLabelActive]}>{prof.label}</Text>
                <Text style={styles.shotTypeOptSub}>
                  {t === 'normal' ? 'Full carry, full apex' :
                   t === 'chip' ? '50% carry · 70% apex' :
                   t === 'flop' ? '33% carry · 2× apex (wedge only)' :
                   t === 'stinger' ? 'Full carry · 50% apex (iron/wood, clean lie)' :
                   t === 'bump' ? '75% carry · 40% apex (wedge only)' :
                   t === 'tap' ? '50% roll (putter only)' :
                   t === 'blast' ? '150% roll (putter only)' :
                   ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {showAimPad ? (
        <>
          <AimPad
            aimDelta={(() => {
              const sw = swingRef.current;
              let d = (sw.aimAngle || 0) - (sw.aimBaseAngle || 0);
              while (d > Math.PI) d -= 2 * Math.PI;
              while (d < -Math.PI) d += 2 * Math.PI;
              return Math.max(-AIM_PAD_MAX_RAD, Math.min(AIM_PAD_MAX_RAD, d));
            })()}
            powerCap={hud.prePowerCap ?? 1}
            clubShort={hud.clubShort}
            onChange={(aim, cap) => {
              const sw = swingRef.current;
              sw.aimAngle = (sw.aimBaseAngle || 0) + aim;
              sw.prePowerCap = cap;
              setHud((h) => ({ ...h, prePowerCap: cap }));
            }}
          />
          <View style={styles.controlLabel} pointerEvents="none">
            <Text style={styles.controlLabelText}>AIM</Text>
          </View>
          <Pressable
            style={styles.aimOkBtn}
            onPress={() => {
              const sw = swingRef.current;
              sw.aimLocked = true;
              setHud((h) => ({ ...h, aimLocked: true }));
            }}
          >
            <Text style={styles.aimOkBtnText}>OK ▸</Text>
          </Pressable>
        </>
      ) : null}

      {showSwingPad ? (
        <>
          <View
            style={[styles.controlPad, !canSwing && styles.controlPadDisabled]}
            onPointerDown={canSwing ? onSwingPointerDown : undefined}
            onPointerMove={onSwingPointerMove}
            onPointerUp={onSwingPointerUp}
            onPointerCancel={onSwingPointerUp}
          >
            <View style={styles.controlPadInner} pointerEvents="none" />
            <Text style={styles.controlPadCenter}>SWING</Text>
          </View>
          <View style={styles.controlLabel} pointerEvents="none">
            <Text style={styles.controlLabelText}>SWING</Text>
          </View>
        </>
      ) : null}

      {hud.state === SW.IDLE && !turnHud.isNPC && !walkingOut ? (
        <View style={styles.controlLabel} pointerEvents="none">
          <Text style={styles.controlLabelText}>WALK</Text>
        </View>
      ) : null}
      {walkingOut ? (
        <View style={styles.controlLabel} pointerEvents="none">
          <Text style={styles.controlLabelText}>NEXT HOLE</Text>
        </View>
      ) : null}

      {showWalkPrompt ? (
        <View style={styles.walkHint} pointerEvents="none">
          <Text style={styles.walkHintText}>
            {canTeeOff ? 'ON THE TEE' : 'WALK TO THE TEE'}
          </Text>
        </View>
      ) : null}

      {showWalkPrompt && canTeeOff ? (
        <View pointerEvents="box-none" style={styles.teeOffWrap}>
          <Pressable style={styles.teeOffBtn} onPress={() => teeOffRef.current && teeOffRef.current()}>
            <Text style={styles.teeOffLabel}>TEE OFF ▸</Text>
          </Pressable>
        </View>
      ) : null}

      {hud.message ? (
        <View style={styles.messageBox} pointerEvents="none">
          <Text style={styles.messageText}>{hud.message}</Text>
          {hud.state === SW.HOLED ? (
            <Text style={styles.messageSub}>tap anywhere for next hole</Text>
          ) : null}
        </View>
      ) : null}

      {shapeOverlay ? (
        <View style={styles.shapeBar}>
          <View style={styles.shapeBarPad}>
            <ShapePad
              spinX={hud.spinX}
              spinY={hud.spinY}
              onChange={(nx, ny) => shapeActions.current.set && shapeActions.current.set(nx, ny)}
            />
          </View>
          <View style={styles.shapeBarMid}>
            <Text style={styles.shapeBarLabel}>SHOT SHAPE</Text>
            <Text style={styles.shapeBarValue}>{hud.shape}</Text>
            <Text style={styles.shapeBarHint}>← draw  ·  → fade</Text>
            <Text style={styles.shapeBarHint}>↑ high  ·  ↓ low</Text>
          </View>
          <View style={styles.shapeBarRight}>
            <Pressable
              style={styles.shapeBarBtn}
              onPress={() => shapeActions.current.reset && shapeActions.current.reset()}
            >
              <Text style={styles.shapeBarBtnText}>RESET</Text>
            </Pressable>
            <Pressable
              style={styles.shapeBarBtnPrimary}
              onPress={() => setShapeOverlay(false)}
            >
              <Text style={styles.shapeBarBtnPrimaryText}>DONE</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {clubPicker ? (
        <View style={styles.clubList}>
          <Text style={styles.clubListTitle}>CLUB</Text>
          {CLUBS.map((c, i) => {
            const carryYd = Math.round(computeCarry(c, 1.0) / TILE * YARDS_PER_TILE);
            const active = hud.clubShort === c.short;
            return (
              <Pressable
                key={c.key}
                style={[styles.clubListItem, active && styles.clubListItemActive]}
                onPress={() => {
                  clubActions.current.set && clubActions.current.set(i);
                  setClubPicker(false);
                }}
              >
                <Text style={[styles.clubListShort, active && styles.clubListShortActive]}>{c.short}</Text>
                <Text style={[styles.clubListYd, active && styles.clubListYdActive]}>{carryYd}yd</Text>
              </Pressable>
            );
          })}
          <Pressable style={styles.clubListClose} onPress={() => setClubPicker(false)}>
            <Text style={styles.clubListCloseText}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      {walkingOut ? (
        <View style={styles.walkOutBanner} pointerEvents="none">
          <Text style={styles.walkOutBannerText}>NEXT HOLE</Text>
          <Text
            style={[
              styles.walkOutArrow,
              { transform: [{ rotate: `${(walkOutHud.dir * 180 / Math.PI + 90).toFixed(1)}deg` }] },
            ]}
          >
            ↑
          </Text>
          <Text style={styles.walkOutHint}>walk to the edge</Text>
        </View>
      ) : null}

      {walkingOut && walkOutHud.fadeAlpha > 0 ? (
        <View
          style={[styles.walkOutFade, { opacity: walkOutHud.fadeAlpha }]}
          pointerEvents={walkOutHud.fadeAlpha > 0.5 ? 'auto' : 'none'}
        />
      ) : null}

      {/* v0.75 — TALK / ENTER floating button. Surfaces when the
           player walks within ~26 px of a sign or NPC in the
           clubhouse. Tapping a sign enters the corresponding mode (or
           opens match setup for the 1ST TEE); tapping an NPC opens
           the dialog overlay. */}
      {gameMode === 'clubhouse' && interaction && !npcDialog && !matchSetupOpen ? (
        <View pointerEvents="box-none" style={styles.interactionWrap}>
          <View style={styles.interactionLabel} pointerEvents="none">
            <Text style={styles.interactionLabelText}>{interaction.label}</Text>
          </View>
          <Pressable
            style={styles.interactionBtn}
            onPress={() => {
              if (interaction.kind === 'sign') {
                if (interaction.target === 'roundSetup') {
                  matchSetupSeedRef.current = null;
                  setMatchSetupOpen(true);
                } else if (enterModeRef.current) {
                  enterModeRef.current(interaction.target);
                }
              } else if (interaction.kind === 'npc') {
                const npc = NPCS.find((n) => n.id === interaction.id);
                if (npc) setNpcDialog({ npcId: npc.id, lineIdx: 0 });
              }
            }}
          >
            <Text style={styles.interactionBtnText}>
              {interaction.kind === 'sign' ? 'ENTER ▸' : 'TALK ▸'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* NPC dialog overlay — closes on LEAVE or fires the challenger
           1V1 path on the PLAY 1V1 button. */}
      {npcDialog ? (() => {
        const npc = NPCS.find((n) => n.id === npcDialog.npcId);
        if (!npc) { setNpcDialog(null); return null; }
        return (
          <NpcDialogOverlay
            npc={npc}
            lineIdx={npcDialog.lineIdx}
            onAdvance={() => setNpcDialog((d) => ({ ...d, lineIdx: d.lineIdx + 1 }))}
            onClose={() => setNpcDialog(null)}
            onChallenge={() => {
              // Build the opponent slot from the NPC's golfer (cycle
              // through allGolfers if the index is out of range).
              const roster = Array.isArray(allGolfers) ? allGolfers : [];
              const golfer = roster.length
                ? roster[Math.abs((npc.golferIdx || 0)) % roster.length]
                : null;
              matchSetupSeedRef.current = [golfer];
              setNpcDialog(null);
              setMatchSetupOpen(true);
            }}
          />
        );
      })() : null}

      {/* MatchSetupOverlay — floats over the clubhouse canvas. Once
           the player commits, we sync the matchConfigRef + state and
           hand off to enterMode('round'). */}
      {matchSetupOpen ? (
        <View style={styles.setupOverlay} pointerEvents="auto">
          <MatchSetupOverlay
            allGolfers={allGolfers}
            defaultHuman={selectedGolfer}
            lockHuman={true}
            seedCpu={matchSetupSeedRef.current}
            onStart={(config) => {
              matchConfigRef.current = config;
              setMatchConfig(config);
              setMatchSetupOpen(false);
              matchSetupSeedRef.current = null;
              if (enterModeRef.current) enterModeRef.current('round');
            }}
            onBack={() => {
              setMatchSetupOpen(false);
              matchSetupSeedRef.current = null;
            }}
          />
        </View>
      ) : null}

      {/* Range / putting practice HUD — small card top-center showing
           shot count + last carry + best carry. */}
      {(gameMode === 'range' || gameMode === 'putting') ? (
        <View style={styles.practiceCard} pointerEvents="none">
          <Text style={styles.hudLabel}>{gameMode === 'range' ? 'RANGE' : 'PUTTING'}</Text>
          <Text style={styles.practiceCardLine}>
            SHOTS {practiceHud.shots}  ·  LAST {practiceHud.lastYd}yd
          </Text>
          {gameMode === 'range' ? (
            <Text style={styles.practiceCardLine}>BEST {practiceHud.bestYd}yd</Text>
          ) : null}
        </View>
      ) : null}

      <Pressable
        style={styles.exitBtn}
        onPress={() => {
          // v0.75 EXIT routing — round / range / putting return to
          // the clubhouse first; clubhouse exits to the main menu.
          if (gameMode === 'clubhouse') onExit();
          else if (enterModeRef.current) enterModeRef.current('clubhouse');
        }}
      >
        <Text style={styles.exitText}>{gameMode === 'clubhouse' ? '✕' : '←'}</Text>
      </Pressable>

      {scorecardOpen ? (
        <GSScorecardOverlay
          players={playersHud.length ? playersHud : [{ name: 'YOU', scores: scoresHud }]}
          activeHoleIdx={holeIdxRef.current}
          holeCount={HOLES.length}
          finishedThisHole={hud.state === SW.HOLED}
          onClose={() => setScorecardOpen(false)}
          onNextHole={() => {
            setScorecardOpen(false);
            pendingAdvanceRef.current = true;
          }}
        />
      ) : null}
    </View>
  );
}

// Match setup screen — picks player count (1–4) and assigns CPU
// golfers from the roster. The human player always uses the golfer
// already selected on the IGT main menu, so we never ask for that
// twice. Pixel-styled to match the rest of the GS HUD.
// Mini stat bar for the picker hero card. Matches the SELECT GOLFER
// screen in App.js (yellow/green/red threshold bars) so the whole
// app reads as one visual system.
function PickerStatRow({ label, value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const tone = v >= 70 ? '#4ade80' : v >= 40 ? '#fbbf24' : '#ef4444';
  return (
    <View style={pickerCardStyles.statRow}>
      <Text style={pickerCardStyles.statName}>{label}</Text>
      <View style={pickerCardStyles.statBarBg}>
        <View style={[pickerCardStyles.statBarFill, { width: `${v}%`, backgroundColor: tone }]} />
      </View>
      <Text style={pickerCardStyles.statValue}>{v}</Text>
    </View>
  );
}

// Large pixel avatar block (for the hero card). Four stacked colour
// bands pulled from the golfer's avatar palette.
function GolferAvatar({ golfer, size = 56, bands = 4 }) {
  const av = golfer?.avatar || {};
  const hat = av.hat || '#263246';
  const skin = av.skin || '#f0c08c';
  const shirt = av.shirt || '#3f76c1';
  const pants = av.pants || '#2e563c';
  return (
    <View style={[pickerCardStyles.avatarFrame, { width: size, height: size }]}>
      <View style={{ backgroundColor: hat,   flex: 1 }} />
      <View style={{ backgroundColor: skin,  flex: 1 }} />
      <View style={{ backgroundColor: shirt, flex: 1 }} />
      {bands >= 4 ? <View style={{ backgroundColor: pants, flex: 1 }} /> : null}
    </View>
  );
}

// Card-style golfer picker modeled on the IGT main-menu SELECT GOLFER
// screen: horizontal scroll of small tiles up top, a big hero card
// with name / species / bio, then SKILLS + MENTAL stat rows, and
// finally a BACK / SELECT row. Tracks its own preview selection so
// the player can browse stats before committing.
const SKILL_KEYS = [
  ['power', 'Power'],
  ['accuracy', 'Accuracy'],
  ['touch', 'Touch'],
  ['spinControl', 'Spin Ctrl'],
  ['putting', 'Putting'],
  ['recovery', 'Recovery'],
];
const MENTAL_KEYS = [
  ['focus', 'Focus'],
  ['composure', 'Composure'],
  ['courseManagement', 'Course IQ'],
];

function GsGolferPicker({ title, subtitle, allGolfers, onPick, onBack, excludeIds = [] }) {
  const roster = (Array.isArray(allGolfers) ? allGolfers : []).filter(
    (g) => g && !excludeIds.includes(g.id),
  );
  const [previewIdx, setPreviewIdx] = useState(0);
  const preview = roster[Math.min(previewIdx, Math.max(0, roster.length - 1))] || null;
  return (
    <View style={pickerCardStyles.root}>
      <ScrollView
        style={pickerCardStyles.pageScroll}
        contentContainerStyle={pickerCardStyles.pageInner}
        showsVerticalScrollIndicator={false}
      >
        <Text style={pickerCardStyles.title}>{title}</Text>
        {subtitle ? <Text style={pickerCardStyles.subtitle}>{subtitle}</Text> : null}

        <ScrollView
          horizontal
          style={pickerCardStyles.rosterScroll}
          contentContainerStyle={pickerCardStyles.rosterInner}
          showsHorizontalScrollIndicator={false}
        >
          {roster.map((g, i) => {
            const isSelected = i === previewIdx;
            return (
              <Pressable
                key={g.id}
                style={[pickerCardStyles.rosterCard, isSelected ? pickerCardStyles.rosterCardSelected : null]}
                onPress={() => setPreviewIdx(i)}
              >
                <GolferAvatar golfer={g} size={44} bands={3} />
                <Text
                  style={[pickerCardStyles.rosterName, isSelected ? pickerCardStyles.rosterNameSelected : null]}
                  numberOfLines={1}
                >
                  {g.name}
                </Text>
                <Text style={pickerCardStyles.rosterSpecies} numberOfLines={1}>{g.species}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {preview ? (
          <>
            <View style={pickerCardStyles.heroCard}>
              <GolferAvatar golfer={preview} size={76} bands={4} />
              <View style={pickerCardStyles.heroInfo}>
                <Text style={pickerCardStyles.heroName}>{preview.name}</Text>
                <Text style={pickerCardStyles.heroSpecies}>
                  {preview.species} • {preview.origin || '—'}
                </Text>
                {preview.bio ? (
                  <Text style={pickerCardStyles.heroBio}>{preview.bio}</Text>
                ) : null}
              </View>
            </View>

            <View style={pickerCardStyles.statsSection}>
              <Text style={pickerCardStyles.statsTitle}>SKILLS</Text>
              {SKILL_KEYS.map(([k, label]) => (
                <PickerStatRow key={k} label={label} value={preview?.stats?.[k]} />
              ))}
            </View>

            <View style={pickerCardStyles.statsSection}>
              <Text style={pickerCardStyles.statsTitle}>MENTAL</Text>
              {MENTAL_KEYS.map(([k, label]) => (
                <PickerStatRow key={k} label={label} value={preview?.mental?.[k]} />
              ))}
            </View>
          </>
        ) : null}

        <View style={pickerCardStyles.navRow}>
          <Pressable style={pickerCardStyles.secondaryBtn} onPress={onBack}>
            <Text style={pickerCardStyles.secondaryBtnText}>← BACK</Text>
          </Pressable>
          <Pressable
            style={[pickerCardStyles.primaryBtn, !preview ? pickerCardStyles.primaryBtnDisabled : null]}
            onPress={() => preview && onPick(preview)}
            disabled={!preview}
          >
            <Text style={pickerCardStyles.primaryBtnText}>SELECT →</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

// Count picker — first step of match setup.
function MatchCountPicker({ initial = 2, onConfirm, onBack }) {
  const [playerCount, setPlayerCount] = useState(initial);
  return (
    <View style={pickerCardStyles.root}>
      <View style={pickerCardStyles.topBar}>
        <Text style={pickerCardStyles.title}>MATCH SETUP</Text>
        <Text style={pickerCardStyles.subtitle}>How many players?</Text>
      </View>
      <View style={pickerCardStyles.countBody}>
        <View style={pickerCardStyles.countRow}>
          {[1, 2, 3, 4].map((n) => (
            <Pressable
              key={n}
              style={[pickerCardStyles.countBtn, playerCount === n ? pickerCardStyles.countBtnActive : null]}
              onPress={() => setPlayerCount(n)}
            >
              <Text style={[pickerCardStyles.countBtnText, playerCount === n ? pickerCardStyles.countBtnTextActive : null]}>{n}</Text>
              <Text style={pickerCardStyles.countBtnSub}>{n === 1 ? 'SOLO' : 'PLAYERS'}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={pickerCardStyles.nextBtn} onPress={() => onConfirm(playerCount)}>
          <Text style={pickerCardStyles.nextBtnText}>NEXT ▸</Text>
        </Pressable>
      </View>
      <Pressable style={pickerCardStyles.backBtn} onPress={onBack}>
        <Text style={pickerCardStyles.backText}>← BACK</Text>
      </Pressable>
    </View>
  );
}

// Top-level match setup coordinator. Walks the player through
// count → human → (CPU ×N) and emits the final players payload.
function MatchSetupOverlay({ allGolfers, defaultHuman, onStart, onBack, lockHuman = false, seedCpu = null }) {
  const safeRoster = Array.isArray(allGolfers) && allGolfers.length ? allGolfers : [];
  // step: 'count' | 'human' | 'cpu'  (skipped: 'human' if lockHuman)
  const [step, setStep] = useState('count');
  const [playerCount, setPlayerCount] = useState(seedCpu && seedCpu.length ? (1 + seedCpu.length) : 2);
  const [humanGolfer, setHumanGolfer] = useState(defaultHuman || safeRoster[0] || null);
  const [cpuGolfers, setCpuGolfers] = useState(seedCpu || []);

  const commit = (count, human, cpus) => {
    const players = [];
    const h = human || safeRoster[0] || { id: 'human', name: 'YOU', stats: {}, mental: {} };
    players.push({ id: 'p1', name: h.name || 'YOU', isNPC: false, golfer: h });
    for (let i = 0; i < count - 1; i++) {
      const g = cpus[i] || safeRoster[0] || null;
      players.push({
        id: `p${i + 2}`,
        name: (g && g.name) ? g.name : `CPU ${i + 1}`,
        isNPC: true,
        golfer: g,
      });
    }
    onStart({ players });
  };

  // v0.75 — challenger flow: seedCpu is pre-filled, just commit on
  // mount and skip the entire picker chain.
  useEffect(() => {
    if (seedCpu && seedCpu.length) {
      commit(1 + seedCpu.length, humanGolfer, seedCpu);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (seedCpu && seedCpu.length) return null;

  if (step === 'count') {
    return (
      <MatchCountPicker
        initial={playerCount}
        onConfirm={(n) => {
          setPlayerCount(n);
          if (n === 1) {
            commit(1, humanGolfer, []);
          } else {
            // v0.75 — when entering from the clubhouse 1ST TEE sign,
            // the human golfer was already chosen on the main menu.
            // Skip the redundant human-picker step and jump to CPU.
            setStep(lockHuman ? 'cpu' : 'human');
            if (lockHuman) setCpuGolfers([]);
          }
        }}
        onBack={onBack}
      />
    );
  }

  if (step === 'human') {
    return (
      <GsGolferPicker
        title="CHOOSE YOUR GOLFER"
        subtitle="Pick the character you'll control"
        allGolfers={safeRoster}
        onPick={(g) => {
          setHumanGolfer(g);
          if (playerCount === 1) {
            commit(1, g, []);
          } else {
            setCpuGolfers([]);
            setStep('cpu');
          }
        }}
        onBack={() => setStep('count')}
      />
    );
  }

  // step === 'cpu'
  const slotIdx = cpuGolfers.length;
  const slotsNeeded = playerCount - 1;
  const remaining = slotsNeeded - slotIdx;
  const exclude = [humanGolfer?.id, ...cpuGolfers.map((g) => g?.id)].filter(Boolean);
  return (
    <GsGolferPicker
      title={`CHOOSE NPC ${slotIdx + 1}`}
      subtitle={`${remaining} opponent${remaining === 1 ? '' : 's'} to pick`}
      allGolfers={safeRoster}
      excludeIds={exclude}
      onPick={(g) => {
        const nextCpus = [...cpuGolfers, g];
        if (nextCpus.length >= slotsNeeded) {
          commit(playerCount, humanGolfer, nextCpus);
        } else {
          setCpuGolfers(nextCpus);
        }
      }}
      onBack={() => {
        if (cpuGolfers.length === 0) setStep('human');
        else setCpuGolfers((arr) => arr.slice(0, -1));
      }}
    />
  );
}

// Pixel-pop scorecard overlay. Mirrors the main-game scorecard's
// table structure (Hole / Par / Score rows with badge shapes for
// birdie / bogey / eagle etc.) but styled with the GS HUD palette
// (dark green panel, bone-white border, intergalactic accents).
function getGsScoreShape(strokes, par) {
  const diff = strokes - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  if (diff === 2) return 'doubleBogey';
  return 'tripleBogey';
}

function ScoreBadge({ strokes, par }) {
  const shape = getGsScoreShape(strokes, par);
  const common = scStyles.badgeText;
  if (shape === 'eagle') {
    return (
      <View style={scStyles.badgeDoubleOuter}>
        <View style={scStyles.badgeDoubleInner}>
          <Text style={common}>{strokes}</Text>
        </View>
      </View>
    );
  }
  if (shape === 'birdie') {
    return <View style={scStyles.badgeCircle}><Text style={common}>{strokes}</Text></View>;
  }
  if (shape === 'bogey') {
    return <View style={scStyles.badgeSquare}><Text style={common}>{strokes}</Text></View>;
  }
  if (shape === 'doubleBogey') {
    return (
      <View style={scStyles.badgeDoubleSquareOuter}>
        <View style={scStyles.badgeDoubleSquareInner}>
          <Text style={common}>{strokes}</Text>
        </View>
      </View>
    );
  }
  if (shape === 'tripleBogey') {
    return <View style={scStyles.badgeSolidSquare}><Text style={scStyles.badgeSolidText}>{strokes}</Text></View>;
  }
  return <Text style={scStyles.cellText}>{strokes}</Text>;
}

function playerTotals(playerScores) {
  const played = playerScores.filter((r) => r.strokes !== null);
  const totalStrokes = played.reduce((s, r) => s + r.strokes, 0);
  const totalPar = played.reduce((s, r) => s + r.par, 0);
  return {
    totalStrokes,
    totalPar,
    played,
  };
}

function GSScorecardOverlay({ players, activeHoleIdx, holeCount, finishedThisHole, onClose, onNextHole }) {
  // Always render hole row + par row once, then per-player score rows.
  const parRow = [];
  for (let i = 0; i < holeCount; i++) {
    parRow.push({ hole: i + 1, par: HOLES[i]?.par || 3 });
  }
  const totalPar = parRow.reduce((s, r) => s + r.par, 0);

  const tallies = players.map((p) => {
    const rows = [];
    for (let i = 0; i < holeCount; i++) {
      const existing = (p.scores || []).find((s) => s.hole === i + 1);
      rows.push(existing || { hole: i + 1, par: HOLES[i]?.par || 3, strokes: null });
    }
    const t = playerTotals(rows);
    return { player: p, rows, ...t };
  });
  const allDone = tallies.every((t) => t.played.length >= holeCount);
  const anyFinishedThisHole = finishedThisHole;

  // Leader determined by lowest totalStrokes; tie if ≥ 2 share lowest
  // AND at least one hole has been played.
  let leaderIdx = -1;
  let leaderStrokes = Infinity;
  let tie = false;
  tallies.forEach((t, i) => {
    if (t.played.length === 0) return;
    if (t.totalStrokes < leaderStrokes) {
      leaderStrokes = t.totalStrokes;
      leaderIdx = i;
      tie = false;
    } else if (t.totalStrokes === leaderStrokes) {
      tie = true;
    }
  });

  const titleText = allDone
    ? (tie ? 'MATCH TIED' : `${tallies[leaderIdx]?.player?.name || 'PLAYER'} WINS`)
    : anyFinishedThisHole ? 'HOLE COMPLETE' : 'SCORECARD';

  return (
    <View style={scStyles.overlay}>
      <View style={scStyles.card}>
        <Text style={scStyles.title}>{titleText}</Text>
        <View style={scStyles.table}>
          <View style={scStyles.row}>
            <View style={scStyles.labelCell}><Text style={scStyles.labelText}>HOLE</Text></View>
            {parRow.map((r) => (
              <View
                key={`h-${r.hole}`}
                style={[scStyles.cell, r.hole === activeHoleIdx + 1 ? scStyles.cellActive : null]}
              >
                <Text style={scStyles.cellText}>{r.hole}</Text>
              </View>
            ))}
            <View style={scStyles.totalCell}><Text style={scStyles.totalCellText}>TOT</Text></View>
          </View>
          <View style={scStyles.row}>
            <View style={scStyles.labelCell}><Text style={scStyles.labelText}>PAR</Text></View>
            {parRow.map((r) => (
              <View key={`p-${r.hole}`} style={scStyles.cell}><Text style={scStyles.cellText}>{r.par}</Text></View>
            ))}
            <View style={scStyles.totalCell}><Text style={scStyles.totalCellText}>{totalPar}</Text></View>
          </View>
          {tallies.map((t, i) => {
            const diff = t.totalStrokes - t.totalPar;
            const diffText = t.played.length === 0
              ? '—'
              : diff === 0 ? 'E' : `${diff > 0 ? '+' : ''}${diff}`;
            const diffStyle = diff < 0 ? scStyles.diffUnder : diff > 0 ? scStyles.diffOver : scStyles.diffEven;
            const isLeader = allDone && leaderIdx === i && !tie;
            return (
              <View key={`pl-${i}`}>
                <View style={scStyles.row}>
                  <View style={scStyles.labelCell}>
                    <Text
                      style={[
                        scStyles.labelText,
                        isLeader ? scStyles.leaderName : null,
                      ]}
                      numberOfLines={1}
                    >
                      {(t.player.name || 'P').slice(0, 6).toUpperCase()}
                    </Text>
                  </View>
                  {t.rows.map((r) => (
                    <View
                      key={`s-${i}-${r.hole}`}
                      style={[scStyles.cell, r.hole === activeHoleIdx + 1 ? scStyles.cellActive : null]}
                    >
                      {r.strokes === null
                        ? <Text style={scStyles.cellUnplayed}>—</Text>
                        : <ScoreBadge strokes={r.strokes} par={r.par} />}
                    </View>
                  ))}
                  <View style={scStyles.totalCell}>
                    <Text style={[scStyles.totalCellText, diffStyle]}>
                      {t.totalStrokes || '—'}
                    </Text>
                  </View>
                </View>
                <View style={scStyles.playerDiffRow}>
                  <Text style={[scStyles.summaryText, diffStyle]}>
                    {diffText}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        <View style={scStyles.buttonRow}>
          {anyFinishedThisHole ? (
            <Pressable style={scStyles.primaryBtn} onPress={onNextHole}>
              <Text style={scStyles.primaryBtnText}>{allDone ? 'NEW MATCH ▸' : 'NEXT HOLE ▸'}</Text>
            </Pressable>
          ) : (
            <Pressable style={scStyles.primaryBtn} onPress={onClose}>
              <Text style={scStyles.primaryBtnText}>CLOSE</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// AimPad — 2-axis joystick that lives in the SWING-button slot during
// the AIMING phase. Horizontal drag rotates the aim around the flag
// line (±AIM_PAD_MAX_RAD); vertical DOWN drag pulls the club's
// pre-power cap from 1.0 down to MIN_PRE_POWER, so the player can
// dial a "90% 9I" before the swing fires. Tap OK to lock both and
// hand the slot over to the swing swipe pad.
const AIM_PAD_MAX_RAD = 0.35;   // ≈ ±20°
const MIN_PRE_POWER = 0.3;
function AimPad({ aimDelta, powerCap, clubShort, onChange }) {
  const padRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const capPct = Math.round((powerCap ?? 1) * 100);
  const handle = (e) => {
    const rect = padRef.current.getBoundingClientRect();
    const nx = (e.nativeEvent.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const ny = (e.nativeEvent.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    const cx = Math.max(-1, Math.min(1, nx));
    const cy = Math.max(-1, Math.min(1, ny));
    const aim = cx * AIM_PAD_MAX_RAD;
    const downFrac = Math.max(0, cy);
    const cap = 1 - downFrac * (1 - MIN_PRE_POWER);
    onChange(aim, cap);
  };
  // Knob position inside a 130 px circular pad: centre = (65, 65);
  // usable radius ≈ 50.
  const knobX = (aimDelta / AIM_PAD_MAX_RAD) * 50 + 65;
  const knobY = ((1 - powerCap) / (1 - MIN_PRE_POWER)) * 50 + 65;
  return (
    <View
      ref={padRef}
      style={aimPadStyles.pad}
      onPointerDown={(e) => { setDragging(true); handle(e); padRef.current?.setPointerCapture?.(e.nativeEvent.pointerId); }}
      onPointerMove={(e) => { if (dragging) handle(e); }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <View style={aimPadStyles.innerRing} pointerEvents="none" />
      <View style={aimPadStyles.crossH} pointerEvents="none" />
      <View style={aimPadStyles.crossV} pointerEvents="none" />
      <View style={[aimPadStyles.knob, { left: knobX - 11, top: knobY - 11 }]} pointerEvents="none" />
      <Text style={aimPadStyles.capLabel}>
        {(clubShort || '').toString().toUpperCase()} · {capPct}%
      </Text>
    </View>
  );
}

function ShapePad({ spinX, spinY, onChange }) {
  const padRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const dx = spinX * 80 + 82;
  const dy = spinY * 80 + 82;
  const handle = (e) => {
    const rect = padRef.current.getBoundingClientRect();
    const x = (e.nativeEvent.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (e.nativeEvent.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    const mag = Math.hypot(x, y);
    if (mag > 1) { onChange(x / mag, y / mag); }
    else { onChange(x, y); }
  };
  return (
    <View
      ref={padRef}
      style={shapePadStyles.pad}
      onPointerDown={(e) => { setDragging(true); handle(e); padRef.current?.setPointerCapture?.(e.nativeEvent.pointerId); }}
      onPointerMove={(e) => { if (dragging) handle(e); }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <View style={shapePadStyles.crossH} />
      <View style={shapePadStyles.crossV} />
      <View style={shapePadStyles.ringOuter} />
      <View style={[shapePadStyles.knob, { left: dx - 10, top: dy - 10 }]} />
      <Text style={[shapePadStyles.axisLabel, { top: 6, left: 0, right: 0, textAlign: 'center' }]}>HIGH</Text>
      <Text style={[shapePadStyles.axisLabel, { bottom: 6, left: 0, right: 0, textAlign: 'center' }]}>LOW</Text>
      <Text style={[shapePadStyles.axisLabel, { left: 6, top: 0, bottom: 0, textAlignVertical: 'center', lineHeight: 180 }]}>DRAW</Text>
      <Text style={[shapePadStyles.axisLabel, { right: 6, top: 0, bottom: 0, textAlignVertical: 'center', lineHeight: 180 }]}>FADE</Text>
    </View>
  );
}

const HUD_BORDER = '#f5f5ec';
const HUD_BG = 'rgba(14,26,18,0.9)';

const pickerStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  title: {
    color: '#fff6d8', fontSize: 22, fontWeight: '900', letterSpacing: 2,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
    marginBottom: 6,
  },
  sub: {
    color: '#a9d4a9', fontSize: 12, marginBottom: 28,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  card: {
    backgroundColor: '#0e1a12', borderWidth: 3, borderColor: '#f5f5ec',
    paddingVertical: 18, paddingHorizontal: 24, marginBottom: 16,
    width: 300, alignItems: 'center',
  },
  cardIcon: { color: '#fbe043', fontSize: 40, marginBottom: 6, lineHeight: 44 },
  cardTitle: {
    color: '#f5f5ec', fontSize: 16, fontWeight: '900', letterSpacing: 1, marginBottom: 8,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  cardBody: {
    color: '#bfc4b9', fontSize: 11, marginTop: 2,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  back: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 16 },
  backText: { color: '#a9d4a9', fontSize: 13 },
});

const aimPadStyles = StyleSheet.create({
  // AimPad shares the unified 130-circle frame slot with Walk/Swing.
  pad: {
    position: 'absolute', bottom: 116, right: 14,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(7, 11, 9, 0.88)',
    borderWidth: 2, borderColor: '#88F8BB',
    alignItems: 'center', justifyContent: 'flex-end',
    overflow: 'hidden',
    paddingBottom: 12,
    shadowColor: '#88F8BB', shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
    touchAction: 'none',
  },
  innerRing: {
    position: 'absolute', left: 6, right: 6, top: 6, bottom: 6,
    borderRadius: 59,
    borderWidth: 1, borderColor: 'rgba(136, 248, 187, 0.3)',
  },
  crossH: {
    position: 'absolute', left: 15, right: 15, top: 64,
    height: 2, backgroundColor: 'rgba(255,255,255,0.12)',
  },
  crossV: {
    position: 'absolute', top: 15, bottom: 15, left: 64,
    width: 2, backgroundColor: 'rgba(255,255,255,0.12)',
  },
  knob: {
    position: 'absolute', width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#88f8bb', borderWidth: 2, borderColor: '#f5f5ec',
  },
  capLabel: {
    color: '#fff6d8', fontSize: 11, letterSpacing: 1.5, fontWeight: '900',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
});

const shapePadStyles = StyleSheet.create({
  pad: {
    width: 180, height: 180,
    backgroundColor: '#0e1a12',
    borderWidth: 3, borderColor: '#fbe043',
    borderRadius: 90,
    position: 'relative',
    marginVertical: 14,
    alignSelf: 'center',
  },
  crossH: { position: 'absolute', left: 12, right: 12, top: 89, height: 2, backgroundColor: '#4a5a4a' },
  crossV: { position: 'absolute', top: 12, bottom: 12, left: 89, width: 2, backgroundColor: '#4a5a4a' },
  ringOuter: {
    position: 'absolute', left: 12, top: 12, width: 156, height: 156,
    borderWidth: 1, borderColor: '#2a3a2a', borderRadius: 78,
  },
  knob: {
    position: 'absolute', width: 20, height: 20,
    backgroundColor: '#fbe043', borderRadius: 10,
    borderWidth: 2, borderColor: '#fff',
  },
  axisLabel: {
    position: 'absolute', color: '#a9d4a9', fontSize: 10, letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
});

const matchStyles = StyleSheet.create({
  countBtn: {
    paddingHorizontal: 18, paddingVertical: 10,
    backgroundColor: '#0e1a12',
    borderWidth: 2, borderColor: '#f5f5ec',
  },
  countBtnActive: {
    backgroundColor: 'rgba(136, 248, 187, 0.18)',
    borderColor: '#88f8bb',
  },
  countBtnText: {
    color: '#fff6d8', fontSize: 14, fontWeight: '900', letterSpacing: 2,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 10, width: 320,
  },
  slotLabel: {
    width: 52, color: '#88f8bb', fontSize: 11, fontWeight: '900', letterSpacing: 1.5,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  cycleBtn: {
    width: 30, height: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0e1a12', borderWidth: 2, borderColor: '#f5f5ec',
  },
  cycleText: { color: '#fff6d8', fontSize: 14, fontWeight: '900' },
  slotName: {
    flex: 1, alignItems: 'center',
    backgroundColor: '#0e1a12', borderWidth: 2, borderColor: '#f5f5ec',
    paddingVertical: 4,
  },
  slotNameText: {
    color: '#fff6d8', fontSize: 13, fontWeight: '900', letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  slotStatsText: {
    color: '#a9d4a9', fontSize: 9, letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  startBtn: {
    marginTop: 14, paddingVertical: 12, paddingHorizontal: 28,
    backgroundColor: 'rgba(136, 248, 187, 0.12)',
    borderWidth: 3, borderColor: '#88f8bb',
  },
  startBtnText: {
    color: '#f5fbef', fontSize: 15, fontWeight: '900', letterSpacing: 3,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
});

// ═══════════════ SHARED DESIGN TOKENS ═══════════════
// One bg / font / palette for every GS menu screen so the GS flow
// reads as the same app as the IGT main menu.
const UI_BG = '#05070A';          // matches spaceMenuScreen
const UI_SURFACE = '#0f1420';     // panels
const UI_SURFACE_LO = '#0a0e17';  // lower-contrast panels / track fills
const UI_BORDER = 'rgba(255,255,255,0.12)';
const UI_MINT = '#88f8bb';
const UI_MINT_DIM = 'rgba(136,248,187,0.28)';
const UI_MINT_TINT = 'rgba(136,248,187,0.12)';
const UI_TEXT = '#f4fcef';
const UI_TEXT_DIM = '#a9d4a9';
const UI_TEXT_MUTED = '#6b7a72';
const UI_FONT = Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' });

const pickerCardStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: UI_BG,
  },
  pageScroll: { flex: 1 },
  pageInner: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 24 : 48,
    paddingBottom: 28,
  },
  topBar: {
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 10,
  },
  title: {
    color: UI_TEXT,
    fontSize: 22, fontWeight: '900', letterSpacing: 4,
    textAlign: 'center',
    textTransform: 'uppercase',
    fontFamily: UI_FONT,
  },
  subtitle: {
    color: UI_MINT, fontSize: 11, letterSpacing: 2,
    marginTop: 6, marginBottom: 14,
    textAlign: 'center',
    textTransform: 'uppercase',
    fontFamily: UI_FONT,
  },
  // --- horizontal roster carousel ---
  rosterScroll: { marginBottom: 18 },
  rosterInner: { gap: 10, paddingVertical: 4, paddingRight: 16 },
  rosterCard: {
    width: 112, paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI_BORDER,
    backgroundColor: UI_SURFACE,
    alignItems: 'center',
    gap: 8,
  },
  rosterCardSelected: {
    borderColor: UI_MINT,
    backgroundColor: UI_MINT_TINT,
  },
  rosterName: {
    color: UI_TEXT, fontSize: 13, fontWeight: '800',
    textAlign: 'center',
    fontFamily: UI_FONT,
  },
  rosterNameSelected: { color: UI_MINT },
  rosterSpecies: {
    color: UI_TEXT_DIM, fontSize: 10, letterSpacing: 1,
    textAlign: 'center',
    fontFamily: UI_FONT,
  },
  avatarFrame: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: UI_SURFACE_LO,
  },
  // --- hero card ---
  heroCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: UI_SURFACE,
    borderWidth: 1, borderColor: UI_BORDER,
    marginBottom: 16,
  },
  heroInfo: { flex: 1, gap: 6 },
  heroName: {
    color: UI_TEXT, fontSize: 22, fontWeight: '900', letterSpacing: 0.5,
    fontFamily: UI_FONT,
  },
  heroSpecies: {
    color: UI_MINT, fontSize: 12, letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: UI_FONT,
  },
  heroBio: {
    color: UI_TEXT_DIM, fontSize: 13, lineHeight: 18, marginTop: 4,
    fontFamily: UI_FONT,
  },
  // --- stat sections ---
  statsSection: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: UI_SURFACE,
    borderWidth: 1, borderColor: UI_BORDER,
    marginBottom: 12,
    gap: 8,
  },
  statsTitle: {
    color: UI_MINT, fontSize: 13, fontWeight: '900', letterSpacing: 3,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 4,
    fontFamily: UI_FONT,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statName: {
    width: 90, color: UI_TEXT_DIM, fontSize: 12,
    fontFamily: UI_FONT,
  },
  statBarBg: {
    flex: 1, height: 10, borderRadius: 5,
    backgroundColor: UI_SURFACE_LO,
    overflow: 'hidden',
  },
  statBarFill: { height: '100%', borderRadius: 5 },
  statValue: {
    width: 34, textAlign: 'right',
    color: UI_TEXT, fontSize: 13, fontWeight: '900',
    fontFamily: UI_FONT,
  },
  // --- bottom nav row ---
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  secondaryBtn: {
    paddingVertical: 14, paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: UI_SURFACE,
    borderWidth: 1, borderColor: UI_BORDER,
  },
  secondaryBtnText: {
    color: UI_TEXT_DIM, fontSize: 13, fontWeight: '800', letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: UI_FONT,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14, paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: UI_MINT,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.35 },
  primaryBtnText: {
    color: '#04180c', fontSize: 14, fontWeight: '900', letterSpacing: 3,
    fontFamily: UI_FONT,
  },
  // --- count-picker specific ---
  countBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 24,
    gap: 32,
  },
  countRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  countBtn: {
    width: 78, height: 96,
    borderRadius: 16,
    borderWidth: 1, borderColor: UI_BORDER,
    backgroundColor: UI_SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  countBtnActive: {
    borderColor: UI_MINT,
    backgroundColor: UI_MINT_TINT,
  },
  countBtnText: {
    color: UI_TEXT, fontSize: 32, fontWeight: '900',
    fontFamily: UI_FONT,
  },
  countBtnTextActive: { color: UI_MINT },
  countBtnSub: {
    color: UI_TEXT_DIM, fontSize: 10, letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: UI_FONT,
  },
  nextBtn: {
    paddingVertical: 14, paddingHorizontal: 38,
    borderRadius: 12,
    backgroundColor: UI_MINT,
  },
  nextBtnText: {
    color: '#04180c', fontSize: 15, fontWeight: '900', letterSpacing: 3,
    fontFamily: UI_FONT,
  },
  backBtn: {
    alignSelf: 'center',
    paddingVertical: 14, paddingHorizontal: 18,
    marginBottom: 10,
  },
  backText: {
    color: UI_TEXT_MUTED, fontSize: 12, letterSpacing: 3,
    textTransform: 'uppercase',
    fontFamily: UI_FONT,
  },
});

const scStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(5,10,7,0.88)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, zIndex: 280,
  },
  card: {
    width: '100%', maxWidth: 480,
    backgroundColor: '#0e1a12',
    borderWidth: 3, borderColor: '#f5f5ec',
    padding: 14, gap: 10,
  },
  title: {
    color: '#fff6d8',
    fontSize: 18, fontWeight: '900', letterSpacing: 3,
    textAlign: 'center',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  table: { gap: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, flexWrap: 'nowrap' },
  labelCell: {
    width: 44, height: 28, alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 2,
  },
  labelText: {
    color: '#88f8bb', fontSize: 11, fontWeight: '900', letterSpacing: 1.5,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  cell: {
    flexGrow: 1, flexShrink: 1, flexBasis: 0,
    minWidth: 22, height: 28,
    borderWidth: 1, borderColor: 'rgba(136, 248, 187, 0.18)',
    backgroundColor: 'rgba(14, 40, 22, 0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  cellActive: {
    backgroundColor: 'rgba(136, 248, 187, 0.18)',
    borderColor: '#88f8bb',
  },
  cellText: {
    color: '#f5fbef', fontSize: 12, fontWeight: '800',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  cellUnplayed: {
    color: 'rgba(255,255,255,0.25)', fontSize: 12,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  totalCell: {
    width: 36, height: 28,
    borderWidth: 1, borderColor: '#f5f5ec',
    backgroundColor: 'rgba(245,245,236,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  totalCellText: {
    color: '#fff6d8', fontSize: 12, fontWeight: '900', letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  badgeText: {
    color: '#f5fbef', fontSize: 11, fontWeight: '900',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  badgeCircle: {
    minWidth: 22, height: 22, borderRadius: 999,
    borderWidth: 2, borderColor: '#fbe043',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeSquare: {
    minWidth: 22, height: 22,
    borderWidth: 2, borderColor: '#ff6ad5',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeDoubleOuter: {
    minWidth: 26, height: 26, borderRadius: 999,
    borderWidth: 2, borderColor: '#fbe043',
    alignItems: 'center', justifyContent: 'center', padding: 1,
  },
  badgeDoubleInner: {
    minWidth: 18, height: 18, borderRadius: 999,
    borderWidth: 2, borderColor: '#fbe043',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeDoubleSquareOuter: {
    minWidth: 26, height: 26,
    borderWidth: 2, borderColor: '#ff6ad5',
    alignItems: 'center', justifyContent: 'center', padding: 1,
  },
  badgeDoubleSquareInner: {
    minWidth: 18, height: 18,
    borderWidth: 2, borderColor: '#ff6ad5',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeSolidSquare: {
    minWidth: 22, height: 22,
    backgroundColor: '#ff6ad5',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeSolidText: {
    color: '#0e1a12', fontSize: 11, fontWeight: '900',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 4, paddingTop: 4,
    borderTopWidth: 1, borderTopColor: 'rgba(245,245,236,0.18)',
  },
  summaryText: {
    color: '#c8dfc4', fontSize: 12, fontWeight: '800', letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  summaryDiff: { fontSize: 16, fontWeight: '900' },
  diffUnder: { color: '#fbe043' },
  diffEven: { color: '#c8dfc4' },
  diffOver: { color: '#ff6ad5' },
  leaderName: { color: '#fbe043' },
  playerDiffRow: {
    alignSelf: 'flex-end', paddingRight: 4, marginTop: -2, marginBottom: 4,
  },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  primaryBtn: {
    backgroundColor: 'rgba(136, 248, 187, 0.12)',
    borderWidth: 2, borderColor: '#88f8bb',
    paddingVertical: 10, paddingHorizontal: 22,
  },
  primaryBtnText: {
    color: '#f5fbef', fontSize: 13, fontWeight: '900', letterSpacing: 2,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.skyVoid, overscrollBehavior: 'none', touchAction: 'none' },
  canvasHost: { flex: 1, touchAction: 'none' },
  exitBtn: {
    position: 'absolute', top: 16, right: 16,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
  },
  exitText: { color: '#f5f5ec', fontSize: 18, lineHeight: 20 },
  // v0.75 — clubhouse interaction button. Floats above the HUD pad
  // when the player walks within range of a sign or NPC. Yellow ring
  // for "ENTER" (signs) and mint ring for "TALK" (NPCs).
  interactionWrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 270,
    alignItems: 'center',
  },
  interactionLabel: {
    backgroundColor: 'rgba(14, 26, 18, 0.92)',
    borderWidth: 2, borderColor: '#fbe043',
    paddingHorizontal: 12, paddingVertical: 4,
    marginBottom: 8,
  },
  interactionLabelText: {
    color: '#fbe043', fontSize: 12, fontWeight: '900', letterSpacing: 3,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  interactionBtn: {
    backgroundColor: '#88f8bb',
    borderWidth: 3, borderColor: '#f5f5ec',
    paddingHorizontal: 22, paddingVertical: 10,
  },
  interactionBtnText: {
    color: '#04180c', fontSize: 14, fontWeight: '900', letterSpacing: 4,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  // Match-setup overlay container — fills the screen with a dim
  // backdrop so the underlying clubhouse canvas isn't distracting.
  setupOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 100,
  },
  // Range / putting practice card — top-center small panel showing
  // shot count + last carry + best carry.
  practiceCard: {
    position: 'absolute', top: 16, alignSelf: 'center',
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    paddingHorizontal: 12, paddingVertical: 6, minWidth: 160,
    alignItems: 'center',
  },
  practiceCardLine: {
    color: '#fff6d8', fontSize: 11, letterSpacing: 1, marginTop: 2,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },

  hudTopLeft: {
    position: 'absolute', top: 16, left: 16,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    paddingHorizontal: 10, paddingVertical: 8, minWidth: 160,
  },
  hudTopRight: {
    position: 'absolute', top: 16, right: 60,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    paddingHorizontal: 10, paddingVertical: 8, minWidth: 110, alignItems: 'center',
  },
  hudLabel: {
    color: '#a9d4a9', fontSize: 10, letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  hudClubShort: {
    color: '#fff6d8', fontSize: 28, fontWeight: '900',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  hudValue: {
    color: '#f5f5ec', fontSize: 13, fontWeight: '700',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  hudSub: {
    color: '#bfc4b9', fontSize: 11,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  hudTurnYou: { color: '#88f8bb', fontWeight: '900', letterSpacing: 1 },
  hudTurnCpu: { color: '#fbe043', fontWeight: '900', letterSpacing: 1 },
  walkHint: {
    position: 'absolute',
    left: 0, right: 0,
    top: '40%',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  walkHintText: {
    color: '#fff6d8',
    fontSize: 14, fontWeight: '900', letterSpacing: 3,
    backgroundColor: 'rgba(14,26,18,0.8)',
    borderWidth: 2, borderColor: '#f5f5ec',
    paddingHorizontal: 12, paddingVertical: 6,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  // v0.74 walk-to-next-hole HUD. Top-center banner with a rotating
  // arrow glyph pointing toward the waypoint, and a full-screen black
  // fade overlay that covers the advanceHole swap.
  walkOutBanner: {
    position: 'absolute',
    top: 110, left: 0, right: 0,
    alignItems: 'center',
  },
  walkOutBannerText: {
    color: '#fbe043',
    fontSize: 15, fontWeight: '900', letterSpacing: 4,
    backgroundColor: 'rgba(14,26,18,0.88)',
    borderWidth: 2, borderColor: '#fbe043',
    paddingHorizontal: 14, paddingVertical: 6,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  walkOutArrow: {
    color: '#fbe043', fontSize: 34, fontWeight: '900',
    marginTop: 6, textAlign: 'center',
    textShadowColor: 'rgba(251,224,67,0.6)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
  },
  walkOutHint: {
    color: '#d4e0c4',
    fontSize: 10, letterSpacing: 2, marginTop: 2,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  walkOutFade: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000',
    zIndex: 200,
  },
  teeOffWrap: {
    position: 'absolute',
    bottom: 200, left: 0, right: 0,
    alignItems: 'center',
  },
  teeOffBtn: {
    backgroundColor: 'rgba(136,248,187,0.14)',
    borderWidth: 3, borderColor: '#88f8bb',
    paddingHorizontal: 22, paddingVertical: 12,
  },
  teeOffLabel: {
    color: '#f5fbef', fontSize: 15, fontWeight: '900', letterSpacing: 3,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  windRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  windArrow: { color: '#fff6d8', fontSize: 22, marginRight: 4 },

  zoomColumn: {
    // Below EXIT (bottom at y=54) with a 6 px gap. Cleared of the CARD
    // button that briefly lived here in v0.41–v0.43.
    position: 'absolute', top: 60, right: 16, alignItems: 'center',
  },
  zoomBtn: {
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginVertical: 4,
  },
  zoomText: { color: '#fff6d8', fontSize: 22, fontWeight: '900' },
  zoomLabel: { color: '#a9d4a9', fontSize: 10, marginVertical: 2 },

  clubCard: {
    position: 'absolute', bottom: 24, left: 8,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    paddingHorizontal: 2, paddingVertical: 6, width: 64, alignItems: 'center',
  },
  shapeCard: {
    position: 'absolute', bottom: 24, left: 76,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    paddingHorizontal: 2, paddingVertical: 6, width: 64, alignItems: 'center',
  },
  typeCard: {
    position: 'absolute', bottom: 24, left: 144,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    paddingHorizontal: 2, paddingVertical: 6, width: 64, alignItems: 'center',
  },
  // VIEW toggle moved up to the right-side zoom column so the bottom HUD
  // row stays narrow enough for the SWING button. Rendered as a small
  // stacked button just under the zoom −/+/label group (see JSX).
  viewToggleBtn: {
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    width: 44, paddingVertical: 6, alignItems: 'center', marginTop: 8,
  },
  // Shot-type picker popup, aligned directly above the TYPE card.
  shotTypeOverlay: {
    position: 'absolute', bottom: 96, left: 12,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    padding: 8, gap: 4, width: 260, zIndex: 80,
  },
  shotTypeOpt: {
    paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  shotTypeOptActive: {
    backgroundColor: 'rgba(99, 165, 99, 0.35)',
    borderColor: '#8be78b',
  },
  shotTypeOptDisabled: {
    opacity: 0.35,
  },
  shotTypeOptLabel: {
    color: '#d4e0d4', fontSize: 13, fontWeight: '700',
  },
  shotTypeOptLabelActive: {
    color: '#fff6d8',
  },
  shotTypeOptSub: {
    color: '#7f968b', fontSize: 10, marginTop: 2,
  },
  shapeBall: {
    width: 48, height: 48, marginTop: 4,
    borderRadius: 24, borderWidth: 2, borderColor: '#f5f5ec',
    backgroundColor: '#0e1a12', position: 'relative',
  },
  shapeCrossH: { position: 'absolute', left: 4, right: 4, top: 22, height: 1, backgroundColor: '#4a5a4a' },
  shapeCrossV: { position: 'absolute', top: 4, bottom: 4, left: 22, width: 1, backgroundColor: '#4a5a4a' },
  shapeDot: { position: 'absolute', width: 5, height: 5, marginLeft: -2, marginTop: -2, backgroundColor: '#fbe043', borderRadius: 3 },

  // Last-shot summary card — right-side floating panel, anchored below
  // the zoom/VIEW column (which ends at ~top 290) and safely above the
  // swing pad (bottom 24 + 80 ≈ 104).
  lastShotCard: {
    position: 'absolute',
    top: 300, right: 10,
    backgroundColor: HUD_BG, borderWidth: 2, borderColor: HUD_BORDER,
    paddingHorizontal: 10, paddingVertical: 8,
    width: 128,
  },
  lastShotLabel: {
    color: '#a9d4a9', fontSize: 9, letterSpacing: 1.5,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  lastShotDist: {
    color: '#fff6d8', fontSize: 22, fontWeight: '900', marginTop: 2,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  lastShotDistUnit: {
    color: '#a9d4a9', fontSize: 10, fontWeight: '700',
  },
  lastShotRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 4,
  },
  lastShotKey: {
    color: '#a9d4a9', fontSize: 9, letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  lastShotVal: {
    color: '#f5f5ec', fontSize: 11, fontWeight: '700',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  lastShotHoled: {
    color: '#88F8BB',
  },
  // Intergalactic-HUD swing pad: matches the dark tactical panels across
  // the rest of the UI instead of the old bright-red sports graphic.
  // Keeps the Pressable big (90×90+) and easy to thumb, adds a subtle
  // mint-teal border that mirrors the `HUD_BORDER` accent used by zoom
  // and club cards. A faint inner glow hints it's the primary action.
  // Unified control pad — Walk / Aim / Swing all share this 130 css
  // px circular frame in the same bottom-right slot. The content
  // inside changes per mode (joystick, aim stick, or swing label)
  // but the outer shell + placement stay consistent.
  controlPad: {
    position: 'absolute', bottom: 116, right: 14,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(7, 11, 9, 0.88)',
    borderWidth: 2, borderColor: '#88F8BB',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#88F8BB', shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
    touchAction: 'none',
  },
  controlPadDisabled: {
    backgroundColor: 'rgba(7, 11, 9, 0.55)',
    borderColor: 'rgba(136, 248, 187, 0.3)',
    shadowOpacity: 0,
    opacity: 0.6,
  },
  controlPadInner: {
    position: 'absolute', left: 6, right: 6, top: 6, bottom: 6,
    borderRadius: 59,
    borderWidth: 1, borderColor: 'rgba(136, 248, 187, 0.3)',
    backgroundColor: 'transparent',
  },
  controlPadCenter: {
    color: '#fff6d8', fontSize: 18, fontWeight: '900', letterSpacing: 2,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  controlLabel: {
    position: 'absolute', bottom: 92, right: 14, width: 130,
    alignItems: 'center',
  },
  controlLabelText: {
    color: '#88f8bb', fontSize: 11, fontWeight: '900', letterSpacing: 4,
    textTransform: 'uppercase',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  // AIM mode's OK button — sits just to the left of the pad so it
  // stays reachable without overlapping the pad's joystick surface.
  aimOkBtn: {
    position: 'absolute', bottom: 150, right: 156,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#88f8bb', borderWidth: 2, borderColor: '#f5f5ec',
    borderRadius: 8,
  },
  aimOkBtnText: {
    color: '#04180c', fontSize: 13, fontWeight: '900', letterSpacing: 3,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  swingBtnDisabled: {
    backgroundColor: 'rgba(7, 11, 9, 0.55)',
    borderColor: 'rgba(136, 248, 187, 0.3)',
    shadowOpacity: 0,
    opacity: 0.6,
  },
  swingBtnLabel: {
    color: '#f5fbef', fontSize: 17, fontWeight: '900', letterSpacing: 3,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
    textShadowColor: 'rgba(136, 248, 187, 0.55)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
  },
  swingBtnHint: {
    color: 'rgba(136, 248, 187, 0.9)',
    fontSize: 9, letterSpacing: 1, marginTop: 4,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },

  messageBox: {
    position: 'absolute', top: '40%', left: 16, right: 16,
    backgroundColor: '#0e1a12', borderWidth: 3, borderColor: '#fbe043',
    paddingVertical: 20, paddingHorizontal: 20, alignItems: 'center',
  },
  messageText: {
    color: '#fbe043', fontSize: 22, fontWeight: '900',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
    textAlign: 'center',
  },
  messageSub: {
    color: '#f5f5ec', fontSize: 12, marginTop: 8,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },

  overlayBg: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center',
    zIndex: 50,
  },
  overlayPanel: {
    backgroundColor: '#0e1a12', borderWidth: 3, borderColor: '#f5f5ec',
    padding: 20, minWidth: 280, alignItems: 'center',
  },
  overlayTitle: {
    color: '#fff6d8', fontSize: 18, fontWeight: '900', letterSpacing: 2, marginBottom: 4,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  overlayHint: {
    color: '#a9d4a9', fontSize: 11, marginBottom: 8, textAlign: 'center',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  overlayRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  overlayBtn: {
    backgroundColor: '#1a2a1a', borderWidth: 2, borderColor: '#a9d4a9',
    paddingHorizontal: 20, paddingVertical: 10,
  },
  overlayBtnText: {
    color: '#a9d4a9', fontSize: 13, fontWeight: '900', letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  overlayBtnPrimary: {
    backgroundColor: '#fbe043', borderWidth: 2, borderColor: '#fff',
    paddingHorizontal: 26, paddingVertical: 10,
  },
  overlayBtnTextPrimary: {
    color: '#0e1a12', fontSize: 13, fontWeight: '900', letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },

  shapeBar: {
    position: 'absolute',
    left: 16, right: 16, bottom: 16,
    backgroundColor: 'rgba(14,26,18,0.88)',
    borderWidth: 3, borderColor: '#fbe043',
    paddingVertical: 10, paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 50,
  },
  shapeBarPad: { marginRight: 12 },
  shapeBarMid: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  shapeBarLabel: {
    color: '#a9d4a9', fontSize: 10, letterSpacing: 1, marginBottom: 4,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  shapeBarValue: {
    color: '#fbe043', fontSize: 18, fontWeight: '900', marginBottom: 6, textAlign: 'center',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  shapeBarHint: {
    color: '#bfc4b9', fontSize: 10, marginBottom: 2,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  shapeBarRight: { alignItems: 'stretch', justifyContent: 'center', marginLeft: 8 },
  shapeBarBtn: {
    borderWidth: 2, borderColor: '#a9d4a9', backgroundColor: '#1a2a1a',
    paddingVertical: 10, paddingHorizontal: 16, marginVertical: 4,
    alignItems: 'center',
  },
  shapeBarBtnText: {
    color: '#a9d4a9', fontSize: 12, fontWeight: '900', letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  shapeBarBtnPrimary: {
    borderWidth: 2, borderColor: '#fff', backgroundColor: '#fbe043',
    paddingVertical: 10, paddingHorizontal: 18, marginVertical: 4,
    alignItems: 'center',
  },
  shapeBarBtnPrimaryText: {
    color: '#0e1a12', fontSize: 12, fontWeight: '900', letterSpacing: 1,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },

  clubList: {
    position: 'absolute',
    left: 16, top: 16, bottom: 16,
    width: 84,
    backgroundColor: 'rgba(14,26,18,0.92)',
    borderWidth: 2, borderColor: '#f5f5ec',
    paddingVertical: 8, paddingHorizontal: 6,
    alignItems: 'center',
    zIndex: 50,
  },
  clubListTitle: {
    color: '#a9d4a9', fontSize: 10, letterSpacing: 2, marginBottom: 6,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  clubListItem: {
    width: '100%', paddingVertical: 6, marginVertical: 2,
    borderWidth: 1, borderColor: '#4a5a4a', backgroundColor: '#0e1a12',
    alignItems: 'center',
  },
  clubListItemActive: { backgroundColor: '#fbe043', borderColor: '#fff' },
  clubListShort: {
    color: '#fff6d8', fontSize: 15, fontWeight: '900',
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  clubListShortActive: { color: '#0e1a12' },
  clubListYd: {
    color: '#a9d4a9', fontSize: 9,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' }),
  },
  clubListYdActive: { color: '#0e1a12' },
  clubListClose: {
    marginTop: 8, paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 2, borderColor: '#f5f5ec',
  },
  clubListCloseText: { color: '#f5f5ec', fontSize: 14, fontWeight: '900' },

  nativeMsg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  nativeTitle: { color: '#f5f5ec', fontSize: 18, marginBottom: 12 },
  nativeBody: { color: '#bfc4b9', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  nativeBack: { borderWidth: 2, borderColor: '#f5f5ec', paddingHorizontal: 18, paddingVertical: 10 },
  nativeBackText: { color: '#f5f5ec', fontSize: 14 },
});
