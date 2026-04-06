import { Router, Request, Response } from 'express';
import fs from 'fs';
import { TaskStoreService } from '../services/taskStore';
import { WsMessage } from '../types';

// Extract the user prompt that triggered the tool call from the transcript
function extractContext(transcriptPath: string | undefined, toolUseId: string | undefined): string {
  if (!transcriptPath || !toolUseId) return '';
  try {
    if (!fs.existsSync(transcriptPath)) return '';
    const lines = fs.readFileSync(transcriptPath, 'utf-8').split('\n').filter(Boolean);

    // Find the line with this tool_use_id
    let toolLineIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(toolUseId)) {
        toolLineIdx = i;
        break;
      }
    }
    if (toolLineIdx === -1) return '';

    // Search backwards for the last user message with actual text
    for (let j = toolLineIdx - 1; j >= Math.max(0, toolLineIdx - 50); j--) {
      try {
        const entry = JSON.parse(lines[j]);
        if (entry.type !== 'user') continue;
        const content = entry.message?.content;
        let text = '';
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === 'text' && block.text) {
              text += block.text;
            }
          }
        }
        if (text.trim().length > 5) {
          return text.trim().substring(0, 500);
        }
      } catch {}
    }
  } catch {}
  return '';
}
export const tasksRouter = Router();

// Sync endpoint — receives Claude Code hook payloads (PostToolUse on TaskCreate/TaskUpdate)
tasksRouter.post('/sync', async (req: Request, res: Response) => {
  const store: TaskStoreService = req.app.locals.taskStore;
  const broadcast: (msg: WsMessage) => void = req.app.locals.broadcast;

  try {
    const { tool_name, tool_input, tool_response, tool_output, session_id, transcript_path, tool_use_id } = req.body;

    if (!tool_name) {
      return res.status(400).json({ error: 'Invalid hook payload' });
    }

    const sessionShort = session_id ? String(session_id).substring(0, 8) : '';

    // Extract Claude task ID
    let claudeTaskId: string | null = null;
    if (tool_response?.task?.id) {
      claudeTaskId = String(tool_response.task.id);
    } else if (tool_response?.taskId) {
      claudeTaskId = String(tool_response.taskId);
    } else {
      const outputStr = typeof tool_output === 'string' ? tool_output : JSON.stringify(tool_output || '');
      const idMatch = outputStr.match(/#(\d+)/);
      claudeTaskId = idMatch ? idMatch[1] : null;
    }

    const claudeTag = claudeTaskId ? `claude:${sessionShort}:${claudeTaskId}` : null;

    if (tool_name === 'TaskCreate') {
      const subject = tool_input?.subject || tool_input?.title || 'Untitled';
      const description = tool_input?.description || '';

      if (claudeTag) {
        const existing = await store.getTasks();
        const found = existing.find(t => t.tags.includes(claudeTag));
        if (found) return res.json({ ok: true });
      }

      // Extract user prompt context from transcript
      const context = extractContext(transcript_path, tool_use_id);

      const task = await store.createTask({
        title: subject,
        description,
        status: 'pending',
        priority: 'medium',
        tags: claudeTag ? [claudeTag] : [],
      });

      // Store Claude-specific fields directly on the task object
      if (claudeTaskId || tool_input?.activeForm || tool_input?.owner || tool_input?.metadata || context) {
        const extra: Record<string, any> = {};
        if (session_id) extra.claudeSessionId = session_id;
        if (claudeTaskId) extra.claudeTaskId = claudeTaskId;
        if (tool_input?.activeForm) extra.activeForm = tool_input.activeForm;
        if (tool_input?.owner) extra.owner = tool_input.owner;
        if (tool_input?.metadata) extra.metadata = tool_input.metadata;
        if (context) extra.context = context;
        await store.updateTask(task.id, extra as any);
      }

      if (broadcast) broadcast({ type: 'task-update', payload: { action: 'created', task } });
    }

    if (tool_name === 'TaskUpdate') {
      const status = tool_input?.status;
      const claudeId = tool_input?.taskId;

      // Find by session-scoped tag
      const existing = await store.getTasks();
      const tag = `claude:${sessionShort}:${claudeId}`;
      let found = existing.find(t => t.tags.includes(tag));
      // Fallback: try old format without session
      if (!found) {
        found = existing.find(t => t.tags.includes(`claude:${claudeId}`));
      }

      if (found) {
        const updates: Record<string, any> = {};

        if (status) {
          if (status === 'deleted') {
            updates.status = 'archived';
          } else {
            const statusMap: Record<string, string> = {
              'in_progress': 'in-progress',
              'completed': 'completed',
              'pending': 'pending',
            };
            updates.status = statusMap[status] || status;
          }
        }

        // Capture any field updates from Claude
        if (tool_input?.subject) updates.title = tool_input.subject;
        if (tool_input?.description) updates.description = tool_input.description;
        if (tool_input?.activeForm) updates.activeForm = tool_input.activeForm;
        if (tool_input?.owner) updates.owner = tool_input.owner;
        if (tool_input?.metadata) updates.metadata = { ...(found as any).metadata, ...tool_input.metadata };

        const updated = await store.updateTask(found.id, updates as any);
        if (broadcast) broadcast({ type: 'task-update', payload: { action: 'updated', task: updated } });
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
