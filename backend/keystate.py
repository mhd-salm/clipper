"""Remembers which AI keys are rate limited (or invalid) so we skip them instead of re-testing every key on every call."""
import threading
import time

_lock = threading.Lock()
_st: dict = {}  # (provider, key) -> {"until": ts, "reason": str, "uses": int, "ok": ts}


def mask(key: str) -> str:
    return (key[:4] + "…" + key[-4:]) if len(key) > 10 else "…"


def _get(provider: str, key: str) -> dict:
    return _st.setdefault((provider, key), {"until": 0.0, "reason": "", "uses": 0, "ok": 0.0})


def remaining(provider: str, key: str) -> int:
    """Seconds until this key may be used again (0 = usable now)."""
    with _lock:
        return max(0, int(_get(provider, key)["until"] - time.time()))


def mark_limited(provider: str, key: str, seconds: int, reason: str):
    with _lock:
        s = _get(provider, key)
        s["until"], s["reason"] = time.time() + seconds, reason


def mark_ok(provider: str, key: str):
    with _lock:
        s = _get(provider, key)
        s["until"], s["reason"], s["ok"] = 0.0, "", time.time()
        s["uses"] += 1


def clear(provider: str, key: str):
    """Forget any limit / invalid mark on one key (it just tested fine)."""
    with _lock:
        s = _get(provider, key)
        s["until"], s["reason"] = 0.0, ""


def quota_seconds(err: str) -> int:
    """How long to leave a key alone after a rate-limit error: a minute for per-minute limits, longer for daily ones."""
    e = err.lower()
    if "perday" in e or "per day" in e or "daily" in e:
        return 3600
    return 120


def usable(provider: str, keys: list) -> list:
    """Keys to try now: ready ones first (in the given order), then limited ones that recover soonest.
    Limited keys are only returned when no key is ready, so a sleeping key never costs a wasted request."""
    ready = [k for k in keys if remaining(provider, k) == 0]
    if ready:
        return ready
    return sorted(keys, key=lambda k: remaining(provider, k))[:1]


def reset(provider: str | None = None):
    with _lock:
        for (p, _k), s in _st.items():
            if provider is None or p == provider:
                s["until"], s["reason"] = 0.0, ""


def snapshot(provider: str, keys: list) -> list:
    out = []
    for k in keys:
        rem = remaining(provider, k)
        with _lock:
            s = dict(_get(provider, k))
        out.append({"key": mask(k), "state": "bad" if rem and s["reason"] == "invalid key" else "limited" if rem else "ready",
                    "retry_in": rem, "reason": s["reason"], "uses": s["uses"]})
    return out
