"""
Bhu-Drishti — FastAPI Server
Complete backend serving REST API + static frontend + image uploads.
"""

import json
import logging
import os
import secrets
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

import database
import export_service
import quality_checker

# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-28s  %(levelname)-7s  %(message)s",
)
logger = logging.getLogger("bhu_drishti.server")

# ── Paths ──
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
STATIC_DIR = BASE_DIR / "static"
DB_PATH = str(BASE_DIR / "bhu_drishti.db")

# ── App ──
app = FastAPI(
    title="Bhu-Drishti API",
    description="National Ground-Truth Validation Portal for ISRO LULC Models",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup ──
@app.on_event("startup")
def on_startup():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    database.init_db(DB_PATH)

    # Auto-seed if database is empty
    stats = database.get_statistics(DB_PATH)
    if stats["total"] == 0:
        logger.info("Empty database detected — running seed data …")
        import seed_data
        seed_data.seed_database(DB_PATH, count=50)

    logger.info("🛰️  Bhu-Drishti server started  |  DB: %s", DB_PATH)

    # Automatically open browser so user does not need to copy-paste URL
    import threading
    import webbrowser
    def _open_browser():
        try:
            webbrowser.open("http://localhost:8000")
        except Exception:
            pass
    threading.Timer(1.2, _open_browser).start()


# ── Mount static & upload dirs ──
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ════════════════════════════════════════════
#  PAGE ROUTES
# ════════════════════════════════════════════

@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/static/index.html")


# ════════════════════════════════════════════
#  AUTHENTICATION & OTP ENDPOINTS
# ════════════════════════════════════════════

# In-memory OTP storage: {mobile: {"otp": "...", "role": "...", "created_at": ...}}
OTP_STORE = {}
ACTIVE_SESSIONS = {}


def _create_session(user: dict) -> str:
    token = secrets.token_urlsafe(32)
    ACTIVE_SESSIONS[token] = {
        "user": user,
        "expires_at": datetime.now(timezone.utc).timestamp() + 8 * 60 * 60,
    }
    return token


def _get_session_user(authorization: str | None) -> dict | None:
    scheme, _, token = authorization.partition(" ") if isinstance(authorization, str) else ("", "", "")
    session = ACTIVE_SESSIONS.get(token) if scheme.lower() == "bearer" else None
    if not session or session["expires_at"] <= datetime.now(timezone.utc).timestamp():
        return None
    return session["user"]


def _require_farmer_session(authorization: str | None) -> dict:
    user = _get_session_user(authorization)
    if not user:
        raise HTTPException(401, "Please sign in again to view farmer rewards")
    if user.get("role") != "farmer":
        raise HTTPException(403, "Farmer rewards are available to farmer accounts only")
    return user


def _require_staff_session(authorization: str | None) -> dict:
    user = _get_session_user(authorization)
    if not user:
        raise HTTPException(401, "Please sign in again to perform this action")
    if user.get("role") not in ("analyst", "admin"):
        raise HTTPException(403, "Only analysts and administrators can perform this action")
    return user

@app.post("/api/auth/send-otp")
def send_otp(body: dict):
    """Generate and dispatch simulated SMS OTP."""
    import random
    mobile = str(body.get("mobile", "")).strip().replace(" ", "").replace("-", "")
    role = body.get("role", "farmer")
    if not mobile or len(mobile) < 10:
        raise HTTPException(400, "Please enter a valid 10-digit mobile number")

    otp = str(random.randint(100000, 999999))
    OTP_STORE[mobile] = {
        "otp": otp,
        "role": role,
        "created_at": datetime.now(timezone.utc)
    }
    logger.info("OTP generated for %s (role: %s): %s", mobile, role, otp)
    return {
        "status": "success",
        "message": f"OTP successfully dispatched via SMS to +91 {mobile[-10:]}",
        "mobile": mobile,
        "demo_otp": otp,  # Displayed in simulated SMS toast for easy judge demonstration
        "expires_in_seconds": 300,
    }


@app.post("/api/auth/verify-otp")
def verify_otp(body: dict):
    """Verify submitted OTP and return user session object."""
    mobile = str(body.get("mobile", "")).strip().replace(" ", "").replace("-", "")
    otp = str(body.get("otp", "")).strip()
    role = body.get("role", "farmer")
    if role not in ("farmer", "analyst", "admin"):
        raise HTTPException(400, "Invalid user role")

    record = OTP_STORE.get(mobile)
    # Validate against generated OTP or universal testing code 123456
    if otp == "123456" or (record and record.get("otp") == otp):
        role_titles = {
            "farmer": f"Kisan_Mitra_{mobile[-4:]}",
            "analyst": f"Dr_Scientist_{mobile[-4:]}",
            "admin": f"Nodal_Officer_{mobile[-4:]}",
        }
        name = role_titles.get(role, f"Surveyor_{mobile[-4:]}")
        user = {
            "id": f"{role}_{mobile[-4:]}",
            "name": name,
            "role": role,
            "mobile": mobile,
        }
        return {
            "status": "verified",
            "user": user,
            "access_token": _create_session(user),
        }
    raise HTTPException(400, "Invalid OTP code. Please enter the 6-digit code received via SMS.")


@app.post("/api/auth/demo-login")
def demo_login(body: dict):
    """Create a short-lived session for an explicitly labeled demo profile."""
    profiles = {
        "farmer": {"id": "demo_farmer", "name": "Ramesh Yadav", "role": "farmer"},
        "analyst": {"id": "demo_analyst", "name": "Dr. Ananya Rao", "role": "analyst"},
        "admin": {"id": "demo_admin", "name": "Meera Kulkarni", "role": "admin"},
    }
    user = profiles.get(body.get("role"))
    if not user:
        raise HTTPException(400, "Invalid demo profile")
    return {"user": user, "access_token": _create_session(user)}


@app.get("/api/farmer/rewards")
def farmer_rewards(authorization: str | None = Header(default=None)):
    user = _require_farmer_session(authorization)
    today = datetime.now(timezone.utc).date().isoformat()
    return database.get_farmer_rewards(user["id"], today, DB_PATH)


@app.post("/api/farmer/rewards/quiz")
def submit_farmer_quiz(
    body: dict,
    authorization: str | None = Header(default=None),
):
    user = _require_farmer_session(authorization)
    answer = body.get("answer")
    if answer not in ("crop-rows", "portrait", "sky"):
        raise HTTPException(400, "Choose one of the listed answers")

    game_date = datetime.now(timezone.utc).date().isoformat()
    correct = answer == "crop-rows"
    awarded_points = 5 if correct else 0
    recorded = database.record_farmer_game_play(
        user["id"], game_date, "field-photo-basics", correct, awarded_points, DB_PATH
    )
    if not recorded:
        raise HTTPException(409, "Today's field-scout challenge has already been played")

    return {
        "correct": correct,
        "points_awarded": awarded_points,
        "rewards": database.get_farmer_rewards(user["id"], game_date, DB_PATH),
    }


# ════════════════════════════════════════════
#  SUBMISSION ENDPOINTS
# ════════════════════════════════════════════

@app.post("/api/submit", status_code=201)
async def submit_ground_truth(
    latitude: float = Form(...),
    longitude: float = Form(...),
    accuracy: float = Form(0.0),
    lulc_class_id: int = Form(...),
    lulc_class: str = Form(""),
    notes: str = Form(""),
    surveyor_id: str = Form("anonymous"),
    compass_heading: float = Form(0.0),
    altitude: float = Form(0.0),
    image: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    """Accept a ground-truth submission with photo and metadata."""
    session_user = _get_session_user(authorization)
    if authorization and not session_user:
        raise HTTPException(401, "Please sign in again before submitting field data")
    if session_user:
        surveyor_id = session_user["id"]
        surveyor_role = session_user["role"]
    else:
        surveyor_id = "anonymous"
        surveyor_role = "citizen"

    # Validate LULC class
    if lulc_class_id not in database.LULC_CLASSES:
        raise HTTPException(400, f"Invalid lulc_class_id {lulc_class_id}. Must be 1–5.")

    cls_info = database.LULC_CLASSES[lulc_class_id]
    if not lulc_class:
        lulc_class = cls_info["name"]

    # Read image
    image_bytes = await image.read()
    if len(image_bytes) == 0:
        raise HTTPException(400, "Empty image file")

    # Quality checks
    quality = quality_checker.validate_image_quality(image_bytes)
    gps = quality_checker.validate_gps(latitude, longitude, accuracy)
    if not gps["is_valid"]:
        raise HTTPException(400, "GPS fix is outside the supported area or too imprecise: " + "; ".join(gps["reasons"]))

    # Save image
    ext = Path(image.filename or "photo.jpg").suffix or ".jpg"
    img_name = f"{uuid.uuid4().hex}{ext}"
    img_path = UPLOAD_DIR / img_name
    with open(img_path, "wb") as f:
        f.write(image_bytes)

    # Build record
    record = {
        "latitude": latitude,
        "longitude": longitude,
        "accuracy": accuracy,
        "lulc_class": lulc_class,
        "lulc_class_id": lulc_class_id,
        "image_filename": img_name,
        "image_width_px": quality["image_width_px"],
        "image_height_px": quality["image_height_px"],
        "blur_score": quality["blur_score"],
        "brightness": quality["brightness"],
        "quality_status": quality["quality_status"],
        "verification_status": "pending",
        "surveyor_id": surveyor_id,
        "surveyor_role": surveyor_role,
        "notes": notes,
        "compass_heading": compass_heading,
        "altitude": altitude,
    }

    sid = database.insert_submission(record, DB_PATH)
    record["id"] = sid
    record["image_url"] = f"/uploads/{img_name}"
    record["quality_check"] = quality
    record["gps_check"] = gps

    return record


@app.get("/api/submissions")
def list_submissions(
    lulc_class: str = Query(None),
    status: str = Query(None),
    limit: int = Query(200),
    offset: int = Query(0),
):
    """List submissions with optional filters."""
    filters = {"lulc_class": lulc_class, "status": status, "limit": limit, "offset": offset}
    rows = database.get_all_submissions(filters, DB_PATH)
    for r in rows:
        if r.get("image_filename"):
            r["image_url"] = f"/uploads/{r['image_filename']}"
        else:
            r["image_url"] = None
    return rows


@app.get("/api/submissions/{submission_id}")
def get_submission(submission_id: str):
    row = database.get_submission_by_id(submission_id, DB_PATH)
    if not row:
        raise HTTPException(404, "Submission not found")
    if row.get("image_filename"):
        row["image_url"] = f"/uploads/{row['image_filename']}"
    return row


@app.patch("/api/submissions/{submission_id}/verify")
def verify_submission(
    submission_id: str,
    body: dict,
    authorization: str | None = Header(default=None),
):
    _require_staff_session(authorization)
    status = body.get("status")
    if status not in ("verified", "rejected"):
        raise HTTPException(400, "status must be 'verified' or 'rejected'")
    ok = database.update_verification_status(
        submission_id, status, body.get("reviewer_id"), DB_PATH
    )
    if not ok:
        raise HTTPException(404, "Submission not found")
    return {"id": submission_id, "verification_status": status}


@app.delete("/api/submissions/{submission_id}", status_code=204)
def delete_submission(
    submission_id: str,
    authorization: str | None = Header(default=None),
):
    _require_staff_session(authorization)
    row = database.get_submission_by_id(submission_id, DB_PATH)
    if not row:
        raise HTTPException(404, "Submission not found")
    if not database.delete_submission(submission_id, DB_PATH):
        raise HTTPException(404, "Submission not found")
    filename = row.get("image_filename")
    if filename:
        image_path = (UPLOAD_DIR / filename).resolve()
        if image_path.parent == UPLOAD_DIR.resolve() and image_path.is_file():
            try:
                image_path.unlink()
            except OSError as exc:
                logger.exception("Failed to remove image for deleted submission %s", submission_id)
                raise HTTPException(500, "Submission deleted, but its image file could not be removed") from exc
    return Response(status_code=204)


# ════════════════════════════════════════════
#  STATISTICS
# ════════════════════════════════════════════

@app.get("/api/statistics")
def statistics():
    return database.get_statistics(DB_PATH)


# ════════════════════════════════════════════
#  QUALITY CHECK (standalone)
# ════════════════════════════════════════════

@app.post("/api/quality-check")
async def quality_check(image: UploadFile = File(...)):
    data = await image.read()
    if not data:
        raise HTTPException(400, "Empty image")
    return quality_checker.validate_image_quality(data)


@app.post("/api/validate-gps")
def validate_gps(body: dict):
    return quality_checker.validate_gps(
        body.get("latitude", 0), body.get("longitude", 0), body.get("accuracy", 99)
    )


# ════════════════════════════════════════════
#  EXPORT ENDPOINTS
# ════════════════════════════════════════════

@app.get("/api/export/geojson")
def export_geojson():
    subs = database.get_submissions_for_export("all", DB_PATH)
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    fname = f"bhu_drishti_ground_truth_{date_str}.geojson"
    fpath = str(UPLOAD_DIR / fname)
    export_service.export_geojson(subs, fpath)
    return FileResponse(
        fpath,
        media_type="application/geo+json",
        filename=fname,
    )


@app.get("/api/export/csv")
def export_csv():
    subs = database.get_submissions_for_export("all", DB_PATH)
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    fname = f"bhu_drishti_lulc_{date_str}.csv"
    fpath = str(UPLOAD_DIR / fname)
    export_service.export_csv(subs, fpath)
    return FileResponse(
        fpath,
        media_type="text/csv",
        filename=fname,
    )


@app.get("/api/export/stac")
def export_stac():
    subs = database.get_submissions_for_export("all", DB_PATH)
    return export_service.export_stac_metadata(subs)


@app.get("/api/lulc-classes")
def lulc_classes():
    return database.LULC_CLASSES


# ════════════════════════════════════════════
#  MAIN
# ════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    print("\n" + "=" * 62)
    print("  🛰️   BHU-DRISHTI")
    print("  National Ground-Truth Validation Portal")
    print("  ORBITRON Hackathon  |  PS-24  |  Domain 6")
    print("=" * 62)
    print("\n  🌐  Portal :  http://localhost:8000")
    print("  📡  API    :  http://localhost:8000/docs")
    print("  📊  Admin  :  http://localhost:8000/static/index.html")
    print("\n" + "=" * 62 + "\n")

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
