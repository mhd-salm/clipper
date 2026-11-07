"""Auto-delete: frees disk space once a clip is safely on YouTube.

 * an uploaded clip's video file is deleted AUTO_DELETE_HOURS (default 24) after it was uploaded
 * the downloaded source video is deleted AUTO_DELETE_HOURS after the LAST clip of the project was uploaded
   (only when every clip of the project is uploaded: the source is still needed to re-render the rest)
Never touches a project that is rendering, queued, waiting for review, or has an upload queued or running.
Thumbnails, transcripts and the project itself are kept. Set AUTO_DELETE_HOURS=0 in .env to switch it off."""
import threading
import time

import config
import jobs

VIDEO_EXT = (".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v")


def _yt(c: dict) -> dict:
    return (c.get("publish") or {}).get("youtube") or {}


def _busy(j: dict) -> bool:
    return j.get("status") in ("queued", "running", "review") or any(
        c.get("status") in ("rendering", "pending") or _yt(c).get("status") in ("queued", "uploading") for c in j.get("clips", []))


def sweep(hours: float | None = None) -> dict:
    hours = config.AUTO_DELETE_HOURS if hours is None else hours
    out = {"clips": 0, "sources": 0, "bytes": 0}
    if hours <= 0:
        return out
    now = time.time()
    for j in jobs.list_jobs():
        if _busy(j):
            continue
        d = jobs.job_dir(j["id"])
        last = 0.0
        for c in j["clips"]:
            y = _yt(c)
            if y.get("status") != "done":
                continue
            f = d / "clips" / f"{c['id']}.mp4"
            t = y.get("t") or (f.stat().st_mtime if f.exists() else 0)  # older uploads have no timestamp: use the file's age
            last = max(last, t)
            if f.exists() and now - t >= hours * 3600:
                try:
                    size = f.stat().st_size
                    f.unlink()
                    out["clips"] += 1
                    out["bytes"] += size
                except OSError:
                    pass
        # leftovers of an interrupted render
        for f in (d / "clips").glob("*.part.mp4") if (d / "clips").exists() else []:
            if now - f.stat().st_mtime > 86400:
                try:
                    out["bytes"] += f.stat().st_size
                    f.unlink()
                except OSError:
                    pass
        if j["clips"] and all(_yt(c).get("status") == "done" for c in j["clips"]) and now - last >= hours * 3600:
            for f in d.glob("source.*"):
                if f.suffix.lower() in VIDEO_EXT or f.name.endswith(".part"):
                    try:
                        size = f.stat().st_size
                        f.unlink()
                        out["sources"] += 1
                        out["bytes"] += size
                    except OSError:
                        pass
    if out["clips"] or out["sources"]:
        print(f"[cleanup] removed {out['clips']} uploaded clip(s) and {out['sources']} source video(s), freed {out['bytes'] / 1e6:.0f} MB")
    return out


def start():
    def loop():
        time.sleep(60)  # let the app settle after start-up
        while True:
            try:
                sweep()
            except Exception as e:
                print("[cleanup] error:", e)
            time.sleep(30 * 60)
    threading.Thread(target=loop, daemon=True, name="cleanup").start()
