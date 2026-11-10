import os
"""download -> transcribe -> pick viral moments (Gemini) -> render clips (ffmpeg)."""
import difflib
import json
import re
import subprocess
from pathlib import Path

from pydantic import BaseModel

import aiusage
import config
import retention
import look
import motion
import sound
import stock
from layouts import build_filter, get_layout
from subtitles import build_ass, clean_token


# ---------------------------------------------------------------- download
def download(url: str, job_dir: Path, on_progress=None) -> dict:
    import yt_dlp

    done_streams = {"n": 0}

    def hook(d):
        # video + audio download as separate streams, then merge: map to a smooth 0-100
        if d["status"] == "finished":
            done_streams["n"] += 1
        if on_progress and d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            if total:
                frac = d.get("downloaded_bytes", 0) / total
                on_progress((done_streams["n"] + frac) / 2 * 100 if done_streams["n"] < 2 else 99)

    opts = {
        "progress_hooks": [hook],
        "noprogress": True,
        # Prefer H.264: AV1/VP9 1080p60 is very slow to decode on a CPU
        "format": ("bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080][vcodec^=avc1]+ba/"
                   "bv*[height<=1080][fps<=30]+ba/bv*[height<=1080]+ba/b[height<=1080]/b"),
        "merge_output_format": "mp4",
        "outtmpl": str(job_dir / "source.%(ext)s"),
        "quiet": True,
        "noplaylist": True,
    }
    if config.YTDLP_COOKIES_BROWSER:
        opts["cookiesfrombrowser"] = (config.YTDLP_COOKIES_BROWSER,)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as e:
        if "not a bot" in str(e):
            raise RuntimeError(
                "YouTube is asking to confirm you're not a bot, so the download was blocked. Options: wait a while and "
                "retry, download the video yourself and use the Upload option, or set YTDLP_COOKIES_BROWSER=chrome "
                "(or edge/firefox) in .env to let the app use your browser's YouTube login.") from e
        raise
    return {
        "title": info.get("title", ""),
        "channel": info.get("channel") or info.get("uploader", ""),
        "duration": info.get("duration") or 0,
        "heatmap": info.get("heatmap") or [],
        "description": (info.get("description") or "")[:4000],
        "video_id": info.get("id"),
    }


def fetch_captions(url: str, job_dir: Path) -> str:
    """Best effort: download YouTube's own word-timed captions. Returns '' on success or a reason string.
    Kept separate from the video download because a caption failure (often HTTP 429) must never fail the job."""
    import time
    import yt_dlp

    opts = {"skip_download": True, "writesubtitles": True, "writeautomaticsub": True, "subtitlesformat": "json3",
            "subtitleslangs": ["en", "en-orig"], "outtmpl": str(job_dir / "source.%(ext)s"),
            "quiet": True, "noplaylist": True}
    if config.YTDLP_COOKIES_BROWSER:
        opts["cookiesfrombrowser"] = (config.YTDLP_COOKIES_BROWSER,)
    err = ""
    for attempt in range(3):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.extract_info(url, download=True)
            cf = captions_file(job_dir)
            if cf and parse_captions(cf):
                return ""
            return "no usable English captions on this video"
        except Exception as e:
            import re
            err = re.sub(r"\[[0-9;]*m", "", str(e)).replace("ERROR: ", "")[:160]  # drop terminal colour codes
            if "429" not in err:
                break
            time.sleep(4 * (attempt + 1))
    return err


def source_path(job_dir: Path) -> Path:
    for p in job_dir.glob("source.*"):
        if p.suffix.lower() in (".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v"):
            return p
    raise FileNotFoundError("The source video is gone (removed by auto-delete after the upload, or deleted). Re-create the project to edit or re-render.")


# -------------------------------------------------------------- transcribe
_model = None


def captions_file(job_dir: Path):
    files = sorted(job_dir.glob("source.*.json3"))
    return files[0] if files else None


def parse_captions(path: Path) -> list[dict]:
    """YouTube json3 captions -> [{start,end,text,words:[{word,start,end}]}]. Empty list if unusable."""
    try:
        events = json.loads(path.read_text("utf-8")).get("events", [])
    except Exception:
        return []
    out = []
    for ev in events:
        segs = ev.get("segs")
        if not segs or "tStartMs" not in ev:
            continue
        base = ev["tStartMs"] / 1000
        ev_end = base + ev.get("dDurationMs", 0) / 1000
        words = []
        for s in segs:
            t = (s.get("utf8") or "").strip()
            if not t:
                continue
            st = base + s.get("tOffsetMs", 0) / 1000
            for part in t.split():  # a seg is usually one word, but be safe
                part = clean_token(part)
                if not part:
                    continue
                words.append({"word": " " + part, "start": st, "end": st})
        if not words:
            continue
        for i, w in enumerate(words):
            nxt = words[i + 1]["start"] if i + 1 < len(words) else ev_end
            w["end"] = round(max(w["start"] + 0.08, min(nxt, w["start"] + 1.2)), 3)
            w["start"] = round(w["start"], 3)
        out.append({"start": words[0]["start"], "end": words[-1]["end"],
                    "text": "".join(w["word"] for w in words).strip(), "words": words})
    out.sort(key=lambda s: s["start"])
    # auto-caption events can overlap in time; drop words that start before the previous word
    last = -1.0
    for s in out:
        kept = []
        for w in s["words"]:
            if w["start"] >= last:
                kept.append(w)
                last = w["start"]
        s["words"] = kept
    out = [s for s in out if s["words"]]
    return out if sum(len(s["words"]) for s in out) >= 20 else []


