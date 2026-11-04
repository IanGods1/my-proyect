extends Node2D
## Construye el escenario de Guastatoya alrededor de la pista:
## cerros, Parque Central (kiosco, ceiba, palmeras, arbustos en diamante),
## calles con tiendas, ventas y carrito de helados.

const Art := preload("res://scripts/art.gd")
const Deco := preload("res://scripts/race/deco.gd")
const Track := preload("res://scripts/race/track.gd")

const PARK := Rect2(872, 872, 2078, 1956)  # x 872..2950, y 872..2828
const BLOCK := Rect2(3028, 1672, 1300, 1156)  # manzana de tiendas
const WORLD := Rect2(-1700, -1500, 8600, 6700)

const SHOP_NAMES := [
	"Tienda La Bendición", "Abarrotería El Progreso", "Farmacia", "Tortillería Doña Mari",
	"Ferretería", "Librería", "Pollo Frito", "Comedor La Ceiba", "Panadería", "Barbería",
	"Agua Pura", "Licuados", "Café del Valle", "Zapatería", "Helados", "Tienda Mi Pueblo",
	"Venta de Mangos", "Cevichería", "Pacas", "Celulares"]
const WALL_COLORS := [Color("f6d365"), Color("f28b82"), Color("a7d8f0"), Color("ffffff"),
	Color("c3e88d"), Color("ffb74d"), Color("e1bee7"), Color("80cbc4")]
const TARP_COLORS := [Color("e63946"), Color("1982c4"), Color("ff9f1c"), Color("2a9d8f"), Color("8338ec")]

var track: Track  # sentido normal, para colocar adornos
var rng := RandomNumberGenerator.new()
var start_s := 0.0


func build(t: Track, s0: float) -> void:
	track = t
	start_s = s0
	rng.seed = 2024
	_ground()
	_interior()
	_road()
	_park()
	_block()
	_shops()
	_scatter_country()


func _add(pos: Vector2, fn: Callable, rot := 0.0, z := 0) -> Node2D:
	var d := Deco.new()
	d.position = pos
	d.rotation = rot
	d.fn = fn
	d.z_index = z
	add_child(d)
	return d


# ------------------------------------------------------------------ suelo y cerros
func _ground() -> void:
	_add(Vector2.ZERO, func(ci: CanvasItem):
		ci.draw_rect(WORLD, Color("9bb05a"))
		# franja de tierra seca del valle
		ci.draw_rect(Rect2(-300, -300, 5800, 4300), Color("b9b46e")))
	# cerros alrededor del valle (montañas)
	var ring := Rect2(-900, -800, 7000, 5300)
	var per := 2.0 * (ring.size.x + ring.size.y)
	var count := 46
	for i in count:
		var u := per * i / count
		var p: Vector2
		if u < ring.size.x:
			p = ring.position + Vector2(u, 0)
		elif u < ring.size.x + ring.size.y:
			p = Vector2(ring.end.x, ring.position.y + u - ring.size.x)
		elif u < 2 * ring.size.x + ring.size.y:
			p = Vector2(ring.end.x - (u - ring.size.x - ring.size.y), ring.end.y)
		else:
			p = Vector2(ring.position.x, ring.end.y - (u - 2 * ring.size.x - ring.size.y))
		var r := rng.randf_range(520, 820)
		var seed_v := rng.randi()
		_add(p, func(ci: CanvasItem): _hill(ci, r, seed_v), 0.0, 0)


func _hill(ci: CanvasItem, r: float, seed_v: int) -> void:
	var rr := RandomNumberGenerator.new()
	rr.seed = seed_v
	var cols := [Color("6f8f3e"), Color("7f9f48"), Color("90b052"), Color("a3c160")]
	for k in cols.size():
		var rad := r * (1.0 - k * 0.22)
		var off := Vector2(-k * r * 0.06, -k * r * 0.08)
		ci.draw_colored_polygon(_blob(off, rad, rr), cols[k])
	# rocas y arbolitos en las laderas
	for k in 10:
		var a := rr.randf() * TAU
		var p := Vector2(cos(a), sin(a)) * rr.randf_range(0.2, 0.85) * r
		if rr.randf() < 0.4:
			ci.draw_circle(p, rr.randf_range(14, 26), Color("9c8a6a"))
		else:
			ci.draw_circle(p + Vector2(4, 5), 22, Color(0, 0, 0, 0.15))
			ci.draw_circle(p, 22, Color("4f7a2e"))
			ci.draw_circle(p - Vector2(5, 5), 12, Color("6a9a3a"))


