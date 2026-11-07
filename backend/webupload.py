"""Upload to YouTube by driving YouTube Studio in a real Chrome/Edge window (no API quota, no audit, no 7-day token).

How it works: the app starts your normal Chrome/Edge with its OWN profile folder (data/browser_profile) and a debugging
port, you sign in to Google in that window once (the app never sees your password), and Playwright then clicks through
Studio's upload dialog. Because the browser is launched normally, not by automation, Google lets you sign in.

Caveats: Studio's page layout can change and break this; YouTube's terms prefer the official API; Google can show
captchas / security checks that you have to solve in the window.
"""
import json
import re
import socket
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import config
import jobs
import publish

PORT = 9223
INC = config.DATA / "incidents"
STATE = config.DATA / "auto_state.json"
_upool = ThreadPoolExecutor(max_workers=6)  # upload runners wait here, so they never starve the clip-making pool
LIMIT_RE = re.compile(r"daily upload limit|upload limit (has been )?reached|reached (your|the) (daily )?(upload )?limit|exceeded .{0,30}upload limit|try again in 24 hours", re.I)
PROBLEM_RE = re.compile(r"copyright claim|copyright strike|copyright restrictions? (found|apply)|(?<!no )issues? found|(?<!no )restrictions? found|couldn.t verify|can.t upload", re.I)


class _Halt(Exception):
    """A problem that must stop the whole automatic upload queue (daily limit, Studio changed, copyright issue...)."""


ACCOUNTS = config.DATA / "accounts.json"


def accounts() -> list:
    """The YouTube channels you can upload to. Each has its own Chrome profile + debugging port, so each stays signed in."""
    try:
        rows = json.loads(ACCOUNTS.read_text("utf-8"))
    except Exception:
        rows = []
    if not any(a["id"] == "default" for a in rows):
        rows.insert(0, {"id": "default", "name": "Main channel", "port": PORT, "profile": "browser_profile", "handle": "", "channel_id": ""})
        _save_accounts(rows)
    return rows


def _save_accounts(rows: list):
    ACCOUNTS.write_text(json.dumps(rows, indent=2), "utf-8")


def get_account(aid: str | None) -> dict:
    rows = accounts()
    return next((a for a in rows if a["id"] == (aid or "default")), rows[0])


def resolve_handle(handle: str) -> str:
    """@name -> UC... channel id (so uploads can be pinned to exactly that channel). "" if it can't be looked up."""
    try:
        import httpx
        h = handle.strip().rstrip("/").split("/")[-1]
        h = h if h.startswith("@") else "@" + h
        r = httpx.get(f"https://www.youtube.com/{h}", timeout=15, follow_redirects=True,
                      headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "en", "Cookie": "CONSENT=YES+1; SOCS=CAI"})
        m = re.search(r'"(?:channelId|externalId)":"(UC[\w-]{22})"', r.text) or re.search(r'youtube\.com/channel/(UC[\w-]{22})', r.text)
        return m.group(1) if m else ""
    except Exception:
        return ""


def add_account(name: str, handle: str = "") -> dict:
    rows = accounts()
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "channel"
    aid, k = base, 2
    while any(a["id"] == aid for a in rows):
        aid, k = f"{base}-{k}", k + 1
    port = max([a["port"] for a in rows] + [PORT]) + 1
    acc = {"id": aid, "name": name.strip()[:40], "port": port, "profile": f"browser_profile_{aid}", "handle": handle.strip(),
           "channel_id": resolve_handle(handle) if handle.strip() else ""}
    rows.append(acc)
    _save_accounts(rows)
    return acc


def update_account(aid: str, **fields) -> dict | None:
    rows = accounts()
    for a in rows:
        if a["id"] == aid:
            a.update({k: v for k, v in fields.items() if k in ("name", "handle", "channel_id")})
            _save_accounts(rows)
            return a
    return None


def delete_account(aid: str) -> bool:
    if aid == "default":
        return False
    rows = accounts()
    new = [a for a in rows if a["id"] != aid]
    _save_accounts(new)
    return len(new) != len(rows)


def _all_state() -> dict:
    try:
        d = json.loads(STATE.read_text("utf-8"))
        return d if "paused" not in d else {}
    except Exception:
        return {}


def auto_state(account: str = "default") -> dict:
    return _all_state().get(account or "default", {"paused": False})


