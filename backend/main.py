import threading
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config
import creators
import jobs
import layouts
import pipeline
import publish
from subtitles import STYLES

app = FastAPI(title="Spark Clipper")


class JobOptions(BaseModel):
    layout_id: str = "fill"
    subtitles: bool = True
    sub_style: str = "bold_yellow"
    num_clips: int = 0  # 0 = the AI decides
    min_len: int = 20
    max_len: int = 60
    resolution: str = "1080p"
    hook_text: bool = True
    content: str = "auto"
    auto: bool = False  # full auto: pick 60+ clips, render and upload
    auto_privacy: str = "public"
    hide_likes: bool = True
    account: str = "default"
    notes: str = ""  # optional: tell the AI who/what the video is about
    min_score: int = 50  # clips rated at least this are picked automatically


class UrlJob(JobOptions):
    url: str


class CreatorIn(JobOptions):
    url: str


class ClipEdit(BaseModel):
    start: Optional[float] = None
    end: Optional[float] = None
    layout_id: Optional[str] = None
    layout: Optional[dict] = None
    subtitles: Optional[bool] = None
    sub_style: Optional[str] = None
    resolution: Optional[str] = None
    overlays: Optional[list[dict]] = None
    captions: Optional[list[dict]] = None


@app.on_event("startup")
def _startup():
    creators.start_watcher()
    import cleanup
    cleanup.start()
    try:
        jobs.recover()
    except Exception as e:
        print("[jobs] recover failed:", e)

    def _check_keys():  # find out which AI keys are invalid / rate limited right away, so jobs skip them
        try:
            import keycheck
            keycheck.check_all()
        except Exception as e:
            print("[keys] startup check failed:", e)
    threading.Thread(target=_check_keys, daemon=True).start()


# ---- meta
@app.get("/api/meta")
def meta():
    return {"sub_styles": list(STYLES), "resolutions": list(config.RESOLUTIONS),
            "gemini_configured": pipeline.ai_available(),
            "gemini_key2": len(config.GEMINI_KEYS) > 1,
            "ai_providers": ([f"Gemini x{len(config.GEMINI_KEYS)}" if len(config.GEMINI_KEYS) > 1 else "Gemini"] if config.GEMINI_KEYS else [])
            + [p.label + (f" x{len(p.keys)}" if len(p.keys) > 1 else "") for p in __import__("llm").providers()]}


# ---- AI key health
def _key_rows():
    import keystate
    import llm
    rows = []
    if config.GEMINI_KEYS:
        rows.append(("gemini", "Gemini", list(config.GEMINI_KEYS)))
    rows += [(p.name, p.label, list(p.keys)) for p in llm.providers()]
    return keystate, rows


@app.get("/api/keys")
def key_status():
    keystate, rows = _key_rows()
    provs, total, ready = [], 0, 0
    for name, label, keys in rows:
        snap = keystate.snapshot(name, keys)
        r = sum(1 for k in snap if k["state"] == "ready")
        provs.append({"name": name, "label": label, "total": len(keys), "ready": r, "keys": snap})
        total += len(keys)
        ready += r
    import envkeys
    return {"total": total, "ready": ready, "providers": provs,
            "available": [{"id": k, "label": v[1], "url": v[2], "free": v[3]} for k, v in envkeys.PROVIDERS.items()]}


class KeyAdd(BaseModel):
    provider: str
    keys: str  # one or many, separated by commas / spaces / new lines


class KeyRemove(BaseModel):
    provider: str
    mask: str


def detect_provider(key: str) -> str | None:
    """Guess the provider from the key's look (None = can't tell from the prefix)."""
    if key.startswith(("AIza", "AQ.")):
        return "gemini"
    for prefix, name in (("gsk_", "groq"), ("xai-", "xai"), ("sk-or-", "openrouter"), ("csk-", "cerebras"), ("sk-", "openai")):
        if key.startswith(prefix):
            return name
    return None


