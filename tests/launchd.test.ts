import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generatePlist, rotateFile } from '../src/launchd.ts';

const defaultOptions = {
  bunPath: '/opt/homebrew/bin/bun',
  homePath: '/Users/testuser',
  pathEnv: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
};

describe('generatePlist', () => {
  test('generates valid plist XML with correct label', () => {
    const plist = generatePlist(defaultOptions);
    expect(plist).toContain('<?xml version="1.0"');
    expect(plist).toContain('<!DOCTYPE plist');
    expect(plist).toContain('<string>com.things3-bridge</string>');
  });

  test('includes correct program arguments', () => {
    const plist = generatePlist(defaultOptions);
    expect(plist).toContain('<string>/opt/homebrew/bin/bun</string>');
    expect(plist).toContain('<string>x</string>');
    expect(plist).toContain('<string>things3-bridge</string>');
    expect(plist).toContain('<string>--service</string>');
  });

  test('uses the provided bun path', () => {
    const plist = generatePlist({ ...defaultOptions, bunPath: '/usr/local/bin/bun' });
    expect(plist).toContain('<string>/usr/local/bin/bun</string>');
    expect(plist).not.toContain('/opt/homebrew/bin/bun');
  });

  test('sets HOME environment variable', () => {
    const plist = generatePlist(defaultOptions);
    expect(plist).toContain('<key>HOME</key>');
    expect(plist).toContain('<string>/Users/testuser</string>');
  });

  test('sets PATH environment variable', () => {
    const plist = generatePlist(defaultOptions);
    expect(plist).toContain('<key>PATH</key>');
    expect(plist).toContain('<string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>');
  });

  test('sets log paths under ~/.things-provider/', () => {
    const plist = generatePlist(defaultOptions);
    expect(plist).toContain('<key>StandardOutPath</key>');
    expect(plist).toContain('/Users/testuser/.things-provider/stdout.log');
    expect(plist).toContain('<key>StandardErrorPath</key>');
    expect(plist).toContain('/Users/testuser/.things-provider/stderr.log');
  });

  test('includes RunAtLoad', () => {
    const plist = generatePlist(defaultOptions);
    expect(plist).toContain('<key>RunAtLoad</key>');
    expect(plist).toContain('<true/>');
  });

  test('includes KeepAlive with SuccessfulExit false', () => {
    const plist = generatePlist(defaultOptions);
    expect(plist).toContain('<key>KeepAlive</key>');
    expect(plist).toContain('<key>SuccessfulExit</key>');
    expect(plist).toContain('<false/>');
  });

  test('includes ThrottleInterval', () => {
    const plist = generatePlist(defaultOptions);
    expect(plist).toContain('<key>ThrottleInterval</key>');
    expect(plist).toContain('<integer>5</integer>');
  });

  test('sets WorkingDirectory to home', () => {
    const plist = generatePlist(defaultOptions);
    expect(plist).toContain('<key>WorkingDirectory</key>');
    // WorkingDirectory string follows the key
    const wdIdx = plist.indexOf('<key>WorkingDirectory</key>');
    const afterWd = plist.slice(wdIdx);
    expect(afterWd).toContain('<string>/Users/testuser</string>');
  });

  test('escapes XML special characters in values', () => {
    const plist = generatePlist({
      ...defaultOptions,
      bunPath: '/path/with <angle> & "quotes"',
      homePath: "/Users/o'brien",
    });
    expect(plist).toContain('&lt;angle&gt;');
    expect(plist).toContain('&amp;');
    expect(plist).toContain('&quot;quotes&quot;');
    expect(plist).toContain('&apos;brien');
  });
});

describe('rotateFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'launchd-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test('does nothing if file does not exist', async () => {
    await rotateFile(join(tmpDir, 'missing.log'), 100, 3);
    // no error thrown
  });

  test('does nothing if file is under max size', async () => {
    const logPath = join(tmpDir, 'small.log');
    await writeFile(logPath, 'small content');
    await rotateFile(logPath, 1024, 3);
    expect(existsSync(logPath)).toBe(true);
    expect(existsSync(`${logPath}.1`)).toBe(false);
  });

  test('rotates file when over max size', async () => {
    const logPath = join(tmpDir, 'big.log');
    await writeFile(logPath, 'x'.repeat(200));
    await rotateFile(logPath, 100, 3);
    expect(existsSync(logPath)).toBe(false);
    expect(existsSync(`${logPath}.1`)).toBe(true);
    expect(await readFile(`${logPath}.1`, 'utf-8')).toBe('x'.repeat(200));
  });

  test('cascades rotation of existing numbered files', async () => {
    const logPath = join(tmpDir, 'cascade.log');
    await writeFile(logPath, 'x'.repeat(200));
    await writeFile(`${logPath}.1`, 'old-1');
    await writeFile(`${logPath}.2`, 'old-2');
    await rotateFile(logPath, 100, 3);
    expect(existsSync(logPath)).toBe(false);
    expect(await readFile(`${logPath}.1`, 'utf-8')).toBe('x'.repeat(200));
    expect(await readFile(`${logPath}.2`, 'utf-8')).toBe('old-1');
    expect(await readFile(`${logPath}.3`, 'utf-8')).toBe('old-2');
  });

  test('drops oldest file when at max', async () => {
    const logPath = join(tmpDir, 'full.log');
    await writeFile(logPath, 'x'.repeat(200));
    await writeFile(`${logPath}.1`, 'old-1');
    await writeFile(`${logPath}.2`, 'old-2');
    await writeFile(`${logPath}.3`, 'should-be-deleted');
    await rotateFile(logPath, 100, 3);
    expect(await readFile(`${logPath}.3`, 'utf-8')).toBe('old-2');
    expect(existsSync(`${logPath}.4`)).toBe(false);
  });
});