func _blob(c: Vector2, r: float, rr: RandomNumberGenerator) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var n := 20
	for i in n:
		var a := TAU * i / n
		pts.append(c + Vector2(cos(a), sin(a)) * r * rr.randf_range(0.85, 1.08))
	return pts


func _scatter_country() -> void:
	# arbolitos y matorrales entre el pueblo y los cerros
	for i in 160:
		var p := Vector2(rng.randf_range(-700, 5900), rng.randf_range(-600, 4400))
		var inner := Rect2(-120, -120, 5340, 3840)
		if inner.has_point(p):
			continue
		var s := rng.randf_range(16, 34)
		var col := Color("4f8a3a").lerp(Color("7aa84a"), rng.randf())
		_add(p, func(ci: CanvasItem): Art.round_bush(ci, s, col))


# ------------------------------------------------------------------ interior del circuito
func _interior() -> void:
	var poly := PackedVector2Array()
	for i in track.n:
		poly.append(track.pts[i] + track.normals[i] * (Track.HALF + Track.SIDEWALK))
	_add(Vector2.ZERO, func(ci: CanvasItem): ci.draw_colored_polygon(poly, Color("d8cfb5")))


# ------------------------------------------------------------------ calle
func _road() -> void:
	var chunk := 32
	var i := 0
	while i < track.n:
		var a := i
		var b := mini(i + chunk, track.n)
		_add(Vector2.ZERO, func(ci: CanvasItem): _draw_road_chunk(ci, a, b))
		i += chunk
	# línea de salida / meta
	var p: Vector2 = track.point_at(start_s)
	var d: Vector2 = track.dir_at(start_s)
	_add(p, func(ci: CanvasItem):
		var sq := 30.0
		for r in 2:
			for k in int(Track.HALF * 2 / sq):
				var col := Color.WHITE if (k + r) % 2 == 0 else Color("222222")
				ci.draw_rect(Rect2(-sq + r * sq, -Track.HALF + k * sq, sq, sq), col), d.angle())
	# arco de bienvenida sobre la meta
	_add(p, func(ci: CanvasItem): _gantry(ci), d.angle(), 20)


func _strip(a: int, b: int, d1: float, d2: float) -> PackedVector2Array:
	var poly := PackedVector2Array()
	for k in range(a, b + 1):
		var i := k % track.n
		poly.append(track.pts[i] + track.normals[i] * d1)
	for k in range(b, a - 1, -1):
		var i := k % track.n
		poly.append(track.pts[i] + track.normals[i] * d2)
	return poly


