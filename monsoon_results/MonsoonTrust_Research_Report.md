
# MONSOONTRUST

## An AI-Based Approach for Predicting the Reliability of Medium-Range Weather Forecasts

### Abstract

MonsoonTrust is a preliminary machine-learning framework designed to estimate
the reliability of medium-range rainfall forecasts. Rather than generating
weather forecasts, the system estimates whether an existing rainfall forecast
is likely to remain within a specified error tolerance of observed rainfall.

The prototype combines NOAA GEFSv12 retrospective forecasts with India
Meteorological Department (IMD) gridded rainfall observations. A Random Forest
classifier is used to estimate forecast reliability.

### 1. Objectives

- Evaluate rainfall forecast errors.
- Estimate forecast reliability using machine learning.
- Examine reliability across forecast lead days.
- Study predicted probability calibration.
- Provide an interpretable preliminary reliability assessment.

### 2. Data Sources

**Forecast data:** NOAA GEFSv12 retrospective forecast data.

**Observation data:** IMD 0.25-degree gridded daily rainfall data.

**Study region:** Selected Tamil Nadu grid region.

**Initialization period:** 1–5 January 2000.

### 3. Dataset Preparation

Five forecast initializations were processed.

- Forecast initializations: 5
- Matched records: 16700
- Grid records per initialization: 3,340
- Forecast lead days: 1–10

The forecast rainfall was compared with corresponding IMD observations.

Important limitation: NOAA daily accumulation windows and IMD observation
windows differ by three hours. This temporal mismatch may affect the measured
forecast errors and reliability labels.

### 4. Methodology

The reliability target was defined using an exploratory tolerance of
2.5 mm.

A sample was labelled reliable when the absolute difference between forecast
and observed rainfall did not exceed this tolerance.

The Random Forest classifier used the following features:

- Forecast rainfall
- Forecast lead day
- Latitude
- Longitude

The data was divided chronologically by valid date:

- Training records: 11690
- Testing records: 5010

This is a preliminary temporal evaluation using a limited date range.

### 5. Temporal Evaluation Results

| Metric | Result |
|---|---:|
| Accuracy | 0.7868 |
| Brier score | 0.1506 |
| Outside-tolerance F1 | 0.69 |
| Within-tolerance F1 | 0.84 |
| Test records | 5010 |

The model achieved 78.68% classification accuracy on the chronological test
set. The Brier score was 0.1506.

These results indicate preliminary potential, but should not be interpreted
as proof of general forecasting reliability.

### 6. Probability Calibration

The calibration analysis compared predicted reliability probabilities with
the observed frequency of reliable forecasts.

The model showed imperfect calibration. In particular, predicted
probabilities did not consistently match observed reliability rates across
all probability groups.

Further calibration and independent validation are required before these
probabilities can be interpreted as dependable real-world confidence values.

### 7. Forecast Lead-Day Analysis

The test dataset contained forecast lead days 6–10.

| Lead day | Actual reliability | Mean absolute error (mm) |
|---:|---:|---:|
| 6 | 67.07% | 3.71 |
| 7 | 55.69% | 6.67 |
| 8 | 49.90% | 8.08 |
| 9 | 64.52% | 4.03 |
| 10 | 77.96% | 2.22 |

The results do not show a smooth decrease in reliability with lead time.
The available sample is too limited to establish a general trend.

### 8. Limitations

1. Only five forecast initialization dates were processed.
2. Forecast and observation daily accumulation windows differ by three hours.
3. The 2.5 mm reliability tolerance is exploratory and requires justification.
4. Calibration is imperfect.
5. The evaluation covers a limited geographical region and period.
6. The temporal test is preliminary and requires broader independent validation.

### 9. Future Work

- Expand the dataset across multiple months and seasons.
- Align forecast and observation accumulation windows exactly.
- Evaluate additional geographical regions.
- Justify the rainfall error tolerance scientifically.
- Apply probability calibration methods.
- Compare Random Forest with additional machine-learning models.
- Perform robust chronological validation across multiple periods.

### 10. Conclusion

The MonsoonTrust prototype demonstrates the feasibility of using machine
learning to estimate the reliability of existing medium-range rainfall
forecasts.

The preliminary chronological evaluation achieved 78.68% accuracy.
However, limited initialization dates, imperfect probability calibration,
and a three-hour accumulation-window mismatch restrict the strength of
the conclusions.

Further data collection and scientific validation are necessary before
the framework can be considered a dependable operational reliability system.

---

**Project:** MonsoonTrust  
**Report status:** Preliminary research prototype  
**Generated:** 2026-11-13
