extends RefCounted
## Dibujos vectoriales estilo caricatura (vista desde arriba).
## Todo se dibuja por código para que el APK pese poco.

const ROOF_RED := Color("d62828")
const OUTLINE := Color(0.1, 0.08, 0.08, 0.85)


static func rrect(r: Rect2, rad: float, segs := 3) -> PackedVector2Array:
	var pts := PackedVector2Array()
	rad = minf(rad, minf(r.size.x, r.size.y) * 0.5)
	var corners := [
		[Vector2(r.end.x - rad, r.position.y + rad), -PI / 2],
		[Vector2(r.end.x - rad, r.end.y - rad), 0.0],
		[Vector2(r.position.x + rad, r.end.y - rad), PI / 2],
		[Vector2(r.position.x + rad, r.position.y + rad), PI],
	]
	for c in corners:
		for i in segs + 1:
			var a: float = c[1] + (PI / 2) * float(i) / segs
			pts.append(c[0] + Vector2(cos(a), sin(a)) * rad)
	return pts


static func circle_pts(center: Vector2, radius: float, n := 16) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in n:
		var a := TAU * i / n
		pts.append(center + Vector2(cos(a), sin(a)) * radius)
	return pts


static func outline(ci: CanvasItem, pts: PackedVector2Array, col: Color, w := 2.0) -> void:
	var p := pts.duplicate()
	p.append(pts[0])
	ci.draw_polyline(p, col, w, true)


static func shape(ci: CanvasItem, pts: PackedVector2Array, fill: Color, line := OUTLINE, w := 2.0) -> void:
	ci.draw_colored_polygon(pts, fill)
	if w > 0.0:
		outline(ci, pts, line, w)


## Tuc tuc mirando hacia +X. Mide ~64 x 42 px.
static func tuctuc(ci: CanvasItem, body: Color, opts := {}) -> void:
	var roof: Color = opts.get("roof", ROOF_RED)
	var wheel_t: float = opts.get("wheel", 0.0)
	var dmg: float = opts.get("damage", 0.0)  # 0 sano .. 1 muy golpeado
	var shadow: bool = opts.get("shadow", true)
	var lights: bool = opts.get("lights", false)
	var braking: bool = opts.get("braking", false)
	var lift: float = opts.get("lift", 0.0)
	if shadow:
		ci.draw_colored_polygon(rrect(Rect2(-28 + 5 + lift, -21 + 6 + lift, 60, 42), 12), Color(0, 0, 0, 0.28))
	if lights:
		var beam := PackedVector2Array([Vector2(30, -5), Vector2(170, -60), Vector2(190, 0), Vector2(170, 60), Vector2(30, 5)])
		ci.draw_colored_polygon(beam, Color(1, 0.95, 0.6, 0.18))
	# llantas (con rayitas que giran)
	var tire := Color("1d1d22")
	for wp in [Vector2(-18, -23), Vector2(-18, 23), Vector2(24, 0)]:
		var wr := Rect2(wp - Vector2(8, 4.5), Vector2(16, 9))
		ci.draw_colored_polygon(rrect(wr, 3), tire)
		var off := fmod(wheel_t * 40.0, 8.0)
		for k in 2:
			var x := wr.position.x + fmod(off + k * 8.0, 16.0)
			ci.draw_line(Vector2(x, wr.position.y + 1), Vector2(x, wr.end.y - 1), Color(0.35, 0.35, 0.4), 1.5)
	# carrocería
	var dark := body.darkened(0.45)
	var b := PackedVector2Array([
		Vector2(-29, -20), Vector2(12, -20), Vector2(26, -10), Vector2(31, -4),
		Vector2(31, 4), Vector2(26, 10), Vector2(12, 20), Vector2(-29, 20)])
	shape(ci, b, body, dark, 2.5)
	# trompa con brillo
	ci.draw_colored_polygon(PackedVector2Array([Vector2(14, -12), Vector2(25, -6), Vector2(25, 6), Vector2(14, 12)]), body.lightened(0.25))
	# parabrisas
	ci.draw_colored_polygon(PackedVector2Array([Vector2(8, -15), Vector2(14, -13), Vector2(14, 13), Vector2(8, 15)]), Color("bfe6ff"))
	# timón (manubrio)
	ci.draw_line(Vector2(17, -9), Vector2(17, 9), Color("222222"), 2.5)
	# faro
	ci.draw_circle(Vector2(29, 0), 3.5, Color("fff6b0") if not lights else Color("ffffff"))
	# calaveras traseras
	var tail := Color("ff3030") if braking else Color("a01818")
	ci.draw_rect(Rect2(-31, -15, 3, 6), tail)
	ci.draw_rect(Rect2(-31, 9, 3, 6), tail)
	# techo rojo (lona) con orilla
	var rr := Rect2(-25, -15, 33, 30)
	shape(ci, rrect(rr, 7), roof, roof.darkened(0.5), 2.5)
	ci.draw_colored_polygon(rrect(Rect2(-21, -11, 25, 7), 3), roof.lightened(0.22))
	# costuras del techo
	for x in [-15.0, -5.0, 3.0]:
		ci.draw_line(Vector2(x, -14), Vector2(x, 14), roof.darkened(0.25), 1.2)
	# franja de color en la carrocería (se ve a los lados del techo)
	ci.draw_line(Vector2(-27, -17.5), Vector2(10, -17.5), body.lightened(0.35), 2)
	ci.draw_line(Vector2(-27, 17.5), Vector2(10, 17.5), body.lightened(0.35), 2)
	# golpes
	if dmg > 0.3:
		ci.draw_line(Vector2(-25, 12), Vector2(-14, 6), Color(0, 0, 0, 0.5), 2)
		ci.draw_line(Vector2(-14, 6), Vector2(-8, 13), Color(0, 0, 0, 0.5), 2)
	if dmg > 0.6:
		ci.draw_line(Vector2(0, -17), Vector2(7, -9), Color(0, 0, 0, 0.5), 2)
		ci.draw_circle(Vector2(20, 6), 3, Color(0.3, 0.2, 0.1, 0.6))


