import type { Operation, Task } from '@things-bridge/shared';

export interface ApiClientConfig {
  apiUrl: string;
  agentToken: string;
  agentId: string;
}

export class ApiClient {
  constructor(private config: ApiClientConfig) {}

  private async request(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.config.apiUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.config.agentToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response;
  }

  async claimOperations(batchSize: number = 10): Promise<Operation[]> {
    const response = await this.request('/agent/claim', {
      method: 'POST',
      body: JSON.stringify({
        agentId: this.config.agentId,
        batchSize,
      }),
    });

    const data = await response.json();
    return data.operations;
  }

  async reportOpResult(
    opId: string,
    success: boolean,
    error?: string,
    result?: Record<string, unknown>
  ): Promise<void> {
    await this.request('/agent/op-result', {
      method: 'POST',
      body: JSON.stringify({
        opId,
        success,
        error,
        result,
      }),
    });
  }

  async updateSnapshot(tasks: Task[], syncedAt: string): Promise<void> {
    await this.request('/agent/snapshot', {
      method: 'POST',
      body: JSON.stringify({
        tasks,
        syncedAt,
      }),
    });
  }

  async heartbeat(): Promise<void> {
    await this.request('/agent/heartbeat', {
      method: 'POST',
    });
  }
}
