import chokidar, { FSWatcher } from 'chokidar';

export function createWatcher(
  projectDir: string,
  onChange: () => void,
  ignored: (string | RegExp)[] = [
    /(^|[\/\\])\../,
    '**/node_modules/**',
    '**/.git/**',
    '**/.devlens/**',
  ]
): FSWatcher {
  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = chokidar.watch(projectDir, {
    ignored,
    persistent: true,
    ignoreInitial: true,
  });

  const debouncedOnChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onChange, 500);
  };

  watcher.on('change', debouncedOnChange);
  watcher.on('add', debouncedOnChange);
  watcher.on('unlink', debouncedOnChange);

  return watcher;
}
