"""
Bhu-Drishti — Database Layer
SQLite database with full CRUD for ground-truth submissions.
"""

import sqlite3
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger("bhu_drishti.database")

# ── ISRO Bhuvan Level-1 LULC Taxonomy ──
LULC_CLASSES = {
    1: {"name": "Cropland", "name_hi": "कृषि भूमि", "color": "#FFD700", "emoji": "🌾"},
    2: {"name": "Forest", "name_hi": "वन / हरित आवरण", "color": "#228B22", "emoji": "🌲"},
    3: {"name": "Urban / Built-up", "name_hi": "शहरी / निर्माण", "color": "#DC143C", "emoji": "🏢"},
    4: {"name": "Water Body", "name_hi": "जल निकाय", "color": "#1E90FF", "emoji": "💧"},
    5: {"name": "Barren / Fallow", "name_hi": "बंजर / परती", "color": "#8B4513", "emoji": "🏜️"},
}

DB_PATH = "bhu_drishti.db"

CREATE_SUBMISSIONS = """
CREATE TABLE IF NOT EXISTS submissions (
    id                  TEXT PRIMARY KEY,
    latitude            REAL NOT NULL,
    longitude           REAL NOT NULL,
    accuracy            REAL,
    lulc_class          TEXT NOT NULL,
    lulc_class_id       INTEGER NOT NULL,
    image_filename      TEXT,
    image_width_px      INTEGER,
    image_height_px     INTEGER,
    blur_score          REAL,
    brightness          REAL,
    quality_status      TEXT DEFAULT 'passed',
    verification_status TEXT DEFAULT 'pending',
    surveyor_id         TEXT,
    surveyor_role       TEXT DEFAULT 'citizen',
    notes               TEXT,
    compass_heading     REAL,
    altitude            REAL,
    created_at          TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
"""

CREATE_USERS = """
CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    role       TEXT DEFAULT 'citizen',
    mobile     TEXT UNIQUE,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
"""

CREATE_REWARD_GAME_PLAYS = """
CREATE TABLE IF NOT EXISTS reward_game_plays (
    surveyor_id TEXT NOT NULL,
    game_date  TEXT NOT NULL,
    game_id    TEXT NOT NULL,
    is_correct INTEGER NOT NULL,
    points     INTEGER NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    PRIMARY KEY (surveyor_id, game_date, game_id)
);
"""


def _get_conn(db_path: str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(db_path: str = DB_PATH) -> None:
    """Create tables if they don't exist."""
    with _get_conn(db_path) as conn:
        conn.execute(CREATE_SUBMISSIONS)
        conn.execute(CREATE_USERS)
        conn.execute(CREATE_REWARD_GAME_PLAYS)
        existing_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(submissions)")
        }
        for column in ("image_width_px", "image_height_px"):
            if column not in existing_columns:
                conn.execute(f"ALTER TABLE submissions ADD COLUMN {column} INTEGER")
        conn.commit()
    logger.info("Database initialised at %s", db_path)


