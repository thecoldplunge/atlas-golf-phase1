extends RigidBody3D
## Ball physics — ballistic flight + roll + surface friction + wind.
## Ported from launchBall() + stepBall() in the JS build. We use
## CUSTOM_INTEGRATOR so the arcade tuning (JS gravity of 43.75 yd/s²,
## per-surface roll_decel, etc.) applies cleanly without fighting
## Godot's default RigidBody dynamics.
##
## State machine:
##   REST    → not moving; shot_requested() transitions to FLYING
##   FLYING  → airborne; applies gravity + wind + spin curve
##   ROLLING → touched ground once; gravity zeroed, roll_decel drag
##   HOLED   → within cup radius with low velocity
##   HAZARD  → entered water; triggers reset to last_good
##
## The `shot_requested` signal carries power + accuracy + club idx +
## spin + shot_type. Everything flows from there.

signal ball_stopped(final_pos: Vector3, state: String)
signal ball_launched(power: float, accuracy: float)

enum BallState { REST, FLYING, ROLLING, HOLED, HAZARD }

var ball_state: int = BallState.REST
var wind: Vector3 = Vector3.ZERO                # yards/sec
var spin_x: float = 0.0                         # -1 draw, +1 fade
var spin_y: float = 0.0                         # +1 low/stinger, -1 high
var last_good_pos: Vector3 = Vector3.ZERO
var last_shot_start: Vector3 = Vector3.ZERO
var current_surface_kind: int = Surfaces.Kind.ROUGH
var current_hole_pos: Vector3 = Vector3.ZERO    # flag position for HOLED check
var stop_timer: float = 0.0                     # low-speed accumulator → rest
const STOP_THRESHOLD_SPEED := 0.35              # yd/s below which we settle
const STOP_THRESHOLD_TIME := 0.25               # seconds

func _ready() -> void:
	custom_integrator = true
	last_good_pos = global_position

## Launch a shot. power ∈ [0..1], accuracy ∈ [-1..1], club_idx into
## Clubs.CLUBS, spin_x/y ∈ [-1..1], shot_type key from ShotTypes.
func launch(power: float, accuracy: float, club_idx: int,
			in_spin_x: float, in_spin_y: float, shot_type: String,
			aim_angle: float) -> void:
	var club = Clubs.get_active_club(club_idx)
	var prof = ShotTypes.SHOT_TYPES.get(shot_type, ShotTypes.SHOT_TYPES.normal)
	var surf_props = Surfaces.props_for(current_surface_kind)

	# --- Carry magnitude -----------------------------------------
	# v0Raw = club.v * power * golferPower * golferTouch * clubDistance
	#       * liePowerMid * recoveryBoost * shotType.carry
	# Mirrors launchBall() in the JS build.
	var power_mul: float = power * GameState.power_factor() * GameState.touch_factor()
	var lie_penalty: Array = surf_props.power_penalty
	var lie_power_mid: float = (float(lie_penalty[0]) + float(lie_penalty[1])) * 0.5
	var bad_lie := current_surface_kind in [Surfaces.Kind.ROUGH, Surfaces.Kind.SAND, Surfaces.Kind.SHORE]
	var recovery_boost: float = (2.0 - GameState.recovery_factor()) if bad_lie else 1.0
	var v0_raw: float = float(club.v) * power_mul * lie_power_mid * recovery_boost
	v0_raw *= float(prof.carry)

	# --- Launch angle (apex) -------------------------------------
	# JS shotParams(): effAngleDeg = club.angle * max(0.35, 1 - spinY*0.32)
	# + high-shot penalty on v0 for negative spinY (hit it high).
	var launch_mod: float = max(0.35, 1.0 - in_spin_y * 0.32)
	var eff_angle_deg: float = float(club.angle) * launch_mod * float(prof.apex)
	eff_angle_deg = clamp(eff_angle_deg, 0.0, 75.0)
	var angle_rad: float = deg_to_rad(eff_angle_deg)

	var high_bite: float = 0.18 if int(club.angle) <= 39 else 0.08
	if in_spin_y < 0.0:
		v0_raw *= (1.0 + in_spin_y * high_bite)

	# --- Accuracy curve ------------------------------------------
	# curveDeg = accuracy * 18 * club.accMult — rotates aim by up
	# to ±18° on a fully-off shot (slice/hook).
	var curve_deg: float = accuracy * 18.0 * float(club.acc_mult)
	var total_aim: float = aim_angle + deg_to_rad(curve_deg)

	# --- Compose velocity vector ---------------------------------
	# Game world: +Z is "downrange" at aim=0, +X is right, +Y is up.
	var horizontal: float = v0_raw * cos(angle_rad)
	var vertical:   float = v0_raw * sin(angle_rad)
	var dir := Vector3(sin(total_aim), 0.0, cos(total_aim))
	linear_velocity = dir * horizontal + Vector3.UP * vertical

	# --- Spin (lateral curve during flight) ----------------------
	spin_x = in_spin_x
	spin_y = in_spin_y

	last_shot_start = global_position
	last_good_pos = global_position
	ball_state = BallState.FLYING
	stop_timer = 0.0
	emit_signal("ball_launched", power, accuracy)

