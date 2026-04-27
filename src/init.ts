import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Derive a stable port from the project directory path (range 4700-5700)
export function portFromDir(dir: string): number {
  const hash = crypto.createHash('md5').update(path.resolve(dir)).digest();
  return 4700 + (hash.readUInt16BE(0) % 1000);
}

const SYNC_HOOK_SCRIPT = `#!/bin/bash
# Devlens Claude Code hook — syncs task changes to the Devlens dashboard
# Installed by: devlens init

DEVLENS_PORT=__PORT__
DEVLENS_URL="http://localhost:\$DEVLENS_PORT/api/tasks/sync"

INPUT=$(cat)

# POST the hook payload to Devlens sync endpoint
curl -s -X POST "\$DEVLENS_URL" \\
  -H "Content-Type: application/json" \\
  -d "\$INPUT" > /dev/null 2>&1 &

exit 0
`;

const SHUTDOWN_HOOK_SCRIPT = `#!/bin/bash
# Devlens — stop dashboard on Claude Code session end (only if no other sessions remain in this folder)
INPUT=$(cat 2>/dev/null)

PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-$PWD}"
RUNTIME_FILE="\$PROJECT_DIR/.devlens/runtime.json"
SESSIONS_DIR="\$HOME/.claude/sessions"

[ ! -f "\$RUNTIME_FILE" ] && exit 0

# Identify the exiting session so we can exclude it from the live-count
EXITING_SESSION_ID=$(echo "\$INPUT" | grep -oE '"session_id":"[^"]*"' | sed 's/"session_id":"//;s/"$//' | head -1)
EXITING_PID=""
if [ -n "\$EXITING_SESSION_ID" ] && [ -d "\$SESSIONS_DIR" ]; then
  for f in "\$SESSIONS_DIR"/*.json; do
    [ -f "\$f" ] || continue
    if grep -q "\\"sessionId\\":\\"\$EXITING_SESSION_ID\\"" "\$f" 2>/dev/null; then
      EXITING_PID=$(grep -oE '"pid":[0-9]+' "\$f" | grep -oE '[0-9]+' | head -1)
      break
    fi
  done
fi

# Are there OTHER live Claude sessions for this same project directory?
OTHER_ALIVE=0
if [ -d "\$SESSIONS_DIR" ]; then
  for f in "\$SESSIONS_DIR"/*.json; do
    [ -f "\$f" ] || continue
    SPID=$(grep -oE '"pid":[0-9]+' "\$f" | grep -oE '[0-9]+' | head -1)
    SCWD=$(grep -oE '"cwd":"[^"]*"' "\$f" | sed 's/"cwd":"//;s/"$//' | head -1)
    [ -z "\$SPID" ] && continue
    [ "\$SCWD" != "\$PROJECT_DIR" ] && continue
    [ -n "\$EXITING_PID" ] && [ "\$SPID" = "\$EXITING_PID" ] && continue
    if kill -0 "\$SPID" 2>/dev/null; then
      OTHER_ALIVE=1
      break
    fi
  done
fi

# Other Claude sessions still running in this folder — keep devlens alive
if [ "\$OTHER_ALIVE" = "1" ]; then
  exit 0
fi

PID=$(grep -oE '"pid"[[:space:]]*:[[:space:]]*[0-9]+' "\$RUNTIME_FILE" 2>/dev/null | grep -oE "[0-9]+" | head -1)
[ -z "\$PID" ] && exit 0

# Verify the process is actually our devlens for this dir
if ps -p "\$PID" -o args= 2>/dev/null | grep -qE "(devlens|dist/index\\.js).*--dir[= ]?\$PROJECT_DIR"; then
  kill "\$PID" 2>/dev/null
  for i in 1 2 3; do
    sleep 0.5
    kill -0 "\$PID" 2>/dev/null || break
  done
  kill -0 "\$PID" 2>/dev/null && kill -9 "\$PID" 2>/dev/null
  rm -f "\$RUNTIME_FILE"
fi
exit 0
`;