def _add_for(provider: str, tokens: list) -> dict:
    import envkeys
    import keycheck
    import keystate
    import llm
    from concurrent.futures import ThreadPoolExecutor
    have = set(envkeys.current(provider))
    new = [k for k in dict.fromkeys(tokens) if k not in have]  # drops repeats in the paste and keys already saved
    models = list(config.GEMINI_MODELS) if provider == "gemini" else (next((p.models for p in llm.providers() if p.name == provider), []) or _default_models(provider))
    bases = {n: v[1] for n, v in llm.KNOWN.items()}
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda k: keycheck.test(provider, k, models, bases), new))
    good = [k for k, r in zip(new, res) if r[0] != "invalid"]
    r = envkeys.add(provider, ",".join(good)) if good else {"added": []}
    for k, rr in zip(new, res):
        if rr[0] != "invalid":
            keycheck.apply(provider, k, rr)
    return {"added": len(r["added"]), "duplicates": len(tokens) - len(new),
            "invalid": [keystate.mask(k) for k, rr in zip(new, res) if rr[0] == "invalid"],
            "limited": [keystate.mask(k) for k, rr in zip(new, res) if rr[0] == "limited"]}


@app.post("/api/keys/add")
def key_add(body: KeyAdd):
    """Add keys. provider "auto" works out which service each key belongs to (from its prefix, else by asking each service).
    Each new key is checked first (no quota for validity), valid ones are saved to .env and used immediately."""
    import envkeys
    import keystate
    tokens = envkeys._split(body.keys)
    if not tokens:
        raise HTTPException(400, "Paste at least one key")
    if body.provider != "auto" and body.provider not in envkeys.PROVIDERS:
        raise HTTPException(400, "Unknown provider")
    groups: dict = {}
    unknown = []
    if body.provider == "auto":
        for k in dict.fromkeys(tokens):
            p = detect_provider(k)
            (groups.setdefault(p, []) if p else unknown).append(k)
        for k in unknown:  # no telltale prefix (e.g. Mistral): ask each remaining service whether it accepts the key
            for p in ("mistral", "cerebras", "groq", "openrouter", "xai", "openai"):
                if envkeys.probe(p, k) is True:
                    groups.setdefault(p, []).append(k)
                    break
    else:
        groups[body.provider] = tokens
    out = {"added": 0, "duplicates": 0, "invalid": [], "limited": [], "assigned": {}}
    placed = {k for ks in groups.values() for k in ks}
    for p, ks in groups.items():
        r = _add_for(p, ks)
        out["added"] += r["added"]; out["duplicates"] += r["duplicates"]; out["invalid"] += r["invalid"]; out["limited"] += r["limited"]
        out["assigned"][envkeys.PROVIDERS[p][1]] = len(ks)
    out["invalid"] += [keystate.mask(k) for k in dict.fromkeys(tokens) if k not in placed]  # nobody accepted it
    out["status"] = key_status()
    return out


def _default_models(provider: str) -> list:
    import llm
    v = llm.KNOWN.get(provider)
    return [m.strip() for m in v[2].split(",") if m.strip()] if v else []


@app.post("/api/keys/remove")
def key_remove(body: KeyRemove):
    import envkeys
    if body.provider not in envkeys.PROVIDERS or not envkeys.remove(body.provider, body.mask):
        raise HTTPException(404, "Key not found")
    return key_status()


@app.post("/api/keys/reset")
def key_reset():
    import keystate
    keystate.reset()
    return key_status()


@app.post("/api/keys/check")
def key_check():
    """Test every key: invalid ones are marked invalid, rate-limited ones limited (with when they recover), working ones cleared."""
    import keycheck
    keycheck.check_all()
    return key_status()


