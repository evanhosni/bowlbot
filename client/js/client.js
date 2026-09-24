const socket = io(window.SOCKET_URL);
var connectedToServer;
var currentBowls;
var is_online = false;
var bowls = document.querySelector(".counter");
var modal = document.querySelector("#modal");

const RANGES = ["total", "year", "month", "week", "day", "hour"];
const leaderboardsEl = document.querySelector("#leaderboards");
const track = document.querySelector("#tables");
const boards = RANGES.map((r) => document.querySelector(`#board-${r}`));
const tabs = RANGES.map((r) => document.querySelector(`#tabs [data-range="${r}"]`));
const indicator = document.querySelector("#tab-indicator");
const DEFAULT_RANGE = "week";
var activeIndex = RANGES.indexOf(DEFAULT_RANGE);
var leaderboardsOpen = false;
var disclaimerOpen = false;
const disclaimerText = document.querySelector("#disclaimer > div");
const agreeBtn = document.querySelector("#agree-btn");
const READ_SLACK_PX = 20;
var charting = false;
var chart = null;
var chartData = null;
const chartButton = document.querySelector("#btn-chart");
const chartCanvas = document.querySelector("#chart-canvas");
const zoomReset = document.querySelector("#zoom-reset");
const chartEl = document.querySelector("#chart");
const chartTip = document.querySelector("#chart-tip");
const chartLegend = document.querySelector("#chart-legend");
const legendList = document.querySelector("#legend-list");
const legendTip = document.querySelector("#legend-tip");
const chartBox = document.querySelector("#chart-box");
var resizeTimer = null;
var zoom = null;
var zoomDrag = null;

const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const DAY = 86400000;
const YEAR = 365 * DAY;
const MIN_ZOOM = 7 * DAY;
const DASHES = [undefined, [6, 4], [2, 3], [8, 3, 2, 3]];
const LEGEND_TIP_DELAY_MS = 1000;
const RESIZE_SETTLE_MS = 100;
const CHART_WARM_MS = 1100;
var chartWarmTimer = null;
var modalOpenedAt = 0;

socket.on("init", (data) => {
  connectedToServer = true;
  socket.emit("leaderboards");
  currentBowls = data;
  setTimeout(() => {
    bowls.innerHTML = currentBowls;
  }, 2500);
});

socket.on("bowlcount", (data) => {
  socket.emit("leaderboards");
  if (leaderboardsOpen) socket.emit("chart");
  setTimeout(() => {
    bowls.innerHTML = data;
  }, 3500);
});

socket.on("bot_status", (data) => {
  is_online = data;
  updateBotStatus();
});

socket.on("leaderboards", (data) => {
  for (let i = 0; i < boards.length; i++) {
    renderBoard(boards[i], data[i] || []);
  }
  if (leaderboardsOpen) refreshMarquees();
});

socket.on("chart", (data) => {
  const { from, to } = data;
  const servers = data.servers.map((s) => {
    const points = [{ x: from, y: 0 }];
    for (const [day, total] of s.days) points.push({ x: Math.min((day + 1) * DAY, to), y: total });
    if (points[points.length - 1].x < to) points.push({ x: to, y: points[points.length - 1].y });
    return { name: s.name, points };
  });
  chartData = { from, to, servers };
  if (!leaderboardsOpen) return;
  if (charting) renderChart();
  else warmChart();
});

function warmChart() {
  if (chart || !chartData) return;
  clearTimeout(chartWarmTimer);
  chartWarmTimer = setTimeout(
    () => {
      if (leaderboardsOpen && !chart) renderChart();
    },
    Math.max(0, modalOpenedAt + CHART_WARM_MS - performance.now()),
  );
}

function dateLabel(ms, spanMs) {
  const d = new Date(ms);
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  if (spanMs > YEAR) return `${month} '${String(d.getUTCFullYear()).slice(-2)}`;
  return `${month} ${d.getUTCDate()}`;
}

