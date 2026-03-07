import type { Operation } from '@things-bridge/shared';
import {
  OPERATION_TYPES,
  CreateTaskPayloadSchema,
  UpdateTaskPayloadSchema,
  CancelTaskPayloadSchema,
} from '@things-bridge/shared';
import type { ThingsCliService } from './things-cli.ts';
import type { ApiClient } from './api-client.ts';

export class OperationProcessor {
  constructor(
    private thingsCli: ThingsCliService,
    private apiClient: ApiClient
  ) {}

  async processOperation(operation: Operation): Promise<void> {
    try {
      const payload = JSON.parse(operation.payloadJson);

      let result: Record<string, unknown> | undefined;

      switch (operation.type) {
        case OPERATION_TYPES.CREATE_TASK: {
          const validatedPayload = CreateTaskPayloadSchema.parse(payload);
          const thingsId = await this.thingsCli.createTask(validatedPayload);
          result = { thingsId };
          break;
        }

        case OPERATION_TYPES.UPDATE_TASK: {
          const validatedPayload = UpdateTaskPayloadSchema.parse(payload);
          await this.thingsCli.updateTask(validatedPayload.thingsId, validatedPayload);
          result = { thingsId: validatedPayload.thingsId };
          break;
        }

        case OPERATION_TYPES.CANCEL_TASK: {
          const validatedPayload = CancelTaskPayloadSchema.parse(payload);
          await this.thingsCli.cancelTask(validatedPayload);
          result = { thingsId: validatedPayload.thingsId };
          break;
        }

        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      await this.apiClient.reportOpResult(operation.opId, true, undefined, result);
      console.log(`[Processor] ✓ Completed operation ${operation.opId} (${operation.type})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.apiClient.reportOpResult(operation.opId, false, errorMessage);
      console.error(`[Processor] ✗ Failed operation ${operation.opId}: ${errorMessage}`);
    }
  }

  async processBatch(operations: Operation[]): Promise<void> {
    for (const operation of operations) {
      await this.processOperation(operation);
    }
  }
}
