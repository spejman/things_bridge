import { z } from 'zod';
import { TASK_STATUS } from '../constants.ts';

export const TaskStatusSchema = z.enum([
  TASK_STATUS.INBOX,
  TASK_STATUS.TODAY,
  TASK_STATUS.UPCOMING,
  TASK_STATUS.SOMEDAY,
  TASK_STATUS.COMPLETED,
  TASK_STATUS.CANCELED,
  TASK_STATUS.TRASH,
]);

export const ChecklistItemSchema = z.object({
  title: z.string(),
  completed: z.boolean(),
});

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  status: TaskStatusSchema,
  projectId: z.string().uuid().nullable(),
  areaId: z.string().uuid().nullable(),
  tags: z.array(z.string()),
  checklistItems: z.array(ChecklistItemSchema),
  deadline: z.string().datetime().nullable(),
  whenDate: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  modifiedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
});

export const TaskSnapshotSchema = z.object({
  tasks: z.array(TaskSchema),
  syncedAt: z.string().datetime(),
});
