@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\startup-guard.ps1" -AllowProcessFallback
exit /b %ERRORLEVEL%