function chartTicks(from, to) {
  const ticks = [];
  const months = (to - from) / (30 * DAY);
  if (months < 2) {
    const step = Math.max(1, Math.ceil((to - from) / DAY / 5)) * DAY;
    for (let t = Math.ceil(from / DAY) * DAY; t <= to; t += step) ticks.push(t);
    return ticks;
  }
  const step = months <= 6 ? 1 : months <= 14 ? 3 : months <= 48 ? 6 : 12;
  const d = new Date(from);
  let y = d.getUTCFullYear();
  let m = Math.ceil((d.getUTCMonth() + (d.getUTCDate() > 1 ? 1 : 0)) / step) * step;
  for (let t = Date.UTC(y, m, 1); t <= to; t = Date.UTC(y, (m += step), 1)) ticks.push(t);
  return ticks;
}

function compact(n) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return (k >= 10 || Number.isInteger(k) ? Math.round(k) : k.toFixed(1)) + "k";
}

function legendText(name) {
  const max = window.innerWidth < 480 ? 18 : 28;
  return name.length > max ? name.slice(0, max - 1).trimEnd() + "…" : name;
}

var legendTipTimer = null;

function showLegendTip(item, name) {
  legendTip.textContent = name;
  legendTip.hidden = false;
  const box = leaderboardsEl.getBoundingClientRect();
  const r = item.getBoundingClientRect();
  const half = legendTip.offsetWidth / 2;
  legendTip.style.left = Math.max(half, Math.min(box.width - half, r.left + r.width / 2 - box.left)) + "px";
  legendTip.style.top = r.top - box.top + "px";
}

function hideLegendTip() {
  clearTimeout(legendTipTimer);
  legendTip.hidden = true;
}

function setVisibility(c, visible) {
  const modes = c.data.datasets.map((_, i) => {
    if (c.isDatasetVisible(i) === visible[i]) return undefined;
    const mode = visible[i] ? "show" : "hide";
    const meta = c.getDatasetMeta(i);
    c.setDatasetVisibility(i, visible[i]);
    meta.controller._resolveAnimations(undefined, mode).update(meta, { visible: visible[i] });
    return mode;
  });
  syncZoom();
  c.update((ctx) => modes[ctx.datasetIndex]);
}

const htmlLegend = {
  id: "htmlLegend",
  afterUpdate(c) {
    hideLegendTip();
    const scrollTop = legendList.scrollTop;
    legendList.innerHTML = "";
    const n = c.data.datasets.length;
    c.data.datasets.forEach((ds, i) => {
      const short = legendText(ds.label);
      const item = el("span", "legend-item" + (c.isDatasetVisible(i) ? "" : " off"), short);
      const swatch = el("i", "swatch");
      swatch.style.borderColor = ds.borderColor;
      swatch.style.borderTopStyle = ["solid", "dashed", "dotted", "double"][
        Math.floor(i / SERIES.length) % DASHES.length
      ];
      item.prepend(swatch);
      item.addEventListener("click", (e) => {
        hideLegendTip();
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          const soloed = c.data.datasets.every((_, j) => c.isDatasetVisible(j) === (j === i));
          setVisibility(
            c,
            Array.from({ length: n }, (_, j) => soloed || j === i),
          );
        } else {
          setVisibility(
            c,
            Array.from({ length: n }, (_, j) => (j === i ? !c.isDatasetVisible(j) : c.isDatasetVisible(j))),
          );
        }
      });
      if (short !== ds.label) {
        item.addEventListener("pointerenter", () => {
          clearTimeout(legendTipTimer);
          legendTipTimer = setTimeout(() => showLegendTip(item, ds.label), LEGEND_TIP_DELAY_MS);
        });
        item.addEventListener("pointerleave", hideLegendTip);
      }
      legendList.append(item);
    });
    legendList.scrollTop = scrollTop;
  },
};

