extends Node2D
## Un tuc tuc (jugador o máquina). Física arcade propia: aceleración,
## giro, derrape (velocidad lateral), choques, saltos en topes y daño.

const Art := preload("res://scripts/art.gd")
const Track := preload("res://scripts/race/track.gd")
const RADIUS := 32.0

var racer_name := ""
var body_color := Color.BLUE
var is_player := false
var stats := {}
var skill := 1.0

var vel := Vector2.ZERO
var throttle := 0.0
var steer := 0.0
var want_nitro := false
var nitro_on := false
var nitro := 30.0
var hp := 100.0
var spin_t := 0.0
var spin_dir := 1.0
var hop := 0.0
var hop_v := 0.0
var wheel := 0.0
var drift := 0.0
var offroad := false
var lights := false
var shake_req := 0.0

# progreso en la pista
var track_i := -1
var track_s := 0.0
var track_d := 0.0
var laps := -1
var prev_rel := 0.0
var progress := 0.0
var finished := false
var finish_time := 0.0
var lap_times: Array[float] = []
var lap_start := 0.0
var coins_got := 0
var rank := 1
var hit_cd := {}

# IA
var lane := 0.0
var lane_target := 0.0
var stuck_t := 0.0
var reverse_t := 0.0
var nitro_think := 0.0
var _brake_lights := false


func max_speed() -> float:
	var m: float = stats["max_speed"] * skill * (0.72 + 0.28 * hp / 100.0)
	if offroad:
		m *= stats["offroad"]
	if nitro_on:
		m *= stats["nitro_power"]
	return m


func speed() -> float:
	return vel.length()


func physics(dt: float, track: Track, race) -> void:
	var c: Vector3 = track.closest(position, track_i)
	track_i = int(c.x)
	track_s = c.y
	track_d = c.z
	offroad = absf(track_d) > Track.HALF + 4

	nitro_on = want_nitro and nitro > 0.0 and spin_t <= 0.0
	if nitro_on:
		nitro = maxf(0.0, nitro - stats["nitro_drain"] * dt)
	var maxs := max_speed()
	var accel: float = stats["accel"] * (2.0 if nitro_on else 1.0)
	var fwd := Vector2.from_angle(rotation)
	var side := Vector2(-fwd.y, fwd.x)
	var vf := vel.dot(fwd)
	var vs := vel.dot(side)
	_brake_lights = false

	if spin_t > 0.0:
		spin_t -= dt
		rotation += spin_dir * 8.0 * dt * clampf(spin_t * 1.6, 0.25, 1.0)
		vel = vel.move_toward(Vector2.ZERO, 420.0 * dt)
	else:
		if throttle > 0.0:
			if vf < maxs:
				var taper := 1.0 - 0.5 * clampf(vf / maxs, 0.0, 1.0)
				vf = minf(vf + accel * throttle * taper * dt, maxs)
			else:
				vf = move_toward(vf, maxs, 260.0 * dt)
		elif throttle < 0.0:
			_brake_lights = true
			if vf > 0.0:
				vf = move_toward(vf, 0.0, 820.0 * -throttle * dt)
			else:
				vf = move_toward(vf, -maxs * 0.35, accel * 0.6 * -throttle * dt)
		else:
			vf = move_toward(vf, 0.0, 150.0 * dt)
		if vf > maxs:
			vf = move_toward(vf, maxs, 300.0 * dt)
		# giro: no se puede girar parado; a alta velocidad gira un poco menos
		var sf := clampf(absf(vf) / 170.0, 0.0, 1.0)
		var hs := lerpf(1.0, 0.75, clampf(absf(vf) / 750.0, 0.0, 1.0))
		rotation += steer * stats["turn"] * sf * hs * signf(vf) * dt
		# agarre lateral; giro fuerte a alta velocidad = derrape
		var grip: float = stats["grip"]
		if offroad:
			grip *= 0.55
		if absf(steer) > 0.75 and vf > maxs * 0.7:
			grip *= 0.35
		vs = move_toward(vs, 0.0, grip * dt)
		vel = fwd * vf + side * vs
	drift = clampf(absf(vs) / 200.0, 0.0, 1.0) if spin_t <= 0.0 else 1.0

	position += vel * dt
	wheel += vf * dt / 60.0
	# salto (topes)
	if hop > 0.0 or hop_v > 0.0:
		hop_v -= 1100.0 * dt
		hop = maxf(0.0, hop + hop_v * dt)
		if hop <= 0.0:
			hop_v = 0.0

	# paredes (fachadas / orilla del parque)
	if absf(track_d) > Track.WALL:
		var n: Vector2 = track.normals[track_i] * signf(track_d)
		position -= n * (absf(track_d) - Track.WALL)
		var vn := vel.dot(n)
		if vn > 0.0:
			vel -= n * vn * 1.5
			vel *= 0.85
			if vn > 160.0:
				damage(vn * 0.025, race)
				if is_player:
					Sfx.play("crash", -6.0 + minf(vn / 100.0, 6.0))
					shake_req = maxf(shake_req, minf(vn / 40.0, 12.0))

	_update_progress(track, race)
	for k in hit_cd.keys():
		hit_cd[k] -= dt
		if hit_cd[k] <= 0.0:
			hit_cd.erase(k)
	queue_redraw()