func _draw_road_chunk(ci: CanvasItem, a: int, b: int) -> void:
	var H: float = Track.HALF
	var S: float = Track.SIDEWALK
	# banquetas
	ci.draw_colored_polygon(_strip(a, b, -H - S, -H), Color("c9c4b8"))
	ci.draw_colored_polygon(_strip(a, b, H, H + S), Color("c9c4b8"))
	# baldosas de la banqueta
	for k in range(a, b, 3):
		var i: int = k % track.n
		for side in [-1.0, 1.0]:
			var p1: Vector2 = track.pts[i] + track.normals[i] * (H + 4) * side
			var p2: Vector2 = track.pts[i] + track.normals[i] * (H + S) * side
			ci.draw_line(p1, p2, Color("b3ad9f"), 2)
	# bordillos
	ci.draw_colored_polygon(_strip(a, b, -H - 8, -H), Color("8e8a80"))
	ci.draw_colored_polygon(_strip(a, b, H, H + 8), Color("8e8a80"))
	# asfalto
	ci.draw_colored_polygon(_strip(a, b, -H, H), Color("5f6066"))
	# líneas blancas de orilla
	var l1 := PackedVector2Array()
	var l2 := PackedVector2Array()
	for k in range(a, b + 1):
		var i: int = k % track.n
		l1.append(track.pts[i] + track.normals[i] * (H - 16))
		l2.append(track.pts[i] - track.normals[i] * (H - 16))
	ci.draw_polyline(l1, Color("e8e8e0"), 4)
	ci.draw_polyline(l2, Color("e8e8e0"), 4)
	# línea central discontinua (amarilla)
	for k in range(a, b):
		if (k / 3) % 2 == 0:
			var i: int = k % track.n
			ci.draw_line(track.pts[i], track.pts[(i + 1) % track.n], Color("f2c230"), 5)
	# manchas y tapaderas en el asfalto
	var rr := RandomNumberGenerator.new()
	rr.seed = a * 31 + 7
	for k in 3:
		var i: int = (a + rr.randi_range(0, b - a)) % track.n
		var p: Vector2 = track.pts[i] + track.normals[i] * rr.randf_range(-H + 30, H - 30)
		if rr.randf() < 0.3:
			ci.draw_circle(p, 14, Color("4a4a50"))
			ci.draw_circle(p, 10, Color("55565c"))
		else:
			ci.draw_circle(p, rr.randf_range(12, 30), Color(0.3, 0.3, 0.33, 0.25))


func _gantry(ci: CanvasItem) -> void:
	var H: float = Track.HALF + Track.SIDEWALK
	# postes
	ci.draw_rect(Rect2(-10, -H - 14, 20, 20), Color("8a4b14"))
	ci.draw_rect(Rect2(-10, H - 6, 20, 20), Color("8a4b14"))
	# manta (semi-transparente para ver los tuc tucs debajo)
	ci.draw_rect(Rect2(-24, -H, 48, H * 2), Color(1, 0.95, 0.8, 0.55))
	ci.draw_rect(Rect2(-24, -H, 48, H * 2), Color(0.55, 0.3, 0.1, 0.7), false, 3)
	var font := ThemeDB.fallback_font
	ci.draw_set_transform(Vector2.ZERO, PI / 2, Vector2.ONE)
	var txt := "GUASTATOYA – Ciudad con vista propia"
	var w := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 26).x
	ci.draw_string(font, Vector2(-w / 2, 9), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 26, Color(0.75, 0.1, 0.1, 0.85))
	ci.draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)


