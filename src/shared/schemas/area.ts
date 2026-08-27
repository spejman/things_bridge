import { z } from 'zod';

export const AreaSchema = z.object({
  id: z.string(),
  title: z.string(),
  visible: z.boolean(),
});

export const CreateAreaPayloadSchema = z.object({
  title: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export const UpdateAreaPayloadSchema = z.object({
  title: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
});
