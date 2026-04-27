import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const PublicUserSchema = UserSchema.pick({
  id: true,
  createdAt: true,
});
export type PublicUser = z.infer<typeof PublicUserSchema>;
