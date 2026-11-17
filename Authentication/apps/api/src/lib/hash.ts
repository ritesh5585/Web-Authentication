import argon2, { argon2i } from "argon2";

export const hashPassword = (plain: string) => argon2.hash(plain);
export const verifyPassword = (plain: string, hash: string) =>
  argon2.verify(plain, hash);