function renderChart() {
  if (!chartData || typeof Chart === "undefined") return;
  const { from, to, servers } = chartData;
  const ink = getComputedStyle(leaderboardsEl).color;
  const grid = "rgba(65, 42, 26, 0.18)";
  const datasets = servers.map((s, i) => ({
    label: s.name,
    data: s.points,
    borderColor: SERIES[i % SERIES.length],
    backgroundColor: SERIES[i % SERIES.length],
    borderWidth: 2,
    borderDash: DASHES[Math.floor(i / SERIES.length) % DASHES.length],
    pointRadius: 0,
    pointHitRadius: 12,
    pointHoverRadius: 4,
  }));
  if (chart) {
    const hidden = new Set(chart.data.datasets.filter((_, i) => !chart.isDatasetVisible(i)).map((d) => d.label));
    chart.data.datasets = datasets;
    datasets.forEach((d, i) => chart.setDatasetVisibility(i, !hidden.has(d.label)));
    syncZoom();
    chart.update("none");
    return;
  }
  const small = window.innerWidth < 480;
  Chart.defaults.font.family = '"Nanum Pen Script", cursive';
  Chart.defaults.font.size = small ? 15 : 17;
  Chart.defaults.color = ink;
  chart = new Chart(chartCanvas, {
    type: "line",
    data: { datasets },
    plugins: [zoomSelection, htmlLegend],
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: "easeOutQuart" },
      transitions: {
        show: { animations: { colors: { from: "transparent" }, visible: { type: "boolean", duration: 0 } } },
        hide: {
          animations: {
            colors: { to: "transparent" },
            visible: { type: "boolean", easing: "linear", fn: (v) => v | 0 },
          },
        },
      },
      parsing: false,
      normalized: true,
      interaction: { mode: "nearest", intersect: false },
      layout: { padding: { right: 8 } },
      scales: {
        x: {
          type: "linear",
          min: from,
          max: to,
          grid: { color: grid },
          border: { color: grid },
          afterBuildTicks: (axis) => {
            axis.ticks = chartTicks(axis.min, axis.max).map((value) => ({ value }));
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            callback(v) {
              return dateLabel(v, this.max - this.min);
            },
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(0, ...servers.map((s) => s.points[s.points.length - 1].y)),
          grid: { color: grid },
          border: { color: grid },
          ticks: { precision: 0, callback: (v) => compact(v) },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: showChartTip },
      },
    },
  });
  fitChart();
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitChart, RESIZE_SETTLE_MS);
  }).observe(chartBox);
}

function fitChart() {
  if (chart && chartBox.clientWidth) chart.resize(chartBox.clientWidth, chartBox.clientHeight);
}

function showChartTip({ chart: c, tooltip: t }) {
  const item = t.dataPoints && t.dataPoints[0];
  if (!t.opacity || !item) {
    chartTip.hidden = true;
    return;
  }
  const points = item.dataset.data;
  const n = item.parsed.y - (item.dataIndex > 0 ? points[item.dataIndex - 1].y : 0);
  chartTip.querySelector(".tip-title").textContent = item.dataset.label;
  chartTip.querySelector(".tip-date").textContent = dateLabel(item.parsed.x - 1, 0);
  chartTip.querySelector(".tip-count").textContent = `${n.toLocaleString()} ${n === 1 ? "bowl" : "bowls"}`;
  chartTip.hidden = false;
  const half = chartTip.offsetWidth / 2;
  const box = chartEl.getBoundingClientRect();
  const canvas = c.canvas.getBoundingClientRect();
  const x = Math.max(half, Math.min(box.width - half, canvas.left - box.left + t.caretX));
  chartTip.style.left = x + "px";
  chartTip.style.top = canvas.top - box.top + t.caretY + "px";
}

function valueAt(points, x) {
  let y = 0;
  for (const p of points) {
    if (p.x > x) break;
    y = p.y;
  }
  return y;
}

function rebase(points, min) {
  const base = valueAt(points, min);
  return points.map((p) => (p.x <= min ? { x: min, y: 0 } : { x: p.x, y: p.y - base }));
}

function syncZoom() {
  const { from, to } = chartData;
  if (zoom && (zoom.max - zoom.min >= to - from || zoom.min >= to)) zoom = null;
  const min = zoom ? Math.max(from, zoom.min) : from;
  const max = zoom ? Math.min(to, zoom.max) : to;
  chart.data.datasets.forEach((ds, i) => (ds.data = rebase(chartData.servers[i].points, min)));
  const visible = chart.data.datasets.filter((_, i) => chart.isDatasetVisible(i));
  chart.options.scales.x.min = min;
  chart.options.scales.x.max = max;
  chart.options.scales.y.suggestedMax = Math.max(0, ...visible.map((ds) => valueAt(ds.data, max)));
  zoomReset.hidden = !zoom;
}