def insert_submission(data: dict, db_path: str = DB_PATH) -> str:
    """Insert a ground-truth submission. Returns the new UUID."""
    sid = data.get("id", str(uuid.uuid4()))
    cols = [
        "id", "latitude", "longitude", "accuracy",
        "lulc_class", "lulc_class_id", "image_filename",
        "image_width_px", "image_height_px",
        "blur_score", "brightness", "quality_status",
        "verification_status", "surveyor_id", "surveyor_role",
        "notes", "compass_heading", "altitude", "created_at",
    ]
    values = {
        "id": sid,
        "latitude": data["latitude"],
        "longitude": data["longitude"],
        "accuracy": data.get("accuracy"),
        "lulc_class": data.get("lulc_class", ""),
        "lulc_class_id": data.get("lulc_class_id", 0),
        "image_filename": data.get("image_filename"),
        "image_width_px": data.get("image_width_px"),
        "image_height_px": data.get("image_height_px"),
        "blur_score": data.get("blur_score"),
        "brightness": data.get("brightness"),
        "quality_status": data.get("quality_status", "passed"),
        "verification_status": data.get("verification_status", "pending"),
        "surveyor_id": data.get("surveyor_id"),
        "surveyor_role": data.get("surveyor_role", "citizen"),
        "notes": data.get("notes"),
        "compass_heading": data.get("compass_heading"),
        "altitude": data.get("altitude"),
        "created_at": data.get("created_at", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")),
    }
    placeholders = ", ".join(f":{c}" for c in cols)
    col_names = ", ".join(cols)
    sql = f"INSERT INTO submissions ({col_names}) VALUES ({placeholders})"
    with _get_conn(db_path) as conn:
        conn.execute(sql, values)
        conn.commit()
    logger.info("Inserted submission %s", sid)
    return sid


def get_all_submissions(
    filters: Optional[dict] = None,
    db_path: str = DB_PATH,
) -> list[dict]:
    """Return submissions with optional filters (lulc_class, status, limit, offset)."""
    sql = "SELECT * FROM submissions WHERE 1=1"
    params: list = []
    if filters:
        if filters.get("lulc_class"):
            sql += " AND lulc_class = ?"
            params.append(filters["lulc_class"])
        if filters.get("status"):
            sql += " AND verification_status = ?"
            params.append(filters["status"])
    sql += " ORDER BY created_at DESC"
    if filters and filters.get("limit"):
        sql += " LIMIT ?"
        params.append(int(filters["limit"]))
        if filters.get("offset"):
            sql += " OFFSET ?"
            params.append(int(filters["offset"]))
    with _get_conn(db_path) as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def get_farmer_rewards(surveyor_id: str, game_date: str, db_path: str = DB_PATH) -> dict:
    """Calculate a farmer's XP and milestones from photo-backed submissions."""
    with _get_conn(db_path) as conn:
        submission_counts = conn.execute(
            """
            SELECT COUNT(*) AS submissions,
                   SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) AS accepted
            FROM submissions
            WHERE surveyor_id = ? AND image_filename IS NOT NULL
            """,
            (surveyor_id,),
        ).fetchone()
        game_stats = conn.execute(
            """
            SELECT COALESCE(SUM(points), 0) AS points,
                   COUNT(*) AS plays,
                   MAX(CASE WHEN game_date = ? THEN 1 ELSE 0 END) AS played_today
            FROM reward_game_plays
            WHERE surveyor_id = ?
            """,
            (game_date, surveyor_id),
        ).fetchone()

    submissions = submission_counts["submissions"] or 0
    accepted = submission_counts["accepted"] or 0
    game_points = game_stats["points"] or 0
    total_points = accepted * 10 + game_points
    return {
        "submissions": submissions,
        "accepted": accepted,
        "points": total_points,
        "submission_points": accepted * 10,
        "game_points": game_points,
        "games_played": game_stats["plays"] or 0,
        "quiz_played_today": bool(game_stats["played_today"]),
        "badges": [
            {"id": "first-submission", "title": "First Field Note", "earned": submissions >= 1, "progress": min(submissions, 1), "goal": 1},
            {"id": "first-accepted", "title": "Trusted Scout", "earned": accepted >= 1, "progress": min(accepted, 1), "goal": 1},
            {"id": "ten-submissions", "title": "Field Cartographer", "earned": submissions >= 10, "progress": min(submissions, 10), "goal": 10},
            {"id": "field-scholar", "title": "Field Scholar", "earned": (game_stats["plays"] or 0) >= 1, "progress": min(game_stats["plays"] or 0, 1), "goal": 1},
        ],
    }


def record_farmer_game_play(
    surveyor_id: str,
    game_date: str,
    game_id: str,
    is_correct: bool,
    points: int,
    db_path: str = DB_PATH,
) -> bool:
    """Record a daily game result once. Returns false when already played."""
    with _get_conn(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO reward_game_plays
                (surveyor_id, game_date, game_id, is_correct, points)
            VALUES (?, ?, ?, ?, ?)
            """,
            (surveyor_id, game_date, game_id, int(is_correct), points),
        )
        conn.commit()
    return cursor.rowcount == 1


def get_submission_by_id(sid: str, db_path: str = DB_PATH) -> Optional[dict]:
    with _get_conn(db_path) as conn:
        row = conn.execute("SELECT * FROM submissions WHERE id = ?", (sid,)).fetchone()
    return dict(row) if row else None


def update_verification_status(
    sid: str, status: str, reviewer_id: Optional[str] = None, db_path: str = DB_PATH
) -> bool:
    with _get_conn(db_path) as conn:
        cur = conn.execute(
            "UPDATE submissions SET verification_status = ? WHERE id = ?",
            (status, sid),
        )
        conn.commit()
    return cur.rowcount > 0


def delete_submission(sid: str, db_path: str = DB_PATH) -> bool:
    with _get_conn(db_path) as conn:
        cur = conn.execute("DELETE FROM submissions WHERE id = ?", (sid,))
        conn.commit()
    return cur.rowcount > 0


def get_statistics(db_path: str = DB_PATH) -> dict:
    """Aggregate statistics for the dashboard."""
    with _get_conn(db_path) as conn:
        total = conn.execute("SELECT COUNT(*) FROM submissions").fetchone()[0]
        verified = conn.execute(
            "SELECT COUNT(*) FROM submissions WHERE verification_status='verified'"
        ).fetchone()[0]
        pending = conn.execute(
            "SELECT COUNT(*) FROM submissions WHERE verification_status='pending'"
        ).fetchone()[0]
        rejected = conn.execute(
            "SELECT COUNT(*) FROM submissions WHERE verification_status='rejected'"
        ).fetchone()[0]

        by_class_rows = conn.execute(
            "SELECT lulc_class, lulc_class_id, COUNT(*) as cnt FROM submissions GROUP BY lulc_class_id"
        ).fetchall()

        avg_row = conn.execute(
            "SELECT AVG(accuracy), AVG(blur_score) FROM submissions WHERE accuracy IS NOT NULL"
        ).fetchone()

        states_row = conn.execute(
            "SELECT COUNT(DISTINCT surveyor_id) FROM submissions"
        ).fetchone()

    by_class = {r["lulc_class"]: {"count": r["cnt"], "class_id": r["lulc_class_id"]} for r in by_class_rows}

    return {
        "total": total,
        "verified": verified,
        "pending": pending,
        "rejected": rejected,
        "by_class": by_class,
        "mean_accuracy": round(avg_row[0], 2) if avg_row[0] else 0,
        "mean_blur": round(avg_row[1], 2) if avg_row[1] else 0,
        "unique_surveyors": states_row[0] if states_row else 0,
    }


def get_submissions_for_export(
    status_filter: str = "verified", db_path: str = DB_PATH
) -> list[dict]:
    """Get submissions filtered by verification status for ISRO export."""
    with _get_conn(db_path) as conn:
        if status_filter == "all":
            rows = conn.execute("SELECT * FROM submissions ORDER BY created_at DESC").fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM submissions WHERE verification_status = ? ORDER BY created_at DESC",
                (status_filter,),
            ).fetchall()
    return [dict(r) for r in rows]
