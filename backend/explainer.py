"""2D explainer videos (vertical, up to ~40 s): a script goes in, a finished video comes out. Nothing here needs a paid service.

  script text  ->  scenes (voice line + what to show)
  free voice (edge-tts, Windows voice as a fallback) -> audio for each scene + the time of every word
  each scene is drawn as an animated page (explainer_scene.html) by the browser and saved as a short video
  scenes (joined with changing transitions) + voice + music + word-by-word captions + hook text are put together with ffmpeg

Scene pictures and voices are cached by their content, so changing one line only redoes that scene.
One optional AI request (write_script) can write the script from a topic; everything else is plain code."""
import asyncio
import hashlib
import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from pydantic import BaseModel

import config
import sound
import subtitles

DIR = config.DATA / "explainers"
DIR.mkdir(parents=True, exist_ok=True)
CACHE = DIR / "_cache"
CACHE.mkdir(exist_ok=True)
TEMPLATE = Path(__file__).parent / "explainer_scene.html"
FPS = 30
RW, RH = 720, 1280  # scenes are drawn at this size, then scaled up to 1080x1920
LEAD = 0.12  # silence before each scene's voice
LENGTHS = {"short": 40.0, "long": 180.0}  # a Short is about 40 s; a long one can run up to 3 minutes (YouTube Shorts allow that too)
MAX_SECONDS = LENGTHS["short"]
CACHE_VERSION = "4"  # bump when the scene drawing changes, so old pictures are not reused

DEFAULT_STYLE = {"voice": "en-US-AndrewNeural", "voice2": "", "length": "short", "rate": 0, "theme": "midnight", "caption_style": "bold_yellow", "music": {"track": None, "volume": 12, "duck": True}}
VOICES = [("en-US-AndrewNeural", "Andrew (man, warm)"), ("en-US-BrianNeural", "Brian (man, casual)"), ("en-US-GuyNeural", "Guy (man, clear)"),
          ("en-US-AvaNeural", "Ava (woman, friendly)"), ("en-US-EmmaNeural", "Emma (woman, clear)"), ("en-US-AriaNeural", "Aria (woman, expressive)"),
          ("en-GB-RyanNeural", "Ryan (British man)"), ("en-GB-SoniaNeural", "Sonia (British woman)"), ("windows", "Windows voice (offline, plainer)")]
TONES = {"neutral": (0, 0), "calm": (-8, -2), "serious": (-6, -4), "energetic": (10, 3), "excited": (12, 6), "slow": (-15, 0), "fast": (18, 0)}
THEMES = {
    "midnight": {"bg": ["#1b1f3b", "#3b1f4a"], "text": "#ffffff", "accent": "#ffd84a", "accent2": "#ff7aa8", "card": "#2c2f55", "cardText": "#ffffff", "palette": ["#ff7aa8", "#5bc0ff", "#7dffb0", "#ffd84a", "#b79cff"]},
    "ocean": {"bg": ["#06324a", "#0b5c7a"], "text": "#ffffff", "accent": "#7df3ff", "accent2": "#ffd84a", "card": "#0e4a69", "cardText": "#ffffff", "palette": ["#7df3ff", "#ffd84a", "#ff9d7a", "#a6ffb3", "#c9a6ff"]},
    "sunset": {"bg": ["#3a1c4a", "#c2475e"], "text": "#ffffff", "accent": "#ffe27a", "accent2": "#7df3ff", "card": "#5c2a58", "cardText": "#ffffff", "palette": ["#ffe27a", "#7df3ff", "#ffb3c7", "#b3ffcf", "#d2b3ff"]},
    "paper": {"bg": ["#fff6e3", "#ffe3c2"], "text": "#2b2230", "accent": "#e4572e", "accent2": "#2e86de", "card": "#ffffff", "cardText": "#2b2230", "palette": ["#e4572e", "#2e86de", "#2ebd85", "#f0a202", "#8e5bd6"]},
    "mint": {"bg": ["#0c3b2e", "#146356"], "text": "#ffffff", "accent": "#b6ff8a", "accent2": "#ffd84a", "card": "#16574a", "cardText": "#ffffff", "palette": ["#b6ff8a", "#ffd84a", "#7df3ff", "#ffa3c1", "#c9b3ff"]},
}


def clean_style(s) -> dict:
    s = s if isinstance(s, dict) else {}
    voices = {v for v, _ in VOICES}
    out = {"voice": s.get("voice") if s.get("voice") in voices else DEFAULT_STYLE["voice"],
           "voice2": s.get("voice2") if s.get("voice2") in voices else "",  # a second voice for quotes and scenes marked SPEAKER: 2
           "length": s.get("length") if s.get("length") in LENGTHS else "short",
           "rate": int(max(-30, min(30, float(s.get("rate", 0) or 0)))),
           "theme": s.get("theme") if s.get("theme") in THEMES else "midnight",
           "caption_style": s.get("caption_style") if s.get("caption_style") in subtitles.STYLES else "bold_yellow",
           "music": sound.clean_music(s.get("music") or DEFAULT_STYLE["music"])}
    return out


