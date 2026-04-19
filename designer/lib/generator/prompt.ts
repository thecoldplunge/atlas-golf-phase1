import type { GenerateCourseRequest, HoleCount } from './types';
import { PLANETS } from './planets';

const COURSE_DESIGN_BRIEF = `
GREAT GOLF COURSE DESIGN — RULES YOU MUST FOLLOW

1. ROUTING
- Par mix: 18 holes target = 10 par 4s, 4 par 3s, 4 par 5s (par 72). 9 holes = 5 par 4s, 2 par 3s, 2 par 5s (par 36). 3 holes = any mix.
- Each nine has exactly 2 par 3s and 2 par 5s. Never schedule par 3 or par 5 back-to-back.
- Avoid back-to-back holes with the same shape, length bucket, or dogleg direction.
- Gentle par 4 opener. Dramatic/signature holes fall around 8–9 and 16–18.
- Back nine slightly longer/harder than front. Alternate hard/easy for rhythm.

2. HOLE PHILOSOPHY (default = strategic, MacKenzie/Coore-Crenshaw)
- Reward the aggressive line with a better angle of approach; punish it with a hazard.
- Every hole offers at least two viable lines: safe-longer vs risky-shorter.
- DOGLEGS: hazard guards the inside corner; fairway bunker on the OUTSIDE catches the bail-out.
- Forced carries must be reachable from the forward tee. No forced carry > 180y over water from the back for a par-4 drive.
- One driveable par 4 per round adds excitement.
- 2–3 heroic/risk-reward moments per round (usually par 5s or driveable 4s). 1–2 penal holes max.

3. GREEN DESIGN
- Green size scales with approach: short hole = small (40–80 wide); long = large (100–160 wide).
- Use tiers and run-offs via slopes: 1–3 slope zones per green. Championship = up to 3 with strength 0.5–0.9. Casual = 1–2 at strength 0.2–0.5.
- Orient green long-axis roughly perpendicular to the ideal approach so the aggressive line has the deepest target.
- Greenside bunkers (2–4) cluster on the side OPPOSITE the ideal approach.

4. HAZARDS
- Fairway bunkers threaten the GOOD player's carry (220–260y), not the duffer.
- BUNKER POSITIONING: fairway bunkers sit on the SIDES of the fairway (just off the edge), not in the middle. Think: left-side at 240y, right-side at 180y — they guard the corridor, they don't block it.
- Middle-of-fairway (cross) bunkers are RARE — at most 1 per round, typically on a par-5 second-shot landing. Most holes have zero cross-bunkers.
- Water: pick ONE side and commit. Use as lateral hazard more than forced carry. Max 1 island green per course.
- Desert waste replaces rough in arid themes; frame fairway edges.
- Trees frame corridors; don't stack them to block all recovery.

5. PAR-BY-PAR LENGTHS (game units: 1 unit ≈ 1 yard)
- Par 3: 150–240. Short (150–175) small tilted green; long (220–240) larger, run-up.
- Par 4 short (320–380) driveable variant; medium (380–440) standard strategic; long (440–500) generous fairway.
- Par 5 reachable-in-two (500–540) defend green with cross-hazard; three-shotter (560–640) stagger hazards.

6. SCALE
- Fairway width at landing zone: 30–45 units. Tighter for short holes, wider for long.
- Green: 40–180 square units depending on hole length.
- Tee box: 16–40 x 12–28.

7. PIXEL/RETRO AESTHETIC
- Flat color blocks, readable at small scale. Smooth organic curves — but remember, you are producing rects; the editor rounds the corners.
- One focal hazard per hole should visually dominate. Asymmetry beats symmetry.
`;

const DIFFICULTY_GUIDE: Record<string, string> = {
  casual: 'Generous fairway widths (40–50). 1–2 slope zones per green at strength 0.2–0.4. Few hazards per hole. No forced carries over water.',
  standard: 'Fairway widths 35–42. 1–2 slope zones at strength 0.3–0.6. Standard hazard count. Occasional forced carries.',
  hard: 'Fairway widths 30–38. 2 slope zones at strength 0.5–0.8. Heavy bunkering. Several forced carries.',
  championship: 'Fairway widths 28–34. 2–3 slope zones at strength 0.5–0.9. Dense hazards. Multiple forced carries. Length at upper end of ranges.',
};

