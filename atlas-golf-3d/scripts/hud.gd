extends CanvasLayer
class_name Hud
## HUD overlay — swing pad, aim pad, club card, wallet badge, tempo
## banner, interaction prompt. Port of the floating React Views from
## the JS GS build. Each sub-control is a Godot `Control` node; we
## wire touch + mouse + keyboard inputs here so the gameplay scripts
## stay render-agnostic.
##
## Signals out:
##   swing_pointer_down(pos)        swing pad touched
##   swing_pointer_drag(pos)        drag update
##   swing_pointer_up()             released
##   aim_joystick(jx, jy)           aim pad deflection [-1..1]
##   aim_released()                 aim stick released
##   ok_tapped()                    player tapped OK → lock aim
##   interact_tapped()              TALK / ENTER tapped
##   exit_tapped()                  EXIT button tapped

signal swing_pointer_down(pos)
signal swing_pointer_drag(pos)
signal swing_pointer_up()
signal aim_joystick(jx, jy)
signal aim_released()
signal ok_tapped()
signal interact_tapped()
signal exit_tapped()

@onready var swing_pad: Control = $SwingPad
@onready var aim_pad: Control = $AimPad
@onready var club_label: Label = $ClubCard/Label
@onready var wallet_label: Label = $WalletBadge/Label
@onready var tempo_banner: Label = $TempoBanner
@onready var tempo_ring: Control = $SwingPad/TempoRing
@onready var interact_btn: Button = $InteractButton
@onready var interact_label: Label = $InteractButton/Label
@onready var ok_btn: Button = $OkButton
@onready var exit_btn: Button = $ExitButton

var _swing_dragging: bool = false
var _aim_dragging: bool = false

func _ready() -> void:
	GameState.wallet_changed.connect(_on_wallet_changed)
	_on_wallet_changed(GameState.wallet)
	interact_btn.pressed.connect(func(): emit_signal("interact_tapped"))
	ok_btn.pressed.connect(func(): emit_signal("ok_tapped"))
	exit_btn.pressed.connect(func(): emit_signal("exit_tapped"))
	swing_pad.gui_input.connect(_on_swing_input)
	aim_pad.gui_input.connect(_on_aim_input)
	tempo_banner.hide()

func _on_wallet_changed(v: int) -> void:
	wallet_label.text = "$ %d" % v

func set_club_text(name: String, carry_yd: int) -> void:
	club_label.text = "%s\n%d yd" % [name, carry_yd]

func show_interaction(interaction: Dictionary) -> void:
	if interaction.is_empty():
		interact_btn.hide()
		return
	interact_btn.show()
	interact_label.text = interaction.get("label", "") + "\n" + (
		"ENTER ▸" if interaction.get("kind") == "sign" else "TALK ▸"
	)

func show_tempo_ring(t: float, overlap: bool) -> void:
	tempo_ring.visible = true
	tempo_ring.set_meta("t", t)
	tempo_ring.set_meta("overlap", overlap)
	tempo_ring.queue_redraw()

func flash_tempo_banner(label: String, quality: float) -> void:
	tempo_banner.text = label
	var col: Color
	if quality >= 0.85: col = Color.from_html("#88f8bb")
	elif quality >= 0.55: col = Color.from_html("#fbe043")
	else: col = Color.from_html("#ff7a7a")
	tempo_banner.modulate = col
	tempo_banner.show()
	var tw := create_tween()
	tw.tween_interval(1.2)
	tw.tween_callback(func(): tempo_banner.hide())

# --- Swing-pad gesture handling --------------------------------------
func _on_swing_input(ev: InputEvent) -> void:
	if ev is InputEventMouseButton or ev is InputEventScreenTouch:
		if ev.pressed:
			_swing_dragging = true
			emit_signal("swing_pointer_down", ev.position)
		elif _swing_dragging:
			_swing_dragging = false
			emit_signal("swing_pointer_up")
	elif (ev is InputEventMouseMotion or ev is InputEventScreenDrag) and _swing_dragging:
		emit_signal("swing_pointer_drag", ev.position)

# --- Aim-pad gesture handling (joystick returns to centre on release)
func _on_aim_input(ev: InputEvent) -> void:
	if ev is InputEventMouseButton or ev is InputEventScreenTouch:
		if ev.pressed:
			_aim_dragging = true
			_emit_aim_from_pos(ev.position)
		elif _aim_dragging:
			_aim_dragging = false
			emit_signal("aim_released")
	elif (ev is InputEventMouseMotion or ev is InputEventScreenDrag) and _aim_dragging:
		_emit_aim_from_pos(ev.position)

func _emit_aim_from_pos(pos: Vector2) -> void:
	var rect := aim_pad.get_rect()
	var cx := rect.size.x * 0.5
	var cy := rect.size.y * 0.5
	var nx := clamp((pos.x - cx) / cx, -1.0, 1.0)
	var ny := clamp((pos.y - cy) / cy, -1.0, 1.0)
	emit_signal("aim_joystick", nx, ny)
