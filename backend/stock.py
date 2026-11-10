"""Stock-video cutaways: the AI picks filmable moments in a clip's speech (an air hostess, a piece of paper...), and the app
cuts to matching free stock footage for a couple of seconds, or does a quick zoom-in when nothing matches well enough.

Footage comes from Pexels / Pixabay (free API keys). Every clip that gets downloaded is kept in data/stock, so the next
clip can reuse it ("library first"). Matching is by TEXT: how well the search phrases fit the clip's description and tags, plus the AI judging the shortlist
(it reads the tags, it does not look inside the footage).

Settings (preset key "stock"):
  on: bool, source: "library_first" | "library" | "live", every_min / every_max: seconds between cutaways,
  len_min / len_max: seconds each cutaway lasts, confidence: 0-100 needed to use a clip, fallback: "zoom" | "skip", max: most cutaways per clip,
  judge: an extra AI check on unclear picks (costs one more AI request per clip; off by default).

AI use per clip: ONE request to pick the moments (the same request also gives backup search phrases and "avoid" words, which is how a
river bank is told apart from a bank account without looking at pictures). Everything else is plain code."""
import json
import os
import re
import subprocess
import threading
from pathlib import Path

import requests

import config

LIB_DIR = config.DATA / "stock"
INDEX = LIB_DIR / "index.json"
ENV = config.ROOT / ".env"
_lock = threading.Lock()
UA = {"User-Agent": "SparkClipper/1.0"}
PROVIDERS = {"pexels": "PEXELS_API_KEY", "pixabay": "PIXABAY_API_KEY"}
MAX_DL = 80_000_000
SOURCES = ("library_first", "library", "live")


# ------------------------------------------------------------------ settings
def _n(v, lo, hi, d):
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return d


def clean(s) -> dict:
    s = s if isinstance(s, dict) else {}
    a, b = _n(s.get("every_min", 5), 1, 30, 5), _n(s.get("every_max", 10), 1, 60, 10)
    lo, hi = _n(s.get("len_min", 1.5), 0.5, 8, 1.5), _n(s.get("len_max", 3), 0.5, 10, 3)
    return {"on": bool(s.get("on", False)), "source": s.get("source") if s.get("source") in SOURCES else "library_first",
            "every_min": min(a, b), "every_max": max(a, b), "len_min": min(lo, hi), "len_max": max(lo, hi),
            "confidence": int(_n(s.get("confidence", 60), 0, 100, 60)), "fallback": "skip" if s.get("fallback") == "skip" else "zoom",
            "max": int(_n(s.get("max", 8), 1, 40, 8)), "judge": bool(s.get("judge", False))}


def active(s) -> bool:
    return bool(s and s.get("on"))


# ------------------------------------------------------------------ keys (kept in .env, never shown in full)
def key(provider: str) -> str:
    return os.getenv(PROVIDERS[provider], "").strip()


def have_keys() -> list[str]:
    return [p for p in PROVIDERS if key(p)]


def status() -> dict:
    lib = _load()
    size = sum((LIB_DIR / e["file"]).stat().st_size for e in lib if (LIB_DIR / e["file"]).exists())
    return {"keys": {p: {"set": bool(key(p)), "hint": ("…" + key(p)[-4:]) if key(p) else ""} for p in PROVIDERS},
            "library": {"count": len(lib), "mb": round(size / 1e6, 1)}}


def check_key(provider: str, k: str) -> str | None:
    """None if the key works, otherwise a readable reason."""
    try:
        if provider == "pexels":
            r = requests.get("https://api.pexels.com/videos/search", params={"query": "city", "per_page": 1}, headers={**UA, "Authorization": k}, timeout=15)
        else:
            r = requests.get("https://pixabay.com/api/videos/", params={"key": k, "q": "city", "per_page": 3}, headers=UA, timeout=15)
    except requests.RequestException as e:
        return "Could not reach the site: " + str(e)[:80]
    if r.status_code in (401, 403) or (provider == "pixabay" and r.status_code == 400):
        return "That key was refused. Check you copied all of it."
    if r.status_code == 429:
        return None  # a real key that is just rate limited right now
    return None if r.ok else f"The site answered {r.status_code}."


