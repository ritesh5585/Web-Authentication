import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export const generateOtp = () =>
  randomInt(0, 1_000_000).toString().padStart(6, "0");

export const hashOtp = (code: string) => {
  return createHmac("sha256", env.OTP_SECRET).update(code).digest("hex");
};

export const verifyOtpHash = (code: string, hash: string) => {
  const a = Buffer.from(hashOtp(code));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
};