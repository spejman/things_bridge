import { loadConfig } from './config.ts';
import { ApiClient } from './services/api-client.ts';
import { ThingsCliService } from './services/things-cli.ts';
import { OperationProcessor } from './services/operation-processor.ts';
import { SnapshotSync } from './services/snapshot-sync.ts';
import { ClaimLoop } from './loops/claim-loop.ts';
import { SnapshotLoop } from './loops/snapshot-loop.ts';

const config = loadConfig();

console.log('[Agent] Things Bridge macOS Agent');
console.log(`[Agent] API URL: ${config.apiUrl}`);
console.log(`[Agent] Agent ID: ${config.agentId}`);
console.log(`[Agent] Poll interval: ${config.pollIntervalMs}ms`);
console.log(`[Agent] Snapshot interval: ${config.snapshotIntervalMs}ms`);
console.log(`[Agent] Heartbeat interval: ${config.heartbeatIntervalMs}ms`);

const apiClient = new ApiClient({
  apiUrl: config.apiUrl,
  agentToken: config.agentToken,
  agentId: config.agentId,
});

const thingsCli = new ThingsCliService();
const processor = new OperationProcessor(thingsCli, apiClient);
const snapshotSync = new SnapshotSync(thingsCli, apiClient);

const claimLoop = new ClaimLoop(
  apiClient,
  processor,
  snapshotSync,
  config.pollIntervalMs,
  config.claimBatchSize
);

const snapshotLoop = new SnapshotLoop(snapshotSync, config.snapshotIntervalMs);

const heartbeatInterval = setInterval(() => {
  apiClient.heartbeat().catch((error) => {
    console.error(`[Heartbeat] Error: ${error.message}`);
  });
}, config.heartbeatIntervalMs);

const shutdown = () => {
  console.log('\n[Agent] Shutting down...');
  claimLoop.stop();
  snapshotLoop.stop();
  clearInterval(heartbeatInterval);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[Agent] Starting loops...');

await Promise.all([claimLoop.start(), snapshotLoop.start()]);
