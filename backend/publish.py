"""Publishing. YouTube first (Data API v3, resumable upload).

Setup (one time): put your Google OAuth "Desktop app" client file at
data/client_secret.json, then click "Connect YouTube" in the app.
"""
import json
from pathlib import Path

import config
import jobs

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
CLIENT_SECRET = config.DATA / "client_secret.json"
TOKEN = config.DATA / "youtube_token.json"


def youtube_status() -> dict:
    return {"client_secret": CLIENT_SECRET.exists(), "connected": _creds() is not None}


def _creds():
    if not TOKEN.exists():
        return None
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPES)
    if creds.valid:
        return creds
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            TOKEN.write_text(creds.to_json(), "utf-8")
            return creds
        except Exception:
            TOKEN.unlink(missing_ok=True)  # revoked / expired (7-day limit in Google "testing" mode)
    return None


def connect_youtube():
    """Opens the Google sign-in page in the user's browser and blocks until done."""
    if not CLIENT_SECRET.exists():
        raise RuntimeError(f"Missing {CLIENT_SECRET}. See the setup steps for Google credentials.")
    from google_auth_oauthlib.flow import InstalledAppFlow

    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent", timeout_seconds=300)
    TOKEN.write_text(creds.to_json(), "utf-8")


def disconnect_youtube():
    TOKEN.unlink(missing_ok=True)


def _set_publish(job_id: str, clip_id: str, platform: str, **state):
    with jobs._lock:  # read-modify-write as one step (renders and uploads write the same file)
        job = jobs.read_job(job_id)
        if job is None:  # project was deleted meanwhile
            return
        for c in job["clips"]:
            if c["id"] == clip_id:
                c.setdefault("publish", {})[platform] = state
        jobs.write_job(job)


def upload_youtube(job_id: str, clip_id: str, title: str, description: str, privacy: str):
    """Runs in the background. State is stored on the clip as clip['publish']['youtube']."""
    try:
        creds = _creds()
        if not creds:
            raise RuntimeError("YouTube is not connected. Click 'Connect YouTube' first.")
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload

        path = jobs.job_dir(job_id) / "clips" / f"{clip_id}.mp4"
        if not path.exists():
            raise RuntimeError("Clip file not found. Render it first.")
        title = (title or "Clip").strip()[:100]
        if "#shorts" not in (title + description).lower():
            description = (description + "\n\n#Shorts").strip()
        body = {
            "snippet": {"title": title, "description": description[:4900], "categoryId": "24"},
            "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False},
        }
        yt = build("youtube", "v3", credentials=creds, cache_discovery=False)
        req = yt.videos().insert(part="snippet,status", body=body,
                                 media_body=MediaFileUpload(str(path), chunksize=8 * 1024 * 1024, resumable=True))
        resp = None
        while resp is None:
            status, resp = req.next_chunk()
            if status:
                _set_publish(job_id, clip_id, "youtube", status="uploading", progress=int(status.progress() * 100))
        vid = resp["id"]
        _set_publish(job_id, clip_id, "youtube", status="done", url=f"https://youtube.com/shorts/{vid}",
                     video_id=vid, privacy=resp.get("status", {}).get("privacyStatus", privacy))
    except Exception as e:
        msg = str(e)
        if "quotaExceeded" in msg:
            msg = "YouTube daily upload quota reached (about 6 uploads/day). Try again tomorrow."
        _set_publish(job_id, clip_id, "youtube", status="error", error=msg[:500])


def start_youtube_upload(job_id: str, clip_id: str, title: str, description: str, privacy: str):
    _set_publish(job_id, clip_id, "youtube", status="uploading", progress=0)
    jobs._pool.submit(upload_youtube, job_id, clip_id, title, description, privacy)