@app.get("/api/uploads/queue")
def uploads_queue():
    """The real upload queue per channel (in memory, in the exact order it will run) + what is uploading now,
    what finished recently, anything stopped on a problem and clips that got stuck (e.g. after a restart)."""
    import webupload
    snap = webupload.snapshot()
    allj = {j["id"]: j for j in jobs.list_jobs()}

    def info(jid, cid):
        j = allj.get(jid) or {}
        c = next((x for x in j.get("clips", []) if x["id"] == cid), None) or {}
        y = (c.get("publish") or {}).get("youtube") or {}
        return j, c, y

    def row(jid, cid, fallback_title=""):
        j, c, y = info(jid, cid)
        return {"job_id": jid, "clip_id": cid, "title": c.get("title") or fallback_title, "project": j.get("title") or jid,
                "score": c.get("score", 0), "status": y.get("status"), "progress": y.get("progress", 0),
                "note": y.get("note", ""), "error": y.get("error", ""), "url": y.get("url"), "t": y.get("t", 0)}

    out, total, holds = [], 0, 0
    for acc in webupload.accounts():
        aid = acc["id"]
        s = snap.get(aid) or {}
        mem = {(x["job_id"], x["clip_id"]) for x in s.get("queue", [])}
        if s.get("running"):
            mem.add((s["running"]["job_id"], s["running"]["clip_id"]))
        running = row(s["running"]["job_id"], s["running"]["clip_id"], s["running"]["title"]) if s.get("running") else None
        queue = [row(x["job_id"], x["clip_id"], x["title"]) for x in s.get("queue", [])]
        h = s.get("hold")
        hold = None
        if h:
            hr = row(h["job_id"], h["clip_id"])
            hold = {"reason": h["reason"], "shot": ("/incidents/" + h["shot"]) if h.get("shot") else None, "t": h["t"],
                    "job_id": h["job_id"], "clip_id": h["clip_id"], "title": hr["title"], "project": hr["project"],
                    "can_retry": bool(h.get("item"))}
            holds += 1
        done, stuck = [], []
        for jid, j in allj.items():
            jacc = (j.get("options") or {}).get("account", "default")
            for c in j.get("clips", []):
                y = (c.get("publish") or {}).get("youtube") or {}
                if (y.get("account") or jacc) != aid:
                    continue
                if y.get("status") == "done":
                    done.append(row(jid, c["id"]))
                elif y.get("status") in ("queued", "uploading") and (jid, c["id"]) not in mem:
                    stuck.append(row(jid, c["id"]))
        done.sort(key=lambda r: -(r["t"] or 0))
        total += len(queue) + (1 if running else 0)
        if running or queue or hold or done or stuck:
            out.append({"account": aid, "name": acc.get("name") or aid, "paused": bool(webupload.auto_state(aid).get("paused")),
                        "hold": hold, "running": running, "queue": queue, "done": done[:10], "done_total": len(done), "stuck": stuck})
    return {"total": total, "holds": holds, "accounts": out}


@app.get("/api/uploads/summary")
def uploads_summary():
    """Cheap (memory only): used by the sidebar badge."""
    import webupload
    snap = webupload.snapshot()
    n = sum(len(s["queue"]) + (1 if s["running"] else 0) for s in snap.values())
    holds = [{"account": a, "reason": s["hold"]["reason"], "t": s["hold"]["t"]} for a, s in snap.items() if s["hold"]]
    return {"total": n, "holds": holds}


class ReorderBody(BaseModel):
    account: str = "default"
    order: list


@app.post("/api/uploads/reorder")
def uploads_reorder(body: ReorderBody):
    import webupload
    return {"queued": webupload.reorder(body.account, body.order)}


class ContinueBody(BaseModel):
    account: str = "default"
    retry: bool = True


@app.post("/api/uploads/continue")
def uploads_continue(body: ContinueBody):
    import webupload
    return {"ok": webupload.continue_queue(body.account, body.retry)}


@app.post("/api/uploads/clear-stuck")
def uploads_clear_stuck(account: str = "default"):
    """Mark clips that say queued/uploading but nobody is working on them as cancelled, so they can be queued again."""
    import webupload
    snap = (webupload.snapshot().get(account) or {})
    mem = {(x["job_id"], x["clip_id"]) for x in snap.get("queue", [])}
    if snap.get("running"):
        mem.add((snap["running"]["job_id"], snap["running"]["clip_id"]))
    n = 0
    for j in jobs.list_jobs():
        if (j.get("options") or {}).get("account", "default") != account:
            continue
        for c in j["clips"]:
            y = (c.get("publish") or {}).get("youtube") or {}
            if y.get("status") in ("queued", "uploading") and (j["id"], c["id"]) not in mem:
                publish._set_publish(j["id"], c["id"], "youtube", status="cancelled", method="browser")
                n += 1
    return {"cleared": n}