func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
	match ball_state:
		BallState.FLYING:    _integrate_flying(state)
		BallState.ROLLING:   _integrate_rolling(state)
		_: pass  # REST / HOLED / HAZARD are kinematically frozen

func _integrate_flying(state: PhysicsDirectBodyState3D) -> void:
	var dt := state.step
	var v := state.linear_velocity
	# Gravity — arcade-tuned, NOT the engine's 9.8.
	v.y -= Constants.BALL_GRAVITY_YPS2 * dt
	# Wind — applies through the flight but weaker the closer to ground.
	v += wind * dt
	# Spin curve — lateral acceleration proportional to horizontal speed
	# and spin_x magnitude. Mirrors JS stepBall curve integration.
	var horiz_speed: float = Vector3(v.x, 0.0, v.z).length()
	if horiz_speed > 1.0:
		var right_dir := v.cross(Vector3.UP).normalized()
		v += right_dir * spin_x * horiz_speed * dt * 0.6
	state.linear_velocity = v
	# Landing check — once y-velocity flips negative and we're near
	# ground plane (assume y=0 for the prototype), transition to
	# rolling. Full version will raycast surface height.
	if state.transform.origin.y <= 0.05 and v.y < 0.0:
		state.transform.origin.y = 0.05
		var props = Surfaces.props_for(current_surface_kind)
		state.linear_velocity = Vector3(v.x * 0.8, max(0.0, -v.y * float(props.bounce_keep)), v.z * 0.8)
		ball_state = BallState.ROLLING

func _integrate_rolling(state: PhysicsDirectBodyState3D) -> void:
	var dt := state.step
	var v := state.linear_velocity
	v.y = 0.0
	state.transform.origin.y = max(state.transform.origin.y, 0.05)
	var props = Surfaces.props_for(current_surface_kind)
	# Exponential decel — matches v *= (1 - roll_decel*dt) in JS.
	var decel: float = float(props.roll_decel)
	v *= max(0.0, 1.0 - decel * dt)
	# Slope acceleration (2× the props.slope_mag per v0.72 tuning).
	if float(props.slope_mag) > 0.0:
		var ang: float = float(props.slope_ang)
		v.x += sin(ang) * float(props.slope_mag) * 2.0 * dt
		v.z -= cos(ang) * float(props.slope_mag) * 2.0 * dt
	state.linear_velocity = v
	# Stop detection.
	if v.length() < STOP_THRESHOLD_SPEED:
		stop_timer += dt
		if stop_timer >= STOP_THRESHOLD_TIME:
			_settle(state)
	else:
		stop_timer = 0.0
	# Hole-out check.
	if current_hole_pos.distance_to(state.transform.origin) < 0.7 and v.length() < 3.0:
		ball_state = BallState.HOLED
		state.linear_velocity = Vector3.ZERO
		emit_signal("ball_stopped", state.transform.origin, "holed")

func _settle(state: PhysicsDirectBodyState3D) -> void:
	ball_state = BallState.REST
	state.linear_velocity = Vector3.ZERO
	last_good_pos = state.transform.origin
	emit_signal("ball_stopped", state.transform.origin, "rest")

func reset_to(pos: Vector3) -> void:
	global_position = pos
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	ball_state = BallState.REST
	stop_timer = 0.0
	last_good_pos = pos

func set_surface(kind: int) -> void:
	current_surface_kind = kind

func set_hole(flag_pos: Vector3) -> void:
	current_hole_pos = flag_pos
