"""A small log of every request the app sends to an AI service, so you can see how much quota you are using.
Stored in data/ai_usage.json (newest last, trimmed to 20,000 entries). Counts requests that were actually sent,
including ones that failed (a failed request can still use up quota). Tokens are filled in when the service reports them."""
import json
import os
import threading
import time
from datetime import datetime, timedelta

import config

FILE = config.DATA / "ai_usage.json"
_lock = threading.Lock()
_ctx = threading.local()
LABELS = {"ClipPick": "Choosing clips", "ClipRating": "Rating clips", "VideoBrief": "Video brief", "DescOut": "YouTube descriptions",
          "Moment": "Stock cutaways: picking moments", "MomentS": "Stock cutaways: picking moments", "MomentJ": "Stock cutaways: picking moments",
          "Choice": "Stock cutaways: extra check", "ScriptScene": "Explainer script"}


def set_purpose(schema) -> None:
    """Remember what the current AI question is for (taken from the answer's schema name)."""
    inner = (getattr(schema, "__args__", None) or [schema])[0]
    _ctx.purpose = LABELS.get(getattr(inner, "__name__", ""), "Other")


def record(provider: str, model: str, ok: bool, chars: int = 0, tokens: int = 0) -> None:
    row = {"t": int(time.time()), "provider": provider, "model": model or "", "ok": bool(ok), "chars": int(chars), "tokens": int(tokens or 0),
           "what": getattr(_ctx, "purpose", "Other")}
    try:
        with _lock:
            try:
                rows = json.loads(FILE.read_text("utf-8"))
            except Exception:
                rows = []
            rows.append(row)
            rows = rows[-20000:]
            FILE.parent.mkdir(parents=True, exist_ok=True)
            tmp = FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps(rows), "utf-8")
            os.replace(tmp, FILE)
    except Exception:
        pass  # never let the usage log break a real job


def summary() -> dict:
    try:
        rows = json.loads(FILE.read_text("utf-8"))
    except Exception:
        rows = []
    midnight = int(datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
    week = int((datetime.now() - timedelta(days=7)).timestamp())

    def block(rs):
        by_what, by_prov = {}, {}
        for r in rs:
            by_what[r["what"]] = by_what.get(r["what"], 0) + 1
            k = r["provider"] + (" · " + r["model"] if r["model"] else "")
            by_prov[k] = by_prov.get(k, 0) + 1
        return {"requests": len(rs), "failed": sum(1 for r in rs if not r["ok"]), "tokens": sum(r.get("tokens", 0) for r in rs),
                "by_what": sorted(by_what.items(), key=lambda x: -x[1]), "by_provider": sorted(by_prov.items(), key=lambda x: -x[1])}
    return {"today": block([r for r in rows if r["t"] >= midnight]), "week": block([r for r in rows if r["t"] >= week]), "total": len(rows)}
