import { z } from 'zod';
import { UserSchema } from './user.js';

export const RegisterInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const AuthResponse = z.object({
  token: z.string(),
  user: UserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponse>;
