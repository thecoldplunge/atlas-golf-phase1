extends Node3D
class_name Hole
## Hole scene controller. Loads a specific HOLES[] entry, spawns the
## terrain / tee / flag / trees / ball / golfer, runs the per-shot
## state machine, reports scores back to GameState on hole-out.
##
## This scaffold generates terrain procedurally from the polygon
## surface definitions (MeshInstance3D per surface), enough to walk
## on and putt across. A later pass swaps to voxel terrain via the
## Voxel Tools plugin if we want Minecraft-style editable courses.

signal hole_finished(par: int, strokes: int)

@export var hole_idx: int = 0
@export var golfer_path: NodePath
@export var ball_path: NodePath
@export var camera_path: NodePath
@export var flag_path: NodePath
@export var ground_path: NodePath

var hole_data: Dictionary = {}
var aim: AimController = null
var swing: SwingController = null
var stroke_count: int = 0

enum Phase { ADDRESS, AIMING, SWIPING, FLYING, HOLED }
var phase: int = Phase.AIMING

@onready var golfer: Golfer          = get_node(golfer_path) if not golfer_path.is_empty() else null
@onready var ball: Node              = get_node(ball_path)   if not ball_path.is_empty() else null
@onready var camera_rig: CameraRig   = get_node(camera_path) if not camera_path.is_empty() else null
@onready var flag: Node3D            = get_node(flag_path)   if not flag_path.is_empty() else null
@onready var ground: Node3D          = get_node(ground_path) if not ground_path.is_empty() else null

func _ready() -> void:
	hole_data = Holes.load_hole(hole_idx)
	aim = AimController.new()
	swing = SwingController.new()
	add_child(aim)
	add_child(swing)
	_layout_hole()
	_begin_address()

	swing.shot_ready.connect(_on_shot_ready)
	swing.shot_cancelled.connect(_on_shot_cancelled)
	if ball and ball.has_signal("ball_stopped"):
		ball.ball_stopped.connect(_on_ball_stopped)

func _process(delta: float) -> void:
	# Keyboard fallback for desktop testing — Q/E rotate aim.
	if phase == Phase.AIMING:
		var jx := Input.get_action_strength("aim_right") - Input.get_action_strength("aim_left")
		aim.set_joystick(jx, 0.0)
	aim.process(delta)
	if golfer:
		golfer.set_aim_yaw(aim.aim_angle)
	if camera_rig:
		camera_rig.set_aim_yaw(aim.aim_angle)
		if phase == Phase.AIMING or phase == Phase.SWIPING:
			camera_rig.set_landing_spot(_projected_landing())
		if phase == Phase.FLYING and ball:
			camera_rig.set_ball_velocity(ball.linear_velocity)
	# Desktop space key commits the swing (for testing without pad).
	if phase == Phase.AIMING and Input.is_action_just_pressed("tee_off"):
		# Fire a "full swing" test shot — 0.8 power, zero accuracy
		# nudge, perfect tempo.
		_debug_quick_shot()

func _layout_hole() -> void:
	# For the scaffold we emit a flat "fairway" ground + a tee marker
	# and flag pole at the correct distance for the hole. Full terrain
	# generation (reading hole_data.surfaces and building meshes /
	# voxel volumes per surface) is a follow-up pass — the ground
	# here is a single big MeshInstance3D with a green material.
	var tee_pos := _tile_to_world(hole_data.tee.x, hole_data.tee.y, hole_data.width, hole_data.height)
	var flag_pos := _tile_to_world(hole_data.flag.x, hole_data.flag.y, hole_data.width, hole_data.height)
	if flag:
		flag.global_position = Vector3(flag_pos.x, 0.0, flag_pos.z)
	if ball:
		ball.global_position = Vector3(tee_pos.x, 0.05, tee_pos.z)
		if ball.has_method("reset_to"):
			ball.reset_to(ball.global_position)
		if ball.has_method("set_hole"):
			ball.set_hole(flag.global_position if flag else Vector3.ZERO)
	if camera_rig:
		camera_rig.target_node_path = ball.get_path() if ball else NodePath()
		camera_rig.set_mode(CameraRig.Mode.FOLLOW_AIM)

func _tile_to_world(tx: int, ty: int, _w: int, h: int) -> Vector3:
	# Convert tile coords (JS style: +X right, +Y down-the-screen =
	# "south") into 3D world (X right, Y up, Z into the scene = north
	# in top-down view). Flag at (x,4) is NORTH → high +Z; tee at
	# (x, height - something) is SOUTH → low Z.
	return Vector3(
		(tx - hole_data.width * 0.5) * Constants.WORLD_UNITS_PER_YARD,
		0.0,
		(h - ty - h * 0.5) * Constants.WORLD_UNITS_PER_YARD,
	)

func _begin_address() -> void:
	phase = Phase.AIMING
	stroke_count = 0
	# Aim at the flag by default.
	if ball and flag:
		var delta := flag.global_position - ball.global_position
		aim.snap_to(atan2(delta.x, delta.z))

func _projected_landing() -> Vector3:
	if ball == null: return Vector3.ZERO
	var club_idx := 0
	var club = Clubs.get_active_club(club_idx)
	var carry_yards: float = float(club.v) * 0.7   # rough est from 70% power
	var dir := Vector3(sin(aim.aim_angle), 0.0, cos(aim.aim_angle))
	return ball.global_position + dir * carry_yards

func _on_shot_ready(payload: Dictionary) -> void:
	if ball == null: return
	phase = Phase.FLYING
	stroke_count += 1
	ball.launch(payload.power, payload.accuracy,
		GameState.active_golfer.get("club_idx", 0),
		0.0, 0.0, "normal", aim.aim_angle)
	if camera_rig:
		camera_rig.set_mode(CameraRig.Mode.FOLLOW_BALL)

func _on_shot_cancelled() -> void:
	pass

func _on_ball_stopped(final_pos: Vector3, state_name: String) -> void:
	if state_name == "holed":
		phase = Phase.HOLED
		var par := int(hole_data.par)
		GameState.finish_hole(par, stroke_count)
		emit_signal("hole_finished", par, stroke_count)
	else:
		phase = Phase.AIMING
		if camera_rig:
			camera_rig.set_mode(CameraRig.Mode.FOLLOW_AIM)

func _debug_quick_shot() -> void:
	# For keyboard testing — mimic a perfect swing.
	swing.start(Vector2(0, 0))
	swing.update_drag(Vector2(0, 64))     # pull down → charges power
	swing.update_drag(Vector2(0, 72))     # a bit more
	swing.update_drag(Vector2(0, 20))     # reverse → lock
	await get_tree().create_timer(Constants.TEMPO_DURATION_SEC - 0.1).timeout
	swing.release()