# ------------------------------------------------------------------ parque central
func _park() -> void:
	var c := PARK.get_center()
	# césped, senderos, plaza
	_add(Vector2.ZERO, func(ci: CanvasItem):
		ci.draw_colored_polygon(Art.rrect(PARK, 60, 4), Color("2f7d32"))
		ci.draw_colored_polygon(Art.rrect(PARK.grow(-18), 50, 4), Color("5cae4a"))
		# franjas de césped cortado
		for k in range(int(PARK.position.x) + 40, int(PARK.end.x) - 40, 80):
			ci.draw_rect(Rect2(k, PARK.position.y + 30, 40, PARK.size.y - 60), Color(1, 1, 1, 0.04))
		var path := Color("e2cfa0")
		var pw := 70.0
		# sendero perimetral
		var outer := PARK.grow(-60)
		ci.draw_polyline(_closed(Art.rrect(outer, 40, 4)), path, pw)
		# cruz y diagonales hasta la plaza
		ci.draw_line(Vector2(c.x, PARK.position.y + 20), Vector2(c.x, PARK.end.y - 20), path, pw)
		ci.draw_line(Vector2(PARK.position.x + 20, c.y), Vector2(PARK.end.x - 20, c.y), path, pw)
		for corner in [outer.position, Vector2(outer.end.x, outer.position.y), outer.end, Vector2(outer.position.x, outer.end.y)]:
			ci.draw_line(corner, c, path, pw * 0.8)
		# plaza central con piso de ladrillo
		ci.draw_circle(c, 330, Color("c9a77a"))
		ci.draw_circle(c, 310, Color("dcbf92"))
		for r in [120, 180, 240, 300]:
			ci.draw_polyline(_closed(Art.circle_pts(c, r, 40)), Color("c9a77a"), 3)
		for k in 24:
			var a := TAU * k / 24
			ci.draw_line(c + Vector2(cos(a), sin(a)) * 120, c + Vector2(cos(a), sin(a)) * 310, Color("c9a77a"), 2)
		# jardineras de flores
		for k in 4:
			var a := PI / 4 + k * PI / 2
			var fp := c + Vector2(cos(a), sin(a)) * 420
			ci.draw_circle(fp, 60, Color("8a5a2b"))
			ci.draw_circle(fp, 52, Color("4f9a3a"))
			for f in 14:
				var fa := TAU * f / 14
				var fcol: Color = [Color("ff4d6d"), Color("ffd23f"), Color("ffffff"), Color("c77dff")][f % 4]
				ci.draw_circle(fp + Vector2(cos(fa), sin(fa)) * (20 + (f % 3) * 10), 7, fcol)
		# letrero en el césped
		var font := ThemeDB.fallback_font
		var txt := "PARQUE CENTRAL"
		var w := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 44).x
		var tp := Vector2(c.x - w / 2, PARK.position.y + 230)
		ci.draw_string_outline(font, tp, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 44, 10, Color("2f7d32"))
		ci.draw_string(font, tp, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 44, Color("fff4d6")))

	# kiosco con cúpula redonda en el centro
	_add(c, func(ci: CanvasItem): Art.kiosco(ci, 115), 0.0, 2)
	# la gran ceiba
	_add(c + Vector2(-560, -470), func(ci: CanvasItem): Art.ceiba(ci, 230), 0.0, 3)
	# arbustos en diamante: hileras a los lados de los senderos
	for k in range(int(PARK.position.x) + 150, int(PARK.end.x) - 120, 110):
		if absf(k - c.x) < 380:
			continue
		for side in [-1, 1]:
			_add(Vector2(k, c.y + side * 70), func(ci: CanvasItem): Art.diamond_bush(ci, 30), 0.0, 1)
	for k in range(int(PARK.position.y) + 150, int(PARK.end.y) - 120, 110):
		if absf(k - c.y) < 380:
			continue
		for side in [-1, 1]:
			_add(Vector2(c.x + side * 70, k), func(ci: CanvasItem): Art.diamond_bush(ci, 30), 0.0, 1)
	# arbustos en diamante alrededor de la plaza
	for k in 16:
		var a := TAU * k / 16 + PI / 16
		_add(c + Vector2(cos(a), sin(a)) * 365, func(ci: CanvasItem): Art.diamond_bush(ci, 24), 0.0, 1)
	# orilla del parque: arbustos en diamante y palmeras
	var inner := PARK.grow(-28)
	var per := 2.0 * (inner.size.x + inner.size.y)
	var spacing := 95.0
	var u := 0.0
	var idx := 0
	while u < per:
		var p := _rect_perimeter(inner, u)
		if idx % 5 == 0:
			var rot := rng.randf() * TAU
			_add(p, func(ci: CanvasItem): Art.palm(ci, 62, rot), 0.0, 4)
		else:
			_add(p, func(ci: CanvasItem): Art.diamond_bush(ci, 22), 0.0, 1)
		u += spacing
		idx += 1
	# palmeras en el césped
	for p in [c + Vector2(-700, 450), c + Vector2(700, -450), c + Vector2(700, 450), c + Vector2(-300, -620),
			c + Vector2(320, 620), c + Vector2(-760, 120), c + Vector2(760, -120), c + Vector2(260, -640),
			c + Vector2(-260, 640), c + Vector2(-820, -150)]:
		var rot := rng.randf() * TAU
		_add(p, func(ci: CanvasItem): Art.palm(ci, 70, rot), 0.0, 4)
	# árboles redondos
	for p in [c + Vector2(560, 470), c + Vector2(-520, 520), c + Vector2(560, -560)]:
		_add(p, func(ci: CanvasItem): Art.round_bush(ci, 70, Color("3d8f3f")), 0.0, 3)
	# bancas y faroles
	for k in 8:
		var a := TAU * k / 8
		var p := c + Vector2(cos(a), sin(a)) * 285
		_add(p, func(ci: CanvasItem): _bench(ci), a + PI / 2, 2)
	for k in 8:
		var a := TAU * k / 8 + PI / 8
		var p := c + Vector2(cos(a), sin(a)) * 300
		_add(p, func(ci: CanvasItem): _lamp(ci), 0.0, 2)
	# carrito de helados en el parque
	_add(c + Vector2(0, 360), func(ci: CanvasItem): Art.helados_cart(ci), 0.3, 2)


