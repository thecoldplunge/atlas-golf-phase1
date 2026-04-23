extends Node
## NPC dialog scripts + clubhouse-crowd definitions. Mirrors
## Clubhouse.js npcs[] in the JS build.

const NPCS := [
	{
		"id": "caddy",
		"name": "Caddy Carl",
		"type": "idle",
		"position": Vector3(0, 0, 4),
		"facing_deg": 90,
		"lines": [
			"First time at Atlas, huh? Don't aim at the water.",
			"If you slice off the first tee, blame the wind.",
			"Word is the back nine eats handicaps for breakfast.",
		],
	},
	{
		"id": "walker",
		"name": "Wandering Wendy",
		"type": "walker",
		"position":   Vector3(4, 0, 2),
		"waypoint_a": Vector3(-3, 0, 2),
		"waypoint_b": Vector3(6, 0, 2),
		"speed": 1.8,       # world units / sec (1 unit = 1 yard)
		"pause_sec": 1.6,
		"lines": [
			"Just clocking my steps. Cardio counts as practice.",
			"Ever notice the trees lean into the wind? Cute.",
			"Don't look behind you. The greenskeeper's got vibes.",
		],
	},
	{
		"id": "proshop",
		"name": "Pro Shop Petra",
		"type": "idle",
		"position": Vector3(8, 0, 6),
		"facing_deg": 180,
		"lines": [
			"Wedges are 30% off. You'll need 'em on hole 7.",
			"Rough on this course is a lifestyle, not a hazard.",
		],
	},
	{
		"id": "sammy",
		"name": "Slick Sammy",
		"type": "challenger",
		"position": Vector3(-4, 0, 7),
		"facing_deg": 90,
		"wager": 50,
		"lines": [
			"You look like you've got fifty bucks in you.",
			"Match play, one round, winner takes the pot.",
		],
	},
	{
		"id": "yolanda",
		"name": "Yips Yolanda",
		"type": "putter",
		"position": Vector3(-6, 0, -4),
		"facing_deg": 0,
		"lines": [
			"Don't say 'yips' out loud. It hears you.",
			"The cup moves when you blink. Keep your eyes open.",
		],
	},
	{
		"id": "pat",
		"name": "Putt-Putt Pat",
		"type": "putter",
		"position": Vector3(-4, 0, -4),
		"facing_deg": 270,
		"lines": [
			"Practice green cups are honest. The real ones lie.",
			"I've been four-putting since '07. Worth it.",
		],
	},
]

func find(npc_id: String) -> Dictionary:
	for n in NPCS:
		if n.id == npc_id:
			return n
	return {}
