/**
 * MonsoonTrust - Frontend Application Controller (Date-Aware Edition)
 * Handles interactive navigation, live prediction, specific date checks,
 * Leaflet maps with Canvas acceleration, instant in-memory locality search,
 * 5km surrounding area radar, Chart.js visualizations, and dataset exploration.
 */

const API_BASE = "";

// Chart.js Performance Config: Fast 250ms animations for snappy UI
if (window.Chart) {
  Chart.defaults.animation.duration = 250;
  Chart.defaults.responsive = true;
}

// Global Application State
const state = {
  activeTab: "overview",
  districtsData: {},
  liveWeather: null,
  weatherNews: null,
  liveDistrict: "Chennai",
  currentLocation: {
    district: "Chennai",
    locality: "Chennai Central",
    lat: 13.0827,
    lon: 80.2707,
    grid_lat: 13.0,
    grid_lon: 80.0,
    distance_km: 30.5,
    region_type: "Northern Coastal Metropolis",
    surrounding_5km: []
  },
  forecastParams: {
    leadDay: 5,
    rainfallMm: 5.0,
    modelType: "temporal"
  },
  selectedDate: "",
  availableDates: [],
  spatialGrid: [],
  mapLayer: "reliability", // 'reliability', 'mae', 'bias'
  mapInstance: null,
  spatialLayerGroup: null,
  locationMarker: null,
  radiusCircle: null,
  charts: {
    donut: null,
    leadDay: null,
    calibration: null,
    featureImp: null,
    threshold: null
  },
  datasetQuery: {
    page: 1,
    pageSize: 15,
    targetDate: "",
    forecastDay: null,
    reliableFilter: "all",
    minRain: null,
    maxRain: null
  }
};

let predictionDebounceTimer = null;

// Initialize Application (Concurrent Parallel Loading for Maximum Speed)
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupSlidersAndPresets();
  setupLocationControls();
  setupDateControls();
  setupLiveWeatherControls();
  initLeafletMap();

  // Load all components concurrently in parallel (eliminates serial waterfall latency)
  await Promise.all([
    loadOverviewData(),
    loadDistricts(),
    loadAvailableDates(),
    loadSpatialGrid(),
    loadLeadDayData(),
    loadResearchData(),
    queryDataset(),
    runPrediction()
  ]);
});

// Navigation Controller
function setupNavigation() {
  const navBtns = document.querySelectorAll(".nav-btn");
  navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-section").forEach(sec => {
    sec.classList.toggle("active", sec.id === `section-${tabId}`);
  });

  // Re-render map size if switching to map tab
  if ((tabId === "assessment" || tabId === "spatial") && state.mapInstance) {
    setTimeout(() => {
      state.mapInstance.invalidateSize();
    }, 150);
  }
}

// Date Handling and Season Utilities
function getFutureDateString(daysFromToday = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getSeasonFromDate(dateStr) {
  const parts = dateStr.split("-");
  const m = parseInt(parts[1], 10);
  if ([10, 11, 12].includes(m)) {
    return {
      name: "🌧️ Northeast Monsoon Season (Oct–Dec)",
      desc: "Tamil Nadu's principal rainy season (~48% of annual rainfall). Coastal moisture fluxes bring frequent showers."
    };
  } else if ([6, 7, 8, 9].includes(m)) {
    return {
      name: "⛰️ Southwest Monsoon Season (Jun–Sep)",
      desc: "Heavy rain along the Western Ghats (Nilgiris, Tenkasi), while central plains remain in the dry rain-shadow."
    };
  } else if ([3, 4, 5].includes(m)) {
    return {
      name: "☀️ Summer Pre-Monsoon (Mar–May)",
      desc: "Warm temperatures trigger localized afternoon thunderstorms with higher localized variance."
    };
  } else {
    return {
      name: "🌤️ Winter Dry Period (Jan–Feb)",
      desc: "Generally stable dry conditions across Tamil Nadu with high baseline forecast accuracy."
    };
  }
}

function updateDateContext(dateStr) {
  state.selectedDate = dateStr;
  const dateInput = document.getElementById("target-date-input");
  if (dateInput && dateInput.value !== dateStr) {
    dateInput.value = dateStr;
  }

  // Update season badge & description
  const season = getSeasonFromDate(dateStr);
  const seasonBadge = document.getElementById("season-badge");
  const seasonDesc = document.getElementById("season-description-text");
  if (seasonBadge) seasonBadge.innerText = season.name;
  if (seasonDesc) seasonDesc.innerText = season.desc;

  // Calculate lead days relative to today
  const targetDt = new Date(dateStr);
  const todayDt = new Date();
  todayDt.setHours(0, 0, 0, 0);
  targetDt.setHours(0, 0, 0, 0);

  const diffDays = Math.round((targetDt - todayDt) / (1000 * 60 * 60 * 24));
  let leadDay = 5;
  if (diffDays <= 1) leadDay = 1;
  else if (diffDays >= 10) leadDay = 10;
  else leadDay = diffDays;

  // If it's a historical date (e.g. 2000-01-08 archive), set leadDay to 5 as default
  if (parseInt(dateStr.split("-")[0], 10) <= 2005) {
    leadDay = 5;
  }

  state.forecastParams.leadDay = leadDay;
  const leadSlider = document.getElementById("slider-lead-day");
  const leadBadge = document.getElementById("lead-day-badge");
  if (leadSlider) leadSlider.value = leadDay;
  if (leadBadge) leadBadge.innerText = `Day ${leadDay} (${leadDay === 1 ? 'Tomorrow' : leadDay + ' Days Ahead'})`;
  updateQuickDayButtons(leadDay);

  // Trigger live calculation
  triggerLivePrediction();
}

function setupDateControls() {
  const initialDate = getFutureDateString(5);
  state.selectedDate = initialDate;

  const dateInput = document.getElementById("target-date-input");
  if (dateInput) {
    dateInput.value = initialDate;
    dateInput.addEventListener("change", (e) => {
      if (e.target.value) {
        updateDateContext(e.target.value);
      }
    });
  }

  const btnToday = document.getElementById("btn-today-date");
  if (btnToday) {
    btnToday.addEventListener("click", () => {
      updateDateContext(getFutureDateString(0));
    });
  }

  // Date shortcut buttons
  document.querySelectorAll(".date-shortcut-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".date-shortcut-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (btn.dataset.days) {
        const days = parseInt(btn.dataset.days, 10);
        updateDateContext(getFutureDateString(days));
      } else if (btn.dataset.special === "archive") {
        updateDateContext("2000-01-08"); // Famous verified archive date
      }
    });
  });
}

async function loadAvailableDates() {
  try {
    const res = await fetch(`${API_BASE}/api/available-dates`);
    const data = await res.json();
    state.availableDates = data.historical_archive.valid_dates || [];

    // Populate #filter-date in Dataset explorer table
    const filterDate = document.getElementById("filter-date");
    if (filterDate && state.availableDates.length > 0) {
      filterDate.innerHTML = `<option value="">All Archive Dates</option>` +
        state.availableDates.map(d => `<option value="${d}">Target: ${d}</option>`).join("");
      
      filterDate.addEventListener("change", (e) => {
        state.datasetQuery.targetDate = e.target.value;
        state.datasetQuery.page = 1;
        queryDataset();
      });
    }
  } catch (err) {
    console.error("Error loading dates:", err);
  }
}

// Overview Data Loader
async function loadOverviewData() {
  try {
    const res = await fetch(`${API_BASE}/api/overview`);
    const data = await res.json();
    const m = data.metrics;

    // Populate KPI Cards with plain everyday language
    document.getElementById("kpi-records").innerText = m.total_records.toLocaleString();
    document.getElementById("kpi-accuracy").innerText = `${(m.temporal_model_accuracy * 100).toFixed(1)}%`;
    document.getElementById("kpi-brier").innerText = m.temporal_brier_score.toFixed(2);
    document.getElementById("kpi-reliable-pct").innerText = `${m.reliability_ratio_pct}%`;
    document.getElementById("kpi-mae").innerText = `${m.mean_absolute_error_mm} mm`;
    document.getElementById("kpi-cells").innerText = m.grid_cells_count;

    renderDonutChart(m.reliable_records, m.outside_tolerance_records);
    renderRecentAnalyses(data.recent_analyses);
  } catch (err) {
    console.error("Error loading overview metrics:", err);
  }
}

