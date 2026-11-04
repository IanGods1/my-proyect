#!/usr/bin/env python3
"""Genera todos los sonidos y la música del juego (WAV mono 16 bits, 22050 Hz).

No necesita archivos externos: todo se sintetiza con numpy.
Uso:  python3 tools/gen_audio.py      (escribe en assets/audio/)
"""
import os
import wave

import numpy as np

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "audio")
rng = np.random.default_rng(7)


def save(name, data, peak=0.9):
    data = np.asarray(data, dtype=np.float64)
    m = np.max(np.abs(data)) or 1.0
    data = data / m * peak
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    path = os.path.join(OUT, name + ".wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"{name}.wav  {len(pcm) / SR:.2f}s")


def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def env_exp(sec, decay):
    t = t_axis(sec)
    return np.exp(-t / decay)


def note_freq(midi):
    return 440.0 * 2 ** ((midi - 69) / 12.0)


def lowpass(x, alpha):
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y


# ---------------------------------------------------------------- motor
def engine_loop():
    # Motor de dos tiempos de mototaxi: pulsos de explosión a ~38 Hz con
    # ruido filtrado. Se reproduce en bucle y el juego cambia el tono.
    sec = 1.0
    t = t_axis(sec)
    f = 38.0  # 38 ciclos exactos en 1 s -> bucle perfecto
    phase = (t * f) % 1.0
    pulse = np.exp(-phase * 9.0)
    tone = np.sin(2 * np.pi * f * 2 * t) * 0.35 + np.sin(2 * np.pi * f * 3 * t) * 0.15
    noise = rng.uniform(-1, 1, len(t))
    noise = lowpass(noise, 0.18)
    sig = pulse * (0.7 + 0.6 * noise) + tone * (0.4 + 0.6 * pulse)
    # rasposo
    sig = np.tanh(sig * 2.2)
    return sig


# ---------------------------------------------------------------- efectos
def coin():
    out = []
    for m, d in ((88, 0.07), (95, 0.22)):
        t = t_axis(d)
        f = note_freq(m)
        sq = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * t) * 0.5
        out.append(sq * np.exp(-t / (d * 0.6)))
    return np.concatenate(out)


def nitro():
    t = t_axis(0.9)
    noise = rng.uniform(-1, 1, len(t))
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 900 * t) / SR)
    env = np.minimum(t / 0.05, 1) * np.exp(-t / 0.5)
    return (lowpass(noise, 0.35) * 0.8 + sweep * 0.4) * env


def crash():
    t = t_axis(0.55)
    noise = rng.uniform(-1, 1, len(t))
    thump = np.sin(2 * np.pi * (90 - 50 * t) * t)
    metal = np.sin(2 * np.pi * 523 * t) * np.sin(2 * np.pi * 777 * t)
    return (noise * 0.7 + thump * 0.9 + metal * 0.4) * np.exp(-t / 0.13)


def bump():
    t = t_axis(0.35)
    thump = np.sin(2 * np.pi * (110 - 120 * t) * t)
    rattle = rng.uniform(-1, 1, len(t)) * (np.sin(2 * np.pi * 30 * t) > 0)
    return (thump + rattle * 0.25) * np.exp(-t / 0.09)


def pothole():
    t = t_axis(0.3)
    thump = np.sin(2 * np.pi * (70 - 60 * t) * t)
    return (thump + lowpass(rng.uniform(-1, 1, len(t)), 0.2) * 0.6) * np.exp(-t / 0.08)


def horn():
    # Pito de tuc tuc: "piii-piii"
    out = []
    for d in (0.16, 0.06, 0.22):
        t = t_axis(d)
        if len(out) % 2 == 1:
            out.append(np.zeros(len(t)))
            continue
        f = 620
        s = np.sign(np.sin(2 * np.pi * f * t)) * 0.6 + np.sign(np.sin(2 * np.pi * f * 1.26 * t)) * 0.4
        out.append(lowpass(s, 0.5) * np.minimum(1, (d - t) / 0.01))
    return np.concatenate(out)


def beep(m, d):
    t = t_axis(d)
    f = note_freq(m)
    return np.sign(np.sin(2 * np.pi * f * t)) * np.minimum(1, (d - t) / 0.03) * 0.7


