import os
import json
import shutil
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import config
import layouts
import pipeline

_pool = ThreadPoolExecutor(max_workers=config.JOB_WORKERS)  # download, captions, AI: run in parallel
_rpool = ThreadPoolExecutor(max_workers=config.RENDER_WORKERS)  # rendering: one at a time, in the order queued
_lock = threading.RLock()  # re-entrant: a whole read-modify-write holds it, so threads never overwrite each other's changes


def job_dir(job_id: str) -> Path:
    return config.JOBS_DIR / job_id


def read_job(job_id: str) -> dict | None:
    f = job_dir(job_id) / "job.json"
    if not f.exists():
        return None
    with _lock:
        t = f.read_text("utf-8")
    try:
        return json.loads(t)
    except json.JSONDecodeError:  # a torn write left junk after the JSON: keep the valid part
        return json.JSONDecoder().raw_decode(t)[0]


def write_job(job: dict):
    with _lock:
        p = job_dir(job["id"]) / "job.json"
        tmp = p.with_name(f"job.{threading.get_ident()}.tmp")
        tmp.write_text(json.dumps(job, indent=2), "utf-8")
        for i in range(12):  # Windows (or OneDrive / an antivirus) can briefly lock the file: wait and retry
            try:
                os.replace(tmp, p)  # atomic: readers never see a half-written file
                break
            except PermissionError:
                time.sleep(0.05 * (i + 1))
        else:
            p.write_text(json.dumps(job, indent=2), "utf-8")
            try:
                tmp.unlink()
            except OSError:
                pass


class JobGone(Exception):
    """The job's folder was deleted while it was running (e.g. removed from the UI)."""


def update(job_id: str, **fields) -> dict:
    with _lock:
        job = read_job(job_id)
        if job is None:
            raise JobGone(job_id)
        job.update(fields)
        write_job(job)
    return job


_jcache: dict = {}  # job id -> (mtime, size, data)


def list_jobs() -> list[dict]:
    jobs = []
    for d in config.JOBS_DIR.iterdir():
        if not d.is_dir():
            continue
        f = d / "job.json"
        try:
            st = f.stat()
        except OSError:
            continue
        hit = _jcache.get(d.name)
        if hit and hit[0] == st.st_mtime_ns and hit[1] == st.st_size:
            jobs.append(hit[2])
            continue
        j = read_job(d.name)
        if j:
            _jcache[d.name] = (st.st_mtime_ns, st.st_size, j)
            jobs.append(j)
    return sorted(jobs, key=lambda j: j["created"], reverse=True)


def create_job(*, url: str | None, upload: Path | None, opts: dict, source: str = "manual") -> dict:
    job_id = uuid.uuid4().hex[:10]
    d = job_dir(job_id)
    d.mkdir(parents=True)
    if upload:
        shutil.move(str(upload), d / ("source" + upload.suffix))
    job = {
        "id": job_id, "created": time.time(), "url": url, "source": source, "creator_id": opts.get("creator_id"), "title": opts.get("title") or url or "Upload",
        "status": "queued", "stage": "Queued", "error": None, "clips": [],
        "options": {
            "layout_id": opts.get("layout_id", "fill"),
            "subtitles": opts.get("subtitles", True),
            "sub_style": opts.get("sub_style", "bold_yellow"),
            "num_clips": int(opts.get("num_clips", 5)),
            "min_len": int(opts.get("min_len", 20)),
            "max_len": int(opts.get("max_len", 60)),
            "resolution": opts.get("resolution", "1080p"),
            "hook_text": bool(opts.get("hook_text", True)),
            "content": opts.get("content", "auto"),
            "auto": bool(opts.get("auto", False)),  # full auto: render the 60+ clips and upload them
            "auto_privacy": opts.get("auto_privacy", "public"),
            "account": opts.get("account", "default"),
            "hide_likes": bool(opts.get("hide_likes", True)),
            "notes": str(opts.get("notes", ""))[:1000],
            "min_score": max(0, min(100, int(opts.get("min_score", DEFAULT_MIN_SCORE)))),
        },
    }
    write_job(job)
    _pool.submit(_run, job_id, bool(url and not upload))
    return job


_last_prog: dict = {}


def log(job_id: str, msg: str, level: str = "info"):
    """Append a timestamped line to the job's live log (kept to the last 300 lines)."""
    with _lock:
        job = read_job(job_id)
        if not job:
            return
        job.setdefault("log", []).append({"t": time.time(), "level": level, "msg": msg})
        job["log"] = job["log"][-300:]
        write_job(job)


