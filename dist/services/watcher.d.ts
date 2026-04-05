import chokidar from 'chokidar';
export declare function createWatcher(projectDir: string, onChange: () => void): chokidar.FSWatcher;
