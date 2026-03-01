# macOS Agent Setup

This guide covers setting up the Things Bridge agent on macOS.

## Prerequisites

- macOS 10.15+
- Things 3 installed
- Bun runtime installed
- Linux API server running and accessible

## Installation Steps

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Install Things CLI

The agent uses the `things` CLI command to interact with Things 3.

```bash
# Install things-cli globally
brew install things-cli
```

**Verify installation:**

```bash
things --version
```

### 3. Grant Full Disk Access

The Things CLI requires Full Disk Access to read the Things database.

1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**
2. Click the **+** button
3. Add your terminal app (e.g., Terminal.app, iTerm.app)
4. If using Bun directly, also add `/usr/local/bin/bun`

**Test access:**

```bash
things show --json
```

If you see JSON output with your tasks, access is working.

### 4. Clone Repository

```bash
cd ~
git clone https://github.com/yourusername/things_bridge.git
cd things_bridge
bun install
```

### 5. Configure Environment

Create `.env` file in `packages/mac-agent/`:

```bash
cd packages/mac-agent
cp .env.example .env
nano .env
```

Update with your values:

```env
API_URL=http://your-linux-server:3000
AGENT_TOKEN=your-secure-agent-token-here
AGENT_ID=macbook-pro
POLL_INTERVAL_MS=2000
SNAPSHOT_INTERVAL_MS=60000
HEARTBEAT_INTERVAL_MS=30000
CLAIM_BATCH_SIZE=10
```

**IMPORTANT**: Use the same `AGENT_TOKEN` you configured on the Linux server.

### 6. Test Manual Run

Before setting up as a service, test the agent manually:

```bash
cd ~/things_bridge
bun packages/mac-agent/src/index.ts
```

You should see output like:

```
[Agent] Things Bridge macOS Agent
[Agent] API URL: http://your-linux-server:3000
[Agent] Agent ID: macbook-pro
[ClaimLoop] Started (poll interval: 2000ms)
[SnapshotLoop] Started (interval: 60000ms)
[SnapshotSync] Fetching tasks from Things...
```

Press Ctrl+C to stop. If it works, proceed to set up the service.

### 7. Install launchd Service

Edit the plist file to update paths:

```bash
nano packages/mac-agent/launchd/com.things-bridge.agent.plist
```

Update these fields:
- Replace `/Users/USERNAME/` with your actual home directory path
- Update `API_URL`, `AGENT_TOKEN`, and `AGENT_ID` in EnvironmentVariables

Install the service:

```bash
cp packages/mac-agent/launchd/com.things-bridge.agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.things-bridge.agent.plist
```

### 8. Verify Service

```bash
# Check if service is loaded
launchctl list | grep things-bridge

# View logs
tail -f /tmp/things-bridge-agent.log

# Check errors
tail -f /tmp/things-bridge-agent.err
```

## Updating

```bash
cd ~/things_bridge
git pull
bun install
launchctl unload ~/Library/LaunchAgents/com.things-bridge.agent.plist
launchctl load ~/Library/LaunchAgents/com.things-bridge.agent.plist
```

## Troubleshooting

### "things: command not found"

Install things-cli:
```bash
brew install things-cli
```

### Permission Denied / Database Access Error

Grant Full Disk Access to your terminal application (see step 3).

### Connection Refused

- Check that the Linux API server is running
- Verify `API_URL` is correct in .env
- Check firewall rules on Linux server
- Try: `curl http://your-linux-server:3000/agent/heartbeat -H "Authorization: Bearer YOUR_TOKEN" -X POST`

### Service not starting

Check logs:
```bash
tail -100 /tmp/things-bridge-agent.err
```

Unload and reload:
```bash
launchctl unload ~/Library/LaunchAgents/com.things-bridge.agent.plist
launchctl load ~/Library/LaunchAgents/com.things-bridge.agent.plist
```

### Tasks not syncing

1. Check agent logs for errors
2. Verify Things 3 is running
3. Check API server status
4. Test Things CLI manually: `things show --json`

## Uninstalling

```bash
launchctl unload ~/Library/LaunchAgents/com.things-bridge.agent.plist
rm ~/Library/LaunchAgents/com.things-bridge.agent.plist
cd ~
rm -rf things_bridge
```

## Notes

- The agent polls every 2 seconds by default (configurable via `POLL_INTERVAL_MS`)
- Full snapshots sync every 60 seconds (configurable via `SNAPSHOT_INTERVAL_MS`)
- The agent runs in the background and starts automatically on login
- All task data is synced to the Linux API server
