import { FileStatus, LogEntry } from '../types';
export interface GitService {
    getDiff(filter?: string): Promise<string>;
    getStatus(): Promise<FileStatus[]>;
    getLog(limit?: number): Promise<LogEntry[]>;
    isRepo(): Promise<boolean>;
}
export declare function createGitService(projectDir: string): GitService;
