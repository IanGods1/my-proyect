extends Node2D
## Carrera: arma el escenario, los tuc tucs, obstáculos y objetos; controla
## la cuenta regresiva, vueltas, posiciones, cámara, pausa y resultados.

const Track := preload("res://scripts/race/track.gd")
const World := preload("res://scripts/race/world.gd")
const Kart := preload("res://scripts/race/kart.gd")
const Obstacle := preload("res://scripts/race/obstacle.gd")
const Item := preload("res://scripts/race/item.gd")
const Fx := preload("res://scripts/race/fx.gd")
const Hud := preload("res://scripts/race/hud.gd")
const Touch := preload("res://scripts/race/touch_controls.gd")
const UI := preload("res://scripts/ui/ui.gd")

const START_POINT := Vector2(1500, 600)
const H := 210.0

const OBSTACLES := [
	["tope", Vector2(2350, 600), 0.0, "f2c230"],
	["moto", Vector2(2700, 600), 182.0, "d62828"],
	["helados", Vector2(2000, 600), -244.0, "ffffff"],
	["venta", Vector2(3900, 1400), -205.0, "e63946"],
	["perro", Vector2(4150, 1400), 0.0, "a0703a"],
	["pickup", Vector2(4600, 1950), -172.0, "ecebe6"],
	["bache", Vector2(4600, 2350), 70.0, "333333"],
	["tope", Vector2(4600, 2650), 0.0, "f2c230"],
	["pickup_mov", Vector2(4200, 3100), 0.0, "3a6fd1"],
	["moto", Vector2(3700, 3100), 182.0, "2b2b33"],
	["perro", Vector2(3300, 3100), 0.0, "d9b88a"],
	["venta", Vector2(2850, 3100), -205.0, "1982c4"],
	["tope", Vector2(2200, 3100), 0.0, "f2c230"],
	["bache", Vector2(1700, 3100), -60.0, "333333"],
	["venta", Vector2(1350, 3100), -205.0, "ff9f1c"],
	["moto", Vector2(1050, 3100), 182.0, "2e9e46"],
	["helados", Vector2(2500, 3100), -244.0, "ffffff"],
	["bache", Vector2(600, 2600), 50.0, "333333"],
	["pickup", Vector2(600, 2150), 172.0, "c0392b"],
	["perro", Vector2(600, 1500), 0.0, "3a3a3a"],
	["bache", Vector2(600, 1150), -80.0, "333333"],
]

## [tipo, punto, lateral, cantidad, separación]
const ITEMS := [
	["moneda", Vector2(1800, 600), -90.0, 5, 55.0],
	["turbo", Vector2(3300, 1000), -120.0, 1, 0.0],
	["turbo", Vector2(3300, 1000), 0.0, 1, 0.0],
	["turbo", Vector2(3300, 1000), 120.0, 1, 0.0],
	["moneda", Vector2(4300, 1400), 60.0, 5, 55.0],
	["reparacion", Vector2(4600, 2200), -40.0, 1, 0.0],
	["moneda", Vector2(4600, 2480), -90.0, 5, 55.0],
	["turbo", Vector2(3000, 3100), -120.0, 1, 0.0],
	["turbo", Vector2(3000, 3100), 0.0, 1, 0.0],
	["turbo", Vector2(3000, 3100), 120.0, 1, 0.0],
	["moneda", Vector2(2500, 3100), 80.0, 6, 55.0],
	["reparacion", Vector2(1900, 3100), 120.0, 1, 0.0],
	["moneda", Vector2(1500, 3100), 100.0, 5, 55.0],
	["turbo", Vector2(600, 1900), -100.0, 1, 0.0],
	["turbo", Vector2(600, 1900), 0.0, 1, 0.0],
	["turbo", Vector2(600, 1900), 100.0, 1, 0.0],
	["moneda", Vector2(600, 1300), -100.0, 5, 55.0],
	["reparacion", Vector2(600, 1000), 0.0, 1, 0.0],
]

