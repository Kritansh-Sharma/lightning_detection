# Bhu-Drishti
### Crowdsourced Ground-Truthing & Validation Pipeline for ISRO LULC Models
**Event:** ORBITRON — Space Technology Hackathon | **Problem Statement:** PS-24 (Domain 6)  
**Location:** `C:\path\to\Bhu-Drishti`

---

## 🚀 Quick Start Guide

### 1. Open in Visual Studio Code
You can open this project in VS Code in any of the following ways:

* **From Terminal / PowerShell:**
  ```powershell
  code C:\path\to\Bhu-Drishti
  ```
* **Or from VS Code UI:**
  * Open VS Code
  * Click **File ➔ Open Folder...**
  * Select `C:\path\to\Bhu-Drishti`

---

### 2. How to Run the Development Server

You have multiple convenient ways to run the portal:

#### Option A: Using NPM (Recommended if you like `run dev`)
Open the VS Code integrated terminal (`Ctrl + ~`) and run:
```bash
npm run dev
```
*(This triggers `uvicorn server:app --reload --host 0.0.0.0 --port 8000` under the hood).*

#### Option B: Using Python directly
```bash
python server.py
```
or
```bash
python -m uvicorn server:app --reload --port 8000
```

#### Option C: Double-click Windows Launcher
Simply double-click [`run.bat`](./run.bat) inside the `C:\path\to\Bhu-Drishti` folder.

#### Option D: Press F5 in VS Code
Press `F5` in VS Code to launch the debugger with the included configuration!

---

### 3. Open in Browser

