import fs from 'fs';
import path from 'path';
import { DevlensConfig } from '../types';

export function loadConfig(projectDir: string): DevlensConfig {
  const configFile = path.join(projectDir, '.devlens', 'config.json');
  if (!fs.existsSync(configFile)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
}

export function saveConfig(projectDir: string, config: DevlensConfig) {
  const devlensDir = path.join(projectDir, '.devlens');
  if (!fs.existsSync(devlensDir)) {
    fs.mkdirSync(devlensDir, { recursive: true });
  }
  const configFile = path.join(devlensDir, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}
