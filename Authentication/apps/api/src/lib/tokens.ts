import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const sha256 = (e: string) => {
  return createHash("sha256").update(e).digest("hex");
};

export const randomSecret = () => {
  return randomBytes(32).toString("hex");
};

export const safeEquals = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
