extends Node3D
class_name CameraRig
## Third-person orbit camera. Ported from the GS aim-camera framing
## rules in tick-loop around line 5340 of GolfStoryScreen.js.
##
## Modes:
##   FOLLOW_PLAYER  → walking; camera trails the golfer
##   FOLLOW_AIM     → aiming; camera frames the LANDING SPOT at dead
##                    centre of the viewport (v0.79 behaviour: no ball
##                    bias, zero anchor offset)
##   FOLLOW_BALL    → ball in flight / rolling; lead the ball with a
##                    short velocity-based offset so fast shots don't
##                    outrun the frame
##   ORBIT          → player drags to orbit freely (stubbed)
##
## When aiming, the rig rotates to match the golfer's aim_yaw so the
## player is always looking "down the fairway".

enum Mode { FOLLOW_PLAYER, FOLLOW_AIM, FOLLOW_BALL, ORBIT }

@export var target_node_path: NodePath          # player OR ball OR landing-spot-proxy
@export var target_offset: Vector3 = Vector3(0, 3, -5)   # orbit yaw relative
@export var smoothing: float = 8.0              # lerp stiffness (higher = snappier)
@export var aim_distance_ahead: float = 6.0     # extra units toward landing
@export var height_on_aim: float = 4.5

var mode: int = Mode.FOLLOW_PLAYER
var aim_yaw: float = 0.0
var landing_spot: Vector3 = Vector3.ZERO
var ball_velocity: Vector3 = Vector3.ZERO

@onready var camera: Camera3D = $Camera3D

func _process(delta: float) -> void:
	var target = get_node_or_null(target_node_path)
	if target == null: return
	var desired: Vector3
	var target_pos: Vector3 = target.global_position
	match mode:
		Mode.FOLLOW_PLAYER:
			desired = target_pos + target_offset
		Mode.FOLLOW_AIM:
			# v0.79 — centre the aim crosshair. Camera sits behind the
			# player along the -aim_yaw direction, looking toward the
			# landing spot.
			var behind := -Vector3(sin(aim_yaw), 0.0, cos(aim_yaw))
			desired = target_pos + behind * 4.0 + Vector3.UP * height_on_aim
		Mode.FOLLOW_BALL:
			# Lead the ball with 0.6s of its velocity (same as JS
			# flight-framing lead constant).
			var lead := target_pos + ball_velocity * 0.6
			desired = lead + Vector3(0.0, 4.0, -4.0)
		Mode.ORBIT:
			desired = target_pos + target_offset
	global_position = global_position.lerp(desired, clamp(smoothing * delta, 0.0, 1.0))
	# Always look at the target (or landing_spot in FOLLOW_AIM).
	var look_target: Vector3 = target_pos
	if mode == Mode.FOLLOW_AIM:
		look_target = landing_spot
	camera.look_at(look_target, Vector3.UP)

func set_mode(new_mode: int) -> void:
	mode = new_mode

func set_aim_yaw(y: float) -> void:
	aim_yaw = y

func set_landing_spot(pos: Vector3) -> void:
	landing_spot = pos

func set_ball_velocity(v: Vector3) -> void:
	ball_velocity = v
