import { test, expect, describe } from 'bun:test';
import {
  TaskSchema,
  TaskSnapshotSchema,
  CreateTaskPayloadSchema,
  UpdateTaskPayloadSchema,
  CancelTaskPayloadSchema,
  OperationSchema,
  CreateOperationRequestSchema,
  ClaimOperationsRequestSchema,
  OpResultRequestSchema,
} from '../src/schemas/index.ts';

describe('TaskSchema', () => {
  test('validates a valid task', () => {
    const validTask = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Test Task',
      notes: 'Test notes',
      status: 'inbox',
      projectId: null,
      areaId: null,
      tags: ['test', 'demo'],
      checklistItems: [
        { title: 'Item 1', completed: false },
        { title: 'Item 2', completed: true },
      ],
      deadline: '2024-12-31T23:59:59Z',
      whenDate: '2024-01-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
      modifiedAt: '2024-01-02T00:00:00Z',
      completedAt: null,
      canceledAt: null,
    };

    const result = TaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  test('rejects invalid status', () => {
    const invalidTask = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Test Task',
      notes: null,
      status: 'invalid-status',
      projectId: null,
      areaId: null,
      tags: [],
      checklistItems: [],
      deadline: null,
      whenDate: null,
      createdAt: '2024-01-01T00:00:00Z',
      modifiedAt: '2024-01-02T00:00:00Z',
      completedAt: null,
      canceledAt: null,
    };

    const result = TaskSchema.safeParse(invalidTask);
    expect(result.success).toBe(false);
  });

  test('rejects invalid UUID', () => {
    const invalidTask = {
      id: 'not-a-uuid',
      title: 'Test Task',
      notes: null,
      status: 'inbox',
      projectId: null,
      areaId: null,
      tags: [],
      checklistItems: [],
      deadline: null,
      whenDate: null,
      createdAt: '2024-01-01T00:00:00Z',
      modifiedAt: '2024-01-02T00:00:00Z',
      completedAt: null,
      canceledAt: null,
    };

    const result = TaskSchema.safeParse(invalidTask);
    expect(result.success).toBe(false);
  });
});

describe('TaskSnapshotSchema', () => {
  test('validates a valid snapshot', () => {
    const validSnapshot = {
      tasks: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Task 1',
          notes: null,
          status: 'inbox',
          projectId: null,
          areaId: null,
          tags: [],
          checklistItems: [],
          deadline: null,
          whenDate: null,
          createdAt: '2024-01-01T00:00:00Z',
          modifiedAt: '2024-01-02T00:00:00Z',
          completedAt: null,
          canceledAt: null,
        },
      ],
      syncedAt: '2024-01-02T00:00:00Z',
    };

    const result = TaskSnapshotSchema.safeParse(validSnapshot);
    expect(result.success).toBe(true);
  });
});

