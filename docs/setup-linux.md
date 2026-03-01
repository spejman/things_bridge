# Linux API Server Setup

This guide covers setting up the Things Bridge API service on a Linux server.

## Prerequisites

- Linux server (Ubuntu 20.04+ or similar)
- Bun runtime installed
- sudo access

## Installation Steps

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Clone Repository

```bash
cd /opt
sudo git clone https://github.com/yourusername/things_bridge.git
cd things_bridge
sudo bun install
```

### 3. Create System User

```bash
sudo useradd -r -s /bin/false things-bridge
```

### 4. Create Database Directory

```bash
sudo mkdir -p /var/lib/things-bridge
sudo chown things-bridge:things-bridge /var/lib/things-bridge
```

### 5. Configure Environment

Create `/etc/things-bridge/api.env`:

```bash
sudo mkdir -p /etc/things-bridge
sudo nano /etc/things-bridge/api.env
```

Add the following content:

```env
PORT=3000
DB_PATH=/var/lib/things-bridge/things-bridge.db
AGENT_TOKEN=your-secure-agent-token-here
CLIENT_TOKEN=your-optional-client-token-here
LOCK_TIMEOUT_MS=120000
MAX_ATTEMPTS=5
```

**IMPORTANT**: Generate secure random tokens:

```bash
# Generate agent token
openssl rand -hex 32

# Generate client token (optional)
openssl rand -hex 32
```

Set proper permissions:

```bash
sudo chmod 600 /etc/things-bridge/api.env
sudo chown things-bridge:things-bridge /etc/things-bridge/api.env
```

### 6. Install systemd Service

```bash
sudo cp packages/linux-api/systemd/things-bridge-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable things-bridge-api
sudo systemctl start things-bridge-api
```

### 7. Verify Service

```bash
# Check service status
sudo systemctl status things-bridge-api

# View logs
sudo journalctl -u things-bridge-api -f

# Test API endpoint
curl http://localhost:3000/tasks -H "Authorization: Bearer YOUR_CLIENT_TOKEN"
```

## Firewall Configuration

If using a firewall, allow the API port:

```bash
# UFW
sudo ufw allow 3000/tcp

# firewalld
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

## Updating

```bash
cd /opt/things_bridge
sudo git pull
sudo bun install
sudo systemctl restart things-bridge-api
```

## Troubleshooting

### Service won't start

Check logs:
```bash
sudo journalctl -u things-bridge-api -n 50
```

Common issues:
- Missing AGENT_TOKEN in env file
- Database directory doesn't exist or wrong permissions
- Port already in use

### Database locked

If you see database lock errors:
```bash
sudo systemctl stop things-bridge-api
# Wait a few seconds
sudo systemctl start things-bridge-api
```

## Security Recommendations

1. **Use HTTPS**: Deploy behind nginx or another reverse proxy with SSL
2. **Strong Tokens**: Generate long random tokens (32+ characters)
3. **Firewall**: Restrict API access to known IPs if possible
4. **Regular Updates**: Keep Bun and system packages updated
5. **Backups**: Regularly backup `/var/lib/things-bridge/things-bridge.db`
