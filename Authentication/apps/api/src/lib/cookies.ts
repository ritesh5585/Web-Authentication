import type { Response } from "express";
import { env } from "../config/env.js";

 export const REFRESH_COOKIE = "refreshToken";

const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/auth",
};

export const setRefreshTokenCookie = (res: Response, token: string) => {
  res.cookie(REFRESH_COOKIE, token, {
    ...options,
    maxAge: env.REFRESH_TTL * 86400000,
  });
};

export const clearRefreshTokenCookie = (res: Response) => {
  res.clearCookie(REFRESH_COOKIE, options);
};
