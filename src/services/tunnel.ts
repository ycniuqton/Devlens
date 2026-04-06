import { spawn, ChildProcess } from 'child_process';

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

export function startTunnel(port: number, provider: 'cloudflare' | 'ngrok' = 'cloudflare'): Promise<string> {
  // Stop existing tunnel first
  stopTunnel();

  state.provider = provider;
  state.status = 'connecting';
  state.error = undefined;

  if (provider === 'ngrok') {
    return startNgrok(port);
  }
  return startCloudflare(port);
}

function startCloudflare(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      state.process = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      state.status = 'error';
      state.error = 'cloudflared not installed';
      reject(new Error('cloudflared is not installed. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'));
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
    }, 15000);
  });
}

function startNgrok(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      state.process = spawn('ngrok', ['http', String(port), '--log=stdout'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      state.status = 'error';
      state.error = 'ngrok not installed';
      reject(new Error('ngrok is not installed. Install: https://ngrok.com/download'));
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
    }, 15000);
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
