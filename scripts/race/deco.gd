extends Node2D
## Nodo de dibujo genérico: llama a `fn(self)` en _draw.
## Así cada adorno es su propio CanvasItem y Godot no dibuja lo que está
## fuera de la cámara.

var fn: Callable


func _draw() -> void:
	if fn.is_valid():
		fn.call(self)
