import { test, expect } from "bun:test";
import {
  commands,
  generateToken,
  buildLinuxEnv,
  buildMacEnv,
  endpoints,
  parseEnvFile,
  resolveEndpointPath,
  buildQueryString,
  buildFetchOptions,
  formatResponse,
} from "../index";
import type { ExplorerConfig } from "../index";
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

// --- API Explorer tests ---

test("parseEnvFile parses key=value pairs", () => {
  const content = "PORT=3000\nDB_PATH=/data/db\nAGENT_TOKEN=abc123\n";
  const result = parseEnvFile(content);
  expect(result).toEqual({
    PORT: "3000",
    DB_PATH: "/data/db",
    AGENT_TOKEN: "abc123",
  });
});

test("parseEnvFile skips comments and blank lines", () => {
  const content = "# This is a comment\n\nPORT=3000\n  # Another comment\nDB_PATH=/data\n";
  const result = parseEnvFile(content);
  expect(result).toEqual({ PORT: "3000", DB_PATH: "/data" });
});

test("parseEnvFile handles values with equals signs", () => {
  const content = "API_URL=http://localhost:3000?foo=bar\n";
  const result = parseEnvFile(content);
  expect(result).toEqual({ API_URL: "http://localhost:3000?foo=bar" });
});

test("parseEnvFile returns empty object for empty input", () => {
  expect(parseEnvFile("")).toEqual({});
  expect(parseEnvFile("\n\n")).toEqual({});
});

test("endpoints array has 7 entries with correct structure", () => {
  expect(endpoints).toHaveLength(7);
  for (const ep of endpoints) {
    expect(typeof ep.label).toBe("string");
    expect(["GET", "POST"]).toContain(ep.method);
    expect(ep.path.startsWith("/")).toBe(true);
    expect(["client", "agent"]).toContain(ep.auth);
  }
});

test("endpoints: client endpoints come first, agent endpoints last", () => {
  const clientEndpoints = endpoints.filter((e) => e.auth === "client");
  const agentEndpoints = endpoints.filter((e) => e.auth === "agent");
  expect(clientEndpoints).toHaveLength(3);
  expect(agentEndpoints).toHaveLength(4);
  // Client endpoints are indices 0-2, agent endpoints are 3-6
  expect(endpoints[0].auth).toBe("client");
  expect(endpoints[2].auth).toBe("client");
  expect(endpoints[3].auth).toBe("agent");
  expect(endpoints[6].auth).toBe("agent");
});

test("resolveEndpointPath replaces :param segments", () => {
  expect(resolveEndpointPath("/ops/:opId", { opId: "abc-123" })).toBe("/ops/abc-123");
});

test("resolveEndpointPath encodes special characters", () => {
  expect(resolveEndpointPath("/ops/:opId", { opId: "a b/c" })).toBe("/ops/a%20b%2Fc");
});

test("resolveEndpointPath returns path unchanged with no replacements", () => {
  expect(resolveEndpointPath("/tasks", {})).toBe("/tasks");
});

test("buildQueryString builds ?key=val from non-empty params", () => {
  expect(buildQueryString({ status: "inbox", projectId: "p1" })).toBe("?status=inbox&projectId=p1");
});

test("buildQueryString skips empty values", () => {
  expect(buildQueryString({ status: "today", projectId: "" })).toBe("?status=today");
});

test("buildQueryString returns empty string when all values empty", () => {
  expect(buildQueryString({ status: "", projectId: "" })).toBe("");
  expect(buildQueryString({})).toBe("");
});

test("buildQueryString encodes special characters", () => {
  expect(buildQueryString({ q: "hello world" })).toBe("?q=hello%20world");
});

const testConfig: ExplorerConfig = {
  apiUrl: "http://localhost:3000",
  agentToken: "agent-tok",
  clientToken: "client-tok",
  agentId: "test-agent",
};

test("buildFetchOptions builds GET request with query params", () => {
  const { url, init } = buildFetchOptions(endpoints[0], testConfig, {
    queryParams: { status: "inbox" },
  });
  expect(url).toBe("http://localhost:3000/tasks?status=inbox");
  expect(init.method).toBe("GET");
  expect((init.headers as Record<string, string>).Authorization).toBe("Bearer client-tok");
  expect(init.body).toBeUndefined();
});

test("buildFetchOptions builds GET request with path params", () => {
  const { url, init } = buildFetchOptions(endpoints[2], testConfig, {
    pathParams: { opId: "uuid-123" },
  });
  expect(url).toBe("http://localhost:3000/ops/uuid-123");
  expect(init.method).toBe("GET");
});

test("buildFetchOptions builds POST request with body", () => {
  const body = { type: "create_task", attributes: { title: "Test" } };
  const { url, init } = buildFetchOptions(endpoints[1], testConfig, { body });
  expect(url).toBe("http://localhost:3000/ops");
  expect(init.method).toBe("POST");
  expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  expect(init.body).toBe(JSON.stringify(body));
});

test("buildFetchOptions uses agent token for agent endpoints", () => {
  const { init } = buildFetchOptions(endpoints[3], testConfig, { body: {} });
  expect((init.headers as Record<string, string>).Authorization).toBe("Bearer agent-tok");
});

test("buildFetchOptions uses client token for client endpoints", () => {
  const { init } = buildFetchOptions(endpoints[0], testConfig, {});
  expect((init.headers as Record<string, string>).Authorization).toBe("Bearer client-tok");
});

test("formatResponse pretty-prints JSON body", () => {
  const result = formatResponse(200, { ok: true });
  expect(result).toBe('HTTP 200\n{\n  "ok": true\n}');
});

test("formatResponse handles string body", () => {
  const result = formatResponse(404, "Not Found");
  expect(result).toBe("HTTP 404\nNot Found");
});

test("formatResponse handles empty object", () => {
  const result = formatResponse(204, {});
  expect(result).toBe("HTTP 204\n{}");
});
