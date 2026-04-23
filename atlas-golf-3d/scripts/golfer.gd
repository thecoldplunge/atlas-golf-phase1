extends CharacterBody3D
class_name Golfer
## Player golfer. 3D port of the posRef + swingRef state machine from
## GolfStoryScreen.js — IDLE (walking) / AIMING / SWIPING / FLYING /
## STOPPED / HOLED.
##
## Walking is CharacterBody3D with input-driven velocity + move_and_slide.
## Address pose snaps the player next to the ball perpendicular to aim.
## Swing animation is driven by the AnimationPlayer child (optional —
## for the scaffold the mesh just rotates, full anim rig lands later).

signal state_changed(new_state: String)

enum State { IDLE, AIMING, SWIPING, WATCHING, HOLED }

@export var walk_speed: float = 3.2   # world units / sec
@export var ball_path: NodePath        # assigned in the hole scene
@export var address_offset: float = 0.6  # world units perpendicular to aim

var state: int = State.IDLE
var facing_yaw: float = 0.0
var walk_phase: float = 0.0     # 0..2π animation phase
@onready var mesh: Node3D = $Mesh

# Input — the HUD writes these every frame for the mobile joystick path.
# Desktop path folds arrow keys / WASD into the same fields.
var joystick: Vector2 = Vector2.ZERO

func _ready() -> void:
	set_state(State.IDLE)

func _physics_process(delta: float) -> void:
	match state:
		State.IDLE: _tick_walking(delta)
		State.AIMING, State.SWIPING: _tick_address(delta)
		State.WATCHING, State.HOLED: pass

func _tick_walking(delta: float) -> void:
	var input := joystick
	# Fold desktop keys into the joystick so both paths feed the
	# same movement code.
	if input.is_zero_approx():
		input.x = Input.get_action_strength("walk_right") - Input.get_action_strength("walk_left")
		input.y = Input.get_action_strength("walk_down") - Input.get_action_strength("walk_up")
	if input.length() > 1.0: input = input.normalized()
	var move := Vector3(input.x, 0.0, input.y) * walk_speed
	velocity.x = move.x
	velocity.z = move.z
	velocity.y = 0.0   # no gravity on flat ground for now
	if move.length() > 0.01:
		facing_yaw = atan2(move.x, move.z)
		walk_phase += delta * 8.0
	else:
		walk_phase = 0.0
	mesh.rotation.y = facing_yaw
	move_and_slide()

func _tick_address(_delta: float) -> void:
	# During address / swing, the golfer is glued to the ball + faces
	# perpendicular-right of aim. ball_path + aim_yaw are set by hole.gd.
	var ball = get_node_or_null(ball_path)
	if ball == null: return
	var aim_yaw := get_meta("aim_yaw", 0.0)
	# Right-of-aim offset so the golfer stands to the side of the ball.
	var perp := Vector3(cos(aim_yaw), 0.0, -sin(aim_yaw))
	global_position = ball.global_position + perp * address_offset
	mesh.rotation.y = aim_yaw + PI * 0.5  # facing sideways toward ball

func set_state(s: int) -> void:
	if state == s: return
	state = s
	emit_signal("state_changed", _state_name())

func set_joystick(v: Vector2) -> void:
	joystick = v

func set_aim_yaw(y: float) -> void:
	set_meta("aim_yaw", y)

func _state_name() -> String:
	match state:
		State.IDLE: return "IDLE"
		State.AIMING: return "AIMING"
		State.SWIPING: return "SWIPING"
		State.WATCHING: return "WATCHING"
		State.HOLED: return "HOLED"
		_: return "?"