# ---------------------------------------------------------------- icons (emoji, drawn by the browser)
ICONS = {
    "brain": "🧠", "heart": "❤️", "money": "💰", "cash": "💵", "dollar": "💵", "coin": "🪙", "time": "⏰", "clock": "⏰", "hour": "⏰", "energy": "⚡", "power": "⚡",
    "battery": "🔋", "fire": "🔥", "hot": "🔥", "water": "💧", "drop": "💧", "earth": "🌍", "world": "🌍", "globe": "🌍", "sun": "☀️", "moon": "🌙", "night": "🌙",
    "star": "⭐", "rocket": "🚀", "launch": "🚀", "phone": "📱", "smartphone": "📱", "computer": "💻", "laptop": "💻", "internet": "🌐", "web": "🌐", "book": "📖",
    "school": "🎓", "student": "🎓", "idea": "💡", "bulb": "💡", "lock": "🔒", "secret": "🔒", "key": "🔑", "shield": "🛡️", "chart": "📈", "growth": "📈", "rise": "📈",
    "fall": "📉", "drop": "📉", "city": "🏙️", "house": "🏠", "home": "🏠", "car": "🚗", "plane": "✈️", "flight": "✈️", "ship": "🚢", "train": "🚆", "food": "🍔",
    "apple": "🍎", "coffee": "☕", "sleep": "😴", "tired": "😴", "health": "🏥", "doctor": "🩺", "medicine": "💊", "pill": "💊", "dna": "🧬", "gene": "🧬", "atom": "⚛️",
    "science": "🔬", "space": "🪐", "planet": "🪐", "robot": "🤖", "ai": "🤖", "camera": "📷", "music": "🎵", "song": "🎵", "game": "🎮", "trophy": "🏆", "win": "🏆",
    "crown": "👑", "king": "👑", "gold": "🥇", "war": "⚔️", "fight": "⚔️", "flag": "🏁", "people": "👥", "crowd": "👥", "person": "🧑", "child": "👶", "baby": "👶",
    "family": "👪", "eye": "👁️", "ear": "👂", "mouth": "👄", "hand": "✋", "muscle": "💪", "strong": "💪", "bone": "🦴", "tooth": "🦷", "lung": "🫁", "dog": "🐶",
    "cat": "🐱", "bird": "🐦", "fish": "🐟", "tree": "🌳", "flower": "🌸", "mountain": "⛰️", "ocean": "🌊", "sea": "🌊", "wave": "🌊", "rain": "🌧️", "snow": "❄️", "cold": "❄️",
    "wind": "💨", "lightning": "⚡", "bomb": "💣", "danger": "⚠️", "warning": "⚠️", "question": "❓", "why": "❓", "check": "✅", "yes": "✅", "wrong": "❌", "no": "❌",
    "bank": "🏦", "gift": "🎁", "shopping": "🛍️", "cart": "🛒", "email": "📧", "message": "💬", "talk": "💬", "news": "📰", "tv": "📺", "movie": "🎬", "film": "🎬",
    "podcast": "🎙️", "microphone": "🎤", "calendar": "📅", "date": "📅", "map": "🗺️", "compass": "🧭", "magnet": "🧲", "gear": "⚙️", "machine": "⚙️", "tool": "🔧",
    "paint": "🎨", "art": "🎨", "pen": "✏️", "write": "✏️", "law": "⚖️", "justice": "⚖️", "vote": "🗳️", "gem": "💎", "diamond": "💎", "virus": "🦠", "germ": "🦠",
    "bacteria": "🦠", "vaccine": "💉", "dream": "💭", "thought": "💭", "think": "💭", "mind": "🧠", "memory": "🧠", "stomach": "🍽️", "gut": "🍽️", "sport": "⚽",
    "football": "⚽", "run": "🏃", "gym": "🏋️", "weight": "🏋️", "scale": "⚖️", "target": "🎯", "goal": "🎯", "puzzle": "🧩", "fingerprint": "🔍", "search": "🔍",
    "magnifier": "🔍", "chain": "🔗", "link": "🔗", "bridge": "🌉", "castle": "🏰", "pyramid": "🔺", "egypt": "🔺", "volcano": "🌋", "oil": "🛢️", "factory": "🏭",
    "farm": "🌾", "wheat": "🌾", "bread": "🍞", "pizza": "🍕", "ice": "🧊", "tornado": "🌪️", "bug": "🐛", "insect": "🐛", "bee": "🐝", "spider": "🕷️", "shark": "🦈",
    "whale": "🐋", "snake": "🐍", "lion": "🦁", "elephant": "🐘", "horse": "🐎", "monkey": "🐒", "dinosaur": "🦖", "ghost": "👻", "skull": "💀", "death": "💀",
}


def pick_icons(keywords: list[str], voice: str, used: set) -> list[str]:
    """One emoji for a scene: from its ICON keywords first, then from the spoken words. Avoids repeating the same one back to back."""
    def look(words):
        for w in words:
            w = re.sub(r"[^a-z]", "", w.lower())
            for cand in (w, w[:-1] if w.endswith("s") else w, w[:-2] if w.endswith("es") else w):
                ch = ICONS.get(cand)
                if ch and ch not in used:
                    return ch
        return None
    ch = look(keywords) or look(re.findall(r"[A-Za-z']+", voice))
    return [ch] if ch else []


# ---------------------------------------------------------------- variety: camera moves, backgrounds, transitions
CAMS = ["zoomin", "panleft", "zoomout", "panright", "tiltup", "drift"]
BGS = ["blobs", "grid", "rays", "dots", "stripes", "blobs"]
TRANSITIONS = ["fade", "slideleft", "wipeup", "circleopen", "zoomin", "slideright", "dissolve", "smoothleft", "radial", "wiperight", "slideup", "pixelize", "hlslice", "diagtl"]
OVERLAP = 0.45  # seconds a transition takes
CUT_OVERLAP = 0.05  # a "cut" is a very fast fade


