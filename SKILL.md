# Things Provider — Agent Skill

Use this skill to read and manage tasks in Things 3 via the things-provider REST API running on the Mac.

## Connection

```
Base URL: <base-url>        (e.g. http://localhost:3000)
Auth:     Authorization: Bearer <token>   (required on all /api/* endpoints except /api/config)
```

Replace `<base-url>` with the server address and `<token>` with your `THINGS_PROVIDER_TOKEN` value.

---

## Data Types

### Task

```json
{
  "id": "string (Things UUID)",
  "title": "string",
  "notes": "string | null",
  "status": "inbox | today | upcoming | someday | completed | canceled | trash",
  "projectId": "string | null",
  "projectTitle": "string | null",
  "areaId": "string | null",
  "areaTitle": "string | null",
  "tags": ["string"],
  "checklistItems": [{ "title": "string", "completed": true }],
  "deadline": "ISO date string | null",
  "whenDate": "ISO date string | null",
  "createdAt": "ISO datetime",
  "modifiedAt": "ISO datetime",
  "completedAt": "ISO datetime | null",
  "canceledAt": "ISO datetime | null"
}
```

### Area

```json
{ "uuid": "string", "title": "string" }
```

### Project

```json
{ "uuid": "string", "title": "string", "area_id": "string | null", "area_title": "string | null", "status": 0, "trashed": false }
```

`status: 0` = active, `status: 3` = completed.

### Tag

```json
{ "uuid": "string", "title": "string" }
```

### ChangeEntry

```json
{
  "id": "string (UUID)",
  "operation": "create | update | complete | cancel | delete | undo",
  "taskId": "string",
  "before": "Task | null",
  "after": "Task | null",
  "createdAt": "ISO datetime",
  "undoneAt": "ISO datetime | null"
}
```

---

## Endpoints

### GET /api/tasks

List tasks. Without filters returns all inbox tasks.

**Query params (all optional):**

| Param | Values | Description |
|-------|--------|-------------|
| `status` | `inbox` `today` `upcoming` `someday` `completed` `canceled` | Filter by status |
| `projectId` | UUID | Tasks in a specific project |
| `areaId` | UUID | Tasks in a specific area |
| `tag` | string | Tasks with a specific tag |

**Response:** `Task[]`

```bash
# All inbox tasks
curl -H "Authorization: Bearer <token>" "<base-url>/api/tasks"

# Today's tasks
curl -H "Authorization: Bearer <token>" "<base-url>/api/tasks?status=today"

# Upcoming tasks
curl -H "Authorization: Bearer <token>" "<base-url>/api/tasks?status=upcoming"

# Someday tasks
curl -H "Authorization: Bearer <token>" "<base-url>/api/tasks?status=someday"

# Completed tasks
curl -H "Authorization: Bearer <token>" "<base-url>/api/tasks?status=completed"

# Tasks in a project
curl -H "Authorization: Bearer <token>" "<base-url>/api/tasks?projectId=<project-id>"

# Tasks in an area
curl -H "Authorization: Bearer <token>" "<base-url>/api/tasks?areaId=<area-id>"

# Tasks tagged "work"
curl -H "Authorization: Bearer <token>" "<base-url>/api/tasks?tag=work"
```

---

### GET /api/tasks/:id

Get a single task by its Things UUID.

**Response:** `Task`

```bash
curl -H "Authorization: Bearer <token>" "<base-url>/api/tasks/<task-id>"
```

---

### GET /api/areas

List all areas.

**Response:** `Area[]`

```bash
curl -H "Authorization: Bearer <token>" "<base-url>/api/areas"
```

---

### GET /api/projects

List active (non-completed, non-trashed) projects.

**Query params (optional):**

| Param | Description |
|-------|-------------|
| `areaId` | Filter to projects in a specific area |

**Response:** `Project[]`

```bash
# All projects
curl -H "Authorization: Bearer <token>" "<base-url>/api/projects"

# Projects in an area
curl -H "Authorization: Bearer <token>" "<base-url>/api/projects?areaId=<area-id>"
```

---

### GET /api/tags

List all tags.

**Response:** `Tag[]`

```bash
curl -H "Authorization: Bearer <token>" "<base-url>/api/tags"
```

---

### POST /api/tasks

Create a new task.

**Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | ✅ | Task title |
| `notes` | string | | Body/notes |
| `when` | `today` `evening` `tomorrow` `this-weekend` `next-week` `someday` | | Schedule shorthand |
| `whenDate` | ISO datetime | | Explicit schedule date |
| `deadline` | ISO datetime | | Hard deadline |
| `projectId` | UUID | | Assign to project |
| `areaId` | UUID | | Assign to area (if no project) |
| `tags` | string[] | | Tag names |
| `checklistItems` | `[{title, completed}]` | | Checklist items |

