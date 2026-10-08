@echo off
REM ============================================================
REM   Yunshang Huangzai - LAN preview server
REM   Double-click this file, then open the URL below.
REM   Keep this black window OPEN - closing it stops the server.
REM ============================================================
cd /d "%~dp0"

echo.
echo   Looking up this PC's LAN address...
echo.

set LANIP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    for /f "tokens=* delims= " %%b in ("%%a") do set LANIP=%%b
)

echo   ============================================================
echo     THIS COMPUTER      :  http://localhost:8000
echo     PHONE / OTHER PC   :  http://%LANIP%:8000
echo   ============================================================
echo.
echo   IMPORTANT:
echo     - Your phone must be on the SAME WiFi as this PC.
echo     - Do NOT send "localhost" to others, use the %LANIP% address.
echo     - Press Ctrl+C (then Y) in this window to stop the server.
echo.
echo   Starting server...
echo.

start "" http://localhost:8000

set PY=C:\Users\LQT\.workbuddy\binaries\python\versions\3.13.12\python.exe
if exist "%PY%" (
    "%PY%" -m http.server 8000 --bind 0.0.0.0
) else (
    python -m http.server 8000 --bind 0.0.0.0
)

pause
