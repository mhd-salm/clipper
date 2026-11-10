"""Video recommendations for the Home page: long videos worth clipping, for each of your YouTube channels.

No AI requests are used. For every channel (account) there is a list of topics ("podcast full episode", "celebrity interview", ...).
Each topic is searched on YouTube (this month, most viewed first), and the newest uploads of the creators you follow for that
channel are added. Videos you already clipped, live streams and short videos are left out."""
import re
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

import creators
import jobs

MIN_SECONDS = 8 * 60  # shorter videos are not worth clipping
MAX_SECONDS = 3 * 3600  # very long streams are too heavy to download and clip
SEARCH_N = 14  # results taken from each topic
SEARCH_TTL = 30 * 60
FOLLOW_TTL = 15 * 60
THIS_MONTH_BY_VIEWS = "CAMSBAgEEAE%3D"  # YouTube's own filter: uploaded this month, sorted by view count

DEFAULT_TOPICS = ["podcast full episode", "celebrity interview"]

_cache: dict = {}
_lock = threading.Lock()


def topics_for(account: dict | None) -> list[str]:
    t = (account or {}).get("topics")
    if isinstance(t, list) and any(str(x).strip() for x in t):
        return [str(x).strip()[:60] for x in t if str(x).strip()][:6]
    return list(DEFAULT_TOPICS)


def clean_topics(raw) -> list[str]:
    if isinstance(raw, str):
        raw = re.split(r"[,\n]", raw)
    out = []
    for x in raw or []:
        x = re.sub(r"\s+", " ", str(x)).strip()[:60]
        if x and x.lower() not in [o.lower() for o in out]:
            out.append(x)
    return out[:6]


def _cached(key, ttl, fn):
    with _lock:
        hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    with _lock:
        _cache[key] = (time.time(), val)
    return val


def _row(e: dict, topic: str | None = None, creator: dict | None = None) -> dict | None:
    if not e or not e.get("id") or len(str(e["id"])) != 11:
        return None
    dur = e.get("duration")
    if e.get("live_status") in ("is_live", "was_live", "is_upcoming") or not dur or dur < MIN_SECONDS or dur > MAX_SECONDS:
        return None
    return {"id": e["id"], "title": e.get("title") or e["id"], "duration": int(dur), "views": e.get("view_count"),
            "channel": (creator or {}).get("name") or e.get("channel") or e.get("uploader") or "",
            "channel_id": (creator or {}).get("channel_id") or e.get("channel_id") or "", "topic": topic}


def search_topic(topic: str) -> list[dict]:
    import yt_dlp

    def go():
        url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote(topic) + "&sp=" + THIS_MONTH_BY_VIEWS
        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True, "playlist_items": f"1-{SEARCH_N}"}) as ydl:
            info = ydl.extract_info(url, download=False)
        return [r for r in (_row(e, topic) for e in (info.get("entries") or [])) if r]
    try:
        return _cached(("s", topic.lower()), SEARCH_TTL, go)
    except Exception:
        return []


def follow_recent(c: dict) -> list[dict]:
    def go():
        return [r for r in (_row(e, None, c) for e in creators.recent_videos(c["channel_id"], 0, 6)) if r]
    try:
        return _cached(("f", c["channel_id"]), FOLLOW_TTL, go)
    except Exception:
        return []


def _clipped_ids() -> set:
    ids = set()
    for j in jobs.list_jobs():
        m = re.search(r"(?:v=|youtu\.be/|shorts/)([\w-]{11})", j.get("url") or "")
        if m:
            ids.add(m.group(1))
    return ids


def recommend(account: dict, refresh: bool = False) -> dict:
    """Videos for one YouTube channel of yours. Returns {topics, items}; items are best first."""
    topics = topics_for(account)
    aid = account.get("id") or "default"
    if refresh:
        with _lock:
            for t in topics:
                _cache.pop(("s", t.lower()), None)
    cs = [c for c in creators.list_creators() if c.get("enabled", True) and (c["options"].get("account") or "default") == aid]
    followed = {c["channel_id"] for c in creators.list_creators()}
    with ThreadPoolExecutor(max_workers=4) as ex:
        s_res = list(ex.map(search_topic, topics))
        f_res = list(ex.map(follow_recent, cs[:12]))
    clipped = _clipped_ids()
    seen, items = set(), []
    for batch in f_res + s_res:
        for r in batch:
            if r["id"] in seen or r["id"] in clipped:
                continue
            seen.add(r["id"])
            items.append({**r, "following": r["channel_id"] in followed})
    items.sort(key=lambda r: -(r["views"] or 0))
    return {"topics": topics, "items": items[:36]}
