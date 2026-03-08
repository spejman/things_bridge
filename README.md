# Things 3 ↔ Linux Bridge

A reliable bridge system that enables Linux systems to interact with Things 3 (macOS-only task manager) through a REST API and agent architecture.

## Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Linux     │         │   Linux Server   │         │   macOS     │
│   Clients   │◄───────►│   API + SQLite   │◄───────►│   Agent     │
│   (curl,    │  HTTP   │   (Operations    │  HTTP   │ (things CLI)│
│    apps)    │         │    Queue)        │         │             │
└─────────────┘         └──────────────────┘         └──────┬──────┘
                                                             │
                                                             ▼
                                                      ┌─────────────┐
                                                      │  Things 3   │
                                                      │  (macOS)    │
                                                      └─────────────┘
```

### Components

- **Linux API Service**: REST API backed by SQLite, exposes endpoints for clients and the macOS agent
- **macOS Agent**: Daemon that polls the API, executes `things` CLI commands, syncs task snapshots
- **Shared Package**: TypeScript types and Zod schemas used by both services

## Features

- ✅ **Asynchronous Operations**: Create, update, and cancel tasks via REST API
- ✅ **Idempotent**: Duplicate operations prevented via idempotency keys
- ✅ **Reliable**: Automatic retries with exponential backoff
- ✅ **Snapshot Sync**: Full task synchronization from Things 3 to API
- ✅ **Dead Letter Queue**: Failed operations tracked for manual intervention
- ✅ **Type Safe**: Full TypeScript implementation with Zod validation
- ✅ **Full Backup**: Export all Things 3 data (areas, projects, tags, tasks) to JSON

## Quick Start

### Prerequisites

- Linux server with Bun installed
- macOS machine with Things 3 and Bun installed
- Network connectivity between Linux and macOS

### 1. Setup Linux API Server

See [docs/setup-linux.md](docs/setup-linux.md) for detailed instructions.

```bash
# Clone repo
cd /opt
sudo git clone <repo-url>
cd things_bridge
sudo bun install

# Configure
sudo mkdir -p /etc/things-bridge /var/lib/things-bridge
sudo nano /etc/things-bridge/api.env

# Install service
sudo cp packages/linux-api/systemd/things-bridge-api.service /etc/systemd/system/
sudo systemctl enable --now things-bridge-api
```

### 2. Setup macOS Agent

See [docs/setup-macos.md](docs/setup-macos.md) for detailed instructions.

```bash
# Install dependencies
brew install things-cli
curl -fsSL https://bun.sh/install | bash

# Clone repo
cd ~
git clone <repo-url>
cd things_bridge
bun install

# Configure
cd packages/mac-agent
cp .env.example .env
nano .env

# Install service
cp launchd/com.things-bridge.agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.things-bridge.agent.plist
```

### 3. Test with Demo Script

```bash
# From the repository root
CLIENT_TOKEN=your-client-token ./scripts/demo.sh
```

## Usage Examples

### Create a Task

```bash
curl http://your-server:3000/ops \
  -X POST \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "create_task",
    "payload": {
      "title": "Review PR #123",
      "notes": "Check the authentication changes",
      "tags": ["work", "urgent"],
      "when": "today",
      "deadline": "2024-12-31T23:59:59Z"
    },
    "idempotencyKey": "pr-123-review"
  }'
```

### Get Tasks

```bash
curl http://your-server:3000/tasks?status=today \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN"
```

### Check Operation Status

```bash
curl http://your-server:3000/ops/OPERATION_ID \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN"
```

### Backup Things 3

```bash
# Full backup to default location (~/.things-bridge/backups/)
bun run backup

# Custom backup directory
BACKUP_DIR=/custom/path bun run backup
```

## API Reference

See [docs/api-reference.md](docs/api-reference.md) for complete API documentation.

## Development

This is a Bun workspace monorepo with three packages:

```
things_bridge/
├── packages/
│   ├── shared/          # Zod schemas, types, constants
│   ├── linux-api/       # HTTP server + SQLite
│   └── mac-agent/       # Daemon + things CLI integration
├── docs/                # Setup guides and API docs
└── scripts/             # Demo and utility scripts
```

### Run Tests

```bash
# All tests
bun test

# Specific package
bun test packages/linux-api/tests/
bun test packages/shared/tests/
```

### Development Mode

```bash
# Linux API (with hot reload)
bun dev:api

# macOS Agent (with hot reload)
bun dev:agent
```

## How It Works

### Task Creation Flow

1. Client sends `POST /ops` with `create_task` operation
2. API stores operation in SQLite with `pending` status
3. macOS agent polls `POST /agent/claim` and gets operation
4. Agent executes `things add` command with BridgeID marker
5. Agent searches snapshot for task with BridgeID
6. Agent reports result back via `POST /agent/op-result`
7. API marks operation as `completed` with Things UUID
8. Agent syncs full snapshot to API

### Idempotency

Tasks are created with a unique BridgeID marker in notes:
```
BridgeID:550e8400-e29b-41d4-a716-446655440000
```

If the agent crashes after creating the task but before reporting success, it can find the task by searching the snapshot for the BridgeID on retry.

### Retry Logic

Failed operations retry with exponential backoff:
- Attempt 1: immediate
- Attempt 2: +2s
- Attempt 3: +4s
- Attempt 4: +8s
- Attempt 5: +16s (final attempt)

After 5 failures, operations move to `deadletter` status for manual review.

## Security

- **Authentication**: Bearer tokens for all endpoints
- **Separate Tokens**: Different tokens for clients vs agent
- **No Direct DB Access**: Only CLI tool interaction
- **Firewall**: Restrict API access to known IPs
- **HTTPS**: Use reverse proxy with SSL in production

## Troubleshooting

### Linux API Issues

```bash
# Check service status
sudo systemctl status things-bridge-api

# View logs
sudo journalctl -u things-bridge-api -f

# Check database
sqlite3 /var/lib/things-bridge/things-bridge.db "SELECT * FROM operations LIMIT 5;"
```

### macOS Agent Issues

```bash
# Check service status
launchctl list | grep things-bridge

# View logs
tail -f /tmp/things-bridge-agent.log
tail -f /tmp/things-bridge-agent.err

# Test Things CLI
things show --json | head
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass: `bun test`
5. Submit a pull request

## License

MIT License — see [LICENSE](LICENSE) for details.
