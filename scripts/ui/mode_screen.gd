extends Control
## Elegir modo de juego: carrera rápida, campeonato o contrarreloj.

const UI := preload("res://scripts/ui/ui.gd")
const SkyBg := preload("res://scripts/ui/sky_background.gd")

var main: Node
var sky: Control
var _sunset_btn: Button
var _dir_btn: Button
var _record_lbl: Label


func setup(m: Node) -> void:
	main = m


func _ready() -> void:
	sky = SkyBg.new()
	sky.sunset = Game.sunset
	add_child(sky)
	var center := UI.center_box(self)
	var col := UI.vbox(16)
	center.add_child(col)
	col.add_child(UI.title("Elige el modo de juego", 46))

	var cards := UI.hbox(18)
	cards.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(cards)
	cards.add_child(_card("Carrera rápida", "3 vueltas contra\n5 tuc tucs", Color("ffd34d"), _quick))
	cards.add_child(_card("Campeonato", "4 carreras con\ntabla de posiciones", Color("8fd17f"), _champ))
	cards.add_child(_card("Contrarreloj", "Tú solo contra\nel reloj", Color("8fc9ff"), _time))

	var opts := UI.hbox(14)
	opts.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(opts)
	_sunset_btn = UI.button("", _toggle_sunset, Vector2(300, 66), 24)
	_dir_btn = UI.button("", _toggle_dir, Vector2(300, 66), 24)
	opts.add_child(_sunset_btn)
	opts.add_child(_dir_btn)
	_record_lbl = UI.label("", 24, Color.WHITE, 8, UI.DARK)
	_record_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_record_lbl)
	_refresh()

	var back := UI.button("‹ Volver", func(): main.goto("menu"), Vector2(170, 64), 24)
	back.position = Vector2(20, 16)
	add_child(back)


func _card(title: String, desc: String, col: Color, cb: Callable) -> Control:
	var b := UI.button(title + "\n\n" + desc, cb, Vector2(280, 210), 28)
	UI.color_button(b, col)
	return b


func _refresh() -> void:
	_sunset_btn.text = "Hora: " + ("Atardecer dorado" if Game.sunset else "Día soleado")
	_dir_btn.text = "Sentido: " + ("Contravía" if Game.reverse else "Normal")
	sky.sunset = Game.sunset
	var rec := Game.get_record()
	_record_lbl.text = "Récord contrarreloj (%s):  vuelta %s  ·  total %s" % [
		"contravía" if Game.reverse else "normal",
		Game.format_time(rec.get("lap", 0.0)), Game.format_time(rec.get("total", 0.0))]


func _toggle_sunset() -> void:
	Game.sunset = not Game.sunset
	_refresh()


func _toggle_dir() -> void:
	Game.reverse = not Game.reverse
	_refresh()


func _quick() -> void:
	Game.mode = "rapida"
	main.goto("carrera")


func _champ() -> void:
	Game.start_championship()
	main.goto("tabla")


func _time() -> void:
	Game.mode = "contrarreloj"
	main.goto("carrera")
