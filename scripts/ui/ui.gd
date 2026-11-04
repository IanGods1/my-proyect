extends RefCounted
## Utilidades de interfaz: tema, botones grandes y etiquetas con borde.

const YELLOW := Color("ffd34d")
const RED := Color("d62828")
const GREEN := Color("2e9e46")
const BLUE := Color("1e7fd8")
const DARK := Color("2b1d14")


static func make_theme() -> Theme:
	var t := Theme.new()
	t.default_font_size = 28
	var normal := _box(Color("fff4d6"), Color("8a4b14"))
	var hover := _box(Color("ffe39a"), Color("8a4b14"))
	var pressed := _box(Color("f2b632"), Color("6a3a10"))
	var disabled := _box(Color(0.85, 0.82, 0.76, 0.8), Color(0.5, 0.45, 0.4))
	t.set_stylebox("normal", "Button", normal)
	t.set_stylebox("hover", "Button", hover)
	t.set_stylebox("pressed", "Button", pressed)
	t.set_stylebox("disabled", "Button", disabled)
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	t.set_color("font_color", "Button", DARK)
	t.set_color("font_hover_color", "Button", DARK)
	t.set_color("font_pressed_color", "Button", DARK)
	t.set_color("font_focus_color", "Button", DARK)
	t.set_color("font_disabled_color", "Button", Color(0.4, 0.37, 0.33))
	t.set_color("font_color", "Label", DARK)
	t.set_color("font_color", "CheckButton", DARK)
	t.set_color("font_hover_color", "CheckButton", DARK)
	t.set_color("font_pressed_color", "CheckButton", DARK)
	t.set_color("font_hover_pressed_color", "CheckButton", DARK)
	t.set_color("font_focus_color", "CheckButton", DARK)
	t.set_stylebox("focus", "CheckButton", StyleBoxEmpty.new())
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color(1, 0.97, 0.88, 0.94)
	panel.border_color = Color("8a4b14")
	panel.set_border_width_all(4)
	panel.set_corner_radius_all(22)
	panel.set_content_margin_all(18)
	panel.shadow_color = Color(0, 0, 0, 0.25)
	panel.shadow_size = 8
	panel.shadow_offset = Vector2(0, 5)
	t.set_stylebox("panel", "PanelContainer", panel)
	var grab := StyleBoxFlat.new()
	grab.bg_color = Color("f2b632")
	grab.set_corner_radius_all(8)
	t.set_stylebox("grabber_area", "HSlider", grab)
	t.set_stylebox("grabber_area_highlight", "HSlider", grab)
	var sl := StyleBoxFlat.new()
	sl.bg_color = Color("c9b48a")
	sl.set_corner_radius_all(8)
	sl.content_margin_top = 6
	sl.content_margin_bottom = 6
	t.set_stylebox("slider", "HSlider", sl)
	return t


static func _box(bg: Color, border: Color) -> StyleBoxFlat:
	var b := StyleBoxFlat.new()
	b.bg_color = bg
	b.border_color = border
	b.set_border_width_all(4)
	b.border_width_bottom = 8
	b.set_corner_radius_all(18)
	b.content_margin_left = 22
	b.content_margin_right = 22
	b.content_margin_top = 10
	b.content_margin_bottom = 12
	return b


static func button(text: String, cb: Callable, min_size := Vector2(300, 78), font_size := 30) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	b.add_theme_font_size_override("font_size", font_size)
	b.pressed.connect(func():
		Sfx.play("click")
		cb.call())
	return b


static func color_button(b: Button, bg: Color) -> void:
	var border := bg.darkened(0.55)
	b.add_theme_stylebox_override("normal", _box(bg, border))
	b.add_theme_stylebox_override("hover", _box(bg.lightened(0.15), border))
	b.add_theme_stylebox_override("pressed", _box(bg.darkened(0.15), border))


static func label(text: String, size := 28, color := DARK, outline := 0, outline_color := Color.WHITE) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if outline > 0:
		l.add_theme_constant_override("outline_size", outline)
		l.add_theme_color_override("font_outline_color", outline_color)
	return l


static func title(text: String, size := 54) -> Label:
	var l := label(text, size, YELLOW, 16, DARK)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return l


static func coins_label() -> Label:
	var l := label("Monedas: %d" % Game.coins, 30, YELLOW, 10, DARK)
	return l


## Contenedor centrado a pantalla completa.
static func center_box(parent: Control) -> CenterContainer:
	var c := CenterContainer.new()
	c.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	parent.add_child(c)
	return c


static func vbox(sep := 14) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	return v


static func hbox(sep := 14) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	return h
