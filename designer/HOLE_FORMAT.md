# Hole Data Format Reference

Each hole exported from the Course Designer must match this exact JSON structure:

```typescript
interface Hole {
  id: number;           // 1-based hole number
  name: string;         // e.g. "Pine Meadow"
  par: number;          // 3, 4, or 5
  ballStart: { x: number; y: number };  // tee starting position
  cup: { x: number; y: number };        // pin/hole position on green
  terrain: {
    tee: { x: number; y: number; w: number; h: number; r: number };  // tee box rect
    fairway: Array<{ x: number; y: number; w: number; h: number; r: number }>;  // fairway segments
    green: { x: number; y: number; w: number; h: number; r: number };  // green (fringe auto-generated)
  };
  slopes: Array<{
    cx: number;       // 0-1 fraction of green width for center of slope zone
    cy: number;       // 0-1 fraction of green height
    strength: number; // 0-1 how strong the break is
    dir: string;      // compass: 'N','S','E','W','NE','NW','SE','SW'
  }>;
  obstacles: Array<{ type: 'circle'; x: number; y: number; r: number; look?: string }>;  // trees, rocks
  hazards: Array<
    | { type: 'sandRect'; x: number; y: number; w: number; h: number }
    | { type: 'waterRect'; x: number; y: number; w: number; h: number }
  >;
}
```

## World Space
- Each hole is in a 200x320 region (approx)
- H_OFF_X = 170, H_OFF_Y = 200 are the offset constants in the game
- Total world: 1600x1200
- Tee at bottom (~y=288-300), cup at top (~y=20-44)
- All coordinates are world-space absolute

## Tree Types (circle obstacles with look)
- 'tree' (default) — generic tree
- 'pine' — tall conifer
- 'oak' — broad leafy
- 'palm' — tropical
- 'birch' — thin white
- 'cypress' — tall narrow

## Surface Colors (for canvas rendering reference)
- Rough: #2a5220 (dark green, stipple texture)
- Fairway: #7ab855 (bright green, mowing stripes)
- Green: #4ec96a (brightest green, diagonal stripes)
- Fringe: #5fa048 (medium green)
- Sand: #d4b96a (tan, grainy dots)
- Water: #3a7bc8 (blue)
- Tee: #5aad6a
