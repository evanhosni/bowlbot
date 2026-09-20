const db = require("./db");
const { describeGuild, ownerWarn } = require("./log");

const HOUR = 3600000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;
const MIN_WINDOWS = 7;
const RELATIVE_LABELS_UPTO = 14;

const QUICKCHART = "https://quickchart.io/chart";
const RENDER_TIMEOUT_MS = 8000;
const WIDTH = 1200;
const HEIGHT = 450;

const BACKGROUND = "rgb(43, 45, 49)";
const LINE = "rgb(120, 200, 120)";
const FILL = "rgba(10, 104, 10, 0.55)";
const GRID = "rgba(255, 255, 255, 0.08)";
const TEXT = "rgba(255, 255, 255, 0.75)";

const fmt = (ms, opts) => new Date(ms).toLocaleString("en-US", { ...opts, timeZone: "UTC" });
const dayLabel = (ms) => fmt(ms, { month: "short", day: "numeric" });
const monthLabel = (ms) => `${fmt(ms, { month: "short" })} '${String(new Date(ms).getUTCFullYear()).slice(-2)}`;
const yearLabel = (ms) => fmt(ms, { year: "numeric" });

const UNITS = [
  { name: "day", short: "d", now: "today", prev: "yesterday", maxSpan: 60 * DAY, window: DAY },
  { name: "week", short: "w", now: "this week", prev: "last week", maxSpan: 2 * YEAR, window: WEEK },
  { name: "month", maxSpan: 6 * YEAR, format: "%Y-%m", label: monthLabel },
  { name: "year", maxSpan: Infinity, format: "%Y", label: yearLabel },
];

function unitFor(spanMs) {
  return UNITS.find((u) => spanMs <= u.maxSpan);
}

function windowSeries(serverId, unit, count, nowMs) {
  const counts = db.countServerBowlsByWindow(serverId, unit.window, count, nowMs);
  const relative = count <= RELATIVE_LABELS_UPTO;
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

async function renderPng(config, guild) {
  const body = { width: WIDTH, height: HEIGHT, backgroundColor: BACKGROUND, chart: config };
  try {
    const res = await fetch(QUICKCHART, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const why = res.status === 429 ? "rate limited by quickchart" : `quickchart returned ${res.status}`;
    ownerWarn(`[chart] ${describeGuild(guild)}: ${why}, stats sent without the chart`);
  } catch (err) {
    const why = err && err.message ? err.message : err;
    ownerWarn(`[chart] ${describeGuild(guild)}: ${why}, stats sent without the chart`);
  }
  return null;
}

function bowlsChartPng(serverId, guild) {
  const now = Date.now();
  const firstBowl = db.firstBowlAt(serverId);
  const fromMs = firstBowl === null ? now : firstBowl;
  const unit = unitFor(Math.max(now - fromMs, MIN_WINDOWS * DAY));
  let series;
  if (unit.window) {
    const count = Math.max(MIN_WINDOWS, Math.ceil((now - fromMs) / unit.window));
    series = windowSeries(serverId, unit, count, now);
  } else {
    series = periodSeries(serverId, unit, fromMs, now);
  }
  return renderPng(chartConfig("bowls schmoked", series), guild);
}

module.exports = { bowlsChartPng };
