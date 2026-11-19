import { randomUUID } from "crypto";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { env } from "../../config/env.js";
import { randomSecret, sha256, safeEquals } from "../../lib/tokens.js";

export type ClientMeta = { ip?: string; userAgent?: string };

export async function createSession(userId: string, meta: ClientMeta) {
  const id = randomUUID();
  const refreshToken = `${id}.${randomSecret()}`;
  await prisma.session.create({
    data: {
      id,
      userId,
      refreshTokenHash: sha256(refreshToken),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 255),
      expiresAt: new Date(Date.now() + env.REFRESH_TTL * 86_400_000),
    },
  });
  return { sessionId: id, refreshToken };
}

export const listSessions = (userId: string) =>
  prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      userAgent: true,
      ip: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { lastUsedAt: "desc" },
  });

export async function revokeSession(userId: string, sessionId: string) {
  const { count } = await prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw new AppError(404, "Session not found", "NOT_FOUND");
}

export const revokeAllSessions = (userId: string) =>
  prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

export async function revokeByRefreshToken(token: string) {
  const id = token.split(".")[0];
  if (!id) throw new AppError(400, "Invalid refresh token", "INVALID_TOKEN");
  const s = await prisma.session.findUnique({ where: { id } });
  if (s && safeEquals(sha256(token), s.refreshTokenHash)) {
    await prisma.session.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }
}
