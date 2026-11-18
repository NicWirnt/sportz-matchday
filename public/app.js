import * as sample from "./sample.js";

const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const date = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const phases = ["All", "Live", "Scheduled", "Finished"];
let preview = false,
  filter = "All",
  selected = null;
let matches = new Map(),
  notes = new Map();
let socket,
  matchRequest = 0,
  notesRequest = 0,
  retry = 1000;
let matchOverlay = new Map(),
  notesOverlay = new Map();
let boardState = "Loading matches…",
  noteState = "Select a match to follow the play.";
let replayTimer;

function phase(m) {
  if (Date.now() < new Date(m.startTime)) return "Scheduled";
  if (m.endTime && Date.now() >= new Date(m.endTime)) return "Finished";
  return "Live";
}
function available() {
  return [...(preview ? sample.matches : matches.values())].filter(
    (m) => filter === "All" || phase(m) === filter,
  );
}
function team(name, score, away = false) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
  return (
    '<div class="teamrow"><span aria-hidden="true" class="crest ' +
    (away ? "away" : "") +
    '">' +
    escape(initials) +
    '</span><span class="team">' +
    escape(name) +
    '</span><span class="scores">' +
    escape(score) +
    "</span></div>"
  );
}
function render() {
  const rows = available(),
    m = rows.find((row) => row.id === selected);
  $("filters").innerHTML = phases
    .map(
      (p) =>
        '<button class="pill" aria-pressed="' +
        (p === filter) +
        '" data-filter="' +
        p +
        '">' +
        p +
        "</button>",
    )
    .join("");
  $("fixtures").innerHTML =
    rows
      .map(
        (r) =>
          '<button class="fixture" data-match="' +
          Number(r.id) +
          '" aria-pressed="' +
          (selected === r.id) +
          '"><span class="rowhead"><span>' +
          escape(r.sport) +
          "</span><span>" +
          phase(r) +
          "</span></span>" +
          [
            [r.homeTeam, r.homeScore],
            [r.awayTeam, r.awayScore],
          ]
            .map(
              ([name, score]) =>
                '<span class="side"><span>' +
                escape(name) +
                "</span><b>" +
                escape(score) +
                "</b></span>",
            )
            .join("") +
          "</button>",
      )
      .join("") ||
    '<p class="empty">' +
      escape(
        filter === "All"
          ? boardState
          : "No " + filter.toLowerCase() + " matches.",
      ) +
      "</p>";
  $("sport").textContent = m
    ? m.sport.toUpperCase() + " / MATCH BROADCAST"
    : "MATCH BROADCAST";
  $("phase").textContent = m ? (preview ? "Replay • " : "") + phase(m) : "";
  $("score").innerHTML = m
    ? team(m.homeTeam, m.homeScore) + team(m.awayTeam, m.awayScore, true)
    : '<div class="empty"><h3>Awaiting a broadcast</h3><p>' +
      escape(filter === "All" ? boardState : "No matches in this filter.") +
      "</p>" +
      (preview
        ? ""
        : '<button id="trySample">Explore sample replay →</button>') +
      "</div>";
  $("kickoff").textContent = m
    ? "Start · " + date.format(new Date(m.startTime))
    : "Match centre";
  const events = [...notes.values()]
    .sort((a, b) => (b.sequence ?? b.id) - (a.sequence ?? a.id))
    .slice(0, 100);
  $("count").textContent =
    events.length + (events.length === 1 ? " update" : " updates");
  $("timeline").innerHTML =
    events
      .map(
        (e) =>
          '<article class="event"><span class="minute">' +
          (e.minute == null ? "•" : escape(e.minute) + "′") +
          "</span><div><strong>" +
          escape(e.eventType || "Match update") +
          "</strong><p>" +
          escape(e.message) +
          "</p></div></article>",
      )
      .join("") || '<p class="empty">' + escape(noteState) + "</p>";
}
async function read(path) {
  const response = await fetch("/api" + path, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return (await response.json()).data;
}
function send(type, matchId) {
  if (matchId != null && socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type, matchId }));
}
async function loadNotes() {
  const request = ++notesRequest;
  notesOverlay = new Map();
  try {
    const data = await read("/matches/" + selected + "/commentary");
    if (request !== notesRequest) return;
    notes = new Map([...data.map((e) => [e.id, e]), ...notesOverlay]);
    noteState = "Waiting for the first commentary update.";
  } catch {
    if (request !== notesRequest) return;
    noteState = "Commentary unavailable. Retrying…";
    setTimeout(() => {
      if (request === notesRequest) loadNotes();
    }, 5000);
  }
  render();
}
function choose(id, force = false) {
  if (selected === id && !force) return render();
  if (!preview) send("unsubscribe", selected);
  selected = id;
  clearInterval(replayTimer);
  ++notesRequest;
  notes = new Map();
  noteState =
    id == null
      ? "Select a match to follow the play."
      : "Waiting for the first commentary update.";
  if (id != null && preview && id === 1) {
    let index = 0;
    const advance = () => {
      const event = sample.commentary[index++];
      notes.set(event.id, event);
      if (index === sample.commentary.length) clearInterval(replayTimer);
      render();
    };
    replayTimer = setInterval(advance, 2500);
    advance();
  } else if (id != null && !preview) {
    noteState = "Loading commentary…";
    send("subscribe", id);
    loadNotes();
  }
  render();
}
function reconcile() {
  const rows = available();
  choose(
    rows.some((m) => m.id === selected) ? selected : (rows[0]?.id ?? null),
  );
}
async function loadBoard() {
  const request = ++matchRequest;
  matchOverlay = new Map();
  try {
    const data = await read("/matches?limit=100");
    if (request !== matchRequest) return;
    matches = new Map([...data.map((m) => [m.id, m]), ...matchOverlay]);
    boardState =
      "No matches yet. Start a broadcast or explore the sample replay.";
  } catch {
    if (request !== matchRequest) return;
    boardState = "Cannot reach the match feed. Retrying…";
    setTimeout(() => {
      if (request === matchRequest) loadBoard();
    }, 5000);
  }
  if (!preview) reconcile();
}
function connect() {
  const ws = new WebSocket(
    (location.protocol === "https:" ? "wss://" : "ws://") +
      location.host +
      "/ws",
  );
  socket = ws;
  ws.onopen = () => {
    retry = 1000;
    $("connection").textContent = "Signal online";
    $("connection").className = "connection connected";
    if (!preview) send("subscribe", selected);
    loadBoard();
  };
  ws.onmessage = ({ data }) => {
    const event = JSON.parse(data),
      value = event.data;
    if (event.type === "subscribed" && !preview && event.matchId === selected)
      loadNotes();
    if (event.type === "match_created" || event.type === "score_updated") {
      matchOverlay.set(value.id, value);
      matches = new Map([
        [value.id, value],
        ...[...matches].filter(([id]) => id !== value.id),
      ]);
      if (!preview) reconcile();
    }
    if (event.type === "commentary" && !preview && selected === value.matchId) {
      notesOverlay.set(value.id, value);
      notes.set(value.id, value);
      render();
    }
  };
  ws.onclose = () => {
    $("connection").textContent = "Reconnecting";
    $("connection").className = "connection";
    setTimeout(connect, retry);
    retry = Math.min(15000, retry * 2);
  };
}
function changeSource() {
  if (!preview) send("unsubscribe", selected);
  preview = $("source").value === "preview";
  filter = "All";
  selected = null;
  choose(available()[0]?.id ?? null, true);
}
$("source").onchange = changeSource;
$("score").onclick = (e) => {
  if (e.target.id === "trySample") {
    $("source").value = "preview";
    changeSource();
  }
};
$("fixtures").onclick = (e) => {
  const button = e.target.closest("[data-match]");
  if (button) choose(Number(button.dataset.match));
};
$("filters").onclick = (e) => {
  if (e.target.dataset.filter) {
    filter = e.target.dataset.filter;
    reconcile();
  }
};
setInterval(reconcile, 60000);
render();
loadBoard();
connect();
