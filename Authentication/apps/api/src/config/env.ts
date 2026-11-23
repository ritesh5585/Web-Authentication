import "dotenv/config";
import z from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  CLIENT_URL: z.string().url(),
  OTP_SECRET: z.string().min(32),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number(),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string(),
  JWT_ACCESS: z.string().min(32),
  ACCESS_TTL: z.coerce.number().default(900),
  REFRESH_TTL: z.coerce.number().default(7),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid env:", JSON.stringify(parsed.error.issues, null, 2));
  process.exit(1);
}

export const env = parsed.data;
