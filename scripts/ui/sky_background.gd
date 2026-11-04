extends Control
## Fondo de los menús: cielo soleado (o dorado al atardecer), montañas que
## rodean el valle, el pueblo y un tuc tuc que pasa por la calle.

const Art := preload("res://scripts/art.gd")

var sunset := false
var t := 0.0
var _ridges := []


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var rng := RandomNumberGenerator.new()
	rng.seed = 42
	for layer in 3:
		var pts := []
		var ph := rng.randf() * 10.0
		for i in 41:
			var x := i / 40.0
			var y := 0.0
			y += sin(x * (5.0 + layer * 2.0) + ph) * 0.05
			y += sin(x * (13.0 + layer * 3.0) + ph * 2.0) * 0.025
			y += rng.randf_range(-0.012, 0.012)
			pts.append(Vector2(x, y))
		_ridges.append(pts)


func _process(delta: float) -> void:
	t += delta
	queue_redraw()


func _draw() -> void:
	var sz := size
	var w := sz.x
	var h := sz.y
	# cielo en franjas (degradado barato)
	var top := Color("4aa8ff") if not sunset else Color("ff9a3c")
	var bottom := Color("cdeeff") if not sunset else Color("ffe08a")
	var bands := 24
	for i in bands:
		var c := top.lerp(bottom, float(i) / (bands - 1))
		draw_rect(Rect2(0, h * 0.7 * i / bands, w, h * 0.7 / bands + 1), c)
	# sol
	var sun_pos := Vector2(w * 0.8, h * 0.2) if not sunset else Vector2(w * 0.72, h * 0.46)
	var sun_col := Color("fff3a0") if not sunset else Color("ffcf4d")
	for k in 4:
		draw_circle(sun_pos, 70 + k * 26, Color(sun_col, 0.12))
	draw_circle(sun_pos, 62, sun_col)
	# nubes
	for i in 4:
		var cx := fmod(i * 360.0 + t * (12 + i * 4), w + 300) - 150
		var cy := h * (0.1 + 0.07 * (i % 3))
		var cc := Color(1, 1, 1, 0.85) if not sunset else Color(1, 0.85, 0.7, 0.85)
		for b in [Vector2(0, 0), Vector2(36, -12), Vector2(70, 0), Vector2(34, 8)]:
			draw_circle(Vector2(cx, cy) + b, 30, cc)
	# montañas (3 capas)
	var cols_day := [Color("8fb3c9"), Color("6c9a6a"), Color("4f8a46")]
	var cols_sun := [Color("b07aa0"), Color("9a6a5a"), Color("6e5a3a")]
	var bases := [0.5, 0.58, 0.66]
	for layer in 3:
		var pts := PackedVector2Array()
		pts.append(Vector2(0, h))
		for p in _ridges[layer]:
			pts.append(Vector2(p.x * w, h * (bases[layer] + p.y)))
		pts.append(Vector2(w, h))
		draw_colored_polygon(pts, (cols_sun if sunset else cols_day)[layer])
	# pueblo (casitas de colores)
	var houses := [Color("f6d365"), Color("f28b82"), Color("a7d8f0"), Color("ffffff"), Color("c3e88d"), Color("ffb74d")]
	var x := -20.0
	var i := 0
	while x < w:
		var hw := 70.0 + (i * 37 % 40)
		var hh := 50.0 + (i * 23 % 30)
		var y0 := h * 0.78
		draw_rect(Rect2(x, y0 - hh, hw, hh), houses[i % houses.size()])
		draw_colored_polygon(PackedVector2Array([Vector2(x - 6, y0 - hh), Vector2(x + hw / 2, y0 - hh - 22), Vector2(x + hw + 6, y0 - hh)]), Color("b5542c"))
		draw_rect(Rect2(x + hw * 0.35, y0 - 30, 18, 30), Color("6b4a2b"))
		x += hw + 8
		i += 1
	# palmeras
	for px in [w * 0.12, w * 0.33, w * 0.61, w * 0.9]:
		_palm_side(Vector2(px, h * 0.8), 1.0)
	# calle
	draw_rect(Rect2(0, h * 0.78, w, h * 0.22), Color("6d6d72"))
	draw_rect(Rect2(0, h * 0.78, w, 10), Color("bdbdb5"))
	for k in 12:
		draw_rect(Rect2(fmod(k * 160.0 - t * 200.0, w + 160) - 80, h * 0.89, 80, 8), Color("f2f2f2"))
	# tuc tuc que pasa
	var tx := fmod(t * 260.0, w + 400) - 200
	_tuctuc_side(Vector2(tx, h * 0.9), Game.player_color())
	if sunset:
		draw_rect(Rect2(Vector2.ZERO, sz), Color(1, 0.6, 0.2, 0.08))


func _palm_side(base: Vector2, s: float) -> void:
	var top := base + Vector2(14, -150) * s
	draw_polyline(PackedVector2Array([base, base + Vector2(4, -50) * s, base + Vector2(10, -100) * s, top]), Color("8a5a2b"), 9 * s)
	for k in 6:
		var a := -PI + k * PI / 5.0
		var tip := top + Vector2(cos(a), sin(a) * 0.5 + 0.3) * 70 * s
		var mid := top.lerp(tip, 0.5) + Vector2(0, -16 * s)
		draw_polyline(PackedVector2Array([top, mid, tip]), Color("2f8f3a"), 10 * s)


func _tuctuc_side(p: Vector2, body: Color) -> void:
	var bob := sin(t * 20.0) * 1.5
	p.y += bob
	draw_circle(p + Vector2(-30, 26), 13, Color("1d1d22"))
	draw_circle(p + Vector2(38, 26), 13, Color("1d1d22"))
	draw_circle(p + Vector2(-30, 26), 5, Color("aaaaaa"))
	draw_circle(p + Vector2(38, 26), 5, Color("aaaaaa"))
	var b := PackedVector2Array([Vector2(-52, 20), Vector2(-52, -10), Vector2(20, -10), Vector2(52, 6), Vector2(54, 22), Vector2(-52, 22)])
	for k in b.size():
		b[k] += p
	draw_colored_polygon(b, body)
	# techo rojo
	var roof := PackedVector2Array([Vector2(-56, -12), Vector2(-50, -58), Vector2(18, -58), Vector2(34, -12)])
	for k in roof.size():
		roof[k] += p
	draw_colored_polygon(roof, Art.ROOF_RED)
	draw_rect(Rect2(p + Vector2(-46, -50), Vector2(58, 34)), Color("bfe6ff"))
	draw_rect(Rect2(p + Vector2(-20, -50), Vector2(6, 34)), Art.ROOF_RED.darkened(0.3))
	draw_circle(p + Vector2(50, 4), 5, Color("fff6b0"))