var main: Node
var track: Track  # pista en el sentido de la carrera
var fwd: Track  # pista en sentido normal
var start_s := 0.0
var world: Node2D
var fx_below
var fx_above
var karts: Array = []
var player = null
var obstacles: Array = []
var items: Array = []
var cam: Camera2D
var hud
var touch
var pause_layer: CanvasLayer
var state := "intro"  # intro, cuenta, carrera, fin
var state_t := 0.0
var race_time := 0.0
var time_trial := false
var sunset := false
var record := {}
var title_text := ""
var sub_text := ""
var shake := 0.0
var finish_order: Array = []
var autoplay := false
var autoplay_hide_touch := false
var _count_last := -1
var _nitro_was := false
var _horn_was := false
var _offroad_msg_cd := 0.0
var _results_done := false


func setup(m: Node) -> void:
	main = m


func _ready() -> void:
	autoplay = "--autoplay" in OS.get_cmdline_user_args()
	autoplay_hide_touch = "--no-touch" in OS.get_cmdline_user_args()
	time_trial = Game.mode == "contrarreloj"
	sunset = Game.sunset
	record = Game.get_record()
	fwd = Track.new(false)
	track = Track.new(true) if Game.reverse else fwd
	start_s = track.closest(START_POINT).y
	var fwd_start: float = fwd.closest(START_POINT).y

	world = World.new()
	add_child(world)
	world.build(fwd, fwd_start)
	_spawn_obstacles()
	_spawn_items()
	fx_below = Fx.new()
	fx_below.z_index = 4
	add_child(fx_below)
	_spawn_karts()
	fx_above = Fx.new()
	fx_above.below = false
	fx_above.z_index = 8
	add_child(fx_above)

	if sunset:
		var cm := CanvasModulate.new()
		cm.color = Color(1.0, 0.8, 0.62)
		add_child(cm)

	cam = Camera2D.new()
	cam.position = Vector2(2600, 1850)
	cam.zoom = Vector2(0.2, 0.2)
	add_child(cam)
	cam.make_current()

	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)
	var ui_root := Control.new()
	ui_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui_root.theme = main.theme if main else null
	layer.add_child(ui_root)
	hud = Hud.new()
	hud.race = self
	ui_root.add_child(hud)
	hud.setup_map(track)
	touch = Touch.new()
	ui_root.add_child(touch)
	var pause_btn := UI.button("II", _pause, Vector2(76, 64), 30)
	pause_btn.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	pause_btn.offset_left = -92
	pause_btn.offset_top = 12
	pause_btn.offset_right = -16
	ui_root.add_child(pause_btn)
	_build_pause_menu()

	if time_trial:
		title_text = "Contrarreloj · 3 vueltas"
	elif Game.mode == "campeonato":
		title_text = "Campeonato %d/%d: %s" % [Game.champ_race + 1, Game.CHAMPIONSHIP.size(), Game.CHAMPIONSHIP[Game.champ_race]["name"]]
	else:
		title_text = "Carrera rápida · 3 vueltas"
	sub_text = "Parque Central de Guastatoya · %s · %s" % [
		"atardecer" if sunset else "de día", "contravía" if Game.reverse else "sentido normal"]
	Sfx.refresh_music("race")


# ------------------------------------------------------------------ armado
func _spawn_obstacles() -> void:
	for o in OBSTACLES:
		var ob := Obstacle.new()
		var s: float = fwd.closest(o[1]).y
		add_child(ob)
		ob.setup(o[0], fwd, track, s, o[2], Color(o[3]))
		obstacles.append(ob)


func _spawn_items() -> void:
	for e in ITEMS:
		var s0: float = fwd.closest(e[1]).y
		for k in int(e[3]):
			var it := Item.new()
			it.kind = e[0]
			it.position = fwd.pos_at(s0 + (k - (e[3] - 1) / 2.0) * e[4], e[2])
			add_child(it)
			items.append(it)


