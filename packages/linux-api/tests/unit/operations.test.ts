import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { OperationsService } from '../../src/services/operations.ts';
import { initializeDatabase } from '../../src/db/database.ts';
import { OPERATION_STATUS, RETRY } from '@things-bridge/shared';

describe('OperationsService', () => {
  let db: Database;
  let service: OperationsService;

  beforeEach(() => {
    db = initializeDatabase({ path: ':memory:' });
    service = new OperationsService(db);
  });

  describe('createOperation', () => {
    test('creates a new operation', () => {
      const opId = service.createOperation({
        type: 'create_task',
        payload: { title: 'Test Task' },
      });

      expect(opId).toBeDefined();

      const op = service.getOperation(opId);
      expect(op).toBeDefined();
      expect(op?.type).toBe('create_task');
      expect(op?.status).toBe(OPERATION_STATUS.PENDING);
      expect(op?.attemptCount).toBe(0);
    });

    test('enforces idempotency', () => {
      const opId1 = service.createOperation({
        type: 'create_task',
        payload: { title: 'Test Task' },
        idempotencyKey: 'test-key-123',
      });

      const opId2 = service.createOperation({
        type: 'create_task',
        payload: { title: 'Different Task' },
        idempotencyKey: 'test-key-123',
      });

      expect(opId1).toBe(opId2);
    });

    test('creates separate operations without idempotency key', () => {
      const opId1 = service.createOperation({
        type: 'create_task',
        payload: { title: 'Test Task 1' },
      });

      const opId2 = service.createOperation({
        type: 'create_task',
        payload: { title: 'Test Task 2' },
      });

      expect(opId1).not.toBe(opId2);
    });
  });

  describe('claimOperations', () => {
    test('claims pending operations', () => {
      service.createOperation({
        type: 'create_task',
        payload: { title: 'Task 1' },
      });
      service.createOperation({
        type: 'create_task',
        payload: { title: 'Task 2' },
      });

      const claimed = service.claimOperations('agent-1', 10);

      expect(claimed.length).toBe(2);
      expect(claimed[0]?.status).toBe(OPERATION_STATUS.PROCESSING);
      expect(claimed[0]?.lockedBy).toBe('agent-1');
    });

    test('respects batch size', () => {
      for (let i = 0; i < 5; i++) {
        service.createOperation({
          type: 'create_task',
          payload: { title: `Task ${i}` },
        });
      }

      const claimed = service.claimOperations('agent-1', 3);

      expect(claimed.length).toBe(3);
    });

    test('prevents concurrent claims of same operation', () => {
      service.createOperation({
        type: 'create_task',
        payload: { title: 'Task 1' },
      });

      const claimed1 = service.claimOperations('agent-1', 10);
      const claimed2 = service.claimOperations('agent-2', 10);

      expect(claimed1.length).toBe(1);
      expect(claimed2.length).toBe(0);
    });

    test('does not claim operations not yet available', () => {
      const opId = service.createOperation({
        type: 'create_task',
        payload: { title: 'Task 1' },
      });

      service.failOperation(opId, 'Test error');

      const claimed = service.claimOperations('agent-1', 10);
      expect(claimed.length).toBe(0);
    });
  });

  describe('completeOperation', () => {
    test('marks operation as completed', () => {
      const opId = service.createOperation({
        type: 'create_task',
        payload: { title: 'Test Task' },
      });

      service.completeOperation(opId, { thingsId: 'test-uuid' });

      const op = service.getOperation(opId);
      expect(op?.status).toBe(OPERATION_STATUS.COMPLETED);
      expect(op?.completedAt).toBeDefined();
      expect(op?.resultJson).toContain('test-uuid');
    });
  });

  describe('failOperation', () => {
    test('retries with backoff on first failure', () => {
      const opId = service.createOperation({
        type: 'create_task',
        payload: { title: 'Test Task' },
      });

      service.claimOperations('agent-1', 10);
      service.failOperation(opId, 'Test error');

      const op = service.getOperation(opId);
      expect(op?.status).toBe(OPERATION_STATUS.PENDING);
      expect(op?.attemptCount).toBe(1);
      expect(op?.lastError).toBe('Test error');
      expect(op?.lockedAt).toBeNull();
      expect(op?.lockedBy).toBeNull();
    });

    test('moves to deadletter after max attempts', () => {
      const opId = service.createOperation({
        type: 'create_task',
        payload: { title: 'Test Task' },
        maxAttempts: 3,
      });

      for (let i = 0; i < 3; i++) {
        service.claimOperations('agent-1', 10);
        service.failOperation(opId, `Attempt ${i + 1} failed`, 3);
      }

      const op = service.getOperation(opId);
      expect(op?.status).toBe(OPERATION_STATUS.DEADLETTER);
      expect(op?.attemptCount).toBe(3);
    });

    test('applies exponential backoff', () => {
      const opId = service.createOperation({
        type: 'create_task',
        payload: { title: 'Test Task' },
      });

      service.claimOperations('agent-1', 10);
      const beforeFail = Date.now();
      service.failOperation(opId, 'Test error');

      const op = service.getOperation(opId);
      const availableAt = new Date(op!.availableAt).getTime();

      const attemptCount = 1;
      const expectedBackoff = RETRY.INITIAL_BACKOFF_MS * Math.pow(RETRY.BACKOFF_MULTIPLIER, attemptCount);
      const actualBackoff = availableAt - beforeFail;

      expect(actualBackoff).toBeGreaterThanOrEqual(expectedBackoff * 0.9);
      expect(actualBackoff).toBeLessThanOrEqual(expectedBackoff * 1.1);
    });
  });

  describe('resetStaleLocks', () => {
    test('resets stale locks', async () => {
      const opId = service.createOperation({
        type: 'create_task',
        payload: { title: 'Test Task' },
      });

      service.claimOperations('agent-1', 10);

      const pastTime = new Date(Date.now() - 200_000).toISOString();
      db.query('UPDATE operations SET locked_at = ? WHERE op_id = ?').run(pastTime, opId);

      const resetCount = service.resetStaleLocks(120_000);

      expect(resetCount).toBe(1);

      const op = service.getOperation(opId);
      expect(op?.status).toBe(OPERATION_STATUS.PENDING);
      expect(op?.lockedAt).toBeNull();
      expect(op?.lockedBy).toBeNull();
    });

    test('does not reset fresh locks', () => {
      const opId = service.createOperation({
        type: 'create_task',
        payload: { title: 'Test Task' },
      });

      service.claimOperations('agent-1', 10);

      const resetCount = service.resetStaleLocks(120_000);

      expect(resetCount).toBe(0);

      const op = service.getOperation(opId);
      expect(op?.status).toBe(OPERATION_STATUS.PROCESSING);
      expect(op?.lockedBy).toBe('agent-1');
    });
  });
});
