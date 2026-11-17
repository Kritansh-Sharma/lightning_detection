# Bhu-Drishti
### Crowdsourced Ground-Truthing & Validation Pipeline for ISRO LULC Models
**Event:** ORBITRON Space Technology Hackathon | **Problem Statement:** PS-24 (Domain 6)  
**Workspace:** `C:\path\to\Bhu-Drishti`

---

## 1. Project Context & Objectives

### 1.1 The Core Problem
Satellite Earth Observation (EO) sensors (e.g., ISRO's Resourcesat/Cartosat, ESA's Sentinel-2) generate massive multispectral imagery over India every 5–10 days. However, training AI/ML segmentation models (like U-Net, DeepLabV3) to produce accurate **Land Use / Land Cover (LULC)** maps requires ground-truth labels.

Current ground verification suffers from three fatal bottlenecks:
1. **High Expense & Low Speed:** Physical field visits by scientific teams cost significant budgets and take months to catalog a single district.
2. **Dynamic Seasonal Shifts:** India's agro-climatic zones cycle rapidly through Kharif, Rabi, and Zaid crop seasons. Fallow land quickly becomes green canopy, confusing satellite models without timely ground truth.
3. **Data Sanitation Overhead:** Crowdsourced datasets often suffer from fake uploads, blurry camera shots, and inaccurate GPS locks, requiring massive manual cleanup before ISRO scientists can use them.

### 1.2 The Bhu-Drishti Solution
**Bhu-Drishti** is a lightweight, crowdsourced ground-truthing platform built specifically for Indian citizen science and ISRO training pipelines:
* **Live Camera & GPS Binding:** Eliminates fake gallery uploads and requires GPS accuracy $\le 10\text{m}$.
* **Mathematical Quality Gate (Edge CV):** Rejects blurry ($Var < 100$) and extreme-lit (dark/washed out) photos in $<15\text{ms}$ using Laplacian variance without heavy AI compute.
* **Offline-First Resilience:** Enables field workers, farmers, and students in remote no-network zones to record points locally and auto-sync when connected.
* **Direct ISRO Pipeline Export:** Automatically generates Bhuvan-compliant GeoJSON and CSV datasets formatted directly for PyTorch/TensorFlow remote-sensing segmentation pipelines.

---

## 2. End-to-End Data Flow Architecture

```
   [ Citizen / Student in Field ]
                 │
                 ▼
  ┌─────────────────────────────────┐
  │  1. Capture & Edge Validation   │
  │  • Live camera stream (no file) │
  │  • HTML5 Geolocation (<=10m)    │
  │  • 5 Pictorial LULC Classes     │
  └──────────────┬──────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────┐
  │  2. Mathematical Quality Gate   │  ◄── Laplacian Variance: Var(∇²(I)) >= 100
  │  • Real-time Blur Check         │  ◄── Brightness Intensity: 40 < μ < 220
  │  • Geo-fence: India Bounding Box│
  └──────────────┬──────────────────┘
                 │
         [ Network Available? ]
          ├── NO  ──▶ [ Offline Local Queue (IndexedDB / LocalStorage / SQLite) ]
          │                    │ (When back online)
          └── YES ─────────────┴──────────┐
                                          ▼
                         ┌─────────────────────────────────┐
                         │  3. Ingestion & Storage Backend │
                         │  • FastAPI / Python Service     │
                         │  • SQLite / Spatial Database    │
                         │  • Dedup & Proximity Clustering │
                         └────────────────┬────────────────┘
                                          │
                 ┌────────────────────────┴────────────────────────┐
                 ▼                                                 ▼
  ┌─────────────────────────────┐                  ┌──────────────────────────────┐
  │ 4. Admin GIS Dashboard      │                  │ 5. ISRO Pipeline Exporter    │
  │ • Satellite Basemap (ESRI)  │                  │ • ground_truth.geojson       │
  │ • Color-coded LULC Pins     │                  │ • training_metadata.csv      │
  │ • Photo & Audit Inspector   │                  │ • Ready for ML Segmentation  │
  └─────────────────────────────┘                  └──────────────────────────────┘
```

