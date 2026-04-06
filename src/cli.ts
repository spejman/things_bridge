#!/usr/bin/env bun

import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';
import { createInterface } from 'node:readline';
import {
  resolveBunPath,
  installService,
  uninstallService,
  getServiceStatus,
  rotateLogs,
} from './launchd.ts';

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

export interface CliArgs {
  port?: number;
  token?: string;
  thingsAuthToken?: string;
  foreground?: boolean;
  service?: boolean;
  status?: boolean;
  uninstall?: boolean;
  logs?: boolean;
}

export function parseArgs(argv?: string[]): CliArgs {
  const args = argv ?? process.argv.slice(2);
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      result.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--token' && args[i + 1]) {
      result.token = args[i + 1];
      i++;
    } else if (args[i] === '--foreground') {
      result.foreground = true;
    } else if (args[i] === '--service') {
      result.service = true;
    } else if (args[i] === '--status') {
      result.status = true;
    } else if (args[i] === '--uninstall') {
      result.uninstall = true;
    } else if (args[i] === '--logs') {
      result.logs = true;
    } else if (args[i] === '--things-auth-token' && args[i + 1]) {
      result.thingsAuthToken = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
  things3-bridge — REST API for Things 3

  Usage:
    bunx things3-bridge [options]

  By default, installs a LaunchAgent that starts on login and runs
  continuously in the background.

  Options:
    --port <number>              Server port (default: 2714)
    --token <string>             Bearer token for API auth (auto-generated if omitted)
    --things-auth-token <token>  Things URL auth token (required for write operations)
    --foreground                 Run server directly without service management
    --status                     Show service status
    --logs                       Tail service logs in real time
    --uninstall                  Remove the LaunchAgent service
    -h, --help                   Show this help message

  The Things auth token enables write operations (create, update, delete).
  Find it in Things 3 > Settings > General > Things URLs.
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

async function loadOrPromptThingsAuthToken(): Promise<string | null> {
  // Check saved env file
  if (existsSync(ENV_FILE)) {
    const content = await readFile(ENV_FILE, 'utf-8');
    const match = content.match(/^THINGS_AUTH_TOKEN=(.+)$/m);
    if (match?.[1]) {
      log('Using saved Things auth token from ~/.things-provider/.env');
      return match[1];
    }
  }

  // Prompt (optional — user can skip)
  log('Things auth token enables write operations (create, update, delete).');
  log('Find it in Things 3 > Settings > General > Things URLs.');
  const answer = await prompt('  Things auth token (press Enter to skip): ');
  if (!answer) return null;

  // Save for next time
  await mkdir(CONFIG_DIR, { recursive: true });
  const envContent = existsSync(ENV_FILE) ? await readFile(ENV_FILE, 'utf-8') : '';
  const lines = envContent.split('\n').filter((l) => !l.startsWith('THINGS_AUTH_TOKEN='));
  lines.push(`THINGS_AUTH_TOKEN=${answer}`);
  await writeFile(ENV_FILE, lines.filter(Boolean).join('\n') + '\n');
  success('Saved Things auth token to ~/.things-provider/.env');
  return answer;
}

async function savePortToEnvFile(port: number): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });

  const envContent = existsSync(ENV_FILE) ? await readFile(ENV_FILE, 'utf-8') : '';
  const lines = envContent.split('\n').filter((l) => !l.startsWith('THINGS_PROVIDER_PORT='));
  lines.push(`THINGS_PROVIDER_PORT=${port}`);
  await writeFile(ENV_FILE, lines.filter(Boolean).join('\n') + '\n');
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

  log('things3-cli is not installed (required to communicate with Things 3).');

  if (await commandExists('brew')) {
    const answer = await prompt('  Install via Homebrew? (Y/n) ');
    if (answer === '' || answer === 'y' || answer === 'yes') {
      log('Installing things3-cli...');
      const proc = Bun.spawn(['brew', 'install', 'ossianhempel/tap/things3-cli'], {
        stdout: 'inherit',
        stderr: 'inherit',
      });
      await proc.exited;
      if (proc.exitCode !== 0) {
        error('Failed to install things3-cli. Please install manually:');
        log('  brew install ossianhempel/tap/things3-cli');
        return false;
      }
      success('things3-cli installed successfully.');
      return true;
    }
  }

  error('Please install things3-cli manually:');
  log('  brew install ossianhempel/tap/things3-cli');
  log('  https://github.com/ossianhempel/things3-cli');
  return false;
}

async function checkThingsCliNonInteractive(): Promise<boolean> {
  if (await commandExists('things')) return true;
  error('things3-cli is not installed. Run `bunx things3-bridge` interactively to set it up.');
  return false;
}

// --- Command handlers ---

