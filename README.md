# Spark Clipper

Local AI clipper: YouTube link or upload -> pick layout -> AI finds viral moments -> edit -> publish.

## Run
1. Copy `.env.example` to `.env`, set `GEMINI_API_KEY`.
2. Double-click `run.bat`, open http://localhost:8000

## Connect YouTube uploads (one time)
1. Go to https://console.cloud.google.com and create a project.
2. APIs & Services -> Library -> enable **YouTube Data API v3**.
3. APIs & Services -> OAuth consent screen: User type **External**, fill the basics, and under
   **Test users** add your own Google account.
4. APIs & Services -> Credentials -> Create credentials -> **OAuth client ID** -> Application type **Desktop app**.
5. Download the JSON and save it as `data/client_secret.json`.
6. Open a clip in the app -> **Connect YouTube** -> sign in (you may see an "unverified app" warning; continue).

### Limits you will hit
- **Private only until audited:** API projects that haven't passed Google's audit can only upload as *private*.
  You can flip the video to public manually in YouTube Studio, or apply for the audit
  (https://support.google.com/youtube/contact/yt_api_form).
- **Quota:** the free quota (10,000 units/day) allows about 6 uploads per day (1,600 units each).
- **Testing mode tokens expire after 7 days:** just click Connect YouTube again.

## Settings (.env)
- `GEMINI_MODEL` - comma-separated list; the next model is tried when one is overloaded.
- `WHISPER_MODEL` - `tiny`/`base`/`small`/`medium`. Smaller = faster on CPU.
- `WATCH_INTERVAL_MINUTES` - how often followed creators are checked.
