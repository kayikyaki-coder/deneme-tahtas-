#!/usr/bin/env python3
"""Procedural 5.0 s sound-design bed for the "Hayirli Cumalar" motion graphic.

No instruments, no beat, no voices: air/wind texture, a soft low D drone,
glassy sine-partial ticks/sparkles, a light-bloom whoosh and a warm resolve.

Output: ../build/cuma_audio.wav  (48 kHz, stereo, float32, 240000 samples)
Loudness target ~ -16 LUFS integrated, true peak <= -1.5 dBFS.
Deterministic (fixed seeds).
"""
import os
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
DUR = 5.0
N = int(SR * DUR)  # 240000
t = np.arange(N) / SR

TARGET_LUFS = -16.0
TP_CEIL_DB = -1.8  # internal ceiling, a little below the -1.5 dBFS spec

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "build", "cuma_audio.wav"))


# ----------------------------------------------------------------- helpers
def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def ramp(t0, t1):
    """0 before t0, smooth rise to 1 at t1."""
    return smoothstep((t - t0) / (t1 - t0))


def bump(t_peak, rise, fall):
    """Smooth swell: rises over `rise` s to 1 at t_peak, falls over `fall` s."""
    up = smoothstep((t - (t_peak - rise)) / rise)
    down = 1.0 - smoothstep((t - t_peak) / fall)
    return np.where(t < t_peak, up, down)


def band(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lowpass(x, fc, order=2):
    sos = signal.butter(order, fc, btype="low", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def pink(rng, n):
    """Pink-ish noise via 1/f spectral shaping."""
    w = rng.standard_normal(n)
    X = np.fft.rfft(w)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    X /= np.sqrt(f)
    y = np.fft.irfft(X, n)
    return y / np.std(y)


def pan(x, p):
    """Equal-power pan, p in [-1, 1]."""
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)])


def ping(t0, freqs, amps, decay, attack=0.004, detune=0.0, p=0.0, rng=None):
    """Glassy sine-partial ping starting at t0 (stereo)."""
    out = np.zeros((2, N))
    i0 = int(round(t0 * SR))
    L = N - i0
    if L <= 0:
        return out
    tt = np.arange(L) / SR
    env = (1 - np.exp(-tt / attack)) * np.exp(-tt / decay)
    env *= smoothstep(tt / (attack * 3))  # guarantees a click-free start
    for k, (f, a) in enumerate(zip(freqs, amps)):
        if f >= 9500:
            continue
        ph = 0.0 if rng is None else rng.uniform(0, 2 * np.pi)
        # higher partials decay faster -> soft, glassy, not harsh
        d = decay / (1 + 0.6 * k)
        e = (1 - np.exp(-tt / attack)) * np.exp(-tt / d) * smoothstep(tt / (attack * 3))
        sl = np.sin(2 * np.pi * f * (1 - detune) * tt + ph)
        sr = np.sin(2 * np.pi * f * (1 + detune) * tt + ph + 0.3)
        g = np.array([np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)])
        out[0, i0:] += a * e * sl * g[0] * np.sqrt(2)
        out[1, i0:] += a * e * sr * g[1] * np.sqrt(2)
    del env
    return out


# --------------------------------------------------------------- K-weighting
def k_weight(x):
    # BS.1770 pre-filter + RLB filter, coefficients for 48 kHz
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=-1), axis=-1)


def lufs_integrated(x):
    y = k_weight(x)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    pw = []
    for s in range(0, x.shape[1] - blk + 1, hop):
        pw.append(np.sum(np.mean(y[:, s:s + blk] ** 2, axis=1)))
    pw = np.array(pw)
    l = -0.691 + 10 * np.log10(pw + 1e-20)
    g = pw[l > -70]
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    g2 = pw[(l > -70) & (l > rel)]
    return -0.691 + 10 * np.log10(np.mean(g2))


def true_peak_db(x):
    up = signal.resample_poly(x, 4, 1, axis=-1)
    return 20 * np.log10(np.max(np.abs(up)) + 1e-20)


