extends Control
## Indicadores en pantalla: posición, vuelta, tiempo, monedas, velocidad,
## barras de daño y turbo, minimapa y mensajes.

var race
var msg := ""
var msg_t := 0.0
var msg_col := Color.WHITE
var big := ""
var big_t := 0.0
var _map_pts := PackedVector2Array()
var _map_rect := Rect2()
var _map_scale := 1.0
var _map_origin := Vector2.ZERO


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func setup_map(track) -> void:
	var mn := Vector2(INF, INF)
	var mx := Vector2(-INF, -INF)
	for p in track.pts:
		mn = mn.min(p)
		mx = mx.max(p)
	_map_origin = mn
	_map_scale = minf(220.0 / (mx.x - mn.x), 150.0 / (mx.y - mn.y))
	_map_pts = PackedVector2Array()
	for i in range(0, track.n, 4):
		_map_pts.append((track.pts[i] - mn) * _map_scale)
	_map_pts.append(_map_pts[0])


func show_msg(text: String, col := Color.WHITE, time := 1.6) -> void:
	msg = text
	msg_t = time
	msg_col = col


func show_big(text: String, time := 0.9) -> void:
	big = text
	big_t = time


func _process(delta: float) -> void:
	msg_t -= delta
	big_t -= delta
	queue_redraw()


func _panel(r: Rect2) -> void:
	draw_rect(Rect2(r.position + Vector2(0, 4), r.size), Color(0, 0, 0, 0.25))
	draw_rect(r, Color(0.13, 0.09, 0.06, 0.62))


func _text(p: Vector2, t: String, fs: int, c := Color.WHITE, center := false) -> void:
	var font := ThemeDB.fallback_font
	if center:
		p.x -= font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x / 2
	draw_string_outline(font, p, t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, maxi(4, fs / 6), Color(0, 0, 0, 0.75))
	draw_string(font, p, t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, c)


func _draw() -> void:
	if race == null or race.player == null:
		return
	var p = race.player
	var w := size.x
	var h := size.y
	if race.sunset:
		# brillo dorado del atardecer
		for i in 8:
			draw_rect(Rect2(0, i * 18, w, 18), Color(1, 0.65, 0.2, 0.12 * (1.0 - i / 8.0)))
	# ---- arriba a la izquierda: posición / vuelta / tiempo
	_panel(Rect2(14, 12, 330, 132))
	if race.time_trial:
		_text(Vector2(28, 50), "CONTRA", 26, Color("ffd34d"))
		_text(Vector2(28, 80), "RELOJ", 26, Color("ffd34d"))
	else:
		_text(Vector2(28, 66), "%d°" % p.rank, 60, Color("ffd34d"))
		_text(Vector2(110, 66), "/ %d" % race.karts.size(), 30)
	var lap := clampi(p.laps + 1, 1, Game.LAPS)
	_text(Vector2(190, 52), "VUELTA", 20)
	_text(Vector2(190, 84), "%d/%d" % [lap, Game.LAPS], 32)
	_text(Vector2(28, 128), Game.format_time(p.finish_time if p.finished else race.race_time), 30)
	if race.time_trial:
		var rec: Dictionary = race.record
		_text(Vector2(190, 128), "Réc " + Game.format_time(rec.get("total", 0.0)), 20, Color("bfe6ff"))
	# ---- monedas
	_panel(Rect2(14, 152, 200, 44))
	draw_circle(Vector2(38, 174), 13, Color("ffd34d"))
	draw_circle(Vector2(38, 174), 9, Color("f2b632"))
	_text(Vector2(60, 186), "%d" % p.coins_got, 28, Color("ffd34d"))
	# ---- velocidad y barras (abajo al centro)
	var bx := w * 0.5 - 170
	var by := h - 92
	_panel(Rect2(bx, by, 340, 80))
	var kmh := int(p.speed() * 0.12)
	_text(Vector2(bx + 14, by + 50), "%d" % kmh, 40)
	_text(Vector2(bx + 14, by + 72), "km/h", 16)
	_bar(Rect2(bx + 110, by + 12, 215, 22), p.hp / 100.0, Color("4cd964") if p.hp > 40 else Color("ff3b30"), "DAÑO" if p.hp < 100 else "TUC TUC OK")
	_bar(Rect2(bx + 110, by + 46, 215, 22), p.nitro / 100.0, Color("3fa9f5"), "TURBO")
	# ---- minimapa (arriba a la derecha, debajo de pausa)
	var mp := Vector2(w - 250, 96)
	_panel(Rect2(mp - Vector2(14, 14), Vector2(248, 178)))
	draw_set_transform(mp, 0, Vector2.ONE)
	draw_polyline(_map_pts, Color(0.95, 0.95, 0.9, 0.9), 7)
	draw_polyline(_map_pts, Color(0.35, 0.35, 0.4, 1), 3)
	var sp: Vector2 = (race.track.point_at(race.start_s) - _map_origin) * _map_scale
	draw_circle(sp, 5, Color.WHITE)
	for k in race.karts:
		var kp: Vector2 = (k.position - _map_origin) * _map_scale
		if k == p:
			continue
		draw_circle(kp, 6, Color(0, 0, 0, 0.6))
		draw_circle(kp, 4.5, k.body_color)
	var pp: Vector2 = (p.position - _map_origin) * _map_scale
	draw_circle(pp, 9, Color.WHITE)
	draw_circle(pp, 6.5, Color("d62828"))
	draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
	# ---- mensajes
	if msg_t > 0.0:
		var a := clampf(msg_t * 2.0, 0.0, 1.0)
		_text(Vector2(w / 2, h * 0.3), msg, 40, Color(msg_col, a), true)
	if big_t > 0.0:
		var s := 120 + int((1.0 - clampf(big_t, 0, 1)) * 40)
		_text(Vector2(w / 2, h * 0.36 + s * 0.3), big, s, Color("ffd34d"), true)
	if race.state == "intro":
		_panel(Rect2(w / 2 - 330, h - 210, 660, 100))
		_text(Vector2(w / 2, h - 168), race.title_text, 34, Color("ffd34d"), true)
		_text(Vector2(w / 2, h - 128), race.sub_text, 24, Color.WHITE, true)


func _bar(r: Rect2, frac: float, col: Color, label: String) -> void:
	draw_rect(r, Color(0, 0, 0, 0.5))
	draw_rect(Rect2(r.position, Vector2(r.size.x * clampf(frac, 0, 1), r.size.y)), col)
	draw_rect(r, Color(1, 1, 1, 0.6), false, 2)
	_text(r.position + Vector2(8, 18), label, 16)
