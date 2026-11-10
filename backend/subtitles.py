"""ASS subtitle + text-overlay generation (burned in at render time only,
so subtitles can be toggled/removed by simply re-rendering without them)."""

import re

_BRACKETS = re.compile(r"\[[^\]]*\]|\([^)]*\)|\{[^}]*\}")


def clean_token(word: str) -> str:
    """Strip caption artifacts (>> << speaker marks, [Music], ♪, stray symbols) from one word."""
    w = _BRACKETS.sub("", word)
    w = re.sub(r"[<>♪♫♬♩_*#~^|\[\]\\]+", "", w)
    return w.strip()


def _chunks(ws: list[dict], n: int, max_chars: int = 17) -> list[list[dict]]:
    """Group words into short lines: break on sentence punctuation, pauses, or n words."""
    out, cur = [], []
    for i, w in enumerate(ws):
        cur.append(w)
        gap = ws[i + 1]["start"] - w["end"] if i + 1 < len(ws) else 0
        chars = sum(len(x["word"]) + 1 for x in cur)
        if len(cur) >= n or chars >= max_chars or w["word"][-1:] in ".?!," and len(cur) >= 2 or gap > 0.7:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


STYLES = {
    "bold_yellow": {"font": "Arial", "size": 0.052, "primary": "&H00FFFFFF", "hi": "&H0000E5FF", "outline": 5, "caps": True},
    "clean_white": {"font": "Arial", "size": 0.044, "primary": "&H00FFFFFF", "hi": "&H00FFFFFF", "outline": 4, "caps": False},
    "green_pop": {"font": "Arial", "size": 0.052, "primary": "&H00FFFFFF", "hi": "&H0000FF55", "outline": 5, "caps": True},
}