# ---------------------------------------------------------------- script parsing
SCENE_RE = re.compile(r"^SCENE\s*\d+\s*(?:[:.\-–—].*)?$|^SCENE\s*:?\s*$", re.I)
KEY_RE = re.compile(r"^(HOOK|TITLE|MUSIC|VOICE|VISUAL|TEXT|DATA|ICONS?|TONE|PAUSE|SOURCE|SPEAKER|CUT|CAMERA|CAM|MOTION)\s*:\s*(.*)$", re.I)
PAIR_RE = re.compile(r"([^=:;,|\n]+?)\s*[=:]\s*(-?\d[\d,]*\.?\d*)\s*([%A-Za-z$€£]{0,4})")


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def _words(t: str) -> int:
    return len(re.findall(r"[A-Za-z0-9']+", t))


def _split_voice(text: str) -> list[str]:
    """Plain narration -> scene-sized pieces (about 8 to 20 words each, at sentence ends)."""
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", text.strip())) if s.strip()]
    out, cur = [], ""
    for s in sents:
        if cur and _words(cur) + _words(s) > 20:
            out.append(cur)
            cur = s
        else:
            cur = (cur + " " + s).strip()
        if _words(cur) >= 9:
            out.append(cur)
            cur = ""
    if cur:
        if out and _words(cur) < 5:
            out[-1] += " " + cur
        else:
            out.append(cur)
    return out


def _key_phrase(voice: str) -> str:
    """A short on-screen phrase for a scene that has no TEXT: the number if there is one, else the longest few words (in order)."""
    m = re.search(r"\b\d[\d,]*\.?\d*\s?(?:%|percent|million|billion|thousand|x)?", voice)
    if m and _words(voice) > 3:
        return m.group(0).strip().replace(" percent", "%")
    ws = re.findall(r"[A-Za-z0-9']+", voice)
    stop = {"the", "and", "that", "this", "with", "from", "have", "has", "was", "were", "are", "for", "but", "not", "you", "your", "they", "their", "its", "than", "then", "when", "what", "which", "will", "would", "could", "just", "only", "more", "most", "very", "into", "about"}
    cand = [(len(w), i, w) for i, w in enumerate(ws) if w.lower() not in stop and len(w) > 3]
    top = sorted(cand, reverse=True)[:3]
    return " ".join(w for _, _, w in sorted(top, key=lambda x: x[1])).upper() or (" ".join(ws[:3]).upper())


def _infer_type(visual: str, texts: list, data: list) -> str:
    v = (visual or "").lower()
    if re.search(r"quote|saying|\bsaid\b", v) and texts:
        return "quote"
    if re.search(r"donut|doughnut|\bpie\b|\bring\b|share of|split of", v) and len(data) >= 2:
        return "donut"
    if re.search(r"\bstats?\b|big numbers|tiles|numbers grid", v) and len(data) >= 2:
        return "stats"
    if re.search(r"timeline|history|years|dates", v) and len(texts) >= 2:
        return "timeline"
    if re.search(r"\bbars?\b|bar chart|chart", v) and len(data) >= 2:
        return "bars"
    if re.search(r"compar|\bvs\b|versus|before|after|split", v) and (len(texts) >= 2 or len(data) >= 2):
        return "compare"
    if re.search(r"counter|count|stat|number|percent", v) and texts and re.search(r"\d", texts[0]):
        return "counter"
    if re.search(r"arrow|flow|process|steps?", v) and len(texts) >= 2:
        return "flow"
    if re.search(r"list|bullet", v) and len(texts) >= 2:
        return "list"
    if len(data) >= 2:
        return "bars"
    if len(texts) >= 3:
        return "list"
    if texts and re.fullmatch(r"\W*\d[\d,]*\.?\d*\s?(%|x|k|m|b)?\w{0,8}\W*", texts[0].strip(), re.I) and len(texts[0]) <= 14:
        return "counter"
    return "text"


def _finish_scene(raw: dict, i: int, used: set) -> dict:
    voice = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", raw.get("voice", "")).replace("*", "")  # stage directions in brackets are not spoken
    voice = re.sub(r"\s+", " ", voice).strip()
    visual = raw.get("visual", "")
    texts = [t.strip() for t in re.split(r"\s*[|\n]\s*|\s*;\s*", raw.get("text", "")) if t.strip()]
    if not texts:
        texts = [q.strip() for q in re.findall(r"[\"“”']([^\"“”']{2,60})[\"“”']", visual) if q.strip()]
    data = []
    for blob in (raw.get("data", ""), visual if re.search(r"=", visual) else ""):
        for m in PAIR_RE.finditer(blob):
            data.append([m.group(1).strip(" ,;-"), _num(m.group(2)), m.group(3)])
        if data:
            break
    kind = _infer_type(visual, texts, data)
    if kind in ("text", "counter") and not texts:
        texts = [_key_phrase(voice)]
        if kind == "counter" and not re.search(r"\d", texts[0]):
            kind = "text"
    if kind == "quote" and not texts:
        texts = [voice]
    if kind in ("bars", "donut", "stats") and len(data) < 2:
        kind = "list" if len(texts) >= 2 else "text"
    if kind in ("list", "flow", "compare", "timeline") and len(texts) < 2:
        kind = "text"
    icons = pick_icons([k for k in re.split(r"[,;|\s]+", raw.get("icon", "")) if k], voice, used)
    used.clear()
    used.update(icons)
    tone = (raw.get("tone", "") or "neutral").strip().lower()
    tone = tone if tone in TONES else "neutral"
    try:
        pause = max(0.0, min(2.0, float(re.findall(r"[\d.]+", raw.get("pause", "") or "")[0])))
    except (IndexError, ValueError):
        pause = 0.3
    sp = (raw.get("speaker", "") or "").strip().lower()
    speaker = "2" if sp in ("2", "b", "two", "second") else "1" if sp in ("1", "a", "one", "first") else ""
    cut = (raw.get("cut", "") or "").strip().lower()
    cut = cut if cut in TRANSITIONS or cut == "cut" else ""
    cam = (raw.get("cam", "") or "").strip().lower().replace(" ", "")
    cam = cam if cam in CAMS else ""
    return {"i": i, "voice": voice, "type": kind, "texts": texts[:5], "data": data[:6], "icons": icons, "tone": tone, "pause": pause, "source": raw.get("source", ""),
            "speaker": speaker, "cut": cut, "cam": cam}


