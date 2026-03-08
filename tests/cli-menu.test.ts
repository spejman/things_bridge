import { test, expect } from "bun:test";
import { commands, generateToken, buildLinuxEnv, buildMacEnv } from "../index";
import { existsSync } from "node:fs";
import { join } from "node:path";

const rootDir = join(import.meta.dir, "..");

test("commands array has correct structure", () => {
  expect(commands.length).toBeGreaterThan(0);
  for (const command of commands) {
    expect(typeof command.label).toBe("string");
    expect(command.label.length).toBeGreaterThan(0);
    expect(Array.isArray(command.cmd)).toBe(true);
    expect(command.cmd.length).toBeGreaterThanOrEqual(2);
    expect(command.cmd[0]).toBe("bun");
  }
});

test("commands do not include dev (hot-reload) variants", () => {
  for (const command of commands) {
    expect(command.cmd).not.toContain("--hot");
    expect(command.label).not.toContain("dev");
  }
});

test("commands include expected entries", () => {
  const labels = commands.map((c) => c.label);
  expect(labels).toContain("Start API server");
  expect(labels).toContain("Start mac agent");
  expect(labels).toContain("Backup Things 3");
  expect(labels).toContain("Run tests");
});

test("all referenced entry point files exist on disk", () => {
  for (const command of commands) {
    // Skip commands that don't reference a file (e.g. "bun test")
    const fileArg = command.cmd.find((arg) => arg.endsWith(".ts"));
    if (!fileArg) continue;

    const fullPath = join(rootDir, fileArg);
    expect(existsSync(fullPath)).toBe(true);
  }
});

test("each command has a unique label", () => {
  const labels = commands.map((c) => c.label);
  expect(new Set(labels).size).toBe(labels.length);
});

test("generateToken returns a valid UUID", () => {
  const token = generateToken();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  expect(token).toMatch(uuidRegex);
});

test("generateToken returns unique values", () => {
  const a = generateToken();
  const b = generateToken();
  expect(a).not.toBe(b);
});

test("buildLinuxEnv produces correct .env content", () => {
  const env = buildLinuxEnv({
    agentToken: "test-agent-token",
    clientToken: "test-client-token",
    port: "4000",
    dbPath: "/data/things.db",
  });
  expect(env).toContain("PORT=4000\n");
  expect(env).toContain("DB_PATH=/data/things.db\n");
  expect(env).toContain("AGENT_TOKEN=test-agent-token\n");
  expect(env).toContain("CLIENT_TOKEN=test-client-token\n");
});

test("buildLinuxEnv omits CLIENT_TOKEN when empty", () => {
  const env = buildLinuxEnv({
    agentToken: "test-agent-token",
    clientToken: "",
    port: "3000",
    dbPath: "./things-bridge.db",
  });
  expect(env).not.toContain("CLIENT_TOKEN");
});

test("buildMacEnv produces correct .env content", () => {
  const env = buildMacEnv({
    apiUrl: "http://192.168.1.10:3000",
    agentToken: "test-agent-token",
    agentId: "my-mac",
  });
  expect(env).toContain("API_URL=http://192.168.1.10:3000\n");
  expect(env).toContain("AGENT_TOKEN=test-agent-token\n");
  expect(env).toContain("AGENT_ID=my-mac\n");
});
