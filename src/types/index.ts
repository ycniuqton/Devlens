export interface ServerOptions {
  port: number;
  projectDir: string;
  openBrowser: boolean;
  tunnel: boolean;
}

export interface FileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
}

export interface LogEntry {
  hash: string;
  message: string;
  body?: string;
  author: string;
  date: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'archived';
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  source: 'local';
  // Claude Code metadata
  claudeSessionId?: string;
  claudeTaskId?: string;
  activeForm?: string;
  owner?: string;
  metadata?: Record<string, any>;
  context?: string; // context when task was created (JSON)
  completionContext?: string; // context when task was completed (JSON)
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: Task['status'];
  priority?: Task['priority'];
  tags?: string[];
  dependencies?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: Task['status'];
  priority?: Task['priority'];
  tags?: string[];
  dependencies?: string[];
}

export interface TaskStore {
  version: 1;
  tasks: Task[];
}

export interface ExternalTask {
  id: string;
  externalId: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  source: 'jira' | 'linear';
  url: string;
  assignee?: string;
}

export interface DevlensConfig {
  jira?: {
    baseUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
  };
  linear?: {
    apiKey: string;
    teamId?: string;
  };
  tunnel?: {
    enabled: boolean;
  };
}

export interface WsMessage {
  type: 'file-changed' | 'diff-update' | 'status-update' | 'task-update' | 'todo-update' | 'claude-tasks-update' | 'rules-update' | 'commit-approval-update' | 'settings-update';
  payload: unknown;
}
