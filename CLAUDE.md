# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**1PXL Soccer Game Tracker** — a phone-first web app for beer-league soccer, tracking goals, yellow cards, and red cards across two periods. The event log is exported (Premiere-compatible CSV markers + JSON) so footage of the game can be cut against it.

Repo: https://github.com/Shadymaster08/1pxl-soccer-game-tracker (private)

## Stack & running it

No build step. Three files: `index.html`, `styles.css`, `app.js`. Open `index.html` directly in a browser, or serve the folder statically (`python3 -m http.server`, etc.). No dependencies, no tests, no linter.

## Architecture

Single global `state` object in `app.js` holds teams, current `period` (1, 2, or 3=Full Time), an `events` array, and clock bookkeeping (`periodStartedAt`, `periodElapsedMs`, `running`). Every user action calls `logEvent(...)` which appends to `state.events`, persists the whole state to `localStorage` under `beer-league-scorekeeper:v1`, and triggers a full re-render.

The match clock is derived, not stored ticking: `currentMatchClockMs()` = `periodElapsedMs + (running ? now - periodStartedAt : 0)`. This means background tabs don't freeze the clock and reloads can reconstruct elapsed time from the stored `periodStartedAt` timestamp.

Every event carries **both** a match-clock offset (`matchClockMs`, relative to the current period) and an ISO `wallClock`. CSV export uses wall-clock deltas from the first event to emit Premiere-compatible timecodes so markers line up with camera footage regardless of when recording started.

## Editing user mistakes

- Tap either team name in the scoreboard to rename mid-match (uses `prompt()`).
- Tap any goal/card row in the event feed (marked with ✎) to open the edit modal — change team, type, period, or match-clock, or delete the event.
- System events (period start/pause/end) are not editable; **Undo last** skips them and removes the most recent goal/card.
- The edit modal uses the `hidden` attribute; CSS has an explicit `.modal[hidden] { display: none }` rule because `.modal { display: flex }` would otherwise override the browser default.

## Verification

Manual only — open in Chrome DevTools mobile emulation, exercise the flow described in `/Users/chady/.claude/plans/concurrent-dazzling-marble.md` under "Verification".
