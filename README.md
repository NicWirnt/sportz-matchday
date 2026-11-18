# Sportz FM

A responsive live sports match centre. Viewers select a fixture, follow its commentary and receive score changes without refreshing. The source selector also has a self-contained sample replay for exploring the interface before the first broadcast.

**Deploy both repositories and PostgreSQL:** [Ubuntu home server with Coolify](DEPLOYMENT.md).

The browser loads matches from `/api/matches`, recent commentary from `/api/matches/:id/commentary`, and connects to `/ws`. Caddy serves the static files and forwards both transports to the server-side `API_UPSTREAM`. Reconnection restores subscriptions and reloads persisted results. The browser never needs the publisher token or database URL.

## Run locally

Start the [Sportz API](https://github.com/NicWirnt/sportz-websockets-demo) with PostgreSQL first. With Caddy 2 installed, run these commands in PowerShell from this checkout:

```powershell
$env:API_UPSTREAM = "127.0.0.1:8000"
caddy run --config Caddyfile.local --adapter caddyfile
```

Open http://localhost:8080 and select **Server feed**. In the backend checkout run `node scripts/broadcast-demo.js` to publish a match. **Sample replay** uses local fixtures, regardless of server availability.

The production image uses the root Dockerfile and listens on port 8080. Fonts are bundled locally with their licenses under `public/fonts`.
