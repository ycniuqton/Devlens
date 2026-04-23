import express from 'express';
import http from 'http';
import path from 'path';
import session from 'express-session';
import { WebSocketServer, WebSocket } from 'ws';
import { ServerOptions, WsMessage } from './types';
import chokidar from 'chokidar';
import { createGitService } from './services/git';
import { createWatcher } from './services/watcher';
import { createTaskStore } from './services/taskStore';
import { createRulesService } from './services/rules';
import { createSettingsService } from './services/settings';
import { createAuthService } from './services/auth';
import { diffRouter } from './routes/diff';
import { tasksRouter, checkSessionLiveness } from './routes/tasks';
import { integrationsRouter } from './routes/integrations';
import { rulesRouter } from './routes/rules';
import { browserRouter } from './routes/browser';
import { settingsRouter } from './routes/settings';
import { authRouter } from './routes/auth';

export function createServer(options: ServerOptions) {
  const app = express();
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Middleware
  app.use(express.json());
  app.use(session({
    secret: require('crypto').randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
  }));

  // Services
  const gitService = createGitService(options.projectDir);
  const taskStore = createTaskStore(options.projectDir);
  const rulesService = createRulesService(options.projectDir);
  const settingsService = createSettingsService(options.projectDir);
  const authService = createAuthService(options.projectDir);
  rulesService.ensureDefault();
  // Always re-enable direct IP on startup so users are never permanently locked out
  settingsService.updateSettings({ directIpAccess: true });

  // Attach to app.locals for route access
  app.locals.gitService = gitService;
  app.locals.taskStore = taskStore;
  app.locals.rulesService = rulesService;
  app.locals.settingsService = settingsService;
  app.locals.authService = authService;
  app.locals.projectDir = options.projectDir;
  app.locals.port = options.port;

  // Block non-localhost requests when directIpAccess is disabled
  app.use((req, res, next) => {
    const ip = req.socket.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!isLocal && !settingsService.getSettings().directIpAccess) {
      return res.status(403).send('Direct IP access is disabled. Use the tunnel URL.');
    }
    next();
  });

  // Auth routes (public — no auth required)
  app.use('/api/auth', authRouter);

  // Auth guard — protect all other API routes and the SPA
  app.use((req, res, next) => {
    const isAuthenticated = !!(req.session as any).authenticated;
    const isPublic = req.path === '/login' || req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path.startsWith('/fonts/');

    if (!isAuthenticated && !isPublic) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
      return res.redirect('/login');
    }
    next();
  });

  // API routes
  app.get('/api/info', (_req, res) => {
    const os = require('os');
    const networkIps: string[] = [];
    for (const ifaces of Object.values(os.networkInterfaces() as any)) {
      for (const iface of ifaces as any[]) {
        if (iface.family === 'IPv4' && !iface.internal) networkIps.push(iface.address);
      }
    }
    res.json({
      projectDir: options.projectDir,
      projectName: path.basename(options.projectDir),
      port: options.port,
      localUrl: `http://localhost:${options.port}`,
      networkUrls: networkIps.map(ip => `http://${ip}:${options.port}`),
    });
  });
  app.use('/api', diffRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/rules', rulesRouter);
  app.use('/api/browser', browserRouter);
  app.use('/api/settings', settingsRouter);

  // Static files
  const publicDir = path.resolve(__dirname, '../public');
  app.use(express.static(publicDir));

  // Login page (public)
  app.get('/login', (_req, res) => {
    res.sendFile(path.join(publicDir, 'login.html'));
  });

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

  // File watcher -> WebSocket broadcast (rebuildable when settings change)
  let watcher: ReturnType<typeof createWatcher> | null = null;

  const onWatcherChange = async () => {
    try {
      const diff = await gitService.getDiff();
      const status = await gitService.getStatus();
      broadcast({ type: 'diff-update', payload: { diff } });
      broadcast({ type: 'status-update', payload: { status } });
    } catch {
      // Git service may fail if not a git repo
    }
  };

  function buildWatcher() {
    watcher = createWatcher(
      options.projectDir,
      onWatcherChange,
      settingsService.getChokidarIgnoreGlobs()
    );
  }

  buildWatcher();

  function reloadWatcher() {
    if (watcher) {
      watcher.close().catch(() => {});
    }
    buildWatcher();
  }

  app.locals.reloadWatcher = reloadWatcher;

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
