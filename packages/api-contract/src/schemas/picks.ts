import { z } from 'zod';

export const PickCategorySchema = z.enum(['food', 'activity', 'movie', 'travel', 'other']);
export type PickCategory = z.infer<typeof PickCategorySchema>;

export const PickSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().min(1).max(100),
  options: z.array(z.string().min(1)).min(2).max(20),
  category: PickCategorySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Pick = z.infer<typeof PickSchema>;

export const CreatePickInput = PickSchema.pick({
  title: true,
  options: true,
  category: true,
});
export type CreatePickInput = z.infer<typeof CreatePickInput>;

export const UpdatePickInput = CreatePickInput.partial();
export type UpdatePickInput = z.infer<typeof UpdatePickInput>;

export const PickResultSchema = z.object({
  pickId: z.string(),
  chosen: z.string(),
  pickedAt: z.string(),
});
export type PickResult = z.infer<typeof PickResultSchema>;
