import { Command } from 'commander';
import path from 'path';
import { createServer } from './server';
import { ServerOptions } from './types';

const pkg = require('../package.json');

const program = new Command();

program
  .name('devlens')
  .description('Developer dashboard with real-time git diffs and task board')
  .version(pkg.version)
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

    httpServer.listen(options.port, () => {
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

program.parse();
