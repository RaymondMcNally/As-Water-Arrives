# As Water Arrives · Sligo borough model

The website for the round 1:2500 model of Sligo made for the **16th A-IARG conference, "As Water Arrives: Architecture and Change"** (ATU Sligo, 11–12 March 2027). The model shows Sligo one Irish mile (2,048 m) out from the Lady Erin monument on Market Street: 52 tiles of 230 mm printed on a Bambu P1S, with one or two projectors over them.

| Page | What it does |
|---|---|
| `index.html` | The model and the conference theme |
| `kiosk.html` | The public touch screen. **01 Water arrives** raises the sea or Lough Gill; **02 Ask the town** has water questions first, then the Sligo God's Eye questions; **03 On the model** switches the projected layers; **04 About**. Everything chosen is sent to the projector. |
| `screen.html` | The story screen for a large monitor beside the model. It follows the kiosk and explains what the model shows: headline, caption, key numbers, a chart and a picture (a photograph from `exhibition/screen/`, or the kiosk's map). |
| `project.html` | Projector calibration and preview, for one or two projectors; `project.html?out` and `project.html?out=2` are the projector windows. With two, each covers half the model and the two are blended across the middle |
| `model.html` | Make a model: drag a square and download a 3D-print tile (3MF, made in the browser with manifold-3d, the same method as the exhibition tiles), a laser contour kit (SVG/DXF sheets) or a contour map (PDF/SVG) |
| `data.html` | Sources, method and files (including the OPW river flood maps for Sligo, 10%, 5% and 1% a year) |

Set-up for the conference (displays, calibration, staff exit, PIN): **[exhibition/README.md](exhibition/README.md)**.

## Publishing
GitHub Pages: Settings › Pages › Deploy from branch › `main` / root. No build step; every library is in `vendor/`, so the site also runs from a college web server or `python3 -m http.server` (it must be served over http, not opened from disk).

The kiosk, the projection page and the projector windows must be open in the **same browser profile on the same computer**: they talk over a BroadcastChannel (`aiarg-sligo-model`). The projector calibration is kept in that profile's localStorage.

## Before making this public
`data/buildings.json` and `data/model/buildings.json` contain building footprints derived from **Tailte Éireann (OSi)** data. Check that your licence allows publishing them on a public website. If it doesn't, keep the repository private and serve the site locally at the exhibition, or switch the footprints to OpenStreetMap buildings.

## Traffic
The **Traffic** layer is **live TomTom flow** (style `relative`, zoom 15, refreshed every 5 minutes) when a TomTom API key has been entered in the kiosk staff panel or on the Projection page. The key is kept in that browser's localStorage only, never in the repository. Without a key, or if TomTom fails, it shows **typical traffic** on the main roads for the time of day (`js/typical.js`). **A day in 3 minutes** replays a day recorded from TomTom with `record.html` (kept in the browser, `aiarg-traffic-rec`), or typical traffic if nothing has been recorded.

## Sea-level rise
`tools/make_opw_future.py` clips the OPW's national coastal flood maps (2021: present day, and future scenarios +0.5 to +2.0 m for about 2100) and the river's mid-range and high-end future extents to the circle (`data/opw_future.json`) and gives each building the smallest rise that reaches it (`cf2`, `cf20`, `cf100`) and its future river band (`om`, `oh`). The kiosk's **Sea-level rise** choice steps through them.

## Architectural heritage
`tools/make_niah.py` takes the NIAH open-data service export for the model's area, matches each record to its building footprint, writes `data/niah.json` (rating, dates, use, short description, link, flood and SAC flags) and gives buildings `nhr` (3 national, 2 regional, 1 local) for the kiosk's questions.

## Electricity
`tools/make_electric.py` merges an Overpass export of OpenStreetMap power features (lines with voltage, ESB substations, transformers, solar panels, poles) with points read from the Tailte Éireann PRIME2 1:1000 DWG sheets (local substations, transformer poles, pylons, poles; converted with LibreDWG, see `PRIME2_utility_points_ITM.csv`) into `data/electric.json`, flagging substations and transformers in today's OPW flood zones and with the sea 1 m higher.

## New homes sold
`tools/make_newhomes.py` turns the Property Price Register's new-dwelling sales (sold with VAT) inside the circle into `data/newhomes.json`: counts by estate or street and year, with no addresses or prices. The sales are placed on Ray's computer by Eircode (GeoDirectory), by the estate or street name in the address (GeoDirectory, OpenStreetMap, Nominatim), or, for estates newer than the maps (Farmhill Manor, The Dartry, Dartry Way), at the planning permission that built them, or at a location Ray confirmed (Tonaphubble Woods; The Tannery, Cairns Hill, which is just outside the circle); `approx` marks estates placed at the road or townland they are named after. Homes built for the Council or housing bodies are not in the register.

## Vacant and zoned land
`tools/make_registers.py` writes `data/registers.json` from two Sligo County Council registers: the Vacant Sites Register (updated October 2024, 14 sites; outlines traced from the Council's scanned 1:2500 site maps, each registered to the building footprints and roads) and the Residential Zoned Land Tax final map for 2026 (Department of Housing open data, CC BY 4.0). Sites and parcels are flagged where they meet today's OPW 1-in-100-year flood zones or the sea 1 m higher. The Derelict Sites Register is not published as data.

## Shoreline of the docks
`tools/make_shoreline.py` takes the docks history files (`docks_change_itm.geojson`, `docks_change_wgs84.geojson`; traced from the Ordnance Survey 1837 and 1910 sheets, with Tailte Éireann's 2023 high-water mark where the shore has not moved) and writes `data/shoreline.json`: the land won from the sea before 1837 (behind the Ballast Wall, 4.4 ha), 1837–1910 (the Deepwater causeway, 2.1 ha) and after 1940 (the Upper Flat, 28.3 ha), with the share of each in the OPW coastal flood zones, and the high-water lines of 1837, 1910 and 2023. Buildings get `rc` (1, 2 or 3) for the period of the land they stand on.

## Protected nature sites
`tools/make_protected.py` clips the NPWS SAC, SPA, NHA and pNHA boundaries (cut to Sligo as GeoJSON) to the model (`data/protected.json`) and gives buildings and planning sites `pz`, the distance to the nearest SAC or SPA up to 200 m. The Garavogue is part of Lough Gill SAC, so much of the town centre is within 50 m of a European site.

## Planning permissions
`tools/make_planning.py` takes the national planning applications service (site outlines and points) for the model's area, as saved from the browser, and writes `data/planning.json`: year decided, decision, a type and number of homes read from the description, and whether each site is in today's OPW 1-in-100-year flood zones or the +1 m sea zone. Names and addresses are not kept. The kiosk's **Planning permissions** layer has a year slider and a play button.

## Cycle routes
`tools/make_cycle.py` turns an Overpass Turbo export of OpenStreetMap cycling ways (the query is in the script's notes) into `data/cycle.json`: cycle tracks, shared paths, painted lanes and shared lanes, plus bike parking, and gives each building `dc`, the distance to the nearest track, path or lane. Rerun it with a fresh export to update.

## Sewers and water mains
- **Sewers:** `tools/make_sewer.py` builds `data/sewer.json` from the 2008 Sligo & Environs sewer network (MapInfo, Irish Grid): reprojected to ITM, shifted 6.5 m west and 5 m north to fit the building footprints, and each pipe turned to run downstream using the network's flow arrows. On the kiosk and projector, dots move downstream to the outfalls.
- **Water mains:** `tools/make_watermains.py` builds `data/watermains.json` from the Sligo County Council Water Services GIS (public water pipes, November 2007; no shift needed). With the 2008 town water model folder as a third argument it also adds the 30 water supply zones, coloured by source (Foxes Den, Kilsellagh, Cairns Hill, or "F" as recorded), and the reservoirs. It also adds the Sligo wastewater treatment plant (Finisklin) and the Foxes Den and Cairns Hill water treatment works, just outside the model, to the kiosk map.
- Both files are published with the site. They are historic records (2007–08) of networks now operated by Uisce Éireann, not a guide to where pipes are today.

## Data
Built by `tools/make_data.py` from the God's Eye public data and the tile-generator outputs (see `tools/`). The town buses come from the Bus Éireann GTFS timetable via `tools/make_buses.py` (rerun it with a new feed when the timetable changes). Credits: Bus Éireann timetable data from the National Transport Authority; contains Irish Public Sector Data (OPW lidar, waterlevel.ie) licensed under CC BY 4.0; © OpenStreetMap contributors (ODbL); CSO Census 2022; SEAI BER; GeoDirectory; Sligo & Environs Development Plan; Tailte Éireann. Deprivation scores are reconstructed from the Pobal HP method and are not official.

The water scenarios are a morphological reconstruction (spill level from the sea or from Lough Gill, the lake stopped at Hyde Bridge) on the 2 m ground model. They are an illustration for discussion, not a flood forecast.

## Reused code
- `js/model-core.js`: the contour, laser-nesting and 3MF code from the Site Model Hub (`raymondmcnally/Site_Model_Hub`).
- The projection method, with four pins, a height correction and a `?out` window, follows the Gleniff Mill exhibition (`raymondmcnally/Gleniff-Mill-Exhibition`), adapted to a round model.
- The query engine comes from Sligo God's Eye.
- Libraries: MapLibre GL 4.7.1, three.js, manifold-3d 3.0.1, JSZip, jsPDF (licences in `vendor/`).

Created by R McNally, ATU Sligo Department of Architecture.
