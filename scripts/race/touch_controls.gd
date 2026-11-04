extends Control
## Controles táctiles multitáctiles: volante izquierda/derecha, acelerar,
## frenar/reversa, turbo y pito. Con el modo "inclinar" se ocultan las
## flechas y se usa el acelerómetro.

var buttons := {}  # nombre -> {c: Vector2, r: float, text: String}
var touches := {}  # índice de toque -> nombre del botón ("" si ninguno)
var tilt_mode := false
var nitro_frac := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	tilt_mode = Game.control_mode == 1
	resized.connect(_layout)
	_layout()


func _layout() -> void:
	var w := size.x
	var h := size.y
	buttons.clear()
	if not tilt_mode:
		buttons["izquierda"] = {"c": Vector2(115, h - 115), "r": 88.0, "text": "◀"}
		buttons["derecha"] = {"c": Vector2(305, h - 115), "r": 88.0, "text": "▶"}
	buttons["acelerar"] = {"c": Vector2(w - 135, h - 135), "r": 108.0, "text": "ACELERAR"}
	buttons["frenar"] = {"c": Vector2(w - 345, h - 90), "r": 68.0, "text": "FRENO"}
	buttons["turbo"] = {"c": Vector2(w - 140, h - 355), "r": 70.0, "text": "TURBO"}
	buttons["pito"] = {"c": Vector2(w - 330, h - 255), "r": 46.0, "text": "PITO"}
	queue_redraw()


func _hit(p: Vector2) -> String:
	var best := ""
	var best_d := INF
	for n in buttons:
		var b: Dictionary = buttons[n]
		var d := p.distance_to(b["c"])
		# zona táctil un poco más grande que el dibujo
		if d < b["r"] * 1.25 and d < best_d:
			best = n
			best_d = d
	return best


func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed:
			touches[event.index] = _hit(event.position)
		else:
			touches.erase(event.index)
		queue_redraw()
	elif event is InputEventScreenDrag:
		var prev: String = touches.get(event.index, "")
		var now := _hit(event.position)
		# al arrastrar, solo se cambia entre flechas o se suelta si sale de todo
		if prev != now:
			touches[event.index] = now
			queue_redraw()


func is_down(n: String) -> bool:
	for k in touches:
		if touches[k] == n:
			return true
	return false


func release_all() -> void:
	touches.clear()
	queue_redraw()


func steer_value() -> float:
	var s := 0.0
	if tilt_mode:
		var acc := Input.get_accelerometer()
		var raw := acc.x
		# En horizontal Godot ya ajusta los ejes a la orientación de la pantalla.
		var v := raw / 4.5 * Game.tilt_sens
		if Game.tilt_invert:
			v = -v
		if absf(v) < 0.08:
			v = 0.0
		s = clampf(v, -1.0, 1.0)
	if is_down("izquierda") or Input.is_action_pressed("izquierda"):
		s -= 1.0
	if is_down("derecha") or Input.is_action_pressed("derecha"):
		s += 1.0
	return clampf(s, -1.0, 1.0)


func _draw() -> void:
	var font := ThemeDB.fallback_font
	for n in buttons:
		var b: Dictionary = buttons[n]
		var down := is_down(n)
		var c: Vector2 = b["c"]
		var r: float = b["r"]
		var base := Color(1, 1, 1, 0.22)
		match n:
			"acelerar":
				base = Color(0.2, 0.75, 0.3, 0.5)
			"frenar":
				base = Color(0.85, 0.2, 0.2, 0.45)
			"turbo":
				base = Color(0.15, 0.5, 0.95, 0.5) if nitro_frac > 0.01 else Color(0.4, 0.4, 0.5, 0.35)
			"pito":
				base = Color(1, 0.85, 0.2, 0.4)
		if down:
			base = Color(base.lightened(0.3), minf(base.a + 0.25, 0.9))
		draw_circle(c + Vector2(0, 5), r, Color(0, 0, 0, 0.18))
		draw_circle(c, r, base)
		draw_arc(c, r, 0, TAU, 40, Color(1, 1, 1, 0.7), 4, true)
		if n == "turbo":
			draw_arc(c, r - 9, -PI / 2, -PI / 2 + TAU * nitro_frac, 40, Color("ffe14d"), 8, true)
		var fs := 46 if b["text"].length() <= 1 else (22 if r < 60 else 26)
		var tw := font.get_string_size(b["text"], HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string_outline(font, c + Vector2(-tw / 2, fs * 0.35), b["text"], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 6, Color(0, 0, 0, 0.5))
		draw_string(font, c + Vector2(-tw / 2, fs * 0.35), b["text"], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.WHITE)
