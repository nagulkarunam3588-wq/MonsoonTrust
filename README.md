# MonsoonTrust — AI-Based Rainfall Forecast Reliability Assessment System

**MonsoonTrust** is a research-grade machine learning system designed to evaluate the statistical reliability of medium-range rainfall forecasts across **Tamil Nadu, India**. Unlike traditional meteorological platforms that solely report predicted precipitation totals, MonsoonTrust models the probabilistic likelihood that a forecast will remain within an exploratory **2.5 mm** error tolerance of ground-truth observations.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/nagulkarunam3588-wq/MonsoonTrust)

---

## 1. System Architecture & Model Verification

### A. Research Dataset Integrity
- **Source:** NOAA GEFSv12 retrospective forecasts matched against India Meteorological Department (IMD) 0.25° gridded daily rainfall observations.
- **Records Processed:** 16,700 matched records across 5 forecast initialization dates (2000-01-01 to 2000-01-05).
- **Grid Density:** 334 valid land grid cells covering Tamil Nadu (8.25°N–14.00°N, 76.00°E–80.00°E).
- **Reliability Target Definition:**
  $$\text{Reliable} = |\text{forecast\_rainfall\_mm} - \text{observed\_rainfall\_mm}| \le 2.5\text{ mm}$$
- **Class Breakdown:**
  - **Reliable (Class 1):** 13,446 records (80.51%)
  - **Outside Tolerance (Class 0):** 3,254 records (19.49%)

### B. Machine Learning Engine
- **Algorithm:** `RandomForestClassifier` (100 estimators).
- **Model Preserved:** Loaded directly from original research file (`monsoon_results/temporal_model.pkl`).
- **Feature Vector (Exact Order):**
  1. `forecast_rainfall_mm` (Gini Importance: 34.29%)
  2. `forecast_day` (Gini Importance: 30.95%)
  3. `latitude` (Gini Importance: 22.47%)
  4. `longitude` (Gini Importance: 12.29%)
- **Chronological Evaluation Metrics (Test Set: 5,010 records, Days 6–10):**
  - **Accuracy:** 78.68%
  - **Brier Probability Score:** 0.1506
  - **Within-Tolerance F1-Score:** 0.84
  - **Outside-Tolerance F1-Score:** 0.69

---

## 2. Running the Application

### Quick Start:
```bash
# Navigate to the project directory
cd C:\Users\nagul\.gemini\antigravity\scratch\MonsoonTrust

# Run the server using the virtual environment
& "C:\Users\nagul\MONSOON\.venv\Scripts\python.exe" run_server.py
```

The web dashboard will be available at:
**`http://127.0.0.1:8000`**