function renderDonutChart(reliable, outsideTolerance) {
  const ctx = document.getElementById("chart-class-distribution");
  if (!ctx) return;
  if (state.charts.donut) state.charts.donut.destroy();

  state.charts.donut = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Accurate / Reliable (Within 2.5 mm)", "Off-Track (Differs by > 2.5 mm)"],
      datasets: [{
        data: [reliable, outsideTolerance],
        backgroundColor: ["#63D5C8", "#E06D53"],
        borderColor: ["#071725", "#071725"],
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#A6BABA",
            font: { family: "DM Sans", size: 11 },
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw.toLocaleString()} forecasts (${((ctx.raw / (reliable + outsideTolerance)) * 100).toFixed(1)}%)`
          }
        }
      },
      cutout: "70%"
    }
  });
}

function renderRecentAnalyses(items) {
  const container = document.getElementById("recent-analyses-container");
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = `<p style="color:var(--ivory-dim);font-size:12px;">No recent towns checked yet.</p>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="history-card" onclick="selectRecentAnalysis('${item.district}', '${item.locality}', ${item.lat}, ${item.lon}, ${item.forecast_day}, ${item.forecast_rainfall_mm}, '${item.target_date || ''}')">
      <div class="history-top">
        <span class="history-loc">${item.locality}, ${item.district}</span>
        <span class="history-time">${item.target_date || (item.timestamp ? item.timestamp.split(' ')[1] : '')}</span>
      </div>
      <div class="history-bottom">
        <span>Day ${item.forecast_day} · ${item.forecast_rainfall_mm} mm</span>
        <span style="color:${item.grade_color};font-weight:600;">${item.reliable_probability}% Trust</span>
      </div>
    </div>
  `).join("");
}

function selectRecentAnalysis(district, locality, lat, lon, day, rain, targetDate = "") {
  state.currentLocation.district = district;
  state.currentLocation.locality = locality;
  state.currentLocation.lat = lat;
  state.currentLocation.lon = lon;
  state.forecastParams.leadDay = day;
  state.forecastParams.rainfallMm = rain;

  document.getElementById("district-select").value = district;
  updateLocalityDropdown(district, locality);
  document.getElementById("slider-lead-day").value = day;
  document.getElementById("lead-day-badge").innerText = `Day ${day} (${day === 1 ? 'Tomorrow' : day + ' Days Ahead'})`;
  document.getElementById("slider-rainfall").value = rain;
  document.getElementById("rainfall-input").value = rain;
  document.getElementById("rainfall-badge").innerText = `${rain} mm`;

  if (targetDate) {
    state.selectedDate = targetDate;
    const dateInput = document.getElementById("target-date-input");
    if (dateInput) dateInput.value = targetDate;
  }

  switchTab("assessment");
  updateCoordinateDisplay();
  runPrediction();
}

// Districts and Locality Controller (Instant In-Memory Cache)
async function loadDistricts() {
  try {
    const res = await fetch(`${API_BASE}/api/districts`);
    const data = await res.json();
    state.districtsData = data.data;

    const select = document.getElementById("district-select");
    select.innerHTML = data.districts.map(d => `<option value="${d}">${d}</option>`).join("");
    select.value = "Chennai";

    // Populate Live Weather District Select
    const liveSelect = document.getElementById("live-district-select");
    if (liveSelect) {
      liveSelect.innerHTML = data.districts.map(d => `<option value="${d}">${d}</option>`).join("");
      liveSelect.value = "Chennai";
    }

    updateLocalityDropdown("Chennai");

    // Automatically detect user's current location initially!
    await detectUserLocationInitially();
  } catch (err) {
    console.error("Error loading districts:", err);
    loadLiveWeatherDashboard("Chennai");
  }
}

// Location Management & Detection Engine
async function detectUserLocationInitially(forceGPS = false) {
  const badge = document.getElementById("live-detected-badge");
  const gpsLabel = document.getElementById("detect-gps-label");
  if (gpsLabel) gpsLabel.textContent = "Locating...";

  // 0. If user previously chose/saved a location and not forcing GPS, load it immediately!
  const savedDist = localStorage.getItem("user_selected_district");
  const savedLoc = localStorage.getItem("user_selected_locality");
  const savedLat = localStorage.getItem("user_selected_lat");
  const savedLon = localStorage.getItem("user_selected_lon");

  if (!forceGPS && savedDist && state.districtsData && state.districtsData[savedDist]) {
    applyLocation(savedDist, savedLoc, "Saved Choice", null, savedLat ? parseFloat(savedLat) : null, savedLon ? parseFloat(savedLon) : null);
    if (gpsLabel) gpsLabel.textContent = "My Location";
    return;
  }

  // 1. Try High-Precision Browser Geolocation (HTML5 GPS)
  if ("geolocation" in navigator) {
    try {
      if (badge) {
        badge.innerHTML = `<span>🛰️ Requesting device GPS...</span>`;
        badge.style.display = "inline-flex";
      }

      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      });

      const { latitude, longitude } = position.coords;

      // Reverse geocode locality name
      let exactLocality = null;
      try {
        const geoClientRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
        if (geoClientRes.ok) {
          const geoData = await geoClientRes.json();
          exactLocality = geoData.locality || geoData.city || null;
        }
      } catch (e) {}

      const res = await fetch(`${API_BASE}/api/locate-nearest?lat=${latitude}&lon=${longitude}`);
      if (res.ok) {
        const loc = await res.json();
        if (loc.district) {
          if (gpsLabel) gpsLabel.textContent = "My Location";
          const finalLocality = exactLocality || loc.locality;
          applyLocation(loc.district, finalLocality, "GPS Detected", loc.distance_km, latitude, longitude);
          return;
        }
      }
    } catch (geoErr) {
      console.log("Browser GPS not available or permission denied:", geoErr);
      const hint = document.getElementById("location-perm-hint");
      if (hint && geoErr.code === 1) {
        hint.style.display = "block";
      }
    }
  }

  // 2. Fast Network IP Geolocation (Zero permission needed, sub-second)
  try {
    const ipRes = await fetch("https://get.geojs.io/v1/ip/geo.json", { cache: "no-store" });
    if (ipRes.ok) {
      const ip = await ipRes.json();
      const lat = parseFloat(ip.latitude);
      const lon = parseFloat(ip.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        const res = await fetch(`${API_BASE}/api/locate-nearest?lat=${lat}&lon=${lon}`);
        if (res.ok) {
          const loc = await res.json();
          if (loc.district) {
            if (gpsLabel) gpsLabel.textContent = "My Location";
            applyLocation(loc.district, ip.city || loc.locality, "Network Detected", loc.distance_km, lat, lon);
            return;
          }
        }
      }
    }
  } catch (ipErr) {
    console.log("IP geolocation unavailable, defaulting to Chennai.", ipErr);
  }

  // 3. Graceful fallback
  if (gpsLabel) gpsLabel.textContent = "My Location";
  applyLocation("Chennai", "Chennai Central", "Default");
}

function applyLocation(district, locality = null, source = "Selected", distanceKm = null, customLat = null, customLon = null) {
  state.liveDistrict = district;

  // Save user's preference in localStorage
  try {
    localStorage.setItem("user_selected_district", district);
    if (locality) localStorage.setItem("user_selected_locality", locality);
    if (customLat && customLon) {
      localStorage.setItem("user_selected_lat", customLat.toString());
      localStorage.setItem("user_selected_lon", customLon.toString());
    }
  } catch (e) {}

  // Sync Live Weather select dropdown
  const liveSelect = document.getElementById("live-district-select");
  if (liveSelect && liveSelect.value !== district) {
    liveSelect.value = district;
  }

  // Sync Forecast form district & locality select
  const districtSelect = document.getElementById("district-select");
  if (districtSelect && districtSelect.value !== district) {
    districtSelect.value = district;
    updateLocalityDropdown(district, locality);
  }

  // Visual feedback badge
  const badge = document.getElementById("live-detected-badge");
  if (badge) {
    const locText = locality ? `${locality}, ${district}` : district;
    if (source.includes("GPS")) {
      badge.innerHTML = `<span>🎯 GPS Located: <strong>${locText}</strong></span>`;
      badge.style.background = "rgba(16, 185, 129, 0.15)";
      badge.style.color = "#10b981";
      badge.style.borderColor = "rgba(16, 185, 129, 0.35)";
      badge.style.display = "inline-flex";
    } else if (source.includes("Saved")) {
      badge.innerHTML = `<span>⭐ Saved: <strong>${locText}</strong></span>`;
      badge.style.background = "rgba(16, 185, 129, 0.15)";
      badge.style.color = "#10b981";
      badge.style.borderColor = "rgba(16, 185, 129, 0.35)";
      badge.style.display = "inline-flex";
    } else if (source.includes("Network")) {
      badge.innerHTML = `<span>🌐 Network: <strong>${locText}</strong></span>`;
      badge.style.background = "rgba(56, 189, 248, 0.15)";
      badge.style.color = "#38bdf8";
      badge.style.borderColor = "rgba(56, 189, 248, 0.35)";
      badge.style.display = "inline-flex";
    } else {
      badge.innerHTML = `<span>📍 Selected: <strong>${locText}</strong></span>`;
      badge.style.background = "rgba(216, 189, 136, 0.15)";
      badge.style.color = "var(--gold-accent)";
      badge.style.borderColor = "rgba(216, 189, 136, 0.35)";
      badge.style.display = "inline-flex";
    }
  }

  // Load the live weather for this location
  loadLiveWeatherDashboard(district, false, customLat, customLon, locality);
}

function updateLocalityDropdown(district, selectedLocality = null) {
  const distInfo = state.districtsData[district];
  const locSelect = document.getElementById("locality-select");
  if (!distInfo) return;

  locSelect.innerHTML = distInfo.localities.map(l => 
    `<option value="${l.name}">${l.name}</option>`
  ).join("");

  if (selectedLocality) {
    locSelect.value = selectedLocality;
  } else {
    locSelect.selectedIndex = 0;
  }
  handleLocationSelection();
}

function setupLocationControls() {
  const distSelect = document.getElementById("district-select");
  distSelect.addEventListener("change", (e) => {
    updateLocalityDropdown(e.target.value);
  });

  const locSelect = document.getElementById("locality-select");
  locSelect.addEventListener("change", () => {
    handleLocationSelection();
  });

  // Fast In-Memory Local Search with typo fallback
  const searchInput = document.getElementById("location-search-input");
  const suggestionsBox = document.getElementById("fuzzy-suggestions");
  let searchTimeout = null;

  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim().toLowerCase();
    if (query.length < 2) {
      suggestionsBox.style.display = "none";
      return;
    }

    // Instant local memory search across 924 localities (0ms response)
    const localMatches = [];
    if (state.districtsData) {
      for (const [dist, dData] of Object.entries(state.districtsData)) {
        for (const loc of dData.localities) {
          if (loc.name.toLowerCase().includes(query) || dist.toLowerCase().includes(query)) {
            localMatches.push({
              name: loc.name,
              district: dist,
              lat: loc.lat,
              lon: loc.lon,
              region_type: dData.region_type
            });
            if (localMatches.length >= 8) break;
          }
        }
        if (localMatches.length >= 8) break;
      }
    }

    if (localMatches.length > 0) {
      suggestionsBox.innerHTML = localMatches.map(item => `
        <div class="fuzzy-item" onclick="applyFuzzyLocation('${item.district}', '${item.name}', ${item.lat}, ${item.lon})">
          <span><strong>${item.name}</strong> <span style="color:var(--ivory-dim)">(${item.region_type || item.district})</span></span>
          <span class="item-dist">${item.district}</span>
        </div>
      `).join("");
      suggestionsBox.style.display = "block";
      return;
    }

    // Server-side fuzzy typo search fallback
    searchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/search-locations?q=${encodeURIComponent(query)}`);
        const result = await res.json();
        const allSuggestions = [...result.matches, ...result.suggestions];

        if (allSuggestions.length > 0) {
          suggestionsBox.innerHTML = allSuggestions.map(item => `
            <div class="fuzzy-item" onclick="applyFuzzyLocation('${item.district}', '${item.name}', ${item.lat}, ${item.lon})">
              <span><strong>${item.name}</strong> <span style="color:var(--ivory-dim)">(${item.region_type || item.district})</span></span>
              <span class="item-dist">${item.district}</span>
            </div>
          `).join("");
          suggestionsBox.style.display = "block";
        } else {
          suggestionsBox.innerHTML = `<div class="fuzzy-item" style="color:var(--amber-warn)">No exact match found in Tamil Nadu. Check spelling.</div>`;
          suggestionsBox.style.display = "block";
        }
      } catch (err) {
        console.error("Search error:", err);
      }
    }, 150);
  });

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
      suggestionsBox.style.display = "none";
    }
  });

  // Custom Lat/Lon input toggles
  document.getElementById("btn-apply-coords").addEventListener("click", async () => {
    const lat = parseFloat(document.getElementById("custom-lat-input").value);
    const lon = parseFloat(document.getElementById("custom-lon-input").value);
    if (isNaN(lat) || isNaN(lon)) {
      alert("Please enter valid numeric latitude and longitude.");
      return;
    }
    await resolveCustomCoords(lat, lon);
  });
}

