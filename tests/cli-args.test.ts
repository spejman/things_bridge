import { test, expect, describe } from 'bun:test';
import { parseArgs } from '../src/cli.ts';

describe('parseArgs', () => {
  test('returns empty object for no args', () => {
    const result = parseArgs([]);
    expect(result.port).toBeUndefined();
    expect(result.token).toBeUndefined();
    expect(result.foreground).toBeUndefined();
    expect(result.service).toBeUndefined();
    expect(result.status).toBeUndefined();
    expect(result.uninstall).toBeUndefined();
  });

  test('parses --port', () => {
    const result = parseArgs(['--port', '8080']);
    expect(result.port).toBe(8080);
  });

  test('parses --token', () => {
    const result = parseArgs(['--token', 'my-secret']);
    expect(result.token).toBe('my-secret');
  });

  test('parses --foreground', () => {
    const result = parseArgs(['--foreground']);
    expect(result.foreground).toBe(true);
  });

  test('parses --service', () => {
    const result = parseArgs(['--service']);
    expect(result.service).toBe(true);
  });

  test('parses --status', () => {
    const result = parseArgs(['--status']);
    expect(result.status).toBe(true);
  });

  test('parses --uninstall', () => {
    const result = parseArgs(['--uninstall']);
    expect(result.uninstall).toBe(true);
  });

  test('parses --logs', () => {
    const result = parseArgs(['--logs']);
    expect(result.logs).toBe(true);
  });

  test('parses combined flags', () => {
    const result = parseArgs(['--port', '9000', '--foreground', '--token', 'abc']);
    expect(result.port).toBe(9000);
    expect(result.foreground).toBe(true);
    expect(result.token).toBe('abc');
  });

  test('ignores unknown flags', () => {
    const result = parseArgs(['--unknown', '--port', '5000']);
    expect(result.port).toBe(5000);
  });
});
