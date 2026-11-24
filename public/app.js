import { matches as sampleMatches } from "./sample.js";

const $ = (id) => document.getElementById(id);
const date = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const sources = [...document.querySelectorAll("[data-source]")];
const filters = [...document.querySelectorAll("[data-filter]")];
const url = new URL(location.href);
const requestedMode = url.searchParams.get("source");
let mode = ["server", "demo"].includes(requestedMode)
  ? requestedMode
  : "replay";
let filter = "All";
let selected = null;
let playIndex = 0;
let matches = new Map();
let notes = new Map();
let boardState = "Loading matches…";
let noteState = "";
let feed;
let notesRequest;

function setText(id, value) {
  const element = $(id);
  if (element.textContent !== String(value)) element.textContent = value;
}

function escape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}

function phase(match) {
  if (mode === "replay") return match.status;
  if (mode === "demo") return match.status === "finished" ? "Finished" : "Live";
  if (Date.now() < Date.parse(match.startTime)) return "Scheduled";
  if (match.endTime && Date.now() >= Date.parse(match.endTime))
    return "Finished";
  return match.status === "finished" ? "Finished" : "Live";
}

function available() {
  const fixtures = mode === "replay" ? sampleMatches : [...matches.values()];
  return fixtures.filter(
    (match) => filter === "All" || phase(match) === filter,
  );
}

function setConnection(label, state) {
  setText("connection", label);
  $("connection").dataset.state = state;
}

function renderBoard(rows) {
  const buttons = $("fixtures");
  const wanted = new Set(rows.map((match) => String(match.id)));
  for (const child of [...buttons.children]) {
    if (!wanted.has(child.dataset.match)) child.remove();
  }
  setText(
    "fixture-count",
    rows.length + (rows.length === 1 ? " match" : " matches"),
  );
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      filter === "All" ? boardState : "No matches for this filter.";
    buttons.replaceChildren(empty);
    return;
  }
  rows.forEach((match, index) => {
    const current = buttons.children[index];
    let button = buttons.querySelector(
      '[data-match="' + Number(match.id) + '"]',
    );
    if (!button) {
      button = document.createElement("button");
      button.className = "fixture";
      button.type = "button";
      button.dataset.match = match.id;
      button.addEventListener("click", () => choose(match.id));
    }
    if (current !== button) buttons.insertBefore(button, current ?? null);
    button.setAttribute("aria-pressed", match.id === selected);
    const status = phase(match);
    const label = { Live: "Live", Scheduled: "Upcoming", Finished: "Final" }[
      status
    ];
    const score =
      mode === "replay"
        ? match.moments[match.id === selected ? playIndex : match.featuredPlay]
        : match;
    const tally = (team, points) =>
      '<span class="side"><span>' +
      escape(team) +
      "</span><b>" +
      (status === "Scheduled" ? "–" : escape(points)) +
      "</b></span>";
    const content =
      '<span class="fixture-meta"><span>' +
      escape(match.sport) +
      '</span><span class="' +
      (status === "Live" ? "live-mark" : "") +
      '">' +
      label +
      "</span></span>" +
      tally(match.homeTeam, score.homeScore) +
      tally(match.awayTeam, score.awayScore);
    if (button.innerHTML !== content) button.innerHTML = content;
  });
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function renderScore(match, moment) {
  $("field").hidden = !match;
  $("board-empty").hidden = Boolean(match);
  $("replay-desk").hidden = !moment;
  $("live-desk").hidden = !match || mode === "replay";
  setText("sport", match?.sport ?? "Scoreboard");
  if (!match) {
    setText("fixture-meta", mode === "demo" ? "Simulated game" : "");
    setText(
      "empty-title",
      filter === "All" ? "Waiting for a match" : "No matches in this view",
    );
    setText(
      "empty-detail",
      filter === "All"
        ? boardState
        : "Choose another filter to see more matches.",
    );
    $("try-sample").hidden = mode === "replay";
    return;
  }

  const status = phase(match);
  const score = moment ?? match;
  const scheduled = status === "Scheduled";
  setText(
    "fixture-meta",
    mode === "demo"
      ? "Simulated game"
      : moment
        ? match.venue
        : "Start · " + date.format(new Date(match.startTime)),
  );
  setText("home-team", match.homeTeam);
  setText("away-team", match.awayTeam);
  setText("home-code", match.codes?.[0] ?? initials(match.homeTeam));
  setText("away-code", match.codes?.[1] ?? initials(match.awayTeam));
  setText(
    "phase",
    moment?.period ??
      (status === "Finished" ? "Full time" : scheduled ? "Upcoming" : "Live"),
  );
  setText("clock", moment?.clock ?? "");
  if (mode === "demo") updateDemoClock();
  setText("home-score", scheduled ? "–" : score.homeScore);
  setText("away-score", scheduled ? "–" : score.awayScore);
  const digits = Math.max(
    String(score.homeScore).length,
    String(score.awayScore).length,
  );
  $("score").dataset.size =
    digits > 3 ? "long" : digits > 1 ? "wide" : "standard";
  if (moment) renderReplay(match, moment);
}