@app.get("/api/renders/queue")
def renders_queue():
    """Rendering across all projects: the clip rendering now, projects waiting for the render slot, analysis stage, recent, stuck."""
    snap = jobs.render_snapshot()
    allj = {j["id"]: j for j in jobs.list_jobs()}
    mem = {w[0] for w in snap["waiting"]} | ({snap["current"]["job_id"]} if snap["current"] else set())

    def clip_row(j, c):
        return {"job_id": j["id"], "clip_id": c["id"], "title": c.get("title", ""), "project": j.get("title") or j["id"],
                "status": c.get("status"), "progress": c.get("progress", 0), "score": c.get("score", 0), "error": c.get("error")}
    running = None
    cur = snap["current"]
    if cur and cur.get("job_id") in allj:
        j = allj[cur["job_id"]]
        cs = [c for c in j["clips"] if c.get("status") == "rendering"]
        if cs:
            running = clip_row(j, cs[0])
            running["index"], running["total"] = j.get("render_index"), j.get("render_total")
    waiting = []  # one row per queue entry: a whole project (many clips) or a single re-render
    for jid, cid in snap["waiting"]:
        j = allj.get(jid)
        if not j:
            continue
        cs = [c for c in j["clips"] if (c.get("status") == "pending" if cid is None else c.get("id") == cid)]
        if cs:
            waiting.append({"job_id": jid, "clip_id": cid, "project": j.get("title") or jid, "count": len(cs),
                            "title": cs[0].get("title", "") if cid else "", "score": 0})
    rest = 0
    if cur and cur.get("job_id") in allj and cur.get("clip_id") is None:
        rest = sum(1 for c in allj[cur["job_id"]]["clips"] if c.get("status") == "pending")
    preparing = [{"job_id": j["id"], "title": j.get("title") or j["id"], "stage": j.get("stage", ""), "progress": j.get("progress", 0)}
                 for j in allj.values() if j.get("status") in ("queued", "running") and j.get("stage_key") != "render" and j["id"] not in mem]
    stuck = [{"job_id": j["id"], "title": j.get("title") or j["id"], "stage": j.get("stage", "")}
             for j in allj.values() if j["id"] not in mem and j.get("status") == "running" and j.get("stage_key") == "render"]
    done = []
    for j in allj.values():
        for c in j.get("clips", []):
            if c.get("status") == "ready" and c.get("version", 0) > 0:
                done.append(dict(clip_row(j, c), t=j.get("finished") or j.get("created") or 0))
    done.sort(key=lambda r: -r["t"])
    return {"total": sum(w["count"] for w in waiting) + rest + (1 if running else 0), "running": running, "rest": rest, "waiting": waiting, "preparing": preparing,
            "stuck": stuck, "done": done[:10], "done_total": len(done)}


class RenderOrder(BaseModel):
    order: list


@app.post("/api/renders/reorder")
def renders_reorder(body: RenderOrder):
    return {"queued": jobs.render_reorder(body.order)}


@app.post("/api/renders/resume")
def renders_resume(job_id: str | None = None):
    return {"resumed": jobs.recover(job_id)}


# ---- layouts
@app.get("/api/layouts")
def get_layouts():
    return layouts.list_layouts()


@app.post("/api/layouts")
def post_layout(layout: dict):
    if not layout.get("regions"):
        raise HTTPException(400, "layout needs at least one region")
    return layouts.save_layout(layout)


@app.delete("/api/layouts/{layout_id}")
def del_layout(layout_id: str):
    if not layouts.delete_layout(layout_id):
        raise HTTPException(404, "not found or built-in")
    return {"ok": True}


# ---- jobs
@app.post("/api/jobs")
def new_job(body: UrlJob):
    if body.auto:
        import webupload
        if body.auto_privacy not in ("private", "unlisted", "public"):
            raise HTTPException(400, "bad privacy value")
        if not webupload.status()["ready"]:
            raise HTTPException(400, "Full auto needs browser upload (Playwright + Chrome/Edge)")
    return jobs.create_job(url=body.url, upload=None, opts=body.model_dump())


@app.post("/api/jobs/upload")
async def new_upload_job(
    file: UploadFile = File(...),
    layout_id: str = Form("fill"), subtitles: bool = Form(True), sub_style: str = Form("bold_yellow"),
    num_clips: int = Form(0), min_len: int = Form(20), max_len: int = Form(60), resolution: str = Form("1080p"),
    hook_text: bool = Form(True), content: str = Form("auto"),
    auto: bool = Form(False), auto_privacy: str = Form("public"), hide_likes: bool = Form(True), account: str = Form("default"), notes: str = Form(""), min_score: int = Form(50),
):
    suffix = Path(file.filename or "v.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=config.DATA) as tmp:
        while chunk := await file.read(1024 * 1024):
            tmp.write(chunk)
    opts = dict(layout_id=layout_id, subtitles=subtitles, sub_style=sub_style, num_clips=num_clips,
                min_len=min_len, max_len=max_len, resolution=resolution, hook_text=hook_text, content=content, auto=auto, auto_privacy=auto_privacy, hide_likes=hide_likes, account=account, notes=notes, min_score=min_score, title=file.filename)
    return jobs.create_job(url=None, upload=Path(tmp.name), opts=opts)


@app.get("/api/jobs")
def get_jobs():
    return jobs.list_jobs()


@app.get("/api/jobs/{job_id}/zip")
def zip_clips(job_id: str):
    import re
    import zipfile
    job = jobs.read_job(job_id)
    if not job:
        raise HTTPException(404, "Project not found")
    tmp = Path(tempfile.mkdtemp()) / "clips.zip"
    n = 0
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED) as z:
        for i, c in enumerate(job["clips"], 1):
            f = config.JOBS_DIR / job_id / "clips" / f"{c['id']}.mp4"
            if c.get("version", 0) > 0 and f.exists():
                z.write(f, f"{i:02d}-{re.sub(r'[^A-Za-z0-9]+', '-', c['title']).strip('-')[:50] or c['id']}.mp4")
                n += 1
    if not n:
        raise HTTPException(404, "No finished clips yet")
    return FileResponse(tmp, filename="clips.zip", media_type="application/zip")


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    j = jobs.read_job(job_id)
    if not j:
        raise HTTPException(404)
    return j