function applyZoom(lo, hi) {
  if (!chart || !chartData) return;
  if (lo === null) {
    zoom = null;
  } else {
    const { from, to } = chartData;
    if (hi - lo < MIN_ZOOM) {
      const mid = (lo + hi) / 2;
      lo = mid - MIN_ZOOM / 2;
      hi = mid + MIN_ZOOM / 2;
    }
    lo = Math.max(from, Math.min(lo, to - MIN_ZOOM));
    hi = Math.min(to, Math.max(hi, lo + MIN_ZOOM));
    zoom = { min: lo, max: hi };
  }
  syncZoom();
  chart.update();
}

const zoomSelection = {
  id: "zoomSelection",
  afterDraw(c) {
    if (!zoomDrag || !zoomDrag.moved) return;
    const { top, bottom } = c.chartArea;
    const x0 = Math.min(zoomDrag.start, zoomDrag.current);
    const x1 = Math.max(zoomDrag.start, zoomDrag.current);
    const ctx = c.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(108, 48, 190, 0.15)";
    ctx.fillRect(x0, top, x1 - x0, bottom - top);
    ctx.strokeStyle = "rgba(108, 48, 190, 0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, top + 0.5, x1 - x0 - 1, bottom - top - 1);
    ctx.restore();
  },
};

function clampX(x) {
  const { left, right } = chart.chartArea;
  return Math.max(left, Math.min(right, x));
}

chartCanvas.addEventListener("pointerdown", (e) => {
  if (!chart || e.button !== 0) return;
  const { left, right, top, bottom } = chart.chartArea;
  if (e.offsetX < left || e.offsetX > right || e.offsetY < top || e.offsetY > bottom) return;
  zoomDrag = { start: e.offsetX, current: e.offsetX, moved: false };
  if (chartCanvas.hasPointerCapture) {
    try {
      chartCanvas.setPointerCapture(e.pointerId);
    } catch {}
  }
});
chartCanvas.addEventListener("pointermove", (e) => {
  if (!zoomDrag) return;
  zoomDrag.current = clampX(e.offsetX);
  if (Math.abs(zoomDrag.current - zoomDrag.start) > 6) zoomDrag.moved = true;
  chart.draw();
});
function endZoomDrag() {
  if (!zoomDrag) return;
  const { start, current, moved } = zoomDrag;
  zoomDrag = null;
  if (moved) {
    const x = chart.scales.x;
    applyZoom(x.getValueForPixel(Math.min(start, current)), x.getValueForPixel(Math.max(start, current)));
  } else {
    chart.draw();
  }
}
chartCanvas.addEventListener("pointerup", endZoomDrag);
chartCanvas.addEventListener("pointercancel", endZoomDrag);
chartCanvas.addEventListener("dblclick", () => applyZoom(null));
zoomReset.addEventListener("click", () => applyZoom(null));

function setCharting(on) {
  charting = on;
  const fromWidth = leaderboardsEl.clientWidth - 2 * parseFloat(getComputedStyle(leaderboardsEl).paddingLeft);
  leaderboardsEl.classList.toggle("charting", on);
  if (on) chartEl.style.setProperty("--from-scale", Math.min(1, fromWidth / chartEl.offsetWidth));
  chartButton.textContent = on ? "- view boards -" : "- view chart -";
  if (on) {
    clearTimeout(chartWarmTimer);
    fitChart();
    renderChart();
  } else {
    goTo(activeIndex, false);
    refreshMarquees();
  }
}

chartButton.addEventListener("click", () => {
  setCharting(!charting);
  if (charting) gaEvent("chart_open");
});

