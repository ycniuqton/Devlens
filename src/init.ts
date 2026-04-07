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
# Devlens — stop dashboard on Claude Code session end
# Reads stdin to satisfy hook protocol
cat > /dev/null 2>&1

PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-$PWD}"
RUNTIME_FILE="\$PROJECT_DIR/.devlens/runtime.json"

[ ! -f "\$RUNTIME_FILE" ] && exit 0

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
    SessionStart?: HookEntry[];
    SessionEnd?: HookEntry[];
    PostToolUse?: HookEntry[];
  };
  [key: string]: any;
}

// Find and kill any existing devlens process for this project dir
function killExistingDevlens(projectDir: string): boolean {
  try {
    const ps = require('child_process').execSync('ps -eo pid,args', { encoding: 'utf-8' });
    const re = new RegExp(`node.*(devlens|dist/index\\.js).*--dir[= ]?${projectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([ /]|$)`);
    const lines = ps.split('\n');
    let killed = false;
    for (const line of lines) {
      if (line.includes('grep')) continue;
      if (!re.test(line)) continue;
      const pid = parseInt(line.trim().split(/\s+/)[0], 10);
      if (!pid) continue;
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
  console.log(`  Updated hooks config: .claude/settings.json`);

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

  // 7. Create .devlens/rules.md with default rule
  const devlensProjectDir = path.join(resolvedDir, '.devlens');
  if (!fs.existsSync(devlensProjectDir)) {
    fs.mkdirSync(devlensProjectDir, { recursive: true });
  }
  const rulesPath = path.join(devlensProjectDir, 'rules.md');
  if (!fs.existsSync(rulesPath)) {
    const defaultRules = `# Devlens Rules
- Do not run git commit or git push under any circumstances. Only proceed after receiving an explicit user instruction, and clearly indicate before performing the commit.
`;
    fs.writeFileSync(rulesPath, defaultRules);
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

  // Remove skill
  const skillDir = path.join(claudeDir, 'skills', 'devlens');
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true });
    console.log(`  Removed: .claude/skills/devlens`);
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
