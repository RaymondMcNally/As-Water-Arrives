#!/bin/bash
# As Water Arrives exhibition (Mac): opens the projector window(s) and the kiosk in Chrome, one per display.
# PROJECTORS=2 opens a second projector window (project.html?out=2); choose "Two" on the Projection page as well.
# Set SITE to the website's address and the X positions to where each display starts (System Settings > Displays > Arrange).
# The first time, right-click this file and choose Open. If a window lands on the wrong display, drag it across and press F.

SITE="https://raymondmcnally.github.io/As-Water-Arrives"
PROJECTORS=2
KIOSK_X=0
PROJECTOR_X=1920
PROJECTOR2_X=3200

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$HOME/Library/Application Support/AsWaterArrives"   # calibrate the projector in this profile (kiosk staff panel > Calibrate)

"$CHROME" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check --disable-pinch \
  --window-position=$PROJECTOR_X,0 --window-size=1280,800 --start-fullscreen --app="$SITE/project.html?out" >/dev/null 2>&1 &
sleep 4
if [ "$PROJECTORS" = "2" ]; then
  "$CHROME" --user-data-dir="$PROFILE" --window-position=$PROJECTOR2_X,0 --window-size=1280,800 --start-fullscreen \
    --app="$SITE/project.html?out=2" >/dev/null 2>&1 &
  sleep 2
fi
"$CHROME" --user-data-dir="$PROFILE" --window-position=$KIOSK_X,0 --window-size=1920,1080 --start-fullscreen \
  --app="$SITE/kiosk.html" >/dev/null 2>&1 &
