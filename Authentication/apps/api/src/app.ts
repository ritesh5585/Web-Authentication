import express from "express";
import helmet from "helmet";
import cors from "cors";
import { prisma } from "./db/prisma.js";
import { env } from "./config/env.js";
import cookieParser from "cookie-parser";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import authRoutes from "./modules/auth/auth.routes.js";
import sessionRoutes from "./modules/session/session.routes.js";

const app = express();

app.use(helmet());
app.use(express.json());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use("/api/sessions", sessionRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/db", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok", db: "connected" });
});

app.use(notFound);
app.use(errorHandler);

export default app;
