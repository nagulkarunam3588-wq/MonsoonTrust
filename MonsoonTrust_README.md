
# MONSOONTRUST
## AI-Based Rainfall Forecast Reliability Estimation

### 1. Project Overview
MonsoonTrust is a preliminary machine-learning research prototype
that estimates whether a medium-range rainfall forecast falls within
a selected error tolerance when compared with rainfall observations.

It estimates forecast reliability; it does not generate new weather
forecasts or issue operational weather warnings.

### 2. Data Sources
- NOAA GEFSv12 retrospective forecast data
- India Meteorological Department (IMD) 0.25-degree gridded rainfall data

### 3. Methodology
- Match forecast and observed rainfall records.
- Create a reliability label using an exploratory 2.5 mm error tolerance.
- Use forecast rainfall, forecast day, latitude and longitude as features.
- Train a Random Forest classifier.
- Evaluate using a chronological record-based test split.

### 4. Preliminary Results
- Matched records: 16,700
- Forecast initializations: 5
- Training records: 11,690
- Test records: 5,010
- Accuracy: 78.68%
- Brier score: 0.1506

These results apply only to the limited experimental dataset.

### 5. Package Contents
- monsoon_results/: datasets, models, metrics, charts and research report
- MonsoonTrust_Luxury_Intelligence.html: interactive research dashboard
- MonsoonTrust_Final_Presentation.pptx: project presentation

### 6. Important Limitations
- Only five initialization dates were used.
- NOAA and IMD daily accumulation windows differ by three hours.
- The evaluation split is based on valid records, not independent
  forecast initialization dates.
- Probability calibration is imperfect.
- The 2.5 mm tolerance is exploratory and requires further justification.

### 7. Future Work
- Align forecast and observation accumulation windows.
- Expand the dataset across more years and initializations.
- Evaluate using initialization-date-based splits.
- Improve probability calibration.
- Compare additional machine-learning models.

### 8. Research Disclaimer
MonsoonTrust is a preliminary research prototype. It has not been
validated for operational forecasting, public warnings or
safety-critical decisions.
