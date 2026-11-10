"""Sound and pacing for clips: background music (with ducking under speech), a speed-up, and cutting long pauses.
Settings:
  music:  {"track": file name in data/music or None, "volume": 0-100, "duck": bool}
  pacing: {"speed": 100-150 (percent), "cut_pauses": bool, "pause": 0.3-2.0 (seconds; longer gaps between words are cut)}
Everything is off by default, so clips look and sound exactly as before unless a preset turns it on."""
import re
import subprocess
from pathlib import Path

import config

MUSIC_DIR = config.DATA / "music"
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
KEEP_PAD = 0.12  # seconds of the pause kept on each side of a cut, so speech never sounds chopped


def _n(v, lo, hi, d):
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return d


def clean_music(m) -> dict:
    m = m if isinstance(m, dict) else {}
    track = m.get("track")
    track = Path(str(track)).name if track else None  # a file name only, never a path
    return {"track": track, "volume": int(_n(m.get("volume", 15), 0, 100, 15)), "duck": bool(m.get("duck", True))}


def clean_pacing(p) -> dict:
    p = p if isinstance(p, dict) else {}
    return {"speed": int(_n(p.get("speed", 100), 100, 150, 100)), "cut_pauses": bool(p.get("cut_pauses", False)),
            "pause": round(_n(p.get("pause", 0.6), 0.3, 2.0, 0.6), 2)}


def safe_name(name: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "_", Path(name).stem).strip(" ._")[:60] or "track"
    return stem + Path(name).suffix.lower()


def list_tracks() -> list[dict]:
    MUSIC_DIR.mkdir(exist_ok=True)
    return [{"name": f.name, "mb": round(f.stat().st_size / 1e6, 1)} for f in sorted(MUSIC_DIR.iterdir()) if f.suffix.lower() in AUDIO_EXT]


def track_path(music: dict | None) -> Path | None:
    t = (music or {}).get("track")
    if not t:
        return None
    p = MUSIC_DIR / Path(t).name
    return p if p.is_file() else None


def has_audio(video: Path) -> bool:
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(video)],
                           capture_output=True, text=True, timeout=30)
        return bool(r.stdout.strip())
    except Exception:
        return True


def keep_intervals(words: list[dict], start: float, end: float, pause: float) -> list[tuple[float, float]]:
    """Parts of the clip to keep (seconds from the clip start): everything except long gaps between words."""
    total = end - start
    ws = sorted((w for w in words if w["end"] > start and w["start"] < end), key=lambda w: w["start"])
    cuts = []
    for a, b in zip(ws, ws[1:]):
        gap = b["start"] - a["end"]
        if gap > pause:
            cs, ce = a["end"] - start + KEEP_PAD, b["start"] - start - KEEP_PAD
            if ce - cs > 0.1:
                cuts.append((max(cs, 0.0), min(ce, total)))
    if not cuts:
        return [(0.0, total)]
    keep, pos = [], 0.0
    for cs, ce in cuts:
        if cs > pos:
            keep.append((pos, cs))
        pos = ce
    if pos < total:
        keep.append((pos, total))
    return keep[:200]  # a filter script has to stay a sane size


def remap(t: float, keep: list[tuple[float, float]]) -> float:
    """A time in the original clip -> the same moment in the clip with the cuts removed."""
    acc = 0.0
    for a, b in keep:
        if t < a:
            return acc
        if t <= b:
            return acc + (t - a)
        acc += b - a
    return acc


def kept_length(keep) -> float:
    return sum(b - a for a, b in keep)


def select_expr(keep) -> str:
    return "+".join(f"gte(t,{a:.3f})*lt(t,{b:.3f})" for a, b in keep)


def atempo_chain(speed: float) -> str:
    return f"atempo={speed:.3f}"  # 1.0 to 1.5 is inside atempo's range
