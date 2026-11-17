@echo off
title Bhu-Drishti - ISRO Ground-Truth Portal
cd /d "%~dp0"
echo ======================================================================
echo    BHU-DRISHTI
echo    National Ground-Truth Validation Pipeline for ISRO LULC Models
echo    ORBITRON Space Tech Hackathon - PS-24
echo ======================================================================
echo.
echo Starting FastAPI Web Server and GIS Portal...
echo.
echo Portal URL:  http://localhost:8000
echo API Docs:    http://localhost:8000/docs
echo.
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
pause