def set_key(provider: str, k: str | None):
    var = PROVIDERS[provider]
    text = ENV.read_text("utf-8") if ENV.exists() else ""
    out = [ln for ln in text.split("\n") if not re.match(rf"\s*{var}\s*=", ln)]
    if k:
        while out and out[-1] == "":
            out.pop()
        out += [f"{var}={k}", ""]
    tmp = ENV.with_suffix(".tmp")
    tmp.write_text("\n".join(out), "utf-8")
    os.replace(tmp, ENV)
    if k:
        os.environ[var] = k
    else:
        os.environ.pop(var, None)


# ------------------------------------------------------------------ text matching
_STOP = set("a an the of in on at to for and or with from by is are was were be this that it its into over under some very".split())


def _ordered(text: str) -> list[str]:
    """The meaningful words of a phrase in order, singular, without duplicates ('pieces of papers' -> ['piece', 'paper'])."""
    out = []
    for w in re.findall(r"[a-z]+", (text or "").lower()):
        if w in _STOP or len(w) < 3:
            continue
        w = w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w
        if w not in out:
            out.append(w)
    return out


def tokens(text: str) -> set[str]:
    return set(_ordered(text))


def _hit(q: str, pool: set[str]) -> bool:
    return q in pool or any(len(q) >= 4 and (p.startswith(q) or q.startswith(p)) and len(p) >= 4 for p in pool)


def coverage(query: str, labels: set[str]) -> float:
    """0..1: how much of the phrase the labels cover. In English the last word of a short phrase is the thing itself
    ('air hostess' -> hostess), so it counts double."""
    qt = _ordered(query)
    if not qt:
        return 0.0
    w = [2.0 if (i == len(qt) - 1 and len(qt) > 1) else 1.0 for i in range(len(qt))]
    return sum(wi for q, wi in zip(qt, w) if _hit(q, labels)) / sum(w)


def confidence(query: str, labels: set[str], rank: int) -> int:
    """0-100: most of the score is how many of the phrase's words the clip's description/tags cover; a top search rank adds a little."""
    return int(round(coverage(query, labels) * 85 + max(0, 15 - 5 * rank)))


def rate(phrases: list[str], labels: set[str], extra: set[str], rank: int, need: float, dur: float, ar: float, uses: int,
         avoid=frozenset()) -> int:
    """0-100 text score for one clip against the main phrase (+ backup phrases). Beyond word overlap:
    words the AI said would mean a WRONG match cost a lot, clips shorter than the cutaway are marked down, upright (portrait)
    footage is slightly preferred because it fills the screen without cropping, and footage already used in other shorts is
    marked down so the same clip does not keep returning."""
    cov = 0.0
    for i, p in enumerate(phrases):
        w = 1.0 if i == 0 else 0.9
        cov = max(cov, w * coverage(p, labels), w * 0.7 * coverage(p, labels | extra))
    c = cov * 85 + max(0, 15 - 5 * rank)
    if avoid and any(_hit(a, labels) for a in avoid):
        c -= 40
    if dur and dur < need - 0.3:
        c -= 25
    if ar and ar < 1:
        c += 4
    c -= 8 * min(uses, 3)
    return int(max(0, min(100, round(c))))


# ------------------------------------------------------------------ library
def _load() -> list[dict]:
    try:
        return json.loads(INDEX.read_text("utf-8"))
    except Exception:
        return []


def _save(items: list[dict]):
    LIB_DIR.mkdir(parents=True, exist_ok=True)
    tmp = INDEX.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, indent=1), "utf-8")
    os.replace(tmp, INDEX)


def clear_library() -> int:
    with _lock:
        items = _load()
        for e in items:
            (LIB_DIR / e["file"]).unlink(missing_ok=True)
        _save([])
        return len(items)


def mark_used(ids) -> None:
    """Count one more use for these library clips (so footage does not repeat in every short)."""
    ids = set(ids)
    if not ids:
        return
    with _lock:
        items = _load()
        for e in items:
            if e["id"] in ids:
                e["uses"] = int(e.get("uses", 0)) + 1
        _save(items)


