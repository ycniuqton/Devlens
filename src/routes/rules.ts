import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { RulesService } from '../services/rules';
import { WsMessage } from '../types';

export const rulesRouter = Router();

// GET /api/rules — list all rules
rulesRouter.get('/', (req: Request, res: Response) => {
  const rules: RulesService = req.app.locals.rulesService;
  res.json(rules.getRules());
});

// POST /api/rules — add a new rule
rulesRouter.post('/', (req: Request, res: Response) => {
  const rules: RulesService = req.app.locals.rulesService;
  const broadcast: (msg: WsMessage) => void = req.app.locals.broadcast;
  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content is required' });
  }

  const rule = rules.addRule(content);
  if (broadcast) broadcast({ type: 'rules-update', payload: { rules: rules.getRules() } } as any);
  res.status(201).json(rule);
});

// DELETE /api/rules/:index — remove a rule
rulesRouter.delete('/:index', (req: Request, res: Response) => {
  const rules: RulesService = req.app.locals.rulesService;
  const broadcast: (msg: WsMessage) => void = req.app.locals.broadcast;
  const index = parseInt(req.params.index, 10);

  if (isNaN(index)) return res.status(400).json({ error: 'invalid index' });

  const ok = rules.removeRule(index);
  if (!ok) return res.status(403).json({ error: 'cannot delete protected rule or invalid index' });

  if (broadcast) broadcast({ type: 'rules-update', payload: { rules: rules.getRules() } } as any);
  res.json({ ok: true });
});

// PATCH /api/rules/:index/toggle — toggle active/inactive
rulesRouter.patch('/:index/toggle', (req: Request, res: Response) => {
  const rules: RulesService = req.app.locals.rulesService;
  const broadcast: (msg: WsMessage) => void = req.app.locals.broadcast;
  const index = parseInt(req.params.index, 10);

  if (isNaN(index)) return res.status(400).json({ error: 'invalid index' });

  const rule = rules.toggleRule(index);
  if (!rule) return res.status(404).json({ error: 'rule not found' });

  if (broadcast) broadcast({ type: 'rules-update', payload: { rules: rules.getRules() } } as any);
  res.json(rule);
});

// ============================================================
// Commit Approval
// ============================================================
function getApprovalFile(projectDir: string): string {
  return path.join(projectDir, '.devlens', 'commit-approved.md');
}

function getPendingFile(projectDir: string): string {
  return path.join(projectDir, '.devlens', 'commit-pending.md');
}

// GET /api/commit-approval/status — check pending + approved state
rulesRouter.get('/commit-approval/status', (req: Request, res: Response) => {
  const projectDir: string = req.app.locals.projectDir;
  const pendingFile = getPendingFile(projectDir);
  const approvedFile = getApprovalFile(projectDir);

  let pending: string | null = null;
  let approved = false;
  let approvedAt: string | null = null;

  if (fs.existsSync(pendingFile)) {
    pending = fs.readFileSync(pendingFile, 'utf-8').trim();
  }
  if (fs.existsSync(approvedFile)) {
    approved = true;
    const content = fs.readFileSync(approvedFile, 'utf-8');
    const match = content.match(/timestamp:\s*(.+)/);
    if (match) approvedAt = match[1].trim();
  }

  res.json({ pending, approved, approvedAt });
});

// POST /api/commit-approval/approve — user approves the pending commit
rulesRouter.post('/commit-approval/approve', (req: Request, res: Response) => {
  const projectDir: string = req.app.locals.projectDir;
  const broadcast: (msg: WsMessage) => void = req.app.locals.broadcast;
  const pendingFile = getPendingFile(projectDir);
  const approvedFile = getApprovalFile(projectDir);

  if (!fs.existsSync(pendingFile)) {
    return res.status(400).json({ error: 'no pending commit to approve' });
  }

  const message = fs.readFileSync(pendingFile, 'utf-8').trim();
  const timestamp = new Date().toISOString();
  const content = `# Commit Approved\n\ntimestamp: ${timestamp}\n\nmessage:\n${message}\n`;

  fs.writeFileSync(approvedFile, content);
  fs.unlinkSync(pendingFile);

  if (broadcast) broadcast({ type: 'commit-approval-update', payload: { pending: null, approved: true, approvedAt: timestamp } } as any);
  res.json({ ok: true, approvedAt: timestamp });
});

// POST /api/commit-approval/reject — user rejects the pending commit
rulesRouter.post('/commit-approval/reject', (req: Request, res: Response) => {
  const projectDir: string = req.app.locals.projectDir;
  const broadcast: (msg: WsMessage) => void = req.app.locals.broadcast;
  const pendingFile = getPendingFile(projectDir);

  if (fs.existsSync(pendingFile)) fs.unlinkSync(pendingFile);

  if (broadcast) broadcast({ type: 'commit-approval-update', payload: { pending: null, approved: false } } as any);
  res.json({ ok: true });
});
