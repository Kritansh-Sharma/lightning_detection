"""
Bhu-Drishti — Realistic Seed Data Generator
Pre-populates the database with authentic Indian ground-truth survey points.
"""

import random
import uuid
from datetime import datetime, timedelta, timezone

import database

# ── Real Indian survey regions with accurate coordinates ──
REGIONS = [
    # (lat, lon, class_id, class_name, notes_pool, alt_range)
    (30.90, 75.85, 1, "Cropland",         ["Wheat stubble field", "Rabi wheat crop, 45 days old", "Paddy harvested, straw visible"], (220, 260)),
    (29.96, 76.87, 1, "Cropland",         ["Basmati rice paddy, knee-high", "Sugarcane plantation", "Mustard in bloom"], (230, 250)),
    (20.93, 77.77, 1, "Cropland",         ["Cotton bolls ready for picking", "Soybean crop, Kharif season", "Orange orchards, Nagpur belt"], (300, 340)),
    (26.14, 91.77, 1, "Cropland",         ["Tea gardens, Assam second flush", "Bamboo grove edge near plantation", "Rice paddy, flooded field"], (60, 100)),
    (10.52, 76.21, 2, "Forest",           ["Dense tropical evergreen canopy", "Teak plantation, 15-yr growth", "Mixed deciduous, bamboo understory"], (40, 500)),
    (29.53, 78.77, 2, "Forest",           ["Sal forest, Jim Corbett buffer zone", "Riverine grassland with scattered trees", "Mixed conifer-broadleaf transition"], (400, 700)),
    (11.40, 76.69, 2, "Forest",           ["Shola grassland-forest mosaic", "Nilgiri montane forest, misty canopy", "Eucalyptus plantation edge"], (1800, 2400)),
    (28.61, 77.21, 3, "Urban / Built-up", ["Multi-storey residential, South Delhi", "Commercial market, Connaught Place vicinity", "Metro construction corridor"], (210, 230)),
    (19.08, 72.88, 3, "Urban / Built-up", ["Highrise cluster, Bandra-Kurla Complex", "Slum redevelopment zone", "Coastal road construction"], (5, 25)),
    (12.97, 77.59, 3, "Urban / Built-up", ["IT park campus, Whitefield", "Residential layout, HSR Layout", "Lake encroachment, Bellandur edge"], (880, 940)),
    (19.72, 85.32, 4, "Water Body",       ["Chilika Lake, brackish water, clear", "Mudflat edge with flamingos visible", "Fishing boat jetty area"], (0, 5)),
    (21.95, 88.90, 4, "Water Body",       ["Sundarbans tidal creek, mangrove-lined", "Estuarine channel, turbid monsoon flow", "Fish pond adjacent to mangrove"], (0, 5)),
    (34.09, 74.84, 4, "Water Body",       ["Dal Lake, shikara zone", "Floating vegetable garden (rad)", "Lakeside marsh, winter migratory birds"], (1580, 1600)),
    (26.92, 70.90, 5, "Barren / Fallow",  ["Sandy desert, sparse scrub", "Thar dune ridge, wind-sculpted", "Fallow grazing land, seasonal"], (90, 200)),
    (34.15, 77.58, 5, "Barren / Fallow",  ["Cold desert moraine, Ladakh", "Rocky barren slope, altitude >3500m", "Glacial outwash plain, no vegetation"], (3400, 4000)),
    (23.73, 69.86, 5, "Barren / Fallow",  ["Rann of Kutch salt flat, white crust", "Seasonal wetland, now dry", "Sparse halophyte scrub"], (5, 20)),
]

SURVEYORS = [
    "Aarav Sharma", "Priya Verma", "Rohan Patel", "Sneha Iyer",
    "Vikram Singh", "Anjali Desai", "Karthik Menon", "Neha Gupta",
    "Arjun Nair", "Deepika Reddy", "Suresh Kumar", "Meera Joshi",
    "Raj Malhotra", "Anita Sharma", "Mohan Singh", "Ramesh Yadav",
]


def generate_seed_submissions(count: int = 50) -> list[dict]:
    """Generate realistic ground-truth submissions across India."""
    submissions = []
    now = datetime.now(timezone.utc)

    for i in range(count):
        region = random.choice(REGIONS)
        base_lat, base_lon, cls_id, cls_name, notes_pool, alt_range = region

        # Small jitter to spread points around the region centre
        lat = base_lat + random.uniform(-0.015, 0.015)
        lon = base_lon + random.uniform(-0.015, 0.015)

        # Realistic quality scores (mostly passing)
        blur = round(random.uniform(110, 380), 2)
        bright = round(random.uniform(70, 190), 2)

        # Verification distribution: 78 % verified, 16 % pending, 6 % rejected
        r = random.random()
        if r < 0.78:
            status = "verified"
        elif r < 0.94:
            status = "pending"
        else:
            status = "rejected"

        ts = now - timedelta(
            days=random.randint(0, 30),
            hours=random.randint(6, 18),
            minutes=random.randint(0, 59),
        )

        submissions.append({
            "id": str(uuid.uuid4()),
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "accuracy": round(random.uniform(2.0, 9.5), 1),
            "lulc_class": cls_name,
            "lulc_class_id": cls_id,
            "image_filename": None,  # demo seeds have no image
            "blur_score": blur,
            "brightness": bright,
            "quality_status": "passed",
            "verification_status": status,
            "surveyor_id": random.choice(SURVEYORS),
            "surveyor_role": "citizen",
            "notes": random.choice(notes_pool),
            "compass_heading": round(random.uniform(0, 360), 1),
            "altitude": round(random.uniform(*alt_range), 1),
            "created_at": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        })

    return submissions


import sys

# Ensure UTF-8 output on Windows consoles
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


def seed_database(db_path: str = "bhu_drishti.db", count: int = 50) -> int:
    """Generate seed data and insert into database. Returns count inserted."""
    database.init_db(db_path)
    data = generate_seed_submissions(count)
    for item in data:
        database.insert_submission(item, db_path)
    try:
        print(f"[OK] Seeded {len(data)} ground-truth points into {db_path}")
    except Exception:
        pass
    return len(data)


if __name__ == "__main__":
    seed_database()
