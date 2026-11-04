extends Node
## Nodo raíz: cambia entre pantallas (menú, garaje, carrera, resultados...).

const UI := preload("res://scripts/ui/ui.gd")
const SCREENS := {
	"menu": preload("res://scripts/ui/menu_screen.gd"),
	"modos": preload("res://scripts/ui/mode_screen.gd"),
	"garaje": preload("res://scripts/ui/garage_screen.gd"),
	"ajustes": preload("res://scripts/ui/settings_screen.gd"),
	"resultados": preload("res://scripts/ui/results_screen.gd"),
	"tabla": preload("res://scripts/ui/standings_screen.gd"),
	"carrera": preload("res://scripts/race/race.gd"),
}

var current: Node = null
var theme: Theme


func _ready() -> void:
	theme = UI.make_theme()
	# Argumentos de prueba: godot -- --race --mode=campeonato --sunset --reverse
	var args := OS.get_cmdline_user_args()
	for a in args:
		if a.begins_with("--shot="):
			_debug_shots(a.substr(7))
	if "--race" in args:
		for a in args:
			if a.begins_with("--mode="):
				Game.mode = a.substr(7)
		Game.sunset = "--sunset" in args
		Game.reverse = "--reverse" in args
		if Game.mode == "campeonato":
			Game.start_championship()
		goto("carrera")
		return
	if "--test-champ" in args:
		_test_champ()
		return
	if "--screen" in args:
		goto(args[args.find("--screen") + 1])
		return
	goto("menu")


func _notification(what: int) -> void:
	# Botón "atrás" de Android.
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		Game.save_game()
		get_tree().quit()
	elif what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if current and current.has_method("on_back"):
			current.on_back()
		elif current and current.name == "Menu":
			get_tree().quit()
		else:
			goto("menu")


func goto(screen: String) -> void:
	get_tree().paused = false
	if current:
		current.queue_free()
		current = null
	var s: Node = SCREENS[screen].new()
	s.name = screen.capitalize()
	if s is Control:
		(s as Control).theme = theme
		(s as Control).set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if s.has_method("setup"):
		s.setup(self)
	add_child(s)
	current = s


## Solo para pruebas: --shot=archivo.png:segundos[,archivo2.png:segundos...]
func _debug_shots(spec: String) -> void:
	var t0 := 0.0
	for part in spec.split(","):
		var bits := part.split(":")
		var wait := float(bits[1]) - t0
		t0 = float(bits[1])
		await get_tree().create_timer(wait, true, false, true).timeout
		get_viewport().get_texture().get_image().save_png(bits[0])
		print("captura: ", bits[0])
	get_tree().quit()


## Solo para pruebas: recorre las pantallas de un campeonato completo.
func _test_champ() -> void:
	Game.start_championship()
	goto("tabla")
	for i in Game.CHAMPIONSHIP.size():
		await get_tree().process_frame
		var rows := []
		for j in 6:
			rows.append({"pos": j + 1, "name": "X%d" % j, "color": Color.RED, "time": 80.0 + j, "is_player": j == i})
		Game.last_result = {"mode": "campeonato", "rows": rows, "player_pos": i + 1, "coins_picked": 10, "prize": 5, "champ_race": Game.champ_race}
		Game.champ_points[Game.PLAYER_NAME] += Game.POINTS[i]
		goto("resultados")
		await get_tree().process_frame
		goto("tabla")
		await get_tree().process_frame
		print("carrera ", i, " -> champ_race=", Game.champ_race, " tabla=", Game.sorted_standings())
	get_tree().quit()