PROMPT_HINTS = re.compile(r"\[TOPIC\]|use exactly this format|explainer video script about|the exact words to speak|SCENE 2\s*\.\.\.|\(3 to 6 words\)|\(max 8 words shown", re.I)
PROMPT_MSG = ("This is the prompt (the instructions), not a script. Give the prompt to an AI with your topic in place of [TOPIC], "
              "then paste the AI's answer here. Or type a topic above and press 'Write script for me'.")


def parse_script(text: str, length: str = "short") -> dict:
    """Read a pasted script. Understands the SCENE / VOICE / VISUAL / TEXT / DATA / ICON / TONE / PAUSE format, and also plain narration
    (which is cut into scenes at sentence ends). Returns {title, hook, music, scenes, warnings}."""
    head, raws, loose = {}, [], []
    cur, field = None, None
    for rawline in (text or "").replace("\r", "").split("\n"):
        line = rawline.strip().replace("**", "").lstrip("-*#> ").strip()
        if not line:
            continue
        if SCENE_RE.match(line):
            cur = {}
            raws.append(cur)
            field = None
            continue
        m = KEY_RE.match(line)
        if m:
            k, v = m.group(1).lower(), m.group(2).strip()
            if k in ("hook", "title", "music"):
                head[k] = v
                field = ("h", k)
            else:
                k = {"icons": "icon", "camera": "cam", "motion": "cam"}.get(k, k)
                if cur is None or (k == "voice" and cur.get("voice")):
                    cur = {}
                    raws.append(cur)
                cur[k] = v
                field = ("s", k)
            continue
        if field and field[0] == "s" and cur is not None:
            cur[field[1]] = (cur.get(field[1], "") + " " + line).strip()
        elif field and field[0] == "h":
            head[field[1]] = (head[field[1]] + " " + line).strip()
        else:
            loose.append(line)
    warnings = []
    invalid = PROMPT_MSG if PROMPT_HINTS.search(text or "") else ""
    if not any(r.get("voice") for r in raws):  # plain narration
        raws = [{"voice": v} for v in _split_voice(" ".join(loose))]
    else:
        for r in raws:
            if not r.get("voice"):
                warnings.append("A scene has no VOICE line and was skipped.")
        raws = [r for r in raws if r.get("voice")]
    used: set = set()
    scenes = [_finish_scene(r, i, used) for i, r in enumerate(raws)]
    scenes = [s for s in scenes if s["voice"]]
    limit = LENGTHS.get(length, MAX_SECONDS)
    for i, s in enumerate(scenes):
        s["i"] = i
        s["est"] = round(max(2.2, LEAD + _words(s["voice"]) / 2.6 + s["pause"]), 1)
        s["cam"] = s["cam"] or CAMS[(i * 5 + i // 6) % len(CAMS)]  # a different camera move and background from scene to scene
        s["bgs"] = BGS[(i * 7 + 1) % len(BGS)]
        s["trans"] = s["cut"] or ("cut" if i % 4 == 3 else TRANSITIONS[(i * 3) % len(TRANSITIONS)])  # how the video moves INTO this scene
    total = round(sum(s["est"] for s in scenes), 1)
    if total > limit:
        warnings.append(f"About {total:.0f} seconds long. Aim for {limit:.0f} or less (roughly {int(limit * 2.6)} spoken words).")
    if scenes and len(scenes) > (12 if length == "short" else 45):
        warnings.append(f"More than {12 if length == 'short' else 45} scenes: each will be very short.")
    if invalid:
        warnings.insert(0, invalid)
    elif scenes and total < 8:
        warnings.append(f"Only about {total:.0f} seconds. Add more scenes (a short video is about {int(LENGTHS['short'] * 2.6)} spoken words).")
    return {"title": head.get("title", ""), "hook": head.get("hook", ""), "music": head.get("music", ""), "scenes": scenes, "total_est": total, "limit": limit,
            "warnings": warnings, "invalid": invalid}


# ---------------------------------------------------------------- voice
def _ffprobe_dur(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def _synth_edge(text: str, voice: str, rate: int, pitch: int, out: Path) -> list[dict]:
    import edge_tts

    async def go():
        com = edge_tts.Communicate(text, voice, rate=f"{rate:+d}%", pitch=f"{pitch:+d}Hz", boundary="WordBoundary")
        words = []
        with open(out, "wb") as f:
            async for ch in com.stream():
                if ch["type"] == "audio":
                    f.write(ch["data"])
                elif ch["type"] == "WordBoundary":
                    words.append({"word": ch["text"], "start": ch["offset"] / 1e7, "end": (ch["offset"] + ch["duration"]) / 1e7})
        return words
    return asyncio.run(asyncio.wait_for(go(), 90))


def _synth_windows(text: str, rate: int, out_wav: Path) -> list[dict]:
    """Offline fallback: the Windows voice. It gives no word times, so they are spread by word length."""
    r = max(-10, min(10, round(rate / 6)))
    ps = ("Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
          f"$s.SetOutputToWaveFile('{out_wav}'); $s.Rate = {r}; $s.Speak([Console]::In.ReadToEnd()); $s.Dispose()")
    p = subprocess.run(["powershell", "-NoProfile", "-Command", ps], input=text, capture_output=True, text=True, encoding="utf-8")
    if p.returncode != 0 or not out_wav.exists():
        raise RuntimeError("The Windows voice failed: " + (p.stderr or "")[:150])
    dur = _ffprobe_dur(out_wav)
    toks = re.findall(r"\S+", text)
    weights = [len(t) + 2 for t in toks]
    tot, t, words = sum(weights), 0.0, []
    for tok, w in zip(toks, weights):
        d = dur * 0.96 * w / tot
        words.append({"word": tok, "start": t, "end": t + d * 0.92})
        t += d
    return words


def speak(text: str, voice: str, rate: int, tone: str) -> dict:
    """One scene's voice: {wav, dur, words} (word times from the start of the audio). Cached by content."""
    dr, dp = TONES.get(tone, TONES["neutral"])
    key = hashlib.sha1(json.dumps([text, voice, rate, tone, "v1"]).encode()).hexdigest()[:16]
    wav, meta = CACHE / f"voice_{key}.wav", CACHE / f"voice_{key}.json"
    if wav.exists() and meta.exists():
        return {"wav": wav, **json.loads(meta.read_text("utf-8"))}
    raw = CACHE / f"voice_{key}.tmp"
    try:
        if voice == "windows":
            words = _synth_windows(text, rate + dr, wav)
        else:
            try:
                words = _synth_edge(text, voice, rate + dr, dp, raw)
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-ar", "44100", "-ac", "1", str(wav)], check=True)
            except Exception as e:
                try:  # no internet / the service changed: use the offline voice instead of failing the whole video
                    words = _synth_windows(text, rate + dr, wav)
                except Exception:
                    raise RuntimeError("The free voice needs an internet connection and could not be reached: " + str(e)[:120])
    finally:
        raw.unlink(missing_ok=True)
    dur = _ffprobe_dur(wav)
    meta.write_text(json.dumps({"dur": dur, "words": words}), "utf-8")
    return {"wav": wav, "dur": dur, "words": words}


# ---------------------------------------------------------------- drawing the scenes
def _scene_key(sc: dict, theme: str, dur: float) -> str:
    body = {"type": sc["type"], "texts": sc["texts"], "data": sc["data"], "icons": sc["icons"], "cam": sc.get("cam"), "bgs": sc.get("bgs"), "theme": theme, "dur": round(dur, 3), "v": CACHE_VERSION}
    return hashlib.sha1(json.dumps(body, sort_keys=True).encode()).hexdigest()[:16]


def _draw_group(group: list, theme: dict, adv) -> None:
    """One browser draws its share of the scenes (scene, seconds, output file)."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": RW, "height": RH})
            page.goto(TEMPLATE.as_uri())
            for sc, dur, out in group:
                n = max(1, round(dur * FPS))
                page.evaluate("([s, t, d]) => setup(s, t, d)", [sc, theme, dur])
                tmp = out.with_suffix(".tmp.mp4")
                ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "-",
                                       "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS), str(tmp)], stdin=subprocess.PIPE)
                try:
                    for f in range(n):
                        page.evaluate(f"window.at({f / FPS})")
                        ff.stdin.write(page.screenshot(type="jpeg", quality=90))
                        if f % 6 == 5:
                            adv(6)
                finally:
                    ff.stdin.close()
                    ff.wait()
                if ff.returncode != 0 or not tmp.exists():
                    raise RuntimeError("Drawing a scene failed (ffmpeg).")
                _replace(tmp, out)
        finally:
            browser.close()


def _draw_scenes(todo: list, theme: dict, tick, workers: int = 2) -> None:
    """Draw every scene in `todo` with `workers` browsers at once. tick(fraction_done) is called as frames are finished."""
    total = sum(max(1, round(d * FPS)) for _, d, _ in todo)
    state = {"n": 0}
    lock = threading.Lock()

    def adv(k):
        with lock:
            state["n"] += k
            tick(min(1.0, state["n"] / total))
    groups = [todo[i::workers] for i in range(min(workers, len(todo)))]
    with ThreadPoolExecutor(max_workers=len(groups)) as ex:
        for f in [ex.submit(_draw_group, g, theme, adv) for g in groups]:
            f.result()


# ---------------------------------------------------------------- records
_lock = threading.RLock()
_pool = ThreadPoolExecutor(max_workers=1)  # one video at a time


def _rec_path(eid: str) -> Path:
    return DIR / eid / "explainer.json"


def get(eid: str) -> dict | None:
    f = _rec_path(eid)
    if not eid.isalnum() or not f.exists():
        return None
    with _lock:
        try:
            return json.loads(f.read_text("utf-8"))
        except json.JSONDecodeError:
            return None


def _replace(src, dst, tries: int = 40):
    """Move src over dst. OneDrive/antivirus can lock a file for a moment on Windows ("Access is denied"), so wait and try again."""
    for n in range(tries):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            if n == tries - 1:
                raise
            time.sleep(0.15 + 0.05 * n)


def _save(rec: dict):
    with _lock:
        p = _rec_path(rec["id"])
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(rec, indent=1), "utf-8")
        try:
            _replace(tmp, p)
        except PermissionError:  # still locked: write in place rather than lose progress
            p.write_text(json.dumps(rec, indent=1), "utf-8")


def _set(eid: str, **f) -> dict:
    with _lock:
        rec = get(eid)
        if rec is None:
            raise KeyError(eid)
        rec.update(f)
        _save(rec)
        return rec


def list_all() -> list[dict]:
    out = []
    for d in DIR.iterdir():
        if d.is_dir() and not d.name.startswith("_"):
            r = get(d.name)
            if r:
                out.append({k: v for k, v in r.items() if k != "script"} | {"title": r.get("title") or "Untitled"})
    return sorted(out, key=lambda r: -r.get("created", 0))


def create(script: str, style: dict | None = None) -> dict:
    parsed = parse_script(script, clean_style(style)["length"])
    if parsed["invalid"]:
        raise ValueError(parsed["invalid"])
    if not parsed["scenes"]:
        raise ValueError("Paste a script first: the narration for each scene, or the SCENE / VOICE format.")
    eid = uuid.uuid4().hex[:10]
    rec = {"id": eid, "created": time.time(), "title": parsed["title"] or parsed["scenes"][0]["voice"][:50], "script": script, "style": clean_style(style),
           "status": "queued", "stage": "Waiting", "progress": 0, "error": None, "version": 0, "duration": None, "scenes": []}
    _save(rec)
    _pool.submit(_run, eid)
    return rec


def update(eid: str, script: str | None = None, style: dict | None = None) -> dict:
    rec = get(eid)
    if rec is None:
        raise KeyError(eid)
    if rec["status"] in ("queued", "running"):
        raise ValueError("This video is still being made.")
    f = {}
    if script is not None:
        parsed = parse_script(script)
        if parsed["invalid"]:
            raise ValueError(parsed["invalid"])
        if not parsed["scenes"]:
            raise ValueError("The script has no narration.")
        f.update(script=script, title=parsed["title"] or parsed["scenes"][0]["voice"][:50])
    if style is not None:
        f["style"] = clean_style(style)
    f.update(status="queued", stage="Waiting", progress=0, error=None)
    rec = _set(eid, **f)
    _pool.submit(_run, eid)
    return rec


def delete(eid: str) -> bool:
    rec = get(eid)
    if rec is None:
        return False
    if rec["status"] in ("queued", "running"):
        raise ValueError("This video is still being made.")
    import jobs
    import webupload
    if webupload.is_active(eid, "c1"):
        raise ValueError("This video is uploading right now. Stop the upload first.")
    shutil.rmtree(DIR / eid, ignore_errors=True)
    shutil.rmtree(jobs.job_dir(eid), ignore_errors=True)  # its small upload project, if it had one
    return True


def bridge_job(eid: str) -> dict:
    """Uploading reuses the clip uploader (queue, one browser per channel, retries, pause, Uploads page). That uploader works on a project's
    clip, so a finished explainer gets a small project of its own with the video as its one clip ("c1"). Returns {job_id, clip_id}."""
    import jobs
    import webupload
    rec = get(eid)
    if not rec or rec["status"] != "ready":
        raise ValueError("Make the video first.")
    d = jobs.job_dir(eid)
    (d / "clips").mkdir(parents=True, exist_ok=True)
    with jobs._lock:
        job = jobs.read_job(eid)
        busy = bool(job) and webupload.is_active(eid, "c1")
        old = ((job or {}).get("clips") or [{}])[0]
        changed = old.get("version") != rec["version"]
        if not busy and (changed or not (d / "clips" / "c1.mp4").exists()):
            shutil.copyfile(DIR / eid / "out.mp4", d / "clips" / "c1.mp4")
            if (DIR / eid / "thumb.jpg").exists():
                shutil.copyfile(DIR / eid / "thumb.jpg", d / "clips" / "c1.jpg")
        clip = {"id": "c1", "title": rec["title"], "reason": "2D explainer video", "score": 0, "status": "ready", "selected": True, "error": None,
                "version": rec["version"], "progress": 100,
                "params": {"start": 0, "end": rec.get("duration") or 0, "layout_id": "fill", "subtitles": True, "sub_style": "bold_yellow", "resolution": "1080p", "overlays": []}}
        if old.get("publish") and (busy or not changed):
            clip["publish"] = old["publish"]  # keep the upload state unless the video itself changed
        if job is None:
            job = {"id": eid, "created": time.time(), "url": None, "source": "explainer", "creator_id": None, "title": rec["title"], "status": "done", "stage": "Done",
                   "stage_key": "done", "progress": 100, "error": None, "finished": time.time(), "log": [], "options": jobs.clean_options({})}
        job.update(title=rec["title"], clips=[clip], status="done", explainer=eid)
        jobs.write_job(job)
    return {"job_id": eid, "clip_id": "c1"}


def upload_state(eid: str) -> dict | None:
    """The YouTube upload state of an explainer's clip, if it was ever sent to the uploader."""
    import jobs
    job = jobs.read_job(eid) if (jobs.job_dir(eid) / "job.json").exists() else None
    if not job or job.get("source") != "explainer":
        return None
    return (((job.get("clips") or [{}])[0].get("publish") or {}).get("youtube")) or None


def recover():
    """After a restart, anything that was in progress was interrupted."""
    for r in list_all():
        if r["status"] in ("queued", "running"):
            _set(r["id"], status="error", error="Stopped when the app was closed. Press Make video again.", stage="Stopped")


def _prune():
    files = sorted(CACHE.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)
    for f in files[600:]:
        f.unlink(missing_ok=True)


# ---------------------------------------------------------------- the whole video
def _q(x: float) -> float:
    return round(x * FPS) / FPS  # every length is a whole number of frames, so video and voice never drift apart


def _run(eid: str):
    try:
        rec = get(eid)
        if rec is None:
            return
        st = clean_style(rec["style"])
        theme = THEMES[st["theme"]]
        out_dir = DIR / eid
        parsed = parse_script(rec["script"], st["length"])
        scenes = parsed["scenes"]
        if not scenes:
            raise ValueError("The script has no narration.")
        n = len(scenes)

        def stage(name, pct):
            _set(eid, status="running", stage=name, progress=int(pct))
        stage("Making the voice", 1)

        def voice_for(sc):
            second = st["voice2"] and (sc["speaker"] == "2" or (sc["speaker"] == "" and sc["type"] == "quote"))
            return st["voice2"] if second else st["voice"]
        voices = [None] * n
        done = {"n": 0}
        with ThreadPoolExecutor(max_workers=4) as ex:
            futs = {ex.submit(speak, sc["voice"], voice_for(sc), st["rate"], sc["tone"]): k for k, sc in enumerate(scenes)}
            from concurrent.futures import as_completed
            for f in as_completed(futs):
                voices[futs[f]] = f.result()
                done["n"] += 1
                stage(f"Making the voice ({done['n']} of {n})", 1 + 24 * done["n"] / n)
        # timeline: every scene is a whole number of frames; each scene also stays on screen a little longer while the next one fades in
        t, words, durs, starts = 0.0, [], [], []
        for sc, v in zip(scenes, voices):
            d = _q(max(2.2, LEAD + v["dur"] + sc["pause"]))
            starts.append(t)
            durs.append(d)
            for w in v["words"]:
                words.append({"word": " " + w["word"], "start": t + LEAD + w["start"], "end": t + LEAD + w["end"]})
            t += d
        total = t
        names = [scenes[i + 1]["trans"] for i in range(n - 1)]
        over = [_q(CUT_OVERLAP if nm == "cut" else OVERLAP) for nm in names]
        rdur = [_q(durs[i] + (over[i] if i < n - 1 else 0.0)) for i in range(n)]
        # voice track: each scene's audio padded to its exact length, joined
        parts = []
        for k, (v, d) in enumerate(zip(voices, durs)):
            p = out_dir / f"a{k}.wav"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(v["wav"]), "-af", f"adelay={int(LEAD * 1000)}:all=1,apad=whole_dur={d:.3f}", "-t", f"{d:.3f}",
                            "-ar", "44100", "-ac", "1", str(p)], check=True)
            parts.append(p)
        lst = out_dir / "audio.txt"
        lst.write_text("".join(f"file '{p.name}'\n" for p in parts), "utf-8")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out_dir / "voice.wav")], check=True)
        # scene pictures (only the ones not drawn before)
        stage("Drawing the scenes", 26)
        files = [CACHE / f"scene_{_scene_key(sc, st['theme'], d)}.mp4" for sc, d in zip(scenes, rdur)]
        todo = [(sc, d, f) for sc, d, f in zip(scenes, rdur, files) if not f.exists()]
        if todo:
            _draw_scenes(todo, theme, lambda frac: stage(f"Drawing the scenes ({len(todo)} to draw)", 26 + 54 * frac))
        stage("Putting it together", 82)
        # join the scenes with a changing transition between each pair (scene i+1 starts fading in exactly when its voice starts)
        graph, last = [], "[0:v]"
        for i in range(n - 1):
            nm = "fade" if names[i] == "cut" else names[i]
            out = f"[x{i}]"
            graph.append(f"{last}[{i + 1}:v]xfade=transition={nm}:duration={over[i]:.4f}:offset={sum(durs[:i + 1]):.4f}{out}")
            last = out
        overlays = [subtitles.hook_overlay(parsed["hook"], None)] if parsed["hook"] else []
        if overlays:
            overlays[0]["end"] = min(overlays[0]["end"], total * 0.5)
        (out_dir / "cap.ass").write_text(subtitles.build_ass(words, 0, total, 1080, 1920, True, st["caption_style"], overlays), "utf-8")
        music = sound.clean_music(st["music"])
        mfile = sound.track_path(music)
        cmd = ["ffmpeg", "-y", "-loglevel", "error"]
        for f in files:
            cmd += ["-i", f.as_posix()]
        cmd += ["-i", "voice.wav"]
        fg = ";".join(graph + [f"{last}scale=1080:1920:flags=lanczos,ass=cap.ass[v]", f"[{n}:a]loudnorm=I=-16:TP=-1.5:LRA=11[sp]"])
        if mfile:
            cmd += ["-stream_loop", "-1", "-i", str(mfile)]
            fg += f";[{n + 1}:a]volume={music['volume'] / 100:.3f}[mus]"
            if music["duck"]:
                fg += ";[sp]asplit=2[s1][s2];[mus][s1]sidechaincompress=threshold=0.04:ratio=10:attack=30:release=500[md];[s2][md]amix=inputs=2:duration=first:normalize=0[a]"
            else:
                fg += ";[sp][mus]amix=inputs=2:duration=first:normalize=0[a]"
        else:
            fg += ";[sp]anull[a]"
        (out_dir / "filter.txt").write_text(fg, "utf-8")
        cmd += ["-/filter_complex", "filter.txt", "-map", "[v]", "-map", "[a]", "-t", f"{total:.3f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "out.mp4"]
        r = subprocess.run(cmd, cwd=out_dir, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError("Putting the video together failed: " + r.stderr[-300:])
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "1", "-i", "out.mp4", "-frames:v", "1", "-vf", "scale=360:-2", "thumb.jpg"], cwd=out_dir)
        for p in parts:
            p.unlink(missing_ok=True)
        rec = get(eid)
        _set(eid, status="ready", stage="Done", progress=100, version=rec["version"] + 1, duration=round(total, 1),
             scenes=[{"i": sc["i"], "voice": sc["voice"], "type": sc["type"], "start": round(s0, 1), "dur": round(d, 1), "trans": sc["trans"], "cam": sc["cam"]} for sc, s0, d in zip(scenes, starts, durs)],
             warnings=parsed["warnings"])
        _prune()
    except Exception as e:
        try:
            _set(eid, status="error", stage="Failed", error=str(e)[:400])
        except KeyError:
            pass


