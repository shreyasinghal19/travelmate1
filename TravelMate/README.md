# 🗺️ TravelMate — Route-Based Local Auto Fare Estimation System

> **Indicative estimate only — not an official tariff or guaranteed price.**

TravelMate helps travellers, tourists, students, and first-time visitors check a route and get a realistic, transparent local auto-rickshaw or e-rickshaw fare estimate **before negotiating** an unmetered ride in Indian cities.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Currency](https://img.shields.io/badge/currency-₹_INR-orange)

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Fare Formula](#-fare-formula)
- [API Endpoints](#-api-endpoints)
- [Default Fare Presets](#-default-fare-presets)
- [Manual Verification Checklist](#-manual-verification-checklist)
- [Privacy Notice](#-privacy-notice)

---

## ✨ Features

- **Interactive Map** — Leaflet.js + OpenStreetMap with draggable markers and click-to-set points
- **Live Autocomplete** — Nominatim geocoding biased toward Indian cities
- **Real Road Routes** — OSRM routing API for actual road geometry, polyline, and exact distance
- **Transparent Fare Breakdown** — Itemized base + distance + waiting charges
- **Fare Range + Upper Limit** — Negotiation-ready range with configurable buffer
- **5 Indian Cities** — Agra (default), Delhi, Jaipur, Lucknow, Varanasi
- **2 Vehicle Types** — Auto-Rickshaw and E-Rickshaw
- **Editable Fare Assumptions** — Collapsible drawer to inspect/customize all parameters
- **Dark / Light Theme** — Persisted toggle with high-contrast design
- **Responsive** — Works on mobile, tablet, and desktop
- **Standalone + Backend Modes** — Frontend works without Flask; Flask adds API + logging
- **Privacy-First Logging** — Only anonymized, aggregate data (no PII)

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (modular) |
| **Map** | [Leaflet.js](https://leafletjs.com/) 1.9.4 + OpenStreetMap tiles |
| **Geocoding** | [Nominatim API](https://nominatim.openstreetmap.org/) |
| **Routing** | [Project OSRM](https://router.project-osrm.org/) public API |
| **Backend** | Python [Flask](https://flask.palletsprojects.com/) 3.x |
| **Database** | SQLite (via `travelmate.db`) |

---

## 📁 Project Structure

```
TravelMate/
├── index.html              # Main HTML page
├── style.css               # Complete stylesheet (dark/light themes)
├── js/
│   ├── fareEngine.js       # Fare calculation engine (pure logic)
│   └── app.js              # Map, routing, UI controller
├── data/
│   └── rates.json          # Fallback fare rate configuration
├── app.py                  # Flask backend server
├── schema.sql              # SQLite database schema
├── requirements.txt        # Python dependencies
├── travelmate.db           # SQLite database (auto-created)
└── README.md               # This file
```

---

## 🚀 Quick Start

### Option A: Standalone Frontend (No Backend)

Simply open `index.html` in any modern browser. The frontend loads fare rates from `data/rates.json` and uses public Nominatim + OSRM APIs directly.

```bash
# macOS
open index.html

# Windows
start index.html

# Linux
xdg-open index.html
```

> **Note:** You need an internet connection for map tiles, geocoding, and routing.

### Option B: With Flask Backend

```bash
# 1. Navigate to the project directory
cd TravelMate

# 2. Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate         # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the server
python app.py

# 5. Open in browser
# → http://localhost:5000
```

The Flask backend:
- Serves the static frontend
- Provides `/api/rates` for dynamic fare configuration
- Logs anonymized fare lookups to `travelmate.db`

---

## 🧮 Fare Formula

The fare estimation engine (`fareEngine.js`) uses this transparent, documented formula:

```
distanceFare  = max(0, distanceKm − baseKm) × perKmRate
waitingFare   = waitingMinutes × waitingRatePerMin
baseEstimate  = baseFare + distanceFare + waitingFare

fareRange     = [ round(baseEstimate × 0.95),       ← lower bound (−5%)
                  round(baseEstimate × 1.10) ]       ← upper bound (+10%)

upperRefLimit = round(baseEstimate × (1 + upperBufferPercent / 100))
                                                      ← negotiation ceiling (default +15%)
```

### Example: Agra Cantt Station → Taj Mahal (~6.5 km, Auto-Rickshaw, 5 min wait)

| Component | Calculation | Amount |
|-----------|-------------|--------|
| Base Fare | First 2 km included | ₹25.00 |
| Distance Fare | (6.5 − 2) × ₹10.50 | ₹47.25 |
| Waiting Charge | 5 × ₹1.00 | ₹5.00 |
| **Base Estimate** | | **₹77.25** |
| Fare Range | ₹73 – ₹85 | |
| Upper Reference Limit | ₹77.25 × 1.15 | **₹89** |

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/rates` | Get all city/vehicle fare rate configurations |
| `GET` | `/api/rates?city=agra` | Filter rates by city |
| `GET` | `/api/rates?city=agra&vehicle=auto` | Filter by city and vehicle |
| `POST` | `/api/log` | Log an anonymized fare estimate lookup |
| `GET` | `/api/stats` | Get aggregated anonymized usage statistics |
| `GET` | `/api/health` | Health check |

### POST /api/log — Request Body

```json
{
  "city": "agra",
  "vehicle": "auto",
  "distanceKm": 6.5,
  "fareEstimate": 77.25,
  "timestamp": "2026-01-15T10:30:00.000Z"
}
```

---

## 📊 Default Fare Presets

> **⚠️ Illustrative configurable rates — verify against local RTO tariff**

| City | Vehicle | Base Fare | Base Km | Per-km Rate | Waiting/min |
|------|---------|-----------|---------|-------------|-------------|
| Agra | Auto-Rickshaw | ₹25 | 2 km | ₹10.50 | ₹1.00 |
| Agra | E-Rickshaw | ₹10 | 1 km | ₹7.00 | ₹0.50 |
| Delhi | Auto-Rickshaw | ₹25 | 2 km | ₹9.50 | ₹0.75 |
| Delhi | E-Rickshaw | ₹10 | 1 km | ₹5.00 | ₹0.50 |
| Jaipur | Auto-Rickshaw | ₹25 | 2 km | ₹10.00 | ₹1.00 |
| Jaipur | E-Rickshaw | ₹10 | 1 km | ₹6.50 | ₹0.50 |
| Lucknow | Auto-Rickshaw | ₹25 | 2 km | ₹10.00 | ₹1.00 |
| Lucknow | E-Rickshaw | ₹10 | 1 km | ₹6.00 | ₹0.50 |
| Varanasi | Auto-Rickshaw | ₹20 | 2 km | ₹10.00 | ₹1.00 |
| Varanasi | E-Rickshaw | ₹10 | 1 km | ₹5.50 | ₹0.50 |

---

## ✅ Manual Verification Checklist

Use these test cases to verify the application works correctly:

### TC-01: Empty Fields Validation
- [ ] Leave both FROM and TO blank → Click "Estimate Fare"
- [ ] **Expected:** Inline validation messages appear on both inputs ("Please enter a starting location" / "Please enter a destination")
- [ ] No API call is made; no fare is displayed

### TC-02: Single Empty Field
- [ ] Enter a valid FROM, leave TO blank → Click "Estimate Fare"
- [ ] **Expected:** Inline error on TO only

### TC-03: Valid Agra Route (Agra Cantt → Taj Mahal)
- [ ] Select City: Agra, Vehicle: Auto-Rickshaw
- [ ] Enter FROM: "Agra Cantt Railway Station", TO: "Taj Mahal"
- [ ] Select from autocomplete suggestions, set Waiting: 5 min
- [ ] Click "Estimate Fare"
- [ ] **Expected:**
  - Map shows route polyline in blue
  - Markers A (green) and B (red) placed correctly
  - Map auto-fits to show both markers and route
  - Distance shown in km (approx 5–8 km depending on road)
  - Estimated travel time displayed
  - Fare range displayed (e.g., ₹XX – ₹YY)
  - Upper Reference Limit shown
  - Itemized breakdown visible (Base + Distance + Waiting)
  - Disclaimer banner visible at bottom

### TC-04: Invalid / Unroutable Points
- [ ] Set one point in Agra, one point extremely far (e.g., type nonsense)
- [ ] **Expected:** Clear error message: "No road route found" or "Please refine location names"
- [ ] No fare is displayed; previous results are hidden

### TC-05: Network / OSRM Failure
- [ ] Disconnect from internet → Click "Estimate Fare" with valid inputs
- [ ] **Expected:** Error message: "Routing service unavailable" with a "Retry" button
- [ ] Clicking "Retry" re-attempts the estimate

### TC-06: Vehicle Type Switch
- [ ] Complete a fare estimate with Auto-Rickshaw
- [ ] Switch to E-Rickshaw → Click "Estimate Fare" again
- [ ] **Expected:** Fare assumptions update; new fare (lower) is calculated

### TC-07: City Switch
- [ ] Change city from Agra to Delhi
- [ ] **Expected:** Map pans to Delhi; vehicle selector refreshes; fare assumptions update
- [ ] Previous route/markers are cleared

### TC-08: Edit Fare Assumptions
- [ ] Open "Edit Fare Assumptions" drawer
- [ ] Change Per-km Rate to ₹15.00 → Click "Estimate Fare"
- [ ] **Expected:** Fare recalculated using custom rate; breakdown reflects ₹15.00/km
- [ ] Click "Reset to Defaults" → Assumptions revert to city/vehicle presets

### TC-09: Dark/Light Theme Toggle
- [ ] Click the moon/sun icon in header
- [ ] **Expected:** Theme switches immediately; map tiles remain readable
- [ ] Refresh page → Theme preference persisted

### TC-10: Mobile Responsiveness
- [ ] Open on mobile viewport (≤ 480px) or browser dev tools
- [ ] **Expected:**
  - Sidebar stacks above the map
  - All controls are usable (no overflow/clipping)
  - Result panel scrolls into view after calculation
  - Touch targets are at least 44×44px

### TC-11: Marker Drag
- [ ] After setting points, drag marker A to a new location
- [ ] **Expected:** Input field updates with reverse-geocoded address

### TC-12: Map Click
- [ ] Click on the map to set Point A, then click again for Point B
- [ ] **Expected:** Markers placed at click locations; input fields update

---

## 🔒 Privacy Notice

TravelMate respects user privacy:

- **No personal data collected** — No IP addresses, cookies, user accounts, or session tokens
- **No GPS tracking** — Coordinates are used only in-browser for routing; precise coordinates are never stored on the server
- **Anonymized logging** — If the Flask backend is used, only city name, vehicle type, rounded distance, and fare estimate are logged (no PII)
- **Local-first** — The frontend works entirely in the browser without any backend
- **No third-party analytics** — No tracking pixels, ad networks, or analytics scripts

---

<p align="center">
  Built with ❤️ for transparent, fair travel in India<br>
  <strong>TravelMate</strong> — Know your fare before the ride 🛺
</p>
