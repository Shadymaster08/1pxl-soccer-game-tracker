/**
 * "Publish to Drive" for the 1PXL Soccer Game Tracker.
 *
 * Runs in the info@1pxlstudio.com Google account as a web app, so the scorekeeper never signs in.
 * The tracker sends the game; this saves it as
 *     TKL 27/Week <n>/Scores/<yyyy-MM-dd HHmm> <HOME> vs <AWAY>.json
 * The week is worked out from the date of the game. Publishing the same game again (same kick-off tap)
 * replaces its file, so there is always one file per game. Nothing else on Drive is touched.
 *
 * Setup (once): script.google.com > New project > paste this file > Deploy > New deployment >
 * type "Web app", Execute as "Me", Who has access "Anyone" > Deploy > copy the web app URL into
 * PUBLISH_URL at the top of app.js.
 */

const ROOT_FOLDER_ID = "1yDTXrLAocHrdCxZqIHYOST0N7F9qGu7c";   // My Drive/TKL 27
const WEEK_1 = "2026-10-27";                                  // the Tuesday of week 1 of the season
const TIMEZONE = "America/Montreal";
const KEY = "fJ4NFZqYEZK28uO_XsQTz-s";                        // same as PUBLISH_KEY in app.js
const MAX_BYTES = 300000;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.key !== KEY) return reply({ ok: false, error: "wrong key" });
    const game = body.game;
    check(game);
    const started = new Date(game.matchStartedWallClock || game.events[0].wallClock);
    const week = weekOf(started);
    const name = Utilities.formatDate(started, TIMEZONE, "yyyy-MM-dd HHmm") + " " +
      clean(game.teams.home) + " vs " + clean(game.teams.away) + ".json";
    const where = "TKL 27/Week " + week + "/Scores/" + name;
    if (body.dryRun) return reply({ ok: true, dryRun: true, path: where });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const scores = child(child(DriveApp.getFolderById(ROOT_FOLDER_ID), "Week " + week), "Scores");
      const content = JSON.stringify(Object.assign({}, game, { publishedAt: new Date().toISOString() }), null, 2);
      if (content.length > MAX_BYTES) throw new Error("game file too large");
      // same game = same kick-off minute: replace it, even when a team was renamed since
      const prefix = name.slice(0, 16);
      const files = scores.getFiles();
      let file = null;
      while (files.hasNext()) {
        const f = files.next();
        if (f.getName().slice(0, 16) === prefix && f.getName().endsWith(".json")) {
          if (!file) file = f;
        }
      }
      if (file) {
        file.setContent(content);
        if (file.getName() !== name) file.setName(name);
      } else {
        scores.createFile(name, content, "application/json");
      }
    } finally {
      lock.releaseLock();
    }
    return reply({ ok: true, path: where, week: week });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return reply({ ok: true, service: "1PXL tracker publish" });
}

function check(game) {
  if (!game || !Array.isArray(game.events) || !game.events.length) throw new Error("no events in the game");
  if (game.events.length > 500) throw new Error("too many events");
  if (!game.teams || typeof game.teams.home !== "string" || typeof game.teams.away !== "string") throw new Error("no team names");
  for (const ev of game.events) {
    if (typeof ev.type !== "string" || isNaN(new Date(ev.wallClock))) throw new Error("bad event");
  }
}

function weekOf(date) {
  const day = Utilities.formatDate(date, TIMEZONE, "yyyy-MM-dd");
  const days = Math.round((new Date(day + "T12:00:00Z") - new Date(WEEK_1 + "T12:00:00Z")) / 86400000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

function child(parent, name) {
  const wanted = name.toLowerCase().replace(/\s+/g, "");
  const folders = parent.getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    if (f.getName().toLowerCase().replace(/\s+/g, "") === wanted) return f;
  }
  return parent.createFolder(name);
}

function clean(name) {
  return String(name || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "TEAM";
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