def set_stage(job_id: str, key: str, label: str):
    """key: download | transcribe | pick | render | done. Resets the stage progress bar."""
    _last_prog.pop(job_id, None)
    update(job_id, status="running", stage=label, stage_key=key, progress=0)


def set_progress(job_id: str, pct: float):
    """Throttled: writes at most ~2x/sec and only when the percentage moved."""
    pct = max(0, min(100, int(pct)))
    now = time.time()
    last_t, last_p = _last_prog.get(job_id, (0, -1))
    if pct == last_p or (now - last_t < 0.5 and pct < 100):
        return
    _last_prog[job_id] = (now, pct)
    update(job_id, progress=pct)


def _fmt(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 60}:{sec % 60:02d}"


def _run(job_id: str, needs_download: bool):
    d = job_dir(job_id)
    job = read_job(job_id)
    o = job["options"]
    t0 = time.time()
    update(job_id, started=t0, finished=None, log=[])
    try:
        heatmap = []
        if needs_download:
            set_stage(job_id, "download", "Downloading video")
            log(job_id, f"Downloading {job['url']}")
            t = time.time()
            info = pipeline.download(job["url"], d, on_progress=lambda p: set_progress(job_id, p))
            heatmap = info["heatmap"]
            update(job_id, title=info["title"], channel=info["channel"], duration=info["duration"], heatmap=heatmap,
                   video_description=info.get("description", ""))
            log(job_id, f"Downloaded \"{info['title']}\" ({_fmt(info['duration'])}) in {_fmt(time.time() - t)}", "ok")
            if heatmap:
                log(job_id, f"Found YouTube 'Most replayed' data ({len(heatmap)} segments) - the AI will use it")
            if job["source"] == "watcher" and info["duration"] < 120:
                update(job_id, status="skipped", stage="Skipped (short video)", finished=time.time())
                log(job_id, "Video is under 2 minutes - skipped", "warn")
                return
        else:
            log(job_id, "Using uploaded video file")
        video = pipeline.source_path(d)

        set_stage(job_id, "transcribe", "Transcribing speech")
        t = time.time()
        if job.get("url") and config.USE_YT_CAPTIONS and not (d / "transcript.json").exists() \
                and not pipeline.captions_file(d):
            log(job_id, "Trying YouTube's own captions first (much faster than Whisper)")
            why = pipeline.fetch_captions(job["url"], d)
            if why:
                log(job_id, f"Captions unavailable ({why}) - falling back to Whisper", "warn")
        if (d / "transcript.json").exists():
            log(job_id, "Using cached transcript")
        elif pipeline.captions_file(d):
            log(job_id, "Using YouTube's own captions (skips the slow Whisper step)")
        else:
            log(job_id, f"Transcribing with Whisper '{config.WHISPER_MODEL}' on CPU - this is the slowest step")
        transcript = pipeline.transcribe(video, d, on_progress=lambda p: set_progress(job_id, p))
        words = [w for s in transcript for w in s["words"]]
        kind = o.get("content", "auto")
        if not words and kind != "gaming":
            raise RuntimeError("No speech detected in the video. If this is gameplay or a funny-moments video, choose the Gaming & funny type and try again.")
        if not words:
            log(job_id, "No speech found - picking moments from audio energy and the content type", "warn")
        log(job_id, f"Transcribed {len(transcript)} segments / {len(words)} words in {_fmt(time.time() - t)}", "ok")

        set_stage(job_id, "pick", "AI is finding the viral moments")
        t = time.time()
        want = 0 if o.get("auto") else int(o.get("num_clips") or 0)
        log(job_id, (f"Asking the AI for the {want} best moments" if want else "Asking the AI to find every clip-worthy moment")
            + f" ({o['min_len']}-{o['max_len']}s each)")
        brief = ""
        try:
            jb0 = read_job(job_id)
            set_stage(job_id, "pick", "AI is working out who is who in the video")
            brief = pipeline.make_brief(jb0.get("title", ""), jb0.get("channel", ""), jb0.get("video_description", ""), transcript,
                                        o.get("notes", ""), log=lambda m, lv="info": log(job_id, m, lv))
            update(job_id, brief=brief)
            log(job_id, "Video brief ready: " + brief.replace("\n", " | ")[:300], "ok")
        except Exception as e:
            brief = ("User note: " + o["notes"]) if o.get("notes") else ""
            log(job_id, f"Could not write a video brief ({str(e)[:80]}); continuing without it", "warn")
        set_stage(job_id, "pick", "AI is finding the viral moments")
        peaks = pipeline.audio_peaks(video)
        if peaks:
            log(job_id, f"Audio analysis: {len(peaks)} loud moments (laughs / screams / action) found")
        picks = pipeline.select_clips(transcript, heatmap, want, o["min_len"], o["max_len"],
                                      log=lambda m, lv="info": log(job_id, m, lv), kind=kind, peaks=peaks,
                                      duration=read_job(job_id).get("duration") or 0,
                                      context={"title": read_job(job_id).get("title", ""), "description": read_job(job_id).get("video_description", ""), "brief": brief})
        if not picks:
            raise RuntimeError("AI found no suitable clips")
        log(job_id, f"AI picked {len(picks)} clips in {_fmt(time.time() - t)}", "ok")
        for p in picks:
            log(job_id, f"  • {p['title']}  [{_fmt(p['start'])}-{_fmt(p['end'])}, score {p['score']}]")

        set_stage(job_id, "pick", "AI reviewers are rating the clips")
        t = time.time()
        log(job_id, "Review panel (hook / retention / value / shareability) is scoring each clip")
        ratings = [None] * len(picks)
        try:
            jb = read_job(job_id)
            ratings = pipeline.rate_clips(transcript, picks, log=lambda m, lv="info": log(job_id, m, lv), kind=kind,
                                          context={"title": jb.get("title", ""), "channel": jb.get("channel", ""), "description": jb.get("video_description", ""), "brief": brief})
            log(job_id, f"Rated {sum(1 for r in ratings if r)} clips in {_fmt(time.time() - t)}", "ok")
        except Exception as e:  # rating is a bonus: never fail the job over it
            log(job_id, f"Rating skipped: {str(e)[:120]}", "warn")
        for p, r in zip(picks, ratings):
            if r:
                p["score"] = r["overall"]
                log(job_id, f"  - {p['title']}: {r['overall']}/100 (hook {r['hook']}, retention {r['retention']}, value {r['value']}, share {r['shareability']})")
        picks_r = sorted(zip(picks, ratings), key=lambda pr: -pr[0]["score"])  # best first: c1 is the top-rated clip

        clips = [{
            "rating": r,
            "id": f"c{i + 1}", "title": p["title"], "reason": p["reason"], "score": p["score"],
            "status": "candidate", "selected": False, "error": None, "version": 0, "progress": 0,
            "params": {"start": p["start"], "end": p["end"], "layout_id": o["layout_id"],
                       "subtitles": o["subtitles"], "sub_style": o["sub_style"],
                       "resolution": o["resolution"],
                       "overlays": ([{"text": r["hook_text"], "start": 0.0, "end": 3.5, "x": 0.5, "y": 0.14,
                                      "size": 0.05, "color": "#FFFFFF", "hook": True}]
                                    if r and r.get("hook_text") and o.get("hook_text", True) else [])},
        } for i, (p, r) in enumerate(picks_r)]
        # pre-select. Creator videos (clips only): everything rated 65+. Full auto: 60+. Manual: 60+ (or top N), never empty.
        creator_job = bool(job.get("creator_id")) or job["source"] == "watcher"
        unattended = creator_job or bool(o.get("auto"))
        thr = int(o.get("min_score", DEFAULT_MIN_SCORE))  # chosen by the user when starting (default 50)
        for i, c in enumerate(clips):
            c["selected"] = (c["score"] >= thr and (not want or i < want)) if creator_job else ((i < want) if want else c["score"] >= thr)
        if not any(c["selected"] for c in clips) and not unattended:
            for c in clips[:3]:
                c["selected"] = True
        update(job_id, clips=clips)
        n_ok = sum(1 for c in clips if c["score"] >= thr)
        log(job_id, f"{len(clips)} distinct clips found, {n_ok} rated {thr}+", "ok")
        if unattended and not any(c["selected"] for c in clips):
            update(job_id, clips=[], status="done", stage="Done", stage_key="done", progress=100, finished=time.time())
            log(job_id, f"None of the {len(clips)} clips scored {thr}+, so nothing was rendered" + (" or uploaded" if o.get("auto") else ""), "warn")
            return
        if unattended:  # no review step: render the selected clips (and upload them in full auto)
            render_selected(job_id, [c["id"] for c in clips if c["selected"]], wait=True)
            return
        update(job_id, status="review", stage="Choose which clips to render", stage_key="review", progress=0, finished=None)
        log(job_id, "Waiting for you to choose which clips to render", "ok")
    except JobGone:
        print(f"[jobs] {job_id} was deleted while running - stopped")
    except Exception as e:
        traceback.print_exc()
        try:
            update(job_id, status="error", stage="Failed", error=str(e), finished=time.time())
            log(job_id, str(e), "error")
        except JobGone:
            pass


