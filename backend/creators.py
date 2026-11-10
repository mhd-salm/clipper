"""Creator watcher: polls each followed channel's RSS feed and auto-creates a
clipping job for every NEW upload (videos present when you follow are ignored)."""
import json
import threading
import time
import xml.etree.ElementTree as ET

import requests

import config
import jobs
import presets

_lock = threading.Lock()
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}


def _load() -> list[dict]:
    if config.CREATORS_FILE.exists():
        return json.loads(config.CREATORS_FILE.read_text("utf-8"))
    return []


def _save(items: list[dict]):
    config.CREATORS_FILE.write_text(json.dumps(items, indent=2), "utf-8")


def list_creators() -> list[dict]:
    with _lock:
        return _load()


def feed(channel_id: str) -> list[dict]:
    """Latest uploads. Uses YouTube's RSS feed; some channels 404 on it (or it hiccups), so fall back to the uploads playlist."""
    try:
        r = requests.get(f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}", timeout=20)
        r.raise_for_status()
        root = ET.fromstring(r.text)
        out = [{"id": e.find("yt:videoId", NS).text, "title": e.find("a:title", NS).text} for e in root.findall("a:entry", NS)]
        if out:
            return out
    except Exception as e:
        print(f"[watcher] RSS failed for {channel_id} ({str(e)[:60]}), using the uploads playlist instead")
    return [{"id": v["id"], "title": v["title"]} for v in recent_videos(channel_id, 0, 15)]


OPT_KEYS = ("layout_id", "subtitles", "sub_style", "num_clips", "min_len", "max_len", "resolution", "hook_text", "content",
            "auto", "auto_privacy", "hide_likes", "account", "min_score")
BUILTIN_DEFAULTS = {"layout_id": "fill", "subtitles": True, "sub_style": "bold_yellow", "num_clips": 0, "min_len": 20, "max_len": 60,
                    "resolution": "1080p", "hook_text": True, "content": "auto", "auto": True, "auto_privacy": "public",
                    "hide_likes": True, "account": "default", "min_score": 50}
SETTING_KEYS = ("layout_id", "subtitles", "sub_style", "resolution", "hook_text", "auto", "auto_privacy", "hide_likes", "account", "min_score", "min_len", "max_len", "num_clips")


def defaults() -> dict:
    """Settings every NEWLY followed creator starts with (already followed ones keep theirs)."""
    f = config.DATA / "creator_defaults.json"
    d = dict(BUILTIN_DEFAULTS)
    try:
        d.update({k: v for k, v in json.loads(f.read_text("utf-8")).items() if k in OPT_KEYS + ("enabled",)})
    except Exception:
        pass
    return d


def save_defaults(fields: dict) -> dict:
    d = defaults()
    d.update({k: v for k, v in fields.items() if k in SETTING_KEYS + ("enabled",)})
    (config.DATA / "creator_defaults.json").write_text(json.dumps(d, indent=2), "utf-8")
    return d


def update_options(channel_id: str, fields: dict):
    with _lock:
        items = _load()
        for c in items:
            if c["channel_id"] == channel_id:
                c["options"].update({k: v for k, v in fields.items() if k in SETTING_KEYS})
                if "enabled" in fields:
                    c["enabled"] = bool(fields["enabled"])
                if "preset" in fields:
                    pid = fields["preset"] or None
                    if pid:
                        ps = presets.settings_for(pid)
                        if not ps:
                            raise ValueError("That edit preset does not exist")
                        c["preset"] = pid
                        c["options"].update(ps)
                    else:
                        c.pop("preset", None)
        _save(items)


def search(q: str, limit: int = 8) -> list[dict]:
    """Find YouTube channels by name (or a pasted channel link / @handle)."""
    import re
    import urllib.parse
    import yt_dlp
    q = q.strip()
    if re.search(r"youtube\.com/(@|channel/|c/|user/)", q) or q.startswith("@"):
        url = q if q.startswith("http") else "https://www.youtube.com/" + q
        cid, name = resolve_channel(url)
        return [{"channel_id": cid, "name": name, "url": "https://www.youtube.com/channel/" + cid, "subs": None, "thumb": None}]
    url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote(q) + "&sp=EgIQAg%253D%253D"
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True, "playlist_items": f"1-{limit}"}) as ydl:
        info = ydl.extract_info(url, download=False)
    out = []
    for e in info.get("entries") or []:
        cid = (e or {}).get("id") or ""
        if not cid.startswith("UC"):
            continue
        th = ((e.get("thumbnails") or [{}])[-1].get("url")) or ""
        out.append({"channel_id": cid, "name": e.get("title") or cid, "url": "https://www.youtube.com/channel/" + cid,
                    "subs": e.get("channel_follower_count"), "thumb": ("https:" + th) if th.startswith("//") else th or None})
    return out


def job_options(c: dict) -> dict:
    """Options for a new video of this creator: their own settings, with the edit preset's CURRENT look on top."""
    return {**c["options"], **presets.settings_for(c.get("preset")), "preset": c.get("preset")}


