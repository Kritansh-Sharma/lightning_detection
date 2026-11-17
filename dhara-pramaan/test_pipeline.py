"""
Bhu-Drishti — Automated Pipeline & Quality Gate Test Suite
Tests:
1. Database initialization, insertion, querying, updating, statistics.
2. OpenCV Quality Gate: Sharp vs Blurry, Dark vs Well-lit vs Overexposed.
3. GPS Validator: Within India bounds, optimal vs acceptable vs poor accuracy.
4. Export Service: OGC GeoJSON generation, Bhuvan CSV generation, STAC metadata.
"""

import sys
import os
import json
import asyncio
import io
import tempfile
from pathlib import Path
import numpy as np
import cv2
from datetime import date

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import database
import quality_checker
import export_service
import server
from fastapi import HTTPException, UploadFile

TEST_DB = "test_bhu_drishti.db"

def run_tests():
    print("=" * 60)
    print("RUNNING BHU-DRISHTI TEST SUITE")
    print("=" * 60)

    # ── Test 1: Database Layer ──
    print("\n[TEST 1] Testing Database Layer...")
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
    
    database.init_db(TEST_DB)
    test_sub = {
        "latitude": 28.6139,
        "longitude": 77.2090,
        "accuracy": 4.5,
        "lulc_class": "Urban / Built-up",
        "lulc_class_id": 3,
        "image_filename": "test_delhi.jpg",
        "image_width_px": 1920,
        "image_height_px": 1080,
        "blur_score": 245.8,
        "brightness": 132.4,
        "quality_status": "passed",
        "verification_status": "pending",
        "surveyor_id": "Test_Surveyor",
        "notes": "Delhi test building",
    }
    sid = database.insert_submission(test_sub, TEST_DB)
    assert sid is not None, "Failed to insert submission"
    print(f"  ✓ Submission inserted with ID: {sid[:8]}...")

    fetched = database.get_submission_by_id(sid, TEST_DB)
    assert fetched["latitude"] == 28.6139, "Coordinate mismatch"
    assert fetched["lulc_class_id"] == 3, "LULC class mismatch"
    assert fetched["image_width_px"] == 1920 and fetched["image_height_px"] == 1080, "Image dimensions mismatch"
    print("  ✓ Submission retrieved correctly by ID")

    # Update verification status
    updated = database.update_verification_status(sid, "verified", db_path=TEST_DB)
    assert updated is True, "Failed to update verification status"
    fetched = database.get_submission_by_id(sid, TEST_DB)
    assert fetched["verification_status"] == "verified", "Verification status not updated"
    print("  ✓ Verification status updated to 'verified'")

    stats = database.get_statistics(TEST_DB)
    assert stats["total"] == 1, "Stats total mismatch"
    assert stats["verified"] == 1, "Stats verified mismatch"
    assert stats["mean_accuracy"] == 4.5, "Stats mean accuracy mismatch"
    print(f"  ✓ Statistics calculated correctly: total={stats['total']}, verified={stats['verified']}")

    # ── Test 2: Quality Gate (OpenCV Laplacian Variance & Brightness) ──
    print("\n[TEST 2] Testing OpenCV Quality Gate...")
    
    # 2a. Synthetic Sharp Image: high-contrast checkerboard pattern
    sharp_img = np.zeros((200, 200), dtype=np.uint8)
    sharp_img[::20, :] = 255
    sharp_img[:, ::20] = 255
    _, sharp_bytes = cv2.imencode('.jpg', sharp_img)
    sharp_res = quality_checker.validate_image_quality(sharp_bytes.tobytes())
    assert sharp_res["blur_passed"] is True, f"Sharp image failed blur check: {sharp_res['blur_score']}"
    assert sharp_res["image_width_px"] == 200 and sharp_res["image_height_px"] == 200, "Decoded image dimensions mismatch"
    print(f"  ✓ Sharp pattern detected: Laplacian variance = {sharp_res['blur_score']:.1f} (Threshold >= 100)")

    # 2b. Synthetic Blurry Image: heavily blurred image
    blurred_img = cv2.GaussianBlur(sharp_img, (31, 31), 15.0)
    _, blur_bytes = cv2.imencode('.jpg', blurred_img)
    blur_res = quality_checker.validate_image_quality(blur_bytes.tobytes())
    assert blur_res["blur_passed"] is False, f"Blurry image passed blur check: {blur_res['blur_score']}"
    print(f"  ✓ Blurry image correctly flagged: Laplacian variance = {blur_res['blur_score']:.1f} (< 100)")

    # 2c. Pitch Black Image
    black_img = np.full((100, 100), 10, dtype=np.uint8)
    _, black_bytes = cv2.imencode('.jpg', black_img)
    black_res = quality_checker.validate_image_quality(black_bytes.tobytes())
    assert black_res["brightness_passed"] is False, "Pitch black image passed brightness check"
    print(f"  ✓ Pitch black image correctly rejected: brightness = {black_res['brightness']:.1f} (< 40)")

    # 2d. Overexposed Image
    white_img = np.full((100, 100), 245, dtype=np.uint8)
    _, white_bytes = cv2.imencode('.jpg', white_img)
    white_res = quality_checker.validate_image_quality(white_bytes.tobytes())
    assert white_res["brightness_passed"] is False, "Overexposed image passed brightness check"
    print(f"  ✓ Overexposed image correctly rejected: brightness = {white_res['brightness']:.1f} (> 220)")

    # ── Test 3: GPS Bounds & Accuracy Validation ──
    print("\n[TEST 3] Testing GPS Validation...")
    # Optimal inside India
    g1 = quality_checker.validate_gps(28.61, 77.21, accuracy=3.2)
    assert g1["is_valid"] is True and g1["accuracy_level"] == "optimal", "Valid GPS flagged wrongly"
    print("  ✓ Optimal GPS lock (<=10m inside India) verified")

    # Acceptable inside India
    g2 = quality_checker.validate_gps(28.61, 77.21, accuracy=18.0)
    assert g2["is_valid"] is True and g2["accuracy_level"] == "acceptable", "Acceptable GPS flagged wrongly"
    print("  ✓ Acceptable GPS lock (10-25m) verified")

    # Poor accuracy (>25m)
    g3 = quality_checker.validate_gps(28.61, 77.21, accuracy=35.0)
    assert g3["is_valid"] is False and g3["accuracy_level"] == "poor", "Poor GPS not rejected"
    print("  ✓ Poor GPS (>25m) rejected as expected")

    # Outside India
    g4 = quality_checker.validate_gps(51.5074, -0.1278, accuracy=5.0) # London
    assert g4["in_india"] is False and g4["is_valid"] is False, "Foreign coordinate not rejected"
    print("  ✓ Foreign coordinates outside India rejected as expected")
    g5 = quality_checker.validate_gps(28.61, 77.21, accuracy=100000.0)
    assert g5["is_valid"] is False and g5["accuracy_level"] == "poor", "Imprecise GPS fix was not rejected"
    print("  ✓ Imprecise GPS fixes rejected instead of silently accepted")
    g6 = quality_checker.validate_gps(28.61, 77.21, accuracy=-1.0)
    assert g6["is_valid"] is False and g6["accuracy_level"] == "poor", "Invalid GPS accuracy was accepted"
    print("  ✓ Invalid GPS accuracy values rejected")

    # ── Test 4: ISRO Export Service ──
    print("\n[TEST 4] Testing ISRO GeoJSON and CSV Exports...")
    submissions = database.get_all_submissions(db_path=TEST_DB)
    
    # GeoJSON test
    geojson = export_service.export_geojson(submissions)
    assert geojson["type"] == "FeatureCollection", "GeoJSON type is not FeatureCollection"
    assert len(geojson["features"]) == 1, "Feature count mismatch"
    feat = geojson["features"][0]
    assert feat["geometry"]["coordinates"] == [77.2090, 28.6139], "Coordinates reversed or incorrect"
    assert feat["properties"]["lulc_class"] == "Urban / Built-up", "Property mismatch"
    assert feat["properties"]["image_width_px"] == 1920, "GeoJSON image width missing"
    assert feat["properties"]["image_height_px"] == 1080, "GeoJSON image height missing"
    print("  ✓ OGC GeoJSON FeatureCollection generated and validated against EPSG:4326 standard")

    # CSV test
    csv_str = export_service.export_csv(submissions)
    assert "point_id,latitude,longitude,accuracy_m" in csv_str, "CSV header missing"
    assert "image_width_px,image_height_px" in csv_str, "CSV image dimensions missing"
    assert ",1920,1080" in csv_str, "CSV image dimension values missing"
    assert "Urban / Built-up" in csv_str, "CSV row content missing"
    print("  ✓ Bhuvan-standard CSV catalog generated with all required metadata fields")

    # STAC test
    stac = export_service.export_stac_metadata(submissions)
    assert stac["type"] == "Catalog", "STAC type mismatch"
    assert "spatial" in stac["extent"], "STAC spatial extent missing"
    print("  ✓ STAC Catalog metadata generated successfully")

    # ── Test 5: Farmer Rewards & Daily Game Limits ──
    print("\n[TEST 5] Testing Farmer Rewards...")
    for index in range(9):
        database.insert_submission({
            **test_sub,
            "id": f"reward-photo-{index}",
            "image_filename": f"reward-photo-{index}.jpg",
            "verification_status": "pending",
        }, TEST_DB)
    for index in range(3):
        database.insert_submission({
            **test_sub,
            "id": f"synthetic-{index}",
            "image_filename": None,
            "surveyor_id": "Test_Surveyor",
            "verification_status": "verified",
        }, TEST_DB)

    rewards = database.get_farmer_rewards("Test_Surveyor", "2030-01-01", TEST_DB)
    assert rewards["submissions"] == 10, "Photo-backed submission count should exclude synthetic records"
    assert rewards["accepted"] == 1, "Only verified photo-backed submissions should count as accepted"
    assert rewards["submission_points"] == 10 and rewards["points"] == 10, "Accepted photo should earn 10 points"
    assert [badge["earned"] for badge in rewards["badges"]] == [True, True, True, False], "Submission badges mismatch"
    assert database.record_farmer_game_play("Test_Surveyor", "2030-01-01", "field-photo-basics", True, 5, TEST_DB)
    assert not database.record_farmer_game_play("Test_Surveyor", "2030-01-01", "field-photo-basics", True, 5, TEST_DB), "Daily game should only award once"
    rewards = database.get_farmer_rewards("Test_Surveyor", "2030-01-01", TEST_DB)
    assert rewards["points"] == 15 and rewards["game_points"] == 5, "Game points should add to accepted-submission points"
    assert rewards["quiz_played_today"] is True and rewards["badges"][3]["earned"], "Game completion progress mismatch"
    empty_rewards = database.get_farmer_rewards("Synthetic_Only", "2030-01-01", TEST_DB)
    assert empty_rewards["submissions"] == 0 and empty_rewards["points"] == 0, "Synthetic rows must not earn rewards"
    print("  ✓ Photo-backed submissions, verification points, milestones, and one-play daily game limit verified")

    # Authenticated API behavior: reward access is farmer-only and verification is staff-only.
    print("\n[TEST 6] Testing Farmer Rewards API Permissions...")
    server.DB_PATH = TEST_DB
    farmer_token = server._create_session({"id": "api_test_farmer", "role": "farmer"})
    analyst_token = server._create_session({"id": "api_test_analyst", "role": "analyst"})
    assert server.farmer_rewards(f"Bearer {farmer_token}")["points"] == 0

    for action, expected_status in (
        (lambda: server.farmer_rewards(f"Bearer {analyst_token}"), 403),
        (lambda: server.submit_farmer_quiz({"answer": "crop-rows"}, f"Bearer {analyst_token}"), 403),
        (lambda: server.verify_submission("reward-photo-0", {"status": "verified"}, None), 401),
        (lambda: server.verify_submission("reward-photo-0", {"status": "verified"}, f"Bearer {farmer_token}"), 403),
    ):
        try:
            action()
            raise AssertionError("An unauthorized rewards action unexpectedly succeeded")
        except HTTPException as exc:
            assert exc.status_code == expected_status, f"Expected HTTP {expected_status}, got {exc.status_code}"

    quiz_date = date.today().isoformat()
    quiz_result = server.submit_farmer_quiz({"answer": "crop-rows"}, f"Bearer {farmer_token}")
    assert quiz_result["correct"] and quiz_result["rewards"]["game_points"] == 5, "Correct quiz answer did not award points"
    try:
        server.submit_farmer_quiz({"answer": "crop-rows"}, f"Bearer {farmer_token}")
        raise AssertionError("Farmer played the daily quiz more than once")
    except HTTPException as exc:
        assert exc.status_code == 409, "Repeated daily quiz should return HTTP 409"

    approved = server.verify_submission(
        "reward-photo-0", {"status": "verified"}, f"Bearer {analyst_token}"
    )
    assert approved["verification_status"] == "verified", "Authorized staff could not verify a submission"
    surveyor_rewards = database.get_farmer_rewards("Test_Surveyor", quiz_date, TEST_DB)
    assert surveyor_rewards["submission_points"] == 20, "Staff verification did not award accepted photo points"
    print("  ✓ Farmer/staff role gates, quiz persistence, repeat prevention, and server-side award flow verified")

    # Anonymous callers must not be able to claim a farmer's identity in the multipart form.
    original_upload_dir = server.UPLOAD_DIR
    try:
        with tempfile.TemporaryDirectory(prefix="bhu_rewards_upload_test_") as upload_dir:
            server.UPLOAD_DIR = Path(upload_dir)
            checkerboard = (((np.indices((200, 200)).sum(axis=0) // 20) % 2) * 255).astype(np.uint8)
            _, upload_bytes = cv2.imencode(".jpg", checkerboard)
            upload = UploadFile(file=io.BytesIO(upload_bytes.tobytes()), filename="anonymous-test.jpg")
            submission = asyncio.run(server.submit_ground_truth(
                latitude=28.6139,
                longitude=77.2090,
                accuracy=4.5,
                lulc_class_id=1,
                lulc_class="Cropland",
                notes="Identity binding test",
                surveyor_id="Test_Surveyor",
                compass_heading=0,
                altitude=0,
                image=upload,
                authorization=None,
            ))
            stored_submission = database.get_submission_by_id(submission["id"], TEST_DB)
            assert stored_submission["surveyor_id"] == "anonymous", "Unauthenticated caller claimed another surveyor's identity"
            assert stored_submission["surveyor_role"] == "citizen", "Anonymous submission role mismatch"
            asyncio.run(upload.close())
            deletion = server.delete_submission(submission["id"], f"Bearer {analyst_token}")
            assert deletion.status_code == 204, "Test upload cleanup failed"
    finally:
        server.UPLOAD_DIR = original_upload_dir
    print("  ✓ Anonymous submission identity cannot be spoofed; test upload removed by staff cleanup")

    # Clean up test DB
    import gc
    gc.collect()
    try:
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    except Exception:
        pass

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED! PRODUCTION CORE IS FULLY FUNCTIONAL.")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
