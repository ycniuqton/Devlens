import { Router, Request, Response } from 'express';
import { GitService } from '../services/git';

export const diffRouter = Router();

diffRouter.get('/diff', async (req: Request, res: Response) => {
  const gitService: GitService = req.app.locals.gitService;
  try {
    const filter = req.query.filter as string | undefined;
    const diff = await gitService.getDiff(filter);
    const files = await gitService.getStatus();
    res.json({ diff, files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

diffRouter.get('/status', async (req: Request, res: Response) => {
  const gitService: GitService = req.app.locals.gitService;
  try {
    const status = await gitService.getStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

diffRouter.get('/log', async (req: Request, res: Response) => {
  const gitService: GitService = req.app.locals.gitService;
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const log = await gitService.getLog(limit);
    res.json(log);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
