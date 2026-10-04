# TAMO dienynas MCP

Read-only [MCP](https://modelcontextprotocol.io) server for the **TAMO dienynas** Lithuanian school e-diary. It lets an AI assistant answer questions like "what homework is due tomorrow?" or "what's my math average this semester?" using one student's own login.

Built on the [unofficial TAMO dienynas API reference](https://github.com/sobakintech/tamo-dienynas-api).

> [!WARNING]
> This is unofficial. TAMO's [Terms of Use](https://content.tamo.lt/taisykles/naudojimo.html) prohibit programmatic access outside documented integrations. Use at your own risk; see the [API reference's disclaimer](https://github.com/sobakintech/tamo-dienynas-api#disclaimer).

## Tools

| Tool | What it returns |
| --- | --- |
| `get_schedule` | Lessons for a week: times, subject, teacher, topic, grades, formative assessments, homework, test labels |
| `get_grades` | Grades, formative assessments and attendance for a date range (up to 400 days) |
| `get_homework` | Homework with due dates, attachments and completion state, filterable by done / not done |
| `get_classwork` | What was done in lessons |
| `get_notifications` | The recent feed: new grades, homework, absences, praise, remarks |
| `get_school_calendar` | Holidays, breaks and school-wide events for a month |
| `list_messages` | Message list (sender, subject, unread). Bodies are not opened, because opening marks a message as read |
| `get_semester_grades` | Per-subject averages, final grades and marks for a semester or the year |

Nothing changes anything in TAMO: every tool is a read, no message is opened, and no homework is ticked. Dates are `YYYY-MM-DD` in Europe/Vilnius time.

The server logs in lazily, reuses the session, logs in again once if TAMO expires it, and caps how many requests it sends to TAMO per minute. Every call reads fresh data from TAMO; nothing is cached.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `TAMO_USERNAME`, `TAMO_PASSWORD` | yes | The student's TAMO login |
| `MCP_TOKEN` | yes | Bearer token for clients that send headers, on `/mcp` |
| `MCP_PATH_TOKEN` | yes | Secret path for clients that can't send headers (ChatGPT), on `/<MCP_PATH_TOKEN>/mcp` |
| `TAMO_ROLE` | no | Part of the role title to use if the account has several roles |
| `PORT` | no | Default `8000` |
| `MAX_TAMO_REQUESTS_PER_MINUTE` | no | Default `30` |

Generate tokens with `openssl rand -hex 32`. `/healthz` answers without authentication.

## Run

Node 22 or newer:

```sh
npm ci
npm test
npm run build
npm start
```

There is no Dockerfile. Buildpack-style builders such as [Railpack](https://railpack.com) detect the Node project and use the `build` and `start` scripts.

Clients connect to `http://<host>:8000/mcp` with `Authorization: Bearer <MCP_TOKEN>`. Clients that only take a URL use `http://<host>:8000/<MCP_PATH_TOKEN>/mcp` with no authentication; treat that URL like a password.
