import { Router, Request, Response } from 'express';
import { SettingsService } from '../services/settings';
import { WsMessage } from '../types';

export const settingsRouter = Router();

const PRESET_PATTERNS = [
  'node_modules',
  '.git',
  '.devlens',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '_bmad',
  'venv',
  '.venv',
  'env',
  '__pycache__',
  '.pytest_cache',
  'target',
  'vendor',
  'coverage',
  '.idea',
  '.vscode',
];

// GET /api/settings — current settings + presets
settingsRouter.get('/', (req: Request, res: Response) => {
  const settings: SettingsService = req.app.locals.settingsService;
  res.json({
    ignorePatterns: settings.getIgnorePatterns(),
    presets: PRESET_PATTERNS,
  });
});

// PUT /api/settings — replace settings
settingsRouter.put('/', (req: Request, res: Response) => {
  const settings: SettingsService = req.app.locals.settingsService;
  const broadcast: (msg: WsMessage) => void = req.app.locals.broadcast;
  const reloadWatcher: (() => void) | undefined = req.app.locals.reloadWatcher;

  const { ignorePatterns } = req.body || {};
  if (!Array.isArray(ignorePatterns)) {
    return res.status(400).json({ error: 'ignorePatterns must be an array' });
  }

  const updated = settings.updateSettings({ ignorePatterns });

  // Restart the watcher with new patterns
  if (reloadWatcher) reloadWatcher();

  if (broadcast) broadcast({ type: 'settings-update', payload: updated } as any);
  res.json(updated);
});