def auto_resume(account: str | None = None):
    d = _all_state()
    for k in list(d):
        if account is None or k == account:
            d[k] = {"paused": False}
    STATE.write_text(json.dumps(d), "utf-8")
    with _turn_cv:  # lift the queue hold too (Resume banner)
        for k in list(_HOLD):
            if account is None or k == account:
                _HOLD.pop(k, None)
        _turn_cv.notify_all()


def incidents(n: int = 10) -> list:
    f = INC / "incidents.jsonl"
    if not f.exists():
        return []
    rows = []
    for line in f.read_text("utf-8").splitlines()[-n:]:
        try:
            rows.append(json.loads(line))
        except Exception:
            pass
    return list(reversed(rows))


def _hold_queue(job_id: str, clip_id: str, reason: str, shot: str | None, account: str, t: float):
    """Put the channel's queue on hold: nothing else uploads until the user presses Retry or Continue."""
    with _turn_cv:
        it = _RUN.get(account)
        item = dict(it) if it and it["job_id"] == job_id and it["clip_id"] == clip_id else None
        _HOLD[account] = {"reason": reason, "shot": shot, "job_id": job_id, "clip_id": clip_id, "t": t, "item": item}
        _turn_cv.notify_all()


def _halt(job_id: str, clip_id: str, reason: str, shot: str | None, account: str = "default"):
    """Stop the channel's uploads, remember why (with the screenshot) and show it in the app. Queued clips are kept."""
    INC.mkdir(parents=True, exist_ok=True)
    rec = {"t": time.time(), "job_id": job_id, "clip_id": clip_id, "reason": reason, "shot": shot, "account": account}
    with open(INC / "incidents.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")
    d = _all_state()
    d[account] = {"paused": True, "reason": reason, "shot": shot, "job_id": job_id, "clip_id": clip_id, "t": rec["t"]}
    STATE.write_text(json.dumps(d), "utf-8")
    print(f"[auto-upload] HALTED: {reason} (screenshot: {shot})")
    _hold_queue(job_id, clip_id, reason, shot, account, rec["t"])
    publish._set_publish(job_id, clip_id, "youtube", status="error", error=reason, method="browser")
    j = jobs.read_job(job_id)
    if j:
        jobs.log(job_id, f"Upload STOPPED: {reason}", "error")


def _shot(page, job_id: str, clip_id: str) -> str | None:
    try:
        INC.mkdir(parents=True, exist_ok=True)
        name = f"{int(time.time())}_{job_id}_{clip_id}.png"
        page.screenshot(path=str(INC / name))
        return name
    except Exception:
        return None


def _page_text(page) -> str:
    try:
        return page.evaluate("() => { const d = document.querySelector('ytcp-uploads-dialog'); return (d || document.body).innerText.slice(0, 8000); }") or ""
    except Exception:
        return ""


def _check_limit(page):
    m = LIMIT_RE.search(_page_text(page))
    if m:
        raise _Halt("YouTube's daily upload limit was reached (\"" + m.group(0) + "\"). Try again tomorrow.")
PROFILE = config.DATA / "browser_profile"
CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def find_browser() -> str | None:
    return next((p for p in CANDIDATES if Path(p).exists()), None)


def status() -> dict:
    try:
        import playwright  # noqa: F401
        pw = True
    except ImportError:
        pw = False
    return {"playwright": pw, "browser": bool(find_browser()), "ready": pw and bool(find_browser())}


def _port_open(port: int = PORT) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _ensure_browser(acc: dict | None = None):
    acc = acc or get_account("default")
    port = acc["port"]
    if _port_open(port):
        return
    exe = find_browser()
    if not exe:
        raise RuntimeError("Chrome or Edge was not found on this PC.")
    profile = config.DATA / acc["profile"]
    profile.mkdir(parents=True, exist_ok=True)
    url = f"https://studio.youtube.com/channel/{acc['channel_id']}" if acc.get("channel_id") else "https://studio.youtube.com"
    subprocess.Popen([exe, f"--remote-debugging-port={port}", f"--user-data-dir={profile}", "--no-first-run",
                      "--no-default-browser-check", "--window-size=1200,900", url])
    for _ in range(40):
        if _port_open(port):
            return
        time.sleep(0.5)
    raise RuntimeError("The browser window did not start. Close any window using the app's browser profile and retry.")


