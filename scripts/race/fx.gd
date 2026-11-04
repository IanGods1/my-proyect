extends Node2D
## Efectos: marcas de llanta (debajo de los tuc tucs) y humo/chispas.

const MAX_SKIDS := 500
const MAX_PUFFS := 120

var below := true  # true = capa de marcas, false = capa de humo
var skids: Array = []  # [a, b, alpha]
var puffs: Array = []  # {p, v, life, max, size, col}


func add_skid(a: Vector2, b: Vector2, alpha: float) -> void:
	if a.distance_squared_to(b) < 4.0:
		return
	skids.append([a, b, alpha])
	if skids.size() > MAX_SKIDS:
		skids.pop_front()


func puff(p: Vector2, v: Vector2, size: float, col: Color, life := 0.8) -> void:
	if puffs.size() >= MAX_PUFFS:
		puffs.pop_front()
	puffs.append({"p": p, "v": v, "life": life, "max": life, "size": size, "col": col})


func update(dt: float) -> void:
	var i := 0
	while i < puffs.size():
		var f: Dictionary = puffs[i]
		f["life"] -= dt
		if f["life"] <= 0.0:
			puffs.remove_at(i)
			continue
		f["p"] += f["v"] * dt
		f["v"] *= 0.94
		i += 1
	queue_redraw()


func _draw() -> void:
	if below:
		for s in skids:
			draw_line(s[0], s[1], Color(0.1, 0.1, 0.1, s[2]), 6.0)
	else:
		for f in puffs:
			var k: float = f["life"] / f["max"]
			var c: Color = f["col"]
			draw_circle(f["p"], f["size"] * (1.6 - k * 0.6), Color(c, c.a * k))
