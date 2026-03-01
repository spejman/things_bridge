import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import type { Server } from 'bun';

describe('Linux API Integration Tests', () => {
  let server: Server;
  const port = 13579;
  const baseUrl = `http://localhost:${port}`;
  const agentToken = 'test-agent-token';
  const clientToken = 'test-client-token';

  beforeAll(async () => {
    process.env.PORT = String(port);
    process.env.DB_PATH = ':memory:';
    process.env.AGENT_TOKEN = agentToken;
    process.env.CLIENT_TOKEN = clientToken;

    const module = await import('../../src/index.ts');
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('Authentication', () => {
    test('rejects requests without auth token', async () => {
      const response = await fetch(`${baseUrl}/tasks`);
      expect(response.status).toBe(401);
    });

    test('accepts client token for client endpoints', async () => {
      const response = await fetch(`${baseUrl}/tasks`, {
        headers: { Authorization: `Bearer ${clientToken}` },
      });
      expect(response.status).toBe(200);
    });

    test('accepts agent token for agent endpoints', async () => {
      const response = await fetch(`${baseUrl}/agent/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${agentToken}` },
      });
      expect(response.status).toBe(200);
    });
  });

  describe('Client Endpoints', () => {
    test('GET /tasks returns empty array initially', async () => {
      const response = await fetch(`${baseUrl}/tasks`, {
        headers: { Authorization: `Bearer ${clientToken}` },
      });

      expect(response.status).toBe(200);
      const tasks = await response.json();
      expect(Array.isArray(tasks)).toBe(true);
    });

    test('POST /ops creates operation', async () => {
      const response = await fetch(`${baseUrl}/ops`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'create_task',
          payload: { title: 'Test Task' },
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.opId).toBeDefined();
    });

    test('GET /ops/:opId returns operation', async () => {
      const createResponse = await fetch(`${baseUrl}/ops`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'create_task',
          payload: { title: 'Test Task' },
          idempotencyKey: 'test-key-' + Date.now(),
        }),
      });

      const { opId } = await createResponse.json();

      const getResponse = await fetch(`${baseUrl}/ops/${opId}`, {
        headers: { Authorization: `Bearer ${clientToken}` },
      });

      expect(getResponse.status).toBe(200);
      const operation = await getResponse.json();
      expect(operation.opId).toBe(opId);
      expect(operation.status).toBe('pending');
    });
  });

  describe('Agent Endpoints', () => {
    test('POST /agent/claim returns pending operations', async () => {
      await fetch(`${baseUrl}/ops`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'create_task',
          payload: { title: 'Task for Claim Test' },
        }),
      });

      const response = await fetch(`${baseUrl}/agent/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: 'test-agent',
          batchSize: 10,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.operations)).toBe(true);
      expect(data.operations.length).toBeGreaterThan(0);
    });

    test('POST /agent/op-result completes operation', async () => {
      const createResponse = await fetch(`${baseUrl}/ops`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'create_task',
          payload: { title: 'Task to Complete' },
        }),
      });

      const { opId } = await createResponse.json();

      const claimResponse = await fetch(`${baseUrl}/agent/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agentId: 'test-agent' }),
      });

      const resultResponse = await fetch(`${baseUrl}/agent/op-result`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          opId,
          success: true,
          result: { thingsId: 'test-uuid' },
        }),
      });

      expect(resultResponse.status).toBe(200);

      const getResponse = await fetch(`${baseUrl}/ops/${opId}`, {
        headers: { Authorization: `Bearer ${clientToken}` },
      });

      const operation = await getResponse.json();
      expect(operation.status).toBe('completed');
    });

    test('POST /agent/snapshot updates tasks', async () => {
      const response = await fetch(`${baseUrl}/agent/snapshot`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tasks: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              title: 'Test Task from Snapshot',
              notes: null,
              status: 'inbox',
              projectId: null,
              areaId: null,
              tags: [],
              checklistItems: [],
              deadline: null,
              whenDate: null,
              createdAt: new Date().toISOString(),
              modifiedAt: new Date().toISOString(),
              completedAt: null,
              canceledAt: null,
            },
          ],
          syncedAt: new Date().toISOString(),
        }),
      });

      expect(response.status).toBe(200);

      const tasksResponse = await fetch(`${baseUrl}/tasks`, {
        headers: { Authorization: `Bearer ${clientToken}` },
      });

      const tasks = await tasksResponse.json();
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.some((t: any) => t.title === 'Test Task from Snapshot')).toBe(true);
    });

    test('POST /agent/heartbeat updates sync state', async () => {
      const response = await fetch(`${baseUrl}/agent/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${agentToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