def _attach_file(page, path: str):
    """Give Studio's file input the video by PATH (Chrome reads it from disk). Playwright's own set_input_files pushes the
    whole file through the connection, which fails above 50 MB ("not co-located") and times out on big clips."""
    abs_path = str(Path(path).resolve())
    try:
        cdp = page.context.new_cdp_session(page)
        try:
            r = cdp.send("Runtime.evaluate", {"expression": """(function f(root){
                const i = root.querySelector('input[type=file]'); if (i) return i;
                for (const e of root.querySelectorAll('*')) { if (e.shadowRoot) { const r = f(e.shadowRoot); if (r) return r; } }
                return null; })(document)""", "returnByValue": False})
            oid = (r.get("result") or {}).get("objectId")
            if oid:
                cdp.send("DOM.setFileInputFiles", {"files": [abs_path], "objectId": oid})
                return
        finally:
            try:
                cdp.detach()
            except Exception:
                pass
    except Exception as e:
        print(f"[upload] direct file attach failed ({str(e)[:80]}), using Playwright's transfer")
    page.locator('input[type="file"]').first.set_input_files(abs_path)


def _create_btn(page):
    return page.get_by_role("button", name="Create", exact=True)


def _hide_likes(page) -> bool:
    """Details step > Show more > untick "Show how many viewers like this video". Best effort: True if it ended up off."""
    try:
        cb = page.get_by_role("checkbox", name="Show how many viewers like this video")
        if not cb.count():  # collapsed: expand the advanced settings first
            tog = page.locator("#toggle-button").first
            tog.scroll_into_view_if_needed()
            tog.click()
            cb.first.wait_for(state="attached", timeout=8000)
        cb = cb.first
        cb.scroll_into_view_if_needed()
        if cb.get_attribute("aria-checked") == "true":
            cb.click(force=True)  # the custom checkbox has an overlay that 'intercepts' normal clicks
            time.sleep(0.6)
        return cb.get_attribute("aria-checked") != "true"
    except Exception:
        return False


def _close_dialog(page):
    """Best effort after a Stop: close the upload dialog and discard the unfinished draft."""
    try:
        page.locator("ytcp-uploads-dialog #close-button").first.click(timeout=3000)
        time.sleep(1)
        page.get_by_role("button", name=re.compile(r"discard", re.I)).first.click(timeout=2500)
    except Exception:
        pass


ANYWAY = re.compile(r"publish anyway|save anyway|publish now|continue anyway", re.I)


def _finish(page, chk, job_id, clip_id):
    """Press Save/Publish and wait until Studio has really taken it. Studio then shows either a share dialog or the
    "still processing / checking" dialog (which needs its own Save-and-close / Publish-anyway click). Navigating away
    before that is what leaves drafts, so we only return once that last step is done."""
    dlg = page.locator("ytcp-uploads-dialog")
    was_open = dlg.count() > 0
    page.locator("#done-button").click()
    t0 = time.time()
    end = t0 + 120
    seen_still = None
    while time.time() < end:
        chk()
        try:
            if page.locator("ytcp-video-share-dialog").count() > 0 or (was_open and dlg.count() == 0 and time.time() - t0 > 2):
                time.sleep(2)
                return
            b = page.get_by_role("button", name=ANYWAY)
            if b.count() and b.first.is_visible():
                _note(job_id, clip_id, "Studio is still checking the content: clicking Publish anyway...")
                b.first.click()
                time.sleep(3)
                return
            sp = page.locator("ytcp-uploads-still-processing-dialog")
            if sp.count() > 0:
                if seen_still is None:
                    seen_still = time.time()
                    _note(job_id, clip_id, "Studio is still processing: confirming the save...")
                btn = sp.first.get_by_role("button", name=re.compile(r"save and close|publish|close|done|ok", re.I))
                if btn.count() and btn.first.is_visible():
                    btn.first.click()
                    time.sleep(4)
                    return
                if time.time() - seen_still > 8:  # nothing to confirm, the save is already queued
                    time.sleep(2)
                    return
            elif time.time() - t0 > 25 and page.locator("#done-button").count() == 0:
                return
        except Exception as e:  # DOM changing under us
            if "closed" in str(e):
                raise
        time.sleep(1.2)
    raise RuntimeError("Studio never confirmed the publish. Try again.")


def _note(job_id, clip_id, msg, progress=0):
    publish._set_publish(job_id, clip_id, "youtube", status="uploading", progress=progress, note=msg, method="browser")