### 2.1 Data Ingestion Lifecycle
1. **Capture:** Citizen points device camera at a land parcel. Mobile interface locks coordinates $(lat, lon)$ with radius error $acc$.
2. **Quality Verification:** The image is tested for sharpness and lighting. If blurry or dark, the user receives instant guidance to steady the camera.
3. **Packaging:** Metadata is bundled: `timestamp`, `latitude`, `longitude`, `accuracy`, `class_code`, `class_name`, `blur_score`, `user_id`.
4. **Offline Resilience:** If offline, the payload queues locally. Once network heartbeat is detected, payloads are flushed to the server.
5. **Spatial Ingestion:** Server validates coordinates within Indian boundaries ($6^\circ\text{N} - 38^\circ\text{N}$, $68^\circ\text{E} - 98^\circ\text{E}$), indexes records, and prepares GIS layers.
6. **Delivery to Scientists:** Admin/Scientists filter by date, region, or class and download standardized GeoJSON for direct model ingestion.

---

## 3. Strict Criteria & Validation Rules

| Dimension | Rule / Threshold | Purpose & Scientific Rationale |
|---|---|---|
| **Capture Integrity** | Capture from the live camera or upload a field photo; the submitter is responsible for ensuring it depicts the selected location. | Enables phone-camera and desktop-file workflows; quality checks flag blur and unsuitable lighting. |
| **GPS Accuracy Lock** | Accuracy $\le 10\text{m}$ (Warning if $10\text{m} < acc \le 25\text{m}$, Rejected if $> 25\text{m}$). | Matches Sentinel-2 multispectral ground sampling distance ($10\text{m}$/pixel). |
| **Blur Detection** | Laplacian Variance: $\text{Var}(\nabla^2(I)) \ge 100.0$. | Fast ($<15\text{ms}$) edge-detection operator; discards motion-blurred photos. |
| **Lighting Limits** | Average grayscale intensity: $40.0 \le \mu \le 220.0$. | Rejects pitch-black night photos or washed-out overexposed frames. |
| **Geographic Bounds** | Latitude $[6.0, 38.0]^\circ\text{N}$, Longitude $[68.0, 98.0]^\circ\text{E}$. | Enforces Indian territory spatial sanity check. |
| **LULC Taxonomy** | 5 Core Bhuvan Level-1 Classes:<br>1. **Cropland** (कृषि भूमि)<br>2. **Forest** (वन / हरित आवरण)<br>3. **Urban / Built-up** (शहरी / निर्माण)<br>4. **Water Body** (जल निकाय)<br>5. **Barren / Fallow** (बंजर / परती) | Standardized taxonomy directly mapping to ISRO Bhuvan LULC classifications. |
| **Export Standard** | OGC GeoJSON (WGS84 EPSG:4326) + RFC 4180 CSV with image URI. | Directly loadable into QGIS, ArcGIS, GeoPandas, and PyTorch dataloaders. |

---

## 4. Architectural Strategy: Functionality-First & Judge-Proof

To ensure the project is **bulletproof during live hackathon judging** without crashing or depending on erratic cloud setups:

1. **Lightweight Python & Web Core:**
   * Backend: Python (FastAPI or Streamlit modular backend) with standard SQLite database.
   * Spatial & CV: OpenCV (`cv2`) for Laplacian variance + GeoPandas/Shapely/built-in GeoJSON for coordinate processing.
   * Map Engine: Interactive Leaflet.js / Folium with open ESRI World Satellite Imagery basemap.
2. **Single-Command Launch:**
   * The complete stack should boot in one command, eliminating fragile multi-container orchestration during live presentation.
3. **Demo Fallback & Seed Data:**
   * Pre-packaged with realistic simulated Indian ground-truth points across major agro-climatic zones (Punjab farmland, Western Ghats forest, Sundarbans water, NCR urban, Rajasthan barren) so the GIS dashboard looks populated and impressive even indoors.
4. **Separation of Concerns:**
   * Backend/Engine handles all the math, validation, database, and export logic.
   * The UI layer is clean, modular, and easy for the user to style, restyle, and tweak independently.

---

## 5. Master To-Do Checklist

