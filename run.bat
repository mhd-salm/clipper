@echo off
cd /d "%~dp0backend"
if not exist "..\.env" copy "..\.env.example" "..\.env" >nul
echo Spark Clipper running at http://localhost:8000
"..\.venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000
