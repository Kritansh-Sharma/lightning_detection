"""
Bhu-Drishti — Image & GPS Quality Checker
Laplacian variance blur detection + brightness validation + GPS bounds.
"""

import logging
import math
import numpy as np
import cv2

logger = logging.getLogger("bhu_drishti.quality")

# ── Thresholds (scientifically justified) ──
BLUR_THRESHOLD = 100.0        # Laplacian variance; Pech-Pacheco et al. 2000
MIN_BRIGHTNESS = 40.0         # Reject pitch-black frames
MAX_BRIGHTNESS = 220.0        # Reject washed-out / overexposed
GPS_ACCURACY_OPTIMAL = 10.0   # Sentinel-2 pixel = 10 m
GPS_ACCURACY_MAX = 25.0       # Hard reject above this
INDIA_LAT_MIN, INDIA_LAT_MAX = 6.0, 38.0
INDIA_LON_MIN, INDIA_LON_MAX = 68.0, 98.0


def check_blur(image_bytes: bytes) -> tuple[bool, float]:
    """
    Compute Laplacian variance of the grayscale image.
    Returns (is_sharp, variance_score).
    """
    try:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return False, 0.0
        laplacian = cv2.Laplacian(img, cv2.CV_64F)
        variance = float(laplacian.var())
        return variance >= BLUR_THRESHOLD, round(variance, 2)
    except Exception as exc:
        logger.error("Blur check failed: %s", exc)
        return False, 0.0


def check_brightness(image_bytes: bytes) -> tuple[bool, float]:
    """
    Compute mean grayscale intensity.
    Returns (is_valid, mean_brightness).
    """
    try:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return False, 0.0
        mean_val = float(img.mean())
        is_valid = MIN_BRIGHTNESS <= mean_val <= MAX_BRIGHTNESS
        return is_valid, round(mean_val, 2)
    except Exception as exc:
        logger.error("Brightness check failed: %s", exc)
        return False, 0.0


def get_image_dimensions(image_bytes: bytes) -> tuple[int, int] | None:
    """Return the decoded image width and height in pixels."""
    try:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
        if img is None:
            return None
        height, width = img.shape[:2]
        return width, height
    except cv2.error as exc:
        logger.error("Image dimension decoding failed: %s", exc)
        return None


def validate_image_quality(image_bytes: bytes) -> dict:
    """Full image quality gate. Returns detailed result dict."""
    blur_ok, blur_score = check_blur(image_bytes)
    bright_ok, brightness = check_brightness(image_bytes)
    dimensions = get_image_dimensions(image_bytes)
    reasons = []
    if not blur_ok:
        reasons.append(f"Image is blurry (score {blur_score:.1f}, need ≥{BLUR_THRESHOLD})")
    if not bright_ok:
        if brightness < MIN_BRIGHTNESS:
            reasons.append(f"Image too dark (brightness {brightness:.1f}, need ≥{MIN_BRIGHTNESS})")
        else:
            reasons.append(f"Image overexposed (brightness {brightness:.1f}, need ≤{MAX_BRIGHTNESS})")

    is_valid = blur_ok and bright_ok
    if is_valid:
        status = "passed"
    elif not blur_ok and not bright_ok:
        status = "failed_both"
    elif not blur_ok:
        status = "failed_blur"
    else:
        status = "failed_brightness"

    return {
        "is_valid": is_valid,
        "blur_score": blur_score,
        "brightness": brightness,
        "blur_passed": blur_ok,
        "brightness_passed": bright_ok,
        "image_width_px": dimensions[0] if dimensions else None,
        "image_height_px": dimensions[1] if dimensions else None,
        "quality_status": status,
        "failure_reasons": reasons,
    }


def validate_gps(lat: float, lon: float, accuracy: float) -> dict:
    """Validate GPS coordinates against Indian bounds and accuracy threshold."""
    reasons = []
    finite_coords = math.isfinite(lat) and math.isfinite(lon)
    in_india = finite_coords and INDIA_LAT_MIN <= lat <= INDIA_LAT_MAX and INDIA_LON_MIN <= lon <= INDIA_LON_MAX
    if not in_india:
        reasons.append(f"Coordinates ({lat:.4f}, {lon:.4f}) outside Indian territory")

    if not math.isfinite(accuracy) or accuracy <= 0:
        acc_level = "poor"
        reasons.append("GPS accuracy must be a positive, finite value")
    elif accuracy <= GPS_ACCURACY_OPTIMAL:
        acc_level = "optimal"
    elif accuracy <= GPS_ACCURACY_MAX:
        acc_level = "acceptable"
    else:
        acc_level = "poor"
        reasons.append(f"GPS accuracy {accuracy:.1f}m exceeds {GPS_ACCURACY_MAX}m limit")

    is_valid = in_india and acc_level != "poor"
    return {
        "is_valid": is_valid,
        "in_india": in_india,
        "accuracy_level": acc_level,
        "reasons": reasons,
    }
