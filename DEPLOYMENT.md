# Deploy Sportz on your Ubuntu home server

The first milestone is a working broadcast on your home Wi-Fi. The Ubuntu machine runs Coolify, a frontend container, one Express API container and a persistent PostgreSQL database. Your Windows PC is just a viewer after setup.

```text
Browser → Coolify proxy → Sportz frontend (Caddy, 8080)
                              ├─ /             static match centre
                              ├─ /api/*    ┐
                              └─ /ws       ┴─ Express (8000) → PostgreSQL (5432)
```

## 1. Prepare Ubuntu

Run these in a terminal **on the Ubuntu server**. Use an Ubuntu LTS installation with SSH access. Coolify lists a minimum of two CPU cores, 2 GB RAM and 10 GB free disk. Allow extra space for images, database growth and backups. Reserve the server’s LAN address in your router’s DHCP settings. [Installation requirements](https://coolify.io/docs/start-with-self-hosted)

```bash
cat /etc/os-release
hostname -I
nproc
free -h
df -h /
sudo apt update
sudo apt install -y openssh-server curl openssl
sudo systemctl enable --now ssh
systemctl is-active ssh
```

Expect `active`. From Windows PowerShell, run `ssh your-ubuntu-user@SERVER_LAN_IP`, substituting your Ubuntu username and the reserved address. Continue in that SSH session.

## 2. Install Coolify

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh -o coolify-install.sh
less coolify-install.sh
sudo bash coolify-install.sh
```

Follow the installer output. From Windows open `http://SERVER_LAN_IP:8000`, register the first administrator immediately, select the local server and validate it. Start the Coolify proxy if prompted. Create a project named **Sportz** and use one environment and the same standalone destination for all three resources. Check that the server is reachable and the proxy is running before continuing.

For this LAN deployment leave router port forwarding off. If a firewall filters LAN traffic, allow your trusted LAN to reach SSH, 8000 (dashboard), 6001 and 6002 (dashboard tools), and 80 (app). Docker-published ports can bypass ordinary UFW filtering. Keep admin ports and PostgreSQL private. [Coolify firewall guide](https://coolify.io/docs/core/infrastructure/servers/firewall)

## 3. Start PostgreSQL

In the project choose **New Resource → PostgreSQL**, use the standard PostgreSQL image and set the initial database name to `sportz`. Keep the generated credentials and persistent volume. For an import, choose a major version at least as new as the Neon source. Leave public access off and host port mappings empty. Click **Start**, wait for healthy, then copy **Postgres URL (internal)**. Treat it as a password. [Coolify PostgreSQL](https://coolify.io/docs/databases/postgresql)

## 4. Deploy the backend

Create a **Public Repository** application from `https://github.com/NicWirnt/sportz-websockets-demo`, branch `main`. Select the **Dockerfile** build pack, base directory `/`, Dockerfile `/Dockerfile`. Set the exposed container port to **8000**. Clear any generated public domain. Under network settings set the consistent internal container name to **sportz-api**. Use one replica because subscriptions live in that process. Use the same destination as PostgreSQL. [Coolify networking](https://coolify.io/docs/core/networking-in-coolify)

Generate a publisher secret in your SSH session with `openssl rand -hex 32`. Store it in a password manager. Add the following **runtime** environment variables in Coolify:

| Variable | Value |
| --- | --- |
| DATABASE_URL | Exact internal URL from step 3 |
| PUBLISH_TOKEN | Generated secret |
| PORT | 8000 |
| DEMO_ENABLED | true to let visitors start a fictional live broadcast |

Arcjet is optional. Leave `ARCJET_KEY` unset for the initial LAN demo. The local database uses a direct connection, so `DATABASE_URL_UNPOOLED` can remain unset. Deploy and look for **Database migrations complete** followed by **Server running**. The image runs the committed migrations before listening. Use a database dedicated to Sportz because the historical migrations create and then drop an old demo table.

In the API resource terminal run:

```sh
node -e "fetch('http://127.0.0.1:8000/health').then(r=>r.text()).then(console.log)"
```

Expect `{"status":"ready"}`. This checks database access and the matches table. If you want your existing Neon records, complete step 7 before running the demo.

## 5. Deploy the frontend

Create a second **Public Repository** application from `https://github.com/NicWirnt/sportz-matchday`, branch `main`. Use **Dockerfile**, base directory `/`, Dockerfile `/Dockerfile`, exposed container port **8080** and the same destination. Set runtime variable `API_UPSTREAM=sportz-api:8000`. This is a Docker hostname. The browser uses the frontend origin for both HTTP and WebSocket requests.

Add an **HTTP** domain `sportz.home.arpa` targeting internal port **8080**. In a single-field domain editor enter `http://sportz.home.arpa:8080`. Disable any HTTPS redirect for this LAN-only hostname. Deploy. Add a local DNS record on your router pointing that name to your server. Alternatively open Notepad as administrator on Windows and add this line to `C:\Windows\System32\drivers\etc\hosts`, substituting the real LAN IP:

```text
192.168.1.50 sportz.home.arpa
```

A hosts entry applies only to that PC. Use LAN DNS to include phones. From Windows run:

```powershell
curl.exe http://sportz.home.arpa/api/health
curl.exe http://sportz.home.arpa/api/matches
```

Expect `{"status":"ready"}` and, for an empty database, `{"data":[]}`. Visit **http://sportz.home.arpa** without a port suffix. Select **Server feed** and confirm **Signal online**. [Coolify domain routing](https://coolify.io/docs/core/networking/domains)

## 6. Watch a live demo

Choose **Live demo → Start demo** on the deployed frontend. Open the same page in a second browser window. Both windows show a fictional basketball game, with the first score change after about six seconds and a final buzzer at 12 minutes. The simulation serves one shared game at a time. It restarts on demand after a 30-second cooldown and clears when the backend container restarts. Use `/?source=demo` as a direct link to the demo.

To verify the regular match feed separately, publish through the backend:

Open the match centre in two browser windows and select **Server feed** and **All**. In the **backend resource terminal** run:

```sh
node scripts/broadcast-demo.js
```

A new Northbridge FC vs Atlas United fixture appears in both windows. Select that fixture if another is already open. Three commentary entries arrive about six seconds apart and the score reaches **1–0**. Refresh one window and confirm the same score and commentary load from PostgreSQL. Each run creates a new fixture. **Sample replay** in the source selector is separate, browser-only demo data.

## 7. Optional: copy existing matches from Neon

Use an empty, freshly migrated target and run this before the first demo. Pause all publishers to Neon and the target for the copy. This procedure copies the two application tables, preserves their IDs and advances the local sequences. The source stays available as a fallback. Confirm that Neon has the same columns as this repository and take a target backup first if it contains anything you need.

In the Ubuntu **SSH terminal**, find the database container name. The following example uses the PostgreSQL tools inside that container. Connections to the target use its local Unix socket. If local authentication prompts, use the database credential from Coolify.

```bash
sudo docker ps --format '{{.Names}}  {{.Image}}'
read -rp 'Sportz database container name: ' PG_CONTAINER
sudo docker exec "$PG_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT (SELECT count(*) FROM matches) AS matches, (SELECT count(*) FROM commentary) AS commentary"'
```

Both counts must be zero. If either is nonzero, create a fresh database for the import. In the same SSH session, paste the **direct, unpooled** Neon URL with its TLS parameters into the hidden prompt:

```bash
read -rsp 'Direct Neon URL: ' NEON_URL; echo
sudo docker exec -e PGDATABASE="$NEON_URL" "$PG_CONTAINER" psql -c 'SELECT (SELECT count(*) FROM matches), (SELECT count(*) FROM commentary);'
umask 077
DUMP_FILE="sportz-neon-$(date +%Y%m%d-%H%M%S).dump"
sudo docker exec -e PGDATABASE="$NEON_URL" "$PG_CONTAINER" pg_dump -Fc --data-only -t public.matches -t public.commentary -t public.matches_id_seq -t public.commentary_id_seq > "$DUMP_FILE"
dump_status=$?
unset NEON_URL
test "$dump_status" -eq 0 && test -s "$DUMP_FILE" && echo 'Dump complete'
```

Continue only after **Dump complete**. Restore in a single transaction:

```bash
sudo docker exec -i "$PG_CONTAINER" sh -c 'pg_restore --exit-on-error --single-transaction --data-only --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$DUMP_FILE"
sudo docker exec "$PG_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT (SELECT count(*) FROM matches), (SELECT count(*) FROM commentary);"'
```

Compare both counts with Neon and inspect a known match in the UI before resuming publishing against the home API. Keep a protected off-server copy of the dump. Schedule database backups in Coolify to storage outside the Ubuntu machine, and test restoring one into a separate database. [Coolify PostgreSQL operations](https://coolify.io/docs/databases/postgresql)

## Troubleshooting and public access

| Symptom | Check |
| --- | --- |
| Name does not resolve | LAN DNS or the viewing device’s hosts entry. |
| Coolify 404 | Frontend HTTP domain, proxy status and requested hostname. |
| Frontend opens but API returns 502 | Both apps on the same destination, stable backend name, API port 8000 and frontend runtime variable. Redeploy after changing settings. |
| Health returns 503 or API restarts | Database health, internal URL, migration logs and database permissions. |
| Scores load but signal reconnects | Browser DevTools → Network → WS. The request to the frontend’s `/ws` should upgrade with HTTP 101. Keep WebSocket upgrades enabled on any additional proxy. |
| Publishing returns 401 or 503 | Check the API runtime token and the publisher’s bearer token. Restart the API after changing the token. |

For internet viewers, first verify the LAN demo. With a publicly routable home IP, point your domain’s DNS at that IP, forward TCP 80 and 443 to the Ubuntu server, then configure the frontend domain with HTTPS and internal port 8080. Viewers use `https://` and the frontend automatically uses `wss://`. Keep publishing credentials on the server. Under carrier-grade NAT, inbound IPv4 forwarding generally requires a public IP from the ISP or a tunnel that supports WebSocket upgrades. The LAN setup needs neither. [Coolify domains and HTTPS](https://coolify.io/docs/core/networking/domains)