_attempt: dict = {}
_locks: dict = {}  # one browser tab per channel: uploads to the SAME channel run one after another, different channels in parallel


def _lock_for(account: str):
    return _locks.setdefault(account or "default", threading.Lock())


# one worker + one ordered queue per channel; everything is in memory and shown on the Uploads page
_turn_cv = threading.Condition()
_Q: dict = {}        # account -> queued items, in upload order
_RUN: dict = {}      # account -> item uploading right now
_HOLD: dict = {}     # account -> why the queue stopped (nothing uploads until Retry / Continue)
_workers: dict = {}  # account -> worker thread



class _Cancelled(Exception):
    pass


def _upload_once(job_id: str, clip_id: str, title: str, description: str, privacy: str, n: int = 0, hide_likes: bool = True, auto: bool = False, account: str = "default"):
    key = (job_id, clip_id)
    acc = get_account(account)

    def chk():  # a newer attempt (user pressed Retry) took over: stop quietly
        if _attempt.get(key) != n:
            raise _Cancelled()

    def note(msg):  # never overwrite a Stop / Retry with a stale progress note
        chk()
        _note(job_id, clip_id, msg)

    path = jobs.job_dir(job_id) / "clips" / f"{clip_id}.mp4"
    page = None
    try:
        if not status()["ready"]:
            raise RuntimeError("Browser upload needs Playwright: run  .venv\\Scripts\\python -m pip install playwright  and restart.")
        if not path.exists():
            raise RuntimeError("Clip file not found. Render it first.")
        title = (title or "Clip").strip()[:100]
        if "#shorts" not in (title + description).lower():
            description = (description + "\n\n#Shorts").strip()
        note("Opening the browser window…")
        _ensure_browser(acc)
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.connect_over_cdp(f"http://127.0.0.1:{acc['port']}")
            ctx = browser.contexts[0]
            # reuse the tab that is already open (never pile up new tabs on every attempt / retry)
            page = next((p for p in ctx.pages if "studio.youtube.com" in p.url), None)                 or next((p for p in ctx.pages if p.url in ("about:blank", "chrome://newtab/")), None)                 or (ctx.pages[0] if ctx.pages else ctx.new_page())
            page.set_default_timeout(20_000)

            def _dlg(d):  # "Reload site? Changes you made may not be saved": say Reload, otherwise navigation hangs forever
                try:
                    d.accept()
                except Exception:
                    pass
            page.on("dialog", _dlg)
            page.bring_to_front()  # background tabs get throttled and Studio renders blank
            page.goto(f"https://studio.youtube.com/channel/{acc['channel_id']}" if acc.get("channel_id") else "https://studio.youtube.com",
                      wait_until="domcontentloaded", timeout=60_000)

            # signed in? Studio redirects to accounts.google.com otherwise. Give the user 5 minutes to sign in.
            deadline = time.time() + 300
            while True:
                url = page.url
                if "studio.youtube.com" in url and "accounts.google" not in url and _create_btn(page).count():
                    break
                chk()
                if time.time() > deadline:
                    raise RuntimeError("Not signed in. Sign in to the Google account in the opened browser window, then retry.")
                note("Sign in to Google in the browser window that opened (waiting…)")
                time.sleep(2)

            chk()
            m = re.search(r"/channel/(UC[\w-]{22})", page.url)
            if m and acc.get("channel_id") and m.group(1) != acc["channel_id"]:
                raise _Halt(f"Wrong YouTube channel is open for '{acc['name']}' (expected {acc.get('handle') or acc['channel_id']}). "
                            "Open the channel's window, switch to the right channel in Studio, then resume.")
            if m and not acc.get("channel_id"):
                update_account(acc["id"], channel_id=m.group(1))  # remember it: later uploads are pinned to this channel
            note("Opening the upload dialog…")
            _create_btn(page).first.click()
            page.locator("yt-formatted-string.item-text", has_text="Upload videos").first.click()
            page.locator('input[type="file"]').first.wait_for(state="attached", timeout=30_000)
            _attach_file(page, str(path))

            note("Filling in title and description…")
            tbox = page.locator("#title-textarea #textbox")
            t_end = time.time() + 90
            while not (tbox.count() and tbox.first.is_visible()):  # the dialog may show a limit message instead
                chk()
                _check_limit(page)
                if time.time() > t_end:
                    raise RuntimeError("Studio's upload dialog never showed the title box (its layout may have changed)")
                time.sleep(1)
            tbox.click()
            page.keyboard.press("Control+A")
            page.keyboard.type(title)
            dbox = page.locator("#description-textarea #textbox")
            dbox.click()
            page.keyboard.press("Control+A")
            page.keyboard.type(description[:4900])
            page.locator('tp-yt-paper-radio-button[name$="NOT_MFK"], tp-yt-paper-radio-button[name$="NOT_MADE_FOR_KIDS"]').first.click()

            likes_hidden = None
            if hide_likes:
                note("Hiding the like count…")
                likes_hidden = _hide_likes(page)
            chk()
            for i in range(3):  # details -> elements -> checks -> visibility
                nxt = page.locator("#next-button")
                nxt.click()
                time.sleep(1.2)
            if auto:  # Studio's checks step reports copyright / other problems: stop instead of publishing blindly
                m = PROBLEM_RE.search(_page_text(page))
                if m:
                    raise _Halt(f"Studio reported a problem with the video (\"{m.group(0)}\"). Check it in Studio.")
            page.locator(f'tp-yt-paper-radio-button[name="{privacy.upper()}"]').first.click()

            link = ""
            try:
                link = page.locator('.video-url-fadeable a, ytcp-video-metadata-visibility a[href*="youtu"], a[href*="/shorts/"], a[href*="youtu.be"]').first.get_attribute("href", timeout=8_000) or ""
            except Exception:
                pass

            # wait for the upload to finish: the Save/Publish button becomes enabled
            done = page.locator("#done-button")
            end = time.time() + 40 * 60
            while done.get_attribute("aria-disabled") == "true":
                chk()
                if time.time() > end:
                    raise RuntimeError("Upload took longer than 40 minutes.")
                _check_limit(page)
                try:
                    txt = page.locator("ytcp-video-upload-progress").first.inner_text(timeout=2000).replace("\n", " ")
                except Exception:
                    txt = "Uploading…"
                note(txt[:80] or "Uploading…")
                time.sleep(2)
            _finish(page, chk, job_id, clip_id)
            chk()
            publish._set_publish(job_id, clip_id, "youtube", status="done", url=link or "https://studio.youtube.com",
                                 privacy=privacy, method="browser", likes_hidden=likes_hidden, account=acc["id"], account_name=acc["name"], t=time.time())
            page.goto("https://studio.youtube.com", wait_until="domcontentloaded")  # leave the tab on Studio home
    except _Cancelled:
        if page:
            _close_dialog(page)
        raise
    except Exception as e:
        try:
            if page:
                page.screenshot(path=str(jobs.job_dir(job_id) / "upload_error.png"))
                e.shot = _shot(page, job_id, clip_id)
        except Exception:
            pass
        raise