func _spawn_karts() -> void:
	var lineup := []
	if not time_trial:
		for r in Game.RIVALS:
			lineup.append(r)
	# el jugador sale en 5° lugar (o solo en contrarreloj)
	var player_slot := mini(4, lineup.size())
	lineup.insert(player_slot, {"name": Game.PLAYER_NAME, "color": Game.player_color(), "skill": 1.0, "player": true})
	var ai_level := clampf((Game.upgrades["motor"] + Game.upgrades["llantas"]) / 2.0 + (Game.champ_race if Game.mode == "campeonato" else 0) * 0.5, 0.0, 5.0)
	for i in lineup.size():
		var e: Dictionary = lineup[i]
		var k := Kart.new()
		k.racer_name = e["name"]
		k.body_color = e["color"]
		k.is_player = e.get("player", false)
		if k.is_player:
			k.stats = Game.player_stats()
			k.skill = 1.0
		else:
			k.stats = Game.make_stats(ai_level, ai_level, ai_level)
			k.skill = e["skill"]
			k.lane = [-90.0, 60.0, -30.0, 100.0, 0.0][i % 5]
			k.lane_target = k.lane
		k.lights = sunset
		k.z_index = 5
		k.scale = Vector2(1.2, 1.2)
		var row := i / 2
		var col := i % 2
		var s := start_s - 110.0 - row * 120.0 - col * 40.0
		var d := -75.0 if col == 0 else 75.0
		k.position = track.pos_at(s, d)
		k.rotation = track.dir_at(s).angle()
		var c: Vector3 = track.closest(k.position)
		k.track_i = int(c.x)
		k.track_s = c.y
		k.prev_rel = fposmod(c.y - start_s, track.length)
		k.progress = k.prev_rel - track.length
		add_child(k)
		karts.append(k)
		if k.is_player:
			player = k


func _build_pause_menu() -> void:
	pause_layer = CanvasLayer.new()
	pause_layer.layer = 10
	pause_layer.process_mode = Node.PROCESS_MODE_ALWAYS
	pause_layer.visible = false
	add_child(pause_layer)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if main:
		root.theme = main.theme
	pause_layer.add_child(root)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.5)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(dim)
	var center := UI.center_box(root)
	var panel := PanelContainer.new()
	center.add_child(panel)
	var col := UI.vbox(14)
	panel.add_child(col)
	var t := UI.label("Pausa", 44)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(t)
	var cont := UI.button("Continuar", _resume, Vector2(380, 76))
	UI.color_button(cont, Color("ffd34d"))
	col.add_child(cont)
	col.add_child(UI.button("Reiniciar carrera", func(): main.goto("carrera"), Vector2(380, 76)))
	col.add_child(UI.button("Salir al menú", func(): main.goto("menu"), Vector2(380, 76)))


func _pause() -> void:
	if state == "fin" and _results_done:
		return
	get_tree().paused = true
	pause_layer.visible = true
	touch.release_all()
	Sfx.stop_loops()


func _resume() -> void:
	pause_layer.visible = false
	get_tree().paused = false


func on_back() -> void:
	if pause_layer.visible:
		_resume()
	else:
		_pause()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		if is_inside_tree() and state != "intro" and pause_layer and not pause_layer.visible:
			_pause()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pausa"):
		on_back()
	elif state == "intro" and (event is InputEventScreenTouch and event.pressed):
		state_t = maxf(state_t, 2.2)


# ------------------------------------------------------------------ bucle
func _physics_process(dt: float) -> void:
	state_t += dt
	_offroad_msg_cd -= dt
	match state:
		"intro":
			if state_t > 3.2 or autoplay:
				_set_state("cuenta")
		"cuenta":
			var n := 3 - int(state_t)
			if n != _count_last and n >= 1:
				_count_last = n
				hud.show_big(str(n), 0.9)
				Sfx.play("beep_low")
			if state_t >= 3.0:
				hud.show_big("¡YA!", 1.0)
				Sfx.play("beep_high")
				_set_state("carrera")
		"carrera":
			race_time += dt
		"fin":
			race_time += dt
			if not _results_done and (state_t > 5.0 or _all_finished()):
				_finish_race()

	for o in obstacles:
		o.update(dt, self)
	for it in items:
		it.update(dt)

	if state == "carrera" or state == "fin":
		_control_player(dt)
		for k in karts:
			if not k.is_player:
				k.ai_drive(dt, track, self)
		for k in karts:
			k.physics(dt, track, self)
		_collide_karts()
		_collide_world()
		_effects(dt)
		_update_ranks()
	else:
		for k in karts:
			k.queue_redraw()
	fx_below.update(dt)
	fx_above.update(dt)
	_update_camera(dt)
	_update_audio()
	touch.nitro_frac = player.nitro / 100.0
	touch.visible = state != "intro" and not autoplay_hide_touch


func _set_state(s: String) -> void:
	state = s
	state_t = 0.0


