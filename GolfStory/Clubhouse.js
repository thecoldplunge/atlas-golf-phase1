// v0.75 — Clubhouse + Range + Putting world definitions and NPC roster.
//
// Pure data module. Surfaces use string types ('fairway' | 'green' |
// 'sand' | 'rough' | 'tee') that GolfStoryScreen translates to its
// numeric T_* constants when loading. Tile units throughout (TILE=16
// px), same convention as the HOLES array.
//
// Worlds export: { width, height, tee, surfaces, ... mode-specific }
// Clubhouse adds: building (impassable bbox), signs, npcs
// Range adds: distanceMarkers
// Putting adds: cups (additional practice holes), greenSlope

import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

// Module-scope tile + shape helpers — the GolfStoryScreen importer
// turns these into actual SURFACES via translateSurface().
export const TILE = 16;

function rect(x, y, w, h) { return { kind: 'rect', x, y, w, h }; }
function polyShape(...pairs) {
  // pairs: alternating x,y numbers — [x1,y1,x2,y2,...]
  const points = [];
  for (let i = 0; i < pairs.length; i += 2) points.push([pairs[i], pairs[i + 1]]);
  return { kind: 'polygon', points };
}
function circleShape(cx, cy, r) { return { kind: 'circle', cx, cy, r }; }

// ─── CLUBHOUSE WORLD ────────────────────────────────────────────────
// 24 tiles wide × 36 tall = 384×576 px. South end = player spawn.
// Building is a 6×4 footprint near the centre, with paths leading
// north-west (to the range), east (to the 1st tee), and a putting
// practice green to the south-west.
//
//                         N
//   y= 0   ┌─────────────────────────────┐
//          │  [DRIVING RANGE → ]         │
//          │                             │
//   y= 6   │       ▓▓▓▓▓▓ clubhouse      │
//          │       ▓▓▓▓▓▓                │
//          │       ▓▓▓▓▓▓                │
//          │       ▓▓▓▓▓▓                │
//   y=14   │                  [1ST TEE→] │
//          │ ◯  ◯  ◯  practice green     │
//   y=20   │                             │
//          │  caddy   walker  pro shop   │
//          │                             │
//   y=26   │  challenger        yolanda  │
//          │                             │
//   y=30   │  [PUTTING GREEN]            │
//          │                             │
//   y=34   │            ★ player spawn   │
//          └─────────────────────────────┘
//                         S

