import { z } from 'zod';
import * as schemas from '../schemas/index.ts';

export type TaskStatus = z.infer<typeof schemas.TaskStatusSchema>;
export type ChecklistItem = z.infer<typeof schemas.ChecklistItemSchema>;
export type Task = z.infer<typeof schemas.TaskSchema>;
export type CreateTaskPayload = z.infer<typeof schemas.CreateTaskPayloadSchema>;
export type UpdateTaskPayload = z.infer<typeof schemas.UpdateTaskPayloadSchema>;
