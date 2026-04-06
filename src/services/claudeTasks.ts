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

export interface ClaudeTaskFile {
  sessionId: string;
  highwatermark: number;
  lockExists: boolean;
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

  // TodoWrite sends an array of todos
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

// Watch ~/.claude/tasks/ for cross-session task changes
export function watchClaudeTasks(onChange: (sessions: ClaudeTaskFile[]) => void) {
  const tasksDir = path.join(os.homedir(), '.claude', 'tasks');

  if (!fs.existsSync(tasksDir)) {
    return null;
  }

  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = chokidar.watch(tasksDir, {
    persistent: true,
    ignoreInitial: true,
    depth: 2,
  });

  const debouncedOnChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const sessions = readClaudeTaskSessions(tasksDir);
      onChange(sessions);
    }, 300);
  };

  watcher.on('change', debouncedOnChange);
  watcher.on('add', debouncedOnChange);
  watcher.on('unlink', debouncedOnChange);

  return watcher;
}

// Read all session task directories
export function readClaudeTaskSessions(tasksDir?: string): ClaudeTaskFile[] {
  const dir = tasksDir || path.join(os.homedir(), '.claude', 'tasks');

  if (!fs.existsSync(dir)) return [];

  const sessions: ClaudeTaskFile[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const sessionDir = path.join(dir, entry.name);
      const hwFile = path.join(sessionDir, '.highwatermark');
      const lockFile = path.join(sessionDir, '.lock');

      let highwatermark = 0;
      if (fs.existsSync(hwFile)) {
        try {
          highwatermark = parseInt(fs.readFileSync(hwFile, 'utf-8').trim(), 10) || 0;
        } catch {}
      }

      sessions.push({
        sessionId: entry.name,
        highwatermark,
        lockExists: fs.existsSync(lockFile),
      });
    }
  } catch {}

  return sessions;
}