DEFAULT_MIN_SCORE = 50
MIN_RATING = 60
CREATOR_MIN_RATING = 65  # creator videos in clips-only mode: auto-select every clip rated this or higher


def render_selected(job_id: str, ids: list[str], wait: bool = False):
    """Keep only the chosen candidates and render them. Called from the review screen (or directly by the watcher)."""
    job = read_job(job_id)
    keep = [c for c in job["clips"] if c["id"] in set(ids)]
    if not keep:
        raise ValueError("Select at least one clip")
    for c in keep:
        c["status"] = "pending"
    update(job_id, clips=keep, status="running", stage="Rendering clips", stage_key="render", progress=0, finished=None)
    update(job_id, stage="Waiting to render")
    _rpool_submit(_render_all, job_id)  # queued behind any render in progress; analysis of other videos keeps going meanwhile


def clip_description(clip: dict) -> str:
    """The ready-to-post description for a clip: the AI's own-words description + hashtags (always with #Shorts)."""
    r = clip.get("rating") or {}
    body = (r.get("description") or r.get("caption") or "").strip()
    tags = " ".join("#" + t for t in r.get("hashtags", []))
    d = (body + " " + tags).strip()
    if "#shorts" not in (clip.get("title", "") + d).lower():
        d = (d + "\n\n#Shorts").strip()
    return d


