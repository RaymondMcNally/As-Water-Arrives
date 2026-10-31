#!/bin/bash
# As Water Arrives exhibition (Mac): opens the projector window and the kiosk in Chrome, one per display.
# Set SITE to the website's address and the X positions to where each display starts (System Settings > Displays > Arrange).
# The first time, right-click this file and choose Open. If a window lands on the wrong display, drag it across and press F.

SITE="https://raymondmcnally.github.io/as-water-arrives"
KIOSK_X=0
PROJECTOR_X=1920

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$HOME/Library/Application Support/AsWaterArrives"   # calibrate the projector in this profile (kiosk staff panel > Calibrate)

"$CHROME" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check --disable-pinch \
  --window-position=$PROJECTOR_X,0 --window-size=1920,1080 --start-fullscreen --app="$SITE/project.html?out" >/dev/null 2>&1 &
sleep 4
"$CHROME" --user-data-dir="$PROFILE" --window-position=$KIOSK_X,0 --window-size=1920,1080 --start-fullscreen \
  --app="$SITE/kiosk.html" >/dev/null 2>&1 &
