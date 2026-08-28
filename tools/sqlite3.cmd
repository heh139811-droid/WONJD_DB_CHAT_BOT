@echo off
setlocal
set "UV=%LOCALAPPDATA%\hermes\bin\uv.exe"
if not exist "%UV%" set "UV=uv"
"%UV%" run "%~dp0sqlite3-shim.py" %*
