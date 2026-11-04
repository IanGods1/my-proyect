extends Control
## Resultados al terminar una carrera.

const UI := preload("res://scripts/ui/ui.gd")
const SkyBg := preload("res://scripts/ui/sky_background.gd")

var main: Node


func setup(m: Node) -> void:
	main = m


func _ready() -> void:
	var r: Dictionary = Game.last_result
	var sky := SkyBg.new()
	sky.sunset = Game.sunset
	add_child(sky)
	Sfx.refresh_music("menu")
	var center := UI.center_box(self)
	var panel := PanelContainer.new()
	center.add_child(panel)
	var col := UI.vbox(8)
	col.custom_minimum_size = Vector2(700, 0)
	panel.add_child(col)

	var mode: String = r.get("mode", "rapida")
	if mode == "contrarreloj":
		col.add_child(UI.label("¡Contrarreloj terminado!", 38))
		col.add_child(UI.label("Tiempo total: " + Game.format_time(r.get("total", 0.0)), 30))
		col.add_child(UI.label("Mejor vuelta: " + Game.format_time(r.get("best_lap", 0.0)), 30))
		var laps: Array = r.get("laps", [])
		for i in laps.size():
			col.add_child(UI.label("   Vuelta %d: %s" % [i + 1, Game.format_time(laps[i])], 24, Color(0.35, 0.25, 0.15)))
		if r.get("new_record", false):
			col.add_child(UI.label("¡NUEVO RÉCORD!", 36, Color("d62828")))
	else:
		var pos: int = r.get("player_pos", 6)
		var head := "¡GANASTE!" if pos == 1 else "Llegaste en %d° lugar" % pos
		col.add_child(UI.label(head, 40, Color("d62828") if pos == 1 else UI.DARK))
		var grid := GridContainer.new()
		grid.columns = 4
		grid.add_theme_constant_override("h_separation", 30)
		col.add_child(grid)
		for row in r.get("rows", []):
			var c := Color("1e5fa8") if row["is_player"] else UI.DARK
			grid.add_child(UI.label("%d°" % row["pos"], 26, c))
			var sw := ColorRect.new()
			sw.color = row["color"]
			sw.custom_minimum_size = Vector2(26, 26)
			sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			grid.add_child(sw)
			grid.add_child(UI.label(row["name"], 26, c))
			var tt: float = row["time"]
			grid.add_child(UI.label(Game.format_time(tt) if tt > 0 else "en carrera", 26, c))
		if mode == "campeonato":
			var pts: int = Game.POINTS[pos - 1]
			col.add_child(UI.label("+%d puntos de campeonato" % pts, 26, Color("2e7d32")))
	col.add_child(UI.label("Monedas recogidas: %d   Premio: %d   Total: %d" % [
		r.get("coins_picked", 0), r.get("prize", 0), Game.coins], 24, Color("8a4b14")))

	var btns := UI.hbox(14)
	btns.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(btns)
	if mode == "campeonato":
		var b := UI.button("Ver tabla ›", func(): main.goto("tabla"), Vector2(260, 70), 28)
		UI.color_button(b, Color("ffd34d"))
		btns.add_child(b)
	else:
		var again := UI.button("Otra vez", func(): main.goto("carrera"), Vector2(220, 70), 28)
		UI.color_button(again, Color("ffd34d"))
		btns.add_child(again)
		btns.add_child(UI.button("Garaje", func(): main.goto("garaje"), Vector2(190, 70), 28))
		btns.add_child(UI.button("Menú", func(): main.goto("menu"), Vector2(170, 70), 28))
