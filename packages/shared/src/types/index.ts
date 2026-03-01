import { z } from 'zod';
import * as schemas from '../schemas/index.ts';

export type TaskStatus = z.infer<typeof schemas.TaskStatusSchema>;
export type ChecklistItem = z.infer<typeof schemas.ChecklistItemSchema>;
export type Task = z.infer<typeof schemas.TaskSchema>;
export type TaskSnapshot = z.infer<typeof schemas.TaskSnapshotSchema>;

export type OperationType = z.infer<typeof schemas.OperationTypeSchema>;
export type OperationStatus = z.infer<typeof schemas.OperationStatusSchema>;
export type CreateTaskPayload = z.infer<typeof schemas.CreateTaskPayloadSchema>;
export type UpdateTaskPayload = z.infer<typeof schemas.UpdateTaskPayloadSchema>;
export type CancelTaskPayload = z.infer<typeof schemas.CancelTaskPayloadSchema>;
export type OperationPayload = z.infer<typeof schemas.OperationPayloadSchema>;
export type Operation = z.infer<typeof schemas.OperationSchema>;
export type CreateOperationRequest = z.infer<typeof schemas.CreateOperationRequestSchema>;
export type ClaimOperationsRequest = z.infer<typeof schemas.ClaimOperationsRequestSchema>;
export type OpResultRequest = z.infer<typeof schemas.OpResultRequestSchema>;
