import { join } from "node:path";

// --- API Explorer types and constants ---

export interface ExplorerConfig {
  apiUrl: string;
  agentToken: string;
  clientToken: string;
  agentId: string;
}

export const endpoints = [
  { label: "GET  /tasks", method: "GET", path: "/tasks", auth: "client" },
  { label: "POST /ops", method: "POST", path: "/ops", auth: "client" },
  { label: "GET  /ops/:opId", method: "GET", path: "/ops/:opId", auth: "client" },
  { label: "POST /agent/claim", method: "POST", path: "/agent/claim", auth: "agent" },
  { label: "POST /agent/op-result", method: "POST", path: "/agent/op-result", auth: "agent" },
  { label: "POST /agent/snapshot", method: "POST", path: "/agent/snapshot", auth: "agent" },
  { label: "POST /agent/heartbeat", method: "POST", path: "/agent/heartbeat", auth: "agent" },
] as const;

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

export function resolveEndpointPath(path: string, replacements: Record<string, string>): string {
  let result = path;
  for (const [param, value] of Object.entries(replacements)) {
    result = result.replace(`:${param}`, encodeURIComponent(value));
  }
  return result;
}

export function buildQueryString(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== "");
  if (entries.length === 0) return "";
  const parts = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return "?" + parts.join("&");
}

export function buildFetchOptions(
  endpoint: (typeof endpoints)[number],
  config: ExplorerConfig,
  params: { pathParams?: Record<string, string>; queryParams?: Record<string, string>; body?: unknown },
): { url: string; init: RequestInit } {
  const path = params.pathParams
    ? resolveEndpointPath(endpoint.path, params.pathParams)
    : endpoint.path;
  const query = params.queryParams ? buildQueryString(params.queryParams) : "";
  const url = config.apiUrl + path + query;

  const token = endpoint.auth === "agent" ? config.agentToken : config.clientToken;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  const init: RequestInit = {
    method: endpoint.method,
    headers,
  };

  if (params.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(params.body);
  }

  return { url, init };
}

export function formatResponse(status: number, body: unknown): string {
  const statusLine = `HTTP ${status}`;
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  return `${statusLine}\n${bodyStr}`;
}

// --- CLI menu commands ---

export const commands = [
  { label: "Start API server", cmd: ["bun", "packages/linux-api/src/index.ts"] },
  { label: "Start mac agent", cmd: ["bun", "packages/mac-agent/src/index.ts"] },
  { label: "Backup Things 3", cmd: ["bun", "packages/mac-agent/src/backup.ts"] },
  { label: "Run tests", cmd: ["bun", "test"] },
];

export function generateToken(): string {
  return crypto.randomUUID();
}

export function buildLinuxEnv(opts: {
  agentToken: string;
  clientToken: string;
  port: string;
  dbPath: string;
}): string {
  const lines = [
    `PORT=${opts.port}`,
    `DB_PATH=${opts.dbPath}`,
    `AGENT_TOKEN=${opts.agentToken}`,
  ];
  if (opts.clientToken) {
    lines.push(`CLIENT_TOKEN=${opts.clientToken}`);
  }
  return lines.join("\n") + "\n";
}

export function buildMacEnv(opts: {
  apiUrl: string;
  agentToken: string;
  agentId: string;
}): string {
  return [
    `API_URL=${opts.apiUrl}`,
    `AGENT_TOKEN=${opts.agentToken}`,
    `AGENT_ID=${opts.agentId}`,
  ].join("\n") + "\n";
}

function printMenu() {
  process.stdout.write("\nThings Bridge\n\n");
  for (let i = 0; i < commands.length; i++) {
    process.stdout.write(`  ${i + 1}) ${commands[i].label}\n`);
  }
  process.stdout.write(`  ${commands.length + 1}) Explore API\n`);
  process.stdout.write(`  ${commands.length + 2}) Install\n`);
  process.stdout.write("  0) Exit\n\n");
  process.stdout.write("Pick a command: ");
}

function printInstallMenu() {
  process.stdout.write("\nInstall — pick your machine:\n\n");
  process.stdout.write("  1) Linux (API server)\n");
  process.stdout.write("  2) Mac (agent)\n");
  process.stdout.write("  0) Back\n\n");
  process.stdout.write("Pick an option: ");
}