def find_local(query: str, minconf: int, used: set) -> dict | None:
    best = None
    for e in _load():
        if e["id"] in used or not (LIB_DIR / e["file"]).exists():
            continue
        c = confidence(query, set(e.get("labels", [])) | set(e.get("queries_tokens", [])), 0)
        if c >= minconf and (best is None or c > best[0]):
            best = (c, e)
    return {**best[1], "conf": best[0], "src": "library"} if best else None


# ------------------------------------------------------------------ live search
_cache: dict = {}
_tlock = threading.Lock()
_hits: dict = {"pixabay": [], "pexels": []}
_LIMITS = {"pixabay": (80, 60), "pexels": (150, 3600)}  # (requests, seconds): Pixabay allows 100 a minute, Pexels 200 an hour


def _throttle(provider: str) -> bool:
    """Stay under the provider's request limit. Pixabay: wait for a free slot. Pexels (limit is per hour): skip it instead of waiting."""
    import time
    n, per = _LIMITS[provider]
    while True:
        with _tlock:
            now = time.time()
            h = _hits[provider] = [t for t in _hits[provider] if now - t < per]
            if len(h) < n:
                h.append(now)
                return True
            wait = h[0] + per - now
        if provider == "pexels" or wait > 70:
            return False
        time.sleep(max(0.2, wait))


def search(query: str, n: int = 8) -> list[dict]:
    """Candidates from every provider you have a key for: {id, source, page, thumb, dur, file_url, labels, rank}.
    Answers are kept for 24 hours (Pixabay asks for that, and it saves your quota)."""
    import time
    ck = (query.lower().strip(), n, tuple(have_keys()))
    hit = _cache.get(ck)
    if hit and time.time() - hit[0] < 86400:
        return hit[1]
    out = _search(query, n)
    if out:
        _cache[ck] = (time.time(), out)
    return out


def _pick_variant(variants: list[dict]) -> dict | None:
    """Of the sizes a provider offers (each {url, width, height, size?}), the smallest one that is at least 1080 tall
    (a vertical short is 1920 tall, so lower footage looks soft); otherwise the tallest one we can download."""
    ok = [v for v in variants if v and v.get("url") and (v.get("size") or 0) <= MAX_DL]
    if not ok:
        return None
    sharp = [v for v in ok if (v.get("height") or 0) >= 1080]
    return min(sharp, key=lambda v: v.get("height") or 0) if sharp else max(ok, key=lambda v: v.get("height") or 0)


def _search(query: str, n: int) -> list[dict]:
    out = []
    if key("pexels") and _throttle("pexels"):
        try:
            r = requests.get("https://api.pexels.com/videos/search", params={"query": query, "per_page": n, "orientation": "portrait"},
                             headers={**UA, "Authorization": key("pexels")}, timeout=20)
            if r.ok and not r.json().get("videos"):
                r = requests.get("https://api.pexels.com/videos/search", params={"query": query, "per_page": n},
                                 headers={**UA, "Authorization": key("pexels")}, timeout=20)
            if r.ok:
                for i, v in enumerate(r.json().get("videos", [])):
                    files = [f for f in v.get("video_files", []) if f.get("file_type") == "video/mp4" and f.get("link")]
                    if not files:
                        continue
                    big = [f for f in files if min(f.get("width") or 0, f.get("height") or 0) >= 720]
                    f = min(big, key=lambda f: min(f["width"], f["height"])) if big else max(files, key=lambda f: (f.get("width") or 0))
                    slug = (v.get("url") or "").rstrip("/").split("/")[-1]
                    out.append({"id": "pexels_%s" % v["id"], "source": "pexels", "page": v.get("url"), "thumb": v.get("image"),
                                "ar": round((v.get("width") or 0) / (v.get("height") or 1), 2) if v.get("height") else 0,
                                "dur": v.get("duration") or 0, "file_url": f["link"], "labels": sorted(tokens(re.sub(r"-\d+$", "", slug).replace("-", " "))), "rank": i})
        except (requests.RequestException, ValueError, KeyError):
            pass
    if key("pixabay") and _throttle("pixabay"):
        try:
            # safesearch keeps unsuitable footage out of shorts that upload by themselves; min_width skips tiny clips
            params = {"key": key("pixabay"), "q": query, "per_page": max(10, n), "safesearch": "true", "min_width": 1280}
            r = requests.get("https://pixabay.com/api/videos/", params=params, headers=UA, timeout=20)
            if r.ok and not r.json().get("hits"):
                params.pop("min_width")
                if _throttle("pixabay"):
                    r = requests.get("https://pixabay.com/api/videos/", params=params, headers=UA, timeout=20)
            if r.ok:
                for i, v in enumerate(r.json().get("hits", [])):
                    vid = (v.get("videos") or {})
                    f = _pick_variant([vid.get(k) for k in ("large", "medium", "small", "tiny")])
                    if not f:
                        continue
                    out.append({"id": "pixabay_%s" % v["id"], "source": "pixabay", "page": v.get("pageURL"), "thumb": f.get("thumbnail"),
                                "ar": round((f.get("width") or 0) / (f.get("height") or 1), 2) if f.get("height") else 0,
                                "dur": v.get("duration") or 0, "file_url": f["url"], "labels": sorted(tokens(v.get("tags", "").replace(",", " "))), "rank": i})
        except (requests.RequestException, ValueError, KeyError):
            pass
    return out


