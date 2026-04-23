extends Node
## Shot-type profiles. Scales the v0 multiplier (carry) and launch-
## angle multiplier (apex) per shot type. Values locked by the JS
## v0.76 short-game buff: chip 0.5 → 1.0, bump 0.75 → 1.5, flop
## 0.33 → 0.66 — players told us short game felt like half-shots,
## so all three landed roughly 2× carrier.
##
## Eligibility rules mirror shotTypeEligibleGS() in the JS build.

const SHOT_TYPES := {
	"normal":  { "carry": 1.0,  "apex": 1.0, "label": "Normal" },
	"chip":    { "carry": 1.0,  "apex": 0.7, "label": "Chip" },
	"flop":    { "carry": 0.66, "apex": 2.0, "label": "Flop"    , "wedge_only": true, "needs_clean_lie": false },
	"stinger": { "carry": 1.0,  "apex": 0.5, "label": "Stinger" , "iron_or_wood_only": true, "needs_clean_lie": true  },
	"bump":    { "carry": 1.5,  "apex": 0.4, "label": "Bump & Run", "wedge_only": true },
	"tap":     { "carry": 0.5,  "apex": 1.0, "label": "Tap"     , "putter_only": true },
	"blast":   { "carry": 1.5,  "apex": 1.0, "label": "Blast"   , "putter_only": true },
}

func is_eligible(type_key: String, club_key: String, lie_label: String) -> bool:
	var prof = SHOT_TYPES.get(type_key, null)
	if prof == null: return false
	var is_putter := (club_key == "PT")
	var is_wedge  := (club_key in ["PW", "SW", "LW", "GW"])
	var is_iron_or_wood := (club_key in ["5I", "7I", "9I", "DR", "3W", "5W"])
	var clean_lie := (lie_label in ["Fairway", "Green", "Fringe", "Tee Box"])

	if prof.get("putter_only", false) and not is_putter: return false
	if prof.get("wedge_only", false) and not is_wedge: return false
	if prof.get("iron_or_wood_only", false) and not is_iron_or_wood: return false
	if prof.get("needs_clean_lie", false) and not clean_lie: return false
	if type_key == "normal" and is_putter: return false   # putter uses tap/blast
	return true
