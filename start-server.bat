@echo off
cd /d "%~dp0"
echo Starting Time Keep System...
echo Open http://localhost:3000 in your browser.
echo Keep this window open while using the app.
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE_EXE%" (
  echo Node.js was not found at "%NODE_EXE%".
  echo Install Node.js or update start-server.bat with the correct path.
  pause
  exit /b 1
)
"%NODE_EXE%" server.js
if errorlevel 1 (
  echo.
  echo The server stopped because of an error.
  pause
)
