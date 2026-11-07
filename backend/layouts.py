"""Layouts are JSON: a background plus a list of regions on a 9:16 canvas.

Numbers are fractions (0..1) of the canvas (x, y, w, h) or of the source frame (crop).
Region fields:
  fit          "fill" (cover the region, cropping) | "fit" (contain, shown over the background)
  crop         null (auto) | {x,y,w,h} manual window of the source frame
  follow_face  auto mode only: pan toward the detected speaker
  zoom         auto mode only: >=1, zoom into the speaker (1 = whole frame)

The same geometry is mirrored in static/layout-editor.js so the editor preview matches the render.
"""
import json
import re

from config import LAYOUTS_DIR


def _r(x, y, w, h, fit="fill", crop=None, follow_face=False, zoom=1.0):
    return {"x": x, "y": y, "w": w, "h": h, "fit": fit, "crop": crop, "follow_face": follow_face, "zoom": zoom}


BUILTIN = [
    {
        "id": "fill", "name": "Full frame", "description": "Fills the screen and follows the speaker",
        "background": "black", "regions": [_r(0, 0, 1, 1, follow_face=True)],
    },
    {
        "id": "fit_blur", "name": "Fit + blur", "description": "Whole video centered over a blurred copy",
        "background": "blur", "regions": [_r(0, 0.3, 1, 0.4, fit="fit")],
    },
    {
        "id": "split_zoom", "name": "Zoom + wide", "description": "Zoomed on the speaker on top, whole scene below",
        "background": "blur",
        "regions": [_r(0, 0, 1, 0.55, follow_face=True, zoom=1.6), _r(0, 0.55, 1, 0.45, fit="fit")],
    },
    {
        "id": "pip", "name": "Picture in picture", "description": "Whole scene centered, small speaker window on top",
        "background": "blur",
        "regions": [_r(0, 0.3, 1, 0.4, fit="fit"), _r(0.56, 0.05, 0.38, 0.2, follow_face=True, zoom=2.2)],
    },
    {
        "id": "gameplay_split", "name": "Gameplay + facecam",
        "description": "Gameplay on top, facecam below. Open Layout tab to move the facecam crop onto your video's facecam",
        "background": "black",
        "regions": [
            _r(0, 0, 1, 0.62, crop={"x": 0.15, "y": 0, "w": 0.7, "h": 1}),
            _r(0, 0.62, 1, 0.38, crop={"x": 0.7, "y": 0.62, "w": 0.3, "h": 0.38}),
        ],
    },
    {
        "id": "stack_two", "name": "Two-up", "description": "Left half and right half of the video stacked (podcasts, interviews)",
        "background": "black",
        "regions": [_r(0, 0, 1, 0.5, crop={"x": 0, "y": 0, "w": 0.5, "h": 1}), _r(0, 0.5, 1, 0.5, crop={"x": 0.5, "y": 0, "w": 0.5, "h": 1})],
    },
]


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9_-]+", "_", s.lower()).strip("_") or "layout"


def _num(v, lo, hi, default):
    try:
        return min(max(float(v), lo), hi)
    except (TypeError, ValueError):
        return default


def sanitize(layout: dict) -> dict:
    """Clamp every number so a bad/hand-edited layout can never break ffmpeg."""
    regions = []
    for r in (layout.get("regions") or [])[:8]:
        x, y = _num(r.get("x"), 0, 0.98, 0), _num(r.get("y"), 0, 0.98, 0)
        w, h = _num(r.get("w"), 0.05, 1, 1), _num(r.get("h"), 0.05, 1, 1)
        w, h = min(w, 1 - x), min(h, 1 - y)
        crop = r.get("crop")
        if crop:
            cx, cy = _num(crop.get("x"), 0, 0.95, 0), _num(crop.get("y"), 0, 0.95, 0)
            cw, ch = _num(crop.get("w"), 0.05, 1, 1), _num(crop.get("h"), 0.05, 1, 1)
            crop = {"x": cx, "y": cy, "w": min(cw, 1 - cx), "h": min(ch, 1 - cy)}
        regions.append({"x": x, "y": y, "w": w, "h": h, "fit": "fit" if r.get("fit") == "fit" else "fill",
                        "crop": crop or None, "follow_face": bool(r.get("follow_face")),
                        "zoom": _num(r.get("zoom"), 1, 4, 1)})
    if not regions:
        regions = [_r(0, 0, 1, 1, follow_face=True)]
    out = {k: v for k, v in layout.items() if k in ("id", "name", "description")}
    out["background"] = "blur" if layout.get("background") == "blur" else "black"
    out["regions"] = regions
    return out


