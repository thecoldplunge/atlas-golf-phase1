extends Node
## CLUBS[] table — ported verbatim from the JS v0.80 build
## (GolfStoryScreen.js). v is the launch velocity (m/s-ish, tuned
## empirically for the arcade feel), angle is the launch elevation
## in degrees, accMult scales the curveDeg when accuracy ≠ 0, and
## powerRate is how fast the backswing charges on the swing pad.
##
## Keep these numbers in lockstep with the JS source. The carry-
## balance sim (sim-gs-carry-balance-qa.js) verifies 50/50/50 →
## 250yd driver and 95/95/100 → 400yd driver using these exact
## values — any change here should also land in the JS copy.

const CLUBS := [
	{ "key": "DR", "name": "Driver",      "short": "DR", "v": 209, "angle": 20, "acc_mult": 1.25, "power_rate": 1.20, "category": "wood" },
	{ "key": "3W", "name": "3-Wood",      "short": "3W", "v": 190, "angle": 24, "acc_mult": 1.15, "power_rate": 1.20, "category": "wood" },
	{ "key": "5W", "name": "5-Wood",      "short": "5W", "v": 176, "angle": 28, "acc_mult": 1.08, "power_rate": 1.20, "category": "wood" },
	{ "key": "5I", "name": "5-Iron",      "short": "5I", "v": 158, "angle": 33, "acc_mult": 1.00, "power_rate": 1.20, "category": "iron" },
	{ "key": "7I", "name": "7-Iron",      "short": "7I", "v": 137, "angle": 39, "acc_mult": 0.95, "power_rate": 1.25, "category": "iron" },
	{ "key": "9I", "name": "9-Iron",      "short": "9I", "v": 119, "angle": 45, "acc_mult": 0.90, "power_rate": 1.30, "category": "iron" },
	{ "key": "PW", "name": "Pitch Wedge", "short": "PW", "v": 104, "angle": 51, "acc_mult": 0.85, "power_rate": 1.35, "category": "wedge" },
	{ "key": "SW", "name": "Sand Wedge",  "short": "SW", "v": 89,  "angle": 58, "acc_mult": 0.80, "power_rate": 1.40, "category": "wedge" },
	{ "key": "PT", "name": "Putter",      "short": "PT", "v": 110, "angle": 0,  "acc_mult": 0.55, "power_rate": 0.55, "category": "putter" },
]

# Runtime-equipped pro-club boosts. A shop purchase writes into here:
#   club_upgrades["DR"] = { "v_mul": 1.08 }   # from "Pro Driver"
# Applied in get_active_club() — baseline v is preserved, so
# un-equipping restores the original behaviour cleanly.
var club_upgrades: Dictionary = {}

func get_active_club(idx: int) -> Dictionary:
	var base := CLUBS[idx].duplicate()
	var up = club_upgrades.get(base.key, {})
	if up.has("v_mul"):
		base.v = base.v * float(up.v_mul)
	if up.has("angle_delta"):
		base.angle = base.angle + float(up.angle_delta)
	return base

func find_by_key(key: String) -> int:
	for i in CLUBS.size():
		if CLUBS[i].key == key:
			return i
	return -1

func club_category_for(key: String) -> String:
	if key == "PT": return "putter"
	if key in ["PW", "SW", "LW", "GW"]: return "wedge"
	if key in ["DR", "3W", "5W", "7W"]: return "wood"
	return "iron"