def transcribe(video: Path, job_dir: Path, on_progress=None) -> list[dict]:
    cache = job_dir / "transcript.json"
    if cache.exists():
        return json.loads(cache.read_text("utf-8"))
    cf = captions_file(job_dir)
    if cf:
        segs = parse_captions(cf)
        if segs:
            cache.write_text(json.dumps(segs), "utf-8")
            return segs
    global _model
    from faster_whisper import WhisperModel

    if _model is None:
        _model = WhisperModel(config.WHISPER_MODEL, device="cpu", compute_type="int8")
    # Decode with ffmpeg ourselves (avoids PyAV version issues), 16 kHz mono float32
    import numpy as np
    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        capture_output=True, check=True).stdout
    audio = np.frombuffer(raw, dtype=np.float32)
    segs, _ = _model.transcribe(audio, word_timestamps=True, vad_filter=True)
    out = []
    total = max(len(audio) / 16000, 1)
    for s in segs:
        if on_progress:
            on_progress(s.end / total * 100)
        out.append({
            "start": s.start, "end": s.end, "text": s.text.strip(),
            "words": [{"word": w.word, "start": w.start, "end": w.end} for w in (s.words or [])],
        })
    cache.write_text(json.dumps(out), "utf-8")
    return out


# ------------------------------------------------------------------ select
class ClipPick(BaseModel):
    start: float
    end: float
    title: str
    reason: str
    score: int  # 1-100


PROMPT = """You are an expert short-form video editor (TikTok / Reels / Shorts).
Below is a timestamped transcript of a long video. {ask}

A great clip:
- Has a strong hook in the first 3 seconds (a bold claim, question, surprise, conflict)
- Is funny, shocking, emotional, controversial, or a very insightful/story payoff
- Is self-contained: makes sense without the rest of the video
- Starts at the beginning of a sentence and ends after the payoff, never mid-sentence
- Is between {min_len} and {max_len} seconds long
- Does not overlap other picks, and is NOT a repeat of another pick (same topic / same joke / same point = pick only the best one)

{about}{heat}
Transcript (format: [seconds] text):
{transcript}

Return a JSON list. `score` is 1-100 virality potential. `title` is a punchy title (max 8 words).
`reason` is one sentence. If the video brief names the people involved, use their real names in the title so it is specific and not misleading (e.g. "Abdul El-Sayed's Grandparents Take Over His Ad" instead of "Grandparents Steal the Show")."""


def _heat_hint(heatmap: list[dict]) -> str:
    if not heatmap:
        return ""
    top = sorted(heatmap, key=lambda h: h["value"], reverse=True)[:8]
    spans = ", ".join(f"{h['start_time']:.0f}s-{h['end_time']:.0f}s" for h in sorted(top, key=lambda h: h["start_time"]))
    return f"YouTube 'Most replayed' data says viewers rewatch these ranges the most: {spans}. Weigh these heavily.\n"


def _ask_gemini(prompt: str, schema, keys: list[str], log) -> list[dict]:
    """Structured Gemini call. Walks the model fallback list; moves to the next API key only when every model
    on the current key is out of quota. Retries overload spikes after a short wait."""
    import time
    from google import genai
    from google.genai import types

    import keystate
    keys = [k for i, k in enumerate(keys) if k and k not in keys[:i]]
    if not keys:
        raise RuntimeError("GEMINI_API_KEY missing. Copy .env.example to .env and set it.")
    total = len(keys)
    keys = keystate.usable("gemini", keys)  # skip keys already known to be rate limited
    if len(keys) < total:
        log(f"Using {len(keys)} of {total} Gemini keys (the rest are rate limited right now)")
    resp, last = None, None
    for ki, key in enumerate(keys):
        client = genai.Client(api_key=key)
        quota_n = tried = 0
        bad = False
        if ki:
            log("Switching to the next API key", "warn")
        for rnd in range(3):  # whole fallback list, then wait and try again (overload spikes are usually brief)
            overloaded = False
            for model in config.GEMINI_MODELS:
                try:
                    log(f"Trying {model}...")
                    resp = client.models.generate_content(
                        model=model, contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json", response_schema=schema,
                            http_options=types.HttpOptions(timeout=75_000)))
                    log(f"{model} answered", "ok")
                    um = getattr(resp, "usage_metadata", None)
                    aiusage.record("gemini", model, True, len(prompt), getattr(um, "total_token_count", 0) or 0)
                    break
                except Exception as e:
                    last = e
                    tried += 1
                    aiusage.record("gemini", model, False, len(prompt))
                    overloaded = overloaded or "503" in str(e) or "UNAVAILABLE" in str(e) or "timed out" in str(e)
                    quota = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)
                    quota_n += 1 if quota else 0
                    if "API key not valid" in str(e) or "API_KEY_INVALID" in str(e) or "PERMISSION_DENIED" in str(e):
                        bad = True
                        log("This Gemini key is invalid or disabled - skipping it", "warn")
                        break
                    log(f"{model}: {'daily quota used up' if quota else 'unavailable (' + str(e)[:50] + ')'} - trying next model", "warn")
                    if not any(c in str(e) for c in ("503", "429", "404", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "NOT_FOUND", "timed out", "Timeout")):
                        raise
            if resp is not None or bad or not overloaded:
                break  # answered, or only quota/not-found errors (waiting won't help)
            if rnd < 2:
                wait = 20 * (rnd + 1)
                log(f"All models busy - waiting {wait}s then trying again (round {rnd + 2} of 3)", "warn")
                time.sleep(wait)
        if resp is not None:
            keystate.mark_ok("gemini", key)
            break
        if bad:
            keystate.mark_limited("gemini", key, 3600, "invalid key")
        elif tried and quota_n == tried:  # every model refused with a quota error: this key is spent for now
            keystate.mark_limited("gemini", key, keystate.quota_seconds(str(last)), "rate limited")
    if resp is None:
        raise RuntimeError(f"All Gemini models failed. Last error: {last}")
    return [p.model_dump() for p in resp.parsed] if resp.parsed else json.loads(resp.text)


