@echo off
title Stop Energy Cal
taskkill /fi "WINDOWTITLE eq Energy Cal server*" /t /f >nul 2>&1
echo Energy Cal stopped. You can close this window.
timeout /t 2 >nul
