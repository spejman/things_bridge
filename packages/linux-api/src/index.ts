import type { Database } from 'bun:sqlite';
import { initializeDatabase } from './db/database.ts';
import { OperationsService } from './services/operations.ts';
import { TasksService } from './services/tasks.ts';
import { authenticateAgent, authenticateClient } from './middleware/auth.ts';
import { loadConfig } from './config.ts';
import {
  CreateOperationRequestSchema,
  ClaimOperationsRequestSchema,
  OpResultRequestSchema,
  TaskSnapshotSchema,
  INTERVALS,
} from '@things-bridge/shared';

const config = loadConfig();
const db = initializeDatabase({ path: config.dbPath });
const operationsService = new OperationsService(db);
const tasksService = new TasksService(db);

const lockCleanupInterval = setInterval(() => {
  const resetCount = operationsService.resetStaleLocks(config.lockTimeoutMs);
  if (resetCount > 0) {
    console.log(`[LockCleanup] Reset ${resetCount} stale lock(s)`);
  }
}, INTERVALS.LOCK_CLEANUP_INTERVAL_MS);

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  clearInterval(lockCleanupInterval);
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  clearInterval(lockCleanupInterval);
  db.close();
  process.exit(0);
});

const server = Bun.serve({
  port: config.port,
  fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === '/tasks' && req.method === 'GET') {
      if (!authenticateClient(req, config)) {
        return new Response('Unauthorized', { status: 401 });
      }

      const status = url.searchParams.get('status') || undefined;
      const projectId = url.searchParams.get('projectId') || undefined;

      const tasks = tasksService.getTasks({
        status: status as any,
        projectId,
      });

      return Response.json(tasks);
    }

    if (pathname === '/ops' && req.method === 'POST') {
      if (!authenticateClient(req, config)) {
        return new Response('Unauthorized', { status: 401 });
      }

      return req.json().then((body) => {
        const parseResult = CreateOperationRequestSchema.safeParse(body);

        if (!parseResult.success) {
          return Response.json({ error: 'Invalid request', details: parseResult.error }, { status: 400 });
        }

        const { type, payload, idempotencyKey } = parseResult.data;

        const opId = operationsService.createOperation({
          type,
          payload,
          idempotencyKey,
          maxAttempts: config.maxAttempts,
        });

        return Response.json({ opId }, { status: 201 });
      });
    }

    if (pathname.startsWith('/ops/') && req.method === 'GET') {
      if (!authenticateClient(req, config)) {
        return new Response('Unauthorized', { status: 401 });
      }

      const opId = pathname.split('/')[2];

      if (!opId) {
        return new Response('Not found', { status: 404 });
      }

      const operation = operationsService.getOperation(opId);

      if (!operation) {
        return new Response('Not found', { status: 404 });
      }

      return Response.json(operation);
    }

    if (pathname === '/agent/claim' && req.method === 'POST') {
      if (!authenticateAgent(req, config)) {
        return new Response('Unauthorized', { status: 401 });
      }

      return req.json().then((body) => {
        const parseResult = ClaimOperationsRequestSchema.safeParse(body);

        if (!parseResult.success) {
          return Response.json({ error: 'Invalid request', details: parseResult.error }, { status: 400 });
        }

        const { agentId, batchSize = 10 } = parseResult.data;

        const operations = operationsService.claimOperations(agentId, batchSize);

        return Response.json({ operations });
      });
    }

    if (pathname === '/agent/op-result' && req.method === 'POST') {
      if (!authenticateAgent(req, config)) {
        return new Response('Unauthorized', { status: 401 });
      }

      return req.json().then((body) => {
        const parseResult = OpResultRequestSchema.safeParse(body);

        if (!parseResult.success) {
          return Response.json({ error: 'Invalid request', details: parseResult.error }, { status: 400 });
        }

        const { opId, success, error, result } = parseResult.data;

        if (success) {
          operationsService.completeOperation(opId, result);
        } else {
          operationsService.failOperation(opId, error || 'Unknown error', config.maxAttempts);
        }

        return Response.json({ success: true });
      });
    }

    if (pathname === '/agent/snapshot' && req.method === 'POST') {
      if (!authenticateAgent(req, config)) {
        return new Response('Unauthorized', { status: 401 });
      }

      return req.json().then((body) => {
        const parseResult = TaskSnapshotSchema.safeParse(body);

        if (!parseResult.success) {
          return Response.json({ error: 'Invalid request', details: parseResult.error }, { status: 400 });
        }

        const { tasks, syncedAt } = parseResult.data;

        tasksService.upsertTasks(tasks);
        tasksService.updateSyncState('last_snapshot_at', syncedAt);

        return Response.json({ success: true });
      });
    }

    if (pathname === '/agent/heartbeat' && req.method === 'POST') {
      if (!authenticateAgent(req, config)) {
        return new Response('Unauthorized', { status: 401 });
      }

      tasksService.updateSyncState('agent_last_heartbeat', new Date().toISOString());

      return Response.json({ success: true });
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log(`[API] Server listening on http://localhost:${server.port}`);
console.log(`[API] Database: ${config.dbPath}`);
console.log(`[API] Lock timeout: ${config.lockTimeoutMs}ms`);
console.log(`[API] Max attempts: ${config.maxAttempts}`);