def _auto_upload(job_id: str):
    """Full auto: queue every rendered clip of this project for the browser upload. Halts (and logs) on any problem."""
    import webupload
    job = read_job(job_id)
    o = job["options"]
    ready = sorted((c for c in job["clips"] if c["status"] == "ready"), key=lambda c: -c["score"])
    if not ready:
        log(job_id, "Full auto: no clip rendered successfully, nothing to upload", "error")
        return
    st = webupload.auto_state(o.get("account", "default"))
    if st.get("paused"):
        log(job_id, f"Full auto upload is PAUSED ({st.get('reason')}). Clips are ready; resume from the banner, then use Upload all.", "warn")
        return
    if not webupload.status()["ready"]:
        log(job_id, "Full auto: browser upload is not set up (Playwright / Chrome missing), clips were not uploaded", "error")
        return
    items = [(c["id"], c["title"][:100], clip_description(c)) for c in ready]
    log(job_id, f"Full auto: uploading {len(items)} clips to YouTube channel '{webupload.get_account(o.get('account'))['name']}' ({o.get('auto_privacy', 'public')})", "ok")
    webupload.start_many(job_id, items, o.get("auto_privacy", "public"), o.get("hide_likes", True), auto=True, account=o.get("account", "default"))


def _open_stream(job_id: str):
    """Full auto: start the upload stream for this project (clips upload as soon as each one is rendered). None = not possible (logged)."""
    import webupload
    o = read_job(job_id)["options"]
    acc = o.get("account", "default")
    st = webupload.auto_state(acc)
    if st.get("paused"):
        log(job_id, f"Full auto upload is PAUSED ({st.get('reason')}). Clips will be rendered; resume from the banner, then use Upload all.", "warn")
        return None
    if not webupload.status()["ready"]:
        log(job_id, "Full auto: browser upload is not set up (Playwright / Chrome missing), clips will not be uploaded", "error")
        return None
    log(job_id, f"Full auto: each clip uploads to '{webupload.get_account(acc)['name']}' ({o.get('auto_privacy', 'public')}) as soon as it is rendered", "ok")
    return webupload.UploadStream(job_id, o.get("auto_privacy", "public"), o.get("hide_likes", True), True, acc)


_rlock = threading.Lock()
_RWAIT: list = []  # (job_id, clip_id|None) waiting for the single render slot, in order
_RCUR: dict = {}   # what is rendering right now


_rcv = threading.Condition(_rlock)
_rworker = []


