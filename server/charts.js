const db = require("./db");
const { ownerError } = require("./log");

const DAY = 24 * 3600000;
const EMPTY_SPAN = 7 * DAY;

// Every bowl is a point, but WIDTH px can't show 50k of them and quickchart caps the
// JSON it accepts, so MAX_POINTS bounds the payload however many bowls a server racks up.
const MAX_POINTS = 1000;
const GAP_PAIRS = 100;

const QUICKCHART = "https://quickchart.io/chart";
const RENDER_TIMEOUT_MS = 8000;
const WIDTH = 1200;
const HEIGHT = 450;

const BACKGROUND = "rgb(43, 45, 49)";
const LINE = "rgb(120, 200, 120)";
const FILL = "rgba(10, 104, 10, 0.55)";
const GRID = "rgba(255, 255, 255, 0.08)";
const TEXT = "rgba(255, 255, 255, 0.75)";

// An even stride alone smears dry spells into diagonals, so the longest gaps keep both
// of their endpoints too: that is what holds a flat stretch flat and a binge vertical.
function sampleIndices(times) {
  const n = times.length;
  const keep = new Set([0, n - 1]);

  const gaps = [];
  for (let i = 1; i < n; i++) gaps.push([times[i] - times[i - 1], i]);
  gaps.sort((a, b) => b[0] - a[0]);
  for (const [, i] of gaps.slice(0, GAP_PAIRS)) {
    keep.add(i - 1);
    keep.add(i);
  }

  const stride = (n - 1) / (MAX_POINTS - keep.size - 1);
  for (let k = 0; keep.size < MAX_POINTS; k++) {
    const i = Math.round(k * stride);
    if (i >= n - 1) break;
    keep.add(i);
  }

  return [...keep].sort((a, b) => a - b);
}

function cumulativeSeries(serverId, nowMs) {
  const times = db.serverBowlTimes(serverId);
  if (times.length === 0) return [{ x: nowMs - EMPTY_SPAN, y: 0 }, { x: nowMs, y: 0 }];

  const indices = times.length <= MAX_POINTS ? times.map((_, i) => i) : sampleIndices(times);
  const points = indices.map((i) => ({ x: times[i], y: i + 1 }));
  // Carry the line to now so the current dry spell (or lack of one) is visible.
  if (times[times.length - 1] < nowMs) points.push({ x: nowMs, y: times.length });
  return points;
}

function chartConfig(title, points) {
  return {
    type: "line",
    data: {
      datasets: [
        {
          data: points,
          borderColor: LINE,
          backgroundColor: FILL,
          borderWidth: 4,
          pointRadius: points.length > 31 ? 0 : 5,
          pointBackgroundColor: LINE,
          lineTension: 0,
        },
      ],
    },
    options: {
      layout: { padding: { left: 48, right: 48, top: 16, bottom: 16 } },
      legend: { display: false },
      title: { display: true, text: title, fontColor: TEXT, fontSize: 26 },
      scales: {
        xAxes: [
          {
            type: "time",
            // Real timestamps, so gaps between bowls take up their real width.
            distribution: "linear",
            time: { minUnit: "day" },
            gridLines: { color: GRID },
            ticks: { fontColor: TEXT, fontSize: 18, maxTicksLimit: 12, maxRotation: 0 },
          },
        ],
        yAxes: [
          { gridLines: { color: GRID }, ticks: { fontColor: TEXT, fontSize: 18, beginAtZero: true, precision: 0 } },
        ],
      },
    },
  };
}

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
    ownerError(`[charts] quickchart returned ${res.status}`);
  } catch (err) {
    ownerError("[charts] quickchart render failed:", err && err.message ? err.message : err);
  }
  return null;
}

function bowlsChartPng(serverId) {
  return renderPng(chartConfig("bowls schmoked", cumulativeSeries(serverId, Date.now())));
}

module.exports = { bowlsChartPng };
