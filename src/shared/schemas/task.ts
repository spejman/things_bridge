import { z } from 'zod';
import { TASK_STATUS } from '../constants.ts';

export const TaskStatusSchema = z.enum([
  TASK_STATUS.INBOX,
  TASK_STATUS.TODAY,
  TASK_STATUS.UPCOMING,
  TASK_STATUS.ANYTIME,
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
  id: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  status: TaskStatusSchema,
  projectId: z.string().nullable(),
  projectTitle: z.string().nullable(),
  areaId: z.string().nullable(),
  areaTitle: z.string().nullable(),
  tags: z.array(z.string()),
  checklistItems: z.array(ChecklistItemSchema),
  deadline: z.string().nullable(),
  whenDate: z.string().nullable(),
  createdAt: z.string().datetime(),
  modifiedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
});

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