static func palm(ci: CanvasItem, size: float, rot: float) -> void:
	ci.draw_circle(Vector2(size * 0.18, size * 0.22), size * 0.75, Color(0, 0, 0, 0.18))
	var fronds := 7
	for i in fronds:
		var a := rot + TAU * i / fronds
		var dir := Vector2(cos(a), sin(a))
		var side := Vector2(-dir.y, dir.x)
		var tip := dir * size
		var pts := PackedVector2Array([
			Vector2.ZERO + side * 3, dir * size * 0.5 + side * size * 0.2, tip,
			dir * size * 0.5 - side * size * 0.12, -side * 3])
		ci.draw_colored_polygon(pts, Color("2f8f3a") if i % 2 == 0 else Color("3fa848"))
		ci.draw_line(Vector2.ZERO, tip * 0.95, Color("1f6a2a"), 1.5)
	ci.draw_circle(Vector2.ZERO, size * 0.14, Color("8a5a2b"))
	ci.draw_circle(Vector2(-2, -2), size * 0.06, Color("c48a4a"))


## Arbusto recortado en forma de diamante, como los del parque.
static func diamond_bush(ci: CanvasItem, size: float) -> void:
	var s := size
	var sh := PackedVector2Array([Vector2(4, -s + 6), Vector2(s + 4, 6), Vector2(4, s + 6), Vector2(-s + 4, 6)])
	ci.draw_colored_polygon(sh, Color(0, 0, 0, 0.2))
	var d := PackedVector2Array([Vector2(0, -s), Vector2(s, 0), Vector2(0, s), Vector2(-s, 0)])
	ci.draw_colored_polygon(d, Color("2b8a3e"))
	ci.draw_colored_polygon(PackedVector2Array([Vector2(0, -s), Vector2(s, 0), Vector2(0, 0)]), Color("3fae55"))
	ci.draw_colored_polygon(PackedVector2Array([Vector2(0, -s), Vector2(0, 0), Vector2(-s, 0)]), Color("36a04b"))
	outline(ci, d, Color("1c5f2a"), 2.0)
	ci.draw_circle(Vector2(-s * 0.25, -s * 0.35), s * 0.12, Color(1, 1, 1, 0.18))


static func round_bush(ci: CanvasItem, size: float, col := Color("3a9d4a")) -> void:
	ci.draw_circle(Vector2(4, 5), size, Color(0, 0, 0, 0.2))
	ci.draw_circle(Vector2.ZERO, size, col.darkened(0.2))
	ci.draw_circle(Vector2(-size * 0.2, -size * 0.2), size * 0.75, col)
	ci.draw_circle(Vector2(-size * 0.35, -size * 0.4), size * 0.3, col.lightened(0.2))


