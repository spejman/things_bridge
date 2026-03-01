import { z } from 'zod';
import { OPERATION_TYPES, OPERATION_STATUS } from '../constants.ts';
import { ChecklistItemSchema } from './task.ts';

export const OperationTypeSchema = z.enum([
  OPERATION_TYPES.CREATE_TASK,
  OPERATION_TYPES.UPDATE_TASK,
  OPERATION_TYPES.CANCEL_TASK,
]);

export const OperationStatusSchema = z.enum([
  OPERATION_STATUS.PENDING,
  OPERATION_STATUS.PROCESSING,
  OPERATION_STATUS.COMPLETED,
  OPERATION_STATUS.FAILED,
  OPERATION_STATUS.DEADLETTER,
]);

export const CreateTaskPayloadSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  projectId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  checklistItems: z.array(ChecklistItemSchema).optional(),
  deadline: z.string().datetime().optional(),
  whenDate: z.string().datetime().optional(),
  when: z.enum(['today', 'evening', 'tomorrow', 'this-weekend', 'next-week', 'someday']).optional(),
});

export const UpdateTaskPayloadSchema = z.object({
  thingsId: z.string().uuid(),
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
  projectId: z.string().uuid().nullable().optional(),
  areaId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  checklistItems: z.array(ChecklistItemSchema).optional(),
  deadline: z.string().datetime().nullable().optional(),
  whenDate: z.string().datetime().nullable().optional(),
  when: z.enum(['today', 'evening', 'tomorrow', 'this-weekend', 'next-week', 'someday']).nullable().optional(),
  completed: z.boolean().optional(),
});

export const CancelTaskPayloadSchema = z.object({
  thingsId: z.string().uuid(),
});

export const OperationPayloadSchema = z.union([
  CreateTaskPayloadSchema,
  UpdateTaskPayloadSchema,
  CancelTaskPayloadSchema,
]);

export const OperationSchema = z.object({
  opId: z.string().uuid(),
  schemaVersion: z.number().int().positive(),
  type: OperationTypeSchema,
  payloadJson: z.string(),
  idempotencyKey: z.string().nullable(),
  status: OperationStatusSchema,
  lockedAt: z.string().datetime().nullable(),
  lockedBy: z.string().nullable(),
  attemptCount: z.number().int().min(0),
  maxAttempts: z.number().int().positive(),
  availableAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  resultJson: z.string().nullable(),
});

export const CreateOperationRequestSchema = z.object({
  type: OperationTypeSchema,
  payload: OperationPayloadSchema,
  idempotencyKey: z.string().optional(),
});

export const ClaimOperationsRequestSchema = z.object({
  agentId: z.string().min(1),
  batchSize: z.number().int().min(1).max(100).optional(),
});

export const OpResultRequestSchema = z.object({
  opId: z.string().uuid(),
  success: z.boolean(),
  error: z.string().optional(),
  result: z.record(z.any()).optional(),
});
