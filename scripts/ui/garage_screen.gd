extends Control
## Garaje: color del tuc tuc y mejoras (motor, llantas, turbo).

const UI := preload("res://scripts/ui/ui.gd")
const Art := preload("res://scripts/art.gd")

var main: Node
var _preview: Control
var _coins: Label
var _rows := {}
var _color_name: Label
var t := 0.0


func setup(m: Node) -> void:
	main = m


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Color("f6e7c1")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var floor_lines := Control.new()
	floor_lines.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	floor_lines.mouse_filter = Control.MOUSE_FILTER_IGNORE
	floor_lines.draw.connect(func():
		for i in 40:
			floor_lines.draw_line(Vector2(i * 60 - 400, 0), Vector2(i * 60, size.y), Color(0.8, 0.7, 0.5, 0.35), 3))
	add_child(floor_lines)

	var root := UI.hbox(24)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.offset_left = 24
	root.offset_right = -24
	root.offset_top = 90
	root.offset_bottom = -20
	add_child(root)

	# lado izquierdo: vista previa + colores
	var left := PanelContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_child(left)
	var lv := UI.vbox(10)
	left.add_child(lv)
	_preview = Control.new()
	_preview.custom_minimum_size = Vector2(420, 260)
	_preview.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_preview.draw.connect(_draw_preview)
	lv.add_child(_preview)
	_color_name = UI.label("", 26)
	_color_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lv.add_child(_color_name)
	var grid := GridContainer.new()
	grid.columns = 9
	grid.add_theme_constant_override("h_separation", 8)
	lv.add_child(grid)
	for i in Game.COLORS.size():
		var b := UI.button("", _pick_color.bind(i), Vector2(52, 52), 10)
		UI.color_button(b, Game.COLORS[i]["color"])
		grid.add_child(b)

	# lado derecho: mejoras
	var right := PanelContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_child(right)
	var rv := UI.vbox(12)
	right.add_child(rv)
	rv.add_child(UI.label("Mejoras", 34))
	for kind in Game.UPGRADES:
		var info: Dictionary = Game.UPGRADES[kind]
		var row := UI.hbox(10)
		var texts := UI.vbox(0)
		texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var name_l := UI.label(info["title"], 28)
		var desc := UI.label(info["desc"], 18, Color(0.35, 0.25, 0.15))
		var pips := UI.label("", 26, Color("d62828"))
		texts.add_child(name_l)
		texts.add_child(desc)
		texts.add_child(pips)
		row.add_child(texts)
		var buy := UI.button("", _buy.bind(kind), Vector2(170, 70), 22)
		row.add_child(buy)
		rv.add_child(row)
		_rows[kind] = {"pips": pips, "buy": buy}

	var back := UI.button("‹ Volver", func(): main.goto("menu"), Vector2(170, 64), 24)
	back.position = Vector2(20, 14)
	add_child(back)
	var title := UI.title("Garaje", 46)
	title.set_anchors_preset(Control.PRESET_CENTER_TOP)
	title.position.y = 14
	add_child(title)
	_coins = UI.coins_label()
	_coins.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_coins.offset_left = -300
	_coins.offset_top = 24
	add_child(_coins)
	_refresh()


func _process(delta: float) -> void:
	t += delta
	_preview.queue_redraw()


func _draw_preview() -> void:
	var c := _preview.size / 2
	_preview.draw_circle(c + Vector2(0, 10), 120, Color(0, 0, 0, 0.08))
	_preview.draw_set_transform(c, t * 0.6, Vector2(3.0, 3.0))
	Art.tuctuc(_preview, Game.player_color(), {"wheel": t})
	_preview.draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)


func _pick_color(i: int) -> void:
	Game.color_idx = i
	Game.save_game()
	_refresh()


func _buy(kind: String) -> void:
	if Game.buy_upgrade(kind):
		Sfx.play("repair")
	else:
		Sfx.play("bump")
	_refresh()


func _refresh() -> void:
	_coins.text = "Monedas: %d" % Game.coins
	_color_name.text = "Color: " + Game.COLORS[Game.color_idx]["name"] + "  (techo rojo de siempre)"
	for kind in _rows:
		var lvl: int = Game.upgrades[kind]
		_rows[kind]["pips"].text = "■".repeat(lvl) + "□".repeat(Game.MAX_LEVEL - lvl) + "  Nivel %d" % lvl
		var cost := Game.upgrade_cost(kind)
		var b: Button = _rows[kind]["buy"]
		if cost < 0:
			b.text = "MÁXIMO"
			b.disabled = true
		else:
			b.text = "Mejorar\n%d" % cost
			b.disabled = Game.coins < cost