def download(c: dict, query: str) -> dict | None:
    """Fetch a candidate into the library (trimmed to its first 8 seconds to save space) and return its library entry."""
    with _lock:
        items = _load()
        old = next((e for e in items if e["id"] == c["id"]), None)
        if old and (LIB_DIR / old["file"]).exists():
            old["queries_tokens"] = sorted(set(old.get("queries_tokens", [])) | tokens(query))
            _save(items)
            return old
    LIB_DIR.mkdir(parents=True, exist_ok=True)
    name = c["id"] + ".mp4"
    raw = LIB_DIR / (c["id"] + ".dl")
    try:
        with requests.get(c["file_url"], headers=UA, stream=True, timeout=30) as r:
            if not r.ok:
                return None
            size = 0
            with open(raw, "wb") as f:
                for chunk in r.iter_content(1 << 16):
                    size += len(chunk)
                    if size > MAX_DL:
                        raw.unlink(missing_ok=True)
                        return None
                    f.write(chunk)
        t = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-t", "8", "-i", str(raw), "-an", "-c:v", "copy", "-movflags", "+faststart", str(LIB_DIR / name)],
                           capture_output=True, timeout=120)
        if t.returncode != 0 or not (LIB_DIR / name).exists():
            os.replace(raw, LIB_DIR / name)
        else:
            raw.unlink(missing_ok=True)
    except (requests.RequestException, OSError, subprocess.SubprocessError):
        raw.unlink(missing_ok=True)
        return None
    entry = {"id": c["id"], "source": c["source"], "file": name, "page": c.get("page"), "labels": c.get("labels", []),
             "queries_tokens": sorted(tokens(query)), "dur": min(float(c.get("dur") or 8), 8), "ar": c.get("ar") or 0, "uses": 0}
    with _lock:
        items = [e for e in _load() if e["id"] != entry["id"]] + [entry]
        _save(items)
    return entry