function renderReplay(match, moment) {
  const track = $("track");
  if (track.dataset.match !== String(match.id)) {
    track.dataset.match = match.id;
    track.replaceChildren(
      ...match.moments.map((play, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute(
          "aria-label",
          "Play " + (index + 1) + ": " + play.eventType,
        );
        button.addEventListener("click", () => jump(index));
        return button;
      }),
    );
  }
  [...track.children].forEach((button, index) => {
    button.classList.toggle("played", index <= playIndex);
    button.setAttribute("aria-pressed", index === playIndex);
  });
  // Keep arrow controls in the keyboard sequence at the endpoints.
  $("prev").setAttribute("aria-disabled", playIndex === 0);
  $("next").setAttribute(
    "aria-disabled",
    playIndex === match.moments.length - 1,
  );
  setText(
    "progress-text",
    "Play " + (playIndex + 1) + " / " + match.moments.length,
  );
  setText("event", moment.eventType);
  setText("detail", moment.message);
}

function render() {
  const rows = available();
  const match = rows.find((row) => row.id === selected);
  const moment = mode === "replay" ? match?.moments[playIndex] : null;
  renderBoard(rows);
  renderScore(match, moment);
  filters.forEach((button) =>
    button.setAttribute("aria-pressed", button.dataset.filter === filter),
  );
  sources.forEach((button) =>
    button.setAttribute("aria-pressed", button.dataset.source === mode),
  );
  const liveEvents =
    mode === "demo" ? (feed?.demo?.events ?? []) : [...notes.values()];
  const events = !match
    ? []
    : moment
      ? match.moments.slice(0, playIndex + 1).reverse()
      : [...liveEvents]
          .sort((a, b) => b.sequence - a.sequence || b.id - a.id)
          .slice(0, 100);
  setText(
    "count",
    events.length + (events.length === 1 ? " update" : " updates"),
  );
  setText(
    "live-summary",
    events[0]?.eventType || events[0]?.message || noteState,
  );
  const timeline =
    events
      .map(
        (event) =>
          '<article class="event"><span class="minute">' +
          escape(
            event.clock ??
              (event.minute == null ? "Update" : event.minute + "′"),
          ) +
          "</span><div><h3>" +
          escape(event.eventType || "Match update") +
          "</h3><p>" +
          escape(event.message) +
          "</p></div></article>",
      )
      .join("") ||
    '<p class="empty">' +
      escape(match ? noteState : "Select a match to follow the play.") +
      "</p>";
  if ($("timeline").innerHTML !== timeline) $("timeline").innerHTML = timeline;
}

function jump(index) {
  const match = sampleMatches.find((row) => selected === row.id);
  if (mode !== "replay" || !match?.moments[index]) return;
  playIndex = index;
  render();
  setText("announce", match.moments[index].eventType);
}

function choose(id) {
  if (selected !== id) {
    if (mode === "server") send("unsubscribe", selected);
    notesRequest?.abort();
    selected = id;
    notes = new Map();
    noteState = "Loading commentary…";
    if (mode === "replay")
      playIndex =
        sampleMatches.find((match) => match.id === id)?.featuredPlay ?? 0;
    if (mode === "server" && id != null) {
      if (feed.socket?.readyState === WebSocket.OPEN) send("subscribe", id);
      else loadNotes(id);
    }
  }
  render();
}

