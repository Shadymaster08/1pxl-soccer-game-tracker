"use strict";

const STORAGE_KEY = "beer-league-scorekeeper:v1";
// "Publish to Drive": the web app made from drive-publish/Code.gs in the info@1pxlstudio.com account.
const PUBLISH_URL = "https://script.google.com/macros/s/AKfycbyiFEbC7WlGKOqesnbWQRf1BunBVCYaH3dstejhmJa9O84kzK1FKByaSlfZacaKUFY78A/exec";
const PUBLISH_KEY = "fJ4NFZqYEZK28uO_XsQTz-s";
const PERIOD_LABELS = { 1: "1st", 2: "2nd", 3: "Full Time" };

const $ = (id) => document.getElementById(id);

const state = {
  home: "Home",
  away: "Away",
  period: 1,
  periodStartedAt: null,
  periodElapsedMs: 0,
  running: false,
  events: [],
  matchStartedWallClock: null,
  league: null,
};

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function restoreFrom(snapshot) {
  Object.assign(state, snapshot);
  state.running = false;
  if (state.periodStartedAt) {
    state.periodElapsedMs += Date.now() - state.periodStartedAt;
    state.periodStartedAt = null;
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function currentMatchClockMs() {
  let ms = state.periodElapsedMs;
  if (state.running && state.periodStartedAt) {
    ms += Date.now() - state.periodStartedAt;
  }
  return ms;
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function formatTimeOfDay(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function computeScore() {
  let h = 0, a = 0;
  for (const e of state.events) {
    if (e.type === "goal" && e.team === "home") h++;
    else if (e.type === "goal" && e.team === "away") a++;
  }
  return { home: h, away: a };
}

// ---------- Rendering ----------

function renderScoreboard() {
  $("home-name").textContent = state.home;
  $("away-name").textContent = state.away;
  const { home, away } = computeScore();
  $("home-score").textContent = home;
  $("away-score").textContent = away;
  $("period-label").textContent = PERIOD_LABELS[state.period] || "—";
}

function renderClock() {
  const el = $("clock");
  el.textContent = formatClock(currentMatchClockMs());
  el.classList.toggle("running", state.running);
}

function renderControls() {
  $("startpause-btn").textContent = state.running ? "Pause" : "Start";
  const inProgress = state.period <= 2;
  $("startpause-btn").disabled = !inProgress;
  $("endperiod-btn").disabled = !inProgress;
  for (const b of document.querySelectorAll(".evt")) {
    b.disabled = !inProgress;
  }
}

function renderFeed() {
  const feed = $("event-feed");
  feed.innerHTML = "";
  // every event, newest first, so a screenshot of the list can stand in for a lost export
  feed.classList.toggle("full", state.period > 2);
  const latest = state.events.slice().reverse();
  for (const e of latest) {
    const li = document.createElement("li");
    const isSystem = e.team === null;
    const isEditable = !isSystem;
    li.className = (isSystem ? "system" : e.team) + (isEditable ? " editable" : "");
    if (isEditable) {
      li.addEventListener("click", () => openEditModal(e.id));
    }
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = formatClock(e.matchClockMs);
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = isSystem ? `P${e.period}` : e.team.toUpperCase();
    const desc = document.createElement("span");
    desc.textContent = describe(e) + (isEditable ? "  ✎" : "");
    const wall = document.createElement("span");
    wall.className = "wall";
    wall.textContent = formatTimeOfDay(e.wallClock);
    li.append(t, tag, desc, wall);
    feed.appendChild(li);
  }
}

function describe(e) {
  switch (e.type) {
    case "goal": return "Goal";
    case "yellow": return "Yellow card";
    case "red": return "Red card";
    case "period_start": return `${PERIOD_LABELS[e.period]} started`;
    case "period_pause": return `${PERIOD_LABELS[e.period]} paused`;
    case "period_end": return `${PERIOD_LABELS[e.period]} ended`;
    default: return e.type;
  }
}

function renderAll() {
  renderScoreboard();
  renderClock();
  renderControls();
  renderFeed();
  renderPublish();
}

// ---------- Event actions ----------

function logEvent(type, team) {
  state.events.push({
    id: uid(),
    type,
    team: team || null,
    period: state.period,
    matchClockMs: currentMatchClockMs(),
    wallClock: new Date().toISOString(),
  });
  if (!state.matchStartedWallClock) {
    state.matchStartedWallClock = state.events[0].wallClock;
  }
  save();
  renderAll();
}

function startOrPause() {
  if (state.period > 2) return;
  if (!state.running) {
    state.running = true;
    state.periodStartedAt = Date.now();
    logEvent("period_start", null);
  } else {
    state.periodElapsedMs += Date.now() - state.periodStartedAt;
    state.periodStartedAt = null;
    state.running = false;
    logEvent("period_pause", null);
  }
}

function endPeriod() {
  if (state.period > 2) return;
  if (state.running) {
    state.periodElapsedMs += Date.now() - state.periodStartedAt;
    state.periodStartedAt = null;
    state.running = false;
  }
  logEvent("period_end", null);
  state.period = state.period === 1 ? 2 : 3;
  state.periodElapsedMs = 0;
  save();
  renderAll();
  if (state.period === 3) publishToDrive();          // full time: the scores go to Drive by themselves
}

function undoLast() {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const e = state.events[i];
    if (e.type === "goal" || e.type === "yellow" || e.type === "red") {
      state.events.splice(i, 1);
      save();
      renderAll();
      return;
    }
  }
}

function renameTeam(which) {
  const current = which === "home" ? state.home : state.away;
  const next = prompt(`${which === "home" ? "Home" : "Away"} team name:`, current);
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) return;
  state[which] = trimmed.slice(0, 24);
  save();
  renderAll();
}

// ---------- Edit modal ----------

let editingEventId = null;

function parseClock(text) {
  const m = /^\s*(\d{1,2}):?(\d{2})\s*$/.exec(text);
  if (!m) return null;
  const mins = parseInt(m[1], 10);
  const secs = parseInt(m[2], 10);
  if (secs >= 60) return null;
  return (mins * 60 + secs) * 1000;
}

function openEditModal(eventId) {
  const e = state.events.find((x) => x.id === eventId);
  if (!e || !e.team) return;
  editingEventId = eventId;
  $("edit-team").value = e.team;
  $("edit-type").value = e.type;
  $("edit-period").value = String(e.period);
  $("edit-clock").value = formatClock(e.matchClockMs);
  $("edit-modal").hidden = false;
}

function closeEditModal() {
  editingEventId = null;
  $("edit-modal").hidden = true;
}

function saveEdit() {
  if (!editingEventId) return;
  const e = state.events.find((x) => x.id === editingEventId);
  if (!e) { closeEditModal(); return; }
  const clockMs = parseClock($("edit-clock").value);
  if (clockMs === null) {
    alert("Clock must be mm:ss (e.g. 12:34).");
    return;
  }
  e.team = $("edit-team").value;
  e.type = $("edit-type").value;
  e.period = parseInt($("edit-period").value, 10);
  e.matchClockMs = clockMs;
  save();
  renderAll();
  closeEditModal();
}

function deleteEdit() {
  if (!editingEventId) return;
  const idx = state.events.findIndex((x) => x.id === editingEventId);
  if (idx >= 0) {
    state.events.splice(idx, 1);
    save();
    renderAll();
  }
  closeEditModal();
}

function resetMatch() {
  const unsent = PUBLISH_URL && state.events.length && publishState() !== "done";
  if (!confirm(unsent ? "This game is NOT on Drive yet. Reset anyway? All events will be lost."
                      : "Reset this match? All events will be lost.")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

// ---------- Exports ----------

function download(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeSlug(s) {
  return (s || "match").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "match";
}

function buildExport() {
  const score = computeScore();
  return {
    version: 1,
    teams: { home: state.home, away: state.away },
    league: state.league || null,
    finalScore: score,
    matchStartedWallClock: state.matchStartedWallClock,
    exportedAt: new Date().toISOString(),
    events: state.events,
  };
}

function exportJSON() {
  const fname = `${safeSlug(state.home)}-vs-${safeSlug(state.away)}.json`;
  download(fname, "application/json", JSON.stringify(buildExport(), null, 2));
}

// ---------- Publish to Drive ----------
// The game goes to TKL 27/Week <n>/Scores on Google Drive. Until Drive has confirmed it, the game stays
// "not published": the app tries again every 30 s and as soon as the phone is back online.

let publishing = false;
let publishTimer = null;

function changeStamp() {
  return JSON.stringify([state.home, state.away, state.events]);
}

function publishState() {
  if (!state.events.length) return "nothing";
  if (publishing) return "sending";
  if (state.published && state.published.stamp === changeStamp()) return "done";
  return state.published ? "changed" : "waiting";
}

function renderPublish() {
  const btn = $("publish-btn"), note = $("publish-note");
  if (!btn) return;
  const st = publishState();
  btn.disabled = st === "nothing" || st === "sending" || !PUBLISH_URL;
  btn.textContent = st === "sending" ? "Publishing…" : st === "done" ? "Published to Drive ✓" : "Publish to Drive";
  btn.classList.toggle("done", st === "done");
  let text = "";
  if (!PUBLISH_URL) text = "Publishing is not set up in this version of the app: use Export JSON.";
  else if (st === "done") text = `Saved on Drive at ${formatTimeOfDay(state.published.at)}: ${state.published.path}`;
  else if (st === "changed") text = "Changed since it was published: press Publish to Drive again.";
  else if (state.publishError) text = `Not on Drive yet (${state.publishError}). Trying again automatically…`;
  note.textContent = text;
  note.className = st === "done" ? "ok" : state.publishError || st === "changed" ? "warn" : "";
}

async function publishToDrive() {
  if (!PUBLISH_URL || publishing || !state.events.length) return;
  const stamp = changeStamp();
  publishing = true;
  renderPublish();
  try {
    // text/plain keeps it a "simple" request, which Google's web apps accept from any page
    const r = await fetch(PUBLISH_URL, {
      method: "POST",
      body: JSON.stringify({ key: PUBLISH_KEY, game: buildExport() }),
    });
    const answer = await r.json();
    if (!answer.ok) throw new Error(answer.error || "Drive refused it");
    state.published = { stamp, at: new Date().toISOString(), path: answer.path };
    state.publishError = null;
  } catch (e) {
    state.publishError = navigator.onLine === false ? "no internet" : (e && e.message) || "could not reach Drive";
  } finally {
    publishing = false;
    save();
    renderPublish();
    schedulePublishRetry();
  }
}

function schedulePublishRetry() {
  clearTimeout(publishTimer);
  if (state.publishError && publishState() !== "done") {
    publishTimer = setTimeout(publishToDrive, 30000);
  }
}

function formatTimecode(totalSeconds, fps = 30) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)};${pad(m)};${pad(sec)};${pad(0)}`;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCSV() {
  if (!state.events.length) {
    alert("No events to export yet.");
    return;
  }
  const anchor = state.matchStartedWallClock ? new Date(state.matchStartedWallClock).getTime() : Date.now();

  const rows = [];
  rows.push(["Marker Name", "Description", "In", "Out", "Duration", "Marker Type"]);

  for (const e of state.events) {
    const wall = new Date(e.wallClock).getTime();
    const relSec = (wall - anchor) / 1000;
    const tc = formatTimecode(relSec);
    const name = e.team
      ? `${e.team === "home" ? state.home : state.away} — ${describe(e)}`
      : describe(e);
    const description = [
      `period=${e.period}`,
      `matchClock=${formatClock(e.matchClockMs)}`,
      `wall=${e.wallClock}`,
      `rel=${relSec.toFixed(2)}s`,
    ].join(" | ");
    const markerType = e.type === "goal" ? "Comment"
      : e.type === "yellow" ? "Comment"
      : e.type === "red" ? "Comment"
      : "Chapter";
    rows.push([name, description, tc, tc, "00;00;00;01", markerType]);
  }

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const fname = `${safeSlug(state.home)}-vs-${safeSlug(state.away)}-premiere-markers.csv`;
  download(fname, "text/csv", csv);
}

// ---------- Wire-up ----------

function showTracker() {
  $("setup-screen").hidden = true;
  $("tracker-screen").hidden = false;
  renderAll();
}

function initFromSavedIfAny() {
  const snap = load();
  if (snap && snap.events && snap.events.length) {
    $("resume-btn").hidden = false;
    $("resume-btn").onclick = () => {
      restoreFrom(snap);
      showTracker();
    };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initFromSavedIfAny();

  $("start-match-btn").onclick = () => {
    const home = $("home-input").value.trim() || "Home";
    const away = $("away-input").value.trim() || "Away";
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, {
      home, away,
      period: 1,
      periodStartedAt: null,
      periodElapsedMs: 0,
      running: false,
      events: [],
      matchStartedWallClock: null,
      league: leagueSelection(home, away),
      published: null,
      publishError: null,
    });
    save();
    showTracker();
  };

  $("startpause-btn").onclick = startOrPause;
  $("endperiod-btn").onclick = endPeriod;
  $("undo-btn").onclick = undoLast;
  $("reset-btn").onclick = resetMatch;
  $("export-csv-btn").onclick = exportCSV;
  $("export-json-btn").onclick = exportJSON;
  $("publish-btn").onclick = publishToDrive;
  window.addEventListener("online", () => { if (state.publishError) publishToDrive(); });
  schedulePublishRetry();

  for (const btn of document.querySelectorAll(".evt")) {
    btn.addEventListener("click", () => {
      logEvent(btn.dataset.type, btn.dataset.team);
    });
  }

  $("home-name").addEventListener("click", () => renameTeam("home"));
  $("away-name").addEventListener("click", () => renameTeam("away"));

  $("edit-cancel").onclick = closeEditModal;
  $("edit-save").onclick = saveEdit;
  $("edit-delete").onclick = deleteEdit;
  $("edit-modal").addEventListener("click", (ev) => {
    if (ev.target.id === "edit-modal") closeEditModal();
  });

  setInterval(renderClock, 250);
});
