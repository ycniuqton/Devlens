import { Command } from 'commander';
import path from 'path';
import { createServer } from './server';
import { ServerOptions } from './types';
import { initDevlens, uninstallDevlens } from './init';

const pkg = require('../package.json');

const program = new Command();

program
  .name('devlens')
  .description('Developer dashboard with real-time git diffs and task board')
  .version(pkg.version);

// devlens start (default command)
program
  .command('start', { isDefault: true })
  .description('Start the Devlens dashboard')
  .option('-p, --port <number>', 'Port to listen on', '4700')
  .option('--no-open', 'Do not open browser automatically')
  .option('--tunnel', 'Enable Cloudflare Tunnel for remote access')
  .option('-d, --dir <path>', 'Project directory to analyze', process.cwd())
  .action(async (opts) => {
    const options: ServerOptions = {
      port: parseInt(opts.port, 10),
      projectDir: path.resolve(opts.dir),
      openBrowser: opts.open !== false,
      tunnel: opts.tunnel || false,
    };

    const { httpServer } = createServer(options);

    httpServer.listen(options.port, '0.0.0.0', () => {
      const url = `http://localhost:${options.port}`;
      console.log(`\n  Devlens running at ${url}`);
      console.log(`  Watching: ${options.projectDir}\n`);

      if (options.openBrowser) {
        import('open').then((mod) => mod.default(url)).catch(() => {});
      }

      if (options.tunnel) {
        import('./services/tunnel').then((mod) => {
          mod.startTunnel(options.port).then((tunnelUrl) => {
            console.log(`  Tunnel: ${tunnelUrl}\n`);
          });
        }).catch((err) => {
          console.log(`  Tunnel failed: ${err.message}\n`);
        });
      }
    });
  });

// devlens init — install Claude Code hooks
program
  .command('init')
  .description('Install Claude Code hooks for task sync in this project')
  .option('-p, --port <number>', 'Devlens port for hook to target', '4700')
  .option('-d, --dir <path>', 'Project directory', process.cwd())
  .action((opts) => {
    const projectDir = path.resolve(opts.dir);
    const port = parseInt(opts.port, 10);
    console.log(`\n  Installing Devlens hooks in ${projectDir}...`);
    initDevlens(projectDir, port);
  });

// devlens uninstall — remove Claude Code hooks
program
  .command('uninstall')
  .description('Remove Claude Code hooks from this project')
  .option('-d, --dir <path>', 'Project directory', process.cwd())
  .action((opts) => {
    const projectDir = path.resolve(opts.dir);
    console.log(`\n  Removing Devlens hooks from ${projectDir}...`);
    uninstallDevlens(projectDir);
  });

program.parse();
