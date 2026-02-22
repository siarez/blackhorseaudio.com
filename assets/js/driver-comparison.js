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
  // Extended Glasbey-style categorical palette (high separation on dark backgrounds).
  // If driver count exceeds this list, deterministic lightness variants are applied.
  var GLASBEY_COLORS = [
    "#d60000", "#8c3bff", "#018700", "#00acc6", "#ff7ed1", "#6b4f00", "#ff8c00", "#005f9e",
    "#00a86b", "#ad002a", "#8f7b00", "#7a00a8", "#00c2ff", "#8b4513", "#4b9f00", "#f032e6",
    "#4363d8", "#e6194b", "#3cb44b", "#ffe119", "#f58231", "#911eb4", "#46f0f0", "#bfef45",
    "#bcf60c", "#fabebe", "#008080", "#e6beff", "#9a6324", "#fffac8", "#800000", "#aaffc3",
    "#808000", "#ffd8b1", "#000075", "#808080", "#1f77b4", "#ff9896", "#2ca02c", "#ffbb78",
    "#9467bd", "#17becf", "#e377c2", "#7f7f7f", "#bcbd22", "#aec7e8", "#98df8a", "#c5b0d5",
    "#ff1493", "#00fa9a", "#00bfff", "#ffd700", "#ff4500", "#7fff00", "#6495ed", "#ff69b4",
    "#20b2aa", "#b8860b", "#dc143c", "#00ced1", "#7b68ee", "#ff6347", "#2e8b57", "#cd5c5c"
  ];
  var state = {
    selectedHarmonic: "H3",
    selectedModesByDriver: {}
  };
  var dataset = null;

  function sanitizeId(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  }

  function displayDriverName(driver) {
    var raw = driver.name || driver.id || "";
    return String(raw).replace(/_/g, " ").trim();
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
    var h = hashString(String(driverId));
    var base = GLASBEY_COLORS[h % GLASBEY_COLORS.length];
    var variant = Math.floor(h / GLASBEY_COLORS.length) % 3;
    if (variant === 0) return base;
    // Overflow handling for > palette size while preserving deterministic mapping.
    return adjustHexLightness(base, variant === 1 ? 0.12 : -0.12);
  }

  function adjustHexLightness(hex, delta) {
    var rgb = hexToRgb(hex);
    if (!rgb) return hex;
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsl.l = Math.max(0.22, Math.min(0.82, hsl.l + delta));
    return hslToHex(hsl.h, hsl.s, hsl.l);
  }

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h: h, s: s, l: l };
  }

  function hslToHex(h, s, l) {
    var r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      var hue2rgb = function (p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    var toHex = function (x) {
      var v = Math.round(x * 255).toString(16);
      return v.length === 1 ? "0" + v : v;
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
      var name = displayDriverName(driver);
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
    var displayName = displayDriverName(driver);

    return {
      type: "scattergl",
      mode: "lines",
      name: displayName + " · " + mode + " · " + harmonic,
      legendgroup: (driver.id || driver.name) + "-" + mode,
      line: {
        color: color,
        width: mode === "CD" ? 2.4 : 1.4,
        dash: mode === "VD" ? "dash" : "solid"
      },
      x: x,
      y: y,
      hovertemplate:
        "<b>" + displayName + "</b><br>" +
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
    }).sort(function (a, b) {
      return displayDriverName(a).localeCompare(displayDriverName(b), undefined, { sensitivity: "base" });
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
