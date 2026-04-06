# Things Provider

A REST API that wraps the [Things 3](https://culturedcode.com/things/) macOS task manager via the `things` CLI, providing a web UI and full CRUD operations with undo support.

## Prerequisites

- macOS with [Things 3](https://culturedcode.com/things/) installed
- [things-cli](https://github.com/thingsapi/things-cli): `brew install things-cli`
- [Bun](https://bun.sh): `curl -fsSL https://bun.sh/install | bash`

## Setup

```bash
bun install
cp .env.example .env
# Edit .env with your token
```

## Usage

```bash
# Development (hot reload)
bun dev

# Production
bun start
```

The server starts at `http://localhost:3000` (configurable via `THINGS_PROVIDER_PORT`).

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `THINGS_PROVIDER_TOKEN` | (required) | Bearer token for API auth |
| `THINGS_PROVIDER_PORT` | `3000` | Server port |
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
