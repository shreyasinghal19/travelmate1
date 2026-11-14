Build a complete, responsive, production-ready web application called **"TravelMate — A Route-Based Local Auto Fare Estimation System"** based on the following exact technical specifications:

### 1. Project Overview & Purpose
- **Goal:** Help travellers (tourists, students, first-time visitors) check a route and get a realistic, transparent local auto-rickshaw or e-rickshaw fare estimate before negotiating an unmetered ride[cite: 5, 9, 10].
- **Core Rule:** Clearly display an estimate disclaimer everywhere ("Indicative estimate only — not an official tariff or guaranteed price")[cite: 11, 28]. Never guess or display a fare if a route or distance is invalid[cite: 16, 24].

## 2. Tech Stack & Architecture
- **Frontend:** Clean, modular HTML5, CSS3, and Vanilla JavaScript (separate `index.html`, `style.css`, and `app.js` / `fareEngine.js` so map, routing, and fare logic are cleanly decoupled)[cite: 12, 16].
- **Map & Geocoding:** Leaflet.js with OpenStreetMap (OSM) tiles[cite: 12], plus Nominatim API for location autocomplete/geocoding (biased toward Indian cities, defaulting to Agra, Uttar Pradesh, e.g., *Agra Cantt Railway Station* to *Taj Mahal*).
- **Routing & Distance:** Project OSRM public routing API (`router.project-osrm.org`) to fetch actual road geometry (polyline) and exact road distance in meters, converted to kilometers (`km`)[cite: 11, 12].
- **Optional Lightweight Backend (Include ready-to-run):** A clean Python Flask (`app.py`) + SQLite (`travelmate.db`) backend that serves the static frontend, exposes `/api/rates` for configurable city/vehicle fare rules, and optionally logs anonymized fare lookup history (with a clear privacy notice)[cite: 12, 29, 30]. Ensure the frontend also works seamlessly standalone with fallback local JSON config if Flask isn't running.

### 3. UI/UX Design & Layout
Combine a clean, modern dark/light high-contrast aesthetic (inspired by modern travel apps) with all required report elements[cite: 15, 16]:
- **Header:** Brand title **TravelMate** with subtitle *Route-Based Local Auto Fare Estimator* and currency badge (`₹ INR`)[cite: 7, 15].
- **Input Controls Panel:**
  - **City Selector:** Dropdown with configurable Indian cities (default: **Agra — Tier 2**, plus Delhi, Jaipur, Lucknow, Varanasi)[cite: 15].
  - **Vehicle Category Selector:** Auto-Rickshaw vs. E-Rickshaw[cite: 9, 13].
  - **FROM (Starting Point) & TO (Destination):** Text inputs with live location suggestions/geocoding and ability to click/drag markers directly on the map[cite: 11, 16].
  - **Optional Waiting Time (minutes):** Numeric input (default `0` or `5` mins)[cite: 15].
  - **Collapsible "Edit Fare Assumptions" Drawer:** Allows users/evaluators to inspect and customize Base Fare (₹), Base Distance (km), Per-km Rate (₹/km), Waiting Charge (₹/min), and Upper Buffer (%) with rate source & review date metadata[cite: 13, 15, 25].
  - **Action Button:** `"Estimate Fare"` button with an active loading spinner state during geocoding/OSRM lookup[cite: 16].
- **Interactive Map Panel (Leaflet + OSM):**
  - Displays distinct markers for **Point A (Start)** and **Point B (Destination)** and draws the OSRM road route polyline in a bold, clear color[cite: 7, 11].
  - Auto-fits map bounds to the selected route[cite: 11].
- **Result Panel (Visually distinct from route/distance):**
  - **Route Distance:** Clearly displayed in `km` (e.g., `11.0 km`) alongside estimated travel duration[cite: 15, 26].
  - **Estimated Fare Range:** e.g., `₹135 – ₹155`[cite: 6, 13].
  - **Suggested Upper Reference Limit:** Highlighted clearly so users know the maximum fair negotiation ceiling[cite: 6, 16].
  - **Itemized Breakdown:** Transparent formula breakdown (e.g., `Base ₹25.00 + Distance ₹114.00 + Waiting ₹5.00 = ₹144.00`)[cite: 15].
  - **Disclaimer Banner:** Visible note stating final fare depends on traffic, waiting time, and driver agreement[cite: 13, 16].

### 4. Fare Estimation Logic (`fareEngine.js`)
Implement a well-documented, transparent formula:
- `distanceFare = Math.max(0, distanceKm - baseKm) * perKmRate`
- `waitingFare = waitingMinutes * waitingRatePerMin`
- `baseEstimate = baseFare + distanceFare + waitingFare`
- `fareRange = [Math.round(baseEstimate * 0.95), Math.round(baseEstimate * 1.10)]`
- `upperReferenceLimit = Math.round(baseEstimate * 1.15)` (configurable negotiation cap)[cite: 6, 13]
- Include default illustrative presets (clearly labeled *"Illustrative configurable rates — verify against local RTO tariff"*) such as Agra Auto-Rickshaw: Base ₹25 (first 2 km), ₹10.50/km thereafter, ₹1/min waiting[cite: 13, 15].

### 5. Validation, Error Handling & Edge Cases
- **Empty Inputs:** Prevent API call and show inline validation message if `FROM` or `TO` is empty[cite: 27].
- **Ambiguous / Unfound Locations:** Show clear user-friendly alert asking to refine location names[cite: 27, 36].
- **Unroutable / Invalid Distance (`<= 0`):** Display clear error ("No road route found between these points") and hide/reset any previous fare result[cite: 24, 27].
- **Network / OSRM Timeout:** Catch fetch failures gracefully and show a "Routing service unavailable — Retry" button[cite: 27, 36].

### 6. Project Deliverables to Generate
1. Complete frontend (`index.html`, `style.css`, `js/fareEngine.js`, `js/app.js`).
2. Complete Flask + SQLite backend (`app.py`, `requirements.txt`, `schema.sql`).
3. A `README.md` documenting setup instructions, exact fare formula, API endpoints, and a manual verification checklist matching standard test cases (empty fields, valid Agra route, invalid route, network failure, mobile responsiveness)[cite: 25, 33].