KIND_HINTS = {
    "gaming": (
        "CONTENT TYPE: GAMING / FUNNY MOMENTS. Speech may be sparse, so do not rely on the words alone. Look for: "
        "clutch plays and wins, fails and rage, jump-scares, glitches, unexpected twists, jokes and banter, loud reactions "
        "(screaming, laughing). Start 3-8 seconds BEFORE the moment so the setup is visible, and end just after the "
        "reaction. Funny beats the setup-to-punchline order: never cut before the punchline lands.\n"),
    "talk": (
        "CONTENT TYPE: TALK / PODCAST / INTERVIEW. Favor strong opinions, stories with a payoff, controversy and "
        "quotable insights.\n"),
}


def audio_peaks(video: Path, top: int = 12) -> list[tuple[int, float]]:
    """Loud moments (laughter, screams, explosions, hype) as [(second, loudness vs the video's typical level)]."""
    try:
        import numpy as np
        raw = subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "-"],
            capture_output=True, check=True).stdout
        a = np.frombuffer(raw, dtype=np.float32)
        sec = len(a) // 8000
        if sec < 20:
            return []
        rms = np.sqrt((a[:sec * 8000].reshape(sec, 8000) ** 2).mean(axis=1))
        ratio = rms / (np.median(rms) + 1e-6)
        picked: list[tuple[int, float]] = []
        for i in np.argsort(-ratio):
            if ratio[i] < 2.0 or len(picked) >= top:
                break
            if all(abs(int(i) - j) >= 15 for j, _ in picked):
                picked.append((int(i), float(ratio[i])))
        return sorted(picked)
    except Exception:
        return []


def _kind_hint(kind: str, peaks) -> str:
    out = KIND_HINTS.get(kind, "")
    if peaks:
        spans = ", ".join(f"{t}s ({r:.1f}x)" for t, r in peaks)
        out += f"Audio analysis found unusually LOUD moments (often laughter, screams, hype or action) at: {spans}. Consider them strong candidates.\n"
    return out


def ai_available() -> bool:
    import llm
    return bool(config.GEMINI_KEYS or llm.providers())


def _ask_llm(prompt: str, schema, log, spread: bool = False) -> list[dict]:
    """Ask any configured AI: all Gemini keys first, then every other provider (Grok, Groq, ...) until one answers.
    spread=True starts with the second Gemini key so several jobs/steps share quota instead of draining one key."""
    import llm
    aiusage.set_purpose(schema)
    keys = list(config.GEMINI_KEYS)
    if spread and len(keys) > 1:
        keys = keys[1:] + keys[:1]
    errors = []
    if keys:
        try:
            return _ask_gemini(prompt, schema, keys, log)
        except Exception as e:
            errors.append(f"Gemini: {str(e)[:100]}")
            if llm.providers():
                log("Gemini is out of capacity - switching to your other AI providers", "warn")
    for p in llm.providers():
        try:
            out = llm.ask(p, prompt, schema, log)
            aiusage.record(str(p), "", True, len(prompt))
            return out
        except Exception as e:
            aiusage.record(str(p), "", False, len(prompt))
            errors.append(str(e)[:120])
    if not errors:
        raise RuntimeError("No AI key configured. Add GEMINI_API_KEY (or another provider's key) to .env.")
    raise RuntimeError("All AI providers failed. " + " | ".join(errors))


def select_clips(transcript: list[dict], heatmap: list[dict], n: int, min_len: int, max_len: int, log=None,
                 kind: str = "auto", peaks=None, duration: float = 0, context: dict | None = None) -> list[dict]:
    log = log or (lambda *a, **k: None)
    if not ai_available():
        raise RuntimeError("No AI key configured. Copy .env.example to .env and add GEMINI_API_KEY (or another provider's key).")
    text = "\n".join(f"[{s['start']:.1f}] {s['text']}" for s in transcript) or "(little or no speech - rely on the audio analysis and content type)"
    dur = duration or (transcript[-1]["end"] if transcript else 0)
    cap = max(8, min(40, int(dur / 180) + 5))  # longer video = more clips
    ask = (f"Pick the {n} best moments to clip." if n else
           f"Find EVERY distinct moment that would work as a standalone viral clip (at most {cap}; a longer video should give more). Do not pad the list: "
           "only include moments that are genuinely strong, and each must be about something different.")
    c = context or {}
    nl = chr(10)
    about = (f"About the video (context only, never quote it): title '{c.get('title', '')}'.{nl}"
             f"Original description: {(c.get('description') or '(none)')[:1500]}{nl}"
             + (f"VIDEO BRIEF (who is who, trusted background):{nl}{c['brief']}{nl}" if c.get("brief") else "")
             + "Use this to understand the topic and what viewers care about, and to write better clip titles. Do not put the "
             f"channel or creator name in clip titles.{nl}{nl}") if (c.get("title") or c.get("description")) else ""
    prompt = PROMPT.format(about=about, ask=ask, min_len=min_len, max_len=max_len, heat=_heat_hint(heatmap) + _kind_hint(kind, peaks), transcript=text)
    picks = _ask_llm(prompt, list[ClipPick], log)

    words = [w for s in transcript for w in s["words"]]
    duration = duration or (transcript[-1]["end"] if transcript else 0)
    result, taken = [], []
    for p in sorted(picks, key=lambda p: -p["score"]):
        start, end = _snap(p["start"], p["end"], words, duration)
        length = end - start
        if length < min_len * 0.6 or length > max_len * 1.3:
            continue
        if any(start < b and end > a for a, b in taken):
            continue
        if any(difflib.SequenceMatcher(None, p["title"].lower(), q["title"].lower()).ratio() > 0.8 for q in result):
            continue  # same clip under another time range
        taken.append((start, end))
        result.append({**p, "start": round(start, 2), "end": round(end, 2)})
        if len(result) >= (n or cap):
            break
    return sorted(result, key=lambda c: c["start"])


