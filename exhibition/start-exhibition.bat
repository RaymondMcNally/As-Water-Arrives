@echo off
rem As Water Arrives exhibition (Windows): opens the projector window and the kiosk in Chrome, one per display.
rem Set SITE to the website's address and the X positions to where each display starts (Settings > Display).
set SITE=https://raymondmcnally.github.io/as-water-arrives
set KIOSK_X=0
set PROJECTOR_X=1920
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
set PROFILE=%LOCALAPPDATA%\AsWaterArrives
start "" %CHROME% --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --disable-pinch --window-position=%PROJECTOR_X%,0 --window-size=1920,1080 --start-fullscreen --app="%SITE%/project.html?out"
timeout /t 4 >nul
start "" %CHROME% --user-data-dir="%PROFILE%" --window-position=%KIOSK_X%,0 --window-size=1920,1080 --start-fullscreen --app="%SITE%/kiosk.html"
