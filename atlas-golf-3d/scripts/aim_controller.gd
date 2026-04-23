extends Node
class_name AimController
## Rate-based aim joystick. Ported from the v0.78.5 JS rewrite —
## horizontal stick deflection is a continuous joyX in [-1, 1], and
## aim_angle integrates it over time at AIM_ROT_SPEED_RPS rad/s at
## full deflection. Release → joyX snaps to 0 but aim_angle persists
## where it was rotated to. Vertical stick axis is the pre-power cap
## (absolute position).
##
## aim_angle semantics: 0 = +Z forward, positive = clockwise when
## looking down the +Y axis. In Godot world space on a typical
## third-person setup, aim_angle corresponds to the character's
## yaw rotation. ball.gd launches toward +Z rotated by aim_angle.

signal aim_changed(new_angle: float)
signal pre_power_changed(new_cap: float)
signal aim_locked(locked: bool)

var aim_angle: float = 0.0
var joy_x: float = 0.0
var joy_y: float = 0.0
var locked: bool = false
var pre_power_cap: float = 1.0

func set_joystick(jx: float, jy: float) -> void:
	# Clamp into [-1, 1] to guard against stray pointer math.
	joy_x = clamp(jx, -1.0, 1.0)
	joy_y = clamp(jy, -1.0, 1.0)
	# Vertical is absolute — drag DOWN (positive Y in screen coords
	# with RN convention) to reduce the power cap.
	var down_frac: float = max(0.0, joy_y)
	pre_power_cap = 1.0 - down_frac * (1.0 - 0.3)
	emit_signal("pre_power_changed", pre_power_cap)

func release() -> void:
	# Spring the stick back to centre but keep the angle we reached.
	joy_x = 0.0
	# Keep joy_y too so the cap persists (matches JS v0.78.5 behaviour:
	# aim stops, cap persists).

func lock() -> void:
	locked = true
	joy_x = 0.0
	emit_signal("aim_locked", true)

func unlock() -> void:
	locked = false
	emit_signal("aim_locked", false)

func process(dt: float) -> void:
	if locked: return
	if abs(joy_x) <= Constants.AIM_DEADZONE: return
	aim_angle += joy_x * Constants.AIM_ROT_SPEED_RPS * dt
	# Keep normalised so long sessions don't drift.
	aim_angle = wrapf(aim_angle, -PI, PI)
	emit_signal("aim_changed", aim_angle)

func snap_to(new_angle: float) -> void:
	aim_angle = wrapf(new_angle, -PI, PI)
	emit_signal("aim_changed", aim_angle)
