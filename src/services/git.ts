import simpleGit, { SimpleGit } from 'simple-git';
import { FileStatus, LogEntry } from '../types';

export interface GitService {
  getDiff(filter?: string): Promise<string>;
  getStatus(): Promise<FileStatus[]>;
  getLog(limit?: number): Promise<LogEntry[]>;
  isRepo(): Promise<boolean>;
}

export function createGitService(projectDir: string): GitService {
  const git: SimpleGit = simpleGit(projectDir);

  return {
    async getDiff(filter?: string): Promise<string> {
      if (filter === 'staged') {
        return git.diff(['--cached']);
      }
      if (filter === 'unstaged') {
        return git.diff();
      }
      // All: combine unstaged + staged
      const unstaged = await git.diff();
      const staged = await git.diff(['--cached']);
      return [unstaged, staged].filter(Boolean).join('\n');
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
      return log.all.map((entry) => ({
        hash: entry.hash.substring(0, 8),
        message: entry.message,
        author: entry.author_name,
        date: entry.date,
      }));
    },

    async isRepo(): Promise<boolean> {
      return git.checkIsRepo();
    },
  };
}