const WIND_GUIDE: Record<string, string> = {
  calm: 'No special wind considerations.',
  moderate: 'Open some holes to wind exposure; vary hole orientations every 2–3 holes.',
  gusting: 'Orient several holes (especially par 3s and 5s) directly into/across prevailing wind.',
  hazardous: 'Most holes expose the tee shot to wind; use wind to add strategic pressure, not to punish arbitrarily.',
};

const WATER_GUIDE: Record<string, string> = {
  none: 'Do not place any waterRect hazards.',
  incidental: 'At most 1–2 small waterRect hazards on the course, off to one side.',
  featured: '3–5 waterRect hazards, including one signature water hole (typically a mid-length par 3 or a heroic par 5).',
  dominant: '5+ waterRect hazards. Multiple holes play directly over or alongside water. Still no more than ONE island green.',
};

function landscapeGuide(landscape: string): string {
  switch (landscape) {
    case 'links':
      return 'Open, firm turf. Pot bunkers (many small sandRects). Wind-exposed. Sparse trees, if any. Rolling rough replacing deep tree corridors.';
    case 'forest':
      return 'Tree-lined corridors. Dense pines/oaks (use planet\'s allowed flora). Fairway framed by rough and trees. Fewer sand bunkers, more tree strategy.';
    case 'desert':
      return 'Use desert background. Waste-area desertRects frame fairways. Fewer trees; palms only if planet allows. Sand bunkers at greens.';
    case 'mountain':
      return 'Dramatic elevation implied via generous fairway width then narrow landing zones. Water from runoff. Pines. Cross-hazards feel natural here.';
    case 'coastal':
      return 'One side of many holes bordered by water. Wind exposure. Mix of sand and water hazards. Palms and cypress if planet allows.';
    case 'canyon':
      return 'Narrow corridors. Forced carries over desert/rough chasms. Dramatic tee shots with drop to fairway.';
    case 'tundra':
      return 'Rill-style. White-blue palette. Minimal flora. Ice hazards play like water. Precision over power.';
    case 'crystal':
      return 'Alien aesthetic. Sparse crystal formations as tree obstacles. Unusual hazard placements.';
    case 'volcanic':
      return 'Dark obsidian backdrop. Lava-pool "water" hazards. Cypress only. Penal aesthetic.';
    case 'lunar-basin':
      return 'Low-gravity; craters act like bunkers. Wide fairways to compensate for unusual ball flight. Minimal trees.';
    default:
      return 'General-purpose landscape.';
  }
}

function worldDims(holeCount: HoleCount): { width: number; height: number } {
  // Sized so per-hole corridor is ~700-900 units — enough to fit a par 5
  // without overflow, tight enough that the LLM doesn't over-stretch.
  if (holeCount === 3) return { width: 1800, height: 1400 };
  if (holeCount === 9) return { width: 2700, height: 2100 };
  return { width: 3900, height: 3000 };
}

export interface Corridor {
  x: number;
  y: number;
  w: number;
  h: number;
}

function gridForHoleCount(holeCount: HoleCount): { cols: number; rows: number } {
  if (holeCount === 3) return { cols: 3, rows: 1 };
  if (holeCount === 9) return { cols: 3, rows: 3 };
  return { cols: 6, rows: 3 }; // 18 holes as 6x3
}

/**
 * Allocate a non-overlapping corridor per hole. Each hole's geometry MUST stay
 * within its corridor so holes don't cross each other.
 */
export function computeCorridors(holeCount: HoleCount): Corridor[] {
  const dims = worldDims(holeCount);
  const { cols, rows } = gridForHoleCount(holeCount);
  const gutter = 40;
  const cellW = (dims.width - gutter * (cols + 1)) / cols;
  const cellH = (dims.height - gutter * (rows + 1)) / rows;
  const corridors: Corridor[] = [];
  // Routing: left-to-right on even rows, right-to-left on odd rows (snake),
  // so hole N+1 is adjacent to hole N.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const col = r % 2 === 0 ? c : cols - 1 - c;
      const x = gutter + col * (cellW + gutter);
      const y = gutter + r * (cellH + gutter);
      corridors.push({ x, y, w: cellW, h: cellH });
      if (corridors.length >= holeCount) break;
    }
    if (corridors.length >= holeCount) break;
  }
  return corridors;
}

