"""Motion for clips: a slow zoom-in over the whole clip, a light camera shake on loud moments, and (retention) a slight
punch-in that toggles in and out at sentence starts.
Settings: {"zoom": 0-100, "shake": 0-100}. 0 means off, so clips look exactly as before unless a preset turns it on.
The motion is applied to the picture only; captions and hook text are drawn afterwards so they stay steady and readable."""
import subprocess

DEFAULT = {"zoom": 0, "shake": 0}
MAX_ZOOM = 0.15      # at zoom 100 the picture ends 15% closer than it started
MAX_SHAKE = 0.015    # at shake 100 the picture moves up to 1.5% of the frame width
BURST = 0.30         # seconds each shake lasts
PUNCH = 0.07         # a punch-in is 7% closer
PUNCH_EASE = 0.10    # seconds a punch-in / punch-out takes
PUNCH_Y = 0.40       # which part of the extra picture is kept vertically (0 = top, 0.5 = middle): faces sit in the upper half
MAX_BURSTS = 12


def clean(m) -> dict:
    m = m if isinstance(m, dict) else {}
    out = {}
    for k in ("zoom", "shake"):
        try:
            out[k] = max(0, min(100, int(m.get(k, 0))))
        except (TypeError, ValueError):
            raise ValueError(f"Motion '{k}' must be a number from 0 to 100")
    return out


def active(m) -> bool:
    m = m or {}
    return bool(m.get("zoom") or m.get("shake"))


def loud_moments(video, start: float, end: float) -> list[float]:
    """Times (seconds from the clip start) where the audio suddenly gets loud: a laugh, a shout, a punchline."""
    try:
        import numpy as np
        r = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-ss", f"{start:.2f}", "-t", f"{end - start:.2f}",
                            "-i", str(video), "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
                           capture_output=True, timeout=120)
        a = np.frombuffer(r.stdout, dtype=np.int16).astype(np.float32)
        win = 400  # 50 ms
        n = len(a) // win
        if n < 20:
            return []
        rms = np.sqrt((a[:n * win].reshape(n, win) ** 2).mean(axis=1))
        thr = rms.mean() + 1.2 * rms.std()
        found = []  # (strength, time)
        for i in range(10, n):  # sudden: clearly louder than the previous half second
            before = rms[i - 10:i].mean() + 1e-6
            if rms[i] > thr and rms[i] > 1.8 * before:
                found.append((float(rms[i] / before), i * 0.05))
        found.sort(reverse=True)
        picked: list[float] = []
        for _, t in found:  # strongest first, at least 2 s apart
            if all(abs(t - p) >= 2.0 for p in picked):
                picked.append(t)
            if len(picked) >= MAX_BURSTS:
                break
        return sorted(picked)
    except Exception:
        return []  # shake is a bonus: if the audio can't be read, just skip it


def punch_expr(times: list[float]) -> str:
    """ffmpeg expression (in t) that alternates 0 -> 1 -> 0 -> 1 at each time, with a short ramp, so the zoom toggles in and out."""
    terms = "".join(f"{'+' if i % 2 == 0 else '-'}clip((t-{t:.2f})/{PUNCH_EASE},0,1)" for i, t in enumerate(times[:60]))
    return f"(0{terms})"


def build_filter(motion: dict, W: int, H: int, duration: float, loud: list[float], punches: list[float] | None = None) -> str:
    """ffmpeg filter chain (no labels) that zooms and shakes a W x H picture and returns it at W x H.
    `punches` are the times (seconds) where the punch-in toggles; they share the same scale step, so the picture is resampled only once."""
    z = (motion.get("zoom") or 0) / 100 * MAX_ZOOM
    sh = (motion.get("shake") or 0) / 100
    amp = W * MAX_SHAKE * sh
    margin = (2.2 * amp / W) if (sh and loud) else 0.0
    d = max(duration, 0.5)
    s = f"(1+{margin:.4f}+{z:.4f}*t/{d:.2f})"
    if punches:
        s += f"*(1+{PUNCH:.3f}*{punch_expr(punches)})"
    dx = dy = "0"
    if margin:
        dx = "+".join(f"between(t,{t:.2f},{t + BURST:.2f})*(1-(t-{t:.2f})/{BURST})*{amp:.2f}*sin(75*t)" for t in loud)
        dy = "+".join(f"between(t,{t:.2f},{t + BURST:.2f})*(1-(t-{t:.2f})/{BURST})*{amp * 0.7:.2f}*cos(63*t)" for t in loud)
    if not z and not margin and not punches:
        return "null"
    yb = PUNCH_Y if punches else 0.5
    return (f"scale=w='trunc({W}*{s}/2)*2':h='trunc({H}*{s}/2)*2':eval=frame,"
            f"crop=w={W}:h={H}:x='(iw-ow)/2+{dx}':y='(ih-oh)*{yb}+{dy}'")
