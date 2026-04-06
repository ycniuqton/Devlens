import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { ServerOptions, WsMessage } from './types';
import chokidar from 'chokidar';
import { createGitService } from './services/git';
import { createWatcher } from './services/watcher';
import { createTaskStore } from './services/taskStore';
import { createRulesService } from './services/rules';
import { diffRouter } from './routes/diff';
import { tasksRouter, checkSessionLiveness } from './routes/tasks';
import { integrationsRouter } from './routes/integrations';
import { rulesRouter } from './routes/rules';

export function createServer(options: ServerOptions) {
  const app = express();
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Middleware
  app.use(express.json());

  // Services
  const gitService = createGitService(options.projectDir);
  const taskStore = createTaskStore(options.projectDir);
  const rulesService = createRulesService(options.projectDir);
  rulesService.ensureDefault();

  // Attach to app.locals for route access
  app.locals.gitService = gitService;
  app.locals.taskStore = taskStore;
  app.locals.rulesService = rulesService;
  app.locals.projectDir = options.projectDir;
  app.locals.port = options.port;

  // API routes
  app.get('/api/info', (_req, res) => {
    res.json({
      projectDir: options.projectDir,
      projectName: path.basename(options.projectDir),
      port: options.port,
    });
  });
  app.use('/api', diffRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/rules', rulesRouter);

  // Static files
  const publicDir = path.resolve(__dirname, '../public');
  app.use(express.static(publicDir));

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // WebSocket broadcast helper
  function broadcast(message: WsMessage) {
    const data = JSON.stringify(message);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  // File watcher -> WebSocket broadcast
  const watcher = createWatcher(options.projectDir, async () => {
    try {
      const diff = await gitService.getDiff();
      const status = await gitService.getStatus();
      broadcast({ type: 'diff-update', payload: { diff } });
      broadcast({ type: 'status-update', payload: { status } });
    } catch {
      // Git service may fail if not a git repo
    }
  });

  // Watch rules.md for external changes
  const rulesPath = path.join(options.projectDir, '.devlens', 'rules.md');
  const rulesWatcher = chokidar.watch(rulesPath, { ignoreInitial: true });
  rulesWatcher.on('change', () => {
    broadcast({ type: 'rules-update', payload: { rules: rulesService.getRules() } } as any);
  });

  // Watch commit approval files
  const devlensDir = path.join(options.projectDir, '.devlens');
  const approvalWatcher = chokidar.watch([
    path.join(devlensDir, 'commit-pending.md'),
    path.join(devlensDir, 'commit-approved.md'),
  ], { ignoreInitial: false });

  function broadcastApprovalState() {
    const fs = require('fs');
    const pendingFile = path.join(devlensDir, 'commit-pending.md');
    const approvedFile = path.join(devlensDir, 'commit-approved.md');
    let pending: string | null = null;
    let approved = false;
    let approvedAt: string | null = null;
    if (fs.existsSync(pendingFile)) pending = fs.readFileSync(pendingFile, 'utf-8').trim();
    if (fs.existsSync(approvedFile)) {
      approved = true;
      const m = fs.readFileSync(approvedFile, 'utf-8').match(/timestamp:\s*(.+)/);
      if (m) approvedAt = m[1].trim();
    }
    broadcast({ type: 'commit-approval-update', payload: { pending, approved, approvedAt } } as any);
  }

  approvalWatcher.on('add', broadcastApprovalState);
  approvalWatcher.on('change', broadcastApprovalState);
  approvalWatcher.on('unlink', broadcastApprovalState);

  // Check session liveness every 30 seconds
  const livenessInterval = setInterval(() => {
    checkSessionLiveness(taskStore);
  }, 30000);

  // Attach broadcast and watcher for cleanup
  app.locals.broadcast = broadcast;
  app.locals.watcher = watcher;
  app.locals.livenessInterval = livenessInterval;

  return { app, httpServer, wss };
}
