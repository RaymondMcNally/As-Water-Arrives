# Exhibition set-up

One computer, four displays: the touch monitor, two projectors (Epson EB-W06) and a large monitor for the story screen. One projector also works, and the story screen is optional.

| Display | Window | Shows |
|---|---|---|
| Touch monitor beside the model | `kiosk.html` | the controls visitors use |
| Projector 1, over the north half | `project.html?out` | water, answers and layers on the white tiles |
| Projector 2, over the south half | `project.html?out=2` | the same, for the south half |
| Large monitor beside the model | `screen.html` | the story screen: what the model shows, in words, numbers, a chart and a picture |

All the windows must be open in the **same Chrome profile on the same computer**. The computer needs a display output for each: four with the story screen (touch monitor, two projectors, large monitor), three without it. Use the Dell Precision (check its graphics card has four outputs; most workstation cards have four DisplayPorts), or a USB-C/DisplayLink adaptor for the large monitor, which only shows text and pictures. A standard M-series Mac mini drives only two.

## Hanging the projectors
The model is 1.64 m across. Each EB-W06 at its widest zoom throws a picture 1/1.30 of its height above the table, at 16:10.

| | Projector 1 | Projector 2 |
|---|---|---|
| Over | the north half | the south half |
| Lens above the table | about 2.3 m | about 2.3 m |
| Lens position | 290 mm north of Lady Erin | 290 mm south of Lady Erin |
| Picture on the table | about 1.77 × 1.11 m, long side east–west | the same |

The two pictures overlap by about 0.5 m across the middle of the model; the software fades one into the other in a 200 mm band there. Detail on the model is about 1.4 mm per pixel, and brightness about twice what one projector would give.

Both point straight down, so check the EB-W06 manual for the angles it may be installed at. If it can't point straight down, mount it level and use a front-surface mirror at 45°; then tick the mirror image in the projector's menu. With a mirror, the lens height is measured along the light path.

A **West / east** layout is also available, with both projectors turned 90° so the long side runs north–south.

## Setting up
1. Lay out the 52 tiles. The grid letters run A–H west to east and the numbers 1–8 north to south. Lady Erin is where D4, E4, D5 and E5 meet.
2. Hang the projectors as above and connect each as an **extended** display, not mirrored.
3. Start everything with `start-exhibition.command` (Mac) or `start-exhibition.bat` (Windows). Edit the address, `PROJECTORS` and the display positions at the top of the file first.
4. Calibrate once, from the kiosk: hold the faint dot in the bottom-right corner for 3 seconds, enter the PIN, then choose **Calibrate the projector**. On the Projection page:
   - under **Projectors**, choose **Two** and **North / south halves**;
   - tick **Show pins, rim, tile seams and the blend band**;
   - choose **Projector 1** (or press **1**). Its window shows four pins, **W, NW, NE, E**. Drag each to its point where the round model meets the table. NW and NE are halfway between the compass points;
   - enter its lens height and its lens offset from Lady Erin (north is positive, so about 290). The red cross should land on Lady Erin;
   - choose **Projector 2** (or press **2**) and do the same with **E, SE, SW, W** (offset north about −290);
   - tick **White test**. The two pictures add up across the band between the dashed lines. If the band looks brighter than the rest, raise **Projector gamma**; if darker, lower it. Move the **seam** a little if it falls on a busy street.

   Set both projectors to the same colour mode and brightness in their own menus first, so the halves match. The calibration is saved in that browser profile.

**One projector:** choose **One** under Projectors. The lens must then be about 3.6 m above the table to cover the whole model, and the pins are **N, E, S, W**.

## Traffic
**03 On the model › Traffic** colours the main roads by how busy they typically are at that time of day, using the same clock as the buses (**Now** or **A day in 3 minutes**). It needs no account and is labelled as modelled, not live. Optional: a TomTom API key pasted into the staff panel makes it live.