def bark():
    # "¡Guau!" caricaturesco
    out = []
    for rep in range(2):
        t = t_axis(0.16)
        f = 420 - 900 * t
        ph = np.cumsum(f) / SR
        s = np.sign(np.sin(2 * np.pi * ph)) * 0.5 + np.sin(2 * np.pi * ph * 2) * 0.3
        s += rng.uniform(-1, 1, len(t)) * 0.25
        out.append(lowpass(s, 0.4) * np.sin(np.pi * t / 0.16))
        out.append(np.zeros(int(0.07 * SR)))
    return np.concatenate(out)


def repair():
    out = []
    for m in (72, 76, 79, 84):
        t = t_axis(0.09)
        f = note_freq(m)
        out.append((np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2 * t)) * np.exp(-t / 0.08))
    return np.concatenate(out)


def skid_loop():
    t = t_axis(0.5)
    noise = rng.uniform(-1, 1, len(t))
    s = lowpass(noise, 0.55) - lowpass(noise, 0.08)
    squeal = np.sin(2 * np.pi * 900 * t) * 0.25 + np.sin(2 * np.pi * 1350 * t) * 0.12
    return s + squeal


def click():
    t = t_axis(0.05)
    return np.sin(2 * np.pi * 1200 * t) * np.exp(-t / 0.012)


def fanfare():
    seq = [(72, 0.14), (76, 0.14), (79, 0.14), (84, 0.32), (79, 0.14), (84, 0.6)]
    out = []
    for m, d in seq:
        t = t_axis(d)
        f = note_freq(m)
        s = np.sign(np.sin(2 * np.pi * f * t)) * 0.4 + np.sin(2 * np.pi * f * t) * 0.6
        s += np.sin(2 * np.pi * f / 2 * t) * 0.3
        out.append(s * np.minimum(1, (d - t) / 0.04) * np.minimum(1, t / 0.01))
    return np.concatenate(out)


# ---------------------------------------------------------------- música
def marimba(f, dur):
    t = t_axis(dur)
    # Parciales típicos de la marimba (1, 4, 10) + golpe de baqueta
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.45)
         + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.08)
         + 0.12 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.02))
    return s * np.minimum(1, t / 0.002)


def tremolo_marimba(f, dur, rate=14):
    # Redoble (trémolo) típico de la marimba guatemalteca
    total = np.zeros(int(dur * SR))
    step = int(SR / rate)
    for i in range(0, len(total), step):
        n = marimba(f, min(0.3, (len(total) - i) / SR))
        total[i:i + len(n)] += n[: len(total) - i] * 0.55
    return total


def bass_note(f, dur):
    t = t_axis(dur)
    tri = 2 * np.abs(2 * ((t * f) % 1) - 1) - 1
    return tri * np.exp(-t / 0.35) * np.minimum(1, (dur - t) / 0.02)


def song(bpm, chords, melody, bars_per_chord=1, swing=0.0, shaker=True):
    beat = 60.0 / bpm
    bar = beat * 4
    total = int(len(chords) * bars_per_chord * bar * SR)
    mix = np.zeros(total + SR)

    def put(sig, start, gain):
        i = int(start * SR)
        mix[i:i + len(sig)] += sig[: len(mix) - i] * gain

    # bajo y acompañamiento ("chun-chun" de la marimba de son)
    for ci, ch in enumerate(chords):
        root, third, fifth = ch
        for b in range(bars_per_chord):
            t0 = (ci * bars_per_chord + b) * bar
            put(bass_note(note_freq(root - 24), beat * 0.9), t0, 0.55)
            put(bass_note(note_freq(fifth - 24), beat * 0.9), t0 + beat * 2, 0.5)
            for k in (1, 3):
                for nn in (root, third, fifth):
                    put(marimba(note_freq(nn), beat * 0.8), t0 + beat * k, 0.16)
                for nn in (third, fifth):
                    put(marimba(note_freq(nn), beat * 0.5), t0 + beat * (k + 0.5), 0.1)
            if shaker:
                for e in range(8):
                    tt = t_axis(0.05)
                    sh = rng.uniform(-1, 1, len(tt)) * np.exp(-tt / 0.015)
                    put(sh, t0 + e * beat / 2 + (swing * beat / 2 if e % 2 else 0), 0.10 if e % 2 else 0.06)
            # bombo suave
            for k in (0, 2):
                tt = t_axis(0.18)
                kick = np.sin(2 * np.pi * (95 - 220 * tt) * tt) * np.exp(-tt / 0.06)
                put(kick, t0 + beat * k, 0.35)

    # melodía (lista de (midi o None, duración en beats))
    pos = 0.0
    for m, d in melody:
        if m is not None:
            dur = d * beat
            if d >= 1.5:
                put(tremolo_marimba(note_freq(m), dur), pos, 0.42)
                put(tremolo_marimba(note_freq(m - 12), dur), pos, 0.18)
            else:
                put(marimba(note_freq(m), max(dur, 0.35)), pos, 0.5)
                put(marimba(note_freq(m + 12), max(dur, 0.3)), pos, 0.14)
        pos += d * beat
    mix = mix[:total]
    # cola suave para que el bucle no haga clic
    fade = int(0.01 * SR)
    mix[:fade] *= np.linspace(0, 1, fade)
    mix[-fade:] *= np.linspace(1, 0, fade)
    return mix