func _control_player(dt: float) -> void:
	if autoplay or player.finished:
		player.ai_drive(dt, track, self)
		if player.finished:
			player.throttle = 0.5
		return
	var acc: bool = touch.is_down("acelerar") or Input.is_action_pressed("acelerar") or Game.auto_accel
	var brk: bool = touch.is_down("frenar") or Input.is_action_pressed("frenar")
	player.throttle = -1.0 if brk else (1.0 if acc else 0.0)
	player.steer = touch.steer_value()
	player.want_nitro = touch.is_down("turbo") or Input.is_action_pressed("turbo")
	var horn: bool = touch.is_down("pito") or Input.is_action_pressed("pito")
	if horn and not _horn_was:
		Sfx.play("horn")
		# los de adelante se hacen a un lado
		for k in karts:
			if k != player and k.position.distance_to(player.position) < 320.0:
				k.lane = clampf(k.lane + (90.0 if k.track_d > player.track_d else -90.0), -150.0, 150.0)
	_horn_was = horn


func _collide_karts() -> void:
	var r2: float = Kart.RADIUS * 2.0
	for i in karts.size():
		var a = karts[i]
		for j in range(i + 1, karts.size()):
			var b = karts[j]
			var d: Vector2 = b.position - a.position
			var dist := d.length()
			if dist >= r2 or dist < 0.01:
				continue
			var n := d / dist
			var overlap := r2 - dist
			a.position -= n * overlap * 0.5
			b.position += n * overlap * 0.5
			var rv: float = (b.vel - a.vel).dot(n)
			if rv < 0.0:
				var jimp := -(1.0 + 0.5) * rv * 0.5
				a.vel -= n * jimp
				b.vel += n * jimp
				var impact := -rv
				if impact > 220.0:
					a.damage(impact * 0.015, self)
					b.damage(impact * 0.015, self)
					if a.is_player or b.is_player:
						Sfx.play("crash", -8.0)
						shake = maxf(shake, 5.0)
				if impact > 420.0:
					a.spin(-1.0, 0.6)
					b.spin(1.0, 0.6)


func _collide_world() -> void:
	for k in karts:
		for o in obstacles:
			if o.position.distance_squared_to(k.position) > 230.0 * 230.0:
				continue
			var circles: Array = o.solid_circles()
			if circles.is_empty():
				if k.hit_cd.has(o):
					continue
				if o.check_trigger(k):
					k.hit_cd[o] = 1.2
					_trigger(k, o)
				continue
			for c in circles:
				var d: Vector2 = k.position - c[0]
				var dist := d.length()
				var min_d: float = c[1] + Kart.RADIUS
				if dist >= min_d or dist < 0.01:
					continue
				var n := d / dist
				k.position += n * (min_d - dist)
				var vn: float = k.vel.dot(n)
				if vn < 0.0:
					k.vel -= n * vn * 1.6
					k.vel *= 0.8
					var impact := -vn
					if impact > 140.0:
						k.damage(impact * 0.04, self)
						if k.is_player:
							Sfx.play("crash", -4.0)
							shake = maxf(shake, minf(impact / 35.0, 14.0))
							if impact > 300.0:
								hud.show_msg(_crash_text(o.kind), Color("ff7a5a"))
						for q in 6:
							fx_above.puff(c[0] + n * c[1], Vector2.from_angle(randf() * TAU) * 120.0, 6.0, Color("ffd34d"), 0.3)
					if impact > 360.0:
						k.spin(1.0 if randf() < 0.5 else -1.0, 0.8)
		# objetos
		for it in items:
			if not it.active:
				continue
			if it.position.distance_squared_to(k.position) > 44.0 * 44.0:
				continue
			match it.kind:
				"moneda":
					if not k.is_player:
						continue
					k.coins_got += 5
					Sfx.play("coin", -4.0, randf_range(0.95, 1.1))
				"turbo":
					k.nitro = minf(100.0, k.nitro + 45.0)
					if k.is_player:
						Sfx.play("repair", -6.0, 1.4)
						hud.show_msg("¡TURBO! (+nitro)", Color("8fd0ff"))
				"reparacion":
					if k.hp >= 100.0 and not k.is_player:
						continue
					k.hp = minf(100.0, k.hp + 40.0)
					if k.is_player:
						Sfx.play("repair")
						hud.show_msg("¡Tuc tuc reparado!", Color("a6f0a0"))
			it.take()


