# /// script
# requires-python = ">=3.10"
# dependencies = ["shapely==2.1.2"]
# ///
"""Build central Lincoln's static game map with `uv run tools/build_map.py`.

Add `--region` to build the wider road network, parks, lakes, and 800 m
building tiles. Both modes share coordinates and can be rebuilt independently.

Source: City of Lincoln / Lancaster County, Nebraska, public ArcGIS services.
Planning/Streets supplies street centerlines and functional classifications.
BuildingSafety/BuildingFootprints layer 5 is the 2020 footprint survey with
average and maximum roof heights in feet. Parks/ParkBoundaries and
CityCounty/CZSBasemap provide park boundaries and water polygons.
Street widths and missing building heights are visual approximations.
The compiled map uses local meters east and south of (-96.7, 40.81).
"""

import argparse
from collections import defaultdict
import json
import math
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode

from shapely import affinity, make_valid, set_precision
from shapely.geometry import box, shape


ROOT = "https://gis.lincoln.ne.gov/public/rest/services/"
ORIGIN = (-96.7, 40.81)
EXTENT = (-96.72, 40.790, -96.67, 40.839)
# Encloses the current CityCounty/CityLimits/MapServer/4 extent with a
# western margin for Lincoln Airport and Pioneers Park.
REGION = (-96.84, 40.69, -96.56, 40.93)
TILE_SIZE = 800
MX = 111320 * math.cos(math.radians(ORIGIN[1]))
MZ = 111320
LAYERS = {
    "roads": ("Planning/Streets/MapServer/0", "STPRE,STNAME,STTYPE,STSUF,TYPE"),
    "buildings": ("BuildingSafety/BuildingFootprints/MapServer/5", "BLDG_AVG_H,BLDG_MAX_H"),
    "parks": ("Parks/ParkBoundaries/MapServer/0", "ParkUnit"),
    "water": ("CityCounty/CZSBasemap/MapServer/4", "NAME"),
}
WIDTH = {10: 13, 20: 17, 30: 17, 40: 17, 50: 12, 60: 9, 70: 7, 80: 6, 90: 6}
STREET_TYPES = {
    "ST": "Street", "AVE": "Avenue", "BLVD": "Boulevard", "DR": "Drive",
    "RD": "Road", "CT": "Court", "CIR": "Circle", "PL": "Place", "HWY": "Highway",
    "LN": "Lane", "PKWY": "Parkway", "TRL": "Trail", "TER": "Terrace",
}


def query(service, **params):
    url = ROOT + service + "/query?" + urlencode(params)
    response = subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--location", "--retry", "3",
         "--max-time", "120", url], check=True, capture_output=True,
    )
    data = json.loads(response.stdout)
    if "error" in data:
        raise RuntimeError(f"{service}: {data['error']}")
    return data


def feature_ids(service, extent):
    return set(query(
        service, f="json", where="1=1", geometry=",".join(map(str, extent)),
        geometryType="esriGeometryEnvelope", inSR=4326, spatialRel="esriSpatialRelIntersects",
        returnIdsOnly="true",
    )["objectIds"] or [])


def features(service, fields, extent, exclude=()):
    ids = sorted(feature_ids(service, extent).difference(exclude))
    print(f"{service}: {len(ids)} source features", file=sys.stderr, flush=True)

    def batch(chunk):
        response = query(service, f="geojson", objectIds=",".join(map(str, chunk)),
                         outFields="OBJECTID," + fields, outSR=4326, returnGeometry="true")
        result = sorted(response["features"], key=lambda f: f["properties"]["OBJECTID"])
        if [f["properties"]["OBJECTID"] for f in result] != chunk:
            raise RuntimeError(f"Incomplete GIS response for {service} at ID {chunk[0]}")
        return result

    with ThreadPoolExecutor(max_workers=4) as pool:
        # Keep GET URLs within common server limits, including comma escapes.
        chunks = (ids[i:i + 450] for i in range(0, len(ids), 450))
        for group in pool.map(batch, chunks):
            yield from group


def parts(geometry, geom_type):
    if geometry.is_empty:
        return
    if geometry.geom_type == geom_type:
        yield geometry
    elif hasattr(geometry, "geoms"):
        for child in geometry.geoms:
            yield from parts(child, geom_type)