static func ceiba(ci: CanvasItem, size: float) -> void:
	# copa enorme y ancha, con varias capas
	ci.draw_circle(Vector2(size * 0.15, size * 0.18), size * 1.02, Color(0, 0, 0, 0.22))
	var blobs := [
		Vector2(0, 0), Vector2(0.55, 0.1), Vector2(-0.5, 0.15), Vector2(0.1, 0.55), Vector2(0.05, -0.55),
		Vector2(0.4, -0.4), Vector2(-0.42, -0.38), Vector2(-0.35, 0.48), Vector2(0.45, 0.45)]
	for b in blobs:
		ci.draw_circle(b * size, size * 0.5, Color("1f6e2c"))
	for b in blobs:
		ci.draw_circle(b * size * 0.9 + Vector2(-size * 0.06, -size * 0.06), size * 0.4, Color("2f8a3a"))
	for b in blobs:
		ci.draw_circle(b * size * 0.75 + Vector2(-size * 0.12, -size * 0.12), size * 0.22, Color("47a852"))
	# ramas que asoman
	for i in 5:
		var a := TAU * i / 5 + 0.4
		ci.draw_line(Vector2.ZERO, Vector2(cos(a), sin(a)) * size * 0.35, Color("6b4a2b"), 5)
	ci.draw_circle(Vector2.ZERO, size * 0.12, Color("7a5734"))


## Kiosco con cúpula redonda (vista desde arriba).
static func kiosco(ci: CanvasItem, r: float) -> void:
	ci.draw_circle(Vector2(10, 12), r * 1.05, Color(0, 0, 0, 0.25))
	# piso / gradas
	ci.draw_circle(Vector2.ZERO, r * 1.25, Color("d9c7a3"))
	ci.draw_circle(Vector2.ZERO, r * 1.12, Color("c8b48c"))
	# columnas
	for i in 8:
		var a := TAU * i / 8
		ci.draw_circle(Vector2(cos(a), sin(a)) * r * 1.02, r * 0.07, Color("f4efe4"))
	# cúpula
	ci.draw_circle(Vector2.ZERO, r * 0.95, Color("f0f0f0"))
	ci.draw_circle(Vector2(-r * 0.12, -r * 0.12), r * 0.75, Color("fbfbfb"))
	for i in 12:
		var a := TAU * i / 12
		ci.draw_line(Vector2(cos(a), sin(a)) * r * 0.18, Vector2(cos(a), sin(a)) * r * 0.95, Color("c9c9d2"), 2)
	outline(ci, circle_pts(Vector2.ZERO, r * 0.95, 32), Color("9a9aa8"), 3)
	# linterna y pináculo
	ci.draw_circle(Vector2.ZERO, r * 0.2, Color("e2b33c"))
	ci.draw_circle(Vector2.ZERO, r * 0.08, Color("fff0a0"))


static func helados_cart(ci: CanvasItem) -> void:
	ci.draw_colored_polygon(rrect(Rect2(-18 + 4, -12 + 5, 36, 24), 5), Color(0, 0, 0, 0.25))
	shape(ci, rrect(Rect2(-18, -12, 36, 24), 5), Color("ffffff"), Color("6a8fbf"), 2)
	ci.draw_rect(Rect2(-18, -3, 36, 6), Color("ff8fb8"))
	ci.draw_circle(Vector2(-22, -9), 4, Color("222222"))
	ci.draw_circle(Vector2(-22, 9), 4, Color("222222"))
	# sombrilla rayada
	for i in 8:
		var a0 := TAU * i / 8
		var a1 := TAU * (i + 1) / 8
		var col := Color("ffd23f") if i % 2 == 0 else Color("3fa9f5")
		ci.draw_colored_polygon(PackedVector2Array([Vector2(6, 0), Vector2(6, 0) + Vector2(cos(a0), sin(a0)) * 22, Vector2(6, 0) + Vector2(cos(a1), sin(a1)) * 22]), col)
	ci.draw_circle(Vector2(6, 0), 3, Color("ffffff"))


## Venta callejera con toldo y frutas.
static func venta(ci: CanvasItem, w: float, h: float, tarp: Color) -> void:
	ci.draw_colored_polygon(rrect(Rect2(-w / 2 + 5, -h / 2 + 6, w, h), 4), Color(0, 0, 0, 0.25))
	ci.draw_rect(Rect2(-w / 2, -h / 2, w, h), Color("a0784a"))
	var fruit := [Color("ff7a1a"), Color("ffd23f"), Color("e63946"), Color("7bc043"), Color("8e44ad")]
	var i := 0
	var x := -w / 2 + 8
	while x < w / 2 - 4:
		var y := -h / 2 + 8
		while y < h / 2 - 4:
			ci.draw_circle(Vector2(x, y), 4.5, fruit[i % fruit.size()])
			i += 1
			y += 10
		x += 10
	# toldo encima (franjas)
	var stripes := 5
	for s in stripes:
		var col := tarp if s % 2 == 0 else tarp.lightened(0.5)
		ci.draw_rect(Rect2(-w / 2 - 4 + (w + 8) * s / stripes, -h / 2 - 4, (w + 8) / stripes, h * 0.55), Color(col, 0.92))
	outline(ci, PackedVector2Array([Vector2(-w / 2 - 4, -h / 2 - 4), Vector2(w / 2 + 4, -h / 2 - 4), Vector2(w / 2 + 4, -h / 2 - 4 + h * 0.55), Vector2(-w / 2 - 4, -h / 2 - 4 + h * 0.55)]), tarp.darkened(0.4), 1.5)


