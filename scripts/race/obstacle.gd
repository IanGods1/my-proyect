extends Node2D
## Obstáculos típicos del pueblo.
## kind: "tope", "bache", "perro", "moto", "pickup", "pickup_mov", "venta", "helados"

const Art := preload("res://scripts/art.gd")
const Track := preload("res://scripts/race/track.gd")

var kind := "tope"
var fwd: Track  # pista en sentido normal (para posiciones fijas)
var drive: Track  # pista en el sentido de la carrera
var base_s := 0.0  # posición sobre `fwd`
var base_d := 0.0
var col := Color.WHITE
var t := 0.0

# Para la IA (coordenadas sobre la pista de manejo)
var ai_s := 0.0
var ai_d := 0.0
var ai_half := 30.0  # media anchura lateral que ocupa
var _hint := -1

# perro
var dog_state := 0  # 0 cruzando, 1 esperando, 2 huyendo
var dog_dir := 1.0
var dog_timer := 0.0
var bark_cd := 0.0
# pickup en movimiento / carrito
var move_s := 0.0
var move_speed := 0.0


func setup(k: String, fwd_track, drive_track, s: float, d: float, c := Color.WHITE) -> void:
	kind = k
	fwd = fwd_track
	drive = drive_track
	base_s = s
	base_d = d
	col = c
	move_s = s
	z_index = 2
	match kind:
		"tope":
			ai_half = Track.HALF
			z_index = 1
		"bache":
			ai_half = 34
			z_index = 1
		"perro":
			ai_half = 26
			dog_timer = randf() * 2.0
			z_index = 3
		"moto":
			ai_half = 20
		"pickup":
			ai_half = 34
		"pickup_mov":
			ai_half = 36
			move_speed = 175.0
			var c3: Vector3 = drive.closest(fwd.pos_at(s, 0), -1)
			move_s = c3.y
			base_d = 105.0
		"venta":
			ai_half = 40
		"helados":
			ai_half = 26
			move_speed = 40.0
	_place()


func _place() -> void:
	match kind:
		"pickup_mov":
			position = drive.pos_at(move_s, base_d)
			rotation = drive.dir_at(move_s).angle()
		"perro":
			position = fwd.pos_at(base_s, base_d)
			if dog_dir < 0:
				rotation = (-fwd.normal_at(base_s)).angle()
			else:
				rotation = fwd.normal_at(base_s).angle()
		"helados":
			var s := base_s + sin(t * move_speed / 300.0) * 300.0
			position = fwd.pos_at(s, base_d)
			rotation = fwd.dir_at(s).angle() + (0.0 if cos(t * move_speed / 300.0) > 0 else PI)
		_:
			position = fwd.pos_at(base_s, base_d)
			rotation = fwd.dir_at(base_s).angle()
	var c: Vector3 = drive.closest(position, _hint)
	_hint = int(c.x)
	ai_s = c.y
	ai_d = c.z


func update(dt: float, race) -> void:
	t += dt
	bark_cd -= dt
	match kind:
		"perro":
			_update_dog(dt, race)
		"pickup_mov":
			move_s = drive.wrap_s(move_s + move_speed * dt)
			_place()
		"helados":
			_place()
	if kind == "perro" or kind == "pickup_mov" or kind == "helados":
		queue_redraw()


func _update_dog(dt: float, race) -> void:
	var edge: float = Track.HALF + 40.0
	match dog_state:
		0:
			base_d += dog_dir * 125.0 * dt
			if absf(base_d) >= edge:
				base_d = signf(base_d) * edge
				dog_state = 1
				dog_timer = randf_range(1.2, 3.0)
		1:
			dog_timer -= dt
			if dog_timer <= 0:
				dog_dir = -signf(base_d)
				dog_state = 0
		2:
			base_d += dog_dir * 360.0 * dt
			if absf(base_d) >= edge + 30:
				base_d = signf(base_d) * (edge + 30)
				dog_state = 1
				dog_timer = 6.0
	_place()
	if dog_state != 1 and bark_cd <= 0 and race.player and race.player.position.distance_to(position) < 380:
		bark_cd = 3.5
		Sfx.play("bark", -4.0, randf_range(0.9, 1.15))


## Círculos sólidos [centro global, radio].
func solid_circles() -> Array:
	var f := Vector2.from_angle(rotation)
	match kind:
		"moto":
			return [[position + f * 10, 13.0], [position - f * 10, 13.0]]
		"pickup", "pickup_mov":
			return [[position + f * 34, 27.0], [position, 27.0], [position - f * 34, 27.0]]
		"venta":
			return [[position + f * 18, 26.0], [position - f * 18, 26.0]]
		"helados":
			return [[position, 22.0]]
	return []


## Efecto al pasar por encima (obstáculos no sólidos). Devuelve true si tocó.
func check_trigger(kart) -> bool:
	match kind:
		"tope":
			var dir := Vector2.from_angle(rotation)
			var rel: Vector2 = kart.position - position
			return absf(rel.dot(dir)) < 20.0 and absf(rel.dot(dir.orthogonal())) < Track.HALF + 10
		"bache":
			return kart.position.distance_to(position) < 34.0
		"perro":
			return dog_state != 2 and kart.position.distance_to(position) < 34.0
	return false


func scare_dog(from: Vector2) -> void:
	var n: Vector2 = fwd.normal_at(base_s)
	dog_dir = 1.0 if (position - from).dot(n) >= 0 else -1.0
	dog_state = 2
	Sfx.play("bark", 0.0, 1.3)


func _draw() -> void:
	match kind:
		"tope":
			var h: float = Track.HALF
			draw_rect(Rect2(-14 + 3, -h + 4, 28, h * 2), Color(0, 0, 0, 0.25))
			var n := 12
			for i in n:
				var c := Color("f2c230") if i % 2 == 0 else Color("222222")
				draw_rect(Rect2(-14, -h + h * 2 * i / n, 28, h * 2 / n + 1), c)
			draw_rect(Rect2(-14, -h, 28, h * 2), Color(0, 0, 0, 0.5), false, 2)
			draw_line(Vector2(-8, -h), Vector2(-8, h), Color(1, 1, 1, 0.25), 3)
		"bache":
			var pts := PackedVector2Array()
			for i in 12:
				var a := TAU * i / 12
				pts.append(Vector2(cos(a), sin(a)) * (26 + sin(i * 2.7) * 6))
			draw_colored_polygon(pts, Color("3a3a3f"))
			draw_colored_polygon(Art.circle_pts(Vector2(2, 3), 17, 10), Color("26262a"))
			draw_circle(Vector2(-6, -5), 6, Color("6e5a3a", 0.8))
			for i in 4:
				var a := TAU * i / 4 + 0.5
				draw_line(Vector2(cos(a), sin(a)) * 26, Vector2(cos(a), sin(a)) * 44, Color("3a3a3f"), 2)
		"perro":
			Art.dog(self, t if dog_state != 1 else 0.0, col)
		"moto":
			Art.moto(self, col)
		"pickup", "pickup_mov":
			Art.pickup(self, col)
		"venta":
			Art.venta(self, 70, 52, col)
		"helados":
			Art.helados_cart(self)
