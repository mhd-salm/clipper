"""Keeping viewers watching. Small, separate switches (all on by default, set per preset under "retention"):

  trim_start   open on the hook: drop filler openers ("so", "um", "you know") and dead air at the very start of a clip
  trim_end     end right after the payoff: drop a closing "thank you / see you" line and trailing filler
  hook_rules   write the on-screen hook text with stricter rules (short, curiosity gap, specific, never gives the answer away)
  hook_weight  rank clips with the hook counting for more, and nudge tight clips up and overlong ones down
  punch        a slight zoom that toggles in and out at sentence starts, so the picture changes every few seconds

None of these needs an extra AI request: they are code, or extra rules inside requests that were already being made.
Clips that were made before this existed keep their look: a clip only gets the render-time switch (punch) if its own settings say so."""
import re

DEFAULT = {"trim_start": True, "trim_end": True, "hook_rules": True, "hook_weight": True, "punch": True}
KEYS = tuple(DEFAULT)


def clean(r) -> dict:
    """Every switch is on unless it was explicitly turned off."""
    r = r if isinstance(r, dict) else {}
    return {k: bool(r.get(k, DEFAULT[k])) for k in KEYS}


def _norm(word: str) -> str:
    return re.sub(r"[^a-z0-9']+", "", (word or "").lower())


def _ends_sentence(word: str) -> bool:
    return (word or "").rstrip().rstrip("\"')]")[-1:] in (".", "?", "!")


# ------------------------------------------------------------------ open on the hook / end on the payoff
OPEN_FILL = {"so", "um", "uh", "uhm", "er", "erm", "ah", "hmm", "well", "okay", "ok", "yeah", "anyway"}
OPEN_PAIRS = {("you", "know"), ("i", "mean")}
END_FILL = {"um", "uh", "uhm", "er", "erm", "ah", "hmm", "so", "and", "but"}
OUTRO = re.compile(r"^(thank you|thanks|thank u|see you|see ya|bye|cheers|peace|subscribe|like and subscribe|good night|goodnight)\b")


def tighten(words: list[dict], start: float, end: float, r=None, min_len: float = 20) -> tuple[float, float]:
    """A clip's (start, end) after trimming filler openers / dead air at the start and an outro line / trailing filler at the end.
    Only ever shortens the clip, never by more than 40%, and never below 8 seconds; otherwise the original times come back."""
    r = clean(r)
    if not (r["trim_start"] or r["trim_end"]):
        return start, end
    ws = [w for w in words if w["start"] >= start - 0.3 and w["end"] <= end + 0.35 and _norm(w["word"])]
    if len(ws) < 10:
        return start, end
    i, j = 0, len(ws)
    new_s, new_e = start, end
    if r["trim_start"]:
        dropped = 0
        while dropped < 3 and j - i > 8:
            a = _norm(ws[i]["word"])
            b = _norm(ws[i + 1]["word"]) if i + 1 < j else ""
            if (a, b) in OPEN_PAIRS:
                i, dropped = i + 2, dropped + 2
            elif a in OPEN_FILL:
                i, dropped = i + 1, dropped + 1
            else:
                break
        s = max(0.0, ws[i]["start"] - 0.12)  # open right on the first real word, with a breath
        if s > new_s:
            new_s = s
    if r["trim_end"]:
        k = j
        sent = k - 1  # the last sentence: back to the previous sentence end or a pause
        while sent > i and not _ends_sentence(ws[sent - 1]["word"]) and ws[sent]["start"] - ws[sent - 1]["end"] < 0.7:
            sent -= 1
        tail = " ".join(_norm(w["word"]) for w in ws[sent:k])
        if sent > i + 6 and (k - sent) <= 6 and OUTRO.match(tail):
            k = sent
        drops = 0
        while k - i > 8 and drops < 3 and _norm(ws[k - 1]["word"]) in END_FILL:
            k, drops = k - 1, drops + 1
        e = ws[k - 1]["end"] + 0.35
        if e < new_e:
            new_e = e
    if new_e - new_s < max(8.0, min_len * 0.5) or (new_e - new_s) < 0.6 * (end - start):
        return start, end
    return round(new_s, 2), round(new_e, 2)


# ------------------------------------------------------------------ hook text rules (added to the rating request that already exists)
HOOK_RULES = (
    "HOOK TEXT RULES for `hook_text`: 3 to 7 words. Make a curiosity gap: a question or a surprising claim that the clip then answers, "
    "and never give the answer away. It must add something the speaker has NOT said yet (do not repeat the first spoken line). "
    "Be specific (a number, a name from the brief, a concrete detail) instead of vague ('you won't believe this'). "
    "It must be true to the clip: the clip has to deliver what the text promises. Plain words, no emoji, no hashtags. "
    "The shape to aim for, not text to copy: 'The one thing he never told anyone', 'Why this failed in 3 days', 'She asked for $1 million'.\n\n")


def hook_rules(r=None) -> str:
    return HOOK_RULES if clean(r)["hook_rules"] else ""


def overall(h: int, rt: int, v: int, sh: int, length: float, r=None) -> int:
    """The clip's overall score. With hook_weight on, the hook counts for more and clips of 15-45 s get +2, clips over 55 s get -3."""
    if clean(r)["hook_weight"]:
        o = h * 0.45 + rt * 0.25 + v * 0.15 + sh * 0.15
        if 15 <= length <= 45:
            o += 2
        elif length > 55:
            o -= 3
    else:
        o = h * 0.35 + rt * 0.2 + v * 0.2 + sh * 0.25
    return max(1, min(100, round(o)))


# ------------------------------------------------------------------ punch-in: where the picture toggles
def punch_times(words: list[dict], start: float, end: float, min_gap: float = 1.6, max_still: float = 5.0) -> list[float]:
    """Times (seconds from the clip start) where the zoom toggles in or out: at sentence starts, at least `min_gap` apart,
    and never more than `max_still` seconds without a change (a toggle is added at a word boundary in long stretches)."""
    ws = [w for w in words if w["end"] > start and w["start"] < end and _norm(w["word"])]
    if len(ws) < 6:
        return []
    cand = []
    for i, w in enumerate(ws):
        if i == 0:
            continue
        p = ws[i - 1]
        if _ends_sentence(p["word"]) or w["start"] - p["end"] > 0.45:
            cand.append(max(0.0, w["start"] - start))
    length = end - start
    out: list[float] = []
    for t in cand:
        if t >= 1.0 and t <= length - 1.2 and (not out or t - out[-1] >= min_gap):
            out.append(t)
    # fill long still stretches
    starts = [max(0.0, w["start"] - start) for w in ws]
    filled: list[float] = []
    prev = 0.0
    for t in out + [length]:
        while t - prev > max_still:
            target = prev + max_still * 0.6
            pick = min((s for s in starts if s > prev + min_gap and s < t - min_gap), key=lambda s: abs(s - target), default=None)
            if pick is None:
                break
            filled.append(pick)
            prev = pick
        if t < length:
            filled.append(t)
        prev = t
    out = sorted(set(round(t, 2) for t in filled))
    return out[: max(1, int(length / 1.8))]
