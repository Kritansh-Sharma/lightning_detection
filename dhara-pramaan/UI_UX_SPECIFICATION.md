# Bhu-Drishti
## Official UI/UX Design & Dashboard Architecture Specification
**Portal Type:** National Geospatial Citizen Science & ISRO LULC Validation Portal  
**Design Paradigm:** Official Government of India (GoI) / Digital India / ISRO Bhuvan Design Standards  
**Location:** `C:\path\to\Bhu-Drishti\UI_UX_SPECIFICATION.md`

---

## 1. Visual Identity & Design System (GoI / ISRO Theme)

The portal adheres to standard Indian Government portal design principles: trustworthy, authoritative, accessible, bilingual (Hindi & English), and structured.

### 1.1 Color Palette
* **National Saffron (शीर्ष पट्टी):** `#FF9933` / `#E65100` (Subtle top tricolor accent stripe, active badges).
* **ISRO Navy Blue (मुख्य रंग):** `#0B3B60` / `#002244` (Primary navbar, header, authoritative titles).
* **Deep Space Accent (गहरा नीला):** `#1A365D` (Cards header, primary action buttons).
* **Forest Green (सत्यापित हरा):** `#1B5E20` / `#2E7D32` (Verified status, cropland/forest icons).
* **Official Light Gray (पृष्ठभूमि):** `#F4F6F9` (Clean, non-distracting dashboard canvas).
* **Card Surface & Border:** `#FFFFFF` background with `#D0D7DE` crisp 1px borders.

### 1.2 Typography & Accessibility
* **Primary Fonts:** `Inter`, `Segoe UI`, `Noto Sans Devanagari` (for Hindi subtitles).
* **Official Header Elements:** National Emblem / ISRO insignia placeholder, "भारत सरकार | Government of India", "अंतरिक्ष विभाग | Department of Space", Accessibility tools (`A+`, `A-`, English/हिन्दी toggle).

---

## 2. Authentication Flow (Login Page / Role Switcher)

A clean government portal login screen designed with demo-friendliness for hackathon judges:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🇮🇳 भारत सरकार | GOVERNMENT OF INDIA   अंतरिक्ष विभाग | DEPARTMENT OF SPACE │
│                     BHU-DRISHTI                                               │
│       National Citizen Ground-Truth Portal for Satellite LULC AI            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                     ┌─────────────────────────────────┐                     │
│                     │       🔐 PORTAL LOGIN           │                     │
│                     │  Select Portal Role to Proceed: │                     │
│                     ├─────────────────────────────────┤                     │
│                     │ [●] Citizen / Student Surveyor  │                     │
│                     │ [ ] ISRO / NRSC GIS Analyst     │                     │
│                     │ [ ] Admin / Nodal Officer       │                     │
│                     ├─────────────────────────────────┤                     │
│                     │ Surveyor ID / Mobile Number     │                     │
│                     │ [ +91 98765 43210             ] │                     │
│                     │ OTP / Password                  │                     │
│                     │ [ ••••••                      ] │                     │
│                     ├─────────────────────────────────┤                     │
│                     │ [   🚀 SECURE LOGIN VIA OTP   ] │                     │
│                     │                                 │                     │
│                     │ ─── QUICK DEMO ONE-CLICK ───    │                     │
│                     │ [⚡ Enter as Field Surveyor  ] │                     │
│                     │ [🛰️ Enter as ISRO GIS Analyst] │                     │
│                     └─────────────────────────────────┘                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Top Master Header & Navigation Tabs

Once logged in, the top of every page features a persistent navigation ribbon:

### 3.1 Header Ribbon Layout (12-Column Grid)
* **Cols 1–4 (Identity):** ISRO & GoI Emblem + "Bhu-Drishti" Logo + Subtitle ("National Ground-Truth Validation Portal").
* **Cols 5–8 (Live KPI Badge):** Active Mission stats: `🟢 Sync: ONLINE` | `📍 GPS: READY` | `📦 Cached: 0`.
* **Cols 9–12 (User Profile & Controls):** User name ("Dr. Rajesh Sharma, ISRO NRSC"), Role badge, Language switch, [Logout].

### 3.2 Persistent Tab Navigation Menu (5 Master Tabs)
1. 🌾 **Tab 1: Field Data Collection (क्षेत्रीय सर्वेक्षण)**
   * Live Camera Viewport, GPS Lock, Pictorial 5-Class Selector, Instant Quality Check.
2. 🗺️ **Tab 2: Interactive GIS Map & Verification (भू-सत्यापन मानचित्र)**
   * Full ESRI Satellite Basemap, color-coded ground markers, filter sidebar, point inspector modal.
