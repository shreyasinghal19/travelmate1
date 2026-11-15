"""
═══════════════════════════════════════════════════════════════════
 TravelMate — Flask Backend (app.py)
═══════════════════════════════════════════════════════════════════

 A lightweight Python Flask server that:
   1. Serves the static frontend (index.html, style.css, js/)
   2. Exposes /api/rates for configurable city/vehicle fare rules
   3. Optionally logs anonymized fare lookup history to SQLite

 PRIVACY NOTICE:
   Logged data is anonymized — no IP addresses, user identifiers,
   or precise GPS coordinates are stored. Only city, vehicle type,
   rounded distance, and fare estimate are recorded for analytics.

═══════════════════════════════════════════════════════════════════
"""

import json
import os
import sqlite3
from datetime import datetime, timezone

from flask import Flask, g, jsonify, request, send_from_directory

# ── App Configuration ───────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "travelmate.db")
RATES_JSON = os.path.join(BASE_DIR, "data", "rates.json")
SCHEMA_SQL = os.path.join(BASE_DIR, "schema.sql")

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")


# ──  Database Helpers ────────────────────────────────────────────
def get_db():
    """Open a database connection for the current request."""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
    return g.db


@app.teardown_appcontext
def close_db(exception):
    """Close the database connection at end of request."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Initialize the database from schema.sql if tables don't exist."""
    db = sqlite3.connect(DB_PATH)
    try:
        if os.path.exists(SCHEMA_SQL):
            with open(SCHEMA_SQL, "r", encoding="utf-8") as f:
                db.executescript(f.read())
            print(f"[DB] Initialized database at {DB_PATH}")
        else:
            print(f"[DB] Warning: schema.sql not found at {SCHEMA_SQL}")
    finally:
        db.close()


# ──  Load Rates ──────────────────────────────────────────────────
def load_rates():
    """Load fare rates from JSON file."""
    try:
        with open(RATES_JSON, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"[Rates] Warning: {RATES_JSON} not found, returning empty config.")
        return {"meta": {}, "cities": {}}
    except json.JSONDecodeError as e:
        print(f"[Rates] Error parsing rates.json: {e}")
        return {"meta": {}, "cities": {}}


# ════════════════════════════════════════════════════════════════
#  ROUTES
# ════════════════════════════════════════════════════════════════

# ── Serve Frontend ──────────────────────────────────────────────
@app.route("/")
def serve_index():
    """Serve the main index.html."""
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/style.css")
def serve_css():
    return send_from_directory(BASE_DIR, "style.css")


@app.route("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory(os.path.join(BASE_DIR, "js"), filename)


@app.route("/data/<path:filename>")
def serve_data(filename):
    return send_from_directory(os.path.join(BASE_DIR, "data"), filename)


# ── API: Get Fare Rates ────────────────────────────────────────
@app.route("/api/rates", methods=["GET"])
def api_get_rates():
    """
    GET /api/rates
    Returns all city/vehicle fare rate configurations.

    Optional query params:
      ?city=agra        — filter to a single city
      ?vehicle=auto     — filter to a single vehicle type within the city

    Response: JSON object with 'meta' and 'cities' keys.
    """
    data = load_rates()
    city_filter = request.args.get("city", "").lower().strip()
    vehicle_filter = request.args.get("vehicle", "").lower().strip()

    if city_filter:
        if city_filter in data.get("cities", {}):
            city_data = data["cities"][city_filter]
            if vehicle_filter and vehicle_filter in city_data.get("vehicles", {}):
                city_data = {
                    **city_data,
                    "vehicles": {vehicle_filter: city_data["vehicles"][vehicle_filter]},
                }
            data = {"meta": data.get("meta", {}), "cities": {city_filter: city_data}}
        else:
            return jsonify({"error": f"City '{city_filter}' not found"}), 404

    return jsonify(data)


# ── API: Log Fare Estimate (Anonymized) ────────────────────────
@app.route("/api/log", methods=["POST"])
def api_log_estimate():
    """
    POST /api/log
    Logs an anonymized fare estimate lookup for analytics.

    PRIVACY: No IP addresses, user identifiers, or precise GPS
    coordinates are stored. Only aggregated route data is logged.

    Request body (JSON):
      {
        "city": "agra",
        "vehicle": "auto",
        "distanceKm": 11.0,
        "fareEstimate": 144.00,
        "timestamp": "2026-01-15T10:30:00.000Z"
      }

    Response: { "status": "logged" }
    """
    try:
        body = request.get_json(silent=True)
        if not body:
            return jsonify({"error": "Invalid JSON body"}), 400

        city = str(body.get("city", "unknown"))[:50]
        vehicle = str(body.get("vehicle", "unknown"))[:50]
        distance_km = round(float(body.get("distanceKm", 0)), 1)
        fare_estimate = round(float(body.get("fareEstimate", 0)), 2)
        timestamp = body.get("timestamp", datetime.now(timezone.utc).isoformat())

        db = get_db()
        db.execute(
            """
            INSERT INTO fare_logs (city, vehicle, distance_km, fare_estimate, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (city, vehicle, distance_km, fare_estimate, timestamp),
        )
        db.commit()

        return jsonify({"status": "logged"})

    except Exception as e:
        print(f"[Log] Error logging estimate: {e}")
        return jsonify({"error": "Logging failed"}), 500


# ── API: Get Fare Log Stats (Optional Analytics) ───────────────
@app.route("/api/stats", methods=["GET"])
def api_stats():
    """
    GET /api/stats
    Returns aggregated anonymized usage statistics.
    No personal data is exposed.
    """
    try:
        db = get_db()
        total = db.execute("SELECT COUNT(*) as cnt FROM fare_logs").fetchone()["cnt"]
        by_city = db.execute(
            """
            SELECT city, COUNT(*) as cnt, ROUND(AVG(distance_km), 1) as avg_dist,
                   ROUND(AVG(fare_estimate), 0) as avg_fare
            FROM fare_logs
            GROUP BY city
            ORDER BY cnt DESC
            """
        ).fetchall()

        return jsonify(
            {
                "totalLookups": total,
                "byCity": [dict(row) for row in by_city],
                "privacyNotice": "All data is anonymized. No personal information is stored.",
            }
        )
    except Exception as e:
        print(f"[Stats] Error: {e}")
        return jsonify({"totalLookups": 0, "byCity": []})


# ── Health Check ────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({"status": "ok", "service": "TravelMate API", "version": "1.0.0"})


# ════════════════════════════════════════════════════════════════
#  MAIN
# ════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    init_db()
    print("=" * 60)
    print("  TravelMate — Flask Backend")
    print("  Open http://localhost:5000 in your browser")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=True)
