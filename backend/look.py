"""Color look for clips: a named filter with a strength, plus brightness / contrast / saturation / sharpness sliders.
Applied to the picture only (captions and hook text are drawn afterwards, so they stay clean).
Settings: {"filter": name, "strength": 0-100, "brightness": -100..100, "contrast": -100..100, "saturation": -100..100, "sharpness": 0-100}"""
import math

FILTERS = {
    "none": "No filter",
    "vivid": "Vivid",
    "warm": "Warm",
    "cool": "Cool",
    "cinematic": "Cinematic",
    "bw": "Black & white",
    "faded": "Faded",
    "crisp": "Sharp & crisp",
}
DEFAULT = {"filter": "none", "strength": 60, "brightness": 0, "contrast": 0, "saturation": 0, "sharpness": 0}


def _i(v, lo, hi, d):
    try:
        return int(max(lo, min(hi, float(v))))
    except (TypeError, ValueError):
        return d


def clean(m) -> dict:
    m = m if isinstance(m, dict) else {}
    f = m.get("filter") if m.get("filter") in FILTERS else "none"
    return {"filter": f, "strength": _i(m.get("strength", 60), 0, 100, 60),
            "brightness": _i(m.get("brightness", 0), -100, 100, 0), "contrast": _i(m.get("contrast", 0), -100, 100, 0),
            "saturation": _i(m.get("saturation", 0), -100, 100, 0), "sharpness": _i(m.get("sharpness", 0), 0, 100, 0)}


def active(m) -> bool:
    m = m or {}
    return m.get("filter", "none") != "none" or any(m.get(k) for k in ("brightness", "contrast", "saturation", "sharpness"))


def build_filter(m: dict) -> str:
    """ffmpeg filter chain (no labels). 'null' when nothing is on."""
    m = clean(m)
    s = m["strength"] / 100
    f, parts = m["filter"], []
    if f == "vivid":
        parts.append(f"eq=saturation={1 + 0.5 * s:.3f}:contrast={1 + 0.1 * s:.3f}")
    elif f == "warm":
        parts.append(f"colorbalance=rs={0.10 * s:.3f}:gs={0.02 * s:.3f}:bs={-0.12 * s:.3f}:rm={0.06 * s:.3f}:bm={-0.08 * s:.3f}")
    elif f == "cool":
        parts.append(f"colorbalance=rs={-0.10 * s:.3f}:bs={0.12 * s:.3f}:rm={-0.06 * s:.3f}:bm={0.08 * s:.3f}")
    elif f == "cinematic":
        parts.append(f"eq=contrast={1 + 0.15 * s:.3f}:saturation={1 - 0.1 * s:.3f}")
        parts.append(f"colorbalance=bs={0.08 * s:.3f}:rh={0.08 * s:.3f}:bh={-0.06 * s:.3f}")
        parts.append(f"vignette=angle={math.pi / 2 - (math.pi / 2 - math.pi / 5) * s:.3f}")
    elif f == "bw":
        parts.append(f"eq=saturation={1 - s:.3f}:contrast={1 + 0.1 * s:.3f}")
    elif f == "faded":
        parts.append(f"eq=contrast={1 - 0.15 * s:.3f}:brightness={0.04 * s:.3f}:saturation={1 - 0.25 * s:.3f}")
    elif f == "crisp":
        parts.append(f"unsharp=5:5:{0.9 * s:.3f}:5:5:0")
        parts.append(f"eq=contrast={1 + 0.05 * s:.3f}")
    if m["brightness"] or m["contrast"] or m["saturation"]:
        parts.append(f"eq=brightness={m['brightness'] / 250:.3f}:contrast={1 + m['contrast'] / 100:.3f}:saturation={1 + m['saturation'] / 100:.3f}")
    if m["sharpness"]:
        parts.append(f"unsharp=5:5:{m['sharpness'] / 100 * 1.5:.3f}:5:5:0")
    return ",".join(parts) or "null"
