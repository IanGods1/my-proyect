extends Control
## Ajustes: tipo de control, sensibilidad, música y sonido.

const UI := preload("res://scripts/ui/ui.gd")
const SkyBg := preload("res://scripts/ui/sky_background.gd")

var main: Node
var _ctrl_btn: Button
var _sens_lbl: Label


func setup(m: Node) -> void:
	main = m


func _ready() -> void:
	add_child(SkyBg.new())
	var center := UI.center_box(self)
	var panel := PanelContainer.new()
	center.add_child(panel)
	var col := UI.vbox(10)
	col.custom_minimum_size = Vector2(620, 0)
	panel.add_child(col)
	col.add_child(UI.label("Ajustes", 38))

	_ctrl_btn = UI.button("", _toggle_ctrl, Vector2(600, 64), 26)
	col.add_child(_ctrl_btn)
	col.add_child(_check("Invertir inclinación", Game.tilt_invert, func(v): Game.tilt_invert = v))
	var srow := UI.hbox(12)
	_sens_lbl = UI.label("", 24)
	_sens_lbl.custom_minimum_size = Vector2(260, 0)
	srow.add_child(_sens_lbl)
	var slider := HSlider.new()
	slider.min_value = 0.5
	slider.max_value = 2.0
	slider.step = 0.1
	slider.value = Game.tilt_sens
	slider.custom_minimum_size = Vector2(320, 48)
	slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	slider.value_changed.connect(func(v):
		Game.tilt_sens = v
		_refresh())
	srow.add_child(slider)
	col.add_child(srow)
	col.add_child(_check("Acelerar automático", Game.auto_accel, func(v): Game.auto_accel = v))
	col.add_child(_check("Música", Game.music_on, func(v):
		Game.music_on = v
		Sfx.refresh_music("menu")))
	col.add_child(_check("Efectos de sonido", Game.sfx_on, func(v): Game.sfx_on = v))
	var back := UI.button("Listo", func():
		Game.save_game()
		main.goto("menu"), Vector2(600, 66), 28)
	UI.color_button(back, Color("ffd34d"))
	col.add_child(back)
	_refresh()


func _check(text: String, value: bool, cb: Callable) -> CheckButton:
	var c := CheckButton.new()
	c.text = text
	c.button_pressed = value
	c.add_theme_font_size_override("font_size", 26)
	c.toggled.connect(func(v):
		Sfx.play("click")
		cb.call(v))
	return c


func _toggle_ctrl() -> void:
	Game.control_mode = 1 - Game.control_mode
	_refresh()


func _refresh() -> void:
	_ctrl_btn.text = "Control: " + ("Inclinar el teléfono" if Game.control_mode == 1 else "Botones en pantalla")
	_sens_lbl.text = "Sensibilidad: %.1f" % Game.tilt_sens
