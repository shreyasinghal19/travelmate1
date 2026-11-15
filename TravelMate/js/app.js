/**
 * ═══════════════════════════════════════════════════════════════════
 *  TravelMate — Application Controller (app.js)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Handles: Leaflet map, Nominatim geocoding autocomplete,
 *  OSRM routing, UI events, marker drag, and fare result display.
 *  Depends on fareEngine.js being loaded first.
 *
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

const App = (() => {

  // ──  Constants ───────────────────────────────────────────────────
  const NOMINATIM_URL  = 'https://nominatim.openstreetmap.org/search';
  const OSRM_URL       = 'https://router.project-osrm.org/route/v1/driving';
  const DEBOUNCE_MS    = 400;
  const MIN_QUERY_LEN  = 3;

  // ── State ───────────────────────────────────────────────────────
  let map, tileLayer;
  let markerA = null, markerB = null;
  let routeLine = null;
  let coordsA = null, coordsB = null;
  let currentCity = 'agra';
  let currentVehicle = 'auto';
  let debounceTimers = {};
  let isEstimating = false;

  // ── Custom Icons ────────────────────────────────────────────────
  function createIcon(label, color) {
    return L.divIcon({
      className: 'custom-marker',
      html: `<div class="marker-pin" style="background:${color}"><span>${label}</span></div>`,
      iconSize: [36, 46],
      iconAnchor: [18, 46],
      popupAnchor: [0, -48]
    });
  }

  const iconA = createIcon('A', '#10b981');
  const iconB = createIcon('B', '#ef4444');

  // ════════════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ════════════════════════════════════════════════════════════════
  async function init() {
    await FareEngine.loadRates();
    initMap();
    populateCitySelector();
    populateVehicleSelector();
    loadFareAssumptions();
    bindEvents();
    applyTheme(getStoredTheme());
    console.log('[App] TravelMate initialized.');
  }

  function initMap() {
    const cityConfig = FareEngine.getCityConfig(currentCity);
    map = L.map('map', {
      center: cityConfig.defaultCenter,
      zoom: cityConfig.defaultZoom,
      zoomControl: true
    });

    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Click on map to set points
    map.on('click', (e) => {
      if (!coordsA) {
        setPoint('A', e.latlng, true);
      } else if (!coordsB) {
        setPoint('B', e.latlng, true);
      }
    });
  }

  // ════════════════════════════════════════════════════════════════
  //  UI POPULATION
  // ════════════════════════════════════════════════════════════════
  function populateCitySelector() {
    const sel = document.getElementById('city-select');
    sel.innerHTML = '';
    FareEngine.getCities().forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} — ${c.tier}`;
      if (c.id === currentCity) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function populateVehicleSelector() {
    const sel = document.getElementById('vehicle-select');
    sel.innerHTML = '';
    FareEngine.getVehicleTypes(currentCity).forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = `${v.icon} ${v.name}`;
      if (v.id === currentVehicle) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function loadFareAssumptions() {
    const v = FareEngine.getVehicleConfig(currentCity, currentVehicle);
    document.getElementById('param-base-fare').value      = v.baseFare;
    document.getElementById('param-base-km').value        = v.baseKm;
    document.getElementById('param-per-km').value         = v.perKmRate;
    document.getElementById('param-waiting-rate').value   = v.waitingRatePerMin;
    document.getElementById('param-upper-buffer').value   = v.upperBufferPercent;
    document.getElementById('rate-source').textContent    = v.rateSource;
    document.getElementById('rate-review-date').textContent = v.reviewDate;
  }

  // ════════════════════════════════════════════════════════════════
  //  EVENT BINDING
  // ════════════════════════════════════════════════════════════════
  function bindEvents() {
    // City & vehicle selectors
    document.getElementById('city-select').addEventListener('change', (e) => {
      currentCity = e.target.value;
      const city = FareEngine.getCityConfig(currentCity);
      map.setView(city.defaultCenter, city.defaultZoom);
      populateVehicleSelector();
      loadFareAssumptions();
      clearRoute();
    });

    document.getElementById('vehicle-select').addEventListener('change', (e) => {
      currentVehicle = e.target.value;
      loadFareAssumptions();
    });

    // Location inputs — autocomplete
    setupAutocomplete('input-from', 'suggestions-from', 'A');
    setupAutocomplete('input-to', 'suggestions-to', 'B');

    // Estimate button
    document.getElementById('btn-estimate').addEventListener('click', handleEstimate);

    // Reset button
    document.getElementById('btn-reset').addEventListener('click', handleReset);

    // Theme toggle
    document.getElementById('btn-theme').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });

    // Collapsible fare assumptions
    document.getElementById('toggle-assumptions').addEventListener('click', () => {
      const drawer = document.getElementById('assumptions-drawer');
      const toggle = document.getElementById('toggle-assumptions');
      const isOpen = drawer.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen);
    });

    // Reset assumptions to defaults
    document.getElementById('btn-reset-assumptions').addEventListener('click', () => {
      loadFareAssumptions();
    });

    // Keyboard: Enter on inputs triggers estimate
    ['input-from', 'input-to', 'input-waiting'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleEstimate();
      });
    });
  }

  // ════════════════════════════════════════════════════════════════
  //  AUTOCOMPLETE (Nominatim)
  // ════════════════════════════════════════════════════════════════
  function setupAutocomplete(inputId, suggestionsId, point) {
    const input = document.getElementById(inputId);
    const list  = document.getElementById(suggestionsId);

    input.addEventListener('input', () => {
      clearTimeout(debounceTimers[inputId]);
      const query = input.value.trim();

      if (query.length < MIN_QUERY_LEN) {
        list.innerHTML = '';
        list.classList.remove('visible');
        return;
      }

      debounceTimers[inputId] = setTimeout(() => {
        geocodeSearch(query, list, input, point);
      }, DEBOUNCE_MS);
    });

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !list.contains(e.target)) {
        list.innerHTML = '';
        list.classList.remove('visible');
      }
    });
  }

  async function geocodeSearch(query, list, input, point) {
    const city = FareEngine.getCityConfig(currentCity);
    const viewbox = getViewbox(city.defaultCenter);

    const params = new URLSearchParams({
      q: query,
      format: 'json',
      addressdetails: '1',
      limit: '6',
      countrycodes: 'in',
      viewbox: viewbox,
      bounded: '0'
    });

    try {
      const res = await fetch(`${NOMINATIM_URL}?${params}`, {
        headers: { 'Accept-Language': 'en' }
      });
      if (!res.ok) throw new Error('Nominatim request failed');
      const results = await res.json();

      list.innerHTML = '';
      if (results.length === 0) {
        const li = document.createElement('li');
        li.className = 'suggestion-item no-result';
        li.textContent = 'No locations found — try a more specific name';
        list.appendChild(li);
        list.classList.add('visible');
        return;
      }

      results.forEach(r => {
        const li = document.createElement('li');
        li.className = 'suggestion-item';
        li.textContent = r.display_name;
        li.addEventListener('click', () => {
          input.value = r.display_name;
          list.innerHTML = '';
          list.classList.remove('visible');
          const latlng = L.latLng(parseFloat(r.lat), parseFloat(r.lon));
          setPoint(point, latlng, false);
        });
        list.appendChild(li);
      });
      list.classList.add('visible');
    } catch (err) {
      console.warn('[Autocomplete]', err);
      list.innerHTML = '<li class="suggestion-item no-result">Geocoding service unavailable</li>';
      list.classList.add('visible');
    }
  }

  function getViewbox(center) {
    const d = 0.5; // ~50 km bias
    return `${center[1]-d},${center[0]+d},${center[1]+d},${center[0]-d}`;
  }

  // ════════════════════════════════════════════════════════════════
  //  MAP MARKERS
  // ════════════════════════════════════════════════════════════════
  function setPoint(point, latlng, reverseGeocode) {
    if (point === 'A') {
      coordsA = latlng;
      if (markerA) markerA.setLatLng(latlng);
      else {
        markerA = L.marker(latlng, { icon: iconA, draggable: true })
          .addTo(map)
          .bindPopup('Start (A)');
        markerA.on('dragend', () => {
          coordsA = markerA.getLatLng();
          reverseGeocodeFill(coordsA, 'input-from');
        });
      }
      if (reverseGeocode) reverseGeocodeFill(latlng, 'input-from');
    } else {
      coordsB = latlng;
      if (markerB) markerB.setLatLng(latlng);
      else {
        markerB = L.marker(latlng, { icon: iconB, draggable: true })
          .addTo(map)
          .bindPopup('Destination (B)');
        markerB.on('dragend', () => {
          coordsB = markerB.getLatLng();
          reverseGeocodeFill(coordsB, 'input-to');
        });
      }
      if (reverseGeocode) reverseGeocodeFill(latlng, 'input-to');
    }
  }

  async function reverseGeocodeFill(latlng, inputId) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat}&lon=${latlng.lng}&format=json&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.display_name) {
          document.getElementById(inputId).value = data.display_name;
        }
      }
    } catch (_) { /* silent */ }
  }

  // ════════════════════════════════════════════════════════════════
  //  ROUTING (OSRM)
  // ════════════════════════════════════════════════════════════════
  async function fetchRoute(latLngA, latLngB) {
    const coords = `${latLngA.lng},${latLngA.lat};${latLngB.lng},${latLngB.lat}`;
    const url = `${OSRM_URL}/${coords}?overview=full&geometries=geojson&steps=false`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      const data = await res.json();

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error('NO_ROUTE');
      }

      const route = data.routes[0];
      return {
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        geometry: route.geometry
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('TIMEOUT');
      }
      throw err;
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  ESTIMATE HANDLER
  // ════════════════════════════════════════════════════════════════
  async function handleEstimate() {
    if (isEstimating) return;

    // ── Validate inputs ───────────────────────────────────────────
    const inputFrom = document.getElementById('input-from');
    const inputTo   = document.getElementById('input-to');
    clearErrors();

    let hasError = false;
    if (!inputFrom.value.trim()) {
      showFieldError('input-from', 'Please enter a starting location');
      hasError = true;
    }
    if (!inputTo.value.trim()) {
      showFieldError('input-to', 'Please enter a destination');
      hasError = true;
    }
    if (hasError) return;

    if (!coordsA || !coordsB) {
      showAlert('Please select valid locations from the suggestions or click on the map.', 'warning');
      return;
    }

    // ── Show loading state ────────────────────────────────────────
    setLoading(true);
    hideResult();

    try {
      // ── Fetch OSRM route ──────────────────────────────────────
      const route = await fetchRoute(coordsA, coordsB);
      const distKm = FareEngine.metersToKm(route.distanceMeters);
      const duration = FareEngine.formatDuration(route.durationSeconds);

      if (distKm <= 0) {
        showAlert('No road route found between these points. Please refine your locations.', 'error');
        setLoading(false);
        return;
      }

      // ── Draw route on map ─────────────────────────────────────
      drawRoute(route.geometry);

      // ── Calculate fare ────────────────────────────────────────
      const waitingMins = parseFloat(document.getElementById('input-waiting').value) || 0;

      const overrides = {
        baseFare:          parseFloat(document.getElementById('param-base-fare').value),
        baseKm:            parseFloat(document.getElementById('param-base-km').value),
        perKmRate:         parseFloat(document.getElementById('param-per-km').value),
        waitingRatePerMin: parseFloat(document.getElementById('param-waiting-rate').value),
        upperBufferPercent: parseFloat(document.getElementById('param-upper-buffer').value)
      };

      const fare = FareEngine.estimateFare(currentCity, currentVehicle, distKm, waitingMins, overrides);

      if (!fare) {
        showAlert('Could not calculate fare — distance or parameters are invalid.', 'error');
        setLoading(false);
        return;
      }

      // ── Display result ────────────────────────────────────────
      displayResult(fare, duration);

      // ── Log to backend (optional, anonymized) ─────────────────
      logEstimate(fare);

    } catch (err) {
      console.error('[Estimate]', err);
      if (err.message === 'TIMEOUT') {
        showAlert(
          'Routing service timed out. Please check your connection and try again.',
          'error',
          true
        );
      } else if (err.message === 'NO_ROUTE') {
        showAlert('No road route found between these points. Please try different locations.', 'error');
      } else {
        showAlert(
          'Routing service unavailable — please try again shortly.',
          'error',
          true
        );
      }
    } finally {
      setLoading(false);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  DRAW ROUTE ON MAP
  // ════════════════════════════════════════════════════════════════
  function drawRoute(geometry) {
    if (routeLine) map.removeLayer(routeLine);

    routeLine = L.geoJSON(geometry, {
      style: {
        color: '#3b82f6',
        weight: 5,
        opacity: 0.85,
        lineCap: 'round'
      }
    }).addTo(map);

    // Fit bounds to show full route
    const group = L.featureGroup([markerA, markerB, routeLine]);
    map.fitBounds(group.getBounds().pad(0.15));
  }

  // ════════════════════════════════════════════════════════════════
  //  DISPLAY RESULT
  // ════════════════════════════════════════════════════════════════
  function displayResult(fare, duration) {
    const panel = document.getElementById('result-panel');
    panel.classList.add('visible');

    document.getElementById('res-distance').textContent    = `${fare.distanceKm} km`;
    document.getElementById('res-duration').textContent    = duration;
    document.getElementById('res-fare-low').textContent    = `₹${fare.fareRange.low}`;
    document.getElementById('res-fare-high').textContent   = `₹${fare.fareRange.high}`;
    document.getElementById('res-upper-limit').textContent = `₹${fare.upperReferenceLimit}`;

    // Breakdown
    document.getElementById('res-breakdown').innerHTML = `
      <div class="breakdown-row">
        <span>Base Fare (first ${fare.params.baseKm} km)</span>
        <span>₹${fare.baseFareCharge.toFixed(2)}</span>
      </div>
      <div class="breakdown-row">
        <span>Distance Fare (${Math.max(0, fare.distanceKm - fare.params.baseKm).toFixed(2)} km × ₹${fare.params.perKmRate}/km)</span>
        <span>₹${fare.distanceFareCharge.toFixed(2)}</span>
      </div>
      <div class="breakdown-row">
        <span>Waiting Charge (${fare.waitingMinutes} min × ₹${fare.params.waitingRatePerMin}/min)</span>
        <span>₹${fare.waitingFareCharge.toFixed(2)}</span>
      </div>
      <div class="breakdown-row total">
        <span>Base Estimate</span>
        <span>₹${fare.baseEstimate.toFixed(2)}</span>
      </div>
    `;

    // Scroll to result on mobile
    if (window.innerWidth < 900) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  RESET / CLEAR
  // ════════════════════════════════════════════════════════════════
  function handleReset() {
    document.getElementById('input-from').value = '';
    document.getElementById('input-to').value = '';
    document.getElementById('input-waiting').value = '0';
    clearErrors();
    clearRoute();
    hideResult();
    loadFareAssumptions();

    const city = FareEngine.getCityConfig(currentCity);
    map.setView(city.defaultCenter, city.defaultZoom);
  }

  function clearRoute() {
    if (markerA) { map.removeLayer(markerA); markerA = null; coordsA = null; }
    if (markerB) { map.removeLayer(markerB); markerB = null; coordsB = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  }

  function hideResult() {
    document.getElementById('result-panel').classList.remove('visible');
  }

  // ════════════════════════════════════════════════════════════════
  //  ERROR / ALERT DISPLAY
  // ════════════════════════════════════════════════════════════════
  function showFieldError(inputId, message) {
    const input = document.getElementById(inputId);
    input.classList.add('input-error');
    const container = input.closest('.input-group');
    const existing = container.querySelector('.field-error');
    if (existing) existing.remove();
    const err = document.createElement('div');
    err.className = 'field-error';
    err.textContent = message;
    container.appendChild(err);
  }

  function clearErrors() {
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    document.querySelectorAll('.field-error').forEach(el => el.remove());
    hideAlert();
  }

  function showAlert(message, type = 'error', showRetry = false) {
    const alertEl = document.getElementById('alert-banner');
    alertEl.className = `alert-banner ${type} visible`;
    document.getElementById('alert-message').textContent = message;
    const retryBtn = document.getElementById('btn-retry');
    retryBtn.style.display = showRetry ? 'inline-flex' : 'none';
    if (showRetry) {
      retryBtn.onclick = () => {
        hideAlert();
        handleEstimate();
      };
    }
  }

  function hideAlert() {
    const alertEl = document.getElementById('alert-banner');
    alertEl.classList.remove('visible');
  }

  // ════════════════════════════════════════════════════════════════
  //  LOADING STATE
  // ════════════════════════════════════════════════════════════════
  function setLoading(loading) {
    isEstimating = loading;
    const btn = document.getElementById('btn-estimate');
    const spinner = document.getElementById('btn-spinner');
    const text = document.getElementById('btn-text');

    if (loading) {
      btn.disabled = true;
      btn.classList.add('loading');
      spinner.style.display = 'inline-block';
      text.textContent = 'Calculating…';
    } else {
      btn.disabled = false;
      btn.classList.remove('loading');
      spinner.style.display = 'none';
      text.textContent = 'Estimate Fare';
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  THEME
  // ════════════════════════════════════════════════════════════════
  function getStoredTheme() {
    return localStorage.getItem('travelmate-theme') || 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('travelmate-theme', theme);
    const icon = document.getElementById('theme-icon');
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // ════════════════════════════════════════════════════════════════
  //  OPTIONAL: Log estimate to backend (anonymized)
  // ════════════════════════════════════════════════════════════════
  async function logEstimate(fare) {
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: currentCity,
          vehicle: currentVehicle,
          distanceKm: fare.distanceKm,
          fareEstimate: fare.baseEstimate,
          timestamp: new Date().toISOString()
        }),
        signal: AbortSignal.timeout(3000)
      });
    } catch (_) { /* logging is optional — never block the UX */ }
  }

  // ════════════════════════════════════════════════════════════════
  //  PUBLIC
  // ════════════════════════════════════════════════════════════════
  return { init };
})();

// ── Bootstrap ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', App.init);
