import fs from 'fs';
import path from 'path';

export interface DevlensSettings {
  ignorePatterns: string[];
  ngrokAuthToken?: string;
}

// Common heavy/noisy directories that should be ignored by default
const DEFAULT_IGNORE_PATTERNS = [
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
  'target',          // Rust / Java
  'vendor',          // Go / PHP
  'coverage',
  '.idea',
  '.vscode',
];

export interface SettingsService {
  getSettings(): DevlensSettings;
  updateSettings(input: Partial<DevlensSettings>): DevlensSettings;
  getIgnorePatterns(): string[];
  getNgrokAuthToken(): string | undefined;
  /** Convert ignore patterns to chokidar-compatible globs */
  getChokidarIgnoreGlobs(): (string | RegExp)[];
  /** Convert ignore patterns to a Set of names for the file explorer */
  getIgnoreNameSet(): Set<string>;
}

export function createSettingsService(projectDir: string): SettingsService {
  const devlensDir = path.join(projectDir, '.devlens');
  const settingsFile = path.join(devlensDir, 'settings.json');

  function ensureFile() {
    if (!fs.existsSync(devlensDir)) {
      fs.mkdirSync(devlensDir, { recursive: true });
    }
    if (!fs.existsSync(settingsFile)) {
      const initial: DevlensSettings = { ignorePatterns: DEFAULT_IGNORE_PATTERNS };
      fs.writeFileSync(settingsFile, JSON.stringify(initial, null, 2));
    }
  }

  function load(): DevlensSettings {
    ensureFile();
    try {
      const data = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      return {
        ignorePatterns: Array.isArray(data.ignorePatterns) ? data.ignorePatterns : DEFAULT_IGNORE_PATTERNS,
      };
    } catch {
      return { ignorePatterns: DEFAULT_IGNORE_PATTERNS };
    }
  }

  function save(settings: DevlensSettings) {
    ensureFile();
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  }

  return {
    getSettings(): DevlensSettings {
      return load();
    },

    updateSettings(input): DevlensSettings {
      const current = load();
      const merged: DevlensSettings = {
        ignorePatterns: input.ignorePatterns ?? current.ignorePatterns,
        ngrokAuthToken: input.ngrokAuthToken !== undefined ? input.ngrokAuthToken : current.ngrokAuthToken,
      };
      // Dedupe + trim + drop empties
      merged.ignorePatterns = Array.from(
        new Set(
          merged.ignorePatterns.map(p => (p || '').trim()).filter(Boolean)
        )
      );
      save(merged);
      return merged;
    },

    getIgnorePatterns(): string[] {
      return load().ignorePatterns;
    },

    getNgrokAuthToken(): string | undefined {
      return load().ngrokAuthToken;
    },

    getChokidarIgnoreGlobs(): (string | RegExp)[] {
      const patterns = load().ignorePatterns;
      // Always ignore dotfiles
      const result: (string | RegExp)[] = [/(^|[\/\\])\../];
      for (const p of patterns) {
        // If pattern contains glob chars, use as-is. Otherwise treat as a directory or filename.
        if (p.includes('*') || p.includes('?') || p.includes('[')) {
          result.push(p);
        } else {
          // Match anywhere in tree: ignore the dir/file at any depth
          result.push(`**/${p}/**`, `**/${p}`);
        }
      }
      return result;
    },

    getIgnoreNameSet(): Set<string> {
      const patterns = load().ignorePatterns;
      const set = new Set<string>();
      for (const p of patterns) {
        if (!p.includes('*') && !p.includes('/')) set.add(p);
      }
      return set;
    },
  };
}