const STARTUP_HOOK_SCRIPT = `#!/bin/bash
# Devlens — auto-start dashboard on Claude Code session start
DEVLENS_PORT=__PORT__
PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-.}"
RUNTIME_FILE="\$PROJECT_DIR/.devlens/runtime.json"

# Build the URL list (always available — port is deterministic)
LOCAL_URL="http://localhost:\$DEVLENS_PORT"
NETWORK_URLS=""
for ip in \$(hostname -I 2>/dev/null || true); do
  case "\$ip" in
    127.*|::1|fe80*|*:*) continue ;;
    *) NETWORK_URLS="\$NETWORK_URLS http://\$ip:\$DEVLENS_PORT" ;;
  esac
done

emit_context() {
  local status="\$1"
  local msg="DEVLENS_DASHBOARD_URL: \$LOCAL_URL (network:\$NETWORK_URLS) — status: \$status. When the user asks about devlens dashboard URL/link/address, answer with this URL directly without running any command."
  echo "{\\"additionalContext\\":\\"\$msg\\"}"
}

# Already running?
if [ -f "\$RUNTIME_FILE" ] && curl -s -o /dev/null -w "%{http_code}" "\$LOCAL_URL" 2>/dev/null | grep -q "200"; then
  emit_context "running"
  exit 0
fi

# Find binary
BIN=""
command -v devlens &>/dev/null && BIN="devlens"
[ -z "\$BIN" ] && [ -f "\$PROJECT_DIR/dist/index.js" ] && BIN="node \$PROJECT_DIR/dist/index.js"
[ -z "\$BIN" ] && [ -f "\$PROJECT_DIR/node_modules/.bin/devlens" ] && BIN="\$PROJECT_DIR/node_modules/.bin/devlens"

if [ -z "\$BIN" ]; then
  emit_context "binary-not-found"
  exit 0
fi

# Start in background
nohup \$BIN start --dir "\$PROJECT_DIR" --port \$DEVLENS_PORT --no-open > /tmp/devlens-\$DEVLENS_PORT.log 2>&1 &

# Wait up to 5s for runtime.json to appear
for i in 1 2 3 4 5; do
  sleep 1
  if [ -f "\$RUNTIME_FILE" ]; then
    emit_context "started"
    exit 0
  fi
done

emit_context "starting-in-background"
exit 0
`;

interface HookEntry {
  matcher?: string;
  type?: string;
  command?: string;
  hooks?: Array<{ type: string; command: string }>;
}

interface SettingsJson {
  hooks?: {
    PreToolUse?: HookEntry[];
    SessionStart?: HookEntry[];
    SessionEnd?: HookEntry[];
    PostToolUse?: HookEntry[];
  };
  [key: string]: any;
}

interface ShortSkillDef {
  name: string;
  lines: number;
}

const SHORT_SKILLS: ShortSkillDef[] = [
  { name: 'ss', lines: 50 },
  { name: 'ss20', lines: 20 },
  { name: 'ss30', lines: 30 },
];

function shortSkillContent(name: string, lines: number): string {
  return `---
name: ${name}
description: Short response mode — answer/explain only, no code, output ≤ ${lines} lines
---

This prompt uses /${name} short-response mode. Follow these constraints for your entire reply:
- Answer or explain only — do not write, generate, or suggest any code
- Output must be ≤ ${lines} lines total
- Be concise and direct; omit preamble and trailing summaries
`;
}

function writeShortResponseSkills(claudeDir: string): void {
  for (const skill of SHORT_SKILLS) {
    const dir = path.join(claudeDir, 'skills', skill.name);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, 'SKILL.md'), shortSkillContent(skill.name, skill.lines));
    console.log(`  Created skill: .claude/skills/${skill.name} (use /${skill.name} in Claude)`);
  }
}

