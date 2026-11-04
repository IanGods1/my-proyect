extends Node
## Estado global del juego: guardado, monedas, mejoras, ajustes y campeonato.

const SAVE_PATH := "user://guastatoya.cfg"
const LAPS := 3
const MAX_LEVEL := 5
const UPGRADE_COSTS := [120, 200, 320, 480, 700]

const COLORS := [
	{"name": "Azul", "color": Color("1e7fd8")},
	{"name": "Verde", "color": Color("2e9e46")},
	{"name": "Amarillo", "color": Color("f2c230")},
	{"name": "Anaranjado", "color": Color("f07a1a")},
	{"name": "Morado", "color": Color("7b4bc4")},
	{"name": "Celeste", "color": Color("39c4d6")},
	{"name": "Rosado", "color": Color("ec5fa6")},
	{"name": "Negro", "color": Color("2b2b33")},
	{"name": "Blanco", "color": Color("ecebe6")},
]

## Rivales manejados por la máquina.
const RIVALS := [
	{"name": "Don Chepe", "color": Color("2e9e46"), "skill": 0.97},
	{"name": "La Chula", "color": Color("ec5fa6"), "skill": 0.95},
	{"name": "El Flaco", "color": Color("f2c230"), "skill": 0.93},
	{"name": "Doña Tere", "color": Color("7b4bc4"), "skill": 0.91},
	{"name": "Memo", "color": Color("f07a1a"), "skill": 0.89},
]

const PLAYER_NAME := "Tú"
const POINTS := [10, 8, 6, 5, 4, 3]
const PRIZES := [100, 70, 50, 35, 25, 15]

const CHAMPIONSHIP := [
	{"name": "Vuelta al Parque", "sunset": false, "reverse": false},
	{"name": "Atardecer en el Kiosco", "sunset": true, "reverse": false},
	{"name": "Contravía por la Ceiba", "sunset": false, "reverse": true},
	{"name": "Gran Final Dorada", "sunset": true, "reverse": true},
]

const UPGRADES := {
	"motor": {"title": "Motor", "desc": "Más velocidad y aceleración"},
	"llantas": {"title": "Llantas", "desc": "Mejor agarre y giro"},
	"turbo": {"title": "Turbo", "desc": "Nitro más fuerte y duradero"},
}

# ---- datos guardados
var coins := 150
var color_idx := 0
var upgrades := {"motor": 0, "llantas": 0, "turbo": 0}
var control_mode := 0  # 0 = botones, 1 = inclinar el teléfono
var tilt_invert := false
var tilt_sens := 1.0
var auto_accel := false
var music_on := true
var sfx_on := true
var records := {}  # clave "normal"/"reversa" -> {"lap": float, "total": float}

# ---- configuración de la carrera actual
var mode := "rapida"  # "rapida", "campeonato", "contrarreloj"
var sunset := false
var reverse := false
var champ_race := 0
var champ_points := {}
var last_result := {}


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_setup_input()
	load_game()


func _setup_input() -> void:
	var keys := {
		"acelerar": [KEY_UP, KEY_W],
		"frenar": [KEY_DOWN, KEY_S],
		"izquierda": [KEY_LEFT, KEY_A],
		"derecha": [KEY_RIGHT, KEY_D],
		"turbo": [KEY_SPACE, KEY_SHIFT],
		"pito": [KEY_H],
		"pausa": [KEY_ESCAPE, KEY_P],
	}
	for action in keys:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for k in keys[action]:
			var ev := InputEventKey.new()
			ev.physical_keycode = k
			InputMap.action_add_event(action, ev)


func player_color() -> Color:
	return COLORS[color_idx]["color"]


func upgrade_cost(kind: String) -> int:
	var lvl: int = upgrades[kind]
	if lvl >= MAX_LEVEL:
		return -1
	return UPGRADE_COSTS[lvl]


func buy_upgrade(kind: String) -> bool:
	var cost := upgrade_cost(kind)
	if cost < 0 or coins < cost:
		return false
	coins -= cost
	upgrades[kind] += 1
	save_game()
	return true


## Estadísticas del tuc tuc del jugador según sus mejoras.
func player_stats() -> Dictionary:
	return make_stats(upgrades["motor"], upgrades["llantas"], upgrades["turbo"])


static func make_stats(motor: float, llantas: float, turbo: float) -> Dictionary:
	return {
		"max_speed": 520.0 + motor * 26.0,
		"accel": 330.0 + motor * 24.0,
		"grip": 900.0 + llantas * 110.0,
		"turn": 2.55 + llantas * 0.12,
		"offroad": 0.55 + llantas * 0.04,
		"nitro_power": 1.38 + turbo * 0.05,
		"nitro_drain": 34.0 - turbo * 3.5,
	}


func record_key() -> String:
	return "reversa" if reverse else "normal"


func get_record() -> Dictionary:
	return records.get(record_key(), {})


func start_championship() -> void:
	mode = "campeonato"
	last_result = {}
	champ_race = 0
	champ_points = {PLAYER_NAME: 0}
	for r in RIVALS:
		champ_points[r["name"]] = 0
	_apply_champ_race()


func _apply_champ_race() -> void:
	var race: Dictionary = CHAMPIONSHIP[champ_race]
	sunset = race["sunset"]
	reverse = race["reverse"]


func next_champ_race() -> bool:
	champ_race += 1
	if champ_race >= CHAMPIONSHIP.size():
		return false
	_apply_champ_race()
	return true


func sorted_standings() -> Array:
	var arr := []
	for n in champ_points:
		arr.append({"name": n, "points": champ_points[n]})
	arr.sort_custom(func(a, b): return a["points"] > b["points"])
	return arr


func save_game() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("juego", "coins", coins)
	cfg.set_value("juego", "color_idx", color_idx)
	cfg.set_value("juego", "upgrades", upgrades)
	cfg.set_value("juego", "records", records)
	cfg.set_value("ajustes", "control_mode", control_mode)
	cfg.set_value("ajustes", "tilt_invert", tilt_invert)
	cfg.set_value("ajustes", "tilt_sens", tilt_sens)
	cfg.set_value("ajustes", "auto_accel", auto_accel)
	cfg.set_value("ajustes", "music_on", music_on)
	cfg.set_value("ajustes", "sfx_on", sfx_on)
	cfg.save(SAVE_PATH)


func load_game() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return
	coins = cfg.get_value("juego", "coins", coins)
	color_idx = clampi(cfg.get_value("juego", "color_idx", 0), 0, COLORS.size() - 1)
	var up: Dictionary = cfg.get_value("juego", "upgrades", {})
	for k in upgrades:
		upgrades[k] = clampi(int(up.get(k, 0)), 0, MAX_LEVEL)
	records = cfg.get_value("juego", "records", {})
	control_mode = cfg.get_value("ajustes", "control_mode", 0)
	tilt_invert = cfg.get_value("ajustes", "tilt_invert", false)
	tilt_sens = cfg.get_value("ajustes", "tilt_sens", 1.0)
	auto_accel = cfg.get_value("ajustes", "auto_accel", false)
	music_on = cfg.get_value("ajustes", "music_on", true)
	sfx_on = cfg.get_value("ajustes", "sfx_on", true)


static func format_time(t: float) -> String:
	if t <= 0.0:
		return "--:--.--"
	var m := int(t / 60.0)
	var s := fmod(t, 60.0)
	return "%d:%05.2f" % [m, s]