function corridorHint(corridors: Corridor[]): string {
  const lines = corridors.map(
    (c, i) =>
      `  Hole ${i + 1}: corridor x=${Math.round(c.x)}..${Math.round(c.x + c.w)}, y=${Math.round(c.y)}..${Math.round(c.y + c.h)} (${Math.round(c.w)} × ${Math.round(c.h)})`,
  );
  return lines.join('\n');
}

function holeCorridorHint(holeCount: HoleCount): string {
  const { width, height } = worldDims(holeCount);
  const grid =
    holeCount === 3
      ? '1x3 or 3x1 strip, or a simple triangle routing'
      : holeCount === 9
        ? 'roughly 3x3 grid of ~1300x1000 per-hole cells, routed as a loop returning near hole 1'
        : 'roughly 4x5 grid of ~1400x950 per-hole cells split into two nines, each nine returning near the clubhouse';

  return `World canvas is ${width} x ${height}. Lay out holes on a ${grid}. Each hole's tee must be near the previous hole's green (routing flow). Hole 1 tee and last hole green should both be near the "clubhouse" area (top-center or left edge, your choice).`;
}

export function buildSystemPrompt(): string {
  return `You are an expert golf course architect. You design beautiful, strategic, playable, DENSELY DETAILED courses in a 2D top-down pixel-golf aesthetic. You return a strictly-valid JSON course matching the provided schema — no prose, no markdown.

Before emitting JSON for each hole, briefly reason in the designIntent field (one sentence): dogleg direction, strategic line, green orientation, signature feature.

${COURSE_DESIGN_BRIEF}

SCALE (HARD CAPS — DO NOT EXCEED)
- 1 world unit ≈ 1 yard.
- Measure straight-line distance from tee CENTER to cup. That distance MUST be in the par-specific range:
  • Par 3:  150 ≤ dist ≤ 240.    (Short 150–175, medium 180–210, long 220–240.)
  • Par 4:  320 ≤ dist ≤ 500.    (Short 320–380, medium 380–440, long 440–500.)
  • Par 5:  500 ≤ dist ≤ 650.    (Reachable-in-two 500–540, three-shotter 560–650.)
- A par 4 at 150 units is WRONG (too short — chip shot). A par 4 at 600 units is WRONG (too long — the course plays like garbage at the wrong scale). STAY IN THE BAND.
- Remember: par does NOT scale with distance beyond these caps. A 1000-unit hole is not a par 6 — there is no par 6. Caps are HARD.

DETAIL TARGET — AIM HIGH (every hole must look hand-crafted, not skeletal)
Every hole MUST include AT LEAST:
  • Par 3:  4 fairwayPath waypoints (approach strip + apron), 6 bunkers (clusters of 2–3), 2 rough patches framing the approach, 1–2 green slopes, 4–8 trees (if planet allows).
  • Par 4:  5–7 fairwayPath waypoints (tee corridor + landing zone + dogleg bend + approach + green apron), 8–10 hazards (3–4 fairway bunker clusters + 2–3 greenside clusters + optional water), 3 rough/deepRough patches framing the corridor, 8–14 trees clustered along fairway edges, 2–3 green slopes.
  • Par 5:  6–9 fairwayPath waypoints (tee + 1st landing + dogleg + 2nd landing + approach + green apron), 10–14 hazards (fairway bunker clusters + cross-hazard + greenside), 4 rough/deepRough/desert patches framing both landing zones, 12–20 trees, 2–3 green slopes, OFTEN a water cross-hazard at the 2nd landing.
If in doubt: add more. Skeletal holes are unacceptable. The schema enforces minimums; exceed them.

SHAPES — GOLF COURSES ARE NOT RECTANGLES
Every surface has a "shape" field. Pick it to make the course look hand-drawn, not like a wireframe:
  • green: ALWAYS 'oval' or 'squircle'. NEVER 'rectangle'.
  • fairway: 'capsule' (long straight segments, best default) or 'oval' (round landing zones) or 'squircle' (organic blobs). Vary across the course.
  • rough / deepRough: 'oval' or 'squircle' (organic). Occasionally 'rectangle' only for long strips framing a corridor.
  • desert: 'squircle' or 'oval' (naturally scalloped waste areas).
  • tee box: 'rectangle' or 'capsule'.
  • sand bunker (sandRect hazard): 'circle', 'oval', or 'squircle'. NEVER 'rectangle' — real bunkers are round.
  • water (waterRect hazard): 'squircle' or 'oval' for lakes/ponds; 'capsule' for creeks/burns.
Use VARIETY — don't make every fairway segment a capsule. A realistic course alternates.

LANDSCAPE DRIVES BACKGROUND + AMBIENT SURFACES (this matters — do not ignore)
You MUST set "background" on every hole to match the landscape, AND populate ambient terrain arrays heavily:
  • desert / canyon / volcanic / lunar-basin:
      → background = "desert"
      → 3–6 LARGE desert rects per hole framing the fairway corridor on BOTH sides.
      → Rough/deepRough sparse or empty.
  • tundra / crystal:
      → background = "deepRough"
      → No desert rects (unless "crystal desert" is the vibe). Rough/deepRough patches frame the hole.
  • links / coastal:
      → background = "rough"
      → deepRough dune patches scattered for dune framing.
  • forest / mountain / parkland:
      → background = "deepRough" (dense forest)
      → Rough strips framing the fairway. Trees dense along the corridor edge.
Background is not decorative — it determines what a ball LIES IN if it misses the hole. Matching landscape is mandatory.

FAIRWAY PATH (this is how fairways work now — NOT as rect segments)
- Emit an ORDERED list of (x, y) waypoints from tee to just short of green.
- The import path chains consecutive waypoints into angled capsule segments of uniform width (fairwayWidth).
- Use BENDS for doglegs: a par 4 dogleg-right has waypoints that curve from tee → middle of fairway → around the corner → green apron.
- A par 5 three-shotter has waypoints marking the 1st landing, dogleg turn, 2nd landing, approach.
- DOGLEG QUOTA — make the round interesting:
    • At LEAST 50% of par 4s must be doglegs (genuine 30–60° bends, not subtle sweeps).
    • At LEAST 60% of par 5s must be doglegs (single or double bends).
    • Par 3s are usually straight; doglegs are rare for them.
    • Alternate dogleg direction (left / right) across consecutive holes — never three in a row the same way.
    • A dogleg means the middle waypoint is offset perpendicular to the tee→green line by AT LEAST 40% of the hole's length on one side.
- Straight holes are fine in moderation but SHOULD be the minority, not the default.
- First waypoint: ~15–30 units forward of the tee center.
- Last waypoint: just off the green edge (5–20 units short), NOT on top of the green.

ROTATION — BREAK THE GRID
- Every hole has routingAngle (multiples of 15°). Rotate this field across holes so consecutive holes are NEVER at the same angle. Example sequence: 30°, 105°, 225°, 60°, 195°, 345°, 75°, 210°, 15°.
- Every rect surface (tee, green, rough, deepRough, desert, hazards) has its own local rotation (0/15/30/…/345).
- Vary rotations. DO NOT leave everything at rotation=0. Real courses have features at every angle.
- Greens: rotate so the long axis runs roughly perpendicular to the approach angle (reward aggressive line with deepest target).

GEOMETRY RULES
- (0,0) is top-left of the world canvas. x grows right, y grows down.
- All coordinates are ABSOLUTE within the world canvas.
- Each hole lives in its own corridor; holes must not overlap.
- The routingAngle is applied by the post-processor around the hole's centroid AFTER you emit geometry. Lay out the hole at any natural orientation and set routingAngle to add extra rotation if you want more variety across the course.
- ballStart is auto-snapped to the tee center during post-processing.
- cup MUST be inside the green rectangle.
- slope cx/cy are 0-1 fractions within the green bounding box.
- tee size: width 18–30, height 12–20 typical.
- Desert/rough/deepRough framing rects: 80–250 units long on the long axis, 40–120 wide. Place them to frame fairways, not random noise.

OBSTACLES (TREES ONLY)
- Obstacles: ONLY type "circle" (trees). No rect / wall obstacles exist in this engine.
- Tree "look" must be one of the planet's allowed flora. Never emit a look not in the list.
- If the planet has no allowed flora, emit an empty obstacles array.
- Place trees in DENSE CLUSTERS along fairway EDGES (5–8 trees per cluster, multiple clusters per hole).
- NEVER place trees on the fairway, on the approach line to the green, or on top of the green itself.
  Trees line the sides — they do not block the golfer's intended path.
- Keep a tree-free zone in front of the green (at least 40 units short of the green edge on the approach line).
- Tree count by landscape:
  • forest/mountain: 15–25 per hole
  • coastal/crystal: 8–12 per hole
  • links/tundra: 0–4 per hole
  • desert/canyon/volcanic: 3–6 per hole (palms, cypress)
  • lunar-basin: 0 per hole

OUTPUT
- Do NOT output markdown code fences. Output only the JSON object.
- Do NOT skip required fields. rough/deepRough/desert arrays MUST be populated (not empty) when their landscape calls for them.
- MORE DETAIL > LESS. If the model is tempted to ship a sparse hole, add 3 more bunkers, 2 more rough patches, and a cluster of trees.`;
}