### Phase 0: Project Setup & Research Alignment
- [x] Analyze Hackathon Problem Statement (PS-24: Domain 6 - Citizen Science)
- [x] Structure 6-slide PPT submission content & technical documentation
- [x] Define system architecture, data flow, and mathematical thresholds
- [x] Initialize project directory structure at `C:\path\to\Bhu-Drishti`
- [x] Formulate master project plan (`PROJECT_PLAN.md`)

---

### Phase 1: Core Functional Engine (Backend, Database & Algorithms)
- [x] **1.1 Database Layer (`database.py`):**
  - [x] SQLite database setup (`bhu_drishti.db`) with tables: `submissions`, `users`, `sync_queue`.
  - [x] Schema storing `id`, `latitude`, `longitude`, `accuracy`, `lulc_class`, `image_path`, `blur_score`, `brightness`, `status`, `timestamp`.
  - [x] Database helper functions (insert, query all, filter by class/status, statistics summary).
- [x] **1.2 Computer Vision Quality Gate (`quality_checker.py`):**
  - [x] Laplacian variance calculation for blur detection ($\text{Var}(\nabla^2(I))$).
  - [x] Mean intensity calculation for darkness/overexposure ($40 \le \mu \le 220$).
  - [x] Quality gate evaluation function returning `(is_valid, blur_score, brightness, reason)`.
- [x] **1.3 Geospatial & ISRO Export Engine (`export_service.py`):**
  - [x] GeoJSON exporter generating valid OGC WGS84 FeatureCollection.
  - [x] CSV exporter formatted for Bhuvan LULC Level-1/Level-2 standards.
  - [x] Spatial bounding-box and accuracy validation filters.
- [x] **1.4 Demo Seed Data Generator (`seed_data.py`):**
  - [x] Script to inject realistic ground-truth survey points across India (Punjab, Kerala, Sundarbans, Delhi, Ladakh).

---

### Phase 2: Citizen Data Capture Module (Functionality First)
- [x] **2.1 Live Camera Stream Integration:**
  - [x] Direct device camera access with file-picker fallback for desktop browsers.
  - [x] Canvas frame capture to binary/Blob with retake controls.
- [x] **2.2 GPS Geolocation Lock:**
  - [x] Browser Geolocation API integration fetching latitude, longitude, and accuracy radius.
  - [x] Visual accuracy badge (Green $\le 10\text{m}$, Amber $10-25\text{m}$, Red $> 25\text{m}$).
- [x] **2.3 LULC Pictorial Selection:**
  - [x] 5 Core Classes with dual English/Hindi labels & emoji icons.
- [x] **2.4 Offline Storage & Synchronization:**
  - [x] Client-side queue for pending records in localStorage when offline.
  - [x] Auto-sync trigger on `window.online` and periodic 30s background sync.

---

### Phase 3: Admin GIS Dashboard & Review Portal
- [x] **3.1 Interactive Satellite Basemap:**
  - [x] Leaflet map with ESRI World Satellite imagery tiles & OpenStreetMap layer control.
  - [x] Color-coded markers for each LULC class (Green=Forest, Yellow=Cropland, Blue=Water, Red=Urban, Brown=Barren).
- [x] **3.2 Inspector Popup Modal:**
  - [x] Clicking marker reveals captured ground photo, exact coordinates, accuracy radius, timestamp, blur score.
- [x] **3.3 One-Click ISRO Export Actions:**
  - [x] "Download GeoJSON for ISRO AI Models" button.
  - [x] "Download Survey CSV" button.
  - [x] Live interactive STAC Catalog viewer.
- [x] **3.4 Live Analytics Summary Bar:**
  - [x] Real-time counter of total submissions, verified points, mean GPS precision, and category distribution bar charts.

---

### Phase 4: UI / UX Polish & Thematic Styling
- [x] **4.1 Indian Space Tech Aesthetic:**
  - [x] Navy Blue, Saffron, and White accents inspired by ISRO / Bhuvan portal designs.
  - [x] Bilingual typography (Hindi & English).
- [x] **4.2 Responsive Mobile-First Layout:**
  - [x] Clean card layouts, tactile touch targets for mobile field operation.
- [x] **4.3 Verification & Automated Test Suite:**
  - [x] End-to-end automated test suite in `test_pipeline.py` (100% tests passing).
  - [x] Live photo upload & OpenCV edge quality verification verified via `test_upload_pass.py`.
