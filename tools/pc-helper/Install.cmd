@echo off
rem Sets up Design Scheduling's helper for you on this PC: folder links open in
rem File Explorer, and a hotkey adds a job. No administrator rights needed.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
