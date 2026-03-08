import { join } from "node:path";

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
  process.stdout.write(`  ${commands.length + 1}) Install\n`);
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
      await installFlow();
      continue;
    }

    if (choice < 1 || choice > commands.length + 1) {
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