TRANSIENT = ("has been closed", "Connection closed", "ECONNREFUSED", "Target closed", "Timeout", "net::", "Execution context")


def upload(job_id: str, clip_id: str, title: str, description: str, privacy: str, n: int = 0, hide_likes: bool = True, auto: bool = False, account: str = "default"):
    """Runs _upload_once, retrying automatically (up to 3 tries) when the browser hiccups: window closed,
    Studio slow to load, connection dropped. Sign-in problems and a newer attempt (Retry button) stop it."""
    key = (job_id, clip_id)
    waited = False
    lock = _lock_for(account)
    while not lock.acquire(timeout=1):  # another upload is using the browser: wait our turn
        if _attempt.get(key) != n:
            return
        if not waited:
            _note(job_id, clip_id, "Waiting for the previous upload to finish…")
            waited = True
    try:
        if auto and auto_state(account).get("paused"):
            publish._set_publish(job_id, clip_id, "youtube", status="cancelled", method="browser")
            return
        _upload_with_retries(job_id, clip_id, title, description, privacy, n, hide_likes, auto, account)
    finally:
        lock.release()


def _upload_with_retries(job_id, clip_id, title, description, privacy, n, hide_likes=True, auto=False, account="default"):
    key = (job_id, clip_id)
    for attempt in range(3):
        try:
            _upload_once(job_id, clip_id, title, description, privacy, n, hide_likes, auto, account)
            return
        except _Cancelled:
            return
        except _Halt as h:
            if _attempt.get(key) != n:
                return
            _halt(job_id, clip_id, str(h), getattr(h, "shot", None), account)
            return
        except Exception as e:
            if _attempt.get(key) != n:
                return
            err = str(e).split("\n")[0]
            if attempt < 2 and any(t in str(e) for t in TRANSIENT) and "Not signed in" not in str(e):
                _note(job_id, clip_id, f"Browser hiccup ({err[:70]}). Retrying {attempt + 2} of 3…")
                time.sleep(3)
                continue
            msg = err[:300]
            if "has been closed" in str(e) or "Target closed" in str(e):
                msg = "The browser window was closed during the upload. Keep it open (you can minimise it) and press Try again."
            elif "Timeout" in str(e):
                msg = ("YouTube Studio did not respond as expected (slow page, a security check, or its layout changed). "
                       "A screenshot is saved as upload_error.png in the project folder. " + msg)
            publish._set_publish(job_id, clip_id, "youtube", status="error", error=msg, method="browser")
            if auto:  # anything unexpected in full auto: stop everything and leave a screenshot
                _halt(job_id, clip_id, "Upload failed: " + msg, getattr(e, "shot", None), account)
            else:  # manual upload failed: hold the rest of the queue so the user decides (retry / continue)
                _hold_queue(job_id, clip_id, "Upload failed: " + msg, getattr(e, "shot", None), account, time.time())
            return