func _update_progress(track: Track, race) -> void:
	var rel: float = fposmod(track_s - race.start_s, track.length)
	var L: float = track.length
	if prev_rel > L * 0.75 and rel < L * 0.25:
		laps += 1
		if laps >= 1:
			var lt: float = race.race_time - lap_start
			lap_times.append(lt)
			lap_start = race.race_time
			race.on_lap(self, lt)
		else:
			lap_start = race.race_time
	elif prev_rel < L * 0.25 and rel > L * 0.75:
		laps -= 1
	prev_rel = rel
	progress = laps * L + rel


func damage(amount: float, race) -> void:
	hp = maxf(0.0, hp - amount)


func spin(dir: float, time := 0.9) -> void:
	if spin_t > 0.0:
		return
	spin_t = time
	spin_dir = dir


func bump(strength: float) -> void:
	hop_v = strength
	hop = maxf(hop, 0.1)


# ------------------------------------------------------------------ IA
func ai_drive(dt: float, track: Track, race) -> void:
	throttle = 0.6 if finished else 1.0
	var spd := speed()
	# carril preferido + esquivar obstáculos
	var target_lane := lane
	var look := 380.0 + spd * 0.5
	for o in race.obstacles:
		if o.kind == "helados":
			continue
		var ahead: float = track.ahead(track_s, o.ai_s)
		if ahead <= 0.0 or ahead > look:
			continue
		if o.kind == "tope":
			if ahead < 240.0 and spd > 300.0:
				throttle = -0.4
			continue
		var clear: float = o.ai_half + RADIUS + 22.0
		if absf(target_lane - o.ai_d) < clear:
			var left: float = o.ai_d - clear
			var right: float = o.ai_d + clear
			var lim: float = Track.HALF - RADIUS - 6.0
			if absf(left - target_lane) < absf(right - target_lane) and left > -lim:
				target_lane = left
			elif right < lim:
				target_lane = right
			else:
				target_lane = left
	# esquivar a otros tuc tucs justo delante
	for k in race.karts:
		if k == self:
			continue
		var ah: float = track.ahead(track_s, k.track_s)
		if ah > 0.0 and ah < 140.0 and absf(k.track_d - target_lane) < 50.0:
			target_lane += 70.0 if k.track_d < target_lane else -70.0
	var lim2: float = Track.HALF - RADIUS - 8.0
	target_lane = clampf(target_lane, -lim2, lim2)
	lane_target = move_toward(lane_target, target_lane, 380.0 * dt)

	var lead := 170.0 + spd * 0.45
	var target: Vector2 = track.pos_at(track_s + lead, lane_target)
	var want := (target - position).angle()
	var diff := wrapf(want - rotation, -PI, PI)
	steer = clampf(diff * 2.6, -1.0, 1.0)

	# velocidad según la curva que viene
	var curve := absf(track.turn_between(track_s, 260.0 + spd * 0.4))
	var target_speed: float = max_speed() * (1.0 - clampf(curve - 0.35, 0.0, 1.0) * 0.45)
	if throttle > 0.0 and spd > target_speed:
		throttle = 0.0
	if absf(diff) > 1.2 and spd > 250.0:
		throttle = -0.5

	# atascado: retroceder un poco
	if reverse_t > 0.0:
		reverse_t -= dt
		throttle = -1.0
		steer = -steer
	elif spd < 40.0 and race.state == "carrera":
		stuck_t += dt
		if stuck_t > 1.3:
			stuck_t = 0.0
			reverse_t = 0.8
	else:
		stuck_t = 0.0

	# nitro: en rectas y cuando vale la pena
	nitro_think -= dt
	if nitro_think <= 0.0:
		nitro_think = randf_range(0.5, 1.5)
		want_nitro = nitro > 25.0 and curve < 0.25 and randf() < 0.5
	if want_nitro and (nitro <= 0.0 or curve > 0.35):
		want_nitro = false


func _draw() -> void:
	var s := 1.0 + hop * 0.006
	if hop > 0.0:
		draw_set_transform(Vector2(-hop * 0.25, -hop * 0.35), 0, Vector2(s, s))
	if nitro_on:
		var fl := randf_range(0.8, 1.25)
		draw_colored_polygon(PackedVector2Array([Vector2(-30, -8), Vector2(-30 - 34 * fl, 0), Vector2(-30, 8)]), Color("ff7a1a"))
		draw_colored_polygon(PackedVector2Array([Vector2(-30, -4), Vector2(-30 - 20 * fl, 0), Vector2(-30, 4)]), Color("fff3a0"))
	Art.tuctuc(self, body_color, {
		"wheel": wheel, "damage": 1.0 - hp / 100.0, "lights": lights,
		"braking": _brake_lights, "lift": hop * 0.3})
	if hop > 0.0:
		draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
	if is_player:
		# flechita sobre el jugador para encontrarlo fácil
		draw_set_transform(Vector2.ZERO, -rotation, Vector2.ONE / scale)
		var y := -58.0 - absf(sin(wheel * 0.3)) * 4.0
		draw_colored_polygon(PackedVector2Array([Vector2(-11, y - 14), Vector2(11, y - 14), Vector2(0, y)]), Color.WHITE)
		draw_colored_polygon(PackedVector2Array([Vector2(-7, y - 11), Vector2(7, y - 11), Vector2(0, y - 3)]), Color("d62828"))
		draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
