import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Task, CreateTaskInput, UpdateTaskInput } from '../types';

const ARCHIVE_AFTER_MS = 60 * 60 * 1000; // 1 hour

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

export function createTaskStore(projectDir: string): TaskStoreService {
  const devlensDir = path.join(projectDir, '.devlens');
  if (!fs.existsSync(devlensDir)) {
    fs.mkdirSync(devlensDir, { recursive: true });
  }

  const dbPath = path.join(devlensDir, 'devlens.db');
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
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
    )
  `);

  // Migration: add column if missing (for existing DBs)
  try { db.exec('ALTER TABLE tasks ADD COLUMN completion_context TEXT'); } catch {}


  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      name TEXT,
      cwd TEXT,
      pid INTEGER,
      started_at TEXT,
      last_seen_at TEXT,
      status TEXT DEFAULT 'active',
      task_count INTEGER DEFAULT 0
    )
  `);

  // Prepared statements — tasks
  const insertStmt = db.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, tags, dependencies, created_at, updated_at, source)
    VALUES (@id, @title, @description, @status, @priority, @tags, @dependencies, @created_at, @updated_at, @source)
  `);

  const selectAllStmt = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC');
  const selectByStatusStmt = db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC');
  const selectBySessionStmt = db.prepare('SELECT * FROM tasks WHERE claude_session_id = ? ORDER BY created_at DESC');
  const selectByStatusAndSessionStmt = db.prepare('SELECT * FROM tasks WHERE status = ? AND claude_session_id = ? ORDER BY created_at DESC');
  const selectByIdStmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const deleteStmt = db.prepare('DELETE FROM tasks WHERE id = ?');

  // Prepared statements — sessions
  const upsertSessionStmt = db.prepare(`
    INSERT INTO sessions (session_id, name, cwd, pid, started_at, last_seen_at, status, task_count)
    VALUES (@session_id, @name, @cwd, @pid, @started_at, @last_seen_at, @status, @task_count)
    ON CONFLICT(session_id) DO UPDATE SET
      name = COALESCE(@name, sessions.name),
      cwd = COALESCE(@cwd, sessions.cwd),
      pid = COALESCE(@pid, sessions.pid),
      started_at = COALESCE(@started_at, sessions.started_at),
      last_seen_at = @last_seen_at,
      status = @status,
      task_count = (SELECT COUNT(*) FROM tasks WHERE claude_session_id = @session_id)
  `);
  const selectAllSessionsStmt = db.prepare('SELECT * FROM sessions ORDER BY last_seen_at DESC');
  const updateSessionStatusStmt = db.prepare('UPDATE sessions SET status = ?, last_seen_at = ? WHERE session_id = ?');

  // Auto-archive completed tasks older than 1 hour
  const archiveStmt = db.prepare(`
    UPDATE tasks SET status = 'archived', updated_at = ?
    WHERE status = 'completed' AND completed_at IS NOT NULL
    AND (julianday(?) - julianday(completed_at)) * 86400000 > ?
  `);

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

  return {
    async getTasks(filter?) {
      // Auto-archive old completed tasks
      const now = new Date().toISOString();
      archiveStmt.run(now, now, ARCHIVE_AFTER_MS);

      let rows;
      if (filter?.status && filter?.sessionId) {
        rows = selectByStatusAndSessionStmt.all(filter.status, filter.sessionId);
      } else if (filter?.sessionId) {
        rows = selectBySessionStmt.all(filter.sessionId);
      } else if (filter?.status) {
        rows = selectByStatusStmt.all(filter.status);
      } else {
        rows = selectAllStmt.all();
      }
      return rows.map(rowToTask);
    },

    async getTask(id) {
      const row = selectByIdStmt.get(id);
      return row ? rowToTask(row) : null;
    },

    async createTask(input) {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      insertStmt.run({
        id,
        title: input.title,
        description: input.description || '',
        status: input.status || 'pending',
        priority: input.priority || 'medium',
        tags: JSON.stringify(input.tags || []),
        dependencies: JSON.stringify(input.dependencies || []),
        created_at: now,
        updated_at: now,
        source: 'local',
      });

      return rowToTask(selectByIdStmt.get(id));
    },

    async updateTask(id, input) {
      const existing = selectByIdStmt.get(id) as any;
      if (!existing) throw new Error('Task not found');

      const updates: string[] = [];
      const values: any = { id };

      if (input.title !== undefined) { updates.push('title = @title'); values.title = input.title; }
      if (input.description !== undefined) { updates.push('description = @description'); values.description = input.description; }
      if (input.status !== undefined) {
        updates.push('status = @status');
        values.status = input.status;
        // Track completion time
        if (input.status === 'completed' && existing.status !== 'completed') {
          updates.push('completed_at = @completed_at');
          values.completed_at = new Date().toISOString();
        }
      }
      if (input.priority !== undefined) { updates.push('priority = @priority'); values.priority = input.priority; }
      if (input.tags !== undefined) { updates.push('tags = @tags'); values.tags = JSON.stringify(input.tags); }
      if (input.dependencies !== undefined) { updates.push('dependencies = @dependencies'); values.dependencies = JSON.stringify(input.dependencies); }

      // Claude-specific fields
      if ((input as any).claudeSessionId !== undefined) { updates.push('claude_session_id = @claude_session_id'); values.claude_session_id = (input as any).claudeSessionId; }
      if ((input as any).claudeTaskId !== undefined) { updates.push('claude_task_id = @claude_task_id'); values.claude_task_id = (input as any).claudeTaskId; }
      if ((input as any).activeForm !== undefined) { updates.push('active_form = @active_form'); values.active_form = (input as any).activeForm; }
      if ((input as any).owner !== undefined) { updates.push('owner = @owner'); values.owner = (input as any).owner; }
      if ((input as any).metadata !== undefined) { updates.push('metadata = @metadata'); values.metadata = JSON.stringify((input as any).metadata); }
      if ((input as any).context !== undefined) { updates.push('context = @context'); values.context = (input as any).context; }
      if ((input as any).completionContext !== undefined) { updates.push('completion_context = @completion_context'); values.completion_context = (input as any).completionContext; }

      updates.push('updated_at = @updated_at');
      values.updated_at = new Date().toISOString();

      if (updates.length > 1) {
        db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = @id`).run(values);
      }

      return rowToTask(selectByIdStmt.get(id));
    },

    async deleteTask(id) {
      deleteStmt.run(id);
    },

    upsertSession(info) {
      const now = new Date().toISOString();
      upsertSessionStmt.run({
        session_id: info.sessionId,
        name: info.name || null,
        cwd: info.cwd || null,
        pid: info.pid || null,
        started_at: info.startedAt || null,
        last_seen_at: now,
        status: info.status || 'active',
        task_count: 0,
      });
    },

    getSessions() {
      const rows = selectAllSessionsStmt.all() as any[];
      return rows.map(r => ({
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
      updateSessionStatusStmt.run(status, new Date().toISOString(), sessionId);
    },
  };
}
