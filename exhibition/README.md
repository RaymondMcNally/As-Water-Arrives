# Exhibition set-up

One computer, three displays: the touch monitor and two projectors (Epson EB-W06). One projector also works; see the end of this section.

| Display | Window | Shows |
|---|---|---|
| Touch monitor beside the model | `kiosk.html` | the controls visitors use |
| Projector 1, over the north half | `project.html?out` | water, answers and layers on the white tiles |
| Projector 2, over the south half | `project.html?out=2` | the same, for the south half |

All the windows must be open in the **same Chrome profile on the same computer**. The computer needs three display outputs (two projectors plus the touch monitor): the Dell Precision, or a Mac with three outputs. A standard M-series Mac mini drives only two.

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
