@echo off
TITLE Dark Booster SMM Panel & Telegram Bot Launcher
COLOR 0A
CD /D "%~dp0"

echo ========================================================
echo   🚀 DARK BOOSTER SMM PANEL & TELEGRAM BOT (1-CLICK LAUNCH)
echo ========================================================
echo.
echo  🌐 Website Status : Opening http://localhost:3000 ...
start http://localhost:3000

echo  🤖 Telegram Bot   : Connecting & Polling Telegram API ...
echo  💾 Database Sync  : Auto Backup & Recovery Active
echo ========================================================
echo.

node server.js
pause
