import { z } from 'zod';

/**
 * D1 — Identity & Authentication Zod Schemas
 *
 * Enforces:
 * - Email format normalization (lowercase, trim)
 * - Password length boundaries (min 8 chars, max 72 bytes to prevent bcrypt silent truncation)
 * - Structured user payloads
 */

function getUtf8ByteLength(val: string): number {
  return typeof Buffer !== 'undefined'
    ? Buffer.byteLength(val, 'utf8')
    : new TextEncoder().encode(val).length;
}

export const RegisterInputSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email address'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters')
    .refine(
      (val) => getUtf8ByteLength(val) <= 72,
      'Password cannot exceed 72 bytes (bcrypt truncation limit)'
    ),
});

export const LoginInputSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email address'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
    .max(72, 'Password cannot exceed 72 characters')
    .refine(
      (val) => getUtf8ByteLength(val) <= 72,
      'Password cannot exceed 72 bytes (bcrypt truncation limit)'
    ),
});

export const UserPayloadSchema = z.object({
  id: z.string().min(1, 'User ID is required'),
  email: z.string().email('Invalid email address'),
  createdAt: z.string().or(z.date()).optional(),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;
export type LoginInput = z.infer<typeof LoginInputSchema>;
export type UserPayload = z.infer<typeof UserPayloadSchema>;
