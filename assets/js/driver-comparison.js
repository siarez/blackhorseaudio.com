(function () {
  "use strict";

  var app = document.getElementById("driver-compare-app");
  if (!app || typeof Plotly === "undefined") return;

  var dataUrl = app.dataset.src;
  var harmonicsEl = document.getElementById("harmonics-controls");
  var driversEl = document.getElementById("drivers-controls");
  var statusEl = document.getElementById("compare-status");
  var searchEl = document.getElementById("driver-search");
  var plotEl = document.getElementById("compare-plot");
  var legendEl = document.getElementById("compare-legend");
  var selectAllVD = document.getElementById("select-all-vd");
  var selectAllCD = document.getElementById("select-all-cd");
  var clearAll = document.getElementById("clear-all");

  var HARMONICS = ["H2", "H3", "H5"];
  var state = {
    selectedHarmonic: "H2",
    selectedModesByDriver: {}
  };
  var dataset = null;

  function sanitizeId(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function hashString(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function driverColor(driverId) {
    // Deterministic, higher-contrast colors on dark background.
    var h = hashString(String(driverId));
    var hue = (h * 137.508) % 360; // golden-angle spacing
    var sat = 72 + (h % 3) * 6;    // 72, 78, 84
    var light = 58 + (Math.floor(h / 7) % 3) * 6; // 58, 64, 70
    return hslToHex(hue, sat, light);
  }

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var hp = h / 60;
    var x = c * (1 - Math.abs((hp % 2) - 1));
    var r = 0, g = 0, b = 0;
    if (hp >= 0 && hp < 1) { r = c; g = x; b = 0; }
    else if (hp < 2) { r = x; g = c; b = 0; }
    else if (hp < 3) { r = 0; g = c; b = x; }
    else if (hp < 4) { r = 0; g = x; b = c; }
    else if (hp < 5) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    var m = l - c / 2;
    var toHex = function (v) {
      var n = Math.round((v + m) * 255);
      var hex = n.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }

  function buildHarmonicsControls() {
    harmonicsEl.innerHTML = "";
    HARMONICS.forEach(function (harmonic) {
      var id = "harmonic-" + harmonic.toLowerCase();
      var label = document.createElement("label");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "harmonic";
      input.id = id;
      input.checked = state.selectedHarmonic === harmonic;
      input.addEventListener("change", function () {
        if (input.checked) {
          state.selectedHarmonic = harmonic;
          renderPlot();
        }
      });
      label.htmlFor = id;
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + harmonic));
      harmonicsEl.appendChild(label);
    });
  }

  function buildDriversControls() {
    driversEl.innerHTML = "";
    var query = (searchEl.value || "").toLowerCase().trim();
    var visibleCount = 0;

    dataset.drivers.forEach(function (driver) {
      var name = driver.name || driver.id;
      if (query && name.toLowerCase().indexOf(query) === -1) return;
      visibleCount++;

      var row = document.createElement("div");
      row.className = "driver-item";

      var title = document.createElement("p");
      title.className = "driver-name";
      title.textContent = name;
      row.appendChild(title);

      var toggles = document.createElement("div");
      toggles.className = "mode-toggles";

      ["VD", "CD"].forEach(function (mode) {
        var modeId = "driver-" + sanitizeId(driver.id || name) + "-" + mode.toLowerCase();
        var label = document.createElement("label");
        var checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = modeId;
        checkbox.checked = !!state.selectedModesByDriver[driver.id][mode];
        checkbox.addEventListener("change", function () {
          state.selectedModesByDriver[driver.id][mode] = checkbox.checked;
          renderPlot();
        });
        label.htmlFor = modeId;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(" " + mode));
        toggles.appendChild(label);
      });

      row.appendChild(toggles);
      driversEl.appendChild(row);
    });

    if (visibleCount === 0) {
      var empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No drivers match this filter.";
      driversEl.appendChild(empty);
    }
  }

  function buildTrace(driver, mode, harmonic) {
    var points = driver.series &&
      driver.series[mode] &&
      driver.series[mode][harmonic];

    if (!Array.isArray(points) || points.length === 0) return null;

    var x = new Array(points.length);
    var y = new Array(points.length);
    for (var i = 0; i < points.length; i++) {
      x[i] = points[i][0];
      y[i] = points[i][1];
    }

    var color = driverColor(driver.id || driver.name || "driver");

    return {
      type: "scattergl",
      mode: "lines",
      name: (driver.name || driver.id) + " · " + mode + " · " + harmonic,
      legendgroup: (driver.id || driver.name) + "-" + mode,
      line: {
        color: color,
        width: mode === "CD" ? 2.4 : 1.4,
        dash: "solid"
      },
      x: x,
      y: y,
      hovertemplate:
        "<b>" + (driver.name || driver.id) + "</b><br>" +
        "Mode: " + mode + "<br>" +
        "Harmonic: " + harmonic + "<br>" +
        "f: %{x:.0f} Hz<br>" +
        "dB: %{y:.2f}<extra></extra>"
    };
  }

  function selectedTraceCountText(count) {
    if (count === 0) return "No traces selected.";
    if (count === 1) return "1 trace selected.";
    return count + " traces selected.";
  }

  function renderLegend(traces) {
    if (!legendEl) return;
    legendEl.innerHTML = "";
    if (!traces.length) {
      var empty = document.createElement("div");
      empty.className = "compare-legend-label";
      empty.textContent = "No traces selected.";
      legendEl.appendChild(empty);
      return;
    }
    traces.forEach(function (trace) {
      var item = document.createElement("div");
      item.className = "compare-legend-item";

      var line = document.createElement("span");
      line.className = "compare-legend-line";
      line.style.borderTopColor = trace.line.color;
      line.style.borderTopWidth = (trace.line.width || 2) + "px";
      item.appendChild(line);

      var label = document.createElement("span");
      label.className = "compare-legend-label";
      label.textContent = trace.name;
      item.appendChild(label);

      legendEl.appendChild(item);
    });
  }

  function renderPlot() {
    var traces = [];

    dataset.drivers.forEach(function (driver) {
      var modes = state.selectedModesByDriver[driver.id];
      if (!modes) return;

      ["VD", "CD"].forEach(function (mode) {
        if (!modes[mode]) return;
        var trace = buildTrace(driver, mode, state.selectedHarmonic);
        if (trace) traces.push(trace);
      });
    });

    setStatus(selectedTraceCountText(traces.length));
    renderLegend(traces);

    var layout = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "#e9ecf1" },
      margin: { l: 62, r: 20, t: 12, b: 56, autoexpand: false },
      xaxis: {
        title: "Frequency (Hz)",
        type: "log",
        autorange: false,
        range: [Math.log10(200), Math.log10(4000)],
        fixedrange: true,
        gridcolor: "rgba(255,255,255,0.16)",
        linecolor: "rgba(255,255,255,0.25)",
        zeroline: false
      },
      yaxis: {
        title: "Distortion (dB)",
        range: [-100, -40],
        fixedrange: true,
        gridcolor: "rgba(255,255,255,0.16)",
        linecolor: "rgba(255,255,255,0.25)",
        zeroline: false
      },
      showlegend: false,
      hovermode: "closest"
    };

    Plotly.react(plotEl, traces, layout, {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ["lasso2d", "select2d"],
      scrollZoom: true
    });
  }

  function initSelections() {
    dataset.drivers.forEach(function (driver, idx) {
      state.selectedModesByDriver[driver.id] = { VD: false, CD: false };
      if (idx === 0) {
        // Give first render a visible baseline.
        state.selectedModesByDriver[driver.id].VD = true;
      }
    });
  }

  function applyBulk(mode, value) {
    Object.keys(state.selectedModesByDriver).forEach(function (id) {
      state.selectedModesByDriver[id][mode] = value;
    });
    buildDriversControls();
    renderPlot();
  }

  function wireActions() {
    searchEl.addEventListener("input", buildDriversControls);
    selectAllVD.addEventListener("click", function () { applyBulk("VD", true); });
    selectAllCD.addEventListener("click", function () { applyBulk("CD", true); });
    clearAll.addEventListener("click", function () {
      Object.keys(state.selectedModesByDriver).forEach(function (id) {
        state.selectedModesByDriver[id].VD = false;
        state.selectedModesByDriver[id].CD = false;
      });
      buildDriversControls();
      renderPlot();
    });
  }

  function normalize(input) {
    var out = {
      drivers: []
    };

    if (!input || !Array.isArray(input.drivers)) return out;

    out.drivers = input.drivers.map(function (driver, idx) {
      var id = driver.id || sanitizeId(driver.name || ("driver-" + idx));
      return {
        id: id,
        name: driver.name || id,
        series: driver.series || {}
      };
    });
    return out;
  }

  fetch(dataUrl)
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to load dataset.");
      return res.json();
    })
    .then(function (json) {
      dataset = normalize(json);
      if (dataset.drivers.length === 0) {
        throw new Error("Dataset has no drivers.");
      }

      initSelections();
      buildHarmonicsControls();
      buildDriversControls();
      wireActions();
      renderPlot();
    })
    .catch(function (err) {
      setStatus(err.message || "Failed to initialize comparison plot.");
      driversEl.innerHTML = "";
      Plotly.react(plotEl, [], {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "#e9ecf1" },
        xaxis: { visible: false },
        yaxis: { visible: false },
        annotations: [{
          text: "Unable to load plot data.",
          x: 0.5, y: 0.5, xref: "paper", yref: "paper",
          showarrow: false, font: { size: 16, color: "#b6bfcc" }
        }]
      }, { responsive: true, displaylogo: false });
    });
})();