const DOC_SKILLS: Record<string, string> = {
  sumu: `---
name: sumu
description: Merge all version docs of a feature or system into one consolidated version, then delete old sub-versions
---

The user wants to consolidate a feature or system's documentation history into a single up-to-date version.

## Steps

1. **Identify the domain and name.** Use the name from the prompt.
   - If domain not specified, ask: \`/docs/features/\` or \`/docs/systems/\`?
   - If name not provided, list all folders under the domain and ask the user to pick one.

2. **Read all version folders** under the chosen path, sorted numerically ascending. Read every file inside each version.

3. **Synthesize one consolidated doc set** from all versions:
   - \`01-requirements.md\` — final, current requirements only. No history duplication. Max 100 lines.
   - \`02-design.md\` — complete current design, absorbing all changes across versions. No line limit.
   - \`03-plan.md\` — current execution state only (pending/in-progress steps). Max 100 lines.

4. **Determine the new version folder name:**
   - Find the highest numeric version folder name
   - New version = highest + 1 (zero-padded to 5 digits, e.g. \`00004\` → \`00005\`)
   - Always use a plain numeric name — no reset naming, no special suffix, no cycle tracking

5. **Print the list of folders that will be deleted**, e.g.:
   \`\`\`
   Deleting: 00000-init, 00001, 00002, 00003, 00004
   Creating: 00005
   \`\`\`

6. **Write the new version folder** with the 3 consolidated files.

7. **Delete all old version folders** — no confirmation needed, just proceed.

8. **Report** the new active version and confirm old versions were removed.

## Constraints
- Follow all Feature & System Documentation rules from \`.devlens/rules.md\`
- Never create more than 3 files per version folder
- Requirements and plan must stay ≤ 100 lines after consolidation — summarize if needed
- Do not keep any CURRENT/active marker files
- After sumu, version count resets to 1 — the new folder is the only version remaining
`,
  newv: `---
name: newv
description: Create a new version for an existing feature or system under /docs/features/ or /docs/systems/, following versioning and line-limit rules
---

The user wants to add a new version to an existing feature or system's documentation.

## Steps

1. **Identify the domain and name.** Use the name from the prompt.
   - If domain not specified, check both \`/docs/features/\` and \`/docs/systems/\` — if found in one, use it. If ambiguous, ask the user.
   - If name not provided, list all folders under both domains and ask the user to pick one.

2. **Run the pre-write checklist** (from \`.devlens/rules.md\`):
   - Confirm the folder exists under the correct domain
   - List all version folders, find the highest numeric one — that is the active version
   - Count total versions
   - If any check fails → stop and ask the user before proceeding

3. **Determine the new version folder name:**
   - If total versions < 5: next increment (e.g. active is \`00002\` → new is \`00003\`)
   - If total versions == 5: the next change MUST be a reset. Create \`10000-reset\` as a fully self-contained new baseline. Inform the user this is a reset version.

4. **Ask the user** what changed in this version (if not already described in the prompt).

5. **Write the new version folder** with only the changed content:
   - \`01-requirements.md\` — only what changed + explicit statement of what remains unchanged. Max 100 lines.
   - \`02-design.md\` — only design changes. No line limit.
   - \`03-plan.md\` — updated execution steps for this version. Max 100 lines.
   - For a reset version, all 3 files must be fully self-contained.

6. **Report** the new version folder name and confirm the active version.

## Constraints
- Follow all Feature & System Documentation rules from \`.devlens/rules.md\`
- Never create more than 3 files per version folder
- Never skip version numbers unless user explicitly instructs
- If any pre-write check fails, stop and ask the user
`,
  newf: `---
name: newf
description: Create a new feature or system documentation folder under /docs/features/ or /docs/systems/ with the initial version
---

The user wants to start documentation for a new feature or system.

## Steps

1. **Identify the domain and name.** Use the name from the prompt.
   - If domain not specified, ask: is this a feature (\`/docs/features/\`) or a system (\`/docs/systems/\`)?
   - Feature name used as the folder name (kebab-case, derived from business intent)

2. **Confirm** the folder does not already exist under the chosen domain. If it does, stop and tell the user to use \`/newv\` instead.

3. **Create the initial version folder:** \`<domain>/<feature-name>/00000-init/\`

4. **Write the 3 required files** based on the description from the prompt:
   - \`01-requirements.md\` — business intent, functional requirements, constraints. Max 100 lines.
   - \`02-design.md\` — initial design, architecture, flows. No line limit.
   - \`03-plan.md\` — initial execution steps / checklist. Max 100 lines.
   - If the user has not provided enough detail, write minimal stubs and note what needs to be filled in.

5. **Report** the created path and confirm the active version is \`00000-init\`.

## Constraints
- Follow all Feature & System Documentation rules from \`.devlens/rules.md\`
- Folder name must be kebab-case, derived from business intent (not implementation)
- Never create more than 3 files in the version folder
- Requirements and plan must stay ≤ 100 lines
- If any check fails → stop and ask the user before proceeding
`,
};