def list_layouts() -> list[dict]:
    out = [dict(l, builtin=True) for l in BUILTIN]
    for f in sorted(LAYOUTS_DIR.glob("*.json")):
        try:
            out.append(dict(sanitize(json.loads(f.read_text("utf-8"))), builtin=False))
        except Exception:
            pass
    return out


def get_layout(layout_id: str) -> dict:
    for l in list_layouts():
        if l["id"] == layout_id:
            return l
    return BUILTIN[0]


def save_layout(layout: dict) -> dict:
    layout = sanitize(layout)
    layout["id"] = "custom_" + _slug(layout.get("name") or "layout")
    layout["name"] = layout.get("name") or "Custom layout"
    (LAYOUTS_DIR / f"{layout['id']}.json").write_text(json.dumps(layout, indent=2), "utf-8")
    return layout


def delete_layout(layout_id: str) -> bool:
    f = LAYOUTS_DIR / f"{_slug(layout_id)}.json"
    if f.exists() and layout_id.startswith("custom_"):
        f.unlink()
        return True
    return False


def resolve_region(r: dict, face_x: float, face_y: float = 0.4) -> tuple[dict | None, float]:
    """Turn auto/zoom regions into an explicit source crop + horizontal pan (0..1)."""
    crop = r.get("crop")
    if crop:
        return crop, 0.5  # manual window: pan is not used, the user already framed it
    z = max(float(r.get("zoom", 1)), 1.0)
    fx = face_x if r.get("follow_face") else 0.5
    if z > 1.001:
        cw = 1 / z
        x0 = min(max(face_x - cw / 2, 0), 1 - cw) if r.get("follow_face") else (1 - cw) / 2
        # keep the face in the upper-middle of the window (headroom), not dead centre
        y0 = min(max(face_y - cw * 0.42, 0), 1 - cw) if r.get("follow_face") else (1 - cw) / 2
        crop = {"x": x0, "y": y0, "w": cw, "h": cw}
        fx = min(max((face_x - x0) / cw, 0), 1) if r.get("follow_face") else 0.5
    return crop, fx


def build_filter(layout: dict, W: int, H: int, face_x: float, face_y: float = 0.4) -> str:
    """Build an ffmpeg filter_complex that ends in the label [base]."""
    layout = sanitize(layout)
    regions = layout["regions"]
    n = len(regions)
    labels = "".join(f"[s{i}]" for i in range(n + 1))
    parts = [f"[0:v]fps=30,split={n + 1}{labels}"]

    bg = f"[s{n}]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}"
    parts.append(bg + (",boxblur=30:3[bg0]" if layout["background"] == "blur" else ",eq=brightness=-1[bg0]"))

    prev = "bg0"
    for i, r in enumerate(regions):
        rw = max(2, int(r["w"] * W) // 2 * 2)
        rh = max(2, int(r["h"] * H) // 2 * 2)
        rx, ry = int(r["x"] * W), int(r["y"] * H)
        crop, fx = resolve_region(r, face_x, face_y)
        chain = f"[s{i}]"
        if crop:
            chain += (f"crop=w='in_w*{crop['w']:.5f}':h='in_h*{crop['h']:.5f}':"
                      f"x='in_w*{crop['x']:.5f}':y='in_h*{crop['y']:.5f}',")
        if r["fit"] == "fit":
            chain += f"scale={rw}:{rh}:force_original_aspect_ratio=decrease[r{i}]"
            ox, oy = f"{rx}+({rw}-overlay_w)/2", f"{ry}+({rh}-overlay_h)/2"
        else:
            chain += (f"scale={rw}:{rh}:force_original_aspect_ratio=increase,"
                      f"crop=w={rw}:h={rh}:x='min(max(iw*{fx:.4f}-{rw}/2,0),iw-{rw})':y='(ih-{rh})/2'[r{i}]")
            ox, oy = str(rx), str(ry)
        parts.append(chain)
        parts.append(f"[{prev}][r{i}]overlay=x='{ox}':y='{oy}'[o{i}]")
        prev = f"o{i}"
    parts.append(f"[{prev}]null[base]")
    return ";".join(parts)