def follow(channel_id: str, name: str, settings: dict | None = None) -> dict:
    """Follow with the settings chosen in the step-by-step screen (anything not given uses the built-in defaults).
    Videos already on the channel are ignored."""
    seen = [v["id"] for v in feed(channel_id)]
    d = dict(BUILTIN_DEFAULTS)
    s = settings or {}
    d.update({k: v for k, v in s.items() if k in SETTING_KEYS})
    enabled = bool(s.get("enabled", True))
    d["min_score"] = max(0, min(100, int(d.get("min_score", 50))))
    if d.get("auto"):
        d["num_clips"] = d.get("num_clips") or 0
    pid = s.get("preset") or None
    ps = presets.settings_for(pid)
    if pid and not ps:
        raise ValueError("That edit preset does not exist")
    d.update(ps)  # snapshot, used if the preset is ever deleted
    item = {"channel_id": channel_id, "name": name, "url": "https://www.youtube.com/channel/" + channel_id, "enabled": enabled, "seen": seen, "options": d}
    if pid:
        item["preset"] = pid
    with _lock:
        items = [x for x in _load() if x["channel_id"] != channel_id]
        items.append(item)
        _save(items)
    return item


def resolve_channel(url: str) -> tuple[str, str]:
    import yt_dlp

    with yt_dlp.YoutubeDL({"quiet": True, "extract_flat": True, "playlistend": 1}) as ydl:
        info = ydl.extract_info(url, download=False)
    cid = info.get("channel_id") or info.get("id")
    if not cid or not str(cid).startswith("UC"):
        raise ValueError("Could not find a YouTube channel at that URL")
    return cid, info.get("channel") or info.get("title") or cid


def add_creator(url: str, opts: dict) -> dict:
    cid, name = resolve_channel(url)
    seen = [v["id"] for v in feed(cid)]  # existing uploads are NOT clipped
    item = {
        "channel_id": cid, "name": name, "url": url, "enabled": True, "seen": seen,
        "options": {k: opts[k] for k in ("layout_id", "subtitles", "sub_style", "num_clips", "min_len", "max_len", "resolution", "hook_text", "content", "auto", "auto_privacy", "hide_likes", "account", "min_score") if k in opts},
    }
    with _lock:
        items = [c for c in _load() if c["channel_id"] != cid]
        items.append(item)
        _save(items)
    return item


def get_creator(channel_id: str) -> dict | None:
    return next((c for c in list_creators() if c["channel_id"] == channel_id), None)


def recent_videos(channel_id: str, offset: int = 0, limit: int = 5) -> list[dict]:
    """The channel's uploads, newest first (its "uploads" playlist: videos and shorts), `limit` of them from `offset`."""
    import yt_dlp
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True,
                           "playlist_items": f"{offset + 1}-{offset + limit}"}) as ydl:
        info = ydl.extract_info("https://www.youtube.com/playlist?list=UU" + channel_id[2:], download=False)
    return [{"id": e["id"], "title": e.get("title") or e["id"], "duration": e.get("duration"), "view_count": e.get("view_count"),
             "live": e.get("live_status") in ("is_live", "was_live", "is_upcoming")} for e in (info.get("entries") or []) if e and e.get("id")]


_pop_cache: dict = {}
POPULAR_POOL = 300  # "most viewed" ranks the channel's latest 300 uploads


def popular_videos(channel_id: str, offset: int = 0, limit: int = 5) -> list[dict]:
    """The most viewed of the channel's latest POPULAR_POOL uploads (YouTube's own Popular sort is not reachable, so we rank the
    uploads list ourselves). The list is kept for 10 minutes so paging through it is instant."""
    hit = _pop_cache.get(channel_id)
    if not hit or time.time() - hit[0] > 600:
        vids = recent_videos(channel_id, 0, POPULAR_POOL)
        hit = _pop_cache[channel_id] = (time.time(), sorted(vids, key=lambda v: -(v.get("view_count") or 0)))
    return hit[1][offset: offset + limit]


def remove_creator(channel_id: str):
    with _lock:
        _save([c for c in _load() if c["channel_id"] != channel_id])


def update_upload(channel_id: str, fields: dict):
    """Change where/whether a followed creator's new videos are uploaded (full auto)."""
    with _lock:
        items = _load()
        for c in items:
            if c["channel_id"] == channel_id:
                c["options"].update({k: v for k, v in fields.items() if k in ("auto", "auto_privacy", "hide_likes", "account", "min_score")})
        _save(items)


def set_enabled(channel_id: str, enabled: bool):
    with _lock:
        items = _load()
        for c in items:
            if c["channel_id"] == channel_id:
                c["enabled"] = enabled
        _save(items)


def check_all() -> list[str]:
    """Check every enabled creator once; returns titles of videos queued."""
    queued = []
    for c in list_creators():
        if not c["enabled"]:
            continue
        try:
            vids = feed(c["channel_id"])
        except Exception as e:
            print(f"[watcher] {c['name']}: {e}")
            continue
        new = [v for v in vids if v["id"] not in c["seen"]]
        for v in reversed(new):  # oldest first
            jobs.create_job(url=f"https://www.youtube.com/watch?v={v['id']}", upload=None,
                            opts={**job_options(c), "title": v["title"], "creator_id": c["channel_id"]}, source="watcher")
            queued.append(v["title"])
        if new:
            with _lock:
                items = _load()
                for it in items:
                    if it["channel_id"] == c["channel_id"]:
                        it["seen"] = (it["seen"] + [v["id"] for v in new])[-200:]
                _save(items)
    return queued


def start_watcher():
    def loop():
        while True:
            try:
                check_all()
            except Exception as e:
                print("[watcher] error:", e)
            time.sleep(config.WATCH_INTERVAL_MINUTES * 60)

    threading.Thread(target=loop, daemon=True).start()