function ordinal(num) {
  if (num % 10 == 1 && num % 100 != 11) return num + "st";
  if (num % 10 == 2 && num % 100 != 12) return num + "nd";
  if (num % 10 == 3 && num % 100 != 13) return num + "rd";
  return num + "th";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderBoard(board, list) {
  board.innerHTML = "";
  if (!list.length) {
    board.append(el("p", "empty", "no bowls schmoked yet..."));
    return;
  }
  list.forEach((entry, j) => {
    const place = j + 1;
    const row = el("div", "row" + (place <= 3 ? ` top-${place}` : ""));
    const name = el("span", "name");
    name.append(el("span", "name-inner", entry.name));
    const count = typeof entry.bowls === "number" ? entry.bowls.toLocaleString() : entry.bowls;
    row.append(el("span", place <= 3 ? "rank medal" : "rank", ordinal(place)), name, el("span", "bowls", count));
    board.append(row);
  });
}

function refreshMarquees() {
  track.querySelectorAll(".name").forEach((cell) => {
    const inner = cell.firstElementChild;
    if (!inner) return;
    const overflow = inner.offsetWidth - cell.clientWidth;
    if (overflow > 2) {
      cell.classList.add("scrolls");
      cell.style.setProperty("--overflow", overflow + "px");
      inner.style.animationDuration = overflow / 25 + 4 + "s";
    } else {
      cell.classList.remove("scrolls");
      cell.style.removeProperty("--overflow");
      inner.style.animationDuration = "";
    }
  });
}

function setActiveTab(i) {
  tabs.forEach((tab, idx) => tab.classList.toggle("active", idx === i));
}

function positionIndicator(progress) {
  const last = tabs.length - 1;
  const i = Math.max(0, Math.min(last, Math.floor(progress)));
  const f = Math.max(0, Math.min(1, progress - i));
  const a = tabs[i];
  const b = tabs[Math.min(last, i + 1)];
  const left = a.offsetLeft + (b.offsetLeft - a.offsetLeft) * f;
  const width = a.offsetWidth + (b.offsetWidth - a.offsetWidth) * f;
  indicator.style.transform = `translateX(${left}px)`;
  indicator.style.width = width + "px";
}

function goTo(i, smooth) {
  i = Math.max(0, Math.min(RANGES.length - 1, i));
  activeIndex = i;
  setActiveTab(i);
  const width = track.clientWidth;
  if (!width) return;
  track.scrollTo({ left: i * width, behavior: smooth ? "smooth" : "auto" });
  if (!smooth) positionIndicator(i);
}

track.addEventListener("scroll", () => {
  const width = track.clientWidth;
  if (!width) return;
  const progress = track.scrollLeft / width;
  const i = Math.round(progress);
  if (i !== activeIndex) {
    activeIndex = i;
    setActiveTab(i);
  }
  positionIndicator(progress);
});

tabs.forEach((tab, i) => tab.addEventListener("click", () => goTo(i, true)));

var drag = null;
var snapTimer = null;
track.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse" || e.button !== 0) return;
  clearTimeout(snapTimer);
  drag = { x: e.clientX, scroll: track.scrollLeft, moved: false };
  track.classList.add("dragging");
});
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 6) return;
  drag.moved = true;
  track.scrollLeft = drag.scroll - dx;
  e.preventDefault();
});
function endDrag(e) {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const start = Math.round(drag.scroll / track.clientWidth);
  const moved = drag.moved;
  drag = null;
  let target = start;
  if (moved && Math.abs(dx) > 40) target = start - Math.sign(dx);
  goTo(target, moved);
  snapTimer = setTimeout(() => track.classList.remove("dragging"), moved ? 500 : 0);
}
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

window.addEventListener("resize", () => {
  if (!leaderboardsOpen || charting) return;
  goTo(activeIndex, false);
  refreshMarquees();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (leaderboardsOpen || disclaimerOpen)) closeModal();
  if (!leaderboardsOpen || charting) return;
  if (e.key === "ArrowLeft") goTo(activeIndex - 1, true);
  if (e.key === "ArrowRight") goTo(activeIndex + 1, true);
});

const MODAL_CONTENT_DELAY_MS = 550;
const MODAL_PANEL_FADE_MS = 200;
const MODAL_CLOSE_MS = 1800;
const disclaimerEl = document.querySelector("#disclaimer");
var modalTimer = null;
var resetTimer = null;
var modalClosing = false;

function resetLeaderboards() {
  clearTimeout(resetTimer);
  resetTimer = null;
  activeIndex = RANGES.indexOf(DEFAULT_RANGE);
  if (charting) setCharting(false);
  else goTo(activeIndex, false);
  zoom = null;
  if (chart) setVisibility(chart, chart.data.datasets.map(() => true));
}

function openModal(panel) {
  clearTimeout(modalTimer);
  modalOpenedAt = performance.now();
  modal.classList.remove("closing");
  modal.style.display = "flex";
  leaderboardsEl.style.display = panel === leaderboardsEl ? "flex" : "none";
  disclaimerEl.style.display = panel === disclaimerEl ? "flex" : "none";
  if (resetTimer) resetLeaderboards();
  document.body.classList.add("modal-open");
  document.body.style.overflowY = "hidden";
  modalClosing = false;
  panel.classList.remove("shown");
  if (window.smoke) window.smoke.open();
  modalTimer = setTimeout(() => panel.classList.add("shown"), MODAL_CONTENT_DELAY_MS);
}

