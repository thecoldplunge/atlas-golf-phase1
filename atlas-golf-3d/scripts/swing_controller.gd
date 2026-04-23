extends Node
class_name SwingController
## Swipe + tempo swing. Ported from JS endSwipe(). Input: pointer
## positions on the swing pad over time. Output: (power, accuracy,
## tempo_label) for a triggered shot.
##
## State machine:
##   IDLE → player hasn't touched the pad
##   BACKSWING → finger is dragging DOWN, power charges via peakDy
##   LOCKED → finger reversed direction ≥ SWING_LOCK_REVERSAL, power
##             committed at peak; forward drift now scores accuracy
##   RELEASED → finger lifted → launch (if locked && enough pull)
##
## Tempo ring expands from 0 → 1 over TEMPO_DURATION_SEC. Player
## wants to RELEASE at ring==1 for zero penalty. Error maps to up to
## 20% power loss + accuracy nudge (hook if early, slice if late).

signal shot_ready(payload: Dictionary)
signal shot_cancelled()
signal tempo_preview(tempo_t: float, is_overlap: bool)

enum State { IDLE, BACKSWING, LOCKED, RELEASED }

var state: int = State.IDLE
var start_pos: Vector2 = Vector2.ZERO
var current_pos: Vector2 = Vector2.ZERO
var peak_dy: float = 0.0
var peak_x: float = 0.0
var peak_y: float = 0.0
var fwd_peak_dev_x: float = 0.0
var tempo_start_time_ms: int = 0

# Pre-power cap from the AIM pad's vertical axis. 1.0 = full power,
# 0.3 = minimum. Multiplied against swipePower before launch.
var pre_power_cap: float = 1.0

func start(pos: Vector2) -> void:
	state = State.BACKSWING
	start_pos = pos
	current_pos = pos
	peak_dy = 0.0
	peak_x = pos.x
	peak_y = pos.y
	fwd_peak_dev_x = 0.0
	tempo_start_time_ms = Time.get_ticks_msec()

func update_drag(pos: Vector2) -> void:
	if state == State.IDLE or state == State.RELEASED: return
	current_pos = pos
	var dy := pos.y - start_pos.y
	if state == State.BACKSWING:
		if dy > peak_dy:
			peak_dy = min(dy, Constants.SWING_MAX_PULL_PX)
			peak_x = pos.x
			peak_y = pos.y
		elif peak_dy > Constants.SWING_LOCK_MIN_PULL and (peak_y - pos.y) > Constants.SWING_LOCK_REVERSAL:
			state = State.LOCKED
	elif state == State.LOCKED:
		var dev := (pos.x - peak_x) / Constants.SWING_ACCURACY_SPAN
		dev = clamp(dev, -1.0, 1.0)
		if abs(dev) > abs(fwd_peak_dev_x):
			fwd_peak_dev_x = dev
	# Emit tempo preview so HUD can animate the ring.
	var elapsed := (Time.get_ticks_msec() - tempo_start_time_ms) / 1000.0
	var t = clamp(elapsed / Constants.TEMPO_DURATION_SEC, 0.0, 1.8)
	var overlap := abs(1.0 - t) < 0.08
	emit_signal("tempo_preview", t, overlap)

func release() -> void:
	if state != State.LOCKED or peak_dy < Constants.SWING_LOCK_MIN_PULL:
		_cancel()
		return
	state = State.RELEASED
	var swipe_power: float = clamp(peak_dy / Constants.SWING_MAX_PULL_PX, 0.1, 1.0)
	var cap: float = clamp(pre_power_cap, 0.3, 1.0)
	var power: float = swipe_power * cap
	# backDev: small contribution from how far sideways the finger
	# moved during the pull-down (the same 25% weight as JS).
	var back_dev: float = clamp((peak_x - start_pos.x) / Constants.SWING_ACCURACY_SPAN, -1.0, 1.0)
	var accuracy: float = clamp(fwd_peak_dev_x + back_dev * 0.25, -1.0, 1.0)

	# Tempo penalty.
	var elapsed: float = (Time.get_ticks_msec() - tempo_start_time_ms) / 1000.0
	var tempo_error: float = abs(elapsed - Constants.TEMPO_DURATION_SEC)
	var tempo_quality: float = max(0.0, 1.0 - tempo_error / Constants.TEMPO_WINDOW_SEC)
	var tempo_penalty: float = (1.0 - tempo_quality) * Constants.TEMPO_MAX_PENALTY
	power *= (1.0 - tempo_penalty)
	var tempo_acc_shift: float = (1.0 if elapsed > Constants.TEMPO_DURATION_SEC else -1.0) * tempo_penalty * 2.0
	accuracy = clamp(accuracy + tempo_acc_shift, -1.0, 1.0)

	var label: String
	if tempo_error < Constants.TEMPO_PERFECT_BAND:
		label = "PERFECT TEMPO"
	elif tempo_error < Constants.TEMPO_CLOSE_BAND:
		label = "SLIGHTLY EARLY" if elapsed < Constants.TEMPO_DURATION_SEC else "SLIGHTLY LATE"
	else:
		label = "EARLY" if elapsed < Constants.TEMPO_DURATION_SEC else "LATE"

	emit_signal("shot_ready", {
		"power": power,
		"accuracy": accuracy,
		"tempo_label": label,
		"tempo_quality": 1.0 - tempo_penalty / Constants.TEMPO_MAX_PENALTY,
	})
	state = State.IDLE

func _cancel() -> void:
	state = State.IDLE
	emit_signal("shot_cancelled")

func set_pre_power_cap(value: float) -> void:
	pre_power_cap = clamp(value, 0.3, 1.0)
