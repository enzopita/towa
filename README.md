<p align="center">
  <img src="assets/banner.png" alt="Towa 永久" width="100%">
</p>

<h1 align="center">Towa 永久</h1>

<p align="center">
  <em>A Discord bot that stays in your voice channel — forever.</em>
</p>

<p align="center">
  <a href="README.md">🇺🇸 English</a> ·
  <a href="README.pt-BR.md">🇧🇷 Português</a>
</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/runtime-Bun-000?logo=bun&logoColor=white">
  <img alt="discord.js" src="https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/storage-SQLite-003B57?logo=sqlite&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white">
</p>

---

**Towa** (永久, *"eternity"* in Japanese) joins a voice channel of your choice and never leaves.
It doesn't play anything — it just stays connected, 24/7. If it gets kicked, moved or disconnected,
it comes right back.

## ✨ Features

- 🔁 **Auto-reconnect** — returns after kicks, moves, network drops and gateway resumes, with exponential backoff.
- 🩺 **Watchdog** — periodically checks every guild and fixes any drift.
- 🔐 **Admin-only config** — only server administrators (or a user set in the env) can change settings.
- 💾 **Persistent** — per-guild settings in SQLite, restored on restart.
- ⚡ **Slash commands** — registered per guild on startup, overwriting any stale commands.
- 🎭 **Configurable presence** — status and activity from the environment.
- 📜 **Structured logs** — JSON logs (pino) in production, pretty logs in development.
- 🐳 **Tiny Docker image** — compiled into a single binary on top of Alpine.

## 🧭 Commands

| Command | Description | Permission |
| --- | --- | --- |
| `/voice set canal:<channel>` | Sets the voice channel and joins it | Admin |
| `/voice leave` | Leaves the channel and disables 24/7 | Admin |
| `/voice status` | Shows the current configuration | Everyone |

> "Admin" means the **Administrator** permission in the server, or the user set in `ADMIN_USER_ID`.

## 🚀 Getting started

### 1. Create the bot

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications) and copy the **bot token**.
2. Invite it with the `bot` and `applications.commands` scopes and the **View Channel** and **Connect** permissions.

### 2. Configure

```sh
cp .env.example .env
```

| Variable | Default | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | — | **Required.** Bot token |
| `ADMIN_USER_ID` | — | User allowed to change settings without Administrator |
| `BOT_STATUS` | `online` | `online` · `idle` · `dnd` · `invisible` |
| `ACTIVITY_TYPE` | `custom` | `playing` · `streaming` · `listening` · `watching` · `competing` · `custom` |
| `ACTIVITY_NAME` | — | Activity text (empty = no activity) |
| `ACTIVITY_URL` | — | Twitch/YouTube URL, required for `streaming` |
| `DATABASE_PATH` | `data/bot.sqlite` | SQLite file path |
| `LOG_LEVEL` | `info` | `trace` · `debug` · `info` · `warn` · `error` · `fatal` |
| `LOG_PRETTY` | `true` in dev | Human-readable logs instead of JSON |
| `RECONNECT_DELAY_MS` | `5000` | Base delay for the reconnect backoff |
| `CONNECT_TIMEOUT_MS` | `20000` | Max time to wait for a voice connection |
| `WATCHDOG_INTERVAL_MS` | `60000` | Interval of the periodic health check |

Every variable is validated on startup. Invalid values stop the bot with a clear error message.

### 3. Run

**With Docker (recommended)**

```sh
docker compose up -d --build
docker compose logs -f
```

**With Bun**

```sh
bun install
bun dev     # watch mode, pretty logs
bun start   # plain run
```

## 🗂️ Project structure

```
src/
├── index.ts              # bootstrap & graceful shutdown
├── config.ts             # typed, validated env (zod)
├── logger.ts             # structured logging (pino)
├── db.ts                 # SQLite persistence (bun:sqlite)
├── voice/manager.ts      # connection lifecycle, reconnect & watchdog
├── commands/             # slash commands, permissions & registration
└── events/               # Discord event handlers
```