function writeDocManagementSkills(claudeDir: string): void {
  for (const [name, content] of Object.entries(DOC_SKILLS)) {
    const dir = path.join(claudeDir, 'skills', name);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, 'SKILL.md'), content);
    console.log(`  Created skill: .claude/skills/${name} (use /${name} in Claude)`);
  }
}

const DEFAULT_RULES = `# Devlens Rules

## Commit Guard (protected)
- Do not run git commit or git push under any circumstances. Only proceed after receiving an explicit user instruction, and clearly indicate before performing the commit.

## Coding Rules
- Rule 1: Functions ≤ 50 lines, decompose into business steps
- Rule 2: Max 3 levels of if/else/switch nesting per function
- Rule 3: Max 3 levels of loop nesting; no helper functions — extract into domain-based classes only
- Rule 4: Body of any if/else/loop ≤ 15 lines
- Rule 5: Divide logic by business/processing steps; one step = one domain method
- Rule 6: Business logic reachable within 3 trace steps (no long forwarding chains)
- Rule 7: Max 3 levels of class inheritance
- Rule 8: Comments only at function/class/module top — never inside function bodies
- Rule 9: Function docs max 3 lines, describe intent not implementation
- Rule 10: Fix structure instead of adding inline comments
- Rule 11: Design classes for future features, not just current requirements
- Rule 12: Concrete implementations must not be entry points; business logic never depends on concrete classes
- Rule 13: Every extensible domain needs a base class; all implementations inherit from it
- Rule 14: Each extensible domain needs a Manager service; business logic talks only to Manager
- Rule 15: Implementation selection must be configurable — no if/switch on concrete types
- Rule 16: Prefer class-based handlers over functions
- Rule 17: No magic strings or numbers — all values belong to a domain
- Rule 18: Use enums or domain constant classes — no standalone constants
- Rule 19: Always ask "what business concept does this belong to?"
- Rule 20: Follow modern language conventions; these rules extend/override them
- Rule 0 (override): Business requirements have absolute priority — ask user if any rule conflicts

## Feature & System Documentation
- Docs live under /docs/features/<name>/<version>/ or /docs/systems/<name>/<version>/
- Active version = highest numeric folder (no CURRENT/active marker files)
- First version named 00000-init; increments 00001, 00002 … max 5 versions total
- At 6th version create 10000-reset (fully self-contained new baseline); then continue 10001, 10002 …
- Each version folder contains ONLY: 01-requirements.md (≤100 lines), 02-design.md (no limit), 03-plan.md (≤100 lines)
- Incremental versions write only what changed; state what is unchanged; do not copy full previous content
- If active version cannot be understood alone, reset is required
- Before writing docs run checklist: correct domain, correct name, active = max folder, versions ≤ 5, files ≤ 3, line limits respected — if any check fails → stop and ask the user before proceeding
`;

