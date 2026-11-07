"""ASS subtitle + text-overlay generation (burned in at render time only,
so subtitles can be toggled/removed by simply re-rendering without them)."""

import re

_BRACKETS = re.compile(r"\[[^\]]*\]|\([^)]*\)|\{[^}]*\}")


def clean_token(word: str) -> str:
    """Strip caption artifacts (>> << speaker marks, [Music], ♪, stray symbols) from one word."""
    w = _BRACKETS.sub("", word)
    w = re.sub(r"[<>♪♫♬♩_*#~^|\[\]\\]+", "", w)
    return w.strip()


def _chunks(ws: list[dict], n: int) -> list[list[dict]]:
    """Group words into short lines: break on sentence punctuation, pauses, or n words."""
    out, cur = [], []
    for i, w in enumerate(ws):
        cur.append(w)
        gap = ws[i + 1]["start"] - w["end"] if i + 1 < len(ws) else 0
        chars = sum(len(x["word"]) + 1 for x in cur)
        if len(cur) >= n or chars >= 17 or w["word"][-1:] in ".?!," and len(cur) >= 2 or gap > 0.7:
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
              words_per_line: int = 3) -> str:
    st = STYLES.get(style, STYLES["bold_yellow"])
    size = int(H * st["size"])
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,{st['font']},{size},{st['primary']},{st['primary']},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,{st['outline']},2,2,60,60,{int(H * 0.22)},1
Style: Txt,Arial,{int(H * 0.04)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,5,40,40,40,1

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
        chunks = _chunks(ws, words_per_line)
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
        lines.append(
            f"Dialogue: 1,{_t(float(o.get('start', 0)))},{_t(float(o.get('end', clip_end - clip_start)))},Txt,,0,0,0,,"
            f"{{\\an5\\pos({x},{y})\\fs{size_o}\\c{col}}}{_wrap(_esc(str(o.get('text', ''))), max(8, int(W * 0.84 / (size_o * 0.55))))}"
        )
    return header + "\n".join(lines) + "\n"
