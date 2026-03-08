import { test, expect } from "bun:test";
import { commands } from "../index";
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
