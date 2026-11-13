"use strict";

// The games of every "Division 1" on kingsleague.ca, offered on the setup screen so nobody has to
// type team names. The divisions and their games are read from the website each time the page opens,
// so a new season shows up by itself. The last list read is kept for nights with no signal.

const LEAGUE_API = "https://kingsleague.ca/api/api";
const LEAGUE_CACHE = "beer-league-scorekeeper:league-games:v1";
const LEAGUE_TZ = "America/Toronto";
const LEAGUE_DIVISION = /^division\s*1$/i;

const league = { games: [], fetchedAt: null, selected: null, day: null };

const leagueEl = (id) => document.getElementById(id);

function leagueDivisions(node, inDivisions, out) {
  if (Array.isArray(node)) {
    for (const item of node) leagueDivisions(item, inDivisions, out);
  } else if (node && typeof node === "object") {
    if (inDivisions && node._id && LEAGUE_DIVISION.test(String(node.Name || "").trim())) {
      out.push({ id: node._id, name: node.FullName || node.Name });
    }
    for (const key of Object.keys(node)) {
      if (node[key] && typeof node[key] === "object") leagueDivisions(node[key], key === "Divisions", out);
    }
  }
  return out;
}

async function leagueJson(path) {
  const answer = await fetch(LEAGUE_API + path, { cache: "no-store" });
  if (!answer.ok) throw new Error("website answered " + answer.status);
  return answer.json();
}

async function leagueFetch() {
  const divisions = leagueDivisions(await leagueJson("/menu"), false, []);
  if (!divisions.length) throw new Error("no Division 1 found on the website");
  const lists = await Promise.all(divisions.map((d) => leagueJson(`/leagues/${d.id}/events`)));
  const games = [];
  lists.forEach((list, i) => {
    for (const g of Array.isArray(list) ? list : []) {
      if (!g || !g.HomeTeam_Name || !g.AwayTeam_Name || !g.Date) continue;
      games.push({
        gameId: g._id,
        home: String(g.HomeTeam_Name).trim(),
        away: String(g.AwayTeam_Name).trim(),
        kickoff: g.Date,
        field: g.Field || "",
        division: divisions[i].name,
        divisionId: divisions[i].id,
        played: g.Home_Score != null && g.Away_Score != null,
      });
    }
  });
  games.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.field.localeCompare(b.field));
  return games;
}

function leagueDay(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LEAGUE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function leagueDayLabel(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LEAGUE_TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
}

function leagueTime(iso) {
  return new Intl.DateTimeFormat("en-US", { timeZone: LEAGUE_TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

// Tonight's games if there are any, otherwise the next game night, otherwise the last one.
function leagueDefaultDay(days, today) {
  if (days.includes(today)) return today;
  return days.find((d) => d > today) || days[days.length - 1] || null;
}

function leagueRender(note) {
  const days = [...new Set(league.games.map((g) => leagueDay(g.kickoff)))];
  const today = leagueDay(new Date().toISOString());
  if (!league.day || !days.includes(league.day)) league.day = leagueDefaultDay(days, today);

  const select = leagueEl("games-date");
  select.innerHTML = "";
  for (const day of days) {
    const sample = league.games.find((g) => leagueDay(g.kickoff) === day);
    const option = document.createElement("option");
    option.value = day;
    option.textContent = (day === today ? "Today · " : "") + leagueDayLabel(sample.kickoff);
    option.selected = day === league.day;
    select.appendChild(option);
  }

  const list = leagueEl("games-list");
  list.innerHTML = "";
  const tonight = league.games.filter((g) => leagueDay(g.kickoff) === league.day);
  const several = new Set(tonight.map((g) => g.divisionId)).size > 1;
  for (const game of tonight) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "game" + (league.selected && league.selected.gameId === game.gameId ? " picked" : "");
    const when = document.createElement("span");
    when.className = "when";
    when.textContent = [leagueTime(game.kickoff), game.field, several ? game.division : "", game.played ? "played" : ""].filter(Boolean).join(" · ");
    const teams = document.createElement("span");
    teams.className = "teams";
    teams.textContent = `${game.home}  vs  ${game.away}`;
    button.append(when, teams);
    button.addEventListener("click", () => leaguePick(game));
    list.appendChild(button);
  }

  const names = [...new Set(league.games.flatMap((g) => [g.home, g.away]))].sort();
  const datalist = leagueEl("team-list");
  datalist.innerHTML = "";
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    datalist.appendChild(option);
  }

  leagueEl("games-box").hidden = !league.games.length && !note;
  select.hidden = !league.games.length;
  leagueEl("games-note").textContent = note || "";
}

function leaguePick(game) {
  league.selected = game;
  leagueEl("home-input").value = game.home;
  leagueEl("away-input").value = game.away;
  leagueRender(leagueEl("games-note").textContent);
}

// The league game behind the names on the setup screen, or null when they were typed or changed by hand.
function leagueSelection(home, away) {
  const game = league.selected;
  if (!game || game.home !== home || game.away !== away) return null;
  return { gameId: game.gameId, division: game.division, divisionId: game.divisionId, kickoff: game.kickoff, field: game.field };
}

async function leagueInit() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LEAGUE_CACHE) || "null"); } catch (e) {}
  if (saved && Array.isArray(saved.games)) {
    league.games = saved.games;
    league.fetchedAt = saved.fetchedAt;
  }
  leagueRender(league.games.length ? "Checking the league website…" : "Loading games from the league website…");
  try {
    league.games = await leagueFetch();
    league.fetchedAt = new Date().toISOString();
    try { localStorage.setItem(LEAGUE_CACHE, JSON.stringify({ games: league.games, fetchedAt: league.fetchedAt })); } catch (e) {}
    leagueRender(league.games.length ? "" : "The league website lists no Division 1 games. Type the teams below.");
  } catch (e) {
    leagueRender(league.games.length
      ? `No connection to the league website. Showing the list saved on ${leagueDayLabel(league.fetchedAt)}.`
      : "Could not reach the league website. Type the teams below.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  leagueEl("games-date").addEventListener("change", (ev) => {
    league.day = ev.target.value;
    leagueRender(leagueEl("games-note").textContent);
  });
  leagueInit();
});
