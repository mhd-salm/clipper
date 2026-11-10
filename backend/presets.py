"""Edit presets: a saved look for clips (layout, captions, hook text, quality).
A creator points at a preset; the preset is read again for every NEW video, so editing a preset changes
what that creator's future videos look like. Clips that already exist are never touched.
Only settings the renderer really supports are stored here."""
import json
import threading
import uuid

import config
import layouts
import look
import motion
import retention
import sound
import stock
import subtitles
from subtitles import STYLES

FILE = config.DATA / "presets.json"
_lock = threading.Lock()
KEYS = ("layout_id", "subtitles", "sub_style", "resolution", "hook_text", "motion", "caption", "hook", "look", "music", "pacing", "stock", "smart_framing", "retention")
DEFAULT_ID = "standard"

BUILTIN = [
    {"id": "standard", "name": "Standard (current look)", "builtin": True,
     "description": "Full-frame video, bold yellow captions, hook text at the start, 1080p. The look the app has always used.",
     "settings": {"layout_id": "fill", "subtitles": True, "sub_style": "bold_yellow", "resolution": "1080p", "hook_text": True}},
    {"id": "two_speakers", "name": "Two speakers", "builtin": True,
     "description": "Two-up layout for interviews and podcasts with two people on screen, clean white captions.",
     "settings": {"layout_id": "stack_two", "subtitles": True, "sub_style": "clean_white", "resolution": "1080p", "hook_text": True}},
    {"id": "gameplay", "name": "Gameplay + facecam", "builtin": True,
     "description": "Gameplay with the facecam split out, green pop captions.",
     "settings": {"layout_id": "gameplay_split", "subtitles": True, "sub_style": "green_pop", "resolution": "1080p", "hook_text": True}},
    {"id": "soft_clean", "name": "Soft & clean", "builtin": True,
     "description": "Whole picture kept with a blurred background, clean white captions, no hook text.",
     "settings": {"layout_id": "fit_blur", "subtitles": True, "sub_style": "clean_white", "resolution": "1080p", "hook_text": False}},
]


def _load() -> list[dict]:
    try:
        return json.loads(FILE.read_text("utf-8"))
    except Exception:
        return []


def _save(items: list[dict]):
    FILE.write_text(json.dumps(items, indent=2), "utf-8")


def clean(settings: dict) -> dict:
    """Validate and keep only the supported keys. Raises ValueError with a readable message."""
    s = {k: settings[k] for k in KEYS if k in settings}
    base = BUILTIN[0]["settings"]
    out = {**base, **s}
    if out["sub_style"] not in STYLES:
        raise ValueError(f"Unknown caption style '{out['sub_style']}'")
    if out["resolution"] not in config.RESOLUTIONS:
        raise ValueError(f"Unknown quality '{out['resolution']}'")
    if out["layout_id"] not in {x["id"] for x in layouts.list_layouts()}:
        raise ValueError(f"Unknown layout '{out['layout_id']}'")
    out["motion"] = motion.clean(out.get("motion"))
    out["look"] = look.clean(out.get("look"))
    out["smart_framing"] = bool(out.get("smart_framing", True))
    out["retention"] = retention.clean(out.get("retention"))
    out["stock"] = stock.clean(out.get("stock"))
    out["music"] = sound.clean_music(out.get("music"))
    out["pacing"] = sound.clean_pacing(out.get("pacing"))
    out["caption"] = subtitles.clean_caption(out.get("caption"))
    out["hook"] = subtitles.clean_hook(out.get("hook"))
    out["subtitles"] = bool(out["subtitles"])
    out["hook_text"] = bool(out["hook_text"])
    return out


OVERRIDES = config.DATA / "preset_overrides.json"  # your edits to the ready-made presets; the originals stay in this file's code


def _load_over() -> dict:
    try:
        return json.loads(OVERRIDES.read_text("utf-8"))
    except Exception:
        return {}


def list_presets() -> list[dict]:
    with _lock:
        over = _load_over()
        built = []
        for b in BUILTIN:
            o = over.get(b["id"])
            if o:
                b = {**b, **{k: o[k] for k in ("name", "description") if k in o}, "settings": {**b["settings"], **o.get("settings", {})}, "modified": True}
            built.append(b)
        return built + _load()


def update_builtin(preset_id: str, name: str | None, description: str | None, settings: dict | None) -> dict | None:
    """Save your changes on top of a ready-made preset. reset_builtin() brings the original back."""
    base = next((b for b in BUILTIN if b["id"] == preset_id), None)
    if not base:
        return None
    with _lock:
        over = _load_over()
        cur = over.get(preset_id, {})
        if name is not None:
            if not name.strip():
                raise ValueError("Give the preset a name")
            cur["name"] = name.strip()[:40]
        if description is not None:
            cur["description"] = description.strip()[:200]
        if settings is not None:
            cur["settings"] = clean({**base["settings"], **cur.get("settings", {}), **settings})
        over[preset_id] = cur
        OVERRIDES.write_text(json.dumps(over, indent=2), "utf-8")
    return next(p for p in list_presets() if p["id"] == preset_id)


def reset_builtin(preset_id: str) -> bool:
    with _lock:
        over = _load_over()
        if preset_id not in over:
            return False
        over.pop(preset_id)
        OVERRIDES.write_text(json.dumps(over, indent=2), "utf-8")
        return True


def get(preset_id: str | None) -> dict | None:
    return next((p for p in list_presets() if p["id"] == preset_id), None) if preset_id else None


def settings_for(preset_id: str | None) -> dict:
    """The settings to apply to a new video for this preset id ({} if the preset no longer exists)."""
    p = get(preset_id)
    return dict(p["settings"]) if p else {}


def create(name: str, description: str, settings: dict) -> dict:
    name = (name or "").strip()[:40]
    if not name:
        raise ValueError("Give the preset a name")
    item = {"id": uuid.uuid4().hex[:8], "name": name, "builtin": False, "description": (description or "").strip()[:200], "settings": clean(settings)}
    with _lock:
        items = _load()
        items.append(item)
        _save(items)
    return item


def update(preset_id: str, name: str | None, description: str | None, settings: dict | None) -> dict | None:
    with _lock:
        items = _load()
        for p in items:
            if p["id"] == preset_id:
                if name is not None:
                    if not name.strip():
                        raise ValueError("Give the preset a name")
                    p["name"] = name.strip()[:40]
                if description is not None:
                    p["description"] = description.strip()[:200]
                if settings is not None:
                    p["settings"] = clean({**p["settings"], **settings})
                _save(items)
                return p
    return None


def delete(preset_id: str) -> bool:
    with _lock:
        items = _load()
        keep = [p for p in items if p["id"] != preset_id]
        if len(keep) == len(items):
            return False
        _save(keep)
        return True
