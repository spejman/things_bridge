# Things Bridge API Reference

Base URL: `http://your-server:3000`

## Authentication

All endpoints require Bearer token authentication via the `Authorization` header:

```
Authorization: Bearer YOUR_TOKEN
```

- **Client endpoints** (`/tasks`, `/ops`) require `CLIENT_TOKEN` (if configured)
- **Agent endpoints** (`/agent/*`) require `AGENT_TOKEN`

## Client Endpoints

### GET /tasks

Retrieve tasks from the synchronized snapshot.

**Query Parameters:**
- `status` (optional): Filter by task status (`inbox`, `today`, `upcoming`, `someday`, `completed`, `canceled`, `trash`)
- `projectId` (optional): Filter by project ID

**Example:**

```bash
curl http://localhost:3000/tasks?status=inbox \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN"
```

**Response:**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Buy groceries",
    "notes": "Milk, eggs, bread",
    "status": "inbox",
    "projectId": null,
    "areaId": null,
    "tags": ["shopping"],
    "checklistItems": [
      { "title": "Milk", "completed": false },
      { "title": "Eggs", "completed": false }
    ],
    "deadline": "2024-12-31T23:59:59Z",
    "whenDate": null,
    "createdAt": "2024-01-01T10:00:00Z",
    "modifiedAt": "2024-01-01T10:00:00Z",
    "completedAt": null,
    "canceledAt": null
  }
]
```

### POST /ops

Create a new operation (task creation, update, or cancellation).

**Request Body:**

```json
{
  "type": "create_task",
  "payload": {
    "title": "Task title",
    "notes": "Optional notes",
    "tags": ["tag1", "tag2"],
    "when": "today",
    "deadline": "2024-12-31T23:59:59Z"
  },
  "idempotencyKey": "optional-unique-key"
}
```

**Operation Types:**

1. **create_task**
   ```json
   {
     "type": "create_task",
     "payload": {
       "title": "Task title",
       "notes": "Optional notes",
       "projectId": "uuid",
       "areaId": "uuid",
       "tags": ["tag1", "tag2"],
       "checklistItems": [
         { "title": "Item 1", "completed": false }
       ],
       "deadline": "2024-12-31T23:59:59Z",
       "whenDate": "2024-01-15T00:00:00Z",
       "when": "today"
     }
   }
   ```

2. **update_task**
   ```json
   {
     "type": "update_task",
     "payload": {
       "thingsId": "uuid",
       "title": "Updated title",
       "completed": true
     }
   }
   ```

3. **cancel_task**
   ```json
   {
     "type": "cancel_task",
     "payload": {
       "thingsId": "uuid"
     }
   }
   ```

**Example:**

```bash
curl http://localhost:3000/ops \
  -X POST \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "create_task",
    "payload": {
      "title": "Demo Task",
      "when": "today"
    },
    "idempotencyKey": "demo-'$(date +%s)'"
  }'
```

**Response:**

```json
{
  "opId": "123e4567-e89b-12d3-a456-426614174000"
}
```

### GET /ops/:opId

Get the status of an operation.

**Example:**

```bash
curl http://localhost:3000/ops/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN"
```

**Response:**

```json
{
  "opId": "123e4567-e89b-12d3-a456-426614174000",
  "schemaVersion": 1,
  "type": "create_task",
  "payloadJson": "{\"title\":\"Demo Task\"}",
  "idempotencyKey": "demo-1234567890",
  "status": "completed",
  "lockedAt": null,
  "lockedBy": null,
  "attemptCount": 1,
  "maxAttempts": 5,
  "availableAt": "2024-01-01T10:00:00Z",
  "createdAt": "2024-01-01T10:00:00Z",
  "completedAt": "2024-01-01T10:01:00Z",
  "lastError": null,
  "resultJson": "{\"thingsId\":\"550e8400-e29b-41d4-a716-446655440000\"}"
}
```

**Status Values:**
- `pending`: Waiting to be processed
- `processing`: Currently being processed by agent
- `completed`: Successfully completed
- `failed`: Failed but will retry
- `deadletter`: Failed permanently (max retries exceeded)

## Agent Endpoints

### POST /agent/claim

Claim pending operations for processing.

**Request Body:**

```json
{
  "agentId": "macbook-pro",
  "batchSize": 10
}
```

**Response:**

```json
{
  "operations": [
    {
      "opId": "123e4567-e89b-12d3-a456-426614174000",
      "type": "create_task",
      "payloadJson": "{\"title\":\"Task\"}",
      "status": "processing",
      ...
    }
  ]
}
```

### POST /agent/op-result

Report the result of an operation.

**Request Body (Success):**

```json
{
  "opId": "123e4567-e89b-12d3-a456-426614174000",
  "success": true,
  "result": {
    "thingsId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Request Body (Failure):**

```json
{
  "opId": "123e4567-e89b-12d3-a456-426614174000",
  "success": false,
  "error": "Things CLI error: task not found"
}
```

**Response:**

```json
{
  "success": true
}
```

### POST /agent/snapshot

Update the task snapshot from Things 3.

**Request Body:**

```json
{
  "tasks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Task from Things",
      "notes": null,
      "status": "inbox",
      ...
    }
  ],
  "syncedAt": "2024-01-01T10:00:00Z"
}
```

**Response:**

```json
{
  "success": true
}
```

### POST /agent/heartbeat

Send a heartbeat to update agent status.

**Response:**

```json
{
  "success": true
}
```

## Error Responses

All endpoints return standard HTTP status codes:

- `200`: Success
- `201`: Created (for POST /ops)
- `400`: Bad Request (invalid JSON or schema validation failed)
- `401`: Unauthorized (missing or invalid token)
- `404`: Not Found (operation not found)
- `500`: Internal Server Error

**Error Response Format:**

```json
{
  "error": "Invalid request",
  "details": {
    "issues": [
      {
        "path": ["payload", "title"],
        "message": "Required"
      }
    ]
  }
}
```

## Idempotency

Operations support idempotency keys to prevent duplicate task creation on retries:

```bash
curl http://localhost:3000/ops \
  -X POST \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "create_task",
    "payload": {"title": "Task"},
    "idempotencyKey": "unique-key-123"
  }'
```

Subsequent requests with the same `idempotencyKey` will return the same `opId` without creating a duplicate operation.

## Rate Limits

Currently no rate limits are enforced. Consider adding rate limiting in production deployments using a reverse proxy.
