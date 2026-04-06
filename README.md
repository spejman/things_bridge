# Things 3 Bridge

A REST API that wraps the [Things 3](https://culturedcode.com/things/) macOS task manager via the `things` CLI, providing a web UI and full CRUD operations with undo support.

## Quick Start

```bash
bunx things3-bridge
```

The CLI checks for dependencies (offering to install `things-cli` via Homebrew if missing), generates an API token on first run, and installs a LaunchAgent that starts on login and runs continuously at `http://localhost:2714`.

```bash
bunx things3-bridge --port 8080        # custom port
bunx things3-bridge --token my-secret  # custom token
bunx things3-bridge --foreground       # run directly (no service)
bunx things3-bridge --status           # check service status
bunx things3-bridge --logs             # tail service logs
bunx things3-bridge --uninstall        # remove the service
```

### Prerequisites

- macOS with [Things 3](https://culturedcode.com/things/) installed
- [Bun](https://bun.sh): `curl -fsSL https://bun.sh/install | bash`
- [things-cli](https://github.com/thingsapi/things-cli) (auto-installed if missing)

### Development

```bash
bun install
bun dev    # hot reload
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `THINGS_PROVIDER_TOKEN` | (required) | Bearer token for API auth |
| `THINGS_PROVIDER_PORT` | `2714` | Server port |
| `THINGS_PROVIDER_DB_PATH` | `~/.things-provider/change-log.db` | SQLite path for change log |

## API

All `/api/*` endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks (filter by `status`, `projectId`, `areaId`, `tag`) |
| GET | `/api/tasks/:id` | Get a single task |
| POST | `/api/tasks` | Create a task |
| PATCH | `/api/tasks/:id` | Update a task |
| POST | `/api/tasks/:id/complete` | Mark task completed |
| POST | `/api/tasks/:id/cancel` | Cancel a task |
| DELETE | `/api/tasks/:id` | Trash a task |
| GET | `/api/areas` | List areas |
| GET | `/api/projects` | List projects (filter by `areaId`) |
| GET | `/api/tags` | List tags |
| GET | `/api/log` | Paginated change history |
| POST | `/api/undo/:entryId` | Undo a logged change |

See [SKILL.md](SKILL.md) for full API documentation with examples.

## Tests

```bash
bun test
```

## License

MIT License — see [LICENSE](LICENSE) for details.