# ------------------------------------------------------------------ rate
class ClipRating(BaseModel):
    index: int  # 1-based, matches the clip numbering in the prompt
    hook: int  # 1-100
    retention: int
    value: int
    shareability: int
    tip: str  # one concrete suggestion to make the clip better
    caption: str  # ready-to-post social caption (max 150 chars, no hashtags)
    description: str  # YouTube description, 2-3 sentences, original wording
    hashtags: list[str]
    hook_text: str  # punchy on-screen text for the first 3 seconds (max 8 words)


RATE_PROMPT = """You are a panel of four independent short-form content reviewers. Score each candidate clip below
from 1-100 (be critical: 90+ is rare, most clips land 40-80; spread the scores out, do not give everything 80).

- HOOK ANALYST: do the first 3 seconds stop the scroll (bold claim, question, conflict, curiosity gap)?
- RETENTION EDITOR: does it keep momentum, avoid dead air and rambling, and pay off before the end?
- VALUE JUDGE: is it insightful, useful, funny or emotionally strong, and understandable without context?
- SHAREABILITY STRATEGIST: would people send it, comment, or argue about it? Is it on a trending/relatable topic?

{context}
Also write for each clip: `tip` (one concrete improvement), `caption` (a ready-to-post caption, max 150 chars,
no hashtags), `description` (see the rules below), `hashtags` (4-6, lowercase, no # symbol) and `hook_text` (a scroll-stopping line of at most 8
words shown on screen over the first 3 seconds: a bold claim, question or curiosity gap, NOT a summary).
`index` is the clip number below.

RULES for `description`: a fresh YouTube Shorts description, 2-3 sentences, max 350 chars. Open with the hook, say what
the clip is about and why it is worth watching, end with a light question or call to action. Use the original video
description only to understand the topic and facts. Write entirely in your OWN words. NEVER mention the channel,
uploader or show name, never name sponsors or brands being promoted, and never include links, @handles, timestamps,
"subscribe to ..." lines or any sentence copied from the original description or the video (this avoids copyright and
impersonation claims). BUT be specific and accurate: when the VIDEO BRIEF identifies the people involved, name them
(e.g. "Abdul El-Sayed's grandparents" rather than "loving grandparents"), say what the clip is really about, and give
enough context that nobody could misread who or what it is. Never guess an identity or fact that the brief does not state.

Clips:
{clips}
"""


def rate_clips(transcript: list[dict], picks: list[dict], log=None, kind: str = "auto", context: dict | None = None, ret: dict | None = None) -> list:
    """Panel review of the picked clips. Uses GEMINI_API_KEY_2 first when set (separate quota), else the main key."""
    log = log or (lambda *a, **k: None)
    blocks = []
    for i, p in enumerate(picks, 1):
        txt = " ".join(s["text"] for s in transcript if s["end"] > p["start"] and s["start"] < p["end"])
        blocks.append(f"### Clip {i}: \"{p['title']}\" ({p['end'] - p['start']:.0f}s)\nWhy it was picked: {p.get('reason', '')}\nSpeech: {txt[:(2500 if len(picks) <= 15 else 1500)] or '(little or none: judge by the title and reason)'}")
    note = ("NOTE: this is gaming / funny-moments content. Judge by how funny, surprising or hype the moment is "
            "(setup + punchline/reaction), not by how much is said.\n\n") if kind == "gaming" else ""
    context = context or {}
    ctx = ""
    if context.get("title") or context.get("description"):
        ctx = (f"Source video (context only, do not quote it): title \"{context.get('title', '')}\"\n"
               f"Original description: {(context.get('description') or '(none)')[:1500]}\n"
               + (f"VIDEO BRIEF (who is who, trusted background):\n{context['brief']}\n" if context.get("brief") else ""))
    ctx = retention.hook_rules(ret) + ctx  # stricter hook-text rules (a switch in the preset), same request
    out = _ask_llm(note + RATE_PROMPT.format(clips="\n\n".join(blocks), context=ctx), list[ClipRating], log, spread=True)
    by = {r["index"]: r for r in out}
    res = []
    for i in range(1, len(picks) + 1):
        r = by.get(i)
        if not r:
            res.append(None)
            continue

        def clamp(v):
            return max(1, min(100, int(v)))
        h, rt, v, sh = (clamp(r[k]) for k in ("hook", "retention", "value", "shareability"))
        res.append({"hook": h, "retention": rt, "value": v, "shareability": sh,
                    "overall": retention.overall(h, rt, v, sh, picks[i - 1]["end"] - picks[i - 1]["start"], ret),
                    "hook_text": r["hook_text"].strip().strip("\"")[:80], "tip": r["tip"].strip(), "caption": r["caption"].strip()[:200],
                    "description": clean_text(r.get("description", ""), (context or {}).get("channel", ""))[:500],
                    "hashtags": [t.strip().lstrip("#").replace(" ", "") for t in r["hashtags"] if t.strip()][:6]})
    return res


class VideoBrief(BaseModel):
    summary: str  # 2-3 sentences: what this video is and what it is about
    people: list[str]  # "Name: role / relationship" for everyone featured or discussed
    context: str  # the event / setting / why it matters
    unclear: str  # anything you could not work out (say "nothing" if all clear)


