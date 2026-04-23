import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DEFAULT_PASSWORD = 'devlens';
const DEFAULT_USERNAME = 'admin';

interface AuthData {
  username: string;
  passwordHash: string;
}

export interface AuthService {
  validateCredentials(username: string, password: string): Promise<boolean>;
  changePassword(newPassword: string): Promise<void>;
  getUsername(): string;
}

export function createAuthService(projectDir: string): AuthService {
  const authFile = path.join(projectDir, '.devlens', 'auth.json');

  function ensureAuthFile() {
    const devlensDir = path.join(projectDir, '.devlens');
    if (!fs.existsSync(devlensDir)) fs.mkdirSync(devlensDir, { recursive: true });
    if (!fs.existsSync(authFile)) {
      const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
      const data: AuthData = { username: DEFAULT_USERNAME, passwordHash: hash };
      fs.writeFileSync(authFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    }
  }

  function load(): AuthData {
    ensureAuthFile();
    return JSON.parse(fs.readFileSync(authFile, 'utf-8'));
  }

  return {
    async validateCredentials(username: string, password: string): Promise<boolean> {
      const data = load();
      if (username !== data.username) return false;
      return bcrypt.compare(password, data.passwordHash);
    },

    async changePassword(newPassword: string): Promise<void> {
      const data = load();
      data.passwordHash = bcrypt.hashSync(newPassword, 10);
      fs.writeFileSync(authFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    },

    getUsername(): string {
      return load().username;
    },
  };
}
