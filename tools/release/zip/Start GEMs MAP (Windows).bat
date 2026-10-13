@echo off
rem GEMs MAP {{VERSION}}: double-click to start. The first start prepares everything inside this folder.
title GEMs MAP {{VERSION}}
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\start-windows.ps1" %*
set "rc=%errorlevel%"
if not "%rc%"=="0" pause
exit /b %rc%
