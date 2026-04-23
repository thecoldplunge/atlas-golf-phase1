extends Node
## GameState — autoload singleton. Holds ALL run-persistent state:
## wallet, owned + equipped items, active golfer + their stats,
## round score. Serialises to user://savegame.tres on every mutation
## so progression survives app restarts.
##
## Mirrors the JS localStorage('atlasGolfShopV1') object plus the
## golfer stats that used to live in the MatchSetupOverlay props.

signal wallet_changed(new_value: int)
signal equipped_changed(kind: String, item_id: String)
signal owned_changed()
signal stats_changed()
signal mode_changed(new_mode: String)

# --- Shop economy -----------------------------------------------------
var wallet: int = Constants.STARTING_WALLET
var owned_items: Array = []
var equipped: Dictionary = { "shirts": null, "pants": null, "hats": null, "clubs": null }

# --- Player / golfer stats -------------------------------------------
# Copied from the JS MatchSetupOverlay + GOLFERS list. Each stat is
# 0..100. Scaling math mirrors golferMultipliers(): power/touch fold
# into v0 via (stat-50)*coeff; focus + recovery lightly influence the
# tempo penalty and bad-lie multipliers respectively.
var active_golfer: Dictionary = {
	"id": "you",
	"name": "YOU",
	"stats":  { "power": 70, "accuracy": 65, "touch": 70, "recovery": 60, "focus": 65 },
	"avatar": { "shirt": "#6a3aa2", "pants": "#c4a470", "hat":   "#f0ece0" },
}

# --- Current game mode -----------------------------------------------
# "clubhouse" | "range" | "putting" | "round" | "shop"
var mode: String = "clubhouse"
var current_hole_idx: int = 0
var current_stroke_count: int = 1
var hole_scores: Array = []   # [{hole, par, strokes}, ...] for the active round

const SAVE_PATH := "user://savegame.tres"

func _ready() -> void:
	_load()

# --- Mutation helpers ------------------------------------------------

func add_wallet(amount: int) -> void:
	wallet = max(0, wallet + amount)
	emit_signal("wallet_changed", wallet)
	_save()

func buy_item(item: Dictionary) -> bool:
	if wallet < int(item.price):
		return false
	wallet -= int(item.price)
	if not owned_items.has(item.id):
		owned_items.append(item.id)
	# Auto-equip if nothing's on that slot yet.
	if equipped.get(item.kind) == null:
		_apply_equip(item.kind, item.id)
	emit_signal("wallet_changed", wallet)
	emit_signal("owned_changed")
	_save()
	return true

func equip(item_id: String) -> void:
	var it = ShopCatalog.find_by_id(item_id)
	if it.is_empty(): return
	_apply_equip(it.kind, item_id)
	_save()

func _apply_equip(kind: String, item_id) -> void:
	equipped[kind] = item_id
	# Clubs are gameplay — propagate the upgrade to Clubs.club_upgrades.
	if kind == "clubs":
		Clubs.club_upgrades.clear()
		if item_id != null:
			var it = ShopCatalog.find_by_id(item_id)
			var up = it.get("upgrade", {})
			if up.has("key"):
				Clubs.club_upgrades[up.key] = up
	emit_signal("equipped_changed", kind, item_id)

# --- Round tracking --------------------------------------------------

func start_round() -> void:
	hole_scores.clear()
	current_hole_idx = 0
	current_stroke_count = 1

func finish_hole(par: int, strokes: int) -> void:
	hole_scores.append({ "hole": current_hole_idx + 1, "par": par, "strokes": strokes })
	# Birdie / eagle / HIO payouts.
	var vs := strokes - par
	var reward := 0
	if vs <= -3 and strokes == 1:  reward = Constants.REWARD_HOLE_IN_ONE
	elif vs <= -2:                  reward = Constants.REWARD_EAGLE
	elif vs == -1:                  reward = Constants.REWARD_BIRDIE
	if reward > 0: add_wallet(reward)
	current_hole_idx += 1
	current_stroke_count = 1

func set_mode(new_mode: String) -> void:
	mode = new_mode
	emit_signal("mode_changed", new_mode)

# --- Stat helpers ----------------------------------------------------
# golferMultipliers() port — clamps + base coefficients from constants.

func power_factor() -> float:
	var p = int(active_golfer.stats.get("power", 50))
	return clamp(1.0 + (p - 50) * Constants.POWER_FACTOR_BASE,
		Constants.POWER_FACTOR_MIN, Constants.POWER_FACTOR_MAX)

func touch_factor() -> float:
	var t = int(active_golfer.stats.get("touch", 50))
	return clamp(1.0 + (t - 50) * Constants.TOUCH_FACTOR_BASE,
		Constants.TOUCH_FACTOR_MIN, Constants.TOUCH_FACTOR_MAX)

func accuracy_stat() -> int:
	return int(active_golfer.stats.get("accuracy", 50))

func focus_stat() -> int:
	return int(active_golfer.stats.get("focus", 50))

func recovery_factor() -> float:
	# Bad-lie boost — higher stat = less penalty from Rough/Bunker/Dirt.
	var r = int(active_golfer.stats.get("recovery", 50))
	return clamp(0.6 + r * 0.008, 0.6, 1.4)

# --- Persistence -----------------------------------------------------

func _save() -> void:
	var data := {
		"wallet": wallet,
		"owned_items": owned_items,
		"equipped": equipped,
		"golfer": active_golfer,
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(data))

func _load() -> void:
	if not FileAccess.file_exists(SAVE_PATH): return
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null: return
	var raw := f.get_as_text()
	var parsed = JSON.parse_string(raw)
	if typeof(parsed) != TYPE_DICTIONARY: return
	wallet = int(parsed.get("wallet", Constants.STARTING_WALLET))
	owned_items = parsed.get("owned_items", [])
	equipped = parsed.get("equipped", equipped)
	if parsed.has("golfer"):
		active_golfer = parsed.golfer
	# Re-apply equipped clubs so upgrade table is populated after reload.
	if equipped.get("clubs") != null:
		_apply_equip("clubs", equipped.clubs)