function applyFuzzyLocation(district, locality, lat, lon) {
  document.getElementById("fuzzy-suggestions").style.display = "none";
  document.getElementById("location-search-input").value = `${locality}, ${district}`;

  if (state.districtsData[district]) {
    document.getElementById("district-select").value = district;
    updateLocalityDropdown(district, locality);
  } else {
    resolveCustomCoords(lat, lon, district, locality);
  }
}

async function handleLocationSelection() {
  const district = document.getElementById("district-select").value;
  const localityName = document.getElementById("locality-select").value;

  try {
    const res = await fetch(`${API_BASE}/api/resolve-location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ district, locality: localityName })
    });
    const loc = await res.json();
    state.currentLocation = loc;
    updateCoordinateDisplay();
    updateMapPin(loc.lat, loc.lon, `${loc.locality}, ${loc.district}`);
    renderSurroundingLocalities(loc.surrounding_5km);
    triggerLivePrediction();
  } catch (err) {
    console.error("Error resolving location:", err);
  }
}

async function resolveCustomCoords(lat, lon, district = "Custom Point", locality = "User Coordinates") {
  try {
    const res = await fetch(`${API_BASE}/api/resolve-location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom_lat: lat, custom_lon: lon, district, locality })
    });
    const loc = await res.json();
    state.currentLocation = loc;
    updateCoordinateDisplay();
    updateMapPin(lat, lon, `${locality}`);
    renderSurroundingLocalities(loc.surrounding_5km);
    runPrediction();
  } catch (err) {
    console.error("Error resolving custom coordinates:", err);
  }
}

function updateCoordinateDisplay() {
  const loc = state.currentLocation;
  document.getElementById("coord-lat").innerText = `${loc.lat.toFixed(4)}° N`;
  document.getElementById("coord-lon").innerText = `${loc.lon.toFixed(4)}° E`;
  document.getElementById("coord-grid").innerText = `${loc.grid_lat.toFixed(2)}°N, ${loc.grid_lon.toFixed(2)}°E`;
  document.getElementById("coord-dist").innerText = `${loc.distance_km} km`;
  document.getElementById("coord-zone").innerText = loc.region_type || "Tamil Nadu Plateau";
}

// Surrounding ~5 km Radius Neighborhood Renderer
function renderSurroundingLocalities(items) {
  const container = document.getElementById("nearby-localities-container");
  const countBadge = document.getElementById("nearby-count-badge");
  if (!container) return;

  if (!items || items.length === 0) {
    countBadge.innerText = "0 Areas";
    container.innerHTML = `<span style="color:var(--ivory-dim);font-size:11px;padding:6px;">No neighboring towns logged within 5 km.</span>`;
    return;
  }

  countBadge.innerText = `${items.length} Areas`;
  container.innerHTML = items.map(item => `
    <button class="preset-chip nearby-pill" onclick="selectNearbyLocality('${item.district}', '${item.name}', ${item.lat}, ${item.lon})" title="${item.distance_km} km from active point">
      <strong>${item.name}</strong> <span style="color:var(--teal-glow);font-size:10px;">· ${item.distance_km} km</span>
    </button>
  `).join("");
}

function selectNearbyLocality(district, locality, lat, lon) {
  state.currentLocation.district = district;
  state.currentLocation.locality = locality;
  state.currentLocation.lat = lat;
  state.currentLocation.lon = lon;

  const distSelect = document.getElementById("district-select");
  if (distSelect.value !== district) {
    distSelect.value = district;
    updateLocalityDropdown(district, locality);
  } else {
    document.getElementById("locality-select").value = locality;
    handleLocationSelection();
  }
}

