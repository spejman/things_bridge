#!/bin/bash

set -e

API_URL="${API_URL:-http://localhost:3000}"
CLIENT_TOKEN="${CLIENT_TOKEN:-}"

if [ -z "$CLIENT_TOKEN" ]; then
  echo "Error: CLIENT_TOKEN environment variable is required"
  echo "Usage: CLIENT_TOKEN=your-token ./scripts/demo.sh"
  exit 1
fi

echo "================================================"
echo "Things Bridge API Demo"
echo "================================================"
echo "API URL: $API_URL"
echo ""

echo "[1/6] Creating task..."
CREATE_RESPONSE=$(curl -s -X POST "$API_URL/ops" \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "create_task",
    "payload": {
      "title": "Demo Task from Linux",
      "notes": "Created via Things Bridge API",
      "tags": ["demo", "api"],
      "when": "today"
    },
    "idempotencyKey": "demo-'"$(date +%s)"'"
  }')

OP_ID=$(echo "$CREATE_RESPONSE" | grep -o '"opId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$OP_ID" ]; then
  echo "Error: Failed to create operation"
  echo "Response: $CREATE_RESPONSE"
  exit 1
fi

echo "✓ Operation created: $OP_ID"
echo ""

echo "[2/6] Waiting for operation to complete (max 30 seconds)..."
for i in {1..30}; do
  STATUS_RESPONSE=$(curl -s "$API_URL/ops/$OP_ID" \
    -H "Authorization: Bearer $CLIENT_TOKEN")

  STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

  echo "  Attempt $i/30: Status = $STATUS"

  if [ "$STATUS" = "completed" ]; then
    echo "✓ Task created successfully!"

    THINGS_ID=$(echo "$STATUS_RESPONSE" | grep -o '"thingsId":"[^"]*"' | cut -d'"' -f4)
    echo "  Things ID: $THINGS_ID"
    echo ""

    echo "[3/6] Updating task..."
    UPDATE_RESPONSE=$(curl -s -X POST "$API_URL/ops" \
      -H "Authorization: Bearer $CLIENT_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "type": "update_task",
        "payload": {
          "thingsId": "'"$THINGS_ID"'",
          "title": "Demo Task (Updated)",
          "notes": "This task was updated via the API"
        }
      }')

    UPDATE_OP_ID=$(echo "$UPDATE_RESPONSE" | grep -o '"opId":"[^"]*"' | cut -d'"' -f4)
    echo "✓ Update operation created: $UPDATE_OP_ID"
    echo ""

    echo "[4/6] Waiting for update to complete..."
    sleep 5
    echo "✓ Update should be processed"
    echo ""

    echo "[5/6] Canceling task..."
    CANCEL_RESPONSE=$(curl -s -X POST "$API_URL/ops" \
      -H "Authorization: Bearer $CLIENT_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "type": "cancel_task",
        "payload": {
          "thingsId": "'"$THINGS_ID"'"
        }
      }')

    CANCEL_OP_ID=$(echo "$CANCEL_RESPONSE" | grep -o '"opId":"[^"]*"' | cut -d'"' -f4)
    echo "✓ Cancel operation created: $CANCEL_OP_ID"
    echo ""

    break
  fi

  if [ "$STATUS" = "failed" ] || [ "$STATUS" = "deadletter" ]; then
    echo "✗ Operation failed with status: $STATUS"
    echo "Response: $STATUS_RESPONSE"
    exit 1
  fi

  sleep 2
done

if [ "$STATUS" != "completed" ]; then
  echo "✗ Operation did not complete within 30 seconds"
  echo "Final status: $STATUS"
  exit 1
fi

echo "[6/6] Fetching tasks..."
TASKS_RESPONSE=$(curl -s "$API_URL/tasks?status=canceled" \
  -H "Authorization: Bearer $CLIENT_TOKEN")

TASK_COUNT=$(echo "$TASKS_RESPONSE" | grep -o '"id"' | wc -l)
echo "✓ Found $TASK_COUNT canceled task(s)"
echo ""

echo "First 3 tasks (limited output):"
echo "$TASKS_RESPONSE" | head -c 500
echo "..."
echo ""

echo "================================================"
echo "Demo completed successfully!"
echo "================================================"
echo ""
echo "Summary:"
echo "  - Created task: $THINGS_ID"
echo "  - Updated task title and notes"
echo "  - Canceled task"
echo "  - Retrieved tasks from API"
echo ""
echo "Check your Things 3 app to see the canceled task."
