import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATA = ROOT / "data"
JOBS_DIR = DATA / "jobs"
LAYOUTS_DIR = DATA / "layouts"
CREATORS_FILE = DATA / "creators.json"

for d in (DATA, JOBS_DIR, LAYOUTS_DIR):
    d.mkdir(parents=True, exist_ok=True)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# Optional second key (ideally from a different Google project: it has its own free quota). Used first for
# the clip-rating step and as a backup when the main key runs out of quota.
GEMINI_API_KEY_2 = os.getenv("GEMINI_API_KEY_2", "")
# Every Gemini key you have: GEMINI_API_KEY, GEMINI_API_KEY_2 ... _9, or several comma-separated in GEMINI_API_KEY.
GEMINI_KEYS = []
for _k in [os.getenv("GEMINI_API_KEY", ""), os.getenv("GEMINI_API_KEYS", "")] + [os.getenv(f"GEMINI_API_KEY_{i}", "") for i in range(2, 10)]:
    for _v in _k.replace("\n", ",").split(","):
        if _v.strip() and _v.strip() not in GEMINI_KEYS:
            GEMINI_KEYS.append(_v.strip())
GEMINI_MODELS_RAW = os.getenv("GEMINI_MODEL", "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash,gemini-3.6-flash,gemini-3.7-flash,gemini-3.8-flash,gemini-flash-latest")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
# Use YouTube's own captions when available (seconds instead of many minutes); Whisper is the fallback
USE_YT_CAPTIONS = os.getenv("USE_YT_CAPTIONS", "1").lower() not in ("0", "false", "no", "off")
# Optional, OFF by default: let yt-dlp use your logged-in browser (chrome/edge/firefox) when YouTube
# shows "confirm you're not a bot". Only enable it if you are comfortable with that.
YTDLP_COOKIES_BROWSER = os.getenv("YTDLP_COOKIES_BROWSER", "").strip()
WATCH_INTERVAL_MINUTES = int(os.getenv("WATCH_INTERVAL_MINUTES", "15"))
# Free disk space: delete an uploaded clip (and the downloaded source video once the whole project is uploaded) this many hours after the upload. 0 = never delete.
AUTO_DELETE_HOURS = float(os.getenv("AUTO_DELETE_HOURS", "24"))

RESOLUTIONS = {"720p": (720, 1280), "1080p": (1080, 1920)}
GEMINI_MODELS = [m.strip() for m in GEMINI_MODELS_RAW.split(",") if m.strip()]
JOB_WORKERS = max(1, int(os.getenv("JOB_WORKERS", "3")))  # videos downloaded / analysed by the AI at the same time
RENDER_WORKERS = max(1, int(os.getenv("RENDER_WORKERS", "1")))  # clips rendered at the same time (ffmpeg already uses every core, so 1 is fastest)
