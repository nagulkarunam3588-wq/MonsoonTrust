"""
MonsoonTrust - Main FastAPI Application
Serves the research REST API and the interactive frontend application.
"""

from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime, date
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.location_service import LocationIntelligence
from backend.model_service import ModelService
from backend.dataset_service import DatasetService
from backend.history_service import HistoryService
from backend.weather_service import WeatherService

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "monsoon_results"
FRONTEND_DIR = PROJECT_ROOT / "frontend"

app = FastAPI(
    title="MonsoonTrust API",
    description="AI-Based Rainfall Forecast Reliability Assessment and Analysis System",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enable GZip compression for ultra-fast response transmission
app.add_middleware(GZipMiddleware, minimum_size=500)

# Initialize Core Services
dataset_service = DatasetService(DATA_DIR)
model_service = ModelService(DATA_DIR)
location_service = LocationIntelligence(dataset_service.grid_points_list)
history_service = HistoryService(DATA_DIR / "query_history.json")
weather_service = WeatherService()


class PredictRequest(BaseModel):
    forecast_rainfall_mm: float = Field(..., ge=0, le=500, description="Forecast rainfall amount in mm")
    forecast_day: int = Field(..., ge=1, le=10, description="Forecast lead day (1 to 10)")
    latitude: float = Field(..., ge=8.0, le=14.5, description="Latitude coordinate")
    longitude: float = Field(..., ge=75.8, le=80.8, description="Longitude coordinate")
    district: Optional[str] = "Chennai"
    locality: Optional[str] = "Chennai Central"
    model_type: Optional[str] = "temporal"


class LocationResolveRequest(BaseModel):
    district: Optional[str] = None
    locality: Optional[str] = None
    custom_lat: Optional[float] = None
    custom_lon: Optional[float] = None


def get_season_info(d_str: str) -> Dict[str, Any]:
    try:
        dt = datetime.strptime(d_str[:10], "%Y-%m-%d").date()
    except Exception:
        dt = date.today()
    m = dt.month
    if m in [10, 11, 12]:
        return {
            "code": "NEM",
            "name": "Northeast Monsoon (Oct–Dec)",
            "icon": "🌧️",
            "tag": "Primary Rainy Season",
            "description": "Tamil Nadu's principal rainfall season (~48% of annual rainfall). Coastal moisture fluxes bring frequent showers, though weather models can occasionally over-predict light rain."
        }
    elif m in [6, 7, 8, 9]:
        return {
            "code": "SWM",
            "name": "Southwest Monsoon (Jun–Sep)",
            "icon": "⛰️",
            "tag": "Western Ghats Monsoon",
            "description": "Western Ghats (Nilgiris, Tenkasi) receive heavy mountain rainfall, while central and eastern plains sit in the dry rain-shadow with high forecast reliability."
        }
    elif m in [3, 4, 5]:
        return {
            "code": "SUM",
            "name": "Summer Pre-Monsoon (Mar–May)",
            "icon": "☀️",
            "tag": "Convective Thunderstorms",
            "description": "Warm temperatures generate localized afternoon thunderstorms. Highly localized convective showers can cause localized forecast variance."
        }
    else:
        return {
            "code": "WIN",
            "name": "Winter Dry Period (Jan–Feb)",
            "icon": "🌤️",
            "tag": "Stable Dry Season",
            "description": "Generally stable dry conditions across Tamil Nadu with high baseline forecast accuracy (often 90%+ reliable)."
        }


@app.get("/api/available-dates")
def get_available_dates():
    """Return available dates in the historical research archive and season definitions."""
    dates_info = dataset_service.get_available_dates()
    today_str = date.today().strftime("%Y-%m-%d")
    return {
        "today": today_str,
        "current_season": get_season_info(today_str),
        "historical_archive": dates_info
    }


@app.get("/api/check-date")
def check_date_reliability(
    target_date: str = Query(..., description="Target date in YYYY-MM-DD format"),
    lat: float = Query(..., ge=8.0, le=14.5),
    lon: float = Query(..., ge=75.8, le=80.8),
    forecast_rainfall_mm: float = Query(5.0, ge=0.0, le=500.0),
    district: Optional[str] = "Chennai",
    locality: Optional[str] = "Chennai Central",
    model_type: Optional[str] = "temporal"
):
    """
    Evaluate forecast reliability for any particular date (historical archive date or current/future date).
    """
    today_dt = date.today()
    target_date_clean = target_date.strip()[:10]

    try:
        target_dt = datetime.strptime(target_date_clean, "%Y-%m-%d").date()
        diff_days = (target_dt - today_dt).days
        if diff_days <= 0:
            lead_day = 1
        elif diff_days > 10:
            lead_day = 10
        else:
            lead_day = diff_days
    except Exception:
        target_dt = today_dt
        lead_day = 5

    season = get_season_info(target_date_clean)

    # Check if target date is in the 16,700 historical archive
    ground_truth = dataset_service.get_date_ground_truth(target_date_clean, lat, lon)

    effective_rainfall = forecast_rainfall_mm
    effective_lead_day = lead_day

    # If historical ground truth exists, sync with the matching archive record
    if ground_truth["found"] and len(ground_truth["records"]) > 0:
        matching_rec = next((r for r in ground_truth["records"] if r["lead_day"] == lead_day), ground_truth["records"][0])
        effective_rainfall = matching_rec["forecast_rainfall_mm"]
        effective_lead_day = matching_rec["lead_day"]

    pred_result = model_service.predict(
        forecast_rainfall_mm=effective_rainfall,
        forecast_day=effective_lead_day,
        latitude=lat,
        longitude=lon,
        model_type=model_type or "temporal"
    )

    grid_info = location_service.find_nearest_research_grid(lat, lon)

    # Save to history
    history_entry = {
        "district": district,
        "locality": locality,
        "target_date": target_date_clean,
        "lat": lat,
        "lon": lon,
        "forecast_day": effective_lead_day,
        "forecast_rainfall_mm": effective_rainfall,
        "reliable_probability": pred_result["prediction"]["reliable_probability"],
        "grade": pred_result["prediction"]["grade"],
        "grade_color": pred_result["prediction"]["grade_color"]
    }
    history_service.add_entry(history_entry)

    return {
        "target_date": target_date_clean,
        "lead_day": effective_lead_day,
        "forecast_rainfall_mm": effective_rainfall,
        "season": season,
        "ground_truth": ground_truth,
        "prediction": pred_result["prediction"],
        "benchmarks": pred_result["benchmarks"],
        "features_analysis": pred_result["features_analysis"],
        "location": {
            "district": district,
            "locality": locality,
            "latitude": lat,
            "longitude": lon,
            "grid_lat": grid_info["grid_lat"],
            "grid_lon": grid_info["grid_lon"],
            "grid_distance_km": grid_info["distance_km"]
        }
    }


@app.get("/api/live-weather")
def get_live_weather(
    lat: float = Query(13.0827, ge=8.0, le=14.5),
    lon: float = Query(80.2707, ge=75.8, le=80.8),
    district: Optional[str] = "Chennai",
    force_refresh: bool = False
):
    """Fetch live weather conditions and 7-day forecast from Open-Meteo."""
    return weather_service.get_live_weather(lat=lat, lon=lon, district=district or "Chennai", force_refresh=force_refresh)


@app.get("/api/weather-news")
def get_weather_news(
    district: Optional[str] = "Chennai",
    tomorrow_rain_mm: float = Query(0.0, ge=0.0)
):
    """Fetch IMD/RMC Chennai regional alerts, monsoon advisories, and farming tips."""
    return weather_service.get_weather_news_and_alerts(
        district=district or "Chennai",
        tomorrow_rain_mm=tomorrow_rain_mm
    )


@app.get("/api/overview")
def get_executive_overview():
    """Return overview metrics and recent analyses."""
    metrics = dataset_service.get_overview_metrics()
    recent = history_service.get_recent(limit=6)
    models_info = model_service.model_metadata
    return {
        "metrics": metrics,
        "models": models_info,
        "recent_analyses": recent
    }


@app.get("/api/nearby-localities")
def get_nearby_localities(lat: float, lon: float, radius_km: float = 6.0, limit: int = 12):
    """Return surrounding localities within ~5-6 km radius of given coordinates."""
    nearby = location_service.get_surrounding_localities(lat=lat, lon=lon, radius_km=radius_km, limit=limit)
    return {"lat": lat, "lon": lon, "radius_km": radius_km, "count": len(nearby), "localities": nearby}


@app.get("/api/districts")
def get_districts():
    """Return all 38 Tamil Nadu districts and localities (instant pre-cached)."""
    return location_service.get_districts_full_payload()


@app.get("/api/localities/{district}")
def get_localities(district: str):
    """Return localities for a given district."""
    locs = location_service.get_localities_for_district(district)
    if not locs:
        raise HTTPException(status_code=404, detail="District not found")
    return {"district": district, "localities": locs}


@app.get("/api/search-locations")
def search_locations(q: str = Query(..., min_length=1)):
    """Fuzzy search for Tamil Nadu locations with typo correction."""
    return location_service.search_locations(q)


@app.post("/api/resolve-location")
def resolve_location(req: LocationResolveRequest):
    """Resolve location to coordinates and nearest grid point."""
    return location_service.resolve_location(
        district=req.district,
        locality=req.locality,
        custom_lat=req.custom_lat,
        custom_lon=req.custom_lon
    )


@app.post("/api/predict")
def predict_reliability(req: PredictRequest):
    """Run real-time ML reliability assessment."""
    try:
        result = model_service.predict(
            forecast_rainfall_mm=req.forecast_rainfall_mm,
            forecast_day=req.forecast_day,
            latitude=req.latitude,
            longitude=req.longitude,
            model_type=req.model_type or "temporal"
        )

        # Enrich with location data
        grid_info = location_service.find_nearest_research_grid(req.latitude, req.longitude)
        result["location"] = {
            "district": req.district,
            "locality": req.locality,
            "latitude": req.latitude,
            "longitude": req.longitude,
            "grid_lat": grid_info["grid_lat"],
            "grid_lon": grid_info["grid_lon"],
            "grid_distance_km": grid_info["distance_km"]
        }

        # Save to history
        history_entry = {
            "district": req.district,
            "locality": req.locality,
            "lat": req.latitude,
            "lon": req.longitude,
            "forecast_day": req.forecast_day,
            "forecast_rainfall_mm": req.forecast_rainfall_mm,
            "reliable_probability": result["prediction"]["reliable_probability"],
            "grade": result["prediction"]["grade"],
            "grade_color": result["prediction"]["grade_color"]
        }
        history_service.add_entry(history_entry)

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/spatial-grid")
def get_spatial_grid():
    """Return precomputed spatial grid data across Tamil Nadu (334 cells)."""
    return {
        "count": len(dataset_service.spatial_grid),
        "cells": dataset_service.get_spatial_grid_data()
    }


@app.get("/api/lead-days")
def get_lead_days():
    """Return lead-day performance across Days 1 to 10."""
    return dataset_service.get_lead_day_series()


@app.get("/api/dataset")
def query_dataset(
    district_lat: Optional[float] = None,
    district_lon: Optional[float] = None,
    radius_deg: float = 0.5,
    forecast_day: Optional[int] = None,
    target_date: Optional[str] = None,
    reliable_filter: Optional[str] = "all",
    min_rainfall: Optional[float] = None,
    max_rainfall: Optional[float] = None,
    page: int = 1,
    page_size: int = 20
):
    """Query and filter the historical 16,700 record dataset."""
    return dataset_service.query_dataset(
        district_lat=district_lat,
        district_lon=district_lon,
        radius_deg=radius_deg,
        forecast_day=forecast_day,
        target_date=target_date,
        reliable_filter=reliable_filter,
        min_rainfall=min_rainfall,
        max_rainfall=max_rainfall,
        page=page,
        page_size=page_size
    )


@app.get("/api/research")
def get_research_assets():
    """Return calibration, feature importance, and summary."""
    return dataset_service.get_research_assets()


@app.get("/api/history")
def get_history(limit: int = 10):
    """Return recent searches."""
    return {"history": history_service.get_recent(limit=limit)}


# Serve frontend static assets
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/robots.txt")
def serve_robots():
    return FileResponse(FRONTEND_DIR / "robots.txt")


@app.get("/sitemap.xml")
def serve_sitemap():
    return FileResponse(FRONTEND_DIR / "sitemap.xml", media_type="application/xml")