# ------------------------------------------------------------------ the AI picks the moments
def moments_prompt(words: list[dict], start: float, end: float, s: dict) -> str:
    length = end - start
    lines, cur, t0 = [], [], None
    for w in words:
        if w["end"] <= start or w["start"] >= end:
            continue
        if t0 is None:
            t0 = w["start"] - start
        cur.append(w["word"].strip())
        if len(cur) >= 9:
            lines.append(f"[{max(t0, 0):.1f}] " + " ".join(cur))
            cur, t0 = [], None
    if cur:
        lines.append(f"[{max(t0 or 0, 0):.1f}] " + " ".join(cur))
    fast = s["every_max"] <= 4.5
    if fast:
        what = (f"This is a FAST-CUT edit. Pick up to {s['max']} moments, roughly one every {s['every_min']:.1f}-{s['every_max']:.1f} seconds, so we can cut to stock "
                f"footage for about {s['len_min']:.1f}-{s['len_max']:.1f} seconds each. Prefer something the speaker names that can be filmed (an object, a place, a type "
                "of person, an action). When they are not naming anything filmable, still choose a plain visual that fits the idea or mood (for example 'stressed man at "
                "desk' for worry, 'crowd cheering' for success). ")
    else:
        what = (f"Pick up to {s['max']} moments where the speaker says something concrete that can be filmed (an object, a place, a type of person, an action; "
                f"for example 'air hostess', 'piece of paper', 'busy street', 'handshake'), so we can cut to stock footage for about {s['len_min']:.1f}-{s['len_max']:.1f} "
                f"seconds. Skip abstract talk and opinions. Ideally one every {s['every_min']:.0f}-{s['every_max']:.0f} seconds. ")
    said = ("`said` (the few words around it, exactly as spoken), " if s.get("judge") else "")
    return (f"This is the speech of a {length:.0f}-second vertical short. Times in [brackets] are seconds from the start of the clip.\n"
            + "\n".join(lines) + "\n\n" + what
            + f"Never use names of real people, brands or logos. Leave at least {s['every_min']:.1f} seconds between moments. Nothing before 2.0 s or in the last 3 s. "
            "For each give `time` (seconds from the clip start, when the thing is said), " + said
            + "`phrase` (2-4 plain English words someone would type into a stock-video search, describing what the footage should SHOW; no names), "
            "`alt` (two other searches for the same thing: a synonym, and a simpler broader one) and `avoid` (up to 3 single words that would mean a WRONG match "
            "for the phrase, for example 'river' for 'bank money'; an empty list if none). Prefer things that look good in a vertical frame (a person, a hand, a "
            "close-up object). Order by time.")


def pick_moments(words, start, end, s, log, ask=None) -> list[dict]:
    from pydantic import BaseModel

    class MomentS(BaseModel):
        time: float
        phrase: str
        alt: list[str]
        avoid: list[str]

    class MomentJ(BaseModel):
        time: float
        said: str
        phrase: str
        alt: list[str]
        avoid: list[str]

    if ask is None:
        import pipeline
        ask = pipeline._ask_llm
    raw = ask(moments_prompt(words, start, end, s), list[MomentJ if s.get("judge") else MomentS], log)
    return space_moments(raw, end - start, s)


def space_moments(raw: list[dict], length: float, s: dict) -> list[dict]:
    """Enforce the rules whatever the AI answered: spacing, edges, count, and a length for each cutaway."""
    out, last_t, last_end = [], -1e9, -1e9
    for m in sorted(raw, key=lambda m: m["time"]):
        t, phrase = float(m["time"]), (m.get("phrase") or "").strip()
        i = len(out)
        dur = round(s["len_min"] + (s["len_max"] - s["len_min"]) * ((i * 37) % 10) / 10, 1)
        # a cutaway starts at least `every_min` after the previous one started AND only after the previous one has ended (plus a short beat of speaker)
        if not phrase or t < 2.0 or t + dur > length - 1.0 or t - last_t < s["every_min"] or t < last_end + 0.4:
            continue
        alt = [a.strip()[:60] for a in (m.get("alt") or []) if isinstance(a, str) and a.strip() and a.strip().lower() != phrase.lower()][:2]
        avoid = sorted({w for a in (m.get("avoid") or []) if isinstance(a, str) for w in _ordered(a)} - tokens(phrase))[:4]
        out.append({"t": round(t, 2), "dur": dur, "phrase": phrase[:60], "said": (m.get("said") or "")[:120], "alt": alt, "avoid": avoid})
        last_t, last_end = t, t + dur
        if len(out) >= s["max"]:
            break
    return out