@app.delete("/api/jobs/{job_id}")
def del_job(job_id: str):
    import webupload
    webupload.cancel_queued(job_id)  # nothing from this project keeps uploading
    jobs.delete_job(job_id)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/retry")
def retry(job_id: str):
    if not jobs.read_job(job_id):
        raise HTTPException(404)
    jobs.retry_job(job_id)
    return {"ok": True}


@app.patch("/api/jobs/{job_id}/clips/{clip_id}")
def patch_clip(job_id: str, clip_id: str, body: ClipEdit):
    j = jobs.read_job(job_id)
    if not j or not any(c["id"] == clip_id for c in j["clips"]):
        raise HTTPException(404)
    jobs.edit_clip(job_id, clip_id, body.model_dump(exclude_none=True))
    return {"ok": True}


@app.get("/api/jobs/{job_id}/captions")
def get_captions(job_id: str, start: float, end: float):
    """The AI captions (from the transcript) for a time range, as editable lines."""
    from subtitles import _chunks, clean_token
    if not jobs.read_job(job_id):
        raise HTTPException(404)
    d = config.JOBS_DIR / job_id
    try:
        transcript = pipeline.transcribe(pipeline.source_path(d), d)
    except Exception as e:
        raise HTTPException(404, str(e))
    ws = []
    for s in transcript:
        for w in s["words"]:
            t = clean_token(w["word"])
            if t and w["end"] > start and w["start"] < end:
                ws.append({"word": t, "start": w["start"], "end": w["end"]})
    return [{"start": round(c[0]["start"], 2), "end": round(c[-1]["end"], 2), "text": " ".join(w["word"] for w in c)}
            for c in _chunks(ws, 4)]


@app.get("/api/jobs/{job_id}/frame")
def get_frame(job_id: str, t: float = 0):
    """A still from the source video, used as the layout editor's canvas."""
    d = jobs.job_dir(job_id)
    if not d.exists():
        raise HTTPException(404)
    try:
        src = pipeline.source_path(d)
        out = pipeline.extract_frame(src, round(t, 1), d / "frames" / f"{round(t, 1)}.jpg")
    except Exception as e:
        raise HTTPException(500, str(e))
    return FileResponse(out, media_type="image/jpeg", headers={"Cache-Control": "max-age=3600"})


@app.get("/api/jobs/{job_id}/facex")
def get_face_x(job_id: str, start: float, end: float):
    d = jobs.job_dir(job_id)
    if not d.exists():
        raise HTTPException(404)
    x, y = pipeline.detect_face(pipeline.source_path(d), start, end)
    return {"x": x, "y": y}


class RenderPick(BaseModel):
    ids: list[str]


@app.post("/api/jobs/{job_id}/render")
def render_picked(job_id: str, body: RenderPick):
    job = jobs.read_job(job_id)
    if not job:
        raise HTTPException(404)
    if job.get("status") != "review":
        raise HTTPException(400, "This project is not waiting for a selection")
    try:
        jobs.render_selected(job_id, body.ids)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@app.get("/api/jobs/{job_id}/transcript")
def get_transcript(job_id: str):
    f = jobs.job_dir(job_id) / "transcript.json"
    if not f.exists():
        raise HTTPException(404)
    return FileResponse(f)


# ---- publishing
class YouTubePublish(BaseModel):
    title: str
    description: str = ""
    privacy: str = "private"  # private | unlisted | public
    hide_likes: bool = True
    account: str = "default"


