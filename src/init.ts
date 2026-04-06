import fs from 'fs';
import path from 'path';

const SYNC_HOOK_SCRIPT = `#!/bin/bash
# Devlens Claude Code hook — syncs task changes to the Devlens dashboard
# Installed by: devlens init

DEVLENS_PORT=\${DEVLENS_PORT:-4700}
DEVLENS_URL="http://localhost:\$DEVLENS_PORT/api/tasks/sync"

INPUT=$(cat)

# POST the hook payload to Devlens sync endpoint
curl -s -X POST "\$DEVLENS_URL" \\
  -H "Content-Type: application/json" \\
  -d "\$INPUT" > /dev/null 2>&1 &

exit 0
`;

const STARTUP_HOOK_SCRIPT = `#!/bin/bash
# Devlens Claude Code hook — auto-starts the dashboard on session start
# Installed by: devlens init

DEVLENS_PORT=\${DEVLENS_PORT:-4700}
PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-.}"

# Check if Devlens is already running on this port
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:\$DEVLENS_PORT" 2>/dev/null | grep -q "200"; then
  exit 0
fi

# Find devlens binary — check common locations
DEVLENS_BIN=""
if command -v devlens &>/dev/null; then
  DEVLENS_BIN="devlens"
elif [ -f "\$PROJECT_DIR/dist/index.js" ]; then
  DEVLENS_BIN="node \$PROJECT_DIR/dist/index.js"
elif [ -f "\$PROJECT_DIR/node_modules/.bin/devlens" ]; then
  DEVLENS_BIN="\$PROJECT_DIR/node_modules/.bin/devlens"
fi

if [ -z "\$DEVLENS_BIN" ]; then
  exit 0
fi

# Start Devlens in background, detached from session
nohup \$DEVLENS_BIN start --dir "\$PROJECT_DIR" --port \$DEVLENS_PORT --no-open > /tmp/devlens.log 2>&1 &

# Wait briefly for server to come up
sleep 2

if curl -s -o /dev/null -w "%{http_code}" "http://localhost:\$DEVLENS_PORT" 2>/dev/null | grep -q "200"; then
  echo '{"additionalContext":"Devlens dashboard is running at http://localhost:'\$DEVLENS_PORT'"}'
fi

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
    PostToolUse?: HookEntry[];
  };
  [key: string]: any;
}

export function initDevlens(projectDir: string, port: number) {
  const claudeDir = path.join(projectDir, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const settingsFile = path.join(claudeDir, 'settings.json');
  const syncScriptPath = path.join(hooksDir, 'devlens-sync.sh');
  const startupScriptPath = path.join(hooksDir, 'devlens-startup.sh');

  // 1. Create .claude/hooks/ directory
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // 2. Write hook scripts
  const portStr = String(port);
  fs.writeFileSync(syncScriptPath, SYNC_HOOK_SCRIPT.replace('4700', portStr), { mode: 0o755 });
  console.log(`  Created hook: .claude/hooks/devlens-sync.sh (task sync)`);

  fs.writeFileSync(startupScriptPath, STARTUP_HOOK_SCRIPT.replace('4700', portStr), { mode: 0o755 });
  console.log(`  Created hook: .claude/hooks/devlens-startup.sh (auto-start)`);

  // 3. Update .claude/settings.json
  let settings: SettingsJson = {};
  if (fs.existsSync(settingsFile)) {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  // --- SessionStart hook: auto-start dashboard ---
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

  // --- PostToolUse hook: task sync ---
  if (!settings.hooks.PostToolUse) {
    settings.hooks.PostToolUse = [];
  }
  settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
    (h) => !h.hooks?.some((hk) => hk.command.includes('devlens-sync'))
  );
  settings.hooks.PostToolUse.push({
    matcher: 'TaskCreate|TaskUpdate|TodoWrite',
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
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.claude/hooks/')) {
      fs.appendFileSync(gitignorePath, '\n.claude/hooks/\n');
      console.log(`  Updated .gitignore`);
    }
  }

  console.log(`\n  Devlens hooks installed!`);
  console.log(`  - Dashboard auto-starts when Claude Code opens a session`);
  console.log(`  - Tasks auto-sync to the kanban board`);
  console.log(`  - Dashboard: http://localhost:${port}\n`);
}

export function uninstallDevlens(projectDir: string) {
  const claudeDir = path.join(projectDir, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const settingsFile = path.join(claudeDir, 'settings.json');

  // Remove hook scripts
  for (const script of ['devlens-sync.sh', 'devlens-startup.sh']) {
    const scriptPath = path.join(hooksDir, script);
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
      console.log(`  Removed: .claude/hooks/${script}`);
    }
  }

  // Remove hooks from settings
  if (fs.existsSync(settingsFile)) {
    const settings: SettingsJson = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));

    if (settings.hooks?.SessionStart) {
      settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
        (h) => !h.hooks?.some((hk) => hk.command.includes('devlens-startup'))
      );
      if (settings.hooks.SessionStart.length === 0) delete settings.hooks.SessionStart;
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
