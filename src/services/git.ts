import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import { FileStatus, LogEntry } from '../types';

export interface GitService {
  getDiff(filter?: string): Promise<string>;
  getStatus(): Promise<FileStatus[]>;
  getLog(limit?: number): Promise<LogEntry[]>;
  isRepo(): Promise<boolean>;
  getCurrentBranch(): Promise<string>;
  getCommitDiff(hash: string): Promise<string>;
  getCommitFiles(hash: string): Promise<{ path: string; status: string }[]>;
}

export function createGitService(projectDir: string): GitService {
  const git: SimpleGit = simpleGit(projectDir);

  // Generate a unified diff for an untracked file (show as all-new)
  function makeUntrackedDiff(filePath: string): string {
    try {
      const fullPath = path.join(projectDir, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const added = lines.map(l => '+' + l).join('\n');
      return `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n${added}`;
    } catch {
      return '';
    }
  }

  return {
    async getDiff(filter?: string): Promise<string> {
      let diff = '';
      if (filter === 'staged') {
        diff = await git.diff(['--cached']);
      } else if (filter === 'unstaged') {
        diff = await git.diff();
      } else {
        const unstaged = await git.diff();
        const staged = await git.diff(['--cached']);
        diff = [unstaged, staged].filter(Boolean).join('\n');
      }

      // Include untracked files as new-file diffs
      if (filter !== 'staged') {
        const status = await git.status();
        for (const f of status.not_added) {
          const untrackedDiff = makeUntrackedDiff(f);
          if (untrackedDiff) {
            diff = diff ? diff + '\n' + untrackedDiff : untrackedDiff;
          }
        }
      }

      return diff;
    },

    async getStatus(): Promise<FileStatus[]> {
      const status = await git.status();
      const files: FileStatus[] = [];

      for (const f of status.modified) {
        files.push({ path: f, status: 'modified', staged: false });
      }
      for (const f of status.not_added) {
        files.push({ path: f, status: 'untracked', staged: false });
      }
      for (const f of status.deleted) {
        files.push({ path: f, status: 'deleted', staged: false });
      }
      for (const f of status.created) {
        files.push({ path: f, status: 'added', staged: true });
      }
      for (const f of status.staged) {
        if (!files.some(x => x.path === f)) {
          files.push({ path: f, status: 'modified', staged: true });
        }
      }
      for (const f of status.renamed) {
        files.push({ path: f.to, status: 'renamed', staged: true });
      }

      return files;
    },

    async getLog(limit = 20): Promise<LogEntry[]> {
      const log = await git.log({ maxCount: limit });
      return log.all.map((entry: any) => ({
        hash: entry.hash.substring(0, 8),
        message: entry.message,
        body: entry.body || '',
        author: entry.author_name,
        date: entry.date,
      }));
    },

    async isRepo(): Promise<boolean> {
      return git.checkIsRepo();
    },

    async getCurrentBranch(): Promise<string> {
      try {
        const status = await git.status();
        return status.current || 'HEAD';
      } catch {
        return 'unknown';
      }
    },

    async getCommitDiff(hash: string): Promise<string> {
      try {
        return await git.show([hash]);
      } catch {
        return '';
      }
    },

    async getCommitFiles(hash: string): Promise<{ path: string; status: string }[]> {
      try {
        const raw = await git.raw(['show', '--name-status', '--format=', hash]);
        const lines = raw.split('\n').filter(Boolean);
        const result: { path: string; status: string }[] = [];
        for (const line of lines) {
          const parts = line.split('\t');
          if (parts.length < 2) continue;
          const code = parts[0].trim();
          const file = parts[parts.length - 1];
          const statusMap: Record<string, string> = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed' };
          result.push({ path: file, status: statusMap[code[0]] || 'modified' });
        }
        return result;
      } catch {
        return [];
      }
    },
  };
}