@app.get("/api/publish/youtube/status")
def yt_status():
    return publish.youtube_status()


@app.post("/api/publish/youtube/connect")
def yt_connect():
    try:
        publish.connect_youtube()
    except Exception as e:
        raise HTTPException(400, str(e))
    return publish.youtube_status()


@app.post("/api/publish/youtube/disconnect")
def yt_disconnect():
    publish.disconnect_youtube()
    return publish.youtube_status()


class UploadAll(BaseModel):
    privacy: str = "private"
    hide_likes: bool = True
    account: str = "default"


@app.post("/api/jobs/{job_id}/publish/youtube-all")
def yt_publish_all(job_id: str, body: UploadAll):
    """Queue every finished clip of a project for browser upload; they upload one by one, best first."""
    import webupload
    job = jobs.read_job(job_id)
    if not job:
        raise HTTPException(404)
    if body.privacy not in ("private", "unlisted", "public"):
        raise HTTPException(400, "bad privacy value")
    if not webupload.status()["ready"]:
        raise HTTPException(400, "Browser upload needs Playwright and Chrome/Edge installed")
    items = []
    for c in sorted(job["clips"], key=lambda c: -c.get("score", 0)):
        y = (c.get("publish") or {}).get("youtube") or {}
        live = y.get("status") in ("uploading", "queued") and webupload.is_active(job_id, c["id"])
        if c.get("version", 0) < 1 or c.get("status") != "ready" or y.get("status") == "done" or live:
            continue  # (a "queued" mark left over from before a restart is not live, so it can be queued again)
        items.append((c["id"], c["title"][:100], jobs.clip_description(c)))
    if not items:
        raise HTTPException(400, "Nothing to upload: every finished clip is already uploaded or queued")
    return {"queued": webupload.start_many(job_id, items, body.privacy, body.hide_likes, account=body.account)}


class DescGen(BaseModel):
    title: str = ""
    previous: str = ""


@app.post("/api/jobs/{job_id}/clips/{clip_id}/description")
def gen_desc(job_id: str, clip_id: str, body: DescGen):
    job = jobs.read_job(job_id)
    clip = next((c for c in (job or {}).get("clips", []) if c["id"] == clip_id), None)
    if not clip:
        raise HTTPException(404)
    text = ""
    f = jobs.job_dir(job_id) / "transcript.json"
    if f.exists():
        import json as _j
        segs = _j.loads(f.read_text(encoding="utf8"))
        segs = segs.get("segments", segs) if isinstance(segs, dict) else segs
        pr = clip.get("params") or {}
        s, e = pr.get("start", 0), pr.get("end", 0)
        text = " ".join(x["text"] for x in segs if x["end"] > s and x["start"] < e)
    try:
        d = pipeline.gen_description(body.title or clip["title"], text, body.previous,
                                     context={"title": job.get("title", ""), "channel": job.get("channel", ""), "description": job.get("video_description", ""), "brief": job.get("brief", "")})
    except Exception as ex:
        raise HTTPException(502, f"AI could not write a description: {str(ex)[:200]}")
    if "#shorts" not in d.lower():
        d += " #Shorts"
    return {"description": d}


@app.get("/api/auto/status")
def auto_status():
    import webupload
    paused = []
    for a in webupload.accounts():
        st = webupload.auto_state(a["id"])
        if st.get("paused"):
            paused.append({**st, "account": a["id"], "name": a["name"], "shot_url": ("/incidents/" + st["shot"]) if st.get("shot") else None})
    return {"paused": bool(paused), "stops": paused, "incidents": webupload.incidents(10)}


@app.post("/api/uploads/stop-all")
def uploads_stop_all():
    import webupload
    return {"stopped": webupload.stop_all()}


@app.post("/api/auto/resume")
def auto_resume(account: str | None = None):
    import webupload
    webupload.auto_resume(account)
    return {"ok": True}


class AccountIn(BaseModel):
    name: str
    handle: str = ""


@app.get("/api/accounts")
def get_accounts():
    import webupload
    return [{**a, "open": webupload._port_open(a["port"]), "pinned": bool(a.get("channel_id"))} for a in webupload.accounts()]


@app.post("/api/accounts")
def post_account(body: AccountIn):
    import webupload
    if not body.name.strip():
        raise HTTPException(400, "Give the channel a name")
    return webupload.add_account(body.name, body.handle)


