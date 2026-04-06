#!/usr/bin/env bun

import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';
import { createInterface } from 'node:readline';

const CONFIG_DIR = join(process.env['HOME'] ?? '.', '.things-provider');
const ENV_FILE = join(CONFIG_DIR, '.env');

function log(msg: string) {
  console.log(`\x1b[36m[things3-bridge]\x1b[0m ${msg}`);
}

function error(msg: string) {
  console.error(`\x1b[31m[things3-bridge]\x1b[0m ${msg}`);
}

function success(msg: string) {
  console.log(`\x1b[32m[things3-bridge]\x1b[0m ${msg}`);
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', cmd], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

function parseArgs(): { port?: number; token?: string } {
  const args = process.argv.slice(2);
  const result: { port?: number; token?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      result.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--token' && args[i + 1]) {
      result.token = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
  things3-bridge — REST API for Things 3

  Usage:
    bunx things3-bridge [options]

  Options:
    --port <number>    Server port (default: 3000)
    --token <string>   Bearer token for API auth (auto-generated if omitted)
    -h, --help         Show this help message
`);
      process.exit(0);
    }
  }

  return result;
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadOrCreateToken(): Promise<string> {
  // Check saved env file
  if (existsSync(ENV_FILE)) {
    const content = await readFile(ENV_FILE, 'utf-8');
    const match = content.match(/^THINGS_PROVIDER_TOKEN=(.+)$/m);
    if (match?.[1]) {
      log('Using saved token from ~/.things-provider/.env');
      return match[1];
    }
  }

  // Generate and save a new token
  const token = generateToken();
  await mkdir(CONFIG_DIR, { recursive: true });

  const envContent = existsSync(ENV_FILE) ? await readFile(ENV_FILE, 'utf-8') : '';
  const lines = envContent.split('\n').filter((l) => !l.startsWith('THINGS_PROVIDER_TOKEN='));
  lines.push(`THINGS_PROVIDER_TOKEN=${token}`);
  await writeFile(ENV_FILE, lines.filter(Boolean).join('\n') + '\n');

  success(`Generated new token and saved to ${ENV_FILE}`);
  return token;
}

// --- Preflight checks ---

async function checkMacOS(): Promise<boolean> {
  if (platform() !== 'darwin') {
    error('Things 3 is a macOS app. This tool only runs on macOS.');
    return false;
  }
  return true;
}

async function checkThings3(): Promise<boolean> {
  if (!existsSync('/Applications/Things3.app')) {
    error('Things 3 is not installed.');
    log('Install it from the Mac App Store: https://culturedcode.com/things/');
    return false;
  }
  return true;
}

async function checkThingsCli(): Promise<boolean> {
  if (await commandExists('things')) return true;

  log('things-cli is not installed (required to communicate with Things 3).');

  if (await commandExists('brew')) {
    const answer = await prompt('  Install via Homebrew? (Y/n) ');
    if (answer === '' || answer === 'y' || answer === 'yes') {
      log('Installing things-cli...');
      const proc = Bun.spawn(['brew', 'install', 'things-cli'], {
        stdout: 'inherit',
        stderr: 'inherit',
      });
      await proc.exited;
      if (proc.exitCode !== 0) {
        error('Failed to install things-cli. Please install manually:');
        log('  brew install things-cli');
        return false;
      }
      success('things-cli installed successfully.');
      return true;
    }
  }

  error('Please install things-cli manually:');
  log('  brew install things-cli');
  log('  https://github.com/thingsapi/things-cli');
  return false;
}

// --- Main ---

async function main() {
  const args = parseArgs();

  if (!(await checkMacOS())) process.exit(1);
  if (!(await checkThings3())) process.exit(1);
  if (!(await checkThingsCli())) process.exit(1);

  // Resolve token: CLI arg > env var > saved file > generate
  const token = args.token ?? process.env['THINGS_PROVIDER_TOKEN'] ?? (await loadOrCreateToken());
  const port = args.port ?? parseInt(process.env['THINGS_PROVIDER_PORT'] ?? '3000', 10);

  // Set env vars so the existing config/server code picks them up
  process.env['THINGS_PROVIDER_TOKEN'] = token;
  process.env['THINGS_PROVIDER_PORT'] = String(port);

  // Start the server (import dynamically so env is set first)
  await import('./index.ts');

  console.log('');
  success('Things 3 Bridge is running!');
  console.log('');
  console.log(`  URL:    \x1b[1mhttp://localhost:${port}\x1b[0m`);
  console.log(`  Token:  \x1b[1m${token}\x1b[0m`);
  console.log('');
  log('Press Ctrl+C to stop.');
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
