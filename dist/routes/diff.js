"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffRouter = void 0;
const express_1 = require("express");
exports.diffRouter = (0, express_1.Router)();
exports.diffRouter.get('/diff', async (req, res) => {
    const gitService = req.app.locals.gitService;
    try {
        const filter = req.query.filter;
        const diff = await gitService.getDiff(filter);
        const files = await gitService.getStatus();
        res.json({ diff, files });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.diffRouter.get('/status', async (req, res) => {
    const gitService = req.app.locals.gitService;
    try {
        const status = await gitService.getStatus();
        res.json(status);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.diffRouter.get('/log', async (req, res) => {
    const gitService = req.app.locals.gitService;
    try {
        const limit = parseInt(req.query.limit) || 20;
        const log = await gitService.getLog(limit);
        res.json(log);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
//# sourceMappingURL=diff.js.map