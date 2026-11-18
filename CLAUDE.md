# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**1PXL Soccer Game Tracker** — a phone-first web app for beer-league soccer, tracking goals, yellow cards, and red cards across two periods. The event log is exported (Premiere-compatible CSV markers + JSON) so footage of the game can be cut against it.

Repo: https://github.com/Shadymaster08/1pxl-soccer-game-tracker (private)

## Stack & running it

No build step. Four files: `index.html`, `styles.css`, `app.js`, `league.js` (setup-screen list of Division 1 games read from kingsleague.ca; the picked game is exported as `league` in the JSON). Open `index.html` directly in a browser, or serve the folder statically (`python3 -m http.server`, etc.). No dependencies, no tests, no linter.

## Architecture

Single global `state` object in `app.js` holds teams, current `period` (1, 2, or 3=Full Time), an `events` array, and clock bookkeeping (`periodStartedAt`, `periodElapsedMs`, `running`). Every user action calls `logEvent(...)` which appends to `state.events`, persists the whole state to `localStorage` under `beer-league-scorekeeper:v1`, and triggers a full re-render.

The match clock is derived, not stored ticking: `currentMatchClockMs()` = `periodElapsedMs + (running ? now - periodStartedAt : 0)`. This means background tabs don't freeze the clock and reloads can reconstruct elapsed time from the stored `periodStartedAt` timestamp.

Every event carries **both** a match-clock offset (`matchClockMs`, relative to the current period) and an ISO `wallClock`. CSV export uses wall-clock deltas from the first event to emit Premiere-compatible timecodes so markers line up with camera footage regardless of when recording started.

## Publish to Drive

`publishToDrive()` POSTs `{key, game: buildExport()}` (as text/plain, so no CORS preflight) to `PUBLISH_URL`, a Google Apps Script web app made from `drive-publish/Code.gs` and deployed in the info@1pxlstudio.com account ("Execute as me", "Anyone"). The script saves the game as `TKL 27/Week <n>/Scores/<yyyy-MM-dd HHmm> HOME vs AWAY.json` (week from the date; same kick-off minute = same file, replaced). The app publishes by itself at full time, retries every 30 s / when back online until Drive confirms, and shows "changed since published" after edits. `PUBLISH_KEY` must match `KEY` in Code.gs; it is visible in the page source, so the script only accepts well-formed game files and never deletes anything. The TKL Highlights tool reads every .json inside the week folders, so nothing else is needed on its side.

## Editing user mistakes

- Tap either team name in the scoreboard to rename mid-match (uses `prompt()`).
- Tap any goal/card row in the event feed (marked with ✎) to open the edit modal — change team, type, period, or match-clock, or delete the event.
- System events (period start/pause/end) are not editable; **Undo last** skips them and removes the most recent goal/card.
- The edit modal uses the `hidden` attribute; CSS has an explicit `.modal[hidden] { display: none }` rule because `.modal { display: flex }` would otherwise override the browser default.

## Verification

Manual only — open in Chrome DevTools mobile emulation, exercise the flow described in `/Users/chady/.claude/plans/concurrent-dazzling-marble.md` under "Verification".
