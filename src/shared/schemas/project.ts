import { z } from 'zod';
import { PROJECT_STATUS } from '../constants.ts';

export const ProjectStatusSchema = z.enum([
  PROJECT_STATUS.ACTIVE,
  PROJECT_STATUS.COMPLETED,
  PROJECT_STATUS.CANCELED,
  PROJECT_STATUS.TRASH,
]);

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: ProjectStatusSchema,
  areaId: z.string().nullable(),
  areaTitle: z.string().nullable(),
  tags: z.array(z.string()),
});

export const CreateProjectPayloadSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  when: z.enum(['today', 'evening', 'tomorrow', 'this-weekend', 'next-week', 'someday']).optional(),
  whenDate: z.string().optional(),
  deadline: z.string().optional(),
  tags: z.array(z.string()).optional(),
  areaId: z.string().optional(),
});

export const UpdateProjectPayloadSchema = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
  when: z.enum(['today', 'evening', 'tomorrow', 'this-weekend', 'next-week', 'someday']).nullable().optional(),
  whenDate: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  areaId: z.string().nullable().optional(),
  completed: z.boolean().optional(),
  canceled: z.boolean().optional(),
});