def make_brief(title: str, channel: str, description: str, transcript: list, note: str = "", log=None) -> str:
    """One call BEFORE picking clips: work out who is who and what the video is really about, from the title,
    description and speech (plus the user's own note, which is authoritative). Every later step reuses this,
    so clip titles and descriptions are specific and correct instead of vague."""
    log = log or (lambda *a, **k: None)
    nl = chr(10)
    speech = " ".join(s["text"] for s in transcript)[:7000] or "(no speech)"
    prompt = (
        "You are a researcher preparing a briefing for the editors who will cut this video into short clips." + nl
        + f"Video title: '{title}'" + nl + f"Channel (for your understanding only): '{channel}'" + nl
        + f"Original description: {(description or '(none)')[:2500]}" + nl
        + (f"NOTE FROM THE USER (authoritative, trust it over everything else): {note}" + nl if note.strip() else "")
        + f"Start of the speech:{nl}{speech}{nl}{nl}"
        + "Work out WHO is who and WHAT this is about. Titles and descriptions usually name the people; the speakers often only "
          "say things like 'my grandson'. Connect them (for example: who the speaker is, who a relative is talking about, which "
          "event or campaign this is). Use real names and roles. Only state what the title, description, speech or the user's note "
          "support. If something is unclear, say so in `unclear` instead of guessing. Return a one-item list.")
    b = _ask_llm(prompt, list[VideoBrief], log)[0]
    out = f"Summary: {b['summary'].strip()}{nl}People: " + "; ".join(p.strip() for p in b["people"] if p.strip()) \
          + f"{nl}Context: {b['context'].strip()}{nl}Unclear: {b['unclear'].strip()}"
    if note.strip():
        out = f"User note: {note.strip()}{nl}" + out
    return out


def clean_text(text: str, channel: str = "") -> str:
    """Strip anything that could cause trouble on upload: links, @handles, timestamps and the source channel's name."""
    t = re.sub(r"https?://\S+|www\.\S+", "", text or "")
    t = re.sub(r"@\w+", "", t)
    t = re.sub(r"\b\d{1,2}:\d{2}(:\d{2})?\b", "", t)
    if channel and len(channel.strip()) > 2:
        t = re.sub(re.escape(channel.strip()), "", t, flags=re.I)
    return re.sub(r"[ \t]{2,}", " ", t).strip()


class DescOut(BaseModel):
    description: str  # 1-3 short sentences, no hashtags
    hashtags: list[str]


def gen_description(title: str, text: str, previous: str = "", log=None, context: dict | None = None) -> str:
    """A fresh YouTube description (+ hashtags) for one clip; `previous` is steered away from so each press differs."""
    log = log or (lambda *a, **k: None)
    nl = chr(10)
    context = context or {}
    src = (f"Source video title (context only): '{context.get('title', '')}'{nl}Original description (context only, never copy it): "
           f"{(context.get('description') or '(none)')[:1200]}{nl}"
           + (f"VIDEO BRIEF (who is who, trusted background):{nl}{context['brief']}{nl}" if context.get("brief") else "")
           if context.get("title") or context.get("description") else "")
    prompt = (f"Write a new YouTube Shorts description for this clip. Title: '{title}'{nl}{src}"
              f"What is said in it: {text[:2500] or '(little speech: go by the title)'}{nl}{nl}"
              "Give `description` (1-3 punchy sentences, a hook first, a light call to action, NO hashtags, max 300 chars; write it in your own words, be specific: name the people involved when the brief identifies them, and never guess an identity; NEVER mention the channel, uploader, show, sponsors or brands, and no links or @handles) "
              f"and `hashtags` (4-6, lowercase, no # symbol).{nl}"
              + (f"It must read clearly different from this previous version: '{previous[:300]}'{nl}" if previous.strip() else ""))
    out = _ask_llm(prompt, list[DescOut], log)
    r = out[0]
    tags = [t.strip().lstrip("#").replace(" ", "") for t in r["hashtags"] if t.strip()][:6]
    return (clean_text(r["description"], context.get("channel", "")) + " " + " ".join("#" + t for t in tags)).strip()


def _snap(start: float, end: float, words: list[dict], duration: float) -> tuple[float, float]:
    """Snap cut points to nearby word boundaries so we never cut mid-word."""
    if words:
        start = min(words, key=lambda w: abs(w["start"] - start))["start"] if any(abs(w["start"] - start) < 2 for w in words) else start
        end = min(words, key=lambda w: abs(w["end"] - end))["end"] if any(abs(w["end"] - end) < 2 for w in words) else end
    return max(0.0, start - 0.15), min(duration or end + 0.3, end + 0.3)


