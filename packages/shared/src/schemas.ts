import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(3, 'Username minimal 3 karakter'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8, 'Password baru minimal 8 karakter'),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
