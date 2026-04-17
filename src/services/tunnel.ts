import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

// Use bundled binaries from npm packages
let cloudflaredBin: string;
let ngrokBin: string;
try {
  cloudflaredBin = require('cloudflared').bin;
} catch {
  cloudflaredBin = 'cloudflared';
}
try {
  const ngrokDir = path.dirname(require.resolve('ngrok'));
  ngrokBin = path.join(ngrokDir, 'bin', 'ngrok');
} catch {
  ngrokBin = 'ngrok';
}

interface TunnelState {
  provider: 'cloudflare' | 'ngrok' | null;
  url: string | null;
  process: ChildProcess | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}

const state: TunnelState = {
  provider: null,
  url: null,
  process: null,
  status: 'disconnected',
};

export function getTunnelStatus() {
  return {
    provider: state.provider,
    url: state.url,
    status: state.status,
    error: state.error,
  };
}

export function startTunnel(port: number, provider: 'cloudflare' | 'ngrok' = 'cloudflare', ngrokToken?: string): Promise<string> {
  stopTunnel();

  state.provider = provider;
  state.status = 'connecting';
  state.error = undefined;

  if (provider === 'ngrok') {
    return startNgrok(port, ngrokToken);
  }
  return startCloudflare(port);
}

function startCloudflare(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      state.process = spawn(cloudflaredBin, ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      state.status = 'error';
      state.error = 'cloudflared not found';
      reject(new Error('cloudflared binary not found'));
      return;
    }

    let resolved = false;
    const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

    const handleOutput = (data: Buffer) => {
      const text = data.toString();
      if (!resolved) {
        const match = text.match(urlRegex);
        if (match) {
          resolved = true;
          state.url = match[0];
          state.status = 'connected';
          resolve(match[0]);
        }
      }
    };

    state.process.stdout?.on('data', handleOutput);
    state.process.stderr?.on('data', handleOutput);

    state.process.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        state.status = 'error';
        state.error = err.message;
        reject(new Error(`cloudflared failed: ${err.message}`));
      }
    });

    state.process.on('exit', (code) => {
      state.status = 'disconnected';
      state.url = null;
      if (!resolved) {
        resolved = true;
        reject(new Error(`cloudflared exited with code ${code}`));
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        state.status = 'error';
        state.error = 'Tunnel setup timed out';
        reject(new Error('Tunnel setup timed out'));
      }
    }, 30000);
  });
}

function startNgrok(port: number, token?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['http', String(port), '--log=stdout'];
    if (token) {
      args.push(`--authtoken=${token}`);
    }

    try {
      state.process = spawn(ngrokBin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      state.status = 'error';
      state.error = 'ngrok not found';
      reject(new Error('ngrok binary not found'));
      return;
    }

    let resolved = false;
    const urlRegex = /https:\/\/[a-z0-9-]+\.ngrok[a-z-]*\.[a-z]+/;

    const handleOutput = (data: Buffer) => {
      const text = data.toString();
      if (!resolved) {
        const match = text.match(urlRegex);
        if (match) {
          resolved = true;
          state.url = match[0];
          state.status = 'connected';
          resolve(match[0]);
        }
        // Detect auth token error
        if (text.includes('authentication failed') || text.includes('ERR_NGROK_108') || text.includes('invalid token')) {
          if (!resolved) {
            resolved = true;
            state.status = 'error';
            state.error = 'Invalid ngrok auth token';
            reject(new Error('Invalid ngrok auth token'));
          }
        }
      }
    };

    state.process.stdout?.on('data', handleOutput);
    state.process.stderr?.on('data', handleOutput);

    state.process.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        state.status = 'error';
        state.error = err.message;
        reject(new Error(`ngrok failed: ${err.message}`));
      }
    });

    state.process.on('exit', (code) => {
      state.status = 'disconnected';
      state.url = null;
      if (!resolved) {
        resolved = true;
        reject(new Error(`ngrok exited with code ${code}`));
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        state.status = 'error';
        state.error = 'Tunnel setup timed out';
        reject(new Error('Tunnel setup timed out'));
      }
    }, 30000);
  });
}

export function stopTunnel() {
  if (state.process) {
    state.process.kill();
    state.process = null;
  }
  state.url = null;
  state.status = 'disconnected';
  state.provider = null;
  state.error = undefined;
}
