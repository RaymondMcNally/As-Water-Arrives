# As Water Arrives · Sligo borough model

The website for the round 1:2500 model of Sligo made for the **16th A-IARG conference, "As Water Arrives: Architecture and Change"** (ATU Sligo, 11–12 March 2027). The model shows Sligo one Irish mile (2,048 m) out from the Lady Erin monument on Market Street: 52 tiles of 230 mm printed on a Bambu P1S, with one or two projectors over them.

| Page | What it does |
|---|---|
| `index.html` | The model and the conference theme |
| `kiosk.html` | The public touch screen. **01 Water arrives** raises the sea or Lough Gill; **02 Ask the town** has water questions first, then the Sligo God's Eye questions; **03 On the model** switches the projected layers; **04 About**. Everything chosen is sent to the projector. |
| `project.html` | Projector calibration and preview, for one or two projectors; `project.html?out` and `project.html?out=2` are the projector windows. With two, each covers half the model and the two are blended across the middle |
| `model.html` | Make a model: drag a square and download a 3D-print tile (3MF, made in the browser with manifold-3d, the same method as the exhibition tiles), a laser contour kit (SVG/DXF sheets) or a contour map (PDF/SVG) |
| `data.html` | Sources, method and files (including the OPW river flood maps for Sligo, 10%, 5% and 1% a year) |

Set-up for the conference (displays, calibration, staff exit, PIN): **[exhibition/README.md](exhibition/README.md)**.

## Publishing
GitHub Pages: Settings › Pages › Deploy from branch › `main` / root. No build step; every library is in `vendor/`, so the site also runs from a college web server or `python3 -m http.server` (it must be served over http, not opened from disk).

The kiosk, the projection page and the projector windows must be open in the **same browser profile on the same computer**: they talk over a BroadcastChannel (`aiarg-sligo-model`). The projector calibration is kept in that profile's localStorage.

## Before making this public
`data/buildings.json` and `data/model/buildings.json` contain building footprints derived from **Tailte Éireann (OSi)** data. Check that your licence allows publishing them on a public website. If it doesn't, keep the repository private and serve the site locally at the exhibition, or switch the footprints to OpenStreetMap buildings.

## Data
Built by `tools/make_data.py` from the God's Eye public data and the tile-generator outputs (see `tools/`). The town buses come from the Bus Éireann GTFS timetable via `tools/make_buses.py` (rerun it with a new feed when the timetable changes). Credits: Bus Éireann timetable data from the National Transport Authority; contains Irish Public Sector Data (OPW lidar, waterlevel.ie) licensed under CC BY 4.0; © OpenStreetMap contributors (ODbL); CSO Census 2022; SEAI BER; GeoDirectory; Sligo & Environs Development Plan; Tailte Éireann. Deprivation scores are reconstructed from the Pobal HP method and are not official.

The water scenarios are a morphological reconstruction (spill level from the sea or from Lough Gill, the lake stopped at Hyde Bridge) on the 2 m ground model. They are an illustration for discussion, not a flood forecast.

## Reused code
- `js/model-core.js`: the contour, laser-nesting and 3MF code from the Site Model Hub (`raymondmcnally/Site_Model_Hub`).
- The projection method, with four pins, a height correction and a `?out` window, follows the Gleniff Mill exhibition (`raymondmcnally/Gleniff-Mill-Exhibition`), adapted to a round model.
- The query engine comes from Sligo God's Eye.
- Libraries: MapLibre GL 4.7.1, three.js, manifold-3d 3.0.1, JSZip, jsPDF (licences in `vendor/`).

Created by R McNally, ATU Sligo Department of Architecture.
