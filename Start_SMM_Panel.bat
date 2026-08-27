@echo off
TITLE Dark Booster SMM Panel - 1-Click Launcher
COLOR 0A
CD /D "%~dp0"

echo ========================================================
echo   🚀 LAUNCHING DARK BOOSTER SMM PANEL & TELEGRAM BOT
echo ========================================================
echo.
echo  1. Opening Website in Browser (http://localhost:3000)...
start http://localhost:3000

echo  2. Starting Local Server & Telegram Bot...
echo ========================================================
echo.

node server.js
pause