C, F, G, Am, Dm, E = (60, 64, 67), (65, 69, 72), (67, 71, 74), (69, 72, 76), (62, 65, 69), (64, 68, 71)


def race_music():
    chords = [C, C, F, G, C, Am, Dm, G, F, G, C, Am, F, G, C, C]
    mel = [
        (72, .5), (74, .5), (76, 1), (79, .5), (76, .5), (72, 1),
        (74, .5), (76, .5), (77, .5), (76, .5), (74, 2),
        (77, .5), (76, .5), (74, 1), (72, .5), (74, .5), (77, 1),
        (79, .5), (77, .5), (76, .5), (74, .5), (71, 2),
        (72, .5), (74, .5), (76, 1), (79, .5), (81, .5), (79, 1),
        (76, .5), (77, .5), (79, .5), (76, .5), (72, 2),
        (74, .5), (76, .5), (77, 1), (74, .5), (77, .5), (79, 1),
        (79, .5), (77, .5), (76, .5), (74, .5), (79, 2),
        (81, .5), (79, .5), (77, 1), (76, .5), (77, .5), (79, 1),
        (79, .5), (81, .5), (79, .5), (77, .5), (76, 2),
        (77, .5), (76, .5), (74, 1), (72, .5), (74, .5), (76, 1),
        (74, .5), (72, .5), (71, .5), (74, .5), (72, 2),
        (72, .5), (76, .5), (79, 1), (81, .5), (79, .5), (77, 1),
        (76, .5), (77, .5), (79, .5), (74, .5), (76, 2),
        (72, .5), (74, .5), (76, .5), (79, .5), (84, 2),
        (None, 4),
    ]
    return song(138, chords, mel, swing=0.25)


def menu_music():
    chords = [C, Am, F, G, C, Am, Dm, G]
    mel = [
        (76, 1), (79, 1), (81, 2),
        (79, 1), (76, 1), (72, 2),
        (77, 1), (76, 1), (74, 2),
        (71, 1), (74, 1), (79, 2),
        (76, 1), (79, 1), (84, 2),
        (81, 1), (79, 1), (76, 2),
        (77, 1), (74, 1), (72, 1), (74, 1),
        (71, 2), (None, 2),
    ]
    return song(104, chords, mel, swing=0.3)


def main():
    os.makedirs(OUT, exist_ok=True)
    save("engine", engine_loop(), 0.8)
    save("coin", coin(), 0.6)
    save("nitro", nitro(), 0.8)
    save("crash", crash(), 0.9)
    save("bump", bump(), 0.8)
    save("pothole", pothole(), 0.8)
    save("horn", horn(), 0.6)
    save("beep_low", beep(69, 0.25), 0.5)
    save("beep_high", beep(81, 0.6), 0.5)
    save("bark", bark(), 0.7)
    save("repair", repair(), 0.6)
    save("skid", skid_loop(), 0.5)
    save("click", click(), 0.5)
    save("fanfare", fanfare(), 0.6)
    save("music_race", race_music(), 0.75)
    save("music_menu", menu_music(), 0.7)


if __name__ == "__main__":
    main()
