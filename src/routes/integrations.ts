import { Router, Request, Response } from 'express';
import { loadConfig, saveConfig } from '../services/config';
import { createJiraClient } from '../services/jira';
import { createLinearClient } from '../services/linear';
import { startTunnel, stopTunnel, getTunnelStatus } from '../services/tunnel';
import { ExternalTask } from '../types';

export const integrationsRouter = Router();

// Simple in-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 60 seconds

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data as T;
  }
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

integrationsRouter.get('/status', (req: Request, res: Response) => {
  const config = loadConfig(req.app.locals.projectDir);
  res.json({
    jira: !!(config.jira?.baseUrl && config.jira?.apiToken),
    linear: !!config.linear?.apiKey,
    tunnel: getTunnelStatus(),
  });
});

// Tunnel endpoints
integrationsRouter.get('/tunnel/status', (_req: Request, res: Response) => {
  res.json(getTunnelStatus());
});

integrationsRouter.post('/tunnel/start', async (req: Request, res: Response) => {
  const { provider } = req.body;
  const port = req.app.locals.port || 5157;
  const settingsService = req.app.locals.settingsService;
  const ngrokToken = settingsService?.getNgrokAuthToken();

  if (provider === 'ngrok' && !ngrokToken) {
    return res.status(400).json({ error: 'ngrok_no_token', message: 'ngrok auth token not configured' });
  }

  try {
    const url = await startTunnel(port, provider || 'cloudflare', ngrokToken);
    res.json({ ok: true, url, provider: provider || 'cloudflare' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

integrationsRouter.post('/tunnel/stop', (_req: Request, res: Response) => {
  stopTunnel();
  res.json({ ok: true });
});

integrationsRouter.get('/tunnel/ngrok-token', (req: Request, res: Response) => {
  const settingsService = req.app.locals.settingsService;
  const token = settingsService?.getNgrokAuthToken();
  res.json({ configured: !!token });
});

integrationsRouter.post('/tunnel/ngrok-token', (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const settingsService = req.app.locals.settingsService;
    if (!settingsService) return res.status(500).json({ error: 'Settings service not available' });
    settingsService.updateSettings({ ngrokAuthToken: token || undefined });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

integrationsRouter.get('/jira/issues', async (req: Request, res: Response) => {
  try {
    const cached = getCached<ExternalTask[]>('jira');
    if (cached) return res.json(cached);

    const config = loadConfig(req.app.locals.projectDir);
    if (!config.jira) return res.status(400).json({ error: 'Jira not configured' });

    const client = createJiraClient(config.jira);
    const issues = await client.getIssues();
    setCache('jira', issues);
    res.json(issues);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

integrationsRouter.get('/linear/issues', async (req: Request, res: Response) => {
  try {
    const cached = getCached<ExternalTask[]>('linear');
    if (cached) return res.json(cached);

    const config = loadConfig(req.app.locals.projectDir);
    if (!config.linear) return res.status(400).json({ error: 'Linear not configured' });

    const client = createLinearClient(config.linear);
    const issues = await client.getIssues();
    setCache('linear', issues);
    res.json(issues);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

integrationsRouter.get('/all', async (req: Request, res: Response) => {
  const config = loadConfig(req.app.locals.projectDir);
  const results: ExternalTask[] = [];

  try {
    if (config.jira?.baseUrl && config.jira?.apiToken) {
      const cached = getCached<ExternalTask[]>('jira');
      if (cached) {
        results.push(...cached);
      } else {
        const client = createJiraClient(config.jira);
        const issues = await client.getIssues();
        setCache('jira', issues);
        results.push(...issues);
      }
    }
  } catch { /* skip failed integration */ }

  try {
    if (config.linear?.apiKey) {
      const cached = getCached<ExternalTask[]>('linear');
      if (cached) {
        results.push(...cached);
      } else {
        const client = createLinearClient(config.linear);
        const issues = await client.getIssues();
        setCache('linear', issues);
        results.push(...issues);
      }
    }
  } catch { /* skip failed integration */ }

  res.json(results);
});

integrationsRouter.post('/config', (req: Request, res: Response) => {
  try {
    const projectDir = req.app.locals.projectDir;
    const existing = loadConfig(projectDir);
    const updated = { ...existing, ...req.body };
    saveConfig(projectDir, updated);
    cache.clear();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
