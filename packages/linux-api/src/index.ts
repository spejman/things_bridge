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
  TaskStatusSchema,
  INTERVALS,
} from '@things-bridge/shared';

const config = loadConfig();
const db = await initializeDatabase({ path: config.dbPath });
const operationsService = new OperationsService(db);
const tasksService = new TasksService(db);

const lockCleanupInterval = setInterval(() => {
  const resetCount = operationsService.resetStaleLocks(config.lockTimeoutMs);
  if (resetCount > 0) {
    console.log(`[LockCleanup] Reset ${resetCount} stale lock(s)`);
  }
}, INTERVALS.LOCK_CLEANUP_INTERVAL_MS);

function shutdown() {
  console.log('\nShutting down...');
  clearInterval(lockCleanupInterval);
  db.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const server = Bun.serve({
  port: config.port,
  fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === '/tasks' && req.method === 'GET') {
      if (!authenticateClient(req, config)) {
        return new Response('Unauthorized', { status: 401 });
      }

      const statusParam = url.searchParams.get('status');
      const statusParsed = statusParam ? TaskStatusSchema.safeParse(statusParam) : null;
      const projectId = url.searchParams.get('projectId') || undefined;

      if (statusParsed && !statusParsed.success) {
        return Response.json({ error: 'Invalid status', details: statusParsed.error }, { status: 400 });
      }

      const tasks = tasksService.getTasks({
        status: statusParsed?.data,
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

        console.log(`[API] Created operation: ${opId} (type: ${type}, idempotency: ${idempotencyKey || 'none'})`);

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

        if (operations.length > 0) {
          console.log(
            `[API] Agent ${agentId} claimed ${operations.length} operation(s): ${operations.map((op) => `${op.opId} (${op.type})`).join(', ')}`
          );
        }

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
          console.log(`[API] ✓ Operation completed: ${opId} (result: ${JSON.stringify(result)})`);
        } else {
          operationsService.failOperation(opId, error || 'Unknown error');
          console.error(`[API] ✗ Operation failed: ${opId} (error: ${error})`);
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

        console.log(`[API] Snapshot updated: ${tasks.length} tasks synced at ${syncedAt}`);

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
