import fs from 'fs';
import path from 'path';

export interface FileEntry {
  name: string;
  path: string;       // relative to projectDir
  type: 'file' | 'dir';
  size?: number;
}

const IGNORE = new Set(['.git', 'node_modules', '.devlens', 'dist', '.next', '.nuxt', '.cache']);

function isSafePath(projectDir: string, target: string): boolean {
  const abs = path.resolve(projectDir, target);
  const root = path.resolve(projectDir);
  return abs === root || abs.startsWith(root + path.sep);
}

export function listDirectory(projectDir: string, relPath: string): FileEntry[] {
  if (!isSafePath(projectDir, relPath)) return [];
  const abs = path.resolve(projectDir, relPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return [];

  const entries = fs.readdirSync(abs, { withFileTypes: true });
  const result: FileEntry[] = [];

  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.gitignore' && entry.name !== '.env.example') continue;

    const entryRel = relPath ? path.posix.join(relPath, entry.name) : entry.name;
    const entryAbs = path.join(abs, entry.name);

    if (entry.isDirectory()) {
      result.push({ name: entry.name, path: entryRel, type: 'dir' });
    } else if (entry.isFile()) {
      let size = 0;
      try { size = fs.statSync(entryAbs).size; } catch {}
      result.push({ name: entry.name, path: entryRel, type: 'file', size });
    }
  }

  // Folders first, then alphabetical
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

export function readFile(projectDir: string, relPath: string, maxBytes = 200_000): { content: string; truncated: boolean; size: number } | null {
  if (!isSafePath(projectDir, relPath)) return null;
  const abs = path.resolve(projectDir, relPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;

  const stat = fs.statSync(abs);
  const size = stat.size;
  const truncated = size > maxBytes;
  const buf = fs.readFileSync(abs);
  const content = truncated ? buf.subarray(0, maxBytes).toString('utf-8') + '\n\n... [truncated]' : buf.toString('utf-8');

  return { content, truncated, size };
}
