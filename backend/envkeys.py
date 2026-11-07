"""Add / remove AI API keys from the web page: writes them to .env and applies them to the running app (no restart)."""
import os
import re

import config
import keystate

# provider id -> (env var base, label, where to get a key, free?)
PROVIDERS = {
    "gemini": ("GEMINI_API_KEY", "Gemini", "https://aistudio.google.com/apikey", True),
    "groq": ("GROQ_API_KEY", "Groq", "https://console.groq.com/keys", True),
    "cerebras": ("CEREBRAS_API_KEY", "Cerebras", "https://cloud.cerebras.ai", True),
    "openrouter": ("OPENROUTER_API_KEY", "OpenRouter", "https://openrouter.ai/keys", True),
    "mistral": ("MISTRAL_API_KEY", "Mistral", "https://console.mistral.ai", True),
    "xai": ("XAI_API_KEY", "Grok (xAI)", "https://console.x.ai", False),
    "openai": ("OPENAI_API_KEY", "OpenAI", "https://platform.openai.com/api-keys", False),
}
ENV = config.ROOT / ".env"


def _split(v: str) -> list:
    return [x.strip() for x in re.split(r"[,\s]+", v or "") if x.strip()]


def _names(base: str) -> list:
    return [base, base + "S"] + [f"{base}_{i}" for i in range(2, 10)]


def current(provider: str) -> list:
    base = PROVIDERS[provider][0]
    out = []
    for n in _names(base):
        for k in _split(os.getenv(n, "")):
            if k not in out:
                out.append(k)
    return out


def _save(provider: str, keys: list):
    """Put every key of this provider on ONE `<BASE>S=` line in .env (other spellings of it are emptied) and apply live."""
    base = PROVIDERS[provider][0]
    text = ENV.read_text("utf-8") if ENV.exists() else ""
    lines = text.split("\n")
    plural = base + "S"
    out, done = [], False
    for ln in lines:
        m = re.match(r"\s*([A-Z0-9_]+)\s*=", ln)
        name = m.group(1) if m and not ln.lstrip().startswith("#") else None
        if name in _names(base):
            if name == plural and not done:
                out.append(f"{plural}={','.join(keys)}")
                done = True
            # every other spelling of this provider's key var is dropped (its keys are merged into the plural line)
            continue
        out.append(ln)
    if not done:
        while out and out[-1] == "":
            out.pop()
        out += [f"{plural}={','.join(keys)}", ""]
    tmp = ENV.with_suffix(".tmp")
    tmp.write_text("\n".join(out), "utf-8")
    tmp.replace(ENV)
    for n in _names(base):
        os.environ.pop(n, None)
    os.environ[plural] = ",".join(keys)
    if provider == "gemini":  # config.GEMINI_KEYS is a list other modules already hold: update it in place
        config.GEMINI_KEYS[:] = keys


def add(provider: str, raw: str) -> dict:
    keys = current(provider)
    added, dup = [], 0
    for k in _split(raw):
        if k in keys:
            dup += 1
        else:
            keys.append(k)
            added.append(k)
    if added:
        _save(provider, keys)
    return {"added": added, "duplicates": dup}


def remove(provider: str, key_mask: str) -> bool:
    keys = current(provider)
    new = [k for k in keys if keystate.mask(k) != key_mask]
    if len(new) == len(keys):
        return False
    _save(provider, new)
    return True


def probe(provider: str, key: str):
    """True = key accepted, False = rejected, None = couldn't tell (network). Lists models: uses no quota."""
    import httpx
    import llm
    try:
        if provider == "gemini":
            r = httpx.get("https://generativelanguage.googleapis.com/v1beta/models", params={"key": key, "pageSize": 1}, timeout=15)
        else:
            r = httpx.get(llm.KNOWN[provider][1].rstrip("/") + "/models", headers={"Authorization": f"Bearer {key}"}, timeout=15)
        return not (r.status_code in (400, 401, 403))
    except Exception:
        return None
