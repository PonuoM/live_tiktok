@echo off
chcp 65001 >nul
title Live game server (do not close during LIVE)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. See SETUP.md & pause & exit /b 1)
if not exist node_modules (echo Installing packages, about 1 minute... & call npm install)
rem open the control page after the server has started
start "" cmd /c "timeout /t 3 >nul & start http://localhost:4192/studio"
node server.js %*
echo.
echo Server stopped. Close this window or press a key.
pause >nul