static func moto(ci: CanvasItem, col: Color) -> void:
	ci.draw_colored_polygon(rrect(Rect2(-20 + 3, -6 + 4, 40, 12), 5), Color(0, 0, 0, 0.25))
	ci.draw_colored_polygon(rrect(Rect2(-22, -4, 10, 8), 3), Color("1d1d22"))
	ci.draw_colored_polygon(rrect(Rect2(12, -4, 10, 8), 3), Color("1d1d22"))
	shape(ci, rrect(Rect2(-14, -7, 28, 14), 6), col, col.darkened(0.5), 2)
	ci.draw_colored_polygon(rrect(Rect2(-10, -5, 14, 10), 4), Color("2a2a2a"))
	ci.draw_line(Vector2(14, -11), Vector2(14, 11), Color("333333"), 3)
	ci.draw_circle(Vector2(20, 0), 2.5, Color("fff6b0"))


static func pickup(ci: CanvasItem, col: Color) -> void:
	ci.draw_colored_polygon(rrect(Rect2(-52 + 6, -26 + 8, 104, 52), 8), Color(0, 0, 0, 0.28))
	for wp in [Vector2(-32, -27), Vector2(-32, 27), Vector2(32, -27), Vector2(32, 27)]:
		ci.draw_colored_polygon(rrect(Rect2(wp - Vector2(10, 5), Vector2(20, 10)), 3), Color("1d1d22"))
	shape(ci, rrect(Rect2(-52, -25, 104, 50), 9), col, col.darkened(0.5), 2.5)
	# palangana (cama)
	ci.draw_colored_polygon(rrect(Rect2(-48, -20, 50, 40), 3), col.darkened(0.25))
	ci.draw_rect(Rect2(-44, -16, 18, 14), Color("8b5a2b"))
	ci.draw_rect(Rect2(-24, 2, 16, 12), Color("2e7d32"))
	# cabina
	ci.draw_colored_polygon(rrect(Rect2(6, -21, 32, 42), 7), col.lightened(0.15))
	ci.draw_colored_polygon(PackedVector2Array([Vector2(30, -18), Vector2(40, -15), Vector2(40, 15), Vector2(30, 18)]), Color("bfe6ff"))
	ci.draw_circle(Vector2(50, -16), 3, Color("fff6b0"))
	ci.draw_circle(Vector2(50, 16), 3, Color("fff6b0"))


static func dog(ci: CanvasItem, t: float, col: Color) -> void:
	var leg := sin(t * 18.0) * 4.0
	ci.draw_colored_polygon(rrect(Rect2(-14 + 3, -6 + 4, 30, 13), 6), Color(0, 0, 0, 0.22))
	for lp in [Vector2(-9, -6 + leg * 0.3), Vector2(-9, 6 - leg * 0.3), Vector2(8, -6 - leg * 0.3), Vector2(8, 6 + leg * 0.3)]:
		ci.draw_circle(lp + Vector2(leg * (1 if lp.x > 0 else -1), 0), 2.6, col.darkened(0.35))
	ci.draw_colored_polygon(rrect(Rect2(-13, -6, 24, 12), 6), col)
	ci.draw_line(Vector2(-13, 0), Vector2(-21, sin(t * 20.0) * 5.0), col.darkened(0.2), 3)
	ci.draw_circle(Vector2(14, 0), 6.5, col)
	ci.draw_colored_polygon(PackedVector2Array([Vector2(11, -5), Vector2(14, -10), Vector2(17, -5)]), col.darkened(0.4))
	ci.draw_colored_polygon(PackedVector2Array([Vector2(11, 5), Vector2(14, 10), Vector2(17, 5)]), col.darkened(0.4))
	ci.draw_circle(Vector2(20, 0), 2.2, Color("222222"))
	ci.draw_circle(Vector2(-4, -2), 3, col.darkened(0.25))
