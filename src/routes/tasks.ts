import { Router, Request, Response } from 'express';
import { TaskStoreService } from '../services/taskStore';
import { WsMessage } from '../types';
import { getTodos, upsertTodo, parseTodoWritePayload, readClaudeTaskSessions } from '../services/claudeTasks';

export const tasksRouter = Router();

// Sync endpoint — receives Claude Code hook payloads
tasksRouter.post('/sync', async (req: Request, res: Response) => {
  const store: TaskStoreService = req.app.locals.taskStore;
  const broadcast: (msg: WsMessage) => void = req.app.locals.broadcast;

  try {
    const { tool_name, tool_input, tool_output } = req.body;

    if (!tool_name) {
      return res.status(400).json({ error: 'Invalid hook payload' });
    }

    // --- TodoWrite: Claude's ephemeral todos ---
    if (tool_name === 'TodoWrite') {
      const todos = parseTodoWritePayload(tool_input);
      for (const todo of todos) {
        upsertTodo(todo);
      }
      if (broadcast) broadcast({ type: 'todo-update', payload: { todos: getTodos() } });
      return res.json({ ok: true });
    }

    // --- TaskCreate / TaskUpdate: Claude's managed tasks ---
    const outputStr = typeof tool_output === 'string' ? tool_output : JSON.stringify(tool_output || '');
    const idMatch = outputStr.match(/#(\d+)/);
    const claudeTaskId = idMatch ? idMatch[1] : null;

    if (tool_name === 'TaskCreate') {
      const subject = tool_input?.subject || tool_input?.title || 'Untitled';
      const description = tool_input?.description || '';

      const existing = await store.getTasks();
      const found = existing.find(t => t.tags.includes(`claude:${claudeTaskId}`));

      if (!found) {
        const task = await store.createTask({
          title: subject,
          description,
          status: 'pending',
          priority: 'medium',
          tags: claudeTaskId ? [`claude:${claudeTaskId}`] : [],
        });
        if (broadcast) broadcast({ type: 'task-update', payload: { action: 'created', task } });
      }
    }

    if (tool_name === 'TaskUpdate') {
      const status = tool_input?.status;
      const claudeId = tool_input?.taskId;

      const existing = await store.getTasks();
      const found = existing.find(t => t.tags.includes(`claude:${claudeId}`));

      if (found && status) {
        const statusMap: Record<string, string> = {
          'in_progress': 'in-progress',
          'completed': 'completed',
          'pending': 'pending',
          'deleted': 'completed',
        };
        const mappedStatus = statusMap[status] || status;
        const updated = await store.updateTask(found.id, {
          status: mappedStatus as any,
        });
        if (broadcast) broadcast({ type: 'task-update', payload: { action: 'updated', task: updated } });
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/claude-todos — current session todos
tasksRouter.get('/claude-todos', (_req: Request, res: Response) => {
  res.json(getTodos());
});

// GET /api/tasks/claude-sessions — cross-session task data
tasksRouter.get('/claude-sessions', (_req: Request, res: Response) => {
  const sessions = readClaudeTaskSessions();
  res.json(sessions);
});

tasksRouter.get('/', async (req: Request, res: Response) => {
  const store: TaskStoreService = req.app.locals.taskStore;
  try {
    const status = req.query.status as string | undefined;
    const tasks = await store.getTasks(status ? { status } : undefined);
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tasksRouter.get('/:id', async (req: Request, res: Response) => {
  const store: TaskStoreService = req.app.locals.taskStore;
  try {
    const task = await store.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tasksRouter.post('/', async (req: Request, res: Response) => {
  const store: TaskStoreService = req.app.locals.taskStore;
  try {
    if (!req.body.title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const task = await store.createTask(req.body);
    res.status(201).json(task);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tasksRouter.put('/:id', async (req: Request, res: Response) => {
  const store: TaskStoreService = req.app.locals.taskStore;
  try {
    const task = await store.updateTask(req.params.id, req.body);
    res.json(task);
  } catch (err: any) {
    if (err.message === 'Task not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

tasksRouter.delete('/:id', async (req: Request, res: Response) => {
  const store: TaskStoreService = req.app.locals.taskStore;
  try {
    await store.deleteTask(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
