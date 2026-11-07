"""Checks AI keys: invalid? rate limited? Records the result in keystate so the app skips bad keys."""
import re
from concurrent.futures import ThreadPoolExecutor

import httpx

import config
import keystate
import llm

GEMINI = "https://generativelanguage.googleapis.com/v1beta"


def _retry_seconds(text: str) -> int:
    m = re.search(r"retry in ([\d.]+)s", text, re.I) or re.search(r"retryDelay\W+(\d+)s", text)
    if m:
        return max(30, min(3600, int(float(m.group(1))) + 5))
    return keystate.quota_seconds(text)


def test(provider: str, key: str, models: list | None = None, bases: dict | None = None) -> tuple:
    """-> (state, seconds, detail). state: ok | invalid | limited | unknown.
    Step 1 lists the models (free, no quota). Step 2 sends a 1-token request to see whether the key is rate limited."""
    try:
        if provider == "gemini":
            r = httpx.get(f"{GEMINI}/models", params={"key": key, "pageSize": 1}, timeout=15)
        else:
            r = httpx.get(bases[provider].rstrip("/") + "/models", headers={"Authorization": f"Bearer {key}"}, timeout=15)
        if r.status_code in (400, 401, 403):
            return "invalid", 3600, "key rejected"
        if r.status_code >= 500 or r.status_code == 429 and provider != "gemini":
            return ("limited", 120, "rate limited") if r.status_code == 429 else ("unknown", 0, f"HTTP {r.status_code}")
        limited = None
        for model in (models or [])[:2]:  # a key counts as limited only when its first models all say 429
            if provider == "gemini":
                g = httpx.post(f"{GEMINI}/models/{model}:generateContent", params={"key": key}, timeout=25,
                               json={"contents": [{"parts": [{"text": "hi"}]}], "generationConfig": {"maxOutputTokens": 1}})
            else:
                g = httpx.post(bases[provider].rstrip("/") + "/chat/completions", headers={"Authorization": f"Bearer {key}"}, timeout=25,
                               json={"model": model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1})
            if g.status_code in (401, 403) or (g.status_code == 400 and "api key" in g.text.lower()):
                return "invalid", 3600, "key rejected"
            if g.status_code == 429:
                limited = ("limited", _retry_seconds(g.text), "rate limited")
                continue
            return "ok", 0, ""  # any other answer (success, unknown model...) proves the key itself works and has quota
        return limited or ("ok", 0, "")
    except Exception as e:
        return "unknown", 0, str(e)[:80]


def apply(provider: str, key: str, res: tuple):
    state, secs, detail = res
    if state == "invalid":
        keystate.mark_limited(provider, key, 3600, "invalid key")
    elif state == "limited":
        keystate.mark_limited(provider, key, secs, "rate limited")
    elif state == "ok":
        keystate.clear(provider, key)


def check_all(rows: list | None = None) -> None:
    """Test every configured key (in parallel) and record the result. rows = [(provider, label, [keys])]."""
    provs = {p.name: p for p in llm.providers()}
    if rows is None:
        rows = ([("gemini", "Gemini", list(config.GEMINI_KEYS))] if config.GEMINI_KEYS else []) + [(p.name, p.label, list(p.keys)) for p in provs.values()]
    bases = {n: p.base for n, p in provs.items()}
    jobs = [(n, k) for n, _l, ks in rows for k in ks]

    def one(a):
        n, k = a
        models = list(config.GEMINI_MODELS) if n == "gemini" else (provs[n].models if n in provs else [])
        apply(n, k, test(n, k, models, bases))

    with ThreadPoolExecutor(8) as ex:
        list(ex.map(one, jobs))
