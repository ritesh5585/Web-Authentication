import { z } from "zod";

const email = z.string().trim().toLowerCase().email();

export const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email(),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(8).max(128),
  })
  .strict();

export const resendOtpSchema = z.object({ email });
