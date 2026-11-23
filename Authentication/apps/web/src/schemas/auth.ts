import { z } from "zod";

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name too short").max(50),
    email: z.string().trim().toLowerCase().email("Invalid email"),
    password: z.string().min(8, "Minimum 8 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email"),
  password: z.string().min(1, "Password required"),
});

export type LoginForm = z.infer<typeof loginSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;
