import type { ApiClient } from '../services/api-client.ts';
import type { OperationProcessor } from '../services/operation-processor.ts';
import type { SnapshotSync } from '../services/snapshot-sync.ts';

export class ClaimLoop {
  private running = false;

  constructor(
    private apiClient: ApiClient,
    private processor: OperationProcessor,
    private snapshotSync: SnapshotSync,
    private pollIntervalMs: number,
    private claimBatchSize: number
  ) {}

  async start(): Promise<void> {
    this.running = true;
    console.log(`[ClaimLoop] Started (poll interval: ${this.pollIntervalMs}ms)`);

    while (this.running) {
      try {
        const operations = await this.apiClient.claimOperations(this.claimBatchSize);

        if (operations.length > 0) {
          console.log(`[ClaimLoop] Claimed ${operations.length} operation(s)`);
          await this.processor.processBatch(operations);

          console.log('[ClaimLoop] Syncing snapshot after processing...');
          await this.snapshotSync.sync();
        }

        await Bun.sleep(this.pollIntervalMs);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[ClaimLoop] Error: ${errorMessage}`);
        await Bun.sleep(this.pollIntervalMs * 2);
      }
    }
  }

  stop(): void {
    console.log('[ClaimLoop] Stopping...');
    this.running = false;
  }
}
