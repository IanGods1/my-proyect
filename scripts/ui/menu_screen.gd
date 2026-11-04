extends Control
## Pantalla de inicio con el letrero "GUASTATOYA – Ciudad con vista propia".

const UI := preload("res://scripts/ui/ui.gd")
const SkyBg := preload("res://scripts/ui/sky_background.gd")

var main: Node
var _sign: Control
var t := 0.0


func setup(m: Node) -> void:
	main = m


func _ready() -> void:
	var sky := SkyBg.new()
	add_child(sky)
	Sfx.stop_loops()
	Sfx.refresh_music("menu")

	_sign = Control.new()
	_sign.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_sign.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sign.draw.connect(_draw_sign)
	add_child(_sign)

	var col := UI.vbox(12)
	col.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	col.anchor_top = 0.5
	col.anchor_bottom = 1.0
	col.offset_top = 40
	col.offset_bottom = -30
	col.offset_left = -170
	col.offset_right = 170
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	add_child(col)
	var play := UI.button("¡A CORRER!", func(): main.goto("modos"), Vector2(340, 84), 36)
	UI.color_button(play, Color("ffd34d"))
	col.add_child(play)
	var row := UI.hbox(12)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(UI.button("Garaje", func(): main.goto("garaje"), Vector2(164, 70), 26))
	row.add_child(UI.button("Ajustes", func(): main.goto("ajustes"), Vector2(164, 70), 26))
	col.add_child(row)

	var coins := UI.coins_label()
	coins.position = Vector2(24, 16)
	add_child(coins)


func _process(delta: float) -> void:
	t += delta
	_sign.queue_redraw()


func _draw_sign() -> void:
	var font := ThemeDB.fallback_font
	var w := size.x
	var cx := w * 0.5
	var y := 34.0 + sin(t * 2.0) * 3.0
	# título del juego
	var title := "TUC TUC"
	var ts := 64
	var tw := font.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, ts).x
	_sign.draw_string_outline(font, Vector2(cx - tw / 2, y + 56), title, HORIZONTAL_ALIGNMENT_LEFT, -1, ts, 18, UI.DARK)
	_sign.draw_string(font, Vector2(cx - tw / 2, y + 56), title, HORIZONTAL_ALIGNMENT_LEFT, -1, ts, Color("ff5a3c"))
	# letrero de colores: GUASTATOYA
	var word := "GUASTATOYA"
	var fs := 78
	var cols := [Color("e63946"), Color("f4a261"), Color("2a9d8f"), Color("e9c46a"), Color("457b9d"),
		Color("e76f51"), Color("8ac926"), Color("ff70a6"), Color("1982c4"), Color("ffca3a")]
	var widths := []
	var total := 0.0
	for ch in word:
		var cw := font.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + 6
		widths.append(cw)
		total += cw
	var board := Rect2(cx - total / 2 - 30, y + 74, total + 60, 150)
	_sign.draw_rect(Rect2(board.position + Vector2(8, 10), board.size), Color(0, 0, 0, 0.25))
	_sign.draw_rect(board, Color("fff4d6"))
	_sign.draw_rect(board, Color("8a4b14"), false, 6)
	# patas del letrero
	_sign.draw_rect(Rect2(board.position.x + 40, board.end.y, 14, 30), Color("8a4b14"))
	_sign.draw_rect(Rect2(board.end.x - 54, board.end.y, 14, 30), Color("8a4b14"))
	var x := cx - total / 2
	for i in word.length():
		var bounce := sin(t * 4.0 + i * 0.6) * 4.0
		var p := Vector2(x, y + 160 + bounce)
		_sign.draw_string_outline(font, p, word[i], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 12, UI.DARK)
		_sign.draw_string(font, p, word[i], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, cols[i % cols.size()])
		x += widths[i]
	var sub := "– Ciudad con vista propia –"
	var ss := 32
	var sw := font.get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, ss).x
	_sign.draw_string(font, Vector2(cx - sw / 2, y + 206), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, ss, Color("8a4b14"))