function leaderboards(range) {
  disclaimerOpen = false;
  leaderboardsOpen = true;
  openModal(leaderboardsEl);

  leaderboardsEl.classList.toggle("down", !connectedToServer);
  if (!connectedToServer) return;

  socket.emit("chart");
  if (charting) {
    renderChart();
    return;
  }
  warmChart();
  const idx = RANGES.indexOf(range);
  goTo(idx === -1 ? activeIndex : idx, false);
  refreshMarquees();
}

function disclaimer() {
  leaderboardsOpen = false;
  disclaimerOpen = true;
  openModal(disclaimerEl);
  agreeBtn.classList.add("disabled");
  disclaimerText.scrollTop = 0;
  checkDisclaimerRead();
}

function checkDisclaimerRead() {
  if (disclaimerText.scrollTop + disclaimerText.clientHeight >= disclaimerText.scrollHeight - READ_SLACK_PX) {
    agreeBtn.classList.remove("disabled");
  }
}

disclaimerText.addEventListener("scroll", checkDisclaimerRead);
window.addEventListener("resize", () => {
  if (disclaimerOpen) checkDisclaimerRead();
});

document.querySelector("#btn-leaderboards").addEventListener("click", () => {
  if (!leaderboardsOpen) {
    leaderboards(DEFAULT_RANGE);
    gaEvent("leaderboards_open");
  } else {
    closeModal();
  }
});

document.querySelector("#toke-up-with-me").addEventListener("click", () => {
  if (!disclaimerOpen) {
    disclaimer();
    gaEvent("invite_start");
  } else {
    closeModal();
  }
});

agreeBtn.addEventListener("click", (e) => {
  if (agreeBtn.classList.contains("disabled")) {
    e.preventDefault();
    return;
  }
  gaEvent("invite_accept");
  closeModal();
});

document.querySelector("#feedback-link")?.addEventListener("click", () => {
  gaEvent("support_server_click");
});

const info = document.querySelector("#info");
info.addEventListener("click", (e) => {
  e.stopPropagation();
  info.classList.toggle("open");
});
document.addEventListener("pointerdown", (e) => {
  if (!info.contains(e.target)) info.classList.remove("open");
});

var closeButtons = document.querySelectorAll(".close");
for (let i = 0; i < closeButtons.length; i++) {
  closeButtons[i].addEventListener("click", closeModal);
}

function closeModal() {
  if (modalClosing) return;
  clearTimeout(modalTimer);
  clearTimeout(chartWarmTimer);
  modalClosing = true;
  leaderboardsOpen = false;
  disclaimerOpen = false;
  leaderboardsEl.classList.remove("shown");
  disclaimerEl.classList.remove("shown");
  document.body.classList.remove("modal-open");
  document.body.style.overflowY = "visible";
  modal.classList.add("closing");
  if (window.smoke) window.smoke.close();
  clearTimeout(resetTimer);
  resetTimer = setTimeout(resetLeaderboards, MODAL_PANEL_FADE_MS);
  modalTimer = setTimeout(() => {
    modal.style.display = "none";
    modal.classList.remove("closing");
    modalClosing = false;
    if (window.smoke) window.smoke.reset();
  }, MODAL_CLOSE_MS);
}

const BACKDROP_TAP_PX = 8;
var backdropPress = null;
modal.addEventListener("pointerdown", (e) => {
  backdropPress = e.target === modal ? { x: e.clientX, y: e.clientY } : null;
});
modal.addEventListener("click", (e) => {
  const press = backdropPress;
  backdropPress = null;
  if (e.target !== modal || !press) return;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < BACKDROP_TAP_PX) closeModal();
});

function updateBotStatus() {
  const onlineElements = document.querySelectorAll(".online");
  const offlineElements = document.querySelectorAll(".offline");

  if (is_online) {
    onlineElements.forEach((el) => (el.style.display = "block"));
    offlineElements.forEach((el) => (el.style.display = "none"));
  } else {
    onlineElements.forEach((el) => (el.style.display = "none"));
    offlineElements.forEach((el) => (el.style.display = "block"));
  }
}