def _put(account: str, items: list):
    """Add items to a channel's queue. A project's clips stay together: new ones go right after the last queued clip of
    the same project, otherwise at the end."""
    account = account or "default"
    with _turn_cv:
        q = _Q.setdefault(account, [])
        for it in items:
            idx = max((i for i, x in enumerate(q) if x["job_id"] == it["job_id"]), default=None)
            if idx is None:
                q.append(it)
            else:
                q.insert(idx + 1, it)
        if account not in _workers:
            t = threading.Thread(target=_worker, args=(account,), daemon=True, name=f"upload-{account}")
            _workers[account] = t
            t.start()
        _turn_cv.notify_all()


def _worker(account: str):
    """One worker per channel: uploads its queue strictly in order, and waits (without losing anything) while the queue is on hold."""
    while True:
        with _turn_cv:
            while True:
                q = _Q.get(account) or []
                if q and account not in _HOLD:
                    break
                _turn_cv.wait(timeout=5)
            it = q.pop(0)
            if _attempt.get((it["job_id"], it["clip_id"])) != it["n"]:
                continue  # cancelled / restarted while waiting
            _RUN[account] = it
        try:
            upload(it["job_id"], it["clip_id"], it["title"], it["desc"], it["privacy"], it["n"], it["hide_likes"], it["auto"], account)
        except Exception as e:
            print(f"[upload-queue] {account}: {e}")
        finally:
            with _turn_cv:
                _RUN.pop(account, None)
                _turn_cv.notify_all()


def _item(job_id, clip_id, title, desc, privacy, hide_likes, auto, account, note) -> dict:
    key = (job_id, clip_id)
    _attempt[key] = _attempt.get(key, 0) + 1
    publish._set_publish(job_id, clip_id, "youtube", status="queued", progress=0, method="browser", note=note)
    return {"job_id": job_id, "clip_id": clip_id, "title": title, "desc": desc, "privacy": privacy,
            "hide_likes": hide_likes, "auto": auto, "n": _attempt[key], "account": account or "default"}


def start_many(job_id: str, items: list, privacy: str, hide_likes: bool = True, auto: bool = False, account: str = "default") -> int:
    """Queue several clips for upload. items = [(clip_id, title, description)], uploaded one by one in that order."""
    rows = [_item(job_id, c, t, d, privacy, hide_likes, auto, account, "Waiting in the upload queue") for c, t, d in items]
    _put(account, rows)
    return len(rows)


class UploadStream:
    """Full auto, pipelined: clips are handed over one by one as they finish rendering and join the channel's queue straight away."""

    def __init__(self, job_id: str, privacy: str, hide_likes: bool, auto: bool, account: str):
        self.job_id, self.privacy, self.hide_likes, self.auto, self.account = job_id, privacy, hide_likes, auto, account
        self.count = 0

    def add(self, clip_id: str, title: str, desc: str):
        self.count += 1
        _put(self.account, [_item(self.job_id, clip_id, title, desc, self.privacy, self.hide_likes, self.auto, self.account, "Rendered, waiting to upload")])

    def close(self):
        pass