async function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const onData = (data: Buffer) => {
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      resolve(data.toString().trim());
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function prompt(message: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  process.stdout.write(`${message}${suffix}: `);
  const input = await readLine();
  return input || defaultValue || "";
}

async function runCommand(cmd: string[]) {
  const proc = Bun.spawn(cmd, {
    stdio: ["inherit", "inherit", "inherit"],
  });
  await proc.exited;
}

async function installLinux() {
  const rootDir = join(import.meta.dir);
  const envPath = join(rootDir, "packages/linux-api/.env");

  process.stdout.write("\n--- Linux (API server) setup ---\n\n");

  // AGENT_TOKEN
  const existingToken = await prompt("Paste an existing AGENT_TOKEN, or press Enter to generate one");
  const agentToken = existingToken || generateToken();
  process.stdout.write(`\nAGENT_TOKEN: ${agentToken}\n\n`);

  // CLIENT_TOKEN
  const wantClient = await prompt("Generate a CLIENT_TOKEN for API clients? (y/n)", "n");
  const clientToken = wantClient.toLowerCase() === "y" ? generateToken() : "";
  if (clientToken) {
    process.stdout.write(`CLIENT_TOKEN: ${clientToken}\n\n`);
  }

  // PORT
  const port = await prompt("Port", "3000");

  // DB_PATH
  const dbPath = await prompt("Database path", "./things-bridge.db");

  // Check existing .env
  const envFile = Bun.file(envPath);
  if (await envFile.exists()) {
    const overwrite = await prompt(`\n${envPath} already exists. Overwrite? (y/n)`, "n");
    if (overwrite.toLowerCase() !== "y") {
      process.stdout.write("Aborted.\n");
      return;
    }
  }

  // Write .env
  const envContent = buildLinuxEnv({ agentToken, clientToken, port, dbPath });
  await Bun.write(envPath, envContent);
  process.stdout.write(`\nWritten: ${envPath}\n`);

  // Display tokens for copying
  process.stdout.write("\n========================================\n");
  process.stdout.write("  Copy this token to your Mac setup:\n\n");
  process.stdout.write(`  AGENT_TOKEN=${agentToken}\n`);
  process.stdout.write("========================================\n\n");
}

async function installMac() {
  const rootDir = join(import.meta.dir);
  const envPath = join(rootDir, "packages/mac-agent/.env");

  process.stdout.write("\n--- Mac (agent) setup ---\n\n");

  // API_URL
  const apiUrl = await prompt("API server URL (e.g. http://192.168.1.10:3000)");
  if (!apiUrl) {
    process.stdout.write("API URL is required.\n");
    return;
  }

  // AGENT_TOKEN
  const agentToken = await prompt("Paste your AGENT_TOKEN from the Linux setup");
  if (!agentToken) {
    process.stdout.write("AGENT_TOKEN is required.\n");
    return;
  }

  // AGENT_ID
  const agentId = await prompt("Agent ID", "default-agent");

  // Check existing .env
  const envFile = Bun.file(envPath);
  if (await envFile.exists()) {
    const overwrite = await prompt(`\n${envPath} already exists. Overwrite? (y/n)`, "n");
    if (overwrite.toLowerCase() !== "y") {
      process.stdout.write("Aborted.\n");
      return;
    }
  }

  // Write .env
  const envContent = buildMacEnv({ apiUrl, agentToken, agentId });
  await Bun.write(envPath, envContent);
  process.stdout.write(`\nWritten: ${envPath}\n`);

  // Test connection
  process.stdout.write("\nTesting connection...\n");
  try {
    const res = await fetch(`${apiUrl}/agent/heartbeat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    if (res.ok) {
      process.stdout.write("Connection successful!\n\n");
    } else {
      process.stdout.write(`Server responded with ${res.status}.\n`);
      process.stdout.write("Check that the API server is running and the token matches.\n\n");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(`Connection failed: ${message}\n`);
    process.stdout.write("Check that the API server is running and reachable.\n\n");
  }
}

// --- API Explorer flow ---

async function loadExplorerConfig(): Promise<ExplorerConfig> {
  const rootDir = join(import.meta.dir);
  const macEnvPath = join(rootDir, "packages/mac-agent/.env");
  const linuxEnvPath = join(rootDir, "packages/linux-api/.env");

  let macEnv: Record<string, string> = {};
  let linuxEnv: Record<string, string> = {};

  const macFile = Bun.file(macEnvPath);
  if (await macFile.exists()) {
    macEnv = parseEnvFile(await macFile.text());
  }
  const linuxFile = Bun.file(linuxEnvPath);
  if (await linuxFile.exists()) {
    linuxEnv = parseEnvFile(await linuxFile.text());
  }

  const hasEnvFiles = Object.keys(macEnv).length > 0 || Object.keys(linuxEnv).length > 0;

  // Resolve defaults from .env files
  const defaultApiUrl = macEnv.API_URL
    || (linuxEnv.PORT ? `http://localhost:${linuxEnv.PORT}` : "http://localhost:3000");
  const defaultAgentToken = macEnv.AGENT_TOKEN || linuxEnv.AGENT_TOKEN || "";
  const defaultClientToken = linuxEnv.CLIENT_TOKEN || "";
  const defaultAgentId = macEnv.AGENT_ID || "default-agent";

  if (hasEnvFiles) {
    process.stdout.write("\nLoaded from .env files:\n");
    process.stdout.write(`  API URL:      ${defaultApiUrl}\n`);
    process.stdout.write(`  Agent token:  ${defaultAgentToken ? defaultAgentToken.slice(0, 8) + "..." : "(not set)"}\n`);
    process.stdout.write(`  Client token: ${defaultClientToken ? defaultClientToken.slice(0, 8) + "..." : "(not set)"}\n`);
    process.stdout.write(`  Agent ID:     ${defaultAgentId}\n\n`);

    const action = await prompt("Enter to use these, or 'edit' to modify", "");
    if (action.toLowerCase() !== "edit") {
      return {
        apiUrl: defaultApiUrl,
        agentToken: defaultAgentToken,
        clientToken: defaultClientToken,
        agentId: defaultAgentId,
      };
    }
  } else {
    process.stdout.write("\nNo .env files found. Please enter connection details:\n\n");
  }

  const apiUrl = await prompt("API URL", defaultApiUrl);
  const agentToken = await prompt("Agent token", defaultAgentToken);
  const clientToken = await prompt("Client token", defaultClientToken);
  const agentId = await prompt("Agent ID", defaultAgentId);

  return { apiUrl, agentToken, clientToken, agentId };
}

function printExplorerMenu(config: ExplorerConfig) {
  const agentStatus = config.agentToken ? "✓" : "✗";
  const clientStatus = config.clientToken ? "✓" : "✗";

  process.stdout.write("\nAPI Explorer\n\n");
  process.stdout.write(`  Connection: ${config.apiUrl}\n`);
  process.stdout.write(`  Tokens: agent ${agentStatus}  client ${clientStatus}\n\n`);
  process.stdout.write("  --- Client ---\n");
  process.stdout.write("  1) GET  /tasks\n");
  process.stdout.write("  2) POST /ops\n");
  process.stdout.write("  3) GET  /ops/:opId\n\n");
  process.stdout.write("  --- Agent ---\n");
  process.stdout.write("  4) POST /agent/claim\n");
  process.stdout.write("  5) POST /agent/op-result\n");
  process.stdout.write("  6) POST /agent/snapshot\n");
  process.stdout.write("  7) POST /agent/heartbeat\n\n");
  process.stdout.write("  0) Back\n\n");
  process.stdout.write("Pick an endpoint: ");
}

async function promptGetTasks(config: ExplorerConfig) {
  const status = await prompt("status? (inbox/today/upcoming/someday/completed/canceled/trash)", "");
  const projectId = await prompt("projectId?", "");
  const { url, init } = buildFetchOptions(endpoints[0], config, {
    queryParams: { status, projectId },
  });
  return { url, init };
}

async function promptPostOps(config: ExplorerConfig) {
  const type = await prompt("type (create_task/update_task/cancel_task)");
  let params: Record<string, unknown> = { type };

  if (type === "create_task") {
    const title = await prompt("title (required)");
    const notes = await prompt("notes?", "");
    const when = await prompt("when?", "");
    params = { type, attributes: { title, ...(notes && { notes }), ...(when && { when }) } };
  } else if (type === "update_task") {
    const thingsId = await prompt("thingsId (required)");
    const title = await prompt("title?", "");
    const completed = await prompt("completed? (true/false)", "");
    params = {
      type,
      thingsId,
      attributes: {
        ...(title && { title }),
        ...(completed && { completed: completed === "true" }),
      },
    };
  } else if (type === "cancel_task") {
    const thingsId = await prompt("thingsId (required)");
    params = { type, thingsId };
  }

  const { url, init } = buildFetchOptions(endpoints[1], config, { body: params });
  return { url, init };
}

async function promptGetOp(config: ExplorerConfig) {
  const opId = await prompt("opId (UUID)");
  const { url, init } = buildFetchOptions(endpoints[2], config, {
    pathParams: { opId },
  });
  return { url, init };
}

async function promptAgentClaim(config: ExplorerConfig) {
  const agentId = await prompt("agentId", config.agentId);
  const batchSize = await prompt("batchSize", "10");
  const { url, init } = buildFetchOptions(endpoints[3], config, {
    body: { agentId, batchSize: parseInt(batchSize, 10) },
  });
  return { url, init };
}

async function promptAgentOpResult(config: ExplorerConfig) {
  const opId = await prompt("opId (UUID)");
  const success = await prompt("success? (y/n)", "y");
  const isSuccess = success.toLowerCase() === "y";

  let body: Record<string, unknown>;
  if (isSuccess) {
    const resultJson = await prompt("result JSON", "{}");
    try {
      body = { opId, success: true, result: JSON.parse(resultJson) };
    } catch {
      process.stdout.write("Invalid JSON, sending as string.\n");
      body = { opId, success: true, result: resultJson };
    }
  } else {
    const error = await prompt("error message");
    body = { opId, success: false, error };
  }

  const { url, init } = buildFetchOptions(endpoints[4], config, { body });
  return { url, init };
}

async function promptAgentSnapshot(config: ExplorerConfig) {
  process.stdout.write("Paste raw JSON body (task array), then press Enter:\n");
  const raw = await readLine();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    process.stdout.write("Invalid JSON.\n");
    return null;
  }
  const { url, init } = buildFetchOptions(endpoints[5], config, { body });
  return { url, init };
}

async function promptAgentHeartbeat(config: ExplorerConfig) {
  const { url, init } = buildFetchOptions(endpoints[6], config, { body: {} });
  return { url, init };
}

async function executeRequest(url: string, init: RequestInit) {
  process.stdout.write(`\n→ ${init.method} ${url}\n`);
  try {
    const res = await fetch(url, init);
    let body: unknown;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    process.stdout.write("\n" + formatResponse(res.status, body) + "\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(`\nRequest failed: ${message}\n`);
  }
}

const endpointPrompts = [
  promptGetTasks,
  promptPostOps,
  promptGetOp,
  promptAgentClaim,
  promptAgentOpResult,
  promptAgentSnapshot,
  promptAgentHeartbeat,
];

async function exploreApiFlow() {
  const config = await loadExplorerConfig();

  while (true) {
    printExplorerMenu(config);
    const input = await readLine();
    const choice = parseInt(input, 10);

    if (choice === 0 || isNaN(choice)) return;
    if (choice < 1 || choice > 7) {
      process.stdout.write(`Invalid choice: ${input}\n`);
      continue;
    }

    const result = await endpointPrompts[choice - 1](config);
    if (result) {
      await executeRequest(result.url, result.init);
    }
  }
}

async function installFlow() {
  while (true) {
    printInstallMenu();
    const input = await readLine();
    const choice = parseInt(input, 10);

    if (choice === 0 || isNaN(choice)) return;

    if (choice === 1) {
      await installLinux();
      return;
    } else if (choice === 2) {
      await installMac();
      return;
    } else {
      process.stdout.write(`Invalid choice: ${input}\n`);
    }
  }
}

async function main() {
  while (true) {
    printMenu();
    const input = await readLine();
    const choice = parseInt(input, 10);

    if (choice === 0 || isNaN(choice)) {
      process.stdout.write("Bye!\n");
      process.exit(0);
    }

    if (choice === commands.length + 1) {
      await exploreApiFlow();
      continue;
    }

    if (choice === commands.length + 2) {
      await installFlow();
      continue;
    }

    if (choice < 1 || choice > commands.length + 2) {
      process.stdout.write(`Invalid choice: ${input}\n`);
      continue;
    }

    const selected = commands[choice - 1];
    process.stdout.write(`\nRunning: ${selected.label}\n\n`);
    await runCommand(selected.cmd);
  }
}

// Only run the interactive menu when executed directly
if (import.meta.main) {
  main();
}
