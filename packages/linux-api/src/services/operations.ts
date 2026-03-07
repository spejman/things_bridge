import type { Database } from 'bun:sqlite';
import { RETRY, OPERATION_STATUS, SCHEMA_VERSION } from '@things-bridge/shared';
import type { OperationType, OperationPayload, Operation, OperationStatus } from '@things-bridge/shared';

export interface CreateOperationParams {
  type: OperationType;
  payload: OperationPayload;
  idempotencyKey?: string;
  maxAttempts?: number;
}

interface DbOperation {
  op_id: string;
  schema_version: number;
  type: OperationType;
  payload_json: string;
  idempotency_key: string | null;
  status: OperationStatus;
  locked_at: string | null;
  locked_by: string | null;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  created_at: string;
  completed_at: string | null;
  last_error: string | null;
  result_json: string | null;
}

function mapDbToOperation(dbOp: DbOperation): Operation {
  return {
    opId: dbOp.op_id,
    schemaVersion: dbOp.schema_version,
    type: dbOp.type,
    payloadJson: dbOp.payload_json,
    idempotencyKey: dbOp.idempotency_key,
    status: dbOp.status,
    lockedAt: dbOp.locked_at,
    lockedBy: dbOp.locked_by,
    attemptCount: dbOp.attempt_count,
    maxAttempts: dbOp.max_attempts,
    availableAt: dbOp.available_at,
    createdAt: dbOp.created_at,
    completedAt: dbOp.completed_at,
    lastError: dbOp.last_error,
    resultJson: dbOp.result_json,
  };
}

export class OperationsService {
  constructor(private db: Database) {}

  createOperation(params: CreateOperationParams): string {
    const { type, payload, idempotencyKey, maxAttempts = RETRY.MAX_ATTEMPTS } = params;

    if (idempotencyKey) {
      const existing = this.db
        .query('SELECT op_id FROM operations WHERE idempotency_key = ?')
        .get(idempotencyKey) as { op_id: string } | null;

      if (existing) {
        return existing.op_id;
      }
    }

    const opId = crypto.randomUUID();
    const payloadJson = JSON.stringify(payload);
    const now = new Date().toISOString();

    this.db
      .query(
        `INSERT INTO operations (
          op_id, schema_version, type, payload_json, idempotency_key,
          status, max_attempts, available_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        opId,
        SCHEMA_VERSION,
        type,
        payloadJson,
        idempotencyKey || null,
        OPERATION_STATUS.PENDING,
        maxAttempts,
        now,
        now
      );

    return opId;
  }

  claimOperations(agentId: string, batchSize: number = 10): Operation[] {
    const now = new Date().toISOString();

    this.db.run('BEGIN IMMEDIATE');

    try {
      const dbOperations = this.db
        .query(
          `SELECT * FROM operations
           WHERE status = ?
             AND available_at <= ?
           ORDER BY created_at
           LIMIT ?`
        )
        .all(OPERATION_STATUS.PENDING, now, batchSize) as DbOperation[];

      if (dbOperations.length > 0) {
        const opIds = dbOperations.map((op) => op.op_id);
        const placeholders = opIds.map(() => '?').join(',');

        this.db
          .query(
            `UPDATE operations
             SET status = ?, locked_at = ?, locked_by = ?
             WHERE op_id IN (${placeholders})`
          )
          .run(OPERATION_STATUS.PROCESSING, now, agentId, ...opIds);

        this.db.run('COMMIT');

        return dbOperations.map((dbOp) => {
          dbOp.status = OPERATION_STATUS.PROCESSING;
          dbOp.locked_at = now;
          dbOp.locked_by = agentId;
          return mapDbToOperation(dbOp);
        });
      }

      this.db.run('COMMIT');
      return [];
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  completeOperation(opId: string, result?: Record<string, unknown>): void {
    const now = new Date().toISOString();
    const resultJson = result ? JSON.stringify(result) : null;

    this.db
      .query(
        `UPDATE operations
         SET status = ?, completed_at = ?, result_json = ?
         WHERE op_id = ?`
      )
      .run(OPERATION_STATUS.COMPLETED, now, resultJson, opId);
  }

  failOperation(opId: string, error: string): void {
    const operation = this.db
      .query('SELECT attempt_count, max_attempts FROM operations WHERE op_id = ?')
      .get(opId) as { attempt_count: number; max_attempts: number } | null;

    if (!operation) {
      throw new Error(`Operation ${opId} not found`);
    }

    const attemptCount = operation.attempt_count + 1;
    const maxAttempts = operation.max_attempts;
    const now = new Date().toISOString();

    if (attemptCount >= maxAttempts) {
      this.db
        .query(
          `UPDATE operations
           SET status = ?, attempt_count = ?, last_error = ?, locked_at = NULL, locked_by = NULL
           WHERE op_id = ?`
        )
        .run(OPERATION_STATUS.DEADLETTER, attemptCount, error, opId);
    } else {
      const backoffMs = Math.min(
        RETRY.INITIAL_BACKOFF_MS * Math.pow(RETRY.BACKOFF_MULTIPLIER, attemptCount),
        RETRY.MAX_BACKOFF_MS
      );
      const availableAt = new Date(Date.now() + backoffMs).toISOString();

      this.db
        .query(
          `UPDATE operations
           SET status = ?, attempt_count = ?, last_error = ?, available_at = ?, locked_at = NULL, locked_by = NULL
           WHERE op_id = ?`
        )
        .run(OPERATION_STATUS.PENDING, attemptCount, error, availableAt, opId);
    }
  }

  getOperation(opId: string): Operation | null {
    const dbOp = this.db.query('SELECT * FROM operations WHERE op_id = ?').get(opId) as
      | DbOperation
      | null;
    return dbOp ? mapDbToOperation(dbOp) : null;
  }

  resetStaleLocks(lockTimeoutMs: number): number {
    const cutoff = new Date(Date.now() - lockTimeoutMs).toISOString();
    const result = this.db
      .query(
        `UPDATE operations
         SET status = ?, locked_at = NULL, locked_by = NULL
         WHERE status = ? AND locked_at < ?`
      )
      .run(OPERATION_STATUS.PENDING, OPERATION_STATUS.PROCESSING, cutoff);

    return result.changes;
  }
}