describe('CreateTaskPayloadSchema', () => {
  test('validates minimal payload', () => {
    const minimalPayload = {
      title: 'Test Task',
    };

    const result = CreateTaskPayloadSchema.safeParse(minimalPayload);
    expect(result.success).toBe(true);
  });

  test('validates full payload', () => {
    const fullPayload = {
      title: 'Test Task',
      notes: 'Test notes',
      projectId: '123e4567-e89b-12d3-a456-426614174000',
      areaId: '123e4567-e89b-12d3-a456-426614174001',
      tags: ['test', 'demo'],
      checklistItems: [
        { title: 'Item 1', completed: false },
      ],
      deadline: '2024-12-31T23:59:59Z',
      whenDate: '2024-01-01T00:00:00Z',
      when: 'today',
    };

    const result = CreateTaskPayloadSchema.safeParse(fullPayload);
    expect(result.success).toBe(true);
  });

  test('rejects empty title', () => {
    const invalidPayload = {
      title: '',
    };

    const result = CreateTaskPayloadSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  test('rejects invalid when value', () => {
    const invalidPayload = {
      title: 'Test Task',
      when: 'invalid-when',
    };

    const result = CreateTaskPayloadSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });
});

describe('UpdateTaskPayloadSchema', () => {
  test('validates minimal payload with thingsId', () => {
    const minimalPayload = {
      thingsId: '123e4567-e89b-12d3-a456-426614174000',
    };

    const result = UpdateTaskPayloadSchema.safeParse(minimalPayload);
    expect(result.success).toBe(true);
  });

  test('validates payload with nullable fields', () => {
    const payload = {
      thingsId: '123e4567-e89b-12d3-a456-426614174000',
      projectId: null,
      deadline: null,
      when: null,
    };

    const result = UpdateTaskPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test('rejects missing thingsId', () => {
    const invalidPayload = {
      title: 'Updated title',
    };

    const result = UpdateTaskPayloadSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });
});

describe('CancelTaskPayloadSchema', () => {
  test('validates valid payload', () => {
    const validPayload = {
      thingsId: '123e4567-e89b-12d3-a456-426614174000',
    };

    const result = CancelTaskPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  test('rejects invalid UUID', () => {
    const invalidPayload = {
      thingsId: 'not-a-uuid',
    };

    const result = CancelTaskPayloadSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });
});

describe('OperationSchema', () => {
  test('validates a valid operation', () => {
    const validOperation = {
      opId: '123e4567-e89b-12d3-a456-426614174000',
      schemaVersion: 1,
      type: 'create_task',
      payloadJson: '{"title":"Test"}',
      idempotencyKey: 'test-key',
      status: 'pending',
      lockedAt: null,
      lockedBy: null,
      attemptCount: 0,
      maxAttempts: 5,
      availableAt: '2024-01-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
      completedAt: null,
      lastError: null,
      resultJson: null,
    };

    const result = OperationSchema.safeParse(validOperation);
    expect(result.success).toBe(true);
  });

  test('rejects invalid operation type', () => {
    const invalidOperation = {
      opId: '123e4567-e89b-12d3-a456-426614174000',
      schemaVersion: 1,
      type: 'invalid_operation',
      payloadJson: '{"title":"Test"}',
      idempotencyKey: null,
      status: 'pending',
      lockedAt: null,
      lockedBy: null,
      attemptCount: 0,
      maxAttempts: 5,
      availableAt: '2024-01-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
      completedAt: null,
      lastError: null,
      resultJson: null,
    };

    const result = OperationSchema.safeParse(invalidOperation);
    expect(result.success).toBe(false);
  });
});

describe('CreateOperationRequestSchema', () => {
  test('validates request with idempotency key', () => {
    const validRequest = {
      type: 'create_task',
      payload: { title: 'Test Task' },
      idempotencyKey: 'test-key-123',
    };

    const result = CreateOperationRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  test('validates request without idempotency key', () => {
    const validRequest = {
      type: 'cancel_task',
      payload: { thingsId: '123e4567-e89b-12d3-a456-426614174000' },
    };

    const result = CreateOperationRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });
});

describe('ClaimOperationsRequestSchema', () => {
  test('validates request with batch size', () => {
    const validRequest = {
      agentId: 'test-agent',
      batchSize: 10,
    };

    const result = ClaimOperationsRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  test('validates request without batch size', () => {
    const validRequest = {
      agentId: 'test-agent',
    };

    const result = ClaimOperationsRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  test('rejects batch size over 100', () => {
    const invalidRequest = {
      agentId: 'test-agent',
      batchSize: 101,
    };

    const result = ClaimOperationsRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });
});

describe('OpResultRequestSchema', () => {
  test('validates successful result', () => {
    const validRequest = {
      opId: '123e4567-e89b-12d3-a456-426614174000',
      success: true,
      result: { thingsId: '123e4567-e89b-12d3-a456-426614174001' },
    };

    const result = OpResultRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  test('validates failed result', () => {
    const validRequest = {
      opId: '123e4567-e89b-12d3-a456-426614174000',
      success: false,
      error: 'Task creation failed',
    };

    const result = OpResultRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });
});
