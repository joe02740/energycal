@echo off
title Energy Cal
cd /d "%~dp0"
set "PORT=3000"
set "NODE=%~dp0node\node.exe"
if not exist "%NODE%" set "NODE=node"

echo.
echo   Starting Energy Cal ...
echo.
echo   A small "Energy Cal server" window will open (minimized) - leave it running.
echo   To stop the app later, run "Stop Energy Cal.bat".
echo.

start "Energy Cal server" /min "%NODE%" "%~dp0app\server.js"

rem  Wait for the server to answer, then open the app window.
powershell -NoProfile -Command "for($i=0;$i -lt 50;$i++){try{Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://localhost:%PORT%/ ^| Out-Null; break}catch{Start-Sleep -Milliseconds 400}}" >nul 2>&1

start "" msedge --app=http://localhost:%PORT%/proving/can
if errorlevel 1 start "" http://localhost:%PORT%/proving/can
exit
