extends Control
## Tabla de posiciones del campeonato (antes de cada carrera y al final).

const UI := preload("res://scripts/ui/ui.gd")
const SkyBg := preload("res://scripts/ui/sky_background.gd")

var main: Node
var _finished := false


func setup(m: Node) -> void:
	main = m


func _ready() -> void:
	# Si venimos de una carrera, la siguiente ya quedó lista (o se acabó).
	var just_raced: bool = Game.last_result.get("mode", "") == "campeonato" and Game.last_result.get("champ_race", -1) == Game.champ_race
	if just_raced:
		Game.last_result["champ_race"] = -99
		_finished = not Game.next_champ_race()
	var sky := SkyBg.new()
	sky.sunset = Game.sunset
	add_child(sky)
	Sfx.refresh_music("menu")
	var center := UI.center_box(self)
	var panel := PanelContainer.new()
	center.add_child(panel)
	var col := UI.vbox(8)
	col.custom_minimum_size = Vector2(640, 0)
	panel.add_child(col)

	var standings := Game.sorted_standings()
	if _finished:
		var champ: String = standings[0]["name"]
		col.add_child(UI.label("¡Campeonato terminado!", 38))
		if champ == Game.PLAYER_NAME:
			col.add_child(UI.label("¡ERES EL CAMPEÓN DE GUASTATOYA!", 30, Color("d62828")))
			col.add_child(UI.label("Bono de campeón: +300 monedas", 24, Color("2e7d32")))
			Game.coins += 300
			Sfx.play("fanfare")
		else:
			col.add_child(UI.label("Campeón: %s" % champ, 30, Color("d62828")))
			col.add_child(UI.label("Bono por participar: +60 monedas", 24, Color("2e7d32")))
			Game.coins += 60
		Game.save_game()
	else:
		var race: Dictionary = Game.CHAMPIONSHIP[Game.champ_race]
		col.add_child(UI.label("Campeonato · Carrera %d de %d" % [Game.champ_race + 1, Game.CHAMPIONSHIP.size()], 34))
		var info := "%s  (%s, %s)" % [race["name"], "atardecer" if race["sunset"] else "de día", "contravía" if race["reverse"] else "sentido normal"]
		col.add_child(UI.label(info, 24, Color("8a4b14")))

	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 40)
	col.add_child(grid)
	for i in standings.size():
		var e: Dictionary = standings[i]
		var c := Color("1e5fa8") if e["name"] == Game.PLAYER_NAME else UI.DARK
		grid.add_child(UI.label("%d°" % (i + 1), 28, c))
		grid.add_child(UI.label(e["name"], 28, c))
		grid.add_child(UI.label("%d pts" % e["points"], 28, c))

	var btns := UI.hbox(14)
	btns.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(btns)
	if _finished:
		btns.add_child(UI.button("Menú", func(): main.goto("menu"), Vector2(220, 70), 28))
		btns.add_child(UI.button("Garaje", func(): main.goto("garaje"), Vector2(220, 70), 28))
	else:
		var go := UI.button("¡Correr!", func(): main.goto("carrera"), Vector2(260, 70), 30)
		UI.color_button(go, Color("ffd34d"))
		btns.add_child(go)
		btns.add_child(UI.button("Salir", func(): main.goto("menu"), Vector2(170, 70), 28))