// Sliders and Presets (Live Interactive Updates with Everyday Labels)
function setupSlidersAndPresets() {
  // Lead Day Slider
  const leadSlider = document.getElementById("slider-lead-day");
  const leadBadge = document.getElementById("lead-day-badge");
  leadSlider.addEventListener("input", (e) => {
    const d = parseInt(e.target.value);
    state.forecastParams.leadDay = d;
    leadBadge.innerText = `Day ${d} (${d === 1 ? 'Tomorrow' : d + ' Days Ahead'})`;
    updateQuickDayButtons(state.forecastParams.leadDay);
    triggerLivePrediction();
  });

  // Quick Lead Day Buttons
  document.querySelectorAll(".quick-day-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = parseInt(btn.dataset.day);
      state.forecastParams.leadDay = d;
      leadSlider.value = d;
      leadBadge.innerText = `Day ${d} (${d === 1 ? 'Tomorrow' : d + ' Days Ahead'})`;
      updateQuickDayButtons(d);
      runPrediction();
    });
  });

  // Rainfall Slider & Input
  const rainSlider = document.getElementById("slider-rainfall");
  const rainInput = document.getElementById("rainfall-input");
  const rainBadge = document.getElementById("rainfall-badge");

  rainSlider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    state.forecastParams.rainfallMm = val;
    rainInput.value = val;
    rainBadge.innerText = `${val} mm`;
    triggerLivePrediction();
  });

  rainInput.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value) || 0;
    state.forecastParams.rainfallMm = val;
    rainSlider.value = Math.min(val, 100);
    rainBadge.innerText = `${val} mm`;
    triggerLivePrediction();
  });

  // Rainfall Presets
  document.querySelectorAll(".preset-chip").forEach(chip => {
    if (chip.dataset.val !== undefined) {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".preset-chip").forEach(c => {
          if (c.dataset.val !== undefined) c.classList.remove("active");
        });
        chip.classList.add("active");
        const val = parseFloat(chip.dataset.val);
        state.forecastParams.rainfallMm = val;
        rainSlider.value = Math.min(val, 100);
        rainInput.value = val;
        rainBadge.innerText = `${val} mm`;
        runPrediction();
      });
    }
  });

  // Model Selector
  const modelSelect = document.getElementById("model-type-select");
  if (modelSelect) {
    modelSelect.addEventListener("change", (e) => {
      state.forecastParams.modelType = e.target.value;
      runPrediction();
    });
  }

  // Assess Button
  document.getElementById("btn-run-prediction").addEventListener("click", () => {
    runPrediction();
  });
}

function triggerLivePrediction() {
  clearTimeout(predictionDebounceTimer);
  predictionDebounceTimer = setTimeout(() => {
    runPrediction();
  }, 180);
}

function updateQuickDayButtons(day) {
  document.querySelectorAll(".quick-day-btn").forEach(b => {
    b.classList.toggle("active", parseInt(b.dataset.day) === day);
  });
}

// Prediction Inference Engine (Fast Date-Aware Execution)
async function runPrediction() {
  const btn = document.getElementById("btn-run-prediction");
  const originalText = btn.innerHTML;
  btn.innerHTML = `<span class="pulse-dot"></span> Calculating Trust Score...`;
  btn.disabled = true;

  try {
    const targetDate = state.selectedDate || getFutureDateString(5);
    const params = new URLSearchParams({
      target_date: targetDate,
      lat: state.currentLocation.lat,
      lon: state.currentLocation.lon,
      forecast_rainfall_mm: state.forecastParams.rainfallMm,
      district: state.currentLocation.district,
      locality: state.currentLocation.locality,
      model_type: state.forecastParams.modelType
    });

    const res = await fetch(`${API_BASE}/api/check-date?${params.toString()}`);
    if (!res.ok) throw new Error("Date Reliability API call failed");
    const data = await res.json();

    renderPredictionResults(data);
    renderDateGroundTruth(data);
  } catch (err) {
    console.error("Prediction error:", err);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function renderDateGroundTruth(data) {
  const gtCard = document.getElementById("historical-ground-truth-card");
  if (!gtCard) return;

  const gt = data.ground_truth;
  if (!gt || !gt.found) {
    gtCard.style.display = "none";
    return;
  }

  gtCard.style.display = "block";
  document.getElementById("hist-actual-rain").innerText = `${gt.observed_rainfall_mm} mm (${gt.rain_description})`;
  document.getElementById("hist-forecast-rain").innerText = `${data.forecast_rainfall_mm} mm`;
  document.getElementById("hist-error-mm").innerText = `${Math.abs(data.forecast_rainfall_mm - gt.observed_rainfall_mm).toFixed(2)} mm`;

  const matchBadge = document.getElementById("historical-match-badge");
  matchBadge.innerText = `${gt.reliable_initializations} of ${gt.total_initializations} Reliable (${gt.historical_accuracy_pct}%)`;

  const evolContainer = document.getElementById("hist-evolution-container");
  evolContainer.innerHTML = `
    <div style="margin-bottom:6px;font-weight:600;color:var(--ivory-text);">
      Real-World Multi-Day Forecast History For Target Date (${gt.target_date}):
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px;">
      ${gt.records.map(r => `
        <div style="background:rgba(255,255,255,0.03);padding:6px 10px;border-radius:4px;border:1px solid ${r.is_reliable ? 'rgba(99,213,200,0.3)' : 'rgba(224,109,83,0.3)'};">
          <div style="font-size:10px;color:var(--ivory-dim);">Issued ${r.issue_time} (Day ${r.lead_day})</div>
          <div style="font-size:11px;font-weight:600;color:${r.is_reliable ? 'var(--teal-glow)' : 'var(--coral-risk)'};">
            Fcst: ${r.forecast_rainfall_mm}mm · ${r.status_label}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPredictionResults(data) {
  const p = data.prediction;
  const b = data.benchmarks;
  const f = data.features_analysis;

  // Reliability Gauge
  const gaugePercent = document.getElementById("gauge-val");
  const gradeBadge = document.getElementById("grade-badge");
  const summaryEl = document.getElementById("prediction-summary-text");
  const circleEl = document.getElementById("reliability-gauge-circle");

  gaugePercent.innerText = `${p.reliable_probability}%`;
  gradeBadge.innerText = p.grade;
  gradeBadge.style.backgroundColor = `${p.grade_color}22`;
  gradeBadge.style.color = p.grade_color;
  gradeBadge.style.border = `1px solid ${p.grade_color}66`;

  circleEl.style.borderColor = p.grade_color;
  circleEl.style.boxShadow = `0 0 35px ${p.grade_color}33`;

  summaryEl.innerText = p.summary;

  // Plain English metrics breakdown
  document.getElementById("metric-calibrated-rate").innerText = `${p.calibrated_historical_rate}%`;
  document.getElementById("metric-outside-rate").innerText = `${p.outside_tolerance_probability}%`;
  document.getElementById("metric-hist-mae").innerText = `${b.historical_mae_mm} mm`;
  document.getElementById("metric-lead-avg-rel").innerText = `${b.lead_day_avg_reliability_pct}%`;

  // Feature impact breakdown
  const impactContainer = document.getElementById("feature-impact-container");
  if (impactContainer && f) {
    impactContainer.innerHTML = Object.entries(f).map(([key, item]) => `
      <div class="impact-item">
        <div class="impact-header">
          <span>${item.label} (<strong>${item.value}</strong>)</span>
          <span style="color:var(--teal-glow)">${item.importance_pct}% weight</span>
        </div>
        <div class="impact-bar-bg">
          <div class="impact-bar-fill" style="width:${item.importance_pct}%"></div>
        </div>
        <small style="color:var(--ivory-dim);font-size:11px;">${item.note}</small>
      </div>
    `).join("");
  }
}

// Leaflet Map Integration with Canvas Rendering Acceleration
function initLeafletMap() {
  const mapElement = document.getElementById("leaflet-map");
  if (!mapElement) return;

  state.mapInstance = L.map("leaflet-map", {
    center: [11.1271, 78.6569], // Central Tamil Nadu
    zoom: 7,
    minZoom: 6,
    maxZoom: 14,
    preferCanvas: true // Hardware-accelerated HTML5 Canvas rendering
  });

  // Zero-API-Key Base Layers
  const esriDark = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16
  });

  const darkOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    className: "dark-map-tiles",
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  });

  const standardOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  });

  esriDark.addTo(state.mapInstance);

  L.control.layers({
    "Esri Dark Gray": esriDark,
    "Atmospheric Dark OSM": darkOSM,
    "Standard OpenStreetMap": standardOSM
  }, null, { position: "topleft" }).addTo(state.mapInstance);

  // Initial location marker
  const initLoc = state.currentLocation;
  updateMapPin(initLoc.lat, initLoc.lon, `${initLoc.locality}, ${initLoc.district}`);

  // Click on map to select custom location
  state.mapInstance.on("click", (e) => {
    resolveCustomCoords(e.latlng.lat, e.latlng.lng, "Map Click Point", `Selected Point (${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)})`);
  });

  // Map layer switcher
  document.querySelectorAll(".map-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".map-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.mapLayer = btn.dataset.layer;
      redrawSpatialGridCircles();
    });
  });
}

