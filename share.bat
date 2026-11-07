@echo off
echo Starting public tunnel for Spark Clipper on port 8000...
echo Keep this window open while sharing!
echo.
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:8000
pause

