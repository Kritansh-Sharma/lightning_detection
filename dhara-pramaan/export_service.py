"""
Bhu-Drishti — ISRO Pipeline Export Service
GeoJSON (OGC WGS84), CSV (Bhuvan LULC), and STAC metadata generation.
"""

import csv
import io
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from database import LULC_CLASSES

logger = logging.getLogger("bhu_drishti.export")


def export_geojson(submissions: list[dict], filepath: Optional[str] = None):
    """
    Generate OGC-compliant GeoJSON FeatureCollection (EPSG:4326).
    Returns dict if no filepath, else writes file and returns path.
    """
    features = []
    for s in submissions:
        cls_info = LULC_CLASSES.get(s.get("lulc_class_id", 0), {})
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [s["longitude"], s["latitude"]],
            },
            "properties": {
                "id": s.get("id"),
                "lulc_class": s.get("lulc_class"),
                "lulc_class_id": s.get("lulc_class_id"),
                "lulc_class_hi": cls_info.get("name_hi", ""),
                "accuracy_m": s.get("accuracy"),
                "blur_score": s.get("blur_score"),
                "brightness": s.get("brightness"),
                "quality_status": s.get("quality_status"),
                "verification_status": s.get("verification_status"),
                "surveyor_id": s.get("surveyor_id"),
                "notes": s.get("notes"),
                "compass_heading": s.get("compass_heading"),
                "altitude": s.get("altitude"),
                "timestamp": s.get("created_at"),
                "image_filename": s.get("image_filename"),
                "image_width_px": s.get("image_width_px"),
                "image_height_px": s.get("image_height_px"),
            },
        }
        features.append(feature)

    collection = {
        "type": "FeatureCollection",
        "name": "Bhu-Drishti Ground Truth Dataset",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:EPSG::4326"},
        },
        "features": features,
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_features": len(features),
            "source": "Bhu-Drishti Citizen Science Portal",
            "standard": "OGC GeoJSON / ISRO Bhuvan LULC Level-1",
        },
    }

    if filepath:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(collection, f, indent=2, ensure_ascii=False)
        logger.info("GeoJSON exported to %s (%d features)", filepath, len(features))
        return filepath
    return collection


def export_csv(submissions: list[dict], filepath: Optional[str] = None) -> str:
    """
    Generate RFC 4180 CSV formatted for Bhuvan LULC standards.
    Returns CSV string or writes to file.
    """
    headers = [
        "point_id", "latitude", "longitude", "accuracy_m",
        "lulc_class_id", "lulc_class_name", "lulc_class_name_hi",
        "blur_score", "brightness", "quality_status",
        "verification_status", "surveyor_id", "timestamp",
        "notes", "image_filename", "image_width_px", "image_height_px",
    ]

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()

    for s in submissions:
        cls_info = LULC_CLASSES.get(s.get("lulc_class_id", 0), {})
        writer.writerow({
            "point_id": s.get("id"),
            "latitude": s.get("latitude"),
            "longitude": s.get("longitude"),
            "accuracy_m": s.get("accuracy"),
            "lulc_class_id": s.get("lulc_class_id"),
            "lulc_class_name": s.get("lulc_class"),
            "lulc_class_name_hi": cls_info.get("name_hi", ""),
            "blur_score": s.get("blur_score"),
            "brightness": s.get("brightness"),
            "quality_status": s.get("quality_status"),
            "verification_status": s.get("verification_status"),
            "surveyor_id": s.get("surveyor_id"),
            "timestamp": s.get("created_at"),
            "notes": s.get("notes"),
            "image_filename": s.get("image_filename"),
            "image_width_px": s.get("image_width_px"),
            "image_height_px": s.get("image_height_px"),
        })

    csv_text = buf.getvalue()
    if filepath:
        with open(filepath, "w", encoding="utf-8", newline="") as f:
            f.write(csv_text)
        logger.info("CSV exported to %s (%d rows)", filepath, len(submissions))
        return filepath
    return csv_text


def export_stac_metadata(submissions: list[dict]) -> dict:
    """Generate a STAC-like catalog metadata summary."""
    if not submissions:
        return {"type": "Catalog", "stac_version": "1.0.0", "id": "bhu-drishti-empty", "description": "No data", "links": []}

    lats = [s["latitude"] for s in submissions if s.get("latitude")]
    lons = [s["longitude"] for s in submissions if s.get("longitude")]
    times = [s.get("created_at", "") for s in submissions if s.get("created_at")]

    class_dist = {}
    for s in submissions:
        cn = s.get("lulc_class", "Unknown")
        class_dist[cn] = class_dist.get(cn, 0) + 1

    return {
        "type": "Catalog",
        "stac_version": "1.0.0",
        "id": "bhu-drishti-ground-truth",
        "title": "Bhu-Drishti Ground Truth Dataset",
        "description": "Crowdsourced ground-truth LULC labels for ISRO satellite AI training",
        "extent": {
            "spatial": {"bbox": [[min(lons), min(lats), max(lons), max(lats)]]},
            "temporal": {"interval": [[min(times), max(times)]]},
        },
        "summaries": {
            "total_points": len(submissions),
            "lulc_class_distribution": class_dist,
            "projection": "EPSG:4326",
        },
        "links": [
            {"rel": "self", "href": "/api/export/stac", "type": "application/json"},
            {"rel": "data", "href": "/api/export/geojson", "type": "application/geo+json"},
        ],
    }