// Find and kill any existing devlens server process for this project dir
function killExistingDevlens(projectDir: string): boolean {
  try {
    const ps = require('child_process').execSync('ps -eo pid,args', { encoding: 'utf-8' });
    // Must contain "start" (the server subcommand) AND --dir <project>; excludes "init"/"uninstall"
    const re = new RegExp(`node.*(devlens|dist/index\\.js)\\s+start\\s.*--dir[= ]?${projectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([ /]|$)`);
    const lines = ps.split('\n');
    let killed = false;
    const selfPid = process.pid;
    for (const line of lines) {
      if (line.includes('grep')) continue;
      if (!re.test(line)) continue;
      const pid = parseInt(line.trim().split(/\s+/)[0], 10);
      if (!pid) continue;
      if (pid === selfPid) continue;
      try {
        process.kill(pid, 'SIGTERM');
        killed = true;
        console.log(`  Stopped existing devlens process (PID ${pid})`);
        // Give it a moment to exit cleanly
        const start = Date.now();
        while (Date.now() - start < 1500) {
          try { process.kill(pid, 0); } catch { break; }
          require('child_process').execSync('sleep 0.1');
        }
        try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch {}
      } catch {}
    }
    // Clean up stale runtime.json
    const runtimeFile = path.join(projectDir, '.devlens', 'runtime.json');
    if (fs.existsSync(runtimeFile)) {
      try { fs.unlinkSync(runtimeFile); } catch {}
    }
    return killed;
  } catch {
    return false;
  }
}

