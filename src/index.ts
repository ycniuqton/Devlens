import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createServer } from './server';
import { ServerOptions } from './types';
import { initDevlens, uninstallDevlens, portFromDir } from './init';

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
  .option('-p, --port <number>', 'Port to listen on (default: derived from project path)')
  .option('--no-open', 'Do not open browser automatically')
  .option('--tunnel', 'Enable Cloudflare Tunnel for remote access')
  .option('-d, --dir <path>', 'Project directory to analyze', process.cwd())
  .action(async (opts) => {
    const projectDir = path.resolve(opts.dir);
    const port = opts.port ? parseInt(opts.port, 10) : portFromDir(projectDir);

    const options: ServerOptions = {
      port,
      projectDir,
      openBrowser: opts.open !== false,
      tunnel: opts.tunnel || false,
    };

    const { httpServer } = createServer(options);

    httpServer.listen(options.port, '0.0.0.0', () => {
      const url = `http://localhost:${options.port}`;
      console.log(`\n  Devlens running at ${url}`);
      console.log(`  Watching: ${options.projectDir}\n`);

      // Write runtime info so `devlens status` and hooks can find it
      writeRuntimeInfo(options.projectDir, options.port);

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
  .option('-p, --port <number>', 'Override port (default: derived from project path)')
  .option('-d, --dir <path>', 'Project directory', process.cwd())
  .action((opts) => {
    const projectDir = path.resolve(opts.dir);
    const port = opts.port ? parseInt(opts.port, 10) : undefined;
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

// devlens status — show dashboard URL if running
program
  .command('status')
  .description('Show Devlens dashboard URL if running')
  .option('-d, --dir <path>', 'Project directory', process.cwd())
  .action((opts) => {
    const projectDir = path.resolve(opts.dir);
    const info = readRuntimeInfo(projectDir);

    if (!info) {
      console.log(`\n  Devlens is not running for ${projectDir}\n`);
      process.exit(1);
      return;
    }

    // Verify it's actually up
    const http = require('http');
    const req = http.get(`http://localhost:${info.port}`, (res: any) => {
      if (res.statusCode === 200) {
        console.log(`\n  \x1b[32m\x1b[1mDevlens is running\x1b[0m\n`);
        console.log(`  \x1b[2mLocal:\x1b[0m   \x1b[1m\x1b[36mhttp://localhost:${info.port}\x1b[0m`);
        for (const ip of info.ips || []) {
          console.log(`  \x1b[2mNetwork:\x1b[0m \x1b[1m\x1b[36mhttp://${ip}:${info.port}\x1b[0m`);
        }
        console.log(`  \x1b[2mPID:\x1b[0m     ${info.pid}`);
        console.log(`  \x1b[2mStarted:\x1b[0m ${info.startedAt}\n`);
      } else {
        cleanRuntimeInfo(projectDir);
        console.log(`\n  Devlens is not running (stale info cleaned)\n`);
        process.exit(1);
      }
    });
    req.on('error', () => {
      cleanRuntimeInfo(projectDir);
      console.log(`\n  Devlens is not running (stale info cleaned)\n`);
      process.exit(1);
    });
    req.end();
  });

// Runtime info helpers
function getRuntimeInfoPath(projectDir: string): string {
  const devlensDir = path.join(projectDir, '.devlens');
  return path.join(devlensDir, 'runtime.json');
}

function writeRuntimeInfo(projectDir: string, port: number) {
  const devlensDir = path.join(projectDir, '.devlens');
  if (!fs.existsSync(devlensDir)) {
    fs.mkdirSync(devlensDir, { recursive: true });
  }

  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  const info = {
    port,
    pid: process.pid,
    ips,
    startedAt: new Date().toISOString(),
    projectDir,
  };

  fs.writeFileSync(getRuntimeInfoPath(projectDir), JSON.stringify(info, null, 2));

  // Clean up on exit
  const cleanup = () => {
    try { fs.unlinkSync(getRuntimeInfoPath(projectDir)); } catch {}
  };
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('exit', cleanup);
}

function readRuntimeInfo(projectDir: string): any {
  const infoPath = getRuntimeInfoPath(projectDir);
  if (!fs.existsSync(infoPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
  } catch {
    return null;
  }
}

function cleanRuntimeInfo(projectDir: string) {
  try { fs.unlinkSync(getRuntimeInfoPath(projectDir)); } catch {}
}

program.parse();
