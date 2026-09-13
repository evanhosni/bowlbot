const socket = io();
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
var activeIndex = RANGES.indexOf("week");
var leaderboardsOpen = false;
var disclaimerOpen = false;

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
    const row = el("div", "row" + (place <= 3 ? ` top top-${place}` : ""));
    const name = el("span", "name");
    name.append(el("span", "name-inner", entry.name));
    const count = typeof entry.bowls === "number" ? entry.bowls.toLocaleString() : entry.bowls;
    row.append(el("span", "rank", ordinal(place)), name, el("span", "bowls", count));
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

// progress is fractional (e.g. 2.4 = 40% of the way from "month" to "week")
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

// Mouse drag to slide between ranges (touch uses native scroll snapping).
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
  if (!leaderboardsOpen) return;
  goTo(activeIndex, false);
  refreshMarquees();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (leaderboardsOpen || disclaimerOpen)) closeModal();
  if (!leaderboardsOpen) return;
  if (e.key === "ArrowLeft") goTo(activeIndex - 1, true);
  if (e.key === "ArrowRight") goTo(activeIndex + 1, true);
});

function leaderboards(range) {
  disclaimerOpen = false;
  leaderboardsOpen = true;
  modal.style.display = "flex";
  document.querySelector("#disclaimer").style.display = "none";
  leaderboardsEl.style.display = "flex";
  document.querySelector("body").style.overflowY = "hidden";
  document.querySelector("main").style.visibility = "hidden";

  leaderboardsEl.classList.toggle("down", !connectedToServer);
  if (!connectedToServer) return;

  const idx = RANGES.indexOf(range);
  goTo(idx === -1 ? activeIndex : idx, false);
  refreshMarquees();
}

function disclaimer() {
  leaderboardsOpen = false;
  disclaimerOpen = true;
  modal.style.display = "flex";
  leaderboardsEl.style.display = "none";
  document.querySelector("#disclaimer").style.display = "flex";
  document.querySelector("body").style.overflowY = "hidden";
  document.querySelector("main").style.visibility = "hidden";
}

document.querySelector("#btn-leaderboards").addEventListener("click", () => {
  if (!leaderboardsOpen) {
    leaderboards("week");
    track("leaderboards_open");
  } else {
    closeModal();
  }
});

document.querySelector("#toke-up-with-me").addEventListener("click", () => {
  if (!disclaimerOpen) {
    disclaimer();
    track("invite_start");
  } else {
    closeModal();
  }
});

document.querySelector("#agree-btn").addEventListener("click", () => {
  // the actual conversion: user accepted the waiver and is off to discord's oauth page
  track("invite_accept");
  closeModal();
});

document.querySelector("#feedback-link")?.addEventListener("click", () => {
  track("support_server_click");
});

var closeButtons = document.querySelectorAll(".close");
for (let i = 0; i < closeButtons.length; i++) {
  closeButtons[i].addEventListener("click", closeModal);
}

function closeModal() {
  modal.style.display = "none";
  document.querySelector("body").style.overflowY = "visible";
  document.querySelector("main").style.visibility = "visible";
  leaderboardsOpen = false;
  disclaimerOpen = false;
}

// Only close when the press starts AND ends on the backdrop, so dragging a
// board and releasing outside the modal does not close it.
var pressedOnBackdrop = false;
modal.addEventListener("pointerdown", (e) => {
  pressedOnBackdrop = e.target === modal;
});
modal.addEventListener("click", (e) => {
  if (e.target === modal && pressedOnBackdrop) {
    closeModal();
  }
  pressedOnBackdrop = false;
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
