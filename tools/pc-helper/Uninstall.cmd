@echo off
rem Takes Design Scheduling's helper off this PC, for you.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Remove
pause
