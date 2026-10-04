# TAMO dienynas MCP

**English** · [Lietuviškai](README.lt.md)

Connect your AI assistant (Claude, ChatGPT and others) to the **TAMO dienynas** Lithuanian school e-diary. Once it's set up you can ask things like:

- "What homework is due tomorrow, and what haven't I done yet?"
- "What's my math average this semester?"
- "Did I get any new grades this week?"
- "What's on my schedule on Thursday?"

It is an [MCP](https://modelcontextprotocol.io) server that you run yourself with your own TAMO login. It only reads data; it never changes anything in TAMO.

> [!WARNING]
> This project is unofficial and not affiliated with TAMO. TAMO's [Terms of Use](https://content.tamo.lt/taisykles/naudojimo.html) prohibit programmatic access outside documented integrations. Use it at your own risk, only with your own account; see the [API reference's disclaimer](https://github.com/sobakintech/tamo-dienynas-api#disclaimer).

## What it can read

| Tool | What it returns |
| --- | --- |
| `get_schedule` | Lessons for a week: times, subject, teacher, topic, grades, formative assessments, homework, test labels |
| `get_grades` | Grades, formative assessments and attendance for a date range (up to 400 days) |
| `get_homework` | Homework due in a date range, with attachments and completion state, filterable by done / not done |
| `get_classwork` | What was done in lessons |
| `get_notifications` | The recent feed: new grades, homework, absences, praise, remarks |
| `get_school_calendar` | Holidays, breaks and school-wide events for a month |
| `list_messages` | Message list (sender, subject, unread). Bodies are not opened, because opening marks a message as read |
| `get_semester_grades` | Per-subject averages, final grades and marks for a semester or the year |

Nothing is written back to TAMO: no message is opened and no homework is ticked. Some data requires an active TAMO IŠMANIEMS subscription on the account.

## Your login and privacy

Your TAMO username and password stay in your own deployment's environment variables. The server talks only to TAMO and to the AI clients you connect; nothing is stored, cached or sent anywhere else. Every request reads fresh data, and the server limits how many requests it sends to TAMO per minute.

The server is protected by two secrets that you choose: a bearer token for clients that can send headers, and a secret URL path for clients that only accept a URL. Treat both like passwords — anyone who has them can read your diary.

## Setup

You need somewhere to run the server that your AI client can reach over HTTPS. Pick one option below, then [connect your client](#connect-your-ai-client).

### Option 1: Render (no server needed)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sobakintech/tamo-dienynas-mcp)

1. Click the button and sign in to Render (a free account is enough).
2. Enter your `TAMO_USERNAME` and `TAMO_PASSWORD`. Render generates `MCP_TOKEN` and `MCP_PATH_TOKEN` for you.
3. When the deploy finishes, open the service's **Environment** tab and copy `MCP_PATH_TOKEN`. Your server address is shown at the top of the page, for example `https://tamo-dienynas-mcp-xxxx.onrender.com`.

Render's free plan puts the server to sleep after 15 minutes without requests, so the first question after a break can take up to a minute or fail once. Ask again, or use a paid instance to keep it awake.

### Option 2: Docker

A ready-made image is published at `ghcr.io/sobakintech/tamo-dienynas-mcp`.

```sh
cp .env.example .env   # then fill in the values
docker compose up -d
```

or without Compose:

```sh
docker run -d --name tamo-mcp --env-file .env -p 8000:8000 --restart unless-stopped ghcr.io/sobakintech/tamo-dienynas-mcp:latest
```

Put it behind a reverse proxy with HTTPS (Caddy, Traefik, nginx, Cloudflare Tunnel…). Any platform that runs Dockerfiles or Node apps — Coolify, Dokploy, Railway, Fly.io — also works with this repository as-is.

### Option 3: Node.js

Node 22 or newer:

```sh
npm ci
npm run build
npm start
```

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `TAMO_USERNAME`, `TAMO_PASSWORD` | yes | The student's TAMO login |
| `MCP_TOKEN` | yes | Bearer token for clients that send headers, on `/mcp` |
| `MCP_PATH_TOKEN` | yes | Secret path for clients that only take a URL, on `/<MCP_PATH_TOKEN>/mcp` |
| `TAMO_ROLE` | no | Part of the role title to use if the account has several roles (e.g. a parent with two children) |
| `PORT` | no | Default `8000` |
| `MAX_TAMO_REQUESTS_PER_MINUTE` | no | Default `30` |

Generate the tokens with `openssl rand -hex 32`, or any password generator. `/healthz` answers without authentication, for uptime checks.

## Connect your AI client

There are two addresses; use whichever your client supports:

- **URL only:** `https://<your-server>/<MCP_PATH_TOKEN>/mcp`, no authentication.
- **URL + header:** `https://<your-server>/mcp` with the header `Authorization: Bearer <MCP_TOKEN>`.

**Claude (claude.ai, desktop and mobile apps):** Settings → Connectors → Add custom connector. Paste the URL-only address. Connectors added on claude.ai also appear in the desktop and mobile apps.

**ChatGPT:** Settings → Apps & Connectors → Advanced settings → turn on Developer mode, then create a connector with the URL-only address and no authentication.

**Claude Code:**

```sh
claude mcp add --transport http tamo https://<your-server>/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

**Other clients** (Cursor, VS Code, LibreChat…): add a Streamable HTTP MCP server with either address.

Then just ask about your homework, grades or schedule. Dates are interpreted in Europe/Vilnius time.

## Development

```sh
npm ci
npm test
```

The TAMO endpoints this server uses are documented in the [unofficial TAMO dienynas API reference](https://github.com/sobakintech/tamo-dienynas-api).
