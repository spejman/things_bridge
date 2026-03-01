import type { SnapshotSync } from '../services/snapshot-sync.ts';

export class SnapshotLoop {
  private running = false;

  constructor(
    private snapshotSync: SnapshotSync,
    private snapshotIntervalMs: number
  ) {}

  async start(): Promise<void> {
    this.running = true;
    console.log(`[SnapshotLoop] Started (interval: ${this.snapshotIntervalMs}ms)`);

    while (this.running) {
      try {
        await this.snapshotSync.sync();
        await Bun.sleep(this.snapshotIntervalMs);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[SnapshotLoop] Error: ${errorMessage}`);
        await Bun.sleep(this.snapshotIntervalMs * 2);
      }
    }
  }

  stop(): void {
    console.log('[SnapshotLoop] Stopping...');
    this.running = false;
  }
}
