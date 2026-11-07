"""Extra AI providers (everything that speaks the OpenAI chat-completions API): Groq, Grok/xAI, Cerebras,
OpenRouter, Mistral, OpenAI, or any custom endpoint. Used as fallbacks when Gemini's quota is used up.

A provider is enabled simply by putting its API key in .env. See .env.example."""
import json
import os
import re
from dataclasses import dataclass

import httpx

# name -> (env key, base url, default models comma list, env var to override models)
KNOWN = {
    "groq": ("GROQ_API_KEY", "https://api.groq.com/openai/v1", "openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b"),
    "cerebras": ("CEREBRAS_API_KEY", "https://api.cerebras.ai/v1", "llama-3.3-70b,gpt-oss-120b"),
    "xai": ("XAI_API_KEY", "https://api.x.ai/v1", "grok-4-fast,grok-3-mini"),
    "openrouter": ("OPENROUTER_API_KEY", "https://openrouter.ai/api/v1", "openrouter/free,meta-llama/llama-3.3-70b-instruct:free"),
    "mistral": ("MISTRAL_API_KEY", "https://api.mistral.ai/v1", "mistral-small-latest"),
    "openai": ("OPENAI_API_KEY", "https://api.openai.com/v1", "gpt-4o-mini"),
}
LABELS = {"xai": "Grok"}


@dataclass
class Provider:
    name: str
    keys: list
    base: str
    models: list

    @property
    def label(self) -> str:
        return LABELS.get(self.name, self.name.capitalize())


def _split(v: str) -> list:
    return [x.strip() for x in re.split(r"[,\n]", v or "") if x.strip()]


def providers() -> list:
    """Enabled providers, in priority order. A key var may hold several keys separated by commas."""
    out = {}
    for name, (env, base, models) in KNOWN.items():
        keys = []  # KEY, KEYS, KEY_2 ... KEY_9, each may hold several comma-separated keys: all are used, in this order
        for var in [env, env + "S"] + [f"{env}_{i}" for i in range(2, 10)]:
            for k in _split(os.getenv(var, "")):
                if k not in keys:
                    keys.append(k)
        if keys:
            out[name] = Provider(name, keys, os.getenv(f"{name.upper()}_BASE_URL", base).rstrip("/"),
                                 _split(os.getenv(f"{name.upper()}_MODEL", models)))
    # CUSTOM_LLM_1=name|base_url|api_key|model1,model2   (any OpenAI-compatible service)
    for i in range(1, 10):
        raw = os.getenv(f"CUSTOM_LLM_{i}", "").strip()
        parts = [p.strip() for p in raw.split("|")]
        if len(parts) == 4 and all(parts):
            out[parts[0].lower()] = Provider(parts[0].lower(), [parts[2]], parts[1].rstrip("/"), _split(parts[3]))
    order = _split(os.getenv("LLM_ORDER", ""))
    names = [n for n in order if n in out] + [n for n in out if n not in order]
    return [out[n] for n in names]


def _extract_json(text: str):
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    try:
        return json.loads(text)
    except ValueError:
        m = re.search(r"(\[.*\]|\{.*\})", text, re.S)
        if not m:
            raise
        return json.loads(m.group(1))


def ask(p: Provider, prompt: str, schema, log) -> list:
    """Ask one OpenAI-compatible provider for a JSON list matching `schema` (e.g. list[ClipPick]).
    Tries each key and model; raises if nothing worked."""
    from pydantic import TypeAdapter
    ta = TypeAdapter(schema)
    spec = json.dumps(ta.json_schema().get("$defs") or ta.json_schema(), indent=1)[:3000]
    full = (prompt + "\n\nReply with ONLY valid JSON of the form {\"items\": [ ... ]} where every item matches this "
            f"schema (no markdown, no commentary):\n{spec}")
    import keystate
    last = "no models"
    for key in keystate.usable(p.name, p.keys):  # keys known to be rate limited are skipped
        quota_n = tried = 0
        for model in p.models:
            try:
                tried += 1
                log(f"Trying {p.label} / {model}...")
                r = httpx.post(f"{p.base}/chat/completions", timeout=180,
                               headers={"Authorization": f"Bearer {key}"},
                               json={"model": model, "temperature": 0.4,
                                     "messages": [{"role": "user", "content": full}],
                                     "response_format": {"type": "json_object"}})
                if r.status_code == 400:  # some models reject JSON mode: ask again as plain text (we parse the JSON ourselves)
                    log(f"{p.label} / {model}: 400 ({r.text[:100]}), retrying without JSON mode", "warn")
                    r = httpx.post(f"{p.base}/chat/completions", timeout=180, headers={"Authorization": f"Bearer {key}"},
                                   json={"model": model, "temperature": 0.4, "messages": [{"role": "user", "content": full}]})
                if r.status_code >= 400:
                    last = f"HTTP {r.status_code}: {r.text[:120]}"
                    quota_n += 1 if r.status_code == 429 else 0
                    log(f"{p.label} / {model}: {_why(r.status_code)} - trying next", "warn")
                    if r.status_code in (401, 403):
                        keystate.mark_limited(p.name, key, 3600, "invalid key")
                        break  # this key is wrong/disabled: skip its other models
                    continue
                data = _extract_json(r.json()["choices"][0]["message"]["content"])
                items = data.get("items") if isinstance(data, dict) else data
                if items is None and isinstance(data, dict):
                    items = next((v for v in data.values() if isinstance(v, list)), None)
                out = [m.model_dump() for m in ta.validate_python(items)]
                log(f"{p.label} / {model} answered", "ok")
                keystate.mark_ok(p.name, key)
                return out
            except Exception as e:  # timeouts, bad JSON, schema mismatch: move on
                last = str(e)[:140]
                log(f"{p.label} / {model}: failed ({last[:60]}) - trying next", "warn")
        if tried and quota_n == tried:  # every model said "rate limited" for this key
            keystate.mark_limited(p.name, key, keystate.quota_seconds(last), "rate limited")
    raise RuntimeError(f"{p.label} failed: {last}")


def _why(code: int) -> str:
    return {401: "bad API key", 403: "access denied", 404: "model not found", 413: "request too large for the free tier",
            429: "rate/quota limit reached"}.get(code, f"error {code}")
