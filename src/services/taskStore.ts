import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Task, CreateTaskInput, UpdateTaskInput } from '../types';

const ARCHIVE_AFTER_MS = 60 * 60 * 1000;

export interface SessionInfo {
  sessionId: string;
  name?: string;
  cwd?: string;
  pid?: number;
  startedAt?: string;
  lastSeenAt: string;
  status: 'active' | 'ended';
  taskCount: number;
}

export interface TaskStoreService {
  getTasks(filter?: { status?: string; sessionId?: string }): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput & Record<string, any>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  upsertSession(info: Partial<SessionInfo> & { sessionId: string }): void;
  getSessions(): SessionInfo[];
  updateSessionStatus(sessionId: string, status: 'active' | 'ended'): void;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    tags TEXT DEFAULT '[]',
    dependencies TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    source TEXT DEFAULT 'local',
    claude_session_id TEXT,
    claude_task_id TEXT,
    active_form TEXT,
    owner TEXT,
    metadata TEXT,
    context TEXT,
    completion_context TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    name TEXT,
    cwd TEXT,
    pid INTEGER,
    started_at TEXT,
    last_seen_at TEXT,
    status TEXT DEFAULT 'active',
    task_count INTEGER DEFAULT 0
  );
`;

export async function createTaskStore(projectDir: string): Promise<TaskStoreService> {
  const devlensDir = path.join(projectDir, '.devlens');
  if (!fs.existsSync(devlensDir)) {
    fs.mkdirSync(devlensDir, { recursive: true });
  }

  const dbPath = path.join(devlensDir, 'devlens.db');
  const sqlJsDistDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
  const SQL = await initSqlJs({ locateFile: (f: string) => path.join(sqlJsDistDir, f) });
  const db = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  const persist = () => fs.writeFileSync(dbPath, Buffer.from(db.export()));

  db.exec(SCHEMA);
  try { db.run('ALTER TABLE tasks ADD COLUMN completion_context TEXT'); } catch {}
  persist();

  function all(sql: string, params?: Record<string, any>): any[] {
    const stmt = db.prepare(sql);
    const rows: any[] = [];
    if (params) stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function first(sql: string, params?: Record<string, any>): any | undefined {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : undefined;
    stmt.free();
    return row;
  }

  function run(sql: string, params?: Record<string, any>): void {
    const stmt = db.prepare(sql);
    stmt.run(params || {});
    stmt.free();
  }

  function rowToTask(row: any): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description || '',
      status: row.status,
      priority: row.priority,
      tags: JSON.parse(row.tags || '[]'),
      dependencies: JSON.parse(row.dependencies || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at || undefined,
      source: row.source || 'local',
      claudeSessionId: row.claude_session_id || undefined,
      claudeTaskId: row.claude_task_id || undefined,
      activeForm: row.active_form || undefined,
      owner: row.owner || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      context: row.context || undefined,
      completionContext: row.completion_context || undefined,
    };
  }

  function buildUpdate(id: string, input: Record<string, any>): { sets: string[]; params: Record<string, any> } {
    const sets: string[] = [];
    const params: Record<string, any> = { '@id': id };
    const field = (col: string, val: any) => { sets.push(`${col} = @${col}`); params[`@${col}`] = val; };

    if (input.title !== undefined) field('title', input.title);
    if (input.description !== undefined) field('description', input.description);
    if (input.status !== undefined) field('status', input.status);
    if (input.priority !== undefined) field('priority', input.priority);
    if (input.tags !== undefined) field('tags', JSON.stringify(input.tags));
    if (input.dependencies !== undefined) field('dependencies', JSON.stringify(input.dependencies));
    if (input.claudeSessionId !== undefined) field('claude_session_id', input.claudeSessionId);
    if (input.claudeTaskId !== undefined) field('claude_task_id', input.claudeTaskId);
    if (input.activeForm !== undefined) field('active_form', input.activeForm);
    if (input.owner !== undefined) field('owner', input.owner);
    if (input.metadata !== undefined) field('metadata', JSON.stringify(input.metadata));
    if (input.context !== undefined) field('context', input.context);
    if (input.completionContext !== undefined) field('completion_context', input.completionContext);
    field('updated_at', new Date().toISOString());

    return { sets, params };
  }

  return {
    async getTasks(filter?) {
      const now = new Date().toISOString();
      run(
        `UPDATE tasks SET status = 'archived', updated_at = @now
         WHERE status = 'completed' AND completed_at IS NOT NULL
         AND (julianday(@now) - julianday(completed_at)) * 86400000 > @ms`,
        { '@now': now, '@ms': ARCHIVE_AFTER_MS }
      );
      if (filter?.status && filter?.sessionId) {
        return all('SELECT * FROM tasks WHERE status = @s AND claude_session_id = @sid ORDER BY created_at DESC', { '@s': filter.status, '@sid': filter.sessionId }).map(rowToTask);
      }
      if (filter?.sessionId) {
        return all('SELECT * FROM tasks WHERE claude_session_id = @sid ORDER BY created_at DESC', { '@sid': filter.sessionId }).map(rowToTask);
      }
      if (filter?.status) {
        return all('SELECT * FROM tasks WHERE status = @s ORDER BY created_at DESC', { '@s': filter.status }).map(rowToTask);
      }
      return all('SELECT * FROM tasks ORDER BY created_at DESC').map(rowToTask);
    },

    async getTask(id) {
      const row = first('SELECT * FROM tasks WHERE id = @id', { '@id': id });
      return row ? rowToTask(row) : null;
    },

    async createTask(input) {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      run(
        `INSERT INTO tasks (id, title, description, status, priority, tags, dependencies, created_at, updated_at, source)
         VALUES (@id, @title, @desc, @status, @priority, @tags, @deps, @now, @now, @source)`,
        { '@id': id, '@title': input.title, '@desc': input.description || '', '@status': input.status || 'pending', '@priority': input.priority || 'medium', '@tags': JSON.stringify(input.tags || []), '@deps': JSON.stringify(input.dependencies || []), '@now': now, '@source': 'local' }
      );
      persist();
      return rowToTask(first('SELECT * FROM tasks WHERE id = @id', { '@id': id })!);
    },

    async updateTask(id, input) {
      const existing = first('SELECT * FROM tasks WHERE id = @id', { '@id': id });
      if (!existing) throw new Error('Task not found');

      const { sets, params } = buildUpdate(id, input);
      if (input.status === 'completed' && existing.status !== 'completed') {
        sets.splice(sets.indexOf('updated_at = @updated_at'), 0, 'completed_at = @completed_at');
        params['@completed_at'] = new Date().toISOString();
      }

      if (sets.length > 1) {
        run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`, params);
        persist();
      }
      return rowToTask(first('SELECT * FROM tasks WHERE id = @id', { '@id': id })!);
    },

    async deleteTask(id) {
      run('DELETE FROM tasks WHERE id = @id', { '@id': id });
      persist();
    },

    upsertSession(info) {
      const now = new Date().toISOString();
      run(
        `INSERT INTO sessions (session_id, name, cwd, pid, started_at, last_seen_at, status, task_count)
         VALUES (@session_id, @name, @cwd, @pid, @started_at, @last_seen_at, @status, 0)
         ON CONFLICT(session_id) DO UPDATE SET
           name = COALESCE(@name, sessions.name),
           cwd = COALESCE(@cwd, sessions.cwd),
           pid = COALESCE(@pid, sessions.pid),
           started_at = COALESCE(@started_at, sessions.started_at),
           last_seen_at = @last_seen_at,
           status = @status,
           task_count = (SELECT COUNT(*) FROM tasks WHERE claude_session_id = @session_id)`,
        { '@session_id': info.sessionId, '@name': info.name || null, '@cwd': info.cwd || null, '@pid': info.pid || null, '@started_at': info.startedAt || null, '@last_seen_at': now, '@status': info.status || 'active' }
      );
      persist();
    },

    getSessions() {
      return all('SELECT * FROM sessions ORDER BY last_seen_at DESC').map(r => ({
        sessionId: r.session_id,
        name: r.name || undefined,
        cwd: r.cwd || undefined,
        pid: r.pid || undefined,
        startedAt: r.started_at || undefined,
        lastSeenAt: r.last_seen_at,
        status: r.status as 'active' | 'ended',
        taskCount: r.task_count,
      }));
    },

    updateSessionStatus(sessionId, status) {
      run('UPDATE sessions SET status = @status, last_seen_at = @now WHERE session_id = @id', { '@status': status, '@now': new Date().toISOString(), '@id': sessionId });
      persist();
    },
  };
}