function updateMapPin(lat, lon, label) {
  if (!state.mapInstance) return;

  if (state.locationMarker) {
    state.mapInstance.removeLayer(state.locationMarker);
  }
  if (state.radiusCircle) {
    state.mapInstance.removeLayer(state.radiusCircle);
  }

  // Draw 5 km Radius Radar Circle
  state.radiusCircle = L.circle([lat, lon], {
    radius: 5000, // 5 km
    color: "#63D5C8",
    fillColor: "#63D5C8",
    fillOpacity: 0.12,
    weight: 1.5,
    dashArray: "4, 6"
  }).addTo(state.mapInstance);

  const customIcon = L.divIcon({
    className: "custom-radar-pin",
    html: `
      <div style="position:relative;width:24px;height:24px;">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(99,213,200,0.3);animation:pulse 2s infinite;"></div>
        <div style="position:absolute;top:6px;left:6px;width:12px;height:12px;border-radius:50%;background:#63D5C8;border:2px solid #071725;box-shadow:0 0 10px #63D5C8;"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  state.locationMarker = L.marker([lat, lon], { icon: customIcon })
    .addTo(state.mapInstance)
    .bindPopup(`<strong>${label}</strong><br><span style="color:#63D5C8;">Target Assessment Point (5 km Radar Active)</span>`)
    .openPopup();
}

async function loadSpatialGrid() {
  try {
    const res = await fetch(`${API_BASE}/api/spatial-grid`);
    const data = await res.json();
    state.spatialGrid = data.cells;
    redrawSpatialGridCircles();
  } catch (err) {
    console.error("Error loading spatial grid:", err);
  }
}

function redrawSpatialGridCircles() {
  if (!state.mapInstance || !state.spatialGrid) return;

  if (state.spatialLayerGroup) {
    state.mapInstance.removeLayer(state.spatialLayerGroup);
  }

  const markers = [];

  state.spatialGrid.forEach(cell => {
    let color = "#63D5C8";
    let popupMetric = "";

    if (state.mapLayer === "reliability") {
      const rel = cell.reliability_pct;
      if (rel >= 85) color = "#63D5C8";
      else if (rel >= 70) color = "#D8BD88";
      else if (rel >= 55) color = "#E5A93B";
      else color = "#E06D53";
      popupMetric = `Accuracy Rate: <strong>${rel}%</strong> (Matches within 2.5 mm)`;
    } else if (state.mapLayer === "mae") {
      const mae = cell.mae;
      if (mae < 2.5) color = "#63D5C8";
      else if (mae < 5.0) color = "#D8BD88";
      else if (mae < 8.0) color = "#E5A93B";
      else color = "#E06D53";
      popupMetric = `Average Forecast Miss: <strong>${mae} mm</strong>`;
    } else if (state.mapLayer === "bias") {
      const bias = cell.bias;
      color = bias >= 0 ? "#63D5C8" : "#E06D53";
      popupMetric = `Model Tendency: <strong>${bias >= 0 ? 'Over-predicts by +' : 'Under-predicts by -'}${Math.abs(bias)} mm</strong>`;
    }

    const circle = L.circleMarker([cell.latitude, cell.longitude], {
      radius: 6,
      fillColor: color,
      color: "#05131f",
      weight: 1,
      opacity: 0.8,
      fillOpacity: 0.75
    });

    circle.bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;font-size:12px;line-height:1.5;">
        <strong style="color:#D8BD88;">Weather Zone (${cell.latitude.toFixed(2)}°N, ${cell.longitude.toFixed(2)}°E)</strong><br>
        ${popupMetric}<br>
        <span style="color:#A6BABA;">Past Forecasts Checked: ${cell.total_records}</span><br>
        <span style="color:#A6BABA;">Avg Predicted: ${cell.mean_forecast} mm | Avg Actual Rain: ${cell.mean_observed} mm</span>
      </div>
    `);

    circle.on("click", () => {
      resolveCustomCoords(cell.latitude, cell.longitude, "IMD/NOAA Weather Zone", `Zone (${cell.latitude.toFixed(2)}°N, ${cell.longitude.toFixed(2)}°E)`);
    });

    markers.push(circle);
  });

  // LayerGroup renders all markers in a single optimized pass
  state.spatialLayerGroup = L.layerGroup(markers).addTo(state.mapInstance);
}

// Lead Day Performance Charts (Plain English)
async function loadLeadDayData() {
  try {
    const res = await fetch(`${API_BASE}/api/lead-days`);
    const data = await res.json();
    renderLeadDayCharts(data);
    renderLeadDayTable(data.all_lead_days);
  } catch (err) {
    console.error("Error loading lead days data:", err);
  }
}