def _rloop():
    while True:
        with _rcv:
            while not _RWAIT:
                _rcv.wait()
            ent = _RWAIT.pop(0)
            fn = _RFN.pop(ent, None)
            _RCUR.update(job_id=ent[0], clip_id=ent[1], t=time.time())
        try:
            if fn:
                fn(ent[0], ent[1]) if ent[1] else fn(ent[0])
        except Exception:
            traceback.print_exc()
        finally:
            with _rcv:
                _RCUR.clear()


_RFN: dict = {}


def _rpool_submit(fn, job_id, clip_id=None):
    ent = (job_id, clip_id)
    with _rcv:
        if ent in _RFN:
            return
        _RWAIT.append(ent)
        _RFN[ent] = fn
        if not _rworker:
            t = threading.Thread(target=_rloop, daemon=True, name="render-queue")
            _rworker.append(t)
            t.start()
        _rcv.notify_all()


def render_reorder(order: list) -> int:
    """order = [[job_id, clip_id|None], ...] wanted sequence; anything not listed keeps its place after."""
    with _rcv:
        m = {e: e for e in _RWAIT}
        new = [m.pop((o[0], o[1])) for o in order if (o[0], o[1]) in m]
        _RWAIT[:] = new + list(m.values())
        return len(_RWAIT)


def render_snapshot() -> dict:
    with _rlock:
        return {"waiting": list(_RWAIT), "current": dict(_RCUR)}


def recover(job_id: str | None = None) -> int:
    """After a restart nothing is really running: put interrupted work back to work."""
    snap = render_snapshot()
    known = {w[0] for w in snap["waiting"]} | ({snap["current"]["job_id"]} if snap["current"] else set())
    n = 0
    for j in list_jobs():
        jid = j["id"]
        if (job_id and jid != job_id) or jid in known:
            continue
        clips = j.get("clips", [])
        stale = [c for c in clips if c.get("status") in ("rendering", "pending")]
        if j.get("status") in ("queued", "running"):
            if stale or j.get("stage_key") == "render":
                for c in clips:
                    if c.get("status") == "rendering":
                        c["status"] = "pending"
                write_job(dict(j, clips=clips))
                update(jid, status="running", stage="Waiting to render")
                log(jid, "Resumed after restart", "info")
                _rpool_submit(_render_all, jid)
            else:
                has_source = any(job_dir(jid).glob("source.*"))
                update(jid, status="queued", stage="Queued", error=None)
                log(jid, "Resumed after restart", "info")
                _pool.submit(_run, jid, bool(j.get("url")) and not has_source)
            n += 1
        elif j.get("status") in ("done", "error") and any(c.get("status") == "rendering" for c in clips):
            for c in clips:  # an edit was re-rendering
                if c.get("status") == "rendering":
                    _set_clip(jid, c["id"], status="pending")
                    _rpool_submit(_render, jid, c["id"])
                    n += 1
    return n


def _render_all(job_id: str):
    t0 = time.time()
    stream = None
    try:
        job0 = read_job(job_id)
        todo = [c["id"] for c in job0["clips"] if c["status"] == "pending"]
        if job0.get("options", {}).get("auto"):
            stream = _open_stream(job_id)
            if stream:
                for c in sorted(job0["clips"], key=lambda c: -c.get("score", 0)):
                    y = (c.get("publish") or {}).get("youtube") or {}
                    if c["status"] == "ready" and c.get("version", 0) > 0 and not y.get("status"):
                        stream.add(c["id"], c["title"][:100], clip_description(c))
        for n, cid in enumerate(todo, 1):
            c = next(x for x in read_job(job_id)["clips"] if x["id"] == cid)
            set_stage(job_id, "render", f"Rendering clip {n} of {len(todo)}")
            update(job_id, render_index=n, render_total=len(todo))
            log(job_id, f"Rendering clip {n}/{len(todo)}: {c['title']}")
            t = time.time()
            _render(job_id, cid, announce=False)
            after = next(x for x in read_job(job_id)["clips"] if x["id"] == cid)
            if after["status"] == "ready":
                log(job_id, f"Clip {n} ready in {_fmt(time.time() - t)}", "ok")
                if stream:
                    stream.add(cid, after["title"][:100], clip_description(after))
            else:
                log(job_id, f"Clip {n} failed: {after['error']}", "error")
        update(job_id, status="done", stage="Done", stage_key="done", progress=100, finished=time.time())
        log(job_id, f"All done in {_fmt(time.time() - t0)}", "ok")
        if stream and not stream.count:
            log(job_id, "Full auto: no clip rendered successfully, nothing to upload", "error")
    except JobGone:
        pass
    except Exception as e:
        traceback.print_exc()
        try:
            update(job_id, status="error", stage="Failed", error=str(e), finished=time.time())
        except JobGone:
            pass
    finally:
        if stream:
            stream.close()