export function initDevlens(projectDir: string, port?: number) {
  const resolvedDir = path.resolve(projectDir);
  const derivedPort = port || portFromDir(resolvedDir);

  // Kill any existing devlens process for this project so the new init takes effect
  killExistingDevlens(resolvedDir);

  const claudeDir = path.join(resolvedDir, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const settingsFile = path.join(claudeDir, 'settings.json');
  const syncScriptPath = path.join(hooksDir, 'devlens-sync.sh');
  const startupScriptPath = path.join(hooksDir, 'devlens-startup.sh');
  const shutdownScriptPath = path.join(hooksDir, 'devlens-shutdown.sh');

  // 1. Create .claude/hooks/ directory
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // 2. Write hook scripts with the project-specific port
  const portStr = String(derivedPort);

  fs.writeFileSync(syncScriptPath, SYNC_HOOK_SCRIPT.replace('__PORT__', portStr), { mode: 0o755 });
  console.log(`  Created hook: .claude/hooks/devlens-sync.sh (task sync)`);

  fs.writeFileSync(startupScriptPath, STARTUP_HOOK_SCRIPT.replace(/__PORT__/g, portStr), { mode: 0o755 });
  console.log(`  Created hook: .claude/hooks/devlens-startup.sh (auto-start)`);

  fs.writeFileSync(shutdownScriptPath, SHUTDOWN_HOOK_SCRIPT, { mode: 0o755 });
  console.log(`  Created hook: .claude/hooks/devlens-shutdown.sh (auto-stop)`);

  // 3. Update .claude/settings.json
  let settings: SettingsJson = {};
  if (fs.existsSync(settingsFile)) {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  // --- SessionStart hook ---
  if (!settings.hooks.SessionStart) {
    settings.hooks.SessionStart = [];
  }
  settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
    (h) => !h.command?.includes('devlens-startup') && !h.hooks?.some((hk) => hk.command.includes('devlens-startup'))
  );
  settings.hooks.SessionStart.push({
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: `"$CLAUDE_PROJECT_DIR"/.claude/hooks/devlens-startup.sh`,
      },
    ],
  });

  // --- SessionEnd hook ---
  if (!settings.hooks.SessionEnd) {
    settings.hooks.SessionEnd = [];
  }
  settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
    (h) => !h.command?.includes('devlens-shutdown') && !h.hooks?.some((hk) => hk.command.includes('devlens-shutdown'))
  );
  settings.hooks.SessionEnd.push({
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: `"$CLAUDE_PROJECT_DIR"/.claude/hooks/devlens-shutdown.sh`,
      },
    ],
  });

  // --- PreToolUse hook — block git commit / npm publish without user permission ---
  if (!settings.hooks.PreToolUse) {
    settings.hooks.PreToolUse = [];
  }
  const COMMIT_GUARD_CMD = `cmd=$(jq -r '.tool_input.command // ""' 2>/dev/null); if echo "$cmd" | grep -qE '(^|&&|;|\\|\\|)\\s*(git commit|npm publish)'; then echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"⚠️ Rule reminder: do not commit or publish without explicit user permission."},"continue":true}'; fi`;
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
    (h) => !h.hooks?.some((hk) => hk.command?.includes('git commit') || hk.command?.includes('npm publish'))
  );
  settings.hooks.PreToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: COMMIT_GUARD_CMD }],
  });

  // --- PostToolUse hook ---
  if (!settings.hooks.PostToolUse) {
    settings.hooks.PostToolUse = [];
  }
  settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
    (h) => !h.hooks?.some((hk) => hk.command.includes('devlens-sync'))
  );
  settings.hooks.PostToolUse.push({
    matcher: 'TaskCreate|TaskUpdate',
    hooks: [
      {
        type: 'command',
        command: `"$CLAUDE_PROJECT_DIR"/.claude/hooks/devlens-sync.sh`,
      },
    ],
  });

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  console.log(`  Updated hooks config: .claude/settings.json (commit/publish guard + task sync)`);

  // 4. Add .claude/hooks/ to .gitignore if not already there
  const gitignorePath = path.join(resolvedDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.claude/hooks/')) {
      fs.appendFileSync(gitignorePath, '\n.claude/hooks/\n');
      console.log(`  Updated .gitignore`);
    }
  }

  // 5. Create /devlens slash command skill
  const skillDir = path.join(claudeDir, 'skills', 'devlens');
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }
  const skillContent = `---
name: devlens
description: Show the Devlens dashboard URL and status for the current project
---

Show the Devlens dashboard URLs for the current project by inspecting running processes (no AI reasoning needed — just print whatever the script returns):

\`\`\`!
DIR="\${CLAUDE_PROJECT_DIR:-$PWD}"
# Match any node process running devlens (binary, dist/index.js, or symlink) for this dir
PROC=$(ps -eo pid,args 2>/dev/null | grep -E "node.*(devlens|dist/index\\.js).*start.*--dir[= ]?\${DIR}([ /]|$)" | grep -v grep | head -1)

if [ -z "$PROC" ]; then
  echo "DEVLENS_NOT_RUNNING for \${DIR}"
  exit 0
fi

PID=$(echo "$PROC" | awk '{print $1}')
PORT=$(echo "$PROC" | grep -oE -- "--port[= ]?[0-9]+" | grep -oE "[0-9]+" | head -1)
[ -z "$PORT" ] && PORT=$(grep -oE '"port"[[:space:]]*:[[:space:]]*[0-9]+' "\${DIR}/.devlens/runtime.json" 2>/dev/null | grep -oE "[0-9]+" | head -1)

if [ -z "$PORT" ]; then
  echo "DEVLENS_RUNNING but could not determine port (PID $PID)"
  exit 0
fi

echo "DEVLENS_RUNNING"
echo "  PID:     $PID"
echo "  Project: \${DIR}"
echo "  Local:   http://localhost:\${PORT}"
for ip in $(hostname -I 2>/dev/null || true); do
  case "$ip" in
    127.*|::1|fe80*|*:*) continue ;;
    *) echo "  Network: http://\${ip}:\${PORT}" ;;
  esac
done
\`\`\`

Just print the script output verbatim. If it starts with \`DEVLENS_NOT_RUNNING\`, tell the user Devlens is not running for this project and suggest restarting the Claude Code session.
`;
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);
  console.log(`  Created skill: .claude/skills/devlens (use /devlens in Claude)`);

  // Create /ss, /ss20, /ss30 short-response skills
  writeShortResponseSkills(claudeDir);

  // Create /sumu, /newv, /newf doc management skills
  writeDocManagementSkills(claudeDir);

  // 6. Append the Devlens block to CLAUDE.md (idempotent)
  const claudeMdPath = path.join(resolvedDir, 'CLAUDE.md');
  const devlensBlock = '## Devlens\nRead and follow all rules in `.devlens/rules.md` before every action.\n';
  let existing = '';
  if (fs.existsSync(claudeMdPath)) {
    existing = fs.readFileSync(claudeMdPath, 'utf-8');
  }
  if (!existing.includes('## Devlens')) {
    const sep = existing && !existing.endsWith('\n') ? '\n\n' : (existing ? '\n' : '');
    fs.writeFileSync(claudeMdPath, existing + sep + devlensBlock);
    console.log(`  Updated CLAUDE.md with Devlens rules reference`);
  }

  // 7. Create .devlens/rules.md with default rules
  const devlensProjectDir = path.join(resolvedDir, '.devlens');
  if (!fs.existsSync(devlensProjectDir)) {
    fs.mkdirSync(devlensProjectDir, { recursive: true });
  }
  const rulesPath = path.join(devlensProjectDir, 'rules.md');
  if (!fs.existsSync(rulesPath)) {
    fs.writeFileSync(rulesPath, DEFAULT_RULES);
    console.log(`  Created .devlens/rules.md with default rules`);
  }

  // Get network IPs for display
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  console.log(`\n  \x1b[32m\x1b[1mDevlens installed!\x1b[0m\n`);
  console.log(`  \x1b[2mLocal:\x1b[0m   \x1b[1m\x1b[36mhttp://localhost:${derivedPort}\x1b[0m`);
  for (const ip of ips) {
    console.log(`  \x1b[2mNetwork:\x1b[0m \x1b[1m\x1b[36mhttp://${ip}:${derivedPort}\x1b[0m`);
  }
  console.log(`\n  Dashboard auto-starts when Claude Code opens a session.`);
  console.log(`  Tasks and todos sync automatically via hooks.\n`);
}

