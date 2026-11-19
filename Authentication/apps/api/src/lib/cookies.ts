import type { Response } from "express";
import { env } from "../config/env.js";

const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/auth",
};

export const setRefreshTokenCookie = (res: any, token: string) => {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, {
    ...options,
    maxAge: env.REFRESH_TTL * 86400000,
  });
};

export const clearRfereshTokenCookie = (res: Response) => {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, options);
};