# ------------------------------------------------------------------ render
def detect_face(video: Path, start: float, end: float) -> tuple[float, float]:
    """Where the main face is (x, y as 0..1 of the frame); (0.5, 0.4) if none found.

    With several people in shot, the person who appears most (weighted by face size) wins, instead of
    averaging into the empty space between them."""
    default = (0.5, 0.4)
    try:
        import cv2
    except ImportError:
        return default
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    cap = cv2.VideoCapture(str(video))
    found = []  # (cx, cy, area)
    try:
        for i in range(14):
            t = start + (end - start) * (i + 0.5) / 14
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, frame = cap.read()
            if not ok:
                continue
            h, w = frame.shape[:2]
            scale = 480 / w
            gray = cv2.cvtColor(cv2.resize(frame, (480, int(h * scale))), cv2.COLOR_BGR2GRAY)
            for x, y, fw, fh in cascade.detectMultiScale(gray, 1.15, 5, minSize=(24, 24)):
                found.append(((x + fw / 2) / 480, (y + fh / 2) / gray.shape[0], fw * fh))
    finally:
        cap.release()
    if not found:
        return default
    bins: dict[int, list] = {}
    for f in found:
        bins.setdefault(int(f[0] / 0.2), []).append(f)
    best = max(bins.values(), key=lambda b: sum(f[2] for f in b))
    xs, ys = sorted(f[0] for f in best), sorted(f[1] for f in best)
    return xs[len(xs) // 2], ys[len(ys) // 2]


def scene_cuts(video: Path, start: float, end: float) -> list[float]:
    """Times (seconds from the clip start) where the camera cuts to another shot."""
    try:
        r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-ss", f"{start:.2f}", "-t", f"{end - start:.2f}", "-i", str(video),
                            "-an", "-vf", "scale=320:-2,select='gt(scene,0.15)',showinfo", "-f", "null", "-"],
                           capture_output=True, text=True, timeout=180)
        cuts = sorted({round(float(m), 2) for m in re.findall(r"pts_time:([0-9.]+)", r.stderr)})
        return [c for c in cuts if 0.5 < c < end - start - 0.5]
    except Exception:
        return []


WIDE_FACE = 0.03  # a shot whose biggest face is under 3% of the picture is a wide shot (or has nobody in it)


