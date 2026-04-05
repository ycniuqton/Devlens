"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTaskStore = createTaskStore;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
function createTaskStore(projectDir) {
    const devlensDir = path_1.default.join(projectDir, '.devlens');
    const tasksFile = path_1.default.join(devlensDir, 'tasks.json');
    function ensureDir() {
        if (!fs_1.default.existsSync(devlensDir)) {
            fs_1.default.mkdirSync(devlensDir, { recursive: true });
        }
    }
    function loadStore() {
        ensureDir();
        if (!fs_1.default.existsSync(tasksFile)) {
            return { version: 1, tasks: [] };
        }
        const data = fs_1.default.readFileSync(tasksFile, 'utf-8');
        return JSON.parse(data);
    }
    function saveStore(store) {
        ensureDir();
        const tmpFile = tasksFile + '.tmp';
        fs_1.default.writeFileSync(tmpFile, JSON.stringify(store, null, 2));
        fs_1.default.renameSync(tmpFile, tasksFile);
    }
    return {
        async getTasks(filter) {
            const store = loadStore();
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
            const task = {
                id: crypto_1.default.randomUUID(),
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
            if (idx === -1)
                throw new Error('Task not found');
            const task = store.tasks[idx];
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
//# sourceMappingURL=taskStore.js.map