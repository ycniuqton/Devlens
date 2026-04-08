import { Router, Request, Response } from 'express';
import { GitService } from '../services/git';
import { listDirectory, readFile } from '../services/files';

export const browserRouter = Router();

// GET /api/browser/branch — current branch name
browserRouter.get('/branch', async (req: Request, res: Response) => {
  const git: GitService = req.app.locals.gitService;
  try {
    const branch = await git.getCurrentBranch();
    res.json({ branch });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/browser/commits?limit=50 — recent commits in current branch
browserRouter.get('/commits', async (req: Request, res: Response) => {
  const git: GitService = req.app.locals.gitService;
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const log = await git.getLog(limit);
    res.json(log);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/browser/commit/:hash — show commit details (files + diff)
browserRouter.get('/commit/:hash', async (req: Request, res: Response) => {
  const git: GitService = req.app.locals.gitService;
  try {
    const files = await git.getCommitFiles(req.params.hash);
    const diff = await git.getCommitDiff(req.params.hash);
    res.json({ hash: req.params.hash, files, diff });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/browser/files?path=... — list directory contents
browserRouter.get('/files', (req: Request, res: Response) => {
  const projectDir: string = req.app.locals.projectDir;
  const settings = req.app.locals.settingsService;
  const relPath = (req.query.path as string) || '';
  const ignoreSet = settings ? settings.getIgnoreNameSet() : undefined;
  const entries = listDirectory(projectDir, relPath, ignoreSet);
  res.json({ path: relPath, entries });
});

// GET /api/browser/file?path=... — read file content
browserRouter.get('/file', (req: Request, res: Response) => {
  const projectDir: string = req.app.locals.projectDir;
  const relPath = (req.query.path as string) || '';
  if (!relPath) return res.status(400).json({ error: 'path required' });
  const result = readFile(projectDir, relPath);
  if (!result) return res.status(404).json({ error: 'not found' });
  res.json({ path: relPath, ...result });
});
