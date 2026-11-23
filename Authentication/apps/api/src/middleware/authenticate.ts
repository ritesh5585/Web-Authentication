import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { verifyAccessToken } from "../lib/jwt.js";
import { AppError } from "../utils/AppError.js";

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    throw new AppError(401, "Missing token", "UNAUTHORIZED");
  try {
    req.auth = verifyAccessToken(header.slice(7));
    next();
  } catch (e) {
    throw e instanceof jwt.TokenExpiredError
      ? new AppError(401, "Token expired", "TOKEN_EXPIRED")
      : new AppError(401, "Invalid token", "UNAUTHORIZED");
  }
};
