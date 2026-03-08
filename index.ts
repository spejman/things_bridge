export const commands = [
  { label: "Start API server (dev)", cmd: ["bun", "--hot", "packages/linux-api/src/index.ts"] },
  { label: "Start API server", cmd: ["bun", "packages/linux-api/src/index.ts"] },
  { label: "Start mac agent (dev)", cmd: ["bun", "--hot", "packages/mac-agent/src/index.ts"] },
  { label: "Start mac agent", cmd: ["bun", "packages/mac-agent/src/index.ts"] },
  { label: "Backup Things 3", cmd: ["bun", "packages/mac-agent/src/backup.ts"] },
  { label: "Run tests", cmd: ["bun", "test"] },
];

function printMenu() {
  process.stdout.write("\nThings Bridge\n\n");
  for (let i = 0; i < commands.length; i++) {
    process.stdout.write(`  ${i + 1}) ${commands[i].label}\n`);
  }
  process.stdout.write("  0) Exit\n\n");
  process.stdout.write("Pick a command: ");
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

async function runCommand(cmd: string[]) {
  const proc = Bun.spawn(cmd, {
    stdio: ["inherit", "inherit", "inherit"],
  });
  await proc.exited;
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

    if (choice < 1 || choice > commands.length) {
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
