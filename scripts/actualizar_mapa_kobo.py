#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrae encuestas georreferenciadas desde KoboToolbox (atEpQptwTpdr8v5yhWZufq),
aplica filtro de consentimiento y point-in-polygon contra las 65 parroquias de Quito,
y genera private/mapa_quito.json para el Mapa Interactivo del Tablero.
"""
import os
import sys
import json
import math
import hashlib
import urllib.request
import geopandas as gpd
from shapely.geometry import Point

KOBO_HOST = "https://kf.kobotoolbox.org"
FORM_UID = "atEpQptwTpdr8v5yhWZufq"
GEOJSON_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "quito_parroquias.geojson")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "private", "mapa_quito.json")

CIRC_MAP = {
    "1": "Urbana Norte",
    "2": "Urbana Centro",
    "3": "Urbana Sur",
    "4": "Rural",
}

ALCALDE_MAP = {
    "2": "pabel",
    "7": "burbano",
    "8": "yunda",
    "79": "merino",
    "3": "jijon",
    "70": "nulo_blanco",
    "0": "indecisos",
}

PREFECTO_MAP = {
    "2": "tonello",
    "7": "ubidia",
    "8": "cevallos",
    "79": "zapata",
    "18": "churuchumbi",
    "70": "nulo_blanco",
    "0": "indecisos",
}


def fetch_all_kobo_submissions(token):
    results = []
    url = f"{KOBO_HOST}/api/v2/assets/{FORM_UID}/data/?format=json&limit=1000"
    while url:
        req = urllib.request.Request(url, headers={"Authorization": f"Token {token}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = json.loads(r.read().decode())
        results.extend(payload.get("results", []))
        url = payload.get("next")
    return results


def deterministic_jitter(lat, lon, sid, meters=22.0):
    h = hashlib.md5(str(sid).encode()).hexdigest()
    a = (int(h[:8], 16) / 0xFFFFFFFF) * 2 * math.pi
    r = math.sqrt(int(h[8:16], 16) / 0xFFFFFFFF) * meters
    dlat = (r * math.cos(a)) / 111320.0
    dlon = (r * math.sin(a)) / (111320.0 * math.cos(math.radians(lat)))
    return round(lat + dlat, 5), round(lon + dlon, 5)


def main():
    token = os.environ.get("KOBO_API_TOKEN") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not token:
        raise SystemExit("Falta KOBO_API_TOKEN")

    subs = fetch_all_kobo_submissions(token)
    print(f"Total envios Kobo descargados: {len(subs)}")

    parr_gdf = gpd.read_file(GEOJSON_PATH)
    if parr_gdf.crs is None:
        parr_gdf = parr_gdf.set_crs(epsg=4326)
    sindex = parr_gdf.sindex

    points = []
    parish_stats = {}
    skipped_consent = 0
    skipped_geo = 0
    skipped_outside = 0

    for row in subs:
        if str(row.get("consentimiento", "")).strip() != "1":
            skipped_consent += 1
            continue
        geo = row.get("_geolocation")
        if not geo or len(geo) < 2 or geo[0] is None or geo[1] is None:
            skipped_geo += 1
            continue
        try:
            lat, lon = float(geo[0]), float(geo[1])
        except (TypeError, ValueError):
            skipped_geo += 1
            continue
        if not (-1.0 <= lat <= 0.5 and -79.2 <= lon <= -77.8):
            skipped_outside += 1
            continue

        pt = Point(lon, lat)
        cand_idx = list(sindex.intersection(pt.bounds))
        parr_name = None
        codpar = None
        for idx in cand_idx:
            poly = parr_gdf.iloc[idx].geometry
            if poly.contains(pt):
                parr_name = str(parr_gdf.iloc[idx]["PARROQUIA"]).strip()
                codpar = str(parr_gdf.iloc[idx]["CODPAR"]).strip()
                break
        if not parr_name:
            skipped_outside += 1
            continue

        circ_code = str(row.get("group_localizacion/circuns", "")).strip()
        circ = CIRC_MAP.get(circ_code, "Quito")

        p5 = str(row.get("group_escenario_electoral/p5", "")).strip()
        p9 = str(row.get("group_escenario_electoral/p9", "")).strip()
        alc = ALCALDE_MAP.get(p5, "otros")
        pref = PREFECTO_MAP.get(p9, "otros")

        jlat, jlon = deterministic_jitter(lat, lon, row.get("_id", len(points)))
        points.append({
            "la": jlat,
            "lo": jlon,
            "p": parr_name,
            "cp": codpar,
            "c": circ,
            "a": alc,
            "pr": pref,
        })

        if codpar not in parish_stats:
            parish_stats[codpar] = {
                "parroquia": parr_name,
                "circ": circ,
                "n": 0,
                "alcalde": {},
                "prefecto": {},
            }
        ps = parish_stats[codpar]
        ps["n"] += 1
        ps["alcalde"][alc] = ps["alcalde"].get(alc, 0) + 1
        ps["prefecto"][pref] = ps["prefecto"].get(pref, 0) + 1

    payload = {
        "total_kobo": len(subs),
        "total_puntos": len(points),
        "parroquias_cubiertas": len(parish_stats),
        "parroquias": parish_stats,
        "puntos": points,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    print(f"Puntos validos dentro de Quito: {len(points)} | Parroquias cubiertas: {len(parish_stats)}")
    print(f"Descartados -> consentimiento!=1: {skipped_consent}, sin GPS: {skipped_geo}, fuera de Quito: {skipped_outside}")


if __name__ == "__main__":
    main()