FONTS = ["Arial", "Arial Black", "Impact", "Segoe UI", "Segoe UI Black", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Comic Sans MS", "Courier New"]
HOOK_STYLES = ("outline", "plain", "box")
CAP_DEFAULTS = {"font": None, "size": None, "primary": None, "hi": None, "outline_color": "#000000", "outline": None, "shadow": 2,
                "bold": True, "caps": None, "bottom": 0.22, "words": 3, "highlight": True, "box": False}
HOOK_DEFAULTS = {"font": "Arial", "size": 0.05, "color": "#FFFFFF", "y": 0.14, "duration": 3.5, "bold": True, "style": "outline",
                 "outline_color": "#000000", "box_color": "#000000"}


def _num(v, lo, hi, default):
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return default


def _hex(v, default):
    v = str(v or "").strip()
    return v if re.fullmatch(r"#[0-9a-fA-F]{6}", v) else default


def clean_caption(c) -> dict:
    """Validate the caption look a preset can store. Missing keys fall back to the chosen caption style."""
    c = c if isinstance(c, dict) else {}
    out = {}
    if c.get("font") in FONTS:
        out["font"] = c["font"]
    if "size" in c: out["size"] = _num(c["size"], 0.025, 0.09, 0.05)
    for k in ("primary", "hi"):
        if c.get(k): out[k] = _hex(c[k], "#FFFFFF")
    if "outline_color" in c: out["outline_color"] = _hex(c["outline_color"], "#000000")
    if "outline" in c: out["outline"] = _num(c["outline"], 0, 12, 4)
    if "shadow" in c: out["shadow"] = _num(c["shadow"], 0, 8, 2)
    if "bottom" in c: out["bottom"] = _num(c["bottom"], 0.03, 0.8, 0.22)
    if "words" in c: out["words"] = int(_num(c["words"], 1, 6, 3))
    for k in ("bold", "highlight", "box"):
        if k in c: out[k] = bool(c[k])
    if c.get("caps") is not None: out["caps"] = bool(c["caps"])
    return out


def clean_hook(h) -> dict:
    h = h if isinstance(h, dict) else {}
    out = {}
    if h.get("font") in FONTS: out["font"] = h["font"]
    if "size" in h: out["size"] = _num(h["size"], 0.025, 0.09, 0.05)
    if "y" in h: out["y"] = _num(h["y"], 0.04, 0.95, 0.14)
    if "duration" in h: out["duration"] = _num(h["duration"], 0.5, 30, 3.5)
    for k in ("color", "outline_color", "box_color"):
        if k in h: out[k] = _hex(h[k], "#FFFFFF")
    if "bold" in h: out["bold"] = bool(h["bold"])
    if h.get("style") in HOOK_STYLES: out["style"] = h["style"]
    return out


def hook_overlay(text: str, hook: dict | None) -> dict:
    """The on-screen hook line for the first seconds of a clip, using the preset's hook look."""
    h = {**HOOK_DEFAULTS, **clean_hook(hook)}
    return {"text": text, "start": 0.0, "end": h["duration"], "x": 0.5, "y": h["y"], "size": h["size"], "color": h["color"],
            "hook": True, "font": h["font"], "bold": h["bold"], "style": h["style"], "outline_color": h["outline_color"], "box_color": h["box_color"]}


def _t(sec: float) -> str:
    sec = max(sec, 0)
    h = int(sec // 3600)
    m = int(sec % 3600 // 60)
    s = sec % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _esc(text: str) -> str:
    return text.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


def _color(c: str) -> str:
    """#RRGGBB -> ASS &HBBGGRR&"""
    c = c.lstrip("#")
    if len(c) != 6:
        c = "FFFFFF"
    return f"&H00{c[4:6]}{c[2:4]}{c[0:2]}".upper()


def expand_captions(lines: list[dict]) -> list[dict]:
    """User-edited caption lines [{start,end,text}] -> word list with evenly spread timings."""
    out = []
    for ln in lines or []:
        try:
            st, en = float(ln["start"]), float(ln["end"])
        except (KeyError, TypeError, ValueError):
            continue
        toks = [t for t in (clean_token(x) for x in str(ln.get("text", "")).split()) if t]
        if not toks or en <= st:
            continue
        step = (en - st) / len(toks)
        for i, t in enumerate(toks):
            out.append({"word": " " + t, "start": st + i * step, "end": st + (i + 1) * step})
    return out


def _wrap(text: str, max_chars: int) -> str:
    lines, cur = [], ""
    for w in text.split():
        if cur and len(cur) + 1 + len(w) > max_chars:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return "\\N".join(lines)


def build_ass(words: list[dict], clip_start: float, clip_end: float, W: int, H: int,
              subtitles: bool, style: str = "bold_yellow", overlays: list[dict] | None = None,
              words_per_line: int = 3, cap: dict | None = None) -> str:
    st = dict(STYLES.get(style, STYLES["bold_yellow"]))
    cap = clean_caption(cap)
    size = int(H * cap.get("size", st["size"]))
    if "primary" in cap: st["primary"] = _color(cap["primary"])
    if "hi" in cap: st["hi"] = _color(cap["hi"])
    elif "primary" in cap and st["hi"] == STYLES.get(style, STYLES["bold_yellow"])["primary"]:
        st["hi"] = st["primary"]
    if not cap.get("highlight", True): st["hi"] = st["primary"]
    if "caps" in cap: st["caps"] = cap["caps"]
    if "font" in cap: st["font"] = cap["font"]
    outline = cap.get("outline", st["outline"])
    shadow = cap.get("shadow", 2)
    out_col = _color(cap.get("outline_color", "#000000"))
    bold = -1 if cap.get("bold", True) else 0
    bstyle = 3 if cap.get("box") else 1
    margin_v = int(H * cap.get("bottom", 0.22))
    words_per_line = cap.get("words", words_per_line)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,{st['font']},{size},{st['primary']},{st['primary']},{out_col},&H80000000,{bold},0,0,0,100,100,0,0,{bstyle},{outline if bstyle == 1 else max(outline, 8)},{shadow},2,60,60,{margin_v},1
Style: Txt,Arial,{int(H * 0.04)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,5,40,40,40,1
Style: TxtPlain,Arial,{int(H * 0.04)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,0,5,40,40,40,1
Style: TxtBox,Arial,{int(H * 0.04)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,3,14,0,5,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    if subtitles:
        ws = []
        for w in words:
            if w["end"] > clip_start and w["start"] < clip_end:
                txt = clean_token(w["word"])
                if txt:
                    ws.append({"word": txt, "start": w["start"], "end": w["end"]})
        chunks = _chunks(ws, words_per_line, 17 if words_per_line <= 3 else words_per_line * 6)
        for ci, chunk in enumerate(chunks):
            # keep the line on screen until the next line starts (or a short linger) so it never flickers
            nxt_chunk = chunks[ci + 1][0]["start"] if ci + 1 < len(chunks) else None
            hold_end = chunk[-1]["end"] + 0.35
            if nxt_chunk is not None:
                hold_end = min(hold_end, nxt_chunk)
            hold_end = max(hold_end, chunk[-1]["end"])
            for j, w in enumerate(chunk):
                start = max(w["start"], clip_start) - clip_start
                end = (chunk[j + 1]["start"] if j + 1 < len(chunk) else hold_end) - clip_start
                if end <= start:
                    end = start + 0.08
                parts = []
                for k, cw in enumerate(chunk):
                    txt = _esc(cw["word"])
                    if st["caps"]:
                        txt = txt.upper()
                    col = st["hi"] if k == j else st["primary"]
                    parts.append(f"{{\\c{col}}}{txt}")
                lines.append(f"Dialogue: 0,{_t(start)},{_t(end)},Sub,,0,0,0,,{' '.join(parts)}")
    for o in overlays or []:
        x = int(float(o.get("x", 0.5)) * W)
        y = int(float(o.get("y", 0.2)) * H)
        size_o = int(float(o.get("size", 0.04)) * H)
        col = _color(o.get("color", "#FFFFFF"))
        sty = {"plain": "TxtPlain", "box": "TxtBox"}.get(o.get("style"), "Txt")
        extra = ""
        if o.get("font") in FONTS:
            extra += f"\\fn{o['font']}"
        if "bold" in o:
            extra += "\\b1" if o["bold"] else "\\b0"
        if sty == "Txt" and o.get("outline_color"):
            extra += f"\\3c{_color(o['outline_color'])}"
        if sty == "TxtBox":
            extra += f"\\3c{_color(o.get('box_color', '#000000'))}"
        lines.append(
            f"Dialogue: 1,{_t(float(o.get('start', 0)))},{_t(float(o.get('end', clip_end - clip_start)))},{sty},,0,0,0,,"
            f"{{\\an5\\pos({x},{y})\\fs{size_o}\\c{col}{extra}}}{_wrap(_esc(str(o.get('text', ''))), max(8, int(W * 0.84 / (size_o * 0.55))))}"
        )
    return header + "\n".join(lines) + "\n"
