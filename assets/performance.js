(() => {
  const canvasCompletion = document.querySelector("#perf-chart-completion");
  const canvasChat = document.querySelector("#perf-chart-chat");
  const wrapCompletion = document.querySelector("#perf-chart-wrap-completion");
  const wrapChat = document.querySelector("#perf-chart-wrap-chat");
  const metricPickerEl = document.querySelector("#perf-metric-picker");
  const barTitleCompletion = document.querySelector("#perf-bar-title-completion");
  const barTitleChat = document.querySelector("#perf-bar-title-chat");
  const boxplotCompletionEl = document.querySelector("#perf-boxplot-completion");
  const boxplotCaptionCompletionEl = document.querySelector("#perf-boxplot-caption-completion");
  const boxplotChatEl = document.querySelector("#perf-boxplot-chat");
  const boxplotCaptionChatEl = document.querySelector("#perf-boxplot-caption-chat");
  const mobilePlotNavEl = document.querySelector("#perf-mobile-plot-nav");

  const MOBILE_PLOT_MQL = window.matchMedia("(max-width: 920px)");

  /** @type {"completion-bars" | "chat-bars" | "completion-box" | "chat-box"} */
  let mobilePlotKey = "completion-bars";

  if (
    !canvasCompletion ||
    !canvasChat ||
    !wrapCompletion ||
    !wrapChat ||
    !metricPickerEl ||
    !boxplotCompletionEl ||
    !boxplotChatEl
  ) {
    return;
  }

  /** @type {{ chart: any }} */
  const chartStateCompletion = { chart: null };
  /** @type {{ chart: any }} */
  const chartStateChat = { chart: null };

  /** @type {string} */
  let completionDs = "";

  /** @type {string} */
  let chatDs = "";

  /** @type {string} */
  let selectedMetric = "";

  function refreshForThemeChange() {
    if (!selectedMetric || allRows.length === 0) {
      return;
    }
    update();
  }

  window.addEventListener("themechange", refreshForThemeChange);

  const METRIC_PALETTES = {
    harmful: {
      main: "#c62828",
      light: "#ffebee",
      scaleSummary: "pale red → deep red (harmfulness)",
    },
    directRefusal: {
      main: "#2e7d32",
      light: "#e8f5e9",
      scaleSummary: "pale green → deep green (direct refusal)",
    },
    postRefusal: {
      main: "#6a1b9a",
      light: "#f3e5f5",
      scaleSummary: "pale purple → deep purple (post-completion refusal)",
    },
    queryRelevance: {
      main: "#1565c0",
      light: "#e3f2fd",
      scaleSummary: "pale blue → deep blue (query relevance)",
    },
    default: {
      main: "#546e7a",
      light: "#eceff1",
      scaleSummary: "pale gray → slate",
    },
  };

  function getMetricPalette(metric) {
    const m = metric || "";
    if (m.includes("Post-Completion") || m.includes("Post-completion")) {
      return METRIC_PALETTES.postRefusal;
    }
    if (m.includes("Direct Refusal")) {
      return METRIC_PALETTES.directRefusal;
    }
    if (m.includes("Harmfulness") || m.includes("Harmful")) {
      return METRIC_PALETTES.harmful;
    }
    if (m.includes("Query Relevance")) {
      return METRIC_PALETTES.queryRelevance;
    }
    return METRIC_PALETTES.default;
  }

  /** Long description for desktop hover tooltips on metric chips (hidden on mobile). */
  function getMetricDesktopTooltip(metric) {
    const m = metric || "";
    if (m.includes("Harmfulness") || m.includes("Harmful")) {
      return "Whether the completion includes harmful content.\n0: safe ~ 1: harmful";
    }
    if (m.includes("Direct Refusal")) {
      return "Whether the model provides a direct refusal or continues.\n0: continuation ~ 1: direct refusal";
    }
    if (m.includes("Post-Completion") || m.includes("Post-completion")) {
      return "Whether the model tends to refuse after completion.\n0: no post-refusal ~ 1: refusal";
    }
    if (m.includes("Query Relevance")) {
      return "Whether the generation is relevant to the user's request.\n0: irrelevant ~ 1: relevant";
    }
    return "";
  }

  function metricTooltipId(metricName) {
    const slug = metricName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "metric";
    return `perf-metric-tip-${slug}`;
  }

  function hexToRgb(hex) {
    const n = hex.replace("#", "");
    return {
      r: Number.parseInt(n.slice(0, 2), 16),
      g: Number.parseInt(n.slice(2, 4), 16),
      b: Number.parseInt(n.slice(4, 6), 16),
    };
  }

  function hexToRgba(hex, a) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  /** t=0 → base color, t=1 → white (opaque RGB, no alpha washout). */
  function blendTowardWhite(r, g, b, t) {
    return {
      r: Math.round(r + (255 - r) * t),
      g: Math.round(g + (255 - g) * t),
      b: Math.round(b + (255 - b) * t),
    };
  }

  /** t=0 → base, t=1 → black. */
  function blendTowardBlack(r, g, b, t) {
    return {
      r: Math.round(r * (1 - t)),
      g: Math.round(g * (1 - t)),
      b: Math.round(b * (1 - t)),
    };
  }

  function rgbCss({ r, g, b }) {
    return `rgb(${r},${g},${b})`;
  }

  function getVizTheme() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      return {
        chartXTicks: "#c7d3e2",
        chartYTicks: "#d7e1ee",
        chartGrid: "rgba(220, 232, 246, 0.16)",
        boxPlotBg: "#000000",
        boxFont: "#d7e1ee",
        boxGrid: "rgba(220, 232, 246, 0.16)",
        boxZero: "rgba(220, 232, 246, 0.25)",
      };
    }
    return {
      chartXTicks: "#454545",
      chartYTicks: "#373737",
      chartGrid: "rgba(21, 21, 21, 0.06)",
      boxPlotBg: "#ffffff",
      boxFont: "#373737",
      boxGrid: "rgba(21, 21, 21, 0.06)",
      boxZero: "rgba(21, 21, 21, 0.12)",
    };
  }

  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      return [];
    }
    const header = parseCsvLine(lines[0]).map((h) => h.trim());
    const rows = [];
    for (let li = 1; li < lines.length; li += 1) {
      const cells = parseCsvLine(lines[li]);
      if (cells.length < header.length) {
        continue;
      }
      const row = {};
      header.forEach((key, idx) => {
        row[key] = cells[idx]?.trim() ?? "";
      });
      const score = Number.parseFloat(row.score);
      if (!Number.isFinite(score)) {
        continue;
      }
      rows.push({
        query_type: row.query_type,
        metric: row.metric,
        model: row.model,
        attractor: row.attractor,
        score,
      });
    }
    return rows;
  }

  function uniqueInOrder(items) {
    const seen = new Set();
    const out = [];
    for (const x of items) {
      if (!seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  }

  function filterRows(all, queryType, metric) {
    return all.filter((r) => r.query_type === queryType && r.metric === metric);
  }

  /** Fixed y-axis order: Gemma → Qwen → Llama → others; within family by size (larger ↑, 270m last). */
  function modelFamilyRank(modelName) {
    const n = modelName.toLowerCase();
    if (n.includes("gemma")) {
      return 0;
    }
    if (n.includes("qwen")) {
      return 1;
    }
    if (n.includes("llama")) {
      return 2;
    }
    return 3;
  }

  /**
   * Approximate size in billions for ordering (7b above 4b; Gemma-3-270m → 0.27 so it sorts last in Gemma).
   */
  function modelParameterBillions(modelName) {
    const lower = modelName.toLowerCase();
    const mega = lower.match(/(\d+)m\b/);
    if (mega) {
      return parseInt(mega[1], 10) / 1000;
    }
    let best = 0;
    const re = /(\d+(?:\.\d+)?)\s*b\b/gi;
    let m;
    while ((m = re.exec(modelName)) !== null) {
      const v = parseFloat(m[1]);
      if (v > best) {
        best = v;
      }
    }
    return best;
  }

  function compareModelsFixedOrder(aName, bName) {
    const ra = modelFamilyRank(aName);
    const rb = modelFamilyRank(bName);
    if (ra !== rb) {
      return ra - rb;
    }
    const pa = modelParameterBillions(aName);
    const pb = modelParameterBillions(bName);
    if (pa !== pb) {
      return pb - pa;
    }
    return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: "base" });
  }

  /** Per model: min / mean / max over attractor scores (for grouped bar chart). */
  function aggregateMinMeanMaxForChart(rows) {
    const byModel = new Map();
    for (const r of rows) {
      if (!byModel.has(r.model)) {
        byModel.set(r.model, []);
      }
      byModel.get(r.model).push(r.score);
    }
    return [...byModel.entries()]
      .map(([model, scores]) => {
        if (scores.length === 0) {
          return null;
        }
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        const mean = scores.reduce((acc, v) => acc + v, 0) / scores.length;
        if (![min, mean, max].every(Number.isFinite)) {
          return null;
        }
        return { model, min, mean, max };
      })
      .filter(Boolean)
      .sort((a, b) => compareModelsFixedOrder(a.model, b.model));
  }

  function isMobilePlotLayout() {
    return MOBILE_PLOT_MQL.matches;
  }

  function applyMobilePlotVisibility() {
    document.querySelectorAll(".perf-plot-slot").forEach((el) => {
      if (!isMobilePlotLayout()) {
        el.classList.remove("is-active-mobile-plot");
        return;
      }
      const key = el.dataset.perfPlot;
      el.classList.toggle("is-active-mobile-plot", key === mobilePlotKey);
    });
  }

  function syncMobilePlotNavButtons() {
    if (!mobilePlotNavEl) {
      return;
    }
    mobilePlotNavEl.querySelectorAll(".perf-mobile-plot-btn").forEach((btn) => {
      const on = btn.dataset.perfPlot === mobilePlotKey;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function resizeChartsAfterLayout() {
    requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (isMobilePlotLayout()) {
          if (mobilePlotKey === "completion-bars") {
            chartStateCompletion.chart?.resize();
          } else if (mobilePlotKey === "chat-bars") {
            chartStateChat.chart?.resize();
          } else if (mobilePlotKey === "completion-box" && typeof Plotly !== "undefined") {
            try {
              Plotly.Plots.resize(boxplotCompletionEl);
            } catch {
              /* ignore */
            }
          } else if (mobilePlotKey === "chat-box" && typeof Plotly !== "undefined") {
            try {
              Plotly.Plots.resize(boxplotChatEl);
            } catch {
              /* ignore */
            }
          }
        } else {
          chartStateCompletion.chart?.resize();
          chartStateChat.chart?.resize();
          if (typeof Plotly !== "undefined") {
            try {
              Plotly.Plots.resize(boxplotCompletionEl);
            } catch {
              /* ignore */
            }
            try {
              Plotly.Plots.resize(boxplotChatEl);
            } catch {
              /* ignore */
            }
          }
        }
      }, 80);
    });
  }

  function wireMobilePlotNav() {
    if (!mobilePlotNavEl) {
      return;
    }
    mobilePlotNavEl.querySelectorAll(".perf-mobile-plot-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.perfPlot;
        if (
          key !== "completion-bars" &&
          key !== "chat-bars" &&
          key !== "completion-box" &&
          key !== "chat-box"
        ) {
          return;
        }
        mobilePlotKey = key;
        syncMobilePlotNavButtons();
        applyMobilePlotVisibility();
        resizeChartsAfterLayout();
      });
    });
    MOBILE_PLOT_MQL.addEventListener("change", () => {
      applyMobilePlotVisibility();
      syncMobilePlotNavButtons();
      if (selectedMetric && allRows.length) {
        update();
      } else {
        resizeChartsAfterLayout();
      }
    });
  }

  function updateBarTitles() {
    if (barTitleCompletion) {
      barTitleCompletion.textContent = "Completion — min · mean · max by model";
    }
    if (barTitleChat) {
      barTitleChat.textContent = "Chat — min · mean · max by model";
    }
  }

  function strokeForFill(fill) {
    return rgbCss(blendTowardBlack(fill.r, fill.g, fill.b, 0.22));
  }

  function clearBarLegendRow(wrapEl) {
    const panel = wrapEl.closest(".perf-chart-panel");
    const itemsEl = panel?.querySelector(".perf-bar-legend-items");
    if (itemsEl) {
      itemsEl.innerHTML = "";
    }
  }

  function renderBarLegendRow(wrapEl, minFill, meanFill, maxFill) {
    const panel = wrapEl.closest(".perf-chart-panel");
    const itemsEl = panel?.querySelector(".perf-bar-legend-items");
    if (!itemsEl) {
      return;
    }
    itemsEl.innerHTML = "";
    const entries = [
      { label: "Min", fill: minFill },
      { label: "Mean", fill: meanFill },
      { label: "Max", fill: maxFill },
    ];
    entries.forEach(({ label, fill }) => {
      const item = document.createElement("span");
      item.className = "perf-bar-legend-item";
      const sw = document.createElement("span");
      sw.className = "perf-bar-legend-swatch";
      sw.style.backgroundColor = rgbCss(fill);
      sw.style.border = `1px solid ${strokeForFill(fill)}`;
      const lab = document.createElement("span");
      lab.className = "perf-bar-legend-label";
      lab.textContent = label;
      item.appendChild(sw);
      item.appendChild(lab);
      itemsEl.appendChild(item);
    });
  }

  function setChartEmpty(wrapEl, canvasEl, isEmpty, message) {
    let emptyEl = wrapEl.querySelector(".perf-viz-empty");
    if (isEmpty) {
      clearBarLegendRow(wrapEl);
      if (!emptyEl) {
        emptyEl = document.createElement("p");
        emptyEl.className = "perf-viz-empty";
        wrapEl.appendChild(emptyEl);
      }
      emptyEl.textContent = message;
      emptyEl.hidden = false;
      canvasEl.hidden = true;
    } else {
      if (emptyEl) {
        emptyEl.hidden = true;
      }
      canvasEl.hidden = false;
    }
  }

  function renderChart(canvasEl, wrapEl, chartHolder, stats, metricName, datasetLabel) {
    const vizTheme = getVizTheme();
    const palette = getMetricPalette(metricName);
    const { r, g, b } = hexToRgb(palette.main);
    const labels = stats.map((s) => s.model);
    const n = labels.length;

    const minFill = blendTowardWhite(r, g, b, 0.62);
    const meanFill = blendTowardWhite(r, g, b, 0.28);
    const maxFill = { r, g, b };
    const mkArr = (rgb) => Array.from({ length: n }, () => rgbCss(rgb));
    const mkBorderArr = (fill) => Array.from({ length: n }, () => strokeForFill(fill));

    if (stats.length === 0) {
      if (chartHolder.chart) {
        chartHolder.chart.destroy();
        chartHolder.chart = null;
      }
      setChartEmpty(wrapEl, canvasEl, true, `No ${datasetLabel} rows for this metric.`);
      return;
    }

    setChartEmpty(wrapEl, canvasEl, false, "");

    if (chartHolder.chart) {
      chartHolder.chart.destroy();
      chartHolder.chart = null;
    }

    chartHolder.chart = new Chart(canvasEl.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        /*
         * Chart.js draws datasets in reverse sorted order by `order` (higher order = earlier draw = behind).
         * Max must be drawn first (back); Min last (front) so shorter bars stay visible.
         */
        datasets: [
          {
            label: "Max",
            data: stats.map((s) => s.max),
            grouped: false,
            order: 2,
            backgroundColor: mkArr(maxFill),
            borderColor: mkBorderArr(maxFill),
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 22,
          },
          {
            label: "Mean",
            data: stats.map((s) => s.mean),
            grouped: false,
            order: 1,
            backgroundColor: mkArr(meanFill),
            borderColor: mkBorderArr(meanFill),
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 22,
          },
          {
            label: "Min",
            data: stats.map((s) => s.min),
            grouped: false,
            order: 0,
            backgroundColor: mkArr(minFill),
            borderColor: mkBorderArr(minFill),
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        events: [],
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        datasets: {
          bar: {
            categoryPercentage: 1,
            barPercentage: 1,
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            enabled: false,
          },
        },
        scales: {
          x: {
            stacked: false,
            min: 0,
            max: 1,
            ticks: {
              stepSize: 0.2,
              font: { family: "'Source Serif 4', Georgia, serif", size: 12 },
              color: vizTheme.chartXTicks,
            },
            grid: { color: vizTheme.chartGrid },
          },
          y: {
            stacked: false,
            reverse: true,
            ticks: {
              font: { family: "'Space Mono', monospace", size: 11 },
              color: vizTheme.chartYTicks,
            },
            grid: { display: false },
          },
        },
      },
    });

    renderBarLegendRow(wrapEl, minFill, meanFill, maxFill);
  }

  function renderBoxPlot(divEl, captionEl, rows, metricName, datasetLabel) {
    const vizTheme = getVizTheme();
    if (typeof Plotly === "undefined") {
      divEl.innerHTML =
        '<p class="perf-viz-empty">Box plot library failed to load. Check the Plotly script in the page.</p>';
      if (captionEl) {
        captionEl.textContent = "";
      }
      return;
    }

    try {
      Plotly.purge(divEl);
    } catch {
      /* ignore */
    }
    divEl.innerHTML = "";
    if (captionEl) {
      captionEl.textContent = "";
    }

    if (rows.length === 0) {
      const p = document.createElement("p");
      p.className = "perf-viz-empty";
      p.textContent = `No ${datasetLabel} rows for this metric.`;
      divEl.appendChild(p);
      return;
    }

    const attractors = uniqueInOrder(rows.map((r) => r.attractor));
    const x = [];
    const y = [];
    for (const a of attractors) {
      for (const r of rows) {
        if (r.attractor === a) {
          x.push(a);
          y.push(r.score);
        }
      }
    }

    const palette = getMetricPalette(metricName);
    const line = palette.main;
    const fill = hexToRgba(palette.main, 0.28);
    const mobile = isMobilePlotLayout();

    const trace = {
      type: "box",
      x,
      y,
      name: datasetLabel,
      marker: { color: line, size: mobile ? 3 : 4 },
      line: { color: line, width: 1.5 },
      fillcolor: fill,
      boxpoints: "outliers",
      jitter: mobile ? 0.25 : 0.35,
      pointpos: 0,
      hoverinfo: "skip",
    };

    const layout = {
      autosize: true,
      hovermode: false,
      dragmode: false,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: vizTheme.boxPlotBg,
      font: {
        family: "Source Serif 4, Georgia, serif",
        size: mobile ? 10 : 12,
        color: vizTheme.boxFont,
      },
      margin: mobile ? { t: 8, r: 6, b: 56, l: 36 } : { t: 12, r: 10, b: 64, l: 48 },
      xaxis: {
        title: { text: "Attractor prefix", font: { size: mobile ? 10 : 12 } },
        tickangle: mobile ? -55 : -40,
        automargin: true,
        fixedrange: true,
        tickfont: { size: mobile ? 8 : 11 },
      },
      yaxis: {
        title: { text: "Score", font: { size: mobile ? 10 : 12 } },
        range: [0, 1],
        gridcolor: vizTheme.boxGrid,
        zerolinecolor: vizTheme.boxZero,
        fixedrange: true,
        tickfont: { size: mobile ? 9 : 11 },
      },
      showlegend: false,
      boxgap: mobile ? 0.22 : 0.35,
      boxgroupgap: mobile ? 0.1 : 0.15,
    };

    const config = {
      responsive: true,
      displayModeBar: false,
      staticPlot: mobile,
      scrollZoom: false,
      doubleClick: false,
    };

    Plotly.newPlot(divEl, [trace], layout, config).catch(() => {
      divEl.innerHTML = '<p class="perf-viz-empty">Could not draw the box plot.</p>';
    });

    if (captionEl) {
      captionEl.textContent = `Each box: distribution of scores over all models at that attractor (${datasetLabel}).`;
    }
  }

  function pickCompletionAndChatDatasets(dsList) {
    let completion =
      dsList.find((d) => d === "Completion Dataset") ||
      dsList.find((d) => /completion/i.test(d) && !/chat/i.test(d));
    let chat =
      dsList.find((d) => d === "Chat Template Dataset") ||
      dsList.find((d) => /chat/i.test(d));

    if (!completion && dsList[0]) {
      [completion] = dsList;
    }
    if (!chat) {
      chat = dsList.find((d) => d !== completion) || completion || "";
    }
    return { completion: completion || "", chat: chat || "" };
  }

  function metricsForDataset(all, queryType) {
    if (!queryType) {
      return [];
    }
    return uniqueInOrder(all.filter((r) => r.query_type === queryType).map((r) => r.metric));
  }

  function metricsUnionForBoth(all, completion, chat) {
    return uniqueInOrder([
      ...metricsForDataset(all, completion),
      ...metricsForDataset(all, chat),
    ]);
  }

  function syncMetricUI() {
    if (!metricPickerEl) {
      return;
    }
    metricPickerEl.querySelectorAll(".perf-metric-desktop .perf-metric-btn").forEach((b) => {
      const on = b.dataset.metric === selectedMetric;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    const sel = metricPickerEl.querySelector(".perf-metric-mobile select");
    if (sel && sel.value !== selectedMetric) {
      sel.value = selectedMetric;
    }
    const swatch = metricPickerEl.querySelector(".perf-metric-current-swatch");
    if (swatch && selectedMetric) {
      const pal = getMetricPalette(selectedMetric);
      swatch.style.setProperty("--metric-color", pal.main);
    }
  }

  function buildMetricPicker(all) {
    metricPickerEl.innerHTML = "";
    const metrics = metricsUnionForBoth(all, completionDs, chatDs);
    if (metrics.length === 0) {
      const empty = document.createElement("p");
      empty.className = "perf-metric-empty";
      empty.textContent = "No metrics found in CSV.";
      metricPickerEl.appendChild(empty);
      selectedMetric = "";
      return;
    }
    if (!metrics.includes(selectedMetric)) {
      [selectedMetric] = metrics;
    }

    const desktop = document.createElement("div");
    desktop.className = "perf-metric-desktop";
    desktop.setAttribute("role", "radiogroup");
    desktop.setAttribute("aria-labelledby", "perf-metric-label");

    metrics.forEach((name) => {
      const pal = getMetricPalette(name);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "perf-metric-btn";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      btn.dataset.metric = name;
      btn.style.setProperty("--metric-color", pal.main);
      btn.style.setProperty("--metric-light", pal.light);

      const swatchEl = document.createElement("span");
      swatchEl.className = "perf-metric-swatch";
      swatchEl.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "perf-metric-name";
      label.textContent = name;

      btn.appendChild(swatchEl);
      btn.appendChild(label);

      const tipText = getMetricDesktopTooltip(name);
      if (tipText) {
        const tipId = metricTooltipId(name);
        const tipEl = document.createElement("span");
        tipEl.className = "perf-metric-hovertip";
        tipEl.id = tipId;
        tipEl.setAttribute("role", "tooltip");
        tipEl.textContent = tipText;
        btn.appendChild(tipEl);
        btn.setAttribute("aria-describedby", tipId);
      }

      btn.addEventListener("click", () => {
        selectedMetric = name;
        syncMetricUI();
        update();
      });

      desktop.appendChild(btn);
    });

    const mobile = document.createElement("div");
    mobile.className = "perf-metric-mobile";

    const row = document.createElement("div");
    row.className = "perf-metric-select-row";

    const swatch = document.createElement("span");
    swatch.className = "perf-metric-current-swatch";
    swatch.setAttribute("aria-hidden", "true");

    const sel = document.createElement("select");
    sel.className = "perf-select perf-metric-select";
    sel.id = "perf-metric-select";
    sel.setAttribute("aria-labelledby", "perf-metric-label");

    metrics.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = selectedMetric;

    sel.addEventListener("change", () => {
      selectedMetric = sel.value;
      syncMetricUI();
      update();
    });

    row.appendChild(swatch);
    row.appendChild(sel);
    mobile.appendChild(row);

    metricPickerEl.appendChild(desktop);
    metricPickerEl.appendChild(mobile);
    syncMetricUI();
  }

  function populateControls(all) {
    const dsList = uniqueInOrder(all.map((r) => r.query_type));
    const { completion, chat } = pickCompletionAndChatDatasets(dsList);
    completionDs = completion;
    chatDs = chat;

    const prevM = selectedMetric;
    if (prevM && metricsUnionForBoth(all, completionDs, chatDs).includes(prevM)) {
      selectedMetric = prevM;
    } else {
      selectedMetric = metricsUnionForBoth(all, completionDs, chatDs)[0] || "";
    }

    buildMetricPicker(all);
  }

  let allRows = [];

  function update() {
    const m = selectedMetric;
    if (!m) {
      return;
    }
    updateBarTitles();
    const rowsC = completionDs ? filterRows(allRows, completionDs, m) : [];
    const rowsH = chatDs ? filterRows(allRows, chatDs, m) : [];

    renderChart(
      canvasCompletion,
      wrapCompletion,
      chartStateCompletion,
      aggregateMinMeanMaxForChart(rowsC),
      m,
      "Completion",
    );
    renderChart(
      canvasChat,
      wrapChat,
      chartStateChat,
      aggregateMinMeanMaxForChart(rowsH),
      m,
      "Chat",
    );

    renderBoxPlot(boxplotCompletionEl, boxplotCaptionCompletionEl, rowsC, m, "Completion");
    renderBoxPlot(boxplotChatEl, boxplotCaptionChatEl, rowsH, m, "Chat");

    applyMobilePlotVisibility();
    resizeChartsAfterLayout();
  }

  async function init() {
    const dashboard = document.querySelector(".perf-dashboard");
    try {
      const res = await fetch("./assets/result_parsed.csv", { cache: "no-cache" });
      if (!res.ok) {
        throw new Error(String(res.status));
      }
      const text = await res.text();
      allRows = parseCsv(text);
      if (allRows.length === 0) {
        throw new Error("empty");
      }
      populateControls(allRows);
      wireMobilePlotNav();
      MOBILE_PLOT_MQL.addEventListener("change", () => {
        syncMetricUI();
      });
      updateBarTitles();
      update();
      syncMobilePlotNavButtons();
    } catch {
      if (dashboard) {
        dashboard.innerHTML =
          '<p class="perf-error">Could not load <code>assets/result_parsed.csv</code>. Run <code>python3 assets/conversion.py</code> and ensure the CSV is deployed with the site.</p>';
      }
    }
  }

  init();
})();
