import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env.js";
import cookieParser from "cookie-parser";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

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

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;

app.use(notFound)
app.use(errorHandler)
