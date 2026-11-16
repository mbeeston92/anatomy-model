@echo off
rem Double-click this file to start the anatomy model in your browser.
rem Close this window (or press Ctrl+C) to stop it.
cd /d "%~dp0"
if not exist node_modules (
  echo First run: installing. This takes a minute...
  call npm.cmd install
)
call npm.cmd start
pause
