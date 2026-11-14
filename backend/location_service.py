"""
MonsoonTrust - Location Intelligence Service for Tamil Nadu (High Performance)
Provides district, high-density localities (~5km grid), fast bounding-box filtered fuzzy search,
surrounding 5km radius neighborhood search, and nearest research-grid mapping.
"""

import math
import json
import difflib
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

JSON_FILE = Path(__file__).resolve().parent / "tamil_nadu_locations.json"

if JSON_FILE.exists():
    with open(JSON_FILE, "r", encoding="utf-8") as f:
        TAMIL_NADU_LOCATIONS = json.load(f)
else:
    TAMIL_NADU_LOCATIONS = {}


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in km."""
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


class LocationIntelligence:
    def __init__(self, valid_grid_points: Optional[List[Tuple[float, float]]] = None):
        self.grid_points = valid_grid_points or []
        self.search_entries = []
        self.names_pool = []
        self.name_to_entry = {}
        self.cached_districts_response = None
        self._build_search_index()

    def _build_search_index(self):
        """Build flat index with precomputed grid mapping and fast search pools."""
        self.search_entries = []
        self.names_pool = []
        self.name_to_entry = {}

        for dist_name, dist_data in TAMIL_NADU_LOCATIONS.items():
            for loc in dist_data["localities"]:
                grid_info = self.find_nearest_research_grid(loc["lat"], loc["lon"])
                entry = {
                    "name": loc["name"],
                    "district": dist_name,
                    "lat": loc["lat"],
                    "lon": loc["lon"],
                    "region_type": dist_data.get("region_type", "Tamil Nadu Region"),
                    "grid_lat": grid_info["grid_lat"],
                    "grid_lon": grid_info["grid_lon"],
                    "grid_distance_km": grid_info["distance_km"],
                    "name_lower": loc["name"].lower(),
                    "dist_lower": dist_name.lower()
                }
                self.search_entries.append(entry)

                full_label = f"{loc['name']}, {dist_name}"
                self.names_pool.append(full_label)
                self.name_to_entry[full_label] = entry

        # Precompute districts API response
        districts = sorted(list(TAMIL_NADU_LOCATIONS.keys()))
        res = {}
        for d in districts:
            details = TAMIL_NADU_LOCATIONS.get(d, {})
            res[d] = {
                "headquarters": details.get("headquarters", d),
                "region_type": details.get("region_type", "Tamil Nadu"),
                "localities": details.get("localities", [])
            }
        self.cached_districts_response = {"districts": districts, "data": res}

    def set_grid_points(self, points: List[Tuple[float, float]]):
        self.grid_points = points
        self._build_search_index()

    def get_all_districts(self) -> List[str]:
        return self.cached_districts_response["districts"]

    def get_districts_full_payload(self) -> Dict[str, Any]:
        """Pre-cached full districts response for 0ms serving."""
        return self.cached_districts_response

    def get_localities_for_district(self, district: str) -> List[Dict[str, Any]]:
        if district in TAMIL_NADU_LOCATIONS:
            return TAMIL_NADU_LOCATIONS[district]["localities"]
        return []

    def get_district_details(self, district: str) -> Optional[Dict[str, Any]]:
        return TAMIL_NADU_LOCATIONS.get(district)

    def find_nearest_research_grid(self, lat: float, lon: float) -> Dict[str, Any]:
        """Find closest grid point in the research dataset (0.25 deg intervals)."""
        if not self.grid_points:
            grid_lat = round(lat * 4) / 4.0
            grid_lon = round(lon * 4) / 4.0
            grid_lat = max(8.25, min(14.0, grid_lat))
            grid_lon = max(76.0, min(80.0, grid_lon))
            dist_km = haversine_distance_km(lat, lon, grid_lat, grid_lon)
            return {
                "grid_lat": grid_lat,
                "grid_lon": grid_lon,
                "distance_km": round(dist_km, 2),
                "is_exact_grid": dist_km < 1.0
            }

        # Fast Euclidean pre-filtering before exact haversine
        best_pt = min(self.grid_points, key=lambda p: (p[0] - lat)**2 + (p[1] - lon)**2)
        min_dist = haversine_distance_km(lat, lon, best_pt[0], best_pt[1])
        return {
            "grid_lat": best_pt[0],
            "grid_lon": best_pt[1],
            "distance_km": round(min_dist, 2),
            "is_exact_grid": min_dist < 1.0
        }

    def get_surrounding_localities(self, lat: float, lon: float, radius_km: float = 6.0, limit: int = 14) -> List[Dict[str, Any]]:
        """
        Ultra-fast bounding-box prefiltered search for surrounding localities (~5-6 km radius).
        """
        # Bounding box: 1 deg lat ~ 111 km, 1 deg lon ~ 108 km at 11 deg N
        lat_box = (radius_km + 1.0) / 111.0
        lon_box = (radius_km + 1.0) / 105.0

        results = []
        for entry in self.search_entries:
            # Fast box rejection before trigonometric Haversine
            if abs(entry["lat"] - lat) > lat_box or abs(entry["lon"] - lon) > lon_box:
                continue

            d = haversine_distance_km(lat, lon, entry["lat"], entry["lon"])
            # Ignore exact same point (d < 0.1) but include all neighbors within radius
            if 0.1 <= d <= radius_km:
                results.append({
                    "name": entry["name"],
                    "district": entry["district"],
                    "lat": entry["lat"],
                    "lon": entry["lon"],
                    "distance_km": round(d, 2),
                    "region_type": entry["region_type"]
                })

        # If strict radius returned very few (e.g. rural area), expand up to 12 km
        if len(results) < 3:
            lat_box_wide = 13.0 / 111.0
            lon_box_wide = 13.0 / 105.0
            for entry in self.search_entries:
                if abs(entry["lat"] - lat) > lat_box_wide or abs(entry["lon"] - lon) > lon_box_wide:
                    continue
                d = haversine_distance_km(lat, lon, entry["lat"], entry["lon"])
                if radius_km < d <= 12.0:
                    results.append({
                        "name": entry["name"],
                        "district": entry["district"],
                        "lat": entry["lat"],
                        "lon": entry["lon"],
                        "distance_km": round(d, 2),
                        "region_type": entry["region_type"]
                    })

        results.sort(key=lambda x: x["distance_km"])
        return results[:limit]

    def search_locations(self, query: str, limit: int = 8) -> Dict[str, Any]:
        """Fuzzy search for district or locality name with typo tolerance (sub-millisecond)."""
        query_clean = query.strip().lower()
        if not query_clean:
            return {"matches": [], "suggestions": [], "has_results": False}

        exact_matches = []
        seen = set()

        for entry in self.search_entries:
            if query_clean in entry["name_lower"] or query_clean in entry["dist_lower"]:
                if entry["name"] not in seen:
                    seen.add(entry["name"])
                    exact_matches.append({
                        "name": entry["name"],
                        "district": entry["district"],
                        "lat": entry["lat"],
                        "lon": entry["lon"],
                        "region_type": entry["region_type"],
                        "grid_lat": entry["grid_lat"],
                        "grid_lon": entry["grid_lon"],
                        "distance_km": entry["grid_distance_km"]
                    })
                if len(exact_matches) >= limit:
                    break

        # Fuzzy matching only if exact matches are fewer than limit
        suggestions = []
        if len(exact_matches) < limit:
            close_names = difflib.get_close_matches(query_clean, self.names_pool, n=limit, cutoff=0.35)
            for match_name in close_names:
                ent = self.name_to_entry[match_name]
                if ent["name"] not in seen:
                    seen.add(ent["name"])
                    suggestions.append({
                        "name": ent["name"],
                        "district": ent["district"],
                        "lat": ent["lat"],
                        "lon": ent["lon"],
                        "region_type": ent["region_type"],
                        "grid_lat": ent["grid_lat"],
                        "grid_lon": ent["grid_lon"],
                        "distance_km": ent["grid_distance_km"]
                    })
                if len(exact_matches) + len(suggestions) >= limit:
                    break

        return {
            "query": query,
            "matches": exact_matches[:limit],
            "suggestions": suggestions[:limit],
            "has_results": len(exact_matches) > 0 or len(suggestions) > 0
        }

    def resolve_location(self, district: Optional[str] = None, locality: Optional[str] = None,
                         custom_lat: Optional[float] = None, custom_lon: Optional[float] = None) -> Dict[str, Any]:
        """Resolve location and include surrounding localities within 5 km."""
        if custom_lat is not None and custom_lon is not None:
            grid_info = self.find_nearest_research_grid(custom_lat, custom_lon)
            surrounding = self.get_surrounding_localities(custom_lat, custom_lon, radius_km=6.0)
            return {
                "district": district or "Custom Geographic Point",
                "locality": locality or f"Coordinates ({custom_lat:.3f}, {custom_lon:.3f})",
                "lat": round(custom_lat, 4),
                "lon": round(custom_lon, 4),
                "region_type": "Custom User Point",
                "surrounding_5km": surrounding,
                **grid_info
            }

        if district and district in TAMIL_NADU_LOCATIONS:
            dist_data = TAMIL_NADU_LOCATIONS[district]
            target_loc = None
            if locality:
                loc_lower = locality.lower()
                for l in dist_data["localities"]:
                    if l["name"].lower() == loc_lower or loc_lower in l["name"].lower():
                        target_loc = l
                        break
            if not target_loc:
                target_loc = dist_data["localities"][0]

            grid_info = self.find_nearest_research_grid(target_loc["lat"], target_loc["lon"])
            surrounding = self.get_surrounding_localities(target_loc["lat"], target_loc["lon"], radius_km=6.0)
            return {
                "district": district,
                "locality": target_loc["name"],
                "lat": round(target_loc["lat"], 4),
                "lon": round(target_loc["lon"], 4),
                "region_type": dist_data.get("region_type", "Tamil Nadu Region"),
                "surrounding_5km": surrounding,
                **grid_info
            }

        # Fallback default (Chennai Central)
        default_entry = TAMIL_NADU_LOCATIONS.get("Chennai", {}).get("localities", [{}])[0]
        lat = default_entry.get("lat", 13.0827)
        lon = default_entry.get("lon", 80.2707)
        grid_info = self.find_nearest_research_grid(lat, lon)
        surrounding = self.get_surrounding_localities(lat, lon, radius_km=6.0)
        return {
            "district": "Chennai",
            "locality": default_entry.get("name", "Chennai Central"),
            "lat": lat,
            "lon": lon,
            "region_type": "Northern Coastal Metropolis",
            "surrounding_5km": surrounding,
            **grid_info
        }