func _closed(p: PackedVector2Array) -> PackedVector2Array:
	var q := p.duplicate()
	q.append(p[0])
	return q


func _rect_perimeter(r: Rect2, u: float) -> Vector2:
	if u < r.size.x:
		return r.position + Vector2(u, 0)
	u -= r.size.x
	if u < r.size.y:
		return Vector2(r.end.x, r.position.y + u)
	u -= r.size.y
	if u < r.size.x:
		return Vector2(r.end.x - u, r.end.y)
	u -= r.size.x
	return Vector2(r.position.x, r.end.y - u)


func _bench(ci: CanvasItem) -> void:
	ci.draw_rect(Rect2(-22 + 3, -7 + 4, 44, 14), Color(0, 0, 0, 0.2))
	ci.draw_rect(Rect2(-22, -7, 44, 14), Color("8b5a2b"))
	for k in 3:
		ci.draw_line(Vector2(-20, -4 + k * 4), Vector2(20, -4 + k * 4), Color("a8743f"), 2)


func _lamp(ci: CanvasItem) -> void:
	ci.draw_circle(Vector2(6, 6), 9, Color(0, 0, 0, 0.2))
	ci.draw_circle(Vector2.ZERO, 9, Color("2b2b33"))
	ci.draw_circle(Vector2.ZERO, 5, Color("fff3a0"))


# ------------------------------------------------------------------ manzana de tiendas
func _block() -> void:
	_add(Vector2.ZERO, func(ci: CanvasItem):
		ci.draw_rect(BLOCK, Color("bdb59e"))
		# calle peatonal entre el parque y la manzana
		ci.draw_rect(Rect2(PARK.end.x, PARK.position.y + 780, BLOCK.position.x - PARK.end.x, PARK.size.y - 780), Color("cfc6ad")))
	# techos en el centro de la manzana
	var cols := 4
	var rows := 3
	var cw := (BLOCK.size.x - 360) / cols
	var rh := (BLOCK.size.y - 360) / rows
	for i in cols:
		for j in rows:
			var r := Rect2(BLOCK.position.x + 180 + i * cw + 6, BLOCK.position.y + 180 + j * rh + 6, cw - 12, rh - 12)
			var style := rng.randi_range(0, 2)
			var col: Color = WALL_COLORS[rng.randi_range(0, WALL_COLORS.size() - 1)]
			_add(Vector2.ZERO, func(ci: CanvasItem): _roof(ci, r, style, col), 0.0, 1)


func _roof(ci: CanvasItem, r: Rect2, style: int, col: Color) -> void:
	ci.draw_rect(Rect2(r.position + Vector2(8, 10), r.size), Color(0, 0, 0, 0.25))
	match style:
		0:  # lámina
			ci.draw_rect(r, Color("a9adb3"))
			var x := r.position.x
			while x < r.end.x:
				ci.draw_line(Vector2(x, r.position.y), Vector2(x, r.end.y), Color("8d9198"), 3)
				x += 14
		1:  # teja
			ci.draw_rect(r, Color("c1572e"))
			var y := r.position.y
			while y < r.end.y:
				ci.draw_line(Vector2(r.position.x, y), Vector2(r.end.x, y), Color("9e4322"), 3)
				y += 12
			ci.draw_line(Vector2(r.position.x, r.get_center().y), Vector2(r.end.x, r.get_center().y), Color("7d3318"), 6)
		_:  # terraza de concreto con tinaco negro
			ci.draw_rect(r, col.lerp(Color("dddddd"), 0.5))
			ci.draw_rect(r, col.darkened(0.3), false, 4)
			var tp := r.position + Vector2(r.size.x * 0.75, r.size.y * 0.3)
			ci.draw_circle(tp + Vector2(4, 5), 20, Color(0, 0, 0, 0.25))
			ci.draw_circle(tp, 20, Color("1f1f24"))
			ci.draw_circle(tp, 12, Color("33333a"))