export const CLUBHOUSE_WORLD = {
  id: 'clubhouse',
  width: 24,
  height: 36,
  tee: { x: 12, y: 33 },                 // player spawn
  surfaces: [
    // Base lawn — covers the whole world.
    { type: 'rough', shape: rect(0, 0, 24, 36) },
    // Sandy paths weaving between zones (north→south, with elbows).
    { type: 'sand', shape: rect(11, 1, 2, 5) },        // top → building approach
    { type: 'sand', shape: rect(2, 6, 9, 2) },         // building west spur → range sign
    { type: 'sand', shape: rect(13, 12, 9, 2) },       // building east spur → 1st tee sign
    { type: 'sand', shape: rect(11, 14, 2, 18) },      // central spine to spawn
    { type: 'sand', shape: rect(2, 18, 9, 2) },        // putting green link
    // Putting practice green — kidney shape on the south-west.
    { type: 'green', shape: polyShape(2, 17, 9, 16, 10, 18, 9, 21, 4, 22, 1, 20) },
    // Big lawn fringe under the clubhouse (just decorative — building
    // sits on top so this only shows around the edges).
    { type: 'fairway', shape: rect(7, 5, 11, 9) },
  ],
  // Clubhouse building bbox — impassable. The IDLE walker code
  // clamps the player out of this rect.
  building: { x: 9, y: 6, w: 6, h: 7, label: 'CLUBHOUSE' },
  // Practice cups on the putting green (decorative — for the actual
  // putting MODE we use a separate world). Drawn as small dark dots.
  practiceCups: [
    { x: 4, y: 18 },
    { x: 6, y: 19 },
    { x: 8, y: 19 },
  ],
  // Signs — small rectangular entry zone anchored around each post.
  // v0.76: previously spanned the whole west / east strip which
  // swallowed NPC proximity. Now tight boxes — player has to walk up
  // to the sign (or the immediate approach) and every NPC position
  // sits OUTSIDE the zones so TALK always wins on them.
  //
  //   driving range  — 6×5 tiles around the post (north-west of building)
  //   putting green  — 5×4 tiles just south-west of the green
  //   1st tee        — 6×5 tiles around the post (east of building)
  signs: [
    { id: 'sign_range',   x: 4,  y: 3,  label: 'DRIVING RANGE',  target: 'range',      dir: 'N',
      zone: { x: 2,  y: 1,  w: 6, h: 5 } },
    { id: 'sign_tee',     x: 21, y: 13, label: '1ST TEE',        target: 'roundSetup', dir: 'E',
      zone: { x: 18, y: 11, w: 6, h: 5 } },
    { id: 'sign_putting', x: 4,  y: 23, label: 'PUTTING GREEN',  target: 'putting',    dir: 'W',
      zone: { x: 2,  y: 23, w: 4, h: 3 } },
  ],
  // NPC roster — avatars are picked from the human roster at load
  // time, indexed by `golferIdx` modulo the roster length so the
  // clubhouse always has bodies even with a tiny golfer list.
  npcs: [
    {
      id: 'caddy',       golferIdx: 1,  type: 'idle',
      x: 7, y: 22, facing: 'E',
      name: 'CADDY CARL',
      lines: [
        "First time at Atlas, huh? Don't aim at the water.",
        "If you slice off the first tee, blame the wind.",
        "Word is the back nine eats handicaps for breakfast.",
      ],
    },
    {
      id: 'walker',      golferIdx: 2,  type: 'walker',
      x: 12, y: 22, facing: 'E',
      wpA: { x: 9,  y: 24 },
      wpB: { x: 18, y: 24 },
      speed: 22,
      pauseAt: 1.6,                      // seconds to idle at each waypoint
      name: 'WANDERING WENDY',
      lines: [
        "Just clocking my steps. Cardio counts as practice.",
        "Ever notice the trees lean into the wind? Cute.",
        "Don't look behind you. The greenskeeper's got vibes.",
      ],
    },
    {
      id: 'proshop',     golferIdx: 3,  type: 'idle',
      x: 18, y: 22, facing: 'W',
      name: 'PRO SHOP PETRA',
      lines: [
        "Wedges are 30% off. You'll need 'em on hole 7.",
        "Rough on this course is a lifestyle, not a hazard.",
      ],
    },
    {
      id: 'sammy',       golferIdx: 4,  type: 'challenger',
      x: 6, y: 27, facing: 'E',
      wager: 50,
      name: 'SLICK SAMMY',
      lines: [
        "You look like you've got fifty bucks in you.",
        "Match play, one round, winner takes the pot.",
      ],
    },
    {
      id: 'yolanda',     golferIdx: 5,  type: 'putter',
      x: 6, y: 19, facing: 'N',
      name: 'YIPS YOLANDA',
      lines: [
        "Don't say 'yips' out loud. It hears you.",
        "The cup moves when you blink. Keep your eyes open.",
      ],
    },
    {
      id: 'pat',         golferIdx: 6,  type: 'putter',
      x: 8, y: 20, facing: 'W',
      name: 'PUTT-PUTT PAT',
      lines: [
        "Practice green cups are honest. The real ones lie.",
        "I've been four-putting since '07. Worth it.",
      ],
    },
  ],
};

// ─── DRIVING RANGE WORLD ────────────────────────────────────────────
// Long narrow strip — 24 wide × 80 tall = 384×1280 px. Tee mat at
// the south, target green at the far north, distance markers along
// the way. No hazards. Ball auto-resets after stopping.

export const RANGE_WORLD = {
  id: 'range',
  width: 24,
  height: 80,
  tee: { x: 12, y: 76 },
  flag: { x: 12, y: 6 },
  greenSlope: { angle: 0, mag: 0 },
  surfaces: [
    { type: 'rough',   shape: rect(0, 0, 24, 80) },
    { type: 'fairway', shape: rect(4, 4, 16, 72) },
    { type: 'tee',     shape: rect(10, 74, 4, 4) },
    { type: 'green',   shape: circleShape(12, 6, 5) },
  ],
  // Distance markers (yards). Drawn as faint horizontal lines + text.
  distanceMarkers: [50, 100, 150, 200, 250, 300],
};

// ─── PUTTING PRACTICE WORLD ─────────────────────────────────────────
// Single big green with 3 practice cups, slight slope. Ball
// auto-resets to the player's feet after each stop.

