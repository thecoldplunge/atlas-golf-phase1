extends Node
## Pro-shop catalog — ported from SHOP_CATALOG in the JS v0.77 build.
## Clothing items are purely cosmetic (colour swaps the avatar's
## shirt/pants/hat). Clubs apply a per-key upgrade that
## Clubs.club_upgrades picks up in get_active_club().

const ITEMS := [
	# Polo shirts — cosmetic shirt-colour swap.
	{ "id": "shirt_white",   "kind": "shirts", "name": "White Polo",   "price": 5,  "color": "#f0ece0" },
	{ "id": "shirt_blue",    "kind": "shirts", "name": "Blue Polo",    "price": 8,  "color": "#3f76c1" },
	{ "id": "shirt_green",   "kind": "shirts", "name": "Green Polo",   "price": 10, "color": "#3a7a3e" },
	{ "id": "shirt_red",     "kind": "shirts", "name": "Red Polo",     "price": 12, "color": "#c03838" },
	{ "id": "shirt_black",   "kind": "shirts", "name": "Black Polo",   "price": 8,  "color": "#2a2a2a" },
	{ "id": "shirt_purple",  "kind": "shirts", "name": "Purple Polo",  "price": 12, "color": "#6a3aa2" },
	{ "id": "shirt_yellow",  "kind": "shirts", "name": "Yellow Polo",  "price": 10, "color": "#ddb030" },
	{ "id": "shirt_pink",    "kind": "shirts", "name": "Pink Polo",    "price": 15, "color": "#d88aa6" },
	# Pants — cosmetic pants-colour swap.
	{ "id": "pants_khaki",    "kind": "pants", "name": "Khaki Pants",    "price": 5,  "color": "#c4a470" },
	{ "id": "pants_navy",     "kind": "pants", "name": "Navy Pants",     "price": 8,  "color": "#1f2a4a" },
	{ "id": "pants_black",    "kind": "pants", "name": "Black Pants",    "price": 10, "color": "#1a1a1a" },
	{ "id": "pants_charcoal", "kind": "pants", "name": "Charcoal Pants", "price": 8,  "color": "#3a3a3a" },
	{ "id": "pants_white",    "kind": "pants", "name": "White Pants",    "price": 12, "color": "#e8e2d4" },
	# Hats.
	{ "id": "hat_white", "kind": "hats", "name": "White Cap", "price": 3,  "color": "#e8e2d4" },
	{ "id": "hat_blue",  "kind": "hats", "name": "Blue Cap",  "price": 5,  "color": "#3f76c1" },
	{ "id": "hat_navy",  "kind": "hats", "name": "Navy Cap",  "price": 8,  "color": "#1f2a4a" },
	{ "id": "hat_green", "kind": "hats", "name": "Green Cap", "price": 5,  "color": "#3a7a3e" },
	{ "id": "hat_black", "kind": "hats", "name": "Black Cap", "price": 10, "color": "#1a1a1a" },
	{ "id": "hat_tan",   "kind": "hats", "name": "Tan Cap",   "price": 5,  "color": "#c4a470" },
	# Clubs — apply an upgrade to the matching CLUBS key.
	{ "id": "club_pro_dr",    "kind": "clubs", "name": "Pro Driver",    "price": 40, "upgrade": { "key": "DR", "v_mul": 1.08 } },
	{ "id": "club_tour_5w",   "kind": "clubs", "name": "Tour 5-Wood",   "price": 30, "upgrade": { "key": "5W", "v_mul": 1.07 } },
	{ "id": "club_forged_7i", "kind": "clubs", "name": "Forged 7-Iron", "price": 35, "upgrade": { "key": "7I", "v_mul": 1.06 } },
	{ "id": "club_spin_sw",   "kind": "clubs", "name": "Spin Wedge",    "price": 25, "upgrade": { "key": "SW", "v_mul": 1.05 } },
	{ "id": "club_pro_pt",    "kind": "clubs", "name": "Pro Putter",    "price": 30, "upgrade": { "key": "PT", "v_mul": 1.04 } },
]

func find_by_id(item_id: String) -> Dictionary:
	for it in ITEMS:
		if it.id == item_id:
			return it
	return {}

func items_of_kind(kind: String) -> Array:
	var out: Array = []
	for it in ITEMS:
		if it.kind == kind:
			out.append(it)
	return out
