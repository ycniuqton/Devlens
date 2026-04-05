import { Router, Request, Response } from 'express';
import { TaskStoreService } from '../services/taskStore';

export const tasksRouter = Router();

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