export const PUTTING_WORLD = {
  id: 'putting',
  width: 24,
  height: 24,
  tee: { x: 12, y: 21 },
  flag: { x: 8,  y: 6 },
  greenSlope: { angle: Math.PI * 0.1, mag: 6 },
  surfaces: [
    { type: 'rough',   shape: rect(0, 0, 24, 24) },
    { type: 'fairway', shape: rect(2, 2, 20, 20) },
    { type: 'green',   shape: circleShape(12, 12, 10) },
  ],
  // Extra cup spots (the primary FLAG handles cup 1; these are extra).
  cups: [
    { x: 16, y: 8 },
    { x: 12, y: 14 },
  ],
};

// Mapping helper — pure-data string types to numeric T_* constants
// owned by GolfStoryScreen. The screen calls translateWorld() once
// per loader to materialise SURFACES with the proper indices.
export function translateSurfaceType(t, T) {
  switch (t) {
    case 'rough':   return T.ROUGH;
    case 'fairway': return T.FAIRWAY;
    case 'green':   return T.GREEN;
    case 'sand':    return T.SAND;
    case 'water':   return T.WATER;
    case 'fringe':  return T.FRINGE;
    case 'tee':     return T.TEE;
    case 'shore':   return T.SHORE;
    default:        return T.ROUGH;
  }
}

// ─── DIALOG OVERLAY ─────────────────────────────────────────────────
// Floating panel center-bottom. Advances through `lines` on tap; the
// final tap (or an explicit LEAVE) closes via onClose. Challenger
// NPCs get an extra `PLAY 1V1 — $WAGER` button that fires onChallenge.

export function NpcDialogOverlay({ npc, lineIdx, onAdvance, onClose, onChallenge }) {
  if (!npc) return null;
  const lines = npc.lines || [];
  const safeIdx = Math.min(lineIdx, Math.max(0, lines.length - 1));
  const line = lines[safeIdx] || '...';
  const onLast = safeIdx >= lines.length - 1;
  const isChallenger = npc.type === 'challenger';
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: '#1a2a1a' }]}>
            <Text style={styles.avatarGlyph}>★</Text>
          </View>
          <View style={styles.nameCol}>
            <Text style={styles.name}>{npc.name || 'NPC'}</Text>
            <Text style={styles.role}>{npc.type === 'challenger' ? 'CHALLENGER' : npc.type.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.line}>{line}</Text>
        <View style={styles.row}>
          {isChallenger && onLast ? (
            <Pressable style={styles.btnPrimary} onPress={onChallenge}>
              <Text style={styles.btnPrimaryText}>PLAY 1V1 · ${npc.wager || 50}</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.btn}
            onPress={() => (onLast ? onClose() : onAdvance())}
          >
            <Text style={styles.btnText}>{onLast ? 'LEAVE' : 'NEXT ▸'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const fontFamily = Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'System' });
const HUD_BG = '#0e1a12';
const HUD_BORDER = '#88f8bb';

const styles = {
  wrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    paddingBottom: 24,
    zIndex: 90,
  },
  panel: {
    width: '92%', maxWidth: 480,
    backgroundColor: HUD_BG, borderWidth: 3, borderColor: HUD_BORDER,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 32, height: 32, borderWidth: 2, borderColor: '#f5f5ec', alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { color: '#fbe043', fontSize: 18, fontWeight: '900' },
  nameCol: { flex: 1 },
  name: { color: '#fff6d8', fontSize: 14, fontWeight: '900', letterSpacing: 2, fontFamily },
  role: { color: '#a9d4a9', fontSize: 9, letterSpacing: 2, fontFamily },
  line: { color: '#f5f5ec', fontSize: 14, lineHeight: 20, marginBottom: 12, fontFamily },
  row: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  btn: {
    backgroundColor: '#1a2a1a', borderWidth: 2, borderColor: HUD_BORDER,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  btnText: {
    color: '#fff6d8', fontSize: 12, fontWeight: '900', letterSpacing: 2, fontFamily,
  },
  btnPrimary: {
    backgroundColor: '#88f8bb', borderWidth: 2, borderColor: '#f5f5ec',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  btnPrimaryText: {
    color: '#04180c', fontSize: 12, fontWeight: '900', letterSpacing: 2, fontFamily,
  },
};
