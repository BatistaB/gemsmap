@echo off
rem GEMsMAP {{VERSION}}: double-click to start. The first start prepares everything inside this folder.
setlocal
title GEMsMAP {{VERSION}}
rem Started from PowerShell 7, Windows PowerShell would inherit PowerShell 7's module path and fail to load its own
rem modules (Get-ExecutionPolicy...). An empty PSModulePath makes it use its defaults.
set "PSModulePath="
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\start-windows.ps1" %*
set "rc=%errorlevel%"
if not "%rc%"=="0" pause
exit /b %rc%
