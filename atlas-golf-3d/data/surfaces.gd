extends Node
## Surface properties — mirrors SURFACE_PROPS in the JS build. Used
## by ball.gd when rolling / bouncing / settling. bounce_keep is the
## y-velocity fraction retained on first ground contact; roll_decel
## is the exponential drag while rolling (per second). power_penalty
## is a [low, high] band applied to v0 on a shot leaving this lie.

enum Kind {
	ROUGH,
	FAIRWAY,
	GREEN,
	SAND,
	WATER,
	FRINGE,
	TEE,
	SHORE,
	OOB,
}

const SURFACE_PROPS := {
	Kind.ROUGH:   { "bounce_keep": 0.18, "roll_decel": 4.20, "label": "Rough",   "power_penalty": [0.85, 0.91], "swing_sensitivity": 1.15, "slope_ang": 0.0, "slope_mag": 0.0 },
	Kind.FAIRWAY: { "bounce_keep": 0.35, "roll_decel": 1.10, "label": "Fairway", "power_penalty": [1.0, 1.0],   "swing_sensitivity": 1.0,  "slope_ang": 0.0, "slope_mag": 0.0 },
	Kind.GREEN:   { "bounce_keep": 0.28, "roll_decel": 0.70, "label": "Green",   "power_penalty": [1.0, 1.0],   "swing_sensitivity": 1.0,  "slope_ang": 0.0, "slope_mag": 0.0 },
	Kind.FRINGE:  { "bounce_keep": 0.32, "roll_decel": 0.95, "label": "Fringe",  "power_penalty": [1.0, 1.0],   "swing_sensitivity": 1.0,  "slope_ang": 0.0, "slope_mag": 0.0 },
	Kind.TEE:     { "bounce_keep": 0.26, "roll_decel": 0.82, "label": "Tee Box", "power_penalty": [1.0, 1.0],   "swing_sensitivity": 1.0,  "slope_ang": 0.0, "slope_mag": 0.0 },
	Kind.SAND:    { "bounce_keep": 0.05, "roll_decel": 5.50, "label": "Bunker",  "power_penalty": [0.775, 0.85], "swing_sensitivity": 1.6, "slope_ang": 0.0, "slope_mag": 0.0 },
	Kind.SHORE:   { "bounce_keep": 0.12, "roll_decel": 3.80, "label": "Dirt",    "power_penalty": [0.85, 0.91], "swing_sensitivity": 1.35, "slope_ang": 0.0, "slope_mag": 0.0 },
	Kind.WATER:   { "bounce_keep": 0.00, "roll_decel": 0.00, "label": "Water",   "power_penalty": [1.0, 1.0],   "swing_sensitivity": 1.0,  "slope_ang": 0.0, "slope_mag": 0.0, "hazard": true },
	Kind.OOB:     { "bounce_keep": 0.00, "roll_decel": 0.00, "label": "Out of Bounds", "power_penalty": [1.0, 1.0], "swing_sensitivity": 1.0, "slope_ang": 0.0, "slope_mag": 0.0, "ob": true },
}

func props_for(kind: int) -> Dictionary:
	return SURFACE_PROPS.get(kind, SURFACE_PROPS[Kind.ROUGH])
