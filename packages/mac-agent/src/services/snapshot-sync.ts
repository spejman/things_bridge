import type { ThingsCliService } from './things-cli.ts';
import type { ApiClient } from './api-client.ts';

export class SnapshotSync {
  constructor(
    private thingsCli: ThingsCliService,
    private apiClient: ApiClient
  ) {}

  async sync(): Promise<void> {
    try {
      console.log('[SnapshotSync] Fetching tasks from Things...');
      const tasks = await this.thingsCli.getSnapshot();
      const syncedAt = new Date().toISOString();

      console.log(`[SnapshotSync] Uploading ${tasks.length} tasks to API...`);
      await this.apiClient.updateSnapshot(tasks, syncedAt);

      console.log(`[SnapshotSync] ✓ Synced ${tasks.length} tasks at ${syncedAt}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SnapshotSync] ✗ Failed to sync: ${errorMessage}`);
      throw error;
    }
  }
}
