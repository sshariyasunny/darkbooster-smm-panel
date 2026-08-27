@echo off
title Push Updates to GitHub - Dark Booster SMM Panel
color 0A
echo ========================================================
echo  Pushing updated SMM Panel code to GitHub (origin main)
echo ========================================================
echo.
cd /d "%~dp0"
git push origin main
echo.
echo ========================================================
echo  Done! Your live website will deploy in 1 minute on Render.
echo ========================================================
pause