# ---------------------------------------------------------------- the optional AI script writer (one request)
class ScriptScene(BaseModel):
    voice: str  # the exact words spoken in this scene
    visual: str  # one of: text, counter, list, bars, compare, flow
    text: str  # what shows on screen, items separated by |  (for counter: the number, for example 20%)
    data: str  # only for bars (and compare): Label=Value; Label=Value  (real numbers only, otherwise empty)
    icon: str  # 1 to 3 simple object keywords
    tone: str  # neutral, calm, serious, energetic, excited, slow or fast
    pause: float  # seconds of silence after the scene (0 to 1)
    source: str  # where a number comes from, or empty
    title: str  # first item only: the video title
    hook: str  # first item only: on-screen hook line (max 8 words, a question or surprising claim, NOT spoken)


SCRIPT_PROMPT = """Write a vertical 2D explainer video script {size}.
TOPIC: {topic}
{notes}
RULES
- {words}
- Scene 1's voice line must open with a curiosity gap (a surprising fact, a question or a claim) in its first 6 words. No greetings, no "welcome".
- The last scene is a payoff or a thought-provoking line. Never say "like and subscribe".
- Write for the ear: short sentences, plain words, numbers written as words in `voice` ("twenty percent"), no emojis, no brackets, no abbreviations.
- Use only facts you are sure are true. Put the source of each number in `source`. If you are not sure of a number, do not use it.
- `visual` is one of: text (a big phrase), counter (one big number), list (3 to 4 short items), bars (2 to 5 labelled numbers), compare (two things), flow (2 to 4 steps),
  quote (a short quote or key sentence on screen; text = the quote | who said it), donut (shares of a whole, 2 to 5 labelled numbers in `data`), stats (2 to 4 big labelled numbers in `data`),
  timeline (2 to 5 items written like `1969: Moon landing` in `text`).
  {mix}
- `text`: what shows on screen, items separated by | . For counter the first item is the number with its sign, for example 20%. Keep every item under 5 words.
- `data`: only for bars, donut, stats or compare, like `Brain=20; Heart=8; Liver=5` with the same unit for every value. Empty for other visuals.
- `icon`: 1 to 3 simple object words that could be drawn (brain, battery, clock...).
- `tone`: neutral, calm, serious, energetic, excited, slow or fast. Vary it a little; most scenes neutral.
- `pause`: 0.2 for most scenes; up to 0.8 before the payoff.
- Only the first item has `title` (3 to 6 words) and `hook` (max 8 words, shown on screen at the start, not spoken). Other items leave them empty.
Return one item per scene, in order."""