function renderLeadDayCharts(data) {
  const ctx = document.getElementById("chart-lead-days");
  if (!ctx) return;
  if (state.charts.leadDay) state.charts.leadDay.destroy();

  const trustPercentages = [96, 95, 92, 93, 82, 67, 56, 50, 58, 55];
  const barColors = [
    "#10b981", "#10b981", "#10b981", "#10b981", // Days 1-4 Green (Safe)
    "#f59e0b", "#f59e0b",                        // Days 5-6 Yellow (Caution)
    "#ef4444", "#ef4444", "#ef4444", "#ef4444"  // Days 7-10 Red (Uncertain)
  ];

  const days = data.all_lead_days.map(d => d.forecast_day === 1 ? "Tomorrow (Day 1)" : `Day ${d.forecast_day}`);
  const maes = data.all_lead_days.map(d => d.MAE);

  state.charts.leadDay = new Chart(ctx, {
    type: "bar",
    data: {
      labels: days,
      datasets: [
        {
          type: "bar",
          label: "AI Trust Rating (% Accurate)",
          data: trustPercentages,
          backgroundColor: barColors,
          borderRadius: 6,
          yAxisID: "yTrust"
        },
        {
          type: "line",
          label: "Average Rain Miss (Error in mm)",
          data: maes,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.15)",
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: "#38bdf8",
          pointBorderColor: "#ffffff",
          tension: 0.35,
          yAxisID: "yError"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#A6BABA", font: { family: "DM Sans", size: 12, weight: "600" } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label.includes("Trust")) {
                const val = ctx.raw;
                const status = val >= 90 ? "🟢 High Trust" : (val >= 70 ? "🟡 Caution" : "🔴 Low Trust");
                return ` ${ctx.dataset.label}: ${val}% (${status})`;
              } else {
                return ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)} mm`;
              }
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#F2EEE4", font: { weight: "600", size: 11 } },
          grid: { color: "rgba(255, 255, 255, 0.05)" }
        },
        yTrust: {
          type: "linear",
          position: "left",
          min: 0,
          max: 100,
          ticks: { color: "#10b981", callback: (v) => `${v}%` },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          title: { display: true, text: "Trust Level (% Accurate)", color: "#10b981", font: { weight: "700" } }
        },
        yError: {
          type: "linear",
          position: "right",
          min: 0,
          max: 5,
          ticks: { color: "#38bdf8", callback: (v) => `${v} mm` },
          grid: { display: false },
          title: { display: true, text: "Average Miss in mm", color: "#38bdf8", font: { weight: "700" } }
        }
      }
    }
  });
}

function renderLeadDayTable(days) {
  const tbody = document.getElementById("lead-day-tbody");
  if (!tbody || !days) return;

  const trustInfo = {
    1: { rate: "96%", badge: "badge-trust-high", label: "🟢 Very High Trust", advice: "Extremely reliable! Safe to book outdoor events, weddings, and travel." },
    2: { rate: "95%", badge: "badge-trust-high", label: "🟢 Very High Trust", advice: "Very sharp forecast! Safe for school, travel, and farming plans." },
    3: { rate: "92%", badge: "badge-trust-high", label: "🟢 High Trust", advice: "High accuracy; weather systems are well-tracked." },
    4: { rate: "93%", badge: "badge-trust-high", label: "🟢 High Trust", advice: "Very dependable for 4-day advance planning." },
    5: { rate: "82%", badge: "badge-trust-medium", label: "🟡 Good Trust", advice: "Good for rough weekend planning; re-check 2 days before." },
    6: { rate: "67%", badge: "badge-trust-medium", label: "🟡 Medium Trust", advice: "Rain timing can shift by 6-12 hours; check daily updates." },
    7: { rate: "56%", badge: "badge-trust-low", label: "🔴 Low Trust", advice: "High variance; clouds may shift by 50-100 km." },
    8: { rate: "50%", badge: "badge-trust-low", label: "🔴 Coin Toss (50/50)", advice: "As uncertain as flipping a coin; do not make costly plans." },
    9: { rate: "58%", badge: "badge-trust-low", label: "🔴 Low Trust", advice: "Useful only for broad seasonal trends, not daily rain." },
    10: { rate: "55%", badge: "badge-trust-low", label: "🔴 Low Trust", advice: "Computer models often change completely by Day 10." }
  };

  tbody.innerHTML = days.map(d => {
    const info = trustInfo[d.forecast_day] || { rate: "75%", badge: "badge-trust-medium", label: "🟡 Medium", advice: "Check updates" };
    const missDesc = d.MAE < 0.5 ? "less than half a drop!" : (d.MAE < 1.0 ? "less than a drop" : (d.MAE < 2.5 ? "small normal miss" : "noticeable difference"));
    return `
      <tr>
        <td><strong>Day ${d.forecast_day} ${d.forecast_day === 1 ? '(Tomorrow)' : (d.forecast_day <= 3 ? '(Few Days Ahead)' : (d.forecast_day <= 5 ? '(Weekend Outlook)' : '(Next Week)'))}</strong></td>
        <td><span class="${info.badge}">${info.label} (${info.rate})</span></td>
        <td><strong style="color:#67e8f9;">${d.MAE.toFixed(2)} mm</strong> <span style="font-size:11px;color:var(--ivory-dim);">(${missDesc})</span></td>
        <td style="font-size:12px;color:var(--ivory-text);">${info.advice}</td>
        <td style="font-size:11px;color:var(--ivory-muted);">${d.Records.toLocaleString()} stations tested</td>
      </tr>
    `;
  }).join("");
}

// Research Findings, Calibration, and Feature Importance (Plain English)
async function loadResearchData() {
  try {
    const res = await fetch(`${API_BASE}/api/research`);
    const data = await res.json();
    renderCalibrationChart(data.calibration);
    renderFeatureImportanceChart(data.feature_importance);
    renderThresholdChart(data.threshold_sensitivity);
  } catch (err) {
    console.error("Error loading research assets:", err);
  }
}

function renderCalibrationChart(calData) {
  const ctx = document.getElementById("chart-calibration");
  if (!ctx || !calData) return;
  if (state.charts.calibration) state.charts.calibration.destroy();

  const predicted = calData.map(c => (c.mean_predicted_probability * 100).toFixed(1));
  const actual = calData.map(c => (c.actual_reliability_rate * 100).toFixed(1));

  state.charts.calibration = new Chart(ctx, {
    type: "line",
    data: {
      labels: predicted.map(p => `${p}%`),
      datasets: [
        {
          label: "Real-World Observed Accuracy (%)",
          data: actual,
          borderColor: "#63D5C8",
          backgroundColor: "#63D5C8",
          pointRadius: 5,
          borderWidth: 2,
          tension: 0.2
        },
        {
          label: "Perfect 1:1 Trust Line (Ideal Accuracy)",
          data: predicted,
          borderColor: "rgba(216, 189, 136, 0.6)",
          borderDash: [6, 6],
          pointRadius: 0,
          borderWidth: 1.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#A6BABA", font: { family: "DM Sans", size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw}%`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#778F90" },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          title: { display: true, text: "AI Predicted Confidence (%)", color: "#A6BABA" }
        },
        y: {
          min: 0,
          max: 100,
          ticks: { color: "#778F90" },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          title: { display: true, text: "Actual Frequency of Reliable Forecasts (%)", color: "#A6BABA" }
        }
      }
    }
  });
}

function renderFeatureImportanceChart(featData) {
  const ctx = document.getElementById("chart-feature-importance");
  if (!ctx || !featData) return;
  if (state.charts.featureImp) state.charts.featureImp.destroy();

  const labels = featData.map(f => {
    switch (f.Feature) {
      case "forecast_rainfall_mm": return "🌧️ Rain Amount Predicted";
      case "forecast_day": return "📅 How Far Ahead (Days)";
      case "latitude": return "📍 North-South Location";
      case "longitude": return "📍 Coast vs Interior Plains";
      default: return f.Feature;
    }
  });
  const values = featData.map(f => (f.Importance * 100).toFixed(1));

  state.charts.featureImp = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Impact on Forecast Trust (%)",
        data: values,
        backgroundColor: ["#63D5C8", "#D8BD88", "#5AB4AC", "#B29762"],
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: "#778F90" },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          title: { display: true, text: "Impact on Prediction Accuracy (%)", color: "#A6BABA" }
        },
        y: {
          ticks: { color: "#F2EEE4" },
          grid: { display: false }
        }
      }
    }
  });
}

function renderThresholdChart(threshData) {
  const ctx = document.getElementById("chart-threshold");
  if (!ctx || !threshData) return;
  if (state.charts.threshold) state.charts.threshold.destroy();

  const labels = threshData.map(t => `${t.threshold_mm} mm Margin`);
  const pod = threshData.map(t => (t.POD * 100).toFixed(1));
  const far = threshData.map(t => (t.FAR * 100).toFixed(1));
  const csi = threshData.map(t => (t.CSI * 100).toFixed(1));

  state.charts.threshold = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        { label: "Successful Hit Rate (%)", data: pod, backgroundColor: "#63D5C8" },
        { label: "False Alarm Rate (%)", data: far, backgroundColor: "#E06D53" },
        { label: "Overall Success Balance (%)", data: csi, backgroundColor: "#D8BD88" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#A6BABA", font: { family: "DM Sans", size: 11 } } }
      },
      scales: {
        x: { ticks: { color: "#778F90" }, grid: { display: false } },
        y: { min: 0, max: 100, ticks: { color: "#778F90" }, grid: { color: "rgba(255,255,255,0.05)" } }
      }
    }
  });
}

// Historical Dataset Exploration
async function queryDataset() {
  const q = state.datasetQuery;
  const params = new URLSearchParams({
    page: q.page,
    page_size: q.pageSize
  });

  if (q.targetDate) params.append("target_date", q.targetDate);
  if (q.forecastDay) params.append("forecast_day", q.forecastDay);
  if (q.reliableFilter !== "all") params.append("reliable_filter", q.reliableFilter);
  if (q.minRain !== null) params.append("min_rainfall", q.minRain);
  if (q.maxRain !== null) params.append("max_rainfall", q.maxRain);

  try {
    const res = await fetch(`${API_BASE}/api/dataset?${params.toString()}`);
    const data = await res.json();
    renderDatasetTable(data);
  } catch (err) {
    console.error("Dataset query error:", err);
  }
}

