@echo off
rem Double-click to run the test site and the dashboard. Close this window to stop them.
cd /d "%~dp0"
if not exist node_modules (
  echo Menyiapkan aplikasi untuk pertama kali...
  call npm.cmd install --no-audit --no-fund
)
node scripts\start.mjs
pause