async function handleStatus(): Promise<void> {
  const status = await getServiceStatus();
  console.log('');
  if (status.installed) {
    if (status.running) {
      success(`Service is running (PID: ${status.pid})`);
    } else {
      log('Service is installed but not running.');
    }
    console.log(`  Port:   ${status.port ?? 'unknown'}`);
    console.log(`  Plist:  ${status.plistPath}`);
    console.log(`  Logs:   ${status.logPaths.stdout}`);
    console.log(`          ${status.logPaths.stderr}`);
  } else {
    log('Service is not installed. Run `bunx things3-bridge` to install.');
  }
  console.log('');
}

async function handleUninstall(): Promise<void> {
  await uninstallService();
  success('LaunchAgent service removed.');
  log('The server will no longer start on login.');
}

async function handleLogs(): Promise<void> {
  const status = await getServiceStatus();
  const { stdout, stderr } = status.logPaths;

  if (!existsSync(stdout) && !existsSync(stderr)) {
    log('No log files found. Is the service installed?');
    return;
  }

  log('Tailing logs (Ctrl+C to stop)...');
  console.log('');

  const proc = Bun.spawn(['tail', '-f', stdout, stderr], {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  process.on('SIGINT', () => {
    proc.kill();
    process.exit(0);
  });

  await proc.exited;
}

async function startForegroundServer(port: number, token: string): Promise<void> {
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

async function handleInstallAndStart(port: number, token: string): Promise<void> {
  const status = await getServiceStatus();

  if (status.running) {
    console.log('');
    success(`Service is already running (PID: ${status.pid})`);
    console.log('');
    console.log(`  URL:    \x1b[1mhttp://localhost:${status.port ?? port}\x1b[0m`);
    console.log(`  Logs:   ${status.logPaths.stdout}`);
    console.log('');
    log('Use --foreground to run directly, --uninstall to remove.');
    return;
  }

  log('Installing LaunchAgent service...');
  const bunPath = await resolveBunPath();
  await installService({ bunPath });

  const newStatus = await getServiceStatus();
  console.log('');
  if (newStatus.running) {
    success('Things 3 Bridge service installed and running!');
  } else {
    success('Things 3 Bridge service installed.');
    log('Check logs if it failed to start:');
  }
  console.log('');
  console.log(`  URL:    \x1b[1mhttp://localhost:${port}\x1b[0m`);
  console.log(`  Token:  \x1b[1m${token}\x1b[0m`);
  console.log(`  Plist:  ${newStatus.plistPath}`);
  console.log(`  Logs:   ${newStatus.logPaths.stdout}`);
  console.log('');
  log('The service will start automatically on login.');
  log('Use --status to check, --uninstall to remove.');
}

// --- Main ---

async function main() {
  const args = parseArgs();

  // Handle --status, --logs, --uninstall early (no preflight needed)
  if (args.status) {
    await handleStatus();
    return;
  }

  if (args.logs) {
    await handleLogs();
    return;
  }

  if (args.uninstall) {
    await handleUninstall();
    return;
  }

  // Preflight checks
  if (!(await checkMacOS())) process.exit(1);
  if (!(await checkThings3())) process.exit(1);

  if (args.service) {
    // Non-interactive mode for launchd
    if (!(await checkThingsCliNonInteractive())) process.exit(1);
  } else {
    if (!(await checkThingsCli())) process.exit(1);
  }

  // Resolve token and port
  const token = args.token ?? process.env['THINGS_PROVIDER_TOKEN'] ?? (await loadOrCreateToken());
  const port = args.port ?? parseInt(process.env['THINGS_PROVIDER_PORT'] ?? '2714', 10);

  // Resolve Things auth token: CLI arg > env var > saved file > prompt
  const thingsAuthToken = args.thingsAuthToken
    ?? process.env['THINGS_AUTH_TOKEN']
    ?? (args.service ? null : await loadOrPromptThingsAuthToken());

  if (thingsAuthToken) {
    process.env['THINGS_AUTH_TOKEN'] = thingsAuthToken;
  } else {
    log('\x1b[33m⚠ No Things auth token — write operations will fail.\x1b[0m');
    log('  Run again with --things-auth-token or set THINGS_AUTH_TOKEN in .env');
  }

  // Save port to env file so the service picks it up
  await savePortToEnvFile(port);

  // Set env vars so the existing config/server code picks them up
  process.env['THINGS_PROVIDER_TOKEN'] = token;
  process.env['THINGS_PROVIDER_PORT'] = String(port);

  if (args.foreground || args.service) {
    // Rotate logs on service startup (before launchd opens new file handles)
    if (args.service) {
      await rotateLogs();
    }
    await startForegroundServer(port, token);
    return;
  }

  // Default: install and manage LaunchAgent
  await handleInstallAndStart(port, token);
}

if (import.meta.main) {
  main().catch((err) => {
    error(err.message);
    process.exit(1);
  });
}
