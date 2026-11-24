# Lincoln Drive

[Play Lincoln Drive on GitHub Pages](https://kalebbennaveed.github.io/go-to-lincoln/)

Start on Lincoln Mall facing the Nebraska State Capitol. Drive a striped red coupe, walk, ride a bicycle, or fly a helicopter. The city map lets you choose a waypoint or travel directly to a landmark. Discover all five stops to complete the tour. Your browser saves your visited stops on this device.

| Control | Action |
| --- | --- |
| WASD or arrow keys | Move, steer, brake and reverse |
| Space | Handbrake |
| Shift | Run on foot |
| 1 / 2 / 3 / 4 | Walk / drive / cycle / fly |
| E / Q | Climb / descend in the helicopter |
| Drag | Look around |
| V | Switch between chase, first-person and overhead cameras |
| M | Open or close the city map |
| Esc or ? | Pause and view controls |

Touch devices have steering, accelerator, brake and flight altitude buttons. The toolbar cycles through three lighting presets and toggles synthesized vehicle audio.

## Local play

Serve the repository with `python3 -m http.server 8000` and open `http://localhost:8000`. The game uses WebGL and ES modules. Three.js, the font, and map data are bundled. GitHub Pages serves the repository root on `main`.

## Geography and credits

The City of Lincoln / Lancaster County GIS provides the [street centerlines](https://gis.lincoln.ne.gov/public/rest/services/Planning/Streets/MapServer/0), [2020 building footprints and heights](https://gis.lincoln.ne.gov/public/rest/services/BuildingSafety/BuildingFootprints/MapServer/5), [parks](https://gis.lincoln.ne.gov/public/rest/services/Parks/ParkBoundaries/MapServer/0), and [water bodies](https://gis.lincoln.ne.gov/public/rest/services/CityCounty/CZSBasemap/MapServer/4). Rebuild the central map with `uv run tools/build_map.py`. Coordinates use local meters east and south of 40.81° N, 96.70° W.

The Capitol, Memorial Stadium, Pinnacle Bank Arena, and Sunken Gardens have custom models. Building facades, road widths, trees, traffic, and lighting are stylized. Terrain is level and missing building heights are estimated.

Inspired by Matt Rubens’s [Go To Ann Arbor](https://github.com/mrubens/go-to-ann-arbor). Rendering uses [Three.js](https://threejs.org/) under the [MIT license](vendor/THREE-LICENSE.txt). Barlow Condensed is distributed under the [SIL Open Font License](vendor/fonts/OFL.txt).