func _crash_text(kind: String) -> String:
	match kind:
		"moto":
			return "¡Chocaste una moto!"
		"pickup", "pickup_mov":
			return "¡Pura pickup!"
		"venta":
			return "¡Cuidado con la venta!"
		"helados":
			return "¡El carrito de helados!"
	return "¡Chocaste!"


func _trigger(k, o) -> void:
	var spd: float = k.speed()
	match o.kind:
		"tope":
			if spd > 200.0:
				k.bump(minf(spd * 0.55, 330.0))
				if spd > 330.0:
					k.vel *= 0.72
				if spd > 430.0:
					k.damage(5.0, self)
				if k.is_player:
					Sfx.play("bump")
					shake = maxf(shake, 6.0)
					if spd > 330.0:
						hud.show_msg("¡TOPE! Más despacio...", Color("ffd34d"))
			else:
				k.bump(70.0)
		"bache":
			k.vel *= 0.7
			k.rotation += randf_range(-0.3, 0.3)
			k.damage(7.0, self)
			k.bump(110.0)
			if k.is_player:
				Sfx.play("pothole")
				shake = maxf(shake, 8.0)
				hud.show_msg("¡Bache!", Color("ffb38a"))
		"perro":
			k.vel *= 0.45
			k.spin(1.0 if randf() < 0.5 else -1.0, 0.7)
			k.damage(3.0, self)
			o.scare_dog(k.position)
			if k.is_player:
				shake = maxf(shake, 5.0)
				hud.show_msg("¡Cuidado con el chucho!", Color("ffd34d"))


func _effects(dt: float) -> void:
	for k in karts:
		var spd: float = k.speed()
		var f := Vector2.from_angle(k.rotation)
		var sd := Vector2(-f.y, f.x)
		if k.drift > 0.35 and spd > 120.0 and k.hop <= 0.0:
			var prev_l: Vector2 = k.get_meta("skid_l", Vector2.ZERO)
			var prev_r: Vector2 = k.get_meta("skid_r", Vector2.ZERO)
			var l: Vector2 = k.position - f * 18 - sd * 22
			var r: Vector2 = k.position - f * 18 + sd * 22
			if prev_l != Vector2.ZERO and prev_l.distance_to(l) < 40.0:
				fx_below.add_skid(prev_l, l, 0.35 * k.drift)
				fx_below.add_skid(prev_r, r, 0.35 * k.drift)
			k.set_meta("skid_l", l)
			k.set_meta("skid_r", r)
			if randf() < 0.3:
				fx_above.puff(k.position - f * 30, -k.vel * 0.1, 8.0, Color(0.9, 0.9, 0.9, 0.5), 0.5)
		else:
			k.set_meta("skid_l", Vector2.ZERO)
		if k.offroad and spd > 150.0 and randf() < 0.35:
			fx_above.puff(k.position - f * 30, -k.vel * 0.15, 9.0, Color(0.8, 0.7, 0.5, 0.5), 0.6)
		if k.hp < 40.0 and randf() < 0.25:
			fx_above.puff(k.position + f * 18, Vector2(randf_range(-20, 20), -40), 10.0, Color(0.3, 0.3, 0.3, 0.55), 1.0)
		if k.nitro_on and randf() < 0.5:
			fx_above.puff(k.position - f * 40, -f * 80.0, 7.0, Color(1.0, 0.6, 0.2, 0.6), 0.35)
	if player.offroad and _offroad_msg_cd <= 0.0 and player.speed() > 200.0 and state == "carrera":
		_offroad_msg_cd = 5.0
		hud.show_msg("¡Regresa a la calle!", Color.WHITE, 1.0)
	if player.nitro_on and not _nitro_was:
		Sfx.play("nitro")
		shake = maxf(shake, 4.0)
	_nitro_was = player.nitro_on


func _update_ranks() -> void:
	var order := karts.duplicate()
	order.sort_custom(func(a, b):
		if a.finished != b.finished:
			return a.finished
		if a.finished:
			return a.finish_time < b.finish_time
		return a.progress > b.progress)
	for i in order.size():
		order[i].rank = i + 1


func on_lap(k, lap_time: float) -> void:
	if k.finished:
		return
	if k.laps >= Game.LAPS:
		k.finished = true
		k.finish_time = race_time
		finish_order.append(k)
		if k.is_player:
			_set_state("fin")
			hud.show_big("¡META!", 2.0)
			Sfx.play("fanfare")
			Sfx.play("horn")
		return
	if k.is_player:
		if k.laps == Game.LAPS - 1:
			hud.show_msg("¡ÚLTIMA VUELTA!  " + Game.format_time(lap_time), Color("ffd34d"), 2.2)
		else:
			hud.show_msg("Vuelta %d: %s" % [k.laps, Game.format_time(lap_time)], Color.WHITE, 2.0)


