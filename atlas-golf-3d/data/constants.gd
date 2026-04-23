extends Node
## Atlas Golf physical + feel constants. Ported from the JS v0.80
## build (see atlas-golf-phase1/GolfStory/GolfStoryScreen.js). Every
## value here has been tuned live on the web prototype — don't change
## them to placate "make it feel different" without noting it in the
## commit, because the carry / tempo / short-game tests all assume
## these exact numbers.

# --- World scale -------------------------------------------------------
const TILE                  := 16      # JS source unit: 16 px per tile
const YARDS_PER_TILE        := 10      # 1 tile = 10 yards on the course
const METERS_PER_YARD       := 0.9144  # for any SI conversion we want later
const WORLD_UNITS_PER_YARD  := 1.0     # 1 Godot unit = 1 yard of course space
                                       # (keeps numbers human-readable — 250yd
                                       #  drive = 250 units downrange)

# --- Ballistics --------------------------------------------------------
# JS used a 2D gravity of 70 px/s² with tile=16 → 4.375 tile/s² =
# 43.75 yards/s². Godot default 9.8 m/s² = ~10.72 yd/s² which is way
# too low for the overhead-arcade feel we had. We KEEP the JS value
# so carry tables match. Godot project still has 9.8 as its default
# for everything else (characters, props); the ball overrides it via
# custom integration.
const BALL_GRAVITY_YPS2     := 43.75

# --- Tempo (v0.79 tuning) ---------------------------------------------
const TEMPO_DURATION_SEC    := 0.9    # ideal swipe duration
const TEMPO_WINDOW_SEC      := 0.5    # ± error that ramps to max penalty
const TEMPO_MAX_PENALTY     := 0.2    # 20% power cost at worst
const TEMPO_PERFECT_BAND    := 0.10   # ± counts as "perfect tempo"
const TEMPO_CLOSE_BAND      := 0.25   # ± counts as "slightly early/late"

# --- Aim joystick (v0.79 tuning) --------------------------------------
const AIM_ROT_SPEED_RPS     := 0.8    # radians/sec at full deflection
const AIM_DEADZONE          := 0.10   # |joyX| below this doesn't rotate

# --- Swing pad mechanics ----------------------------------------------
const SWING_MAX_PULL_PX     := 80.0   # max backswing depth before clamp
const SWING_LOCK_REVERSAL   := 8.0    # finger must reverse ≥8 px to lock
const SWING_LOCK_MIN_PULL   := 20.0   # must have pulled ≥20 px first
const SWING_ACCURACY_SPAN   := 45.0   # forward dev px → accuracy [-1,1]

# --- Camera feel -------------------------------------------------------
const CAM_AIM_BIAS          := 1.00   # v0.79 — 100% landing, 0% ball
const CAM_AIM_ANCHOR_Y_FRAC := 0.0    # v0.79 — crosshair dead-centre

# --- Power / accuracy / stat multipliers (golferMultipliers) ---------
# Mirrors the JS sqrt-blended model so two golfers with identical
# stats on web + Godot feel identical after the port.
const POWER_FACTOR_BASE     := 0.0022    # (power − 50) × base
const POWER_FACTOR_MIN      := 0.80
const POWER_FACTOR_MAX      := 1.20
const TOUCH_FACTOR_BASE     := 0.0015
const TOUCH_FACTOR_MIN      := 0.92
const TOUCH_FACTOR_MAX      := 1.08
const DISTANCE_FACTOR_BASE  := 0.0017    # club_distance stat
const DISTANCE_FACTOR_MIN   := 0.92
const DISTANCE_FACTOR_MAX   := 1.09

# --- Hole / round ------------------------------------------------------
const MAX_STROKES_PER_HOLE  := 12       # hard cap before auto-pickup
const FADE_DURATION_SEC     := 0.45     # walk-to-next-hole fade
const PRACTICE_RESET_SEC    := 1.4      # range/putting auto-reset after stop

# --- Career / economy (seed values) -----------------------------------
const STARTING_WALLET       := 10       # $10 seed, matches v0.77 shop
const CHALLENGER_WAGER      := 50       # standard 1v1 bet
const REWARD_BIRDIE         := 30
const REWARD_EAGLE          := 100
const REWARD_HOLE_IN_ONE    := 500
