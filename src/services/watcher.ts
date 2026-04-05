import chokidar from 'chokidar';

export function createWatcher(projectDir: string, onChange: () => void) {
  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = chokidar.watch(projectDir, {
    ignored: [
      /(^|[\/\\])\../,       // dotfiles
      '**/node_modules/**',
      '**/.git/**',
      '**/.devlens/**',
    ],
    persistent: true,
    ignoreInitial: true,
  });

  const debouncedOnChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onChange, 300);
  };

  watcher.on('change', debouncedOnChange);
  watcher.on('add', debouncedOnChange);
  watcher.on('unlink', debouncedOnChange);

  return watcher;
}
