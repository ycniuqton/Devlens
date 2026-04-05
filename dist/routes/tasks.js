"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tasksRouter = void 0;
const express_1 = require("express");
exports.tasksRouter = (0, express_1.Router)();
exports.tasksRouter.get('/', async (req, res) => {
    const store = req.app.locals.taskStore;
    try {
        const status = req.query.status;
        const tasks = await store.getTasks(status ? { status } : undefined);
        res.json(tasks);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.tasksRouter.get('/:id', async (req, res) => {
    const store = req.app.locals.taskStore;
    try {
        const task = await store.getTask(req.params.id);
        if (!task)
            return res.status(404).json({ error: 'Task not found' });
        res.json(task);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.tasksRouter.post('/', async (req, res) => {
    const store = req.app.locals.taskStore;
    try {
        if (!req.body.title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        const task = await store.createTask(req.body);
        res.status(201).json(task);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.tasksRouter.put('/:id', async (req, res) => {
    const store = req.app.locals.taskStore;
    try {
        const task = await store.updateTask(req.params.id, req.body);
        res.json(task);
    }
    catch (err) {
        if (err.message === 'Task not found') {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});
exports.tasksRouter.delete('/:id', async (req, res) => {
    const store = req.app.locals.taskStore;
    try {
        await store.deleteTask(req.params.id);
        res.status(204).send();
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
//# sourceMappingURL=tasks.js.map