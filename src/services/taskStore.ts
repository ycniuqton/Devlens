import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Task, CreateTaskInput, UpdateTaskInput, TaskStore } from '../types';

const ARCHIVE_AFTER_MS = 60 * 60 * 1000; // 1 hour

export interface TaskStoreService {
  getTasks(filter?: { status?: string }): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput): Promise<Task>;
  deleteTask(id: string): Promise<void>;
}

export function createTaskStore(projectDir: string): TaskStoreService {
  const devlensDir = path.join(projectDir, '.devlens');
  const tasksFile = path.join(devlensDir, 'tasks.json');

  function ensureDir() {
    if (!fs.existsSync(devlensDir)) {
      fs.mkdirSync(devlensDir, { recursive: true });
    }
  }

  function loadStore(): TaskStore {
    ensureDir();
    if (!fs.existsSync(tasksFile)) {
      return { version: 1, tasks: [] };
    }
    const data = fs.readFileSync(tasksFile, 'utf-8');
    return JSON.parse(data);
  }

  function saveStore(store: TaskStore) {
    ensureDir();
    const tmpFile = tasksFile + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2));
    fs.renameSync(tmpFile, tasksFile);
  }

  // Auto-archive: completed tasks older than 1 hour → archived
  function autoArchive(store: TaskStore): boolean {
    const now = Date.now();
    let changed = false;
    for (const task of store.tasks) {
      if (task.status === 'completed' && task.completedAt) {
        const completedTime = new Date(task.completedAt).getTime();
        if (now - completedTime > ARCHIVE_AFTER_MS) {
          task.status = 'archived';
          task.updatedAt = new Date().toISOString();
          changed = true;
        }
      }
    }
    return changed;
  }

  return {
    async getTasks(filter?) {
      const store = loadStore();
      const archived = autoArchive(store);
      if (archived) saveStore(store);

      if (filter?.status) {
        return store.tasks.filter(t => t.status === filter.status);
      }
      return store.tasks;
    },

    async getTask(id) {
      const store = loadStore();
      return store.tasks.find(t => t.id === id) || null;
    },

    async createTask(input) {
      const store = loadStore();
      const now = new Date().toISOString();
      const task: Task = {
        id: crypto.randomUUID(),
        title: input.title,
        description: input.description || '',
        status: input.status || 'pending',
        priority: input.priority || 'medium',
        tags: input.tags || [],
        dependencies: input.dependencies || [],
        createdAt: now,
        updatedAt: now,
        source: 'local',
      };
      store.tasks.push(task);
      saveStore(store);
      return task;
    },

    async updateTask(id, input) {
      const store = loadStore();
      const idx = store.tasks.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Task not found');
      const task = store.tasks[idx];

      // Track when task was completed
      if (input.status === 'completed' && task.status !== 'completed') {
        (task as any).completedAt = new Date().toISOString();
      }

      Object.assign(task, input, { updatedAt: new Date().toISOString() });
      saveStore(store);
      return task;
    },

    async deleteTask(id) {
      const store = loadStore();
      store.tasks = store.tasks.filter(t => t.id !== id);
      saveStore(store);
    },
  };
}