### A recorded TomTom day for "A day in 3 minutes"
TomTom only gives traffic as it is now, so record a real weekday first:
1. In the exhibition Chrome profile, with the TomTom key saved, open `record.html` (linked from the Projection page).
2. Press **Start recording** on a weekday morning and leave the page open until the next morning. Keep the computer awake and plugged in. It takes a snapshot every 15 minutes (about 4,700 TomTom tiles a day).
3. When the day has at least 72 of 96 snapshots it is marked **used for the replay**. The kiosk's **A day in 3 minutes** then replays it; **Now** stays live.

Recorded on another computer? **Export** there and **Import** on the exhibition computer. The recording stays in the browser; it isn't published with the website.

## The story (attract loop)
When nobody has touched the kiosk for `storyAfterSeconds` (40), it plays a short story on the kiosk and the model, one step every `storyStepSeconds` (9): today's 1-in-100-year storm tide, the sea 0.5, 1 and 2 m higher, the docks built on land won from the sea, heritage buildings in the water's way, substations in today's flood zone, the protected river, and planning since 2017, then an invitation to touch. The numbers in the captions come from the data. Any touch stops it and leaves the kiosk ready to use. Staff can start it from the staff panel (**Play the story now**); set `"story": false` in `config.json` to turn it off.

## The story screen (large monitor)
`screen.html` goes on a large monitor beside the model (a 55–75 inch TV is fine). It never takes touches: it follows the kiosk and explains what is on the model, readable from a few metres away.

- **During the story** it shows the step's headline and caption with the step dots, the numbers behind it, and a chart (for the sea steps, how many buildings the 1-in-100-year storm reaches as the sea rises, with this step highlighted).
- **When a visitor is using the kiosk** it shows *On the model now*: a plain-language headline for the water or layer they chose, what it means, the key numbers, a chart where one helps (buildings by water level; new homes permitted each year), the legend, and the water scenario underneath when a layer is shown over a flood.
- **The picture**: a photograph for the topic if there is one in `exhibition/screen/` (see the README there for the file names and ideas, and `screenImages` in `config.json` for captions and credits); otherwise the kiosk's own 3D map of what is projected, refreshed after each change.

Open it from the staff panel (**Open the story screen**), drag it to the monitor, click it and press F; or let the start script open it (`SCREEN=1` and `SCREEN_X`). The staff panel says whether it is connected. It must be in the same Chrome profile as the kiosk.

## Layers
**03 On the model** groups the layers (water and drainage, getting around, town and growth, energy, heritage and nature, the model). **One layer at a time** (the default) keeps roads and water as a base and swaps the rest, so the projected model stays readable; **Combine layers** lets visitors stack them.

## Staff
- **Staff panel:** hold the bottom-right dot for 3 s, then enter the PIN (`staffPin` in `config.json`, `1234` to start). The PIN only keeps visitors out of the set-up: it sits in a public file, so it is not security.
- **Staff panel buttons:** open the projector windows (both, when the Projection page is set to two), calibrate, go full screen, reset the kiosk, or leave exhibition mode.
- **Idle reset:** after `idleSeconds` (180) with nobody touching it, the kiosk goes back to the start, with the sea at 3 m OD.

## The kiosk
- **01 Water arrives:** the sea from 2 to 6 m OD, or Lough Gill from 4.5 to 8 m OD, with a count of the buildings, homes and commercial units the water reaches.
- **02 Ask the town:**
  - water questions: buildings reached at 3 or 4 m OD; Lough Gill at 6 m; homes within 50 m of water; built below 4 m OD; vacant buildings by the water;
  - then the God's Eye questions: vacancy, height, deprivation, energy ratings, oil heating, households without a car;
  - a question builder.
- **03 On the model:** roads, water today, census areas coloured by any indicator, zoning, monuments, the proposed Garavogue crossing, shaded relief and the tile grid.

Live OPW water levels appear in the kiosk header when the browser can reach waterlevel.ie. If not, the panel stays hidden.
