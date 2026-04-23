# Atlas Golf 3D (Godot 4)

3D port of the Golf Story prototype. All the gameplay systems built up in
the JS version (`../` — `atlas-golf-phase1/GolfStory/GolfStoryScreen.js`)
carry over:

- **Swipe-tempo swing** (no 3-click meter). Touch the swing pad, drag
  down to load power, reverse to lock it, drag up to strike. A tempo
  ring expands from centre over 0.9 s; releasing right at the ring's
  edge = zero penalty, missing the window costs up to 20% power + tugs
  accuracy toward hook (early) or slice (late).
- **Rate-based aim joystick**. Horizontal deflection continuously
  rotates `aim_angle` at ~0.8 rad/s (≈46°/s) until released. Vertical
  is an absolute-position pre-power-cap slider.
- **Walkable clubhouse** (outdoor hub with signs to the 1st tee,
  driving range, putting green, pro shop) + NPCs you can TALK to + a
  shop with wallet/inventory persistence.
- **Course data** ported from the JS `HOLES[]` array — same hole
  layouts + par + distances. Translated into 3D voxel terrain on load.
- **Ported physics**: carry math (50/50/50 → 250 yd driver, max →
  400 yd), short-game profiles (chip 1.0× / bump 1.5× / flop 0.66×),
  wind, slope forces, surface-specific roll decel + bounce, hazards.
- **Stats + clubs**: `POWER / ACCURACY / TOUCH / RECOVERY / FOCUS`
  per-golfer stats fold into v0 + accuracy + putt precision the same
  way the JS `golferMultipliers` does. `CLUBS[]` table (DR / 3W / 5W /
  5I / 7I / 9I / PW / SW / PT) with v + launch-angle + accuracy
  multipliers. Pro-club upgrades from the shop apply per-key `v_mul`.
- **Career + currency scaffolded**: `GameState` autoload persists
  wallet + owned items + equipped slots to `user://savegame.tres`
  (Godot's Resource system). Round/challenger payouts + upgrade buys
  write through.

## Getting started

1. Install Godot 4.2 or later from https://godotengine.org/download
2. Open this folder (`atlas-golf-3d`) in the Godot editor → "Import
   Project" → pick `project.godot`
3. Hit `F5` (Play). The game boots into the clubhouse scene.

## Controls

On a touch device use the HUD pads. On desktop for testing:

| Action | Key |
|---|---|
| Walk | `WASD` or arrow keys |
| Aim left / right (while aiming) | `Q` / `E` |
| Tee off / swing commit | `Space` |
| Interact (sign, NPC) | `F` |
| Toggle camera | `V` |

## Directory map

```
project.godot                       Godot project file
data/
  constants.gd                      Ported: TILE, YARDS_PER_TILE, GRAVITY, TEMPO_*
  clubs.gd                          CLUBS[] (DR/3W/5W/.../PT)
  shot_types.gd                     SHOT_TYPE_PROFILES (normal/chip/flop/bump/...)
  surfaces.gd                       SURFACE_PROPS (fairway/green/rough/sand/water)
  holes.gd                          HOLES[] — par, length, tee, flag, surfaces
  shop_catalog.gd                   SHOP_CATALOG — polos / pants / hats / clubs
  npc_dialog.gd                     NPC dialog scripts
scripts/
  game_state.gd                     Autoload: wallet, inventory, equipped, stats
  swing_controller.gd               Swipe + tempo ring + power/accuracy compute
  aim_controller.gd                 Rate-based joystick aim
  ball.gd                           3D ballistic + roll + wind + surface + spin
  golfer.gd                         CharacterBody3D walk + address + swing anim
  camera_rig.gd                     Third-person orbit cam
  hole.gd                           One-hole scene controller
  clubhouse.gd                      Outdoor clubhouse logic (signs + NPCs)
  hud.gd                            On-screen HUD (swing pad, aim pad, etc.)
scenes/
  main.tscn                         Entry scene — boots clubhouse
  clubhouse/clubhouse.tscn          Outdoor walkable hub
  hole/hole_one.tscn                Playable par-3 prototype
  player/golfer.tscn                Character + anim tree
  ball/ball.tscn                    RigidBody3D ball
  camera/camera_rig.tscn            Third-person orbit cam
  ui/hud.tscn                       Main HUD overlay
assets/                             (empty — drop sprite/model assets here)
```

## Roadmap after the scaffold

The scaffold gives you a playable hole 1 with walking + aim + swing +
ball flight + scoring. Next steps (not included, but data + hooks are
in place):

- Import 3D character model (FBX from Mixamo or a custom voxel from
  Blockbench — drop into `assets/` + wire the golfer scene's
  `MeshInstance3D`)
- Voxel terrain via the `Voxel Tools` plugin for buildable / editable
  courses (Minecraft-style)
- Multiplayer pass-and-play → online via `MultiplayerSpawner`
- Full course (9 or 18 holes) by adding entries to `data/holes.gd`
- Pro-shop interior + driving range + putting green scenes
  (stubs already wired via signs in the clubhouse)

## How this relates to the JS spike

The JS version under `../` (see `atlas-golf-phase1/GolfStory/
GolfStoryScreen.js`) stays live as the tuning sandbox. When a
physics constant or gameplay value feels off, we tune it there first
(fast iteration on web), then copy the number over to the matching
constant in `data/*.gd`. Both versions stay in sync until the 3D one
catches up, then the JS prototype retires.