def script_to_text(rows: list[dict]) -> str:
    lines = []
    if rows:
        if rows[0].get("title"):
            lines.append("TITLE: " + rows[0]["title"].strip())
        if rows[0].get("hook"):
            lines.append("HOOK: " + rows[0]["hook"].strip())
    for i, r in enumerate(rows, 1):
        lines += ["", f"SCENE {i}", "VOICE: " + (r.get("voice") or "").strip(), "VISUAL: " + (r.get("visual") or "text").strip()]
        for k, name in (("text", "TEXT"), ("data", "DATA"), ("icon", "ICON"), ("tone", "TONE")):
            if (r.get(k) or "").strip():
                lines.append(f"{name}: {r[k].strip()}")
        if r.get("pause") is not None:
            lines.append(f"PAUSE: {float(r['pause']):.1f}")
        if (r.get("source") or "").strip():
            lines.append("SOURCE: " + r["source"].strip())
    return "\n".join(lines)


LONG_WORDS = ("BETWEEN 400 AND 450 spoken words in total (count them, never more than 450), split into 18 to 22 scenes. Every `voice` line is 15 to 28 words: two short sentences, never a fragment. "
              "Structure: a hook, 4 short sections that each make one clear point with an example, a quick recap, and a payoff.")
SHORT_WORDS = "95 to 105 spoken words in total, split into 6 to 8 scenes of 3 to 6 seconds each (8 to 18 words per scene)."


