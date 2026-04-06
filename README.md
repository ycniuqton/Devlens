# Devlens

A real-time developer dashboard for git diff viewing, task management, and Claude Code integration.

Devlens gives you a web-based UI to monitor file changes, manage tasks on a kanban board, and sync activity from Claude Code sessions — all in one place.

## Features

- **Real-time Git Diffs** — Watch file changes live with syntax-highlighted diffs (unified or side-by-side)
- **Task Board** — Kanban-style board with Pending, In Progress, and Completed columns
- **Claude Code Integration** — Auto-sync tasks and todos from Claude Code sessions via hooks
- **External Integrations** — Connect Jira and Linear to pull issues into your dashboard
- **Cloudflare Tunnel** — Optional remote access via `cloudflared`

## Installation

```bash
npm install -g devlens
```

Or install locally in your project:

```bash
npm install --save-dev devlens
```

## Quick Start

### 1. Start the dashboard

```bash
devlens start
```

This opens your browser at `http://localhost:4700` with the dashboard.

### 2. Set up Claude Code hooks (optional)

If you use [Claude Code](https://claude.ai/claude-code), run this in your project directory to auto-sync tasks:

```bash
devlens init
```

This installs two hooks:
- **Auto-start** — Launches the dashboard when a Claude Code session begins
- **Task sync** — Sends task/todo updates to the dashboard in real-time

### 3. Browse the dashboard

- **Diffs tab** — See staged, unstaged, and untracked file changes with full diffs
- **Tasks tab** — Manage tasks on a kanban board; view Claude's current todos and session history
- **Integrations tab** — Configure Jira or Linear to pull external issues

## CLI Reference

### `devlens start`

Start the dashboard server.

```bash
devlens start [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port <number>` | `4700` | Port to listen on |
| `--no-open` | — | Don't auto-open browser |
| `--tunnel` | — | Enable Cloudflare Tunnel for remote access |
| `-d, --dir <path>` | Current directory | Project directory to analyze |

### `devlens init`

Install Claude Code hooks for automatic task sync.

```bash
devlens init [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port <number>` | `4700` | Devlens port for hooks to target |
| `-d, --dir <path>` | Current directory | Project directory |

What it does:
1. Creates `.claude/hooks/devlens-startup.sh` and `.claude/hooks/devlens-sync.sh`
2. Updates `.claude/settings.json` with `SessionStart` and `PostToolUse` hooks
3. Adds `.claude/hooks/` to `.gitignore`

### `devlens uninstall`

Remove Claude Code hooks from the project.

```bash
devlens uninstall [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-d, --dir <path>` | Current directory | Project directory |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVLENS_PORT` | `4700` | Port used by hook scripts |

### Jira Integration

In the **Integrations** tab, configure:
- **Host** — Your Jira instance URL (e.g., `https://yourteam.atlassian.net`)
- **Email** — Your Jira account email
- **API Token** — [Generate one here](https://id.atlassian.com/manage-profile/security/api-tokens)
- **Project Key** — The Jira project key (e.g., `PROJ`)

### Linear Integration

In the **Integrations** tab, configure:
- **API Key** — [Generate one here](https://linear.app/settings/api)
- **Team Key** (optional) — Filter issues by team

## API

Devlens exposes a REST API at `http://localhost:4700/api`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/diff` | GET | Git diff with file list (`?filter=all\|staged\|unstaged`) |
| `/api/status` | GET | File change status |
| `/api/log` | GET | Commit history (`?limit=20`) |
| `/api/tasks` | GET | List tasks (`?status=pending\|in-progress\|completed`) |
| `/api/tasks` | POST | Create a task (`{ title, status?, priority? }`) |
| `/api/tasks/:id` | PUT | Update a task |
| `/api/tasks/:id` | DELETE | Delete a task |
| `/api/tasks/sync` | POST | Webhook for Claude Code hook payloads |
| `/api/tasks/claude-todos` | GET | Current session todos |
| `/api/tasks/claude-sessions` | GET | Cross-session task data |
| `/api/integrations/status` | GET | Integration config status |
| `/api/integrations/all` | GET | Fetch all external issues |

A WebSocket is available at `ws://localhost:4700/ws` for real-time updates.

## Development

```bash
git clone https://github.com/ycniuqton/Devlens.git
cd Devlens
npm install
npm run build
npm start
```

For development with auto-recompilation:

```bash
npm run dev          # Watch mode — recompiles on changes
node bin/devlens.js start --no-open   # Run from source
```

## License

MIT
