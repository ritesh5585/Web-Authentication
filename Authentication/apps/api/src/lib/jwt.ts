import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const signAccessToken = (userId: string, sessionId: string) => {
  jwt.sign({ session: sessionId }, env.JWT_ACCESS, {
    subject: userId,
    expiresIn: env.ACCESS_TTL,
    algorithm: "HS256",
  });
};

export const verifyAccessToken = (token: string) => {
  const decoded = jwt.verify(token, env.JWT_ACCESS, {
    algorithms: ["HS256"],
  });

  if (
    typeof decoded === "string" ||
    !decoded.sub ||
    typeof decoded.session !== "string"
  ) {
    throw new Error("Invalid token");
  }

  return { userId: decoded.sub, sid: decoded.session };
};