func _all_finished() -> bool:
	for k in karts:
		if not k.finished:
			return false
	return true


func _update_camera(dt: float) -> void:
	var center := Vector2(2600, 1850)
	if state == "intro":
		var t := clampf((state_t - 1.2) / 2.0, 0.0, 1.0)
		var e := t * t * (3.0 - 2.0 * t)
		cam.position = center.lerp(player.position, e)
		var z := lerpf(0.2, 0.85, e)
		cam.zoom = Vector2(z, z)
		return
	var spd_frac: float = clampf(player.speed() / 650.0, 0.0, 1.2)
	var target: Vector2 = player.position + player.vel * 0.38
	cam.position = cam.position.lerp(target, 1.0 - exp(-5.0 * dt))
	var zt := 0.88 - 0.14 * spd_frac
	var z2 := lerpf(cam.zoom.x, zt, 1.0 - exp(-2.0 * dt))
	cam.zoom = Vector2(z2, z2)
	shake = maxf(shake, player.shake_req)
	player.shake_req = 0.0
	if shake > 0.1:
		cam.offset = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * shake
		shake = move_toward(shake, 0.0, 30.0 * dt)
	else:
		cam.offset = Vector2.ZERO


func _update_audio() -> void:
	var running := state != "intro" and not (state == "fin" and _results_done)
	var base: float = player.stats["max_speed"]
	Sfx.engine(running, player.speed() / base, maxf(player.throttle, 0.0))
	Sfx.skid(player.drift if player.speed() > 150.0 and running else 0.0)


# ------------------------------------------------------------------ final
func _finish_race() -> void:
	_results_done = true
	Sfx.stop_loops()
	var L: float = track.length
	# los que no terminaron: tiempo estimado según lo que les falta
	var rest := []
	for k in karts:
		if not k.finished:
			var remaining: float = Game.LAPS * L - k.progress
			var avg: float = k.stats["max_speed"] * k.skill * 0.8
			k.finish_time = race_time + maxf(0.0, remaining) / avg
			rest.append(k)
	rest.sort_custom(func(a, b): return a.finish_time < b.finish_time)
	var order := finish_order + rest
	var rows := []
	var player_pos := 1
	for i in order.size():
		var k = order[i]
		rows.append({"pos": i + 1, "name": k.racer_name, "color": k.body_color, "time": k.finish_time, "is_player": k.is_player})
		if k.is_player:
			player_pos = i + 1
	var result := {
		"mode": Game.mode, "rows": rows, "player_pos": player_pos,
		"coins_picked": player.coins_got, "total": player.finish_time,
		"laps": player.lap_times.duplicate(), "champ_race": Game.champ_race,
	}
	var best_lap := 0.0
	for lt in player.lap_times:
		if best_lap == 0.0 or lt < best_lap:
			best_lap = lt
	result["best_lap"] = best_lap
	var prize := 0
	if time_trial:
		prize = 40
		var rec: Dictionary = Game.get_record().duplicate()
		var new_rec := false
		if rec.get("total", 0.0) == 0.0 or player.finish_time < rec["total"]:
			rec["total"] = player.finish_time
			new_rec = true
		if best_lap > 0.0 and (rec.get("lap", 0.0) == 0.0 or best_lap < rec["lap"]):
			rec["lap"] = best_lap
			new_rec = true
		if new_rec:
			prize += 60
		Game.records[Game.record_key()] = rec
		result["new_record"] = new_rec
	else:
		prize = Game.PRIZES[player_pos - 1]
		if Game.mode == "campeonato":
			for i in order.size():
				var nm: String = order[i].racer_name
				Game.champ_points[nm] = Game.champ_points.get(nm, 0) + Game.POINTS[i]
	result["prize"] = prize
	Game.coins += player.coins_got + prize
	Game.last_result = result
	Game.save_game()
	if "--quit-after-race" in OS.get_cmdline_user_args():
		print("RESULTADO: ", JSON.stringify(result))
		get_tree().quit()
		return
	main.goto("resultados")
