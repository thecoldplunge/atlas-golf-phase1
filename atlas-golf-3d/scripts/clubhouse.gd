extends Node3D
class_name Clubhouse
## Outdoor clubhouse hub. Spawns the golfer + NPCs from NpcDialog.NPCS,
## lays out the three signs (1ST TEE, DRIVING RANGE, PUTTING GREEN),
## and watches for proximity to surface the TALK / ENTER button in
## the HUD. Ported from the tick-loop branch in GolfStoryScreen.js
## where gameModeRef.current === 'clubhouse'.

signal interaction_changed(interaction)
signal sign_entered(target: String)
signal npc_talked(npc_id: String)

@export var golfer_path: NodePath
@export var signs_container: NodePath
@export var npcs_container: NodePath

const PROXIMITY_RADIUS := 2.5   # world units = yards

var _current_interaction: Dictionary = {}

func _ready() -> void:
	_spawn_signs()
	_spawn_npcs()

func _physics_process(_delta: float) -> void:
	var golfer = get_node_or_null(golfer_path)
	if golfer == null: return
	var nearest := _find_nearest_interactable(golfer.global_position)
	if _current_interaction.hash() != nearest.hash():
		_current_interaction = nearest
		emit_signal("interaction_changed", nearest)

func _find_nearest_interactable(pos: Vector3) -> Dictionary:
	var nearest: Dictionary = {}
	var best_dist: float = PROXIMITY_RADIUS
	# Signs (big zones take priority in the 2D port; in 3D we just
	# use the sign post position).
	var signs = get_node_or_null(signs_container)
	if signs:
		for s in signs.get_children():
			if not s.has_meta("target"): continue
			var d = s.global_position.distance_to(pos)
			if d < best_dist:
				best_dist = d
				nearest = {
					"kind": "sign",
					"id": s.name,
					"target": s.get_meta("target"),
					"label": s.get_meta("label", s.name),
				}
	# NPCs.
	var npcs = get_node_or_null(npcs_container)
	if npcs and nearest.is_empty():
		for n in npcs.get_children():
			if not n.has_meta("npc_id"): continue
			var d = n.global_position.distance_to(pos)
			if d < best_dist:
				best_dist = d
				nearest = {
					"kind": "npc",
					"id": n.get_meta("npc_id"),
					"label": n.get_meta("name"),
				}
	return nearest

func trigger_interaction() -> void:
	if _current_interaction.is_empty(): return
	if _current_interaction.kind == "sign":
		emit_signal("sign_entered", _current_interaction.target)
	elif _current_interaction.kind == "npc":
		emit_signal("npc_talked", _current_interaction.id)

func _spawn_signs() -> void:
	var signs = get_node_or_null(signs_container)
	if signs == null: return
	var sign_defs := [
		{ "name": "sign_tee",     "pos": Vector3( 10, 0, 0), "label": "1ST TEE",       "target": "round_setup" },
		{ "name": "sign_range",   "pos": Vector3(-10, 0, 3), "label": "DRIVING RANGE", "target": "range" },
		{ "name": "sign_putting", "pos": Vector3(-10, 0,-4), "label": "PUTTING GREEN", "target": "putting" },
		{ "name": "sign_proshop", "pos": Vector3(  0, 0,-7), "label": "PRO SHOP",      "target": "shop" },
	]
	for d in sign_defs:
		var post := Node3D.new()
		post.name = d.name
		post.global_position = d.pos
		post.set_meta("label", d.label)
		post.set_meta("target", d.target)
		signs.add_child(post)

func _spawn_npcs() -> void:
	var npcs = get_node_or_null(npcs_container)
	if npcs == null: return
	for n in NpcDialog.NPCS:
		var marker := Node3D.new()
		marker.name = n.id
		marker.global_position = n.position
		marker.set_meta("npc_id", n.id)
		marker.set_meta("name", n.name)
		marker.set_meta("type", n.type)
		npcs.add_child(marker)
