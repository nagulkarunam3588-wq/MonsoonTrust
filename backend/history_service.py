"""
MonsoonTrust - Query History Service
Stores and retrieves recent location reliability evaluations.
"""

import json
import time
from pathlib import Path
from typing import List, Dict, Any


class HistoryService:
    def __init__(self, history_file: Path, max_entries: int = 15):
        self.history_file = history_file
        self.max_entries = max_entries
        self.history: List[Dict[str, Any]] = []
        self._load()

    def _load(self):
        if self.history_file.exists():
            try:
                with open(self.history_file, "r", encoding="utf-8") as f:
                    self.history = json.load(f)
            except Exception:
                self.history = []
        else:
            # Seed with a few realistic initial historical analyses
            self.history = [
                {
                    "id": "init-1",
                    "timestamp": "2026-11-13 18:45",
                    "district": "Chennai",
                    "locality": "Chennai Central",
                    "lat": 13.08,
                    "lon": 80.27,
                    "forecast_day": 3,
                    "forecast_rainfall_mm": 5.0,
                    "reliable_probability": 84.2,
                    "grade": "High Reliability",
                    "grade_color": "#63D5C8"
                },
                {
                    "id": "init-2",
                    "timestamp": "2026-11-13 19:10",
                    "district": "Coimbatore",
                    "locality": "RS Puram",
                    "lat": 11.01,
                    "lon": 76.95,
                    "forecast_day": 7,
                    "forecast_rainfall_mm": 18.5,
                    "reliable_probability": 47.6,
                    "grade": "Uncertain / Moderate Risk",
                    "grade_color": "#E5A93B"
                },
                {
                    "id": "init-3",
                    "timestamp": "2026-11-13 19:35",
                    "district": "Madurai",
                    "locality": "Meenakshi Temple",
                    "lat": 9.92,
                    "lon": 78.12,
                    "forecast_day": 5,
                    "forecast_rainfall_mm": 2.0,
                    "reliable_probability": 79.1,
                    "grade": "High Reliability",
                    "grade_color": "#63D5C8"
                }
            ]
            self._save()

    def _save(self):
        try:
            with open(self.history_file, "w", encoding="utf-8") as f:
                json.dump(self.history, f, indent=2)
        except Exception:
            pass

    def add_entry(self, entry: Dict[str, Any]):
        entry["id"] = f"hist-{int(time.time() * 1000)}"
        entry["timestamp"] = time.strftime("%Y-%m-%d %H:%M:%S")
        self.history.insert(0, entry)
        if len(self.history) > self.max_entries:
            self.history = self.history[:self.max_entries]
        self._save()

    def get_recent(self, limit: int = 10) -> List[Dict[str, Any]]:
        return self.history[:limit]
