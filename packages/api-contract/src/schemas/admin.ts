import { z } from 'zod';
import { RoleSchema, UserSchema } from './user.js';

export const AdminUsersResponse = z.object({
  users: z.array(UserSchema),
});
export type AdminUsersResponseType = z.infer<typeof AdminUsersResponse>;

export const SetRoleParams = z.object({
  id: z.string().min(1),
});

export const SetRoleBody = z.object({
  role: RoleSchema,
});
export type SetRoleBodyType = z.infer<typeof SetRoleBody>;