def _set_clip(job_id: str, clip_id: str, **fields):
    with _lock:
        job = read_job(job_id)
        if job is None:
            raise JobGone(job_id)
        for c in job["clips"]:
            if c["id"] == clip_id:
                c.update(fields)
        write_job(job)


def _render(job_id: str, clip_id: str, announce: bool = True):
    job = read_job(job_id)
    clip = next(c for c in job["clips"] if c["id"] == clip_id)
    d = job_dir(job_id)
    out_dir = d / "clips"
    out_dir.mkdir(exist_ok=True)
    _set_clip(job_id, clip_id, status="rendering", error=None, progress=0)
    if announce:
        log(job_id, f"Re-rendering {clip['title']}")
    state = {"last": (0.0, -1)}

    def on_progress(pct: float):  # per-clip progress, throttled
        now, p = time.time(), int(pct)
        if p != state["last"][1] and (now - state["last"][0] > 0.7 or p >= 100):
            state["last"] = (now, p)
            _set_clip(job_id, clip_id, progress=p)
            if job.get("status") == "running":
                set_progress(job_id, p)

    try:
        transcript = pipeline.transcribe(pipeline.source_path(d), d)
        words = [w for s in transcript for w in s["words"]]
        if clip["params"].get("captions"):  # user-edited caption text replaces the AI transcript
            from subtitles import expand_captions
            words = expand_captions(clip["params"]["captions"])
        pipeline.render_clip(pipeline.source_path(d), words, clip["params"], out_dir, clip_id, on_progress=on_progress)
        _set_clip(job_id, clip_id, status="ready", version=clip["version"] + 1, progress=100)
        if announce:
            log(job_id, f"{clip['title']} updated", "ok")
    except Exception as e:
        _set_clip(job_id, clip_id, status="error", error=str(e))
        if announce:
            log(job_id, f"{clip['title']} failed: {e}", "error")


def edit_clip(job_id: str, clip_id: str, params: dict):
    """Merge new params into a clip and re-render it in the background."""
    job = read_job(job_id)
    clip = next(c for c in job["clips"] if c["id"] == clip_id)
    if "layout" in params and params["layout"]:
        params["layout"] = layouts.sanitize(params["layout"])
    clip["params"].update({k: v for k, v in params.items() if k in
                           ("start", "end", "layout_id", "layout", "subtitles", "sub_style", "resolution", "overlays", "captions")})
    if "captions" in params and not params["captions"]:
        clip["params"].pop("captions", None)  # empty list = back to the AI captions
    if params.get("layout_id") and "layout" not in params:
        clip["params"].pop("layout", None)  # picking a preset clears any per-clip custom layout
    write_job(job)
    _rpool_submit(_render, job_id, clip_id)


def retry_job(job_id: str):
    """Retry a failed job without throwing work away. If clips were already found/rendered, keep them and only
    render the ones that failed or never finished. With no clips yet, redo the analysis (cached video + transcript are reused)."""
    job = read_job(job_id)
    has_source = any(job_dir(job_id).glob("source.*"))
    clips = job.get("clips") or []
    if clips and has_source:
        todo = [c for c in clips if c.get("status") != "ready"]
        for c in todo:
            c["status"] = "pending"
            c["error"] = None
        write_job(dict(job, clips=clips))
        if todo:
            update(job_id, status="running", stage="Waiting to render", stage_key="render", error=None, finished=None)
            log(job_id, f"Retrying {len(todo)} clip{'s' if len(todo) != 1 else ''} (the {len(clips) - len(todo)} finished ones are kept)")
            _rpool_submit(_render_all, job_id)
        else:
            update(job_id, status="done", stage="Done", stage_key="done", error=None, progress=100)
        return
    update(job_id, status="queued", stage="Queued", error=None, clips=[])
    _pool.submit(_run, job_id, bool(job["url"]) and not has_source)


def delete_job(job_id: str):
    with _rcv:
        for e in [e for e in _RWAIT if e[0] == job_id]:
            _RWAIT.remove(e)
            _RFN.pop(e, None)
    _jcache.pop(job_id, None)
    shutil.rmtree(job_dir(job_id), ignore_errors=True)
