# Devlens

A real-time developer dashboard for git diff viewing, task management, and Claude Code integration.

Devlens gives you a web-based UI to monitor file changes, manage Claude Code tasks on a kanban board, control Claude's behavior with project rules, and approve commits — all in one place. It auto-starts with every Claude Code session and runs on a unique port per project.

[![npm version](https://img.shields.io/npm/v/@ycniuqton/devlens.svg)](https://www.npmjs.com/package/@ycniuqton/devlens)

## Features

- **Real-time Git Diffs** — Live syntax-highlighted diffs (unified or split), folder tree or flat view, file status badges (M/A/D/U/R), word wrap toggle
- **Task Board** — Kanban with Pending / In Progress / Completed / Archived columns, drag-and-drop, auto-archive after 1 hour
- **Claude Code Integration** — Auto-syncs `TaskCreate`/`TaskUpdate` from Claude Code via PostToolUse hooks. Captures rich context: user prompt, Claude's reasoning, files touched, completion summary
- **Rules Management** — Edit `.devlens/rules.md` from the dashboard. Toggle rules on/off, add presets, the default git-commit guard rule is protected
- **Commit Approval Flow** — Claude pauses for approval before committing; approve/reject from the dashboard
- **External Integrations** — Connect Jira / Linear to pull issues
- **Tunnel Support** — Cloudflare or ngrok for remote dashboard access
- **SQLite Storage** — Tasks stored in `.devlens/devlens.db`
- **Per-project Ports** — Each project gets a stable port derived from its path hash (range 4700-5700)
- **Slash Command** — Type `/devlens` inside Claude Code to see the dashboard URL

## Installation

### One-liner (install + init in current project)

```bash
npm install @ycniuqton/devlens@latest && npx devlens init
```

Run this in any project directory — installs the latest version locally and sets up Devlens hooks for that project. Re-run anytime to upgrade.

### Global install

```bash
npm install -g @ycniuqton/devlens
devlens init
```

### Without installing — use `npx`

> **Note:** the package is scoped. Plain `npx devlens` will install an unrelated package with the same name. Use the `--package` form:

```bash
npx --package=@ycniuqton/devlens -- devlens init
npx --package=@ycniuqton/devlens -- devlens start
```

## Quick Start

### 1. Initialize in your project

```bash
cd /path/to/your/project
devlens init
```

This is a one-time setup that:
- Installs Claude Code hooks into `.claude/hooks/` (auto-start + task sync)
- Creates `.devlens/rules.md` with a default git-commit guard rule
- Adds a `## Devlens` block to `CLAUDE.md` so Claude reads your rules
- Creates a `/devlens` slash command skill
- Picks a stable port for this project (printed at the end)

After init, the dashboard auto-starts whenever you open a Claude Code session in this project.

### 2. Start the dashboard manually (optional)

```bash
devlens start
```

It will pick the same port `init` chose. Open your browser to the URL it prints.

### 3. Use the dashboard

| Tab | What it does |
|-----|-------------|
| **Diffs** | Live git diff viewer. Click a file to expand. Toggle split/unified, word wrap, folder/flat list view. |
| **Tasks** | Kanban board synced from Claude Code. Click a card to see context: user prompt, Claude's reasoning, files touched. |
| **Rules** | Toggle/add/remove rules in `.devlens/rules.md`. Approve commit requests when Claude pauses. |
| **Integrations** | Connect Jira / Linear. Enable Cloudflare or ngrok tunnel for remote access. |

### 4. Inside Claude Code

Type `/devlens` to see the dashboard URLs (local + network).

## CLI Reference

### `devlens init`

One-time setup for a project. Idempotent — safe to re-run.

```bash
devlens init [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port <number>` | (auto) | Override the auto-derived port |
| `-d, --dir <path>` | `cwd` | Project directory |

What gets created:
- `.claude/hooks/devlens-startup.sh` — auto-launches dashboard on session start
- `.claude/hooks/devlens-sync.sh` — syncs tasks via PostToolUse
- `.claude/settings.json` — registers `SessionStart` and `PostToolUse` hooks
- `.claude/skills/devlens/SKILL.md` — `/devlens` slash command
- `.devlens/rules.md` — default rules with protected git-commit guard
- `CLAUDE.md` — appended with `## Devlens\nRead and follow all rules in .devlens/rules.md`
- `.gitignore` — `.claude/hooks/` added if missing

### `devlens start`

Start the dashboard server.

```bash
devlens start [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port <number>` | (auto) | Port to listen on (default: derived from project path) |
| `--no-open` | — | Don't auto-open browser |
| `--tunnel` | — | Start Cloudflare tunnel for remote access |
| `-d, --dir <path>` | `cwd` | Project directory to analyze |

### `devlens status`

Show whether the dashboard is running and on which URLs.

```bash
devlens status
```

Returns local + network URLs, PID, and start time. Reads `.devlens/runtime.json` written by the running server.

### `devlens uninstall`

Remove all Devlens hooks/skills/rules from a project. Does **not** delete `.devlens/` data (tasks, rules).

```bash
devlens uninstall [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-d, --dir <path>` | `cwd` | Project directory |

## Project Layout (after init)

```
your-project/
├── .claude/
│   ├── settings.json          # Claude hooks config
│   ├── hooks/
│   │   ├── devlens-startup.sh  # SessionStart → auto-launch dashboard
│   │   └── devlens-sync.sh     # PostToolUse → sync tasks
│   └── skills/devlens/SKILL.md # /devlens slash command
├── .devlens/
│   ├── devlens.db              # SQLite store (tasks, sessions)
│   ├── rules.md                # Editable rules for Claude
│   ├── runtime.json            # Active server PID/port (auto-managed)
│   ├── commit-pending.md       # Commit waiting approval (auto-managed)
│   └── commit-approved.md      # Approved commit signal (auto-managed)
└── CLAUDE.md                   # Devlens block telling Claude to read rules.md
```

## Rules Management

`.devlens/rules.md` is a plain markdown file. Active rules are `- text`, inactive rules are `#- text`. The Rules tab in the dashboard provides:

- **Toggle switches** — comment/uncomment rules without deleting them
- **Quick-add presets** — common rules with one click
- **Delete** — for non-protected rules
- **Protected default rule** — the git-commit guard cannot be deleted, only toggled

### Commit Approval Flow

When you have a "no commit without approval" rule active:

1. Claude wants to commit → instead, it writes a TodoWrite with `WAITING_APPROVAL: <commit message>`
2. Devlens detects this and shows a banner in the Rules tab
3. You click **Approve Commit** in the dashboard
4. Devlens writes `.devlens/commit-approved.md`
5. Claude proceeds with the commit

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DEVLENS_PORT` | Override the port used by the auto-start hook |

### Jira Integration

In the **Integrations** tab, configure:
- **Base URL** — `https://yourteam.atlassian.net`
- **Email** — your Jira account email
- **API Token** — [Generate here](https://id.atlassian.com/manage-profile/security/api-tokens)
- **Project Key** — e.g., `PROJ`

### Linear Integration

In the **Integrations** tab, configure:
- **API Key** — [Generate here](https://linear.app/settings/api)
- **Team ID** (optional) — filter issues by team

### Tunnel (remote access)

From the Integrations tab, click **Start Tunnel** for Cloudflare or ngrok. The tunnel URL appears in the dashboard. Either binary must be installed:

```bash
# Cloudflare
brew install cloudflared    # macOS
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# ngrok
brew install ngrok          # macOS
# https://ngrok.com/download
```

## API Reference

REST endpoints (port varies per project — check `devlens status`):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/diff?filter=all\|staged\|unstaged` | GET | Unified diff + file list |
| `/api/status` | GET | Git file change status |
| `/api/log?limit=20` | GET | Recent commits |
| `/api/tasks?status=...` | GET | List tasks |
| `/api/tasks` | POST | Create task |
| `/api/tasks/:id` | PUT | Update task |
| `/api/tasks/:id` | DELETE | Delete task |
| `/api/tasks/sync` | POST | Webhook for Claude Code hook payloads |
| `/api/rules` | GET | List rules |
| `/api/rules` | POST | Add rule |
| `/api/rules/:index` | DELETE | Remove rule (rejects protected) |
| `/api/rules/:index/toggle` | PATCH | Toggle active/inactive |
| `/api/rules/commit-approval/status` | GET | Pending/approved commit state |
| `/api/rules/commit-approval/approve` | POST | Approve pending commit |
| `/api/rules/commit-approval/reject` | POST | Reject pending commit |
| `/api/integrations/status` | GET | Integration config + tunnel status |
| `/api/integrations/all` | GET | Merged Jira/Linear issues |
| `/api/integrations/tunnel/start` | POST | Start tunnel `{ provider: "cloudflare" \| "ngrok" }` |
| `/api/integrations/tunnel/stop` | POST | Stop tunnel |

WebSocket: `ws://localhost:<port>/ws` — broadcasts `diff-update`, `task-update`, `rules-update`, `commit-approval-update`.

## How Multi-Project Setup Works

You can run Devlens for **many projects on the same machine** without port collisions:

- Each project derives a stable port from `md5(projectPath) % 1000 + 4700`
- The auto-start hook detects if a server is already running on that port and reuses it
- Tasks for each project are isolated in `.devlens/devlens.db`
- Sessions filtered by `cwd` so the Tasks tab only shows the current project

## Development

```bash
git clone https://github.com/ycniuqton/Devlens.git
cd Devlens
npm install
npm run build
npm start
```

Watch mode:

```bash
npm run dev                          # Recompile on changes
node bin/devlens.js start --no-open  # Run from source
```

## License

MIT — see [LICENSE](LICENSE)

## Links

- **npm**: https://www.npmjs.com/package/@ycniuqton/devlens
- **GitHub**: https://github.com/ycniuqton/Devlens
- **Issues**: https://github.com/ycniuqton/Devlens/issues