@app.put("/api/accounts/{aid}")
def put_account(aid: str, body: AccountIn):
    import webupload
    f = {"name": body.name.strip()[:40] or "Channel"}
    if body.handle.strip():
        f["handle"] = body.handle.strip()
        f["channel_id"] = webupload.resolve_handle(body.handle) or ""
    a = webupload.update_account(aid, **f)
    if not a:
        raise HTTPException(404)
    return a


@app.delete("/api/accounts/{aid}")
def del_account(aid: str):
    import webupload
    if not webupload.delete_account(aid):
        raise HTTPException(400, "The main channel can't be removed")
    return {"ok": True}


@app.post("/api/accounts/{aid}/signin")
def signin_account(aid: str):
    """Open that channel's own Chrome window (Studio) so you can sign in to the right Google account."""
    import webupload
    acc = webupload.get_account(aid)
    if not webupload.status()["ready"]:
        raise HTTPException(400, "Chrome/Edge or Playwright is missing")
    webupload._ensure_browser(acc)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/clips/{clip_id}/publish/cancel")
def yt_publish_cancel_one(job_id: str, clip_id: str):
    import webupload
    if not jobs.read_job(job_id):
        raise HTTPException(404)
    return {"cancelled": webupload.cancel_queued(job_id, clip_id)}


@app.post("/api/jobs/{job_id}/publish/cancel")
def yt_publish_cancel(job_id: str):
    import webupload
    if not jobs.read_job(job_id):
        raise HTTPException(404)
    return {"cancelled": webupload.cancel_queued(job_id)}


@app.get("/api/publish/web/status")
def web_status():
    import webupload
    return webupload.status()


@app.post("/api/jobs/{job_id}/clips/{clip_id}/publish/youtube-web")
def yt_publish_web(job_id: str, clip_id: str, body: YouTubePublish):
    import webupload
    job = jobs.read_job(job_id)
    clip = next((c for c in (job or {}).get("clips", []) if c["id"] == clip_id), None)
    if not clip:
        raise HTTPException(404)
    if clip.get("version", 0) < 1 or clip.get("status") == "rendering":
        raise HTTPException(400, "Wait for the clip to finish rendering")
    if not webupload.status()["ready"]:
        raise HTTPException(400, "Browser upload needs Playwright and Chrome/Edge installed")
    if body.privacy not in ("private", "unlisted", "public"):
        raise HTTPException(400, "bad privacy value")
    webupload.start(job_id, clip_id, body.title, body.description, body.privacy, body.hide_likes, body.account)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/clips/{clip_id}/publish/youtube")
def yt_publish(job_id: str, clip_id: str, body: YouTubePublish):
    job = jobs.read_job(job_id)
    clip = next((c for c in (job or {}).get("clips", []) if c["id"] == clip_id), None)
    if not clip:
        raise HTTPException(404)
    if clip["status"] != "ready":
        raise HTTPException(400, "Clip is not rendered yet")
    if not publish.youtube_status()["connected"]:
        raise HTTPException(400, "YouTube is not connected")
    if body.privacy not in ("private", "unlisted", "public"):
        raise HTTPException(400, "bad privacy value")
    publish.start_youtube_upload(job_id, clip_id, body.title, body.description, body.privacy)
    return {"ok": True}


# ---- creators
@app.get("/api/creators/search")
def creators_search(q: str):
    if len(q.strip()) < 2:
        return []
    try:
        res = creators.search(q)
    except Exception as e:
        raise HTTPException(502, f"Search failed: {str(e)[:120]}")
    following = {c["channel_id"] for c in creators.list_creators()}
    return [{**r, "following": r["channel_id"] in following} for r in res]


@app.get("/api/creators/defaults")
def creators_defaults():
    return creators.defaults()


@app.put("/api/creators/defaults")
def creators_defaults_save(body: dict):
    if body.get("auto_privacy", "public") not in ("private", "unlisted", "public"):
        raise HTTPException(400, "bad privacy value")
    return creators.save_defaults(body)


class FollowIn(BaseModel):
    channel_id: str
    name: str


@app.post("/api/creators/follow")
def creators_follow(body: FollowIn):
    import webupload
    if creators.defaults().get("auto") and not webupload.status()["ready"]:
        raise HTTPException(400, "Full auto needs browser upload (Playwright + Chrome/Edge). Turn it off in the defaults to follow anyway.")
    try:
        return creators.follow(body.channel_id, body.name)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.put("/api/creators/{channel_id}/settings")