# ------------------------------------------------------------------ tiendas a la orilla de la calle
func _shops() -> void:
	var name_i := 0
	var s := 0.0
	var depth := 150.0
	while s < track.length:
		var w := rng.randf_range(200, 280)
		var mid: float = s + w / 2
		var straight: bool = absf(track.turn_between(mid - w / 2 - 40, w + 80)) < 0.05
		if straight:
			for side in [-1.0, 1.0]:
				var off: float = (Track.WALL + depth / 2.0) * side
				var p: Vector2 = track.pos_at(mid, off)
				if side > 0:
					# dentro del circuito: solo en la manzana, no en el parque
					var inner: Vector2 = track.pos_at(mid, Track.WALL)
					if inner.x < BLOCK.position.x + 40:
						continue
				var to_road: Vector2 = track.normal_at(mid) * -side
				var rot := to_road.angle() - PI / 2
				var nm: String = SHOP_NAMES[name_i % SHOP_NAMES.size()]
				var wall: Color = WALL_COLORS[name_i % WALL_COLORS.size()]
				var tarp: Color = TARP_COLORS[name_i % TARP_COLORS.size()]
				var style := name_i % 3
				name_i += 1
				var ww := w - 14
				_add(p, func(ci: CanvasItem): _shop(ci, ww, depth, nm, wall, tarp, style), rot, 1)
				if side < 0:
					# segunda fila de casas detrás
					var p2: Vector2 = track.pos_at(mid, -(Track.WALL + depth * 1.5 + 30))
					var r2 := Rect2(-ww / 2, -depth / 2, ww, depth)
					var st2 := rng.randi_range(0, 2)
					var c2: Color = WALL_COLORS[rng.randi_range(0, WALL_COLORS.size() - 1)]
					_add(p2, func(ci: CanvasItem): _roof(ci, r2, st2, c2), rot, 1)
		else:
			# en las esquinas: palmera o venta en la banqueta exterior
			var p3: Vector2 = track.pos_at(mid, -(Track.WALL + 60))
			var rot3 := rng.randf() * TAU
			_add(p3, func(ci: CanvasItem): Art.palm(ci, 60, rot3), 0.0, 4)
		s += w


func _shop(ci: CanvasItem, w: float, depth: float, nm: String, wall: Color, tarp: Color, style: int) -> void:
	# Coordenadas locales: +Y apunta hacia la calle, la fachada está en y = depth/2.
	var r := Rect2(-w / 2, -depth / 2, w, depth)
	_roof(ci, r, style, wall)
	# pared de la fachada
	ci.draw_rect(Rect2(-w / 2, depth / 2 - 14, w, 14), wall)
	ci.draw_rect(Rect2(-w / 2, depth / 2 - 14, w, 14), wall.darkened(0.35), false, 2)
	# toldo rayado sobre la banqueta
	var stripes := 7
	var aw := w - 24
	for k in stripes:
		var col := tarp if k % 2 == 0 else Color("fff4e0")
		ci.draw_rect(Rect2(-aw / 2 + aw * k / stripes, depth / 2 - 4, aw / stripes + 1, 26), col)
	ci.draw_rect(Rect2(-aw / 2, depth / 2 - 4, aw, 26), tarp.darkened(0.4), false, 2)
	# rótulo
	var font := ThemeDB.fallback_font
	var fs := 22
	var tw := font.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var board_w := maxf(tw + 20, 80)
	var center := Vector2(0, depth / 2 - 48)
	ci.draw_set_transform(center, -ci.rotation, Vector2.ONE)
	ci.draw_rect(Rect2(-board_w / 2 + 4, -18 + 4, board_w, 36), Color(0, 0, 0, 0.3))
	ci.draw_rect(Rect2(-board_w / 2, -18, board_w, 36), Color("fffaf0"))
	ci.draw_rect(Rect2(-board_w / 2, -18, board_w, 36), tarp, false, 3)
	ci.draw_string(font, Vector2(-tw / 2, 8), nm, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, tarp.darkened(0.3))
	ci.draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
