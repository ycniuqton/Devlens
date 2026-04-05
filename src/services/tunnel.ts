import { spawn, ChildProcess } from 'child_process';

let tunnelProcess: ChildProcess | null = null;

export function startTunnel(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      reject(new Error('cloudflared is not installed. Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'));
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
          resolve(match[0]);
        }
      }
    };

    tunnelProcess.stdout?.on('data', handleOutput);
    tunnelProcess.stderr?.on('data', handleOutput);

    tunnelProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`cloudflared failed: ${err.message}`));
      }
    });

    tunnelProcess.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`cloudflared exited with code ${code}`));
      }
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Tunnel setup timed out'));
      }
    }, 15000);
  });
}

export function stopTunnel() {
  if (tunnelProcess) {
    tunnelProcess.kill();
    tunnelProcess = null;
  }
}