3. 📦 **Tab 3: ISRO Training Pipeline & Exports (डेटा निष्कर्षण केंद्र)**
   * One-click download of `ground_truth.geojson` and CSV, STAC schema viewer, dataset statistics.
4. 📊 **Tab 4: National Survey Analytics & Cadets (राष्ट्रीय विश्लेषण)**
   * State-wise coverage heatmaps, category distribution charts, volunteer leaderboard (NCC/NSS).
5. 📖 **Tab 5: Bhuvan Taxonomy & Guidelines (वर्गीकरण दिशानिर्देश)**
   * ISRO Bhuvan LULC Level-1/2 definitions, reference photographic examples, field protocols.

---

## 4. Section & Grid Layout for Each Page

### 4.1 Global Top Stats Ribbon (4-Card Metric Grid)
Present across the top of analytical pages:
```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 📍 TOTAL POINTS  │  │ ✅ VERIFIED FOR AI│  │ 🛰️ GPS ACCURACY  │  │ 🌾 ACTIVE STATES │
│    1,428 Pts     │  │    1,294 (90.6%) │  │    ± 3.8 Metres  │  │   18 States/UTs  │
│ [▲ +12% this wk] │  │ [Ready for ISRO] │  │ [Threshold <=10m]│  │ [Pan-India Grid]│
└──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

### 4.2 Page 1: Field Data Collection Tab (2-Column Grid: 6 + 6)

Designed for responsive mobile field operation and desktop webcam demonstration:

```
┌──────────────────────────────────────┬──────────────────────────────────────┐
│  COL 1 (Width: 6 / 12)               │  COL 2 (Width: 6 / 12)               │
│  LIVE CAMERA & QUALITY GATE          │  GPS LOCK & LULC CLASSIFICATION      │
├──────────────────────────────────────┼──────────────────────────────────────┤
│                                      │                                      │
│  ┌────────────────────────────────┐  │  ┌── 🛰️ Real-Time GPS Sensor ──────┐ │
│  │                                │  │  │ Lat: 28.6139° N  Lon: 77.2090° E │ │
│  │      LIVE CAMERA STREAM        │  │  │ Accuracy: 4.2m [🟢 OPTIMAL <=10m] │ │
│  │   (Hardware Camera Locked)     │  │  │ Altitude: 216m   Satellites: 8    │ │
│  │   [File picker disabled]       │  │  └───────────────────────────────────┘ │
│  │                                │  │                                      │
│  └────────────────────────────────┘  │  ┌── 🏷️ Select LULC Category ────────┐ │
│  [ 📸 CAPTURE GROUND TRUTH FRAME ]   │  │ [🌾 Cropland (कृषि भूमि)        ] │ │
│                                      │  │ [🌲 Forest / Green Cover (वन)   ] │ │
│  ┌── ⚡ Edge Quality Gate ────────┐  │  │ [🏢 Urban / Built-up (शहरी)     ] │ │
│  │ Blur Score (Laplacian): 184.2  │  │  │ [💧 Water Body (जल निकाय)        ] │ │
│  │ [🟢 SHARP - PASSED >=100]      │  │  │ [🏜️ Barren / Fallow (बंजर/परती) ] │ │
│  │ Brightness Index: 128 (Normal) │  │  └───────────────────────────────────┘ │
│  │ [🟢 LIGHTING OPTIMAL]          │  │                                      │
│  └────────────────────────────────┘  │  Survey Notes / Crop Type (Optional):│
│                                      │  [ e.g., Paddy stubble / Rabi wheat ]│
│                                      │                                      │
│                                      │  [ 🚀 SUBMIT GROUND TRUTH RECORD    ]│
│                                      │  [ 💾 SAVE OFFLINE (NO NETWORK)     ]│
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

### 4.3 Page 2: Interactive GIS Map & Verification Tab (Split Grid: 4 + 8)

For scientists and nodal officers to audit ground-truth submissions over satellite imagery:

```
┌──────────────────────────────┬──────────────────────────────────────────────┐
│  SIDEBAR FILTER & AUDIT      │  INTERACTIVE SATELLITE MAP (LEAFLET + ESRI)  │
│  (Width: 4 / 12)             │  (Width: 8 / 12)                             │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ 🔍 MAP CONTROLS & FILTERS    │ ┌──────────────────────────────────────────┐ │
│ • LULC Class Filter:         │ │ [ESRI Satellite Imagery]        [Layers] │ │
│   [x] 🌾 Cropland (480)      │ │                                          │ │
│   [x] 🌲 Forest (310)        │ │         🟡 (Punjab)                      │ │
│   [x] 🏢 Urban (290)         │ │             🔴 (Delhi NCR)               │ │
│   [x] 💧 Water (180)         │ │   🟤 (Thar)                              │ │
│   [x] 🏜️ Barren (168)        │ │                                          │ │
│ • Status:                    │ │                   🔵 (Sundarbans)        │ │
│   [x] Verified [ ] Pending   │ │       🟢 (Western Ghats)                 │ │
│ • Time Range: Last 30 Days   │ │                                          │ │
│                              │ │ Coordinate Crosshair: 21.1458°N, 79.0882°E│
│ ──────────────────────────── │ └──────────────────────────────────────────┘ │
│ 📋 SELECTED POINT INSPECTOR  │                                              │
│ • Point ID: #DP-IND-2026-084 │ Selected Marker Preview Card:                │
│ • Class: 🌾 Cropland (Wheat) │ ┌──────────────────────────────────────────┐ │
│ • Coordinates: 30.901°N,75.85│ │ [Photo Preview]  Captured: 2 hrs ago     │ │
│ • Accuracy: ± 3.1m           │ │ Blur: 210 (Pass) Intensity: 135 (Good)   │ │
│ • Auditor Decision:          │ │ Actions: [ ✅ APPROVE ]  [ ❌ REJECT ]   │ │
│   [✅ Validated for ISRO]    │ └──────────────────────────────────────────┘ │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

---

### 4.4 Page 3: ISRO AI Data Pipeline & Exports Tab (3-Column Grid: 4 + 4 + 4)

Provides scientists with direct download access to training datasets:

```
┌─────────────────────────┬─────────────────────────┬─────────────────────────┐
│ 1. OGC GeoJSON EXPORT   │ 2. BHUVAN CSV EXPORT    │ 3. AI PIPELINE METADATA │
├─────────────────────────┼─────────────────────────┼─────────────────────────┤
│ • Format: GeoJSON       │ • Format: Standard CSV  │ • Resolution: 10m match │
│ • Projection: EPSG:4326 │ • Fields: Lat, Lon, Acc,│ • Bounding: All-India   │
│ • Features: 1,294 Pts   │   Class_ID, BlurScore,  │ • Schema: STAC Catalog  │
│ • Ready for PyTorch,    │   Photo_URL, Timestamp  │ • Target Models:        │
│   GeoPandas, QGIS       │ • Direct Excel / R      │   U-Net / DeepLabV3+    │
│                         │                         │                         │
│ [ ⬇️ DOWNLOAD GEOJSON ] │ [ ⬇️ DOWNLOAD CSV     ] │ [ 👁️ VIEW STAC JSON  ] │
└─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

---

### 4.5 Page 4: National Survey Analytics & Leaderboard (2-Column Grid: 7 + 5)

* **Left Panel (7/12):** LULC Class Distribution Chart (Bar/Donut) + State-wise progress table.
* **Right Panel (5/12):** Citizen Science Leaderboard (NCC Cadets, NSS Volunteers, Agricultural Universities, Verified Points count, Badges).

---

### 4.6 Page 5: Guidelines & Bhuvan LULC Manual (Tabular / Accordion)

* Clear pictorial classification reference cards for field surveyors:
  - How to photograph agricultural fields (horizontal perspective, showing soil and vegetation).
  - Difference between Fallow land (temporary non-crop) vs Barren scrub.
  - GPS locking tips (wait 5 seconds in open sky for lock to settle under 10m).

---

## 5. Summary of Screen Flow & State Transitions

```
[ Login Screen ]
      │
      ├─▶ Mode A: Field Citizen Surveyor ──▶ Tab 1: Live Field Capture
      │                                                │ (Submits Record)
      │                                                ▼
      └─▶ Mode B: ISRO GIS Analyst ────────▶ Tab 2: GIS Verification Map
                                                       │
                                                       ├─▶ Tab 3: ISRO GeoJSON Export
                                                       ├─▶ Tab 4: National Analytics
                                                       └─▶ Tab 5: Guidelines Manual
```

---

## 6. Implementation Architecture

To ensure 100% functionality and clean customization:
* **Single Web Engine:** A unified, lightweight FastAPI service serving both REST APIs and the official portal.
* **Modular Code Structure:**
  * `server.py` handles authentication session, submissions, filters, and export downloads.
  * `static/index.html` holds the structured government navbar, 5 tab panels, and grid layouts.
  * `static/app.js` handles tab switching, live camera feed, HTML5 Geolocation lock, Leaflet map rendering, and offline caching.
  * `static/style.css` isolates all color tokens, grids, and typography so you can easily customize and tweak styling independently.
