import fs from 'fs';
import path from 'path';

const HOOK_SCRIPT = `#!/bin/bash
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

interface SettingsJson {
  hooks?: {
    PostToolUse?: Array<{
      matcher: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
  };
  [key: string]: any;
}

export function initDevlens(projectDir: string, port: number) {
  const claudeDir = path.join(projectDir, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const settingsFile = path.join(claudeDir, 'settings.json');
  const hookScriptPath = path.join(hooksDir, 'devlens-sync.sh');

  // 1. Create .claude/hooks/ directory
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // 2. Write the hook script
  const script = HOOK_SCRIPT.replace('4700', String(port));
  fs.writeFileSync(hookScriptPath, script, { mode: 0o755 });
  console.log(`  Created hook script: .claude/hooks/devlens-sync.sh`);

  // 3. Update .claude/settings.json
  let settings: SettingsJson = {};
  if (fs.existsSync(settingsFile)) {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.PostToolUse) {
    settings.hooks.PostToolUse = [];
  }

  // Remove any existing devlens hook entry
  settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
    (h) => !h.hooks.some((hk) => hk.command.includes('devlens-sync'))
  );

  // Add the devlens hook
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
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.claude/hooks/')) {
      fs.appendFileSync(gitignorePath, '\n.claude/hooks/\n');
      console.log(`  Updated .gitignore`);
    }
  }

  console.log(`\n  Devlens hooks installed. Tasks will sync to port ${port}.`);
  console.log(`  Run 'devlens start' to launch the dashboard.\n`);
}

export function uninstallDevlens(projectDir: string) {
  const claudeDir = path.join(projectDir, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const settingsFile = path.join(claudeDir, 'settings.json');
  const hookScriptPath = path.join(hooksDir, 'devlens-sync.sh');

  // Remove hook script
  if (fs.existsSync(hookScriptPath)) {
    fs.unlinkSync(hookScriptPath);
    console.log(`  Removed hook script: .claude/hooks/devlens-sync.sh`);
  }

  // Remove hook from settings
  if (fs.existsSync(settingsFile)) {
    const settings: SettingsJson = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    if (settings.hooks?.PostToolUse) {
      settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
        (h) => !h.hooks.some((hk) => hk.command.includes('devlens-sync'))
      );
      if (settings.hooks.PostToolUse.length === 0) {
        delete settings.hooks.PostToolUse;
      }
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
      console.log(`  Cleaned hooks from: .claude/settings.json`);
    }
  }

  console.log(`\n  Devlens hooks uninstalled.\n`);
}