# ================================================================ synthesis
def build():
    mix = np.zeros((2, N))

    # ---- 1. warm air / wind bed (stereo decorrelated) --------------------
    rng = np.random.default_rng(1001)
    air = np.stack([pink(rng, N), pink(rng, N)])
    air = band(air, 180, 3200)
    gust = 0.75 + 0.25 * np.sin(2 * np.pi * 0.23 * t + 0.4) \
        + 0.10 * np.sin(2 * np.pi * 0.61 * t + 1.7)
    air_env = 0.55 + 0.20 * ramp(0.2, 1.6) + 0.15 * bump(1.8, 0.25, 0.9)
    mix += 0.060 * air * gust * air_env

    # ---- 2. rising airy texture during pattern draw (0.20-1.60) ----------
    rng = np.random.default_rng(2002)
    hiss = np.stack([rng.standard_normal(N), rng.standard_normal(N)])
    # crossfade three bands upward so the texture "rises"
    b_lo = band(hiss, 900, 2200)
    b_mid = band(hiss, 1800, 4000)
    b_hi = band(hiss, 3200, 7000)
    x = np.clip((t - 0.2) / 1.4, 0, 1)
    w_lo = np.cos(x * np.pi / 2) ** 2
    w_hi = np.sin(x * np.pi / 2) ** 2
    w_mid = 1 - np.abs(2 * x - 1)
    rise_env = ramp(0.2, 0.7) * (1 - smoothstep((t - 1.55) / 0.45))
    rise = (0.7 * w_lo * b_lo + 0.6 * w_mid * b_mid + 0.45 * w_hi * b_hi)
    mix += 0.022 * rise * rise_env * (0.6 + 0.4 * x)

    # ---- 3. low D drone with slow swell + breathing ----------------------
    D2 = 73.416
    drone_parts = [(D2, 1.0), (2 * D2, 0.55), (3 * D2, 0.22), (4 * D2, 0.10)]
    breathe = 0.85 + 0.15 * np.sin(2 * np.pi * 0.2 * t - np.pi / 2)
    swell = 0.55 + 0.45 * ramp(0.0, 2.0)
    for ch, det in ((0, -0.0011), (1, 0.0011)):
        d = np.zeros(N)
        for k, (f, a) in enumerate(drone_parts):
            d += a * np.sin(2 * np.pi * f * (1 + det * (k + 1)) * t + 0.7 * k)
        mix[ch] += 0.085 * d * breathe * swell

    # ---- 4. glassy ticks during pattern draw -----------------------------
    rng = np.random.default_rng(3003)
    tick_times = [0.35, 0.60, 0.85, 1.10, 1.35]
    tick_freqs = [2349.3, 2637.0, 2793.8, 3135.9, 3520.0]  # rising, not a tune
    for i, (tt0, f) in enumerate(zip(tick_times, tick_freqs)):
        p = -0.5 + i * 0.25
        mix += ping(tt0, [f, f * 2.756, f * 1.501], [0.030, 0.008, 0.010],
                    decay=0.09, attack=0.0015, detune=0.0008, p=p, rng=rng)

    # ---- 5. light bloom whoosh, 1.60 -> peak 1.80 ------------------------
    rng = np.random.default_rng(4004)
    bn = np.stack([pink(rng, N), pink(rng, N)])
    i0, i1 = int(1.40 * SR), int(3.20 * SR)
    seg = bn[:, i0:i1]
    ts = t[i0:i1]
    # time-varying one-pole lowpass: cutoff opens towards the peak
    fc = 400 + 4200 * bump(1.80, 0.20, 0.9)[i0:i1]
    alpha = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.zeros_like(seg)
    z = np.zeros(2)
    for n in range(seg.shape[1]):
        z += alpha[n] * (seg[:, n] - z)
        y[:, n] = z
    y = y - lowpass(y, 120)  # remove rumble
    benv = bump(1.80, 0.20, 0.85)[i0:i1] ** 1.5
    bloom = np.zeros((2, N))
    bloom[:, i0:i1] = y * benv / (np.std(y) + 1e-9)
    mix += 0.045 * bloom
    # warm low swell under the bloom (sub-octave of the drone, pure sine)
    sw = bump(1.85, 0.25, 0.9)
    mix += 0.040 * np.sin(2 * np.pi * 2 * D2 * t) * sw * np.ones((2, 1))

    # ---- 6. title chime cluster at 2.10 (sine partials, long decay) ------
    rng = np.random.default_rng(5005)
    base = 587.33  # D5
    ratios = [1.0, 1.5, 2.0, 2.52, 3.0, 4.01]  # D, A, D, F#~, A, D (soft)
    amps = [0.050, 0.032, 0.026, 0.016, 0.012, 0.007]
    mix += ping(2.10, [base * r for r in ratios[:3]], amps[:3], decay=1.6,
                attack=0.008, detune=0.0012, p=-0.35, rng=rng)
    mix += ping(2.115, [base * r for r in ratios[3:]], amps[3:], decay=1.2,
                attack=0.008, detune=0.0015, p=0.35, rng=rng)
    # warm body under the chime
    mix += ping(2.10, [293.66, 440.0], [0.030, 0.016], decay=1.8,
                attack=0.02, detune=0.001, p=0.0, rng=rng)

    # ---- 7. hold shimmer sparkles 2.10-3.90 (seeded random) --------------
    rng = np.random.default_rng(6006)
    pool = [1174.7, 1318.5, 1480.0, 1760.0, 2349.3, 2637.0, 2960.0, 3520.0, 4698.6]
    n_sp = 14
    times = np.sort(rng.uniform(2.30, 3.85, n_sp))
    for ts0 in times:
        f = pool[rng.integers(len(pool))] * (1 + rng.uniform(-0.002, 0.002))
        a = rng.uniform(0.006, 0.012)
        mix += ping(ts0, [f, f * 2.01], [a, a * 0.3], decay=rng.uniform(0.15, 0.35),
                    attack=0.003, detune=0.001, p=rng.uniform(-0.8, 0.8), rng=rng)

    # ---- 8. tiny soft sparkle at 3.30 (secondary line) -------------------
    rng = np.random.default_rng(7007)
    for k, (dt, f, p) in enumerate([(0.0, 2349.3, -0.3), (0.035, 3520.0, 0.3),
                                    (0.07, 4698.6, 0.0)]):
        mix += ping(3.30 + dt, [f, f * 1.5], [0.016 - 0.003 * k, 0.004],
                    decay=0.35, attack=0.003, detune=0.001, p=p, rng=rng)

    # ---- 9. warm resolve: gentle D/A swell 3.6 -> 4.4, settles into fade --
    res = bump(4.05, 0.45, 0.95)
    resolve = (np.sin(2 * np.pi * 146.83 * t) + 0.5 * np.sin(2 * np.pi * 220.0 * t + 0.5)
               + 0.3 * np.sin(2 * np.pi * 293.66 * t + 1.1))
    mix[0] += 0.040 * resolve * res
    mix[1] += 0.040 * np.roll(resolve, 37) * res

    # ---- master: tone shaping + global envelope ---------------------------
    mix = mix - lowpass(mix, 30, order=2)       # DC / subsonic cleanup
    mix = lowpass(mix, 9000, order=4)           # keep >10 kHz smooth
    fade_in = smoothstep(t / 0.30)
    fade_out = 1 - smoothstep((t - 4.40) / 0.60)
    master = fade_in * fade_out
    master[-1] = 0.0
    return mix * master


