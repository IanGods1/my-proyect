extends Node2D
## Objetos para recoger: "turbo" (nitro), "moneda" y "reparacion".

const Art := preload("res://scripts/art.gd")
const RESPAWN := 9.0

var kind := "moneda"
var active := true
var timer := 0.0
var t := 0.0


func _ready() -> void:
	t = randf() * 3.0
	z_index = 3


func update(dt: float) -> void:
	t += dt
	if not active:
		timer -= dt
		if timer <= 0:
			active = true
			visible = true
	queue_redraw()


func take() -> void:
	active = false
	visible = false
	timer = RESPAWN


func _draw() -> void:
	var bob := sin(t * 4.0) * 3.0
	match kind:
		"moneda":
			var sx := absf(cos(t * 3.0)) * 0.8 + 0.2
			draw_circle(Vector2(3, 5), 14, Color(0, 0, 0, 0.2))
			draw_set_transform(Vector2(0, bob), 0, Vector2(sx, 1))
			draw_circle(Vector2.ZERO, 15, Color("b8860b"))
			draw_circle(Vector2.ZERO, 12, Color("ffd34d"))
			draw_rect(Rect2(-2, -7, 4, 14), Color("b8860b"))
			draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
		"turbo":
			_box(bob, Color("1e7fd8"), Color("8fd0ff"))
			# rayo
			var pts := PackedVector2Array([Vector2(4, -16 + bob), Vector2(-8, 2 + bob), Vector2(0, 2 + bob),
				Vector2(-4, 16 + bob), Vector2(8, -2 + bob), Vector2(0, -2 + bob)])
			draw_colored_polygon(pts, Color("ffe14d"))
		"reparacion":
			_box(bob, Color("2e9e46"), Color("a6f0a0"))
			draw_rect(Rect2(-4, -13 + bob, 8, 26), Color.WHITE)
			draw_rect(Rect2(-13, -4 + bob, 26, 8), Color.WHITE)


func _box(bob: float, c: Color, glow: Color) -> void:
	draw_circle(Vector2(0, 0), 30 + sin(t * 6.0) * 3.0, Color(glow, 0.25))
	draw_colored_polygon(Art.rrect(Rect2(-20 + 4, -20 + 6, 40, 40), 8), Color(0, 0, 0, 0.25))
	draw_set_transform(Vector2(0, bob), sin(t * 2.0) * 0.15, Vector2.ONE)
	Art.shape(self, Art.rrect(Rect2(-20, -20, 40, 40), 8), c, c.darkened(0.5), 3)
	draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
