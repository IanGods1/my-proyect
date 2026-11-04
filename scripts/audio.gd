extends Node
## Sonido: música, motor del tuc tuc y efectos. Todo sale de assets/audio
## (generado con tools/gen_audio.py).

const SOUNDS := {
	"coin": preload("res://assets/audio/coin.wav"),
	"nitro": preload("res://assets/audio/nitro.wav"),
	"crash": preload("res://assets/audio/crash.wav"),
	"bump": preload("res://assets/audio/bump.wav"),
	"pothole": preload("res://assets/audio/pothole.wav"),
	"horn": preload("res://assets/audio/horn.wav"),
	"beep_low": preload("res://assets/audio/beep_low.wav"),
	"beep_high": preload("res://assets/audio/beep_high.wav"),
	"bark": preload("res://assets/audio/bark.wav"),
	"repair": preload("res://assets/audio/repair.wav"),
	"click": preload("res://assets/audio/click.wav"),
	"fanfare": preload("res://assets/audio/fanfare.wav"),
}
const MUSIC := {
	"race": preload("res://assets/audio/music_race.wav"),
	"menu": preload("res://assets/audio/music_menu.wav"),
}
const ENGINE := preload("res://assets/audio/engine.wav")
const SKID := preload("res://assets/audio/skid.wav")

var _pool: Array[AudioStreamPlayer] = []
var _music: AudioStreamPlayer
var _engine: AudioStreamPlayer
var _skid: AudioStreamPlayer
var _current_music := ""


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for s in [ENGINE, SKID] + MUSIC.values():
		_make_loop(s)
	for i in 8:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_pool.append(p)
	_music = AudioStreamPlayer.new()
	_music.volume_db = -6.0
	add_child(_music)
	_engine = AudioStreamPlayer.new()
	_engine.stream = ENGINE
	_engine.volume_db = -10.0
	add_child(_engine)
	_skid = AudioStreamPlayer.new()
	_skid.stream = SKID
	_skid.volume_db = -80.0
	add_child(_skid)


func _make_loop(s: AudioStream) -> void:
	if s is AudioStreamWAV:
		var w := s as AudioStreamWAV
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_begin = 0
		# 16 bits mono: 2 bytes por muestra. Con compresión QOA el importador
		# ya guarda la cantidad de muestras; usamos la duración por seguridad.
		w.loop_end = int(w.get_length() * w.mix_rate)


func play(name: String, volume_db := 0.0, pitch := 1.0) -> void:
	if not Game.sfx_on or not SOUNDS.has(name):
		return
	for p in _pool:
		if not p.playing:
			p.stream = SOUNDS[name]
			p.volume_db = volume_db
			p.pitch_scale = pitch
			p.play()
			return


func music(name: String) -> void:
	if not Game.music_on:
		stop_music()
		return
	if _current_music == name and _music.playing:
		return
	_current_music = name
	_music.stream = MUSIC[name]
	_music.play()


func stop_music() -> void:
	_current_music = ""
	_music.stop()


func refresh_music(default_name: String) -> void:
	if Game.music_on:
		music(default_name)
	else:
		stop_music()


## speed_frac 0..1+ (más de 1 con turbo). on = el motor está encendido.
func engine(on: bool, speed_frac := 0.0, throttle := 0.0) -> void:
	if not on or not Game.sfx_on:
		if _engine.playing:
			_engine.stop()
		return
	if not _engine.playing:
		_engine.play()
	_engine.pitch_scale = clampf(0.75 + speed_frac * 1.35 + throttle * 0.15, 0.6, 2.8)
	_engine.volume_db = -14.0 + throttle * 4.0 + speed_frac * 3.0


func skid(amount: float) -> void:
	if not Game.sfx_on or amount <= 0.05:
		if _skid.playing:
			_skid.stop()
		return
	if not _skid.playing:
		_skid.play()
	_skid.volume_db = linear_to_db(clampf(amount, 0.0, 1.0) * 0.5)


func stop_loops() -> void:
	_engine.stop()
	_skid.stop()
