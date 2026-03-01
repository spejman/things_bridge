import { INTERVALS } from '@things-bridge/shared';

export interface Config {
  apiUrl: string;
  agentToken: string;
  agentId: string;
  pollIntervalMs: number;
  snapshotIntervalMs: number;
  heartbeatIntervalMs: number;
  claimBatchSize: number;
}

export function loadConfig(): Config {
  const apiUrl = process.env.API_URL;
  const agentToken = process.env.AGENT_TOKEN;
  const agentId = process.env.AGENT_ID || 'default-agent';
  const pollIntervalMs = parseInt(
    process.env.POLL_INTERVAL_MS || String(INTERVALS.POLL_INTERVAL_MS),
    10
  );
  const snapshotIntervalMs = parseInt(
    process.env.SNAPSHOT_INTERVAL_MS || String(INTERVALS.SNAPSHOT_INTERVAL_MS),
    10
  );
  const heartbeatIntervalMs = parseInt(
    process.env.HEARTBEAT_INTERVAL_MS || String(INTERVALS.HEARTBEAT_INTERVAL_MS),
    10
  );
  const claimBatchSize = parseInt(process.env.CLAIM_BATCH_SIZE || '10', 10);

  if (!apiUrl) {
    throw new Error('API_URL environment variable is required');
  }

  if (!agentToken) {
    throw new Error('AGENT_TOKEN environment variable is required');
  }

  return {
    apiUrl,
    agentToken,
    agentId,
    pollIntervalMs,
    snapshotIntervalMs,
    heartbeatIntervalMs,
    claimBatchSize,
  };
}