function reconcile() {
  const rows = available();
  choose(
    rows.some((match) => match.id === selected)
      ? selected
      : (rows[0]?.id ?? null),
  );
}

async function read(path, signal) {
  const response = await fetch("/api" + path, {
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return (await response.json()).data;
}

function send(type, matchId) {
  if (matchId != null && feed?.socket?.readyState === WebSocket.OPEN) {
    feed.socket.send(JSON.stringify({ type, matchId }));
  }
}

async function loadNotes(id) {
  notesRequest?.abort();
  const request = new AbortController();
  notesRequest = request;
  try {
    const data = await read("/matches/" + id + "/commentary", request.signal);
    if (request.signal.aborted) return;
    // Keep any events delivered while the history request was in flight.
    notes = new Map([...data.map((event) => [event.id, event]), ...notes]);
    noteState = "Waiting for the first commentary update.";
  } catch {
    if (request.signal.aborted) return;
    noteState = "Commentary unavailable. Retrying…";
    const current = feed;
    setTimeout(() => {
      if (feed === current && selected === id && notesRequest === request)
        loadNotes(id);
    }, 5000);
  }
  render();
}

async function loadBoard(session) {
  const changes = new Map();
  session.changes = changes;
  try {
    const data = await read("/matches?limit=100", session.signal);
    if (session.signal.aborted || session.changes !== changes) return;
    matches = new Map([...data.map((match) => [match.id, match]), ...changes]);
    boardState = "No matches have been published yet.";
  } catch {
    if (session.signal.aborted || session.changes !== changes) return;
    boardState = "The match feed is unavailable. Retrying…";
    setTimeout(() => {
      if (!session.signal.aborted && session.changes === changes)
        loadBoard(session);
    }, 5000);
  }
  reconcile();
}

function updateDemoClock() {
  const match = feed?.demo?.match;
  if (!match) return;
  const seconds =
    match.status === "finished"
      ? 0
      : Math.max(0, Math.ceil((match.endTime - Date.now()) / 1000));
  setText(
    "clock",
    Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0"),
  );
  setText("phase", match.status === "finished" ? "Final" : "4th quarter");
}

function updateDemoControls() {
  const demo = feed?.demo;
  const active = demo?.match?.status === "live";
  const wait = Math.max(
    0,
    Math.ceil(((demo?.restartAt ?? 0) - Date.now()) / 1000),
  );
  const button = $("start-demo");
  button.setAttribute(
    "aria-disabled",
    !demo?.enabled || active || wait > 0 || feed.starting,
  );
  if (!demo) {
    setText("demo-detail", "Checking demo availability…");
    setText("start-demo", "Start demo");
  } else if (!demo.enabled) {
    setText(
      "demo-detail",
      "This server has the live demo switched off. Try Sample replay.",
    );
    setText("start-demo", "Start demo");
  } else if (active) {
    setText(
      "demo-detail",
      "A fictional basketball game is in progress. Open this view in a second tab to follow the same broadcast.",
    );
    setText("start-demo", "Demo in progress");
  } else {
    setText(
      "demo-detail",
      demo.match
        ? "Final score is in. Start another broadcast to run it again."
        : "Start a 12-minute fictional basketball game. The first score change comes after six seconds.",
    );
    setText(
      "start-demo",
      wait
        ? "Restart in " + wait + "s"
        : feed.starting
          ? "Starting…"
          : "Start demo",
    );
  }
}

function applyDemo(session, snapshot) {
  if (
    session.signal.aborted ||
    !snapshot ||
    snapshot.revision < (session.demo?.revision ?? 0)
  )
    return;
  const lastEvent = session.demo?.events.at(-1);
  const previousMatch = session.demo?.match?.id;
  session.demo = snapshot;
  const match = snapshot.match;
  matches = new Map(match ? [[match.id, match]] : []);
  boardState = snapshot.enabled
    ? "Start the demo to put a game on the scoreboard."
    : "This server has the live demo switched off.";
  setText("demo-error", "");
  updateDemoControls();
  reconcile();
  const event = snapshot.events.at(-1);
  if (event && (previousMatch !== match.id || event.id !== lastEvent?.id))
    setText("announce", event.eventType + ". " + event.message);
}

async function loadDemo(session) {
  try {
    applyDemo(session, await read("/demo", session.signal));
  } catch {
    if (session.signal.aborted || session.demo) return;
    boardState = "The live demo could not connect.";
    setText(
      "demo-error",
      "Server unavailable. Try Sample replay while the connection retries.",
    );
    reconcile();
  }
}

async function startDemo() {
  const session = feed;
  if (
    mode !== "demo" ||
    $("start-demo").getAttribute("aria-disabled") === "true"
  )
    return;
  session.starting = true;
  filter = "All";
  updateDemoControls();
  try {
    const response = await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.any([session.signal, AbortSignal.timeout(10000)]),
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    applyDemo(session, (await response.json()).data);
  } catch {
    if (!session.signal.aborted) {
      setText("demo-error", "Could not start the demo. Try again in a moment.");
    }
  } finally {
    session.starting = false;
    if (!session.signal.aborted) updateDemoControls();
  }
}

function connect(session) {
  if (session.signal.aborted) return;
  const protocol = location.protocol === "https:" ? "wss://" : "ws://";
  const isDemo = mode === "demo";
  const socket = new WebSocket(
    protocol + location.host + "/ws" + (isDemo ? "?feed=demo" : ""),
  );
  session.socket = socket;
  socket.onopen = () => {
    if (session.signal.aborted) return;
    session.retry = 1000;
    setConnection(isDemo ? "Demo connected" : "Signal online", "online");
    if (isDemo) return;
    send("subscribe", selected);
    loadBoard(session);
  };
  socket.onmessage = ({ data }) => {
    if (session.signal.aborted) return;
    const { type, data: value, matchId } = JSON.parse(data);
    if (isDemo) {
      if (type === "demo_update") applyDemo(session, value);
      return;
    }
    if (type === "subscribed" && matchId === selected) loadNotes(matchId);
    if (type === "match_created" || type === "score_updated") {
      session.changes.set(value.id, value);
      matches.set(value.id, value);
      if (type === "match_created")
        matches = new Map([[value.id, value], ...matches]);
      reconcile();
    }
    if (type === "commentary" && selected === value.matchId) {
      notes.set(value.id, value);
      noteState = "";
      render();
      setText(
        "announce",
        (value.eventType || "Match update") + ". " + value.message,
      );
    }
  };
  socket.onclose = () => {
    if (session.signal.aborted) return;
    setConnection("Reconnecting", "waiting");
    setTimeout(() => connect(session), session.retry);
    session.retry = Math.min(15000, session.retry * 2);
  };
}

function changeSource(source) {
  feed?.controller.abort();
  feed?.socket?.close();
  notesRequest?.abort();
  feed = undefined;
  mode = source;
  filter = "All";
  selected = null;
  matches.clear();
  notes.clear();
  $("demo-banner").hidden = source !== "demo";
  if (source !== "replay") {
    boardState =
      source === "demo" ? "Checking for a demo broadcast…" : "Loading matches…";
    setConnection("Connecting", "waiting");
    const controller = new AbortController();
    feed = {
      controller,
      signal: controller.signal,
      retry: 1000,
      changes: new Map(),
    };
    if (source === "demo") {
      setText("demo-error", "");
      updateDemoControls();
      loadDemo(feed);
    } else {
      loadBoard(feed);
    }
    connect(feed);
  } else {
    boardState = "Choose a match from the sample replay.";
    setConnection("Sample replay", "replay");
  }
  url.searchParams.set("source", source);
  history.replaceState(null, "", url);
  reconcile();
}

sources.forEach((button) =>
  button.addEventListener("click", () => {
    if (mode !== button.dataset.source) changeSource(button.dataset.source);
  }),
);
filters.forEach((button) =>
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    reconcile();
  }),
);
$("prev").addEventListener("click", () => jump(playIndex - 1));
$("next").addEventListener("click", () => jump(playIndex + 1));
$("start-demo").addEventListener("click", startDemo);
$("try-sample").addEventListener("click", () => {
  changeSource("replay");
  $("scoreboard").focus();
});
setInterval(() => {
  if (mode === "server") reconcile();
}, 30000);
setInterval(() => {
  if (mode !== "demo") return;
  updateDemoControls();
  updateDemoClock();
}, 1000);
changeSource(mode);
