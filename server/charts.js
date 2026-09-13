// Chart images for Discord. Discord only shows pictures, so the chart is a
// Chart.js config rendered to PNG by quickchart.io and attached to the message.

const db = require("./db");

const HOUR = 3600000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;
const MIN_WINDOWS = 7; // never fewer than 7 points
const RELATIVE_LABELS_UPTO = 14; // "3d ago" style labels for short charts, dates beyond that

const QUICKCHART = "https://quickchart.io/chart";
const RENDER_TIMEOUT_MS = 8000; // the reply is deferred while this runs
// Wide aspect: Discord scales attachments to a fixed max width, so wider means
// more chart per pixel of height. Fonts are sized for the scaled-down result.
const WIDTH = 1200;
const HEIGHT = 450;

// Discord embed gray behind it; only the line and its fill are green.
const BACKGROUND = "rgb(43, 45, 49)";
const LINE = "rgb(120, 200, 120)";
const FILL = "rgba(10, 104, 10, 0.55)";
const GRID = "rgba(255, 255, 255, 0.08)";
const TEXT = "rgba(255, 255, 255, 0.75)";

const fmt = (ms, opts) => new Date(ms).toLocaleString("en-US", { ...opts, timeZone: "UTC" });
const dayLabel = (ms) => fmt(ms, { month: "short", day: "numeric" });
const monthLabel = (ms) => `${fmt(ms, { month: "short" })} '${String(new Date(ms).getUTCFullYear()).slice(-2)}`; // "Sep '26", never "Sep 26"
const yearLabel = (ms) => fmt(ms, { year: "numeric" });

// Smallest unit whose span limit covers the chart range. Fixed-size units
// (day/week) are rolling windows counted back from now, so no viewer's midnight
// is involved; calendar units step by UTC month/year, where hours don't show.
const UNITS = [
  { name: "day", plural: "days", short: "d", now: "today", prev: "yesterday", maxSpan: 60 * DAY, window: DAY },
  { name: "week", plural: "weeks", short: "w", now: "this week", prev: "last week", maxSpan: 2 * YEAR, window: WEEK },
  { name: "month", maxSpan: 6 * YEAR, format: "%Y-%m", label: monthLabel },
  { name: "year", maxSpan: Infinity, format: "%Y", label: yearLabel },
];

function unitFor(spanMs) {
  return UNITS.find((u) => spanMs <= u.maxSpan);
}

// `count` windows of unit.window ending at `nowMs`, oldest first.
function windowSeries(serverId, unit, count, nowMs) {
  const counts = db.countServerBowlsByWindow(serverId, unit.window, count, nowMs);
  const relative = count <= RELATIVE_LABELS_UPTO;
  // Past a year, bare dates like "Sep 13" would repeat; show month + year instead.
  const dateLabel = count * unit.window > YEAR ? monthLabel : dayLabel;
  const labels = [];
  const data = [];
  for (let ago = count - 1; ago >= 0; ago--) {
    if (!relative) labels.push(dateLabel(nowMs - ago * unit.window));
    else labels.push(ago === 0 ? unit.now : ago === 1 ? unit.prev : `${ago}${unit.short} ago`);
    data.push(counts.get(ago) || 0);
  }
  return { labels, data };
}

// Calendar month or year steps from `fromMs` through `toMs`, UTC.
function periodSeries(serverId, unit, fromMs, toMs) {
  const counts = db.countServerBowlsByPeriod(serverId, unit.format);
  const monthly = unit.name === "month";
  const key = (d) =>
    monthly ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` : String(d.getUTCFullYear());
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), monthly ? from.getUTCMonth() : 0, 1));
  const labels = [];
  const data = [];
  while (cursor <= to) {
    labels.push(unit.label(cursor.getTime()));
    data.push(counts.get(key(cursor)) || 0);
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
  }
  return { labels, data };
}

function chartConfig(title, { labels, data }) {
  return {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: LINE,
          backgroundColor: FILL,
          borderWidth: 4,
          pointRadius: labels.length > 31 ? 0 : 5,
          pointBackgroundColor: LINE,
          lineTension: 0.3,
        },
      ],
    },
    options: {
      layout: { padding: { left: 48, right: 48, top: 16, bottom: 16 } },
      legend: { display: false },
      title: { display: true, text: title, fontColor: TEXT, fontSize: 26 },
      scales: {
        xAxes: [
          { gridLines: { color: GRID }, ticks: { fontColor: TEXT, fontSize: 18, maxTicksLimit: 12, maxRotation: 0 } },
        ],
        yAxes: [
          { gridLines: { color: GRID }, ticks: { fontColor: TEXT, fontSize: 18, beginAtZero: true, precision: 0 } },
        ],
      },
    },
  };
}

// PNG bytes from quickchart, or null if it fails or is slow. Callers send
// the text without a chart in that case rather than failing the command.
async function renderPng(config) {
  const body = { width: WIDTH, height: HEIGHT, backgroundColor: BACKGROUND, chart: config };
  try {
    const res = await fetch(QUICKCHART, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    console.error(`[charts] quickchart returned ${res.status}`);
  } catch (err) {
    console.error("[charts] quickchart render failed:", err && err.message ? err.message : err);
  }
  return null;
}

// PNG of bowls over time from the server's first bowl to now, never fewer than
// seven points, aggregated by whichever unit fits the span. Null on failure.
function bowlsChartPng(serverId) {
  const now = Date.now();
  const firstBowl = db.firstBowlAt(serverId);
  const fromMs = firstBowl === null ? now : firstBowl;
  const unit = unitFor(Math.max(now - fromMs, MIN_WINDOWS * DAY));
  let series;
  let title;
  if (unit.window) {
    const count = Math.max(MIN_WINDOWS, Math.ceil((now - fromMs) / unit.window));
    series = windowSeries(serverId, unit, count, now);
    title = `bowls per ${unit.name}, last ${count} ${unit.plural}`;
  } else {
    series = periodSeries(serverId, unit, fromMs, now);
    title = `bowls per ${unit.name} since ${unit.label(fromMs)}`;
  }
  if (firstBowl === null) title = "no bowls yet";
  return renderPng(chartConfig(title, series));
}

module.exports = { bowlsChartPng };