def detect_face_track(video: Path, start: float, end: float):
    """Where the speaker is over time, shot by shot.
    Returns ([(t, x), ...], y, wide) with t in seconds from the clip start, x and y as 0..1 of the frame, and `wide` a list of
    (t0, t1) windows that are wide shots / shots with nobody in them (better shown whole than cropped).
    A camera cut moves the framing at once; inside one shot it glides only when the speaker really moves.
    Returns None when no face is found at all."""
    import cv2
    cuts = scene_cuts(video, start, end)
    dur = end - start
    step = max(1.0, dur / 90)
    base = cv2.data.haarcascades
    front = cv2.CascadeClassifier(base + "haarcascade_frontalface_default.xml")
    side = cv2.CascadeClassifier(base + "haarcascade_profileface.xml")
    cap = cv2.VideoCapture(str(video))
    samples = []  # (t, [(cx, cy, area as a fraction of the picture), ...])
    try:
        t = step / 2
        while t < dur:
            cap.set(cv2.CAP_PROP_POS_MSEC, (start + t) * 1000)
            ok, frame = cap.read()
            faces = []
            if ok:
                h, w = frame.shape[:2]
                gh = int(h * 640 / w)
                gray = cv2.cvtColor(cv2.resize(frame, (640, gh)), cv2.COLOR_BGR2GRAY)
                found = [tuple(f) for f in front.detectMultiScale(gray, 1.12, 5, minSize=(20, 20))]
                if not found:  # people looking sideways are common in interviews
                    found = [tuple(f) for f in side.detectMultiScale(gray, 1.12, 4, minSize=(20, 20))]
                    flipped = cv2.flip(gray, 1)
                    found += [(640 - x - fw, y, fw, fh) for x, y, fw, fh in side.detectMultiScale(flipped, 1.12, 4, minSize=(20, 20))]
                faces = [((x + fw / 2) / 640, (y + fh / 2) / gh, fw * fh / (640 * gh)) for x, y, fw, fh in found]
            samples.append((t, faces))
            t += step
    finally:
        cap.release()
    if not any(f for _, f in samples):
        return None
    shot_of = lambda tt: sum(1 for c in cuts if c <= tt)  # noqa: E731
    picks, prev, prev_shot = [], None, -1  # (t, x or None, shot, y or None, biggest face fraction)
    for t, faces in samples:
        sh = shot_of(t)
        if sh != prev_shot:
            prev, prev_shot = None, sh
        x = y = None
        big_a = 0.0
        if faces:
            big = max(faces, key=lambda f: f[2])
            x, y, big_a = big[0], big[1], big[2]
            if prev is not None:  # stay with the same person unless someone clearly bigger shows up
                near = [f for f in faces if abs(f[0] - prev) < 0.12 and f[2] >= 0.5 * big[2]]
                if near:
                    x = max(near, key=lambda f: f[2])[0]
            prev = x
        picks.append((t, x, sh, y, big_a))
    ys = sorted(p[3] for p in picks if p[3] is not None)
    face_y = ys[len(ys) // 2] if ys else 0.4
    kf, wide = [], []
    for sh in range(len(cuts) + 1):
        pts = [(t, x) for t, x, s_, _, _ in picks if s_ == sh]
        if not pts:
            continue
        t_start = cuts[sh - 1] if sh > 0 else 0.0
        t_end = cuts[sh] if sh < len(cuts) else dur
        areas = sorted(p[4] for p in picks if p[2] == sh)
        if areas[len(areas) // 2] < WIDE_FACE and (t_end - t_start) >= 0.8:
            wide.append((t_start, t_end))
        known = [x for _, x in pts if x is not None] or [0.5]
        last = next((x for _, x in pts if x is not None), known[0])
        filled = []
        for t, x in pts:
            last = x if x is not None else last
            filled.append((t, last))
        sm = []
        for i, (t, _) in enumerate(filled):
            win = sorted(v for _, v in filled[max(0, i - 2): i + 3])
            sm.append((t, win[len(win) // 2]))
        held, out = sm[0][1], []
        for t, x in sm:
            if abs(x - held) > 0.05:
                held = x
            out.append((t, held))
        keep = [(t_start, out[0][1])]
        for (t0, x0), (t1, x1) in zip(out, out[1:]):
            if abs(x1 - keep[-1][1]) > 0.005:
                keep.append((t0, keep[-1][1]))
                keep.append((t1, x1))
        keep.append((t_end - 0.001, keep[-1][1]))
        kf.extend(keep)
    kf = [(float(t), float(x)) for t, x in sorted(kf, key=lambda k: k[0])]
    if len(kf) > 90:
        kf = kf[::2] + [kf[-1]]
    merged = []
    for w in wide:  # glue neighbouring wide windows together
        if merged and w[0] - merged[-1][1] < 0.05:
            merged[-1] = (merged[-1][0], w[1])
        else:
            merged.append(w)
    return kf, float(face_y), merged


def extract_frame(video: Path, t: float, out: Path, width: int = 960) -> Path:
    """Single JPEG frame for the layout editor preview (cached by the caller)."""
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{max(t, 0):.2f}", "-i", str(video),
                            "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "4", str(out)],
                           capture_output=True, text=True)
        if r.returncode != 0 or not out.exists():
            raise RuntimeError("could not extract frame: " + r.stderr[-300:])
    return out


def render_clip(video: Path, words: list[dict], params: dict, out_dir: Path, clip_id: str, on_progress=None) -> Path:
    """params: start, end, layout_id, subtitles, sub_style, overlays, resolution"""
    W, H = config.RESOLUTIONS.get(params.get("resolution", "1080p"), (1080, 1920))
    layout = params.get("layout") or get_layout(params.get("layout_id", "fill"))
    start, end = float(params["start"]), float(params["end"])
    face_x, face_y, wide = 0.5, 0.4, []
    follows = any(r.get("follow_face") and not r.get("crop") for r in layout.get("regions", []))
    if follows:
        try:  # follow the speaker over time (camera cuts, movement); fall back to one fixed position
            trk = detect_face_track(video, start, end)
            if trk:
                kf, face_y, wide = trk
                face_x = kf if len({round(x, 2) for _, x in kf}) > 1 else kf[0][1]
            else:
                face_x, face_y = detect_face(video, start, end)
        except Exception:
            face_x, face_y = detect_face(video, start, end)
    regs = layout.get("regions", [])
    single = len(regs) == 1 and regs[0].get("follow_face") and not regs[0].get("crop") and regs[0].get("w", 0) >= 0.98 and regs[0].get("h", 0) >= 0.98
    if params.get("smart_framing", True) and single and wide:
        # wide shots / shots with nobody in them show the whole picture over a blurred background instead of a crop that loses people
        win = "+".join(f"between(t,{a:.2f},{b:.2f})" for a, b in wide)
        fg = ("[0:v]split=2[va][vb];" + build_filter(layout, W, H, face_x, face_y, src="va", pre="a_") + ";"
              + build_filter(get_layout("fit_blur"), W, H, 0.5, 0.4, src="vb", pre="b_")
              + f";[a_base][b_base]overlay=enable='{win}'[base]")
    else:
        fg = build_filter(layout, W, H, face_x, face_y)
    pace = sound.clean_pacing(params.get("pacing"))
    music = sound.clean_music(params.get("music"))
    music_file = sound.track_path(music)
    speech = sound.has_audio(video)
    keep = sound.keep_intervals(words, start, end, pace["pause"]) if (pace["cut_pauses"] and words) else None
    if keep and len(keep) == 1 and keep[0] == (0.0, end - start):
        keep = None  # no long pauses found: nothing to cut
    length = sound.kept_length(keep) if keep else end - start
    cw, cend = words, end
    if keep:  # captions follow the cut: move every word to where it lands after the pauses are removed
        cw = [{**w, "start": start + sound.remap(w["start"] - start, keep), "end": start + sound.remap(w["end"] - start, keep)} for w in words]
        cend = start + length
    ass = build_ass(cw, start, cend, W, H, bool(params.get("subtitles")),
                    params.get("sub_style", "bold_yellow"), params.get("overlays"), cap=params.get("caption"))
    ass_name = f"{clip_id}.ass"
    (out_dir / ass_name).write_text(ass, "utf-8")
    last = "base"
    cu_fg, last, cu_args = stock.overlay_graph(params.get("cutaways") or [], last, W, H, 2 if music_file else 1)
    fg += cu_fg  # stock-video cutaways (and quick zoom-ins) sit on the picture first, so cuts/look/motion apply to them too
    if keep:  # cut the long pauses out of the picture (the sound is cut the same way below)
        fg += f";[{last}]select='{sound.select_expr(keep)}',setpts=N/FRAME_RATE/TB[cut]"
        last = "cut"
    if look.active(params.get("look")):  # color look: picture only
        fg += f";[{last}]{look.build_filter(params['look'])}[looked]"
        last = "looked"
    mo = params.get("motion") or {}
    ret = params.get("retention")
    punches: list[float] = []
    if isinstance(ret, dict) and ret.get("punch") and words:  # slight punch-in at sentence starts (only clips made with the switch on)
        punches = retention.punch_times(words, start, end)
        if keep:
            punches = [sound.remap(t, keep) for t in punches]
            punches = [t for i, t in enumerate(punches) if i == 0 or t - punches[i - 1] >= 1.2]
    if motion.active(mo) or punches:  # zoom / shake / punch-in the picture only; captions are drawn on top afterwards
        loud = motion.loud_moments(video, start, end) if mo.get("shake") else []
        if keep:
            loud = [sound.remap(t, keep) for t in loud]
        fg += f";[{last}]{motion.build_filter(mo, W, H, length, loud, punches)}[mov]"
        last = "mov"
    speed = pace["speed"] / 100
    if speed > 1.001:  # captions are drawn first, on the normal timeline, then everything is sped up together
        fg += f";[{last}]ass={ass_name}[sub];[sub]setpts=PTS/{speed:.4f},fps=30[v]"
    else:
        fg += f";[{last}]ass={ass_name}[v]"
    custom_audio = bool(keep) or speed > 1.001 or music_file is not None
    amap = ["-map", "0:a?"]
    if custom_audio:
        sp = []
        if keep:
            sp.append(f"aselect='{sound.select_expr(keep)}',asetpts=N/SR/TB")
        if speed > 1.001:
            sp.append(sound.atempo_chain(speed))
        if speech:
            fg += f";[0:a]{','.join(sp) or 'anull'}[sp]"
        if music_file:
            fg += f";[1:a]volume={music['volume'] / 100:.3f}[mus]"
            if speech and music["duck"]:
                fg += ";[sp]asplit=2[s1][s2];[mus][s1]sidechaincompress=threshold=0.04:ratio=10:attack=30:release=500[md];[s2][md]amix=inputs=2:duration=first:normalize=0[a]"
            elif speech:
                fg += ";[sp][mus]amix=inputs=2:duration=first:normalize=0[a]"
            else:
                fg += ";[mus]anull[a]"
            amap = ["-map", "[a]"]
        elif speech:
            amap = ["-map", "[sp]"]
        else:
            amap = []
    script = out_dir / f"{clip_id}.filter.txt"
    script.write_text(fg, "utf-8")

    out = out_dir / f"{clip_id}.mp4"
    part = out_dir / f"{clip_id}.part.mp4"  # render to a temp file: a failed/cancelled render never damages the finished clip
    final_len = length / speed
    cmd = ["ffmpeg", "-y", "-ss", f"{start:.2f}", "-t", f"{end - start:.2f}", "-i", str(video.resolve())]
    if music_file:
        cmd += ["-stream_loop", "-1", "-t", f"{end - start + 2:.2f}", "-i", str(music_file)]
    cmd += cu_args
    cmd += ["-/filter_complex", script.name, "-map", "[v]", *amap,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"]
    if music_file:
        cmd += ["-t", f"{final_len:.2f}"]  # the looped music has no end of its own
    cmd += [part.name]
    cmd[1:1] = ["-nostats", "-progress", "pipe:1"]
    err_path = out_dir / f"{clip_id}.err.txt"
    total = max(final_len, 0.1)
    with open(err_path, "w", encoding="utf-8") as errf:
        proc = subprocess.Popen(cmd, cwd=out_dir, stdout=subprocess.PIPE, stderr=errf, text=True,
                                creationflags=getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0))  # keep the UI responsive while rendering
        for line in proc.stdout:  # ffmpeg prints key=value progress lines
            if on_progress and line.startswith("out_time_us="):
                try:
                    on_progress(min(int(line.split("=")[1]) / 1_000_000 / total * 100, 99))
                except ValueError:
                    pass
        proc.wait()
    if proc.returncode != 0:
        part.unlink(missing_ok=True)
        raise RuntimeError("ffmpeg failed: " + err_path.read_text("utf-8", "ignore")[-800:])
    err_path.unlink(missing_ok=True)
    import time as _t
    for i in range(10):  # the old file may be open (being uploaded / played): wait a moment
        try:
            os.replace(part, out)
            break
        except PermissionError:
            if i == 9:
                part.unlink(missing_ok=True)
                raise RuntimeError("The old clip file is in use (uploading or playing). Stop that and render again.")
            _t.sleep(1)
    thumb = out_dir / f"{clip_id}.jpg"
    subprocess.run(["ffmpeg", "-y", "-ss", "1", "-i", out.name, "-frames:v", "1", "-vf", "scale=360:-2", thumb.name],
                   cwd=out_dir, capture_output=True)
    return out


def preview_still(settings: dict, out: Path) -> Path:
    """One JPEG showing how a preset looks (layout, captions, hook text) on a sample frame. Nothing is saved to any project."""
    import tempfile
    from subtitles import hook_overlay
    W, H = 540, 960
    layout = get_layout(settings.get("layout_id", "fill"))
    sources = sorted(config.DATA.glob("jobs/*/source.*"), key=lambda p: p.stat().st_mtime, reverse=True)
    frame = None
    prev_dir = config.DATA / "preview"
    prev_dir.mkdir(exist_ok=True)
    for src in sources[:3]:
        cand = prev_dir / f"{src.parent.name}.jpg"
        try:
            frame = extract_frame(src, 6, cand, 1280)
            break
        except Exception:
            continue
    words = [{"word": w, "start": i * 0.4, "end": i * 0.4 + 0.38} for i, w in enumerate("this is how your captions will look on every clip".split())]
    ov = [hook_overlay("This is your hook text", settings.get("hook"))] if settings.get("hook_text", True) else []
    ass = build_ass(words, 0, 6, W, H, bool(settings.get("subtitles", True)), settings.get("sub_style", "bold_yellow"), ov, cap=settings.get("caption"))
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        (td / "p.ass").write_text(ass, "utf-8")
        fg = build_filter(layout, W, H, 0.5, 0.4)
        last = "base"
        if look.active(settings.get("look")):
            fg += f";[base]{look.build_filter(settings['look'])}[looked]"
            last = "looked"
        fg += f";[{last}]ass=p.ass[v]"
        (td / "f.txt").write_text(fg, "utf-8")
        inp = ["-loop", "1", "-t", "2", "-i", str(frame)] if frame else ["-f", "lavfi", "-t", "2", "-i", "gradients=s=1280x720:r=30:speed=0"]
        r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inp, "-/filter_complex", "f.txt", "-map", "[v]", "-ss", "0.6",
                            "-frames:v", "1", "-q:v", "4", str(out)], cwd=td, capture_output=True, text=True)
    if r.returncode != 0 or not out.exists():
        raise RuntimeError("preview failed: " + r.stderr[-300:])
    return out