def _candidates(m: dict, s: dict, used: set) -> list[dict]:
    """Every clip that could fit this moment, best text score first: [{id, labels, src, conf, local, item}].
    The search phrases are the main phrase, the AI's backup phrases and, for a phrase of several words, its last word alone
    (a wider net). Clips are SCORED against the main phrase and the backup phrases only, so the wide net cannot sneak a loose match in."""
    scoring = [m["phrase"]] + list(m.get("alt") or [])
    searching = list(scoring)
    ow = _ordered(m["phrase"])
    if len(ow) > 1 and ow[-1] not in {p.lower() for p in searching}:
        searching.append(ow[-1])
    searching = searching[:4]
    avoid = set(m.get("avoid") or [])
    need = float(m.get("dur") or 2)
    found: dict = {}

    def add(c, local):
        if c["id"] in used or c["id"] in found:
            return
        extra = set(c.get("queries_tokens", [])) if local else set()
        conf = rate(scoring, set(c.get("labels", [])), extra, int(c.get("rank", 0)), need, float(c.get("dur") or 0), float(c.get("ar") or 0),
                    int(c.get("uses", 0)), avoid)
        found[c["id"]] = {"id": c["id"], "labels": list(c.get("labels", [])), "src": c["source"] if not local else "library", "conf": conf,
                          "local": local, "item": c}

    best = lambda: max([c["conf"] for c in found.values()] or [0])  # noqa: E731
    if s["source"] in ("library_first", "library"):
        for e in _load():
            if (LIB_DIR / e["file"]).exists():
                add(e, True)
    if s["source"] in ("library_first", "live") and have_keys() and (s["source"] == "live" or best() < s["confidence"]):
        for p in searching:
            for c in search(p):
                add(c, False)
            if best() >= max(s["confidence"], 70):
                break  # a good match already, no need for the backup searches
    return sorted(found.values(), key=lambda c: -c["conf"])


def _clear_cut(short: list[dict]) -> bool:
    """True when the text score alone is decisive: a very strong top clip with a real gap to the next one."""
    return bool(short) and short[0]["conf"] >= 85 and (len(short) == 1 or short[0]["conf"] - short[1]["conf"] >= 15)


def _judge(asks: list, ask, log) -> dict:
    """Optional: one AI request for the UNCLEAR moments only. Which of the shortlisted clips shows what the speaker is talking about?
    asks = [(moment index, moment, shortlist)]. Returns {moment index: (clip id or None, fit 0-100)}. Any failure just means the text score decides."""
    if not asks:
        return {}
    from pydantic import BaseModel

    class Choice(BaseModel):
        moment: int
        pick: int
        fit: int

    if ask is None:
        import pipeline
        ask = pipeline._ask_llm
    lines = []
    for n, (_, m, short) in enumerate(asks):
        lines.append(f'{n}. says "{(m.get("said") or m["phrase"])[:90]}" | want: {m["phrase"]}')
        for j, c in enumerate(short):
            lines.append(f"  {j}) {', '.join(c['labels'][:10]) or '-'}")
    prompt = ("Choose stock footage for a short video from each option's tags only (you cannot see it). For every numbered moment give `pick` = the option "
              "that best shows what is said, or -1 if none clearly fits (wrong meaning, loosely related), and `fit` = 0-100. Be strict: a so-so match is "
              "worse than our fallback.\n" + "\n".join(lines))
    try:
        raw = ask(prompt, list[Choice], log)
    except Exception as e:
        log(f"Stock picking: the extra AI check failed ({str(e)[:80]}), using the tag score", "warn")
        return {}
    out = {}
    for r in raw or []:
        try:
            n, pk, fit = int(r["moment"]), int(r["pick"]), int(r["fit"])
        except (KeyError, TypeError, ValueError):
            continue
        if 0 <= n < len(asks):
            short = asks[n][2]
            out[asks[n][0]] = (short[pk]["id"] if 0 <= pk < len(short) else None, max(0, min(100, fit)))
    return out


