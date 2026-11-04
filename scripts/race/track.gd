extends RefCounted
## Geometría del circuito: una línea central cerrada que rodea el Parque
## Central y la manzana de tiendas. Se muestrea a intervalos iguales.
##
## Convención: d > 0 = lado derecho del sentido de manejo.

const HALF := 210.0  # media anchura del asfalto
const SIDEWALK := 62.0  # banqueta
const WALL := 300.0  # más allá no se puede pasar (fachadas / arriate)
const RADIUS := 380.0
const STEP := 16.0

## Esquinas del recorrido (sentido normal = horario en pantalla).
const CORNERS := [
	Vector2(600, 600), Vector2(3300, 600), Vector2(3300, 1400),
	Vector2(4600, 1400), Vector2(4600, 3100), Vector2(600, 3100)]

var pts := PackedVector2Array()
var dirs := PackedVector2Array()
var normals := PackedVector2Array()
var n := 0
var step := STEP
var length := 0.0


func _init(reverse := false) -> void:
	var raw := _rounded_loop()
	if reverse:
		raw.reverse()
	_resample(raw)


func _rounded_loop() -> PackedVector2Array:
	var out := PackedVector2Array()
	var c := CORNERS.size()
	for i in c:
		var prev: Vector2 = CORNERS[(i - 1 + c) % c]
		var cur: Vector2 = CORNERS[i]
		var nxt: Vector2 = CORNERS[(i + 1) % c]
		var din := (cur - prev).normalized()
		var dout := (nxt - cur).normalized()
		var a := cur - din * RADIUS
		var b := cur + dout * RADIUS
		var o := a + dout * RADIUS
		var a0 := (a - o).angle()
		var da := wrapf((b - o).angle() - a0, -PI, PI)
		var segs := 14
		for k in segs + 1:
			out.append(o + Vector2.from_angle(a0 + da * k / segs) * RADIUS)
	return out


func _resample(raw: PackedVector2Array) -> void:
	var m := raw.size()
	var total := 0.0
	for i in m:
		total += raw[i].distance_to(raw[(i + 1) % m])
	n = int(round(total / STEP))
	step = total / n
	length = total
	pts.resize(n)
	var seg := 0
	var seg_start := 0.0
	var seg_len := raw[0].distance_to(raw[1 % m])
	for k in n:
		var s := k * step
		while s > seg_start + seg_len and seg < m - 1:
			seg_start += seg_len
			seg += 1
			seg_len = raw[seg].distance_to(raw[(seg + 1) % m])
		var t := 0.0 if seg_len <= 0.001 else (s - seg_start) / seg_len
		pts[k] = raw[seg].lerp(raw[(seg + 1) % m], clampf(t, 0.0, 1.0))
	dirs.resize(n)
	normals.resize(n)
	for k in n:
		var d := (pts[(k + 1) % n] - pts[(k - 1 + n) % n]).normalized()
		dirs[k] = d
		normals[k] = Vector2(-d.y, d.x)


func wrap_i(i: int) -> int:
	return posmod(i, n)


func wrap_s(s: float) -> float:
	return fposmod(s, length)


func point_at(s: float) -> Vector2:
	s = wrap_s(s)
	var f := s / step
	var i := int(f)
	return pts[i % n].lerp(pts[(i + 1) % n], f - i)


func dir_at(s: float) -> Vector2:
	return dirs[int(wrap_s(s) / step) % n]


func normal_at(s: float) -> Vector2:
	return normals[int(wrap_s(s) / step) % n]


func pos_at(s: float, d: float) -> Vector2:
	return point_at(s) + normal_at(s) * d


## Proyecta una posición sobre la pista. hint = índice anterior (o -1).
## Devuelve Vector3(índice, s, d).
func closest(pos: Vector2, hint := -1) -> Vector3:
	var best := -1
	var best_d2 := INF
	if hint < 0:
		for i in n:
			var d2 := pos.distance_squared_to(pts[i])
			if d2 < best_d2:
				best_d2 = d2
				best = i
	else:
		for o in range(-28, 29):
			var i := posmod(hint + o, n)
			var d2 := pos.distance_squared_to(pts[i])
			if d2 < best_d2:
				best_d2 = d2
				best = i
		# Si quedó muy lejos (teletransporte) hacemos búsqueda completa.
		if best_d2 > 600.0 * 600.0:
			return closest(pos, -1)
	var p := pts[best]
	var along := (pos - p).dot(dirs[best])
	var s := wrap_s(best * step + along)
	var d := (pos - p).dot(normals[best])
	return Vector3(best, s, d)


## Distancia hacia adelante (en el sentido de manejo) de s_from a s_to.
func ahead(s_from: float, s_to: float) -> float:
	return fposmod(s_to - s_from, length)


## Cuánto gira la pista entre s y s + dist (radianes, con signo).
func turn_between(s: float, dist: float) -> float:
	return dir_at(s).angle_to(dir_at(s + dist))