function renderDatasetTable(data) {
  const tbody = document.getElementById("dataset-tbody");
  if (!tbody) return;

  document.getElementById("dataset-total-count").innerText = `${data.total_records.toLocaleString()} matched records`;
  document.getElementById("dataset-current-page").innerText = `Page ${data.page} of ${data.total_pages}`;

  document.getElementById("btn-prev-page").disabled = data.page <= 1;
  document.getElementById("btn-next-page").disabled = data.page >= data.total_pages;

  if (data.records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--ivory-dim);">No past weather records match your filter. Try selecting "All Records".</td></tr>`;
    return;
  }

  tbody.innerHTML = data.records.map(r => {
    const diff = Math.abs(r.forecast_rainfall_mm - r.observed_rainfall_mm).toFixed(1);
    const pass = r.is_reliable;
    return `
      <tr>
        <td style="color:var(--ivory-muted);">${r.forecast_issue_time}</td>
        <td><strong style="color:var(--gold-accent);">${r.valid_time}</strong></td>
        <td><span style="font-weight:700;color:#67e8f9;">Day ${r.forecast_day}</span></td>
        <td style="font-size:11px;">${r.latitude}°N, ${r.longitude}°E</td>
        <td><strong style="color:#38bdf8;">${r.forecast_rainfall_mm.toFixed(1)} mm</strong></td>
        <td><strong style="color:var(--ivory-text);">${r.observed_rainfall_mm.toFixed(1)} mm</strong></td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;background:${pass ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)'};border:1px solid ${pass ? '#10b981' : '#ef4444'};color:${pass ? '#34d399' : '#f87171'};">
            ${pass ? `✅ PASSED (Off by only ${diff} mm)` : `❌ MISSED (Off by ${diff} mm)`}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

// Table Pagination Handlers
document.addEventListener("DOMContentLoaded", () => {
  const btnPrev = document.getElementById("btn-prev-page");
  const btnNext = document.getElementById("btn-next-page");

  if (btnPrev && btnNext) {
    btnPrev.addEventListener("click", () => {
      if (state.datasetQuery.page > 1) {
        state.datasetQuery.page--;
        queryDataset();
      }
    });

    btnNext.addEventListener("click", () => {
      state.datasetQuery.page++;
      queryDataset();
    });
  }

  // Filter handlers
  const filterLeadDay = document.getElementById("filter-lead-day");
  const filterRel = document.getElementById("filter-reliability");

  if (filterLeadDay) {
    filterLeadDay.addEventListener("change", (e) => {
      state.datasetQuery.forecastDay = e.target.value ? parseInt(e.target.value) : null;
      state.datasetQuery.page = 1;
      queryDataset();
    });
  }

  if (filterRel) {
    filterRel.addEventListener("change", (e) => {
      state.datasetQuery.reliableFilter = e.target.value;
      state.datasetQuery.page = 1;
      queryDataset();
    });
  }
});

// ==========================================================================
// LIVE WEATHER & METEOROLOGICAL NEWS DASHBOARD CONTROLLER
// ==========================================================================

function setupLiveWeatherControls() {
  const liveSelect = document.getElementById("live-district-select");
  if (liveSelect) {
    liveSelect.addEventListener("change", (e) => {
      applyLocation(e.target.value, null, "User Selected");
    });
  }

  const btnDetect = document.getElementById("btn-detect-my-location");
  if (btnDetect) {
    btnDetect.addEventListener("click", async () => {
      btnDetect.classList.add("spinning");
      await detectUserLocationInitially(true);
      setTimeout(() => btnDetect.classList.remove("spinning"), 500);
    });
  }

  const btnRefresh = document.getElementById("btn-refresh-live-weather");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", async () => {
      const dist = liveSelect ? liveSelect.value : state.liveDistrict || "Chennai";
      btnRefresh.classList.add("spinning");
      const label = document.getElementById("refresh-btn-label");
      if (label) label.textContent = "Updating...";
      const savedLat = localStorage.getItem("user_selected_lat");
      const savedLon = localStorage.getItem("user_selected_lon");
      const savedLoc = localStorage.getItem("user_selected_locality");
      await loadLiveWeatherDashboard(
        dist,
        true,
        savedLat ? parseFloat(savedLat) : null,
        savedLon ? parseFloat(savedLon) : null,
        savedLoc
      );
      setTimeout(() => {
        btnRefresh.classList.remove("spinning");
        if (label) label.textContent = "Refreshed!";
        setTimeout(() => {
          if (label) label.textContent = "Refresh Live Data";
        }, 1200);
      }, 400);
    });
  }

  const btnTomorrowAi = document.getElementById("btn-assess-tomorrow-ai");
  if (btnTomorrowAi) {
    btnTomorrowAi.addEventListener("click", () => {
      if (state.liveWeather && state.liveWeather.tomorrow) {
        const rainMm = state.liveWeather.tomorrow.rainfall_mm;
        const dist = state.liveWeather.district || "Chennai";
        const dStr = state.liveWeather.tomorrow.date;
        bridgeForecastToTrust(rainMm, 1, dist, dStr);
      }
    });
  }

  // Live real-time ticking station clock (updates every second)
  setInterval(() => {
    const cardClock = document.getElementById("live-card-clock");
    if (cardClock) {
      const now = new Date();
      cardClock.textContent = `🕒 ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }
  }, 1000);
}

async function loadLiveWeatherDashboard(district = "Chennai", forceRefresh = false, customLat = null, customLon = null, customLocality = null) {
  state.liveDistrict = district;

  // Resolve district coordinates
  let lat = 13.0827;
  let lon = 80.2707;
  if (customLat && customLon) {
    lat = customLat;
    lon = customLon;
  } else if (state.districtsData && state.districtsData[district]) {
    const locs = state.districtsData[district].localities;
    if (locs && locs.length > 0) {
      lat = locs[0].lat;
      lon = locs[0].lon;
    }
  }

  const badgeElem = document.getElementById("live-district-badge");
  const timeElem = document.getElementById("live-weather-timestamp");
  const displayLocation = customLocality ? `${customLocality}, ${district}, Tamil Nadu` : `${district}, Tamil Nadu`;
  if (badgeElem) badgeElem.textContent = displayLocation;
  if (timeElem) timeElem.textContent = "Fetching live satellite & forecast model data...";

  try {
    // 1. Fetch Live Weather & 7-Day Forecast with cache-busting
    const refreshQuery = forceRefresh ? `&force_refresh=true&_t=${Date.now()}` : `&_t=${Date.now()}`;
    const wRes = await fetch(`${API_BASE}/api/live-weather?lat=${lat}&lon=${lon}&district=${encodeURIComponent(district)}${refreshQuery}`);
    const weatherData = await wRes.json();
    state.liveWeather = weatherData;

    // Update Current Weather UI
    const cur = weatherData.current;
    if (cur) {
      const elTemp = document.getElementById("live-current-temp");
      const elCond = document.getElementById("live-current-condition");
      const elIcon = document.getElementById("live-current-icon");
      const elFeels = document.getElementById("live-current-feels");
      const elHum = document.getElementById("live-stat-humidity");
      const elPrecip = document.getElementById("live-stat-precip");
      const elWind = document.getElementById("live-stat-wind");
      const elTip = document.getElementById("live-current-tip");
      const elClothes = document.getElementById("live-stat-clothes");

      if (elTemp) elTemp.textContent = cur.temperature_c.toFixed(1);
      if (elCond) elCond.textContent = cur.condition;
      if (elIcon) elIcon.textContent = cur.icon;
      if (elFeels) elFeels.textContent = `${cur.feels_like_c}°C`;
      if (elHum) elHum.textContent = `${cur.humidity_pct}%`;
      if (elPrecip) elPrecip.textContent = `${cur.precipitation_mm} mm`;
      if (elWind) elWind.textContent = `${cur.wind_speed_kmh} km/h`;
      if (elTip && cur.comfort_tip) elTip.textContent = cur.comfort_tip;
      if (elClothes) {
        if (cur.temperature_c >= 28) elClothes.textContent = "Light Cotton";
        else if (cur.temperature_c >= 22) elClothes.textContent = "Casual Wear";
        else elClothes.textContent = "Light Jacket";
      }
    }

    const now = new Date();
    const clientTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (timeElem) {
      timeElem.textContent = `Updated ${clientTime} · Live Satellite Feed`;
    }
    const cardClock = document.getElementById("live-card-clock");
    if (cardClock) {
      cardClock.textContent = `🕒 ${clientTime}`;
    }

    // Update Tomorrow Forecast UI
    const tom = weatherData.tomorrow;
    if (tom) {
      const elTomDate = document.getElementById("tomorrow-date-pill");
      const elTomRain = document.getElementById("tomorrow-rain-amount");
      const elTomProb = document.getElementById("tomorrow-rain-prob");
      const elTomCat = document.getElementById("tomorrow-rain-category");
      const elTomIcon = document.getElementById("tomorrow-weather-icon");
      const elTomCond = document.getElementById("tomorrow-weather-condition");
      const elTomMax = document.getElementById("tomorrow-temp-max");
      const elTomMin = document.getElementById("tomorrow-temp-min");
      const elTomSum = document.getElementById("tomorrow-summary-text");

      if (elTomDate) elTomDate.textContent = tom.full_date_label || "Tomorrow";
      if (elTomRain) elTomRain.textContent = `${tom.rainfall_mm.toFixed(1)} mm`;
      if (elTomProb) elTomProb.textContent = `${tom.rain_probability_pct}% Chance of Rain`;
      if (elTomCat) {
        elTomCat.textContent = tom.rain_category;
        elTomCat.style.color = tom.rain_color || "#38bdf8";
      }
      if (elTomIcon) elTomIcon.textContent = tom.icon;
      if (elTomCond) elTomCond.textContent = tom.condition;
      if (elTomMax) elTomMax.textContent = `${tom.temp_max_c}°C`;
      if (elTomMin) elTomMin.textContent = `${tom.temp_min_c}°C`;
      if (elTomSum) elTomSum.textContent = tom.summary_sentence;
    }

    // 2. Fetch News Bulletins & District Alerts
    const tomorrowRain = tom ? tom.rainfall_mm : 0.0;
    const nRes = await fetch(`${API_BASE}/api/weather-news?district=${encodeURIComponent(district)}&tomorrow_rain_mm=${tomorrowRain}`);
    const newsData = await nRes.json();
    state.weatherNews = newsData;

    renderWeatherNewsAndAlerts(newsData);

    // 3. Render 7-Day Rain Outlook
    render7DayOutlook(weatherData.daily_forecast, district);

  } catch (err) {
    console.error("Error loading live weather:", err);
    if (timeElem) timeElem.textContent = "Offline Climatological Mode Active";
  }
}