def limit(x, ceil_db):
    """Gentle look-ahead peak limiter on 4x oversampled detection."""
    ceil = 10 ** (ceil_db / 20)
    up = np.abs(signal.resample_poly(x, 4, 1, axis=-1)).max(axis=0)
    pk = up.reshape(-1, 4).max(axis=1)
    g = np.minimum(1.0, ceil / (pk + 1e-12))
    # look-ahead min filter + smoothing so gain changes are click-free
    w = int(0.004 * SR)
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    g = minimum_filter1d(g, size=2 * w + 1)
    g = uniform_filter1d(g, size=2 * w + 1)
    g = minimum_filter1d(g, size=w)  # ensure smoothing never overshoots
    g = uniform_filter1d(g, size=w)
    return x * g


def main():
    x = build()
    for _ in range(6):
        gain = 10 ** ((TARGET_LUFS - lufs_integrated(x)) / 20)
        x = limit(x * gain, TP_CEIL_DB)
    x[:, :8] *= np.linspace(0, 1, 8)
    x[:, -1] = 0.0
    x = x.astype(np.float32)
    assert x.shape == (2, N)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    wavfile.write(OUT, SR, x.T.copy())
    print(f"wrote {OUT}")
    print(f"samples={x.shape[1]}  internal LUFS={lufs_integrated(x.astype(np.float64)):.2f}"
          f"  TP={true_peak_db(x.astype(np.float64)):.2f} dBFS"
          f"  sample peak={20*np.log10(np.abs(x).max()):.2f} dBFS")
    f10 = int(0.01 * SR)
    print(f"first10ms peak={20*np.log10(np.abs(x[:, :f10]).max()+1e-20):.1f} dBFS"
          f"  last10ms peak={20*np.log10(np.abs(x[:, -f10:]).max()+1e-20):.1f} dBFS")


if __name__ == "__main__":
    main()
