import { z } from 'zod';

export const IdSchema = z.string().min(1);
export type Id = z.infer<typeof IdSchema>;

export const TimestampSchema = z.string().datetime();

export const ErrorResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
  });
