# Sportz Arena

A responsive live scoreboard with a match board and play-by-play coverage. The match centre opens on a sample replay with three fixtures. Use the replay timeline or arrow controls to step through each match. Choose **Server feed** for real fixtures, commentary and score updates, or link directly to `/?source=server`.

**Deploy both repositories and PostgreSQL:** [Ubuntu home server with Coolify](DEPLOYMENT.md).

The browser loads matches from `/api/matches`, recent commentary from `/api/matches/:id/commentary`, and connects to `/ws`. Caddy serves the static files and forwards both transports to the server-side `API_UPSTREAM`. Reconnection restores subscriptions and reloads persisted results. The browser never needs the publisher token or database URL.

## Run locally

Start the [Sportz API](https://github.com/NicWirnt/sportz-websockets-demo) with PostgreSQL first. With Caddy 2 installed, run these commands in PowerShell from this checkout:

```powershell
$env:API_UPSTREAM = "127.0.0.1:8000"
caddy run --config Caddyfile.local --adapter caddyfile
```

Open http://localhost:8080. With `DEMO_ENABLED=true` on the backend, choose **Live demo → Start demo** to launch a shared 12-minute basketball broadcast. Open `/?source=demo` in another tab to watch the same score and commentary arrive over WebSockets.

Choose **Server feed** for regular matches. In the backend checkout run `node scripts/broadcast-demo.js` to publish one. **Sample replay** uses local fixtures and works with the backend offline.

The production image uses the root Dockerfile and listens on port 8080. Fonts are bundled locally with their licenses under `public/fonts`.
