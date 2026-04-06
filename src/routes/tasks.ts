import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TaskStoreService } from '../services/taskStore';
import { WsMessage } from '../types';

interface TaskContext {
  userPrompt: string;
  claudeReasoning: string;
  filesTouched: string[];
}

// Extract rich context from the conversation transcript
function extractContext(transcriptPath: string | undefined, toolUseId: string | undefined): TaskContext {
  const empty: TaskContext = { userPrompt: '', claudeReasoning: '', filesTouched: [] };
  if (!transcriptPath || !toolUseId) return empty;
  try {
    if (!fs.existsSync(transcriptPath)) return empty;
    const lines = fs.readFileSync(transcriptPath, 'utf-8').split('\n').filter(Boolean);

    // Find the line with this tool_use_id
    let toolLineIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(toolUseId)) {
        toolLineIdx = i;
        break;
      }
    }
    if (toolLineIdx === -1) return empty;

    let userPrompt = '';
    let claudeReasoning = '';
    const filesTouched: string[] = [];

    for (let j = toolLineIdx - 1; j >= Math.max(0, toolLineIdx - 50); j--) {
      try {
        const entry = JSON.parse(lines[j]);
        const content = entry.message?.content;

        // Claude's reasoning — assistant text before the tool call
        if (entry.type === 'assistant' && !claudeReasoning) {
          if (typeof content === 'string' && content.trim().length > 10) {
            claudeReasoning = content.trim().substring(0, 500);
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === 'text' && block.text?.trim().length > 10) {
                claudeReasoning = block.text.trim().substring(0, 500);
                break;
              }
            }
          }
        }

        // User prompt
        if (entry.type === 'user' && !userPrompt) {
          let text = '';
          if (typeof content === 'string') text = content;
          else if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === 'text' && block.text) text += block.text;
            }
          }
          if (text.trim().length > 5) {
            userPrompt = text.trim().substring(0, 500);
          }
        }

        // Files touched (Read/Edit/Write tool calls)
        if (entry.type === 'assistant' && Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === 'tool_use' && ['Read', 'Edit', 'Write', 'Glob'].includes(block.name)) {
              const fp = block.input?.file_path || block.input?.pattern || '';
              if (fp && !filesTouched.includes(fp)) {
                filesTouched.push(fp);
              }
            }
          }
        }

        if (userPrompt && claudeReasoning) break;
      } catch {}
    }

    return { userPrompt, claudeReasoning, filesTouched: filesTouched.slice(0, 10) };
  } catch {}
  return empty;
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

    // Upsert session from hook payload + session metadata
    if (session_id) {
      const meta = readSessionMeta(session_id);
      store.upsertSession({
        sessionId: session_id,
        name: meta?.name,
        cwd: meta?.cwd,
        pid: meta?.pid,
        startedAt: meta?.startedAt ? new Date(meta.startedAt).toISOString() : undefined,
        status: 'active',
      });
    }

    // Detect WAITING_APPROVAL — Claude is asking for commit approval
    {
      const projectDir: string = req.app.locals.projectDir;
      const candidates: string[] = [];
      const collect = (v: any) => { if (typeof v === 'string') candidates.push(v); };
      collect(tool_input?.subject);
      collect(tool_input?.title);
      collect(tool_input?.content);
      if (Array.isArray(tool_input?.todos)) {
        for (const t of tool_input.todos) collect(t?.content);
      }
      const approvalLine = candidates.find(c => c.includes('WAITING_APPROVAL:'));
      if (approvalLine) {
        const message = approvalLine.split('WAITING_APPROVAL:')[1].trim();
        const pendingFile = path.join(projectDir, '.devlens', 'commit-pending.md');
        const dir = path.dirname(pendingFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(pendingFile, message);
        // Remove any prior approval so a new commit cycle starts clean
        const approvedFile = path.join(projectDir, '.devlens', 'commit-approved.md');
        if (fs.existsSync(approvedFile)) fs.unlinkSync(approvedFile);
        if (broadcast) broadcast({ type: 'commit-approval-update', payload: { pending: message, approved: false } } as any);
      }
    }

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
        if (context.userPrompt || context.claudeReasoning || context.filesTouched.length) {
          extra.context = JSON.stringify(context);
        }
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

        // On completion/archive — capture what Claude did to finish
        if (status === 'completed' || status === 'deleted') {
          const completionCtx = extractContext(transcript_path, tool_use_id);
          if (completionCtx.claudeReasoning || completionCtx.filesTouched.length) {
            updates.completionContext = JSON.stringify(completionCtx);
          }
        }

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
    const sessionId = req.query.session as string | undefined;
    const filter: any = {};
    if (status) filter.status = status;
    if (sessionId) filter.sessionId = sessionId;
    const tasks = await store.getTasks(Object.keys(filter).length ? filter : undefined);
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/sessions — must be before /:id
tasksRouter.get('/sessions', (req: Request, res: Response) => {
  const store: TaskStoreService = req.app.locals.taskStore;
  const projectDir: string = req.app.locals.projectDir;
  const sessions = store.getSessions().filter(s => !s.cwd || s.cwd === projectDir);
  res.json(sessions);
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

// ---- Sessions ----

// Read session metadata from ~/.claude/sessions/*.json
function readSessionMeta(sessionId: string): { name?: string; cwd?: string; pid?: number; startedAt?: number } | null {
  const sessionsDir = path.join(os.homedir(), '.claude', 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;

  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    let best: any = null;
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf-8'));
        if (data.sessionId === sessionId) {
          if (!best || (data.startedAt && (!best.startedAt || data.startedAt > best.startedAt))) {
            best = data;
          }
        }
      } catch {}
    }
    return best;
  } catch {}
  return null;
}


// Check session liveness by watching lock files
function checkSessionLiveness(store: TaskStoreService) {
  const tasksDir = path.join(os.homedir(), '.claude', 'tasks');
  if (!fs.existsSync(tasksDir)) return;

  const sessions = store.getSessions();
  for (const session of sessions) {
    if (session.status !== 'active') continue;
    const lockFile = path.join(tasksDir, session.sessionId, '.lock');
    if (!fs.existsSync(lockFile)) {
      store.updateSessionStatus(session.sessionId, 'ended');
    }
  }
}

// Export for use in server.ts
export { checkSessionLiveness };
