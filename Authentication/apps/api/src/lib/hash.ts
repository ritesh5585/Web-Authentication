import argon2 from "argon2";

export const hashPassword = (plain: string) => argon2.hash(plain);
export const verifyPassword = async (plain: string, hash: string) => {
  try {
    return await argon2.verify(hash, plain);
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
};