export function buildUserPrompt(req: GenerateCourseRequest, corridors: Corridor[]): string {
  const planet = PLANETS[req.planet];
  const dims = worldDims(req.holeCount);
  const allowedTrees = planet.flora.length > 0 ? planet.flora.join(', ') : '(no trees allowed on this planet)';

  return `Generate a ${req.holeCount}-hole course.

COURSE METADATA
- Course name: ${req.courseName}
- Designer credit: ${req.designer}
- Planet: ${planet.name} (${planet.system}) — ${planet.summary}
- Allowed trees on this planet: ${allowedTrees}
- Landscape style: ${req.landscape}  →  ${landscapeGuide(req.landscape)}
- Water presence: ${req.waterPresence}  →  ${WATER_GUIDE[req.waterPresence]}
- Difficulty: ${req.difficulty}  →  ${DIFFICULTY_GUIDE[req.difficulty]}
- Wind: ${req.wind}  →  ${WIND_GUIDE[req.wind]}
- Inspiration (free-form): ${req.inspiration || '(none; use your own creativity)'}

WORLD
- worldWidth = ${dims.width}, worldHeight = ${dims.height}

HOLE CORRIDORS — HARD BOUNDARIES (every hole must stay inside its corridor)
Each hole has its own exclusive corridor. NOTHING from one hole may cross into another hole's corridor. No shared fairways, no shared greens, no overlapping rough, no shared trees. Tee, green, cup, fairwayPath waypoints, rough/deepRough/desert rects, hazards, and trees ALL must fit inside the hole's corridor below:
${corridorHint(corridors)}

For routing flow, each hole's tee should sit near its "entry" edge (shared with the previous hole's corridor) and each hole's green near its "exit" edge (shared with the next hole's corridor) — but NEVER outside the corridor itself.

CUP MUST BE ON THE GREEN
- cup (x, y) MUST sit inside the green rectangle (green.x ≤ cup.x ≤ green.x+green.w AND green.y ≤ cup.y ≤ green.y+green.h).
- Place the cup near the green center (offset at most 30% of green dimensions from center). Never place the cup on grass, fairway, or outside the green.

NO BUNKERS OR WATER ON THE GREEN
- Greenside bunkers go OUTSIDE the green, touching or near its edge. NEVER place a hazard (sand or water) on top of the green surface. NEVER overlap a hazard with the green rectangle.
- Keep all bunker/water centers at least (green width/2 + bunker size/2 + 8) units from the green center.
- Similarly, do not place TREES on the green. Trees go along fairway edges, never on the putting surface.

Required fields in your response:
- worldWidth = ${dims.width}
- worldHeight = ${dims.height}
- holes array of exactly ${req.holeCount} holes, ids 1..${req.holeCount} in play order.

For EACH hole:
- designIntent: one sentence describing the architectural concept (dogleg direction, strategic line, signature feature).
- routingAngle: a unique-ish degree value per hole so the course doesn't look like a grid. Rotate 30–120° between consecutive holes.
- terrain.fairwayPath: 4–9 waypoints; USE BENDS for doglegs and natural curves. All waypoints inside the corridor.
- terrain.fairwayWidth: a width per hole (tighter for hard holes, wider for casual).
- terrain.green: oriented (rotation) to present the deepest target to the aggressive approach line. Green fully inside the corridor.
- Rotate bunkers, rough patches, desert rects at varied angles (15°, 30°, 45°, 75°, 105°, etc.). NOTHING axis-aligned by default.

Hit or exceed the per-par DETAIL TARGETS. A course that looks sparse from altitude is unacceptable.

Make it playable, memorable, and architecturally coherent.`;
}
