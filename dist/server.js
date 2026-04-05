"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const ws_1 = require("ws");
const git_1 = require("./services/git");
const watcher_1 = require("./services/watcher");
const taskStore_1 = require("./services/taskStore");
const diff_1 = require("./routes/diff");
const tasks_1 = require("./routes/tasks");
const integrations_1 = require("./routes/integrations");
function createServer(options) {
    const app = (0, express_1.default)();
    const httpServer = http_1.default.createServer(app);
    const wss = new ws_1.WebSocketServer({ server: httpServer, path: '/ws' });
    // Middleware
    app.use(express_1.default.json());
    // Services
    const gitService = (0, git_1.createGitService)(options.projectDir);
    const taskStore = (0, taskStore_1.createTaskStore)(options.projectDir);
    // Attach to app.locals for route access
    app.locals.gitService = gitService;
    app.locals.taskStore = taskStore;
    app.locals.projectDir = options.projectDir;
    // API routes
    app.use('/api', diff_1.diffRouter);
    app.use('/api/tasks', tasks_1.tasksRouter);
    app.use('/api/integrations', integrations_1.integrationsRouter);
    // Static files
    const publicDir = path_1.default.resolve(__dirname, '../public');
    app.use(express_1.default.static(publicDir));
    // SPA fallback
    app.get('*', (_req, res) => {
        res.sendFile(path_1.default.join(publicDir, 'index.html'));
    });
    // WebSocket broadcast helper
    function broadcast(message) {
        const data = JSON.stringify(message);
        wss.clients.forEach((client) => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(data);
            }
        });
    }
    // File watcher -> WebSocket broadcast
    const watcher = (0, watcher_1.createWatcher)(options.projectDir, async () => {
        try {
            const diff = await gitService.getDiff();
            const status = await gitService.getStatus();
            broadcast({ type: 'diff-update', payload: { diff } });
            broadcast({ type: 'status-update', payload: { status } });
        }
        catch {
            // Git service may fail if not a git repo
        }
    });
    // Attach broadcast and watcher for cleanup
    app.locals.broadcast = broadcast;
    app.locals.watcher = watcher;
    return { app, httpServer, wss };
}
//# sourceMappingURL=server.js.map