def resolve(ms: list[dict], s: dict, log, ask=None) -> list[dict]:
    """Find footage for each moment. Returns [{t, dur, phrase, file (path or None), conf, src, kind: stock|zoom}].
    Per moment: gather and score candidates (library + live search, with the backup phrases), then take the best one above the
    confidence setting. With the extra AI check on, the moments whose best pick is unclear are sent to the AI in ONE request.
    Only the winning clip is downloaded."""
    thr = s["confidence"]
    floor = max(15, thr - 25)
    reserved: set = set()
    pools = []
    for m in ms:
        cs = _candidates(m, s, reserved)
        pools.append(cs)
        if cs and cs[0]["conf"] >= thr:
            reserved.add(cs[0]["id"])  # two moments should not both want the same clip
    asks = []
    if s.get("judge"):
        for i, cs in enumerate(pools):
            short = [c for c in cs if c["conf"] >= floor][:4]
            if short and not _clear_cut(short):
                asks.append((i, ms[i], short))
    verdict = _judge(asks, ask, log) if asks else {}
    if asks:
        log(f"Stock picking: {len(asks)} unclear moment(s) sent for one extra AI check, {len(ms) - len(asks)} decided by the tag score")
    used: set = set()
    items, picked = [], []
    for i, m in enumerate(ms):
        q = m["phrase"]
        cs = pools[i]
        choice, conf = None, 0
        v = verdict.get(i)
        if v is not None:
            if v[0] is not None:
                c = next((c for c in cs if c["id"] == v[0] and c["id"] not in used), None)
                if c:
                    choice, conf = c, v[1]
            else:
                log(f"Cutaway at {m['t']:.1f}s: '{q}' -> the AI found nothing in the shortlist that fits")
        else:
            c = next((c for c in cs if c["id"] not in used and c["conf"] >= thr), None)
            if c:
                choice, conf = c, c["conf"]
        found = None
        if choice and conf >= thr:
            if choice["local"]:
                found = {**choice["item"], "conf": conf, "src": "library"}
            else:
                e = download(choice["item"], q)
                if e:
                    found = {**e, "conf": conf, "src": choice["src"]}
        if found:
            used.add(found["id"])
            picked.append(found["id"])
            log(f"Cutaway at {m['t']:.1f}s: '{q}' -> {found['src']} ({found['conf']}% match)")
            items.append({**m, "file": str(LIB_DIR / found["file"]), "conf": found["conf"], "src": found["src"], "kind": "stock"})
        elif s["fallback"] == "zoom":
            log(f"Cutaway at {m['t']:.1f}s: '{q}' -> no good match, zooming in instead")
            items.append({**m, "file": None, "conf": 0, "src": "none", "kind": "zoom"})
        else:
            log(f"Cutaway at {m['t']:.1f}s: '{q}' -> no good match, skipped")
    mark_used(picked)
    return items


def plan(words, start, end, s, log, ask=None) -> list[dict]:
    if s["source"] != "library" and not have_keys() and not _load():
        log("Stock cutaways skipped: no Pexels or Pixabay key yet (add one in the preset editor).", "warn")
        return []
    ms = pick_moments(words, start, end, s, log, ask)
    log(f"Stock cutaways: {len(ms)} moment(s) chosen")
    return resolve(ms, s, log, ask)


def signature(s: dict, start: float, end: float) -> str:
    return json.dumps([s, round(start, 2), round(end, 2)], sort_keys=True)


# ------------------------------------------------------------------ render pieces
def overlay_graph(items: list[dict], last: str, W: int, H: int, first_input: int) -> tuple[str, str, list[str]]:
    """Filter text that overlays every stock cutaway (and punches in on the zoom ones) on top of label `last`.
    Returns (filter text, new last label, extra input args for ffmpeg, in order)."""
    fg, args, k = "", [], 0
    zooms = []
    for it in items:
        if it.get("kind") == "zoom":
            zooms.append((it["t"], it["t"] + it["dur"]))
            continue
        f = it.get("file")
        if not f or not Path(f).is_file():
            continue
        idx = first_input + k
        args += ["-stream_loop", "-1", "-t", f"{it['dur'] + 0.2:.2f}", "-i", f]
        fg += (f";[{idx}:v]fps=30,scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setpts=PTS-STARTPTS+{it['t']:.2f}/TB[cu{k}]"
               f";[{last}][cu{k}]overlay=eof_action=pass:enable='between(t,{it['t']:.2f},{it['t'] + it['dur']:.2f})'[ov{k}]")
        last = f"ov{k}"
        k += 1
    if zooms:
        win = "+".join(f"between(t,{a:.2f},{b:.2f})" for a, b in zooms)
        fg += (f";[{last}]scale=w='trunc({W}*(1+0.2*min(1,{win}))/2)*2':h='trunc({H}*(1+0.2*min(1,{win}))/2)*2':eval=frame,"
               f"crop=w={W}:h={H}[zm]")
        last = "zm"
    return fg, last, args
