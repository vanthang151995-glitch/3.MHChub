@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\shutdown-iot-system.ps1" -ConfirmStop
exit /b %ERRORLEVEL%