def local_geometry(source, clip):
    projected = affinity.affine_transform(shape(source),
        [MX, 0, 0, -MZ, -ORIGIN[0] * MX, ORIGIN[1] * MZ])
    clipped = make_valid(projected).intersection(clip)
    return set_precision(clipped.simplify(0.65, preserve_topology=True), 0.5)


def coords(sequence):
    return [[int(v) if v.is_integer() else v for v in pt] for pt in sequence]


def street_name(props):
    name = (props["STNAME"] or "").strip().title()
    name = re.sub(r"(\d+)(St|Nd|Rd|Th)\b", lambda m: m[0].lower(), name)
    kind = (props["STTYPE"] or "").strip()
    return " ".join(p for p in [
        (props["STPRE"] or "").strip(), name, STREET_TYPES.get(kind, kind.title()),
        (props["STSUF"] or "").strip(),
    ] if p) or "Access Road"


def road_record(line, props):
    name = street_name(props)
    width = 14 if name == "Lincoln Mall" else WIDTH.get(props["TYPE"], 9)
    return {"n": name, "w": width, "p": coords(line.coords)}


def polygon_record(kind, poly, props):
    if kind == "buildings":
        # Use the average roof surface for flat extrusions. A peak height over
        # a whole church or stadium footprint would badly overstate its mass.
        feet = props["BLDG_AVG_H"] or props["BLDG_MAX_H"]
        h = feet * 0.3048 if feet and feet > 0 else (4 if poly.area < 70 else 8)
        record = {"h": round(max(2.5, h), 1)}
    else:
        name = props["ParkUnit" if kind == "parks" else "NAME"]
        record = {"n": (name or "").strip()}
    record["p"] = coords(poly.exterior.coords[:-1])
    if poly.interiors:
        record["holes"] = [coords(ring.coords[:-1]) for ring in poly.interiors]
    return record


def build(regional=False):
    extent = REGION if regional else EXTENT
    clip = box((extent[0] - ORIGIN[0]) * MX, (ORIGIN[1] - extent[3]) * MZ,
               (extent[2] - ORIGIN[0]) * MX, (ORIGIN[1] - extent[1]) * MZ)
    city = {"bounds": [round(v) for v in clip.bounds]}
    tiles = defaultdict(list)
    for kind, (service, fields) in LAYERS.items():
        records = []
        tile_buildings = regional and kind == "buildings"
        # The core already contains these IDs, including partially clipped
        # footprints at its boundary. Never draw an overlapping second copy.
        exclude = feature_ids(service, EXTENT) if tile_buildings else ()
        for item in features(service, fields, extent, exclude):
            if item["geometry"] is None:
                continue
            geom = local_geometry(item["geometry"], clip)
            props = item["properties"]
            if kind == "roads":
                records.extend(road_record(line, props) for line in parts(geom, "LineString")
                               if line.length >= 1)
            else:
                for poly in parts(geom, "Polygon"):
                    if poly.area < 3:
                        continue
                    record = polygon_record(kind, poly, props)
                    if tile_buildings:
                        x0, z0, x1, z1 = poly.bounds
                        key = (math.floor((x0 + x1) / (2 * TILE_SIZE)),
                               math.floor((z0 + z1) / (2 * TILE_SIZE)))
                        tiles[key].append(record)
                    else:
                        records.append(record)
        if tile_buildings:
            city["tiles"] = {f"{x},{z}": len(batch) for (x, z), batch in sorted(tiles.items())}
            count = sum(city["tiles"].values())
        else:
            city[kind] = records
            count = len(records)
        print(f"  wrote {count} clipped {kind}", file=sys.stderr, flush=True)
    return city, tiles


def save(path, records):
    path.write_text(json.dumps(records, separators=(",", ":"), allow_nan=False) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", action="store_true", help="build regional map and tiles")
    args = parser.parse_args()
    result, tiles = build(regional=args.region)
    destination = Path(__file__).resolve().parents[1] / "data"
    destination.mkdir(exist_ok=True)
    if args.region:
        tile_dir = destination / "tiles"
        tile_dir.mkdir(exist_ok=True)
        for (x, z), batch in tiles.items():
            save(tile_dir / f"{x}_{z}.json", batch)
    save(destination / ("region.json" if args.region else "city.json"), result)
