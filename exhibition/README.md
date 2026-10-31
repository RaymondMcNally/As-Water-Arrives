# Exhibition set-up

One computer, two displays:

| Display | Window | Shows |
|---|---|---|
| Touch monitor beside the model | `kiosk.html` | the controls visitors use |
| Projector straight above the model | `project.html?out` | water, answers and layers on the white tiles |

Both windows must be open in the **same Chrome profile on the same computer**.

## Setting up
1. Lay out the 52 tiles. The grid letters run A–H west to east and the numbers 1–8 north to south. Lady Erin is where D4, E4, D5 and E5 meet.
2. Hang the projector pointing straight down over Lady Erin. With a 16:10 projector the 1.64 m circle needs the lens at about 1.7–2.0 m above the table, depending on the lens.
3. Connect the projector as an **extended** display, not mirrored.
4. Start everything with `start-exhibition.command` (Mac) or `start-exhibition.bat` (Windows). Edit the address and display positions at the top of the file first.
5. Calibrate once, from the kiosk: hold the faint dot in the bottom-right corner for 3 seconds, enter the PIN, then choose **Calibrate the projector**. On the Projection page:
   - tick **Show pins, rim and tile seams**;
   - drag the **N, E, S, W** pins to where the round model meets the table;
   - enter the lens height above the table;
   - if the red cross misses Lady Erin, adjust the offsets.

   The calibration is saved in that browser profile.

## Staff
- **Staff panel:** hold the bottom-right dot for 3 s, then enter the PIN (`staffPin` in `config.json`, `1234` to start). The PIN only keeps visitors out of the set-up: it sits in a public file, so it is not security.
- **Staff panel buttons:** open the projector window, calibrate, go full screen, reset the kiosk, or leave exhibition mode.
- **Idle reset:** after `idleSeconds` (180) with nobody touching it, the kiosk goes back to the start, with the sea at 3 m OD.

## The kiosk
- **01 Water arrives:** the sea from 2 to 6 m OD, or Lough Gill from 4.5 to 8 m OD, with a count of the buildings, homes and commercial units the water reaches.
- **02 Ask the town:**
  - water questions: buildings reached at 3 or 4 m OD; Lough Gill at 6 m; homes within 50 m of water; built below 4 m OD; vacant buildings by the water;
  - then the God's Eye questions: vacancy, height, deprivation, energy ratings, oil heating, households without a car;
  - a question builder.
- **03 On the model:** roads, water today, census areas coloured by any indicator, zoning, monuments, the proposed Garavogue crossing, shaded relief and the tile grid.

Live OPW water levels appear in the kiosk header when the browser can reach waterlevel.ie. If not, the panel stays hidden.