def cancel_queued(job_id: str, clip_id: str | None = None, include_running: bool = True) -> int:
    """Stop uploads of a project (or one clip): queued ones never start, the running one aborts and closes its dialog."""
    job = jobs.read_job(job_id) or {"clips": []}
    c = 0
    for clip in job["clips"]:
        if clip_id and clip["id"] != clip_id:
            continue
        y = (clip.get("publish") or {}).get("youtube") or {}
        if y.get("status") == "queued" or (include_running and y.get("status") == "uploading"):
            _attempt[(job_id, clip["id"])] = _attempt.get((job_id, clip["id"]), 0) + 1
            publish._set_publish(job_id, clip["id"], "youtube", status="cancelled", method="browser")
            c += 1
    with _turn_cv:
        for q in _Q.values():
            q[:] = [x for x in q if _attempt.get((x["job_id"], x["clip_id"])) == x["n"]]
    return c


def start(job_id: str, clip_id: str, title: str, description: str, privacy: str, hide_likes: bool = True, account: str = "default"):
    _put(account, [_item(job_id, clip_id, title, description, privacy, hide_likes, False, account, "Waiting in the upload queue")])


def snapshot() -> dict:
    """account -> {running, queue, hold} straight from memory (the queue's real order)."""
    out = {}
    with _turn_cv:
        for a in set(_Q) | set(_RUN) | set(_HOLD):
            q = [x for x in _Q.get(a, []) if _attempt.get((x["job_id"], x["clip_id"])) == x["n"]]
            out[a] = {"running": _RUN.get(a), "queue": list(q), "hold": _HOLD.get(a)}
    return out


def reorder(account: str, order: list) -> int:
    """order = [[job_id, clip_id], …] in the wanted sequence. Clips not listed keep their relative order after those."""
    account = account or "default"
    with _turn_cv:
        q = _Q.get(account, [])
        m = {(x["job_id"], x["clip_id"]): x for x in q}
        new = [m.pop((o[0], o[1])) for o in order if (o[0], o[1]) in m]
        new += list(m.values())
        _Q[account] = new
        _turn_cv.notify_all()
        return len(new)


def continue_queue(account: str, retry: bool) -> bool:
    """Lift the hold. retry=True puts the clip that failed back at the front, otherwise it is skipped (stays marked failed)."""
    account = account or "default"
    with _turn_cv:
        h = _HOLD.pop(account, None)
        if h and retry and h.get("item"):
            it = dict(h["item"])
            key = (it["job_id"], it["clip_id"])
            _attempt[key] = _attempt.get(key, 0) + 1
            it["n"] = _attempt[key]
            publish._set_publish(it["job_id"], it["clip_id"], "youtube", status="queued", progress=0, method="browser", note="Retrying…")
            _Q.setdefault(account, []).insert(0, it)
        _turn_cv.notify_all()
    auto_resume(account)
    if account not in _workers and _Q.get(account):
        _put(account, [])
    return h is not None


def stop_all() -> int:
    """Full stop: nothing uploads any more. Queued clips are dropped, the running one aborts, holds are cleared,
    and Full auto uploads stay paused until you press Resume."""
    items = []
    with _turn_cv:
        for a, q in _Q.items():
            items += [(a, x) for x in q]
            q.clear()
        for a, r in _RUN.items():
            items.append((a, r))
        _HOLD.clear()
        _turn_cv.notify_all()
    accts = set()
    for a, x in items:
        key = (x["job_id"], x["clip_id"])
        _attempt[key] = _attempt.get(key, 0) + 1
        publish._set_publish(x["job_id"], x["clip_id"], "youtube", status="cancelled", method="browser")
        accts.add(a)
    d = _all_state()
    for a in accts | {k for k, v in d.items() if v.get("paused")}:
        if not (d.get(a) or {}).get("paused"):
            d[a] = {"paused": True, "reason": "You stopped all uploads.", "shot": None, "t": time.time()}
    STATE.write_text(json.dumps(d), "utf-8")
    return len(items)


def is_active(job_id: str, clip_id: str) -> bool:
    """True while this clip is really waiting or uploading in this running app (not a leftover mark from before a restart)."""
    with _turn_cv:
        key = (job_id, clip_id)
        if any((r["job_id"], r["clip_id"]) == key for r in _RUN.values()):
            return True
        return any((x["job_id"], x["clip_id"]) == key and _attempt.get(key) == x["n"] for q in _Q.values() for x in q)
