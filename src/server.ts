import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { ServerOptions, WsMessage } from './types';
import { createGitService } from './services/git';
import { createWatcher } from './services/watcher';
import { createTaskStore } from './services/taskStore';
import { diffRouter } from './routes/diff';
import { tasksRouter } from './routes/tasks';
import { integrationsRouter } from './routes/integrations';

export function createServer(options: ServerOptions) {
  const app = express();
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Middleware
  app.use(express.json());

  // Services
  const gitService = createGitService(options.projectDir);
  const taskStore = createTaskStore(options.projectDir);

  // Attach to app.locals for route access
  app.locals.gitService = gitService;
  app.locals.taskStore = taskStore;
  app.locals.projectDir = options.projectDir;
  app.locals.port = options.port;

  // API routes
  app.use('/api', diffRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/integrations', integrationsRouter);

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

  // Attach broadcast and watcher for cleanup
  app.locals.broadcast = broadcast;
  app.locals.watcher = watcher;

  return { app, httpServer, wss };
}