def write_script(topic: str, notes: str = "", log=None, length: str = "short") -> str:
    """Ask Gemini (or another configured AI) for a script: ONE request. Returns the script text for the box, to be edited."""
    import pipeline
    topic = (topic or "").strip()
    if len(topic) < 3:
        raise ValueError("Type a topic first.")
    log = log or (lambda *a, **k: None)
    long_ = length == "long"
    prompt = SCRIPT_PROMPT.format(size="of about 2.5 minutes" if long_ else "of 38 seconds for YouTube Shorts", words=LONG_WORDS if long_ else SHORT_WORDS,
                                  mix="Use at least 7 different visuals across the scenes and never the same visual twice in a row." if long_ else "Use a mix of at least 4 different visuals across the scenes.",
                                  topic=topic[:300], notes=(f"EXTRA NOTES: {notes.strip()[:600]}" if notes.strip() else ""))
    rows = pipeline._ask_llm(prompt, list[ScriptScene], log)
    rows = [r for r in rows if (r.get("voice") or "").strip()]
    if long_ and rows:  # the AI often writes far less than asked: one more try, telling it exactly how short it was
        have = sum(_words(r["voice"]) for r in rows)
        if have < 300:
            again = pipeline._ask_llm(prompt + f"\n\nYOUR LAST ANSWER HAD ONLY {have} SPOKEN WORDS. That is far too short. Write the whole script again with between 400 and 450 spoken words: "
                                      "more scenes and longer voice lines (two sentences each), with more detail and examples in every section.", list[ScriptScene], log)
            again = [r for r in again if (r.get("voice") or "").strip()]
            if sum(_words(r["voice"]) for r in again) > have:
                rows = again
    if not rows:
        raise RuntimeError("The AI returned no script. Try again.")
    return script_to_text(rows)
