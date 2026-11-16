import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";
import { logger } from "../lib/logger.js";

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "Route not found", "NOT_FOUND"));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    res
      .status(400)
      .json({
        error: {
          code: "VALIDATION",
          message: "Invalid input",
          details: err.issues,
        },
      });
    return;
  }
  logger.error(err);
  res
    .status(500)
    .json({ error: { code: "INTERNAL", message: "Something went wrong" } });
};
