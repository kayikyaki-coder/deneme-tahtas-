#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Showreel soundtrack generator -- 100 % procedural (numpy + scipy only, no samples).

Grid   : 60 fps, 28 frames per beat -> 1 beat = 0.4666667 s = 22400 samples @ 48 kHz
         BPM = 128.5714..., key F minor, 4/4.
Output : build/soundtrack.wav          48 kHz / stereo / 32-bit float / 720000 samples
         build/glitch_schedule.json    stutter schedule for the video freeze-frames
Review : python3 audio/soundtrack.py --review
         (spectrogram / waveform PNGs + cue sheet into build/audio_review/, needs matplotlib)

Everything is timed in BEATS.  To retime an event, edit the numbers in the CUE TABLE,
GROOVE or GLITCH sections below -- nothing else has to change.  b2s() is the only
beat -> sample conversion used anywhere in the file.
"""
import json
import os
import sys
import time
import zlib

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d

# =====================================================================================
# GRID  (non-negotiable)
# =====================================================================================
SR = 48000
FPS = 60
FRAMES_PER_BEAT = 28
SPB = SR * FRAMES_PER_BEAT // FPS          # 22400 samples per beat
SPF = SR // FPS                            # 800 samples per video frame
BPM = 60.0 * FPS / FRAMES_PER_BEAT         # 128.571428...
N = 720000                                 # 15.000 s = 900 frames
TOTAL_BEATS = N / SPB                      # 32.142857...


def b2s(beat):
    """beat -> sample index."""
    return int(round(beat * SPB))


HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BUILD = os.path.join(ROOT, 'build')
WAV_PATH = os.path.join(BUILD, 'soundtrack.wav')
GLITCH_JSON = os.path.join(BUILD, 'glitch_schedule.json')
REVIEW_DIR = os.path.join(BUILD, 'audio_review')

SEED = 150900                              # global seed -> fully deterministic output
TARGET_LUFS = -10.5                        # integrated loudness target
TP_CEILING_DB = -1.3                       # limiter true-peak ceiling (spec: <= -1.0 dBTP)
FINAL_FADE_S = 0.25

# Hard silences (true digital zero).  Anything started before a gap is cut at the gap
# start, reverb / delay tails included, so nothing re-emerges after the gap.
HARD_GAPS = [(3.75, 4.0), (27.75, 28.0)]
# Segment boundaries for tails: (beat, fade-out seconds ending exactly at the boundary).
# 24.0 is a soft boundary: the glitch tape-stop dives into near silence there.
CUT_POINTS = [(3.75, 0.002), (24.0, 0.09), (27.75, 0.002)]

# =====================================================================================
# HARMONY  (F minor).  MIDI numbers: C4 = 60, F3 = 53.
# =====================================================================================
CHORDS = [  # (start_beat, end_beat, chord)
    (0.0, 4.0, 'Fm'),        # intro pad
    (4.0, 8.0, 'Fm'),
    (8.0, 12.0, 'Db'),
    (12.0, 16.0, 'Ab'),
    (16.0, 20.0, 'Eb'),
    (20.0, 24.0, 'Fm'),
    (24.0, 26.0, 'Db'),
    (26.0, 28.0, 'Eb2'),     # Eb, voiced higher for the climax
    (28.0, 40.0, 'Fm9'),     # final chord rings out
]
VOICING = {
    #        sub-bass root   supersaw stab voicing (top line voice-leads)   pad voicing
    'Fm':  dict(bass=29, stab=[53, 60, 65, 68, 72], pad=[48, 53, 56, 60]),
    'Db':  dict(bass=37, stab=[49, 56, 65, 68, 73], pad=[49, 53, 56, 60]),
    'Ab':  dict(bass=32, stab=[56, 60, 63, 68, 72], pad=[48, 51, 56, 60]),
    'Eb':  dict(bass=39, stab=[51, 58, 63, 67, 70], pad=[46, 51, 55, 58]),
    'Eb2': dict(bass=39, stab=[51, 58, 67, 70, 75], pad=[51, 55, 58, 63]),
    'Fm9': dict(bass=29, stab=[53, 56, 63, 67, 72, 77], pad=[41, 53, 56, 60]),  # F Ab Eb G C F
}
INTRO_PAD = [41, 53, 56, 60]               # F2 F3 Ab3 C4, low-passed
F_MINOR_PENTA = [5, 8, 10, 0, 3]           # F Ab Bb C Eb (pitch classes)


def chord_at(beat):
    for s, e, c in CHORDS:
        if s <= beat < e:
            return c
    return CHORDS[-1][2]


_PC = dict(C=0, Db=1, D=2, Eb=3, E=4, F=5, Gb=6, G=7, Ab=8, A=9, Bb=10, B=11)


def nm(name):
    """'Ab3' -> 56 (ints pass through)."""
    if isinstance(name, (int, float, np.integer)):
        return float(name)
    return float(12 * (int(name[-1]) + 1) + _PC[name[:-1]])


def midi_hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


# =====================================================================================
# GROOVE  (beat 4 -> 27.75; replaced by the glitch edit 22.5 -> 24)
# =====================================================================================
GROOVE_START, GROOVE_END = 4.0, 27.75
KICK_BEATS = [float(b) for b in range(4, 28)]              # 4-on-the-floor, 4 .. 27
CLAP_BEATS = [float(b) for b in range(5, 28, 2)]           # beats 2 & 4 of each bar
HAT_VEL = {0: 0.50, 1: 0.78, 3: 1.00}                      # closed hats per 16th slot
OPEN_HAT_SLOT = 2                                          # the "and" of every beat
HAT_SWING = 0.02                                           # beats of delay on 16th off-beats
# Off-beat bass, per bar: (offset beats, gate beats, octave shift in semitones)
BASS_PATTERN = [(0.5, 0.30, 0), (1.5, 0.30, 0), (2.5, 0.30, 0), (3.5, 0.20, 0), (3.75, 0.18, 12)]
BASS_START, BASS_END = 4.5, 27.75
BASS_SKIP = [12.5]                                         # leave room for the 12.0 whoomp
# Syncopated supersaw stabs (3-3-4-3-3 in 16ths) per bar: offsets in beats
STAB_PATTERN = [0.0, 0.75, 1.5, 2.5, 3.25]
STAB_GATE = 0.42                                           # beats
STAB_BARS = {   # bar start -> overrides
    4.0:  dict(gain=1.00, cut=9500, skip=[0.0]),           # 4.0 stab belongs to THE DROP
    8.0:  dict(gain=0.90, cut=9000),
    12.0: dict(gain=0.70, cut=7000),                       # arp takes the top
    16.0: dict(gain=0.80, cut=4800),                       # liquid: darker
    20.0: dict(gain=0.95, cut=10000, pattern=[0.0, 0.75, 1.5, 2.5, 3.5, 3.75]),  # feeds the glitch
}
PAD_SPANS = [(4.0, 8.0), (8.0, 12.0), (12.0, 16.0), (16.0, 20.0), (20.0, 24.0), (24.0, 26.0),
             (26.0, 27.75)]
PAD_GAIN = {12.0: 0.12}                                    # default 0.17; S3 leaves room
ARP_NOTES = [68, 72, 75, 80, 84, 80, 75, 72]                # Ab4 C5 Eb5 Ab5 C6 ... (16ths)

# Sidechain from every kick: (depth, release seconds)
SIDECHAIN = dict(bass=(0.90, 0.12), chords=(0.55, 0.17), pad=(0.75, 0.18), arp=(0.35, 0.15),
                 cuts=(0.25, 0.12), boom=(0.70, 0.16))

# =====================================================================================
# CUE TABLE   (beat, kind, params)  -- every visual event gets its sound here
# =====================================================================================
CUES = [
    # ---------------- INTRO 0-4 : filtered Fm pad, no kick ---------------------------
    (0.000, 'intro_pad',  dict(end=3.75)),
    (0.125, 'blip',       dict()),                                    # sonic LOGO
    (0.500, 'zip',        dict(end=0.95)),                            # dot -> line
    (1.000, 'slam',       dict(root='F3', gain=0.78)),                # "15 SECONDS."
    (1.000, 'riser',      dict(end=3.75, f0=300, f1=9000, root='F3', octaves=3, gain=0.80)),
    (2.000, 'slam',       dict(root='Ab3', gain=0.88)),               # "900 FRAMES."
    (2.000, 'tick_roll',  dict(end=2.55, count=14)),                  # odometer 000 -> 900
    (2.000, 'snare_roll', dict(hits=[2.0, 2.5, 3.0, 3.25, 3.5], g0=0.30, g1=0.80, tune=4)),
    (3.000, 'slam',       dict(root='C4', gain=1.00)),                # "ZERO WASTED."
    # 3.75-4.00 : HARD SILENCE
    # ---------------- S1 KINETIC TYPE 4-8 --------------------------------------------
    (4.000, 'drop',       dict()),                                    # THE DROP
    (6.000, 'whip',       dict()),                                    # letters flip
    (7.500, 'whoosh',     dict(end=8.0, f0=350, f1=6500, shape='rise', pan=(-0.8, 0.8))),
    # ---------------- S2 SHAPE GRID 8-12 ---------------------------------------------
    (8.000, 'accent',     dict(size=0.65)),
    (8.000, 'zoom_out',   dict(end=9.0)),
    (9.000, 'ripple',     dict(notes=['Db5', 'F5', 'Ab5', 'Db6'])),
    (10.00, 'ripple',     dict(notes=['F5', 'Ab5', 'Db6', 'F6'])),
    (11.00, 'ripple',     dict(notes=['Ab5', 'Db6', 'F6', 'Ab6'])),
    (11.50, 'whoosh',     dict(end=12.0, f0=300, f1=7000, shape='rise', pan=(0.8, -0.6))),
    # ---------------- S3 3D COLUMNS 12-16 --------------------------------------------
    (12.00, 'accent',     dict(size=0.6, boom=0.0)),
    (12.00, 'whoomp',     dict()),                                    # columns extrude
    (12.00, 'arp',        dict(end=16.0)),
    (15.50, 'whoosh',     dict(end=16.0, f0=6500, f1=450, shape='swell', pan=(0.5, -0.5))),
    # ---------------- S4 LIQUID 16-20 ------------------------------------------------
    (16.00, 'bloop',      dict()),
    (16.00, 'accent',     dict(size=0.35, soft=True)),
    (16.50, 'droplet',    dict(note='C7', pan=-0.5)),
    (17.00, 'droplet',    dict(note='Eb7', pan=0.45)),
    (17.50, 'droplet',    dict(note='Ab6', pan=-0.2)),
    (18.00, 'gloop',      dict(note='Eb2')),                          # blobs merge
    (18.50, 'droplet',    dict(note='F7', pan=0.6)),
    (19.00, 'droplet',    dict(note='Bb6', pan=-0.6)),
    (19.50, 'burst',      dict(end=20.0)),                            # blob explodes
    # ---------------- S5 PARTICLES 20-24 ---------------------------------------------
    (20.00, 'accent',     dict(size=0.60)),
    (20.00, 'sparkle',    dict(end=21.0)),
    (20.50, 'suck',       dict(end=21.0)),                            # implode, ends AT 21.0
    (22.00, 'explosion',  dict()),
    (22.50, 'glitch',     dict(end=24.0)),                            # see GLITCH below
    # ---------------- S6 RAPID FIRE 24-28 --------------------------------------------
    (24.00, 'impact',     dict()),
    (24.00, 'cut', dict(accent=True)), (24.50, 'cut', dict()),
    (25.00, 'cut', dict()),            (25.50, 'cut', dict()),
    (26.00, 'cut', dict(accent=True)), (26.50, 'cut', dict()),
    (27.00, 'cut', dict()),            (27.50, 'cut', dict(gate=0.25)),   # cut off at 27.75
    (26.00, 'snare_roll', dict(hits=[26.0, 26.5, 27.0, 27.25, 27.5, 27.625],
                               g0=0.30, g1=0.62, tune=7)),            # 8ths->16ths->32nds
    (26.00, 'riser',      dict(end=27.75, f0=500, f1=11000, root='Eb3', octaves=2, gain=0.50,
                               tone=1.0)),
    # 27.75-28.00 : HARD SILENCE
    # ---------------- OUTRO 28-32.14 -------------------------------------------------
    (28.00, 'final_hit',  dict()),                                    # biggest moment
    (29.00, 'shimmer_swell', dict()),                                 # subtitle appears
    (30.00, 'blip',       dict()),                                    # LOGO again
    (30.125, 'type_tick', dict()), (30.1875, 'type_tick', dict()), (30.3125, 'type_tick', dict()),
    (30.375, 'type_tick', dict()), (30.4375, 'type_tick', dict()),
]

# =====================================================================================
# GLITCH BREAK 22.5 -> 24.0 : stutter edit of the music bus (written to JSON too)
# =====================================================================================
GLITCH = dict(
    start=22.5, end=24.0,
    stutters=[  # slice [start, start+len) of the music bus replayed at `plays`
        dict(name='beat-repeat (0.25-beat slice)', slice_start=22.5, slice_len=0.25,
             plays=[22.5, 22.75], pitch=[0, 0], gain=0.85),
        dict(name='1/16 stutter (0.125-beat slice)', slice_start=23.0, slice_len=0.125,
             plays=[23.0, 23.125, 23.25, 23.375], pitch=[0, 0, 0, 0], gain=0.70),
        dict(name='1/32 stutter (0.0625-beat slice), rising pitch', slice_start=23.5,
             slice_len=0.0625,
             plays=[23.5, 23.5625, 23.625, 23.6875], pitch=[0, 3, 7, 12], gain=0.80),
    ],
    tape_stop=dict(start=23.75, end=24.0, src=23.75, curve=1.6, gain=0.9, hpf=55.0),
    ramp_end=23.75,                # crush + high-pass ramps run 22.5 -> 23.75, then hold
    hpf=(30.0, 450.0),             # rising high-pass on the stutters (thins out the break)
    crush_bits=(12.0, 6.0),        # bit depth from -> to
    crush_hold=(1.0, 8.0),         # sample-rate reduction factor from -> to
    xfade_ms=1.5,
    # digital error chirps: (beat, f_start, f_end, dur_beats, gain, pan)
    chirps=[(22.625, 5200, 900, 0.10, 0.9, -0.6), (22.875, 1100, 6400, 0.08, 0.8, 0.55),
            (23.0625, 7400, 2100, 0.05, 0.7, -0.25), (23.3125, 900, 8200, 0.07, 0.8, 0.7),
            (23.4375, 3000, 600, 0.05, 0.7, -0.7), (23.59375, 2400, 11000, 0.05, 0.8, 0.35),
            (23.71875, 9000, 1500, 0.04, 0.7, -0.4)],
)


# =====================================================================================
# DSP LIBRARY
# =====================================================================================
def rng(tag):
    """Deterministic RNG per tag (crc32 is stable across runs, unlike hash())."""
    return np.random.default_rng([SEED, zlib.crc32(str(tag).encode())])


def t_axis(n):
    return np.arange(n) / SR


def ns(seconds):
    return max(1, int(round(seconds * SR)))


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def fade_in(x, n):
    n = min(int(n), x.shape[-1])
    if n > 0:
        x[..., :n] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(n) / n)
    return x


def fade_out(x, n):
    n = min(int(n), x.shape[-1])
    if n > 0:
        x[..., -n:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(1, n + 1) / n)
    return x


def env_ar(n, att, t60, hold=0.0, gate=None, rel=0.02):
    """Raised-cosine attack, optional hold, exponential decay (t60 = time to -60 dB),
    optional gate (seconds) followed by a raised-cosine release."""
    t = t_axis(n)
    e = np.exp(-6.907755 * np.maximum(t - att - hold, 0.0) / t60)
    if att > 0:
        e *= 0.5 - 0.5 * np.cos(np.pi * np.clip(t / att, 0.0, 1.0))
    if gate is not None:
        g, r = ns(gate), ns(rel)
        tail = np.zeros(n)
        tail[:min(g, n)] = 1.0
        if g < n:
            k = min(r, n - g)
            tail[g:g + k] = 0.5 + 0.5 * np.cos(np.pi * np.arange(k) / r)
        e *= tail
    return e


def pan_gains(p):
    """Equal-power pan, normalised so centre = 1.0 on both channels."""
    th = (np.clip(p, -1, 1) + 1.0) * np.pi / 4.0
    return np.cos(th) * np.sqrt(2.0), np.sin(th) * np.sqrt(2.0)


def stereo(x, pan=0.0):
    x = np.asarray(x, float)
    if x.ndim == 2:
        if np.all(np.asarray(pan) == 0):
            return x
        gl, gr = pan_gains(pan)
        return np.stack([x[0] * gl, x[1] * gr])
    gl, gr = pan_gains(pan)
    return np.stack([x * gl, x * gr])


def peak_norm(x, peak=1.0):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


# ---- static filters ------------------------------------------------------------------
_SOS = {}


def sos(kind, f, order=2):
    key = (kind, tuple(np.atleast_1d(f).tolist()), order)
    if key not in _SOS:
        _SOS[key] = signal.butter(order, f, btype=kind, fs=SR, output='sos')
    return _SOS[key]


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x, axis=-1)


# ---- time-varying biquad (RBJ), coefficients updated every `block` samples ----------
def rbj(kind, fc, q):
    w0 = 2.0 * np.pi * fc / SR
    c, s = np.cos(w0), np.sin(w0)
    alpha = s / (2.0 * q)
    if kind == 'lp':
        b0, b1, b2 = (1 - c) / 2, 1 - c, (1 - c) / 2
    elif kind == 'hp':
        b0, b1, b2 = (1 + c) / 2, -(1 + c), (1 + c) / 2
    elif kind == 'bp':                      # constant 0 dB peak gain
        b0, b1, b2 = alpha, np.zeros_like(fc), -alpha
    else:
        raise ValueError(kind)
    a0 = 1 + alpha
    B = np.stack([b0, b1, b2], -1) / a0[..., None]
    A = np.stack([np.ones_like(a0), -2 * c / a0, (1 - alpha) / a0], -1)
    return B, A


def tvf(x, fc, q=0.707, kind='lp', block=32):
    x = np.asarray(x, float)
    n = x.shape[-1]
    fc = np.broadcast_to(np.asarray(fc, float), (n,))
    q = np.broadcast_to(np.asarray(q, float), (n,))
    if np.max(q) > 3.0:
        block = min(block, 16)                       # finer updates for resonant sweeps
    nb = (n + block - 1) // block
    idx = np.minimum(np.arange(nb) * block + block // 2, n - 1)
    B, A = rbj(kind, np.clip(fc[idx], 15.0, 0.45 * SR), q[idx])
    y = np.empty_like(x)
    zi = np.zeros(x.shape[:-1] + (2,))
    for k in range(nb):
        a, b = k * block, min(n, (k + 1) * block)
        y[..., a:b], zi = signal.lfilter(B[k], A[k], x[..., a:b], axis=-1, zi=zi)
    return y


# ---- band-limited oscillators (PolyBLEP) ---------------------------------------------
def phase_acc(freq, n, ph0=0.0):
    dt = np.broadcast_to(np.asarray(freq, float), (n,)) / SR
    ph = np.cumsum(dt)
    ph -= dt
    ph += ph0
    return np.mod(ph, 1.0), dt


def _blep(ph, dt):
    out = np.zeros_like(ph)
    m = ph < dt
    if m.any():
        x = ph[m] / dt[m]
        out[m] = x + x - x * x - 1.0
    m = ph > 1.0 - dt
    if m.any():
        x = (ph[m] - 1.0) / dt[m]
        out[m] = x * x + x + x + 1.0
    return out


def osc_saw(freq, n, ph0=0.0):
    ph, dt = phase_acc(freq, n, ph0)
    return 2.0 * ph - 1.0 - _blep(ph, dt)


def osc_square(freq, n, ph0=0.0):
    ph, dt = phase_acc(freq, n, ph0)
    ph2 = np.mod(ph + 0.5, 1.0)
    return (2.0 * ph - _blep(ph, dt)) - (2.0 * ph2 - _blep(ph2, dt))


def osc_sine(freq, n, ph0=0.0):
    ph, _ = phase_acc(freq, n, ph0)
    return np.sin(2.0 * np.pi * ph)


def sweep_phase(freq, n):
    """radian phase of a (time-varying) frequency, starting at 0."""
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    return 2.0 * np.pi * (np.cumsum(f) - f) / SR


SS_DETUNE = np.array([-1.0, -0.62, -0.28, 0.0, 0.28, 0.62, 1.0])
SS_PAN = np.array([-1.0, 0.70, -0.40, 0.0, 0.40, -0.70, 1.0])
SS_GAIN = np.array([0.72, 0.82, 0.92, 1.0, 0.92, 0.82, 0.72])
SS_IDX = {7: [0, 1, 2, 3, 4, 5, 6], 5: [0, 2, 3, 4, 6], 3: [0, 3, 6]}


def supersaw(midis, n, r, cents=24.0, width=1.0, voices=7, fmod=None):
    """7-voice detuned PolyBLEP supersaw (JP-8000 style spread), stereo."""
    out = np.zeros((2, n))
    idx = SS_IDX[voices]
    for m in midis:
        f0 = float(midi_hz(m))
        for v in idx:
            f = f0 * 2.0 ** (SS_DETUNE[v] * cents / 1200.0)
            if fmod is not None:
                f = f * fmod
            s = osc_saw(f, n, r.random()) * SS_GAIN[v]
            gl, gr = pan_gains(SS_PAN[v] * width)
            out[0] += s * gl
            out[1] += s * gr
    return out / np.sqrt(len(midis) * np.sum(SS_GAIN[idx] ** 2))


# ---- reverb: synthetic stereo IR (frequency-dependent decay) + FFT convolution ------
def make_ir(t60, length, predelay, seed, hp=200.0, lp=12000.0, er=True):
    n = ns(length)
    t = t_axis(n)
    r = rng(seed)
    bands = [('lowpass', 400.0, 1.15), ('bandpass', (400.0, 1500.0), 1.0),
             ('bandpass', (1500.0, 5000.0), 0.8), ('bandpass', (5000.0, 10000.0), 0.58),
             ('highpass', 10000.0, 0.38)]
    ir = np.zeros((2, n))
    for c in range(2):
        noise = r.standard_normal(n)
        for kind, f, mult in bands:
            ir[c] += filt(noise, kind, f, 2) * np.exp(-6.907755 * t / (t60 * mult))
    ir *= 1.0 - np.exp(-t / 0.012)                 # diffusion build-up
    if er:                                         # a few early reflections
        for k in range(10):
            d = ns(r.uniform(0.004, 0.045))
            ir[k % 2, d] += r.uniform(0.6, 1.4) * (1 if r.random() > 0.5 else -1) * 2.0
    ir = filt(filt(ir, 'highpass', hp, 2), 'lowpass', lp, 2)
    ir = np.pad(ir, ((0, 0), (ns(predelay), 0)))
    return ir / np.sqrt(np.sum(ir ** 2) / 2.0)


def conv_reverb(x, ir):
    mono = 0.5 * (x[0] + x[1])
    return np.stack([signal.fftconvolve(mono, ir[c])[:x.shape[-1]] for c in range(2)])


def pingpong(x, delay_beats=0.75, fb=0.40, taps=7, damp=5500.0, hp=350.0):
    mono = filt(0.5 * (x[0] + x[1]), 'highpass', hp, 1)
    n = mono.size
    d = b2s(delay_beats)
    out = np.zeros((2, n))
    tap = mono
    for k in range(1, taps + 1):
        if k * d >= n:
            break
        tap = filt(tap, 'lowpass', damp, 1) * fb
        out[(k - 1) % 2, k * d:] += tap[:n - k * d]
    return out


SEGMENTS = []                               # filled in below from CUT_POINTS
_cps = [0] + [b2s(b) for b, _ in CUT_POINTS] + [N]
_fades = [f for _, f in CUT_POINTS] + [0.0]
for _i in range(len(_cps) - 1):
    SEGMENTS.append((_cps[_i], _cps[_i + 1], _fades[_i]))


def segmented(fn, x):
    """Run a tail-producing effect separately per segment; cut its output at the
    segment end so no tail crosses a gap / boundary."""
    out = np.zeros_like(x)
    for s, e, fade in SEGMENTS:
        if not np.any(x[:, s:e]):
            continue
        y = fn(x[:, s:e])[:, :e - s]
        if fade > 0:
            fade_out(y, ns(fade))
        out[:, s:e] += y
    return out


def sidechain_env(kicks, depth, rel, att=0.0015, hold=0.012):
    a, h, r = ns(att), ns(hold), ns(rel)
    shape = np.concatenate([0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a), np.ones(h),
                            0.5 + 0.5 * np.cos(np.pi * np.arange(r) / r)])
    duck = 1.0 - depth * shape
    g = np.ones(N)
    for b in kicks:
        s = b2s(b)
        e = min(N, s + duck.size)
        g[s:e] = np.minimum(g[s:e], duck[:e - s])
    return g


# =====================================================================================
# INSTRUMENTS
# =====================================================================================
def make_kick(length=0.40, f_hi=150.0, f_lo=48.0, tau=0.028, punch=330.0, drive=1.6,
              click=0.30, decay=0.09, hold=0.045, seed='kick'):
    """Sine with fast pitch envelope (150 -> 48 Hz), click transient, tanh saturation."""
    n = ns(length)
    t = t_axis(n)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / tau) + punch * np.exp(-t / 0.0035)
    body = np.sin(sweep_phase(f, n)) * np.exp(-np.maximum(t - hold, 0.0) / decay)
    nz = rng(seed).standard_normal(n) * np.exp(-t / 0.0022)
    y = body + click * filt(nz, 'bandpass', (1500.0, 9000.0), 2)
    y = np.tanh(drive * y) / np.tanh(drive)
    fade_in(y, 8)
    return fade_out(y, ns(0.012))


def make_clap(seed):
    """Three quick filtered-noise bursts + tail, short tonal body."""
    r = rng(seed)
    n = ns(0.40)
    t = t_axis(n)
    bursts = [0.0, 0.0095, 0.019]
    env = np.zeros(n)
    for bt in bursts[:-1]:
        env += np.where(t >= bt, np.exp(-np.maximum(t - bt, 0) / 0.0032), 0.0) * 0.8
    env += np.where(t >= bursts[-1], np.exp(-np.maximum(t - bursts[-1], 0) / 0.07), 0.0)
    common = r.standard_normal(n)
    out = np.zeros((2, n))
    for c in range(2):
        nz = (0.75 * common + 0.66 * r.standard_normal(n)) * env
        out[c] = filt(nz, 'bandpass', (900.0, 2600.0), 2) + \
            0.45 * filt(nz, 'bandpass', (2600.0, 7500.0), 2)
    body = np.sin(sweep_phase(180.0 * (1 + 0.35 * np.exp(-t / 0.008)), n)) * np.exp(-t / 0.028)
    out = np.tanh(1.4 * (peak_norm(out) + 0.35 * body))
    fade_in(out, 6)
    return peak_norm(fade_out(out, ns(0.03)))


def make_snare(seed, tune=0.0, bright=1.0, length=0.24):
    r = rng(seed)
    n = ns(length)
    t = t_axis(n)
    f = 190.0 * 2 ** (tune / 12.0) * (1 + 0.6 * np.exp(-t / 0.006))
    ph = sweep_phase(f, n)
    body = np.sin(ph) * np.exp(-t / 0.05) + 0.4 * np.sin(1.62 * ph) * np.exp(-t / 0.03)
    common = r.standard_normal(n)
    out = np.zeros((2, n))
    for c in range(2):
        nz = (0.8 * common + 0.6 * r.standard_normal(n)) * np.exp(-t / 0.065)
        out[c] = filt(nz, 'bandpass', (1200.0 * bright, min(15000.0, 8000.0 * bright)), 2)
    out = np.tanh(1.3 * (0.55 * body + 1.2 * peak_norm(out)))
    fade_in(out, 6)
    return peak_norm(fade_out(out, ns(0.03)))


HAT_RATIOS = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0])    # 808 metal


def make_hat(seed, open_=False):
    r = rng(seed)
    n = ns(0.13 if open_ else 0.07)
    base = r.uniform(0.97, 1.03)
    metal = sum(osc_square(f * base, n, r.random()) for f in HAT_RATIOS) / 6.0
    common = r.standard_normal(n)
    out = np.zeros((2, n))
    for c in range(2):
        x = 0.5 * metal + 0.8 * (0.6 * common + 0.8 * r.standard_normal(n))
        out[c] = filt(filt(x, 'highpass', 7000.0, 4), 'lowpass', 16000.0, 2)
    out *= env_ar(n, 0.0003, 0.30 if open_ else 0.045)
    return peak_norm(fade_out(out, ns(0.008)))


def make_crash(seed, length=2.2, t60=1.8, lp=16000.0):
    """808-style metal (band-limited squares) + noise, bright part decays faster."""
    r = rng(seed)
    n = ns(length)
    t = t_axis(n)
    common = r.standard_normal(n)
    metal = sum(osc_square(f * 1.9 * r.uniform(0.98, 1.02), n, r.random())
                for f in HAT_RATIOS) / 6.0
    out = np.zeros((2, n))
    for c in range(2):
        nz = 0.5 * common + 0.87 * r.standard_normal(n) + 0.35 * metal
        lo = filt(nz, 'bandpass', (3000.0, 8000.0), 2) * np.exp(-6.9 * t / t60)
        hi = filt(nz, 'highpass', 8000.0, 2) * np.exp(-6.9 * t / (0.6 * t60))
        out[c] = 0.8 * lo + 0.9 * hi
    out = filt(out, 'lowpass', lp, 2) * (1.0 + 0.8 * np.exp(-t / 0.02))
    fade_in(out, 24)
    return peak_norm(fade_out(out, ns(0.25)))


def make_boom(length, f_start, f_end, glide, t60, drive=2.2):
    """808-style sub boom gliding down, saturated for small-speaker audibility."""
    n = ns(length)
    t = t_axis(n)
    f = f_end + (f_start - f_end) * np.exp(-t / glide)
    y = np.sin(sweep_phase(f, n)) * env_ar(n, 0.004, t60)
    y = np.tanh(drive * y) / np.tanh(drive)
    return fade_out(y, ns(0.06))


def make_impact(seed, length=1.3, boom_hz=(90.0, 38.0), dark=1.0, boom_gain=0.5):
    r = rng(seed)
    n = ns(length)
    t = t_axis(n)
    f = boom_hz[1] + (boom_hz[0] - boom_hz[1]) * np.exp(-t / 0.08)
    boom = np.tanh(2.0 * np.sin(sweep_phase(f, n)) * env_ar(n, 0.002, 0.6))
    nz = r.standard_normal((2, n)) * np.exp(-t / 0.12)
    nz = tvf(nz, 300.0 + 9000.0 * dark * np.exp(-t / 0.07), 0.7, 'lp')
    thud = filt(r.standard_normal(n), 'bandpass', (120.0, 600.0), 2) * np.exp(-t / 0.05)
    out = boom_gain * boom + 0.9 * peak_norm(nz) + 0.5 * peak_norm(thud)
    fade_in(out, 12)
    return peak_norm(fade_out(out, ns(0.1)))


def make_airburst(seed, length=1.2, t60=0.7):
    """Bright wide white-noise burst that darkens as it decays (EDM impact 'air')."""
    r = rng(seed)
    n = ns(length)
    t = t_axis(n)
    y = filt(filt(r.standard_normal((2, n)), 'highpass', 2500.0, 2), 'lowpass', 16000.0, 2)
    y = tvf(y, 3000.0 + 14000.0 * np.exp(-t / 0.35), 0.7, 'lp') * env_ar(n, 0.001, t60)
    return peak_norm(fade_out(y, ns(0.1)))


def make_bass(midi, gate, seed):
    """Off-beat bass: 2 detuned PolyBLEP saws (octave up) through an enveloped LP + sine sub."""
    r = rng(seed)
    rel = 0.02
    n = ns(gate + rel) + 1
    t = t_axis(n)
    f_sub = float(midi_hz(midi))
    mid = 0.5 * osc_saw(2 * f_sub * 2 ** (4 / 1200), n, r.random()) + \
        0.5 * osc_saw(2 * f_sub * 2 ** (-4 / 1200), n, r.random())
    mid = tvf(mid, 280.0 + 1600.0 * np.exp(-t / 0.05), 1.2, 'lp')
    mid = np.tanh(2.0 * mid) / np.tanh(2.0)
    sub = np.sin(2 * np.pi * f_sub * t)
    return (0.60 * mid + 0.75 * sub) * env_ar(n, 0.003, 30.0, gate=gate, rel=rel)


def make_stab(midis, gate, seed, cut_hi=9000.0, cut_lo=900.0, tau=0.085, t60=0.55,
              cents=24.0, width=1.0, bend=-0.35, rel=0.04, q=0.9, hp=140.0):
    """Supersaw chord stab: pitch bend-in, plucky enveloped low-pass."""
    r = rng(seed)
    n = ns(gate + rel + 0.005)
    t = t_axis(n)
    fm = 2.0 ** (bend * np.exp(-t / 0.015) / 12.0)
    x = supersaw(midis, n, r, cents, width, fmod=fm)
    x = tvf(x, cut_lo + (cut_hi - cut_lo) * np.exp(-t / tau), q, 'lp')
    x = filt(x, 'highpass', hp, 2)
    return x * env_ar(n, 0.0015, t60, gate=gate, rel=rel)


def make_pad(midis, n, seed, cutoff, att, rel, voices=5, cents=14.0, width=0.9, hp=160.0):
    x = supersaw(midis, n, rng(seed), cents, width, voices=voices)
    if np.ndim(cutoff) == 0:
        x = filt(x, 'lowpass', cutoff, 4)
    else:
        x = tvf(tvf(x, cutoff, 0.75, 'lp'), cutoff, 0.75, 'lp')
    x = filt(x, 'highpass', hp, 2)
    env = np.ones(n)
    fade_in(env, ns(att))
    fade_out(env, ns(rel))
    return x * env


def make_pluck(midi, gate, seed, cutoff):
    r = rng(seed)
    rel = 0.03
    n = ns(gate + rel)
    t = t_axis(n)
    f = float(midi_hz(midi))
    x = 0.55 * osc_saw(f * 2 ** (5 / 1200), n, r.random()) + \
        0.45 * osc_square(f * 2 ** (-5 / 1200), n, r.random())
    x = tvf(x, cutoff * (0.3 + np.exp(-t / 0.04)), 1.6, 'lp')
    return x * env_ar(n, 0.001, 0.3, gate=gate, rel=rel)


def make_marimba(midi, seed, length=0.6):
    """Woody FM pluck, 1:4 ratio, index capped so sidebands stay below ~18 kHz."""
    r = rng(seed)
    n = ns(length)
    t = t_axis(n)
    f = float(midi_hz(midi))
    i0 = min(2.4, max(0.5, (18000.0 / f - 1.0) / 4.0 - 1.5))
    index = i0 * np.exp(-t / 0.012) + 0.25 * np.exp(-t / 0.12)
    y = np.sin(2 * np.pi * f * t + index * np.sin(2 * np.pi * 4.0 * f * t))
    if 9.2 * f < 18000:
        y += 0.12 * np.sin(2 * np.pi * 9.2 * f * t) * np.exp(-t / 0.01)
    y *= env_ar(n, 0.0006, 0.45)
    y += 0.15 * filt(r.standard_normal(n) * np.exp(-t / 0.0008), 'highpass', 3000.0, 2)
    fade_in(y, 4)
    return peak_norm(fade_out(y, ns(0.03)))


def make_click(seed, f=3500.0, q=6.0, low=900.0, length=0.03):
    r = rng(seed)
    n = ns(length)
    t = t_axis(n)
    exc = r.standard_normal(n) * np.exp(-t / 0.0006)
    B, A = rbj('bp', np.array([f]), np.array([q]))
    y = signal.lfilter(B[0], A[0], exc) + 0.3 * np.sin(2 * np.pi * low * t) * np.exp(-t / 0.002)
    fade_in(y, 3)
    return peak_norm(fade_out(y, ns(0.005)))


# =====================================================================================
# FX SOUND DESIGN
# =====================================================================================
def make_blip():
    """Sonic logo: FM sine at F6 (1397 Hz) dropping ~1.5 st, bright attack + sub thump."""
    n = ns(0.085)
    t = t_axis(n)
    f = float(midi_hz(89)) * 2 ** (-1.5 * (1 - np.exp(-t / 0.02)) / 12)
    index = 1.5 * np.exp(-t / 0.006)
    ph = sweep_phase(f, n)
    y = np.sin(ph + index * np.sin(2 * ph)) * env_ar(n, 0.0008, 0.16)
    y += 0.12 * np.sin(2 * ph) * np.exp(-t / 0.012)
    sub = np.sin(sweep_phase(70 + 80 * np.exp(-t / 0.015), n)) * np.exp(-t / 0.02)
    y = y + 0.4 * sub
    return peak_norm(fade_out(y, ns(0.012)))


def make_whoosh(length, f0, f1, shape, seed, q=1.6, pan=(0.0, 0.0), width=0.6, sweep_pow=1.0,
                tone=None, tone_gain=0.0):
    """Band-passed noise sweep with amplitude shape and pan automation."""
    r = rng(seed)
    n = ns(length)
    u = np.arange(n) / n
    nz = r.standard_normal((2, n))
    nz[1] = width * nz[1] + np.sqrt(1 - width ** 2) * nz[0]
    fc = f0 * (f1 / f0) ** (u ** sweep_pow)
    y = tvf(tvf(nz, fc, q, 'bp'), fc, q * 0.7, 'bp')
    if tone is not None:                              # (f_start, f_end) pitched sweep
        ft = tone[0] * (tone[1] / tone[0]) ** (u ** sweep_pow)
        y = peak_norm(y) + tone_gain * np.sin(sweep_phase(ft, n))
    if shape == 'rise':
        env = u ** 2.2
    elif shape == 'fall':
        env = (1 - u) ** 1.8
    else:                                             # 'swell' : peaks at ~60 %
        env = np.sin(np.pi * np.clip(u / 1.2 + 0.1 * u, 0, 1)) ** 1.5
    y *= env
    gl, gr = pan_gains(pan[0] + (pan[1] - pan[0]) * u)
    y = np.stack([y[0] * gl, y[1] * gr])
    fade_in(y, ns(0.01))
    return peak_norm(fade_out(y, ns(0.004)))


def make_zip(length):
    """Rising filtered noise + rising tone (F5 -> F7) as a dot stretches into a line."""
    n = ns(length)
    u = np.arange(n) / n
    y = make_whoosh(length, 1000.0, 9000.0, 'rise', 'zip', q=3.0, pan=(-0.7, 0.7), width=0.3)
    tone = np.sin(sweep_phase(float(midi_hz(77)) * 4.0 ** u, n)) * (0.25 + 0.75 * u ** 1.5)
    y = y + 0.45 * stereo(tone, -0.7 + 1.4 * u)
    fade_in(y, ns(0.008))
    return peak_norm(fade_out(y, ns(0.003)))


def make_slam(root, seed):
    """Typographic slam: transient + low thump + tuned supersaw power stab."""
    r = rng(seed)
    n = ns(0.9)
    t = t_axis(n)
    trans = filt(r.standard_normal((2, n)) * np.exp(-t / 0.006), 'bandpass', (1500.0, 7000.0), 2)
    thump = np.tanh(2.0 * np.sin(sweep_phase(52 + 118 * np.exp(-t / 0.03), n))
                    * np.exp(-t / 0.12))
    stab = make_stab([root, root + 7, root + 12, root + 19], 0.35, seed + 'st', cut_hi=8000.0,
                     cut_lo=700.0, tau=0.12, t60=0.7, bend=-0.6, rel=0.25)
    m = min(n, stab.shape[1])
    out = 0.6 * peak_norm(trans) + 0.9 * thump
    out[:, :m] += 0.8 * peak_norm(stab[:, :m])
    fade_in(out, 6)
    return peak_norm(fade_out(out, ns(0.05)))


def make_riser(length, f0, f1, root, octaves, seed, tone_gain=0.35):
    r = rng(seed)
    n = ns(length)
    u = np.arange(n) / n
    nz = r.standard_normal((2, n))
    nz[1] = 0.6 * nz[0] + 0.8 * nz[1]
    fc = f0 * (f1 / f0) ** (u ** 1.4)
    noise = peak_norm(tvf(nz, fc, 2.2, 'bp')) * (0.06 + 0.94 * u ** 2.2)
    f = midi_hz(root + 12.0 * octaves * u ** 1.6)
    tone = np.zeros((2, n))
    for cents, p in ((-12, -0.6), (0, 0.0), (12, 0.6)):
        tone += stereo(osc_saw(f * 2 ** (cents / 1200), n, r.random()), p)
    tone = tvf(tone, np.minimum(f * 4, 16000.0), 0.8, 'lp') * (0.04 + 0.96 * u ** 2.5)
    flutter = 1.0 - 0.25 * u * (0.5 + 0.5 * np.sin(sweep_phase(4.0 + 20.0 * u ** 2, n)))
    y = (noise + tone_gain * peak_norm(tone)) * flutter
    fade_in(y, ns(0.02))
    return peak_norm(fade_out(y, ns(0.002)))


def make_whip(seed):
    """Short rising 'fwip' ending in a sharp snap. Returns (sig, pre-roll samples)."""
    r = rng(seed)
    pre = ns(0.11)
    n = pre + ns(0.25)
    t = t_axis(n)
    u = np.clip(np.arange(n) / pre, 0, 1)
    nz = r.standard_normal((2, n))
    fw = tvf(nz, 1500.0 * (7000.0 / 1500.0) ** u, 2.0, 'bp') * np.where(
        np.arange(n) < pre, u ** 3, np.exp(-(t - pre / SR) / 0.015))
    ts = np.maximum(t - pre / SR, 0.0)
    on = (np.arange(n) >= pre).astype(float)
    snap = filt(r.standard_normal((2, n)) * np.exp(-ts / 0.004) * on, 'highpass', 2000.0, 2)
    crack = np.sin(2 * np.pi * 2400 * ts) * np.exp(-ts / 0.003) * on
    body = filt(r.standard_normal(n) * np.exp(-ts / 0.02) * on, 'bandpass', (800.0, 3000.0), 2)
    y = 0.5 * peak_norm(fw) + peak_norm(snap) + 0.4 * crack + 0.4 * peak_norm(body)
    y = stereo(y, 0.15)
    return peak_norm(fade_out(y, ns(0.02))), pre


def make_zoom_out(length, seed):
    """Descending whoosh + falling tone, widening stereo."""
    n = ns(length)
    u = np.arange(n) / n
    y = make_whoosh(length, 7000.0, 250.0, 'fall', seed, q=1.4, width=0.2, sweep_pow=0.6)
    side = make_whoosh(length, 6500.0, 300.0, 'fall', seed + 'w', q=1.4, width=1.0,
                       sweep_pow=0.6)
    y = y + side * u[None, :] ** 0.7 * np.array([[1.0], [-1.0]]) * 0.6
    tone = np.sin(sweep_phase(2400.0 * (180.0 / 2400.0) ** (u ** 0.7), n)) * (1 - u) ** 2.5
    fade_in(tone, ns(0.01))
    y = y + 0.25 * stereo(tone)
    return peak_norm(fade_out(y, ns(0.02)))


def make_whoomp(seed):
    """Deep rising 'whoomp' (columns extrude up): saturated tone rising 2 octaves
    (55 -> 220 Hz) through an opening low-pass + band-passed air push; 40 ms swell so it
    blooms right after the kick transient."""
    r = rng(seed)
    n = ns(0.7)
    t = t_axis(n)
    arc = np.sin(np.pi * np.clip(t / 0.45, 0, 1))
    f = 55.0 * 4.0 ** smoothstep(t / 0.35)
    tone = tvf(np.tanh(2.5 * np.sin(sweep_phase(f, n))), 250.0 + 2500.0 * arc, 1.2, 'lp')
    air = tvf(r.standard_normal((2, n)), 300.0 + 3000.0 * arc, 1.0, 'bp')
    y = (tone + 0.5 * peak_norm(air)) * env_ar(n, 0.04, 0.7)
    y = filt(y, 'highpass', 45.0, 2)
    return peak_norm(fade_out(y, ns(0.05)))


def make_bloop(seed):
    """Liquid bloop: sine with fast pitch drop + resonant low-pass on a saw."""
    n = ns(0.5)
    t = t_axis(n)
    f = 180.0 + 900.0 * np.exp(-t / 0.028)
    s = np.sin(sweep_phase(f, n))
    rz = tvf(osc_saw(f, n, 0.0), 250.0 + 2500.0 * np.exp(-t / 0.05), 5.0, 'lp')
    y = (0.8 * s + 0.35 * peak_norm(rz)) * env_ar(n, 0.002, 0.35)
    return peak_norm(fade_out(y, ns(0.03)))


def make_droplet(midi):
    n = ns(0.18)
    t = t_axis(n)
    f0 = float(midi_hz(midi))
    y = np.sin(sweep_phase(f0 * (1 + 0.9 * (1 - np.exp(-t / 0.018))), n)) * env_ar(n, 0.001, 0.09)
    return peak_norm(fade_out(y, ns(0.02)))


def make_gloop(midi, seed):
    """Resonant filter sweep up then down on a wobbling saw/square (blobs merge)."""
    n = ns(0.6)
    t = t_axis(n)
    f = float(midi_hz(midi)) * (1 + 0.05 * np.sin(2 * np.pi * 7 * t))
    x = 0.7 * osc_saw(f, n, 0.1) + 0.5 * osc_square(f * 1.005, n, 0.6)
    fade_in(x, ns(0.012))                             # ramp BEFORE the resonant filter
    bump = np.where(t < 0.12, smoothstep(t / 0.12), 1 - 0.65 * smoothstep((t - 0.12) / 0.33))
    y = tvf(x, 180.0 * (2400.0 / 180.0) ** bump, 7.0, 'lp')
    y = np.tanh(1.5 * peak_norm(y)) * env_ar(n, 0.008, 0.9, gate=0.45, rel=0.12)
    y = filt(y, 'highpass', 60.0, 2)
    return peak_norm(fade_out(y, ns(0.02)))


def make_pop(seed):
    r = rng(seed)
    n = ns(0.25)
    t = t_axis(n)
    s = np.sin(sweep_phase(80 + 220 * np.exp(-t / 0.01), n)) * np.exp(-t / 0.04)
    nz = filt(r.standard_normal((2, n)) * np.exp(-t / 0.012), 'highpass', 1000.0, 2)
    y = s + 0.8 * peak_norm(nz)
    fade_in(y, 6)
    return peak_norm(fade_out(y, ns(0.03)))


def make_sparkle(length, seed):
    """Granular high shimmer: short sine grains in F minor pentatonic + airy noise."""
    r = rng(seed)
    n = ns(length)
    t = t_axis(n)
    out = np.zeros((2, n))
    notes = [m for m in range(84, 109) if m % 12 in F_MINOR_PENTA]
    for _ in range(170):
        at = min(r.exponential(0.33) * length, 0.93 * length)
        dur = r.uniform(0.006, 0.03)
        gn = ns(dur)
        i = ns(at)
        if i + gn >= n:
            continue
        f = float(midi_hz(r.choice(notes)))
        g = np.sin(2 * np.pi * f * np.arange(gn) / SR + r.uniform(0, 6.3)) * np.hanning(gn)
        g *= np.exp(-at / (0.4 * length)) * r.uniform(0.3, 1.0)
        gl, gr = pan_gains(r.uniform(-0.95, 0.95))
        out[0, i:i + gn] += g * gl
        out[1, i:i + gn] += g * gr
    am = filt(np.abs(r.standard_normal(n)), 'lowpass', 40.0, 2)
    air = filt(r.standard_normal((2, n)), 'highpass', 8000.0, 4) * am * np.exp(-t / (0.35 * length))
    y = peak_norm(out) + 0.5 * peak_norm(air)
    fade_in(y, ns(0.003))
    return peak_norm(fade_out(y, ns(0.05)))


def make_suck(length, seed):
    """Reverse 'suck': reversed decaying noise burst + rising tone, wide -> centre."""
    r = rng(seed)
    n = ns(length)
    nf = ns(1.2)
    tf = t_axis(nf)
    fwd = filt(r.standard_normal((2, nf)), 'bandpass', (800.0, 9000.0), 2) * np.exp(-tf / 0.25)
    rev = fwd[:, ::-1][:, -n:]
    u = np.arange(n) / n
    mono = 0.5 * (rev[0] + rev[1])
    rev = rev * (1 - u) + mono * u                    # implode to the centre
    tone = np.sin(sweep_phase(250.0 * (1800.0 / 250.0) ** (u ** 2), n)) * u ** 3
    y = peak_norm(rev) + 0.35 * stereo(tone)
    fade_in(y, ns(0.01))
    return peak_norm(fade_out(y, 72))                 # 1.5 ms stop, exactly on the beat


def make_explosion(seed):
    r = rng(seed)
    n = ns(1.2)
    t = t_axis(n)
    imp = make_impact(seed + 'i', length=1.2, boom_hz=(75.0, 35.0))
    burst = tvf(r.standard_normal((2, n)), 800.0 + 12000.0 * np.exp(-t / 0.1), 0.7, 'lp') \
        * env_ar(n, 0.001, 0.5)
    crackle = np.zeros((2, n))
    for _ in range(90):
        i = ns(min(r.exponential(0.18), 0.9))
        crackle[r.integers(0, 2), i] += r.uniform(0.3, 1.0) * np.exp(-i / SR / 0.3)
    crackle = filt(crackle, 'bandpass', (1500.0, 9000.0), 2)
    y = imp + 0.7 * peak_norm(burst) + 0.35 * peak_norm(crackle)
    return peak_norm(fade_out(y, ns(0.15)))


def make_chirp(f0, f1, dur, seed):
    """Digital error chirp: band-limited square with exponential sweep + S&H noise."""
    r = rng(seed)
    n = ns(dur)
    u = np.arange(n) / n
    f = f0 * (f1 / f0) ** u
    ph = sweep_phase(f, n) + 2 * np.pi * r.random()
    y = np.zeros(n)
    for k in range(1, 60, 2):                         # odd harmonics, band-limited
        w = np.clip((19000.0 - k * f) / 3000.0, 0.0, 1.0)
        if not w.any():
            break
        y += np.sin(k * ph) * w / k
    y *= 0.9
    hold = max(2, int(SR / r.uniform(2500, 6000)))
    sh = np.repeat(r.uniform(-1, 1, n // hold + 1), hold)[:n]
    y += 0.35 * sh * (u > 0.5)
    y = filt(y, 'lowpass', 14000.0, 2) * env_ar(n, 0.001, dur * 2.0)
    fade_in(y, ns(0.001))
    return peak_norm(fade_out(y, ns(0.003)))


def make_shimmer(length, midis, att, t60, seed, noise_gain=0.35):
    """Bright shimmer: detuned sine pairs with vibrato/tremolo + airy noise."""
    r = rng(seed)
    n = ns(length)
    t = t_axis(n)
    out = np.zeros((2, n))
    for m in midis:
        f = float(midi_hz(m))
        for c in (-6, 6):
            vib = 1 + 0.002 * np.sin(2 * np.pi * r.uniform(4, 6) * t + r.uniform(0, 6.3))
            s = osc_sine(f * 2 ** (c / 1200) * vib, n, r.random())
            s *= 0.75 + 0.25 * np.sin(2 * np.pi * r.uniform(5, 9) * t + r.uniform(0, 6.3))
            out += stereo(s, r.uniform(-0.9, 0.9))
    am = filt(np.abs(r.standard_normal(n)), 'lowpass', 30.0, 2)
    air = filt(filt(r.standard_normal((2, n)), 'highpass', 7000.0, 4), 'lowpass', 15000.0, 2) * am
    y = (peak_norm(out) + noise_gain * peak_norm(air)) * env_ar(n, att, t60)
    return peak_norm(fade_out(y, ns(0.1)))


def make_type_tick(seed):
    r = rng(seed)
    y = make_click(seed, f=r.uniform(4200, 5400), q=4.0, low=600.0, length=0.04)
    return stereo(y, r.uniform(-0.25, 0.25))


# =====================================================================================
# MIXER
# =====================================================================================
MUSIC_BUSES = ['kick', 'clap', 'hats', 'bass', 'chords', 'cuts', 'pad', 'arp']
FX_BUSES = ['fx', 'boom', 'final']


class Mix:
    """Stereo buses (2, N).  place() cuts every event (and its sends) at the next
    CUT_POINT so tails never cross the hard silences."""

    def __init__(self):
        self.buses = {}
        self.cuts = [(b2s(b), ns(f)) for b, f in CUT_POINTS]

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, N))
        return self.buses[name]

    def place(self, name, sig, start, gain=1.0, pan=0.0, sends=None):
        sig = stereo(sig, pan) * gain
        n = sig.shape[1]
        for c, fl in self.cuts:
            if start < c < start + n:
                sig = fade_out(sig[:, :c - start].copy(), min(fl, c - start))
                n = c - start
                break
        s0, e0 = max(start, 0), min(start + n, N)
        if e0 <= s0:
            return
        seg = sig[:, s0 - start:e0 - start]
        self.bus(name)[:, s0:e0] += seg
        for sn, lvl in (sends or {}).items():
            self.bus(sn)[:, s0:e0] += seg * lvl


def beats_s(beats):
    return beats * SPB / SR


# =====================================================================================
# GROOVE RENDERER
# =====================================================================================
def render_groove(mix):
    kick = make_kick()
    for b in KICK_BEATS:
        mix.place('kick', kick, b2s(b), gain=0.82)

    claps = [make_clap('clap%d' % i) for i in range(4)]
    for i, b in enumerate(CLAP_BEATS):
        mix.place('clap', claps[i % 4], b2s(b), gain=0.70, sends={'m_room': 0.30})

    closed = [make_hat('hc%d' % i) for i in range(8)]
    opened = [make_hat('ho%d' % i, True) for i in range(4)]
    r = rng('hat-humanise')
    for k in range(int(round((GROOVE_END - GROOVE_START) * 4))):
        b = GROOVE_START + k * 0.25
        slot = k % 4
        lift = 1.05 if b >= 24.0 else 1.0
        if slot == OPEN_HAT_SLOT:
            mix.place('hats', opened[k % 4], b2s(b), gain=0.32 * lift, pan=r.uniform(-0.2, 0.2))
        else:
            sw = HAT_SWING if slot in (1, 3) else 0.0
            vel = HAT_VEL[slot] * r.uniform(0.9, 1.08)
            mix.place('hats', closed[k % 8], b2s(b + sw), gain=0.30 * vel * lift,
                      pan=r.uniform(-0.35, 0.35))

    cache = {}
    for bar in np.arange(4.0, 28.0, 4.0):
        for off, gate, octv in BASS_PATTERN:
            b = float(bar + off)
            if not BASS_START <= b < BASS_END or b in BASS_SKIP:
                continue
            key = (VOICING[chord_at(b)]['bass'] + octv, gate)
            if key not in cache:
                cache[key] = make_bass(key[0], beats_s(gate), 'bass%s' % (key,))
            mix.place('bass', cache[key], b2s(b), gain=0.52)

    for bar, cfg in STAB_BARS.items():
        for off in cfg.get('pattern', STAB_PATTERN):
            if off in cfg.get('skip', []):
                continue
            b = bar + off
            st = make_stab(VOICING[chord_at(b)]['stab'], beats_s(STAB_GATE), 'stab%.3f' % b,
                           cut_hi=cfg['cut'])
            mix.place('chords', st, b2s(b), gain=0.52 * cfg['gain'], sends={'m_plate': 0.28})

    for s, e in PAD_SPANS:
        n = b2s(e) - b2s(s) + ns(0.06)
        p = make_pad(VOICING[chord_at(s)]['pad'], n, 'pad%.2f' % s, 1900.0, 0.03, 0.06)
        mix.place('pad', p, b2s(s), gain=PAD_GAIN.get(s, 0.17))


# =====================================================================================
# CUE RENDERERS   kind -> fn(mix, beat, params)
# =====================================================================================
RENDER = {}
_LOGO = []


def cue(kind):
    def deco(fn):
        RENDER[kind] = fn
        return fn
    return deco


@cue('intro_pad')
def _(mix, beat, p):
    n = b2s(p['end']) - b2s(beat)
    u = np.arange(n) / n
    pad = make_pad(INTRO_PAD, n, 'intro-pad', 350.0 * (2200.0 / 350.0) ** u, beats_s(0.35), 0.01,
                   hp=60.0)
    mix.place('pad', pad, b2s(beat), gain=0.24)


@cue('blip')
def _(mix, beat, p):
    if not _LOGO:
        _LOGO.append(make_blip())                 # rendered once -> identical every time
    mix.place('fx', _LOGO[0], b2s(beat), gain=0.50, sends={'f_room': 0.12})


@cue('zip')
def _(mix, beat, p):
    mix.place('fx', make_zip(beats_s(p['end'] - beat)), b2s(beat), gain=0.28,
              sends={'f_plate': 0.12})


@cue('slam')
def _(mix, beat, p):
    mix.place('fx', make_slam(nm(p['root']), 'slam%.2f' % beat), b2s(beat), gain=p['gain'] * 0.85,
              sends={'f_hall': 0.16})


@cue('riser')
def _(mix, beat, p):
    y = make_riser(beats_s(p['end'] - beat), p['f0'], p['f1'], nm(p['root']), p['octaves'],
                   'riser%.2f' % beat, p.get('tone', 0.35))
    mix.place('fx', y, b2s(beat), gain=p['gain'], sends={'f_plate': 0.10})


@cue('tick_roll')
def _(mix, beat, p):
    cnt = p['count']
    u = np.linspace(0, 1, 4001)
    ui = np.interp(np.arange(cnt) / (cnt - 1), smoothstep(u), u)   # ease-in-out digits
    r = rng('tickroll')
    for i, x in enumerate(ui):
        b = beat + x * (p['end'] - beat)
        c = make_click('tick%d' % i, f=r.uniform(4500, 6500), q=5.0, low=r.uniform(1400, 1800))
        mix.place('fx', c, b2s(b), gain=0.50, pan=r.uniform(-0.3, 0.3), sends={'f_room': 0.15})


@cue('snare_roll')
def _(mix, beat, p):
    hits = p['hits']
    for i, b in enumerate(hits):
        x = i / max(1, len(hits) - 1)
        s = make_snare('snroll%.3f' % b, tune=p['tune'] * x, bright=1.0 + 0.6 * x)
        g = p['g0'] * (p['g1'] / p['g0']) ** x
        mix.place('fx', s, b2s(b), gain=g, sends={'f_room': 0.25})


@cue('drop')
def _(mix, beat, p):
    s = b2s(beat)
    mix.place('boom', make_boom(1.6, float(midi_hz(41)), float(midi_hz(29)), 0.18, 1.2), s,
              gain=0.45)
    mix.place('fx', make_airburst('air-drop', 1.4, 0.9), s, gain=0.50, sends={'f_hall': 0.15})
    mix.place('fx', make_crash('crash-drop', 2.4, 2.0), s, gain=0.90, sends={'f_hall': 0.12})
    st = make_stab(VOICING['Fm']['stab'] + [77, 80, 84], beats_s(1.5), 'stab-drop',
                   cut_hi=15000.0, cut_lo=2200.0, tau=0.3, t60=2.2, rel=0.25)
    mix.place('fx', st, s, gain=0.85, sends={'f_hall': 0.25, 'f_plate': 0.15})
    mix.place('fx', make_impact('impact-drop', boom_gain=0.0), s, gain=0.60,
              sends={'f_hall': 0.25})


@cue('whip')
def _(mix, beat, p):
    y, pre = make_whip('whip%.2f' % beat)
    mix.place('fx', y, b2s(beat) - pre, gain=0.65, sends={'f_room': 0.2})


@cue('whoosh')
def _(mix, beat, p):
    y = make_whoosh(beats_s(p['end'] - beat), p['f0'], p['f1'], p['shape'], 'whoosh%.2f' % beat,
                    pan=p['pan'])
    mix.place('fx', y, b2s(beat), gain=0.45, sends={'f_plate': 0.12})


@cue('accent')
def _(mix, beat, p):
    s, size = b2s(beat), p['size']
    lp = 7000.0 if p.get('soft') else 16000.0
    mix.place('fx', make_crash('crash%.1f' % beat, 1.0 + 1.4 * size, 0.6 + 1.2 * size, lp), s,
              gain=0.70 * size, sends={'f_hall': 0.10})
    if not p.get('soft'):
        mix.place('fx', make_impact('acc%.1f' % beat, 0.8, (120.0, 55.0), dark=1.3,
                                    boom_gain=p.get('boom', 0.5)), s,
                  gain=0.32 * size, sends={'f_hall': 0.15})


@cue('zoom_out')
def _(mix, beat, p):
    mix.place('fx', make_zoom_out(beats_s(p['end'] - beat), 'zoom%.1f' % beat), b2s(beat),
              gain=0.40, sends={'f_plate': 0.15})


@cue('ripple')
def _(mix, beat, p):
    pans, gains = [0.0, -0.35, 0.55, -0.8], [1.0, 0.8, 0.65, 0.5]
    for k, note in enumerate(p['notes']):
        b = beat + 0.125 * k
        m = make_marimba(nm(note), 'mar%.3f' % b)
        mix.place('fx', m, b2s(b), gain=0.40 * gains[k], pan=pans[k], sends={'f_plate': 0.35})
        c = make_click('rtick%.3f' % b, f=5200.0, q=3.0, low=1800.0, length=0.02)
        mix.place('fx', c, b2s(b), gain=0.08 * gains[k], pan=-pans[k])


@cue('whoomp')
def _(mix, beat, p):
    mix.place('fx', make_whoomp('whoomp'), b2s(beat), gain=1.00, sends={'f_hall': 0.1})


@cue('arp')
def _(mix, beat, p):
    steps = int(round((p['end'] - beat) * 4))
    for k in range(steps):
        b = beat + 0.25 * k
        cutoff = 2500.0 * (7000.0 / 2500.0) ** (k / max(1, steps - 1))
        note = ARP_NOTES[k % len(ARP_NOTES)]
        y = make_pluck(note, beats_s(0.22), 'arp%d' % k, cutoff)
        mix.place('arp', y, b2s(b), gain=0.28, pan=0.25 * np.sin(k * 1.7),
                  sends={'m_delay': 0.55, 'm_plate': 0.12})


@cue('bloop')
def _(mix, beat, p):
    mix.place('fx', make_bloop('bloop'), b2s(beat), gain=0.70,
              sends={'f_plate': 0.45, 'f_hall': 0.1})


@cue('droplet')
def _(mix, beat, p):
    mix.place('fx', make_droplet(nm(p['note'])), b2s(beat), gain=0.55, pan=p['pan'],
              sends={'f_plate': 0.55, 'f_hall': 0.10})


@cue('gloop')
def _(mix, beat, p):
    mix.place('fx', make_gloop(nm(p['note']), 'gloop'), b2s(beat), gain=0.50,
              sends={'f_plate': 0.30})


@cue('burst')
def _(mix, beat, p):
    mix.place('fx', make_pop('pop%.2f' % beat), b2s(beat), gain=0.42, sends={'f_plate': 0.2})
    y = make_whoosh(beats_s(p['end'] - beat), 800.0, 7500.0, 'rise', 'burstw', q=1.2,
                    pan=(0.0, 0.0), width=0.9)
    mix.place('fx', y, b2s(beat), gain=0.30, sends={'f_plate': 0.12})


@cue('sparkle')
def _(mix, beat, p):
    mix.place('fx', make_sparkle(beats_s(p['end'] - beat), 'sparkle'), b2s(beat), gain=0.70,
              sends={'f_plate': 0.35})


@cue('suck')
def _(mix, beat, p):
    y = make_suck(beats_s(p['end'] - beat), 'suck')
    mix.place('fx', y, b2s(p['end']) - y.shape[1], gain=0.40)


@cue('explosion')
def _(mix, beat, p):
    mix.place('fx', make_explosion('explosion'), b2s(beat), gain=0.70, sends={'f_hall': 0.20})


@cue('glitch')
def _(mix, beat, p):                   # stutter edit happens in apply_glitch(); chirps here
    for i, (b, f0, f1, dur, g, pan) in enumerate(GLITCH['chirps']):
        mix.place('fx', make_chirp(f0, f1, beats_s(dur), 'chirp%d' % i), b2s(b), gain=0.17 * g,
                  pan=pan)


@cue('impact')
def _(mix, beat, p):
    s = b2s(beat)
    mix.place('boom', make_boom(1.0, float(midi_hz(49)), float(midi_hz(37)), 0.12, 0.9), s,
              gain=0.52)
    mix.place('fx', make_crash('crash-24', 2.0, 1.6), s, gain=0.75, sends={'f_hall': 0.12})
    mix.place('fx', make_airburst('air-24', 1.0, 0.6), s, gain=0.30)
    mix.place('fx', make_impact('impact-24', boom_gain=0.0), s, gain=0.45, sends={'f_hall': 0.2})


def make_cut_hit(seed):
    r = rng(seed)
    n = ns(0.18)
    t = t_axis(n)
    nz = filt(r.standard_normal((2, n)) * np.exp(-t / 0.012), 'bandpass', (3000.0, 9000.0), 2)
    tok = np.sin(sweep_phase(800 + 300 * np.exp(-t / 0.01), n)) * np.exp(-t / 0.015)
    low = np.sin(sweep_phase(95 + 60 * np.exp(-t / 0.01), n)) * np.exp(-t / 0.03)
    y = peak_norm(nz) + 0.5 * tok + 0.5 * low
    fade_in(y, 4)
    return peak_norm(fade_out(y, ns(0.02)))


@cue('cut')
def _(mix, beat, p):
    s = b2s(beat)
    acc = (1.15 if p.get('accent') else 1.0) * (1.0 + 0.3 * (beat - 24.0) / 3.5)   # crescendo
    gate = p.get('gate', 0.30)
    st = make_stab(VOICING[chord_at(beat)]['stab'], beats_s(gate), 'cut%.2f' % beat,
                   cut_hi=11000.0, cut_lo=1500.0, tau=0.06, t60=0.35, bend=-0.2)
    mix.place('cuts', st, s, gain=0.55 * acc, sends={'m_plate': 0.15})
    side = -0.3 if int(round(beat * 2)) % 2 == 0 else 0.3
    mix.place('fx', make_cut_hit('cuthit%.2f' % beat), s, gain=0.58 * acc, pan=side,
              sends={'f_room': 0.2})


@cue('final_hit')
def _(mix, beat, p):
    s = b2s(beat)
    n = N - s
    mix.place('final', make_kick(0.5, 170.0, 46.0, 0.035, 380.0, 2.0, 0.45, 0.08, 0.05, 'kfin'),
              s, gain=0.95)
    mix.place('final', make_boom(2.0, float(midi_hz(41)), 33.0, 0.35, 1.4), s, gain=0.55)
    mix.place('fx', make_airburst('air-final', 1.8, 1.4), s, gain=0.55, sends={'f_hall': 0.2})
    mix.place('fx', make_crash('crash-final', 2.2, 1.7), s, gain=0.90, sends={'f_hall': 0.15})
    mix.place('fx', make_impact('impact-final', 1.5, boom_gain=0.0), s, gain=0.55,
              sends={'f_hall': 0.3})
    t = t_axis(n)
    chord = supersaw(VOICING['Fm9']['stab'], n, rng('fm9'), cents=26.0, width=1.0)
    chord = tvf(chord, 2200.0 + 10000.0 * np.exp(-t / 0.6), 0.8, 'lp')
    late = np.exp(-6.907755 * np.maximum(t - 1.2, 0.0) / 4.3)     # 2nd decay stage
    chord = filt(chord, 'highpass', 120.0, 2) * env_ar(n, 0.003, 3.4) * late
    fade_out(chord, ns(0.3))
    mix.place('final', chord, s, gain=0.85, sends={'f_hall': 0.45, 'f_plate': 0.1})
    low = osc_saw(float(midi_hz(41)), n, 0.3)
    low = filt(filt(low, 'lowpass', 400.0, 2), 'highpass', 110.0, 2) * env_ar(n, 0.004, 1.8)
    mix.place('final', fade_out(low, ns(0.3)), s, gain=0.18)
    sh = make_shimmer(n / SR, [84, 89, 91, 96], 0.12, 2.4, 'shimmer-final') * late
    mix.place('final', sh, s, gain=0.30, sends={'f_hall': 0.6})


@cue('shimmer_swell')
def _(mix, beat, p):
    y = make_shimmer(1.4, [96, 103, 108], 0.30, 1.5, 'shimmer-29', noise_gain=0.8)
    mix.place('fx', y, b2s(beat), gain=0.55, sends={'f_hall': 0.5})


@cue('type_tick')
def _(mix, beat, p):
    mix.place('fx', make_type_tick('type%.4f' % beat), b2s(beat), gain=0.40,
              sends={'f_room': 0.2})


def render_cues(mix):
    for beat, kind, params in CUES:
        RENDER[kind](mix, beat, params)


# =====================================================================================
# ASSEMBLY: reverbs / delay (segmented), sidechain
# =====================================================================================
def assemble(mix):
    irs = {'room': make_ir(0.45, 0.8, 0.008, 'ir-room', hp=300.0, lp=9000.0),
           'plate': make_ir(1.4, 2.2, 0.022, 'ir-plate', hp=350.0, lp=11000.0),
           'hall': make_ir(2.9, 4.2, 0.030, 'ir-hall', hp=180.0, lp=9000.0)}
    ret = {}
    for send, kind in [('m_room', 'room'), ('m_plate', 'plate'), ('f_room', 'room'),
                       ('f_plate', 'plate'), ('f_hall', 'hall')]:
        ret[send] = segmented(lambda x, ir=irs[kind]: conv_reverb(x, ir), mix.bus(send))
    ret['m_delay'] = segmented(pingpong, mix.bus('m_delay'))
    sc = {k: sidechain_env(KICK_BEATS, d, r) for k, (d, r) in SIDECHAIN.items()}
    B = mix.bus
    stems = {
        'kick': B('kick'),
        'clap': B('clap') + ret['m_room'],
        'hats': B('hats'),
        'bass': B('bass') * sc['bass'],
        'chords': (B('chords') + ret['m_plate']) * sc['chords'],
        'cuts': B('cuts') * sc['cuts'],
        'pad': B('pad') * sc['pad'],
        'arp': (B('arp') + ret['m_delay']) * sc['arp'],
        'fx': B('fx'),
        'fx_verb': ret['f_room'] + ret['f_plate'] + ret['f_hall'],
        'boom': B('boom') * sc['boom'],
        'final': B('final'),
    }
    music = sum(stems[k] for k in MUSIC_BUSES)
    fx = sum(stems[k] for k in ('fx', 'fx_verb', 'boom', 'final'))
    return music, fx, stems


# =====================================================================================
# GLITCH BREAK: beat-repeat / stutter / pitch-rise / bit-crush ramp / tape-stop
# =====================================================================================
def bitcrush(x, bits, hold):
    """Sample-and-hold + quantiser with per-sample params, run at 2x oversampling."""
    up = signal.resample_poly(x, 2, 1, axis=-1)
    n2 = up.shape[-1]
    hold2 = np.repeat(hold, 2)[:n2] * 2.0
    k = np.floor(np.cumsum(1.0 / hold2)).astype(np.int64)
    change = np.concatenate([[True], k[1:] != k[:-1]])
    idx = np.maximum.accumulate(np.where(change, np.arange(n2), 0))
    q = 2.0 ** (np.repeat(bits, 2)[:n2] - 1.0)
    y = np.round(up[:, idx] * q) / q
    return signal.resample_poly(y, 1, 2, axis=-1)[:, :x.shape[-1]]


def apply_glitch(music):
    G = GLITCH
    g0, g1 = b2s(G['start']), b2s(G['end'])
    L = g1 - g0
    xf = ns(G['xfade_ms'] / 1000.0)
    w_in = 0.5 - 0.5 * np.cos(np.pi * (np.arange(xf) + 0.5) / xf)
    buf = np.zeros((2, L + xf))                      # stutter plays
    tape = np.zeros((2, L + xf))                     # tape-stop

    def read(pos):
        i = np.floor(pos).astype(np.int64)
        fr = pos - i
        return music[:, i] * (1 - fr) + music[:, i + 1] * fr

    for st in G['stutters']:
        src = b2s(st['slice_start'])
        sl = b2s(st['slice_start'] + st['slice_len']) - src
        for play, semi in zip(st['plays'], st['pitch']):
            d = b2s(play) - g0
            seg = read(src + np.arange(sl + xf) * 2.0 ** (semi / 12.0))
            w = np.ones(sl + xf)
            w[:xf] = w_in
            w[sl:] = 1.0 - w_in                      # crossfades into the next play
            buf[:, d:d + sl + xf] += seg * w * st['gain']

    ts = G['tape_stop']
    d0 = b2s(ts['start']) - g0
    T = b2s(ts['end']) - b2s(ts['start'])
    u = np.arange(T) / T
    rate = (1.0 - u) ** ts['curve']
    seg = read(b2s(ts['src']) + np.concatenate([[0.0], np.cumsum(rate)[:-1]]))
    seg = tvf(seg, 150.0 + 16000.0 * rate, 0.707, 'lp')
    amp = (1.0 - u) ** 0.8 * ts['gain']
    amp[:xf] *= w_in
    tape[:, d0:d0 + T] += seg * amp

    u = np.clip(np.arange(L + xf) / (b2s(G['ramp_end']) - g0), 0.0, 1.0)
    buf = tvf(buf, G['hpf'][0] * (G['hpf'][1] / G['hpf'][0]) ** u, 0.707, 'hp')
    buf = buf + filt(tape, 'highpass', ts['hpf'], 2)
    u = u[:L]
    bits = G['crush_bits'][0] + (G['crush_bits'][1] - G['crush_bits'][0]) * u
    hold = G['crush_hold'][0] + (G['crush_hold'][1] - G['crush_hold'][0]) * u ** 2
    scale = max(1e-9, np.max(np.abs(buf)))
    crushed = bitcrush(buf[:, :L] / scale, bits, hold) * scale
    fade_out(crushed, ns(0.004))

    out = music.copy()
    keep = np.zeros(L)
    keep[:xf] = 1.0 - w_in                           # seamless entry (first slice = original)
    out[:, g0:g1] = music[:, g0:g1] * keep + crushed
    return out


def glitch_schedule():
    def when(beat):
        s = b2s(beat)
        return dict(beat=beat, seconds=round(s / SR, 6), sample=s,
                    frame=round(beat * FRAMES_PER_BEAT, 4),
                    frame_nearest=int(np.floor(beat * FRAMES_PER_BEAT + 0.5)))

    events = []
    for st in GLITCH['stutters']:
        for k, (play, semi) in enumerate(zip(st['plays'], st['pitch'])):
            events.append(dict(
                type='repeat', group=st['name'], repeat_index=k,
                start=when(play), end=when(play + st['slice_len']),
                slice_start=when(st['slice_start']),
                slice_end=when(st['slice_start'] + st['slice_len']),
                slice_len_beats=st['slice_len'], pitch_semitones=semi,
                playback_rate=round(2.0 ** (semi / 12.0), 6),
                freeze_frame=int(np.floor(st['slice_start'] * FRAMES_PER_BEAT + 1e-9)),
                video_hint='show source frame %.2f (slice start) at frame %.2f'
                           % (st['slice_start'] * FRAMES_PER_BEAT, play * FRAMES_PER_BEAT)))
    ts = GLITCH['tape_stop']
    events.append(dict(type='tape_stop', start=when(ts['start']), end=when(ts['end']),
                       source_start=when(ts['src']), rate_curve='(1-u)^%.2f' % ts['curve'],
                       video_hint='slow the image to a stop / fade to black by frame %.2f'
                                  % (ts['end'] * FRAMES_PER_BEAT)))
    return dict(
        description='Glitch break stutter schedule (music bus beat-repeat). A repeat plays the '
                    'audio slice [slice_start, slice_end) again starting at start. frame = exact '
                    '60 fps frame (0.125/0.0625-beat repeats land on half/quarter frames); '
                    'frame_nearest = rounded frame for the cut.',
        grid=dict(sample_rate=SR, fps=FPS, frames_per_beat=FRAMES_PER_BEAT,
                  samples_per_beat=SPB, bpm=BPM, beat_seconds=SPB / SR),
        break_start=when(GLITCH['start']), break_end=when(GLITCH['end']),
        bitcrush=dict(bits_from_to=GLITCH['crush_bits'],
                      sample_rate_reduction_from_to=GLITCH['crush_hold'],
                      highpass_hz_from_to=GLITCH['hpf'],
                      ramp='linear bits, quadratic sample-hold, exponential high-pass; '
                           'ramps from %.2f to %.2f beats, then held'
                           % (GLITCH['start'], GLITCH['ramp_end'])),
        crossfade_ms=GLITCH['xfade_ms'],
        events=events,
        error_chirps=[dict(when(b), f_start_hz=f0, f_end_hz=f1, dur_beats=d)
                      for b, f0, f1, d, _, _ in GLITCH['chirps']],
    )


# =====================================================================================
# MASTER: 30 Hz HPF, mono lows, glue comp, soft clip, true-peak look-ahead limiter
# =====================================================================================
K_B1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
K_A1 = [1.0, -1.69065929318241, 0.73248077421585]
K_B2 = [1.0, -2.0, 1.0]
K_A2 = [1.0, -1.99004745483398, 0.99007225036621]


def lufs(x):
    """ITU-R BS.1770-4 integrated loudness (48 kHz K-weighting, gated)."""
    y = signal.lfilter(K_B2, K_A2, signal.lfilter(K_B1, K_A1, x, axis=-1), axis=-1)
    cs = np.concatenate([np.zeros((2, 1)), np.cumsum(y ** 2, axis=-1)], axis=-1)
    blk, hop = ns(0.4), ns(0.1)
    st = np.arange(0, x.shape[-1] - blk + 1, hop)
    z = ((cs[:, st + blk] - cs[:, st]) / blk).sum(0)
    l = -0.691 + 10 * np.log10(z + 1e-20)
    g = l > -70.0
    if not g.any():
        return -np.inf
    rel = -0.691 + 10 * np.log10(np.mean(z[g])) - 10.0
    g &= l > rel
    return -0.691 + 10 * np.log10(np.mean(z[g]))


def momentary(x):
    y = signal.lfilter(K_B2, K_A2, signal.lfilter(K_B1, K_A1, x, axis=-1), axis=-1)
    cs = np.concatenate([np.zeros((2, 1)), np.cumsum(y ** 2, axis=-1)], axis=-1)
    blk, hop = ns(0.4), ns(0.05)
    st = np.arange(0, x.shape[-1] - blk + 1, hop)
    z = ((cs[:, st + blk] - cs[:, st]) / blk).sum(0)
    return st, -0.691 + 10 * np.log10(z + 1e-20)


def true_peak_db(x):
    up = signal.resample_poly(x, 4, 1, axis=-1)
    return 20 * np.log10(np.max(np.abs(up)) + 1e-20)


def glue_comp(x, thr_db=-17.0, ratio=2.0, knee=6.0, att=0.02, rel=0.18, blk=32):
    d = filt(x, 'highpass', 120.0, 2)                 # side-chain filter on the detector
    ms = signal.lfilter(np.ones(ns(0.01)) / ns(0.01), [1.0], 0.5 * (d[0] ** 2 + d[1] ** 2))
    det = 10 * np.log10(ms[::blk] + 1e-12)
    over = det - thr_db
    slope = 1.0 - 1.0 / ratio
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * slope, slope * (over + knee / 2) ** 2 / (2 * knee)))
    aa, ar = np.exp(-blk / (att * SR)), np.exp(-blk / (rel * SR))
    sm = np.empty_like(gr)
    prev = 0.0
    for i, v in enumerate(gr):
        a = aa if v > prev else ar
        prev = a * prev + (1 - a) * v
        sm[i] = prev
    gain = 10 ** (-np.interp(np.arange(x.shape[-1]), np.arange(sm.size) * blk, sm) / 20)
    return x * gain, float(np.max(sm))


def soft_clip(x, c):
    """Gentle soft clipper (linear below 0.7*c, tanh knee above), 4x oversampled."""
    k, top = 0.7 * c, 1.25 * c
    up = signal.resample_poly(x, 4, 1, axis=-1)
    a = np.abs(up)
    y = np.where(a <= k, up, np.sign(up) * (k + (top - k) * np.tanh((a - k) / (top - k))))
    return signal.resample_poly(y, 1, 4, axis=-1)


def limiter(x, ceiling_db, look=0.0015, rel=0.07, blk=16):
    """Look-ahead limiter with 4x-oversampled (true-peak) detection. Gain is the
    forward-looking min of the required gain, release-smoothed, then box-smoothed over
    the look-ahead window -> gain is already down when the peak arrives (no latency)."""
    c = 10 ** (ceiling_db / 20.0)
    n = x.shape[-1]
    up = np.abs(signal.resample_poly(x, 4, 1, axis=-1)).max(0)[:4 * n].reshape(n, 4).max(1)
    pk = np.maximum(up, np.abs(x).max(0))
    r = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    L = ns(look) // 2 * 2
    m = minimum_filter1d(r, size=L + 1, origin=-(L // 2), mode='nearest')   # window [i, i+L]
    nb = (n + blk - 1) // blk
    mb = np.pad(m, (0, nb * blk - n), constant_values=1.0).reshape(nb, blk).min(1)
    a = np.exp(-blk / (rel * SR))
    h = np.empty(nb)
    prev = 1.0
    for i, v in enumerate(mb):
        prev = v if v < prev else v + (prev - v) * a
        h[i] = prev
    g = np.convolve(np.concatenate([np.ones(L), np.repeat(h, blk)[:n]]),
                    np.ones(L + 1) / (L + 1), 'valid')
    return x * g, float(20 * np.log10(np.min(g)))


def apply_gates(y):
    f = ns(0.002)
    for b0, b1 in HARD_GAPS:
        s, e = b2s(b0), b2s(b1)
        fade_out(y[:, s - f:s], f)
        y[:, s:e] = 0.0
    fade_out(y, ns(FINAL_FADE_S))
    return y


def master(pre):
    x = filt(pre, 'highpass', 30.0, 2)
    mid, side = 0.5 * (x[0] + x[1]), 0.5 * (x[0] - x[1])
    side = filt(side, 'highpass', 120.0, 2)                 # mono below ~120 Hz
    x = np.stack([mid + side, mid - side])
    x = x * 10 ** ((-18.0 - lufs(apply_gates(x.copy()))) / 20.0)
    x, comp_gr = glue_comp(x)
    c = 10 ** (TP_CEILING_DB / 20.0)
    hist = []
    drive = 7.0
    for _ in range(10):
        y, lim_gr = limiter(soft_clip(x * 10 ** (drive / 20.0), c), TP_CEILING_DB)
        y = apply_gates(y)
        L = lufs(y)
        hist.append((drive, L))
        if abs(L - TARGET_LUFS) < 0.03:
            break
        if len(hist) > 1 and abs(hist[-1][1] - hist[-2][1]) > 1e-3:
            slope = (hist[-1][1] - hist[-2][1]) / (hist[-1][0] - hist[-2][0])
            slope = float(np.clip(slope, 0.2, 1.5))
        else:
            slope = 0.7
        drive += (TARGET_LUFS - L) / slope
    tp = true_peak_db(y)
    if tp > TP_CEILING_DB + 0.1:                            # safety net
        y *= 10 ** ((TP_CEILING_DB - tp) / 20.0)
    info = dict(drive_db=drive, glue_gr_db_max=comp_gr, limiter_gr_db_max=-lim_gr,
                lufs=lufs(y), true_peak_db=true_peak_db(y),
                sample_peak_db=20 * np.log10(np.max(np.abs(y))), iterations=len(hist))
    return y, info


# =====================================================================================
# REPORTING / REVIEW
# =====================================================================================
SECTIONS = [(0, 4, 'INTRO'), (4, 8, 'S1 type'), (8, 12, 'S2 grid'), (12, 16, 'S3 3D'),
            (16, 20, 'S4 liquid'), (20, 24, 'S5 particles/glitch'), (24, 28, 'S6 rapid'),
            (28, TOTAL_BEATS, 'OUTRO')]


def db(x):
    return 10 * np.log10(x + 1e-20)


def per_beat_table(y):
    rows = []
    for b in range(33):
        s, e = b2s(b), min(N, b2s(b + 1))
        if s >= N:
            break
        seg = y[:, s:e]
        rows.append((b, db(np.mean(seg ** 2)), db(np.max(np.abs(seg)) ** 2)))
    return rows


def print_report(y, info, stems, pre, elapsed):
    print('\n=== MASTER ===')
    print('integrated loudness : %.2f LUFS (target %.1f)' % (info['lufs'], TARGET_LUFS))
    print('true peak (4x)      : %.2f dBTP   sample peak: %.2f dBFS'
          % (info['true_peak_db'], info['sample_peak_db']))
    print('glue comp max GR    : %.2f dB   limiter max GR: %.2f dB   drive: %.2f dB (%d it)'
          % (info['glue_gr_db_max'], info['limiter_gr_db_max'], info['drive_db'],
             info['iterations']))
    print('samples: %d  (%.6f s)   NaN: %s' % (y.shape[1], y.shape[1] / SR, np.isnan(y).any()))
    for b0, b1 in HARD_GAPS:
        seg = y[:, b2s(b0):b2s(b1)]
        print('gap %.2f-%.2f max|x| = %.3g  (digital zero: %s)'
              % (b0, b1, np.max(np.abs(seg)), not np.any(seg)))
    print('last 10 samples max|x| = %.3g' % np.max(np.abs(y[:, -10:])))
    st, ml = momentary(y)
    top = np.argsort(ml)[::-1][:6]
    print('loudest momentary (400 ms) windows start at beats:',
          ', '.join('%.2f (%.1f LUFS)' % (st[i] / SPB, ml[i]) for i in top))
    sb = st / SPB
    near = lambda b: (sb >= b - 0.1) & (sb <= b + 0.55)
    away = ~((sb > 4.0 - 0.9) & (sb < 4.6)) & ~((sb > 28.0 - 0.9) & (sb < 28.6))
    print('momentary max: DROP@4 %.2f  FINAL@28 %.2f  everything else %.2f LUFS (at beat %.2f)'
          % (ml[near(4.0)].max(), ml[near(28.0)].max(), ml[away].max(),
             sb[away][np.argmax(ml[away])]))
    print('\n=== PER-BEAT RMS (dBFS) ===')
    for b, rms, pk in per_beat_table(y):
        bar = '#' * max(0, int((rms + 40) * 1.2))
        print('beat %2d  %6.2f s  rms %6.1f  peak %6.1f  %s' % (b, b2s(b) / SR, rms, pk, bar))
    print('\n=== STEM RMS per section (dB, pre-master scale) ===')
    names = list(stems)
    print('%-20s' % 'section' + ''.join('%8s' % k[:7] for k in names) + '     mix')
    for s0, s1, lab in SECTIONS:
        a, b = b2s(s0), min(N, b2s(s1))
        row = ''.join('%8.1f' % db(np.mean(stems[k][:, a:b] ** 2)) for k in names)
        print('%-20s' % lab + row + '%8.1f' % db(np.mean(pre[:, a:b] ** 2)))
    print('\nrender time: %.1f s' % elapsed)


def cue_sheet():
    rows = []
    for beat, kind, p in CUES:
        rows.append(dict(beat=beat, seconds=round(b2s(beat) / SR, 6), sample=b2s(beat),
                         frame=round(beat * FRAMES_PER_BEAT, 3), kind=kind,
                         params={k: v for k, v in p.items()}))
    return rows


def review(y):
    import subprocess
    os.makedirs(REVIEW_DIR, exist_ok=True)
    with open(os.path.join(REVIEW_DIR, 'cue_sheet.json'), 'w') as fh:
        json.dump(cue_sheet(), fh, indent=1, default=float)
    ff = '/usr/local/bin/ffmpeg'
    if os.path.exists(ff):
        subprocess.run([ff, '-v', 'error', '-y', '-i', WAV_PATH, '-lavfi',
                        'showspectrumpic=s=1800x700:legend=1:scale=log:fscale=log',
                        os.path.join(REVIEW_DIR, 'ffmpeg_spectrum.png')], check=False)
        subprocess.run([ff, '-v', 'error', '-y', '-i', WAV_PATH, '-lavfi',
                        'showwavespic=s=1800x500:split_channels=1:scale=lin',
                        os.path.join(REVIEW_DIR, 'ffmpeg_waveform.png')], check=False)
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
    except ImportError:
        print('matplotlib not installed -> only ffmpeg review images written')
        return
    mono = 0.5 * (y[0] + y[1])

    def grid(ax, b0, b1, label=True):
        for b in np.arange(np.ceil(b0 * 4) / 4, b1 + 1e-9, 0.25):
            full = abs(b - round(b)) < 1e-9
            ax.axvline(b, color='w' if full else '0.6', lw=0.6 if full else 0.25,
                       alpha=0.55 if full else 0.35)
        for g0, g1 in HARD_GAPS:
            ax.axvspan(g0, g1, color='red', alpha=0.15)
        ax.axvspan(GLITCH['start'], GLITCH['end'], color='yellow', alpha=0.06)
        if label:
            for beat, kind, _ in CUES:
                if b0 <= beat <= b1:
                    ax.text(beat, 1.0, kind, rotation=90, fontsize=6, color='k',
                            transform=ax.get_xaxis_transform(), va='bottom', ha='center')

    def spec(ax, b0, b1, nfft=2048):
        a, b = b2s(b0), min(N, b2s(b1))
        f, t, S = signal.spectrogram(mono[a:b], SR, nperseg=nfft, noverlap=nfft - 256)
        ax.pcolormesh(b0 + t * SR / SPB, f, 10 * np.log10(S + 1e-14), vmin=-130, vmax=-40,
                      shading='auto', cmap='magma')
        ax.set_yscale('symlog', linthresh=200)
        ax.set_ylim(30, 20000)
        ax.set_ylabel('Hz')
        grid(ax, b0, b1)

    def wave(ax, b0, b1):
        a, b = b2s(b0), min(N, b2s(b1))
        x = np.arange(a, b) / SPB
        ax.plot(x, y[0, a:b], lw=0.3, color='tab:blue')
        ax.plot(x, y[1, a:b], lw=0.3, color='tab:orange', alpha=0.6)
        ax.set_ylim(-1, 1)
        ax.set_facecolor('0.15')
        grid(ax, b0, b1, label=False)
        ax.set_xlim(b0, b1)

    fig, axs = plt.subplots(3, 1, figsize=(22, 13), sharex=True,
                            gridspec_kw=dict(height_ratios=[3, 1.4, 1.2]))
    spec(axs[0], 0, TOTAL_BEATS)
    wave(axs[1], 0, TOTAL_BEATS)
    st, ml = momentary(y)
    axs[2].plot((st + ns(0.2)) / SPB, ml, color='k', lw=0.8)
    axs[2].set_ylim(-40, -2)
    axs[2].set_ylabel('momentary LUFS')
    for b0, b1, lab in SECTIONS:
        axs[2].text(b0 + 0.1, -38, lab, fontsize=8)
    grid(axs[2], 0, TOTAL_BEATS, label=False)
    axs[2].set_xlabel('beats (1 beat = 28 frames = 0.4667 s)')
    fig.suptitle('Showreel soundtrack -- %.2f LUFS, %.2f dBTP' % (lufs(y), true_peak_db(y)))
    fig.tight_layout()
    fig.savefig(os.path.join(REVIEW_DIR, 'overview.png'), dpi=90)
    plt.close(fig)

    for name, b0, b1 in [('zoom_predrop', 3.0, 5.0), ('zoom_glitch', 22.0, 24.6),
                         ('zoom_final', 27.0, 29.0), ('zoom_intro', 0.0, 3.0),
                         ('zoom_rapid', 23.8, 28.2), ('zoom_outro', 27.9, TOTAL_BEATS)]:
        fig, axs = plt.subplots(2, 1, figsize=(16, 8), sharex=True)
        spec(axs[0], b0, b1, nfft=1024)
        wave(axs[1], b0, b1)
        axs[1].set_xlabel('beats')
        fig.tight_layout()
        fig.savefig(os.path.join(REVIEW_DIR, name + '.png'), dpi=90)
        plt.close(fig)
    print('review images ->', REVIEW_DIR)


# =====================================================================================
# MAIN
# =====================================================================================
def main():
    t0 = time.time()
    assert SPB == 22400 and SPF == 800 and N == 720000
    mix = Mix()
    render_groove(mix)
    render_cues(mix)
    music, fx, stems = assemble(mix)
    music = apply_glitch(music)
    pre = music + fx
    y, info = master(pre)
    assert y.shape == (2, N) and np.all(np.isfinite(y))
    os.makedirs(BUILD, exist_ok=True)
    wavfile.write(WAV_PATH, SR, np.ascontiguousarray(y.T).astype(np.float32))
    with open(GLITCH_JSON, 'w') as fh:
        json.dump(glitch_schedule(), fh, indent=2)
    print('wrote', WAV_PATH)
    print('wrote', GLITCH_JSON)
    print_report(y, info, stems, pre, time.time() - t0)
    if '--review' in sys.argv:
        review(y)


if __name__ == '__main__':
    main()
