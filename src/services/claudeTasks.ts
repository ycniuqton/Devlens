import fs from 'fs';
import path from 'path';
import os from 'os';
import chokidar from 'chokidar';

export interface ClaudeTodo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: string;
  updatedAt: string;
}

export interface ClaudeSession {
  sessionId: string;
  name?: string;
  cwd?: string;
  pid?: number;
  startedAt?: string;
  taskCount: number;
  active: boolean;
}

// In-memory store for todos received via hooks
const todos: Map<string, ClaudeTodo> = new Map();

export function getTodos(): ClaudeTodo[] {
  return Array.from(todos.values());
}

export function upsertTodo(todo: ClaudeTodo) {
  todos.set(todo.id, todo);
}

export function clearTodos() {
  todos.clear();
}

// Parse a TodoWrite hook payload into our todo format
export function parseTodoWritePayload(toolInput: any): ClaudeTodo[] {
  if (!toolInput) return [];

  const result: ClaudeTodo[] = [];
  const items = toolInput.todos || toolInput.items || (Array.isArray(toolInput) ? toolInput : [toolInput]);

  for (const item of items) {
    if (!item) continue;
    result.push({
      id: item.id || String(result.length),
      content: item.content || item.subject || item.title || item.text || JSON.stringify(item),
      status: mapTodoStatus(item.status),
      priority: item.priority,
      updatedAt: new Date().toISOString(),
    });
  }

  return result;
}

function mapTodoStatus(status: string | undefined): ClaudeTodo['status'] {
  if (!status) return 'pending';
  const s = status.toLowerCase();
  if (s.includes('progress') || s === 'in_progress') return 'in_progress';
  if (s.includes('complet') || s === 'done') return 'completed';
  return 'pending';
}

// Watch ~/.claude/tasks/ and ~/.claude/sessions/ for changes
export function watchClaudeTasks(onChange: (sessions: ClaudeSession[]) => void) {
  const claudeDir = path.join(os.homedir(), '.claude');
  const tasksDir = path.join(claudeDir, 'tasks');
  const sessionsDir = path.join(claudeDir, 'sessions');

  if (!fs.existsSync(tasksDir)) return null;

  let debounceTimer: NodeJS.Timeout | null = null;

  const watchPaths = [tasksDir];
  if (fs.existsSync(sessionsDir)) watchPaths.push(sessionsDir);

  const watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    depth: 2,
  });

  const debouncedOnChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const sessions = readClaudeSessions();
      onChange(sessions);
    }, 300);
  };

  watcher.on('change', debouncedOnChange);
  watcher.on('add', debouncedOnChange);
  watcher.on('unlink', debouncedOnChange);

  return watcher;
}

// Read session metadata from ~/.claude/sessions/*.json
function readSessionMetadata(): Map<string, { name?: string; cwd?: string; pid?: number; startedAt?: number }> {
  const sessionsDir = path.join(os.homedir(), '.claude', 'sessions');
  const metadata = new Map<string, any>();

  if (!fs.existsSync(sessionsDir)) return metadata;

  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf-8'));
        if (data.sessionId) {
          // Keep the latest entry per sessionId (multiple PIDs may share a session)
          const existing = metadata.get(data.sessionId);
          if (!existing || (data.startedAt && (!existing.startedAt || data.startedAt > existing.startedAt))) {
            metadata.set(data.sessionId, {
              name: data.name,
              cwd: data.cwd,
              pid: data.pid,
              startedAt: data.startedAt,
            });
          }
        }
      } catch {}
    }
  } catch {}

  return metadata;
}

// Read all Claude sessions with correlated metadata
export function readClaudeSessions(): ClaudeSession[] {
  const tasksDir = path.join(os.homedir(), '.claude', 'tasks');
  if (!fs.existsSync(tasksDir)) return [];

  const sessionMeta = readSessionMetadata();
  const sessions: ClaudeSession[] = [];

  try {
    const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const sessionDir = path.join(tasksDir, entry.name);
      const hwFile = path.join(sessionDir, '.highwatermark');
      const lockFile = path.join(sessionDir, '.lock');

      let taskCount = 0;
      if (fs.existsSync(hwFile)) {
        try {
          taskCount = parseInt(fs.readFileSync(hwFile, 'utf-8').trim(), 10) || 0;
        } catch {}
      }

      const meta = sessionMeta.get(entry.name);

      sessions.push({
        sessionId: entry.name,
        name: meta?.name,
        cwd: meta?.cwd,
        pid: meta?.pid,
        startedAt: meta?.startedAt ? new Date(meta.startedAt).toISOString() : undefined,
        taskCount,
        active: fs.existsSync(lockFile),
      });
    }
  } catch {}

  // Sort: active first, then by startedAt descending
  sessions.sort((a, b) => {
    if (a.active !== b.active) return b.active ? 1 : -1;
    if (a.startedAt && b.startedAt) return b.startedAt.localeCompare(a.startedAt);
    return 0;
  });

  return sessions;
}
