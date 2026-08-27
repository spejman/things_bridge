import { z } from 'zod';
import * as schemas from '../schemas/index.ts';

export type TaskStatus = z.infer<typeof schemas.TaskStatusSchema>;
export type ChecklistItem = z.infer<typeof schemas.ChecklistItemSchema>;
export type Task = z.infer<typeof schemas.TaskSchema>;
export type CreateTaskPayload = z.infer<typeof schemas.CreateTaskPayloadSchema>;
export type UpdateTaskPayload = z.infer<typeof schemas.UpdateTaskPayloadSchema>;

export type ProjectStatus = z.infer<typeof schemas.ProjectStatusSchema>;
export type Project = z.infer<typeof schemas.ProjectSchema>;
export type CreateProjectPayload = z.infer<typeof schemas.CreateProjectPayloadSchema>;
export type UpdateProjectPayload = z.infer<typeof schemas.UpdateProjectPayloadSchema>;

export type Area = z.infer<typeof schemas.AreaSchema>;
export type CreateAreaPayload = z.infer<typeof schemas.CreateAreaPayloadSchema>;
export type UpdateAreaPayload = z.infer<typeof schemas.UpdateAreaPayloadSchema>;
