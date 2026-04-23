import { Router, Request, Response } from 'express';

export const authRouter = Router();

authRouter.get('/status', (req: Request, res: Response) => {
  res.json({ authenticated: !!(req.session as any).authenticated });
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const authService = req.app.locals.authService;
  try {
    const valid = await authService.validateCredentials(username, password);
    if (valid) {
      (req.session as any).authenticated = true;
      res.json({ ok: true });
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

authRouter.post('/change-password', async (req: Request, res: Response) => {
  if (!(req.session as any).authenticated) return res.status(401).json({ error: 'Not authenticated' });
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const authService = req.app.locals.authService;
  try {
    const valid = await authService.validateCredentials(authService.getUsername(), currentPassword);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    await authService.changePassword(newPassword);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
