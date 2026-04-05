"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.integrationsRouter = void 0;
const express_1 = require("express");
const config_1 = require("../services/config");
const jira_1 = require("../services/jira");
const linear_1 = require("../services/linear");
exports.integrationsRouter = (0, express_1.Router)();
// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 60000; // 60 seconds
function getCached(key) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        return entry.data;
    }
    return null;
}
function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}
exports.integrationsRouter.get('/status', (req, res) => {
    const config = (0, config_1.loadConfig)(req.app.locals.projectDir);
    res.json({
        jira: !!(config.jira?.baseUrl && config.jira?.apiToken),
        linear: !!config.linear?.apiKey,
    });
});
exports.integrationsRouter.get('/jira/issues', async (req, res) => {
    try {
        const cached = getCached('jira');
        if (cached)
            return res.json(cached);
        const config = (0, config_1.loadConfig)(req.app.locals.projectDir);
        if (!config.jira)
            return res.status(400).json({ error: 'Jira not configured' });
        const client = (0, jira_1.createJiraClient)(config.jira);
        const issues = await client.getIssues();
        setCache('jira', issues);
        res.json(issues);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.integrationsRouter.get('/linear/issues', async (req, res) => {
    try {
        const cached = getCached('linear');
        if (cached)
            return res.json(cached);
        const config = (0, config_1.loadConfig)(req.app.locals.projectDir);
        if (!config.linear)
            return res.status(400).json({ error: 'Linear not configured' });
        const client = (0, linear_1.createLinearClient)(config.linear);
        const issues = await client.getIssues();
        setCache('linear', issues);
        res.json(issues);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.integrationsRouter.get('/all', async (req, res) => {
    const config = (0, config_1.loadConfig)(req.app.locals.projectDir);
    const results = [];
    try {
        if (config.jira?.baseUrl && config.jira?.apiToken) {
            const cached = getCached('jira');
            if (cached) {
                results.push(...cached);
            }
            else {
                const client = (0, jira_1.createJiraClient)(config.jira);
                const issues = await client.getIssues();
                setCache('jira', issues);
                results.push(...issues);
            }
        }
    }
    catch { /* skip failed integration */ }
    try {
        if (config.linear?.apiKey) {
            const cached = getCached('linear');
            if (cached) {
                results.push(...cached);
            }
            else {
                const client = (0, linear_1.createLinearClient)(config.linear);
                const issues = await client.getIssues();
                setCache('linear', issues);
                results.push(...issues);
            }
        }
    }
    catch { /* skip failed integration */ }
    res.json(results);
});
exports.integrationsRouter.post('/config', (req, res) => {
    try {
        const projectDir = req.app.locals.projectDir;
        const existing = (0, config_1.loadConfig)(projectDir);
        const updated = { ...existing, ...req.body };
        (0, config_1.saveConfig)(projectDir, updated);
        cache.clear();
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
//# sourceMappingURL=integrations.js.map