def creator_settings(channel_id: str, body: dict):
    if not creators.get_creator(channel_id):
        raise HTTPException(404)
    if body.get("auto_privacy", "public") not in ("private", "unlisted", "public"):
        raise HTTPException(400, "bad privacy value")
    creators.update_options(channel_id, body)
    return creators.get_creator(channel_id)


@app.get("/api/creators")
def get_creators():
    return creators.list_creators()


@app.post("/api/creators")
def post_creator(body: CreatorIn):
    try:
        return creators.add_creator(body.url, body.model_dump())
    except Exception as e:
        raise HTTPException(400, str(e))


class CreatorUpload(BaseModel):
    auto: bool = True
    account: str = "default"
    auto_privacy: str = "public"
    hide_likes: bool = True


@app.put("/api/creators/{channel_id}/upload")
def creator_upload(channel_id: str, body: CreatorUpload):
    import webupload
    if body.auto_privacy not in ("private", "unlisted", "public"):
        raise HTTPException(400, "bad privacy value")
    if body.auto and not webupload.status()["ready"]:
        raise HTTPException(400, "Full auto needs browser upload (Playwright + Chrome/Edge)")
    creators.update_upload(channel_id, body.model_dump())
    return {"ok": True}


def _vid(url: str | None) -> str | None:
    import re
    m = re.search(r"(?:v=|youtu\.be/|shorts/)([\w-]{11})", url or "")
    return m.group(1) if m else None


def _creator_jobs(c: dict) -> list:
    return [j for j in jobs.list_jobs() if j.get("creator_id") == c["channel_id"] or (j.get("channel") and j.get("channel") == c["name"])]


@app.get("/api/creators/{channel_id}/detail")
def creator_detail(channel_id: str):
    c = creators.get_creator(channel_id)
    if not c:
        raise HTTPException(404)
    rows = []
    for j in _creator_jobs(c):
        ups = [((cl.get("publish") or {}).get("youtube") or {}).get("status") for cl in j["clips"]]
        rows.append({"id": j["id"], "title": j.get("title"), "status": j["status"], "clips": len(j["clips"]), "uploaded": ups.count("done"),
                     "created": j["created"], "video_id": _vid(j.get("url"))})
    return {"name": c["name"], "options": c["options"], "clipped": rows}


@app.get("/api/creators/{channel_id}/videos")
def creator_videos(channel_id: str, offset: int = 0, limit: int = 5):
    c = creators.get_creator(channel_id)
    if not c:
        raise HTTPException(404)
    try:
        vids = creators.recent_videos(channel_id, max(0, offset), min(max(1, limit), 20))
    except Exception as e:
        raise HTTPException(502, f"Couldn't load this channel's videos: {str(e)[:120]}")
    have = {_vid(j.get("url")): j["id"] for j in _creator_jobs(c) if _vid(j.get("url"))}
    return {"videos": [{**v, "job": have.get(v["id"])} for v in vids], "has_more": len(vids) >= limit}


class ClipVideo(BaseModel):
    video_id: str
    title: str = ""


@app.post("/api/creators/{channel_id}/clip")
def creator_clip(channel_id: str, body: ClipVideo):
    """Clip one of the creator's (older) videos with that creator's settings (full auto if it is set to full auto)."""
    import webupload
    c = creators.get_creator(channel_id)
    if not c:
        raise HTTPException(404)
    if c["options"].get("auto") and not webupload.status()["ready"]:
        raise HTTPException(400, "Full auto needs browser upload (Playwright + Chrome/Edge)")
    job = jobs.create_job(url=f"https://www.youtube.com/watch?v={body.video_id}", upload=None,
                          opts={**c["options"], "title": body.title or body.video_id, "creator_id": channel_id})
    return {"job": job["id"]}


@app.delete("/api/creators/{channel_id}")
def del_creator(channel_id: str):
    creators.remove_creator(channel_id)
    return {"ok": True}


@app.post("/api/creators/{channel_id}/enabled")
def toggle_creator(channel_id: str, enabled: bool):
    creators.set_enabled(channel_id, enabled)
    return {"ok": True}


@app.post("/api/creators/check")
def check_now():
    return {"queued": creators.check_all()}


# ---- media + UI
(config.DATA / "incidents").mkdir(parents=True, exist_ok=True)
app.mount("/incidents", StaticFiles(directory=config.DATA / "incidents"), name="incidents")
app.mount("/media", StaticFiles(directory=config.JOBS_DIR), name="media")
app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")