Once the server is running, visit:
* 🌐 **Main Government Portal:** [http://localhost:8000](http://localhost:8000)
* 📡 **Interactive API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
* 📊 **Direct Static App:** [http://localhost:8000/static/index.html](http://localhost:8000/static/index.html)

---

## 🧪 Other Handy Commands

| Action | NPM Command | Python Command | Description |
|---|---|---|---|
| **Start Dev Server** | `npm run dev` | `python -m uvicorn server:app --reload` | Starts web server with hot-reload |
| **Run Pipeline Tests** | `npm test` | `python test_pipeline.py` | Runs 100% automated test suite |
| **Re-Seed Demo Data** | `npm run seed` | `python seed_data.py` | Injects 50 new realistic Indian points |

---

## 📁 Project Architecture & File Layout

```
Bhu-Drishti\
├── database.py             <-- SQLite storage layer (CRUD, spatial queries, stats)
├── quality_checker.py      <-- OpenCV image quality checks & decoded pixel dimensions
├── export_service.py       <-- OGC WGS84 GeoJSON, Bhuvan CSV, & STAC exports
├── seed_data.py            <-- Realistic pan-India survey generator
├── server.py               <-- FastAPI REST API & static server
├── test_pipeline.py        <-- Automated test suite (all tests passing)
├── bhu_drishti.db          <-- SQLite database with survey points
├── uploads/                <-- Real storage directory where captured photos are saved
├── package.json            <-- Configured with "dev", "start", "seed", "test" scripts
├── requirements.txt        <-- Python dependencies list
├── run.bat                 <-- 1-click Windows batch launcher
├── PROJECT_PLAN.md         <-- Master project roadmap and to-do tracker
├── UI_UX_SPECIFICATION.md  <-- Complete Government/ISRO UI design wireframes
├── .vscode/
│   ├── tasks.json          <-- VS Code build and test tasks
│   └── launch.json         <-- VS Code F5 debug launcher
└── static/
    ├── index.html          <-- Government single-page portal (farmer rewards + staff tabs)
    ├── app.js              <-- Camera/photo upload, GPS sensor, Leaflet GIS map, offline sync
    ├── icons.svg           <-- Lightweight local SVG icon sprite
    ├── showcase-farms.json <-- Attributed public reference-photo metadata and GPS coordinates
    ├── showcase-farms/     <-- 12 locally bundled, openly licensed farm photos for the map
    └── style.css           <-- Charcoal and lime palette, accessible typography and reduced-motion support
```

---

## 🛰️ Key Features in the Dashboard

1. **🔐 Login Page:** Role selector (Farmer, GIS Analyst, Admin) with **Quick Demo One-Click** buttons for presentations.
2. **🌾 Farmer — Field Survey:** Live camera and local photo upload, a per-photo fresh device-location request (maximum 25 m reported accuracy), 5 Bhuvan LULC pictorial cards, image-quality checks, pixel dimensions in exports, and an offline storage queue. Pixel resolution is not a real-world field measurement; parcel area needs a mapped boundary or calibrated overhead imagery.
3. **🏅 Farmer — Field Journey:** Farmer-only RPG-inspired progress tab. A photo-backed submission earns 10 points only after an analyst/admin verifies it; the first photo-backed submission, first acceptance, and tenth submission unlock milestones. A short daily field-photo quiz can award 5 additional points (one answer per account per UTC day). Progress is calculated on the server, and synthetic no-photo records never count.
4. **🗺️ Staff — GIS Verification Map:** Leaflet map with ESRI World Imagery, photo-backed submission pins, point inspection, analyst approve/reject controls, and a separate layer of 12 openly licensed farm-photo references. Synthetic seeded points are hidden by default and can be revealed with the demo-points filter. First click opens a point preview; clicking that point again or its photo zooms to the location. Reference photos are not parcel boundaries or survey submissions and are excluded from database statistics and exports.
5. **📦 Staff — ISRO Export Center:** One-click downloads of `ground_truth.geojson`, Bhuvan `dataset.csv`, and a live STAC metadata viewer.
6. **📊 Staff — Analytics:** Live LULC class distribution charts and volunteer leaderboard.
7. **📖 Guidelines:** Accordion manual with Bhuvan classification criteria, capture guidance, GPS accuracy, and image-quality requirements. The complete guide can be switched between English, Hindi, Marathi, Kannada, and Assamese; the language choice is saved in the browser.
8. **🌙 Appearance:** Toggle between the default light palette and a near-black, VS Code-inspired dark theme from the login screen or dashboard. The choice is saved in the browser.

### Artwork attribution

The Field Journey walking character is a locally cropped animation strip based on “Game icons set character viking walk cycle,” provided via [Freepik / Magnific](https://www.freepik.com/free-vector/game-icons-set-character-viking-walk-cycle_107791-13394.htm) (asset 107791-13394). The original preview was supplied by the project user; attribution is retained here.

### Demo-data and permissions note

The included login profiles, OTP flow, and seeded records are for local demonstration only. Seeded coordinates and verification states are synthetic and must not be presented as real field observations. Analyst/admin verification and deletion actions are role-gated in the prototype API, but this demo authentication is not an identity provider and must be replaced with government-approved authentication and server-side role assignment before deployment.

Farmer points and badges are project participation rewards, not cash or guaranteed redeemable services. Do not promise ISRO, BARC, or other agency benefits unless a partnership is formally confirmed. Verification actions require an analyst/admin session; farmer identity for authenticated submissions is taken from the server session rather than the submitted form.

On the field survey, choose or capture the photo, then use **Refresh GPS for this photo** to request a new high-accuracy device location. That exact reading and its reported accuracy are linked to the selected photo and used for submission; replacing the photo clears the linked location. The browser-reported accuracy must be at most 25 m, and is an estimate rather than a surveyed parcel boundary. The application does not substitute a default Delhi coordinate. Device geolocation requires user permission and a secure HTTPS context on deployed sites (localhost is permitted for development). On the GIS map, photo-backed upload points are separate from the no-photo synthetic samples (hidden by default); a photo-backed point's popup displays the device coordinates and reported uncertainty for that upload. Selecting a map point zooms to its stored coordinates, but the reported GPS accuracy remains the uncertainty radius. Indoor/laptop or approximate-location settings can return coarse positions; use a phone with precise location enabled in a secure browser context for the best device fix.