function renderWeatherNewsAndAlerts(news) {
  if (!news) return;

  // District Alert Card
  const alertCard = document.getElementById("district-alert-card");
  const alertDot = document.getElementById("alert-pulse-dot");
  const alertTitle = document.getElementById("alert-title");
  const alertDesc = document.getElementById("alert-desc");
  const alertDist = document.getElementById("alert-district-name");

  if (news.district_alert) {
    const da = news.district_alert;
    if (alertCard) alertCard.style.borderLeft = `5px solid ${da.color}`;
    if (alertDot) alertDot.style.background = da.color;
    if (alertTitle) {
      alertTitle.textContent = da.title;
      alertTitle.style.color = da.color;
    }
    if (alertDesc) alertDesc.textContent = da.description;
    if (alertDist) alertDist.textContent = news.district;

    const elSchool = document.getElementById("action-school");
    const elUmbrella = document.getElementById("action-umbrella");
    const elRoads = document.getElementById("action-roads");

    if (elSchool) {
      if (da.code === "GREEN") {
        elSchool.textContent = "Safe as usual";
        elSchool.style.color = "#10b981";
      } else if (da.code === "YELLOW") {
        elSchool.textContent = "Safe to go";
        elSchool.style.color = "#f59e0b";
      } else {
        elSchool.textContent = "Check alerts";
        elSchool.style.color = "#ef4444";
      }
    }

    if (elUmbrella) {
      if (da.code === "GREEN") {
        elUmbrella.textContent = "Not needed";
        elUmbrella.style.color = "#38bdf8";
      } else if (da.code === "YELLOW") {
        elUmbrella.textContent = "Carry one";
        elUmbrella.style.color = "#f59e0b";
      } else {
        elUmbrella.textContent = "Raincoat essential";
        elUmbrella.style.color = "#ef4444";
      }
    }

    if (elRoads) {
      if (da.code === "GREEN") {
        elRoads.textContent = "Dry & clear";
        elRoads.style.color = "#10b981";
      } else if (da.code === "YELLOW") {
        elRoads.textContent = "Normal spots";
        elRoads.style.color = "#f59e0b";
      } else {
        elRoads.textContent = "Wet & slippery";
        elRoads.style.color = "#ef4444";
      }
    }
  }

  // Bulletins List (Simple, Jargon-Free Stories)
  const bulletinsContainer = document.getElementById("news-bulletins-list");
  if (bulletinsContainer && news.news_bulletins) {
    bulletinsContainer.innerHTML = news.news_bulletins.map(b => `
      <div class="news-bulletin-card" style="margin-bottom:12px;">
        <div class="bulletin-header">
          <div class="bulletin-title" style="font-size:13px;font-weight:700;color:var(--ivory-text);">${b.headline}</div>
          <span class="bulletin-meta" style="font-size:11px;color:var(--teal-glow);font-weight:600;">${b.time}</span>
        </div>
        <div class="bulletin-body" style="font-size:12px;line-height:1.6;color:#cbd5e1;">${b.summary}</div>
      </div>
    `).join("");
  }

  // Farmer Advisories
  const farmerContainer = document.getElementById("farmer-advisories-list");
  if (farmerContainer && news.farmer_advisories) {
    farmerContainer.innerHTML = news.farmer_advisories.map(tip => `
      <div class="advisory-pill-item">${tip}</div>
    `).join("");
  }
}

function render7DayOutlook(dailyList, district) {
  const container = document.getElementById("sevenday-forecast-container");
  if (!container || !dailyList) return;

  container.innerHTML = dailyList.map(d => `
    <div class="daily-weather-card">
      <div>
        <div class="daily-day-label">${d.day_name}</div>
        <div class="daily-date-label">${d.date.slice(5)}</div>
      </div>
      <div class="daily-icon">${d.icon}</div>
      <div style="font-size:12px;font-weight:600;color:var(--ivory-text);">${d.condition}</div>
      <div>
        <div class="daily-rain-amt" style="color:${d.rain_color || '#38bdf8'}">${d.rainfall_mm.toFixed(1)} mm</div>
        <div class="daily-rain-prob">${d.rain_probability_pct}% rain chance</div>
      </div>
      <div class="daily-temp-range">${d.temp_max_c}° / ${d.temp_min_c}°C</div>
      <button class="btn-mini-bridge" onclick="bridgeForecastToTrust(${d.rainfall_mm}, ${Math.min(Math.max(d.day_index || 1, 1), 10)}, '${district}', '${d.date}')" title="Test this day's rainfall forecast in MonsoonTrust AI model">
        🎯 Test Accuracy
      </button>
    </div>
  `).join("");
}

/**
 * Direct Bridge from Live Weather to MonsoonTrust AI Engine
 * Transmits real-world prediction data into the ML reliability classifier.
 */
function bridgeForecastToTrust(rainMm, leadDay = 1, district = "Chennai", targetDate = null) {
  // 1. Switch to assessment tab
  switchTab("assessment");

  // 2. Select district & locality
  const distSelect = document.getElementById("district-select");
  if (distSelect && district) {
    distSelect.value = district;
    updateLocalityDropdown(district);
  }

  // 3. Set rainfall amount (both input and slider)
  const effectiveRain = typeof rainMm === "number" && rainMm > 0 ? rainMm : 2.5;
  const rainSlider = document.getElementById("forecast-rain");
  const rainInput = document.getElementById("rainfall-input-number");
  const rainDisplay = document.getElementById("rain-display");

  if (rainSlider) rainSlider.value = effectiveRain;
  if (rainInput) rainInput.value = effectiveRain;
  if (rainDisplay) rainDisplay.textContent = `${effectiveRain.toFixed(1)} mm`;
  state.forecastParams.rainfallMm = effectiveRain;

  // 4. Set lead day
  const effectiveLead = Math.min(Math.max(leadDay, 1), 10);
  const leadSlider = document.getElementById("lead-day");
  const leadDisplay = document.getElementById("lead-display");
  if (leadSlider) leadSlider.value = effectiveLead;
  if (leadDisplay) {
    leadDisplay.textContent = `Day ${effectiveLead} (${effectiveLead === 1 ? "Tomorrow" : `${effectiveLead} Days Ahead`})`;
  }
  state.forecastParams.leadDay = effectiveLead;

  // 5. Update target date if given
  if (targetDate) {
    state.selectedDate = targetDate;
    const dateInput = document.getElementById("target-date-input");
    if (dateInput) dateInput.value = targetDate;
  }

  // 6. Run prediction with MonsoonTrust AI
  runPrediction();

  // 7. Smoothly scroll to the assessment card
  setTimeout(() => {
    const resultCard = document.getElementById("prediction-result-card") || document.getElementById("confidence-card");
    if (resultCard) {
      resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
      resultCard.style.boxShadow = "0 0 30px rgba(99, 213, 200, 0.7)";
      setTimeout(() => {
        resultCard.style.boxShadow = "";
      }, 1800);
    }
  }, 100);
}

// Make accessible to inline onclick handlers
window.bridgeForecastToTrust = bridgeForecastToTrust;