export function uninstallDevlens(projectDir: string) {
  const claudeDir = path.join(projectDir, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const settingsFile = path.join(claudeDir, 'settings.json');

  // Remove skills
  for (const skillName of ['devlens', ...SHORT_SKILLS.map((s) => s.name), ...Object.keys(DOC_SKILLS)]) {
    const skillDir = path.join(claudeDir, 'skills', skillName);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true });
      console.log(`  Removed: .claude/skills/${skillName}`);
    }
  }

  for (const script of ['devlens-sync.sh', 'devlens-startup.sh', 'devlens-shutdown.sh']) {
    const scriptPath = path.join(hooksDir, script);
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
      console.log(`  Removed: .claude/hooks/${script}`);
    }
  }

  if (fs.existsSync(settingsFile)) {
    const settings: SettingsJson = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));

    if (settings.hooks?.SessionStart) {
      settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
        (h) => !h.command?.includes('devlens-startup') && !h.hooks?.some((hk) => hk.command.includes('devlens-startup'))
      );
      if (settings.hooks.SessionStart.length === 0) delete settings.hooks.SessionStart;
    }

    if (settings.hooks?.SessionEnd) {
      settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
        (h) => !h.command?.includes('devlens-shutdown') && !h.hooks?.some((hk) => hk.command.includes('devlens-shutdown'))
      );
      if (settings.hooks.SessionEnd.length === 0) delete settings.hooks.SessionEnd;
    }

    if (settings.hooks?.PostToolUse) {
      settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
        (h) => !h.hooks?.some((hk) => hk.command.includes('devlens-sync'))
      );
      if (settings.hooks.PostToolUse.length === 0) delete settings.hooks.PostToolUse;
    }

    if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;

    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    console.log(`  Cleaned hooks from: .claude/settings.json`);
  }

  console.log(`\n  Devlens hooks uninstalled.\n`);
}