**Response:** `{ id, task, entryId }` — HTTP 201

```bash
# Minimal task
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy milk"}' \
  "<base-url>/api/tasks"

# Full task
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Prepare quarterly report",
    "notes": "Include Q1 numbers from accounting",
    "when": "today",
    "deadline": "2026-04-10T00:00:00.000Z",
    "tags": ["work", "important"],
    "checklistItems": [
      {"title": "Gather data", "completed": false},
      {"title": "Write summary", "completed": false}
    ]
  }' \
  "<base-url>/api/tasks"

# Task scheduled for a specific date
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Call dentist","whenDate":"2026-04-15T09:00:00.000Z"}' \
  "<base-url>/api/tasks"
```

---

### PATCH /api/tasks/:id

Update an existing task. Only supplied fields are changed.

**Body (JSON) — all optional:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | New title |
| `notes` | string | New notes (replaces existing) |
| `when` | `today` `evening` `tomorrow` `this-weekend` `next-week` `someday` `null` | Reschedule |
| `whenDate` | ISO datetime or `null` | Explicit date or clear it |
| `deadline` | ISO datetime or `null` | Set/clear deadline |
| `tags` | string[] | Replace all tags |

**Response:** `{ task, entryId }`

```bash
# Rename a task
curl -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy oat milk"}' \
  "<base-url>/api/tasks/<task-id>"

# Move to today and add a deadline
curl -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"when":"today","deadline":"2026-04-08T00:00:00.000Z"}' \
  "<base-url>/api/tasks/<task-id>"

# Clear the deadline
curl -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"deadline":null}' \
  "<base-url>/api/tasks/<task-id>"
```

---

### POST /api/tasks/:id/complete

Mark a task as completed.

**Response:** `{ task, entryId }`

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  "<base-url>/api/tasks/<task-id>/complete"
```

---

### POST /api/tasks/:id/cancel

Cancel a task.

**Response:** `{ task, entryId }`

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  "<base-url>/api/tasks/<task-id>/cancel"
```

---

### DELETE /api/tasks/:id

Delete (trash) a task permanently.

**Response:** `{ entryId }`

```bash
curl -X DELETE \
  -H "Authorization: Bearer <token>" \
  "<base-url>/api/tasks/<task-id>"
```

---

### GET /api/log

Paginated history of all mutations.

**Query params:**

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `limit` | 50 | 100 | Entries per page |
| `offset` | 0 | — | Skip N entries |

**Response:** `{ entries: ChangeEntry[], total: number }`

```bash
# Latest 50 changes
curl -H "Authorization: Bearer <token>" "<base-url>/api/log"

# Page 2 (entries 51–100)
curl -H "Authorization: Bearer <token>" "<base-url>/api/log?limit=50&offset=50"
```

---

### POST /api/undo/:entryId

Reverse a previously logged change. Works for all operations: create, update, complete, cancel, delete.

- Undoing a **create** → deletes the task
- Undoing an **update** or **complete** → restores the before snapshot
- Undoing a **cancel** or **delete** → recreates the task from the before snapshot

The undo itself is logged as a new `undo` entry.

**Response:** `{ entryId }` — the new log entry for the undo action

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  "<base-url>/api/undo/<entry-id>"
```

---

## Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Invalid request body (validation failed) |
| 401 | Missing or invalid bearer token |
| 404 | Task or log entry not found |
| 422 | Undo not possible (missing snapshot data) |
| 500 | Things CLI failure — body contains stderr |

---

## Common Workflows

### Find and complete a task

```bash
# 1. Find tasks due today
curl -H "Authorization: Bearer <token>" "<base-url>/api/tasks?status=today"

# 2. Complete the one you want (use id from step 1)
curl -X POST -H "Authorization: Bearer <token>" \
  "<base-url>/api/tasks/<id>/complete"
```

### Create a task and immediately undo it

```bash
# 1. Create
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test task"}' \
  "<base-url>/api/tasks")

ENTRY_ID=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['entryId'])")

# 2. Undo
curl -X POST -H "Authorization: Bearer <token>" \
  "<base-url>/api/undo/$ENTRY_ID"
```

### List all projects grouped by area

```bash
# 1. Get areas
curl -H "Authorization: Bearer <token>" "<base-url>/api/areas"

# 2. Get projects for a specific area
curl -H "Authorization: Bearer <token>" \
  "<base-url>/api/projects?areaId=<area-id>"
```

### Add a task to a specific project

```bash
# 1. Find project UUID
curl -H "Authorization: Bearer <token>" "<base-url>/api/projects"

# 2. Create task with projectId
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"New feature spec","projectId":"<project-id>"}' \
  "<base-url>/api/tasks"
```
