@echo off
rem As Water Arrives exhibition (Windows): opens the projector window(s) and the kiosk in Chrome, one per display.
rem PROJECTORS=2 opens a second projector window (project.html?out=2); choose "Two" on the Projection page as well.
rem Set SITE to the website's address and the X positions to where each display starts (Settings > Display).
set SITE=https://raymondmcnally.github.io/as-water-arrives
set PROJECTORS=2
set KIOSK_X=0
set PROJECTOR_X=1920
set PROJECTOR2_X=3200
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
set PROFILE=%LOCALAPPDATA%\AsWaterArrives
start "" %CHROME% --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --disable-pinch --window-position=%PROJECTOR_X%,0 --window-size=1280,800 --start-fullscreen --app="%SITE%/project.html?out"
timeout /t 4 >nul
if "%PROJECTORS%"=="2" (
  start "" %CHROME% --user-data-dir="%PROFILE%" --window-position=%PROJECTOR2_X%,0 --window-size=1280,800 --start-fullscreen --app="%SITE%/project.html?out=2"
  timeout /t 2 >nul
)
start "" %CHROME% --user-data-dir="%PROFILE%" --window-position=%KIOSK_X%,0 --window-size=1920,1080 --start-fullscreen --app="%SITE%/kiosk.html"
