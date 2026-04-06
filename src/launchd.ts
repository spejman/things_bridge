import { existsSync } from 'node:fs';
import { mkdir, writeFile, unlink, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_LOG_FILES = 3;

const PLIST_LABEL = 'com.things3-bridge';
const HOME = process.env['HOME'] ?? '.';
const PLIST_DIR = join(HOME, 'Library', 'LaunchAgents');
const PLIST_PATH = join(PLIST_DIR, `${PLIST_LABEL}.plist`);
const CONFIG_DIR = join(HOME, '.things-provider');
const STDOUT_LOG = join(CONFIG_DIR, 'stdout.log');
const STDERR_LOG = join(CONFIG_DIR, 'stderr.log');

export interface ServiceStatus {
  installed: boolean;
  running: boolean;
  pid: number | null;
  plistPath: string;
  port: number | null;
  logPaths: { stdout: string; stderr: string };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generatePlist(options: {
  bunPath: string;
  homePath: string;
  pathEnv: string;
}): string {
  const { bunPath, homePath, pathEnv } = options;
  const stdoutLog = join(homePath, '.things-provider', 'stdout.log');
  const stderrLog = join(homePath, '.things-provider', 'stderr.log');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(PLIST_LABEL)}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(bunPath)}</string>
    <string>x</string>
    <string>things3-bridge</string>
    <string>--service</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${escapeXml(homePath)}</string>
    <key>PATH</key>
    <string>${escapeXml(pathEnv)}</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutLog)}</string>

  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrLog)}</string>

  <key>WorkingDirectory</key>
  <string>${escapeXml(homePath)}</string>

  <key>ThrottleInterval</key>
  <integer>5</integer>
</dict>
</plist>
`;
}

export async function resolveBunPath(): Promise<string> {
  // Try `which bun` first
  try {
    const proc = Bun.spawn(['which', 'bun'], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    if (proc.exitCode === 0) {
      const path = (await new Response(proc.stdout).text()).trim();
      if (path) return path;
    }
  } catch {
    // fall through
  }

  // Fall back to process.execPath if it looks like bun
  if (process.execPath.includes('bun')) {
    return process.execPath;
  }

  throw new Error('Could not find bun. Ensure bun is installed and in your PATH.');
}

export async function installService(options: {
  bunPath: string;
}): Promise<void> {
  const homePath = HOME;
  const pathEnv = process.env['PATH'] ?? '/usr/local/bin:/usr/bin:/bin';

  const uid = process.getuid?.() ?? 501;
  const domain = `gui/${uid}`;

  await mkdir(CONFIG_DIR, { recursive: true });
  await mkdir(PLIST_DIR, { recursive: true });

  // Remove existing service if loaded
  if (await isServiceLoaded()) {
    const proc = Bun.spawn(['launchctl', 'bootout', domain, PLIST_PATH], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
  }

  const plist = generatePlist({
    bunPath: options.bunPath,
    homePath,
    pathEnv,
  });

  await writeFile(PLIST_PATH, plist);

  const proc = Bun.spawn(['launchctl', 'bootstrap', domain, PLIST_PATH], { stdout: 'pipe', stderr: 'pipe' });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to load LaunchAgent: ${stderr.trim()}`);
  }

  // Brief wait for launchd to start the process
  await Bun.sleep(500);
}

export async function uninstallService(): Promise<void> {
  const uid = process.getuid?.() ?? 501;
  const domain = `gui/${uid}`;

  if (await isServiceLoaded()) {
    const proc = Bun.spawn(['launchctl', 'bootout', domain, PLIST_PATH], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
  }

  if (existsSync(PLIST_PATH)) {
    await unlink(PLIST_PATH);
  }
}

async function isServiceLoaded(): Promise<boolean> {
  if (!existsSync(PLIST_PATH)) return false;
  try {
    const proc = Bun.spawn(['launchctl', 'list', PLIST_LABEL], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export async function getServiceStatus(): Promise<ServiceStatus> {
  const installed = existsSync(PLIST_PATH);
  let running = false;
  let pid: number | null = null;
  let port: number | null = null;

  if (installed) {
    try {
      const proc = Bun.spawn(['launchctl', 'list', PLIST_LABEL], { stdout: 'pipe', stderr: 'pipe' });
      await proc.exited;
      if (proc.exitCode === 0) {
        const output = await new Response(proc.stdout).text();
        // launchctl list <label> outputs lines like: "PID" = 1234;
        const pidMatch = output.match(/"PID"\s*=\s*(\d+)/);
        if (pidMatch) {
          pid = parseInt(pidMatch[1], 10);
          running = true;
        }
      }
    } catch {
      // status check failed, report as not running
    }

    // Parse port from env file
    try {
      const envFile = join(CONFIG_DIR, '.env');
      if (existsSync(envFile)) {
        const content = await readFile(envFile, 'utf-8');
        const portMatch = content.match(/^THINGS_PROVIDER_PORT=(\d+)$/m);
        if (portMatch) {
          port = parseInt(portMatch[1], 10);
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    installed,
    running,
    pid,
    plistPath: PLIST_PATH,
    port,
    logPaths: { stdout: STDOUT_LOG, stderr: STDERR_LOG },
  };
}

// --- Log rotation ---

export async function rotateFile(filePath: string, maxSize = MAX_LOG_SIZE, maxFiles = MAX_LOG_FILES): Promise<void> {
  if (!existsSync(filePath)) return;

  const info = await stat(filePath);
  if (info.size < maxSize) return;

  // Rotate: .3 → delete, .2 → .3, .1 → .2, current → .1
  for (let i = maxFiles; i >= 1; i--) {
    const from = i === 1 ? filePath : `${filePath}.${i - 1}`;
    const to = `${filePath}.${i}`;
    if (existsSync(from)) {
      if (i === maxFiles && existsSync(to)) {
        await unlink(to);
      }
      await rename(from, to);
    }
  }
}

export async function rotateLogs(): Promise<void> {
  for (const logPath of [STDOUT_LOG, STDERR_LOG]) {
    await rotateFile(logPath);
  }
}
