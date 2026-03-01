import { TIMEOUTS, RETRY } from '@things-bridge/shared';

export interface Config {
  port: number;
  dbPath: string;
  agentToken: string;
  clientToken?: string;
  lockTimeoutMs: number;
  maxAttempts: number;
}

export function loadConfig(): Config {
  const port = parseInt(process.env.PORT || '3000', 10);
  const dbPath = process.env.DB_PATH || '/var/lib/things-bridge/things-bridge.db';
  const agentToken = process.env.AGENT_TOKEN;
  const clientToken = process.env.CLIENT_TOKEN;
  const lockTimeoutMs = parseInt(process.env.LOCK_TIMEOUT_MS || String(TIMEOUTS.LOCK_TIMEOUT_MS), 10);
  const maxAttempts = parseInt(process.env.MAX_ATTEMPTS || String(RETRY.MAX_ATTEMPTS), 10);

  if (!agentToken) {
    throw new Error('AGENT_TOKEN environment variable is required');
  }

  return {
    port,
    dbPath,
    agentToken,
    clientToken,
    lockTimeoutMs,
    maxAttempts,
  };
}
