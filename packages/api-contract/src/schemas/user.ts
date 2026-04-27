import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1).max(50),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const PublicUserSchema = UserSchema.pick({
  id: true,
  name: true,
  createdAt: true,
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const UpdateUserInput = z.object({
  name: z.string().min(1).max(50).optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;
