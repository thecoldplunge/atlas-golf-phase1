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
- Water: pick ONE side and commit. Use as lateral hazard more than forced carry. Max 1 island green per course.
- Cross-hazards (bunker or water strip across fairway) work at 2nd-shot landing on par 5s.
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
  if (holeCount === 9) return { width: 2600, height: 2000 };
  return { width: 3800, height: 3000 };
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
  return `You are an expert golf course architect. You design beautiful, strategic, playable, DETAILED courses in a 2D top-down pixel-golf aesthetic. You return a strictly-valid JSON course matching the provided schema — no prose, no markdown.

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
  • Par 3:  2 fairway/apron segments, 2 bunkers, 1–2 rough patches framing the approach, 1 greenside framing (trees or rough), 1–2 green slopes, 3–6 trees/flora (if planet allows).
  • Par 4:  3–4 fairway segments (tee strip + landing zone + approach strip), 3–5 bunkers (fairway + greenside), 2–3 rough patches framing the corridor, 5–10 trees/flora or equivalent rough framing, 1–3 green slopes.
  • Par 5:  4–5 fairway segments (tee strip + 1st landing + 2nd landing + approach + green apron), 4–6 bunkers (fairway + cross-hazard + greenside), 3–4 rough/deepRough/desert patches framing both landing zones, 6–12 trees/flora, 1–3 green slopes, OFTEN a cross-hazard in the 2nd-shot landing zone.
If in doubt: add more. Skeletal holes (1 fairway rect, 1 bunker) are unacceptable.

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

GEOMETRY RULES
- (0,0) is top-left of the world canvas. x grows right, y grows down.
- All coordinates are ABSOLUTE within the world canvas.
- Each hole lives in its own corridor; holes must not overlap.
- ballStart MUST be inside the tee box (between tee.x..tee.x+tee.w and tee.y..tee.y+tee.h). Use the tee center.
- cup MUST be inside the green rectangle.
- slope cx/cy are 0-1 fractions within the green bounding box.
- tee size: width 18–30, height 12–20 typical.
- Desert/rough/deepRough framing rects: 80–250 units long on the long axis, 40–120 wide. Place them to frame fairways, not random noise.

OBSTACLES (TREES ONLY)
- Obstacles: ONLY type "circle" (trees). No rect / wall obstacles exist in this engine.
- Tree "look" must be one of the planet's allowed flora. Never emit a look not in the list.
- If the planet has no allowed flora, emit an empty obstacles array.
- Place trees in CLUSTERS along fairway edges (3–6 trees per cluster) — not in single isolated lonely trees.
- In forest landscapes, use many trees (6–12 per hole). In links, very few (0–3). In desert, almost none.

OUTPUT
- Do NOT output markdown code fences. Output only the JSON object.
- Do NOT skip required fields. rough/deepRough/desert arrays MUST be populated (not empty) when their landscape calls for them.
- MORE DETAIL > LESS. If the model is tempted to ship a sparse hole, add 3 more bunkers, 2 more rough patches, and a cluster of trees.`;
}

export function buildUserPrompt(req: GenerateCourseRequest): string {
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

WORLD LAYOUT
${holeCorridorHint(req.holeCount)}

Required fields in your response:
- worldWidth = ${dims.width}
- worldHeight = ${dims.height}
- holes array of exactly ${req.holeCount} holes, ids 1..${req.holeCount} in play order.

Remember the routing, par-mix, and green-size rules. Make it playable and memorable.`;
}
